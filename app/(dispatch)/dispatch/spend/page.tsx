import Link from "next/link";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { categoryLabel, formatMoney, formatMonth } from "@/lib/format";
import { isExpired, parisDayKey } from "@/lib/dispatch-status";
import { TripRow, type DriverContact } from "@/components/trip-row";
import { SpendFilters } from "@/components/spend-filters";
import { SpendChart } from "@/components/spend-chart";
import { ScrollToTrip } from "@/components/scroll-to-trip";
import {
  applyHistoryQuery,
  historyFare,
  type HistoryRow,
} from "@/lib/history-filter";
import {
  autoBucket,
  breakdown,
  DIMS,
  DIM_LABEL,
  rowCost,
  series,
  spendTotals,
  wasteLines,
  avoidable,
  type SpendTotals,
} from "@/lib/spend";
import { businessCost } from "@/lib/commission";
import {
  comparisonSpan,
  currentSpan,
  isRunningDay,
  LENS_LABEL,
  LENSES,
  parseSpendQuery,
  queryForSpan,
  spendHref,
  type Lens,
  type SpendQuery,
} from "@/lib/spend-filter";
import type { MissionRow, VehicleCategory } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * /dispatch/spend — what the hotel paid, what changed, and what was avoidable.
 *
 * Not the Driver's Earnings screen with a hotel's numbers in it. Same maths
 * (settledFare, historyFare), opposite question: the Driver asks *what did I
 * make*, the Business asks *where did the money go and what do I do about it*.
 *
 * ⚑ Two kinds of click, and the distinction is load-bearing:
 *   · a DIMENSION click (chart column, breakdown row) sets a global filter — the
 *     whole page recomputes and the URL changes.
 *   · a COMPONENT click (Waiting, No-shows, …) sets ?lens=, which narrows ONLY
 *     the trip list. It must not touch the charts: a "cancellations" lens that
 *     repainted the spend chart would make the headline total disagree with the
 *     bars underneath it.
 *
 * ⚑ Volume: this loads the whole past archive in one query and filters in
 * memory, exactly as /dispatch/history does — which is what lets the comparison
 * period, the chip counts and the class list all be honest without a second
 * round trip. Correct at 28 trips; the first thing to revisit at 5 000.
 */

// One quiet strip of facts about SERVICE, kept apart from the money above it.
// "Guests moved" is deliberately absent: passenger_names is optional and
// pax_count is often blank, so a headcount we can only half-observe would be
// worse than none (founder, 2026-08-07).
function ServiceStrip({ t }: { t: SpendTotals }) {
  const took =
    t.medianToAccept == null
      ? null
      : t.medianToAccept < 90
        ? `${Math.round(t.medianToAccept)} min`
        : t.medianToAccept < 60 * 48
          ? `${(t.medianToAccept / 60).toFixed(1)} h`
          : `${Math.round(t.medianToAccept / 1440)} days`;

  return (
    <div className="dxs-serv">
      <span className="dxs-serv__t">What you got</span>

      <span className="dxs-sv">
        Requests covered{" "}
        {t.fillRate == null ? (
          <b className="dxs-sv__none">—</b>
        ) : (
          <b>{t.fillRate.toFixed(1).replace(".", ",")} %</b>
        )}
        <i>
          {t.ordered > 0 ? `${t.filledCount} of ${t.ordered}` : "nothing ordered yet"}
        </i>
      </span>

      {/* ⚑ Sits next to Requests covered on purpose. Time-to-accept only counts
          trips that FILLED, so alone it flatters — the ones nobody took never
          contribute. Together the two are honest. */}
      <span className="dxs-sv">
        Typically taken in {took ? <b>{took}</b> : <b className="dxs-sv__none">—</b>}
        <i>{took ? "median" : "too few trips to say"}</i>
      </span>

      <span className="dxs-sv">
        Arrived on time <b className="dxs-sv__none">—</b>
        <i>needs check-in data</i>
      </span>
    </div>
  );
}

