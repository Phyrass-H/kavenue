// The Drivers screen — the shaping half, kept pure.
//
// The Businesses screen's twin ([[d100]]), applied to the other side of the
// market: four numbers, then breakdowns that ARE the navigation, then a list
// that only ever appears filtered. `fillRate` and `worthBreakingDown` come from
// lib/admin-rollup so the two screens cannot drift apart about when a
// percentage is honest.
//
// ⚑ AND IT ANSWERS THE TWO THINGS THE FOUNDER ASKED FOR BY NAME (S71): *"cars,
// classes and categories"*, and *"men and women"*.
import { fillRate } from "@/lib/admin-rollup";
import { serviceClassLabel } from "@/lib/format";
import { genderLabel, isGender } from "@/lib/gender";
import type { BodyType, VehicleCategory } from "@/lib/database.types";

/**
 * ⚑ `taken` / `finished`, NOT the Businesses screen's `settled` / `filled`.
 * There, "filled" means a Driver was found — the question a Business has. Every
 * trip a DRIVER holds was accepted by that same Driver, so the identical pair
 * would read ~100 % for every row forever. The Driver-side question is whether
 * the work they take actually gets done, and `finishRate` below is the adapter
 * that lets the SHARED rule compute it without either screen re-implementing it.
 */
export interface DriverRollupRow {
  key: string | null;
  /** For a class row: the body type, so "Business · Sedan" can be one line. */
  parent: string | null;
  drivers: number;
  taken: number;
  finished: number;
}

/**
 * Of the trips this row's Drivers took, the share they finished — or null on a
 * sample too thin to carry a percentage.
 *
 * ⚑ THE THRESHOLD IS THE SHARED ONE, reached through lib/admin-rollup rather
 * than re-derived here. The pair being counted differs between the two screens;
 * the rule about when a percentage is honest does not, and must not.
 */
export function finishRate(row: Pick<DriverRollupRow, "taken" | "finished">): number | null {
  return fillRate({ settled: row.taken, filled: row.finished });
}

export interface DriverOverview {
  drivers: number;
  taken: number;
  never_took: number;
  without_base: number;
  median_trips: number | null;
  working_drivers: number;
  /** Drivers who have answered the gender question at all. The denominator. */
  gender_answered: number;
  by_class: DriverRollupRow[];
  by_make: DriverRollupRow[];
  by_gender: DriverRollupRow[];
}

const CATEGORIES: readonly string[] = ["eco", "business", "luxury", "van"];
const BODIES: readonly string[] = ["sedan", "van"];

/**
 * What a Driver drives, in the words the whole app uses for it.
 *
 * ⚑ THROUGH `serviceClassLabel`, NEVER SPELLED OUT HERE. The Pool matches on
 * this pair, Dispatch names a trip with it and the Driver's own settings show
 * it; a fourth spelling on the console would be the one that goes stale.
 */
export function classKeyLabel(key: string | null, body: string | null): string {
  if (key === null) return "No car on file";
  if (!CATEGORIES.includes(key)) return body ? `${key} · ${body}` : key;
  return serviceClassLabel(
    key as VehicleCategory,
    BODIES.includes(body ?? "") ? (body as BodyType) : null,
  );
}

/** A car make, or the honest gap. */
export function makeKeyLabel(key: string | null): string {
  return key ?? "No car on file";
}

/**
 * A gender breakdown row.
 *
 * ⚑ NULL IS "NOT ASKED", AND IT IS A ROW LIKE ANY OTHER. Dropping it would make
 * the table look complete while describing a fraction of the fleet — and on the
 * day this shipped it described none of it, because every Driver was null.
 */
export function genderKeyLabel(key: string | null): string {
  if (key === null) return "Not asked";
  return isGender(key) ? genderLabel(key) : key;
}

/**
 * The sentence above the gender breakdown, or null when everyone has answered.
 *
 * ⚑ NEVER OMITTED WHILE ANYONE IS UNANSWERED. The founder's standing rule, given
 * about Driver geography: a dashboard says "3 of 9 located", it never quietly
 * counts only what it can find.
 */
export function genderAnsweredNote(o: Pick<DriverOverview, "gender_answered" | "drivers">): string | null {
  if (o.drivers === 0 || o.gender_answered === o.drivers) return null;
  return `${o.gender_answered} of ${o.drivers} answered`;
}

/** Trips each, typical — among the Drivers who have taken one. */
export function medianValue(o: Pick<DriverOverview, "median_trips" | "working_drivers">): string {
  if (o.median_trips == null || o.working_drivers === 0) return "—";
  return String(Math.round(o.median_trips));
}

export function medianNote(o: Pick<DriverOverview, "median_trips" | "working_drivers">): string | null {
  if (o.median_trips == null || o.working_drivers === 0) return null;
  return `the typical one of the ${o.working_drivers} who work`;
}

export interface DriverListRow {
  trips: number;
  held_unfinished: number;
  last_took: string | null;
}

export interface WorkedSays {
  text: string;
  /** True when nothing is actually finishing — the row is drawn in the warn tone. */
  idle: boolean;
}

/**
 * Is this Driver actually working?
 *
 * ⚑ THREE STATES, NOT TWO — the S69 finding, preserved through the rewrite.
 * "held 8, none finished" is a real Driver who is neither working nor idle in
 * the ordinary sense, and nobody was in that state on the day it was built. A
 * two-state version reads as "8 trips" and hides exactly the person worth
 * phoning.
 */
export function workedSays(row: DriverListRow): WorkedSays {
  const trips = Number(row.trips);
  const unfinished = Number(row.held_unfinished);
  if (trips === 0) return { text: "never taken a trip", idle: true };
  if (trips === unfinished) return { text: `held ${trips}, none finished`, idle: true };
  return { text: `${trips} trip${trips === 1 ? "" : "s"}`, idle: false };
}
