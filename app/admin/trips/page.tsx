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
import { pageWindow, pageNote } from "@/lib/admin-list";
import type { MissionStatus } from "@/lib/database.types";

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

  let query = db
    .from("mission")
    .select("*", { count: "exact" })
    .order("pickup_at", { ascending: false });
  if (status) query = query.eq("status", status as MissionStatus);
  if (flagged) query = query.eq("status", "cancelled");
  const { data: trips, count } = await (flagged ? query : query.range(win.from, win.to));

  let rows = trips ?? [];
  let total = count ?? 0;
  if (flagged) {
    // The finding says N cancelled trips have no record; this is where a reader
    // goes to see which ones.
    const { data: records } = await db.from("mission_cancellation").select("mission_id");
    const recorded = new Set((records ?? []).map((r) => r.mission_id));
    rows = rows.filter((t) => !recorded.has(t.id));
    total = rows.length;
    rows = rows.slice(win.from, win.to + 1);
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
