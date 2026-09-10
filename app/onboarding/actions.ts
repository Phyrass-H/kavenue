"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLatLng } from "@/lib/geo";
import { canonicalMake, categorize } from "@/lib/vehicle-catalog";
import type { BodyType, PreferredGps } from "@/lib/database.types";

const GPS_OPTIONS: readonly PreferredGps[] = ["waze", "google", "apple"];

// Creates the Driver's profile + driver + vehicle rows for the logged-in user.
// Uses the service-role client because profile/driver have no INSERT RLS policy
// (writes are server-side in beta) — gated strictly to the current user's id.
// The Driver picks a BASE location + service radius — that's what the Pool
// matches against (replacing the old town list).
export async function createDriverProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const first = String(formData.get("first_name") ?? "").trim();
  const last = String(formData.get("last_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const gpsRaw = String(formData.get("preferred_gps") ?? "");
  const gps: PreferredGps | null = GPS_OPTIONS.includes(gpsRaw as PreferredGps)
    ? (gpsRaw as PreferredGps)
    : null;

  // Vehicle identification (optional at signup, editable later in Settings).
  // Plate matters for the legally-required VTC verification, not just display.
  const bodyRaw = String(formData.get("body_type") ?? "");
  const bodyType: BodyType = bodyRaw === "van" ? "van" : "sedan";
  // ⚑ CANONICAL ON THE WAY IN — see lib/vehicle-catalog.ts. "Merc", "MB" and
  //   "Mercedes" are all one marque; storing them apart makes them three.
  const make = canonicalMake(String(formData.get("make") ?? ""));
  const model = String(formData.get("model") ?? "").trim() || null;
  const colour = String(formData.get("colour") ?? "").trim() || null;
  const plate = String(formData.get("plate") ?? "").trim() || null;
  const seatsRaw = String(formData.get("seats") ?? "").trim();
  const seatsNum = seatsRaw ? Number.parseInt(seatsRaw, 10) : NaN;
  const seats = Number.isFinite(seatsNum) ? seatsNum : null;
  // Tier is DERIVED from make+model (two-step fallback), never self-selected.
  const category = categorize(make ?? "", model ?? "");
  // Van Drivers can opt in to bags-only luggage runs (Sujet B, Phase 1).
  const acceptsLuggage = bodyType === "van" && formData.get("accepts_luggage_runs") === "on";

  const baseLabel = String(formData.get("base_label") ?? "").trim();
  const baseLat = Number.parseFloat(String(formData.get("base_lat") ?? ""));
  const baseLng = Number.parseFloat(String(formData.get("base_lng") ?? ""));
  const radiusRaw = Number.parseInt(String(formData.get("service_radius_km") ?? ""), 10);
  const radius = Number.isFinite(radiusRaw) ? Math.min(500, Math.max(5, radiusRaw)) : 50;

  if (!first || !last) {
    redirect("/onboarding?error=missing");
  }
  if (!baseLabel || !isValidLatLng(baseLat, baseLng)) {
    redirect("/onboarding?error=nobase");
  }

  const admin = createAdminClient();

  // Don't let a direct POST flip an existing dispatcher into a driver.
  const { data: existingProfile } = await admin
    .from("profile")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existingProfile && existingProfile.role !== "driver") redirect("/");

  // role profile (idempotent)
  const { error: profileErr } = await admin
    .from("profile")
    .upsert(
      { auth_user_id: user.id, role: "driver" },
      { onConflict: "auth_user_id" },
    );
  if (profileErr) redirect("/onboarding?error=db");

  // driver (create or update)
  const { data: existing } = await admin
    .from("driver")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const driverFields = {
    first_name: first,
    last_name: last,
    phone: phone || null,
    preferred_gps: gps,
    base_label: baseLabel,
    base_lat: baseLat,
    base_lng: baseLng,
    service_radius_km: radius,
    accepts_luggage_runs: acceptsLuggage,
  };

  let driverId = existing?.id;
  if (!driverId) {
    const { data: created, error } = await admin
      .from("driver")
      .insert({ auth_user_id: user.id, email: user.email ?? null, ...driverFields })
      .select("id")
      .single();
    if (error || !created) redirect("/onboarding?error=db");
    driverId = created!.id;
  } else {
    const { error: updateErr } = await admin
      .from("driver")
      .update(driverFields)
      .eq("id", driverId);
    if (updateErr) redirect("/onboarding?error=db");
  }

  // one vehicle per Driver (create or update its category). Check the write —
  // the (app) layout requires a vehicle, so a silent failure here would bounce
  // the Driver between /pool and /onboarding forever.
  const { data: vehicle } = await admin
    .from("vehicle")
    .select("id")
    .eq("driver_id", driverId!)
    .maybeSingle();

  const vehicleFields = { category, body_type: bodyType, make, model, colour, plate, seats };
  if (!vehicle) {
    const { error: vErr } = await admin
      .from("vehicle")
      .insert({ driver_id: driverId!, ...vehicleFields });
    if (vErr) redirect("/onboarding?error=db");
  } else {
    const { error: vErr } = await admin
      .from("vehicle")
      .update(vehicleFields)
      .eq("id", vehicle.id);
    if (vErr) redirect("/onboarding?error=db");
  }

  redirect("/pool");
}
