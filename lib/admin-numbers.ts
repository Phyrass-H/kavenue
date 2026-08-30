// The numbers band on the Activity console's home — four figures and the months.
//
// ⚑ THESE ARE NOT THE ROLL-UPS THE FOUNDER REJECTED (twice). A count standing in
// front of rows that already say it is a roll-up: the trips list says "Unfilled"
// on the row, so "48 unfilled" at the top is the same fact said worse. Every
// figure here has NO per-row equivalent — no mission row knows the fill rate, and
// none of them knows what Kavenue kept. That is the whole test for adding one.
//
// ⚑ AND THEY MUST STAY QUIETER THAN THE FINDINGS BELOW. A number is a background
// fact; a finding interrupts you. If the band ever out-shouts "nobody can take
// Valberg → Marseille Airport", the screen has been broken.
//
// ── THE SMALL-N RULE, WHICH IS THE WHOLE REASON THIS SCALES ──────────────────
// The founder's standing instruction is to build for when traffic is huge, and to
// degrade honestly until then. So: EVERY figure is "a of b". What gets suppressed
// on a thin sample is the PERCENTAGE or the MEDIAN — never the count itself.
//   • a percentage renders only at MIN_FOR_RATE settled trips or more
//   • a median renders only at MIN_FOR_MEDIAN filled trips or more
// That is what stops one seeded trip in the Haut-Var posing as "0 % filled", and
// it is the same code at 350 trips and at 40 000. The window is never widened to
// manufacture a sample — the rate is suppressed instead, so two mornings stay
// comparable. See [[d98]].
import { splitFor } from "@/lib/commission";
import type { MissionRow } from "@/lib/database.types";

/** Below this many settled trips, a percentage is a lie about a small sample. */
export const MIN_FOR_RATE = 20;
/** Below this many filled trips, a median is one trip wearing a costume. */
export const MIN_FOR_MEDIAN = 12;

/** The columns the band needs. Nothing else is read. */
// ⚑ ONE STRING LITERAL, never a concatenation: the typed client parses this at
// the type level, and a `+` widens it to `string`, at which point every column
// comes back as an error type instead of a row.
export const HOME_NUMBER_COLS =
  "status,created_at,pickup_at,accepted_at,accepted_fare,ceiling,commission_business_rate,commission_driver_rate,commission_vat_rate,transport_vat_rate" as const;

export type NumbersRow = Pick<
  MissionRow,
  | "status"
  | "created_at"
  | "pickup_at"
  | "accepted_at"
  | "accepted_fare"
  | "ceiling"
  | "commission_business_rate"
  | "commission_driver_rate"
  | "commission_vat_rate"
  | "transport_vat_rate"
>;

export interface MonthCount {
  /** Paris year-month key, "2026-08". */
  key: string;
  trips: number;
  /** True for the month we are still inside — it cannot be compared to a whole one. */
  partial: boolean;
  /**
   * ⚑ True for a month that HAS NOT HAPPENED YET, which is a real state on this
   * chart and was the source of a lie on the founder's home screen. The bars are
   * keyed on `pickup_at`, so a trip booked for September raises a September bar
   * in August — and `partial` only ever marked the CURRENT month, so September
   * looked finished and the sentence underneath read "5 trips last month, down
   * from 147". September had not happened.
   */
  future: boolean;
}

