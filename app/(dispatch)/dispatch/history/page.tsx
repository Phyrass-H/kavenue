import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { categoryLabel, formatMoney, formatMonth } from "@/lib/format";
import { isExpired, parisDayKey } from "@/lib/dispatch-status";
import { TripRow, type DriverContact } from "@/components/trip-row";
import { loadDriverWalks } from "@/lib/side-tables";
import { HistoryFilters } from "@/components/history-filters";
import { ScrollToTrip } from "@/components/scroll-to-trip";
import {
  applyHistoryQuery,
  historyFare,
  historyHref,
  isFiltered,
  OUTCOMES,
  parseHistoryQuery,
  periodView,
  type HistoryRow,
  type Outcome,
  type Sort,
} from "@/lib/history-filter";
import { rowCost } from "@/lib/spend";
import { businessCost } from "@/lib/commission";
import type { MissionRow, VehicleCategory } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * The outcomes a Business actually asks about. Mirrors the Driver's Past tab
 * ([[d56]]) and adds "Unfilled" — the § P ending, which only exists on this side
 * (a trip nobody accepted never belonged to a Driver, so it can't be in theirs).
 *
 * A **no-show ends as `completed` + `no_show`** — `mark_no_show` charges the
 * Business in full and pays the Driver like a completed trip, so it belongs
 * under Completed, not Cancelled. Same call the Driver's archive makes.
 *
 * ⚑ These buckets deliberately do NOT cover everything. A past trip still sitting
 * `confirmed`/`on_board` — a Driver took it and never closed it — has no ending in
 * the model yet, so it appears under All and nowhere else. That is why the chip
 * counts don't sum to All, and it stays visible on purpose until the founder's
 * § Q design ships (designed S52, parked on push — see BACKLOG § Q / [[d67]]).
 */
const OUTCOME_LABEL: Record<Outcome, string> = {
  all: "All",
  completed: "Completed",
  unfilled: "Unfilled",
  cancelled: "Cancelled",
};

/**
 * The 8-column header. Date and Fare are links that flip their own direction —
 * the same sort the toolbar's dropdown sets, reachable where the eye already is.
 */
function ColumnHead({ sort, hrefs }: { sort: Sort; hrefs: { date: string; fare: string } }) {
  const mark = (active: boolean, ascending: boolean) =>
    active ? <span className="dxh-sort__dir" aria-hidden="true">{ascending ? "↑" : "↓"}</span> : null;
  const onDate = sort === "recent" || sort === "oldest";
  const onFare = sort === "high" || sort === "low";
  return (
    <div className="dx-colhead dx-colhead--arch">
      <Link
        href={hrefs.date}
        className={`dxh-sort${onDate ? " is-on" : ""}`}
        scroll={false}
        aria-label={sort === "oldest" ? "Sort by date, newest first" : "Sort by date, oldest first"}
      >
        Date {mark(onDate, sort === "oldest")}
      </Link>
      <span>Route</span>
      <span>Flight</span>
      <span>Guest</span>
      <span>Ref</span>
      <span>Driver</span>
      <Link
        href={hrefs.fare}
        className={`dxh-sort dxh-sort--num${onFare ? " is-on" : ""}`}
        scroll={false}
        aria-label={sort === "high" ? "Sort by fare, lowest first" : "Sort by fare, highest first"}
      >
        Fare {mark(onFare, sort === "low")}
      </Link>
      <span>Outcome</span>
    </div>
  );
}

export default async function DispatchHistory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAppContext();
  if (!ctx.business) return null;

  const sp = await searchParams;
  const query = parseHistoryQuery(sp);
  const openId = typeof sp.open === "string" ? sp.open : undefined;

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data: all, error } = await supabase
    .from("mission")
    .select("*")
    .eq("business_id", ctx.business.id)
    .neq("status", "draft")
    .lt("pickup_at", nowIso)
    .order("pickup_at", { ascending: false });

  const missions: MissionRow[] = all ?? [];

  // Every trip a Driver walked away from. Without this the archive shows a
  // walked-and-never-refilled trip as plain "unfilled" — with no Driver name,
  // because the re-pool cleared driver_id — which is indistinguishable from a
  // trip nobody ever took. Same read as the Schedule, kept in step with it:
  // all walks per mission, newest first, never de-duplicated.
  //
  // ⚑ § R rule 1 — Business-scoped, was .in(<every archived mission id>). That list
  // ERRORED at 398 ids (measured 2026-08-23), and this is the archive, so it only
  // ever grows. Shared with the Schedule and both CSVs so the reads cannot drift.
  const driverWalks = await loadDriverWalks(supabase, ctx.business.id);

  // Driver + car for EVERY past trip, not just the ones on screen: the search
  // matches on a Driver's name and on a plate, which is impossible if the lookup
  // only covers rows that already survived the filter.
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
      const name = `${d.first_name} ${d.last_name}`;
      contacts.set(m.id, { name, phone: d.phone, vehicle: vehByDriver.get(d.id) ?? null });
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

  const { rows: shown, matches, counts } = applyHistoryQuery(rows, query);

  // ⚑ Waiting is part of the bill. HistoryResult.spend sums the FARE only, which
  // left this screen quietly under-reporting a trip where the Driver waited and
  // was paid for it — and would have disagreed with /dispatch/spend for the very
  // same filter. rowCost() is the one definition both screens use.
  let spend = 0;
  let waitingPart = 0;
  for (const r of shown) {
    spend += rowCost(r);
    // ALL IN, like `spend` beside it - it is rendered as "incl. … waiting"
    // INSIDE that figure, and rowCost puts the waiting through the commission.
    if (r.counted) waitingPart += businessCost(r.mission, Number(r.mission.waiting_fee ?? 0));
  }

  // Classes that actually occur in this archive — a dropdown offering "First"
  // to a hotel that has never booked one is a filter that can only disappoint.
  const categories = [...new Set(missions.map((m) => m.category))]
    .map((key) => ({ key: key as VehicleCategory, label: categoryLabel(key) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const oldest = missions.length > 0 ? missions[missions.length - 1] : null;
  const firstDay = oldest ? parisDayKey(oldest.pickup_at) : null;
  const today = parisDayKey(new Date());

  // Group by Paris month, preserving whatever order the sort produced. A fare
  // sort ignores months entirely, so it renders as one ungrouped list instead of
  // fake month bands that would no longer be chronological.
  const grouped = query.sort === "recent" || query.sort === "oldest";
  const groups = new Map<string, HistoryRow[]>();
  for (const r of shown) {
    const key = grouped ? parisDayKey(r.mission.pickup_at).slice(0, 7) : "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const nothingEverHappened = !error && missions.length === 0;
  const isEmpty = !error && shown.length === 0;
  const narrowed = isFiltered(query);
  const sortHref = {
    date: historyHref(query, { sort: query.sort === "recent" ? "oldest" : "recent" }),
    fare: historyHref(query, { sort: query.sort === "high" ? "low" : "high" }),
  };

  return (
    <>
      {!nothingEverHappened && !error && (
        <div className="dxh-head">
          <HistoryFilters
            query={query}
            view={periodView(query)}
            categories={categories}
            today={today}
            firstDay={firstDay}
            resultCount={shown.length}
          />

          <div className="dxh-bar">
            <div className="rfilter" role="group" aria-label="Filter past trips by outcome">
              {OUTCOMES.map((o) => (
                <Link
                  key={o}
                  href={`/dispatch/history${historyHref(query, { outcome: o })}`}
                  className={o === query.outcome ? "rchip rchip--on" : "rchip"}
                  aria-current={o === query.outcome ? "true" : undefined}
                  scroll={false}
                >
                  {OUTCOME_LABEL[o]} <span className="rchip__n">{counts[o]}</span>
                </Link>
              ))}
            </div>

            {/* One line that always answers "what am I looking at, and what did
                it cost". Under a search it says "of N" so a narrow result can
                never be mistaken for the whole archive. */}
            <p className="dxh-sum">
              <b>
                {shown.length} trip{shown.length === 1 ? "" : "s"}
              </b>
              {narrowed && counts.all !== missions.length ? ` of ${missions.length}` : ""}
              {" · "}
              {formatMoney(spend)}
              {waitingPart > 0 && (
                <span className="dxh-sum__sub"> incl. {formatMoney(waitingPart)} waiting</span>
              )}
              {query.outcome === "all" && counts.unfilled > 0 && (
                <>
                  {" · "}
                  <span className="dxh-sum__bad">{counts.unfilled} unfilled</span>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {error && <div className="notice error">Couldn’t load your history: {error.message}</div>}

      {/* Three different emptinesses, and they must not read alike: a brand-new
          Business, a search that found nothing, and an outcome bucket that is
          empty. Only the first one means "you have no history". */}
      {nothingEverHappened && <div className="empty">No past missions yet.</div>}
      {isEmpty && !nothingEverHappened && (
        <div className="empty">
          {query.q ? (
            <>
              {/* "with these filters" only when something OTHER than the search
                  is narrowing — otherwise it sends you hunting for filters that
                  aren't set. */}
              Nothing matches “{query.q}”
              {isFiltered({ ...query, q: "" }) && " with these filters"}.{" "}
              {/* A plain <a>, not <Link>: the search box owns its own text (that
                  is what fixed the type-and-revert bug), so a SOFT navigation
                  would empty the URL and leave "zzz" sitting in the field next to
                  every trip. A hard navigation remounts the toolbar, and this
                  path only exists when nothing matched anyway. */}
              <a href="/dispatch/history">Clear filters</a>
            </>
          ) : narrowed ? (
            <>
              No {query.outcome === "all" ? "" : `${OUTCOME_LABEL[query.outcome].toLowerCase()} `}
              trips in this selection. <a href="/dispatch/history">Clear filters</a>
            </>
          ) : (
            <>No {OUTCOME_LABEL[query.outcome].toLowerCase()} trips in your history.</>
          )}
        </div>
      )}

      {[...groups.entries()].map(([monthKey, list]) => {
        const unfilled = list.filter((r) => isExpired(r.mission)).length;
        let monthSpend = 0;
        for (const r of list) monthSpend += rowCost(r);
        return (
          <section key={monthKey || "flat"} className="dx-sched">
            {monthKey && (
              <div className="dx-day" id={`day-${monthKey}`}>
                <h2>{formatMonth(monthKey)}</h2>
                <span className="dx-count">
                  {list.length} trip{list.length === 1 ? "" : "s"} · {formatMoney(monthSpend)}
                  {/* Only when it's non-zero — a good month stays quiet. Redundant
                      while the Unfilled filter is active, so it's hidden there. */}
                  {query.outcome === "all" && unfilled > 0 && (
                    <>
                      {" · "}
                      <span className="dx-count__bad">{unfilled} unfilled</span>
                    </>
                  )}
                </span>
              </div>
            )}
            <ColumnHead
              sort={query.sort}
              hrefs={{
                date: `/dispatch/history${sortHref.date}`,
                fare: `/dispatch/history${sortHref.fare}`,
              }}
            />
            {list.map((r) => (
              // An unsettled row deliberately shows the bare agreed fare, with no
              // waiting folded in — but a Business is still only ever shown its own
              // side of that fare.
              <TripRow
                key={r.mission.id}
                mission={r.mission}
                driver={contacts.get(r.mission.id) ?? null}
                driverWalks={driverWalks.get(r.mission.id) ?? null}
                archived
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
      })}

      {openId && <ScrollToTrip missionId={openId} />}
    </>
  );
}
