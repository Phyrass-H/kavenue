// The reads behind the Activity console. Server-only.
//
// ⚑ IT RUNS AS THE SIGNED-IN ADMIN, NOT AS THE SERVICE ROLE. `app_role()='admin'`
// already appears in the RLS policies across docs/kavenue_schema.sql, granting an
// admin read on driver, vehicle, business, dispatcher, mission and the side
// tables. No migration was needed for any of this, and reaching for the
// service-role key here would throw that away — a console that bypasses RLS can
// never be trusted to tell you what a real admin can see.
//
// ⚑ EVERY COUNT IS `{ count: "exact", head: true }`. PostgREST silently caps a
//   `.select()` at 1000 rows, and `mission_event` passed 2000 in August. A silent
//   cap does not look like an error — it looks like an answer (S66: five event
//   types read as zero when one of them had 172 rows).
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { explainEligibility, type EligibilityInput } from "@/lib/eligibility";
import type { ActivitySnapshot, TrackedFeature } from "@/lib/activity-findings";
import { FEATURES } from "@/lib/activity-findings";
import { tripLabel } from "@/lib/activity-findings";
import { tallyActivity, type Activity, type HeldMission } from "@/lib/admin-list";
import type { MissionEventRow } from "@/lib/mission-events";
import {
  homeNumbers,
  HOME_NUMBER_COLS,
  type HomeNumbers,
  type NumbersRow,
} from "@/lib/admin-numbers";
import type { DriverRow, VehicleRow, MissionRow } from "@/lib/database.types";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Read every row of a table that may exceed PostgREST's 1000-row page. */
async function readAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export interface DriverWithCar {
  driver: DriverRow;
  vehicle: VehicleRow | null;
}

/** Every Driver with the car they declared — the fleet, as the rules see it. */
export async function readFleet(db: Db): Promise<DriverWithCar[]> {
  const [{ data: drivers }, { data: vehicles }] = await Promise.all([
    db.from("driver").select("*").order("first_name"),
    db.from("vehicle").select("*"),
  ]);
  return (drivers ?? []).map((driver) => ({
    driver,
    // A Driver may hold several cars; the Pool and accept_mission both look for
    // ANY matching one, so the console shows the active one it would match on.
    vehicle: (vehicles ?? []).find((v) => v.driver_id === driver.id && v.is_active) ??
      (vehicles ?? []).find((v) => v.driver_id === driver.id) ??
      null,
  }));
}

/**
 * Trips per Driver — the fleet list's "is this person actually working?".
 *
 * ⚑ PAGED, not `.select()`. There are ~300 held missions today and PostgREST
 * silently caps a select at 1000, so the honest read is the one that still works
 * on the first day the marketplace has 1001 of them.
 */
export async function readDriverActivity(db: Db): Promise<Map<string, Activity>> {
  const rows = await readAll<HeldMission>((from, to) =>
    db
      .from("mission")
      .select("driver_id, status, pickup_at")
      .not("driver_id", "is", null)
      .range(from, to),
  );
  return tallyActivity(rows);
}

/** The other live trips a Driver holds — the ±90 minute clash check's input. */
export async function readCommitments(db: Db): Promise<Map<string, string[]>> {
  const { data } = await db
    .from("mission")
    .select("driver_id, pickup_at")
    .in("status", ["accepted", "confirmed", "en_route", "arrived", "on_board"])
    .not("driver_id", "is", null);
  const byDriver = new Map<string, string[]>();
  for (const m of data ?? []) {
    if (!m.driver_id) continue;
    byDriver.set(m.driver_id, [...(byDriver.get(m.driver_id) ?? []), m.pickup_at]);
  }
  return byDriver;
}

export interface Matched {
  fleet: DriverWithCar;
  eligibility: ReturnType<typeof explainEligibility>;
}

/** Run every Driver against one trip. The answer to "why has nobody taken this?". */
export function matchFleet(
  mission: MissionRow,
  fleet: DriverWithCar[],
  commitments: Map<string, string[]>,
  now = new Date(),
  /** Past tense — see EligibilityInput.asIfPooled. */
  asIfPooled = false,
): Matched[] {
  return fleet.map((f) => ({
    fleet: f,
    eligibility: explainEligibility({
      mission,
      driver: f.driver,
      vehicle: f.vehicle,
      // A Driver's own other trips, minus this one — a trip never clashes with
      // itself, and a re-pooled trip they used to hold would otherwise block them.
      otherPickupsAt: (commitments.get(f.driver.id) ?? []).filter(
        (t) => t !== mission.pickup_at,
      ),
      now,
      asIfPooled,
    } satisfies EligibilityInput),
  }));
}

