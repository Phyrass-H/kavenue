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
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pageWindow, pageNote } from "@/lib/admin-list";
import { parseAdminPeriod, inPeriod } from "@/lib/admin-period";
import { AdminPeriodBar } from "@/components/admin-period-bar";
import { worthBreakingDown } from "@/lib/admin-rollup";
import {
  classKeyLabel,
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
import { formatShortDay } from "@/lib/format";

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

export default async function AdminDriversPage({
  searchParams,
}: {
  searchParams: Promise<{
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
  const { category, body, make, gender, page, period, anchor, from, to } = await searchParams;
  const win = pageWindow(page, PER_PAGE);
  const db = await createClient();
  const filtered = Boolean(category || body || make || gender);
  const when = parseAdminPeriod({ period, anchor, from, to });
  // What every link on the page must carry to stay in the same period.
  const carry = { period: when.period, anchor: when.anchor, from, to };

  const [overviewRes, listRes] = await Promise.all([
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
  ]);

  const o = overviewRes.data as DriverOverview | null;
  const rows = listRes.data ?? [];
  const total = rows[0]?.total_count ?? 0;

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

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Drivers</h1>
          <p className="adm-head__meta">
            Everyone who can take work, what they drive, and whether the Pool reaches them.
          </p>
        </div>
      </header>

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
          rows.map((d) => {
            const worked = workedSays(d);
            const based = Boolean(d.base_label);
            return (
              <Link key={d.id} href={`/admin/drivers/${d.id}`} className="adm-row adm-row--4">
                <span className="adm-row__name">
                  {d.first_name} {d.last_name}
                </span>
                <span className="adm-row__side">
                  {classKeyLabel(d.category, d.body_type)}
                </span>
                <span className={worked.idle ? "adm-row__side adm-row__side--idle" : "adm-row__side"}>
                  {worked.text}
                  {d.last_took && !worked.idle && ` · last ${formatShortDay(d.last_took)}`}
                </span>
                {/* The one fact that decides whether they ever see a trip. */}
                <span className={based ? "adm-row__kind" : "adm-row__kind adm-row__kind--bad"}>
                  {based
                    ? `${d.base_label?.split(",")[0]} · ${d.service_radius_km ?? 50} km`
                    : "no base — Pool empty"}
                </span>
                {!d.verified && <span className="adm-pill adm-pill--warn">Not verified</span>}
              </Link>
            );
          })
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
    </main>
  );
}
