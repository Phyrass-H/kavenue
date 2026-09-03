// S68 — the awkward trips. The ones the console exists to find.
//
// ⚑ THESE ARE NOT SYNTHETIC EXCEPTIONS BOLTED ON. Both shapes happen in a real
// marketplace, and both are things the founder named as worth knowing about:
// a trip that keeps being taken and given back ("usually a sign something's
// wrong with it"), and a trip nobody in the fleet can serve at all. The seed's
// ordinary distribution produced neither, because ordinary is the common case —
// which is exactly why a dataset built only from the common case cannot test a
// console whose job is the uncommon one.
//
// The passed-around trips are historical, so they are walked and then re-stamped
// like the rest. The unservable one is live now, so its log stays observed.
//
//   npx tsx .local/seed/seed-hard-cases.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { PLACES } from "./riviera.mts";
import { priceFor, isNightPickup, RATE_CARD_COLS } from "../../lib/rate-card.ts";
import { utcToParisLocal } from "../../lib/time.ts";
import { currentFare } from "../../lib/pdp.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HOUR = 3_600_000, MIN = 60_000, DAY = 86_400_000;
const NOW = Date.now();
const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (t: number) => new Date(t).toISOString();

const { data: cards } = await db.from("rate_card").select(RATE_CARD_COLS);
if (!cards) throw new Error("the rate_card read came back null — there is no card to price these trips with");
// ⚑ A SECOND BINDING, AND IT IS NOT REDUNDANT. The guard above narrows `cards`,
// but TypeScript will not carry that narrowing into a hoisted `function`
// declaration — the function could be called before the guard runs, as far as the
// compiler knows. So the call site below saw `RateCardRow[] | null` again.
// Binding the narrowed value to a const is what makes the guard reach it.
const CARDS = cards;
const { data: comm } = await db.from("commission_rate").select("*").order("effective_from", { ascending: false }).limit(1);
if (!comm || !comm.length) throw new Error("commission_rate has no rows — every mission stamps its commission from the newest one at creation");
const R = comm[0];
const { data: biz } = await db.from("business").select("id, name");
if (!biz) throw new Error("the business read came back null — this script seeds against Businesses named in riviera.mts");
const { data: desks } = await db.from("dispatcher").select("id, business_id");
if (!desks) throw new Error("the dispatcher read came back null — a mission needs a desk to post it");
const { data: drivers } = await db.from("driver").select("id, first_name, last_name");
if (!drivers) throw new Error("the driver read came back null — this script hands its trips to Drivers named in riviera.mts");
const { data: vehicles } = await db.from("vehicle").select("driver_id, category, body_type");
const bizId = (n: string) => {
  const row = biz.find((b) => b.name === n);
  if (!row) throw new Error(`no Business named "${n}" — run .local/seed/seed-3months.mts first`);
  return row.id;
};
const deskOf = (b: string) => {
  const row = desks.find((d) => d.business_id === b);
  if (!row) throw new Error(`Business ${b} has no dispatcher — a mission needs a desk to post it`);
  return row.id;
};
const driverNamed = (n: string) => {
  const row = drivers.find((d) => d.first_name === n);
  if (!row) throw new Error(`no Driver whose first name is "${n}" — run .local/seed/seed-3months.mts first`);
  return row;
};

const stamps: [string, number[]][] = [];

