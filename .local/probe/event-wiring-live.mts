import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const TAG = "S66EVENT";

if (process.argv.includes("--check")) {
  const { data: ms } = await db.from("mission").select("id").eq("reference", TAG);
  for (const m of ms ?? []) {
    const { data: ev } = await db.from("mission_event").select("event_type,source,actor_kind,payload,occurred_at").eq("mission_id", m.id).order("seq");
    const { data: mm } = await db.from("mission").select("status,checked_in_at").eq("id", m.id).single();
    console.log(m.id.slice(0,8), mm?.status, "checked_in_at:", mm?.checked_in_at ?? "null");
    for (const e of ev ?? []) console.log("   ", String(e.event_type).padEnd(18), String(e.source).padEnd(14), String(e.actor_kind).padEnd(11), JSON.stringify(e.payload));
  }
  process.exit(0);
}
if (process.argv.includes("--undo")) {
  const { data: ms } = await db.from("mission").select("id").eq("reference", TAG);
  for (const m of ms ?? []) {
    await db.from("mission_event").delete().eq("mission_id", m.id);
    await db.from("status_event").delete().eq("mission_id", m.id);
    await db.from("mission_cancellation").delete().eq("mission_id", m.id);
  }
  const r = await db.from("mission").delete().eq("reference", TAG).select("id");
  console.log("removed", r.data?.length ?? 0);
  process.exit(0);
}

const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
if (!users) throw new Error("auth.admin.listUsers came back empty — check SUPABASE_SERVICE_ROLE_KEY in .env.local");
const demoD = users.users.find((u)=>u.email==="demo.driver@pickup.local");
if (!demoD) throw new Error("demo.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: drv } = await db.from("driver").select("id,first_name,last_name").eq("auth_user_id", demoD.id).single();
if (!drv) throw new Error(`no driver row for demo.driver@pickup.local (auth user ${demoD.id}) — run .local/seed/seed-probe-accounts.mts`);
const demoB = users.users.find((u)=>u.email==="demo.business@pickup.local");
if (!demoB) throw new Error("demo.business@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("business_id").eq("auth_user_id", demoB.id).single();
if (!disp) throw new Error(`no dispatcher row for demo.business@pickup.local (auth user ${demoB.id}) — run .local/seed/seed-probe-accounts.mts`);
const { data: tmpl } = await db.from("mission").select("*").eq("business_id", disp.business_id).eq("category","business").limit(1).single();
console.log("demo driver:", drv.first_name, drv.last_name, drv.id.slice(0,8));

// ⚑ `accepted_fare` is stripped, never inherited ([[d97]]). `tmpl` is a REAL
// mission and since the S68 reseed real missions carry a frozen price that
// belongs to a different trip.
const m: any = { ...tmpl, accepted_fare: null }; delete m.id; delete m.created_at;
const r = await db.from("mission").insert({ ...m,
  business_id: disp.business_id, reference: TAG,
  pickup_at: new Date(Date.now() + 2.5*3.6e6).toISOString(),
  status: "confirmed", driver_id: drv.id,
  accepted_at: new Date(Date.now()-3.6e6).toISOString(),
  confirmed_at: new Date(Date.now()-3.6e6).toISOString(),
  checked_in_at: null, no_show:false, close_answer:null, stops_reached:0,
  cancelled_at:null, cancelled_by:null, waiting_from:null, waiting_to:null, waiting_minutes:null,
}).select("id,pickup_at").single();
if (r.error) { console.log("ERR", r.error.message); process.exit(1); }
console.log("seeded T-2.5h confirmed, not checked in:", r.data.id);
