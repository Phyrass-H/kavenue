// The Businesses. Not a list — a breakdown you drill into, with the list at the
// end and only ever filtered.
//
// ⚑ "BUSINESSES", NEVER "HOTELS" (founder, S71): *"the vocabulary is Businesses
// and then categories by type of business"*. Hotels are the first vertical, not
// the shape of the market — a restaurant, a clinic and a VTC operator with more
// trips than cars all belong on this screen.
//
// ⚑ AND IT IS BUILT FOR 25 000 OF THEM, WHICH IS WHY IT LOOKS LIKE THIS. The
// founder's question was *"are you going to make an infinite list? No!"* So the
// breakdown IS the navigation: what kind of business, and where. Sorted by trips,
// because "which types make more missions" is the question it exists to answer.
// Every count comes from SQL (admin_business_overview / admin_business_page) —
// the old version read every business and every mission and counted them in
// JavaScript, which PostgREST silently caps at 1 000 rows.
//
// ⚑ THE BREAKDOWNS APPEAR ONLY WHEN THEY HAVE SOMETHING TO SAY. All four
// Businesses today are hotels, so "by type" would be one row saying 4. It stays
// off the screen until a restaurant signs up. Degrade honestly; do not pretend.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pageWindow, pageNote } from "@/lib/admin-list";
import { parseAdminPeriod, inPeriod } from "@/lib/admin-period";
import { AdminPeriodBar } from "@/components/admin-period-bar";
import { formatShortDay } from "@/lib/format";
import {
  cityKeyLabel,
  fillRate,
  medianNote,
  medianValue,
  nestCities,
  typeKeyLabel,
  typeKeyShort,
  worthBreakingDown,
  type Overview,
  type RollupRow,
} from "@/lib/admin-businesses";

export const dynamic = "force-dynamic";

const PER_PAGE = 60;

interface Filter {
  type?: string;
  region?: string;
  city?: string;
}

/** A number with the French thousands space, so 24 817 reads as one figure. */
const count = new Intl.NumberFormat("fr-FR");

/** The share that found a Driver, or the honest refusal on a thin sample. */
function Rate({ row }: { row: RollupRow }) {
  const rate = fillRate(row);
  return (
    <span className="adm-row__kind">
      {/* ⚑ "0 of 0" is true and says nothing. A région that booked nothing in the
          chosen period has no fill rate to suppress, only an absence to report —
          and since rows are no longer dropped for being quiet, this is now the
          normal way an inactive month looks. */}
      {row.settled === 0
        ? "—"
        : rate == null
          ? `${row.filled} of ${row.settled}`
          : `${Math.round(rate)} %`}
    </span>
  );
}

function BreakdownRow({
  label,
  row,
  href,
  indent = false,
}: {
  label: string;
  row: RollupRow;
  href: string;
  indent?: boolean;
}) {
  return (
    <Link href={href} className="adm-row adm-row--bd">
      <span className={indent ? "adm-row__name adm-bd__sub" : "adm-row__name"}>{label}</span>
      <span className="adm-row__side">{count.format(row.businesses)}</span>
      <span className="adm-row__side">{count.format(row.trips)}</span>
      <Rate row={row} />
    </Link>
  );
}

function BreakdownHead() {
  return (
    <div className="adm-row adm-row--bd adm-bd__head">
      <span />
      <span className="adm-row__side">businesses</span>
      <span className="adm-row__side">trips</span>
      <span className="adm-row__kind">filled</span>
    </div>
  );
}

