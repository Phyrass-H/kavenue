import type { ReactNode } from "react";
import type { PoolMissionRow } from "@/lib/database.types";
import Link from "next/link";
import { MapPin, Radar, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDriverContext } from "@/lib/driver";
import { sweepExpiredMissions, sweepLapsedHolds } from "@/lib/expiry";
import { MissionCard } from "@/components/mission-card";
import { poolFaresNet } from "@/lib/pool-fares";
import { serviceClassLabel } from "@/lib/format";
import { withinRadius } from "@/lib/geo";
import { carMatches } from "@/lib/vehicle-catalog";

// The Pool changes constantly (PDP climbs, others accept) → never cache.
export const dynamic = "force-dynamic";

// Pool screen header: title + a context subtitle, with a "Live" cue when trips
// are on screen (the Pool is force-dynamic — it really does update on refresh).
function PoolHead({ sub, live = false }: { sub: ReactNode; live?: boolean }) {
  return (
    <div className="pool-head">
      <div>
        <h1 className="pool-head__title">Pool</h1>
        <div className="pool-head__sub">{sub}</div>
      </div>
      {live && (
        <span className="pool-head__live">
          <span className="pool-head__dot" />
          Live
        </span>
      )}
    </div>
  );
}

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const { driver, vehicle } = await getDriverContext();
  // Guarded by (app)/layout, but keep TypeScript happy.
  if (!driver || !vehicle) return null;

  // DEV-ONLY testing bypass: `/pool?all=1` shows EVERY pooled mission, skipping
  // the tier/zone/body/luggage/specific-car filters — so a single demo Driver can
  // exercise the whole Pool (e.g. a Class-E sedan seeing luggage/van/luxury runs).
  // Gated by the same NODE_ENV/VERCEL idiom as dev-login + seed, so it can never
  // reach a real Driver in production.
  //
  // ⚑ (§ B, 2026-08-11) THE BYPASS IS NOW LISTING-ONLY. accept_mission enforces
  // tier / required body / luggage consent in SQL, and SQL cannot read NODE_ENV
  // (dev and prod share one Supabase project), so a trip shown here may still
  // refuse the accept. To demo another tier, change the car in /settings/vehicle,
  // or sign in as a seeded per-tier Driver via /api/dev-login?email=…
  const { all: allParam } = await searchParams;
  const hosted = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  const seeAll = !hosted && allParam === "1";

  // No base yet → can't match by distance. Send them to set it. (Skipped in the
  // dev see-all view, which ignores the base entirely.)
  if (!seeAll && (driver.base_lat == null || driver.base_lng == null)) {
    return (
      <>
        <PoolHead sub="Set your service area to see trips" />
        <div className="pempty">
          <div className="pempty__ic">
            <MapPin size={26} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="pempty__t">Set your base and radius</p>
          <p className="pempty__s">
            The Pool matches trips near you. Tell us where you’re based and how far you’ll
            drive, and matching trips appear here.
          </p>
          <Link href="/settings" className="pempty__cta">
            <Settings size={16} strokeWidth={1.9} aria-hidden="true" />
            Set your service area
          </Link>
        </div>
      </>
    );
  }

  const supabase = await createClient();

  // § P — close out anything that went past due since the last read, then never
  // list a past-due trip. Both matter: the sweep writes the honest `expired`
  // status the Business sees, the floor below is what actually protects a Driver
  // if the sweep is behind or fails.
  await sweepExpiredMissions(supabase);
  // § 7 — and settle any hold whose clock ran out, so `hold_lapsed` exists at all (D109).
  // ⚑ Rides here rather than anywhere else because this is the page that renders holds: the
  //   Driver who is about to see a card come back is the one whose read should have noticed
  //   it went. Never throws, and nothing above depends on it — the mask on
  //   mission_read.hold_expires_at already hides a dead hold whether or not this ran.
  await sweepLapsedHolds(supabase);

  // Pool = pooled missions matching the Driver's category. RLS lets a Driver
  // read any pooled mission; we then keep those whose pickup OR dropoff falls
  // within the Driver's service radius of their base — the single place this
  // filter lives for the RADIUS and the specific-car rule. Tier / body / luggage
  // are now ALSO enforced in accept_mission (2026-08-11), deliberately as a strict
  // superset of this filter, so drift can only ever hide a trip, never refuse one
  // the Pool offered. (Beta scale: filter in app; add a bounding-box / PostGIS
  // prefilter later if the Pool grows large.)
  //
  // The pickup_at floor applies even under `?all=1`: the see-all bypass drops the
  // MATCHING filters (tier / zone / body / luggage) so one demo Driver can view
  // the whole Pool, but a dead trip isn't a filtered-out trip — `accept_mission`
  // would refuse it, so listing it would be a lie.
  let query = supabase
    .from("mission_read")
    .select("*")
    .eq("status", "pooled")
    .gt("pickup_at", new Date().toISOString());
  if (!seeAll) query = query.eq("category", vehicle.category);
  const { data: all, error } = await query.order("pickup_at", { ascending: true });

  const radius = driver.service_radius_km ?? 50;
  // ⚑ THE CEILING IS NOT IN THESE ROWS. `mission_read` masks it for a Driver on
  // a trip they do not hold (docs/06 §6 — a Driver who knows the top of the
  // curve knows exactly what waiting is worth). Prices come from `poolFaresNet`
  // below instead, computed server-side from the ids this RLS read just
  // returned. The cast is what makes the compiler enforce it: `currentFare()`
  // will not take a PoolMissionRow.
  // `as unknown` because the generated Row type still promises a Ceiling: the
  // view's SQL is what actually withholds it, and TypeScript cannot see SQL.
  const pooled = (all ?? []) as unknown as PoolMissionRow[];
  const missions = seeAll
    ? pooled
    : pooled.filter((m) => {
        const inRange =
          withinRadius(driver.base_lat!, driver.base_lng!, radius, m.pickup_lat, m.pickup_lng) ||
          withinRadius(driver.base_lat!, driver.base_lng!, radius, m.dropoff_lat, m.dropoff_lng);
        if (!inRange) return false;
        // Luggage-only run (Sujet B, Phase 1): a bags-only Van job. Only Drivers who
        // opted in at enrollment see these — so a Driver unwilling to carry luggage in
        // their Van is never offered one. (Body=van + category=business already scope
        // it to Van Drivers; this is the willingness gate on top.)
        if (m.luggage_only && !driver.accepts_luggage_runs) return false;
        // Body: a mission that demands a body type must match the Driver's vehicle.
        if (m.required_body_type && m.required_body_type !== vehicle.body_type) return false;
        // Specific car: when required, the Driver's car must satisfy it (tolerant
        // make matching, since the Driver types theirs free-text).
        if (m.required_make && m.required_model) {
          if (!carMatches(vehicle.make ?? "", vehicle.model ?? "", m.required_make, m.required_model)) {
            return false;
          }
        }
        return true;
      });

  // What each of these banks, net of commission — the only form a Driver is shown
  // (docs/06 §1). Keyed by the ids the query above already returned, so the
  // service role fills in prices for rows this session has already proved it may
  // see; it never decides which rows those are. See lib/pool-fares.ts.
  const fares = await poolFaresNet(missions.map((m) => m.id));

  return (
    <>
      <PoolHead
        live={!error && missions.length > 0}
        sub={
          seeAll ? (
            <>Every pooled trip · listing filters off</>
          ) : (
            <>
              {serviceClassLabel(vehicle.category, vehicle.body_type)} · within {radius} km of{" "}
              {driver.base_label ?? "your base"}
            </>
          )
        }
      />

      {/* Dev-only testing switch — never rendered in production. */}
      {!hosted && (
        <div className="notice info" style={{ margin: "0 0 14px" }}>
          {seeAll ? (
            <>
              Dev: <strong>listing</strong> every pooled trip. Accept still enforces your
              vehicle’s tier, body and luggage opt-in.{" "}
              <Link href="/pool" style={{ textDecoration: "underline" }}>
                Back to my matches
              </Link>
            </>
          ) : (
            <>
              Dev tools —{" "}
              <Link href="/pool?all=1" style={{ textDecoration: "underline" }}>
                show all pooled trips
              </Link>{" "}
              (lists trips outside your vehicle + zone; accepting them still requires a
              matching car).
            </>
          )}
        </div>
      )}

      {error && (
        <div className="notice error">Couldn’t load the Pool: {error.message}</div>
      )}

      {!error && missions.length === 0 && (
        <div className="pempty">
          <div className="pempty__ic">
            <Radar size={26} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="pempty__t">No trips in your Pool right now</p>
          <p className="pempty__s">
            {seeAll ? (
              <>No pooled trips exist right now.</>
            ) : (
              <>
                New <strong>{serviceClassLabel(vehicle.category, vehicle.body_type)}</strong> trips within{" "}
                <strong>
                  {radius} km of {driver.base_label ?? "your base"}
                </strong>{" "}
                land here as Businesses post them.
              </>
            )}
          </p>
          <span className="pempty__watch">
            <span className="pempty__pulse" />
            Checking your area · pull to refresh
          </span>
        </div>
      )}

      {missions.map((m) => (
        <MissionCard key={m.id} mission={m} fare={fares.get(m.id) ?? null} />
      ))}
    </>
  );
}
