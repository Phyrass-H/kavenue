// The cars. A search, then one grid that sets today's cars beside the period's trips, class by class
// (S81 — the founder's step 5, shaped on a preview of the live rows and approved 2026-09-14, [[d142]]).
//
// ⚑ THE SAME WORDS AND THE SAME CLEAN ROWS AS /admin/drivers "To be approved" (S80, [[d140]]). A car
// row is its Driver's three approvals — adminPiles, ApprovalCell, the S80 classes — so a Driver reads
// the same on both pages. Nothing here invents a synonym.
//
// ⚑ NEVER AN UNFILTERED LIST ([[d100]]). The grid IS the navigation: a row opens its cars. A search
// opens the cars that match, and — the founder, 2026-09-14 — the cars they replaced, *"so we can have
// a trace of older cars and why they are not in the circuit anymore"*.
//
// ⚑ TWO CLOCKS, AND THE PAGE SAYS WHICH IS WHICH. The cars are counted TODAY and never move with the
// period ([[d103]]); the trips follow it, counted by PICKUP date. The grid's subtitle says so in words.
import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { pageWindow, pageNote, readAll } from "@/lib/admin-list";
import { parseAdminPeriod } from "@/lib/admin-period";
import { AdminPeriodBar } from "@/components/admin-period-bar";
import { DRIVER_DOC_TYPES } from "@/lib/account";
import { latestSlots } from "@/lib/document-views";
import { adminPiles, PILL_WORD, type AdminPile } from "@/lib/driver-approvals";
import { classKeyLabel, driverSearchTerm } from "@/lib/admin-drivers";
import {
  VEHICLES_MIGRATION,
  canWorkIdle,
  carListHref,
  carModelOf,
  carRowKindOf,
  carsMatchSays,
  filledSays,
  gridLabel,
  gridRowHref,
  nobodyTookOf,
  personNotApprovedSays,
  replacedSays,
  rpcMissing,
  vehicleFilter,
  vehicleGridRows,
  type AdminVehicleOverview,
  type NobodyTookState,
  type PeriodCarry,
  type VehicleGridRow,
} from "@/lib/admin-vehicles";
import type { AdminVehicleFindRow, ApprovalStatus } from "@/lib/database.types";
import { ApprovalCell } from "@/components/admin-approval-cell";

export const dynamic = "force-dynamic";

const PER_PAGE = 60;
const count = new Intl.NumberFormat("fr-FR");

/** How "nobody took" looks. Keyed by the state, so a fourth one is a compile error, not an unstyled cell. */
const NOBODY_LOOK: Record<NobodyTookState, string> = {
  bad: "adm-row__kind adm-row__kind--bad", // a trip of this class ended with no Driver
  zero: "adm-row__kind", //                  there were trips, and every one was settled otherwise
  none: "adm-row__kind", //                  no trips to fail
};

/** The refusal a section draws instead of its rows. ⚑ "Run the migration" only when the function is
 *  truly not there (42883 / PGRST202) — the Drivers page's 13d sentence, told apart from any other
 *  failure, which is said as itself. */
function Refusal({ fn, error }: { fn: string; error: { code?: string; message?: string } }) {
  return (
    <p className="adm-lede adm-lede--bad">
      {rpcMissing(error)
        ? `This needs ${fn} — run ${VEHICLES_MIGRATION}.`
        : `${fn} couldn’t be read.`}
      {error.message && ` (${error.message})`}
    </p>
  );
}

function GridHead() {
  return (
    <div className="adm-row adm-vg adm-vg__head" aria-hidden="true">
      <span />
      <span>can work</span>
      <span>to be approved</span>
      <span>trips</span>
      <span>filled</span>
      <span>nobody took</span>
    </div>
  );
}

/** One class: how many of its cars can work today, how many wait on us, and what the period asked of it.
 *  Every cell carries its column name for a screen reader, and for everyone on a narrow screen. */
