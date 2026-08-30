import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { formatDate } from "@/lib/format";
import { needsClosing, parisDayKey } from "@/lib/dispatch-status";
import { sweepExpiredMissions } from "@/lib/expiry";
import { LiveRefresh } from "@/components/live-refresh";
import { ScrollToTrip } from "@/components/scroll-to-trip";
import {
  TripRow,
  type DriverContact,
  type AmendmentBrief,
  type ReleaseBrief,
  type DriverWalk,
  type InfoChangeBrief,
} from "@/components/trip-row";
import { parseGuestContacts, type GuestContact } from "@/lib/passengers";
import { loadDriverWalks, latestPerMission } from "@/lib/side-tables";
import { parseChangeItems } from "@/lib/info-changes";
import { parseWaypoints } from "@/lib/waypoints";
import { releaseDeclineReasonLabel } from "@/lib/releases";
import { commissionSplit, businessRatesOf } from "@/lib/commission";
import {
  parseFromSnapshot,
  routeDiff,
  changeSummary,
  declineReasonLabel,
} from "@/lib/amendments";
import type { MissionRow, MissionAmendmentRow, MissionReleaseRow } from "@/lib/database.types";

// Reduce a stored amendment to the compact brief the schedule row renders.
// ⚑ `m` is here for one reason: both fares are Course-basis in the row and a
// Business is only ever shown its own side of them (docs/06 §1). The mission's
// own snapshot rates, so a rate change never re-prices an agreed trip.
function buildBrief(a: MissionAmendmentRow, m: MissionRow): AmendmentBrief {
  const from = parseFromSnapshot(a.from_snapshot);
  const diff = routeDiff(
    { pickup: from.pickup_address, dropoff: from.dropoff_address, waypoints: from.waypoints },
    {
      pickup: a.new_pickup_address,
      dropoff: a.new_dropoff_address,
      waypoints: parseWaypoints(a.new_waypoints),
    },
  );
  return {
    id: a.id,
    status: a.status,
    summary: changeSummary(diff),
    fareOld: from.fare == null ? null : commissionSplit(from.fare, businessRatesOf(m)).businessTotal,
    fareNew: commissionSplit(Number(a.new_fare), businessRatesOf(m)).businessTotal,
    declineReason: declineReasonLabel(a.decline_reason),
    at: a.responded_at ?? a.created_at,
  };
}

// Reduce a stored release to the compact brief the schedule row renders.
function buildReleaseBrief(r: MissionReleaseRow): ReleaseBrief {
  return {
    id: r.id,
    status: r.status,
    at: r.responded_at ?? r.created_at,
    declineReason: releaseDeclineReasonLabel(r.decline_reason),
  };
}

export const dynamic = "force-dynamic";

function ColumnHead() {
  return (
    <div className="dx-colhead">
      <span>Time</span>
      <span>Route</span>
      <span>Flight</span>
      <span>Guest</span>
      <span>Ref</span>
      <span>Driver</span>
      <span>Status</span>
    </div>
  );
}

function DayGroup({
  dayKey,
  missions,
  contacts,
  guestContacts,
  amendments,
  releases,
  driverWalks,
  infoChanges,
  liftedIds,
  today,
}: {
  dayKey: string;
  missions: MissionRow[];
  contacts: Map<string, DriverContact>;
  guestContacts: Map<string, GuestContact[]>;
  amendments: Map<string, AmendmentBrief>;
  releases: Map<string, ReleaseBrief>;
  driverWalks: Map<string, DriverWalk[]>;
  infoChanges: Map<string, InfoChangeBrief>;
  /** § Q — rows shown outside their own day, so they print their date. */
  liftedIds?: Set<string>;
  today?: boolean;
}) {
  const lifted = liftedIds ? missions.filter((m) => liftedIds.has(m.id)).length : 0;
  const own = missions.length - lifted;
  return (
    // The id lets the calendar's "Open day in Schedule" land on this band.
    <section id={`day-${dayKey}`}>
      <div className={`dx-day${today ? " dx-day--today" : ""}`}>
        <h2>{today ? "Today · " : ""}{formatDate(`${dayKey}T12:00:00`)}</h2>
        {/* Lifted rows belong to other days — counting them here would say
            "23 trips" on a day with nine. They're shown, not counted. */}
        <span className="dx-count">
          {own} trip{own === 1 ? "" : "s"}
          {lifted > 0 && <> · {lifted} to close</>}
        </span>
      </div>
      {missions.map((m) => (
        <TripRow
          key={m.id}
          mission={m}
          driver={contacts.get(m.id) ?? null}
          guestContacts={guestContacts.get(m.id) ?? null}
          amendment={amendments.get(m.id) ?? null}
          release={releases.get(m.id) ?? null}
          driverWalks={driverWalks.get(m.id) ?? null}
          infoChange={infoChanges.get(m.id) ?? null}
          showDate={liftedIds?.has(m.id) ?? false}
        />
      ))}
    </section>
  );
}

