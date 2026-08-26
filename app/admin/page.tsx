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
import { readActivitySnapshot } from "@/lib/admin-activity";
import { findings, quietChecks, CHECKS, type Finding, type FindingId } from "@/lib/activity-findings";

export const dynamic = "force-dynamic";

interface SearchHit {
  href: string;
  name: string;
  kind: string;
}

/** Name, hotel or reference. Deliberately narrow — three tables, no ranking. */
async function search(term: string): Promise<SearchHit[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const db = await createClient();
  const like = `%${q}%`;
  const [drivers, businesses, missions] = await Promise.all([
    db
      .from("driver")
      .select("id, first_name, last_name, phone")
      .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like}`)
      .limit(8),
    db.from("business").select("id, name").ilike("name", like).limit(8),
    db
      .from("mission")
      .select("id, reference, pickup_label, dropoff_label, pickup_at")
      .or(`reference.ilike.${like},pickup_label.ilike.${like},dropoff_label.ilike.${like}`)
      .order("pickup_at", { ascending: false })
      .limit(8),
  ]);

  return [
    ...(drivers.data ?? []).map((d) => ({
      href: `/admin/drivers/${d.id}`,
      name: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "A Driver",
      kind: "Driver",
    })),
    ...(businesses.data ?? []).map((b) => ({
      href: `/admin/businesses/${b.id}`,
      name: b.name,
      kind: "Hotel",
    })),
    ...(missions.data ?? []).map((m) => ({
      href: `/admin/trips/${m.id}`,
      name:
        [m.pickup_label, m.dropoff_label].filter(Boolean).join(" → ") ||
        m.reference ||
        "A trip",
      kind: new Date(m.pickup_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    })),
  ];
}

/** Findings sharing a check, collapsed to one line that NAMES them all. */
function Group({ id, items }: { id: FindingId; items: Finding[] }) {
  const tone = CHECKS[id].tone;
  if (items.length === 1) {
    const f = items[0];
    return (
      <div className={`adm-f adm-f--${tone}`}>
        <span className="adm-f__dot" aria-hidden="true" />
        <p className="adm-f__say">{f.sentence}</p>
        {f.href && (
          <Link href={f.href} className="adm-f__go">
            show me
          </Link>
        )}
      </div>
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
    case "trip_nobody_can_take":
      return `${n} trips in the Pool can’t be taken by anyone in the fleet.`;
    case "cancelled_without_record":
      return `${n} cancelled trips don’t say who cancelled them, or why.`;
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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [hits, snapshot] = await Promise.all([search(q), readActivitySnapshot()]);
  const fired = findings(snapshot);
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
          aria-label="Search a Driver, a hotel or a trip"
        />
      </form>

      {q.trim().length >= 2 && (
        <section className="adm-sect">
          <h2 className="adm-sect__h">
            {hits.length ? `Found ${hits.length}` : `Nothing matches “${q.trim()}”`}
          </h2>
          {hits.map((h) => (
            <Link key={h.href} href={h.href} className="adm-hit">
              <span className="adm-hit__name">{h.name}</span>
              <span className="adm-hit__kind">{h.kind}</span>
            </Link>
          ))}
        </section>
      )}

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
    </main>
  );
}
