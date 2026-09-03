// The S64 curve demo trips are seeded with FIXED pickup times, so they age out and
// then trip handoff-check every session ("1 aged into the past"). This pushes any
// past one back into the future so the demo keeps working and the gate stays honest.
// Refresh rather than delete: the trips still demonstrate the §6 curve.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data } = await db.from("mission").select("id,status,pickup_at").eq("reference","S64CURVE");
let moved = 0;
for (const m of data ?? []) {
  if (Date.parse(m.pickup_at) > Date.now()) continue;
  const r = await db.from("mission").update({
    pickup_at: new Date(Date.now() + 72 * 3.6e6).toISOString(),
    status: "pooled", driver_id: null, accepted_at: null, confirmed_at: null,
    checked_in_at: null, accepted_fare: null, stops_reached: 0,
  }).eq("id", m.id).select("id,pickup_at,status").single();
  if (r.error) { console.log("ERR", r.error.message); continue; }
  console.log(`refreshed ${m.id.slice(0,8)}  ${m.status} -> ${r.data.status}  now T+72h`);
  moved++;
}
console.log(moved ? `${moved} refreshed` : "nothing to refresh — all three are still in the future");