async function post(o: {
  bizName: string; from: keyof typeof PLACES; to: keyof typeof PLACES;
  km: number; min: number; cat: "eco" | "business" | "luxury"; body: "sedan" | "van" | null;
  pickupAt: number; postedAt: number; pax: number; bags: number; guest: string;
}) {
  const from = PLACES[o.from], to = PLACES[o.to];
  // ⚑ utcToParisLocal, NOT iso(). `iso()` is toISOString() — UTC — and the hour would
  // be read as if it were local ([[d124]]). This was the THIRD script with the bug and
  // the only one nobody had found: the compiler named it the moment .local/seed was
  // typechecked, which is the whole argument for typechecking it.
  const night = isNightPickup(utcToParisLocal(new Date(o.pickupAt)));
  const q = priceFor(CARDS, o.cat, o.body ?? "sedan", o.km, { night, at: new Date() });
  if (!q) throw new Error(`no price for ${o.cat}/${o.body ?? "sedan"} over ${o.km} km${night ? " (night)" : ""} — no rate_card row covers it at today's date, so the trip would have been written with a null fare`);
  const b = bizId(o.bizName);
  const { data, error } = await db.from("mission").insert({
    business_id: b, dispatcher_id: deskOf(b), status: "pooled", mission_type: "transfer",
    category: o.cat, zone: from.zone,
    pickup_address: from.address, pickup_lat: from.lat, pickup_lng: from.lng, pickup_label: from.label,
    dropoff_address: to.address, dropoff_lat: to.lat, dropoff_lng: to.lng, dropoff_label: to.label,
    pickup_at: iso(o.pickupAt), passenger_names: [o.guest],
    pax_count: o.pax, luggage_count: o.bags, required_body_type: o.body,
    distance_km: o.km, duration_min: o.min,
    base_fare: round2(q.floor), ceiling: round2(q.ceiling), pdp_start: round2(q.floor),
    speed_win: false, night_applied: night, rate_card_id: q.rateCardId,
    commission_business_rate: R.business_rate_ht, commission_driver_rate: R.driver_rate_ht,
    commission_vat_rate: R.fee_vat_rate,
    created_at: iso(o.postedAt),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id, ceiling: round2(q.ceiling), floor: round2(q.floor) };
}

async function move(id: string, patch: Record<string, unknown>, at: number, times: number[]) {
  const { error } = await db.from("mission").update(patch).eq("id", id);
  if (error) throw new Error(`${id}: ${error.message}`);
  times.push(at);
}

// ── 1 · the trips that keep coming back ─────────────────────────────────────
console.log("── passed around ──");
const AWKWARD = [
  { biz: "Hôtel Majestic Cannes", from: "majestic" as const, to: "valberg" as const, km: 122, min: 128,
    cat: "business" as const, drops: 3, daysAgo: 26, guest: "M. Grégoire Aubert",
    why: "a mountain run in the snow — three Drivers took it and thought better of it" },
  { biz: "Hôtel Negresco", from: "negresco" as const, to: "sttropez" as const, km: 116, min: 132,
    cat: "business" as const, drops: 2, daysAgo: 41, guest: "Mrs Eleanor Sharpe",
    why: "a long transfer with a late return — dropped twice" },
];

for (const a of AWKWARD) {
  const pickupAt = NOW - a.daysAgo * DAY;
  const postedAt = pickupAt - 9 * DAY;
  const m = await post({ bizName: a.biz, from: a.from, to: a.to, km: a.km, min: a.min, cat: a.cat, body: null, pickupAt, postedAt, pax: 3, bags: 4, guest: a.guest });
  const times = [postedAt, postedAt];   // created + pooled
  const pdp = { id: m.id, ceiling: m.ceiling, pdp_start: m.floor, speed_win: false, pickup_at: iso(pickupAt), created_at: iso(postedAt) };

  // Candidates who genuinely match the class — Business sedans near the route.
  const pool = ["Marc", "Sofia", "Inès", "Nadia"].map(driverNamed);
  let t = postedAt;
  for (let i = 0; i < a.drops; i++) {
    const d = pool[i % pool.length];
    t += (pickupAt - t) * 0.25;
    await move(m.id, { driver_id: d.id, status: "confirmed", accepted_at: iso(t), confirmed_at: iso(t), accepted_fare: round2(currentFare(pdp, new Date(t))) }, t, times);
    t += (pickupAt - t) * 0.35;
    // Back to the Pool → the trigger writes `repooled`, and the payload keeps
    // the Driver who walked, not the next one.
    await move(m.id, { driver_id: null, status: "pooled", accepted_at: null, confirmed_at: null, accepted_fare: null, checked_in_at: null }, t, times);
  }
  // In the end somebody drives it.
  const last = driverNamed("Nadia");
  t += (pickupAt - t) * 0.5;
  await move(m.id, { driver_id: last.id, status: "confirmed", accepted_at: iso(t), confirmed_at: iso(t), accepted_fare: round2(currentFare(pdp, new Date(t))) }, t, times);
  await move(m.id, { checked_in_at: iso(pickupAt - 50 * MIN) }, t, times.slice(0, 0)); // no status change → no event
  await move(m.id, { status: "en_route" }, pickupAt - 30 * MIN, times);
  await move(m.id, { status: "arrived" }, pickupAt - 6 * MIN, times);
  await move(m.id, { status: "on_board" }, pickupAt + 4 * MIN, times);
  await move(m.id, { status: "completed" }, pickupAt + a.min * MIN + 8 * MIN, times);
  stamps.push([m.id, times]);
  console.log(`  ${PLACES[a.from].label} → ${PLACES[a.to].label} · dropped ${a.drops}× · ${a.why}`);
}

// ── 2 · the trip nobody can serve ───────────────────────────────────────────
// ⚑ Both ends far from every base AND a class/body only one Driver has. The
// ordinary "nobody took it" trips all start at a hotel, which sits inside
// somebody's radius by definition — so the Pool always showed them to someone
// and they expired for want of appetite, not want of a match. This one is
// genuinely unreachable, which is a different problem and should read as one.
console.log("\n── unservable ──");
const pickupAt = NOW + 76 * HOUR;
const unservable = await post({
  bizName: "Hôtel Métropole Monte-Carlo", from: "valberg", to: "mrsAirport",
  km: 268, min: 205, cat: "luxury", body: "van", pickupAt, postedAt: NOW,
  pax: 6, bags: 7, guest: "Sr. Diego Alarcón",
});
console.log(`  Valberg → Marseille Airport · First/van · ${unservable.ceiling} €`);
console.log("  (the only First van is based in Juan-les-Pins, ~90 km from the pickup)");

// ── re-stamp the historical ones, exactly as the main seed does ─────────────
console.log("\n── re-stamping the historical trips ──");
let ok = 0;
for (const [id, times] of stamps) {
  const { data: rows } = await db.from("mission_event").select("id, event_type, seq")
    .eq("mission_id", id).eq("source", "db_trigger").order("seq");
  if (!rows || rows.length !== times.length) {
    console.log(`  ⚑ REFUSED ${id}: ${rows?.length ?? 0} events vs ${times.length} steps (${rows?.map((r) => r.event_type).join(">")})`);
    continue;
  }
  for (let i = 0; i < rows.length; i++) {
    await db.from("mission_event").update({ occurred_at: iso(times[i]), source: "seed" }).eq("id", rows[i].id);
    ok++;
  }
}
console.log(`  ${ok} events re-stamped and relabelled 'seed'`);

const { count: obs } = await db.from("mission_event").select("*", { count: "exact", head: true }).eq("source", "db_trigger");
console.log(`\n${obs} events still genuinely observed (the live trips only)`);
