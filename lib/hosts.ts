// Role ↔ subdomain mapping for the production domain.
//
// In production the two sides of Kavenue live on separate subdomains:
//   • driver.kavenue.fr    → the Driver app (Pool, My Rides, …)
//   • dispatch.kavenue.fr  → the Business / Dispatch app
//   • admin.kavenue.fr     → Kavenue's own back office (added 2026-08-25, [[d91]])
//
// Separate hosts means separate (host-only) session cookies, so a person can be
// signed in as a Driver on one and a Business on the other at the same time —
// which is the whole point: no more "it switched roles" when testing both.
//
// EVERYWHERE ELSE — localhost and the *.vercel.app preview/prod URLs — both
// roles share a single origin and we route by path (today's behavior). All the
// cross-subdomain logic below is a no-op off the production domain, so local dev
// and previews are unaffected.
import type { UserRole } from "@/lib/database.types";

export const PROD_BASE = "kavenue.fr";

// ⚑ ADMIN IS A HOST OF ITS OWN, AND THE SESSION COOKIE IS THE REASON. It first
// shipped with no subdomain ([[d90]]), which would have meant sharing dispatch's
// host-only cookie — so signing in as admin would have signed the founder OUT of
// their Business account, and back again, all day. Exactly the clash the split
// above exists to prevent. Dispatch is also the *hotel's* app; Kavenue's back
// office does not belong behind a customer's front door. See [[d91]].
export type RoleSub = "driver" | "dispatch" | "admin";

function hostname(host?: string | null): string {
  return (host ?? "").split(":")[0].toLowerCase();
}

/** True only on the role-separated production domain (*.kavenue.fr). */
export function isProdDomain(host?: string | null): boolean {
  const h = hostname(host);
  return h === PROD_BASE || h.endsWith("." + PROD_BASE);
}

/** Which role-subdomain we're currently on, if any. */
export function roleSubOf(host?: string | null): RoleSub | null {
  const label = hostname(host).split(".")[0];
  return label === "driver" || label === "dispatch" || label === "admin" ? label : null;
}

/** The subdomain a given role belongs on (unknown role → none). */
export function subForRole(role: UserRole | null | undefined): RoleSub | null {
  if (role === "driver") return "driver";
  if (role === "dispatcher") return "dispatch";
  if (role === "admin") return "admin";
  return null;
}

/**
 * Absolute origin (https://sub.base) a role belongs on — but only when we're on
 * the production domain. On shared hosts (localhost, *.vercel.app) returns null,
 * so callers fall back to a plain path and nothing crosses origins.
 */
export function originForRole(
  currentHost: string | null | undefined,
  role: UserRole | null | undefined,
): string | null {
  if (!isProdDomain(currentHost)) return null;
  const sub = subForRole(role);
  return sub ? `https://${sub}.${PROD_BASE}` : null;
}

/**
 * Redirect target for `role` going to `path`: crosses to the right subdomain on
 * production, otherwise just the path (single-origin behavior preserved).
 */
export function urlForRole(
  currentHost: string | null | undefined,
  role: UserRole | null | undefined,
  path: string,
): string {
  const origin = originForRole(currentHost, role);
  return origin ? origin + path : path;
}

/** Home path for a role-subdomain (used to bounce a right-role/wrong-subdomain hit).
 *
 *  ⚑ A SWITCH, NOT A TERNARY, AND THAT IS THE POINT. This read
 *  `sub === "driver" ? "/pool" : "/dispatch"` — so the moment "admin" joined
 *  RoleSub it would have silently answered "/dispatch" for an admin. A fall-through
 *  that looks like an answer is the whole D86–D90 family. The `never` assignment
 *  below makes the COMPILER refuse the next RoleSub added without a path here. */
export function homePathForSub(sub: RoleSub): string {
  switch (sub) {
    case "driver":
      return "/pool";
    case "dispatch":
      return "/dispatch";
    case "admin":
      return "/admin";
    default: {
      const unhandled: never = sub;
      throw new Error(`homePathForSub: no home path for subdomain ${String(unhandled)}`);
    }
  }
}

/**
 * The dev-login endpoint on a given role's OWN subdomain, so the host-only
 * session cookie lands on the correct host. On shared hosts returns a relative
 * path (current single-origin behavior). `qs` includes the leading "?".
 */
export function devLoginHref(
  currentHost: string | null | undefined,
  sub: RoleSub,
  qs: string,
): string {
  if (isProdDomain(currentHost)) return `https://${sub}.${PROD_BASE}/api/dev-login${qs}`;
  return `/api/dev-login${qs}`;
}
