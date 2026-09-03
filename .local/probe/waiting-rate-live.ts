// Does the LIVE mission_waiting() now price by class? Read-only: creates nothing,
// settles nothing. Calls the function through a tiny read-only RPC-free path by
// asking PostgREST for a view... which it cannot do, so instead we prove it the way
// the app will: create one trip per class, ask the function via a settlement-free
// SELECT, then remove them.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("mission")
  .select("id,reference,category,waiting_rate,waiting_fee,waiting_minutes")
  .not("waiting_fee", "is", null);
if (error) throw error;
if (!data) throw new Error("the settled-waiting query returned neither rows nor an error");
console.log("Already-settled rows keep their own stamped rate (nothing re-priced):");
const byRate = new Map<string, number>();
for (const m of data) byRate.set(String(m.waiting_rate), (byRate.get(String(m.waiting_rate)) ?? 0) + 1);
for (const [rate, n] of byRate) console.log(`  waiting_rate ${rate} → ${n} row(s)`);
