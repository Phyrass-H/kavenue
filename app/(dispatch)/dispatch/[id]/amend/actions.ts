"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/app-context";
import { isValidLatLng } from "@/lib/geo";
import { routeMetrics } from "@/lib/directions";
import { parseWaypoints, parseWaypointsField, unlocatedStops } from "@/lib/waypoints";
import { settledFare } from "@/lib/pdp";
import { commissionSplit, courseFromBusinessTotal, businessRatesOf } from "@/lib/commission";
import { buildFromSnapshot } from "@/lib/amendments";
import { recordMissionEvent } from "@/lib/mission-events-server";
import type { MissionStatus } from "@/lib/database.types";

// A mission can only be AMENDED (proposed to a Driver) while a Driver holds it but
// hasn't started the run. Pooled has no Driver to consent (free info edit instead);
// en_route+ is already underway (frozen).
const AMENDABLE: MissionStatus[] = ["accepted", "confirmed"];

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Propose a change to an ACCEPTED mission's route + fare (D39 Phase 2). This does
// NOT touch the mission — it records a proposed amendment the assigned Driver must
// accept (via respond_to_amendment) before anything changes. Written via the USER
// session so RLS (p_amendment_business_insert) authorises it, scoped to a mission
// this Business owns.
export async function proposeMissionAmendment(missionId: string, formData: FormData) {
  const ctx = await getAppContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.dispatcher || !ctx.business) redirect("/onboarding-business");

  const id = String(missionId ?? "").trim();
  if (!id) redirect("/dispatch");
  const backTo = (err: string) => `/dispatch/${id}/amend?error=${err}`;

  const supabase = await createClient();
  // Load the trip AS AGREED (RLS scopes to this Business; the extra eq is defence).
  const { data: mission } = await supabase
    .from("mission_read")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!mission) redirect("/dispatch");
  if (!AMENDABLE.includes(mission.status)) redirect(backTo("locked"));

  // Proposed new route (same hidden fields the new-mission RouteStops writes).
  const pickupAddress = String(formData.get("pickup_address") ?? "").trim();
  const dropoffAddress = String(formData.get("dropoff_address") ?? "").trim();
  const pickupLat = num(formData.get("pickup_lat"));
  const pickupLng = num(formData.get("pickup_lng"));
  const dropoffLat = num(formData.get("dropoff_lat"));
  const dropoffLng = num(formData.get("dropoff_lng"));
  const pickupValid = pickupLat != null && pickupLng != null && isValidLatLng(pickupLat, pickupLng);
  const dropoffValid =
    dropoffLat != null && dropoffLng != null && isValidLatLng(dropoffLat, dropoffLng);
  const pickupLabel = String(formData.get("pickup_label") ?? "").trim();
  const dropoffLabel = String(formData.get("dropoff_label") ?? "").trim();

  // The pickup must stay located (the Pool/nav depend on coords) and a transfer
  // always keeps a located destination — you can't propose a trip to nowhere.
  if (!pickupAddress || !pickupValid) redirect(backTo("missing"));
  if (!dropoffAddress || !dropoffValid) redirect(backTo("nodrop"));

  const note = String(formData.get("note") ?? "").trim();

  const waypoints = parseWaypointsField(formData.get("waypoints"));
  // ⚑ Same refusal as the ends, and as the new-mission form: a stop with no
  // coords is dropped by the `via` filter below, so the re-measured distance —
  // and therefore the priced change — behaves as if it were never added, while
  // the Driver still has to drive there. See `unlocatedStops`. Reproduced live:
  // "Add a stop at Place du Casino" while the route stayed 15 km and the fare
  // did not move.
  //
  // ⚑ ONLY a stop being ADDED or CHANGED. A mission posted before 2026-08-20
  // can legitimately carry a stop that was never located — nothing checked back
  // then — and RouteStops re-posts it unchanged. Refusing on that would strand
  // the trip: a hotel moving a pickup time at T−2h would be told to re-pick a
  // stop they never touched, on the one screen where minutes matter. The nudge
  // under the field still asks them to fix it; it just isn't a blocker for a
  // change that has nothing to do with it.
  const alreadyLoose = new Set(
    unlocatedStops(
      parseWaypoints(mission.waypoints).map((w) => ({
        address: w.address,
        lat: w.lat ?? null,
        lng: w.lng ?? null,
      })),
    ).map((w) => w.address.trim().toLowerCase()),
  );
  const newlyLoose = unlocatedStops(waypoints).filter(
    (w) => !alreadyLoose.has(w.address.trim().toLowerCase()),
  );
  if (newlyLoose.length > 0) redirect(backTo("nostop"));
  const via = waypoints
    .filter((w) => w.lat != null && w.lng != null && isValidLatLng(w.lat, w.lng))
    .map((w) => ({ lat: w.lat as number, lng: w.lng as number }));

  // Recompute the road distance + ETA server-side (authoritative), traffic-aware
  // for the unchanged pickup time. Best-effort: fall back to the client hidden
  // fields, then null, so a routing hiccup never blocks the proposal.
  const departAt =
    new Date(mission.pickup_at).getTime() > Date.now()
      ? new Date(mission.pickup_at).toISOString().replace(/\.\d{3}Z$/, "Z")
      : null;
  const metrics = await routeMetrics(
    { lat: pickupLat!, lng: pickupLng! },
    { lat: dropoffLat!, lng: dropoffLng! },
    departAt,
    via,
  );
  const newDistanceKm = metrics ? metrics.distanceKm : num(formData.get("route_distance_km"));
  const newDurationMin = metrics ? metrics.durationMin : num(formData.get("route_duration_min"));

  // ── KAVENUE PRICES THE CHANGE (docs/06 §0, §10) ───────────────────────────
  // §0: no discretionary amount may ever be typed in. §10's build note: "an
  // amendment's new fare must be recomputed from the rate card using the new
  // distance — never typed." Until now it WAS typed; the screen said so.
  //
  // ⚑ WE PRICE THE CHANGE, NOT THE WHOLE TRIP (founder, 2026-08-20). Re-quoting
  // the new distance outright would throw away the auction result: a Driver who
  // won a 24 km trip at 62,79 € against a 96,60 € Ceiling would be handed ~120 €
  // for one extra stop. Instead the rate card prices the DIFFERENCE between the
  // old route and the new one, and that difference is applied to the fare the two
  // sides actually agreed. A shorter route lowers it by the same rule.
  //
  // Priced in SQL, from the SERVER's own road distance — the same `mission_price`
  // createMission calls, never a number the browser sent. The mission's OWN
  // snapshot rates convert it back to the Course, never the live ones: this trip's
  // invoice is already stamped and a rate change tomorrow must not re-price it.
  const rates = businessRatesOf(mission);
  const priceAt = (km: number | null) =>
    km == null || !Number.isFinite(km) || km <= 0
      ? Promise.resolve({ data: null })
      : supabase
          .rpc("mission_price", {
            // `van` is vestigial and has no card row (BACKLOG § X) — price it as Business.
            p_tier: mission.category === "van" ? "business" : mission.category,
            p_body: mission.required_body_type,
            p_km: km,
            p_night: mission.night_applied ?? false,
          })
          .maybeSingle();
  // ⚑ MEASURE THE OLD ROUTE NOW, not `mission.distance_km`. The stored distance was
  // measured when the trip was posted and can disagree with what the router returns
  // today — map data moves, and a hand-seeded row can be plainly wrong. Diffing a
  // stale baseline against a fresh measurement invents a fare change on a route
  // nobody touched: a demo trip stored at 24 km and routed today at 15 km opened the
  // screen showing −18,60 € before a single edit. Both sides of the difference now
  // come from the same source at the same moment, so an unchanged route is exactly 0.
  const originalVia = parseWaypoints(mission.waypoints)
    .filter((w) => w.lat != null && w.lng != null && isValidLatLng(w.lat, w.lng))
    .map((w) => ({ lat: w.lat as number, lng: w.lng as number }));
  const wasMetrics =
    mission.pickup_lat != null && mission.pickup_lng != null &&
    mission.dropoff_lat != null && mission.dropoff_lng != null
      ? await routeMetrics(
          { lat: Number(mission.pickup_lat), lng: Number(mission.pickup_lng) },
          { lat: Number(mission.dropoff_lat), lng: Number(mission.dropoff_lng) },
          departAt,
          originalVia,
        )
      : null;
  const wasKm = wasMetrics ? wasMetrics.distanceKm : mission.distance_km == null ? null : Number(mission.distance_km);

  const [wasQuote, nowQuote] = await Promise.all([priceAt(wasKm), priceAt(newDistanceKm)]);
  // No card, or no route: we cannot price the change, so we do not guess one.
  // Refusing is the whole point — a proposal with an invented fare is the thing
  // §0 forbids.
  if (!wasQuote.data || !nowQuote.data) redirect(backTo("noprice"));

  const round2 = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100;
  const agreedAllIn = commissionSplit(settledFare(mission), rates).businessTotal;
  const deltaAllIn =
    Number((nowQuote.data as { ceiling_price: number }).ceiling_price) -
    Number((wasQuote.data as { ceiling_price: number }).ceiling_price);
  const newFareAllIn = round2(agreedAllIn + deltaAllIn);
  if (!(newFareAllIn > 0)) redirect(backTo("noprice"));
  const newFare = courseFromBusinessTotal(newFareAllIn, rates);

  // The trip as agreed at this moment — including the CURRENT fare the Driver
  // agreed to (computed, never stored) — for the "was …" display + audit trail.
  const fromSnapshot = buildFromSnapshot(mission, settledFare(mission));

  // Only one proposal can be live at a time: retire any still-pending one for this
  // mission (the Business is replacing it). RLS scopes the update to this Business.
  //
  // ONE LIVE ASK (2026-08-11_one_live_ask.sql): the INSERT below ALSO retires a
  // pending mission_release — and, redundantly with this block, any prior pending
  // amendment — via the trg_amendment_replaces_release BEFORE INSERT trigger. The
  // rule lives in SQL and not here because mission_release has no client write
  // policy at all, and because a trigger is transactional with the insert and binds
  // a direct PostgREST insert that this block does not. This block is kept as the
  // pre-migration safety net: redundant, not wrong.
  await supabase
    .from("mission_amendment")
    .update({ status: "superseded" })
    .eq("mission_id", id)
    .eq("business_id", ctx.business.id)
    .eq("status", "proposed");

  const { error } = await supabase.from("mission_amendment").insert({
    mission_id: id,
    business_id: ctx.business.id,
    proposed_by: ctx.dispatcher.id,
    status: "proposed",
    new_pickup_address: pickupAddress,
    new_pickup_lat: pickupLat,
    new_pickup_lng: pickupLng,
    new_pickup_label: pickupLabel || null,
    new_dropoff_address: dropoffAddress,
    new_dropoff_lat: dropoffLat,
    new_dropoff_lng: dropoffLng,
    new_dropoff_label: dropoffLabel || null,
    new_waypoints: waypoints.length > 0 ? waypoints : null,
    new_distance_km: newDistanceKm,
    new_duration_min: newDurationMin,
    new_fare: newFare,
    from_snapshot: fromSnapshot,
    note: note || null,
  });
  if (error) redirect(backTo("db"));

  // § AG — a proposal changes nothing about the mission until the Driver answers,
  // so the trigger has nothing to fire on. Without this the log would show a trip
  // whose route and fare changed with no record that anyone asked.
  // ⚑ Before the redirect: redirect() throws, and everything after it is dead code.
  await recordMissionEvent({
    missionId: id,
    type: "amendment_proposed",
    actorKind: "dispatcher",
    actorId: ctx.dispatcher.id,
    payload: {
      new_fare: newFare,
      new_distance_km: newDistanceKm,
      new_duration_min: newDurationMin,
      note: note || null,
    },
  });

  // Back to the schedule with this trip open — it now reads "Change pending".
  revalidatePath("/dispatch", "layout");
  revalidatePath("/dispatch/calendar");
  revalidatePath("/dispatch/history");
  redirect(`/dispatch?open=${id}`);
}

// Withdraw a pending proposal, or dismiss a declined one — either way it stops
// showing on the schedule (the trip stays exactly as agreed). RLS scopes to the
// Business's own amendments.
export async function closeAmendment(formData: FormData) {
  const ctx = await getAppContext();
  if (!ctx.business) redirect("/login");
  const amendmentId = String(formData.get("amendment_id") ?? "").trim();
  const missionId = String(formData.get("mission_id") ?? "").trim();
  if (!amendmentId) redirect("/dispatch");

  const supabase = await createClient();
  await supabase
    .from("mission_amendment")
    .update({ status: "superseded" })
    .eq("id", amendmentId)
    .eq("business_id", ctx.business.id)
    .in("status", ["proposed", "declined"]);

  revalidatePath("/dispatch", "layout");
  redirect(missionId ? `/dispatch?open=${missionId}` : "/dispatch");
}
