"use server";

import { redirect } from "next/navigation";
import { isGender } from "@/lib/gender";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLatLng } from "@/lib/geo";
import { categorize } from "@/lib/vehicle-catalog";
import type { BodyType, PreferredGps } from "@/lib/database.types";

const GPS_OPTIONS: readonly PreferredGps[] = ["waze", "google", "apple"];

// One account, several small forms (S48). Each screen saves only what it shows —
// the old single Save silently wrote the vehicle too, so editing your phone number
// re-derived your service tier.
async function currentDriverId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: driver } = await admin
    .from("driver")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!driver) redirect("/onboarding");
  return driver.id;
}

// The hub's readiness strip is computed from every one of these, so a save on any
// sub-page has to refresh the whole account area.
function done(path: string) {
  revalidatePath("/settings", "layout");
  redirect(`${path}?ok=1`);
}

// ---------------------------------------------------------------- Profile
export async function updateProfile(formData: FormData) {
  const driverId = await currentDriverId();

  const first = String(formData.get("first_name") ?? "").trim();
  const last = String(formData.get("last_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const languages = String(formData.get("languages") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // ⚑ NARROWED, AND AN UNKNOWN VALUE IS DROPPED RATHER THAN STORED. Optional
  // means a blank post leaves the column NULL — "never asked" — which is a
  // different fact from `undisclosed`, the answer a Driver gives deliberately.
  const genderRaw = String(formData.get("gender") ?? "").trim();
  const gender = isGender(genderRaw) ? genderRaw : null;

  if (!first || !last) redirect("/settings/profile?error=missing");

  const admin = createAdminClient();
  const { error } = await admin
    .from("driver")
    .update({
      first_name: first,
      last_name: last,
      phone: phone || null,
      languages,
      gender,
    })
    .eq("id", driverId);
  if (error) redirect("/settings/profile?error=db");

  done("/settings/profile");
}

// ------------------------------------------------------------ Navigation
export async function updateNavigation(formData: FormData) {
  const driverId = await currentDriverId();

  const raw = String(formData.get("preferred_gps") ?? "");
  const gps: PreferredGps | null = GPS_OPTIONS.includes(raw as PreferredGps)
    ? (raw as PreferredGps)
    : null;

  const admin = createAdminClient();
  const { error } = await admin.from("driver").update({ preferred_gps: gps }).eq("id", driverId);
  if (error) redirect("/settings/navigation?error=db");

  done("/settings/navigation");
}

// ---------------------------------------------------------- Where you work
export async function updateServiceArea(formData: FormData) {
  const driverId = await currentDriverId();

  const baseLabel = String(formData.get("base_label") ?? "").trim();
  const baseLat = Number.parseFloat(String(formData.get("base_lat") ?? ""));
  const baseLng = Number.parseFloat(String(formData.get("base_lng") ?? ""));
  const radiusRaw = Number.parseInt(String(formData.get("service_radius_km") ?? ""), 10);
  const radius = Number.isFinite(radiusRaw) ? Math.min(500, Math.max(5, radiusRaw)) : 50;

  if (!baseLabel || !isValidLatLng(baseLat, baseLng)) {
    redirect("/settings/area?error=nobase");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("driver")
    .update({
      base_label: baseLabel,
      base_lat: baseLat,
      base_lng: baseLng,
      service_radius_km: radius,
    })
    .eq("id", driverId);
  if (error) redirect("/settings/area?error=db");

  done("/settings/area");
}

// ---------------------------------------------------------------- Vehicle
export async function updateVehicle(formData: FormData) {
  const driverId = await currentDriverId();
  const admin = createAdminClient();

  const bodyRaw = String(formData.get("body_type") ?? "");
  const bodyType: BodyType = bodyRaw === "van" ? "van" : "sedan";
  const make = String(formData.get("make") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const colour = String(formData.get("colour") ?? "").trim();
  const plate = String(formData.get("plate") ?? "").trim();
  const seatsRaw = String(formData.get("seats") ?? "").trim();
  const seatsNum = seatsRaw ? Number.parseInt(seatsRaw, 10) : NaN;
  const seats = Number.isFinite(seatsNum) ? seatsNum : null;

  // Van Drivers can opt in to bags-only luggage runs (Sujet B, Phase 1). The
  // checkbox only renders for a Van, so a Sedan Driver never submits it.
  const acceptsLuggage = bodyType === "van" && formData.get("accepts_luggage_runs") === "on";
  const { error: driverErr } = await admin
    .from("driver")
    .update({ accepts_luggage_runs: acceptsLuggage })
    .eq("id", driverId);
  if (driverErr) redirect("/settings/vehicle?error=db");

  // Tier is DERIVED from make+model (two-step fallback), never self-selected.
  const vehicleFields = {
    category: categorize(make, model),
    body_type: bodyType,
    make: make || null,
    model: model || null,
    colour: colour || null,
    plate: plate || null,
    seats,
  };

  const { data: vehicle } = await admin
    .from("vehicle")
    .select("id")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { error } = vehicle
    ? await admin.from("vehicle").update(vehicleFields).eq("id", vehicle.id)
    : await admin.from("vehicle").insert({ driver_id: driverId, ...vehicleFields });
  if (error) redirect("/settings/vehicle?error=db");

  done("/settings/vehicle");
}

// ---------------------------------------------------------------- Company
export async function updateCompany(formData: FormData) {
  const driverId = await currentDriverId();

  const name = String(formData.get("company_name") ?? "").trim();
  // SIRET is 14 digits; people type it with spaces off their Kbis.
  const siret = String(formData.get("siret") ?? "").replace(/\s/g, "");
  const vat = String(formData.get("vat_number") ?? "").replace(/\s/g, "").toUpperCase();

  if (siret && !/^\d{14}$/.test(siret)) {
    redirect("/settings/company?error=siret");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("driver")
    .update({
      company_name: name || null,
      siret: siret || null,
      vat_number: vat || null,
    })
    .eq("id", driverId);
  if (error) redirect("/settings/company?error=db");

  done("/settings/company");
}
