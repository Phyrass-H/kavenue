// Layout + auth guard for the signed-in Driver area (Pool, mission detail,
// My Rides). Non-drivers are routed to where they belong — and on the production
// domain, to the Driver subdomain (driver.*) specifically.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DriverTabbar } from "@/components/driver-tabbar";
import { WaybillCacheSync } from "@/components/offline-waybills";
import { getAppContext, routeFor } from "@/lib/app-context";
import { createClient } from "@/lib/supabase/server";
import { CHECK_IN_GRACE_MS, CHECK_IN_OPENS_MS, needsClosing } from "@/lib/dispatch-status";
import { urlForRole, isProdDomain, roleSubOf, homePathForSub, PROD_BASE } from "@/lib/hosts";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAppContext();
  const host = (await headers()).get("host");

  if (!ctx.user) redirect("/login");
  // Wrong role → their area (crossing subdomain on production).
  if (ctx.profile?.role !== "driver") {
    redirect(urlForRole(host, ctx.profile?.role, routeFor(ctx)));
  }
  // Right role, wrong subdomain (production only) → bounce to the Driver host.
  if (isProdDomain(host) && roleSubOf(host) !== "driver") {
    redirect(`https://driver.${PROD_BASE}${homePathForSub("driver")}`);
  }
  if (!ctx.driver || !ctx.vehicle) redirect("/onboarding");

  // D61 — how many trips are waiting on a check-in, for the My Rides tab badge.
  // Counted here rather than in the page so it shows wherever the Driver is in
  // the app: without push, the badge IS the notification. `head: true` sends the
  // count only — no rows over the wire. Mirrors checkInOpen() in SQL terms.
  const supabase = await createClient();
  const { count: checkInCount } = await supabase
    .from("mission")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", ctx.driver.id)
    .eq("status", "confirmed")
    .is("checked_in_at", null)
    .lte("pickup_at", new Date(Date.now() + CHECK_IN_OPENS_MS).toISOString())
    // Both bounds, or a trip left `confirmed` since last month counts forever.
    .gte("pickup_at", new Date(Date.now() - CHECK_IN_GRACE_MS).toISOString());

  // § Q — how many trips are waiting to be closed. Can't be a `head: true` count
  // like the one above: `needsClosing` compares pickup_at against a per-row
  // duration, and PostgREST has no column-to-column filter. So we take the cheap
  // upper bound in SQL (active, pickup already past — the predicate needs at
  // least pickup + 1h) and apply the real rule in TS, against the one function
  // the rest of the app uses. A Driver has a handful of live trips, not a page.
  const { data: openRows } = await supabase
    .from("mission")
    .select("status, pickup_at, duration_min, waiting_to, waypoints, stops_reached, mission_type")
    .eq("driver_id", ctx.driver.id)
    .in("status", ["accepted", "confirmed", "en_route", "arrived", "on_board"])
    .lt("pickup_at", new Date().toISOString());
  const closingCount = (openRows ?? []).filter((m) => needsClosing(m)).length;

  return (
    <>
      <main className="dapp-main">{children}</main>
      <DriverTabbar checkInCount={checkInCount ?? 0} closingCount={closingCount} />
      {/* § 4 — invisible. Registers the service worker and refreshes the saved Waybills
          on every Driver page open. It lives HERE rather than on /waybills because a
          Driver who never opens that screen still has to be covered when the signal
          goes; the save is the app's job, not a button they must remember. */}
      <WaybillCacheSync />
    </>
  );
}
