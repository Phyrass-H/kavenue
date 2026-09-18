// S83 ([[d147]]) — "No car match": can ANY Driver on Kavenue take this trip, as it is asked for?
//
// The Business-side answer to one question the founder separated from price: when no Driver
// could ever take the trip, raising the Ceiling buys nothing, so the schedule says so instead of
// "raise your Ceiling". The admin console asks a WIDER question with the same rules
// (lib/admin-activity.ts, trip_nobody_can_take); this one keeps only the rules that money
// cannot move — the CAR and the REACH — and deliberately drops the two that come and go by the
// hour (a Driver busy within 90 minutes, a luggage opt-in): a busy fleet is a price question.
//
// ⚑ FAILS CLOSED, and that is the reason this file does not reuse `readAll`. `readAll` treats a
//   read error as the last page (lib/admin-list.ts), so a failed page would read as "no Drivers"
//   and put "No car match" on EVERY trip on the schedule. Here any error returns NULL for every
//   trip — "not checked" — which TripRow reads as: show no advice at all.
// ⚑ CHEAP ON PURPOSE. The Dispatch schedule re-renders every 4 s while open (LiveRefresh). The
//   fleet (Drivers + cars) is read at most once a minute per server instance and matched in
//   memory; nothing is read when no pooled trip is on screen.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { nobodyFits, type Fleet } from "@/lib/fleet-fit";
import { liveCarOf, workingCarOf } from "@/lib/vehicle-approval";
import type { DriverRow, MissionRow, VehicleRow } from "@/lib/database.types";

type FleetDriverCol =
  | "first_name" | "last_name" | "accepts_luggage_runs" | "base_lat" | "base_lng" | "base_label"
  | "service_radius_km" | "verified" | "operational_zones";
const DRIVER_COLS =
  "id, first_name, last_name, accepts_luggage_runs, base_lat, base_lng, base_label, service_radius_km, verified, operational_zones";
type FleetCar = Pick<
  VehicleRow,
  "id" | "driver_id" | "category" | "body_type" | "make" | "model" | "approval_status" | "retired_at" | "created_at"
>;
const CAR_COLS = "id, driver_id, category, body_type, make, model, approval_status, retired_at, created_at";

const TTL_MS = 60_000;
let cache: { at: number; fleet: Fleet } | null = null;

async function pagedOrThrow<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function readFleet(now: number): Promise<Fleet> {
  if (cache && now - cache.at < TTL_MS) return cache.fleet;
  const db = createAdminClient();
  // ⚑ Only the columns the rules read (review, S83): this cache is process-wide and lives a
  //   minute, so it must not hold anyone's phone, papers or bank details it never uses.
  const [drivers, vehicles] = await Promise.all([
    pagedOrThrow<Pick<DriverRow, "id" | FleetDriverCol>>((f, t) =>
      db.from("driver").select(DRIVER_COLS).order("id").range(f, t),
    ),
    pagedOrThrow<FleetCar>((f, t) => db.from("vehicle").select(CAR_COLS).order("id").range(f, t)),
  ]);
  const byDriver = new Map<string, FleetCar[]>();
  for (const v of vehicles) {
    if (!v.driver_id) continue;
    byDriver.set(v.driver_id, [...(byDriver.get(v.driver_id) ?? []), v]);
  }
  const fleet = drivers.map((driver) => {
    const mine = byDriver.get(driver.id) ?? [];
    return { driver, vehicle: workingCarOf(mine), liveCar: liveCarOf(mine) };
  });
  cache = { at: now, fleet };
  return fleet;
}

/**
 * For every pooled trip still ahead: `true` = no Driver can take it as asked, `false` = at
 * least one could. Trips not in the Pool are absent (the row never asks). On any read error,
 * every asked trip maps to NULL — not checked.
 */
export async function noCarMatch(
  missions: MissionRow[],
  now: Date = new Date(),
): Promise<Map<string, boolean | null>> {
  const asked = missions.filter(
    (m) => m.status === "pooled" && new Date(m.pickup_at).getTime() > now.getTime(),
  );
  const out = new Map<string, boolean | null>();
  if (asked.length === 0) return out;
  let fleet: Fleet;
  try {
    fleet = await readFleet(now.getTime());
  } catch {
    for (const m of asked) out.set(m.id, null);
    return out;
  }
  for (const m of asked) out.set(m.id, nobodyFits(m, fleet, now));
  return out;
}