function GridRow({ row, carry }: { row: VehicleGridRow; carry: PeriodCarry }) {
  const nobody = nobodyTookOf(row);
  return (
    <Link href={gridRowHref(row, carry)} className={row.gapBefore ? "adm-row adm-vg adm-vg--gap" : "adm-row adm-vg"}>
      <span className="adm-row__name">{row.label}</span>
      <span className={canWorkIdle(row) ? "adm-row__side adm-vg__num adm-row__side--idle" : "adm-row__side adm-vg__num"}>
        <span className="adm-apv__l">can work</span>
        {count.format(row.canWork)}
      </span>
      {row.waiting > 0 || row.personNotApproved > 0 || row.refused > 0 ? (
        <span className="adm-row__side">
          <span className="adm-apv__l">to be approved</span>
          <span className="adm-row__pills">
            {row.waiting > 0 && <span className="adm-pill adm-pill--warn">{count.format(row.waiting)}</span>}
            {row.personNotApproved > 0 && (
              <span className="adm-pill">{personNotApprovedSays(row.personNotApproved)}</span>
            )}
            {row.refused > 0 && <span className="adm-pill">{count.format(row.refused)} refused</span>}
          </span>
        </span>
      ) : (
        <span className="adm-row__side adm-vg__faint">
          <span className="adm-apv__l">to be approved</span>—
        </span>
      )}
      <span className="adm-row__side adm-vg__num">
        <span className="adm-apv__l">trips</span>
        {count.format(row.trips)}
      </span>
      <span className="adm-row__side adm-vg__num">
        <span className="adm-apv__l">filled</span>
        {filledSays(row)}
      </span>
      <span className={NOBODY_LOOK[nobody.state]}>
        <span className="adm-apv__l">nobody took</span>
        {nobody.text}
      </span>
    </Link>
  );
}

/** The column names. Not a link, and hidden from a screen reader, which reads each cell's own name. */
function CarHead() {
  return (
    <div className="adm-row adm-apv adm-vcar adm-apv__head" aria-hidden="true">
      <span>Model</span>
      <span>Plate</span>
      <span>Class</span>
      <span>Driver</span>
      <span>{PILL_WORD.person}</span>
      <span>{PILL_WORD.company}</span>
      <span>{PILL_WORD.vehicle}</span>
    </div>
  );
}

/** A car: what it is, whose it is — then the three approvals, or the trace of the car that replaced it. */
function CarRow({ c, piles, unread }: { c: AdminVehicleFindRow; piles: AdminPile[]; unread: boolean }) {
  const kind = carRowKindOf(c, unread);
  let approvals: React.ReactNode;
  switch (kind) {
    case "replaced":
      approvals = (
        <span className="adm-apv__span">
          <span className="adm-vcar__replaced">{replacedSays(c)}</span>
        </span>
      );
      break;
    case "unread":
      // ⚑ NEVER CONFIDENT CELLS FROM A FAILED READ (S79). An empty papers read says "documents needed"
      //   — confident, and false. The row says what is true instead.
      approvals = (
        <span className="adm-apv__span">
          <span className="adm-pill">Approvals unread</span>
        </span>
      );
      break;
    case "piles":
      approvals = piles.map((p) => <ApprovalCell key={p.pile} p={p} />);
      break;
    default: {
      // ⚑ A fourth kind is a compile error here, not a row with nothing in its last three columns.
      const unreachable: never = kind;
      approvals = unreachable;
    }
  }
  return (
    <Link href={`/admin/drivers/${c.driver_id}`} className="adm-row adm-apv adm-vcar">
      <span className="adm-row__name" title={carModelOf(c)}>{carModelOf(c)}</span>
      <span className="adm-row__side">{c.plate ?? "—"}</span>
      <span className="adm-row__side">{classKeyLabel(c.category, c.body_type)}</span>
      <span className="adm-row__side" title={`${c.first_name} ${c.last_name}`}>
        {c.first_name} {c.last_name}
      </span>
      {approvals}
    </Link>
  );
}

