"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/app-context";
import { recordMissionEvent } from "@/lib/mission-events-server";
import { settledFare } from "@/lib/pdp";
import { businessRatesOf, courseFromBusinessTotal } from "@/lib/commission";
import { carsFor, SERVICE_TIERS, type BodyType, type ServiceTier } from "@/lib/vehicle-catalog";

export type ActionResult = { ok: true } | { ok: false; message: string };

// ⚑ `id` and `pickup_at` are curve INPUTS (the jitter seed and the anchor), not
// bookkeeping — drop either and settledFare stops compiling, which is the point.
const FARE_COLS =
  "id, business_id, ceiling, pdp_start, pdp_step_count, speed_win, pickup_at, created_at, pooled_at, accepted_at, accepted_fare";

function revalidateDispatch() {
  revalidatePath("/dispatch", "layout");
  revalidatePath("/dispatch/calendar");
  revalidatePath("/dispatch/history");
}

// Business cancels one of its trips (O7, D45). FREE while still pooled (no Driver
// committed); once a Driver holds it, a time-based fee applies — business_cancel_mission
// (SECURITY DEFINER) computes the % from time-to-pickup and stamps the terminal cancel.
// The fare snapshot is computed server-side (authoritative) as the euro basis (MANUAL).
// D48 — the Business declares the no-show ("stop waiting, the Guest isn't coming"). Same
// terminal outcome as the Driver's report: the Driver is paid the fare plus the accrued
// waiting, the Business is charged both. The RPC enforces status='arrived' AND that the
// courtesy wait has elapsed, so this can't be used as a cheap early cancel.
export async function businessDeclareNoShow(missionId: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.business) return { ok: false, message: "You’re not signed in as a Business." };

  const supabase = await createClient();
  const { data: mission } = await supabase
    .from("mission_read")
    .select(FARE_COLS)
    .eq("id", missionId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!mission) return { ok: false, message: "This isn’t one of your trips." };

  const { error } = await supabase.rpc("business_declare_no_show_call", {
    p_mission_id: missionId,
    p_fare_snapshot: settledFare(mission),
  });
  if (error) {
    const msg = error.message?.trim();
    return {
      ok: false,
      message:
        msg && msg.length < 120 ? msg : "Couldn’t close the trip — please refresh and try again.",
    };
  }

  revalidateDispatch();
  return { ok: true };
}

export async function businessCancelMission(
  missionId: string,
  reason?: string | null,
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.business) return { ok: false, message: "You’re not signed in as a Business." };

  const supabase = await createClient();
  const { data: mission } = await supabase
    .from("mission_read")
    .select(FARE_COLS)
    .eq("id", missionId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!mission) return { ok: false, message: "This isn’t one of your trips." };

  const { error } = await supabase.rpc("business_cancel_mission_call", {
    p_mission_id: missionId,
    p_reason: reason?.trim() || null,
    p_fare_snapshot: settledFare(mission),
  });
  if (error) {
    const msg = error.message?.trim();
    return {
      ok: false,
      message: msg && msg.length < 120 ? msg : "Couldn’t cancel — please refresh and try again.",
    };
  }

  revalidateDispatch();
  return { ok: true };
}

