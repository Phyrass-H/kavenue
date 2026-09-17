// The fleet. Four numbers, then breakdowns that ARE the navigation, then a list
// that only ever appears filtered — the Businesses screen's twin ([[d100]]).
//
// ⚑ THE STATE IS STILL ON THE ROW, NEVER IN A COUNT AT THE TOP. The founder has
// rejected roll-up summaries twice, and the numbers band does not change that:
// every figure up there is one NO ROW CAN SAY (how many Drivers there are, the
// typical workload), and every fact about a particular Driver — can the Pool
// reach them, are they working, are they verified — is on their own row.
//
// ⚑ AND IT ANSWERS THE TWO THINGS THE FOUNDER ASKED FOR BY NAME (S71): *"cars,
// classes and categories"*, and *"men and women"* — the second with its own
// denominator, because most of the fleet has never been asked.
//
// ⚑ S79 — A SEARCH, THEN THE DRIVERS WHO CAN'T WORK YET, ABOVE THE NUMBERS. The
// founder's step 4 (2026-09-09), shaped on a preview built from the live fleet and
// approved 2026-09-13: *"all three approvals, placement is good"*. Above, because it
// is the part a person acts on and the band is the part they read. It follows no
// period: a Driver whose car is waiting is waiting today, whatever month the
// numbers underneath describe.
import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { pageWindow, pageNote, readAll } from "@/lib/admin-list";
import { parseAdminPeriod, inPeriod } from "@/lib/admin-period";
import { AdminPeriodBar } from "@/components/admin-period-bar";
import { ApprovalCell } from "@/components/admin-approval-cell";
import { worthBreakingDown } from "@/lib/admin-rollup";
import { DRIVER_DOC_TYPES } from "@/lib/account";
import { latestSlots } from "@/lib/document-views";
import { adminPiles, blockersOf, PILL_WORD, type AdminPile, type Blocker } from "@/lib/driver-approvals";
import { liveCarOf } from "@/lib/vehicle-approval";
import {
  classKeyLabel,
  driverSearchTerm,
  finishRate,
  genderAnsweredNote,
  genderKeyLabel,
  makeKeyLabel,
  medianNote,
  medianValue,
  workedSays,
  type DriverOverview,
  type DriverRollupRow,
} from "@/lib/admin-drivers";
import type { AdminDriverFindRow, AdminDriverPageRow } from "@/lib/database.types";
import { baseTownOf, formatShortDay } from "@/lib/format";

export const dynamic = "force-dynamic";

const PER_PAGE = 60;
const count = new Intl.NumberFormat("fr-FR");

interface Filter {
  category?: string;
  body?: string;
  make?: string;
  gender?: string;
}

// ⚑ Every link carries the period — clicking "Mercedes" while looking at July
// must stay in July, or the drill-down answers a wider question than the screen.
function qs(f: Filter, when: { period: string | null; anchor: string | null; from?: string; to?: string }): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  if (when.period) {
    p.set("period", when.period);
    // ⚑ A RANGE HAS NO ANCHOR — it is a pair of ends, and carrying only the
    // period name would drop the span. Clicking a row while looking at
    // "10–20 August" would then answer for all time and look identical.
    if (when.period === "range") {
      if (when.from) p.set("from", when.from);
      if (when.to) p.set("to", when.to);
    } else if (when.anchor) {
      p.set("anchor", when.anchor);
    }
  }
  const s = p.toString();
  return s ? `/admin/drivers?${s}` : "/admin/drivers";
}

/**
 * A census row — the label and how many people, and nothing else.
 *
 * ⚑ GENDER IS NOT AN ACTIVITY MEASURE, so it does not get the trips-and-finished
 * columns. Giving it them nearly shipped a contradiction: with a period chosen
 * the count would have been "the Drivers who drove", reading "Not asked — 9"
 * directly under a note saying "1 of 13 answered". Two numbers about the same
 * thirteen people, disagreeing a line apart.
 */
function CensusRow({ label, n, href }: { label: string; n: number; href: string }) {
  return (
    <Link href={href} className="adm-row adm-row--census">
      <span className="adm-row__name">{label}</span>
      <span className="adm-row__kind">
        {count.format(n)} {n === 1 ? "Driver" : "Drivers"}
      </span>
    </Link>
  );
}

