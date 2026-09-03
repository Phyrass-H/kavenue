import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const M = ".local/probe/modal-trip.json";
if (process.argv.includes("--undo")) {
  const { id } = JSON.parse(fs.readFileSync(M,"utf8"));
  await db.from("status_event").delete().eq("mission_id", id);
  await db.from("mission").delete().eq("id", id);
  const { count } = await db.from("mission").select("*",{count:"exact",head:true});
  console.log("deleted", id, "| mission rows:", count);
  process.exit(0);
}
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
if (!users) throw new Error("auth.admin.listUsers returned no user list — is SUPABASE_SERVICE_ROLE_KEY the service-role key?");
const bizAuth = users.users.find((u)=>u.email==="demo.business@pickup.local");
if (!bizAuth) throw new Error("demo.business@pickup.local is missing — run npx tsx .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
if (!disp?.length) throw new Error(`no dispatcher row for auth user ${bizAuth.id} (demo.business@pickup.local) — run npx tsx .local/seed/seed-probe-accounts.mts`);
const d = disp[0];
const { data: drivers } = await db.from("driver").select("id").limit(1);
if (!drivers?.length) throw new Error("no driver rows at all — this trip needs one to be confirmed to");
const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", d.business_id).limit(1);
if (!tmplRows?.length) throw new Error(`no existing mission for business ${d.business_id} to copy as a row template — seed the dataset first`);
const tmpl = tmplRows[0];
const id = crypto.randomUUID();
fs.writeFileSync(M, JSON.stringify({ id }));
const now = Date.now();
const { error } = await db.from("mission").insert({
  ...tmpl, id, business_id: d.business_id, dispatcher_id: d.id, driver_id: drivers[0].id,
  status: "confirmed", reference: "STEPDEMO",
  pickup_address: "12 Promenade des Anglais, 06000 Nice", pickup_label: null, flight_number: null,
  guest_ready_at: null,
  pickup_at: new Date(now + 4.3*3_600_000).toISOString(),
  created_at: new Date(now - 86_400_000).toISOString(),
  accepted_at: new Date(now - 86_400_000).toISOString(),
  confirmed_at: new Date(now - 86_400_000).toISOString(),
  ceiling: 900, base_fare: null, pdp_start: 480, pdp_step: 5, pdp_interval: 10, speed_win: false,
  // ⚑ PINNED, NEVER INHERITED ([[d97]]). `tmpl` is a REAL mission and since the
  // S68 reseed real missions carry an `accepted_fare`. Spreading one in gives
  // every case a frozen price belonging to a different trip.
  accepted_fare: 480,
  pooled_at: null, cancelled_by: null, cancelled_at: null, cancellation_fee: null,
  cancellation_reason: null, no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, checked_in_at: null, stops_reached: 0,
  passenger_name: "Step demo", passenger_names: null,
});
if (error) { console.error(error.message); process.exit(1); }
console.log("created", id, "| pickup in 4h37 | fare 480");
