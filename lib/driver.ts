// Server helper: resolve the logged-in Auth user to their Driver + car.
//
// ⚑⚑ S78 — THERE ARE TWO CARS IN THIS CONTEXT AND THEY ARE NOT THE SAME THING.
//   liveCar    — the car the Driver has on file, whatever a person has decided about it.
//                Their settings page shows it; the enrollment guard asks whether it exists.
//   workingCar — the same row ONLY when a person has approved it. The Pool, the accept and
//                the Waybill ask this one. NULL means: this Driver cannot work right now.
// The founder's rule: *"a driver with no approved car just cannot access the pool, period"*.
//
// ⚑ The old field was called `vehicle` and meant "the oldest row" — one of FOUR disagreeing
// rules in this codebase ([[d113]] found three answers for one trip). Renaming it is what
// forced the compiler to visit every reader when the rule changed; do not add it back.
import { createClient } from "@/lib/supabase/server";
import type { DriverRow, VehicleRow } from "@/lib/database.types";
import { liveCarOf, workingCarOf } from "@/lib/vehicle-approval";
import type { User } from "@supabase/supabase-js";

export interface DriverContext {
  user: User | null;
  driver: DriverRow | null;
  /** On file, any status. NULL = this Driver has never filed a car. */
  liveCar: VehicleRow | null;
  /** Approved and not retired. NULL = cannot take work. */
  workingCar: VehicleRow | null;
}

export async function getDriverContext(): Promise<DriverContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, driver: null, liveCar: null, workingCar: null };

  const { data: driver } = await supabase
    .from("driver")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let liveCar: VehicleRow | null = null;
  if (driver) {
    // ⚑ Every car, retired ones included, and the predicate decides — rather than a
    //   `.is("retired_at", null)` filter repeated at each call site. A filter can be
    //   forgotten; liveCarOf/workingCarOf are the only two answers there are.
    const { data: cars } = await supabase
      .from("vehicle")
      .select("*")
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: true });
    liveCar = liveCarOf(cars ?? []);
  }

  return { user, driver, liveCar, workingCar: workingCarOf(liveCar ? [liveCar] : []) };
}
