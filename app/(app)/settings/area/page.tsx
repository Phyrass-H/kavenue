import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { SettingsHeader, SaveNotice } from "@/components/settings-header";
import { updateServiceArea } from "../actions";

export const dynamic = "force-dynamic";

const RADII = [25, 50, 75, 100, 150, 200, 300];

const NOTICE: Record<string, string> = {
  nobase: "Please pick your base from the suggestions so the Pool can match by distance.",
  db: "Something went wrong saving your changes. Please try again.",
};

export default async function ServiceAreaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getAppContext();
  if (!ctx.driver) redirect("/onboarding");
  const driver = ctx.driver;
  const { ok, error } = await searchParams;

  const base =
    driver.base_lat != null && driver.base_lng != null
      ? { label: driver.base_label ?? "", lat: driver.base_lat, lng: driver.base_lng }
      : null;

  // Keep a previously-saved radius selectable even if it isn't a preset.
  const stored = driver.service_radius_km ?? 50;
  const radii = RADII.includes(stored) ? RADII : [...RADII, stored].sort((a, b) => a - b);

  return (
    <>
      <SettingsHeader title="Where you work" sub="This is what decides which trips reach you." />
      <SaveNotice ok={ok} error={error} messages={NOTICE} />

      <form action={updateServiceArea}>
        <div className="dcard">
          <div className="field">
            <span className="dlabel">Your base</span>
            <AddressAutocomplete
              labelName="base_label"
              latName="base_lat"
              lngName="base_lng"
              areaName="base_area"
              defaultValue={base}
              placeholder="Start typing a town or address…"
            />
          </div>

          <label className="field" style={{ marginBottom: 0 }}>
            <span>How far you’ll drive</span>
            <select name="service_radius_km" defaultValue={String(stored)}>
              {radii.map((r) => (
                <option key={r} value={r}>
                  Up to {r} km
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dlock dlock--foot" style={{ marginTop: 0 }}>
          <Info size={15} strokeWidth={1.9} aria-hidden="true" />
          <span>
            A mission reaches you when its pickup <strong>or</strong> its drop-off is inside
            that distance — so a long transfer that ends near home still shows up.
          </span>
        </div>

        <button className="btn" type="submit" style={{ marginTop: 12 }}>
          Save changes
        </button>
      </form>
    </>
  );
}