export default async function AdminVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    body?: string | string[];
    page?: string;
    period?: string;
    anchor?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { q, category, body, page, period, anchor, from, to } = await searchParams;
  // ⚑ `?q=a&q=b` is an array. The box shows, and the search uses, the first (S79 review).
  const typed = (Array.isArray(q) ? q[0] : q) ?? "";
  const term = driverSearchTerm(q);
  // ⚑ A SEARCH WINS OVER A CLASS. The box sends no category, so both arrive together only from a
  //   hand-made URL — and then the title "N cars match" must be true of the list under it.
  const filter = term === null ? vehicleFilter(category, body) : null;
  const listing = term !== null || filter !== null;
  const win = pageWindow(page, PER_PAGE);
  const when = parseAdminPeriod({ period, anchor, from, to });
  // What every link on the page must carry to stay in the same period.
  const carry: PeriodCarry = { period: when.period, anchor: when.anchor, from, to };
  const db = await createClient();

  const [overviewRes, findRes] = await Promise.all([
    // The grid is not drawn under a search (the approved preview, b.html), so it is not asked for.
    term === null ? db.rpc("admin_vehicle_overview", { p_from: when.fromIso, p_to: when.toIso }) : null,
    listing
      ? db.rpc("admin_vehicle_find", {
          p_q: term,
          p_category: filter?.category ?? null,
          p_body: filter?.body ?? null,
          // ⚑ A search finds the replaced cars too ([[d142]] rule 5); a class's list is today's cars.
          p_include_replaced: term !== null,
          p_limit: PER_PAGE,
          p_offset: win.from,
        })
      : null,
  ]);

  const cars: AdminVehicleFindRow[] = findRes?.data ?? [];
  const carsTotal = Number(cars[0]?.total_count ?? 0);
  // ⚑ A COUNT ONLY FROM A READ THAT WORKED, ON A PAGE THAT HAS ROWS (S81 review). A missing function and
  //   a page past the end both return no row to carry total_count, and "0 cars match" would be a
  //   confident, false sentence.
  const pastEnd = !findRes?.error && cars.length === 0 && win.page > 0;
  const countKnown = !findRes?.error && !pastEnd;

  // ⚑ THE APPROVALS ARE READ ONCE FOR EVERY CAR ON THE PAGE — the papers of the Drivers shown, never a
  //   query per row — exactly as /admin/drivers reads them. A replaced car needs none: it has no
  //   approvals left to state. The car itself is the row: at most one live car per Driver
  //   (vehicle_one_live_per_driver), so a live row IS its Driver's live car.
  const ids = [...new Set(cars.filter((c) => !c.retired_at).map((c) => c.driver_id))];
  const papersRead = { failed: false };
  const papers =
    ids.length === 0
      ? []
      : // ⚑ PAGED, BECAUSE AN UNBOUNDED SELECT STOPS AT 1 000 ROWS WITHOUT A WORD (lib/admin-list.ts
        //   readAll) — the Drivers page's read, for the Drivers page's reason (S79 review).
        await readAll(async (lo, hi) => {
          const res = await db
            .from("document")
            .select("owner_id, type, side, status, uploaded_at, expires_at")
            .eq("owner_type", "driver")
            .in("owner_id", ids)
            .order("id")
            .range(lo, hi);
          if (res.error) papersRead.failed = true;
          return res;
        });
  const papersBy = new Map<string, typeof papers>();
  for (const p of papers) papersBy.set(p.owner_id, [...(papersBy.get(p.owner_id) ?? []), p]);
  const papersUnread = ids.length > 0 && papersRead.failed;
  const now = new Date();
  const pilesFor = (c: AdminVehicleFindRow): AdminPile[] =>
    papersUnread || c.retired_at
      ? []
      : adminPiles(
          { verified: c.verified },
          // ⚑ The column is text on the way out of SQL. statusOf re-checks it at runtime and reads
          //   anything it does not know as pending, never as approved (lib/vehicle-approval.ts).
          { approval_status: c.approval_status as ApprovalStatus, retired_at: c.retired_at },
          latestSlots(papersBy.get(c.driver_id) ?? [], DRIVER_DOC_TYPES),
          now,
        );

  const o = (overviewRes?.data ?? null) as AdminVehicleOverview | null;

  const carList = listing && (
    <section className="adm-sect">
      <h2 className="adm-sect__h">
        {term !== null
          ? countKnown
            ? carsMatchSays(carsTotal, term)
            : `Cars matching “${term}”`
          : `Cars in ${gridLabel(filter!.category, filter!.body)}`}
      </h2>
      <p className="adm-sect__s">
        {term !== null
          ? "Today’s cars and the ones they replaced, with the same three approvals as the Drivers page."
          : "Today’s cars."}
      </p>
      {findRes?.error ? (
        <Refusal fn="admin_vehicle_find" error={findRes.error} />
      ) : pastEnd ? (
        <p className="adm-none">
          This page is past the end of the list.{" "}
          <Link href={carListHref({ q: term, category: filter?.category, body: filter?.body }, carry, 0)}>
            Back to the first page
          </Link>
        </p>
      ) : cars.length === 0 ? (
        <p className="adm-none">{term !== null ? `Nothing matches “${term}”.` : "No car in this class today."}</p>
      ) : (
        <>
          {papersUnread && (
            <p className="adm-quiet">
              The approvals couldn’t be read, so these rows can’t say what’s missing.
            </p>
          )}
          <CarHead />
          {cars.map((c) => (
            <CarRow key={c.vehicle_id} c={c} piles={pilesFor(c)} unread={papersUnread} />
          ))}
          {(() => {
            // ⚑ "First", not "Newest": this list is in class order, not date order.
            const n = pageNote(carsTotal, win, PER_PAGE, "First");
            if (!n) return null;
            const href = (p: number) =>
              carListHref({ q: term, category: filter?.category, body: filter?.body }, carry, p);
            return (
              <div className="adm-page">
                <span>{n.says}</span>
                <span className="adm-page__go">
                  {n.newer !== null && <Link href={href(n.newer)}>← Previous</Link>}
                  {n.older !== null && <Link href={href(n.older)}>Next →</Link>}
                </span>
              </div>
            );
          })()}
        </>
      )}
    </section>
  );

  return (
    // ⚑ `adm-main--drivers` gives this page the Drivers page's section titles (app/globals.css, S80) —
    //   the same look, not a second spelling of it.
    <main className="adm-main adm-main--drivers">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Vehicles</h1>
          <p className="adm-head__meta">
            Every car, whether it can work, and whether there are enough of each kind for the trips.
          </p>
        </div>
      </header>

      <form className="adm-search adm-search--drivers" action="/admin/vehicles">
        <Search size={17} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          name="q"
          defaultValue={typed}
          placeholder="Plate, make, model, colour, Driver or company"
          aria-label="Search cars"
        />
        {/* A search keeps the period, so clearing it lands back where you were. */}
        {when.period && <input type="hidden" name="period" value={when.period} />}
        {when.period === "range" && from && <input type="hidden" name="from" value={from} />}
        {when.period === "range" && to && <input type="hidden" name="to" value={to} />}
        {when.period && when.period !== "range" && when.anchor && (
          <input type="hidden" name="anchor" value={when.anchor} />
        )}
      </form>
      {/* ⚑ A term too short to search is said, not silently ignored (S79 review). */}
      {term === null && typed.trim() !== "" && (
        <p className="adm-quiet">Type at least 2 characters to search.</p>
      )}

      {carList}

      {term === null && (
        <>
          <AdminPeriodBar
            now={when}
            base="/admin/vehicles"
            keep={{ category: filter?.category, body: filter?.body }}
          />

          <section className="adm-sect">
            <h2 className="adm-sect__h">Cars and trips, by class</h2>
            <p className="adm-sect__s">Cars are counted today. Trips follow the period. A row opens its cars.</p>
            {overviewRes?.error || !o ? (
              <Refusal
                fn="admin_vehicle_overview"
                error={overviewRes?.error ?? { message: "no answer" }}
              />
            ) : (
              <>
                <GridHead />
                {vehicleGridRows(o).map((row) => (
                  <GridRow key={row.key} row={row} carry={carry} />
                ))}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
