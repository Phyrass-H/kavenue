// Read-only: how many missions would hit the NULL-VAT branch on a Driver's card?
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function main() {
const { data, error } = await db.from("mission")
  .select("id,reference,status,driver_id,commission_driver_rate,transport_vat_rate");
if (error) throw error;
if (!data) throw new Error("the mission read returned no error and no rows — there is nothing to count, so every total below would be a meaningless 0");
const rows = data;
const charged = rows.filter((m) => m.commission_driver_rate != null);
const held = charged.filter((m) => m.driver_id != null);
const nullVat = held.filter((m) => m.transport_vat_rate == null);
const zeroVat = held.filter((m) => Number(m.transport_vat_rate) === 0);
const posVat = held.filter((m) => Number(m.transport_vat_rate) > 0);
console.log(`missions total            ${rows.length}`);
console.log(`charged (rates set)       ${charged.length}`);
console.log(`  ...with a Driver        ${held.length}`);
console.log(`     VAT rate NULL        ${nullVat.length}   <- sentence now hidden`);
console.log(`     VAT rate 0           ${zeroVat.length}   <- "You charge no VAT"`);
console.log(`     VAT rate > 0         ${posVat.length}   <- collect/declare sentence`);
if (nullVat.length) console.log(nullVat.map((m) => `   ${m.reference} ${m.status}`).join("\n"));
}
main();
