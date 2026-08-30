// Spend — what a Business paid, and what it got for it.
//
// The mirror image of lib/earnings.ts. The Driver asks "what did I make"; the
// Business asks "where did the money go and what do I do about it". Same maths,
// opposite question — which is why this file computes on top of the SAME
// primitives (settledFare, historyFare) rather than inventing a second rule.
//
// Three rules it exists to hold:
//  1. `settledFare` (frozen at accept), never `currentFare`. A completed trip
//     whose fare still climbs would inflate every total (the S48b money bug).
//  2. A past trip a Driver took and never closed is **agreed, not settled** —
//     shown as its own line, excluded from every total (§ Q). historyFare
//     already returns `counted: false` for exactly this; we honour it.
//  3. **Waiting is part of the bill.** A hotel's real cost is fare + waiting,
//     so rowCost() adds the settled waiting_fee. History's summary uses the same
//     helper, so the two screens can never disagree about the same filter.
import { isExpired } from "@/lib/dispatch-status";
import { settledFare } from "@/lib/pdp";
import { businessCost, carriesCommission, commissionSplit, businessSplitFor } from "@/lib/commission";
import { formatMoney, serviceClassLabel, shortPlaceLabel } from "@/lib/format";
import type { HistoryRow } from "@/lib/history-filter";
import type { MissionRow } from "@/lib/database.types";

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : Number(v) || 0;
}

/**
 * What one past trip actually cost the Business, waiting included.
 *
 * ⚑ PostgREST returns Postgres `numeric` as a STRING — waiting_fee and
 * cancellation_fee arrive as text and would concatenate if summed raw. num()
 * coerces. Anything not settled contributes zero, deliberately.
 */
export function rowCost(r: HistoryRow): number {
  if (!r.counted) return 0;
  // ⚑ ALL IN, since 2026-08-17. What leaves a Business's account is the fare
  // plus Kavenue's service fee and its VAT (docs/06 §1, §3) — so every total on
  // Spend and History moved by ~15% the day commission shipped, deliberately.
  // Missions priced before it carry no rates and pass straight through, which
  // is why the archive did not retroactively grow a fee it never billed.
  return businessCost(r.mission, (r.fare ?? 0) + num(r.mission.waiting_fee));
}

// ------------------------------------------------------------------ the totals
export interface SpendTotals {
  /** Everything settled, ALL IN — transport + service fee + its VAT. */
  total: number;
  /**
   * The same money as the three invoice lines (docs/06 §3). They add to `total`
   * exactly, because each row's triple reconciles before it is summed.
   *
   * `transport` is the transport line — and is itself `fares + noShow + waiting
   * + cancelFees`, which is why those four keep their old meaning. Only the fee
   * lines are new. The split matters because a Business reclaims the 20% VAT on
   * Kavenue's fee and nothing on the transport, so a single total cannot tell
   * them what they can claim back.
   */
  transport: number;
  serviceFee: number;
  serviceFeeVat: number;
  /** Missions in the period, whatever became of them. */
  ordered: number;

  fares: number;
  fareCount: number;
  waiting: number;
  waitingMinutes: number;
  waitingCount: number;
  /** The slice of `waiting` that sits on trips that actually RAN. */
  tripWaiting: number;
  cancelFees: number;
  cancelCount: number;
  noShow: number;
  noShowCount: number;

  /**
   * ⚑ THE ALL-IN TWINS of `cancelFees` / `noShow` / `waiting`, for the waste panel
   * only. Those three are Course-basis on purpose — with the two fee lines they
   * decompose the invoice exactly (docs/06 §3) — but the waste panel has no fee
   * line beside them, so it was calling a Course-basis sum "17,8 % of what you
   * spent" against an all-in total. Two bases in one ratio. Same money, the
   * Business's side of it.
   */
  cancelFeesAllIn: number;
  noShowAllIn: number;
  waitingAllIn: number;

