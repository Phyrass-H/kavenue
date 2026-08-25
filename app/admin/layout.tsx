// Layout + guard for the Kavenue admin area.
//
// ⚑ THE DATABASE HAS KNOWN ABOUT ADMINS ALL ALONG — the app did not. `app_role()
// ='admin'` appears in RLS policies right across docs/kavenue_schema.sql, granting
// an admin read on driver, business, mission, dispatcher and the side tables. What
// was missing was any way to BE one: routeFor() had no admin branch, so an admin
// landed on /welcome, which redirects to routeFor(), which returned /welcome. An
// infinite redirect that nobody ever hit because no admin account existed (4
// dispatchers, 4 drivers, 0 admins, measured 2026-08-25).
//
// ⚑ IT HAS ITS OWN SUBDOMAIN, admin.kavenue.fr, AND THE SESSION COOKIE IS WHY
// ([[d91]]). This first shipped with no host of its own — served from wherever the
// admin happened to sign in — which meant sharing dispatch's HOST-ONLY session
// cookie: signing in as admin would have signed the founder out of their Business
// account, and back again, all day. The founder pushed back on it as confusing
// before that was even spotted, and they were right twice over — Dispatch is the
// *hotel's* app, and Kavenue's back office does not belong behind a customer's
// front door.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAppContext, routeFor } from "@/lib/app-context";
import { urlForRole, isProdDomain, roleSubOf, homePathForSub, PROD_BASE } from "@/lib/hosts";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const host = (await headers()).get("host");

  if (!ctx.user) redirect("/login");
  // Wrong role → their own area (crossing subdomain on production).
  if (ctx.profile?.role !== "admin") {
    redirect(urlForRole(host, ctx.profile?.role, routeFor(ctx)));
  }
  // Right role, wrong subdomain (production only) → bounce to the Admin host, so
  // the session cookie lands where it belongs. Same shape as the Driver and
  // Dispatch layouts; keep all three identical.
  if (isProdDomain(host) && roleSubOf(host) !== "admin") {
    redirect(`https://admin.${PROD_BASE}${homePathForSub("admin")}`);
  }

  return <>{children}</>;
}
