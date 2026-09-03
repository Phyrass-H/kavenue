// Do the /admin/trips filter chips agree with the rows they produce?
//
// Written 2026-09-02 (S74). The chips filtered on the RAW `status` column while
// every row printed a DERIVED one, so "In the Pool" listed trips whose own
// status word reads `Unfilled`, and "Nobody took" missed every one of them. The
// fix writes the `isExpired` rule a SECOND time, in SQL, because the filter has
// to be part of the paged query — and a rule written twice is a rule that can
// drift. This probe is the only thing that can catch that drift: vitest never
// sees the SQL, and the `.or()` string is a grammar the type checker cannot read.
//
//   npx tsx .local/probe/admin-chips.mts
//
// READ ONLY — creates nothing, writes nothing, deletes nothing.
//
// ⚑ IT SIGNS IN AS THE ADMIN, AND THAT IS LOAD-BEARING. The first version of
// this probe used the SERVICE ROLE and printed seven greens on ZERO rows —
// `mission_read` ends in `where app_role() = 'admin' or business_id = … or
// driver_id = …`, and the service role is none of those, so the view is empty to
// it and every assertion passed vacuously. A green on an empty set is the dead
// battery in the smoke alarm. The row-count assertion below exists so that can
// never happen quietly again.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { isExpired } from "../../lib/dispatch-status.ts";
import type { MissionRow } from "../../lib/database.types.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");

// ⚑ Either key name will do; neither is what hurts — an empty key surfaces as a sign-in
// failure, which reads like the admin account being gone rather than a missing line.
if (!env.NEXT_PUBLIC_SUPABASE_URL || !(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, and one of NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, is missing from .env.local");
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); };

const { error: authErr } = await db.auth.signInWithPassword({
  email: "admin@kavenue.fr", password: DEV_PASSWORD,
});
if (authErr) { console.log(`FAIL  cannot sign in as the admin console's own user   ${authErr.message}`); process.exit(1); }

const nowIso = new Date().toISOString();
const now = new Date(nowIso);

// ── the two chips, character for character as app/admin/trips/page.tsx writes them ──
const inPool = await db.from("mission_read").select("*", { count: "exact" })
  .eq("status", "pooled").gt("pickup_at", nowIso).order("pickup_at", { ascending: false });

const nobodyTook = await db.from("mission_read").select("*", { count: "exact" })
  .or(`status.eq.expired,and(status.eq.pooled,pickup_at.lte."${nowIso}")`)
  .order("pickup_at", { ascending: false });

console.log("\n── the chip SQL parses at all ──");
t('"In the Pool" is a valid query', !inPool.error, inPool.error?.message ?? `${inPool.count} row(s)`);
// ⚑ THE ONE MOST LIKELY TO BREAK. A quoted timestamp inside `and(...)` is
// PostgREST's own grammar, not SQL — a bad quote returns 400, not fewer rows.
t('"Nobody took" is a valid query', !nobodyTook.error, nobodyTook.error?.message ?? `${nobodyTook.count} row(s)`);
if (inPool.error || nobodyTook.error) { console.log("\nThe chips do not run. Nothing below is meaningful."); process.exit(1); }

// ── the whole population the chips are meant to split ──
const all = await db.from("mission_read").select("*").in("status", ["pooled", "expired"]);
const rows = (all.data ?? []) as MissionRow[];

console.log("\n── the probe is looking at something ──");
// ⚑ THE DEAD-BATTERY GUARD. Without this every assertion below passes on an
// empty view — which is exactly what happened the first time this was run.
t("the view returns rows to this session at all", rows.length > 0, `${rows.length} pooled/expired row(s) visible`);
if (rows.length === 0) { console.log("\nEvery check below would pass vacuously. Stopping."); process.exit(1); }

const pool = (inPool.data ?? []) as MissionRow[];
const took = (nobodyTook.data ?? []) as MissionRow[];

console.log("\n── each chip agrees with the word its own rows print ──");
t('no row under "In the Pool" would print Unfilled',
  pool.every((m) => !isExpired(m, now)),
  `${pool.filter((m) => isExpired(m, now)).length} disagreeing of ${pool.length}`);
t('every row under "Nobody took" would print Unfilled',
  took.length > 0 && took.every((m) => isExpired(m, now)),
  `${took.filter((m) => !isExpired(m, now)).length} disagreeing of ${took.length}`);

console.log("\n── the two chips partition the pooled-or-expired rows: no gap, no overlap ──");
const expectedDead = rows.filter((m) => isExpired(m, now)).map((m) => m.id).sort();
const expectedLive = rows.filter((m) => !isExpired(m, now)).map((m) => m.id).sort();
t('"Nobody took" returns exactly the dead ones',
  JSON.stringify(took.map((m) => m.id).sort()) === JSON.stringify(expectedDead),
  `${took.length} returned vs ${expectedDead.length} expected`);
t('"In the Pool" returns exactly the live ones',
  JSON.stringify(pool.map((m) => m.id).sort()) === JSON.stringify(expectedLive),
  `${pool.length} returned vs ${expectedLive.length} expected`);
t("no trip appears under both chips",
  took.filter((m) => pool.some((p) => p.id === m.id)).length === 0);
t("every pooled-or-expired trip appears under exactly one of them",
  took.length + pool.length === rows.length, `${took.length} + ${pool.length} vs ${rows.length}`);

console.log("\n── what the fix is worth on live data ──");
const stale = rows.filter((m) => m.status === "pooled" && isExpired(m, now));
console.log(`     ${stale.length} trip(s) are still marked \`pooled\` with the pickup behind them.`);
console.log(`     Each one used to say "Pooled" beside a fare cell reading "Not taken",`);
console.log(`     was listed under "In the Pool", and was missing from "Nobody took".`);
for (const m of stale.slice(0, 5)) console.log(`       ${m.id}  pickup ${m.pickup_at}`);

console.log(`\nchecks: ${pass + fail}   ${fail === 0 ? "0 failed — the chips and the rows say the same thing." : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