  /** Excluded from `total`, never hidden: a Driver took it and never closed it. */
  unsettled: number;
  unsettledCount: number;
  /** Excluded: nobody ever held it, so it cost nothing. */
  unfilledCount: number;
  /** The Ceiling on those unfilled missions — authorised, never spent. */
  unfilledCeiling: number;

  /** Trips that ran (completed, no-shows included — the Guest was still billed). */
  trips: number;
  /** What those trips cost ALL IN — the numerator behind `costPerTrip`. */
  tripCost: number;
  costPerTrip: number | null;
  /** Missions that found a Driver ÷ missions ordered. */
  fillRate: number | null;
  /** Median minutes from entering the Pool to a Driver accepting. */
  medianToAccept: number | null;
  filledCount: number;
}

const EMPTY: SpendTotals = {
  total: 0,
  transport: 0,
  serviceFee: 0,
  serviceFeeVat: 0,
  ordered: 0,
  fares: 0,
  fareCount: 0,
  waiting: 0,
  waitingMinutes: 0,
  waitingCount: 0,
  tripWaiting: 0,
  cancelFees: 0,
  cancelCount: 0,
  noShow: 0,
  noShowCount: 0,
  cancelFeesAllIn: 0,
  noShowAllIn: 0,
  waitingAllIn: 0,
  unsettled: 0,
  unsettledCount: 0,
  unfilledCount: 0,
  unfilledCeiling: 0,
  trips: 0,
  tripCost: 0,
  costPerTrip: null,
  fillRate: null,
  medianToAccept: null,
  filledCount: 0,
};

/** Minutes from entering the Pool to acceptance, or null if it never filled. */
export function minutesToAccept(m: MissionRow): number | null {
  if (!m.accepted_at) return null;
  const start = new Date(m.pooled_at ?? m.created_at).getTime();
  const took = (new Date(m.accepted_at).getTime() - start) / 60_000;
  return Number.isFinite(took) && took >= 0 ? took : null;
}

