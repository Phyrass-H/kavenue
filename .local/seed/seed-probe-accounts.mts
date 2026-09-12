// S68 — the three accounts the live probes sign in as.
//
// ⚑ WHY THEY EXIST AS PART OF THE FLEET, NOT AS A FIXTURE. Fifteen probes in
// `.local/probe/` sign in as `demo.driver@pickup.local` and
// `demo.business@pickup.local` with the dev password, and drive the real RPCs as
// those users — accept_mission, the cancel doors, the reclaim, board_guest. The
// bleach deleted them, and every one of those probes died at the sign-in.
//
// The choice was to edit fifteen files or to put the accounts back. Putting them
// back is better: they are a Driver with a car and a Dispatcher at a real hotel,
// indistinguishable from the rest of the seeded fleet, so nothing about the
// dataset has to know they are special. A second Driver, `s46.driver`, exists
// because migrations-2026-08-10 needs TWO Drivers to hand a trip between.
//
//   npx tsx .local/seed/seed-probe-accounts.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { BASES } from "./riviera.mts";
import { canonicalMake } from "../../lib/vehicle-catalog.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ⚑ The password the probes hard-code, and the same one /api/dev-login uses.
// Changing it here breaks fifteen probes and the local sign-in shortcut at once.
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");

async function user(email: string, role: "driver" | "dispatcher"): Promise<string> {
  const { data: existing } = await db.auth.admin.listUsers({ perPage: 500 });
  const found = existing?.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (found) {
    // Re-assert the password: a user may survive a partial bleach with an
    // unknown one, and a probe cannot tell that apart from a missing account.
    await db.auth.admin.updateUserById(found.id, { password: DEV_PASSWORD });
    await db.from("profile").upsert({ auth_user_id: found.id, role });
    return found.id;
  }
  const { data, error } = await db.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`${email}: ${error?.message}`);
  const { error: pErr } = await db.from("profile").upsert({ auth_user_id: data.user.id, role });
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`);
  return data.user.id;
}

/** ⚑ S78 — EVERY IDENTITY VALUE IS DERIVED FROM THE EMAIL, and that is not tidiness.
 *  This seed wrote one hard-coded phone, SIRET, REVTC and card number onto every probe
 *  Driver, so two accounts shared all four — and "never twice" (the founder, 2026-09-12:
 *  *"if infos is used twice the system should tell them … never twice"*) could not be turned
 *  on until they were unique. A seed that writes values the app would refuse is a seed that
 *  undoes the rules, the same way re-seeding Théo undid `canonicalMake` in S77. */
function fixtures(email: string) {
  const n = email.startsWith("demo") ? 1 : 2;
  return {
    phone: `+33 6 00 00 00 0${n}`,
    siret: `5123456780001${n}`,
    revtc: `EVTC0621002${n}`,
    proCard: `06-2024-0041${n}`,
    plate: `ZZ-00${n}-ZZ`,
  };
}

async function makeDriver(email: string, first: string, last: string, base: keyof typeof BASES, radius: number) {
  const uid = await user(email, "driver");
  const { data: existing } = await db.from("driver").select("id").eq("auth_user_id", uid).maybeSingle();
  if (existing) {
    // ⚑ IT REPAIRS, IT DOES NOT SKIP. This used to return on sight of an existing row, so the
    //   duplicated fixtures it had already written stayed duplicated for ever — and the
    //   "never twice" indexes could not be created over them. A seed must be able to restate
    //   the state it describes, or it is a one-shot script wearing a seed's name.
    const f = fixtures(email);
    const { error: uErr } = await db.from("driver").update({
      phone: f.phone, siret: f.siret, revtc_number: f.revtc, pro_card_number: f.proCard,
      last_written_via: "seed",
    }).eq("id", existing.id);
    if (uErr) throw new Error(`driver ${email}: ${uErr.message}`);
    // Their car too: a probe Driver accepts trips, and since S78 that needs an approved car.
    const { error: vErr } = await db.from("vehicle").update({
      plate: f.plate, approval_status: "approved", last_written_via: "seed",
    }).eq("driver_id", existing.id).is("retired_at", null);
    if (vErr) throw new Error(`vehicle ${email}: ${vErr.message}`);
    console.log(`  ${email} — Driver kept, fixtures restated (${f.plate})`);
    return existing.id;
  }
  const p = BASES[base];
  const f = fixtures(email);
  const { data: d, error } = await db.from("driver").insert({
    auth_user_id: uid, first_name: first, last_name: last, email,
    phone: f.phone, verified: true,
    base_lat: p.lat, base_lng: p.lng, base_label: p.label, service_radius_km: radius,
    accepts_luggage_runs: true,
    operational_zones: ["Nice", "Cannes", "Antibes", "Monaco"],
    languages: ["fr", "en"],
    siret: f.siret, revtc_number: f.revtc, pro_card_number: f.proCard,
    last_written_via: "seed",
  }).select("id").single();
  if (error) throw new Error(`driver ${email}: ${error.message}`);
  // ⚑ Business/sedan on purpose: it is the class most seeded trips ask for, so
  // a probe that posts a trip and accepts it does not have to think about tiers.
  const { error: vErr } = await db.from("vehicle").insert({
    driver_id: d.id, category: "business", body_type: "sedan",
    make: canonicalMake("Mercedes"), model: "Classe E", colour: "noir", energy: "hybride_rechargeable", first_registration_date: "2022-04-11", 
    plate: f.plate, seats: 4, is_active: true,
    // ⚑ A PROBE DRIVER'S CAR IS APPROVED, because the probes it exists for accept trips, and
    //   since S78 an unapproved car cannot. Real enrollment never sets this — only a person
    //   does, through /admin/drivers/[id].
    approval_status: "approved", approved_at: new Date().toISOString(),
    last_written_via: "seed",
  });
  if (vErr) throw new Error(`vehicle ${email}: ${vErr.message}`);
  console.log(`  ${email} — Driver, business/sedan, ${p.label} ${radius} km`);
  return d.id;
}

console.log("── probe accounts ──");
await makeDriver("demo.driver@pickup.local", "Demo", "Driver", "nice", 65);
await makeDriver("s46.driver@pickup.local", "Second", "Driver", "cannes", 65);

const uid = await user("demo.business@pickup.local", "dispatcher");
const { data: hasDesk } = await db.from("dispatcher").select("id").eq("auth_user_id", uid).maybeSingle();
if (hasDesk) {
  console.log("  demo.business@pickup.local — already a Dispatcher");
} else {
  const { data: biz } = await db.from("business").select("id, name").eq("name", "Hôtel Majestic Cannes").single();
  if (!biz) throw new Error("no Business named Hôtel Majestic Cannes — seed the Businesses first");
  const { error } = await db.from("dispatcher").insert({
    business_id: biz.id, auth_user_id: uid,
    name: "Demo Desk", email: "demo.business@pickup.local", phone: "+33 4 00 00 00 00",
  });
  if (error) throw new Error(`dispatcher: ${error.message}`);
  console.log(`  demo.business@pickup.local — Dispatcher at ${biz.name}`);
}

console.log("\nThe live probes can sign in again.");
