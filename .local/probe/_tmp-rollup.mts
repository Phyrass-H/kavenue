import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: o, error } = await db.rpc("admin_business_overview");
if (error) { console.log("OVERVIEW FAILED:", error.message); process.exit(1); }
console.log("── headline ──");
console.log(`  businesses ${o.businesses} · posted this month ${o.posted_this_month} · never posted ${o.never_posted} · median ${o.median_trips} over ${o.posting_businesses}`);
for (const dim of ["by_type", "by_region", "by_city"] as const) {
  console.log(`\n── ${dim} ──`);
  for (const r of o[dim]) console.log(`  ${String(r.key ?? "(null)").padEnd(12)} businesses=${r.businesses} trips=${r.trips} settled=${r.settled} filled=${r.filled} parent=${r.parent ?? "—"}`);
}
console.log("\n── page, unfiltered ──");
const { data: rows, error: e2 } = await db.rpc("admin_business_page", { p_limit: 10, p_offset: 0 });
if (e2) { console.log("PAGE FAILED:", e2.message); process.exit(1); }
for (const r of rows ?? []) console.log(`  ${r.name.padEnd(30)} ${String(r.business_type).padEnd(8)} ${String(r.city).padEnd(9)} trips=${String(r.trips).padStart(3)} unfilled=${String(r.unfilled).padStart(2)} total=${r.total_count}`);
console.log("\n── page, filtered to NICE ──");
const { data: nice } = await db.rpc("admin_business_page", { p_city: "NICE" });
for (const r of nice ?? []) console.log(`  ${r.name} · trips=${r.trips} · total_count=${r.total_count}`);
