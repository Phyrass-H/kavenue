import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const total = await db.from("mission").select("id",{count:"exact",head:true});
console.log("mission count now:", total.count, "(was 280)");
const { data } = await db.from("mission")
  .select("id,status,ceiling,pdp_start,distance_km,duration_min,pickup_at,dropoff_address")
  .gte("pickup_at","2026-09-05T00:00:00Z").lte("pickup_at","2026-09-06T00:00:00Z");
console.log("trips on 5 Sept:", data?.length ?? 0);
for (const m of data ?? []) {
  console.log("  ", m.id, m.status, "·", m.distance_km, "km /", m.duration_min, "min · ceiling", m.ceiling, "· pdp_start", m.pdp_start);
  console.log("     →", m.dropoff_address, "· pickup", m.pickup_at);
}
