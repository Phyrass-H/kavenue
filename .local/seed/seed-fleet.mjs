// Seed a realistic three-month archive for the demo Business, so the Spend page
// can be tested like a real hotel. READ THE HEADER BEFORE RUNNING.
//
//   node seed-fleet.mjs          → create everything, write seed-manifest.json
//   node seed-fleet.mjs --undo   → delete exactly what the manifest lists
//
// Rules this script holds itself to:
//  · Everything it creates is recorded in seed-manifest.json. Cleanup deletes by
//    id, never by a pattern, so it can't take a real row with it.
//  · Nothing pre-existing is touched. The Business's own 28 missions, its real
//    Dispatcher and the demo Driver are read and left alone.
//  · Every mission is in the PAST, so the Pool and today's Schedule stay clean.
//  · Money is computed with the app's own rules (the PDP curve, the D45 cancel
//    ramp, the D48 waiting model) — no invented figures.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const HERE = new URL(".", import.meta.url).pathname;
const MANIFEST = `${HERE}seed-manifest.json`;
const ENV = "/Users/phyrasshaidar/Documents/02_Cactus/Kavenue/Kavenue_project_dev/.env.local";

const env = Object.fromEntries(
  readFileSync(ENV, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("Missing SUPABASE URL / SERVICE_ROLE_KEY in .env.local");
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

// ------------------------------------------------------------------ determinism
let SEED = 20260808;
const rnd = () => ((SEED = (SEED * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const chance = (p) => rnd() < p;
const round2 = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------- the fleet
const DRIVERS = [
  { first: "Marc", last: "Fontaine", cat: "business", body: "sedan", make: "Mercedes", model: "Classe E", colour: "Noir", plate: "AB-482-CD" },
  { first: "Sofia", last: "Berger", cat: "business", body: "sedan", make: "BMW", model: "Série 5", colour: "Gris", plate: "EF-731-GH" },
  { first: "Karim", last: "Nasri", cat: "business", body: "van", make: "Mercedes", model: "Classe V", colour: "Noir", plate: "IJ-905-KL", luggage: true },
  { first: "Élodie", last: "Marchand", cat: "eco", body: "sedan", make: "Peugeot", model: "508", colour: "Bleu", plate: "MN-264-OP" },
  { first: "Thomas", last: "Rey", cat: "luxury", body: "sedan", make: "Mercedes", model: "Classe S", colour: "Noir", plate: "QR-118-ST" },
  { first: "Nadia", last: "Bouchard", cat: "business", body: "van", make: "Volkswagen", model: "Multivan", colour: "Gris", plate: "UV-673-WX", luggage: true },
];

const DESKS = ["Concierge — day", "Concierge — night", "Events desk"];

const HOTEL = { a: "5 Prom. des Anglais, 06000 Nice, France", label: "Le Grand Hôtel" };
const PLACES = [
  { a: "Aéroport Nice Côte d'Azur, Terminal 2, 06200 Nice, France", label: "Aéroport Nice T2", airport: true, w: 26 },
  { a: "Aéroport Nice Côte d'Azur, Terminal 1, 06200 Nice, France", label: "Aéroport Nice T1", airport: true, w: 14 },
  { a: "Pl. du Casino, 98000 Monaco, Monaco", label: "Monaco", w: 12 },
  { a: "58 Bd de la Croisette, 06400 Cannes, France", label: "Cannes Croisette", w: 14 },
  { a: "Bd J. F. Kennedy, 06160 Antibes, France", label: "Antibes", w: 8 },
  { a: "Av. Thiers, 06000 Nice, France", label: "Gare de Nice-Ville", w: 8 },
  { a: "Port Hercule, 98000 Monaco, Monaco", label: "Port Hercule", w: 5 },
  { a: "Rue des Moulins, 06600 Antibes, France", label: "Port Vauban", w: 5 },
  { a: "Aéroport Cannes-Mandelieu, 06150 Cannes, France", label: "Cannes-Mandelieu", airport: true, w: 4 },
  { a: "Villa Ephrussi, 06230 Saint-Jean-Cap-Ferrat, France", label: "Cap-Ferrat", w: 4 },
];
const weighted = (list) => {
  const total = list.reduce((s, p) => s + p.w, 0);
  let r = rnd() * total;
  for (const p of list) if ((r -= p.w) <= 0) return p;
  return list[0];
};

const FIRST = ["M.", "Mme", "Mr", "Mrs", "Dr"];
const NAMES = [
  ["Laurent", "Dubois"], ["Anna", "Kovacs"], ["Hiroshi", "Tanaka"], ["Elena", "Rossi"],
  ["James", "Whitfield"], ["Sofia", "Marín"], ["Omar", "Haddad"], ["Clara", "Meunier"],
  ["Lukas", "Brandt"], ["Priya", "Raman"], ["Nina", "Berg"], ["Paul", "Girard"],
  ["Isabelle", "Fontaine"], ["Viktor", "Petrov"], ["Grace", "O'Neill"], ["Marco", "Bianchi"],
];
const FLIGHTS = ["AF1402", "BA334", "LH1078", "EK077", "AF7702", "U26541", "LX582", "QR039"];
const REFS = ["Room 214", "Room 512", "Suite 4", "Room 108", "Events", "Room 315", "Crew", "Suite 2", "Room 402", ""];

// ------------------------------------------------------------------ money rules
// D45 ramp, mirrored from lib/cancellation.ts. Free while pooled or >5h out;
// 50% at −5h, +10%/h, 100% at pickup.
function businessCancelPct(hoursToPickup, hasDriver) {
  if (!hasDriver) return 0;
  if (hoursToPickup > 5) return 0;
  if (hoursToPickup < 0) return 100;
  return Math.min(100, Math.max(50, 50 + 10 * (5 - hoursToPickup)));
}
// The §6 curve, frozen at accept — a port of lib/pdp.ts settledFare(). This file
// is plain .mjs and cannot import the TS module, so it is a COPY: change one,
// change the other, or a seeded fleet stops matching what the app renders.
const PDP_TOP_LEAD_MS = 5 * 3600_000;
const PDP_HORIZON_MS = 14 * 24 * 3600_000;
function pdpSeed(id) {
  let h = 1779033703 ^ id.length;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function pdpRandom(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function settledFare(m) {
  const ceiling = Number(m.ceiling);
  const floor = m.pdp_start != null ? Number(m.pdp_start) : ceiling * 0.5;
  const open = Math.min(m.speed_win ? Math.max(floor, ceiling * 0.7) : floor, ceiling);
  const gap = ceiling - open;
  if (!(gap > 0)) return round2(Math.min(open, ceiling));

  const pickup = new Date(m.pickup_at).getTime();
  const opensAt = Math.max(new Date(m.pooled_at ?? m.created_at).getTime(), pickup - PDP_HORIZON_MS);
  const lead = pickup - opensAt;
  if (!(lead > 0)) return round2(ceiling);
  const topLead = lead > PDP_TOP_LEAD_MS ? PDP_TOP_LEAD_MS : lead / 2;

  const now = m.accepted_at ? new Date(m.accepted_at).getTime() : Date.now();
  const remaining = pickup - now;
  if (remaining <= topLead) return round2(ceiling);
  if (remaining >= lead) return round2(open);
  const u = Math.log(lead / remaining) / Math.log(lead / topLead);

  const n = Math.min(60, Math.max(8, Math.round(gap / 2)));
  const rand = pdpRandom(pdpSeed(m.id));
  const positions = [0];
  for (let k = 1; k < n; k++) positions.push((k + (rand() * 2 - 1) * 0.45) / n);
  positions.push(1);
  let taken = 0;
  for (let i = 0; i < positions.length; i++) if (positions[i] <= u) taken = i;
  return round2(open + gap * positions[taken]);
}

// ⚑ Every mission row must carry the SAME KEY SET. PostgREST inserts a batch as
// one statement, so a key present on only some objects is written as NULL on the
// rest — which is exactly how the first run died on `stops_reached` (NOT NULL).
// Rows are spread over this template so the shape is uniform by construction.
const MISSION_NULLS = {
  driver_id: null, zone: null, flight_number: null, flight_eta: null,
  guest_ready_at: null, passenger_name: null, passenger_names: null,
  pax_count: null, luggage_count: null, reference: null, comment: null,
  pickup_lat: null, pickup_lng: null, dropoff_lat: null, dropoff_lng: null,
  pickup_label: null, dropoff_label: null, waypoints: null, stops_reached: 0,
  required_body_type: null, required_make: null, required_model: null,
  required_languages: null, dress_code: null, driver_flags: null,
  board_name: null, board_file_path: null, driver_message: null,
  distance_km: null, duration_min: null, base_fare: null,
  cancelled_by: null, cancelled_at: null, cancellation_fee: null,
  cancellation_reason: null, accepted_at: null, confirmed_at: null,
  checked_in_at: null, info_edited_at: null, pooled_at: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null,
  waiting_rate: null, waiting_fee: null, luggage_only: false,
  mission_type: "transfer", speed_win: false, group_id: null,
};

// --------------------------------------------------------------------- helpers
const iso = (d) => new Date(d).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

async function undo() {
  if (!existsSync(MANIFEST)) throw new Error("No seed-manifest.json — nothing recorded to undo.");
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  console.log(`Removing ${m.missions.length} missions, ${m.drivers.length} drivers, ${m.dispatchers.length} desks…`);

  for (let i = 0; i < m.missions.length; i += 100) {
    const chunk = m.missions.slice(i, i + 100);
    const { error } = await db.from("mission").delete().in("id", chunk);
    if (error) throw error;
  }
  // Belt and braces: anything still hanging off a seeded desk, recorded or not.
  if (m.dispatchers.length) await db.from("mission").delete().in("dispatcher_id", m.dispatchers);
  if (m.vehicles.length) await db.from("vehicle").delete().in("id", m.vehicles);
  if (m.drivers.length) await db.from("driver").delete().in("id", m.drivers);
  if (m.dispatchers.length) await db.from("dispatcher").delete().in("id", m.dispatchers);
  for (const uid of m.authUsers) await db.auth.admin.deleteUser(uid).catch(() => {});

  const { count } = await db
    .from("mission")
    .select("id", { count: "exact", head: true })
    .eq("business_id", m.businessId);
  console.log(`Done. ${m.businessId} is back to ${count} missions (baseline was ${m.baselineMissions}).`);
  writeFileSync(MANIFEST, JSON.stringify({ ...m, undoneAt: new Date().toISOString() }, null, 2));
}

async function seed() {
  if (existsSync(MANIFEST)) {
    const prev = JSON.parse(readFileSync(MANIFEST, "utf8"));
    if (!prev.undoneAt) throw new Error("A seed is already live. Run --undo first.");
  }

  // ---- find the demo Business, and protect what's already there ------------
  const { data: businesses } = await db.from("business").select("id, name");
  const counts = await Promise.all(
    (businesses ?? []).map(async (b) => {
      const { count } = await db
        .from("mission")
        .select("id", { count: "exact", head: true })
        .eq("business_id", b.id);
      return { ...b, count: count ?? 0 };
    }),
  );
  const target = counts.sort((a, b) => b.count - a.count)[0];
  if (!target) throw new Error("No business found.");
  console.log(`Business: ${target.name} (${target.count} existing missions — untouched)`);

  const manifest = {
    createdAt: new Date().toISOString(),
    businessId: target.id,
    businessName: target.name,
    baselineMissions: target.count,
    authUsers: [],
    drivers: [],
    vehicles: [],
    dispatchers: [],
    missions: [],
  };

  // ---- Drivers (auth user → driver → vehicle) ------------------------------
  const drivers = [];
  for (const d of DRIVERS) {
    const email = `seed.${d.first.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")}@kavenue.test`;
    const { data: au, error: ae } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { seeded: true },
    });
    if (ae) throw ae;
    manifest.authUsers.push(au.user.id);

    const { data: drv, error: de } = await db
      .from("driver")
      .insert({
        auth_user_id: au.user.id,
        first_name: d.first,
        last_name: d.last,
        phone: `+336${String(Math.floor(between(10000000, 99999999)))}`,
        email,
        operational_zones: ["Nice", "Cannes", "Antibes", "Monaco"],
        accepts_luggage_runs: !!d.luggage,
        verified: true,
      })
      .select("id")
      .single();
    if (de) throw de;
    manifest.drivers.push(drv.id);

    const { data: veh } = await db
      .from("vehicle")
      .insert({
        driver_id: drv.id,
        category: d.cat,
        body_type: d.body,
        make: d.make,
        model: d.model,
        colour: d.colour,
        plate: d.plate,
        is_active: true,
      })
      .select("id")
      .single();
    if (veh) manifest.vehicles.push(veh.id);

    drivers.push({ ...d, id: drv.id });
  }
  console.log(`Drivers: ${drivers.length}`);

  // ---- Desks ---------------------------------------------------------------
  const desks = [];
  for (const name of DESKS) {
    const email = `seed.desk.${desks.length + 1}@kavenue.test`;
    const { data: au, error: ae } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { seeded: true },
    });
    if (ae) throw ae;
    manifest.authUsers.push(au.user.id);
    const { data: dp, error: pe } = await db
      .from("dispatcher")
      .insert({ business_id: target.id, auth_user_id: au.user.id, name, email })
      .select("id")
      .single();
    if (pe) throw pe;
    manifest.dispatchers.push(dp.id);
    desks.push({ id: dp.id, name, w: name.includes("day") ? 6 : name.includes("night") ? 3 : 1 });
  }
  console.log(`Desks: ${desks.length}`);

  // ---- Missions ------------------------------------------------------------
  const now = Date.now();
  const rows = [];
  const PER_MONTH = 70;
  const DAYS = 92;

  for (let dayBack = DAYS; dayBack >= 1; dayBack -= 1) {
    const date = new Date(now - dayBack * DAY);
    const dow = date.getUTCDay();
    // A hotel's week: busier Thu–Sun, quieter Mon–Wed.
    const base = (PER_MONTH * 12) / 365;
    const load = base * (dow === 0 || dow >= 4 ? 1.35 : 0.75);
    const n = Math.max(0, Math.round(load + between(-1.2, 1.2)));

    for (let k = 0; k < n; k += 1) {
      const outbound = chance(0.52);
      const other = weighted(PLACES);
      const from = outbound ? HOTEL : other;
      const to = outbound ? other : HOTEL;
      const airport = other.airport && (outbound || chance(0.85));

      // Pickup time: airport runs skew early/late, city runs cluster evenings.
      const hour = airport ? Math.round(between(5, 22)) : Math.round(between(8, 23));
      const pickup = new Date(date);
      pickup.setUTCHours(hour, pick([0, 10, 15, 20, 30, 40, 45, 50]), 0, 0);
      const pickupMs = pickup.getTime();
      if (pickupMs > now) continue;

      const driver = pick(drivers);
      const cat = chance(0.08) ? "luxury" : chance(0.16) ? "eco" : "business";
      const luggageOnly = chance(0.05);
      const body = luggageOnly ? "van" : chance(0.18) ? "van" : "sedan";

      // Ceiling: distance-ish by destination, plus class.
      const far = ["Monaco", "Cannes Croisette", "Cannes-Mandelieu", "Cap-Ferrat"].includes(other.label);
      const mid = ["Antibes", "Port Vauban", "Port Hercule"].includes(other.label);
      let ceiling = far ? between(120, 190) : mid ? between(85, 130) : between(60, 105);
      if (cat === "luxury") ceiling *= 1.45;
      if (cat === "eco") ceiling *= 0.78;
      if (body === "van") ceiling *= 1.15;
      ceiling = Math.round(ceiling / 5) * 5;

      // Booked between 2h and 9 days ahead; the PDP climbs from posting.
      const lead = chance(0.18) ? between(1, 5) * HOUR : between(6, 216) * HOUR;
      const createdAt = pickupMs - lead;
      const speedWin = lead < 24 * HOUR;
      // ⚑ STALE, and knowingly so. Under the §6 curve pdp_start is the trip's
      // rate-card FLOOR, and this file still invents one from the ceiling — it
      // also hand-sets that ceiling and writes no commission snapshot. All three
      // are the re-seed job (founder sequenced it AFTER the curve); .local/seed/
      // s61-priced.ts is the worked example of seeding through mission_price()
      // and courseFromBusinessTotal. Until then a seeded fleet is priced
      // plausibly, not correctly. 0.45 is roughly where the real floors sit
      // against the real ceilings, so the fleet at least looks right.
      const pdpStart = round2(ceiling * 0.45);

      // How long it sat in the Pool before someone took it.
      const filled = !chance(0.075); // ~7.5% never filled
      const tookMin = chance(0.55) ? between(1, 25) : between(25, 60 * 14);
      const acceptedAt = filled ? Math.min(createdAt + tookMin * 60000, pickupMs - 5 * 60000) : null;

      const [ti, ln] = pick(NAMES);
      const guest = `${pick(FIRST)} ${ti} ${ln}`;
      const paxCount = luggageOnly ? null : Math.max(1, Math.round(between(1, body === "van" ? 6 : 3)));

      const m = {
        ...MISSION_NULLS,
        id: randomUUID(),
        business_id: target.id,
        dispatcher_id: weighted(desks).id,
        category: cat,
        required_body_type: body,
        luggage_only: luggageOnly,
        pickup_address: from.a,
        pickup_label: from.label,
        dropoff_address: to.a,
        dropoff_label: to.label,
        zone: from.label,
        pickup_at: iso(pickupMs),
        flight_number: airport && chance(0.8) ? pick(FLIGHTS) : null,
        passenger_name: luggageOnly ? null : guest,
        passenger_names: luggageOnly
          ? null
          : [{ first: ti, last: ln, main: true }],
        pax_count: paxCount,
        luggage_count: luggageOnly ? Math.round(between(4, 12)) : Math.round(between(0, 4)),
        reference: pick(REFS) || null,
        base_fare: pdpStart,
        ceiling,
        pdp_start: pdpStart,
        pdp_step: null,
        pdp_interval: null,
        speed_win: speedWin,
        distance_km: round2(far ? between(22, 48) : mid ? between(12, 26) : between(6, 18)),
        duration_min: Math.round(far ? between(30, 65) : mid ? between(18, 38) : between(10, 28)),
        created_at: iso(createdAt),
        accepted_at: acceptedAt ? iso(acceptedAt) : null,
        confirmed_at: acceptedAt ? iso(acceptedAt) : null,
        driver_id: acceptedAt ? driver.id : null,
        status: "pooled",
      };

      if (!filled) {
        // Nobody took it. The sweep would have expired it; do the same here.
        m.status = "expired";
        m.driver_id = null;
        m.accepted_at = null;
        m.confirmed_at = null;
        rows.push(m);
        continue;
      }

      const fare = settledFare(m);
      const roll = rnd();

      if (roll < 0.07) {
        // Business cancelled it — fee by the D45 ramp at the moment of cancelling.
        const hoursOut = between(0.4, 26);
        const cancelledAt = pickupMs - hoursOut * HOUR;
        const pct = businessCancelPct(hoursOut, true);
        m.status = "cancelled";
        m.cancelled_by = "business";
        m.cancelled_at = iso(Math.max(cancelledAt, new Date(m.accepted_at).getTime() + 60000));
        m.cancellation_fee = round2((fare * pct) / 100);
        m.cancellation_reason = pick([
          "Guest changed plans",
          "Flight cancelled",
          "Booked in error",
          "Guest arranged their own car",
        ]);
      } else if (roll < 0.12) {
        // The Guest never came down. Charged in full, plus the waiting that ran.
        const isAirport = airport;
        const courtesy = isAirport ? 60 : 20;
        const waited = Math.round(between(courtesy + 5, courtesy + (isAirport ? 55 : 38)));
        const billable = Math.min(waited - courtesy, isAirport ? 60 : 40);
        m.status = "completed";
        m.no_show = true;
        m.no_show_at = iso(pickupMs + waited * 60000);
        m.no_show_by = chance(0.7) ? "driver" : "business";
        m.waiting_from = iso(pickupMs + courtesy * 60000);
        m.waiting_to = iso(pickupMs + waited * 60000);
        m.waiting_minutes = billable;
        m.waiting_rate = 1;
        m.waiting_fee = round2(billable * 1);
        m.stops_reached = 0;
      } else if (roll < 0.17) {
        // A Driver took it and never closed it (§ Q). Agreed, not settled.
        m.status = chance(0.5) ? "confirmed" : "on_board";
        m.checked_in_at = iso(pickupMs - between(0.6, 2.8) * HOUR);
      } else {
        m.status = "completed";
        m.checked_in_at = iso(pickupMs - between(0.4, 2.9) * HOUR);
        // ~1 in 7 had the Driver waiting past the courtesy window.
        if (chance(0.14)) {
          const isAirport = airport;
          const courtesy = isAirport ? 60 : 20;
          const waited = Math.round(between(courtesy + 3, courtesy + (isAirport ? 40 : 30)));
          const billable = Math.min(waited - courtesy, isAirport ? 60 : 40);
          m.waiting_from = iso(pickupMs + courtesy * 60000);
          m.waiting_to = iso(pickupMs + waited * 60000);
          m.waiting_minutes = billable;
          m.waiting_rate = 1;
          m.waiting_fee = round2(billable * 1);
        }
      }

      rows.push(m);
    }
  }

  // Written before the missions go in: if the insert dies half-way, --undo still
  // knows about every driver, vehicle, desk and auth user already created.
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  console.log(`Inserting ${rows.length} missions…`);
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await db.from("mission").insert(chunk);
    if (error) throw error;
    manifest.missions.push(...chunk.map((r) => r.id));
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  }

  // status_event rows for the completed ones, so the timeline isn't empty.
  const events = [];
  for (const m of rows) {
    if (m.status !== "completed" || m.no_show) continue;
    const p = new Date(m.pickup_at).getTime();
    events.push(
      { mission_id: m.id, status: "en_route", created_at: iso(p - 25 * 60000) },
      { mission_id: m.id, status: "arrived", created_at: iso(p - 5 * 60000) },
      { mission_id: m.id, status: "on_board", created_at: iso(p + 4 * 60000) },
      { mission_id: m.id, status: "completed", created_at: iso(p + (m.duration_min ?? 25) * 60000) },
    );
  }
  for (let i = 0; i < events.length; i += 200) {
    await db.from("status_event").insert(events.slice(i, i + 200));
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  // ---- what we made -------------------------------------------------------
  const tally = rows.reduce((acc, r) => {
    const k = r.status === "completed" ? (r.no_show ? "no-show" : "completed") : r.status;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  let settled = 0;
  for (const r of rows) {
    if (r.status === "completed") settled += settledFare(r) + Number(r.waiting_fee ?? 0);
    if (r.status === "cancelled") settled += Number(r.cancellation_fee ?? 0);
  }
  console.log("\nSeeded:", tally);
  console.log(`Settled spend across 3 months: ${settled.toFixed(2)} €`);
  console.log(`Manifest: ${MANIFEST}`);
}

const mode = process.argv.includes("--undo") ? undo : seed;
mode().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  console.error("Run with --undo to remove anything already created.");
  process.exit(1);
});
