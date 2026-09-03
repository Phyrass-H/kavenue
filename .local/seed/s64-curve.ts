// S64 — three pooled trips at three lead times, so the §6 curve is visible in
// the app. Priced through the REAL mission_price() RPC and the real commission
// snapshot, exactly as createMission does: ceiling = the Course behind the
// all-in rate-card ceiling, pdp_start = the Course behind the rate-card FLOOR.
//
//   node --experimental-strip-types .local/seed/s64-curve.ts
//   node --experimental-strip-types .local/seed/s64-curve.ts --undo
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { currentFare, ceilingReachedAt } from "../../lib/pdp.ts";
import { COMMISSION_RATE_COLS, commissionSplit, courseFromBusinessTotal, ratesFromRow } from "../../lib/commission.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TAG = "S64CURVE";
const HOUR = 3_600_000, DAY = 24 * HOUR;
const eur = (n: number) => n.toFixed(2);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

if (process.argv.includes("--undo")) {
  const { data } = await db.from("mission").select("id").eq("reference", TAG);
  if (data?.length) await db.from("mission").delete().eq("reference", TAG);
  console.log(`removed ${data?.length ?? 0} ${TAG} missions`);
  process.exit(0);
}

const { data: rateRow } = await db.from("commission_rate").select(COMMISSION_RATE_COLS)
  .lte("effective_from", new Date().toISOString()).order("effective_from", { ascending: false }).limit(1).maybeSingle();
const rates = ratesFromRow(rateRow);
const { data: biz } = await db.from("business").select("id,name").limit(1).maybeSingle();
if (!biz) throw new Error("no business rows at all — this seed posts its trips as a real Business");
const { data: disp } = await db.from("dispatcher").select("id").eq("business_id", biz.id).limit(1).maybeSingle();
if (!disp) throw new Error(`business ${biz.name} (${biz.id}) has no dispatcher — a mission needs one to be posted`);

const CASES = [
  { label: "posted 14 days out", tier: "eco", body: null, km: 22, lead: 14 * DAY, postedAgo: 0,
    from: ["12 Promenade des Anglais, 06000 Nice", 43.695, 7.265], to: ["Monaco", 43.738, 7.424] },
  { label: "posted 2 days out", tier: "business", body: null, km: 31, lead: 2 * DAY, postedAgo: 0,
    from: ["Aéroport Nice Côte d'Azur, Terminal 2, 06200 Nice", 43.663, 7.215], to: ["Cannes", 43.552, 7.017] },
  { label: "posted 6 hours out", tier: "eco", body: null, km: 14, lead: 6 * HOUR, postedAgo: 0,
    from: ["58 Bd de la Croisette, 06400 Cannes", 43.549, 7.024], to: ["Antibes", 43.580, 7.125] },
] as const;

const made: string[] = [];
for (const c of CASES) {
  // ⚑ `.rpc(...).maybeSingle()` is typed `unknown` here, so the shape is named once
  // rather than asserted at each of the five uses below.
  const { data: quote, error: qErr } = await db.rpc("mission_price",
    { p_tier: c.tier, p_body: c.body, p_km: c.km, p_night: false }).maybeSingle();
  if (qErr) throw qErr;
  const q = quote as { floor_price: number; ceiling_price: number; rate_card_id: string } | null;
  if (!q) throw new Error(`mission_price returned nothing for ${c.tier} ${c.km} km`);
  const course = courseFromBusinessTotal(Number(q.ceiling_price), rates);
  const pdpStart = round2(courseFromBusinessTotal(Number(q.floor_price), rates));
  const pickupMs = Date.now() + c.lead;

  const { data: row, error } = await db.from("mission").insert({
    business_id: biz.id, dispatcher_id: disp.id, status: "pooled", category: c.tier,
    zone: "nice", reference: TAG,
    pickup_address: c.from[0], pickup_lat: c.from[1], pickup_lng: c.from[2],
    dropoff_address: c.to[0], dropoff_lat: c.to[1], dropoff_lng: c.to[2],
    pickup_at: new Date(pickupMs).toISOString(),
    distance_km: c.km, duration_min: Math.round(c.km * 1.6),
    pax_count: 2, luggage_count: 2,
    ceiling: course, pdp_start: pdpStart, pdp_step: null, pdp_interval: null, speed_win: false,
    rate_card_id: q.rate_card_id, night_applied: false,
    commission_business_rate: rates?.businessHt ?? null,
    commission_driver_rate: rates?.driverHt ?? null,
    commission_vat_rate: rates?.feeVat ?? null,
    created_at: new Date(Date.now() - c.postedAgo).toISOString(),
  }).select("id, ceiling, pdp_start, speed_win, pickup_at, created_at, pooled_at").maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`the insert reported no error and returned no row for "${c.label}" — nothing to price or undo`);
  made.push(row.id);

  const m = row as never;
  const now = currentFare(m);
  console.log(`\n${c.label}  ·  ${c.tier} ${c.km} km`);
  console.log(`  floor ${eur(Number(q.floor_price))} → ceiling ${eur(Number(q.ceiling_price))} all-in`);
  console.log(`  right now: hotel ${eur(commissionSplit(now, rates).businessTotal)} · driver ${eur(commissionSplit(now, rates).driverNet)}`);
  console.log(`  at its Ceiling from ${ceilingReachedAt(m).toISOString().replace("T", " ").slice(0, 16)}`);
}
console.log(`\ncreated ${made.length} ${TAG} missions — they are POOLED, so they show on the Driver's Pool.`);
console.log(`undo with:  node --experimental-strip-types .local/seed/s64-curve.ts --undo`);
