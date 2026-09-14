// The Vehicles screen — the shaping half, kept pure (S81, [[d142]]).
//
// The Drivers screen's twin, turned to face the cars: a census of every car TODAY, set beside the
// trips of the chosen PERIOD, one row per class — so "are there enough of each kind for the trips"
// is a line you read, not a join you do in your head. Counts come from SQL
// (docs/migrations/2026-09-14_admin_vehicles.sql); every word and every rate is decided here.
//
// ⚑ NO SERVER IMPORTS. The page is the only caller that touches Supabase; everything it draws is a
// function of rows, so tests/admin-vehicles.test.ts can pin it (lib/admin-list.ts says why, S67).
import { fillRate } from "@/lib/admin-rollup";
import { classKeyLabel } from "@/lib/admin-drivers";
import { periodHref } from "@/lib/admin-period";
import { formatShortDay } from "@/lib/format";
import { BODY_TYPES, SERVICE_TIERS } from "@/lib/vehicle-catalog";

/** The migration both functions live in — named by every refusal on the page. */
export const VEHICLES_MIGRATION = "docs/migrations/2026-09-14_admin_vehicles.sql";

/** A trip that asked for no body in particular. The grid's third row under each class. */
export const ANY_BODY = "any";

const count = new Intl.NumberFormat("fr-FR");

/** One class of LIVE car, today. Exactly one bucket per car, in mayTakeWork's order
 *  (lib/driver-approvals.ts:130): can work, else the car to approve, else refused, else the person. */
export interface AdminVehicleSupply {
  category: string;
  body_type: string;
  live_cars: number;
  can_work: number;
  to_approve: number;
  refused: number;
  person_not_approved: number;
}

/** The trips of one class in the period, counted by PICKUP date ([[d142]] rule 3). */
export interface AdminVehicleDemand {
  category: string;
  /** 'sedan' | 'van' | 'any' — `coalesce(required_body_type::text, 'any')`. */
  body: string;
  trips: number;
  settled: number;
  filled: number;
  nobody_took: number;
}

/** What admin_vehicle_overview returns. Counts only — "counts travel, rates are rendered" ([[d100]]). */
export interface AdminVehicleOverview {
  supply: AdminVehicleSupply[] | null;
  demand: AdminVehicleDemand[] | null;
}

/** A row of "Cars and trips, by class". */
export interface VehicleGridRow {
  /** `category|body` — unique, and the React key. */
  key: string;
  category: string;
  /** 'sedan' | 'van' | 'any', or whatever other body the data held. */
  body: string;
  label: string;
  /** The small gap that opens each class after the first. */
  gapBefore: boolean;
  canWork: number;
  /** The amber pill: cars a person at Kavenue has to approve. 0 on an any row. */
  waiting: number;
  /** A neutral pill: an approved car whose Driver is not approved. ⚑ NOT AMBER (S81 review) — whether
   *  that is our move or the Driver's depends on the Driver's own papers (approvalPiles), which a count
   *  cannot see. The car list says which, row by row. 0 on an any row. */
  personNotApproved: number;
  /** The neutral pill: cars refused and not yet corrected. 0 on an any row. */
  refused: number;
  trips: number;
  settled: number;
  filled: number;
  nobodyTook: number;
}

const keyOf = (category: string, body: string) => `${category}|${body}`;

/** Body order inside a class: sedan, van, any — then anything else the data held, by name. */
function bodyRank(body: string): number {
  const i = (BODY_TYPES as readonly string[]).indexOf(body);
  if (i >= 0) return i;
  return body === ANY_BODY ? BODY_TYPES.length : BODY_TYPES.length + 1;
}

/**
 * A grid row's name: "Business · Sedan", "Business · Any body".
 *
 * ⚑ THROUGH classKeyLabel, like every other class on the console. The one thing it cannot say is a
 * body it does not know — it would drop it and "Eco" would stand for "eco|<something>" — so an
 * unknown body is written out rather than lost.
 */
export function gridLabel(category: string, body: string): string {
  if (body === ANY_BODY) return `${classKeyLabel(category, null)} · Any body`;
  if (!(BODY_TYPES as readonly string[]).includes(body)) return `${classKeyLabel(category, null)} · ${body}`;
  return classKeyLabel(category, body);
}

/**
 * The grid, in its fixed order.
 *
 * ⚑ THE NINE ROWS ALWAYS DRAW — eco, business, luxury (SERVICE_TIERS, never the enum's order, which
 * puts the legacy `van` category between them), each as Sedan, Van, Any body. A class with no car and
 * no trip is still a row of zeroes: "no First vans at all" is the answer this page exists to give.
 * ⚑ AND NOTHING THE DATA HOLDS IS DROPPED ([[d103]], "a null key is a row"). A legacy `van` category,
 * or a body nobody expected, comes after the nine as its own row, so the census still adds up.
 */