export function spendTotals(rows: HistoryRow[]): SpendTotals {
  const t = { ...EMPTY };
  const accepts: number[] = [];

  for (const r of rows) {
    const m = r.mission;
    t.ordered += 1;

    if (m.accepted_at) {
      t.filledCount += 1;
      const took = minutesToAccept(m);
      if (took != null) accepts.push(took);
    }

    if (isExpired(m)) {
      t.unfilledCount += 1;
      // ALL IN — a Ceiling shown to a Business is always its own side of it.
      t.unfilledCeiling += businessCost(m, num(m.ceiling));
      continue;
    }

    if (!r.counted) {
      // § Q — agreed, not settled. Its own line; out of every total.
      //
      // ⚑ Waiting counts here too. It settles at BOARDING (`board_guest`), so an
      // unclosed trip can carry a real, already-owed waiting fee — and summing
      // only the fare dropped it out of every figure on the page INCLUDING this
      // one, so the money existed nowhere. No live row carries one today, which
      // is exactly why it was worth fixing before one does.
      // ALL IN — this is money the Business will owe once the trip closes, and it
      // sits beside a total that already includes the fee. The four transport
      // components below stay Course-basis on purpose (they decompose the invoice
      // with the two fee lines, docs/06 §3); this one has no fee line beside it.
      t.unsettled += businessCost(m, settledFare(m) + num(m.waiting_fee));
      t.unsettledCount += 1;
      continue;
    }

    const waiting = num(m.waiting_fee);
    if (waiting > 0) {
      t.waiting += waiting;
      t.waitingAllIn += businessCost(m, waiting);
      t.waitingMinutes += m.waiting_minutes ?? 0;
      t.waitingCount += 1;
    }

    // The invoice lines, accumulated per row so each triple reconciles before
    // it is summed — docs/06 §3. `rowCost` is the same money, one number.
    const costBase = (r.fare ?? 0) + waiting;
    const split = carriesCommission(m) ? businessSplitFor(m, costBase) : commissionSplit(costBase, null);
    t.transport += split.course;
    t.serviceFee += split.businessFeeHt;
    t.serviceFeeVat += split.businessFeeVat;

    if (m.status === "cancelled") {
      const fee = num(m.cancellation_fee);
      if (fee > 0 || m.cancellation_fee != null) {
        t.cancelFees += fee;
        t.cancelFeesAllIn += businessCost(m, fee);
        t.cancelCount += 1;
      }
      continue;
    }

    if (m.status === "completed") {
      // ⚑ Only waiting on a trip that ran belongs in cost-per-trip. `t.waiting`
      // also holds waiting settled onto a CANCELLED mission (business_cancel
      // settles it), and dividing that by a completed-trip count charged the
      // trips that happened for time spent on one that didn't.
      t.tripWaiting += waiting;
      const fare = settledFare(m);
      // ALL IN, per row, so "Cost per trip" is on the same basis as the Total
      // spend it sits next to. Summing the Course-basis buckets understated it
      // by the whole service fee.
      t.tripCost += businessCost(m, fare + waiting);
      if (m.no_show) {
        t.noShow += fare;
        t.noShowAllIn += businessCost(m, fare);
        t.noShowCount += 1;
      } else {
        t.fares += fare;
        t.fareCount += 1;
      }
    }
  }

  // ⚑ ALL IN since 2026-08-17 — what actually left the account. The four
  // buckets above still decompose the TRANSPORT line only, and
  // `transport === fares + noShow + waiting + cancelFees` holds.
  t.total = t.transport + t.serviceFee + t.serviceFeeVat;
  t.trips = t.fareCount + t.noShowCount;
  t.costPerTrip = t.trips > 0 ? t.tripCost / t.trips : null;
  t.fillRate = t.ordered > 0 ? (t.filledCount / t.ordered) * 100 : null;

  if (accepts.length > 0) {
    accepts.sort((a, b) => a - b);
    const mid = Math.floor(accepts.length / 2);
    t.medianToAccept =
      accepts.length % 2 === 1 ? accepts[mid] : (accepts[mid - 1] + accepts[mid]) / 2;
  }

  return t;
}

// -------------------------------------------------------------- the breakdowns
export const DIMS = ["type", "class", "route", "driver", "desk"] as const;
export type Dim = (typeof DIMS)[number];

export const DIM_LABEL: Record<Dim, string> = {
  type: "Type",
  class: "Class",
  route: "Route",
  driver: "Driver",
  desk: "Desk",
};

export interface BreakdownRow {
  key: string;
  label: string;
  trips: number;
  amount: number;
  share: number;
  /** Only set for dimensions a click can filter the page by. */
  driverId?: string | null;
  /** True for the rolled-up remainder, which is styled quietly and can't filter. */
  other?: boolean;
}

