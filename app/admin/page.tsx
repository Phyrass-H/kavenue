// Activity — the console's home. Search, and the named checks that are firing.
//
// ⚑ IT IS NOT AN EVENT LOG SCREEN, AND THAT IS THE FOUNDER'S POINT. Nobody ever
// thinks "let me open the event log"; they think "why did that trip fail" or "is
// Marc reliable". So the log is fuel — search finds a person, a hotel or a trip,
// and the trip page tells its story. What is on THIS page is only the handful of
// things worth interrupting someone about.
//
// Two rules, both the founder's, both easy to break later:
//   • SILENT BY DEFAULT — a check that finds nothing renders nothing. No "0
//     problems", no green ticks to scan past.
//   • THE NAMED THING, NOT A COUNT — findings arrive one per subject
//     (lib/activity-findings.ts). Where several share a check the group line
//     names them; it never reports a bare number.
import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { readActivitySnapshot, readFirstTrips, readHomeNumbers } from "@/lib/admin-activity";
import { RECENT_DAYS, type FirstTrips } from "@/lib/first-trips";
import { curveNote, monthsNote, type HomeNumbers } from "@/lib/admin-numbers";
import { formatMonth } from "@/lib/format";
import {
  findings,
  quietChecks,
  whenLabel,
  CHECKS,
  type Finding,
  type FindingId,
} from "@/lib/activity-findings";

export const dynamic = "force-dynamic";

interface SearchHit {
  href: string;
  name: string;
  kind: string;
}

interface SearchResult {
  hits: SearchHit[];
  /** What each kind is holding back, e.g. "31 trips" — empty when nothing is. */
  more: string[];
}

/** Each kind is capped, and the cap is STATED — see `more` below. */
const PER_KIND = 8;

