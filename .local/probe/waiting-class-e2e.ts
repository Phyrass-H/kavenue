// End-to-end proof that the meter is priced by class: one ECO trip sitting at 'arrived'
// with 17 minutes on the meter. Board the Guest in the app as the demo Driver, then run
// this again to read what SQL stamped. Expect waiting_rate 0.50 and waiting_fee 8.50
// (17 × 0,50), where the old flat rate would have stamped 1.00 / 17.00.
//   node .local/probe/waiting-class-e2e.ts          # create
//   node .local/probe/waiting-class-e2e.ts --check  # read what was stamped
//   node .local/probe/waiting-class-e2e.ts --undo   # remove, re-assert the baseline
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TAG = "S62WAIT";

if (process.argv.includes("--undo")) {
  const { data: rows } = await db.from("mission").select("id").eq("reference", TAG);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) {
    await db.from("status_event").delete().in("mission_id", ids);
    await db.from("mission").delete().in("id", ids);
  }
  const { count } = await db.from("mission").select("id", { count: "exact", head: true });
  console.log(`removed ${ids.length} ${TAG} · ${count} missions left`);
  process.exit(0);
}

if (process.argv.includes("--check")) {
  const { data } = await db.from("mission")
    .select("id,status,category,waiting_minutes,waiting_rate,waiting_fee").eq("reference", TAG);
  for (const m of data ?? []) {
    console.log(`status ${m.status} · class ${m.category}`);
    console.log(`  waiting_minutes ${m.waiting_minutes}`);
    console.log(`  waiting_rate    ${m.waiting_rate}   ← expect 0.50 (was 1.00 before the migration)`);
    console.log(`  waiting_fee     ${m.waiting_fee}   ← expect 8.50 (17 × 0,50; the flat rate gave 17.00)`);
  }
  process.exit(0);
}

const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const bizAuth = users.users.find((u) => u.email === "demo.business@pickup.local");
if (!bizAuth) throw new Error("demo.business@pickup.local is not in auth.users — run .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
const d = disp?.[0];
if (!d) throw new Error(`no dispatcher row for demo.business@pickup.local (auth user ${bizAuth.id}) — run .local/seed/seed-probe-accounts.mts`);
const drvAuth = users.users.find((u) => u.email === "demo.driver@pickup.local");
if (!drvAuth) throw new Error("demo.driver@pickup.local is not in auth.users — run .local/seed/seed-probe-accounts.mts");
const { data: drv } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.id).limit(1);
if (!drv?.length) throw new Error(`no driver row for demo.driver@pickup.local (auth user ${drvAuth.id}) — run .local/seed/seed-probe-accounts.mts`);
const { data: t } = await db.from("mission").select("*").eq("business_id", d.business_id).limit(1);
// ⚑ An empty array here would spread `undefined` and insert a trip carrying only the
// columns set below — the row goes in WRONG rather than failing, and the meter it
// stamps is then measuring a mission this probe invented.
if (!t?.length) throw new Error(`Business ${d.business_id} has no mission to copy — this probe clones a real row for every column it does not set itself`);
const id = crypto.randomUUID();
const now = Date.now();
const { error } = await db.from("mission").insert({
  ...t[0], id, business_id: d.business_id, dispatcher_id: d.id, driver_id: drv[0].id,
  status: "arrived", reference: TAG,
  category: "eco", required_body_type: null,
  pickup_address: "12 Promenade des Anglais, 06000 Nice", pickup_label: null, flight_number: null,
  guest_ready_at: null,
  pickup_at: new Date(now - 37 * 60_000).toISOString(),
  created_at: new Date(now - 86_400_000).toISOString(),
  accepted_at: new Date(now - 86_400_000).toISOString(),
  confirmed_at: new Date(now - 86_400_000).toISOString(),
  ceiling: 60, base_fare: null, pdp_start: 30, pdp_step: 3, pdp_interval: 10, speed_win: false,
  pooled_at: null, cancelled_by: null, cancelled_at: null, cancellation_fee: null,
  cancellation_reason: null, no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, checked_in_at: null, stops_reached: 0,
  passenger_name: "Waiting class check", passenger_names: null,
});
if (error) { console.error(error.message); process.exit(1); }
await db.from("status_event").insert({ mission_id: id, status: "arrived" });
console.log(`created ${TAG} ${id} — Eco, arrived, 17 min on the meter`);
console.log("now board the Guest in the app as the demo Driver, then: --check");
