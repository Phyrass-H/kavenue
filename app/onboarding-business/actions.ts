"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusinessType } from "@/lib/business-type";

// Creates the Business + Dispatcher seat + profile(role=dispatcher) for the
// logged-in user. Service-role because profile/dispatcher/business have no
// INSERT RLS policy in beta — gated strictly to the current user's id.
export async function createBusinessProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businessName = String(formData.get("business_name") ?? "").trim();
  const contactName = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  // ⚑ THE TYPE IS PICKED HERE NOW, NOT TYPED, AND NOT IN SETTINGS. Sign-up is
  // the only screen every Business is guaranteed to see; the picker used to live
  // in Settings, which many never open, so enrolled Businesses had no category at
  // all. The old free-text `field_of_activity` is no longer written — see
  // docs/migrations/2026-08-30_business_type_and_register.sql.
  const typeRaw = String(formData.get("business_type") ?? "").trim();
  const businessType = isBusinessType(typeRaw) ? typeRaw : null;

  // Filled by the register lookup when it found the company; absent when they
  // typed everything by hand, which is the normal path in Monaco.
  const nafCode = String(formData.get("naf_code") ?? "").trim() || null;
  const siret = String(formData.get("siret") ?? "").trim() || null;
  const legalName = String(formData.get("legal_name") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const departement = String(formData.get("departement") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;

  // ⚑ A REFUSAL, NOT A SKIP. An unrecognised type is not saved as null and
  // quietly forgiven — the form comes back and asks again. [[d88]].
  if (!businessName || !contactName || !businessType) {
    redirect("/onboarding-business?error=missing");
  }

  const admin = createAdminClient();

  // Don't let a direct POST flip an existing driver into a dispatcher.
  const { data: existingProfile } = await admin
    .from("profile")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existingProfile && existingProfile.role !== "dispatcher") redirect("/");

  const { error: profileErr } = await admin
    .from("profile")
    .upsert(
      { auth_user_id: user.id, role: "dispatcher" },
      { onConflict: "auth_user_id" },
    );
  if (profileErr) redirect("/onboarding-business?error=db");

  // A dispatcher seat is unique per auth user — if it exists, we're done.
  const { data: existing } = await admin
    .from("dispatcher")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existing) redirect("/dispatch");

  const { data: business, error: bizErr } = await admin
    .from("business")
    .insert({
      name: businessName,
      business_type: businessType,
      // The official code is stored raw beside the answer, so a mapping changed
      // later is a re-map rather than a re-survey. Kept even when it disagrees
      // with what they picked — the disagreement is the interesting part.
      naf_code: nafCode,
      siret,
      legal_name: legalName,
      city,
      departement,
      region,
    })
    .select("id")
    .single();
  if (bizErr || !business) redirect("/onboarding-business?error=db");

  const { error: dispErr } = await admin.from("dispatcher").insert({
    business_id: business!.id,
    auth_user_id: user.id,
    name: contactName,
    email: user.email ?? null,
    phone: phone || null,
  });
  if (dispErr) redirect("/onboarding-business?error=db");

  redirect("/dispatch");
}