export default async function DispatchSpend({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAppContext();
  if (!ctx.business) return null;

  const sp = await searchParams;
  const query: SpendQuery = parseSpendQuery(sp);
  const openId = typeof sp.open === "string" ? sp.open : undefined;

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [{ data: all, error }, { data: desks }] = await Promise.all([
    supabase
      .from("mission_read")
      .select("*")
      .eq("business_id", ctx.business.id)
      .neq("status", "draft")
      .lt("pickup_at", nowIso)
      .order("pickup_at", { ascending: false }),
    supabase.from("dispatcher").select("id, name").eq("business_id", ctx.business.id),
  ]);

  const missions: MissionRow[] = all ?? [];
  const deskName = new Map((desks ?? []).map((d) => [d.id, d.name]));

  // Driver + car for EVERY past trip, not just the ones on screen — the search
  // matches a Driver's name and a plate, and the breakdown ranks by Driver.
  const contacts = new Map<string, DriverContact>();
  const driverIdOf = new Map<string, string>();
  const assigned = missions.filter((m) => m.driver_id);
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
      if (!d) continue;
      contacts.set(m.id, {
        name: `${d.first_name} ${d.last_name}`,
        phone: d.phone,
        vehicle: vehByDriver.get(d.id) ?? null,
      });
      driverIdOf.set(m.id, d.id);
    }
  }

  const rows: HistoryRow[] = missions.map((m) => {
    const c = contacts.get(m.id) ?? null;
    return {
      mission: m,
      driverId: driverIdOf.get(m.id) ?? null,
      driverName: c?.name ?? null,
      car: c?.vehicle ?? null,
      ...historyFare(m),
    };
  });

  // ---- the two spans -------------------------------------------------------
  const span = currentSpan(query);
  const back = comparisonSpan(query);
  // A single day that is TODAY is the one period whose comparison is not
  // like-for-like — there is no smaller unit to truncate the previous day to.
  // Yesterday's total is still worth showing as a TARGET, so it stays; what
  // goes is the scoring, because a shortfall at 09:00 is not a saving.
  const runningDay = isRunningDay(span);

  const { rows: shown, matches } = applyHistoryQuery(rows, query);
  const prevRows = back ? applyHistoryQuery(rows, queryForSpan(query, back)).rows : [];

  const t = spendTotals(shown);
  const p = spendTotals(prevRows);

  const bucket = autoBucket(span.fromDay, span.toDay);
  const points = series(shown, span.fromDay, span.toDay, bucket);
  const prevSeries = back ? series(prevRows, back.fromDay, back.toDay, bucket) : null;
  // ⚑ Computed ONCE and used by the chart, its legend, its footnote and its
  // aria-label. They each decided separately before, so a hotel's first month —
  // comparison on, previous period empty — got a legend swatch and a screen
  // reader announcement for paler bars that were never drawn.
  const paired = Boolean(prevSeries && prevSeries.some((p) => p.amount > 0));
  const prevPoints = paired ? prevSeries : null;

  const dims = breakdown(shown, query.dim, deskName);
  const dimMax = Math.max(...dims.map((d) => d.amount), 1);

  // ---- the trip list -------------------------------------------------------
  const lensOf: Record<Lens, (r: HistoryRow) => boolean> = {
    waiting: (r) => Number(r.mission.waiting_fee ?? 0) > 0,
    noshow: (r) => r.mission.status === "completed" && r.mission.no_show,
    cancelled: (r) => r.mission.status === "cancelled",
    unsettled: (r) => !r.counted,
    unfilled: (r) => isExpired(r.mission),
  };
  const listed = query.lens ? shown.filter(lensOf[query.lens]) : shown;

  const categories = [...new Set(missions.map((m) => m.category))]
    .map((key) => ({ key: key as VehicleCategory, label: categoryLabel(key) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const oldest = missions.length > 0 ? missions[missions.length - 1] : null;
  const firstDay = oldest ? parisDayKey(oldest.pickup_at) : null;
  const today = parisDayKey(new Date());
  const activeDriverName = query.driverId
    ? ([...contacts.entries()].find(([id]) => driverIdOf.get(id) === query.driverId)?.[1].name ?? null)
    : null;

  // Group the list by Paris month, as History does — but only under a date sort,
  // since a fare sort would produce month bands that aren't chronological.
  const grouped = query.sort === "recent" || query.sort === "oldest";
  const groups = new Map<string, HistoryRow[]>();
  for (const r of listed) {
    const key = grouped ? parisDayKey(r.mission.pickup_at).slice(0, 7) : "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const href = (patch: Partial<SpendQuery>) => `/dispatch/spend${spendHref(query, patch)}`;
  const waste = wasteLines(t);
  const avoid = avoidable(t);
  const stamp = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date());

  const components = [
    { key: "fares", label: "Trip fares", n: `${t.fareCount} trip${t.fareCount === 1 ? "" : "s"}`, v: t.fares, lens: null },
    { key: "waiting", label: "Waiting charges", n: t.waitingCount > 0 ? `${t.waitingCount} trip${t.waitingCount === 1 ? "" : "s"} · ${Math.round(t.waitingMinutes)} min` : "none", v: t.waiting, lens: "waiting" as Lens },
    { key: "cancelled", label: "Cancellation fees", n: t.cancelCount > 0 ? `${t.cancelCount} cancellation${t.cancelCount === 1 ? "" : "s"}` : "none", v: t.cancelFees, lens: "cancelled" as Lens },
    { key: "noshow", label: "No-shows", n: t.noShowCount > 0 ? `${t.noShowCount} no-show${t.noShowCount === 1 ? "" : "s"}` : "none", v: t.noShow, lens: "noshow" as Lens },
    // docs/06 §3 — the two fee lines, never folded into the four above. The
    // Business reclaims the 20 % VAT on Kavenue's fee and nothing on the
    // transport, so a total that hides the split can't tell them what they can
    // claim back. The four transport components plus these two are the total,
    // exactly: each row's triple reconciles before it is summed.
    { key: "fee", label: "Service fee", n: "Kavenue", v: t.serviceFee, lens: null },
    { key: "feevat", label: "VAT on service fee", n: "you reclaim this", v: t.serviceFeeVat, lens: null },
  ];

  return (
    <>
      <div className="dxs-head">
        <div>
          <h1 className="dset__h1">Spend</h1>
          <p className="dset__sub">
            {span.label}
            {back ? ` · compared with ${back.label}` : " · no comparison"} · Europe/Paris
          </p>
        </div>
        {/* Not decoration: fares are computed on read, so the hotel must never
            wonder whether the number in front of them is stale. */}
        <span className="dxs-fresh">as of {stamp} (Paris)</span>
      </div>

      <SpendFilters
        query={query}
        view={{ label: span.label, isCurrent: isCurrentSpan(span), fromDay: span.fromDay, toDay: span.toDay }}
        categories={categories}
        today={today}
        firstDay={firstDay}
        driverName={activeDriverName}
      />

      {error && <div className="notice error">Couldn’t load your spend: {error.message}</div>}

      {/* ---- hero: one total in charge, two stats that qualify it ---------- */}
      <div className="dcard dxs-hero">
        <div className="dxs-hero__main">
          <p className="dcard__label">Total spend</p>
          <div className="etotal">{formatMoney(t.total)}</div>
          <div className="etotal__sub">
            {t.trips} trip{t.trips === 1 ? "" : "s"} · {t.ordered} mission
            {t.ordered === 1 ? "" : "s"} ordered
          </div>
          {back && (
            /* Neutral whenever there is nothing to compare against — an empty
               previous period is not a 100 % rise, and painting it red would
               alarm a hotel about its own first month. */
            <span
              className={`ecmp ${
                p.total === 0 || runningDay
                  ? "ecmp--flat"
                  : t.total > p.total
                    ? "ecmp--down"
                    : t.total < p.total
                      ? "ecmp--up"
                      : "ecmp--flat"
              }`}
            >
              {p.total === 0 || runningDay || t.total === p.total ? (
                <Minus size={13} aria-hidden="true" />
              ) : t.total > p.total ? (
                <TrendingUp size={13} aria-hidden="true" />
              ) : (
                <TrendingDown size={13} aria-hidden="true" />
              )}
              {p.total === 0 && t.total === 0
                ? `Nothing spent in ${back.label} either`
                : p.total === 0
                  ? `Nothing to compare — ${back.label} has no trips`
                  : runningDay
                    ? `Day still running · ${back.label} came to ${formatMoney(p.total)}`
                    : `${t.total >= p.total ? "+" : "−"}${formatMoney(Math.abs(t.total - p.total))} · ${
                        t.total >= p.total ? "+" : "−"
                      }${Math.abs(((t.total - p.total) / p.total) * 100).toFixed(1).replace(".", ",")} % vs ${back.label}`}
            </span>
          )}
        </div>

        <div className="dxs-hero__stats">
          <div className="dxs-stat">
            <div className="dxs-stat__l">Trips</div>
            <div className="dxs-stat__n">{t.trips}</div>
            <div className="dxs-stat__d">
              {!back
                ? "comparison off"
                : p.trips === 0
                  ? "no previous period"
                  : runningDay
                    ? `${p.trips} on ${back.label}`
                    : `${t.trips >= p.trips ? "+" : "−"}${Math.abs(t.trips - p.trips)} vs ${back.label}`}
            </div>
          </div>
          <div className="dxs-stat">
            <div className="dxs-stat__l">Cost per trip</div>
            <div className="dxs-stat__n">
              {t.costPerTrip == null ? "—" : formatMoney(t.costPerTrip)}
            </div>
            <div className="dxs-stat__d">
              {t.trips === 0
                ? "no trips settled"
                : t.trips < 5
                  ? `a mean of ${t.trips}`
                  : back && p.costPerTrip
                    ? `was ${formatMoney(p.costPerTrip)}`
                    : "fare, waiting and fee"}
            </div>
          </div>
        </div>
      </div>

      <ServiceStrip t={t} />

      {/* ---- the one chart ------------------------------------------------- */}
      {/* ⚑ No chart on a single-bucket view. "Spend over time" across one day is
          the hero number drawn a second time as a bar — the founder's word was
          "ridiculous", and they were right. Specified in SPEND_BRIEF § 2 module
          3 ("Day → no chart at all, the tile carries it") and missed on the way
          in. A week keeps its chart: seven days against seven is a real
          comparison, and it's the view where every bar carries its own figure. */}
      {points.length > 1 && (
      <div className="dcard">
        <div className="dcard__label dcard__label--split">
          <span>Spend over time</span>
          {paired && back && (
            <span className="dxs-legend">
              <i className="dxs-sw dxs-sw--now" aria-hidden="true" />
              {span.label}
              <i className="dxs-sw dxs-sw--prev" aria-hidden="true" />
              {back.label}
            </span>
          )}
        </div>
        {t.ordered === 0 ? (
          <p className="dxs-none">No missions in this period.</p>
        ) : (
          <SpendChart
            points={points}
            compare={prevPoints}
            compareLabel={back?.label ?? null}
            periodLabel={span.label}
            hrefFor={
              bucket === "day"
                ? (pt) => href({ period: "day", anchor: pt.key, from: null, to: null })
                : bucket === "week"
                  ? (pt) => href({ period: "week", anchor: pt.key, from: null, to: null })
                  : (pt) => href({ period: "month", anchor: pt.key, from: null, to: null })
            }
          />
        )}
        <p className="dxs-foot">
          Each column is one {bucket} of {span.label}, waiting and fees included
          {back ? `, paired with the same ${bucket} of ${back.label}` : ""}. Hover a column for the
          figures; click it to narrow the whole page to that {bucket}.
        </p>
      </div>
      )}

      {/* ---- what it's made of | what cost you money ----------------------- */}
      <div className="dxs-band">
        <div className="dcard">
          <p className="dcard__label">What makes up the total</p>

          {/* ⚑ No comparison column here, deliberately. This section answers
              "what is the total made of" — a composition. Hanging a change
              column on it made the reader do work to find out what a lone
              "+45,00 €" referred to, and the founder's rule is the right one:
              good UX means not having to think. The comparison now lives where
              it can be SEEN rather than read — the hero pill and the paired
              bars on the chart. */}
          {components.map((c) => {
            const body = (
              <>
                <span className="dxs-comp__l">
                  {c.label} <span className="dxs-comp__n">{c.n}</span>
                </span>
                <b className={`dxs-comp__v${c.v === 0 ? " dxs-zero" : ""}`}>{formatMoney(c.v)}</b>
              </>
            );
            return c.lens && c.v > 0 ? (
              <Link
                key={c.key}
                href={`${href({ lens: query.lens === c.lens ? null : c.lens })}#trips`}
                className={`dxs-comp dxs-lens${query.lens === c.lens ? " is-on" : ""}`}
              >
                {body}
              </Link>
            ) : (
              <div key={c.key} className="dxs-comp">
                {body}
              </div>
            );
          })}

          {/* Excluded, never hidden. Counting these would inflate a hotel's spend
              with trips that may never have happened. */}
          <div className="dxs-exc">
            <Link
              href={`${href({ lens: query.lens === "unsettled" ? null : "unsettled" })}#trips`}
              className={`dxs-comp dxs-lens${query.lens === "unsettled" ? " is-on" : ""}`}
            >
              <span className="dxs-comp__l">
                Agreed, not settled{" "}
                <span className="dxs-comp__n">
                  {t.unsettledCount} trip{t.unsettledCount === 1 ? "" : "s"} a Driver hasn’t closed
                </span>
              </span>
              <b className="dxs-comp__v">{formatMoney(t.unsettled)}</b>
            </Link>
            {t.unfilledCount > 0 ? (
              <Link
                href={`${href({ lens: query.lens === "unfilled" ? null : "unfilled" })}#trips`}
                className={`dxs-comp dxs-lens${query.lens === "unfilled" ? " is-on" : ""}`}
              >
                <span className="dxs-comp__l">
                  Unfilled{" "}
                  <span className="dxs-comp__n">
                    {t.unfilledCount} mission{t.unfilledCount === 1 ? "" : "s"}
                    {t.unfilledCeiling > 0
                      ? ` · ${formatMoney(t.unfilledCeiling)} of Ceiling never spent`
                      : ""}
                  </span>
                </span>
                <b className="dxs-comp__v">—</b>
              </Link>
            ) : (
              <div className="dxs-comp">
                <span className="dxs-comp__l">
                  Unfilled <span className="dxs-comp__n">none</span>
                </span>
                <b className="dxs-comp__v">—</b>
              </div>
            )}
          </div>
        </div>

        <div className="dcard">
          <p className="dcard__label">What went wrong</p>
          {waste.map((w) => {
            const body = (
              <>
                <span className="dxs-w__l">
                  {w.label}
                  <span className="dxs-w__n">{w.detail}</span>
                </span>
                <span className={`dxs-w__v${!w.amount ? " zero" : ""}`}>
                  {w.amount == null ? "no cost" : formatMoney(w.amount)}
                </span>
              </>
            );
            // Every line here names a set of trips; each one is now reachable.
            const lens = w.count > 0 ? (w.key as Lens) : null;
            return lens && LENS_LABEL[lens] ? (
              <Link
                key={w.key}
                href={`${href({ lens: query.lens === lens ? null : lens })}#trips`}
                className={`dxs-w dxs-lens${query.lens === lens ? " is-on" : ""}`}
              >
                {body}
              </Link>
            ) : (
              <div key={w.key} className="dxs-w">
                {body}
              </div>
            );
          })}
          <p className="dxs-foot">
            {avoid > 0
              ? `${formatMoney(avoid)} of this period — ${((avoid / (t.total || 1)) * 100).toFixed(1).replace(".", ",")} % of what you spent. Most of it is timing your desk controls: how late a trip is cancelled, and whether the Guest is ready when the Driver arrives.`
              : "Nothing avoidable cost you money in this period."}
          </p>
        </div>
      </div>

      {/* ---- where the money went ------------------------------------------ */}
      <div className="dcard">
        <div className="dcard__label dcard__label--split">
          <span>Where the money went</span>
          <span className="seg seg--tiny" role="group" aria-label="Break spend down by">
            {DIMS.map((d) => (
              <Link
                key={d}
                href={href({ dim: d })}
                className={`seg-btn${query.dim === d ? " is-on" : ""}`}
                aria-current={query.dim === d ? "true" : undefined}
                scroll={false}
              >
                {DIM_LABEL[d]}
              </Link>
            ))}
          </span>
        </div>

        {dims.length === 0 ? (
          <p className="dxs-none">Nothing to break down in this period.</p>
        ) : (
          <div className="dxs-brk">
            {dims.map((d) => {
              const inner = (
                <>
                  <span className="dxs-r__lab">
                    {d.label}
                    <span className="dxs-bar" style={{ width: `${Math.max(2, (d.amount / dimMax) * 100)}%` }} />
                  </span>
                  <span className="dxs-r__num">
                    {d.trips} trip{d.trips === 1 ? "" : "s"}
                  </span>
                  <span className="dxs-r__eur">{formatMoney(d.amount)}</span>
                  <span className="dxs-r__pc">{d.share.toFixed(1).replace(".", ",")} %</span>
                </>
              );
              // Only the Driver dimension can filter the page — it's the one with
              // a param behind it. The rest are read-only rankings for now.
              return d.driverId && !d.other ? (
                <Link
                  key={d.key}
                  href={href({ driverId: query.driverId === d.driverId ? null : d.driverId })}
                  className={`dxs-r dxs-r--link${query.driverId === d.driverId ? " is-on" : ""}`}
                  scroll={false}
                >
                  {inner}
                </Link>
              ) : (
                <div key={d.key} className={`dxs-r${d.other ? " dxs-r--other" : ""}`}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}

        <p className="dxs-foot">
          {query.dim === "type"
            ? "At disposal will appear here once it can be booked."
            : query.dim === "route"
              ? "Routes are grouped from the addresses as typed — near-duplicates are not merged."
              : query.dim === "driver"
                ? "Top Drivers by spend. Click one to narrow the whole page to them."
                : "Top rows by spend, waiting included."}
        </p>
      </div>

      {/* ---- every trip ----------------------------------------------------- */}
      <div className="dxs-listbar" id="trips">
        <p className="dxs-listhead">Every trip</p>
        {query.lens && (
          <p className="dxs-lensnote">
            Showing {LENS_LABEL[query.lens]} · {listed.length} trip
            {listed.length === 1 ? "" : "s"}{" "}
            <Link href={href({ lens: null })} scroll={false}>
              Show all
            </Link>
          </p>
        )}
      </div>

      {listed.length === 0 ? (
        <div className="empty">
          {query.lens
            ? `No ${LENS_LABEL[query.lens]} in this period.`
            : "No trips in this period."}
        </div>
      ) : (
        [...groups.entries()].map(([monthKey, list]) => {
          let monthSpend = 0;
          let monthTrips = 0;
          for (const r of list) {
            monthSpend += rowCost(r);
            // ⚑ Count what the euros come from. Printing `list.length` beside a
            // sum meant "4 trips · 0,00 €" under an unsettled lens — two numbers
            // describing different populations.
            if (r.counted && !isExpired(r.mission) && r.mission.status === "completed") monthTrips += 1;
          }
          return (
            <section key={monthKey || "flat"} className="dx-sched">
              {monthKey && (
                <div className="dx-day" id={`day-${monthKey}`}>
                  <h2>{formatMonth(monthKey)}</h2>
                  <span className="dx-count">
                    {list.length} row{list.length === 1 ? "" : "s"}
                    {monthTrips !== list.length ? ` · ${monthTrips} settled` : ""} ·{" "}
                    {formatMoney(monthSpend)}
                  </span>
                </div>
              )}
              <div className="dx-colhead dx-colhead--arch">
                <span>Date</span>
                <span>Route</span>
                <span>Flight</span>
                <span>Guest</span>
                <span>Ref</span>
                <span>Driver</span>
                <span>Fare</span>
                <span>Outcome</span>
              </div>
              {list.map((r) => (
                <TripRow
                  key={r.mission.id}
                  mission={r.mission}
                  driver={contacts.get(r.mission.id) ?? null}
                  archived
                  // Settled rows show what the trip actually cost — waiting
                  // included — so the row sums to the bar above it and the
                  // "incl. … waiting" note under it is finally true. A row that
                  // isn't settled keeps showing its agreed fare, greyed.
                  fare={
                    r.counted ? rowCost(r) : r.fare == null ? null : businessCost(r.mission, r.fare)
                  }
                  farePending={!r.counted}
                  query={query.q}
                  matchedOn={matches.get(r.mission.id) ?? null}
                />
              ))}
            </section>
          );
        })
      )}

      <div className="dlock dlock--foot">
        <span>
          Each fare is the price the Driver accepted, frozen at that moment. Nothing here has been
          charged yet — amounts settle manually during beta. Trips a Driver hasn’t closed are shown
          but excluded from every total, and an unfilled mission costs nothing.
        </span>
      </div>

      {openId && <ScrollToTrip missionId={openId} />}
    </>
  );
}

/** Whether the applied span contains today — the › step is then a no-op. */
function isCurrentSpan(span: { fromDay: string; toDay: string }): boolean {
  const today = parisDayKey(new Date());
  return today >= span.fromDay && today <= span.toDay;
}
