// 2026-09-12 — does /admin/businesses still obey [[d103]]? A census count, and no row dropped.
//
//   npx tsx .local/probe/business-census.mts
//
// READ-ONLY: admin_business_overview is `language sql stable` — it builds json and writes
// nothing. Harmless BEFORE the migration is pasted, which is the point (S76's rule: a probe
// that fails before a migration must be harmless when it fails). It simply reports red.
//
// ⚑ WHAT IT IS FOR. On All time — the default view, and the only one anyone had looked at —
// the correct body and the reverted one give IDENTICAL answers, because every Business here
// has posted at least once. The bug is only visible through a period. So every check below
// asks a period, and the FIRST one asks a period nobody booked in.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let n = 0; const bad: string[] = [];
const t = (name: string, ok: boolean, note = "") => {
  n++; if (!ok) bad.push(name);
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "   " + note : ""}`);
};

type Row = { key: string | null; parent: string | null; businesses: number; trips: number; settled: number; filled: number };
type Overview = { businesses: number; trips: number; never_posted: number; median_trips: number | null; posting_businesses: number; by_type: Row[]; by_region: Row[]; by_city: Row[] };

// ⚑ EVERY CALL THROWS ON AN ERROR. An empty answer and a refused one are indistinguishable
//   otherwise, and this probe exists because a wrong answer looked like a right one (S76 § 4).
const overview = async (from: string | null, to: string | null): Promise<Overview> => {
  const { data, error } = await db.rpc("admin_business_overview", { p_from: from, p_to: to });
  if (error) throw new Error(`admin_business_overview(${from ?? "null"}, ${to ?? "null"}): ${error.message}`);
  if (!data) throw new Error("admin_business_overview returned no data and no error");
  return data as Overview;
};
const sum = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.businesses), 0);

const { data: bizRows, error: bizErr } = await db.from("business").select("id, business_type, region, country");
if (bizErr || !bizRows) throw new Error(`the business table could not be read: ${bizErr?.message}`);
const total = bizRows.length;
const types = new Set(bizRows.map((b) => b.business_type)).size;
console.log(`\n   ${total} Businesses live, ${types} distinct type(s)\n`);

// ── 1 · the discriminator: a period nobody booked in ────────────────────────────────────
const quiet = await overview("2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z");
t("a period with no trips still lists every Business type",
  quiet.by_type.length === types, `${quiet.by_type.length} of ${types} type row(s)`);
t("…and every région", quiet.by_region.length > 0, `${quiet.by_region.length} row(s)`);
t("…and the counts are the whole census", sum(quiet.by_type) === total, `${sum(quiet.by_type)} of ${total}`);
t("…while the trips are honestly zero", Number(quiet.trips) === 0, `trips ${quiet.trips}`);

// ── 2 · the census does not move, period by period ──────────────────────────────────────
// ⚑ Asserted against the TABLE, not against another call: two calls agreeing proves only
//   that the function is consistent, including consistently wrong.
const all = await overview(null, null);
t("all time: by_type sums to the whole census", sum(all.by_type) === total, `${sum(all.by_type)} of ${total}`);
t("all time: by_region sums to the whole census", sum(all.by_region) === total, `${sum(all.by_region)} of ${total}`);
t("all time: the headline count is the table count", Number(all.businesses) === total, `${all.businesses} of ${total}`);

const months: [string, string][] = [
  ["2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z"],
  ["2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z"],
  ["2026-07-01T00:00:00Z", "2026-08-01T00:00:00Z"],
  ["2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z"],
];
let monthTrips = 0;
for (const [from, to] of months) {
  const m = await overview(from, to);
  monthTrips += Number(m.trips);
  t(`${from.slice(0, 7)}: the census is still ${total}`, sum(m.by_type) === total,
    `by_type ${sum(m.by_type)} · trips ${m.trips}`);
}
// ⚑ The check that keeps the ones above honest: if the period were ignored, every month
//   would return all-time trips and the census checks would pass anyway.
t("the trips DO move with the period", monthTrips > 0 && monthTrips < Number(all.trips),
  `four months hold ${monthTrips} of ${all.trips} trips`);

// ── 3 · the 2026-09-10 feature the fix must not lose: a country key ─────────────────────
const abroad = bizRows.filter((b) => !b.region && b.country);
const keys = all.by_region.map((r) => r.key);
for (const b of abroad) {
  t(`a Business outside France keys as "C:${b.country}"`, keys.includes(`C:${b.country}`), keys.join(", "));
}
if (abroad.length === 0) console.log("skip  no Business outside France to key — nothing to prove here today");

console.log(`\nchecks: ${n}`);
console.log(bad.length
  ? `\n⚑ ${bad.length} FAILED — paste docs/migrations/2026-09-12_business_overview_census_restored.sql:\n` + bad.map((b) => "  " + b).join("\n")
  : "\n[[d103]] holds on the live database: the count is a census, and no row is dropped.");
