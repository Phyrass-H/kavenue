import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const arg = process.argv[2];
if (arg === "--steal") {
  // Another Driver takes it between the render and the tap. This is the race the
  // page cannot prevent and the log should record.
  // ⚑ "another Driver" is resolved, not excluded by a literal id ([[d97]] / S69).
  // The id this used to exclude was deleted by the 2026-08-26 bleach, so the
  // .neq() had stopped excluding anything and could hand back the SAME Driver.
  const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
  const demoD = users.users.find((u) => u.email === "demo.driver@pickup.local");
  if (!demoD) throw new Error("demo.driver@pickup.local is not in auth.users — run .local/seed/seed-probe-accounts.mts");
  const { data: mine } = await db.from("driver").select("id").eq("auth_user_id", demoD.id).single();
  if (!mine) throw new Error(`no driver row for demo.driver@pickup.local (auth user ${demoD.id}) — run .local/seed/seed-probe-accounts.mts`);
  const other = await db.from("driver").select("id").neq("id", mine.id).limit(1).single();
  if (other.error) throw new Error(`no second Driver to take the trip from demo.driver@pickup.local: ${other.error.message} — the steal needs a fleet of at least two`);
  const r = await db.from("mission").update({ status:"confirmed", driver_id: other.data.id, accepted_at:new Date().toISOString(), confirmed_at:new Date().toISOString() }).eq("reference","S66RACE").select("id,status").single();
  if (r.error) throw new Error(`could not hand the S66RACE trip to driver ${other.data.id}: ${r.error.message} — seed one first by running this probe with no flag`);
  console.log("stolen:", `${r.data.id} -> ${r.data.status}`);
  process.exit(0);
}
const { data: tmpl } = await db.from("mission").select("*").eq("reference","S66EVENT").eq("status","pooled").limit(1).single();
const m: any = { ...tmpl }; delete m.id; delete m.created_at;
const r = await db.from("mission").insert({ ...m, reference:"S66RACE",
  status:"pooled", driver_id:null, accepted_at:null, confirmed_at:null, checked_in_at:null,
  accepted_fare:null, pooled_at:new Date().toISOString(),
  pickup_at: new Date(Date.now() + 9*3.6e6).toISOString(),   // far from the held trip: no slot conflict
}).select("id,pickup_at").single();
if (r.error) throw new Error(`could not seed the acceptable S66RACE trip: ${r.error.message}`);
if (!r.data) throw new Error("the insert reported no error and returned no row — nothing to accept");
console.log(`acceptable trip seeded ${r.data.id}`);