// Propose a mutual-consent AGREED RELEASE (O7, D45) — a dedicated, FREE alternative to
// the fee-paying cancel: the assigned Driver must accept before the trip releases and
// re-pools. Runs propose_release (SECURITY DEFINER) via the USER session; the RPC
// re-checks ownership + that a committed Driver holds it (accepted/confirmed). The
// fare snapshot is computed server-side as dispute context (the trip's worth at
// propose-time). One live request at a time (the RPC supersedes a prior pending one).
export async function proposeRelease(
  missionId: string,
  note?: string | null,
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.business) return { ok: false, message: "You’re not signed in as a Business." };

  const supabase = await createClient();
  const { data: mission } = await supabase
    .from("mission_read")
    .select(FARE_COLS)
    .eq("id", missionId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!mission) return { ok: false, message: "This isn’t one of your trips." };

  const { error } = await supabase.rpc("propose_release", {
    p_mission_id: missionId,
    p_note: note?.trim() || null,
    p_from_fare: settledFare(mission),
    p_proposed_by: ctx.dispatcher?.id ?? null,
  });
  if (error) {
    const msg = error.message?.trim();
    return {
      ok: false,
      message: msg && msg.length < 120 ? msg : "Couldn’t send the release — please refresh and try again.",
    };
  }

  // § AG — a release request lives entirely in mission_release and changes no
  // status, so the trigger never sees it. Only the ANSWER can move the trip, and
  // if the Driver declines nothing moves at all — which is exactly the case worth
  // having on the record.
  await recordMissionEvent({
    missionId,
    type: "release_proposed",
    actorKind: "dispatcher",
    actorId: ctx.dispatcher?.id ?? null,
    payload: { note: note?.trim() || null, from_fare: settledFare(mission) },
  });

  revalidateDispatch();
  return { ok: true };
}

// Close a release request: withdraw a still-pending one, or hide a RESOLVED one from
// the schedule (dismissed_at — the evidence is never deleted). Runs close_release
// (SECURITY DEFINER) via the USER session; the RPC re-checks ownership + which action
// applies from the request's status. A schedule-row form action, like closeAmendment.
export async function closeRelease(formData: FormData) {
  const ctx = await getAppContext();
  if (!ctx.business) redirect("/login");
  const releaseId = String(formData.get("release_id") ?? "").trim();
  const missionId = String(formData.get("mission_id") ?? "").trim();
  if (!releaseId) redirect("/dispatch");

  const supabase = await createClient();
  await supabase.rpc("close_release", { p_release_id: releaseId });

  revalidateDispatch();
  redirect(missionId ? `/dispatch?open=${missionId}` : "/dispatch");
}

// T-60 reclaim (O7, D45): the assigned Driver accepted but never confirmed the Lock-in
// and is unreachable → take the trip back, re-pool as a SPEED WIN, penalty-free. The RPC
// enforces eligibility (status = 'accepted' and pickup within 60 min).
export async function reclaimMission(missionId: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.business) return { ok: false, message: "You’re not signed in as a Business." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reclaim_mission_call", { p_mission_id: missionId });
  if (error) {
    const msg = error.message?.trim();
    return {
      ok: false,
      message: msg && msg.length < 120 ? msg : "Couldn’t reclaim — please refresh and try again.",
    };
  }

  revalidateDispatch();
  return { ok: true };
}

// ── S83 · raise the Ceiling, change the car ([[d147]]) ─────────────────────────────────────
// Both run through a SECURITY DEFINER RPC (2026-09-18c): D144 freezes a posted trip from the
// browser, and the RPC re-checks ownership, the Pool, the pickup, a Driver's live hold and —
// for a car — the rate-card floor, priced in SQL from the trip's own distance. The browser
// sends only what the Business chose. Every change is recorded by a TRIGGER, not here.
//
// ⚑ THE AMOUNT IS ALL-IN, THE COLUMN IS THE COURSE — converted with the trip's OWN saved rates
//   (docs/06 §3), never today's, exactly as the booking form converts a new trip.

/** The database's refusals, in the Business's words. Anything unknown gets the generic line. */
const POOL_EDIT_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/A Driver is reviewing this trip/, "A Driver is looking at this trip right now — try again in a few seconds."],
  [/no longer in the Pool/, "A Driver has just taken this trip, so its price and car can’t change now."],
  [/Mission has expired/, "The pickup time has passed."],
  [/A raise must be higher/, "Enter more than your current Ceiling."],
  [/Below the lowest price/, "That’s below the lowest price for this car."],
  [/A new Ceiling is needed/, "Enter a Ceiling for the new car."],
  [/A Sedan seats 4/, "A Sedan seats 4 — this trip has more Guests."],
  [/Nothing changed/, "That’s the car the trip already has."],
  [/no distance on record/, "This trip has no distance on record, so the new price can’t be worked out."],
  [/A luggage run/, "A luggage run is always Business · Van."],
  [/No price for this class/, "Kavenue has no price for that class yet."],
];

