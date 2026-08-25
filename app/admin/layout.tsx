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
// ⚑ NO SUBDOMAIN OF ITS OWN, DELIBERATELY. `subForRole()` maps admin → null, so
// `urlForRole()` returns a plain path and the admin area is served from whichever
// host they signed in on (dispatch.kavenue.fr/admin in practice). Giving it
// admin.kavenue.fr would mean a DNS record, a Vercel domain and a new Supabase
// redirect URL — infrastructure, for a surface only the founder uses. Revisit if
// anyone but the founder ever gets an admin account.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAppContext, routeFor } from "@/lib/app-context";
import { urlForRole } from "@/lib/hosts";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const host = (await headers()).get("host");

  if (!ctx.user) redirect("/login");
  // Wrong role → their own area (crossing subdomain on production).
  if (ctx.profile?.role !== "admin") {
    redirect(urlForRole(host, ctx.profile?.role, routeFor(ctx)));
  }

  return <>{children}</>;
}
