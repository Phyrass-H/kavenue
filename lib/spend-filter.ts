// Spend URL state — History's filter vocabulary, plus what a spend page adds.
//
// ⚑ Deliberately built ON TOP of lib/history-filter.ts rather than beside it.
// The two screens read the same archive, so a second filter vocabulary would
// eventually disagree with the first, and then "Export CSV" stops meaning
// "exactly what's on screen". parseSpendQuery calls parseHistoryQuery first and
// only adds the three params History has no use for.
//
// Two differences from History, both on purpose:
//  1. Spend ALWAYS has a period (default: this month). A spend total with no
//     period is meaningless, and the comparison needs a span to compare against.
//  2. It carries `cmp` — what "vs" means — which History has no concept of.
import {
  historyHref,
  parseHistoryQuery,
  type HistoryQuery,
} from "@/lib/history-filter";
import { parseAnchor, parseDayParam, periodRange, todayAnchor } from "@/lib/earnings";
import { parisDayKey } from "@/lib/dispatch-status";
import { DIMS, type Dim } from "@/lib/spend";

export const CMPS = ["prev", "year", "none"] as const;
export type Cmp = (typeof CMPS)[number];

export const CMP_LABEL: Record<Cmp, string> = {
  prev: "vs previous period",
  year: "vs same period last year",
  none: "No comparison",
};

/**
 * The money lenses. NOT outcomes — History's four-token `filter` vocabulary
 * (all/completed/unfilled/cancelled) stays exactly as it is; these narrow the
 * trip list by which COMPONENT of the bill a row belongs to.
 */
export const LENSES = ["waiting", "noshow", "cancelled", "unsettled", "unfilled"] as const;
export type Lens = (typeof LENSES)[number];

export const LENS_LABEL: Record<Lens, string> = {
  waiting: "waiting charges",
  noshow: "no-shows",
  cancelled: "cancellation fees",
  unsettled: "trips not settled",
  unfilled: "missions nobody took",
};

