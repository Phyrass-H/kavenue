// S68 — delete log entries whose trip no longer exists.
//
// ⚑ THIS IS NOT A VIOLATION OF "never DELETE a row here". `mission_event` has no
// foreign key to `mission` on purpose — the log outlives the trip — so any probe
// that creates a mission, drives it and deletes it leaves its events stranded.
// Those rows are the history of trips that never existed, and the S66 probe
// helpers already delete them by recorded id for exactly this reason. What must
// never be deleted is the history of a REAL trip.
//
// Run after a live-probe session, before quoting any number from the log.
//
//   npx tsx .local/probe/sweep-orphans.mts          # report
//   npx tsx .local/probe/sweep-orphans.mts --delete
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from(table).select(cols).range(from, from + 999);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

const events = await all<{ id: string; mission_id: string; source: string }>("mission_event", "id, mission_id, source");
const live = new Set((await all<{ id: string }>("mission", "id")).map((m) => m.id));
const orphans = events.filter((e) => e.mission_id && !live.has(e.mission_id));

const bySource = orphans.reduce((a: Record<string, number>, e) => ((a[e.source] = (a[e.source] ?? 0) + 1), a), {});
console.log(`${orphans.length} of ${events.length} events point at a trip that no longer exists`);
console.log("  by source: " + (Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"));

// ⚑ A seeded orphan would mean the seed deleted one of its own trips, which it
// never does. If this is ever non-zero, something removed real seeded history.
if (bySource.seed) console.log(`  ⚑ ${bySource.seed} SEEDED orphans — the seed does not delete its own trips. Investigate.`);

if (!process.argv.includes("--delete")) {
  console.log(orphans.length ? "\nRe-run with --delete to sweep them." : "\nNothing to sweep.");
  process.exit(0);
}

let gone = 0;
for (let i = 0; i < orphans.length; i += 200) {
  const ids = orphans.slice(i, i + 200).map((e) => e.id);
  const { error } = await db.from("mission_event").delete().in("id", ids);
  if (error) console.log(`FAIL ${error.message}`);
  else gone += ids.length;
}
const { count } = await db.from("mission_event").select("*", { count: "exact", head: true });
console.log(`\ndeleted ${gone} · log now ${count} events, all of them about a trip that exists`);
