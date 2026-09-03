// Read-only: which existing trips can actually show a Course-basis number to a Business?
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function main() {
  const { data, error } = await db.from("mission")
    .select("id,reference,status,pickup_at,ceiling,commission_business_rate");
  if (error) throw error;
  if (!data) throw new Error("reading the mission table returned neither rows nor an error");
  const rows = data;
  const charged = rows.filter((m) => m.commission_business_rate != null);
  const by = (f: (m: typeof rows[number]) => boolean) => charged.filter(f);
  const now = Date.now();
  const future = (m: typeof rows[number]) => new Date(m.pickup_at as string).getTime() > now;
  console.log(`missions total                     ${rows.length}`);
  console.log(`  never charged a fee (NULL rates) ${rows.length - charged.length}  -> Course == all-in, nothing to fix`);
  console.log(`  charged                          ${charged.length}`);
  console.log(`     drafts                        ${by((m) => m.status === "draft").length}`);
  console.log(`     pooled / accepted, upcoming   ${by((m) => ["pooled", "accepted"].includes(String(m.status)) && future(m)).length}`);
  console.log(`     in progress or done           ${by((m) => !["draft", "pooled", "accepted"].includes(String(m.status))).length}`);
  console.log("");
  for (const m of charged) console.log(`   ${m.reference}  ${String(m.status).padEnd(12)} ceiling(Course) ${m.ceiling}  -> all-in ${(Number(m.ceiling) * 1.15).toFixed(2)}`);
}
main();
