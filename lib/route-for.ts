// The pure half of the session context: the shape, and the question "where does
// this user belong right now?".
//
// ⚑ SPLIT OUT OF lib/app-context.ts ON 2026-08-25 SO IT CAN BE TESTED. That module
// imports lib/supabase/server, which reads the environment at module load — so any
// test of routeFor() died on `Missing environment variable NEXT_PUBLIC_SUPABASE_URL`
// before running a line, and would have died the same way in CI, which has no
// `.env.local`. The routing rule is pure logic and belongs with the other pure
// logic (lib/pdp.ts, lib/rate-card.ts). `lib/app-context.ts` re-exports both names,
// so every existing import keeps working.
import type {
  ProfileRow,
  DriverRow,
  VehicleRow,
  DispatcherRow,
  BusinessRow,
} from "@/lib/database.types";
import type { User } from "@supabase/supabase-js";

export interface AppContext {
  user: User | null;
  profile: ProfileRow | null;
  driver: DriverRow | null;
  vehicle: VehicleRow | null;
  dispatcher: DispatcherRow | null;
  business: BusinessRow | null;
}

/** Where this user belongs right now. Never returns "/" or "/login" for a
 *  logged-in user, so it's safe to redirect to from "/" and "/login".
 *
 *  ⚑ AND, FOR A USER WHO HAS A PROFILE, IT MUST NEVER RETURN "/welcome".
 *  `/welcome` redirects to `routeFor()`, so a role that falls through here comes
 *  straight back — an infinite redirect, not an error page. `role='admin'` did
 *  exactly that from the day the enum was written until 2026-08-25; nobody hit it
 *  only because no admin account had ever been created (4 dispatchers, 4 drivers,
 *  0 admins). `tests/app-routing.test.ts` walks every value of the enum so the
 *  next role added cannot repeat it, and `/welcome` now refuses to follow a
 *  self-referential answer. */
export function routeFor(ctx: AppContext): string {
  if (!ctx.user) return "/login";
  if (!ctx.profile) return "/welcome";
  if (ctx.profile.role === "driver") {
    return ctx.driver && ctx.vehicle ? "/pool" : "/onboarding";
  }
  if (ctx.profile.role === "dispatcher") {
    return ctx.dispatcher && ctx.business ? "/dispatch" : "/onboarding-business";
  }
  if (ctx.profile.role === "admin") return "/admin";
  return "/welcome";
}
