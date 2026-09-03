// ⚑ CALLS THE `*_call` WRAPPERS. 2026-08-31g closed the raw SECURITY DEFINER functions to
// browser sessions (a composite return bypasses column privileges, so `returns mission` was
// handing a Driver the Ceiling). A probe on the old names gets 42501 and reads like an
// outage; it is the wall. The service role still reaches the inner names, so only the
// `asDriver` calls move.
// Does accept_mission really clamp with a LOOSER floor than the cancel RPCs?
//
// Written 2026-08-26 (S69) because the claim was about to go into BACKLOG § H2
// on the strength of READING two migration files — the exact move that produced
// the day's false alarm ([[d97]]). A migration file is a claim about the
// database, not the database.
//
//   npx tsx .local/probe/accept-floor.mts
//
// Creates ONE tagged mission, drives it through the real accept_mission, reads
// the stamped accepted_fare back, and deletes it by recorded id.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const TAG = "AFLOOR";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); };

const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
if (!users) throw new Error("auth.admin.listUsers returned no data — is SUPABASE_SERVICE_ROLE_KEY the service role key?");
const bizAuth = users.users.find((u) => u.email === "demo.business@pickup.local");
const drvAuth = users.users.find((u) => u.email === "demo.driver@pickup.local");
if (!bizAuth || !drvAuth) throw new Error("probe accounts missing — run .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", drvAuth ? bizAuth.id : bizAuth.id).limit(1);
const dispatcher = disp?.[0];
if (!dispatcher) throw new Error(`no dispatcher row for demo.business@pickup.local (auth_user_id ${bizAuth.id}) — run .local/seed/seed-probe-accounts.mts`);
const { data: dRows } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.id).limit(1);
const driver = dRows?.[0];
if (!driver) throw new Error(`no driver row for demo.driver@pickup.local (auth_user_id ${drvAuth.id}) — run .local/seed/seed-probe-accounts.mts`);
const { data: vRows } = await db.from("vehicle").select("category,body_type").eq("driver_id", driver.id).limit(1);
const car = vRows?.[0];
if (!car) throw new Error(`driver ${driver.id} has no vehicle — this probe copies the category off one to build a matching trip`);
const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", dispatcher.business_id).limit(1);
const tmpl = tmplRows?.[0];
if (!tmpl) throw new Error(`business ${dispatcher.business_id} has no mission to copy as the template row — seed one with GET /api/seed`);

const baseline = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;

// SPEED WIN, Ceiling 100, stored floor 30. mission_opening_price should read 70.
const id = crypto.randomUUID();
const row = {
  ...tmpl, id,
  business_id: dispatcher.business_id, dispatcher_id: dispatcher.id,
  driver_id: null, status: "pooled", reference: TAG,
  category: car.category, required_body_type: null, luggage_only: false,
  pickup_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
  pooled_at: new Date(Date.now() - 3_600_000).toISOString(),
  accepted_at: null, confirmed_at: null, checked_in_at: null,
  ceiling: 100, base_fare: null, pdp_start: 30, pdp_step: 0, pdp_interval: 0,
  speed_win: true,
  // ⚑ Pinned explicitly. Never inherit a money column from the template ([[d97]]).
  accepted_fare: null,
  cancelled_by: null, cancelled_at: null, cancellation_fee: null, cancellation_reason: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, stops_reached: 0, passenger_name: `${TAG} probe`, passenger_names: null,
};
const { error: insErr } = await db.from("mission").insert(row);
if (insErr) throw new Error(`insert: ${insErr.message}`);

try {
  const { data: m } = await db.from("mission").select("*").eq("id", id).single();
  const { data: opening, error: opErr } = await db.rpc("mission_opening_price", { p_mission: m });
  if (opErr) throw new Error(`mission_opening_price: ${opErr.message}`);
  t("the cancel RPCs' floor on this trip is 70 (SPEED WIN, 70% of the Ceiling)", Number(opening) === 70, `mission_opening_price = ${opening}`);

  const asDriver = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: sErr } = await asDriver.auth.signInWithPassword({ email: "demo.driver@pickup.local", password: DEV_PASSWORD });
  if (sErr) throw new Error(`sign-in: ${sErr.message}`);

  // 30 is below the cancel floor of 70, and equal to the stored pdp_start.
  const { error: aErr } = await asDriver.rpc("accept_mission_call", { p_mission_id: id, p_fare: 30 });
  t("accept_mission accepted the trip", !aErr, aErr?.message ?? "");

  const { data: after } = await db.from("mission").select("accepted_fare,status").eq("id", id).single();
  if (!after) throw new Error(`mission ${id} could not be read back after the accept — nothing to compare`);
  const stamped = Number(after.accepted_fare);
  console.log(`\n  stamped accepted_fare = ${stamped} · the cancel basis would clamp to ${opening}`);
  t("⚑ THE RESIDUAL IS REAL: accept stamps BELOW the floor a cancellation would clamp to",
    stamped < Number(opening), `${stamped} < ${opening}`);
  t("...so a later cancellation would charge on 70, not on the 30 that was agreed",
    stamped === 30, `stamped ${stamped}`);
} finally {
  await db.from("status_event").delete().eq("mission_id", id);
  await db.from("mission_event").delete().eq("mission_id", id);
  const { error: dErr } = await db.from("mission").delete().eq("id", id);
  if (dErr) console.error(`CLEANUP FAILED for ${id}: ${dErr.message}`);
  const { count } = await db.from("mission").select("*", { count: "exact", head: true });
  t("baseline restored", count === baseline, `${count} vs ${baseline}`);
  const { count: strays } = await db.from("mission").select("*", { count: "exact", head: true }).eq("reference", TAG);
  t("no tagged stragglers", (strays ?? 0) === 0, `${strays} left`);
}

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
