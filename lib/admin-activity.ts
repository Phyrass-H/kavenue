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
import { liveCarOf, workingCarOf } from "@/lib/vehicle-approval";
import type { ActivitySnapshot, TrackedFeature } from "@/lib/activity-findings";
import { FEATURES, splitByUse, type CountReply } from "@/lib/activity-findings";
import { tripLabel } from "@/lib/activity-findings";
import { tallyActivity, type Activity, type HeldMission } from "@/lib/admin-list";
import type { MissionEventRow } from "@/lib/mission-events";
import {
  homeNumbers,
  HOME_NUMBER_COLS,
  type HomeNumbers,
  type NumbersRow,
} from "@/lib/admin-numbers";
import { readAll } from "@/lib/admin-list";
import {
  firstTrips,
  DROVE_STATUSES,
  type FirstTrips,
  type FirstTripMission,
  type FirstTripBusiness,
} from "@/lib/first-trips";
import type { DriverRow, VehicleRow, MissionRow } from "@/lib/database.types";

type Db = Awaited<ReturnType<typeof createClient>>;

export interface DriverWithCar {
  driver: DriverRow;
  /** ⚑ S78 — the WORKING car: approved, not retired. NULL means this Driver cannot take
   *  anything, and `liveCar` says whether that is "no car" or "a car nobody has looked at". */
  vehicle: VehicleRow | null;
  /** The car ON FILE, any state. What the console shows, and what explains a missing one. */
  liveCar: VehicleRow | null;
}

