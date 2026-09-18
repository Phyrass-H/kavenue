// S83 ([[d147]]) — the pure half of "No car match" (lib/fleet-match.ts reads the fleet; this
// decides). Kept apart so the test can drive it without a database or the server-only guard.
import { explainEligibility, type EligibilityRuleId } from "@/lib/eligibility";
import type { DriverRow, MissionRow, VehicleRow } from "@/lib/database.types";

export type Fleet = {
  driver: Pick<DriverRow, "first_name" | "last_name" | "accepts_luggage_runs" | "base_lat" | "base_lng" | "base_label" | "service_radius_km" | "verified" | "operational_zones">;
  vehicle: Pick<VehicleRow, "category" | "body_type" | "make" | "model"> | null;
  liveCar: VehicleRow | null;
}[];

/**
 * Which rules decide "no car match". Type-keyed, so a rule added to lib/eligibility.ts is a
 * compile error here until someone decides whether money could get past it.
 */
export const CAR_AND_REACH: Record<EligibilityRuleId, boolean> = {
  approved: true, //         an unapproved Driver takes nothing, at any price
  car_approved: true, //     nor one whose car nobody has approved
  vehicle_class: true, //    the car itself
  vehicle_body: true,
  specific_car: true,
  has_base: true, //         the reach
  within_radius: true,
  still_pooled: false, //    the trip's own state — the caller only asks about pooled trips
  not_past_due: false,
  slot_free: false, //       busy for an hour: a price question, not a car question
  luggage_opt_in: false, //  a luggage run cannot change car; its opt-in is not a car
};

/** True when no Driver's car and reach fit the trip. Pure — the test drives it directly. */
export function nobodyFits(mission: MissionRow, fleet: Fleet, now: Date): boolean {
  return !fleet.some(({ driver, vehicle, liveCar }) =>
    explainEligibility({ mission, driver, vehicle, liveVehicle: liveCar, otherPickupsAt: [], now })
      .rules.filter((r) => CAR_AND_REACH[r.id])
      .every((r) => r.ok),
  );
}