function poolEditMessage(raw: string | undefined, fallback: string): string {
  const hit = POOL_EDIT_WORDS.find(([re]) => re.test(raw ?? ""));
  return hit ? hit[1] : fallback;
}

const RATE_COLS = "id, business_id, category, required_body_type, required_make, required_model, commission_business_rate, commission_vat_rate";

/** Raise this trip's Ceiling to `ceilingAllIn` (the Business's all-in figure). */
export async function raiseCeiling(missionId: string, ceilingAllIn: number): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.business) return { ok: false, message: "You’re not signed in as a Business." };
  if (!Number.isFinite(ceilingAllIn) || ceilingAllIn <= 0 || ceilingAllIn > 100_000) {
    return { ok: false, message: "Enter a valid amount." };
  }

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("mission_read")
    .select(RATE_COLS)
    .eq("id", missionId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!m) return { ok: false, message: "This isn’t one of your trips." };

  const course = courseFromBusinessTotal(ceilingAllIn, businessRatesOf(m));
  const { error } = await supabase.rpc("raise_ceiling", { p_mission_id: missionId, p_ceiling: course });
  if (error) {
    return { ok: false, message: poolEditMessage(error.message, "Couldn’t raise the Ceiling — please refresh and try again.") };
  }

  revalidateDispatch();
  return { ok: true };
}

/**
 * Change this trip's car. `ceilingAllIn` is the new Ceiling when the new car is priced
 * differently, and NULL when it is not (the panel knows from the rate card; the RPC refuses a
 * Ceiling sent where the price does not move, so this can never become a way to LOWER one).
 */
export async function changeTripCar(
  missionId: string,
  car: { tier: string; body: string | null; make: string; model: string },
  ceilingAllIn: number | null,
): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx.business) return { ok: false, message: "You’re not signed in as a Business." };

  const tier = (SERVICE_TIERS as string[]).includes(car.tier) ? (car.tier as ServiceTier) : null;
  const body: BodyType | null = car.body === "sedan" || car.body === "van" ? car.body : null;
  if (!tier || (car.body != null && car.body !== "" && body == null)) {
    return { ok: false, message: "Pick a class and a body type." };
  }
  if (ceilingAllIn != null && (!Number.isFinite(ceilingAllIn) || ceilingAllIn <= 0 || ceilingAllIn > 100_000)) {
    return { ok: false, message: "Enter a valid amount." };
  }

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("mission_read")
    .select(RATE_COLS)
    .eq("id", missionId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!m) return { ok: false, message: "This isn’t one of your trips." };

  // A specific car must be one the booking form offers for this class and body — or the one the
  // trip already names (a legacy model no longer in the catalog stays selectable, as in the form).
  const make = car.make.trim();
  const model = car.model.trim();
  if (make || model) {
    const offered = body ? carsFor(tier, body).some((c) => c.make === make && c.model === model) : false;
    const kept = make === (m.required_make ?? "") && model === (m.required_model ?? "");
    if (!offered && !kept) return { ok: false, message: "That car isn’t one Kavenue offers for this class." };
  }

  const course = ceilingAllIn == null ? null : courseFromBusinessTotal(ceilingAllIn, businessRatesOf(m));
  const { error } = await supabase.rpc("change_trip_car", {
    p_mission_id: missionId,
    p_category: tier,
    p_body: body,
    p_make: make || null,
    p_model: model || null,
    p_ceiling: course,
  });
  if (error) {
    return { ok: false, message: poolEditMessage(error.message, "Couldn’t change the car — please refresh and try again.") };
  }

  revalidateDispatch();
  return { ok: true };
}
