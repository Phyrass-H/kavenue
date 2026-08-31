import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverContext } from "@/lib/driver";
import { formatMoney } from "@/lib/format";
import {
  buildWaybill,
  waybillGaps,
  WAYBILL_AUTHORITY,
  WAYBILL_ISSUER_NOTE,
  WAYBILL_TITLE,
} from "@/lib/waybill";

export const dynamic = "force-dynamic";

// The document is French because the person reading it is a French control officer.
// The app chrome around it stays in the app's own language.
const stamp = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function frDateTime(iso: string): string {
  // "25 août 2026 à 21 h 35". Two substitutions, both deliberate: the comma Intl puts
  // between date and time becomes "à", and the colon becomes "h" — French administrative
  // documents write the hour that way, and this one is read by a French officer.
  return stamp
    .format(new Date(iso))
    .replace(", ", " à ")
    .replace(/(\d{2}):(\d{2})/, "$1 h $2");
}

export default async function WaybillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { driver } = await getDriverContext();
  if (!driver) redirect("/onboarding");

  // ⚑ `mission_read`, not `mission` — the money-column walls ([[d114]]) revoked
  // `ceiling` and both commission rates off the base table for browser sessions,
  // so a `select("*")` here is a 403. Nothing about the document changes: the
  // guard two lines down means this only ever renders a trip the Driver HOLDS,
  // and the view withholds nothing on a held trip.
  //
  // ⚑ And named columns on top of the view, not `*`: the document prints eight fields, and a
  // page whose whole job is to be held up to a stranger at the roadside should ask the
  // database for nothing beyond what it shows.
  const supabase = await createClient();
  const { data: mission } = await supabase
    .from("mission_read")
    .select(
      "driver_id, business_id, dispatcher_id, vehicle_id, accepted_fare, created_at, pickup_at, pickup_address",
    )
    .eq("id", id)
    .maybeSingle();
  if (!mission) notFound();

  // ⚑ The waybill is the EXPLOITANT'S document about their own trip. A Driver who does
  // not hold this trip has no business producing one for it — and a pooled trip has no
  // exploitant yet, so there is nothing truthful to print.
  if (mission.driver_id !== driver.id) notFound();

  const gaps = waybillGaps(driver);

  if (gaps.length > 0) {
    return (
      <>
        <p className="small">
          <Link href={`/missions/${id}`} className="muted">
            ← Trip
          </Link>
        </p>
        <div className="dcard">
          <div className="wb-block">
            <AlertTriangle size={17} strokeWidth={1.8} aria-hidden="true" />
            <div>
              <b>We can’t issue your waybill yet.</b>
              <p>
                {gaps.length === 1 ? "One of the seven legal lines is" : "Some of the seven legal lines are"}{" "}
                about <em>your company</em>, and we don’t have{" "}
                {gaps.length === 1 ? "it" : "them"}.
              </p>
            </div>
          </div>
          <ul className="wb-gaps">
            {gaps.map((g) => (
              <li key={g.label}>
                <span className="wb-mention">{g.mention}</span>
                <Link href={g.href}>{g.label}</Link>
              </li>
            ))}
          </ul>
          <p className="dhint wb-why">
            We hold your REVTC certificate as a scan. The law wants the number printed on
            the document, and a scan isn’t a number.
          </p>
          <Link href="/settings/company" className="btn">
            Add them now
            <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
          <p className="dhint wb-why">
            Until then, carry your own justificatif. A waybill with a blank line is worse
            than none — it hands the officer a dated admission, produced by us.
          </p>
        </div>
      </>
    );
  }

  // A Driver cannot read `business` or `dispatcher` under RLS. Same pattern as the trip
  // page: the service role, scoped to the one mission RLS already proved is theirs.
  const admin = createAdminClient();
  const [{ data: biz }, { data: disp }, { data: vehicle }] = await Promise.all([
    admin
      .from("business")
      .select("name, legal_name, reception_phone")
      .eq("id", mission.business_id)
      .maybeSingle(),
    admin.from("dispatcher").select("phone").eq("id", mission.dispatcher_id).maybeSingle(),
    // ⚑ The car that DID the trip where accept_mission stamped one (2026-08-31b/c), and
    //   the Driver's current car otherwise. Trips accepted before that migration have no
    //   stamp, and falling back keeps their waybill exactly as correct as it was — which,
    //   with one car per Driver, is correct.
    mission.vehicle_id
      ? admin.from("vehicle").select("*").eq("id", mission.vehicle_id).maybeSingle()
      : admin
          .from("vehicle")
          .select("*")
          .eq("driver_id", driver.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
  ]);

  const wb = buildWaybill(
    mission,
    driver,
    {
      name: biz?.name ?? "—",
      legal_name: biz?.legal_name ?? null,
      reception_phone: biz?.reception_phone ?? null,
    },
    vehicle ?? null,
    disp?.phone ?? null,
  );

  return (
    <>
      <p className="small wb-back">
        <Link href={`/missions/${id}`} className="muted">
          ← Trip
        </Link>
      </p>

      <article className="wb-doc">
        <header className="wb-head">
          <h1>{WAYBILL_TITLE}</h1>
          <p>{WAYBILL_AUTHORITY}</p>
        </header>

        <section className="wb-sec">
          <h2>Exploitant VTC</h2>
          <p>
            <span className="wb-n">1°</span> {wb.exploitant.name}
          </p>
          <p className="wb-m">{wb.exploitant.address}</p>
          <p>
            <span className="wb-n">2°</span> REVTC {wb.exploitant.revtc}
          </p>
          <p>
            <span className="wb-n">3°</span> SIREN {wb.exploitant.siren}
          </p>
        </section>

        <section className="wb-sec">
          <h2>Donneur d’ordre</h2>
          <p>
            <span className="wb-n">4°</span> {wb.ordering.name}
          </p>
          {wb.ordering.phone && <p className="wb-m">{wb.ordering.phone}</p>}
        </section>

        <section className="wb-sec">
          <h2>Réservation</h2>
          <p>
            <span className="wb-n">5°</span> {frDateTime(wb.bookedAt)}
          </p>
        </section>

        <section className="wb-sec">
          <h2>Prise en charge</h2>
          <p>
            <span className="wb-n">6°</span> {frDateTime(wb.pickupAt)}
          </p>
          <p>
            <span className="wb-n">7°</span> {wb.pickupAddress}
          </p>
        </section>

        <hr className="wb-rule" />

        <section className="wb-sec">
          <h2>Conducteur</h2>
          <p>{wb.conducteur.name}</p>
          {wb.conducteur.phone && <p className="wb-m">{wb.conducteur.phone}</p>}
          {wb.conducteur.proCard && (
            <p className="wb-m">Carte professionnelle {wb.conducteur.proCard}</p>
          )}
        </section>

        {wb.vehicle && (
          <section className="wb-sec">
            <h2>Véhicule</h2>
            <p>{wb.vehicle.label}</p>
            <p className="wb-m">
              {[wb.vehicle.plate, wb.vehicle.seats ? `${wb.vehicle.seats} places` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
        )}

        {wb.course != null && (
          <section className="wb-sec wb-course">
            <h2>Course</h2>
            <span>{formatMoney(wb.course)}</span>
          </section>
        )}

        <footer className="wb-foot">{WAYBILL_ISSUER_NOTE}</footer>
      </article>

      <p className="dhint wb-why">
        Save it as a PDF from your browser’s share menu. A control can happen with no
        signal.
      </p>
    </>
  );
}
