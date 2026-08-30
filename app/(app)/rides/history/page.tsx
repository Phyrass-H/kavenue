import Link from "next/link";
import { Building2, ChevronRight, Handshake, History, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverContext } from "@/lib/driver";
import {
  addressLine,
  formatMoney,
  formatMonth,
  formatTime,
  missionStatusLabel,
} from "@/lib/format";
import { cancelCompensation } from "@/lib/cancellation";
import { driverNet } from "@/lib/commission";
import { missionAmount } from "@/lib/earnings";
import { parisDayKey } from "@/lib/dispatch-status";
import type { MissionRow, MissionStatus } from "@/lib/database.types";
import { statusPill } from "@/components/mission-run-view";
import { RidesTabs } from "@/components/rides-tabs";

export const dynamic = "force-dynamic";

// Terminal statuses — the archive of finished work. A no-show ends as
// status='completed' + no_show=true (mark_no_show pays the Driver the FULL fare),
// so it belongs under "Completed", not "Cancelled".
const PAST_STATUSES: MissionStatus[] = ["completed", "cancelled"];
const ACTIVE_STATUSES: MissionStatus[] = [
  "accepted",
  "confirmed",
  "en_route",
  "arrived",
  "on_board",
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

// Short date for the archive row: "Thu 24 July".
const pastDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

// A trip can leave a Driver in four ways, and only two of them leave the mission
// attached to them. Driver cancel and agreed release RE-POOL it (status back to
// 'pooled', driver_id cleared), so the mission row alone can't tell that history —
// without these the Driver's archive silently drops the very events that cost them
// a penalty. Both are recorded in side tables their own RLS already lets them read
// (mission_cancellation.actor_driver_id / mission_release.driver_id).
type PastItem = {
  key: string;
  mission: MissionRow;
  /** Plain words for what happened; null on an ordinary completed trip. */
  ending: string | null;
  /** Free text from whoever ended it — the Business's, or the Driver's own. */
  reason: string | null;
  reasonIsMine: boolean;
  /** Money as the DRIVER experiences it: owed to them, or owed by them. */
  amount: { label: string | null; value: string; tone: "plain" | "penalty" | "muted" };
  /** Re-pooled trips aren't tappable: the mission may belong to another Driver now. */
  href: string | null;
  /** Overrides the mission-derived pill (a re-pooled trip is no longer 'cancelled'). */
  pill: { tone: string; label: string; icon: "handshake" | null } | null;
};

export default async function RideHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { driver } = await getDriverContext();
  if (!driver) return null;

  const { filter } = await searchParams;
  const active: Filter =
    filter === "completed" || filter === "cancelled" ? filter : "all";
  const missionStatuses: MissionStatus[] =
    active === "all" ? PAST_STATUSES : [active];
  // A re-pooled ending is a kind of "didn't happen for me" — it files under Cancelled.
  const showEvents = active === "all" || active === "cancelled";

  const supabase = await createClient();
  const [
    { data: missions, error },
    { count: upcomingCount },
    { count: missionCount },
    { data: myCancels },
    { data: myReleases },
  ] = await Promise.all([
    supabase
      .from("mission_read")
      .select("*")
      .eq("driver_id", driver.id)
      .in("status", missionStatuses)
      .order("pickup_at", { ascending: false }),
    supabase
      .from("mission")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id)
      .in("status", ACTIVE_STATUSES),
    // The tab count is the WHOLE archive, never the filtered slice.
    supabase
      .from("mission")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id)
      .in("status", PAST_STATUSES),
    // RLS already scopes these to this Driver; the explicit filters say so at the
    // call site too, and keep the query honest if a policy is ever widened.
    supabase
      .from("mission_cancellation")
      .select("mission_id, reason, fee_amount, fare_snapshot")
      .eq("actor_driver_id", driver.id)
      .eq("kind", "driver_cancel"),
    supabase
      .from("mission_release")
      .select("mission_id")
      .eq("driver_id", driver.id)
      .eq("status", "accepted"),
  ]);

  // The missions behind those events: after a re-pool the Driver usually can't read
  // them any more (pooled, or held by someone else), so they come via the service
  // role — gated to exactly the ids their own event rows point at.
  const eventMissions = new Map<string, MissionRow>();
  const eventIds = [
    ...new Set([
      ...(myCancels ?? []).map((c) => c.mission_id),
      ...(myReleases ?? []).map((r) => r.mission_id),
    ]),
  ];
  const admin = createAdminClient();
  if (eventIds.length > 0) {
    const { data: rows } = await admin.from("mission").select("*").in("id", eventIds);
    for (const r of rows ?? []) eventMissions.set(r.id, r);
  }

  const items: PastItem[] = [];

  for (const m of missions ?? []) {
    const cancelled = m.status === "cancelled";
    const comp = cancelCompensation(m);
    // A settled waiting fee is money the Driver EARNED, so it belongs in the archive figure.
    // It was missing here while Earnings totalled it (both now go through missionAmount), so
    // one trip read 60,00 € on this screen and 100,00 € on the other — and the smaller number
    // was the one that looked like the record. Named, not just added: "+ 40,00 € waiting"
    // under the total, so it reads as earnings rather than a fare that grew on its own.
    // NET, like every figure a Driver reads (docs/06 §1): the meter runs at
    // 1 €/min between the parties and this is the Driver's share of it.
    const waiting = driverNet(m, Number(m.waiting_fee ?? 0));
    // The minutes ride along with the euros: a Driver who banked 5,72 € for
    // waiting had nothing on this screen to check it against. The RATE stays on
    // the trip's own money detail — it is one clause too many for a list row.
    const waitingNote =
      waiting > 0
        ? `incl. ${formatMoney(waiting)} waiting${
            m.waiting_minutes ? ` · ${m.waiting_minutes} min` : ""
          }`
        : null;
    items.push({
      key: `m:${m.id}`,
      mission: m,
      ending: cancelled ? "Cancelled by the Business" : null,
      reason: cancelled ? m.cancellation_reason : null,
      reasonIsMine: false,
      amount: cancelled
        ? comp == null
          ? { label: null, value: "—", tone: "muted" }
          : {
              label: waitingNote ?? "Compensation",
              value: formatMoney(driverNet(m, comp)),
              tone: "plain",
            }
        : {
            label: waitingNote,
            value: formatMoney(missionAmount(m)),
            tone: "plain",
          },
      href: `/missions/${m.id}`,
      pill: null,
    });
  }

  if (showEvents) {
    for (const c of myCancels ?? []) {
      const m = eventMissions.get(c.mission_id);
      if (!m) continue;
      // Always 100% of the fare at the time (D45). ⚑ It is an indemnity owed to
      // the BUSINESS, not to Kavenue and not a transport charge — docs/06 §1,
      // which is why no commission comes off it (see `carriesCommission`). This
      // comment said "Kavenue" until 2026-08-20; it was the only site in the app
      // that did, and it disagreed with the doc, with lib/commission.ts and with
      // lib/earnings.ts. The code below was always right.
      // fee_amount is the stored figure; fall back to the snapshot it came from.
      const penalty = c.fee_amount ?? c.fare_snapshot;
      items.push({
        key: `c:${c.mission_id}`,
        mission: m,
        ending: "You cancelled this trip · it went back to the Pool",
        reason: c.reason,
        reasonIsMine: true,
        amount:
          penalty == null
            ? { label: null, value: "—", tone: "muted" }
            : { label: "Penalty", value: formatMoney(Number(penalty)), tone: "penalty" },
        href: null,
        pill: { tone: "danger", label: "Cancelled", icon: null },
      });
    }

    for (const r of myReleases ?? []) {
      const m = eventMissions.get(r.mission_id);
      if (!m) continue;
      items.push({
        key: `r:${r.mission_id}`,
        mission: m,
        ending: "Released by agreement · no fee, no mark",
        reason: null,
        reasonIsMine: false,
        amount: { label: null, value: "Free", tone: "muted" },
        href: null,
        pill: { tone: "go", label: "Released", icon: "handshake" },
      });
    }
  }

  // One archive, ordered by when the trip was due — the events sort in among the
  // missions rather than sitting in a separate block.
  items.sort(
    (a, b) =>
      new Date(b.mission.pickup_at).getTime() - new Date(a.mission.pickup_at).getTime(),
  );

  // Business names for the card foot (service role, gated to these missions).
  // Guest names/phones are deliberately NOT read here — they leave the Driver's
  // app when a trip closes (the Business keeps the full record).
  const bizNames = new Map<string, string>();
  if (items.length > 0) {
    const ids = [...new Set(items.map((i) => i.mission.business_id))];
    const { data: businesses } = await admin
      .from("business")
      .select("id, name")
      .in("id", ids);
    for (const b of businesses ?? []) bizNames.set(b.id, b.name);
  }

  // Group by Paris month, preserving the newest-first order.
  const groups: { key: string; items: PastItem[] }[] = [];
  for (const it of items) {
    const key = parisDayKey(it.mission.pickup_at).slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, items: [it] });
  }

  const pastCount =
    (missionCount ?? 0) + (myCancels?.length ?? 0) + (myReleases?.length ?? 0);
  const isEmpty = !error && groups.length === 0;

  return (
    <>
      <h1 className="rhead">My Rides</h1>
      <RidesTabs active="past" upcoming={upcomingCount ?? 0} past={pastCount} />

      {pastCount > 0 && (
        <div className="rfilter" role="group" aria-label="Filter past rides">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/rides/history" : `/rides/history?filter=${f.key}`}
              className={f.key === active ? "rchip rchip--on" : "rchip"}
              aria-current={f.key === active ? "true" : undefined}
            >
              {f.label}
            </Link>
          ))}
        </div>
      )}

      {error && (
        <div className="notice error" style={{ marginTop: 14 }}>
          Couldn’t load your history: {error.message}
        </div>
      )}

      {isEmpty && (
        <div className="pempty">
          <span className="pempty__ic">
            <History size={26} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="pempty__t">
            {active === "all" ? "No finished trips yet" : `No ${active} trips`}
          </p>
          <p className="pempty__s">
            {active === "all"
              ? "A trip moves here once it’s completed or cancelled."
              : "Nothing in your archive matches this filter."}
          </p>
        </div>
      )}

      {groups.map((g, gi) => (
        <section key={g.key}>
          <div className={gi === 0 ? "dday dday--first" : "dday"}>
            <h2 className="dday__l">{formatMonth(g.key)}</h2>
            <span className="dday__n">
              {g.items.length} ride{g.items.length === 1 ? "" : "s"}
            </span>
          </div>

          {g.items.map((it) => {
            const m = it.mission;
            const fallback = statusPill(m);
            const tone = it.pill?.tone ?? fallback.tone;
            const label =
              it.pill?.label ?? (m.no_show ? "No-show" : missionStatusLabel(m.status));
            const PillIcon = it.pill ? null : fallback.Icon;

            const body = (
              <>
                <div className="pastcard__head">
                  <span className="pastcard__when">
                    {pastDate.format(new Date(m.pickup_at))}
                    <span className="pastcard__time">{formatTime(m.pickup_at)}</span>
                  </span>
                  <span className={`dpill dpill--sm dpill--${tone}`}>
                    {PillIcon && <PillIcon size={12} strokeWidth={1.75} aria-hidden="true" />}
                    {it.pill?.icon === "handshake" && (
                      <Handshake size={12} strokeWidth={1.75} aria-hidden="true" />
                    )}
                    {label}
                  </span>
                </div>

                {it.ending && <p className="dend-note">{it.ending}</p>}

                {it.reason && (
                  <div className="dreason">
                    <MessageSquare aria-hidden="true" />
                    <span>
                      {it.reasonIsMine && <span className="dreason__l">You said:</span>}“
                      {it.reason}”
                    </span>
                  </div>
                )}

                <div className="pastcard__route">
                  <span className="pastcard__rail">
                    <span className="pastcard__line" />
                    <span className="pastcard__dot pastcard__dot--from" />
                    <span className="pastcard__dot pastcard__dot--to" />
                  </span>
                  <span className="pastcard__addrs">
                    <span className="pastcard__addr">{addressLine(m.pickup_address)}</span>
                    <span className="pastcard__addr">
                      {addressLine(m.dropoff_address ?? "—")}
                    </span>
                  </span>
                  {it.href && (
                    <ChevronRight className="pastcard__chev" size={16} aria-hidden="true" />
                  )}
                </div>

                <div className="pastcard__foot">
                  <span className="pastcard__biz">
                    <Building2 size={13} aria-hidden="true" />
                    {bizNames.get(m.business_id) ?? "—"}
                  </span>
                  <span
                    className={
                      it.amount.tone === "muted"
                        ? "pastcard__fare pastcard__fare--none"
                        : it.amount.tone === "penalty"
                          ? "pastcard__fare pastcard__fare--pen"
                          : "pastcard__fare"
                    }
                  >
                    {it.amount.label && (
                      <span
                        className={
                          it.amount.tone === "penalty"
                            ? "pastcard__farel pastcard__farel--pen"
                            : "pastcard__farel"
                        }
                      >
                        {it.amount.label}
                      </span>
                    )}
                    {it.amount.value}
                  </span>
                </div>
              </>
            );

            return it.href ? (
              <Link href={it.href} className="pastcard" key={it.key}>
                {body}
              </Link>
            ) : (
              <article className="pastcard pastcard--flat" key={it.key}>
                {body}
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}