export interface HomeNumbers {
  /** Trips whose fate is decided: taken, or ended without a Driver. */
  settled: number;
  /** Of those, the ones a Driver took. */
  filled: number;
  /** filled/settled as a percentage — NULL until MIN_FOR_RATE, never rounded to 0. */
  fillRate: number | null;
  /** Trips that actually ran. The denominator of every money figure. */
  completed: number;
  /** What Businesses paid, all in (course × 1,15 summed). */
  businessesPaid: number;
  /** What Drivers banked (course × 0,88 summed). */
  driversBanked: number;
  /** What Kavenue kept, HT — both sides' fee, excluding the VAT it collects. */
  kavenueKept: number;
  /** Kavenue's HT fee as a percentage of what Businesses paid. NULL under MIN_FOR_RATE. */
  takeRate: number | null;
  /** Median hours from posting to a Driver taking it. NULL under MIN_FOR_MEDIAN. */
  medianHoursToFill: number | null;
  /**
   * What a Driver typically took a trip for, as a share of its Ceiling. NULL
   * under MIN_FOR_MEDIAN.
   *
   * ⚑ THE ONE NUMBER THAT SAYS WHETHER THE CURVE IS WORKING, and no row shows
   * it: a trip's own page shows its fare and its Ceiling, but nobody can hold
   * three hundred of those in their head. A median, not a mean — one 199 € trip
   * taken at the Ceiling should not move it.
   */
  takenAtPctOfCeiling: number | null;
  /** Trips a Driver took and that then ended cancelled. */
  fellThrough: number;
  /** Of the trips a Driver took. NULL under MIN_FOR_RATE. */
  fellThroughRate: number | null;
  /** Every month that has a trip, oldest first. */
  months: MonthCount[];
}

/** The middle value. Even-length falls to the lower of the two — no invented number. */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** "2026-08" for a timestamp, in Paris — the same key `formatMonth` renders. */
const monthKeyOf = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
});
function monthKey(iso: string): string {
  return monthKeyOf.format(new Date(iso)).slice(0, 7);
}

/**
 * The band, from mission rows. Pure — `now` is passed so the partial month is
 * decided by the caller and a test can pin it.
 *
 * ⚑ STILL-POOLED FUTURE TRIPS ARE NOT FAILURES, so they are out of the fill-rate
 * denominator entirely. Counting them would make every fresh morning look broken:
 * a trip posted an hour ago has not failed to find a Driver, it is still looking.
 */
