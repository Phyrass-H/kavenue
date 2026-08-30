// The list mechanics behind the console's browse screens: which end of a
// journey to show, how rows fall into days, how a capped list says what it is
// NOT showing, and whether a Driver is actually working.
//
// ⚑ PURE ON PURPOSE — no Supabase, no env, no `server-only`. `lib/app-context.ts`
// cannot be imported by a test because it reads env at module load, and would
// die the same way in CI, which has no `.env.local` (S67). Everything here is
// decided by these functions, so everything here is testable.
import { parisDayKey } from "@/lib/dispatch-status";
import { haversineKm } from "@/lib/geo";
import type { MissionStatus } from "@/lib/database.types";

/* ── which end of the journey to show ───────────────────────────────────── */

/**
 * How close two points must be to be "the same place". A hotel's own saved
 * address and a Dispatcher's typed pickup are two separate Google places for the
 * same building, so they land tens of metres apart — a service entrance and a
 * lobby easily differ by 100 m. 250 m is wide enough to catch that and far too
 * narrow to swallow the next building along.
 */
export const SAME_PLACE_KM = 0.25;

export interface Endpoint {
  label: string;
  lat: number | null;
  lng: number | null;
}

export type Leg =
  /** Leaves the anchor. `label` is where it goes. */
  | { at: "start"; label: string }
  /** Comes back to the anchor. `label` is where it came from. */
  | { at: "end"; label: string }
  /** Neither end is the anchor (or we can't tell). `label` is the whole route. */
  | { at: "neither"; label: string };

function samePlace(p: Endpoint, anchor: { lat: number; lng: number }): boolean {
  if (p.lat == null || p.lng == null) return false;
  return haversineKm(p.lat, p.lng, anchor.lat, anchor.lng) <= SAME_PLACE_KM;
}

/**
 * The far end of a journey, seen from a fixed point — the hotel whose page this
 * is.
 *
 * ⚑ THIS IS THE FIX FOR THE WORST THING ON THE CONSOLE: a hotel's own name
 * repeated on all 42 rows of its own page ("Belles-Rives, Juan-les-Pins → Nice
 * Airport", forty times). The heading already says whose page it is; the row's
 * information is the OTHER end.
 *
 * ⚑ MATCHED ON COORDINATES, NEVER ON THE NAME. "Hôtel Belles-Rives" (the
 * business) and "Belles-Rives, Juan-les-Pins" (the saved address label) are not
 * the same string and never will be, and a hotel is free to rename itself.
 * Against the live data this classifies all 350 trips: 348 leave the hotel, 1
 * returns to it, 1 touches neither end.
 */
export function farLeg(
  from: Endpoint,
  to: Endpoint,
  anchor: { lat: number | null; lng: number | null } | null,
  /** What to show when neither end is the anchor. Already "A → B". */
  whole: string,
): Leg {
  if (!anchor || anchor.lat == null || anchor.lng == null) return { at: "neither", label: whole };
  const a = { lat: anchor.lat, lng: anchor.lng };
  const leaves = samePlace(from, a);
  const returns = samePlace(to, a);
  // ⚑ Both ends at the hotel is a round trip, and a bare "→ Belles-Rives" would
  // read as an ordinary departure to somewhere that happens to share the name.
  // Show it whole and let the reader see what it is.
  if (leaves && returns) return { at: "neither", label: whole };
  if (leaves) return { at: "start", label: to.label };
  if (returns) return { at: "end", label: from.label };
  return { at: "neither", label: whole };
}

/* ── day bands ──────────────────────────────────────────────────────────── */

export interface DayGroup<T> {
  /** Paris calendar date `YYYY-MM-DD`, or year-month `YYYY-MM`. */
  key: string;
  rows: T[];
}

/**
 * How wide a band is.
 *
 * ⚑ BOTH, BECAUSE ONE BAND SIZE IS WRONG ON HALF THE SCREENS — and the live page
 * is what proved it. A hotel posts about one trip a day, so day bands over its
 * own 42 trips produced forty-two one-row bands: a striped wall, worse than the
 * flat list it replaced. Every trip in the marketplace on one page is ~3 a day,
 * where a day band groups properly.
 *
 * The app already works this way and this follows it: Dispatch's Schedule (a
 * working day) bands by day, its History (a retrospective) bands by month.
 */
export type Band = "day" | "month";

export function bandKey(iso: string, band: Band): string {
  const day = parisDayKey(iso);
  return band === "day" ? day : day.slice(0, 7);
}

/**
 * Break an ordered list into bands. The point is not decoration: a day band lets
 * the row drop its date and show the time alone, so the page carries less text
 * than it did, not more.
 *
 * ⚑ GROUPS CONSECUTIVE ROWS ONLY, and that is deliberate. Bucketing by key would
 * silently reunite rows a caller had ordered by something else, presenting a
 * scrambled list as a tidy one. This preserves the caller's order exactly — a
 * mis-sorted list shows a repeated band, which is the truth.
 */
