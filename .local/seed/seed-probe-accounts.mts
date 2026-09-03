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

async function makeDriver(email: string, first: string, last: string, base: keyof typeof BASES, radius: number) {
  const uid = await user(email, "driver");
  const { data: existing } = await db.from("driver").select("id").eq("auth_user_id", uid).maybeSingle();
  if (existing) { console.log(`  ${email} — already a Driver`); return existing.id; }
  const p = BASES[base];
  const { data: d, error } = await db.from("driver").insert({
    auth_user_id: uid, first_name: first, last_name: last, email,
    phone: "+33 6 00 00 00 00", verified: true,
    base_lat: p.lat, base_lng: p.lng, base_label: p.label, service_radius_km: radius,
    accepts_luggage_runs: true,
    operational_zones: ["Nice", "Cannes", "Antibes", "Monaco"],
    languages: ["fr", "en"],
    siret: "51234567800011",
  }).select("id").single();
  if (error) throw new Error(`driver ${email}: ${error.message}`);
  // ⚑ Business/sedan on purpose: it is the class most seeded trips ask for, so
  // a probe that posts a trip and accepts it does not have to think about tiers.
  const { error: vErr } = await db.from("vehicle").insert({
    driver_id: d.id, category: "business", body_type: "sedan",
    make: "Mercedes", model: "Classe E", colour: "Noir",
    plate: email.startsWith("demo") ? "ZZ-001-ZZ" : "ZZ-002-ZZ", seats: 4, is_active: true,
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