// ⚑ EVERY LINK ON THE SCREEN CARRIES THE PERIOD. Clicking "Nice" while looking
// at July must stay in July — otherwise the drill-down silently answers a wider
// question than the one on screen, and the number the reader lands on is right
// for a period they did not ask for.
function qs(f: Filter, when: { period: string | null; anchor: string | null }): string {
  const p = new URLSearchParams();
  if (f.type) p.set("type", f.type);
  if (f.region) p.set("region", f.region);
  if (f.city) p.set("city", f.city);
  if (when.period) {
    p.set("period", when.period);
    if (when.anchor) p.set("anchor", when.anchor);
  }
  const s = p.toString();
  return s ? `/admin/businesses?${s}` : "/admin/businesses";
}

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    region?: string;
    city?: string;
    page?: string;
    period?: string;
    anchor?: string;
  }>;
}) {
  const { type, region, city, page, period, anchor } = await searchParams;
  const win = pageWindow(page, PER_PAGE);
  const db = await createClient();

  const filtered = Boolean(type || region || city);
  // All time unless the URL says otherwise — the default every screen opens with.
  const when = parseAdminPeriod({ period, anchor });

  const [overviewRes, listRes] = await Promise.all([
    db.rpc("admin_business_overview", { p_from: when.fromIso, p_to: when.toIso }),
    db.rpc("admin_business_page", {
      p_type: type ?? null,
      p_region: region ?? null,
      p_city: city ?? null,
      p_limit: PER_PAGE,
      p_offset: win.from,
      p_from: when.fromIso,
      p_to: when.toIso,
    }),
  ]);

  const o = overviewRes.data as Overview | null;
  const rows = listRes.data ?? [];
  const total = rows[0]?.total_count ?? 0;

  // ⚑ A REFUSAL, NOT AN EMPTY SCREEN. If the rollup functions are missing the
  // page must say so out loud — the alternative is four zeroes, which reads as
  // "you have no Businesses" rather than "this needs a migration".
  if (!o) {
    return (
      <main className="adm-main">
        <header className="adm-head">
          <div className="adm-head__main">
            <h1>Businesses</h1>
          </div>
        </header>
        <p className="adm-lede adm-lede--bad">
          The breakdown functions aren’t installed on this database — run
          docs/migrations/2026-08-30_admin_business_rollup.sql.
          {overviewRes.error?.message && ` (${overviewRes.error.message})`}
        </p>
      </main>
    );
  }

  const regions = nestCities(o.by_region, o.by_city);
  const note = medianNote(o);

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Businesses</h1>
          <p className="adm-head__meta">
            Who books, what kind of business they are, and where.
          </p>
        </div>
      </header>

      <AdminPeriodBar now={when} base="/admin/businesses" keep={{ type, region, city }} />

      {/* The four numbers. Quieter than a finding, same as the home band. */}
      <section className="adm-sect adm-band">
        <div className="adm-nums">
          {/* ⚑ TWO OF THESE FOUR DO NOT FOLLOW THE PERIOD, and each says so.
              "businesses" is how many exist today — looking at May must not make
              the ones who signed up since disappear. "never posted once" means
              never EVER; scoped to July it would mean "didn't post in July",
              which is a different fact that jumps around as you step months. */}
          <div className="adm-n">
            <div className="adm-n__v">{count.format(o.businesses)}</div>
            <div className="adm-n__l">businesses</div>
            <div className="adm-n__s">on the platform today</div>
          </div>
          <div className="adm-n">
            <div className="adm-n__v">{count.format(o.trips)}</div>
            <div className="adm-n__l">trips posted</div>
            <div className="adm-n__s">{inPeriod(when)}</div>
          </div>
          <div className="adm-n">
            <div className="adm-n__v">{count.format(o.never_posted)}</div>
            <div className="adm-n__l">never posted once</div>
            <div className="adm-n__s">all time</div>
          </div>
          <div className="adm-n">
            <div className="adm-n__v">{medianValue(o)}</div>
            <div className="adm-n__l">trips each, typical</div>
            {note && <div className="adm-n__s">{note}</div>}
          </div>
        </div>
      </section>

      {worthBreakingDown(o.by_type) && (
        <section className="adm-sect">
          <h2 className="adm-sect__h">By type</h2>
          <BreakdownHead />
          {o.by_type.map((row) => (
            <BreakdownRow
              key={row.key ?? "none"}
              label={typeKeyLabel(row.key)}
              row={row}
              href={qs({ type: row.key ?? undefined }, when)}
            />
          ))}
        </section>
      )}

      {worthBreakingDown(o.by_region) && (
        <section className="adm-sect">
          <h2 className="adm-sect__h">Where they are</h2>
          <BreakdownHead />
          {regions.map((group) => (
            <div key={group.key ?? "none"}>
              <BreakdownRow
                label={group.label}
                row={group}
                href={qs({ region: group.key ?? undefined }, when)}
              />
              {/* Cities sit under their région rather than in a table of their
                  own: at 25 000 Businesses "Nice" means nothing until you know
                  it is one town inside the region that books the most. */}
              {group.cities.map((c) => (
                <BreakdownRow
                  key={c.key ?? "none"}
                  label={c.label}
                  row={c}
                  href={qs({ city: c.key ?? undefined }, when)}
                  indent
                />
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="adm-sect">
        <h2 className="adm-sect__h">
          {filtered ? "Matching businesses" : "Every business"}
        </h2>
        {filtered && (
          <p className="adm-quiet">
            {[
              type && typeKeyLabel(type),
              // ⚑ Through cityKeyLabel, not raw: the register stores towns
              // upper-case, and "CANNES — clear" shouts at the reader.
              city && cityKeyLabel(city),
              region && !city && regions.find((g) => g.key === region)?.label,
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            — <Link href={qs({}, when)}>clear</Link>
          </p>
        )}
        {rows.length === 0 ? (
          <p className="adm-none">No business matches.</p>
        ) : (
          rows.map((b) => {
            // ⚑ THE SAME QUESTION THE FLEET LIST ASKS OF EVERY DRIVER — are they
            // actually working? It was the one thing this screen never said: a
            // Business that stopped booking in June and one that booked this
            // morning were the same row with different numbers. Written out
            // rather than borrowing the Driver helper, whose words are
            // "never taken a trip" and belong to the other side of the market.
            const silent = Number(b.trips) === 0;
            return (
              <Link key={b.id} href={`/admin/businesses/${b.id}`} className="adm-row adm-row--4">
                <span className="adm-row__name">{b.name}</span>
                <span className="adm-row__side">{typeKeyShort(b.business_type)}</span>
                <span className={silent ? "adm-row__side adm-row__side--idle" : "adm-row__side"}>
                  {silent
                    ? "never posted a trip"
                    : `${count.format(Number(b.trips))} trips · last ${formatShortDay(b.last_posted)}`}
                </span>
                <span
                  className={
                    Number(b.unfilled) ? "adm-row__kind adm-row__kind--bad" : "adm-row__kind"
                  }
                >
                  {Number(b.unfilled)
                    ? `${count.format(Number(b.unfilled))} nobody took`
                    : silent
                      ? ""
                      : "all filled"}
                </span>
              </Link>
            );
          })
        )}
        {(() => {
          const n = pageNote(Number(total), win, PER_PAGE);
          if (!n) return null;
          const href = (p: number) => {
            const base = qs({ type, region, city }, when);
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
