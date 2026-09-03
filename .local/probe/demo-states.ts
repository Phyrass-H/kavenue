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
    .select("id,reference,status,pickup_at,ceiling,driver_id,commission_business_rate")
    .eq("reference", "S61DEMO");
  if (error) throw error;
  if (!data) throw new Error("the S61DEMO mission query returned neither rows nor an error");
  const now = Date.now();
  for (const m of data) {
    const h = (new Date(m.pickup_at as string).getTime() - now) / 3.6e6;
    console.log(`${String(m.status).padEnd(10)} driver=${m.driver_id ? "yes" : "no "} T${h >= 0 ? "+" : ""}${h.toFixed(1)}h  course ${m.ceiling}  allin ${(Number(m.ceiling)*1.15).toFixed(2)}  ${m.id}`);
  }
}
main();
