import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const M = ".local/probe/arrived.json";
if (process.argv.includes("--undo")) {
  const { id } = JSON.parse(fs.readFileSync(M,"utf8"));
  await db.from("status_event").delete().eq("mission_id", id);
  await db.from("mission").delete().eq("id", id);
  const { count } = await db.from("mission").select("*",{count:"exact",head:true});
  console.log("deleted", id, "| mission rows:", count);
  process.exit(0);
}
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
if (!users) throw new Error("listUsers returned nothing — is SUPABASE_SERVICE_ROLE_KEY the service-role key?");
const bizAuth = users.users.find((u)=>u.email==="demo.business@pickup.local");
if (!bizAuth) throw new Error("demo.business@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
if (!disp?.length) throw new Error("demo.business@pickup.local signs in, but its Business has no Dispatcher — run .local/seed/seed-probe-accounts.mts");
const d = disp[0];
const drvAuth = users.users.find((u)=>u.email==="demo.driver@pickup.local");
if (!drvAuth) throw new Error("demo.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: drv } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.id).limit(1);
if (!drv?.length) throw new Error("demo.driver@pickup.local signs in, but has no `driver` row — run .local/seed/seed-probe-accounts.mts");
// ⚑ The template row, not a fixture: every column below is copied off it, so an
// empty result would insert a mission with no category, no price and no zone.
const { data: t } = await db.from("mission").select("*").eq("business_id", d.business_id).limit(1);
if (!t?.length) throw new Error(`business ${d.business_id} has no mission to copy as the template`);
const id = crypto.randomUUID();
fs.writeFileSync(M, JSON.stringify({ id }));
const now = Date.now();
// city pickup, Guest due 37 min ago → 20 min courtesy elapsed → 17 min on the meter
const { error } = await db.from("mission").insert({
  ...t[0], id, business_id: d.business_id, dispatcher_id: d.id, driver_id: drv[0].id,
  status: "arrived", reference: "WAITCANCEL",
  pickup_address: "12 Promenade des Anglais, 06000 Nice", pickup_label: null, flight_number: null,
  guest_ready_at: null,
  pickup_at: new Date(now - 37*60_000).toISOString(),
  created_at: new Date(now - 86_400_000).toISOString(),
  accepted_at: new Date(now - 86_400_000).toISOString(),
  confirmed_at: new Date(now - 86_400_000).toISOString(),
  ceiling: 200, base_fare: null, pdp_start: 50.52, pdp_step: 5, pdp_interval: 10, speed_win: false,
  pooled_at: null, cancelled_by: null, cancelled_at: null, cancellation_fee: null,
  cancellation_reason: null, no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, checked_in_at: null, stops_reached: 0,
  passenger_name: "Waiting cancel demo", passenger_names: null,
});
if (error) { console.error(error.message); process.exit(1); }
await db.from("status_event").insert({ mission_id: id, status: "arrived" });
console.log("created", id, "| fare 50,52 · 100% = 50,52 + 17 waiting = 67,52 expected");
