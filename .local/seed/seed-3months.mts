// S68 — three months of trading, built to be tested against.
//
// ⚑ WHY IT DRIVES REAL STATUS TRANSITIONS INSTEAD OF INSERTING FINAL STATES.
// The event log's trigger sits below every write path and computes things no
// hand-written row would get right: `repooled` vs `pooled`, `no_show` vs
// `completed`, the from/to payload. So every trip here is posted and then walked
// — pooled → confirmed → en route → arrived → aboard → finished — one UPDATE per
// step, exactly as the app does it.
//
// ⚑ AND WHY THE EVENTS ARE THEN RE-STAMPED. `mission_event.occurred_at` defaults
// to clock_timestamp(), so walking three months of history writes a log in which
// everything happened this afternoon. The fix is to correct the time AND to stop
// calling the row observed: each seeded event becomes source='seed'. Leaving them
// labelled 'db_trigger' would have manufactured exactly the kind of lie that
// D86–D92 are all instances of — data that reads as evidence and isn't.
//
// The trips that are genuinely live right now (posted today, for pickups in the
// next few days) are NOT re-stamped. Their events are real, observed, and stay
// 'db_trigger', so the observed path has something true to exercise.
//
//   npx tsx .local/seed/seed-3months.mts
//   npx tsx .local/seed/seed-3months.mts --undo
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { PLACES, BASES, LEGS, DRIVERS, BUSINESSES, GUESTS, AIRLINES, NOTES } from "./riviera.mts";
import { priceFor, isNightPickup, RATE_CARD_COLS } from "../../lib/rate-card.ts";
import { currentFare, openingPrice } from "../../lib/pdp.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const UNDO = process.argv.includes("--undo");
// ⚑ FROM .env.local, NOT A LITERAL. This one opens 15 of the 25 accounts on the
// live project — every seeded Driver and hotel desk. It was never in git, and the
// only reason it is not public today is that .local was untracked; the moment that
// folder is committed a literal here becomes a published login. Set SEED_PASSWORD.
const PASSWORD = env.SEED_PASSWORD;
if (!PASSWORD) throw new Error("SEED_PASSWORD is not in .env.local — the seeded accounts cannot be created or signed in to");

// ── deterministic randomness ────────────────────────────────────────────────
// A seeded PRNG, so the same command always builds the same world. A dataset you
// cannot reproduce is one you cannot compare a bug against.
let SEED = 20260826;
const rnd = () => {
  SEED = (SEED * 1664525 + 1013904223) % 4294967296;
  return SEED / 4294967296;
};
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const chance = (p: number) => rnd() < p;
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

// ── the window ──────────────────────────────────────────────────────────────
const NOW = new Date();
const DAY = 86_400_000;
const WINDOW_DAYS = 92;
const START = new Date(NOW.getTime() - WINDOW_DAYS * DAY);
const iso = (d: Date) => d.toISOString();
const dayOf = (n: number) => new Date(START.getTime() + n * DAY);

if (UNDO) {
  console.log("Use .local/seed/bleach.mts --confirm — it removes everything this created, and more.");
  process.exit(0);
}

// ── config the app cannot run without ───────────────────────────────────────
const { data: cards } = await db.from("rate_card").select(RATE_CARD_COLS);
const { data: comm } = await db.from("commission_rate").select("*").order("effective_from", { ascending: false }).limit(1);
const RATES = comm?.[0];
if (!cards?.length || !RATES) { console.error("No rate_card / commission_rate — did the bleach take too much?"); process.exit(1); }
console.log(`config: ${cards.length} rate cards · commission ${RATES.business_rate_ht}/${RATES.driver_rate_ht}\n`);

