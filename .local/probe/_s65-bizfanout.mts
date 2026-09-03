import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const PAST = ["completed","cancelled"];

// 1. total Businesses on the platform = the hard ceiling on ids.length
const biz = await db.from("business").select("id", { count: "exact", head: true });
console.log("TOTAL businesses on platform:", biz.count, "| err:", biz.error?.message ?? "none");

// 2. per-Driver: archived missions, and DISTINCT businesses in that archive
const drivers = await db.from("driver").select("id, first_name, last_name");
console.log("TOTAL drivers:", drivers.data?.length, "| err:", drivers.error?.message ?? "none");

for (const d of drivers.data ?? []) {
  const m = await db.from("mission").select("business_id").eq("driver_id", d.id).in("status", PAST);
  const c = await db.from("mission_cancellation").select("mission_id").eq("actor_driver_id", d.id).eq("kind","driver_cancel");
  const r = await db.from("mission_release").select("mission_id").eq("driver_id", d.id).eq("status","accepted");
  const distinct = new Set((m.data ?? []).map((x) => x.business_id));
  console.log(
    `${d.first_name} ${d.last_name}`.padEnd(22),
    "archived:", String(m.data?.length ?? 0).padStart(3),
    "| DISTINCT businesses (ids.length):", String(distinct.size).padStart(3),
    "| cancels:", c.data?.length ?? 0,
    "| releases:", r.data?.length ?? 0,
  );
}

// 3. the side tables the events come from
const mc = await db.from("mission_cancellation").select("id", { count: "exact", head: true });
const mr = await db.from("mission_release").select("id", { count: "exact", head: true });
console.log("mission_cancellation rows:", mc.count, "| mission_release rows:", mr.count);
