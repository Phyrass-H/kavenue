// § the Fare column on the Dispatch schedule.
//
// ⚑ WHY THIS EXISTS. The schedule showed no money at all: the fare cell in
// `components/trip-row.tsx` was gated on `archived`, so History had a Fare column and the
// screen a Dispatcher actually lives on had none. The founder went looking for a price on
// a row and found nothing (2026-09-01). Nothing in the code ever argued for withholding
// it — the cell's own comment only justifies putting it ON the archive.
//
// ⚑ AND WHY EVERY ROW SAYS WHICH MONEY IT IS. A trip has four different prices over its
// life and they are not close together: on the live data the ceiling and what was actually
// paid differ on 67% of trips, by a median of 50 €. One real row read 34,80 € for a trip
// that went for 17,20 €. A column of unlabelled euros is not a column of comparable
// numbers, so each one names itself in a small grey word.
//
// ⚑ THE WORD FOR THE LIVE PRICE IS "AUCTION" (founder, 2026-09-01). "Offered at" was
// tried and rejected for a real reason: Kavenue is an AGENT and offers nothing — the price
// climbing toward the Ceiling until a Driver takes it IS an auction, and docs/06 §6 is
// titled exactly that. A Dispatcher who reads the word daily learns the model.
// "Closed at" is the founder's own word for its other end.
//
// ⚑ EVERY AMOUNT HERE IS THE BUSINESS ALL-IN, never the Course. docs/06 §3 — a Business is
// only ever shown the figure it pays, fee included. `businessSplitFor` is the one door.
//
// ⚑ AND "Closed at" IS THE AGREED FARE, NOT THE BILL. Waiting is not in it, deliberately:
// the row states what the auction closed at, and the expanded row's invoice table is where
// the trip's total is built up. The label is what keeps that honest — a bare number here
// would be claiming to be the total.
import type { MissionRow } from "@/lib/database.types";
import { businessSplitFor } from "@/lib/commission";
import { isExpired } from "@/lib/dispatch-status";
import { currentFare, settledFare } from "@/lib/pdp";

/**
 * Which side's money the cell is counting.
 *
 * ⚑ `business` — the all-in, fee included. docs/06 §3: a Business is only ever shown what
 *   it pays. This is the Dispatch schedule.
 * ⚑ `course` — the bare transport price, neither side's total. This is the ADMIN console,
 *   which is not a counterparty screen: it looks at both sides at once, and `/admin/trips/[id]`
 *   already prints "Ceiling <course>" in its header. Giving the list a different basis from
 *   the detail page it links to would put two different numbers on one trip.
 */
export type FareBasis = "business" | "course";

export interface FareCell {
  /** The small grey word in front of the amount. */
  label: string;
  /** Business all-in. Null when nothing is owed — a cancellation that struck no fee. */
  amount: number | null;
  /** Business all-in Ceiling, for the second line. Null when the amount IS the Ceiling. */
  ceiling: number | null;
  /** The auction ran the whole way and nobody took it. The one row worth acting on. */
  reached: boolean;
}

type Input = MissionRow;

/**
 * What one schedule row's Fare cell says. Four outcomes, in the order they can occur:
 *
 *   Auction    — still in the Pool. The live PDP price, which is climbing.
 *   Closed at  — a Driver holds it or ran it. The fare frozen at accept.
 *   Not taken  — the climb ended at the Ceiling with nobody on it.
 *   Fee        — cancelled, and a fee was struck. `No fee` when none was.
 *
 * ⚑ `isExpired` is checked BEFORE the status, because a `pooled` trip whose pickup has
 * passed is dead whether or not the sweep has run yet — one predicate, so the calendar,
 * the schedule and a deep link cannot disagree about a trip nobody took.
 */
export function fareCell(
  m: Input,
  now: Date = new Date(),
  basis: FareBasis = "business",
): FareCell {
  const amount = (course: number) =>
    basis === "course" ? course : businessSplitFor(m, course).businessTotal;
  const ceiling = amount(Number(m.ceiling));

  if (isExpired(m, now)) {
    // The amount IS the ceiling here, so it is stated once and the second line
    // explains rather than repeating it.
    return { label: "Not taken", amount: ceiling, ceiling: null, reached: true };
  }

  if (m.status === "cancelled") {
    const raw = m.cancellation_fee == null ? null : Number(m.cancellation_fee);
    const fee = raw != null && Number.isFinite(raw) && raw > 0 ? raw : null;
    return fee == null
      ? { label: "No fee", amount: null, ceiling, reached: false }
      : { label: "Fee", amount: amount(fee), ceiling, reached: false };
  }

  if (m.accepted_at) {
    return {
      label: "Closed at",
      amount: amount(settledFare(m)),
      ceiling,
      reached: false,
    };
  }

  return {
    label: "Auction",
    amount: amount(currentFare(m, now)),
    ceiling,
    reached: false,
  };
}