/** Top rows by spend, with everything past `top` rolled into one "Other". */
export function breakdown(
  rows: HistoryRow[],
  dim: Dim,
  dispatcherName: Map<string, string>,
  top = 8,
): BreakdownRow[] {
  const acc = new Map<string, { label: string; trips: number; amount: number; driverId?: string }>();

  for (const r of rows) {
    const m = r.mission;
    let key: string | null = null;
    let label = "";
    let driverId: string | undefined;

    if (dim === "type") {
      key = m.luggage_only ? "luggage" : "transfer";
      label = m.luggage_only ? "Luggage run" : "Transfer";
    } else if (dim === "class") {
      label = serviceClassLabel(m.category, m.required_body_type);
      key = label;
    } else if (dim === "route") {
      const a = shortPlaceLabel(m.pickup_address);
      const b = shortPlaceLabel(m.dropoff_address) || "—";
      label = `${a} → ${b}`;
      key = label.toLowerCase();
    } else if (dim === "driver") {
      if (!r.driverId) continue; // nobody drove it — it belongs to no Driver
      key = r.driverId;
      label = r.driverName ?? "Driver";
      driverId = r.driverId;
    } else {
      if (!m.dispatcher_id) continue;
      key = m.dispatcher_id;
      label = dispatcherName.get(m.dispatcher_id) ?? "Your desk";
    }

    if (!key) continue;
    // ⚑ Only trips that actually cost something. This panel sits beside a euro
    // column, so counting the unfilled and the unclosed here reads "9 trips ·
    // 0,00 €" — a trip count that doesn't belong to the money next to it.
    //
    // ⚑ `counted` alone is NOT enough: historyFare returns `{ fare: null,
    // counted: true }` for an expired mission, because an unfilled trip is a
    // real, correctly-zero contribution to a TOTAL. It is not a trip anyone
    // drove, so it has no place in a ranking of where the money went.
    if (!r.counted || isExpired(m)) continue;
    const cur = acc.get(key) ?? { label, trips: 0, amount: 0, driverId };
    cur.trips += 1;
    cur.amount += rowCost(r);
    acc.set(key, cur);
  }

  const all = [...acc.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.amount - a.amount || b.trips - a.trips);

  const grand = all.reduce((s, x) => s + x.amount, 0);
  const pct = (n: number) => (grand > 0 ? (n / grand) * 100 : 0);

  if (all.length <= top) {
    return all.map((x) => ({
      key: x.key,
      label: x.label,
      trips: x.trips,
      amount: x.amount,
      share: pct(x.amount),
      driverId: x.driverId ?? null,
    }));
  }

  const head = all.slice(0, top);
  const tail = all.slice(top);
  const rest = tail.reduce(
    (s, x) => ({ trips: s.trips + x.trips, amount: s.amount + x.amount }),
    { trips: 0, amount: 0 },
  );
  return [
    ...head.map((x) => ({
      key: x.key,
      label: x.label,
      trips: x.trips,
      amount: x.amount,
      share: pct(x.amount),
      driverId: x.driverId ?? null,
    })),
    {
      key: "__other",
      label: `Other (${tail.length})`,
      trips: rest.trips,
      amount: rest.amount,
      share: pct(rest.amount),
      other: true,
    },
  ];
}

// ------------------------------------------------------------- the time series
export type Bucket = "day" | "week" | "month";

