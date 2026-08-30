// One Driver: who they are, what the Pool can reach them with, and their trips.
//
// ⚑ THE "REACHABLE" BLOCK IS THE POINT OF THIS PAGE. Six of the nine Drivers on
// the live fleet have never set a base, so their Pool is empty and always has
// been — they have never been offered a single trip and nothing in the app tells
// anyone that. Everything here is read straight from the rules the Pool applies
// (lib/eligibility.ts), so it can't drift into flattery.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminTripList } from "@/components/admin-trip-list";
import { pageWindow, pageNote } from "@/lib/admin-list";
import { serviceClassLabel } from "@/lib/format";
import { genderSays } from "@/lib/gender";

const PER_PAGE = 40;

export const dynamic = "force-dynamic";

export default async function AdminDriverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;
  const win = pageWindow(page, PER_PAGE);
  const db = await createClient();

  const { data: driver } = await db.from("driver").select("*").eq("id", id).maybeSingle();
  if (!driver) notFound();

  const [{ data: vehicles }, { data: trips, count }] = await Promise.all([
    db.from("vehicle").select("*").eq("driver_id", id),
    db
      .from("mission")
      .select("*", { count: "exact" })
      .eq("driver_id", id)
      .order("pickup_at", { ascending: false })
      .range(win.from, win.to),
  ]);
  const car = (vehicles ?? []).find((v) => v.is_active) ?? (vehicles ?? [])[0] ?? null;
  const based = driver.base_lat != null && driver.base_lng != null;

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>
            {driver.first_name} {driver.last_name}
          </h1>
          <p className="adm-head__meta">
            {car ? serviceClassLabel(car.category, car.body_type) : "No car on file"}
            {car?.make && ` · ${car.make} ${car.model ?? ""}`}
            {driver.phone && ` · ${driver.phone}`}
            {/* ⚑ SHOWN, INCLUDING WHEN IT IS EMPTY. "not asked" is a fact about
                Kavenue, not about the Driver — printing nothing would make an
                optional question look like one nobody answers. It decides
                nothing, which is why it sits in the identity line and not in
                "Can the Pool reach them?". */}
            {` · ${genderSays(driver.gender)}`}
          </p>
        </div>
        <div className="adm-head__side">
          <span className={`adm-pill${driver.verified ? " adm-pill--ok" : " adm-pill--warn"}`}>
            {driver.verified ? "Verified" : "Not verified"}
          </span>
        </div>
      </header>

      <section className="adm-sect">
        <h2 className="adm-sect__h">Can the Pool reach them?</h2>
        {based ? (
          <p className="adm-lede">
            Yes — based in {driver.base_label ?? "a set location"}, driving up to{" "}
            {driver.service_radius_km ?? 50} km for a pickup.
          </p>
        ) : (
          <p className="adm-lede adm-lede--bad">
            No — they have never set a base, so their Pool is empty and always has been. They have
            never been offered a trip.
          </p>
        )}
        {/* ⚑ Named, not hidden. Both of these are collected, both are shown to the
            Driver, and neither is consulted when Kavenue decides who sees a trip
            or who may take one. Leaving them off this page would let a reader
            assume otherwise — and one of them is `verified`. */}
        <div className="adm-check adm-check--dead">
          <span className="adm-check__ic" aria-hidden="true">–</span>
          <span>Towns they say they work — never consulted</span>
          <span className="adm-check__d">{(driver.operational_zones ?? []).join(", ") || "none set"}</span>
        </div>
        <div className="adm-check adm-check--dead">
          <span className="adm-check__ic" aria-hidden="true">–</span>
          <span>
            {driver.verified ? "Verified by you" : "Not verified by you"} — never consulted, so it
            stops nothing today
          </span>
          <span className="adm-check__d">{driver.accepts_luggage_runs ? "takes luggage runs" : ""}</span>
        </div>
      </section>

      <section className="adm-sect">
        {/* ⚑ NO ROLL-UP HERE. This used to read "· 83 of 90 completed" over rows
            that each already carry their own ending. The fleet list is where
            "is this Driver working" belongs, and it says so per Driver. */}
        <h2 className="adm-sect__h">Their trips</h2>
        <AdminTripList
          rows={trips ?? []}
          note={pageNote(count ?? 0, win, PER_PAGE)}
          pageHref={(p) => (p === 0 ? `/admin/drivers/${id}` : `/admin/drivers/${id}?page=${p}`)}
          empty="They have never held a trip."
          band="month"
        />
      </section>
    </main>
  );
}
