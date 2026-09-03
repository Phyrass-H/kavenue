// S68 — the trips that are genuinely live right now.
//
// ⚑ THESE ARE THE ONLY ONES WHOSE LOG IS REAL. Everything else in the database
// was walked and then re-stamped, so its events say source='seed'. These are
// posted at this moment for pickups in the next few days, the trigger observes
// them as they happen, and their entries stay 'db_trigger' — honestly. Without
// them the console would have nothing observed to render, and the distinction
// between "the database watched this" and "we made this up" would be untestable.
//
// They are also chosen to give the matcher something to say: one that needs a
// van, one First-class, one Eco, one far enough out that most radii miss it.
//
//   npx tsx .local/seed/seed-live.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { PLACES, BUSINESSES, GUESTS, AIRLINES, NOTES } from "./riviera.mts";
import { priceFor, isNightPickup, RATE_CARD_COLS } from "../../lib/rate-card.ts";
import { utcToParisLocal } from "../../lib/time.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const NOW = new Date();
const HOUR = 3_600_000, MIN = 60_000;
const iso = (d: Date) => d.toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

const { data: cards } = await db.from("rate_card").select(RATE_CARD_COLS);
if (!cards?.length) throw new Error("no rate cards in the database — every trip below would price at nothing; run .local/seed/seed-3months.mts");
const { data: comm } = await db.from("commission_rate").select("*").order("effective_from", { ascending: false }).limit(1);
if (!comm?.length) throw new Error("no commission_rate row in force — the trips would carry null commission rates; run .local/seed/seed-3months.mts");
const RATES = comm[0];
const { data: bizRows } = await db.from("business").select("id, name");
if (!bizRows?.length) throw new Error("no Businesses in the database — run .local/seed/seed-3months.mts first");
const { data: deskRows } = await db.from("dispatcher").select("id, business_id");
if (!deskRows?.length) throw new Error("no Dispatchers in the database — run .local/seed/seed-3months.mts first");
const bizId = (name: string) => {
  const row = bizRows.find((b) => b.name === name);
  if (!row) throw new Error(`no Business named "${name}" — the LIVE list below names its Businesses exactly as seed-3months.mts writes them`);
  return row.id;
};
const deskFor = (bId: string) => {
  const row = deskRows.find((d) => d.business_id === bId);
  if (!row) throw new Error(`Business ${bId} has no Dispatcher — a mission needs one to post it`);
  return row.id;
};

// hours from now to pickup · what makes each one interesting
const LIVE: {
  biz: string; from: keyof typeof PLACES; to: keyof typeof PLACES;
  km: number; min: number; cat: "eco" | "business" | "luxury";
  body: "sedan" | "van" | null; inH: number; pax: number; bags: number;
  lugOnly?: boolean; why: string;
}[] = [
  { biz: "Hôtel Majestic Cannes", from: "majestic", to: "nceT2", km: 27, min: 35, cat: "business", body: null, inH: 20, pax: 2, bags: 3, why: "the ordinary case — several Drivers match" },
  { biz: "Hôtel Negresco", from: "nceT1", to: "negresco", km: 6, min: 14, cat: "eco", body: null, inH: 31, pax: 1, bags: 1, why: "Eco — only the three Eco cars can take it" },
  { biz: "Hôtel Métropole Monte-Carlo", from: "metropole", to: "nceT2", km: 30, min: 41, cat: "luxury", body: "sedan", inH: 44, pax: 2, bags: 2, why: "First + sedan — narrows to two cars" },
  { biz: "Hôtel Majestic Cannes", from: "majestic", to: "monacoport", km: 51, min: 62, cat: "business", body: "van", inH: 55, pax: 6, bags: 6, why: "six guests — a van, and only two exist" },
  { biz: "Hôtel Belles-Rives", from: "bellesrives", to: "nceT2", km: 20, min: 28, cat: "business", body: null, inH: 68, pax: 2, bags: 8, lugOnly: true, why: "luggage only — needs the opt-in" },
  { biz: "Hôtel Negresco", from: "negresco", to: "sttropez", km: 116, min: 132, cat: "luxury", body: "sedan", inH: 90, pax: 2, bags: 3, why: "116 km — most radii miss both ends" },
  { biz: "Hôtel Majestic Cannes", from: "majestic", to: "valberg", km: 122, min: 128, cat: "business", body: null, inH: 112, pax: 4, bags: 4, why: "up into the mountains — nobody is based near it" },
];

console.log("── live trips (their log stays observed) ──\n");
let n = 0;
for (const t of LIVE) {
  const from = PLACES[t.from], to = PLACES[t.to];
  const pickupAt = new Date(NOW.getTime() + t.inH * HOUR);
  // ⚑ utcToParisLocal, NOT iso(). `iso()` is toISOString() — UTC — and the hour is
  // read as if it were local, which slid the night window by the zone offset and
  // mispriced 25 trips by 20% in silence ([[d124]]).
  const night = isNightPickup(utcToParisLocal(pickupAt));
  const quote = priceFor(cards, t.cat, t.body ?? "sedan", t.km, { night, at: NOW });
  if (!quote) { console.log(`skip ${t.why} — no rate card`); continue; }
  const bId = bizId(t.biz);
  const airport = !!(from.airport || to.airport);

  const { data: m, error } = await db.from("mission").insert({
    business_id: bId, dispatcher_id: deskFor(bId),
    status: "pooled", mission_type: "transfer", category: t.cat,
    zone: from.zone,
    pickup_address: from.address, pickup_lat: from.lat, pickup_lng: from.lng, pickup_label: from.label,
    dropoff_address: to.address, dropoff_lat: to.lat, dropoff_lng: to.lng, dropoff_label: to.label,
    pickup_at: iso(pickupAt),
    flight_number: airport ? `${AIRLINES[n % AIRLINES.length]}${1200 + n * 37}` : null,
    flight_eta: airport ? iso(new Date(pickupAt.getTime() - 35 * MIN)) : null,
    passenger_names: [GUESTS[n % GUESTS.length]],
    pax_count: t.pax, luggage_count: t.bags, luggage_only: !!t.lugOnly,
    required_body_type: t.body,
    comment: n % 3 === 0 ? NOTES[n % NOTES.length] : null,
    distance_km: t.km, duration_min: t.min,
    base_fare: round2(quote.floor), ceiling: round2(quote.ceiling), pdp_start: round2(quote.floor),
    speed_win: t.inH < 30, night_applied: night, rate_card_id: quote.rateCardId,
    commission_business_rate: RATES.business_rate_ht,
    commission_driver_rate: RATES.driver_rate_ht,
    commission_vat_rate: RATES.fee_vat_rate,
    // created_at is left to default: this trip really was posted just now.
  }).select("id").single();
  if (error) { console.log(`FAIL ${t.why}: ${error.message}`); continue; }
  n++;
  console.log(`  ${from.label} → ${to.label}`);
  console.log(`    ${t.cat}${t.body ? "/" + t.body : ""} · in ${t.inH}h · ${round2(quote.ceiling)} € · ${t.why}`);
}

const { count: obs } = await db.from("mission_event").select("*", { count: "exact", head: true }).eq("source", "db_trigger");
console.log(`\n${n} live trips · ${obs} genuinely observed events in the log`);
