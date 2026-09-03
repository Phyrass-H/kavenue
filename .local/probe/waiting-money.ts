// The full money on a waiting meter, at the proposed per-class rates.
import { commissionSplit, taxLineFor, driverKeeps, ratesFromRow } from "../../lib/commission.ts";
import { taxOf } from "../../lib/vat.ts";
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
console.log("rates:", JSON.stringify(rates), "transport VAT:", row.transport_vat_rate);
const MIN = 20;
for (const [cls, rate] of [["Eco", 0.5], ["Business", 0.75], ["First", 1.0]] as const) {
  const course = rate * MIN;
  const s = commissionSplit(course, rates);
  // S74 — ask for the LINE's treatment rather than reading a rate off the row.
  const supply = taxOf("transfer", row);
  const line = taxLineFor(s.course, supply);
  const tva = line.kind === "taxable" ? line.amount : 0;
  console.log(`\n${cls} — ${rate.toFixed(2)} €/min × ${MIN} min`);
  console.log(`  meter (course)        ${s.course.toFixed(2)}`);
  console.log(`  HOTEL pays            ${s.businessTotal.toFixed(2)}   (fee ${s.businessFeeHt.toFixed(2)} + VAT ${s.businessFeeVat.toFixed(2)})`);
  console.log(`  DRIVER banks          ${s.driverNet.toFixed(2)}   (commission ${s.driverFeeHt.toFixed(2)} + VAT ${s.driverFeeVat.toFixed(2)})`);
  console.log(`  KAVENUE keeps (HT)    ${(s.businessFeeHt + s.driverFeeHt).toFixed(2)}   VAT remitted ${(s.businessFeeVat + s.driverFeeVat).toFixed(2)}`);
  console.log(`  driver w/ VAT keeps   ${driverKeeps(s, supply).toFixed(2)}   (${supply.kind === "taxable" ? `transport VAT inside ${tva.toFixed(2)}` : supply.kind})`);
  console.log(`  franchise driver keeps ${s.driverNet.toFixed(2)}`);
  console.log(`  per minute: hotel ${(s.businessTotal / MIN).toFixed(2)} · driver ${(s.driverNet / MIN).toFixed(2)}`);
}