// ── people ──────────────────────────────────────────────────────────────────
async function makeUser(email: string, role: "driver" | "dispatcher"): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`auth ${email}: ${error?.message}`);
  // profile.auth_user_id is the PK and FKs to auth.users; the role is what
  // routeFor() branches on, so a user without one lands on /welcome forever.
  const { error: pErr } = await db.from("profile").upsert({ auth_user_id: data.user.id, role });
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`);
  return data.user.id;
}

console.log("── hotels ──");
const bizIds: string[] = [];
const desks: { id: string; businessId: string; name: string }[] = [];
for (const b of BUSINESSES) {
  const p = PLACES[b.place];
  const { data: biz, error } = await db.from("business").insert({
    name: b.name,
    legal_name: b.legalName,
    siret: b.siret || null,
    vat_number: b.vat || null,
    registered_address: p.address,
    business_address: p.address,
    business_address_lat: p.lat,
    business_address_lng: p.lng,
    business_address_label: p.label,
    reception_phone: b.phone,
    billing_email: b.email,
    field_of_activity: "hotel",
    business_type: "hotel",
    default_vehicle_category: b.defaultCategory,
    prefill_pickup: true,
    created_at: iso(dayOf(b.joinDay)),
  }).select("id").single();
  if (error) throw new Error(`business ${b.name}: ${error.message}`);
  bizIds.push(biz.id);
  for (const d of b.desks) {
    const uid = await makeUser(d.email, "dispatcher");
    const { data: disp, error: dErr } = await db.from("dispatcher").insert({
      business_id: biz.id, auth_user_id: uid, name: d.name, email: d.email, phone: d.phone,
      created_at: iso(dayOf(b.joinDay)),
    }).select("id").single();
    if (dErr) throw new Error(`dispatcher ${d.email}: ${dErr.message}`);
    desks.push({ id: disp.id, businessId: biz.id, name: d.name });
  }
  console.log(`  ${b.name} · ${b.desks.length} desk(s) · joined day ${b.joinDay}`);
}

console.log("\n── drivers ──");
interface Fleet { id: string; spec: (typeof DRIVERS)[number]; joinedAt: Date }
const fleet: Fleet[] = [];
for (const d of DRIVERS) {
  const uid = await makeUser(d.email, "driver");
  const base = BASES[d.base];
  const joinedAt = dayOf(d.joinDay);
  const { data: drv, error } = await db.from("driver").insert({
    auth_user_id: uid,
    first_name: d.first, last_name: d.last,
    email: d.email,
    phone: `+33 6 ${intBetween(10, 99)} ${intBetween(10, 99)} ${intBetween(10, 99)} ${intBetween(10, 99)}`,
    verified: d.verified,
    base_lat: base.lat, base_lng: base.lng, base_label: base.label,
    service_radius_km: d.radius,
    accepts_luggage_runs: d.luggage,
    // ⚑ Filled because the Driver typed it in, NOT because anything reads it.
    // Nothing in the app or the schema consults operational_zones ([[d92]]);
    // seeding it keeps the console's "recorded, but decides nothing" honest —
    // an empty column would make that sentence look like a data gap instead.
    operational_zones: ["Nice", "Cannes", "Antibes", "Monaco"],
    languages: d.languages,
    siret: d.verified ? String(intBetween(30000000000000, 89999999999999)) : null,
    created_at: iso(joinedAt),
  }).select("id").single();
  if (error) throw new Error(`driver ${d.email}: ${error.message}`);

  const { error: vErr } = await db.from("vehicle").insert({
    driver_id: drv.id, category: d.category, body_type: d.body,
    make: d.make, model: d.model, colour: d.colour, plate: d.plate, seats: d.seats,
    is_active: true, created_at: iso(joinedAt),
  });
  if (vErr) throw new Error(`vehicle ${d.email}: ${vErr.message}`);

  fleet.push({ id: drv.id, spec: d, joinedAt });
  console.log(`  ${d.first} ${d.last} · ${d.category}/${d.body} · ${base.label} ${d.radius}km · ${d.verified ? "verified" : "NOT verified"}`);
}

fs.writeFileSync(".local/seed/_manifest.json", JSON.stringify({ bizIds, desks, fleet: fleet.map((f) => ({ id: f.id, email: f.spec.email })) }, null, 2));
console.log(`\n${bizIds.length} hotels · ${desks.length} desks · ${fleet.length} Drivers`);
