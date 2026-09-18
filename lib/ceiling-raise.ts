/**
 * S83 — a Business raises its own Ceiling on a trip still in the Pool.
 *
 * The founder's five rules (2026-09-18):
 *   1. raise only, never lower
 *   2. only while the trip is in the Pool — once a Driver holds it, a price change
 *      is an amendment the Driver must agree to ([[d39]])
 *   3. the price follows the new Ceiling for the time left: the SAME point on the
 *      climb, on a taller one. The clock is untouched — the trip still tops out
 *      when it would have (lib/pdp.ts topLeadFor), and on a normal trip the opening
 *      price is still the rate card's floor. ⚑ NOT under SPEED WIN: there the curve
 *      opens at 70% of the Ceiling (lib/pdp.ts openingPrice), so a raise lifts the
 *      opening too. An open question for the build, not settled here.
 *   4. every raise is recorded — who, from, to, when
 *   5. as many raises as the Business wants (founder: Drivers do not wait for a
 *      raise, it is an auction — someone else takes it first)
 *
 * ⚑ PREVIEW STAGE. `fareAfterRaise` takes the higher of the old and new curves at
 * `now`, because lib/pdp.ts redraws its step ladder when the gap changes and a
 * raise can otherwise show Drivers up to ~€0.95 LESS (measured S83 on the real
 * code, ~1 case in 8). docs/06:380 is locked: "The price never goes down". The
 * build replaces this stand-in with a rule the curve itself carries.
 */
import { ceilingReachedAt, currentFare, type PdpInputs } from "@/lib/pdp";
import type { MissionStatus } from "@/lib/database.types";

type RaiseInputs = PdpInputs & {
  status: MissionStatus;
  driver_id: string | null;
  /** § 7 — a Driver's 15-second hold. Masked to NULL once past. */
  hold_expires_at?: string | null;
};

/**
 * Rule 2 — the trip is nobody's yet, and its pickup is still ahead.
 *
 * ⚑ And no Driver is in the middle of a hold on it. For those 15 seconds the row's
 * pill says "A Driver is reviewing this", and a card beside it saying "No Driver
 * has taken it yet — raise your price" would contradict it (and move the price
 * under the Driver who is deciding). The door comes back when the hold lapses.
 */
export function canRaiseCeiling(m: RaiseInputs, now: Date = new Date()): boolean {
  const held = !!m.hold_expires_at && new Date(m.hold_expires_at).getTime() > now.getTime();
  return (
    m.status === "pooled" &&
    !m.driver_id &&
    !held &&
    new Date(m.pickup_at).getTime() > now.getTime()
  );
}

/**
 * The founder's trigger: the price has reached the Ceiling and nobody has taken
 * the trip. From here the price never moves again on its own.
 */
export function atCeilingUntaken(m: RaiseInputs, now: Date = new Date()): boolean {
  return canRaiseCeiling(m, now) && now.getTime() >= ceilingReachedAt(m).getTime();
}

/**
 * Rule 3 — what the trip is worth the moment the Ceiling goes up, in Course space.
 * Never below what it was worth a moment before (see the header).
 */
export function fareAfterRaise(m: PdpInputs, newCeiling: number, now: Date = new Date()): number {
  return Math.max(currentFare(m, now), currentFare({ ...m, ceiling: newCeiling }, now));
}

/** A raise, as the schedule row shows it. Amounts are the Business's all-in figures. */
export interface CeilingRaiseBrief {
  at: string;
  from: number;
  to: number;
  /** The Dispatcher who raised it. Never null in the build: a raise always has a session. */
  by: string;
}
