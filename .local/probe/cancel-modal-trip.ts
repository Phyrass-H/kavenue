// One priced, accepted trip with pickup 2 h out, so the Business cancel modal is
// inside the fee ramp (80%) and shows real money. Proves the S62 all-in fix.
// Priced through the same RPC + helper the app uses, Driver attached in a SECOND
// statement so the transport-VAT trigger fires (S61 trap).
//   npx tsx .local/probe/cancel-modal-trip.ts          # create
//   npx tsx .local/probe/cancel-modal-trip.ts --undo   # remove, re-assert baseline
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { courseFromBusinessTotal, ratesFromRow, commissionSplit } from "../../lib/commission.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const TAG = "S62CANCEL";

if (process.argv.includes("--undo")) {
  const { data: rows } = await db.from("mission").select("id").eq("reference", TAG);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) {
    for (const t of ["status_event", "mission_cancellation", "mission_guest_contact"]) {
      await db.from(t).delete().in("mission_id", ids);
    }
    await db.from("mission").delete().in("id", ids);
  }
  const { count } = await db.from("mission").select("id", { count: "exact", head: true });
  console.log(`removed ${ids.length} ${TAG} · ${count} missions left`);
  process.exit(0);
}

// ⚑ THROWS, NOT `!`. Each of these looks a fixture up BY NAME on the live
// database — a Business matching "Grand", a Driver called Marc Dubois. Rename
// either one and the lookup returns null, which a `!` would have carried
// silently into an INSERT: a mission written against `business_id: undefined`,
// or an accept applied to nobody. Saying which fixture is missing turns ten
// minutes of confusion into one line.
const { data: biz } = await db.from("business").select("id,name").ilike("name", "%Grand%").limit(1).maybeSingle();
if (!biz) throw new Error('no Business whose name matches "%Grand%" — this probe seeds against a named fixture');

const { data: disp } = await db.from("dispatcher").select("id").eq("business_id", biz.id).limit(1).maybeSingle();
if (!disp) throw new Error(`${biz.name} has no Dispatcher, so there is nobody to post the trip as`);

const { data: drv } = await db.from("driver").select("id").eq("first_name", "Marc").eq("last_name", "Dubois").maybeSingle();
if (!drv) throw new Error("no Driver named Marc Dubois — this probe accepts the trip as that fixture");
const { data: rateRow } = await db.from("commission_rate").select("*")
  .lte("effective_from", new Date().toISOString()).order("effective_from", { ascending: false })
  .limit(1).maybeSingle();
const rates = ratesFromRow(rateRow);

const { data: quoted, error: qErr } = await db.rpc("mission_price", {
  p_tier: "business", p_body: "sedan", p_km: 24.3, p_night: false,
});
if (qErr) throw qErr;
const q = Array.isArray(quoted) ? quoted[0] : quoted;
const allIn = Number(q.ceiling_price);
const course = courseFromBusinessTotal(allIn, rates);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pickupAt = new Date(Date.now() + 2 * 3600_000).toISOString();

const { data: made, error } = await db.from("mission").insert({
  business_id: biz.id, dispatcher_id: disp.id, status: "confirmed",
  category: "business", required_body_type: "sedan", zone: "nice", reference: TAG,
  pickup_address: "Port Vauban, 06600 Antibes, France", pickup_lat: 43.5866, pickup_lng: 7.1256,
  dropoff_address: "Aéroport Nice Côte d'Azur, 06200 Nice, France", dropoff_lat: 43.6653, dropoff_lng: 7.2148,
  pickup_at: pickupAt, distance_km: 24.3, duration_min: 32, pax_count: 2, luggage_count: 2,
  ceiling: course, pdp_start: round2(course * 0.5), pdp_step: round2(Math.max(1, course * 0.05)),
  pdp_interval: 10, speed_win: false, rate_card_id: q.rate_card_id, night_applied: false,
  commission_business_rate: rates?.businessHt ?? null,
  commission_driver_rate: rates?.driverHt ?? null,
  commission_vat_rate: rates?.feeVat ?? null,
  created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
}).select("id").maybeSingle();
if (error) throw error;
if (!made) throw new Error("the insert reported no error and returned no row — nothing to cancel");

const at = new Date(Date.now() - 2.5 * 3600_000).toISOString();
const { error: accErr } = await db.from("mission")
  .update({ driver_id: drv.id, accepted_at: at, confirmed_at: at }).eq("id", made.id);
if (accErr) throw accErr;

const split = commissionSplit(course, rates);
console.log(`${TAG} ${made.id}`);
console.log(`  pickup in 2 h → the ramp is at 80%`);
console.log(`  course ${course.toFixed(2)} · all-in ceiling ${split.businessTotal.toFixed(2)}`);
console.log(`  the modal must read 80%  ${(split.businessTotal * 0.8).toFixed(2)} of ${split.businessTotal.toFixed(2)}`);
console.log(`  (before the fix it read 80%  ${(course * 0.8).toFixed(2)} of ${course.toFixed(2)})`);