/** Every Driver with the car they declared — the fleet, as the rules see it. */
export async function readFleet(db: Db): Promise<DriverWithCar[]> {
  // ⚑ PAGED. PostgREST returns at most 1 000 rows to an unbounded select and
  // says nothing about the rest — measured on this database on 2026-08-30,
  // `mission_event` came back 1 000 of 2 503 with no error. At 1 001 Drivers the
  // fleet would silently lose everyone after the thousandth, and the console's
  // flagship answer — "why can't this Driver take this trip?" — would be missing
  // Drivers it never mentions.
  const [drivers, vehicles] = await Promise.all([
    readAll<DriverRow>((from, to) =>
      db.from("driver").select("*").order("first_name").range(from, to),
    ),
    readAll<VehicleRow>((from, to) => db.from("vehicle").select("*").range(from, to)),
  ]);
  return drivers.map((driver) => {
    // ⚑ S78 — ONE RULE, and it is the same one the database uses (working_car(uuid)). The
    //   old pick — the `is_active` row, else any row — disagreed with three other readers
    //   ([[d113]]: three answers for one trip) and, worse, would now show a RETIRED car as
    //   the Driver's own. `is_active` is not consulted at all: nothing writes it, and "no car
    //   pause" is a decided product rule.
    const mine = vehicles.filter((v) => v.driver_id === driver.id);
    const liveCar = liveCarOf(mine);
    return { driver, liveCar, vehicle: workingCarOf(mine) };
  });
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
  // ⚑ PAGED. This feeds the ±90-minute clash rule in the matcher — the check
  // that says whether a Driver is already busy. Truncated at 1 000, it would
  // report a Driver as FREE when they are not, and the console's flagship
  // sentence would be confidently wrong rather than merely incomplete.
  const data = await readAll<{ driver_id: string | null; pickup_at: string }>((from, to) =>
    db
      .from("mission")
      .select("driver_id, pickup_at")
      .in("status", ["accepted", "confirmed", "en_route", "arrived", "on_board"])
      .not("driver_id", "is", null)
      .range(from, to),
  );
  const byDriver = new Map<string, string[]>();
  for (const m of data) {
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
      liveVehicle: f.liveCar,
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
    // ⚑ Both paged. The pooled read decides "nobody can take this trip", and the
    // cancelled read is one half of "cancelled trips that don't say who
    // cancelled them" — a finding, not a list, so a truncated read does not
    // shorten it, it makes it WRONG.
    readAll<MissionRow>((from, to) =>
      db
        .from("mission_read")
        .select("*")
        .eq("status", "pooled")
        .gt("pickup_at", nowIso)
        .order("pickup_at")
        .range(from, to),
    ),
    readAll<{ id: string; pickup_label: string | null; dropoff_label: string | null; cancelled_at: string | null }>(
      (from, to) =>
        db
          .from("mission")
          .select("id, pickup_label, dropoff_label, cancelled_at")
          .eq("status", "cancelled")
          .range(from, to),
    ),
  ]);

  const pooled = pooledRes.map((mission) => {
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
  // ⚑ THE MOST DANGEROUS READ IN THE FILE, AND THE REASON THIS PASS EXISTS.
  // Truncated at 1 000, `recorded` would be MISSING records — so trips that DO
  // say who cancelled them would be reported as trips that don't. The finding
  // would not merely under-count; it would name innocent rows, and there would
  // be nothing on screen to suggest it was lying.
  const records = await readAll<{ mission_id: string }>((from, to) =>
    db.from("mission_cancellation").select("mission_id").range(from, to),
  );
  const recorded = new Set(records.map((r) => r.mission_id));
  const cancelledWithoutRecord = cancelledRes.filter((m) => !recorded.has(m.id));

  // Trips handed back more than once. `repooled` is a trigger event, so this is
  // observed, not inferred.
  const repools = await readAll<{ mission_id: string }>((from, to) =>
    db.from("mission_event").select("mission_id").eq("event_type", "repooled").range(from, to),
  );
  const tally = new Map<string, number>();
  for (const r of repools) if (r.mission_id) tally.set(r.mission_id, (tally.get(r.mission_id) ?? 0) + 1);
  const repeatIds = [...tally.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  // ⚑ Paged too. `.in()` bounds the QUERY, not the RESPONSE — PostgREST still
  // caps what comes back at 1 000, so on a marketplace with more than a thousand
  // passed-around trips the finding would quietly name only some of them.
  const repeatRows = repeatIds.length
    ? await readAll<{ id: string; pickup_label: string | null; dropoff_label: string | null }>(
        (from, to) =>
          db
            .from("mission")
            .select("id, pickup_label, dropoff_label")
            .in("id", repeatIds)
            .range(from, to),
      )
    : [];
  const passedAround = repeatRows.map((m) => ({
    id: m.id,
    label: tripLabel(m),
    times: tally.get(m.id) ?? 0,
  }));

  return {
    pooled,
    drivers: fleet.map((f) => f.driver),
    documentsWaiting: await readDocumentsWaiting(db, new Set(fleet.map((f) => f.driver.id))),
    // ⚑ S78 — read off the fleet we already have, not with a second query: `readFleet` has
    //   every car row and has already applied the one rule for "which car is theirs".
    carsWaiting: fleet
      .filter((f) => f.liveCar && !f.liveCar.retired_at && f.liveCar.approval_status === "pending")
      .map((f) => ({
        driverId: f.driver.id,
        // ⚑ pending_since, not created_at — a car corrected in place keeps the date it was
        //   FIRST filed, so the wait shown would include the days the Driver took.
        filedAt: f.liveCar!.pending_since ?? f.liveCar!.created_at,
        says: [f.liveCar!.make, f.liveCar!.model].filter(Boolean).join(" ") || "a car",
        plate: f.liveCar!.plate,
      })),
    // ⚑ Spread, because the count now answers TWO questions — which features are
    //   unused, and which could not be asked about at all.
    ...(await readNeverUsed(db)),
    cancelledWithoutRecord,
    passedAround,
    orphanedEvents: await countOrphanedEvents(db),
  };
}

/**
 * Drivers holding a document nobody has judged yet — one entry per DRIVER.
 *
 * ⚑ AN ADMIN SESSION CAN READ THIS, and it is worth saying why out loud, because
 * `2026-09-04b_document_review.sql` says `document` has "exactly one policy,
 * SELECT only" and that sentence is easy to misread as owner-only. The policy's
 * FIRST branch is `app_role()='admin'` (docs/kavenue_schema.sql:301) — so the
 * console reads every Driver's papers on the admin's own session, and does NOT
 * need the service role. What `document` has no policy for is UPDATE, which is
 * why the review WRITE goes through a server action instead.
 *
 * ⚑ DRIVERS ONLY. The Business side of review is not built (founder,
 * 2026-09-04: *"let's finish driver first"*), `business.verified` does not exist
 * and zero business documents have ever been uploaded. Firing on one would point
 * at a review screen that isn't there.
 *
 * ⚑ AND ONLY FOR A DRIVER WHO STILL EXISTS. `document.owner_id` has no foreign
 * key — it is polymorphic — so a deleted Driver leaves their papers behind. A
 * finding about them would carry no name and link to a 404.
 */
export async function readDocumentsWaiting(
  db: Db,
  liveDriverIds: ReadonlySet<string>,
): Promise<ActivitySnapshot["documentsWaiting"]> {
  // ⚑ PAGED, like every other read here. A truncated list would UNDER-report the
  // one check that is waiting on a person, and there is nothing on screen that
  // would look wrong — the missing Driver simply never appears.
  const rows = await readAll<{ owner_id: string; uploaded_at: string }>((from, to) =>
    db
      .from("document")
      .select("owner_id, uploaded_at")
      .eq("owner_type", "driver")
      .eq("status", "pending")
      .range(from, to),
  );
  const byDriver = new Map<string, { driverId: string; count: number; oldestUploadedAt: string }>();
  for (const r of rows) {
    if (!liveDriverIds.has(r.owner_id)) continue;
    const held = byDriver.get(r.owner_id);
    if (!held) byDriver.set(r.owner_id, { driverId: r.owner_id, count: 1, oldestUploadedAt: r.uploaded_at });
    else {
      held.count++;
      if (r.uploaded_at < held.oldestUploadedAt) held.oldestUploadedAt = r.uploaded_at;
    }
  }
  // Longest wait first, so the founder reads the most embarrassing one first.
  return [...byDriver.values()].sort((a, b) => a.oldestUploadedAt.localeCompare(b.oldestUploadedAt));
}

/**
 * The first drive of every Driver — see lib/first-trips.ts for what counts as one.
 *
 * ⚑ FLAGGED DEBT, the same one `readHomeNumbers` carries: finding the EARLIEST
 * trip per Driver means reading every trip a Driver has ever held, because there
 * is no way to ask for "the first" without them. Correct and fast at 267 rows;
 * the day this hurts it becomes a SQL view (`distinct on (driver_id) … order by
 * pickup_at`), which is a migration the founder runs. Nothing about the list's
 * shape changes then — only where the sorting happens.
 */
export async function readFirstTrips(now = new Date()): Promise<FirstTrips> {
  const db = await createClient();
  const [drivers, missions, businesses] = await Promise.all([
    readAll<DriverRow>((from, to) =>
      db.from("driver").select("*").order("created_at").range(from, to),
    ),
    // ⚑ The status filter comes from the type-keyed map in lib/first-trips, not
    // from a list typed out here — a new mission status is a compile error there
    // and would otherwise be silently dropped from this read.
    readAll<FirstTripMission>((from, to) =>
      db
        .from("mission")
        .select(
          "id, driver_id, status, pickup_at, pickup_label, dropoff_label, pickup_address, dropoff_address, business_id",
        )
        .not("driver_id", "is", null)
        .in("status", DROVE_STATUSES)
        .range(from, to),
    ),
    readAll<FirstTripBusiness>((from, to) =>
      db.from("business").select("id, name, reception_phone").range(from, to),
    ),
  ]);
  return firstTrips(drivers, missions, businesses, now);
}

/**
 * Which shipped features have never been used, once.
 *
 * ⚑ READ FROM THE DOMAIN TABLE, NEVER FROM THE EVENT LOG. The log only started
 * on 2026-08-24, so "no release_proposed events" would mean "nobody in the last
 * two days" — a much weaker claim wearing the same words. `mission_release` and
 * `document` go back to the beginning, so an empty one really does mean never.
 */
export async function readNeverUsed(
  db: Db,
): Promise<Pick<ActivitySnapshot, "neverUsed" | "uncountable">> {
  const ids = Object.keys(FEATURES) as TrackedFeature[];
  const replies = await Promise.all(
    ids.map(async (id) => {
      // ⚑ `select("id")`, NEVER `select("*")`. A HEAD request sends whatever the
      // select names, and `*` names every column — including ones the
      // `authenticated` role does not hold. S72 revoked `select (ceiling)` on
      // `mission`, so `select=*` there is a flat 403 for an admin session
      // (measured 2026-09-07; `select=id` returns 377).
      const { count, error } = await db
        .from(FEATURES[id].table as "mission_release")
        .select("id", { count: "exact", head: true });
      return { count, error } satisfies CountReply;
    }),
  );
  // ⚑ The reading of those numbers lives in lib/activity-findings, not here —
  // this function does I/O, splitByUse decides what an absent count means. The
  // `?? 0` that used to sit on this line is the bug the split exists to prevent.
  return splitByUse(ids, replies);
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
    db.from("mission_read").select(HOME_NUMBER_COLS).range(from, to),
  );
  return homeNumbers(rows, now);
}
