// § 7 — the hold. A Driver freezes a pooled trip for a few seconds to think.
//
// docs/06 §7 is LOCKED and specifies THIRTY seconds. The founder set it to FIFTEEN in S72:
// *"we are the only one that offers this because period of big season and big demands, 15
// seconds there's a lot of time to think."* Their number, their trade — half the time a
// trip spends off the market, and the price moves even less inside the window.
//
// ⚑ WHY IT EXISTS (docs/06:413-415): an attractive number triggers an impulsive accept, the
// Driver then finds it does not fit their day, and that becomes a Driver cancellation — a
// 100 % penalty, a re-pooled trip and a Business with no car. Seconds of thinking time are
// cheap against that.
//
// ⚑ IT IS VOLUNTARY, AND THE SPEC DECIDES THAT ITSELF. docs/06:419 says "one hold per Driver
// per trip — no releasing and re-holding to reset the clock". If holding were the only route
// to Accept, a Driver whose clock lapsed because their phone slept would be locked out of
// that trip permanently. The rule only makes sense as an anti-clock-reset measure on an
// OPTIONAL freeze. So: Accept is always there, unchanged; the hold sits beside it.
//
// ⚑ THE HOLD SPENDS THE HOLD, NEVER THE TRIP. Founder, S72: a Driver who holds, thinks, and
// walks away must be able to come back — five seconds or five minutes later — and take the
// trip at the live price. All they have used up is the right to freeze it a second time.
import type { Database } from "@/lib/database.types";

/** The window, in seconds. One definition; the SQL reads it from the row, not a literal. */
export const HOLD_SECONDS = 15;

/**
 * How a hold ended. Stored, not derived — the difference between `lapsed` and `void` is the
 * whole value of the log, and no timestamp can tell them apart after the fact.
 *
 *  open      — running right now (and only if expires_at is still in the future)
 *  committed — the Driver confirmed; this trip is theirs
 *  lapsed    — the clock ran out. ⚑ THE SIGNAL: someone took a trip off the shelf, looked at
 *              the number, and put it back. It is the only evidence Kavenue will ever have
 *              about WHICH price a Driver walked away from.
 *  released  — the Driver left the card before the clock ran out. Same as lapsed for the
 *              trip, different for the reading: they stopped considering it, they did not
 *              run out of time.
 *  void      — the trip stopped being available underneath them (the Business cancelled or
 *              amended it). ⚑ NOT a price rejection, and merging it into `lapsed` would
 *              poison the one number this table exists to produce.
 */
export const HOLD_OUTCOMES = ["open", "committed", "lapsed", "released", "void"] as const;
export type { HoldOutcome } from "@/lib/database.types";

export type MissionHoldRow = Database["public"]["Tables"]["mission_hold"]["Row"];

/**
 * ⚑ `open` IS NOT A STATE, IT IS A CLAIM ABOUT THE CLOCK. Nothing runs at T+15 s — no cron,
 * no worker, no realtime (lib/expiry.ts:12-17 records why: Vercel Hobby caps cron at once a
 * DAY). So a row can sit at outcome='open' long after it stopped meaning anything. Every
 * reader must ask the clock, never the column. The sweep settles the column later, for the
 * log's sake; correctness never waits for it.
 */
export function isLive(
  hold: Pick<MissionHoldRow, "outcome" | "expires_at">,
  now: Date = new Date(),
): boolean {
  return hold.outcome === "open" && Date.parse(hold.expires_at) > now.getTime();
}

/** Whole seconds left, floored at 0. */
export function secondsLeft(expiresAt: string | null | undefined, now: Date = new Date()): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / 1000));
}

/** "0:11" — the countdown, in the shape the Driver reads. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * THE PRICE RULE — a FLOOR, not a freeze, and the departure from §7 is deliberate.
 *
 * §7 says the price is "frozen", and its ⚑ reads: *"Accept at the price the Driver was
 * shown. Prices only rise, so the server's number can only be higher; honouring the
 * displayed one removes any 'it changed on me' complaint."*
 *
 * ⚑ THAT IS CONSUMER LOGIC, AND THE DRIVER IS NOT THE CONSUMER. The Driver is PAID this
 * number. A price that rose during their 15 seconds is good news for them, and honouring the
 * lower displayed one bills them for thinking. Measured on all 364 live trips at the real
 * accept instants: a strict freeze changes the number on 3.4 % of accepts, mean €0.10 — but
 * on trips posted inside an hour it bites 70 % of the time, around €2. Small, and pointed
 * exactly at the urgent trips.
 *
 * So: AT LEAST what they were shown, more if it climbed. Thinking is free, and the Business
 * pays nothing it would not have paid anyway — any Driver accepting at that same later
 * second pays the climbed price regardless. Founder's call, S72.
 */
export function holdFloor(heldFare: number | null, currentFare: number): number {
  return heldFare == null ? currentFare : Math.max(heldFare, currentFare);
}

/** What the holder's own screen says. */
export function holderLabel(seconds: number): string {
  return `Yours ${formatCountdown(seconds)}`;
}

/**
 * What EVERY OTHER Driver sees in place of Accept. §7:424 — "the card stays fully readable
 * to everyone else", and showing the countdown is deliberate: another Driver needs to know
 * whether to wait or move on.
 */
export function watcherLabel(seconds: number): string {
  return `Being reviewed · ${formatCountdown(seconds)}`;
}

/**
 * What the Business sees. §7:427 — "reassuring, not alarming", so the fact and not a clock.
 * A ticking countdown on a hotel's screen invites "so will they take it?", and often the
 * answer is no.
 */
export const BUSINESS_REVIEWING_LABEL = "A Driver is reviewing this";

/**
 * Can this Driver still freeze this trip? One per Driver per trip, EVER — enforced in the
 * database by `unique (mission_id, driver_id)`, which cannot be raced and needs no lock.
 * This is the read-side mirror, for deciding whether to render the button.
 *
 * ⚑ A spent hold NEVER blocks Accept. It blocks only the freeze.
 */
export function canHold(priorHold: MissionHoldRow | null | undefined): boolean {
  return !priorHold;
}