function BreakdownHead() {
  return (
    <div className="adm-row adm-row--bd adm-bd__head">
      <span />
      <span className="adm-row__side">drivers</span>
      <span className="adm-row__side">trips taken</span>
      {/* ⚑ "finished", not "filled". See DriverRollupRow — the Businesses
          screen's word would be ~100 % on every row here and say nothing. */}
      <span className="adm-row__kind">finished</span>
    </div>
  );
}

function BreakdownRow({
  label,
  row,
  href,
}: {
  label: string;
  row: DriverRollupRow;
  href: string;
}) {
  const rate = finishRate(row);
  return (
    <Link href={href} className="adm-row adm-row--bd">
      <span className="adm-row__name">{label}</span>
      <span className="adm-row__side">{count.format(row.drivers)}</span>
      <span className="adm-row__side">{count.format(row.taken)}</span>
      <span className="adm-row__kind">
        {/* ⚑ "0 of 0" is true and says nothing — a Driver who has never taken a
            trip has no finish rate to suppress, only an absence to report. */}
        {row.taken === 0
          ? "—"
          : rate == null
            ? `${row.finished} of ${row.taken}`
            : `${Math.round(rate)} %`}
      </span>
    </Link>
  );
}

/** What stands between this Driver and the Pool — nothing at all for one who can work.
 *  Our move is amber; the Driver's move stays neutral, because only the first is work waiting
 *  for whoever is reading. */
function Pills({ list }: { list: Blocker[] }) {
  if (list.length === 0) return null;
  return (
    <span className="adm-row__pills">
      {list.map((b) => (
        <span key={b.pile} className={b.owed === "us" ? "adm-pill adm-pill--warn" : "adm-pill"}>
          {b.says}
        </span>
      ))}
    </span>
  );
}

/** The one fact that decides whether they ever see a trip. */
function BaseSays({ label, radius }: { label: string | null; radius: number | null }) {
  return label ? (
    <span className="adm-row__kind">{`${label.split(",")[0]} · ${radius ?? 50} km`}</span>
  ) : (
    <span className="adm-row__kind adm-row__kind--bad">no base — Pool empty</span>
  );
}

type FleetRowData = Pick<
  AdminDriverPageRow,
  | "id"
  | "first_name"
  | "last_name"
  | "category"
  | "body_type"
  | "base_label"
  | "service_radius_km"
  | "trips"
  | "held_unfinished"
  | "last_took"
>;

/** A Driver in "Everyone" or in a search result: what they drive, whether they work, where. */
function FleetRow({ d, pills }: { d: FleetRowData; pills: Blocker[] }) {
  const worked = workedSays(d);
  return (
    <Link href={`/admin/drivers/${d.id}`} className="adm-row adm-row--fleet">
      <span className="adm-row__name">
        {d.first_name} {d.last_name}
      </span>
      <span className="adm-row__side">{classKeyLabel(d.category, d.body_type)}</span>
      <span className={worked.idle ? "adm-row__side adm-row__side--idle" : "adm-row__side"}>
        {worked.text}
        {d.last_took && !worked.idle && ` · last ${formatShortDay(d.last_took)}`}
      </span>
      <BaseSays label={d.base_label} radius={d.service_radius_km} />
      <Pills list={pills} />
    </Link>
  );
}

// ── S80 · "To be approved" as a table ──────────────────────────────────────────────────────
//
// ⚑ ONE COLUMN PER THING — the founder, 2026-09-13, on the running page: *"the rows are not clean from
// the top. We need clean Name, class & category, company, car, the base zone and driver"*. The three
// approvals shared one wrapping cell, so the same pill sat at a different place on every row. Shaped on
// a preview of the 12 live rows at the real width and approved with "go ahead, build it". The column
// header names the approval, so a cell carries the state alone ("To approve", not "Car · to approve").
// ⚑ NOT THE FLEET LIST. "Everyone" and the search results keep their pills — *"no need for now, don't
// touch it"* — and share only the words, which come from adminPiles for both.

/** A base as this table names it. ⚑ The TOWN, not the label's first part: "Pl. du Casino, 98000 Monaco"
 *  read "Pl. du Casino" (S80). */