export interface SpendQuery extends HistoryQuery {
  cmp: Cmp;
  dim: Dim;
  lens: Lens | null;
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseSpendQuery(
  sp: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): SpendQuery {
  const base = parseHistoryQuery(sp);

  // History's default is "any date"; ours is this month. Only fall back when the
  // URL genuinely says nothing — a real ?p= is honoured as parsed.
  if (base.period === null) {
    const a = todayAnchor(now);
    base.period = "month";
    base.anchor = `${a.y}-${String(a.m).padStart(2, "0")}-01`;
    const r = periodRange("month", a, now);
    base.from = r.fromDay;
    base.to = r.toDay;
  }

  const cmpRaw = one(sp.cmp);
  const dimRaw = one(sp.dim);
  const lensRaw = one(sp.lens);

  return {
    ...base,
    cmp: (CMPS as readonly string[]).includes(cmpRaw ?? "") ? (cmpRaw as Cmp) : "prev",
    dim: (DIMS as readonly string[]).includes(dimRaw ?? "") ? (dimRaw as Dim) : "type",
    lens: (LENSES as readonly string[]).includes(lensRaw ?? "") ? (lensRaw as Lens) : null,
  };
}

/**
 * Rebuild the query string. Defaults are dropped so a clean view is a clean URL.
 * Returns "?a=b" or "" — the caller prefixes the path, exactly like historyHref.
 */
export function spendHref(q: SpendQuery, patch: Partial<SpendQuery> = {}): string {
  const next = { ...q, ...patch };
  const base = historyHref(next);
  const extra: string[] = [];
  if (next.cmp !== "prev") extra.push(`cmp=${next.cmp}`);
  if (next.dim !== "type") extra.push(`dim=${next.dim}`);
  if (next.lens) extra.push(`lens=${next.lens}`);
  if (extra.length === 0) return base;
  return base ? `${base}&${extra.join("&")}` : `?${extra.join("&")}`;
}

export interface Span {
  fromDay: string;
  toDay: string;
  label: string;
  /** True when the period contains today, so it holds only the days so far. */
  partial?: boolean;
  /** Inclusive day count — what the comparison must be truncated to match. */
  days: number;
}

const DAY_MS = 86_400_000;
function dayCount(fromDay: string, toDay: string): number {
  const [ay, am, ad] = fromDay.split("-").map(Number);
  const [by, bm, bd] = toDay.split("-").map(Number);
  return Math.max(1, (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS + 1);
}
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const SPAN_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
function spanLabel(fromDay: string, toDay: string): string {
  const [ay, am, ad] = fromDay.split("-").map(Number);
  const [by, bm, bd] = toDay.split("-").map(Number);
  const a = SPAN_LABEL.format(Date.UTC(ay, am - 1, ad));
  if (fromDay === toDay) return a;
  return `${a} – ${SPAN_LABEL.format(Date.UTC(by, bm - 1, bd))}`;
}

/**
 * The applied period, as inclusive Paris day keys.
 *
 * ⚑ CLAMPED TO TODAY. The mission query only ever returns past trips, so the
 * current month holds the days that have happened — but periodRange returns the
 * whole calendar month. Measuring 8 days of August against all 31 of July
 * produced a −77 % drop painted GREEN on the default landing view, every month,
 * for every Business. The span now ends today, and comparisonSpan truncates the
 * previous period to the same number of days so the two are comparable.
 */
export function currentSpan(q: SpendQuery, now: Date = new Date()): Span {
  const r = periodRange(
    q.period ?? "month",
    parseAnchor(q.anchor ?? q.from ?? undefined),
    now,
    q.period === "range" && q.from && q.to ? { from: q.from, to: q.to } : null,
  );
  const today = parisDayKey(now);
  const partial = today >= r.fromDay && today < r.toDay;
  const toDay = partial ? today : r.toDay;
  return {
    fromDay: r.fromDay,
    toDay,
    label: r.label,
    partial,
    days: dayCount(r.fromDay, toDay),
  };
}

/**
 * The span to compare against, or null when comparison is off.
 *
 * ⚑ For a custom range, "the period before" is the span of the SAME LENGTH
 * ending the day before this one starts — periodRange already computes that
 * (prevCustom), because comparing 46 days against a calendar month would lie.
 */
export function comparisonSpan(q: SpendQuery, now: Date = new Date()): Span | null {
  if (q.cmp === "none") return null;
  const period = q.period ?? "month";
  const anchor = parseAnchor(q.anchor ?? q.from ?? undefined);
  const custom = period === "range" && q.from && q.to ? { from: q.from, to: q.to } : null;
  const r = periodRange(period, anchor, now, custom);
  const here = currentSpan(q, now);

  let from: string;
  let to: string;
  let label: string;

  if (period === "range") {
    const c = q.cmp === "year" ? r.lastYearCustom : r.prevCustom;
    if (!c) return null;
    const back = periodRange("range", anchor, now, c);
    from = back.fromDay;
    to = back.toDay;
    label = back.label;
  } else {
    const anchorIso = q.cmp === "year" ? r.lastYear : r.prev;
    const back = periodRange(period, parseAnchor(anchorIso), now);
    from = back.fromDay;
    to = back.toDay;
    label = back.label;
  }

  // Same number of days on both sides. A part-finished month compared with a
  // whole one is not a comparison, it is a subtraction dressed as one.
  if (here.partial) {
    to = addDays(from, here.days - 1);
    label = spanLabel(from, to);
  }

  return { fromDay: from, toDay: to, label, days: dayCount(from, to) };
}

/**
 * A span that is ONE day, and that day is today — so it holds only the hours so
 * far.
 *
 * Every other running period is compared against a previous period truncated to
 * the same number of days, which makes the two like-for-like. A day has no
 * smaller unit here to truncate to, so today-so-far is measured against a WHOLE
 * previous day: at 09:00 that is three hours against twenty-four, and the page
 * would paint the shortfall GREEN — the same "the period isn't over" trap the
 * month comparison was fixed for.
 *
 * The figure is still worth showing: yesterday's total reads as a target for
 * today. So the answer is not to hide it but to stop scoring it — the caller
 * shows it neutral, as something to reach, rather than as a win or a loss.
 */
export function isRunningDay(span: Span, now: Date = new Date()): boolean {
  return span.days === 1 && span.toDay === parisDayKey(now);
}

/**
 * The same query, re-pointed at another span. Used to run applyHistoryQuery a
 * second time for the comparison period, so every other filter (search, class,
 * Driver, outcome) applies identically on both sides of a "vs" figure.
 */
export function queryForSpan(q: SpendQuery, span: Span): SpendQuery {
  return {
    ...q,
    period: "range",
    anchor: null,
    from: parseDayParam(span.fromDay) ?? span.fromDay,
    to: parseDayParam(span.toDay) ?? span.toDay,
  };
}
