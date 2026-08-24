import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { parseWaypoints } from "@/lib/waypoints";
import { routeMetrics } from "@/lib/directions";
import { settledFare } from "@/lib/pdp";
import { commissionSplit, ratesOf } from "@/lib/commission";
import { RATE_CARD_COLS, type RateCardRow } from "@/lib/rate-card";
import { missionTone, TONE_BG, TONE_COLOR } from "@/lib/dispatch-status";
import {
  addressLine,
  formatDateTime,
  formatMoney,
  serviceClassLabel,
} from "@/lib/format";
import type { Place } from "@/components/address-autocomplete";
import { AmendForm } from "./amend-form";

export const dynamic = "force-dynamic";

// A change can be proposed only while a Driver holds the trip but hasn't started
// it. (Pooled → no Driver to consent, edit info instead. en_route+ → frozen.)
const AMENDABLE = ["accepted", "confirmed"];

const ERROR_COPY: Record<string, string> = {
  locked: "This trip can no longer be changed — the Driver may have started it.",
  missing: "Pick the pickup from the address suggestions so it stays located.",
  nodrop: "Pick a destination from the address suggestions.",
  nostop:
    "Pick every stop from the address suggestions — a stop we can’t place isn’t on the route, so it isn’t in the price either.",
  fare: "Enter the new agreed fare.",
  // ⚑ The action has redirected with this key since it was written, and there was
  // no copy for it — and the banner renders `error && ERROR_COPY[error]`, so an
  // unknown key renders NOTHING. A Dispatcher whose change couldn't be priced was
  // bounced back to the form with no explanation at all. Same family as the §5
  // floor guard: a refusal nobody is told about reads as "it just didn't work".
  noprice:
    "We couldn’t work out the distance for the new route just now, so we can’t price the change. Try again in a moment, or re-pick the addresses from the suggestions.",
  db: "Couldn’t send the change. Please try again.",
};