function BaseCell({ label, radius }: { label: string | null; radius: number | null }) {
  return label ? (
    <span className="adm-row__side adm-apv__base">{`${baseTownOf(label)} · ${radius ?? 50} km`}</span>
  ) : (
    <span className="adm-row__side adm-apv__base adm-row__kind--bad">no base — Pool empty</span>
  );
}

// ApprovalCell (one approval in its own column) lives in components/admin-approval-cell.tsx since S81,
// so /admin/vehicles draws the very same cell ([[d142]] rule 4).

/** The column names. Not a link, and hidden from a screen reader, which reads each cell's own name. */
function ApprovalHead() {
  return (
    <div className="adm-row adm-apv adm-apv__head" aria-hidden="true">
      <span>Driver</span>
      <span>Class</span>
      <span>Base</span>
      <span>{PILL_WORD.person}</span>
      <span>{PILL_WORD.company}</span>
      <span>{PILL_WORD.vehicle}</span>
    </div>
  );
}

/** A Driver in "To be approved": who, what they drive, where — then person, company and car. */
function ApprovalRow({
  d,
  piles,
  blocked,
  unread,
}: {
  d: AdminDriverFindRow;
  piles: AdminPile[];
  blocked: boolean;
  unread: boolean;
}) {
  return (
    <Link href={`/admin/drivers/${d.id}`} className="adm-row adm-apv">
      <span className="adm-row__name">
        {d.first_name} {d.last_name}
      </span>
      <span className="adm-row__side">{classKeyLabel(d.category, d.body_type)}</span>
      <BaseCell label={d.base_label} radius={d.service_radius_km} />
      {/* ⚑ NEVER A SILENT ROW IN THIS SECTION (S79, kept). Who is listed is decided in SQL and the cells
          in TypeScript — one rule written twice (tests/driver-blockers.test.ts, .local/probe/driver-find.mts).
          When the approvals could not be read the row says THAT, in grey, rather than guessing. And if
          the rule says this Driver can work while SQL listed them, three ticks would be the one lie
          this table could tell — so the row says "To be approved" across all three columns instead. */}
      {unread ? (
        <span className="adm-apv__span">
          <span className="adm-pill">Approvals unread</span>
        </span>
      ) : !blocked ? (
        <span className="adm-apv__span">
          <span className="adm-pill adm-pill--warn">To be approved</span>
        </span>
      ) : (
        piles.map((p) => <ApprovalCell key={p.pile} p={p} />)
      )}
    </Link>
  );
}