export interface SeriesPoint {
  /** Inclusive Paris day key the bucket starts on — also the click target. */
  key: string;
  /** The short axis tick: "9", "9 Jul", "Jul". */
  label: string;
  /** The whole thing, for a tooltip: "Thursday 9 July", "9–15 July", "July 2026". */
  full: string;
  amount: number;
  trips: number;
}

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayOf(iso: string): string {
  return PARIS_DAY.format(new Date(iso));
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Monday of the ISO week the day falls in. */
function weekStart(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const idx = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(key, -idx);
}

/** How many days a span covers, decides day/week/month buckets. */
export function autoBucket(fromDay: string, toDay: string): Bucket {
  const [ay, am, ad] = fromDay.split("-").map(Number);
  const [by, bm, bd] = toDay.split("-").map(Number);
  const days =
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000 + 1;
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

const D_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const FULL_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const FULL_DM = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const FULL_MY = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const DM_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const M_LABEL = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

function labelFor(key: string, bucket: Bucket): string {
  const [y, m, d] = key.split("-").map(Number);
  const at = Date.UTC(y, m - 1, d);
  if (bucket === "day") return D_LABEL.format(at);
  if (bucket === "week") return DM_LABEL.format(at);
  return M_LABEL.format(at);
}

/** The spelled-out bucket, for a tooltip that has room to be unambiguous. */
function fullLabel(key: string, bucket: Bucket): string {
  const [y, m, d] = key.split("-").map(Number);
  const at = Date.UTC(y, m - 1, d);
  if (bucket === "day") return FULL_DAY.format(at);
  if (bucket === "month") return FULL_MY.format(at);
  const end = new Date(at + 6 * 86_400_000);
  return `${FULL_DM.format(at)} – ${FULL_DM.format(end)}`;
}

/**
 * Every bucket in the span, including the empty ones — a spend chart that skips
 * quiet days would read as a busy month.
 */
export function series(
  rows: HistoryRow[],
  fromDay: string,
  toDay: string,
  bucket: Bucket,
): SeriesPoint[] {
  const startOf = (day: string) =>
    bucket === "day" ? day : bucket === "week" ? weekStart(day) : `${day.slice(0, 7)}-01`;

  const points = new Map<string, SeriesPoint>();
  let cursor = startOf(fromDay);
  // Hard stop: a hand-edited URL could produce an absurd span, and an unbounded
  // while-loop on a server render is not a thing worth risking.
  for (let i = 0; i < 400 && cursor <= toDay; i += 1) {
    points.set(cursor, {
      key: cursor,
      label: labelFor(cursor, bucket),
      full: fullLabel(cursor, bucket),
      amount: 0,
      trips: 0,
    });
    cursor =
      bucket === "day"
        ? addDays(cursor, 1)
        : bucket === "week"
          ? addDays(cursor, 7)
          : (() => {
              const [y, m] = cursor.split("-").map(Number);
              return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
            })();
  }

  for (const r of rows) {
    const p = points.get(startOf(dayOf(r.mission.pickup_at)));
    if (!p) continue;
    p.amount += rowCost(r);
    // ⚑ The same population the hero counts. `counted` is true for an unfilled
    // and for a cancelled mission (both are correctly-zero contributions to a
    // TOTAL), so counting it here made a tooltip say "2 trips" on a day nobody
    // drove — and clicking that column landed on a page saying "1 trip".
    if (r.counted && !isExpired(r.mission) && r.mission.status === "completed") p.trips += 1;
  }

  return [...points.values()];
}

// ----------------------------------------------------------------- the leaking
export interface WasteLine {
  key: string;
  label: string;
  detail: string;
  amount: number | null;
  count: number;
}

/** What cost money and could have gone differently. Order is worst-first. */
export function wasteLines(t: SpendTotals): WasteLine[] {
  return [
    {
      key: "cancelled",
      label: "Cancellation fees",
      detail:
        t.cancelCount > 0
          ? `${t.cancelCount} cancelled${t.cancelFees > 0 ? " after a Driver took them" : " — no fee applied"}`
          : "none this period",
      amount: t.cancelFeesAllIn,
      count: t.cancelCount,
    },
    {
      key: "noshow",
      label: "No-show charges",
      detail:
        t.noShowCount > 0
          ? `${t.noShowCount} Guest${t.noShowCount === 1 ? "" : "s"} never came down`
          : "none this period",
      amount: t.noShowAllIn,
      count: t.noShowCount,
    },
    {
      key: "waiting",
      label: "Waiting beyond the courtesy wait",
      detail:
        t.waitingCount > 0
          ? `${t.waitingCount} trip${t.waitingCount === 1 ? "" : "s"} · ${Math.round(t.waitingMinutes)} min`
          : "none this period",
      amount: t.waitingAllIn,
      count: t.waitingCount,
    },
    {
      key: "unfilled",
      label: "Unfilled",
      detail:
        t.unfilledCount > 0
          ? `${t.unfilledCount} mission${t.unfilledCount === 1 ? "" : "s"} nobody took · ${formatMoney(t.unfilledCeiling)} of Ceiling never spent`
          : "none this period",
      amount: null,
      count: t.unfilledCount,
    },
  ];
}

/** The avoidable slice — everything in the waste panel that actually cost money. */
export function avoidable(t: SpendTotals): number {
  // ALL IN — it is divided by `total`, which is all-in, to make "x % of what you
  // spent". A Course-basis numerator understated that share by the whole fee.
  return t.cancelFeesAllIn + t.noShowAllIn + t.waitingAllIn;
}
