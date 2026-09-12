import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { DriverVehicleFields } from "@/components/driver-vehicle-fields";
import { SettingsHeader, SaveNotice } from "@/components/settings-header";
import { updateVehicle } from "../actions";
import { vehicleProblemSays } from "@/lib/vehicle-rules";
import { duplicateSays } from "@/lib/duplicate";
import { CAR_REVIEW, CAR_STATUS_PILL, statusOf } from "@/lib/vehicle-approval";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  db: "Something went wrong saving your changes. Please try again.",
};

export default async function VehicleSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; why?: string }>;
}) {
  const ctx = await getAppContext();
  if (!ctx.driver) redirect("/onboarding");
  const { driver, liveCar } = ctx;
  const { ok, error, why } = await searchParams;

  const status = liveCar ? statusOf(liveCar) : null;
  // ⚑ THE CAR THEY USED TO DRIVE, NAMED. A retired row is kept for ever because past trips
  //   point at it, and a Driver who sees it vanish assumes their history went with it. This is
  //   the one place that says out loud: it is still there, and it still holds your old trips.
  const admin = createAdminClient();
  const { data: retired } = await admin
    .from("vehicle")
    .select("make, model, plate, retired_at")
    .eq("driver_id", driver.id)
    .not("retired_at", "is", null)
    .order("retired_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <>
      <SettingsHeader title="Your vehicle" sub="The car a Business is told to expect." />
      {/* ⚑ The car rule's own words, one problem at a time (lib/vehicle-rules.ts) — and, since
          S78, the "that plate is already on another account" sentence, which is a refusal from
          the database rather than from the rule module. */}
      <SaveNotice
        ok={ok}
        error={error}
        messages={{
          ...NOTICE,
          car: vehicleProblemSays(why) ?? duplicateSays(why) ?? "Please finish your car’s details.",
        }}
      />

      {liveCar && status !== "approved" && (
        <div className={`dcard carstate carstate--${status}`}>
          <p className="carstate__t">
            <b>
              {[liveCar.make, liveCar.model].filter(Boolean).join(" ") || "Your car"}
              {liveCar.plate ? ` · ${liveCar.plate}` : ""}
            </b>
            <span className="pill">{CAR_STATUS_PILL[status ?? "pending"]}</span>
          </p>
          {status === "pending" ? (
            <>
              <p className="carstate__s">{CAR_REVIEW.checked}</p>
              <p className="carstate__s">You can’t take trips until it’s approved.</p>
            </>
          ) : (
            <>
              {/* ⚑ The reason is not optional: a rejection with no reason is a dead end, and
                  the review action refuses to save one (lib/vehicle-review.ts). */}
              <p className="carstate__s">{liveCar.rejection_note}</p>
              <p className="carstate__s">Correct it below and we’ll look again.</p>
            </>
          )}
        </div>
      )}

      <form action={updateVehicle}>
        <div className="dcard">
          <DriverVehicleFields
            // ⚑ The plate is checked against the Driver's own country (founder's rule) —
            //   in the browser too, so a wrong plate never costs them the form.
            country={driver.base_country ?? null}
            defaults={{
              body_type: liveCar?.body_type,
              make: liveCar?.make,
              model: liveCar?.model,
              colour: liveCar?.colour,
              plate: liveCar?.plate,
              seats: liveCar?.seats,
              energy: liveCar?.energy,
              first_registration_date: liveCar?.first_registration_date,
              accepts_luggage_runs: driver.accepts_luggage_runs,
            }}
          />
        </div>

        {/* ⚑ SAID BEFORE THEY SAVE, NOT AFTER. Changing an approved car files a new one and
            stops them working until a person looks at it — a Driver who learns that from an
            empty Pool on Saturday morning learns it the expensive way. */}
        {status === "approved" && (
          <p className="dnote">
            Changing any of this files a new car. Your current one keeps your past trips, and
            you can’t take new ones until we’ve approved the new car.
          </p>
        )}

        <button className="btn" type="submit">
          Save changes
        </button>
      </form>

      {retired && (
        <p className="dnote dnote--muted">
          Your {[retired.make, retired.model].filter(Boolean).join(" ") || "previous car"}
          {retired.plate ? ` (${retired.plate})` : ""} is retired
          {retired.retired_at ? ` since ${formatDate(retired.retired_at)}` : ""}. Your past trips
          keep it.
        </p>
      )}

      <Link href="/settings/documents" className="dcard drow drow--solo">
        <span className="drow__ic" aria-hidden="true">
          <FileText size={19} strokeWidth={1.7} />
        </span>
        <span className="drow__t">
          <b>Its papers</b>
          <span>Carte grise and insurance live in Documents</span>
        </span>
      </Link>
    </>
  );
}