export default async function AdminDriversPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    category?: string;
    body?: string;
    make?: string;
    gender?: string;
    page?: string;
    period?: string;
    anchor?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { q, category, body, make, gender, page, period, anchor, from, to } = await searchParams;
  // ⚑ `?q=a&q=b` is an array. The box shows, and the search uses, the first (S79 review).
  const typed = (Array.isArray(q) ? q[0] : q) ?? "";
  const term = driverSearchTerm(q);
  const win = pageWindow(page, PER_PAGE);
  const db = await createClient();
  const filtered = Boolean(category || body || make || gender);
  const when = parseAdminPeriod({ period, anchor, from, to });
  // What every link on the page must carry to stay in the same period.
  const carry = { period: when.period, anchor: when.anchor, from, to };

  const [overviewRes, listRes, findRes] = await Promise.all([
    db.rpc("admin_driver_overview", { p_from: when.fromIso, p_to: when.toIso }),
    db.rpc("admin_driver_page", {
      p_category: category ?? null,
      p_body: body ?? null,
      p_make: make ?? null,
      p_gender: gender ?? null,
      p_limit: PER_PAGE,
      p_offset: win.from,
      p_from: when.fromIso,
      p_to: when.toIso,
    }),
    // One function, two questions: with a term it searches everyone; without one it lists the
    // Drivers who cannot work, longest blocked first.
    db.rpc("admin_driver_find", {
      p_q: term,
      p_blocked: term === null,
      p_limit: PER_PAGE,
      p_offset: 0,
    }),
  ]);

  const o = overviewRes.data as DriverOverview | null;
  const rows = listRes.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const found = findRes.data ?? [];
  const foundTotal = Number(found[0]?.total_count ?? 0);

  // ⚑ THE PILLS ARE READ ONCE FOR EVERY ROW ON THE PAGE — the live cars and the papers of the
  //   Drivers shown (at most two pages of them), never a query per row. What turns them into
  //   words is the Driver's own file's rule: blockersOf → approvalPiles.
  //   The admin's session reads both tables: p_vehicle_read and p_document_owner admit
  //   app_role()='admin', and app/admin/layout.tsx has already settled that this is one.
  const shown: Array<FleetRowData & { verified: boolean }> = term ? found : [...found, ...rows];
  const ids = [...new Set(shown.map((d) => d.id))];
  const verifiedOf = new Map(shown.map((d) => [d.id, d.verified]));
  const papersRead = { failed: false };
  const [carsRes, papers] = await Promise.all([
    // At most one live car per Driver (vehicle_one_live_per_driver), so ≤ 120 rows: one select.
    db
      .from("vehicle")
      .select("driver_id, approval_status, retired_at, created_at")
      .in("driver_id", ids)
      .is("retired_at", null),
    // ⚑ PAGED, BECAUSE AN UNBOUNDED SELECT STOPS AT 1 000 ROWS WITHOUT A WORD (lib/admin-list.ts
    //   readAll). Every upload is a new row, so 120 full files with a few re-uploads pass 1 000,
    //   and a Driver whose newest rows fell off the end would read "papers to add" while their
    //   file is with us (S79 review). Ordered by id, so the pages are stable — but NOT a snapshot:
    //   an upload landing between two pages can shift one row across the boundary, read twice
    //   (harmless — the newest per slot still wins) or, rarely, missed. That needs 1 000+ papers
    //   on screen and an upload during the read (S79 re-check).
    readAll(async (lo, hi) => {
      const res = await db
        .from("document")
        .select("owner_id, type, side, status, uploaded_at, expires_at")
        .eq("owner_type", "driver")
        .in("owner_id", ids)
        .order("id")
        .range(lo, hi);
      if (res.error) papersRead.failed = true;
      return res;
    }),
  ]);
  const carsBy = new Map<string, NonNullable<typeof carsRes.data>>();
  for (const c of carsRes.data ?? []) carsBy.set(c.driver_id, [...(carsBy.get(c.driver_id) ?? []), c]);
  const papersBy = new Map<string, typeof papers>();
  for (const p of papers) papersBy.set(p.owner_id, [...(papersBy.get(p.owner_id) ?? []), p]);

  // ⚑ A PILL THAT COULD NOT BE READ IS NOT DRAWN. An empty car read says "No car on file" and an
  //   empty papers read says "papers to add" — confident, and false. So a failed read draws no
  //   pills at all, and the note says exactly that (S79 review).
  const pillsUnread = ids.length > 0 && (Boolean(carsRes.error) || papersRead.failed);
  const now = new Date();
  const pillsFor = (id: string): Blocker[] =>
    pillsUnread
      ? []
      : blockersOf(
          { verified: verifiedOf.get(id) ?? false },
          liveCarOf(carsBy.get(id) ?? []),
          latestSlots(papersBy.get(id) ?? [], DRIVER_DOC_TYPES),
          now,
        );
  // ⚑ S80 — THE SAME READS, AS THE THREE CELLS OF A "To be approved" ROW. blockersOf is built from
  //   adminPiles, so a cell and a pill use the same WORDS. They do not show the same THINGS: a cell
  //   is always drawn, a pill only for what blocks — once the person is approved the company has no
  //   pill, but its cell still says what it owes ([[d140]] rule 3).
  const pilesFor = (id: string): AdminPile[] =>
    pillsUnread
      ? []
      : adminPiles(
          { verified: verifiedOf.get(id) ?? false },
          liveCarOf(carsBy.get(id) ?? []),
          latestSlots(papersBy.get(id) ?? [], DRIVER_DOC_TYPES),
          now,
        );
  const unreadNote = pillsUnread && (
    <p className="adm-quiet">
      The approvals couldn’t be read, so these rows carry no pills — which does not mean they’re clear.
    </p>
  );

  // ⚑ A REFUSAL, NOT AN EMPTY SCREEN — the same one the Businesses page carries.
  // Four zeroes would read as "you have no Drivers" rather than "this needs a
  // migration", and the second is the only one anyone can act on.
  if (!o) {
    return (
      <main className="adm-main">
        <header className="adm-head">
          <div className="adm-head__main">
            <h1>Drivers</h1>
          </div>
        </header>
        <p className="adm-lede adm-lede--bad">
          The breakdown functions aren’t installed on this database — run
          docs/migrations/2026-08-30_driver_gender.sql, then
          docs/migrations/2026-08-30_admin_driver_rollup.sql.
          {overviewRes.error?.message && ` (${overviewRes.error.message})`}
        </p>
      </main>
    );
  }

  const genderNote = genderAnsweredNote(o);
  const mNote = medianNote(o);
  const findMissing = findRes.error && (
    <p className="adm-lede adm-lede--bad">
      This needs admin_driver_find — run docs/migrations/2026-09-13d_admin_driver_find.sql.
      {findRes.error.message && ` (${findRes.error.message})`}
    </p>
  );

  return (
    // ⚑ `adm-main--drivers` scopes S80's section titles to this page (app/globals.css).
    <main className="adm-main adm-main--drivers">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Drivers</h1>
          <p className="adm-head__meta">
            Every Driver, what they drive, and whether the Pool reaches them.
          </p>
        </div>
      </header>

      <form className="adm-search adm-search--drivers" action="/admin/drivers">
        <Search size={17} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          name="q"
          defaultValue={typed}
          placeholder="Name, phone, email, plate or SIRET"
          aria-label="Search Drivers"
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

      {term ? (
        <section className="adm-sect">
          <h2 className="adm-sect__h">Matching Drivers</h2>
          <p className="adm-quiet">
            “{term}” — <Link href={qs({}, carry)}>clear</Link>
          </p>
          {findMissing ||
            (found.length === 0 ? (
              <p className="adm-none">Nothing matches “{term}”.</p>
            ) : (
              <>
                {unreadNote}
                {found.map((d) => (
                  <FleetRow key={d.id} d={d} pills={pillsFor(d.id)} />
                ))}
                {foundTotal > found.length && (
                  <p className="adm-quiet">
                    Showing the first {found.length} of {count.format(foundTotal)} — add a word to narrow it.
                  </p>
                )}
              </>
            ))}
        </section>
      ) : (
        <>
          <section className="adm-sect">
            {/* The founder's name for it, 2026-09-13. */}
            <h2 className="adm-sect__h">To be approved</h2>
            {findMissing ||
              (found.length === 0 ? (
                <p className="adm-none">
                  {o.drivers === 0 ? "No Drivers yet." : "Nothing to approve — every Driver can work."}
                </p>
              ) : (
                <>
                  {/* ⚑ S80 — NO KEY TO THE TONES ANY MORE: every column is headed and every cell says its
                      state in words ("To approve", "2 documents needed"). What stays is the order, and —
                      on a failed read — the one sentence that is still true (S79 re-check). */}
                  <p className="adm-sect__s">Longest waiting first.</p>
                  {pillsUnread && (
                    <p className="adm-quiet">
                      The approvals couldn’t be read, so these rows can’t say what’s missing.
                    </p>
                  )}
                  <ApprovalHead />
                  {found.map((d) => (
                    <ApprovalRow
                      key={d.id}
                      d={d}
                      piles={pilesFor(d.id)}
                      blocked={pillsFor(d.id).length > 0}
                      unread={pillsUnread}
                    />
                  ))}
                  {foundTotal > found.length && (
                    <p className="adm-quiet">
                      Showing the {found.length} who have waited longest, of {count.format(foundTotal)} — search to
                      find one.
                    </p>
                  )}
                </>
              ))}
          </section>

          <AdminPeriodBar now={when} base="/admin/drivers" keep={{ category, body, make, gender }} />

          <section className="adm-sect adm-band">
            <div className="adm-nums">
              {/* ⚑ Two of these do not follow the period, and say so — see the
                  Businesses screen for the reasoning. */}
              <div className="adm-n">
                <div className="adm-n__v">{count.format(o.drivers)}</div>
                <div className="adm-n__l">drivers</div>
                <div className="adm-n__s">on the platform today</div>
              </div>
              <div className="adm-n">
                <div className="adm-n__v">{count.format(o.taken)}</div>
                <div className="adm-n__l">trips taken</div>
                <div className="adm-n__s">{inPeriod(when)}</div>
              </div>
              <div className="adm-n">
                <div className="adm-n__v">{count.format(o.never_took)}</div>
                <div className="adm-n__l">never taken a trip</div>
                <div className="adm-n__s">all time</div>
              </div>
              <div className="adm-n">
                <div className="adm-n__v">{medianValue(o)}</div>
                <div className="adm-n__l">trips each, typical</div>
                {mNote && <div className="adm-n__s">{mNote}</div>}
              </div>
            </div>
          </section>

          {worthBreakingDown(o.by_class) && (
            <section className="adm-sect">
              <h2 className="adm-sect__h">What they drive</h2>
              <BreakdownHead />
              {o.by_class.map((row) => (
                <BreakdownRow
                  key={`${row.key}-${row.parent}`}
                  label={classKeyLabel(row.key, row.parent)}
                  row={row}
                  href={qs({ category: row.key ?? undefined, body: row.parent ?? undefined }, carry)}
                />
              ))}
            </section>
          )}

          {worthBreakingDown(o.by_make) && (
            <section className="adm-sect">
              <h2 className="adm-sect__h">The cars themselves</h2>
              <BreakdownHead />
              {o.by_make.map((row) => (
                <BreakdownRow
                  key={row.key ?? "none"}
                  label={makeKeyLabel(row.key)}
                  row={row}
                  href={qs({ make: row.key ?? undefined }, carry)}
                />
              ))}
            </section>
          )}

          {/* ⚑ THIS SECTION DOES NOT FOLLOW `worthBreakingDown`, AND THE EXCEPTION IS
              DELIBERATE. That rule hides a one-row table because "all four are
              hotels" is a fact about the market and a table is a poor way to say it.
              Here the single row is `Not asked × 13` — a fact about the ROLLOUT, not
              the fleet, and the one thing worth knowing about a question that has
              just shipped. Hiding it would show a founder who asked for this feature
              a screen with no trace of it. So: the heading and the denominator
              always render; only the TABLE waits for something to compare. */}
          {o.drivers > 0 && (
            <section className="adm-sect">
              <h2 className="adm-sect__h">Who they are</h2>
              {/* The denominator sits above the table, never implied by it. */}
              {genderNote && <p className="adm-quiet">{genderNote}.</p>}
              {worthBreakingDown(o.by_gender) ? (
                <>
                  {o.by_gender.map((row) => (
                    <CensusRow
                      key={row.key ?? "none"}
                      label={genderKeyLabel(row.key)}
                      n={row.drivers}
                      href={qs({ gender: row.key ?? undefined }, carry)}
                    />
                  ))}
                </>
              ) : (
                <p className="adm-none">
                  {o.gender_answered === 0
                    ? "Nobody has answered yet. Drivers are asked on their own profile, and it is optional."
                    : `Every Driver who has answered said the same thing — ${genderKeyLabel(o.by_gender[0]?.key ?? null)}.`}
                </p>
              )}
            </section>
          )}

          <section className="adm-sect">
            <h2 className="adm-sect__h">{filtered ? "Matching Drivers" : "Everyone"}</h2>
            {filtered && (
              <p className="adm-quiet">
                {[
                  category && classKeyLabel(category, body ?? null),
                  make && makeKeyLabel(make),
                  gender && genderKeyLabel(gender),
                ]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                — <Link href={qs({}, carry)}>clear</Link>
              </p>
            )}
            {rows.length === 0 ? (
              <p className="adm-none">No Driver matches.</p>
            ) : (
              <>
                {unreadNote}
                {rows.map((d) => (
                  <FleetRow key={d.id} d={d} pills={pillsFor(d.id)} />
                ))}
              </>
            )}
            {(() => {
              const n = pageNote(Number(total), win, PER_PAGE);
              if (!n) return null;
              const href = (p: number) => {
                const base = qs({ category, body, make, gender }, carry);
                const sep = base.includes("?") ? "&" : "?";
                return p === 0 ? base : `${base}${sep}page=${p}`;
              };
              return (
                <div className="adm-page">
                  <span>{n.says}</span>
                  <span className="adm-page__go">
                    {n.newer !== null && <Link href={href(n.newer)}>← Newer</Link>}
                    {n.older !== null && <Link href={href(n.older)}>Older →</Link>}
                  </span>
                </div>
              );
            })()}
          </section>
        </>
      )}
    </main>
  );
}
