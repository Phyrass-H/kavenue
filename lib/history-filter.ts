// Dispatch History — the one place a past trip is filtered, searched and sorted.
//
// The page and the CSV export both read this. That is the point: "Export CSV"
// promises *exactly what is on screen*, and the only way to keep that promise is
// for both to run the same function rather than two lists that drift.

import type { MissionRow, VehicleCategory } from "@/lib/database.types";
import { isExpired, parisDayKey } from "@/lib/dispatch-status";
import { settledFare } from "@/lib/pdp";
import { businessCost } from "@/lib/commission";
import { parsePassengers, passengerName } from "@/lib/passengers";
import { serviceClassLabel } from "@/lib/format";
import type { CarSnapshot } from "@/lib/waybill";
import {
  isPeriod,
  parseAnchor,
  parseDayParam,
  periodRange,
  todayAnchor,
  type Period,
} from "@/lib/earnings";

export const OUTCOMES = ["all", "completed", "unfilled", "cancelled"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const SORTS = ["recent", "oldest", "high", "low"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABEL: Record<Sort, string> = {
  recent: "Newest first",
  oldest: "Oldest first",
  high: "Highest fare",
  low: "Lowest fare",
};

/** A mission plus the bits that live in other tables but are searchable. */
export interface HistoryRow {
  mission: MissionRow;
  driverId: string | null;
  driverName: string | null;
  /**
   * The car that DID this trip — its own frozen copy, `carAsDriven(mission)`.
   *
   * ⚑⚑ S78 — it was a structural `CarInfo` filled from a live `vehicle` lookup by driver_id,
   * so the day a Driver re-plated, a plate search stopped finding the trips that plate
   * actually did and started finding the ones it never did. The tag on `CarSnapshot` means a
   * car row can no longer be put here: the compiler refuses it.
   */
  car: CarSnapshot | null;
  /** The amount to show. Null when nobody ever took it — an unfilled trip costs nothing. */
  fare: number | null;
  /**
   * Whether that amount is REAL money owed. False for a past trip a Driver took
   * and never closed (§ Q): the fare is agreed, but nothing has settled, so it
   * must show on its row and stay out of every total.
   */
  counted: boolean;
}

export interface HistoryQuery {
  outcome: Outcome;
  q: string;
  /**
   * The date filter, expressed exactly like the Driver's Earnings ([[d64]]):
   * a granularity plus an anchor day, or a hand-picked span. `null` = any date,
   * which is History's default and has no equivalent on the Earnings screen
   * (that one always shows *some* period).
   */
  period: Period | null;
  /** Anchor day for day/week/month/year. Null when period is null or "range". */
  anchor: string | null;
  /**
   * Inclusive Paris day keys — DERIVED from period+anchor (or typed directly for
   * a range). This is what the filter actually compares against, so the page and
   * the CSV can never disagree about what "July" means.
   */
  from: string | null;
  to: string | null;
  /**
   * ⚑ No UI: the founder had the Driver dropdown removed in S52 ("can you imagine
   * there is 300, how would it look"), and searching a Driver's name already does
   * the job. Kept as a URL param so "every trip this Driver did" stays one link
   * away when a row-level entry point for it is worth adding.
   */
  driverId: string | null;
  category: VehicleCategory | null;
  sort: Sort;
}

/** The human label + step anchors for whatever date filter is applied. */
export interface PeriodView {
  label: string;
  prev: string;
  next: string;
  isCurrent: boolean;
  fromDay: string;
  toDay: string;
}

/** Null when no date filter is applied — the caller shows "Any date". */
export function periodView(q: HistoryQuery, now: Date = new Date()): PeriodView | null {
  if (!q.period) return null;
  const r = periodRange(
    q.period,
    parseAnchor(q.anchor ?? undefined),
    now,
    q.period === "range" && q.from ? { from: q.from, to: q.to ?? q.from } : null,
  );
  return {
    label: r.label,
    prev: r.prev,
    next: r.next,
    isCurrent: r.isCurrent,
    fromDay: r.fromDay,
    toDay: r.toDay,
  };
}

export function parseHistoryQuery(sp: Record<string, string | string[] | undefined>): HistoryQuery {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  // parseDayParam, not a shape-only regex: it rejects month 13 and 31 February,
  // which Date otherwise rolls over silently — "?p=day&d=2026-02-31" would have
  // quietly filtered to 3 March.
  const day = (k: string) => parseDayParam(one(k) ?? undefined);

  const pRaw = one("p") ?? undefined;
  const period: Period | null = isPeriod(pRaw) ? pRaw : null;

  let from: string | null = null;
  let to: string | null = null;
  let anchor: string | null = null;

  if (period === "range") {
    from = day("from");
    to = day("to");
    // A backwards range would silently match nothing, which reads as "you have no
    // history" rather than "these dates are the wrong way round". Swap instead.
    if (from && to && from > to) [from, to] = [to, from];
    // "p=range" with no dates is not a filter; fall back to showing everything
    // rather than an empty archive.
    if (!from && !to) {
      return base(one, { period: null, anchor: null, from: null, to: null });
    }
    if (!to) to = from;
    if (!from) from = to;
  } else if (period) {
    const a = day("d");
    anchor = a ?? isoOf(todayAnchor());
    // The granularity decides the span: "d=2026-07-13" under Month means July,
    // under Week means the 13th's week. Same rule the Earnings calendar makes
    // visible ([[d65]]) — derived here so the page and the CSV can't disagree.
    const r = periodRange(period, parseAnchor(anchor));
    from = r.fromDay;
    to = r.toDay;
  }

  return base(one, { period, anchor, from, to });
}

const isoOf = (a: { y: number; m: number; d: number }) =>
  `${a.y}-${String(a.m).padStart(2, "0")}-${String(a.d).padStart(2, "0")}`;

function base(
  one: (k: string) => string | null,
  dates: Pick<HistoryQuery, "period" | "anchor" | "from" | "to">,
): HistoryQuery {
  return {
    outcome: OUTCOMES.find((o) => o === one("filter")) ?? "all",
    q: one("q") ?? "",
    ...dates,
    driverId: one("driver"),
    category: (one("cat") as VehicleCategory | null) ?? null,
    sort: SORTS.find((s) => s === one("sort")) ?? "recent",
  };
}

/** Whether anything narrows the archive right now (drives "Clear filters"). */
export function isFiltered(q: HistoryQuery): boolean {
  return Boolean(q.q || q.period || q.driverId || q.category || q.outcome !== "all");
}

/** Rebuild a query string, dropping empties so a plain view has a clean URL. */
export function historyHref(q: HistoryQuery, patch: Partial<HistoryQuery> = {}): string {
  const m = { ...q, ...patch };
  const p = new URLSearchParams();
  if (m.outcome !== "all") p.set("filter", m.outcome);
  if (m.q) p.set("q", m.q);
  // Only the SOURCE of the date filter is written; from/to for the four
  // granularities are derived on read, so a link can never carry a "July" that
  // spans the wrong days.
  if (m.period === "range") {
    p.set("p", "range");
    if (m.from) p.set("from", m.from);
    if (m.to) p.set("to", m.to);
  } else if (m.period) {
    p.set("p", m.period);
    if (m.anchor) p.set("d", m.anchor);
  }
  if (m.driverId) p.set("driver", m.driverId);
  if (m.category) p.set("cat", m.category);
  if (m.sort !== "recent") p.set("sort", m.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function bucketOf(m: MissionRow): Exclude<Outcome, "all"> | null {
  if (isExpired(m)) return "unfilled";
  if (m.status === "completed") return "completed";
  if (m.status === "cancelled") return "cancelled";
  return null;
}

/**
 * Fold accents and case away before comparing.
 *
 * ⚑ Not cosmetic. Half the addresses in the beta are "Aéroport Nice Côte d'Azur"
 * and "Hôtel Negresco" — a Dispatcher typing "aeroport" or "hotel" on a French
 * keyboard-in-a-hurry must still find them. (Same family of bug as the S42
 * airport predicate, which is worth remembering: accents are never incidental
 * here.)
 */
export function fold(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Fold character by character, keeping an index back to the original string.
 *
 * Needed because the highlight has to paint the ORIGINAL text ("Aéroport") from
 * offsets found in the FOLDED one ("aeroport"). Folding the whole string at once
 * loses that mapping the moment a character doesn't fold 1:1 — "œ" → "oe" and a
 * lone combining mark → "" both shift every offset after them.
 */
function foldWithMap(s: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const f = fold(s[i]);
    for (let k = 0; k < f.length; k++) {
      folded += f[k];
      map.push(i);
    }
  }
  return { folded, map };
}

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Split `text` into plain and matched runs for the search highlight. Overlapping
 * hits from different terms are merged, so "nice nic" paints one run, not two
 * nested ones.
 */
export function highlightSegments(text: string, q: string): Segment[] {
  const terms = [...new Set(fold(q).split(/\s+/).filter(Boolean))];
  if (!text || terms.length === 0) return [{ text, hit: false }];

  const { folded, map } = foldWithMap(text);
  const spans: [number, number][] = [];
  for (const term of terms) {
    let at = folded.indexOf(term);
    while (at !== -1) {
      // map[] is folded-index → original-index; the end is the last covered
      // character's original index plus one, never map[at + term.length].
      spans.push([map[at], map[at + term.length - 1] + 1]);
      at = folded.indexOf(term, at + term.length);
    }
  }
  if (spans.length === 0) return [{ text, hit: false }];

  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }

  const out: Segment[] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a > cursor) out.push({ text: text.slice(cursor, a), hit: false });
    out.push({ text: text.slice(a, b), hit: true });
    cursor = b;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

/** Which searchable field a hit landed in — so the row can say why it matched. */
export type MatchField = "guest" | "driver" | "reference" | "address" | "flight" | "car" | "class";

interface Field {
  key: MatchField;
  text: string;
}

/** Everything about a trip that a Business might remember it by. */
export function searchFields(row: HistoryRow): Field[] {
  const m = row.mission;
  const out: Field[] = [];

  const guests = parsePassengers(m.passenger_names)
    .map(passengerName)
    .filter(Boolean)
    .join(" ");
  const guest = [guests, m.passenger_name ?? ""].filter(Boolean).join(" ");
  if (guest) out.push({ key: "guest", text: guest });

  if (row.driverName) out.push({ key: "driver", text: row.driverName });
  if (m.reference) out.push({ key: "reference", text: m.reference });

  const stops = Array.isArray(m.waypoints)
    ? (m.waypoints as { address?: string }[]).map((w) => w?.address ?? "")
    : [];
  const addr = [m.pickup_address, m.dropoff_address ?? "", ...stops].filter(Boolean).join(" ");
  if (addr) out.push({ key: "address", text: addr });

  if (m.flight_number) out.push({ key: "flight", text: m.flight_number });

  if (row.car) {
    const car = [row.car.make, row.car.model, row.car.colour, row.car.plate]
      .filter(Boolean)
      .join(" ");
    if (car) out.push({ key: "car", text: car });
  }

  out.push({ key: "class", text: serviceClassLabel(m.category, m.required_body_type) });
  return out;
}

/**
 * Every term must hit SOMEWHERE (AND across terms, OR across fields) — so
 * "marc negresco" finds the trip Marc drove from the Negresco, which is how a
 * person narrows a search out loud. Returns the fields that matched, or null.
 */
export function matchRow(row: HistoryRow, q: string): MatchField[] | null {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  // A query that folds away to nothing — a lone "^" or "¨", which are diacritic
  // marks fold() strips — matches NOTHING rather than everything. Returning an
  // empty hit list here made every row pass with no highlight, so typing an
  // accent key by itself silently looked like "no filter applied".
  if (terms.length === 0) return null;

  const fields = searchFields(row).map((f) => ({ key: f.key, folded: fold(f.text) }));
  const hits = new Set<MatchField>();

  for (const term of terms) {
    let found = false;
    for (const f of fields) {
      if (f.folded.includes(term)) {
        hits.add(f.key);
        found = true;
      }
    }
    if (!found) return null;
  }
  return [...hits];
}

/**
 * What a past trip costs, and whether that figure is owed yet.
 *
 * - unfilled → nothing at all; nobody ever held it.
 * - cancelled → the fee that was struck ([[d45]]), not the fare.
 * - completed / no-show → the fare frozen at accept ([[d59]] settledFare).
 * - anything else (a past `confirmed`/`on_board` — § Q) → the agreed fare, but
 *   `counted: false`. It is shown so the row isn't silently blank, and excluded
 *   from the totals because an unclosed trip has settled nothing. Counting it
 *   would inflate a hotel's spend with trips that may never have happened.
 */
export function historyFare(m: MissionRow): { fare: number | null; counted: boolean } {
  if (isExpired(m)) return { fare: null, counted: true };
  if (m.status === "cancelled") {
    const raw = m.cancellation_fee == null ? null : Number(m.cancellation_fee);
    const fee = raw != null && Number.isFinite(raw) ? raw : null;
    return { fare: fee, counted: true };
  }
  if (m.status !== "completed") return { fare: settledFare(m), counted: false };
  return { fare: settledFare(m), counted: true };
}

export interface HistoryResult {
  rows: HistoryRow[];
  /** Which fields the search hit, per mission id. Empty when not searching. */
  matches: Map<string, MatchField[]>;
  /** Bucket counts over everything the NON-outcome filters left — see below. */
  counts: Record<Outcome, number>;
  /**
   * ⚑ There is deliberately NO total here.
   *
   * There used to be a `spend` that summed `fare` alone — which is not the bill,
   * because waiting is part of what a Business owes. Nothing read it: both
   * /dispatch/history and /dispatch/spend already re-total with `rowCost()`,
   * which is the one definition of what a trip cost. So the field was never
   * wrong on screen; it was a fares-only total sitting inside the function both
   * money screens run, waiting for someone to reach for the obvious thing.
   *
   * If a caller needs a total, it is `rows.reduce((s, r) => s + rowCost(r), 0)`.
   */
}

/**
 * Apply the whole query.
 *
 * ⚑ The chip counts are computed AFTER the date/driver/class/search filters but
 * BEFORE the outcome filter. Counting the outcome too would make every chip read
 * its own selection (1 of 1), and counting nothing would make "Cancelled 2" a lie
 * inside a July-only range. This way a chip always answers "how many of what I'm
 * currently looking at ended this way" — which is the question being asked.
 */
export function applyHistoryQuery(all: HistoryRow[], q: HistoryQuery): HistoryResult {
  const matches = new Map<string, MatchField[]>();

  const narrowed = all.filter((row) => {
    const m = row.mission;
    if (q.driverId && row.driverId !== q.driverId) return false;
    if (q.category && m.category !== q.category) return false;
    if (q.from || q.to) {
      const day = parisDayKey(m.pickup_at);
      if (q.from && day < q.from) return false;
      if (q.to && day > q.to) return false;
    }
    if (q.q) {
      const hit = matchRow(row, q.q);
      if (!hit) return false;
      matches.set(m.id, hit);
    }
    return true;
  });

  const counts: Record<Outcome, number> = { all: 0, completed: 0, unfilled: 0, cancelled: 0 };
  for (const row of narrowed) {
    counts.all += 1;
    const b = bucketOf(row.mission);
    if (b) counts[b] += 1;
  }

  const rows =
    q.outcome === "all" ? narrowed : narrowed.filter((r) => bucketOf(r.mission) === q.outcome);

  // A trip with no fare (unfilled) sorts to the bottom either way rather than
  // pretending to be €0 — the same rule the Driver's archive uses for "—".
  // ⚑ SORT ON WHAT IS RENDERED. The Fare column shows `rowCost(r)` — the
  // Business's all-in figure, waiting included — so keying on the bare Course
  // made the column visibly disorder itself two ways: waiting was in the number
  // and not in the key, and a pre-commission trip was compared against a
  // post-commission one 15% larger. Mirrors `rowCost` rather than importing it,
  // to keep this file free of a runtime dependency on lib/spend.
  const shownFare = (r: HistoryRow): number | null =>
    r.fare == null
      ? null
      : businessCost(r.mission, r.fare + Number(r.mission.waiting_fee ?? 0));
  const byFare = (a: HistoryRow, b: HistoryRow, dir: number) => {
    const av = shownFare(a),
      bv = shownFare(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (bv - av) * dir;
  };
  const sorted = [...rows].sort((a, b) => {
    switch (q.sort) {
      case "oldest":
        return a.mission.pickup_at.localeCompare(b.mission.pickup_at);
      case "high":
        return byFare(a, b, 1);
      case "low":
        return byFare(a, b, -1);
      default:
        return b.mission.pickup_at.localeCompare(a.mission.pickup_at);
    }
  });

  return { rows: sorted, matches, counts };
}