export function homeNumbers(rows: NumbersRow[], now: Date): HomeNumbers {
  const settledRows = rows.filter(
    (m) => m.accepted_at != null || m.status === "expired" || m.status === "cancelled",
  );
  const filledRows = settledRows.filter((m) => m.accepted_at != null);
  const completedRows = rows.filter((m) => m.status === "completed");

  let businessesPaid = 0;
  let driversBanked = 0;
  let kavenueKept = 0;
  for (const m of completedRows) {
    // ⚑ The rates FROZEN on the trip, never today's card — otherwise history
    // rewrites itself the day pricing changes. splitFor reads the snapshot.
    const s = splitFor(m, Number(m.accepted_fare ?? 0));
    businessesPaid += s.businessTotal;
    driversBanked += s.driverNet;
    kavenueKept += s.businessFeeHt + s.driverFeeHt;
  }

  const hours = filledRows
    .map(
      (m) =>
        (new Date(m.accepted_at as string).getTime() - new Date(m.created_at).getTime()) / 3_600_000,
    )
    .filter((h) => h >= 0);

  const tally = new Map<string, number>();
  for (const m of rows) tally.set(monthKey(m.pickup_at), (tally.get(monthKey(m.pickup_at)) ?? 0) + 1);
  const thisMonth = monthKey(now.toISOString());

  // ⚑ `accepted_fare` IS nullable and `ceiling` is NOT — `mission.ceiling` is
  // `numeric not null` in the schema, so a guard against a null Ceiling would be
  // a branch nothing reaches, which is the family of bug this project keeps
  // finding (D86-D92). What CAN happen is zero, and dividing by it is the actual
  // hazard. A trip without a fare is not a 100 % — it is one this question
  // cannot be asked about, and dropping it is the difference between a median
  // and an invention ([[d88]]).
  const ratios = filledRows
    .filter((m) => m.accepted_fare != null && m.ceiling > 0)
    .map((m) => (m.accepted_fare! / m.ceiling) * 100)
    .sort((a, b) => a - b);
  const takenAtPctOfCeiling = ratios.length >= MIN_FOR_MEDIAN ? median(ratios) : null;

  // Taken by a Driver, and then cancelled anyway. The Driver-side failure the
  // fill rate cannot see: from a Business's chair the trip WAS filled.
  const fellThroughRows = filledRows.filter((m) => m.status === "cancelled");

  return {
    settled: settledRows.length,
    filled: filledRows.length,
    takenAtPctOfCeiling,
    fellThrough: fellThroughRows.length,
    fellThroughRate:
      filledRows.length >= MIN_FOR_RATE
        ? (fellThroughRows.length / filledRows.length) * 100
        : null,
    fillRate:
      settledRows.length >= MIN_FOR_RATE
        ? (filledRows.length / settledRows.length) * 100
        : null,
    completed: completedRows.length,
    businessesPaid: round2(businessesPaid),
    driversBanked: round2(driversBanked),
    kavenueKept: round2(kavenueKept),
    takeRate:
      completedRows.length >= MIN_FOR_RATE && businessesPaid > 0
        ? (kavenueKept / businessesPaid) * 100
        : null,
    medianHoursToFill: hours.length >= MIN_FOR_MEDIAN ? median(hours) : null,
    months: [...tally.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      // A string compare is enough: the keys are "YYYY-MM", so lexical order IS
      // chronological order.
      .map(([key, trips]) => ({
        key,
        trips,
        partial: key === thisMonth,
        future: key > thisMonth,
      })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The band's one sentence about the months, or null when there is nothing
 * honest to say. Comparing a month we are still inside to a whole one is the
 * lie this exists to prevent — so the partial month names its own incompleteness
 * rather than being drawn as growth.
 */
export function monthsNote(months: MonthCount[], now: Date): string | null {
  // ⚑ THE COMPARISON IGNORES MONTHS THAT HAVE NOT HAPPENED. Comparing against a
  // month still in the future is not a small inaccuracy — it inverts the
  // sentence. The home screen read "5 trips last month, down from 147" on
  // 30 August, describing September.
  const happened = months.filter((m) => !m.future);
  const ahead = months.filter((m) => m.future).reduce((a, m) => a + m.trips, 0);

  // What is already on the books for later — worth saying on a booking
  // marketplace, and the only honest thing to say about a future month.
  const booked =
    ahead > 0 ? ` ${ahead} ${ahead === 1 ? "trip is" : "trips are"} already booked ahead.` : "";

  if (happened.length < 2) return booked.trim() || null;

  const last = happened[happened.length - 1];
  const prev = happened[happened.length - 2];
  if (!last.partial) {
    const verb = last.trips >= prev.trips ? "up from" : "down from";
    return `${last.trips} trips last month, ${verb} ${prev.trips} the month before.${booked}`;
  }
  const daysLeft = daysRemainingIn(now);
  const tail =
    daysLeft > 0
      ? ` with ${daysLeft} ${daysLeft === 1 ? "day" : "days"} still to run`
      : "";
  return `${last.trips} this month already${tail} — the whole of last month was ${prev.trips}.${booked}`;
}

/** Whole days left in the current Paris month, today excluded. */
function daysRemainingIn(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.max(0, inMonth - d);
}

/**
 * The quiet line under the four numbers, or null when neither half can be said.
 *
 * ⚑ A SENTENCE, NOT TWO MORE CARDS. The band was signed off at four figures and
 * six would crowd it; these two are secondary — worth knowing, not worth
 * shouting. The founder's calibration from S69 was *"it's overwhelming"*, fixed
 * by fewer words on screen at once rather than less information.
 *
 * ⚑ AND EACH HALF DISAPPEARS ON ITS OWN when its sample is too thin, rather than
 * the line rendering with a hole in it.
 */
export function curveNote(n: HomeNumbers): string | null {
  const parts: string[] = [];

  if (n.takenAtPctOfCeiling != null) {
    parts.push(
      `Drivers took them at ${Math.round(n.takenAtPctOfCeiling)} % of the Ceiling, typically`,
    );
  }

  if (n.fellThrough > 0) {
    // ⚑ Always "a of b" — the count on its own invites the reader to guess the
    // denominator, and on this one they would guess "of all trips" rather than
    // "of the trips a Driver had already taken", which is a much smaller number
    // and a much worse-sounding one.
    parts.push(
      `${n.fellThrough} of the ${n.filled} a Driver took fell through afterwards`,
    );
  }

  return parts.length ? `${parts.join(". ")}.` : null;
}
