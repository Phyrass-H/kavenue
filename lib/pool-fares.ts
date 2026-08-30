// Pool prices, computed where the Driver's token cannot reach — S72.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `mission_read` masks `ceiling` for a Driver looking at a trip they do not
// hold, because the Ceiling IS the Business's maximum and docs/06 §6 already
// publishes the rule that the curve tops out at T−5h. A Driver who knows the
// level as well as the timing knows exactly what waiting is worth, which is the
// single strategy the jitter exists to prevent.
//
// But `currentFare()` climbs TO the ceiling, and lib/pdp.ts is deliberately
// "the SINGLE place fare is computed" — Postgres cannot evaluate the §6 curve.
// So the price has to be worked out on the server, from a ceiling the browser
// never receives.
//
// ── WHY THIS IS NOT A HOLE IN RLS ───────────────────────────────────────────
// ⚑ THE IDS COME FROM A READ THE CALLER ALREADY PASSED. Every entry point here
//   takes mission ids that the user's OWN session just returned through
//   `mission_read`, which is row-filtered exactly as `p_mission_driver_read`
//   was. The service role is used to fill in prices for rows the caller has
//   already proved they may see — it never decides WHICH rows those are. Pass
//   ids from anywhere else and that property is gone, which is why every
//   caller's comment says where its ids came from.
//
// The one exception is `courseForAccept`, which takes a single id straight from
// the browser. That is safe for a different reason: the number never goes back
// to the browser — it goes into `accept_mission`, which re-clamps it into
// [floor, ceiling] and enforces every eligibility rule itself.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { currentFare } from "@/lib/pdp";
import { driverNet } from "@/lib/commission";

/** Exactly the curve's inputs plus the Driver's own rate. Nothing else. */
const FARE_COLS =
  "id, ceiling, pdp_start, speed_win, pickup_at, created_at, commission_driver_rate, commission_vat_rate";

/**
 * What the Driver banks on each of these trips, right now — net of commission,
 * which is the only form a Driver is ever shown (docs/06 §1).
 *
 * Missing from the map = the row could not be read. Callers render "—" rather
 * than a guess; a fare of 0 would look like a real, terrible offer.
 */
export async function poolFaresNet(
  ids: string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;

  const { data } = await createAdminClient()
    .from("mission")
    .select(FARE_COLS)
    .in("id", ids);

  for (const m of data ?? []) out.set(m.id, driverNet(m, currentFare(m, now)));
  return out;
}

/** The same, for one trip. */
export async function poolFareNet(id: string, now: Date = new Date()): Promise<number | null> {
  return (await poolFaresNet([id], now)).get(id) ?? null;
}

/**
 * The GROSS Course at this instant — the number `accept_mission` freezes into
 * `accepted_fare` (docs/06 §9). Never rendered; see the header for why taking a
 * browser-supplied id is safe here.
 */
export async function courseForAccept(id: string, now: Date = new Date()): Promise<number | null> {
  const { data } = await createAdminClient()
    .from("mission")
    .select(FARE_COLS)
    .eq("id", id)
    .maybeSingle();
  return data ? currentFare(data, now) : null;
}
