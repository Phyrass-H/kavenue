// ⚑ WHY THIS FILE EXISTS.
//
// `homePathForSub()` used to be `sub === "driver" ? "/pool" : "/dispatch"`. The day
// "admin" joined `RoleSub` that ternary would have quietly answered "/dispatch"
// for an admin — a fall-through that looks like an answer, which is the whole
// D86–D90 family. It is now an exhaustive switch, so the compiler catches the next
// one; these tests catch the half the compiler cannot see, namely that every role
// in the database actually maps somewhere and that the mapping round-trips.
import { describe, it, expect } from "vitest";
import {
  PROD_BASE,
  isProdDomain,
  roleSubOf,
  subForRole,
  originForRole,
  urlForRole,
  homePathForSub,
  type RoleSub,
} from "@/lib/hosts";
import type { UserRole } from "@/lib/database.types";

// Every value of `user_role` in docs/kavenue_schema.sql:18.
const ALL_ROLES: UserRole[] = ["driver", "dispatcher", "admin"];
const ALL_SUBS: RoleSub[] = ["driver", "dispatch", "admin"];

describe("isProdDomain", () => {
  it("is true only on kavenue.fr and its subdomains", () => {
    expect(isProdDomain("kavenue.fr")).toBe(true);
    expect(isProdDomain("admin.kavenue.fr")).toBe(true);
    expect(isProdDomain("dispatch.kavenue.fr:443")).toBe(true);
    expect(isProdDomain("localhost:3000")).toBe(false);
    expect(isProdDomain("kavenue-git-main-x.vercel.app")).toBe(false);
    // ⚑ Not a suffix match on the bare string: an attacker domain that merely
    // ENDS with the name must not qualify.
    expect(isProdDomain("notkavenue.fr")).toBe(false);
    expect(isProdDomain(null)).toBe(false);
  });
});

describe("subForRole", () => {
  // ⚑ The guard. Every role the database can hold must have a home subdomain —
  // otherwise that role is served from whatever host it happened to land on and
  // shares another role's session cookie.
  it.each(ALL_ROLES)("maps role=%s to a subdomain", (role) => {
    expect(ALL_SUBS).toContain(subForRole(role));
  });

  it("maps an absent role to nothing", () => {
    expect(subForRole(null)).toBeNull();
    expect(subForRole(undefined)).toBeNull();
  });

  it("puts admin on its own host, not on dispatch (the session-cookie clash)", () => {
    expect(subForRole("admin")).toBe("admin");
    expect(subForRole("admin")).not.toBe(subForRole("dispatcher"));
  });
});

describe("homePathForSub", () => {
  it.each(ALL_SUBS)("gives %s a real path of its own", (sub) => {
    expect(homePathForSub(sub)).toMatch(/^\/[a-z]/);
  });

  it("gives every subdomain a DISTINCT home (no silent fall-through)", () => {
    const homes = ALL_SUBS.map(homePathForSub);
    expect(new Set(homes).size).toBe(ALL_SUBS.length);
  });

  it("sends admin to /admin, not /dispatch", () => {
    expect(homePathForSub("admin")).toBe("/admin");
  });
});

describe("roleSubOf", () => {
  it.each(ALL_SUBS)("reads %s back off its own hostname", (sub) => {
    expect(roleSubOf(`${sub}.${PROD_BASE}`)).toBe(sub);
  });

  it("is null off the role hosts", () => {
    expect(roleSubOf(PROD_BASE)).toBeNull();
    expect(roleSubOf("localhost:3000")).toBeNull();
  });
});

describe("originForRole / urlForRole", () => {
  it.each(ALL_ROLES)("crosses role=%s to its own origin on production", (role) => {
    const url = urlForRole(`dispatch.${PROD_BASE}`, role, "/x");
    expect(url).toBe(`https://${subForRole(role)}.${PROD_BASE}/x`);
  });

  // ⚑ The whole cross-subdomain mechanism must stay a no-op off production, or
  // local dev and previews start redirecting to the live site.
  it.each(ALL_ROLES)("stays a plain path off production for role=%s", (role) => {
    expect(originForRole("localhost:3000", role)).toBeNull();
    expect(urlForRole("localhost:3000", role, "/x")).toBe("/x");
  });
});
