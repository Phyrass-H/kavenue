import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const M = ".local/probe/wait-archive.json";
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
const drvAuth = users.users.find((u)=>u.email==="demo.driver@pickup.local");
if (!drvAuth) throw new Error("demo.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
const { data: drv, error: de } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.id).limit(1);
if (de) throw de;
if (!drv?.length) throw new Error("demo.driver@pickup.local signs in, but has no `driver` row — run .local/seed/seed-probe-accounts.mts");
if (!disp?.length) throw new Error("demo.business@pickup.local signs in, but its Business has no Dispatcher — run .local/seed/seed-probe-accounts.mts");
const d = disp[0];
// ⚑ The template row, not a fixture: every column below is copied off it, so an
// empty result would insert a mission with no category, no price and no zone.
const { data: t } = await db.from("mission").select("*").eq("business_id", d.business_id).limit(1);
if (!t?.length) throw new Error(`business ${d.business_id} has no mission to copy as the template`);
const id = crypto.randomUUID();
fs.writeFileSync(M, JSON.stringify({ id }));
const now = Date.now();
const { error } = await db.from("mission").insert({
  ...t[0], id, business_id: d.business_id, dispatcher_id: d.id, driver_id: drv[0].id,
  status: "completed", reference: "WAITDEMO",
  pickup_address: "12 Promenade des Anglais, 06000 Nice", pickup_label: null, flight_number: null,
  guest_ready_at: null,
  pickup_at: new Date(now - 3*86_400_000).toISOString(),
  created_at: new Date(now - 4*86_400_000).toISOString(),
  accepted_at: new Date(now - 4*86_400_000).toISOString(),
  confirmed_at: new Date(now - 4*86_400_000).toISOString(),
  ceiling: 200, base_fare: null, pdp_start: 60, pdp_step: 5, pdp_interval: 10, speed_win: false,
  pooled_at: null, cancelled_by: null, cancelled_at: null, cancellation_fee: null,
  cancellation_reason: null, no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: new Date(now - 3*86_400_000 + 20*60_000).toISOString(),
  waiting_to: new Date(now - 3*86_400_000 + 60*60_000).toISOString(),
  waiting_minutes: 40, waiting_rate: 1, waiting_fee: 40,
  info_edited_at: null, checked_in_at: null, stops_reached: 0,
  passenger_name: "Waiting demo", passenger_names: null,
});
if (error) { console.error(error.message); process.exit(1); }
console.log("created", id, "| fare 60 + 40 waiting = 100 expected");
