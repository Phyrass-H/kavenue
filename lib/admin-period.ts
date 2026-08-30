// The period the Activity Console is looking at.
//
// ⚑ ALL TIME IS THE DEFAULT, AND THAT IS THE FOUNDER'S RULE (S71): *"the database
// has to give 100 % of all time infos, that is why we need to break it into
// periods — the analyses are not only in the last few months but from day one."*
// So a period NARROWS an answer that is complete by default; it never stands in
// for one. `null` means all time, and every screen opens there.
//
// ⚑ AND IT IS THE APP'S OWN PICKER, NOT A SECOND ONE. `Period`, `periodRange`
// and the ‹ › stepping come from lib/earnings.ts — the same model behind Dispatch
// History and the Driver's Earnings screen ([[d64]]). A console that invented its
// own "last 30 days" would be a fourth spelling of the same idea and the one that
// disagreed with the others about what "July" means.
import { isPeriod, parseAnchor, periodRange, type Period } from "@/lib/earnings";

/**
 * Today, as a Paris day key.
 *
 * ⚑ PARIS, NOT THE BROWSER'S ZONE AND NOT UTC. Every other date on this console
 * is a Paris day — the month bands, the period boundaries, `daysRemainingIn`. A
 * calendar that marked "today" from the viewer's clock would disagree with the
 * screen around it for two hours every night.
 */
function parisDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** What the console is showing, and what it says it is showing. */
export interface AdminPeriod {
  /** Null = all time, which is the default and always one click away. */
  period: Period | null;
  anchor: string | null;
  /** Inclusive start / exclusive end as ISO instants — null when all time. */
  fromIso: string | null;
  toIso: string | null;
  /**
   * The same span as inclusive Paris day keys, which is what the calendar bands
   * and what a `range` URL carries. Empty strings on All time — the calendar
   * reads them as "nothing selected", not as a zero-length span.
   */
  fromDay: string;
  toDay: string;
  /** Today in Paris, so the calendar can mark it without asking the browser. */
  today: string;
  /** "All time" or "July 2026" — always rendered, never implied. */
  label: string;
  /** Anchors for the ‹ › steps. Null when there is nothing to step through. */
  prev: string | null;
  next: string | null;
  /** True when the period already contains today, so › would be a no-op. */
  isCurrent: boolean;
}

export interface PeriodParams {
  period?: string;
  anchor?: string;
  from?: string;
  to?: string;
}

/**
 * Read the period off the URL.
 *
 * ⚑ AN UNRECOGNISED VALUE FALLS BACK TO ALL TIME, never to "this month". A
 * typo'd link must not silently answer a narrower question than it looks like
 * it is asking — the wrong answer would be a smaller, plausible number.
 */
export function parseAdminPeriod(sp: PeriodParams, now: Date = new Date()): AdminPeriod {
  const raw = sp.period;
  if (!raw || raw === "all" || !isPeriod(raw)) {
    return {
      period: null,
      anchor: null,
      fromIso: null,
      toIso: null,
      fromDay: "",
      toDay: "",
      today: parisDay(now),
      label: "All time",
      prev: null,
      next: null,
      isCurrent: true,
    };
  }

  const r = periodRange(
    raw,
    parseAnchor(sp.anchor),
    now,
    raw === "range" && sp.from ? { from: sp.from, to: sp.to ?? sp.from } : null,
  );

  return {
    period: raw,
    anchor: sp.anchor ?? null,
    fromIso: r.from.toISOString(),
    toIso: r.to.toISOString(),
    fromDay: r.fromDay,
    toDay: r.toDay,
    today: parisDay(now),
    label: r.label,
    // A hand-picked span has no natural neighbour to step to — the same reason
    // the ‹ › arrows hide on the Earnings screen in `range` mode.
    prev: raw === "range" ? null : r.prev,
    next: raw === "range" ? null : r.next,
    isCurrent: r.isCurrent,
  };
}

/**
 * The words under a figure that follows the period.
 *
 * ⚑ EVERY PERIOD-SCOPED NUMBER SAYS WHICH PERIOD IT IS IN. On "All time" that is
 * the phrase "all time" rather than silence: a figure with no qualifier invites
 * the reader to supply their own, and the one they supply is usually "recently".
 */
export function inPeriod(p: AdminPeriod): string {
  return p.period === null ? "all time" : `in ${p.label}`;
}

/** The tabs, in order. `null` is All time and comes first because it is home. */
export const ADMIN_PERIODS: readonly (Period | null)[] = [
  null,
  "year",
  "month",
  "week",
  "day",
  "range",
];

export function periodTabLabel(p: Period | null): string {
  if (p === null) return "All time";
  return p === "range" ? "Range" : p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * A console URL carrying this period plus whatever filters the screen already
 * had, so switching to July does not silently drop "Businesses in Nice".
 *
 * ⚑ THE FILTERS AND THE PERIOD ARE INDEPENDENT, and the bug this prevents is
 * losing one when you touch the other — which reads as the screen forgetting
 * what you asked, and is how someone ends up trusting a number for the wrong set.
 */
export function periodHref(
  base: string,
  p: { period?: Period | null; anchor?: string | null; from?: string; to?: string },
  keep: Record<string, string | undefined>,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
  if (p.period) {
    q.set("period", p.period);
    // ⚑ A hand-picked span carries its OWN ends, because no anchor can express
    // "16 June to 31 July". Every other granularity is an anchor plus a name.
    if (p.period === "range") {
      if (p.from) q.set("from", p.from);
      if (p.to) q.set("to", p.to);
    } else if (p.anchor) {
      q.set("anchor", p.anchor);
    }
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