/** Name, Business or reference. Deliberately narrow — three tables, no ranking. */
async function search(term: string): Promise<SearchResult> {
  const q = term.trim();
  if (q.length < 2) return { hits: [], more: [] };
  const db = await createClient();
  const like = `%${q}%`;
  // ⚑ `count: "exact"` alongside the limit, because the cap has to be able to
  // say how much it is hiding. A search that quietly returns 8 of 31 matches
  // reads as "there are 8" — the same silent-truncation lie the list pages had.
  const [drivers, businesses, missions] = await Promise.all([
    db
      .from("driver")
      .select("id, first_name, last_name, phone", { count: "exact" })
      .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like}`)
      .limit(PER_KIND),
    db.from("business").select("id, name", { count: "exact" }).ilike("name", like).limit(PER_KIND),
    db
      .from("mission")
      .select("id, reference, pickup_label, dropoff_label, pickup_at", { count: "exact" })
      .or(`reference.ilike.${like},pickup_label.ilike.${like},dropoff_label.ilike.${like}`)
      .order("pickup_at", { ascending: false })
      .limit(PER_KIND),
  ]);

  const hidden = (count: number | null, shown: number, one: string, many: string) =>
    (count ?? 0) > shown ? [`${count} ${count === 1 ? one : many}`] : [];

  return {
    hits: [
      ...(drivers.data ?? []).map((d) => ({
        href: `/admin/drivers/${d.id}`,
        name: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "A Driver",
        kind: "Driver",
      })),
      ...(businesses.data ?? []).map((b) => ({
        href: `/admin/businesses/${b.id}`,
        name: b.name,
        kind: "Business",
      })),
      ...(missions.data ?? []).map((m) => ({
        href: `/admin/trips/${m.id}`,
        name:
          [m.pickup_label, m.dropoff_label].filter(Boolean).join(" → ") ||
          m.reference ||
          "A trip",
        kind: new Date(m.pickup_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      })),
    ],
    more: [
      ...hidden(drivers.count, drivers.data?.length ?? 0, "Driver", "Drivers"),
      ...hidden(businesses.count, businesses.data?.length ?? 0, "Business", "Businesses"),
      ...hidden(missions.count, missions.data?.length ?? 0, "trip", "trips"),
    ],
  };
}

/** Findings sharing a check, collapsed to one line that NAMES them all. */
function Group({ id, items }: { id: FindingId; items: Finding[] }) {
  const tone = CHECKS[id].tone;
  // ⚑ A check that must not group renders each finding on its own line, however
  // many there are. Collapsing two unrelated sentences into "2 things happened"
  // is the roll-up the founder has rejected twice.
  if (items.length === 1 || !CHECKS[id].groups) {
    return (
      <>
        {items.map((f) => (
          <div key={f.key} className={`adm-f adm-f--${tone}`}>
            <span className="adm-f__dot" aria-hidden="true" />
            <p className="adm-f__say">{f.sentence}</p>
            {f.href && (
              <Link href={f.href} className="adm-f__go">
                show me
              </Link>
            )}
          </div>
        ))}
      </>
    );
  }
  // ⚑ The count is a lead-in, never the finding itself: the names are on screen
  // and each one is a link. A bare "6 Drivers have a problem" is the exact shape
  // the founder rejected, twice.
  //
  // ⚑ CAPPED, because the first live run printed 23 names in one row and read as
  // a wall — the same failure the whole screen was redesigned to avoid. The
  // overflow is named as "N more", never as the whole finding.
  const NAMED = 6;
  const shown = items.slice(0, NAMED);
  const rest = items.length - shown.length;
  return (
    <div className={`adm-f adm-f--${tone}`}>
      <span className="adm-f__dot" aria-hidden="true" />
      <div className="adm-f__say">
        <p className="adm-f__lead">{summarise(id, items.length)}</p>
        <ul className="adm-f__names">
          {shown.map((f) => (
            <li key={f.key}>
              {f.href ? <Link href={f.href}>{f.subject}</Link> : f.subject}
            </li>
          ))}
          {rest > 0 && <li className="adm-f__rest">and {rest} more</li>}
        </ul>
      </div>
    </div>
  );
}

function summarise(id: FindingId, n: number): string {
  switch (id) {
    case "driver_without_base":
      return `${n} Drivers have never set a base, so their Pool has always been empty.`;
    case "driver_unverified":
      return `${n} Drivers aren’t verified, and can accept work anyway.`;
    case "documents_waiting":
      // ⚑ No wait in the group line, on purpose: the Drivers below it have been
      // waiting different lengths of time, and picking one number to stand for
      // all of them would be the roll-up this screen refuses. Each name is a
      // link to the page that says how long.
      return `${n} Drivers are waiting for you to look at their documents.`;
    case "trip_nobody_can_take":
      return `${n} trips in the Pool can’t be taken by anyone in the fleet.`;
    case "cancelled_without_record":
      return `${n} cancelled trips don’t say who cancelled them, or why.`;
    case "feature_never_used":
      return `${n} shipped features have never been used, once.`;
    case "trip_passed_around":
      return `${n} trips have been taken and given back more than once.`;
    case "orphaned_events":
      return `${n} log entries describe a trip that no longer exists.`;
    default: {
      // ⚑ Exhaustive: a new check must write its own group line before it ships.
      const never: never = id;
      return never;
    }
  }
}



/**
 * One number to ring, with what it belongs to.
 *
 * ⚑ A `tel:` LINK, WHICH IS THE POINT OF THE WHOLE SECTION. The founder reads
 * this console on a phone; a number you have to retype is a number you don't
 * ring. ⚑ And a MISSING number is said out loud rather than left blank — a gap
 * where a phone number should be reads as a rendering bug, not as "we never got
 * one from them".
 */
function Call({ label, phone }: { label: string; phone: string | null }) {
  return (
    <span className="adm-ft__call">
      <span className="adm-ft__call-l">{label}</span>
      {phone ? (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>
      ) : (
        <span className="adm-ft__call-none">no number on file</span>
      )}
    </span>
  );
}

/**
 * First trips — the one drive per Driver that is worth a phone call.
 *
 * ⚑ NOT A FINDING, AND IT DOES NOT OBEY THE SILENT-BY-DEFAULT RULE. That rule is
 * about checks that interrupt you (lib/activity-findings.ts). This is a working
 * list you come to on purpose, so when it is empty it says so — a tool that
 * renders nothing looks broken rather than quiet.
 *
 * ⚑ THE BUSINESS COLUMN SAYS "Business", NOT "Hotel", even though every one of
 * them is a hotel today. CLAUDE.md hard rule #1: hotels are the first vertical,
 * not the shape of the market, and one of the nine business types is a VTC
 * operator posting its own overflow.
 */
function FirstTripsSection({ f }: { f: FirstTrips }) {
  return (
    <section className="adm-sect">
      <h2 className="adm-sect__h">First trips</h2>
      <p className="adm-quiet">
        The first drive is the one worth a phone call — the Driver before it, the Business
        after. Upcoming, and anything that ran in the last {RECENT_DAYS} days.
      </p>

      {f.trips.map((t) => (
        <div key={t.driverId} className="adm-ft">
          <div className="adm-ft__when">{t.whenLabel}</div>
          <div className="adm-ft__who">
            <Link href={`/admin/drivers/${t.driverId}`} className="adm-ft__name">
              {t.driverName}
            </Link>
            <Link href={`/admin/trips/${t.tripId}`} className="adm-ft__line">
              {t.at} · {t.route}
            </Link>
            {t.businessName && (
              <span className="adm-ft__line">
                {t.businessId ? (
                  <Link href={`/admin/businesses/${t.businessId}`}>{t.businessName}</Link>
                ) : (
                  t.businessName
                )}
              </span>
            )}
          </div>
          <div className="adm-ft__calls">
            <Call label="Driver" phone={t.driverPhone} />
            <Call label="Business" phone={t.businessPhone} />
          </div>
        </div>
      ))}

      {f.trips.length === 0 && (
        <p className="adm-none">
          {/* ⚑ Names BOTH halves of the window. "Nothing here" would leave the
              reader unable to tell an empty week from a broken query. */}
          Nobody’s first trip is coming up, and none has run in the last {RECENT_DAYS} days.
        </p>
      )}

      {f.neverDriven.length > 0 && (
        <div className="adm-ft__never">
          <p className="adm-ft__never-h">
            {f.neverDriven.length === 1
              ? "1 Driver has signed up and never driven once."
              : `${f.neverDriven.length} Drivers have signed up and never driven once.`}
          </p>
          {f.neverDriven.map((d) => (
            <div key={d.driverId} className="adm-ft">
              <div className="adm-ft__when">{d.waited} waiting</div>
              <div className="adm-ft__who">
                <Link href={`/admin/drivers/${d.driverId}`} className="adm-ft__name">
                  {d.driverName}
                </Link>
                <span className="adm-ft__line">
                  signed up {whenLabel(d.signedUpAt)}
                  {!d.verified && " · not verified"}
                </span>
              </div>
              <div className="adm-ft__calls">
                <Call label="Driver" phone={d.driverPhone} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A headline total, to the euro. `formatMoney` keeps cents because an invoice
 * line must reconcile to the cent — a three-month total does not, and "29 536,71 €"
 * spends four characters saying nothing. Cents stay everywhere money is owed.
 */
const wholeEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/**
 * The numbers band — four figures and the months, above the findings.
 *
 * ⚑ QUIETER THAN A FINDING, ON PURPOSE. It carries no dot, no colour and no
 * link. A number is a background fact; a finding interrupts you.
 *
 * ⚑ EVERY FIGURE SHOWS WHAT IT IS OUT OF. A bare "84 %" is the half-truth this
 * console keeps refusing — see the small-N rule in lib/admin-numbers.
 */
function Band({ n, now }: { n: HomeNumbers; now: Date }) {
  // Nothing has ever been posted: say so in words rather than printing four
  // zeroes, which read as a broken screen rather than an empty one.
  if (n.settled === 0 && n.completed === 0) {
    return (
      <section className="adm-sect">
        <h2 className="adm-sect__h">Kavenue so far</h2>
        <p className="adm-quiet">No trip has been posted yet.</p>
      </section>
    );
  }

  const note = monthsNote(n.months, now);
  const busiest = Math.max(1, ...n.months.map((m) => m.trips));

  return (
    <section className="adm-sect adm-band">
      <div className="adm-band__head">
        <h2 className="adm-sect__h">Kavenue so far</h2>
      </div>

      <div className="adm-nums">
        <div className="adm-n">
          <div className="adm-n__v">
            {n.fillRate == null ? `${n.filled} of ${n.settled}` : `${Math.round(n.fillRate)} %`}
          </div>
          <div className="adm-n__l">found a Driver</div>
          <div className="adm-n__s">
            {n.fillRate == null
              ? "too few to give a rate yet"
              : `${n.filled} of ${n.settled} trips`}
          </div>
        </div>

        <div className="adm-n">
          <div className="adm-n__v">{wholeEuros.format(n.businessesPaid)}</div>
          <div className="adm-n__l">Businesses paid</div>
          <div className="adm-n__s">{n.completed} trips run</div>
        </div>

        <div className="adm-n">
          <div className="adm-n__v">{wholeEuros.format(n.driversBanked)}</div>
          <div className="adm-n__l">Drivers banked</div>
          <div className="adm-n__s">what landed in their bank</div>
        </div>

        <div className="adm-n">
          <div className="adm-n__v">{wholeEuros.format(n.kavenueKept)}</div>
          <div className="adm-n__l">Kavenue kept</div>
          <div className="adm-n__s">
            {/* ⚑ Names its denominator, like every other figure here. "19,6 %"
                alone invites the reader to supply the wrong one — the fee is a
                share of what the Business paid, not of the Course. */}
            {n.takeRate == null
              ? "HT, both sides"
              : `${n.takeRate.toFixed(1).replace(".", ",")} % of what Businesses paid`}
          </div>
        </div>
      </div>

      {/* ⚑ A quiet line, not two more cards. Both halves are secondary — worth
          knowing, not worth shouting — and each disappears on its own when its
          sample is too thin to carry the claim. */}
      {curveNote(n) && <p className="adm-quiet adm-band__note">{curveNote(n)}</p>}

      <div className="adm-months">
        {n.months.map((m) => (
          <div key={m.key} className="adm-m">
            {/* ⚑ THREE STATES, NOT TWO. A finished month is solid; the one we
                are inside is hatched, because it cannot be compared to a whole
                one; and a month that HAS NOT HAPPENED is an outline — those are
                bookings on the books, not trips that ran. Drawing the third like
                the first is what let the sentence underneath call September
                "last month" on the 30th of August. */}
            <div
              className={`adm-m__bar${
                m.future ? " adm-m__bar--ahead" : m.partial ? " adm-m__bar--part" : ""
              }`}
              style={{ height: `${Math.max(3, Math.round((m.trips / busiest) * 46))}px` }}
            />
            <span className="adm-m__n">{m.trips}</span>
            <span className="adm-m__l">{formatMonth(m.key).split(" ")[0]}</span>
          </div>
        ))}
        {note && <p className="adm-months__say">{note}</p>}
      </div>
    </section>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const now = new Date();
  const [found, snapshot, numbers, first] = await Promise.all([
    search(q),
    readActivitySnapshot(now),
    readHomeNumbers(now),
    readFirstTrips(now),
  ]);
  const { hits, more } = found;
  const fired = findings(snapshot, now);
  const quiet = quietChecks(snapshot, fired);

  // Keep the declared order of the checks; group each check's findings together.
  const groups = (Object.keys(CHECKS) as FindingId[])
    .map((id) => ({ id, items: fired.filter((f) => f.id === id) }))
    .filter((g) => g.items.length > 0);

  return (
    <main className="adm-main">
      <form className="adm-search" action="/admin">
        <Search size={17} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Marc Fontaine · Carlton Cannes · a trip reference"
          aria-label="Search a Driver, a Business or a trip"
        />
      </form>

      {q.trim().length >= 2 && (
        <section className="adm-sect">
          {/* ⚑ The count is dropped the moment the search is holding some back —
              "Found 8" over 185 matches is the same half-truth the cap itself
              was. The line under the hits carries the real numbers. */}
          <h2 className="adm-sect__h">
            {!hits.length
              ? `Nothing matches “${q.trim()}”`
              : more.length
                ? "Found"
                : `Found ${hits.length}`}
          </h2>
          {hits.map((h) => (
            <Link key={h.href} href={h.href} className="adm-hit">
              <span className="adm-hit__name">{h.name}</span>
              <span className="adm-hit__kind">{h.kind}</span>
            </Link>
          ))}
          {/* ⚑ Only when something IS held back — silent by construction. */}
          {more.length > 0 && (
            <p className="adm-quiet">
              Showing the first {PER_KIND} of each kind — {more.join(" · ")} match “{q.trim()}”.
            </p>
          )}
        </section>
      )}

      <Band n={numbers} now={now} />

      <section className="adm-sect">
        <h2 className="adm-sect__h">Worth a look</h2>
        {groups.length === 0 ? (
          <p className="adm-none">Every check ran and found nothing.</p>
        ) : (
          groups.map((g) => <Group key={g.id} id={g.id} items={g.items} />)
        )}
        {quiet.length > 0 && (
          <p className="adm-quiet">Quiet: {quiet.join(" · ")}.</p>
        )}
      </section>

      <FirstTripsSection f={first} />
    </main>
  );
}
