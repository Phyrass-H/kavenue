import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { DriverVehicleFields } from "@/components/driver-vehicle-fields";
import { SettingsHeader, SaveNotice } from "@/components/settings-header";
import { updateVehicle } from "../actions";
import { vehicleProblemSays } from "@/lib/vehicle-rules";

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
  const { driver, vehicle } = ctx;
  const { ok, error, why } = await searchParams;

  return (
    <>
      <SettingsHeader title="Your vehicle" sub="The car a Business is told to expect." />
      {/* ⚑ The car rule's own words, one problem at a time (lib/vehicle-rules.ts). */}
      <SaveNotice
        ok={ok}
        error={error}
        messages={{
          ...NOTICE,
          car: vehicleProblemSays(why) ?? "Please finish your car’s details.",
        }}
      />

      <form action={updateVehicle}>
        <div className="dcard">
          <DriverVehicleFields
            // ⚑ The plate is checked against the Driver's own country (founder's rule) —
            //   in the browser too, so a wrong plate never costs them the form.
            country={driver.base_country ?? null}
            defaults={{
              body_type: vehicle?.body_type,
              make: vehicle?.make,
              model: vehicle?.model,
              colour: vehicle?.colour,
              plate: vehicle?.plate,
              seats: vehicle?.seats,
              energy: vehicle?.energy,
              first_registration_date: vehicle?.first_registration_date,
              accepts_luggage_runs: driver.accepts_luggage_runs,
            }}
          />
        </div>

        <button className="btn" type="submit">
          Save changes
        </button>
      </form>

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
