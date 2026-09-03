import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { commissionSplit, driverNet, ratesOf } from "../../lib/commission.ts";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// ⚑ A SCRATCH INSPECTOR, pointed at one mission by argument rather than by a
// literal id ([[d97]] / S69). It used to hold a hardcoded uuid, which the
// 2026-08-26 bleach deleted along with everything else — the file then read a
// mission that does not exist and printed nothing, which looks like "no
// amendments" rather than "wrong trip".
const MID = process.argv.find((a) => /^[0-9a-f-]{36}$/.test(a));
if (!MID) {
  console.error("usage: amend-check.ts <mission-uuid> [--undo]");
  process.exit(1);
}
const { data: m } = await db.from("mission").select("*").eq("id", MID).maybeSingle();
const { data: ams } = await db.from("mission_amendment").select("*").eq("mission_id", MID).order("created_at", { ascending: false });
if (process.argv.includes("--undo")) {
  const ids = (ams ?? []).map((a) => a.id);
  if (ids.length) await db.from("mission_amendment").delete().in("id", ids);
  console.log(`removed ${ids.length} amendment(s)`);
  process.exit(0);
}
const rates = ratesOf(m);
for (const a of ams ?? []) {
  const stored = Number(a.new_fare);
  console.log(`status ${a.status}`);
  console.log(`  stored new_fare (Course)   ${stored.toFixed(2)}`);
  console.log(`  Business sees              ${commissionSplit(stored, rates).businessTotal.toFixed(2)}   (typed 70,00)`);
  console.log(`  Driver sees                ${driverNet(m, stored).toFixed(2)}`);
  console.log(`  mission.ceiling untouched  ${m.ceiling}`);
}
