// Trips. A list you can point a finding at — every filter here exists because
// some sentence on Activity needs somewhere to prove itself.
//
// ⚑ `?flag=no-cancellation-record` is the one that isn't a status: it is the
// answer to "which 23?", and without it that finding is a claim with no proof
// behind it.
//
// ⚑ IT USED TO STOP AT 120 ROWS AND SAY NOTHING ABOUT IT. A list that quietly
// truncates reads as a complete answer, which is the one thing it isn't.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminTripList } from "@/components/admin-trip-list";
import { pageWindow, pageNote, readAll } from "@/lib/admin-list";
import type { MissionRow, MissionStatus } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const PER_PAGE = 60;

const FILTERS = [
  { q: "", label: "All" },
  { q: "pooled", label: "In the Pool" },
  { q: "confirmed", label: "Taken" },
  { q: "completed", label: "Finished" },
  { q: "expired", label: "Nobody took" },
  { q: "cancelled", label: "Cancelled" },
] as const;

export default async function AdminTripsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; flag?: string; page?: string }>;
}) {
  const { status, flag, page } = await searchParams;
  const win = pageWindow(page, PER_PAGE);
  const db = await createClient();

  // ⚑ The flagged view is filtered in JS against `mission_cancellation`, so it
  // cannot be paged in SQL — it is read whole and capped by the flag itself.
  const flagged = flag === "no-cancellation-record";

  // ⚑ ONE CLOCK for the chip and the rows it produces. The list re-reads the
  // time when it renders, milliseconds later; both sides of the `<=` boundary
  // are the same predicate, so a trip cannot be filtered in as live and then
  // printed as dead.
  const nowIso = new Date().toISOString();

  let query = db
    .from("mission_read")
    .select("*", { count: "exact" })
    .order("pickup_at", { ascending: false });
  // ⚑ THE CHIPS FILTER ON WHAT THE ROW SAYS, NOT ON THE COLUMN. `expire_stale_missions`
  // only runs on Pool and Dispatch reads, so the console is full of trips still
  // marked `pooled` whose pickup was weeks ago. Filtering on the raw status made
  // "In the Pool" list rows whose own status reads `Unfilled`, and made "Nobody
  // took" miss every one of them — the chip disagreeing with the list it just
  // produced. Same `isExpired` rule as lib/dispatch-status, written here in SQL
  // because the filter has to be part of the paged query.
  if (status === "pooled") {
    query = query.eq("status", "pooled").gt("pickup_at", nowIso);
  } else if (status === "expired") {
    query = query.or(
      `status.eq.expired,and(status.eq.pooled,pickup_at.lte."${nowIso}")`,
    );
  } else if (status) {
    query = query.eq("status", status as MissionStatus);
  }
  // ⚑ THE FLAGGED VIEW CANNOT BE PAGED IN SQL — it is filtered in JS against
  // `mission_cancellation` — so BOTH of its reads have to be paged by hand. Left
  // unbounded they stop at 1 000 rows in silence, and this view is the PROOF
  // behind a finding: a short read of the records would list trips that DO carry
  // a record as trips that don't. Naming innocent rows is worse than naming none.
  let rows: MissionRow[];
  let total: number;
  if (flagged) {
    const [cancelled, records] = await Promise.all([
      readAll<MissionRow>((from, to) =>
        db
          .from("mission_read")
          .select("*")
          .eq("status", "cancelled")
          .order("pickup_at", { ascending: false })
          .range(from, to),
      ),
      readAll<{ mission_id: string }>((from, to) =>
        db.from("mission_cancellation").select("mission_id").range(from, to),
      ),
    ]);
    const recorded = new Set(records.map((r) => r.mission_id));
    const missing = cancelled.filter((t) => !recorded.has(t.id));
    total = missing.length;
    rows = missing.slice(win.from, win.to + 1);
  } else {
    const res = await query.range(win.from, win.to);
    rows = res.data ?? [];
    total = res.count ?? 0;
  }

  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (flag) qs.set("flag", flag);
    if (p > 0) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/trips?${s}` : "/admin/trips";
  };

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Trips</h1>
          <p className="adm-head__meta">
            {flagged
              ? "Cancelled trips with no record of who cancelled them, or why."
              : "Newest first. Open one to read its whole story."}
          </p>
        </div>
      </header>

      {!flag && (
        <div className="adm-pick">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={f.q ? `/admin/trips?status=${f.q}` : "/admin/trips"}
              className={`adm-pick__b${(status ?? "") === f.q ? " is-on" : ""}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      )}

      <section className="adm-sect">
        <AdminTripList
          rows={rows}
          note={pageNote(total, win, PER_PAGE)}
          pageHref={href}
          empty="No trips match."
        />
      </section>
    </main>
  );
}
