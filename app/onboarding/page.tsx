import { redirect } from "next/navigation";
import { getAppContext, routeFor } from "@/lib/app-context";
import { createDriverProfile } from "./actions";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { DriverVehicleFields } from "@/components/driver-vehicle-fields";
import { vehicleProblemSays } from "@/lib/vehicle-rules";

const RADII = [25, 50, 75, 100, 150, 200, 300];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; why?: string }>;
}) {
  const ctx = await getAppContext();
  if (!ctx.user) redirect("/login");
  if (ctx.profile && ctx.profile.role !== "driver") redirect(routeFor(ctx));
  if (ctx.driver && ctx.liveCar) redirect("/pool");

  const user = ctx.user;
  const { error, why } = await searchParams;

  return (
    <main className="container" style={{ paddingTop: 28 }}>
      <h1>Set up your Driver profile</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        We need a few details to show you the right missions. Signed in as{" "}
        <strong>{user.email}</strong>.
      </p>

      {error === "missing" && (
        <div className="notice error">
          Please fill in your name and pick a vehicle category.
        </div>
      )}
      {error === "nobase" && (
        <div className="notice error">
          Please pick your base address from the suggestions so we can match missions by distance.
        </div>
      )}
      {/* ⚑ ONE PROBLEM, BY NAME — the approved preview. The rule and its words both
          live in lib/vehicle-rules.ts, so this page cannot drift from Settings. */}
      {error === "car" && (
        <div className="notice error">
          {vehicleProblemSays(why) ?? "Please finish your car’s details."}
        </div>
      )}
      {error === "db" && (
        <div className="notice error">
          Something went wrong saving your profile. Please try again.
        </div>
      )}

      <form action={createDriverProfile} className="card">
        <label className="field">
          <span>First name</span>
          <input type="text" name="first_name" required />
        </label>
        <label className="field">
          <span>Last name</span>
          <input type="text" name="last_name" required />
        </label>
        <label className="field">
          <span>Phone (revealed to the Business when you accept)</span>
          <input type="tel" name="phone" placeholder="+33 6 12 34 56 78" />
        </label>

        <DriverVehicleFields />
        <p className="muted small" style={{ marginTop: -6 }}>
          Make, colour and plate are shown to the Business so the Guest knows
          which car to look for. You can edit these later in Settings.
        </p>

        <label className="field">
          <span>Preferred GPS</span>
          <select name="preferred_gps" defaultValue="google">
            <option value="waze">Waze</option>
            <option value="google">Google Maps</option>
            <option value="apple">Apple Maps</option>
          </select>
        </label>

        <div className="field">
          <span style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
            Your base
          </span>
          <AddressAutocomplete
            labelName="base_label"
            latName="base_lat"
            lngName="base_lng"
            // ⚑ THE DOOR, NOT JUST THE SETTINGS PAGE (2026-09-11). Area capture shipped
            // on /settings/area on 2026-09-09 and was missed HERE, on the page every new
            // Driver actually passes through — so it only filled when someone re-saved
            // their base, which is the opposite of capturing it at the door.
            areaName="base_area"
            placeholder="Start typing a town or address…"
          />
        </div>

        <label className="field">
          <span>Service radius — how far from your base you’ll drive</span>
          <select name="service_radius_km" defaultValue="50">
            {RADII.map((r) => (
              <option key={r} value={r}>
                Up to {r} km
              </option>
            ))}
          </select>
        </label>
        <p className="muted small" style={{ marginTop: -6 }}>
          A mission shows in your Pool when its pickup <strong>or</strong> drop-off is within this
          distance of your base.
        </p>

        <button className="btn" type="submit">
          Save and see the Pool
        </button>
      </form>
    </main>
  );
}
