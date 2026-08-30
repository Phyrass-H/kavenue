// One hotel: who they are, who books for them, and what they have posted.
//
// ⚑ THE HOTEL'S OWN NAME USED TO BE ON EVERY ROW of its own page —
// "Belles-Rives, Juan-les-Pins → Nice Airport", forty times down the screen.
// The heading already says whose page this is, so the row's information is the
// OTHER end of the journey. `farLeg` decides which end that is on COORDINATES,
// never on the name: "Hôtel Belles-Rives" the business and "Belles-Rives,
// Juan-les-Pins" the saved address label are not the same string.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminTripList } from "@/components/admin-trip-list";
import { pageWindow, pageNote } from "@/lib/admin-list";
import type { VehicleCategory } from "@/lib/database.types";
import { formatDateTime, serviceClassLabel } from "@/lib/format";

// Mirrors app/(dispatch)/dispatch/settings/actions.ts — the column is a bare
// string, so the label lookup narrows rather than trusts.
const VEHICLE_CATEGORIES: readonly VehicleCategory[] = ["eco", "business", "luxury"];

const PER_PAGE = 40;

export const dynamic = "force-dynamic";

export default async function AdminBusinessPage({
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

  const { data: business } = await db.from("business").select("*").eq("id", id).maybeSingle();
  if (!business) notFound();

  const [{ data: staff }, { data: trips, count }] = await Promise.all([
    db.from("dispatcher").select("*").eq("business_id", id).order("created_at"),
    db
      .from("mission_read")
      .select("*", { count: "exact" })
      .eq("business_id", id)
      .order("pickup_at", { ascending: false })
      .range(win.from, win.to),
  ]);

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>{business.name}</h1>
          <p className="adm-head__meta">
            {business.business_address_label ?? business.registered_address ?? "No address on file"}
            {/* The column is a bare string in the DB, so narrow it rather than
                trusting it — an unrecognised value is shown as itself. */}
            {business.default_vehicle_category &&
              ` · usually books ${
                VEHICLE_CATEGORIES.includes(business.default_vehicle_category as VehicleCategory)
                  ? serviceClassLabel(business.default_vehicle_category as VehicleCategory)
                  : business.default_vehicle_category
              }`}
            {business.reception_phone && ` · ${business.reception_phone}`}
          </p>
        </div>
      </header>

      <section className="adm-sect">
        <h2 className="adm-sect__h">Who books for them</h2>
        {!staff?.length ? (
          <p className="adm-none">Nobody is set up to book for this Business.</p>
        ) : (
          staff.map((s) => (
            <div key={s.id} className="adm-row">
              <span className="adm-row__when">{formatDateTime(s.created_at)}</span>
              <span className="adm-row__name">{s.name ?? s.email}</span>
              <span className="adm-row__side">{s.phone ?? ""}</span>
              <span className="adm-row__kind">Dispatcher</span>
            </div>
          ))
        )}
      </section>

      <section className="adm-sect">
        {/* ⚑ NO ROLL-UP HERE. This heading used to carry "· 10 nobody took",
            over rows that each already say `Unfilled`. The founder has rejected
            a count-at-the-top twice; the state belongs on the row. */}
        <h2 className="adm-sect__h">What they have posted</h2>
        <AdminTripList
          rows={trips ?? []}
          anchor={{ lat: business.business_address_lat, lng: business.business_address_lng }}
          note={pageNote(count ?? 0, win, PER_PAGE)}
          pageHref={(p) => (p === 0 ? `/admin/businesses/${id}` : `/admin/businesses/${id}?page=${p}`)}
          empty="They have never posted a trip."
          band="month"
        />
      </section>
    </main>
  );
}