export default async function AmendMissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await getAppContext();
  if (!ctx.business) return null;

  const supabase = await createClient();
  const { data: mission } = await supabase
    .from("mission")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .neq("status", "draft")
    .maybeSingle();
  if (!mission) notFound();

  // Assigned Driver name + car (service role, gated to this Business's mission) —
  // shown in the locked header + the "what the Driver sees" preview.
  let driverName = "the Driver";
  let driverCar: string | null = null;
  if (mission.driver_id) {
    const admin = createAdminClient();
    const [{ data: d }, { data: v }] = await Promise.all([
      admin.from("driver").select("first_name, last_name").eq("id", mission.driver_id).maybeSingle(),
      admin.from("vehicle").select("make, model").eq("driver_id", mission.driver_id).maybeSingle(),
    ]);
    if (d) driverName = `${d.first_name} ${d.last_name}`.trim() || driverName;
    if (v) driverCar = [v.make, v.model].filter(Boolean).join(" ") || null;
  }

  const t = missionTone(mission);
  const amendable = AMENDABLE.includes(mission.status);
  const waypoints = parseWaypoints(mission.waypoints);
  // ALL IN. `settledFare` is Course-basis like everything stored; a Business
  // types and reads its own side of the price (docs/06 §1). `proposeAmendment`
  // converts it back with `courseFromBusinessTotal` before it writes, exactly as
  // `createMission` does with the Ceiling — the column keeps storing the fare.
  const fare = commissionSplit(settledFare(mission), ratesOf(mission)).businessTotal;

  // Kavenue prices the change, so the form needs the card to show what the new
  // route is worth as it is edited. The SERVER re-prices authoritatively on submit
  // (proposeMissionAmendment) — this copy only guides, exactly like /dispatch/new.
  const rateCard: RateCardRow[] = await (async () => {
    const sb = await createClient();
    const { data } = await sb.from("rate_card").select(RATE_CARD_COLS);
    return (data ?? []) as RateCardRow[];
  })();

  const pickupDefault: Place | null =
    mission.pickup_lat != null && mission.pickup_lng != null
      ? { label: mission.pickup_address, lat: mission.pickup_lat, lng: mission.pickup_lng }
      : null;
  const dropoffDefault: Place | null =
    mission.dropoff_address && mission.dropoff_lat != null && mission.dropoff_lng != null
      ? { label: mission.dropoff_address, lat: mission.dropoff_lat, lng: mission.dropoff_lng }
      : null;
  const stopsDefault = waypoints.map((w) => ({
    label: w.address,
    lat: w.lat ?? null,
    lng: w.lng ?? null,
  }));
  // ⚑ RE-MEASURE THE AGREED ROUTE, don't trust `mission.distance_km`. It was measured
  // when the trip was posted and can disagree with what the router says today — map
  // data moves, and a hand-seeded row can be plainly wrong. Since Kavenue now prices
  // the DIFFERENCE between the old route and the new one, a stale baseline invents a
  // fare change on a route nobody touched: a demo trip stored at 24 km and routed
  // today at 15 km opened this screen at −18,60 € before a single edit. The server
  // re-measures the same way in proposeMissionAmendment, so the screen and the write
  // agree. Falls back to the stored figures if routing is unavailable.
  const freshOriginal =
    mission.pickup_lat != null && mission.pickup_lng != null &&
    mission.dropoff_lat != null && mission.dropoff_lng != null
      ? await routeMetrics(
          { lat: Number(mission.pickup_lat), lng: Number(mission.pickup_lng) },
          { lat: Number(mission.dropoff_lat), lng: Number(mission.dropoff_lng) },
          new Date(mission.pickup_at).getTime() > Date.now()
            ? new Date(mission.pickup_at).toISOString().replace(/\.\d{3}Z$/, "Z")
            : null,
          parseWaypoints(mission.waypoints)
            .filter((w) => w.lat != null && w.lng != null)
            .map((w) => ({ lat: w.lat as number, lng: w.lng as number })),
        )
      : null;
  const agreedKm = freshOriginal?.distanceKm ?? (mission.distance_km != null ? Number(mission.distance_km) : null);
  const agreedMin = freshOriginal?.durationMin ?? (mission.duration_min != null ? Number(mission.duration_min) : null);

  const etaDefault =
    agreedKm != null && agreedMin != null
      ? { distanceKm: agreedKm, durationMin: agreedMin }
      : null;

  return (
    <div className="ex-wrap am-wrap">
      <div className="ex-head">
        <h1 style={{ margin: 0 }}>Propose a change</h1>
        <Link href="/dispatch" className="ex-back">
          ← Back to schedule
        </Link>
      </div>
      <p className="muted" style={{ margin: "4px 0 16px" }}>
        {driverName} has accepted this trip, so a change to the route or fare needs their approval
        before it takes effect.
      </p>

      {error && ERROR_COPY[error] && (
        <div className="notice error" style={{ marginBottom: 14 }}>
          {ERROR_COPY[error]}
        </div>
      )}

      {/* The trip AS AGREED — context, not editable here. */}
      <div className="card ex-lock">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div className="route" style={{ flex: 1, minWidth: 0 }}>
            <div className="leg">
              <span className="dot" />
              <span>{addressLine(mission.pickup_address)}</span>
            </div>
            {waypoints.map((w, i) => (
              <div className="leg leg--stop" key={i}>
                <span className="dot mid" />
                <span className="leg-addr muted">{addressLine(w.address)}</span>
              </div>
            ))}
            <div className="leg">
              <span className="dot end" />
              <span>{mission.dropoff_address ? addressLine(mission.dropoff_address) : "—"}</span>
            </div>
          </div>
          <span className="status-pill" style={{ background: TONE_BG[t.tone], color: TONE_COLOR[t.tone] }}>
            <span className="dot" style={{ background: TONE_COLOR[t.tone] }} />
            {t.label}
          </span>
        </div>
        <div className="ex-meta">
          <span>{formatDateTime(mission.pickup_at)}</span>
          <span>
            {driverName}
            {driverCar ? ` · ${driverCar}` : ""}
          </span>
          <span>
            Agreed fare <b>{formatMoney(fare)}</b>
          </span>
        </div>
      </div>

      {amendable ? (
        <AmendForm
          missionId={mission.id}
          driverName={driverName}
          currentFare={fare}
          rateCard={rateCard}
          tier={mission.category}
          body={mission.required_body_type}
          night={mission.night_applied ?? false}
          pickupDefault={pickupDefault}
          dropoffDefault={dropoffDefault}
          stopsDefault={stopsDefault}
          etaDefault={etaDefault}
          pickupAtIso={mission.pickup_at}
          fromDurationMin={agreedMin}
          fromDistanceKm={agreedKm}
          original={{
            pickup: mission.pickup_address,
            dropoff: mission.dropoff_address,
            waypoints,
          }}
        />
      ) : (
        <div className="notice info" style={{ marginTop: 14 }}>
          {mission.status === "pooled"
            ? "No Driver has accepted this trip yet, so there’s no one to approve a change. You can still edit the details, or a route change becomes available once a Driver accepts."
            : "This trip is already underway or finished — its route and fare are frozen."}
        </div>
      )}
    </div>
  );
}
