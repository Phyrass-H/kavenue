// The two rules every breakdown on the Activity Console obeys, in one place.
//
// ⚑ SHARED RATHER THAN COPIED, WHICH IS THE WHOLE REASON THIS FILE EXISTS. The
// Businesses screen and the Drivers screen are one idea applied twice: counts
// come from SQL, and the app decides whether a sample has earned a percentage.
// A second copy of `MIN_FOR_RATE` — or of "one row is not a breakdown" — is a
// rule that drifts the first time either screen is tuned, and the two would then
// disagree about the same word in front of the same person. [[d100]].
import { MIN_FOR_RATE } from "@/lib/admin-numbers";

/**
 * Any breakdown row, whatever it is counting.
 *
 * ⚑ The count itself is deliberately NOT in here. A Businesses row counts
 * `businesses` and a Drivers row counts `drivers`, and naming that field `n`
 * everywhere would make both SQL functions read worse to save one line here.
 * What the two share is the pair a rate is computed from.
 */
export interface Countable {
  settled: number;
  filled: number;
}

/**
 * The share of settled trips that found a Driver, or null on a sample too thin
 * to carry a percentage.
 *
 * ⚑ SUPPRESS THE RATE, NEVER THE COUNT ([[d98]]). One unfilled trip renders as
 * "0 of 1", never as "0 % filled" — and the window is never widened to
 * manufacture a sample, because that makes two screens incomparable.
 */
export function fillRate(row: Countable): number | null {
  if (row.settled < MIN_FOR_RATE) return null;
  return (row.filled / row.settled) * 100;
}

/**
 * Is this breakdown worth drawing at all?
 *
 * ⚑ ONE ROW IS NOT A BREAKDOWN, IT IS A SENTENCE — a heading, a header row and
 * a rule, to tell you nothing. It stays off the screen until it has something to
 * say, and appears on its own the day it does. The founder's standing rule
 * applied to a whole component: build for the traffic to come, degrade honestly
 * until it arrives.
 */
export function worthBreakingDown(rows: readonly unknown[]): boolean {
  return rows.length >= 2;
}
