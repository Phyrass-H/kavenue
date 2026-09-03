import { commissionSplit, ratesFromRow } from "../../lib/commission.ts";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row } = await db.from("commission_rate").select("*")
  .lte("effective_from", new Date().toISOString()).order("effective_from", { ascending: false }).limit(1).maybeSingle();
const rates = ratesFromRow(row);
const show = (label: string, rate: number) => {
  console.log(`\n${label} — stored rate ${rate.toFixed(2)} €/min (the column is numeric(10,2))`);
  console.log(`  hotel sees per minute: ${commissionSplit(rate, rates).businessTotal.toFixed(2)}`);
  for (const m of [5, 10, 20, 40]) {
    const s = commissionSplit(rate * m, rates);
    console.log(`  ${String(m).padStart(2)} min → meter ${s.course.toFixed(2)} · hotel ${s.businessTotal.toFixed(2)} · driver ${s.driverNet.toFixed(2)}`);
  }
};
console.log("=== A. round on the DRIVER's side ===");
show("Eco", 0.5);
console.log("\n=== B. round on the HOTEL's side (0,50 all-in → stored 0,43) ===");
show("Eco", 0.43);
console.log(`\n  ⚑ 20 min at a headline of 0,50 €/min should bill 10,00 — it bills ${commissionSplit(0.43 * 20, rates).businessTotal.toFixed(2)}`);
