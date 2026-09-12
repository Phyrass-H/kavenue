import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { SavedCopyNotice, SavedCopyStamp } from "@/components/saved-copy";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverContext } from "@/lib/driver";
import { formatMoney } from "@/lib/format";
import {
  buildWaybill,
  carAsDriven,
  frDateTime,
  waybillGaps,
  WAYBILL_AUTHORITY,
  WAYBILL_ISSUER_NOTE,
  WAYBILL_TITLE,
} from "@/lib/waybill";

export const dynamic = "force-dynamic";

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
      // ⚑ The eight frozen car columns are named here, not `*`: mission_read masks the
      //   Ceiling for a Driver on a trip they do not hold, and a select that asks for
      //   everything is how a 403 with an empty message gets mistaken for "no data" (S76).
      "driver_id, business_id, dispatcher_id, vehicle_id, accepted_fare, created_at, pickup_at, pickup_address, vehicle_plate, vehicle_make, vehicle_model, vehicle_colour, vehicle_seats",
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
  const [{ data: biz }, { data: disp }] = await Promise.all([
    admin
      .from("business")
      .select("name, legal_name, reception_phone")
      .eq("id", mission.business_id)
      .maybeSingle(),
    admin.from("dispatcher").select("phone").eq("id", mission.dispatcher_id).maybeSingle(),
  ]);

  // ⚑⚑ S78 — THE CAR COMES OFF THE TRIP, NOT OFF THE DRIVER. Until today this page read the
  // `vehicle` row live (by mission.vehicle_id, or the Driver's current car when nothing was
  // stamped), and a car row is mutable: the day a Driver re-plated or changed car, every
  // Waybill they had ever been issued started naming the new one. [[d113]] believed the stamp
  // prevented that — it stored a POINTER, so it did not. The founder, 2026-09-12: *"it's a
  // false information probably illegal"*.
  // ⚑ And there is no fallback on purpose. A trip with no frozen copy prints "not recorded",
  //   which is true; printing today's car would be the fault this change exists to remove.

  const wb = buildWaybill(
    mission,
    driver,
    {
      name: biz?.name ?? "—",
      legal_name: biz?.legal_name ?? null,
      reception_phone: biz?.reception_phone ?? null,
    },
    carAsDriven(mission),
    disp?.phone ?? null,
  );

  return (
    <>
      <p className="small wb-back">
        <Link href={`/missions/${id}`} className="muted">
          ← Trip
        </Link>
      </p>

      {/* ⚑ Both marks render NOTHING on a live page and appear only when the document
          came out of the cache — see components/saved-copy.tsx for why they are React
          components rather than a string the service worker injects (React hydration
          deletes anything the worker adds). This first one is app chrome, never prints. */}
      <SavedCopyNotice missionId={id} />

      <article className="wb-doc">
        <header className="wb-head">
          <h1>{WAYBILL_TITLE}</h1>
          <p>{WAYBILL_AUTHORITY}</p>
        </header>

        <section className="wb-sec">
          <h2>Exploitant VTC</h2>
          <p>{wb.exploitant.name}</p>
          <p className="wb-m">{wb.exploitant.address}</p>
          <p>REVTC {wb.exploitant.revtc}</p>
          <p>SIREN {wb.exploitant.siren}</p>
        </section>

        <section className="wb-sec">
          <h2>Donneur d’ordre</h2>
          <p>{wb.ordering.name}</p>
          {wb.ordering.phone && <p className="wb-m">{wb.ordering.phone}</p>}
        </section>

        <section className="wb-sec">
          <h2>Réservation</h2>
          <p>{frDateTime(wb.bookedAt)}</p>
        </section>

        <section className="wb-sec">
          <h2>Prise en charge</h2>
          <p>{frDateTime(wb.pickupAt)}</p>
          <p>{wb.pickupAddress}</p>
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

        {/* ⚑ THE HEADING IS ALWAYS THERE. It used to be inside the guard, so a trip with no
            frozen car printed no Véhicule block at all — a document with a section silently
            missing reads as complete to the person holding it. Saying "non renseigné" is
            the honest form, and it is never filled in from the Driver's current car. */}
        {wb.vehicle ? (
          <section className="wb-sec">
            <h2>Véhicule</h2>
            <p>{wb.vehicle.label}</p>
            <p className="wb-m">
              {[wb.vehicle.plate, wb.vehicle.seats ? `${wb.vehicle.seats} places` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
        ) : (
          <section className="wb-sec">
            <h2>Véhicule</h2>
            <p className="wb-none">Non renseigné</p>
          </section>
        )}

        {wb.course != null && (
          <section className="wb-sec wb-course">
            <h2>Course</h2>
            <span>{formatMoney(wb.course)}</span>
          </section>
        )}

        <footer className="wb-foot">
          <p>{WAYBILL_ISSUER_NOTE}</p>
          {/* The second mark. On the document, so it prints with it. */}
          <SavedCopyStamp missionId={id} />
        </footer>
      </article>

      <p className="dhint wb-why">
        Save it as a PDF from your browser’s share menu. A control can happen with no
        signal.
      </p>
    </>
  );
}
