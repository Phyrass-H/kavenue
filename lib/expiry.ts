// § P — expired / unfilled trips.
//
// A trip that nobody accepted before its pickup time is dead. Until 2026-07-31
// nothing ever said so: the `expired` status existed and `missionTone` rendered
// it, but no job, trigger or sweep wrote it, so unfilled trips accumulated in
// the Pool for ever (23 of 23 pooled missions were past due, the oldest by 44
// days) and `accept_mission` would happily turn a six-week-dead booking into a
// live priced obligation.
//
// The founder's rule: a trip expires EXACTLY at its pickup time — no grace.
//
// WHY THIS IS A READ-TIME SWEEP AND NOT A CRON. Vercel's Hobby plan caps cron at
// once per day, which can't serve a T-0 rule, and the D61 T-180 reminder wants a
// real scheduler anyway — so that decision belongs to the notifications phase.
// The RPC is idempotent and its UPDATE normally matches zero rows, so calling it
// on the two pages that actually display Pool state costs nothing at beta scale.
// If the mission table ever grows, this is the thing to move onto a timer.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Flip every past-due pooled mission to `expired`. Safe to call on any read.
 *
 * Deliberately NEVER throws: this runs before a page's own query, and a Driver
 * must still see their Pool if the sweep fails (it also lets the app deploy
 * ahead of the migration that creates the RPC). A failure is logged, not shown
 * — the Pool's own `pickup_at` floor and the time check inside `accept_mission`
 * are the guards that actually matter, and neither depends on this running.
 */
export async function sweepExpiredMissions(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { error } = await supabase.rpc("expire_stale_missions");
  if (error) console.error("[expiry] sweep failed:", error.message);
}

/**
 * § 7 — settle holds whose clock has run out, so `hold_lapsed` exists at all.
 *
 * ⚑ THIS IS FOR THE LOG, NEVER FOR CORRECTNESS, and the difference matters. Every guard that
 * decides anything — `place_hold`, `accept_mission`, the `mission_read` mask, the client
 * countdown — compares `expires_at` to now(). A hold therefore ends on time whether or not
 * this ever runs. What only this produces is the ROW: the event D109 exists to capture,
 * which cannot be collected retroactively because nothing observes T+15 s.
 *
 * So a failure here loses a record, never a trip. Same never-throws contract as the sweep
 * above, for the same reason and with the same shape.
 */
export async function sweepLapsedHolds(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { error } = await supabase.rpc("sweep_lapsed_holds");
  if (error) console.error("[hold] sweep failed:", error.message);
}
