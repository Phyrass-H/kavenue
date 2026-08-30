import {
  Ban,
  CalendarOff,
  Clock,
  Info,
  Route,
  TrendingDown,
  TrendingUp,
  Undo2,
  UserX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverContext } from "@/lib/driver";
import { driverNet } from "@/lib/commission";
import {
  isPeriod,
  parseAnchor,
  parseDayParam,
  periodRange,
  totalsFor,
  missionAmount,
  driverCancelPickupAt,
  dayKey,
  todayAnchor,
  type DriverCancelRow,
  type Period,
  type Totals,
} from "@/lib/earnings";
import {
  formatMoney,
  formatDuration,
  formatTime,
  formatWaitingSpell,
  shortPlaceLabel,
  formatDayGroup,
} from "@/lib/format";
import { EarningsPeriod } from "@/components/earnings-period";
import type { MissionRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const MONEY_STATUSES = ["completed", "cancelled"] as const;

// Every read here is scoped to the signed-in Driver by RLS; the explicit driver_id
// filters say so at the call site too.
/**
 * The Driver's earliest money-bearing trip, which is where "All time" starts.
 * One indexed row — cheap enough to fetch on every render, and it means the
 * shortcut can't offer a span that predates their first day on the platform.
 */
async function loadFirstDay(driverId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mission")
    .select("pickup_at")
    .eq("driver_id", driverId)
    .in("status", MONEY_STATUSES)
    .order("pickup_at", { ascending: true })
    .limit(1);
  return data?.[0] ? dayKey(data[0].pickup_at) : null;
}

/**
 * `withRows` is opt-in because this runs THREE times per render — this period,
 * the one before, and the same one last year — and only the first draws a list.
 * The other two read `.totals` and nothing else, so they must not pay for the
 * service-role round trip that rebuilds the cancelled trips.
 */
async function loadPeriod(driverId: string, from: Date, to: Date, withRows = false) {
  const supabase = await createClient();
  const [{ data: missions }, { data: cancels }] = await Promise.all([
    supabase
      .from("mission_read")
      .select("*")
      .eq("driver_id", driverId)
      .in("status", MONEY_STATUSES)
      .gte("pickup_at", from.toISOString())
      .lt("pickup_at", to.toISOString())
      .order("pickup_at", { ascending: false }),
    // A Driver's own cancellation re-pools the mission and clears driver_id, so the
    // penalty only survives here — dated by when they cancelled, not by the pickup.
    supabase
      .from("mission_cancellation")
      .select("mission_id, created_at, reason, fee_amount, fare_snapshot, hours_before_pickup")
      .eq("actor_driver_id", driverId)
      .eq("kind", "driver_cancel")
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString()),
  ]);
  const rows = (missions ?? []) as MissionRow[];
  const cancelRows = (cancels ?? []) as DriverCancelRow[];

  // The trips behind those penalties. The re-pool cleared `driver_id`, so the
  // Driver's own query above cannot see them and RLS stops them reading the
  // mission directly the moment somebody else takes it — the archive solves it
  // the same way, through the service role, gated to exactly the ids their own
  // cancellation rows point at.
  const cancelMissions = new Map<string, MissionRow>();
  const ids = withRows ? [...new Set(cancelRows.map((c) => c.mission_id!).filter(Boolean))] : [];
  if (ids.length > 0) {
    const { data } = await createAdminClient().from("mission").select("*").in("id", ids);
    for (const r of (data ?? []) as MissionRow[]) cancelMissions.set(r.id, r);
  }

  return { missions: rows, cancels: cancelRows, cancelMissions, totals: totalsFor(rows, cancelRows) };
}

function Line({
  icon,
  label,
  value,
  negative = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className={`ebreak${negative ? " ebreak--neg" : ""}`}>
      <span className="ebreak__l">
        {icon}
        {label}
      </span>
      <b>
        {negative && "−"}
        {formatMoney(value)}
      </b>
    </div>
  );
}