export function vehicleGridRows(o: AdminVehicleOverview | null): VehicleGridRow[] {
  const supply = o?.supply ?? [];
  const demand = o?.demand ?? [];

  const supplyBy = new Map<string, AdminVehicleSupply>();
  for (const s of supply) supplyBy.set(keyOf(s.category, s.body_type), s);
  const demandBy = new Map<string, AdminVehicleDemand>();
  for (const d of demand) demandBy.set(keyOf(d.category, d.body), d);

  const fixed: Array<{ category: string; body: string }> = SERVICE_TIERS.flatMap((category) =>
    [...BODY_TYPES, ANY_BODY].map((body) => ({ category, body })),
  );
  const known = new Set(fixed.map((k) => keyOf(k.category, k.body)));
  const seen = new Map<string, { category: string; body: string }>();
  for (const s of supply) seen.set(keyOf(s.category, s.body_type), { category: s.category, body: s.body_type });
  for (const d of demand) seen.set(keyOf(d.category, d.body), { category: d.category, body: d.body });
  const extras = [...seen.entries()]
    .filter(([k]) => !known.has(k))
    .map(([, v]) => v)
    .sort((a, b) => a.category.localeCompare(b.category) || bodyRank(a.body) - bodyRank(b.body)
      || a.body.localeCompare(b.body));

  return [...fixed, ...extras].map(({ category, body }, i, all) => {
    const any = body === ANY_BODY;
    const s = supplyBy.get(keyOf(category, body));
    const d = demandBy.get(keyOf(category, body));
    // ⚑ AN ANY ROW'S CARS ARE EVERY BODY OF ITS CLASS — a trip that asks for no body can be driven
    //   by a sedan or a van. It carries no pills: the waiting cars are already on the body rows above
    //   it, and a second copy of the same pill would read as twice as many.
    const canWork = any
      ? supply.filter((x) => x.category === category).reduce((n, x) => n + Number(x.can_work), 0)
      : Number(s?.can_work ?? 0);
    return {
      key: keyOf(category, body),
      category,
      body,
      label: gridLabel(category, body),
      gapBefore: i > 0 && all[i - 1]!.category !== category,
      canWork,
      waiting: any ? 0 : Number(s?.to_approve ?? 0),
      personNotApproved: any ? 0 : Number(s?.person_not_approved ?? 0),
      refused: any ? 0 : Number(s?.refused ?? 0),
      trips: Number(d?.trips ?? 0),
      settled: Number(d?.settled ?? 0),
      filled: Number(d?.filled ?? 0),
      nobodyTook: Number(d?.nobody_took ?? 0),
    };
  });
}

/**
 * Is "can work" the thing to look at on this row? Amber when the period asked for trips of this class
 * and not one car of it can take work today.
 *
 * ⚑ NOT ON A ROW WITHOUT TRIPS. Zero cars nobody asked for is a fact, not a gap — amber on every empty
 * class would teach the reader to ignore the colour on the one that matters.
 */
export function canWorkIdle(row: Pick<VehicleGridRow, "trips" | "canWork">): boolean {
  return row.trips > 0 && row.canWork === 0;
}

/**
 * "24 of 32 · 75 %", or "0 of 1", or "—".
 *
 * ⚑ THE COUNT ALWAYS, THE PERCENTAGE ONLY WHEN IT HAS EARNED IT — fillRate's threshold, MIN_FOR_RATE
 * settled trips, shared with the Businesses and Drivers screens so the three cannot disagree about
 * when a rate is honest ([[d98]]). "—" when nothing has settled: "0 of 0" is true and says nothing.
 */
export function filledSays(row: { settled: number; filled: number }): string {
  if (row.settled === 0) return "—";
  const rate = fillRate(row);
  const of = `${count.format(row.filled)} of ${count.format(row.settled)}`;
  // A narrow no-break space before "%" (fr-FR's own), so a stacked cell never leaves "%" alone on a line.
  return rate == null ? of : `${of} · ${Math.round(rate)}\u202F%`;
}

/** The three looks of "nobody took". Keyed by state in the page, so a fourth is a compile error. */
export type NobodyTookState = "bad" | "zero" | "none";

/** Red when a trip of this class ended with no Driver; "0" when there were trips and none did; "—"
 *  when there were no trips to fail. */
export function nobodyTookOf(row: Pick<VehicleGridRow, "trips" | "nobodyTook">): {
  state: NobodyTookState;
  text: string;
} {
  if (row.nobodyTook > 0) return { state: "bad", text: count.format(row.nobodyTook) };
  if (row.trips > 0) return { state: "zero", text: "0" };
  return { state: "none", text: "—" };
}

