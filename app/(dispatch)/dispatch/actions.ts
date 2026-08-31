"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/app-context";
import { recordMissionEvent } from "@/lib/mission-events-server";
import { settledFare } from "@/lib/pdp";

export type ActionResult = { ok: true } | { ok: false; message: string };

// ⚑ `id` and `pickup_at` are curve INPUTS (the jitter seed and the anchor), not
// bookkeeping — drop either and settledFare stops compiling, which is the point.
const FARE_COLS =
  "id, business_id, ceiling, pdp_start, speed_win, pickup_at, created_at, pooled_at, accepted_at, accepted_fare";

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
