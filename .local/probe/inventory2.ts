import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const manifest = JSON.parse(fs.readFileSync(".local/seed/seed-manifest.json", "utf8"));
const seeded = new Set<string>(manifest.missions.map((m: any) => m.id ?? m));

const { data: all, error } = await db.from("mission")
  .select("id,status,no_show,business_id,driver_id,accepted_at,pickup_at,cancellation_fee,waiting_fee,created_at");
if (error) throw error;
const real = (all ?? []).filter((m) => !seeded.has(m.id));
console.log("missions: total", all?.length, "| seeded", (all?.length ?? 0) - real.length, "| REAL", real.length);

const byStatus: Record<string, number> = {};
for (const m of real) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
console.log("real missions by status:", byStatus);
console.log("real with a driver ever accepted:", real.filter((m) => m.accepted_at).length);
console.log("real cancelled/no_show:", real.filter((m) => m.status === "cancelled" || m.no_show).length);
console.log("real business ids:", [...new Set(real.map((m) => m.business_id))].length);

for (const t of ["mission_cancellation", "mission_release", "mission_amendment", "status_event"]) {
  const { count, error: e } = await db.from(t).select("*", { count: "exact", head: true });
  console.log(`${t}: ${e ? "ERR " + e.message : count + " rows"}`);
}
