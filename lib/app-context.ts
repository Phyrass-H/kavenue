// Role-aware session context. One app serves both surfaces (Driver PWA +
// Dispatch) keyed off profile.role. Use this for routing and area guards;
// the Driver pages also have getDriverContext for their narrower needs.
import { createClient } from "@/lib/supabase/server";
import type {
  ProfileRow,
  DriverRow,
  VehicleRow,
  DispatcherRow,
  BusinessRow,
} from "@/lib/database.types";
// ⚑ The context SHAPE and the routing rule live in lib/route-for.ts — pure, no
// Supabase import, therefore testable (tests/app-routing.test.ts). This module is
// the half that talks to the database. Both names are re-exported here so every
// existing `from "@/lib/app-context"` import is unchanged.
import { liveCarOf } from "@/lib/vehicle-approval";
import { type AppContext, routeFor } from "@/lib/route-for";
export { routeFor };
export type { AppContext };

export async function getAppContext(): Promise<AppContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: AppContext = {
    user: null,
    profile: null,
    driver: null,
    liveCar: null,
    dispatcher: null,
    business: null,
  };
  if (!user) return empty;

  const { data: profile } = await supabase
    .from("profile")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const ctx: AppContext = { ...empty, user, profile: profile ?? null };

  if (profile?.role === "driver") {
    const { data: driver } = await supabase
      .from("driver")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    ctx.driver = driver ?? null;
    if (driver) {
      // ⚑ S78 — the car ON FILE, whatever a person has decided about it. Routing must not ask
      //   whether it is approved (see lib/route-for.ts): a pending car still means enrollment
      //   is done. Retired rows are excluded by liveCarOf, never by a filter a caller can
      //   forget.
      const { data: cars } = await supabase
        .from("vehicle")
        .select("*")
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: true });
      ctx.liveCar = liveCarOf(cars ?? []);
    }
  } else if (profile?.role === "dispatcher") {
    const { data: dispatcher } = await supabase
      .from("dispatcher")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    ctx.dispatcher = dispatcher ?? null;
    if (dispatcher) {
      const { data: business } = await supabase
        .from("business")
        .select("*")
        .eq("id", dispatcher.business_id)
        .maybeSingle();
      ctx.business = business ?? null;
    }
  }

  return ctx;
}