export function byDay<T>(
  rows: readonly T[],
  at: (row: T) => string,
  band: Band = "day",
): DayGroup<T>[] {
  const out: DayGroup<T>[] = [];
  for (const row of rows) {
    const key = bandKey(at(row), band);
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else out.push({ key, rows: [row] });
  }
  return out;
}

/* ── pagination ─────────────────────────────────────────────────────────── */

export interface PageWindow {
  /** PostgREST `.range()` bounds, inclusive. */
  from: number;
  to: number;
  page: number;
}

/** A page number off a query string, clamped to something sane. */
export function pageWindow(raw: string | undefined, size: number): PageWindow {
  const n = Number(raw);
  const page = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return { page, from: page * size, to: page * size + size - 1 };
}

export interface PageNote {
  says: string;
  older: number | null;
  newer: number | null;
}

/**
 * What a capped list must admit about itself.
 *
 * ⚑ THE CONSOLE USED TO TRUNCATE IN SILENCE — trips at 120, a Driver's at 40,
 * search at 8 per kind, none of it stated. A list that quietly stops reads as a
 * complete answer, which is the one thing it isn't. The handoff's own rule for
 * thin data says the same: say "3 of 9 located", never quietly count what you
 * can find.
 *
 * Returns null when everything fits — the console is silent by construction, and
 * "42 of 42" is noise on a page that is already showing all 42.
 */
export function pageNote(total: number, { page }: PageWindow, size: number): PageNote | null {
  if (total <= size && page === 0) return null;
  const first = page * size;
  const last = Math.min(first + size, total);
  const older = last < total ? page + 1 : null;
  const newer = page > 0 ? page - 1 : null;
  // Page 0 is the only one where "newest" is true of the rows on screen.
  const says =
    page === 0
      ? `Newest ${last} of ${total}`
      : `${Math.min(first + 1, total)}–${last} of ${total}`;
  return { says, older, newer };
}

/* ── is this Driver actually working? ───────────────────────────────────── */

export interface Activity {
  /** Trips they hold or have held, whatever became of them. */
  held: number;
  /** Trips they drove to the end. */
  done: number;
  /** Pickup time of the most recent COMPLETED trip. */
  lastDoneAt: string | null;
}

export interface HeldMission {
  driver_id: string | null;
  status: MissionStatus;
  pickup_at: string;
}

/** Trips per Driver, in one pass over the missions that have one. */
export function tallyActivity(rows: readonly HeldMission[]): Map<string, Activity> {
  const out = new Map<string, Activity>();
  for (const m of rows) {
    if (!m.driver_id) continue;
    const a = out.get(m.driver_id) ?? { held: 0, done: 0, lastDoneAt: null };
    a.held += 1;
    if (m.status === "completed") {
      a.done += 1;
      if (!a.lastDoneAt || m.pickup_at > a.lastDoneAt) a.lastDoneAt = m.pickup_at;
    }
    out.set(m.driver_id, a);
  }
  return out;
}

export interface ActivitySays {
  /** Ready for a date formatter: `{n} trips · last ` + `on`. */
  text: string;
  on: string | null;
  /** Worth colouring — nobody is getting work out of this Driver. */
  idle: boolean;
}

/**
 * The one thing the fleet list never said: is this person actually working?
 *
 * ⚑ THREE STATES, NOT TWO. "0 trips" for a Driver who has held eight and
 * finished none is a lie of omission — the interesting half is that they took
 * work and it did not end well. Nobody in the fleet is in that state today,
 * which is exactly why the branch has to be written now rather than discovered
 * later.
 */
export function activitySays(a: Activity | undefined): ActivitySays {
  if (!a || a.held === 0) return { text: "never taken a trip", on: null, idle: true };
  if (a.done === 0) {
    return { text: `held ${a.held}, none finished`, on: null, idle: true };
  }
  return {
    text: `${a.done} trip${a.done === 1 ? "" : "s"} · last`,
    on: a.lastDoneAt,
    idle: false,
  };
}

/**
 * Read EVERY row of a query that may exceed PostgREST's page, one page at a time.
 *
 * ⚑ AN UNBOUNDED `.select()` RETURNS AT MOST 1 000 ROWS AND REPORTS NO ERROR.
 * Measured against this database on 2026-08-30: `mission_event` came back with
 * 1 000 of 2 503 rows and no indication that anything was missing. That is fine
 * for a LIST — a list is paged and says what it is hiding (`pageNote`). It is
 * not fine for anything that FEEDS A CALCULATION, because a truncated input does
 * not produce a shorter answer, it produces a wrong one: the set of recorded
 * cancellations, read short, turns trips that DO carry a record into trips that
 * appear not to.
 *
 * ⚑ SO THE RULE IS: paged when the rows are counted or compared, `.range()` when
 * they are rendered. Never an unbounded select behind a number.
 */
export async function readAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    // A short page is the last page — asking for another would be a wasted trip.
    if (data.length < PAGE) break;
  }
  return out;
}
