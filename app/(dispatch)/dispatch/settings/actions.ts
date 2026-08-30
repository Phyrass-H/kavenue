"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBusinessType } from "@/lib/business-type";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLatLng } from "@/lib/geo";

// Business + dispatcher have no UPDATE RLS policy, so every save here goes through
// the service role — but ONLY after resolving the current user's own dispatcher
// seat (and its business) under their session. Each section saves independently;
// the section key is echoed back in the redirect so the settings UI re-opens it.

const VEHICLE_CATEGORIES = ["eco", "business", "luxury"];

function clean(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function num(v: FormDataEntryValue | null): number | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function currentSeat() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: dispatcher } = await admin
    .from("dispatcher")
    .select("id, business_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dispatcher) redirect("/onboarding-business");
  return { admin, dispatcher };
}

const back = (section: string, q = "ok=1") => `/dispatch/settings?${q}&s=${section}`;

// ---- Company identity ----
export async function updateCompany(formData: FormData) {
  const { admin, dispatcher } = await currentSeat();
  const name = clean(formData.get("business_name"));
  if (!name) redirect(back("company", "error=missing"));
  const typeRaw = clean(formData.get("business_type"));
  const { error } = await admin
    .from("business")
    .update({
      name,
      business_type: isBusinessType(typeRaw) ? typeRaw : null,
      legal_name: clean(formData.get("legal_name")) || null,
      siret: clean(formData.get("siret")) || null,
      vat_number: clean(formData.get("vat_number")) || null,
      registered_address: clean(formData.get("registered_address")) || null,
    })
    .eq("id", dispatcher.business_id);
  if (error) redirect(back("company", "error=db"));
  redirect(back("company"));
}

// ---- Contact (Dispatcher seat + reception) ----
export async function updateContact(formData: FormData) {
  const { admin, dispatcher } = await currentSeat();
  const contactName = clean(formData.get("contact_name"));
  if (!contactName) redirect(back("contact", "error=missing"));
  const { error: dErr } = await admin
    .from("dispatcher")
    .update({ name: contactName, phone: clean(formData.get("phone")) || null })
    .eq("id", dispatcher.id);
  if (dErr) redirect(back("contact", "error=db"));
  const { error: bErr } = await admin
    .from("business")
    .update({ reception_phone: clean(formData.get("reception_phone")) || null })
    .eq("id", dispatcher.business_id);
  if (bErr) redirect(back("contact", "error=db"));
  redirect(back("contact"));
}

// ---- Booking defaults (the Business's saved address + pre-fill toggle) ----
export async function updateBookingDefaults(formData: FormData) {
  const { admin, dispatcher } = await currentSeat();
  const lat = num(formData.get("business_address_lat"));
  const lng = num(formData.get("business_address_lng"));
  const located = lat != null && lng != null && isValidLatLng(lat, lng);
  const catRaw = clean(formData.get("default_vehicle_category"));
  const { error } = await admin
    .from("business")
    .update({
      business_address: clean(formData.get("business_address")) || null,
      business_address_lat: located ? lat : null,
      business_address_lng: located ? lng : null,
      business_address_label: clean(formData.get("business_address_label")) || null,
      prefill_pickup: formData.get("prefill_pickup") === "on",
      default_vehicle_category: VEHICLE_CATEGORIES.includes(catRaw) ? catRaw : null,
    })
    .eq("id", dispatcher.business_id);
  if (error) redirect(back("booking", "error=db"));
  redirect(back("booking"));
}

// ---- Billing email (Stripe itself is deferred) ----
export async function updateBillingEmail(formData: FormData) {
  const { admin, dispatcher } = await currentSeat();
  const { error } = await admin
    .from("business")
    .update({ billing_email: clean(formData.get("billing_email")) || null })
    .eq("id", dispatcher.business_id);
  if (error) redirect(back("billing", "error=db"));
  redirect(back("billing"));
}
