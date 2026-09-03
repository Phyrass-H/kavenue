// READ+WRITE probe — the §6 curve on the REAL database, through the REAL code.
// Creates one tagged mission the way createMission does, reads it back through
// the app's own FARE_COLS, and prints the curve. Cleans up in a finally.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types.ts";
import fs from "node:fs";
import { currentFare, openingPrice, ceilingReachedAt, settledFare } from "../../lib/pdp.ts";
import { COMMISSION_RATE_COLS, courseFromBusinessTotal, commissionSplit, ratesFromRow } from "../../lib/commission.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TAG = "CURVEPROBE";
const HOUR = 3_600_000, DAY = 24 * HOUR;
let checks = 0; const fails: string[] = [];
const t = (name: string, ok: boolean, note = "") => {
  checks++; if (!ok) fails.push(`${name}  ${note}`);
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "   " + note : ""}`);
};
const eur = (n: number) => n.toFixed(2);

const { data: rateRow } = await db.from("commission_rate").select(COMMISSION_RATE_COLS)
  .lte("effective_from", new Date().toISOString()).order("effective_from", { ascending: false }).limit(1).maybeSingle();
const rates = ratesFromRow(rateRow);

const { data: biz } = await db.from("business").select("id").limit(1).maybeSingle();
if (!biz) throw new Error("no Business in the database — this probe hangs its mission on one; run .local/seed/seed-3months.mts");
const { data: disp } = await db.from("dispatcher").select("id").eq("business_id", biz.id).limit(1).maybeSingle();
if (!disp) throw new Error(`Business ${biz.id} has no Dispatcher — a mission needs one; run .local/seed/seed-3months.mts`);

// Exactly what createMission does: price in SQL from the server's own distance.
const KM = 22;
const { data: q } = await db.rpc("mission_price", { p_tier: "eco", p_body: null, p_km: KM, p_night: false }).maybeSingle();
// ⚑ A THROW, NOT `q!`. If no rate card matches, every number below becomes NaN
// and the assertions compare NaN to NaN — which prints as a failure sometimes and
// as a pass others. Stopping here says WHY; a `!` would have said nothing.
if (!q) throw new Error(`mission_price returned no row for eco/${KM} km — is there a rate card in force?`);
const floorAllIn = Number(q.floor_price), ceilAllIn = Number(q.ceiling_price);
const course = courseFromBusinessTotal(ceilAllIn, rates);
const pdpStart = Math.round(courseFromBusinessTotal(floorAllIn, rates) * 100) / 100;

console.log(`\nEco ${KM} km — rate card says floor ${eur(floorAllIn)} / ceiling ${eur(ceilAllIn)} ALL-IN`);
console.log(`stored: ceiling(Course) ${eur(course)} · pdp_start(Course floor) ${eur(pdpStart)}\n`);

const pickupMs = Date.now() + 2 * DAY;
const ids: string[] = [];
const undo = async () => { if (ids.length) await db.from("mission").delete().in("id", ids); };

try {
  const { data: made, error } = await db.from("mission").insert({
    business_id: biz.id, dispatcher_id: disp.id, status: "pooled", category: "eco",
    pickup_address: "12 Promenade des Anglais, 06000 Nice", pickup_lat: 43.695, pickup_lng: 7.265,
    dropoff_address: "Monaco", dropoff_lat: 43.738, dropoff_lng: 7.424,
    pickup_at: new Date(pickupMs).toISOString(), reference: TAG,
    distance_km: KM, ceiling: course, pdp_start: pdpStart, pdp_step: null, pdp_interval: null,
    speed_win: false, rate_card_id: q.rate_card_id, night_applied: false,
    commission_business_rate: rates?.businessHt ?? null, commission_driver_rate: rates?.driverHt ?? null,
    commission_vat_rate: rates?.feeVat ?? null,
  }).select("id").maybeSingle();
  if (error) throw error;
  if (!made) throw new Error("the mission insert reported no error and returned no row — nothing to read the curve from");
  ids.push(made.id);

  // Read it back through the app's OWN column list — if this list is short a line, the fare is wrong.
  const FARE_COLS = "id, business_id, ceiling, pdp_start, speed_win, pickup_at, created_at, pooled_at, accepted_at, accepted_fare";
  const { data: m } = await db.from("mission").select(FARE_COLS).eq("id", made.id).maybeSingle();
  const mm = m as never;

  t("opens exactly on the rate-card floor", openingPrice(mm) === pdpStart, `${eur(openingPrice(mm))} vs ${eur(pdpStart)}`);
  t("the Business sees the floor it was quoted",
    Math.abs(commissionSplit(openingPrice(mm), rates).businessTotal - floorAllIn) <= 0.01,
    `${eur(commissionSplit(openingPrice(mm), rates).businessTotal)} vs quoted ${eur(floorAllIn)}`);
  t("reaches the Ceiling exactly at T−5h",
    Math.abs(ceilingReachedAt(mm).getTime() - (pickupMs - 5 * HOUR)) < 1000,
    ceilingReachedAt(mm).toISOString());

  console.log("");
  let prev = -1, monotone = true;
  for (const h of [48, 24, 12, 8, 6, 5.5, 5, 4, 1, 0]) {
    const at = new Date(pickupMs - h * HOUR);
    const f = currentFare(mm, at);
    if (f < prev) monotone = false;
    prev = f;
    const s = commissionSplit(f, rates);
    console.log(`   T−${String(h).padStart(4)}h   course ${eur(f).padStart(6)}   hotel ${eur(s.businessTotal).padStart(6)}   driver ${eur(s.driverNet).padStart(6)}`);
  }
  console.log("");
  t("the price never goes down", monotone);
  t("at the Ceiling from T−5h on", currentFare(mm, new Date(pickupMs - 5 * HOUR)) === Math.round(course * 100) / 100);
  t("never exceeds the Ceiling after pickup", currentFare(mm, new Date(pickupMs + HOUR)) <= Math.round(course * 100) / 100);

  // Frozen at accept — the one number every archive read uses.
  const acceptAt = new Date(pickupMs - 30 * HOUR);
  await db.from("mission").update({ accepted_at: acceptAt.toISOString() }).eq("id", made.id);
  const { data: m2 } = await db.from("mission").select(FARE_COLS).eq("id", made.id).maybeSingle();
  t("settledFare freezes at the accept instant",
    settledFare(m2 as never) === currentFare(mm, acceptAt),
    `${eur(settledFare(m2 as never))} vs ${eur(currentFare(mm, acceptAt))}`);
} finally {
  await undo();
  const { count } = await db.from("mission").select("id", { count: "exact", head: true }).eq("reference", TAG);
  t("cleaned up — no tagged stragglers", (count ?? 0) === 0, `${count} left`);
}

console.log(`\nchecks: ${checks}`);
console.log(fails.length ? `\n${fails.length} PROBLEM(S):\n` + fails.map((f) => "  " + f).join("\n") : "\nALL AGREE — 0 problems");
