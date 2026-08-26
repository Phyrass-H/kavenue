// Trips. A list you can point a finding at — every filter here exists because
// some sentence on Activity needs somewhere to prove itself.
//
// ⚑ `?flag=no-cancellation-record` is the one that isn't a status: it is the
// answer to "which 23?", and without it that finding is a claim with no proof
// behind it.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tripLabel, whenLabel } from "@/lib/activity-findings";
import { formatDateTime, formatMoney, missionStatusLabel, shortPlaceLabel } from "@/lib/format";
import type { MissionStatus } from "@/lib/database.types";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ status?: string; flag?: string }>;
}) {
  const { status, flag } = await searchParams;
  const db = await createClient();

  let query = db.from("mission").select("*").order("pickup_at", { ascending: false }).limit(120);
  if (status) query = query.eq("status", status as MissionStatus);
  // The finding says 23 trips have no cancellation record; this is where a
  // reader goes to see which ones.
  if (flag === "no-cancellation-record") query = query.eq("status", "cancelled");
  const { data: trips } = await query;

  const { data: records } = await db.from("mission_cancellation").select("mission_id");
  const recorded = new Set((records ?? []).map((r) => r.mission_id));
  const rows =
    flag === "no-cancellation-record"
      ? (trips ?? []).filter((t) => !recorded.has(t.id))
      : (trips ?? []);

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Trips</h1>
          <p className="adm-head__meta">
            {flag === "no-cancellation-record"
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
        {rows.length === 0 ? (
          <p className="adm-none">No trips match.</p>
        ) : (
          rows.map((t) => (
            <Link key={t.id} href={`/admin/trips/${t.id}`} className="adm-row">
              <span className="adm-row__when">{formatDateTime(t.pickup_at)}</span>
              <span className="adm-row__name">
                {tripLabel(
                  {
                    pickup_label: t.pickup_label ?? shortPlaceLabel(t.pickup_address),
                    dropoff_label: t.dropoff_label ?? shortPlaceLabel(t.dropoff_address),
                  },
                  whenLabel(t.pickup_at),
                )}
              </span>
              <span className="adm-row__side">{formatMoney(t.ceiling)}</span>
              <span className="adm-row__kind">{missionStatusLabel(t.status)}</span>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
