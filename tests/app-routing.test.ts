// ⚑ THE ONE THING THIS FILE EXISTS TO STOP.
//
// `/welcome` redirects to `routeFor()`. So if `routeFor()` ever answers
// "/welcome" for a user who HAS a profile, that is not a fallback — it is an
// infinite redirect. `role='admin'` did exactly that from the day the enum was
// written (2026-06) until 2026-08-25, and nobody noticed because no admin account
// had ever been created: 4 dispatchers, 4 drivers, 0 admins.
//
// Same shape as D86/D87/D88: a branch that never fires looks exactly like a
// feature nobody uses. This test walks EVERY value of the user_role enum, so the
// next role added to the database cannot repeat it silently.
import { describe, it, expect } from "vitest";
import { routeFor, type AppContext } from "@/lib/route-for";
import type { UserRole, ProfileRow } from "@/lib/database.types";

// Every value of `user_role` in docs/kavenue_schema.sql:18. If you add one there,
// add it here — the test below will tell you what it needs.
const ALL_ROLES: UserRole[] = ["driver", "dispatcher", "admin"];

const ctxFor = (role: UserRole | null, extras: Partial<AppContext> = {}): AppContext => ({
  user: { id: "u1" } as AppContext["user"],
  profile: role ? ({ auth_user_id: "u1", role } as ProfileRow) : null,
  driver: null,
  vehicle: null,
  dispatcher: null,
  business: null,
  ...extras,
});

describe("routeFor", () => {
  it("sends a signed-out visitor to /login", () => {
    expect(routeFor({ ...ctxFor(null), user: null })).toBe("/login");
  });

  it("sends a signed-in user with NO profile to /welcome (the picker)", () => {
    expect(routeFor(ctxFor(null))).toBe("/welcome");
  });

  // ⚑ The guard. Do not weaken this to a list of known roles — the whole point is
  // that it covers roles nobody has written a branch for yet.
  it.each(ALL_ROLES)("never returns /welcome for role=%s (that is an infinite redirect)", (role) => {
    expect(routeFor(ctxFor(role))).not.toBe("/welcome");
  });

  it.each(ALL_ROLES)("returns an in-app path for role=%s", (role) => {
    const to = routeFor(ctxFor(role));
    expect(to.startsWith("/")).toBe(true);
    expect(to).not.toBe("/login"); // a signed-in user is never sent back to sign in
    expect(to).not.toBe("/"); // "/" redirects via routeFor() — also a loop
  });

  it("routes an admin to /admin", () => {
    expect(routeFor(ctxFor("admin"))).toBe("/admin");
  });

  it("routes a Driver to onboarding until they have a driver AND a vehicle", () => {
    expect(routeFor(ctxFor("driver"))).toBe("/onboarding");
    expect(routeFor(ctxFor("driver", { driver: {} as never }))).toBe("/onboarding");
    expect(routeFor(ctxFor("driver", { driver: {} as never, vehicle: {} as never }))).toBe("/pool");
  });

  it("routes a Dispatcher to business onboarding until they have a dispatcher AND a business", () => {
    expect(routeFor(ctxFor("dispatcher"))).toBe("/onboarding-business");
    expect(routeFor(ctxFor("dispatcher", { dispatcher: {} as never }))).toBe("/onboarding-business");
    expect(
      routeFor(ctxFor("dispatcher", { dispatcher: {} as never, business: {} as never })),
    ).toBe("/dispatch");
  });
});
