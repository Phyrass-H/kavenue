"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isNightPickup } from "@/lib/rate-card";
import { COMMISSION_RATE_COLS, courseFromBusinessTotal, ratesFromRow } from "@/lib/commission";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { businessReadiness } from "@/lib/business-readiness";
import { recordBusinessEvent } from "@/lib/business-events-server";
import { isValidLatLng } from "@/lib/geo";
import { parisLocalToUtc } from "@/lib/time";
import { routeMetrics } from "@/lib/directions";
import { parseWaypointsField, unlocatedStops } from "@/lib/waypoints";
import {
  parsePassengers,
  primaryPassengerName,
  passengerRowData,
  guestContacts,
} from "@/lib/passengers";
import { parseLanguages, parseDriverFlags, DRESS_CODES } from "@/lib/driver-service";
import {
  DOCS_BUCKET,
  ensureBucket,
  uploadFile,
  fileExt,
  MAX_UPLOAD_BYTES,
} from "@/lib/supabase/storage";
import type { VehicleCategory, BodyType, MissionStatus } from "@/lib/database.types";

const BOARD_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

// Tiers offered post-O5 ('van' is a legacy enum value, no longer a tier).
const CATEGORIES: readonly VehicleCategory[] = ["eco", "business", "luxury"];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Posts a mission to the Pool, or saves it as a draft to finish later.
// Inserted/updated via the USER session so RLS authorizes it (no service role):
// p_mission_business_insert / _update key off business_id = current_business_id().
//
// `intent`     'pooled' (default) → live in the Pool · 'draft' → saved, not posted
// `mission_id` present → resuming an existing draft (UPDATE) · absent → INSERT
//
// Addresses are geocoded client-side via Mapbox; `zone` is a display label from
// the pickup town. The Business sets the ceiling (Doc 01/02); PDP params derived.
export async function createMission(formData: FormData) {
  const ctx = await getAppContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.dispatcher || !ctx.business) redirect("/onboarding-business");

  const missionId = String(formData.get("mission_id") ?? "").trim() || null;

  // Posting is an explicit, named button action: 'pooled' (go live in the Pool)
  // or 'draft' (save for later). A submit that carries NEITHER — e.g. a stray
  // implicit submit — must never silently post a live mission. Bounce back to
  // the form, writing nothing. (Defence in depth alongside the client guards.)
  const intent = String(formData.get("intent") ?? "");
  if (intent !== "pooled" && intent !== "draft") {
    redirect(missionId ? `/dispatch/new?draft=${missionId}` : "/dispatch/new");
  }
  const asDraft = intent === "draft";

  const backTo = (err: string) =>
    missionId
      ? `/dispatch/new?draft=${missionId}&error=${err}`
      : `/dispatch/new?error=${err}`;

  // ⚑ THE PROFILE GATE (founder, S71): a Business with an incomplete file may
  // not put a trip in the Pool. Enforced HERE, server-side, because the page's
  // own notice is a courtesy and a form post is not obliged to have seen it —
  // the same defence-in-depth reasoning as the `intent` guard just above.
  //
  // ⚑ A DRAFT IS NEVER BLOCKED. They can build the entire trip and save it; only
  // going live needs a complete file. Blocking the draft too would mean losing
  // their work to a missing phone number, which is how you teach someone not to
  // come back.
  if (!asDraft) {
    const ready = businessReadiness(ctx.business);
    if (!ready.canPost) {
      // ⚑ THE ONLY PART OF THIS GATE THAT CANNOT BE RECOVERED LATER. Trips and
      // money leave rows behind; a Business that hit the wall and walked away
      // leaves nothing at all unless it is written down now. This is the first
      // step of the booking funnel the founder asked for in S66.
      //
      // ⚑ AWAITED, NOT FIRED AND FORGOTTEN. `redirect()` throws to unwind the
      // request — a floating promise after it would be cut off mid-flight, and
      // the event would go missing exactly when someone is repeatedly blocked.
      await recordBusinessEvent({
        businessId: ctx.business.id,
        type: "post_blocked",
        dispatcherId: ctx.dispatcher.id,
        actorAuthUserId: ctx.user.id,
        // What was missing, so the funnel can say WHICH requirement costs the
        // most — not merely that a wall exists.
        payload: { missing: ready.blockers.map((g) => g.href) },
      });
      redirect(backTo("profile_incomplete"));
    }
  }

  const categoryRaw = String(formData.get("category") ?? "");
  const category = CATEGORIES.includes(categoryRaw as VehicleCategory)
    ? (categoryRaw as VehicleCategory)
    : null;

  const pickupAddress = String(formData.get("pickup_address") ?? "").trim();
  const dropoffAddress = String(formData.get("dropoff_address") ?? "").trim();
  const pickupLat = num(formData.get("pickup_lat"));
  const pickupLng = num(formData.get("pickup_lng"));
  const dropoffLat = num(formData.get("dropoff_lat"));
  const dropoffLng = num(formData.get("dropoff_lng"));
  // The pickup must be geocoded (picked from the suggestions) so the Pool can
  // match it by distance; dropoff coords are kept only if valid.
  const pickupValid = pickupLat != null && pickupLng != null && isValidLatLng(pickupLat, pickupLng);
  const dropoffValid =
    dropoffLat != null && dropoffLng != null && isValidLatLng(dropoffLat, dropoffLng);
  const zone = pickupAddress ? pickupAddress.split(",")[0]!.trim() || null : null;
  // Short glance labels captured at pick-time from Mapbox's structured POI/place
  // data (phase 2). Written only when present (conditional spread below) so a
  // draft re-saved without re-picking keeps its stored label rather than wiping it.
  const pickupLabel = String(formData.get("pickup_label") ?? "").trim();
  const dropoffLabel = String(formData.get("dropoff_label") ?? "").trim();
  const labels = {
    ...(pickupLabel ? { pickup_label: pickupLabel } : {}),
    ...(dropoffLabel ? { dropoff_label: dropoffLabel } : {}),
  };
  const pickupLocal = String(formData.get("pickup_at") ?? "").trim();
  const ceiling = num(formData.get("ceiling"));
  const speedWin = formData.get("speed_win") === "on";

  // Named Guests (first + surname). The list IS the headcount (rows = pax_count);
  // passenger_name keeps the MAIN Guest's name as a denormalised display string.
  // Names + the main flag go on the mission row (Pool Drivers can read it); phones
  // go in a Driver-unreadable side table (mission_guest_contact), aligned by index.
  const passengers = parsePassengers(formData.get("passenger_names"));
  const hasGuestData = passengers.some((p) => p.first || p.last || p.phone);
  const passengerName = primaryPassengerName(passengers);
  const paxCount = passengers.length > 0 ? passengers.length : null;
  const flightNumber = String(formData.get("flight_number") ?? "").trim();
  // Reference: a short booking tag (room / event) for the Business's own
  // schedule line — never shown to the Driver. Capped at 20 chars server-side
  // (the input's maxLength is a convenience; this is the real guard).
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 20);
  const luggageCount = num(formData.get("luggage_count"));
  // Luggage-only run (Sujet B, Phase 1): a bags-only trip carried in a Van, no
  // passengers. Forced to category=business + body=van server-side so it matches
  // Van Drivers (catalog vans are business-tier) regardless of the submitted fields.
  const luggageOnly = formData.get("luggage_only") === "1";

  // Service class: category is the TIER; body + an optional specific car narrow
  // which Drivers match (O5).
  const bodyRaw = String(formData.get("required_body_type") ?? "");
  const requiredBody: BodyType | null = bodyRaw === "sedan" || bodyRaw === "van" ? bodyRaw : null;
  const requiredMake = String(formData.get("required_make") ?? "").trim() || null;
  const requiredModel = String(formData.get("required_model") ?? "").trim() || null;

  // Driver & service card (S19): requested languages, dress code, request flags,
  // the meet & greet name board, and a private message to the Driver.
  const requiredLanguages = parseLanguages(formData.get("required_languages"));
  const dressRaw = String(formData.get("dress_code") ?? "").trim();
  const dressCode = (DRESS_CODES as readonly string[]).includes(dressRaw) ? dressRaw : null;
  const driverFlags = parseDriverFlags(formData.get("driver_flags"));
  const boardName = String(formData.get("board_name") ?? "").trim();
  const driverMessage = String(formData.get("driver_message") ?? "").trim();

  // Intermediate stops (KEEP). Stored as jsonb waypoints, each with its coords.
  const waypoints = parseWaypointsField(formData.get("waypoints"));
  // Picked stops (with coords) extend the cached ETA through the detour.
  const via = waypoints
    .filter((w) => w.lat != null && w.lng != null && isValidLatLng(w.lat, w.lng))
    .map((w) => ({ lat: w.lat as number, lng: w.lng as number }));

  // category / pickup / pickup_at / ceiling are NOT NULL on the mission table,
  // so even a draft must carry these core fields.
  if (
    !category ||
    !pickupAddress ||
    !pickupValid ||
    !pickupLocal ||
    ceiling == null ||
    ceiling <= 0
  ) {
    redirect(backTo("missing"));
  }

  // A LIVE mission (posted to the Pool) must have a located destination — Drivers
  // need to know where the trip goes, and it's what gives the fare/ETA a distance.
  // A draft may legitimately be parked without one and finished later.
  if (!asDraft && (!dropoffAddress || !dropoffValid)) {
    redirect(backTo("nodrop"));
  }

  // ⚑ And every STOP must be located too, for the same reason the ends are: the
  // `via` filter above drops a stop with no coords, so the route never passes
  // through it and the fare never counts it — while the Driver still has to
  // drive there and tap "Reached". See `unlocatedStops`. A draft may be parked
  // with one half-typed, exactly as it may be parked without a drop-off.
  if (!asDraft && unlocatedStops(waypoints).length > 0) {
    redirect(backTo("nostop"));
  }

  // datetime-local carries no timezone — interpret it as Europe/Paris wall time
  // and convert to a real UTC instant (fixes the old server-local-zone bug).
  const pickupAt = parisLocalToUtc(pickupLocal);
  if (!pickupAt) redirect(backTo("missing"));
  // A live mission can't be posted in the past (a draft may legitimately sit
  // there until resumed). 60s of slack for clock skew.
  if (!asDraft && pickupAt!.getTime() < Date.now() - 60_000) redirect(backTo("past"));

  // Cache road distance + ETA (best-effort; null if routing fails or no dropoff).
  // Traffic-aware: pass the scheduled pickup time as depart_at (future only) so
  // the ETA reflects predicted traffic for that day & hour. Only WRITE it when a
  // fresh value was obtained, so a transient routing failure on a re-save/post
  // never wipes a previously-cached ETA.
  const departAt =
    pickupAt!.getTime() > Date.now() ? pickupAt!.toISOString().replace(/\.\d{3}Z$/, "Z") : null;
  // ⚑ Retried ONCE on failure. Since the floor guard below now refuses to post
  // without a price, a single transient Mapbox blip would otherwise turn into a
  // hotel unable to book — trading a silent money bug for a loud availability
  // one. One retry kills the blips; a real outage still stops at the guard,
  // which is the correct place to stop.
  const routeOnce = () =>
    pickupValid && dropoffValid
      ? routeMetrics(
          { lat: pickupLat!, lng: pickupLng! },
          { lat: dropoffLat!, lng: dropoffLng! },
          departAt,
          via,
        )
      : Promise.resolve(null);
  let metrics = await routeOnce();
  if (metrics == null && pickupValid && dropoffValid && !asDraft) {
    metrics = await routeOnce();
  }
  const eta = metrics
    ? { distance_km: metrics.distanceKm, duration_min: metrics.durationMin }
    : {};

  // ── Kavenue's price (docs/06 §4) ──────────────────────────────────────────
  // Computed in SQL, from the SERVER's own road distance — never from a number
  // the browser sent. lib/rate-card.ts pre-fills and guides the form; this is
  // the copy that decides, and `mission_price` is the same function the
  // migration installed, so the two halves cannot drift without a test failing.
  const supabase = await createClient();
  const nightApplied = isNightPickup(pickupLocal);
  const { data: quote } = await (metrics?.distanceKm != null
    ? supabase
        .rpc("mission_price", {
          p_tier: (luggageOnly ? "business" : category!) as VehicleCategory,
          p_body: (luggageOnly ? "van" : requiredBody) as BodyType | null,
          p_km: metrics.distanceKm,
          p_night: nightApplied,
        })
        .maybeSingle()
    : Promise.resolve({ data: null }));

  // §5 — a trip cannot be POSTED below the floor: "The lowest this trip can be
  // offered at is …". A DRAFT stays lenient, the same way it may be parked
  // without a drop-off (S27) — it gets priced properly on the way out.
  //
  // Both sides of this comparison are ALL-IN: the rate card's floor is what the
  // Business would pay, and so is the number they typed. The conversion to the
  // stored Course happens below, after the guard.
  // ⚑ NO PRICE MEANS NO FLOOR CHECK — SO REFUSE, DON'T WAVE IT THROUGH.
  //
  // This guard used to read `!asDraft && quote && …`, which made a MISSING quote
  // indistinguishable from a quote that passed: routing falls over, `quote` is
  // null, and the trip posts with no floor check at all — and `pdp_start` falls
  // back to 50 % of the Ceiling in the same breath (see the note below). The
  // absence of a price is not evidence that the price is fine.
  //
  // ⚑ Only reachable when ROUTING failed, not when an address was typed: posting
  // already requires a located drop-off (`nodrop`) and located stops (`nostop`),
  // and the pickup is required even for a draft. So this is the Mapbox-is-down
  // case — rare, but silent, and it lands on the one number that decides money.
  //
  // A draft stays lenient, exactly as it may be parked without a drop-off (S27).
  if (!asDraft && !quote) {
    redirect(backTo("noprice"));
  }
  if (!asDraft && round2(ceiling!) < round2(quote!.floor_price)) {
    redirect(backTo("belowfloor"));
  }

  // ── Commission (docs/06 §1, §9) ───────────────────────────────────────────
  // The rates come from the table, never from constants here — and they are
  // snapshot onto the row, so re-rating later can never rewrite this trip's
  // invoice. `transport_vat_rate` stays NULL: it is the assigned Driver's
  // status, and nobody has accepted yet.
  //
  // ⚑ SERVICE ROLE, not `supabase`. Since the money-column walls (2026-08-30) a
  // Dispatcher session cannot read `driver_rate_ht` — but this row has to carry
  // BOTH rates, because docs/06 §9 says settlement reads the snapshot and never
  // joins back to the live card. The rate card is one global row, not this
  // Business's data, so there is nothing here for RLS to scope; the Business's
  // own half of the same read stays on the user session over in
  // dispatch/new/page.tsx.
  const { data: rateRow, error: rateErr } = await createAdminClient()
    .from("commission_rate")
    .select(COMMISSION_RATE_COLS)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  // ⚑ A FAILED READ IS NOT "NO COMMISSION". `rates = null` is a legitimate answer —
  // no generation in force — and it makes `course` the typed number verbatim, which
  // is right when it is TRUE. When it is only a query that fell over, that same line
  // stores the Business's ALL-IN maximum as the fare: the Driver is paid from the
  // Business's gross, the invoice bills 15% on top of it, and the row is stamped
  // "never charged a fee" forever after. Nothing downstream can tell the two apart,
  // so refuse rather than guess. Write nothing on a rate we could not read.
  if (rateErr) redirect(backTo("rates"));
  const rates = ratesFromRow(rateRow);

  // ⚑ THE FIELD IS ALL-IN, THE COLUMN IS THE COURSE. The Business types (and
  // Kavenue pre-fills) what they will pay, fee inside; `mission.ceiling` goes on
  // storing the fare the PDP climbs and the Driver is paid from, exactly as it
  // did before commission existed. Every fee, every band and every cancellation
  // basis downstream therefore keeps its meaning — this is the one line that
  // makes the all-in display safe.
  const course = courseFromBusinessTotal(ceiling!, rates);

  // ── Where the auction opens (docs/06 §6 rule 1) ───────────────────────────
  // EVERY trip opens at its FLOOR, whatever the lead time — not at a fraction of
  // the Ceiling, which is the Business's commercial decision and no basis for an
  // opening bid (§0, §5). `mission_price` returns the floor ALL-IN, exactly like
  // the number the Dispatcher typed, so it is converted with the SAME snapshot
  // rates as `course` above: mixing the two spaces would open the auction 15% high.
  //
  // ⚑ SPEED WIN's hotter opening is NOT stored. It is 70% of the ceiling, and
  // lib/pdp.ts derives it from `speed_win` on every read. Storing only the floor
  // is what lets a RE-POOL turn SPEED WIN on (under 24h) and off again without
  // ever losing the floor underneath it.
  //
  // No quote means no routed distance (no drop-off yet, or routing fell over):
  // there is no floor even in principle, so those keep the old 50% opening.
  //
  // `pdp_step` / `pdp_interval` are dead as of the §6 curve — the step COUNT and
  // the step TIMES both fall out of the gap and the mission id now. Written NULL
  // rather than left stale, so nothing can read a fixed-step curve that no longer
  // exists. The columns stay for the archive.
  // ⚑ NO QUOTE MEANS NO FLOOR — SO WRITE NOTHING, DON'T INVENT ONE. `quote` is
  // null whenever `metrics` is (routing fell over, or there is no located
  // drop-off yet on a draft). Writing `course * 0.5` here looked harmless because
  // it is what the old curve opened at anyway — but on a RE-SAVED DRAFT that
  // already carries a real rate-card floor, it overwrites it with a number that
  // has nothing to do with the trip's cost. A one-off Mapbox failure would
  // silently re-open the auction in the wrong place, for good.
  //
  // ⚑ This note used to end "…and the §5 floor guard above is skipped in exactly
  // the same breath". That is no longer true — the guard now REFUSES to post
  // without a quote rather than waving the trip through (S66). So on this line
  // `quote` can only be null on a DRAFT, which is the lenient case by design.
  //
  // Same conditional-spread idiom as `eta` above: absent, not overwritten. On a
  // FIRST insert there is nothing to preserve, so it falls back to the old 50 %
  // opening, which is also what `openingPrice()` coalesces a NULL to.
  const pdpStart = quote ? round2(courseFromBusinessTotal(Number(quote.floor_price), rates)) : null;
  const opening: { pdp_start: number } | Record<string, never> =
    pdpStart != null ? { pdp_start: pdpStart } : {};

  const status: MissionStatus = asDraft ? "draft" : "pooled";

  // Optional meet & greet board file → the private "documents" bucket. The path
  // uses a random id (not the mission id) so the row needn't exist first. We only
  // WRITE board_file_path when a new file was uploaded (conditional spread, like
  // eta below), so re-saving a draft never wipes a previously-attached board.
  // A failed upload is non-fatal: the mission still saves, just without the file.
  let boardUpload: { board_file_path: string | null } | Record<string, never> = {};
  const boardFile = formData.get("board_file");
  if (
    boardFile instanceof File &&
    boardFile.size > 0 &&
    boardFile.size <= MAX_UPLOAD_BYTES &&
    BOARD_MIME.includes(boardFile.type)
  ) {
    try {
      await ensureBucket(DOCS_BUCKET, false);
      const path = `mission/${ctx.business.id}/board-${crypto.randomUUID()}.${fileExt(boardFile)}`;
      await uploadFile(DOCS_BUCKET, path, boardFile);
      boardUpload = { board_file_path: path };
    } catch {
      boardUpload = {};
    }
  }
  // Explicit removal of a previously-attached board (the Dispatcher dismissed it
  // or turned meet & greet off), but only when no replacement file was uploaded.
  if (Object.keys(boardUpload).length === 0 && formData.get("board_file_clear") === "1") {
    boardUpload = { board_file_path: null };
  }

  const row = {
    business_id: ctx.business.id,
    dispatcher_id: ctx.dispatcher.id,
    status,
    category: luggageOnly ? "business" : category!,
    zone,
    pickup_address: pickupAddress,
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    dropoff_address: dropoffAddress || null,
    dropoff_lat: dropoffValid ? dropoffLat : null,
    dropoff_lng: dropoffValid ? dropoffLng : null,
    waypoints: waypoints.length > 0 ? waypoints : null,
    pickup_at: pickupAt!.toISOString(),
    passenger_name: luggageOnly ? null : passengerName || null,
    // Names + main flag only (no phone) — this row is Pool-readable. Stored when
    // any Guest has a name or phone; pax_count preserves the headcount. A luggage
    // run carries no passengers.
    passenger_names: luggageOnly ? null : hasGuestData ? passengerRowData(passengers) : null,
    pax_count: luggageOnly ? null : paxCount,
    luggage_count: luggageCount,
    luggage_only: luggageOnly,
    flight_number: flightNumber || null,
    reference: reference || null,
    ceiling: course,
    // docs/06 §9 snapshot — which generation of the card priced this trip,
    // whether the night rate applied, and the commission rates in force.
    // Settlement, invoicing and history read these, never the live tables.
    rate_card_id: quote?.rate_card_id ?? null,
    night_applied: nightApplied,
    commission_business_rate: rates?.businessHt ?? null,
    commission_driver_rate: rates?.driverHt ?? null,
    commission_vat_rate: rates?.feeVat ?? null,
    pdp_step: null,
    pdp_interval: null,
    speed_win: speedWin,
    required_body_type: luggageOnly ? "van" : requiredBody,
    required_make: luggageOnly ? null : requiredMake,
    required_model: luggageOnly ? null : requiredModel,
    required_languages: requiredLanguages.length > 0 ? requiredLanguages : null,
    dress_code: dressCode,
    driver_flags: Object.keys(driverFlags).length > 0 ? driverFlags : null,
    board_name: boardName || null,
    driver_message: driverMessage || null,
  };

  let effectiveId: string | null = missionId;
  if (missionId) {
    // Resume an existing DRAFT of this Business. When POSTING it live, reset the
    // climb origin: the PDP fare is measured from created_at (pdp.ts), so without
    // this a draft saved hours/days ago would be posted already near/at the
    // ceiling. A plain re-save-as-draft keeps the original created_at.
    const updateRow = asDraft
      ? { ...row, ...eta, ...opening, ...boardUpload, ...labels }
      : { ...row, ...eta, ...opening, ...boardUpload, ...labels, created_at: new Date().toISOString() };
    const { data: updated, error } = await supabase
      .from("mission")
      .update(updateRow)
      .eq("id", missionId)
      .eq("business_id", ctx.business.id)
      .eq("status", "draft")
      .select("id");
    if (error) redirect(backTo("db"));
    // 0 rows matched → the draft was already posted or discarded elsewhere
    // (stale tab / double-submit). Don't report a phantom success.
    if (!updated || updated.length === 0) redirect(backTo("gone"));
  } else {
    const { data: inserted, error } = await supabase
      .from("mission")
      .insert({ ...row, ...eta, ...opening, ...boardUpload, ...labels })
      .select("id")
      .single();
    if (error || !inserted) redirect(backTo("db"));
    effectiveId = inserted.id;
  }

  // Guest phones live in a side table Drivers can't read (privacy gate), aligned
  // by index to passenger_names. Upsert when any number was entered; otherwise
  // clear any prior row (e.g. a phone removed on re-save). RLS scopes both to this
  // Business's own mission.
  if (effectiveId) {
    const contacts = guestContacts(passengers);
    const { error: contactErr } = contacts.some((c) => c.phone)
      ? await supabase.from("mission_guest_contact").upsert({
          mission_id: effectiveId,
          contacts,
          updated_at: new Date().toISOString(),
        })
      : await supabase
          .from("mission_guest_contact")
          .delete()
          .eq("mission_id", effectiveId);
    // The mission row is already saved; a phone side-table failure shouldn't undo
    // a posted mission — but never swallow it silently (e.g. table missing
    // pre-migration). Surface it in the server logs.
    if (contactErr) {
      console.error("mission_guest_contact write failed:", contactErr.message);
    }
  }

  // Refresh the layout so the sidebar Drafts badge reflects the new count.
  revalidatePath("/dispatch", "layout");
  redirect(asDraft ? "/dispatch/drafts" : "/dispatch");
}

// Discard a saved draft. There is no DELETE RLS policy on mission, so this uses
// the service role, strictly scoped to the Business's own draft rows.
export async function discardDraft(formData: FormData) {
  const ctx = await getAppContext();
  if (!ctx.business) redirect("/login");
  const id = String(formData.get("mission_id") ?? "").trim();
  if (!id) redirect("/dispatch/drafts");
  const admin = createAdminClient();
  await admin
    .from("mission")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .eq("status", "draft");
  revalidatePath("/dispatch", "layout");
  redirect("/dispatch/drafts");
}