export default async function DispatchSchedule({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; day?: string }>;
}) {
  const ctx = await getAppContext();
  if (!ctx.business) return null;
  const { open, day } = await searchParams;

  const supabase = await createClient();

  // § P — a trip nobody accepted is dead at its pickup time. Sweeping here (as
  // well as on the Driver's Pool) means the Business sees "Expired · Was not
  // filled in time" on their own schedule without waiting for a Driver to happen
  // to open the app. Idempotent; never throws.
  await sweepExpiredMissions(supabase);

  const { data: missions, error } = await supabase
    .from("mission_read")
    .select("*")
    .eq("business_id", ctx.business.id)
    .neq("status", "draft") // drafts live on their own page, not the schedule
    .order("pickup_at", { ascending: true });

  // Reveal assigned Driver contacts + car (service role, gated to this business).
  const contacts = new Map<string, DriverContact>();
  const assigned = (missions ?? []).filter((m) => m.driver_id);
  if (assigned.length > 0) {
    const admin = createAdminClient();
    const driverIds = [...new Set(assigned.map((m) => m.driver_id!))];
    const [{ data: drivers }, { data: vehicles }] = await Promise.all([
      admin.from("driver").select("id, first_name, last_name, phone").in("id", driverIds),
      admin.from("vehicle").select("driver_id, make, model, colour, plate").in("driver_id", driverIds),
    ]);
    const byId = new Map((drivers ?? []).map((d) => [d.id, d]));
    const vehByDriver = new Map((vehicles ?? []).map((v) => [v.driver_id, v]));
    for (const m of assigned) {
      const d = byId.get(m.driver_id!);
      if (d)
        contacts.set(m.id, {
          name: `${d.first_name} ${d.last_name}`,
          phone: d.phone,
          vehicle: vehByDriver.get(d.id) ?? null,
        });
    }
  }

  // Guest phone numbers (side table, RLS-scoped to this Business). Drivers can't
  // read these; the Share switch in each row controls reveal to the assigned Driver.
  //
  // ⚑ § R rule 1 — filtered THROUGH the relationship, not by a list of ids. This is
  // the one side table with no business_id of its own (mission_id is its only key),
  // so the scope is expressed as a join. `!inner` is load-bearing: a plain embed is
  // a LEFT join, and the predicate would null the embed instead of dropping the row.
  // Never read `r.mission` — database.types.ts declares `Relationships: []` on
  // purpose, so it types as an error; it exists to JOIN, not to be read.
  const guestContacts = new Map<string, GuestContact[]>();
  const missionIds = (missions ?? []).map((m) => m.id);
  if (missionIds.length > 0) {
    const { data: gc } = await supabase
      .from("mission_guest_contact")
      .select("mission_id, contacts, mission!inner(business_id)")
      .eq("mission.business_id", ctx.business.id);
    for (const r of gc ?? []) {
      guestContacts.set(r.mission_id, parseGuestContacts(r.contacts));
    }
  }

  // Amendments (D39 Phase 2): the latest live proposal / decline / accept per
  // mission, for the schedule's "Change pending / declined / accepted" states.
  // RLS scopes to this Business's own missions.
  const amendments = new Map<string, AmendmentBrief>();
  if (missionIds.length > 0) {
    const { data: ams } = await supabase
      .from("mission_amendment")
      .select("*")
      .eq("business_id", ctx.business.id) // § R rule 1 — was .in(<every mission id>)
      .neq("status", "superseded")
      .order("created_at", { ascending: false });
    for (const a of latestPerMission(ams ?? [])) {
      const am = (missions ?? []).find((x) => x.id === a.mission_id);
      if (am) amendments.set(a.mission_id, buildBrief(a, am));
    }
  }

  // Agreed releases (O7, D45): the latest non-superseded, non-dismissed release per
  // mission → the "Release pending / declined / accepted" states. RLS scopes to this
  // Business. Degrades to empty if the 2026-07-19 migration hasn't been applied.
  const releases = new Map<string, ReleaseBrief>();
  if (missionIds.length > 0) {
    const { data: rels } = await supabase
      .from("mission_release")
      .select("*")
      .eq("business_id", ctx.business.id) // § R rule 1 — was .in(<every mission id>)
      .neq("status", "superseded")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false });
    for (const r of latestPerMission(rels ?? [])) {
      releases.set(r.mission_id, buildReleaseBrief(r));
    }
  }

  // A Driver who accepted one of these trips and then walked away from it. The
  // re-pool leaves NO trace on the mission itself — driver_id, accepted_at and
  // confirmed_at are all cleared and the status goes back to 'pooled' — so this
  // side table is the only record that a car was ever arranged and lost. RLS
  // already scopes `mission_cancellation` to this Business; the explicit filters
  // say so at the call site too. Degrades to empty if the O7 migration is absent.
  //
  // ⚑ ALL of them, newest first — NOT the latest-per-mission de-dup the
  // amendment and release blocks above use. A driver cancellation re-pools the
  // trip rather than ending it, so the same mission can be walked again by the
  // next Driver, and "latest wins" would hide every walk but one.
  //
  // ⚑ § R rule 1 — Business-scoped, was .in(<every mission id>). Shared with the
  // archive and both CSVs so the four reads cannot drift apart.
  const driverWalks = await loadDriverWalks(supabase, ctx.business.id);

  // Detail-edit change-log (D40): the latest "what changed" trail per mission, for
  // the trip detail. Business-private side table (RLS-scoped); degrades to empty if
  // the 2026-07-10 migration hasn't been applied yet.
  const infoChanges = new Map<string, InfoChangeBrief>();
  if (missionIds.length > 0) {
    const { data: ics } = await supabase
      .from("mission_info_change")
      .select("mission_id, items, created_at")
      .eq("business_id", ctx.business.id) // § R rule 1 — was .in(<every mission id>)
      .order("created_at", { ascending: false });
    for (const r of latestPerMission(ics ?? [])) {
      const items = parseChangeItems(r.items);
      if (items.length > 0) infoChanges.set(r.mission_id, { at: r.created_at, items });
    }
  }

  // Group by Paris day; split into today / future / past.
  const todayKey = parisDayKey(new Date());
  const groups = new Map<string, MissionRow[]>();
  for (const m of missions ?? []) {
    const k = parisDayKey(m.pickup_at);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(m);
  }
  const keys = [...groups.keys()];
  const futureKeys = keys.filter((k) => k > todayKey).sort();
  const pastKeys = keys.filter((k) => k < todayKey).sort().reverse();

  // § Q — a trip nobody closed is work for TODAY, not archive material. Every past
  // day sits inside the collapsed "Earlier trips" fold, so a tone on the row alone
  // would be invisible: the desk would never see it without going looking. Lift
  // those rows into today's band (each carrying its own date, via showDate) and
  // take them out of the fold, so the one thing needing a phone call is on screen.
  const now = new Date();
  const lifted = pastKeys
    .flatMap((k) => groups.get(k)!.filter((m) => needsClosing(m, now)))
    .sort((a, b) => (a.pickup_at < b.pickup_at ? 1 : -1));
  const liftedIds = new Set(lifted.map((m) => m.id));
  const pastOf = (k: string) => groups.get(k)!.filter((m) => !liftedIds.has(m.id));
  const pastKeysLeft = pastKeys.filter((k) => pastOf(k).length > 0);
  const todayMissions = [...lifted, ...(groups.get(todayKey) ?? [])];

  const isEmpty = !error && (!missions || missions.length === 0);

  return (
    <>
      <LiveRefresh />
      {(open || day) && <ScrollToTrip missionId={open} dayKey={day} />}

      {error && (
        <div className="notice error">Couldn’t load your schedule: {error.message}</div>
      )}

      {isEmpty && (
        <div className="empty">
          No missions yet.
          <br />
          <Link href="/dispatch/new" style={{ textDecoration: "underline" }}>
            Post your first mission →
          </Link>
        </div>
      )}

      {!isEmpty && (
        <>
          <div className="dx-sched">
            <ColumnHead />

            {/* Today is always shown and pinned on top. */}
            <DayGroup
              dayKey={todayKey}
              missions={todayMissions}
              contacts={contacts}
              guestContacts={guestContacts}
              amendments={amendments}
              releases={releases}
                driverWalks={driverWalks}
              infoChanges={infoChanges}
              liftedIds={liftedIds}
              today
            />
            {todayMissions.length === 0 && (
              <p className="muted small" style={{ margin: 0, padding: "10px 16px" }}>
                No trips today.
              </p>
            )}

            {futureKeys.map((k) => (
              <DayGroup
                key={k}
                dayKey={k}
                missions={groups.get(k)!}
                contacts={contacts}
                guestContacts={guestContacts}
                amendments={amendments}
                releases={releases}
                driverWalks={driverWalks}
                infoChanges={infoChanges}
              />
            ))}
          </div>

          {pastKeysLeft.length > 0 && (
            <details>
              <summary className="dx-fold" style={{ cursor: "pointer", listStyle: "none" }}>
                Earlier trips ({pastKeysLeft.reduce((n, k) => n + pastOf(k).length, 0)})
              </summary>
              <div className="dx-sched" style={{ marginTop: 8 }}>
                <ColumnHead />
                {pastKeysLeft.map((k) => (
                  <DayGroup
                    key={k}
                    dayKey={k}
                    missions={pastOf(k)}
                    contacts={contacts}
                    guestContacts={guestContacts}
                    amendments={amendments}
                    releases={releases}
                driverWalks={driverWalks}
                    infoChanges={infoChanges}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}