/** What every link on the page must carry to stay in the same period — lib/admin-period's own shape. */
export type PeriodCarry = Parameters<typeof periodHref>[1];

/**
 * A grid row's link: the cars of that class, in the same period.
 *
 * ⚑ EVERY LINK CARRIES THE PERIOD ([[d103]]) — through periodHref, the bar's own builder, so a range
 * keeps its two ends and a month keeps its anchor. The cars do not move with it; the grid underneath
 * does, and clicking back must land in the same July.
 */
export function gridRowHref(row: Pick<VehicleGridRow, "category" | "body">, carry: PeriodCarry): string {
  return periodHref("/admin/vehicles", carry, { category: row.category, body: row.body });
}

/** A car list page: the search or the class it came from, the period, and the page number. */
export function carListHref(
  list: { q?: string | null; category?: string | null; body?: string | null },
  carry: PeriodCarry,
  page: number,
): string {
  return periodHref("/admin/vehicles", carry, {
    q: list.q ?? undefined,
    category: list.category ?? undefined,
    body: list.body ?? undefined,
    page: page > 0 ? String(page) : undefined,
  });
}

/** The class a grid row opened, off the URL — or null, when the page shows no list at all.
 *  ⚑ `?category=a&category=b` arrives as an array; the first is the one a row would have sent. */
export function vehicleFilter(
  category: string | string[] | undefined,
  body: string | string[] | undefined,
): { category: string; body: string } | null {
  const c = (Array.isArray(category) ? category[0] : category)?.trim();
  if (!c) return null;
  const b = (Array.isArray(body) ? body[0] : body)?.trim();
  return { category: c, body: b || ANY_BODY };
}

/** "1 person not approved", "2 people not approved" — approved cars whose Driver is not approved. At most
 *  one live car per Driver (vehicle_one_live_per_driver), so the count is a count of people. */
export function personNotApprovedSays(n: number): string {
  return n === 1 ? "1 person not approved" : `${count.format(n)} people not approved`;
}

/** "7 cars match “mercedes”", "1 car matches “AB-123”". */
export function carsMatchSays(n: number, term: string): string {
  return n === 1 ? `1 car matches “${term}”` : `${count.format(n)} cars match “${term}”`;
}

/** A car row as the table draws it. Keyed by kind in the page, so a fourth is a compile error. */
export type CarRowKind = "replaced" | "unread" | "piles";

/**
 * Which of three things a car row says across its approval columns.
 *
 * ⚑ REPLACED COMES FIRST, AND DOES NOT WAIT ON THE PAPERS. A car that has left the circuit has no
 * approvals left to state — its Driver's papers describe the car that took over — so a failed papers
 * read changes nothing about it. For a live car it changes everything: never confident cells from a
 * failed read (S79).
 */
export function carRowKindOf(row: { retired_at: string | null }, papersUnread: boolean): CarRowKind {
  if (row.retired_at) return "replaced";
  return papersUnread ? "unread" : "piles";
}

/**
 * "Replaced by AB-123-CD · 12 Sept" — the trace the founder asked for: *"so we can have a trace of older
 * cars and why they are not in the circuit anymore"* ([[d142]] rule 5). Null for a live car.
 *
 * ⚑ THE ONLY WAY A CAR LEAVES IS replace_vehicle, which sets retired_at and replaced_by together
 * (docs/migrations/2026-09-13_vehicle_approval_gate.sql:318, :345). A retired row with no successor's
 * plate is still said — without the plate it does not have — rather than drawn as a live car.
 */
export function replacedSays(row: { retired_at: string | null; replaced_by_plate: string | null }): string | null {
  if (!row.retired_at) return null;
  const day = formatShortDay(row.retired_at);
  return row.replaced_by_plate ? `Replaced by ${row.replaced_by_plate} · ${day}` : `Replaced · ${day}`;
}

/** "Mercedes-Benz Classe E". A car enrolled before make and model were required says so with a dash. */
export function carModelOf(row: { make: string | null; model: string | null }): string {
  return [row.make, row.model].filter((s) => s && s.trim()).join(" ") || "—";
}

/**
 * Does this PostgREST error mean the function is not on the database at all?
 *
 * ⚑ ONLY THEN DOES THE PAGE SAY "run the migration". 42883 is Postgres's undefined_function, PGRST202
 * is PostgREST not finding it in its schema cache. Any other error — a timeout, a refused grant — is
 * said as itself: telling someone to paste a migration that is already in would send them the wrong way.
 */
export function rpcMissing(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "42883" || error?.code === "PGRST202";
}