function Breakdown({ t }: { t: Totals }) {
  // formatDuration, not a hand-rolled pair: the old one dropped the unit the
  // moment hours appeared ("1 h 5" — no "min", no zero-pad) on the one line
  // that exists to report a duration.
  const waitLabel = `Waiting time · ${formatDuration(t.waitingMinutes)}`;

  return (
    <div className="dcard">
      <p className="dcard__label">What it’s made of</p>
      <Line
        icon={<Route size={16} strokeWidth={1.75} aria-hidden="true" />}
        label={`Trips · ${t.tripCount}`}
        value={t.trips}
      />
      {t.waiting > 0 && (
        <Line
          icon={<Clock size={16} strokeWidth={1.75} aria-hidden="true" />}
          label={waitLabel}
          value={t.waiting}
        />
      )}
      {t.noShowCount > 0 && (
        <Line
          icon={<UserX size={16} strokeWidth={1.75} aria-hidden="true" />}
          label={`No-show · ${t.noShowCount}`}
          value={t.noShow}
        />
      )}
      {t.cancelledOnYouCount > 0 && (
        <Line
          icon={<Ban size={16} strokeWidth={1.75} aria-hidden="true" />}
          label={`Cancelled on you · ${t.cancelledOnYouCount}`}
          value={t.cancelledOnYou}
        />
      )}
      {t.penaltyCount > 0 && (
        <Line
          icon={<Undo2 size={16} strokeWidth={1.75} aria-hidden="true" />}
          label={`You cancelled · ${t.penaltyCount}`}
          value={t.penalties}
          negative
        />
      )}
    </div>
  );
}

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; d?: string; from?: string; to?: string }>;
}) {
  const { driver } = await getDriverContext();
  if (!driver) return null;

  const { p, d, from: fromParam, to: toParam } = await searchParams;
  const requested: Period = isPeriod(p) ? p : "week";
  // A range needs both ends. A hand-edited or truncated URL falls back to the week
  // rather than rendering an empty screen with no explanation.
  const custom =
    requested === "range" && parseDayParam(fromParam) && parseDayParam(toParam)
      ? { from: fromParam!, to: toParam! }
      : null;
  const period: Period = requested === "range" && !custom ? "week" : requested;
  const anchor = parseAnchor(custom?.from ?? d);
  const range = periodRange(period, anchor, undefined, custom);

  // This period, the one before it, and the same one a year ago — the year-ago read
  // costs one query and stays silent until there's actually a year of history.
  // A custom range can't be expressed as an anchor, so it carries its own comparison
  // spans (the SAME LENGTH immediately before, not the previous calendar month).
  const prevRange = periodRange(period, parseAnchor(range.prev), undefined, range.prevCustom);
  const lastYearRange = periodRange(
    period,
    parseAnchor(range.lastYear),
    undefined,
    range.lastYearCustom,
  );

  const [now, before, yearAgo, firstEver] = await Promise.all([
    loadPeriod(driver.id, range.from, range.to, true),
    loadPeriod(driver.id, prevRange.from, prevRange.to),
    loadPeriod(driver.id, lastYearRange.from, lastYearRange.to),
    loadFirstDay(driver.id),
  ]);

  const t = now.totals;
  const delta = t.total - before.totals.total;
  const pad = (n: number) => String(n).padStart(2, "0");
  const anchorIso = `${anchor.y}-${pad(anchor.m)}-${pad(anchor.d)}`;
  const today = todayAnchor();
  const todayIso = `${today.y}-${pad(today.m)}-${pad(today.d)}`;

  // A custom span has no calendar noun — "the range before" and "same range last
  // year" would be nonsense, so it borrows the neutral "period" everywhere the
  // copy needs a word, and loses the "use the arrows" hint (it has none).
  const periodNoun = period === "range" ? "period" : period;
  // "this week" only while you're in it; stepping back reads "that week".
  const dem = range.isCurrent ? "this" : "that";
  const rideCount = t.tripCount + t.noShowCount;
  const worked = new Set(now.missions.map((m) => dayKey(m.pickup_at))).size;

  // Trip list, newest first, grouped into Paris days.
  //
  // ⚑ A trip the Driver cancelled themselves has to be IN this list. Its penalty
  // has always been in the headline total, but the mission left the Driver's own
  // query when `driver_id` was cleared — so the day rows summed to more than the
  // total, by exactly the penalty, with nothing on screen to explain the gap.
  // Worse: a period whose only event was one cancellation showed a NEGATIVE
  // headline above "Trips show up here the moment you complete them".
  //
  // ⚑ Dated by `created_at` — the day they cancelled — because that is the basis
  // the headline filters on. Dating it by the pickup would put the row outside
  // the period whenever a Driver walks away from next month's trip, and the day
  // rows would stop adding up again. The trip's own due time goes in the
  // subtitle instead, where it explains rather than sorts.
  type ListItem =
    | { kind: "trip"; key: string; at: string; amount: number; mission: MissionRow }
    | {
        kind: "penalty";
        key: string;
        at: string;
        amount: number;
        mission: MissionRow | null;
        dueAt: string | null;
      };

  const items: ListItem[] = now.missions.map((m) => ({
    kind: "trip" as const,
    key: `m:${m.id}`,
    at: m.pickup_at,
    amount: missionAmount(m),
    mission: m,
  }));
  for (const c of now.cancels) {
    // Gross, like the Breakdown's "You cancelled" line: the penalty is an
    // indemnity Driver → Business (docs/06 §1) and carries no commission.
    const penalty = Number(c.fee_amount ?? c.fare_snapshot ?? 0);
    items.push({
      kind: "penalty" as const,
      key: `c:${c.mission_id ?? c.created_at}`,
      at: c.created_at,
      amount: -penalty,
      mission: c.mission_id ? (now.cancelMissions.get(c.mission_id) ?? null) : null,
      dueAt: driverCancelPickupAt(c),
    });
  }
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const groups: { key: string; items: ListItem[] }[] = [];
  for (const it of items) {
    const key = dayKey(it.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, items: [it] });
  }

  return (
    <>
      <h1 className="dset__h1">Earnings</h1>
      <p className="dset__sub">What you’ve earned, whenever you want to look.</p>

      <EarningsPeriod
        period={period}
        anchor={anchorIso}
        label={range.label}
        prev={range.prev}
        next={range.next}
        isCurrent={range.isCurrent}
        fromDay={range.fromDay}
        toDay={range.toDay}
        firstDay={firstEver}
        today={todayIso}
      />

      <div className="dcard">
        <div className="etotal">{formatMoney(t.total)}</div>
        <div className="etotal__sub">
          {rideCount === 0
            ? `No trips ${dem} ${periodNoun}`
            : `${rideCount} trip${rideCount > 1 ? "s" : ""}` +
              (period !== "day" && worked > 1 ? ` · ${worked} days worked` : "")}
        </div>

        {(t.total !== 0 || before.totals.total !== 0) && (
          <span className={`ecmp ecmp--${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}>
            {delta > 0 ? (
              <TrendingUp size={13} strokeWidth={2} aria-hidden="true" />
            ) : delta < 0 ? (
              <TrendingDown size={13} strokeWidth={2} aria-hidden="true" />
            ) : null}
            {delta === 0
              ? `Same as the ${periodNoun} before`
              : `${delta > 0 ? "+" : "−"}${formatMoney(Math.abs(delta))} on the ${periodNoun} before`}
          </span>
        )}

        {/* Silent until there IS a year of history — a permanent "no data" line is
            worse than no line at all. */}
        {yearAgo.totals.total > 0 && (
          <span className="eyear">
            Same {periodNoun} last year: {formatMoney(yearAgo.totals.total)}
          </span>
        )}
      </div>

      {t.total !== 0 && <Breakdown t={t} />}

      {items.length === 0 ? (
        <div className="dcard">
          <div className="pempty" style={{ padding: "30px 16px 26px" }}>
            <div className="pempty__ic">
              <CalendarOff size={26} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p className="pempty__t">
              Nothing {dem} {periodNoun}
            </p>
            <p className="pempty__s">
              Trips show up here the moment you complete them.{" "}
              {period === "range"
                ? "Tap the dates to choose a different span."
                : `Use the arrows to look at another ${periodNoun}.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="dcard">
          <p className="dcard__label">Trip by trip</p>
          {groups.map((g) => {
            const dayTotal = g.items.reduce((sum, it) => sum + it.amount, 0);
            // ⚑ `label` alone. formatDayGroup ALREADY returns "Today" for today,
            // so the `Today · ${label}` this used to print rendered "Today ·
            // Today". It was never seen because no trip in the archive had ever
            // fallen on the current day — a driver-cancellation row can, since
            // it is dated by when they cancelled. My Rides has always rendered
            // the bare label; this now matches it.
            const { label } = formatDayGroup(g.items[0].at);
            return (
              <div key={g.key}>
                <div className="eday">
                  <b>{label}</b>
                  <span>{formatMoney(dayTotal)}</span>
                </div>
                {g.items.map((it) =>
                  it.kind === "trip" ? (
                    <div className="etrip" key={it.key}>
                      <span className="etrip__t">
                        <b>
                          {shortPlaceLabel(it.mission.pickup_address)} →{" "}
                          {shortPlaceLabel(it.mission.dropoff_address) || "—"}
                        </b>
                        <span>
                          {formatTime(it.mission.pickup_at)}
                          {it.mission.no_show && " · no-show"}
                          {it.mission.status === "cancelled" && " · cancelled on you"}
                          {!!it.mission.waiting_minutes &&
                            ` · ${formatWaitingSpell(
                              it.mission.waiting_minutes,
                              driverNet(it.mission, Number(it.mission.waiting_rate ?? 0)),
                            )} wait`}
                          {it.mission.night_applied && " · night rate"}
                        </span>
                      </span>
                      <span className="etrip__a">{formatMoney(it.amount)}</span>
                    </div>
                  ) : (
                    // The mission comes back through the service role; if it has
                    // since been hard-deleted the row still has to appear, or the
                    // day stops adding up. It just says less.
                    <div className="etrip" key={it.key}>
                      <span className="etrip__t">
                        <b>
                          {it.mission
                            ? `${shortPlaceLabel(it.mission.pickup_address)} → ${
                                shortPlaceLabel(it.mission.dropoff_address) || "—"
                              }`
                            : "A trip you cancelled"}
                        </b>
                        <span>
                          {formatTime(it.at)} · you cancelled
                          {it.dueAt && ` · was due ${formatTime(it.dueAt)}`}
                        </span>
                      </span>
                      <span className="etrip__a etrip__a--pen">
                        −{formatMoney(Math.abs(it.amount))}
                      </span>
                    </div>
                  ),
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="dlock dlock--foot" style={{ marginTop: 0 }}>
        <Info size={15} strokeWidth={1.9} aria-hidden="true" />
        <span>
          Every trip you completed, at the fare you accepted, less any trip you
          cancelled yourself. During the beta we settle with you directly.
        </span>
      </div>

      {/* A custom range is always "somewhere else", so the way back is to a real
          calendar period — this week — not to `p=range` with no ends. */}
      {(period === "range" || anchorIso !== todayIso) && (
        <p className="ejump">
          <a href={`/earnings?p=${period === "range" ? "week" : period}&d=${todayIso}`}>
            Back to now
          </a>
        </p>
      )}
    </>
  );
}
