// One hotel: who they are, who books for them, and what they have posted.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tripLabel, whenLabel } from "@/lib/activity-findings";
import type { VehicleCategory } from "@/lib/database.types";
import {
  formatDateTime,
  formatMoney,
  missionStatusLabel,
  serviceClassLabel,
  shortPlaceLabel,
} from "@/lib/format";

// Mirrors app/(dispatch)/dispatch/settings/actions.ts — the column is a bare
// string, so the label lookup narrows rather than trusts.
const VEHICLE_CATEGORIES: readonly VehicleCategory[] = ["eco", "business", "luxury"];

export const dynamic = "force-dynamic";

export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();

  const { data: business } = await db.from("business").select("*").eq("id", id).maybeSingle();
  if (!business) notFound();

  const [{ data: staff }, { data: trips }] = await Promise.all([
    db.from("dispatcher").select("*").eq("business_id", id).order("created_at"),
    db
      .from("mission")
      .select("*")
      .eq("business_id", id)
      .order("pickup_at", { ascending: false })
      .limit(40),
  ]);
  const unfilled = (trips ?? []).filter((t) => t.status === "expired").length;

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
          <p className="adm-none">Nobody is set up to book for this hotel.</p>
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
        <h2 className="adm-sect__h">
          What they have posted
          {/* Unfilled is the number a hotel actually feels — name it, never bury it. */}
          {unfilled > 0 && ` · ${unfilled} nobody took`}
        </h2>
        {!trips?.length ? (
          <p className="adm-none">They have never posted a trip.</p>
        ) : (
          trips.map((t) => (
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