/** Everything Activity's "Worth a look" needs, in one pass. */
export async function readActivitySnapshot(now = new Date()): Promise<ActivitySnapshot> {
  const db = await createClient();
  const nowIso = now.toISOString();

  const [fleet, commitments, pooledRes, cancelledRes] = await Promise.all([
    readFleet(db),
    readCommitments(db),
    db.from("mission").select("*").eq("status", "pooled").gt("pickup_at", nowIso).order("pickup_at"),
    db
      .from("mission")
      .select("id, pickup_label, dropoff_label, cancelled_at")
      .eq("status", "cancelled"),
  ]);

  const pooled = (pooledRes.data ?? []).map((mission) => {
    const matched = matchFleet(mission, fleet, commitments, now);
    const takers = matched.filter((m) => m.eligibility.verdict === "can_take");
    return {
      mission,
      takers: takers.length,
      // When nobody can take it, the most useful thing to say is what stopped
      // the Drivers who were closest — the ones the trip's own class fits.
      reason: takers.length === 0 ? nobodyReason(matched) : null,
    };
  });

  // Which cancelled trips carry no `mission_cancellation` row. The table holds
  // who cancelled, when, why and what it cost; the 23 that predate it can never
  // be filled in, so this number only ever shrinks.
  const { data: records } = await db.from("mission_cancellation").select("mission_id");
  const recorded = new Set((records ?? []).map((r) => r.mission_id));
  const cancelledWithoutRecord = (cancelledRes.data ?? []).filter((m) => !recorded.has(m.id));

  // Trips handed back more than once. `repooled` is a trigger event, so this is
  // observed, not inferred.
  const repools = await readAll<{ mission_id: string }>((from, to) =>
    db.from("mission_event").select("mission_id").eq("event_type", "repooled").range(from, to),
  );
  const tally = new Map<string, number>();
  for (const r of repools) if (r.mission_id) tally.set(r.mission_id, (tally.get(r.mission_id) ?? 0) + 1);
  const repeatIds = [...tally.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  const { data: repeatRows } = repeatIds.length
    ? await db.from("mission").select("id, pickup_label, dropoff_label").in("id", repeatIds)
    : { data: [] };
  const passedAround = (repeatRows ?? []).map((m) => ({
    id: m.id,
    label: tripLabel(m),
    times: tally.get(m.id) ?? 0,
  }));

  return {
    pooled,
    drivers: fleet.map((f) => f.driver),
    neverUsed: await readNeverUsed(db),
    cancelledWithoutRecord,
    passedAround,
    orphanedEvents: await countOrphanedEvents(db),
  };
}

/**
 * Which shipped features have never been used, once.
 *
 * ⚑ READ FROM THE DOMAIN TABLE, NEVER FROM THE EVENT LOG. The log only started
 * on 2026-08-24, so "no release_proposed events" would mean "nobody in the last
 * two days" — a much weaker claim wearing the same words. `mission_release` and
 * `document` go back to the beginning, so an empty one really does mean never.
 */
export async function readNeverUsed(db: Db): Promise<TrackedFeature[]> {
  const ids = Object.keys(FEATURES) as TrackedFeature[];
  const counts = await Promise.all(
    ids.map((id) =>
      db
        .from(FEATURES[id].table as "mission_release")
        .select("*", { count: "exact", head: true })
        .then((r) => r.count ?? 0),
    ),
  );
  return ids.filter((_, i) => counts[i] === 0);
}

/** The one sentence explaining why a pooled trip has no takers at all. */
function nobodyReason(matched: Matched[]): string | null {
  // Prefer a Driver who was only HIDDEN from the trip: they could have taken it
  // if they were reachable, which is a fixable problem. A fleet of wrong-class
  // cars is a different (and less actionable) story.
  const nearest =
    matched.find((m) => m.eligibility.verdict === "never_seen") ??
    matched.find((m) => m.eligibility.verdict === "refused");
  if (!nearest) return null;
  const name = `${nearest.fleet.driver.first_name} ${nearest.fleet.driver.last_name}`.trim();
  return `the closest match is ${name}, and ${nearest.eligibility.blocker?.says}`;
}

/**
 * Log entries whose trip has been deleted. `mission_event` has no foreign key to
 * `mission` on purpose (2026-08-24_mission_event_log.sql:78) — the log outlives
 * the trip — so this is a designed consequence, not corruption.
 */
export async function countOrphanedEvents(db: Db): Promise<number> {
  const [events, missions] = await Promise.all([
    readAll<{ mission_id: string | null }>((from, to) =>
      db.from("mission_event").select("mission_id").range(from, to),
    ),
    readAll<{ id: string }>((from, to) => db.from("mission").select("id").range(from, to)),
  ]);
  const live = new Set(missions.map((m) => m.id));
  return events.filter((e) => e.mission_id && !live.has(e.mission_id)).length;
}

/** One trip's log, ordered by lib/mission-story. */
export async function readMissionEvents(db: Db, missionId: string): Promise<MissionEventRow[]> {
  const { data } = await db
    .from("mission_event")
    .select("*")
    .eq("mission_id", missionId)
    .order("seq");
  return (data ?? []) as unknown as MissionEventRow[];
}

/**
 * The home page's numbers band. Every mission, but only the nine columns the
 * band needs — see lib/admin-numbers.
 *
 * ⚑ PAGED, because PostgREST caps a plain `.select()` at 1000 rows and a silent
 * cap does not look like an error, it looks like an answer (S66).
 *
 * ⚑ FLAGGED DEBT, and the founder has it: this reads every mission on every
 * home-page load. Correct and fast at 350; at tens of thousands it becomes a SQL
 * view or an RPC that returns the aggregates, which is a migration the founder
 * runs. Nothing about the band's shape changes when that day comes — only where
 * the arithmetic happens.
 */
export async function readHomeNumbers(now = new Date()): Promise<HomeNumbers> {
  const db = await createClient();
  const rows = await readAll<NumbersRow>((from, to) =>
    db.from("mission").select(HOME_NUMBER_COLS).range(from, to),
  );
  return homeNumbers(rows, now);
}
