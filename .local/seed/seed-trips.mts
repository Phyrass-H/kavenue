// S68 — three months of trips. Run AFTER seed-3months.mts (it reads its manifest).
//
// ⚑ EVERY TRIP IS WALKED, NOT INSERTED FINISHED. One UPDATE per status change,
// exactly as the app does it, so the log trigger computes the event types itself
// — `repooled` vs `pooled`, `no_show` vs `completed`, the from/to payload. A
// hand-written log would get those subtly wrong and nobody would notice.
//
// ⚑ THE DRIVER ON A TRIP IS ALWAYS ONE WHO COULD ACTUALLY HAVE TAKEN IT. Right
// class, right body, inside their radius, signed up before it was posted, and no
// other trip within ±90 minutes. Otherwise the console's own matcher would open
// a finished trip and report that the Driver who drove it was never eligible —
// incoherent data that would read as a bug in the rules.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { PLACES, LEGS, DRIVERS, BUSINESSES, GUESTS, AIRLINES, NOTES } from "./riviera.mts";
import { priceFor, isNightPickup, RATE_CARD_COLS } from "../../lib/rate-card.ts";
import { utcToParisLocal } from "../../lib/time.ts";
import { currentFare, openingPrice } from "../../lib/pdp.ts";
import { haversineKm } from "../../lib/geo.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let SEED = 771103;
const rnd = () => { SEED = (SEED * 1664525 + 1013904223) % 4294967296; return SEED / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const chance = (p: number) => rnd() < p;
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const round2 = (n: number) => Math.round(n * 100) / 100;

const DAY = 86_400_000, MIN = 60_000, HOUR = 3_600_000;
const NOW = new Date();
const START = new Date(NOW.getTime() - 92 * DAY);
const iso = (d: Date) => d.toISOString();
const dayOf = (n: number) => new Date(START.getTime() + n * DAY);

const manifest = JSON.parse(fs.readFileSync(".local/seed/_manifest.json", "utf8"));
const { data: cards } = await db.from("rate_card").select(RATE_CARD_COLS);
if (!cards) throw new Error("the rate_card read came back null — there is no card to price a single trip with");
// ⚑ A SECOND BINDING, AND IT IS NOT REDUNDANT. The guard above narrows `cards`,
// but TypeScript will not carry that narrowing into a hoisted `function`
// declaration — the function could be called before the guard runs, as far as the
// compiler knows. So the call site below saw `RateCardRow[] | null` again.
// Binding the narrowed value to a const is what makes the guard reach it.
const CARDS = cards;
const { data: commRows } = await db.from("commission_rate").select("*").order("effective_from", { ascending: false }).limit(1);
if (!commRows || !commRows.length) throw new Error("commission_rate has no rows — every mission stamps its commission from the newest one at creation");
const RATES = commRows[0];
const { data: bizRows } = await db.from("business").select("id, name, created_at");
const { data: driverRows } = await db.from("driver").select("id, first_name, last_name, base_lat, base_lng, service_radius_km, accepts_luggage_runs, created_at");
const { data: vehRows } = await db.from("vehicle").select("driver_id, category, body_type");
const { data: deskRows } = await db.from("dispatcher").select("id, business_id, name");

const FLEET = (driverRows ?? []).map((d) => {
  const spec = DRIVERS.find((s) => s.first === d.first_name && s.last === d.last_name);
  if (!spec) throw new Error(`${d.first_name} ${d.last_name} (${d.id}) is in the driver table but not in DRIVERS in riviera.mts — the seed reads their appetite from the spec`);
  const v = (vehRows ?? []).find((x) => x.driver_id === d.id);
  if (!v) throw new Error(`${d.first_name} ${d.last_name} (${d.id}) has no vehicle row — run .local/seed/seed-3months.mts first`);
  // ⚑ CHECKED HERE, BEFORE THE FIRST WRITE, and not down in `eligible()` where it
  // is first used. This file has no --undo and no cleanup block, so a throw during
  // the 92-day loop leaves half a seed in the live database with nothing to unwind
  // it. Every other precondition in this map is proved up front for the same
  // reason; a base is one more.
  //
  // ⚑ And it must NOT be a silent skip. `haversineKm(null, …)` measures from
  // 0°,0° — off the coast of Africa — so the Driver fails the radius test for a
  // reason that has nothing to do with the trip, and the mission is written as
  // `expired_no_taker`: fabricated evidence of the marketplace failing to match.
  // `.local/probe/s68-driver-bases.mts --undo` deliberately clears six Drivers'
  // bases, so this is a state the repo can really be in.
  if (d.base_lat == null || d.base_lng == null)
    throw new Error(`${d.first_name} ${d.last_name} (${d.id}) has no base_lat/base_lng — the radius rule cannot tell who could reach a pickup; run .local/probe/s68-driver-bases.mts before seeding`);
  return { row: { ...d, base_lat: d.base_lat, base_lng: d.base_lng }, spec, cat: v.category, body: v.body_type, joined: new Date(d.created_at).getTime() };
});
const BIZ = BUSINESSES.map((b) => {
  const row = (bizRows ?? []).find((r) => r.name === b.name);
  if (!row) throw new Error(`no Business named "${b.name}" — run .local/seed/seed-3months.mts first`);
  return {
    spec: b,
    row,
    desks: (deskRows ?? []).filter((r) => r.business_id === row.id),
  };
});

// ── the pool of legs each hotel actually sends people on ────────────────────
const legsFor = (placeKey: string) =>
  LEGS.filter(([a, b]) => a === placeKey || b === placeKey).map(([a, b, km, min]) =>
    a === placeKey ? { from: a, to: b, km, min } : { from: b, to: a, km, min });

/** Booked trips per Driver, so the ±90 minute clash rule can be honoured. */
const busy = new Map<string, number[]>();
const clashes = (driverId: string, at: number) =>
  (busy.get(driverId) ?? []).some((t) => Math.abs(t - at) <= 90 * MIN);

function eligible(catWanted: string, bodyWanted: string | null, lugOnly: boolean, pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }, pickupAt: number, postedAt: number) {
  return FLEET.filter((f) => {
    if (f.joined > postedAt) return false;                    // hadn't signed up yet
    if (f.cat !== catWanted) return false;
    if (bodyWanted && f.body !== bodyWanted) return false;
    if (lugOnly && !f.row.accepts_luggage_runs) return false;
    const r = f.row.service_radius_km ?? 50;
    // Bases are proved up front, next to FLEET — see the note there. By here they
    // are known to exist, so the radius rule can just measure.
    const near = Math.min(
      haversineKm(f.row.base_lat, f.row.base_lng, pickup.lat, pickup.lng),
      haversineKm(f.row.base_lat, f.row.base_lng, drop.lat, drop.lng),
    );
    if (near > r) return false;
    return !clashes(f.row.id, pickupAt);
  });
}

// ── what the log must be re-stamped to ──────────────────────────────────────
const trueTimes = new Map<string, number[]>();   // mission id → event times, in walk order
const extraEvents: Record<string, unknown>[] = [];
const record = (id: string, t: Date) => trueTimes.set(id, [...(trueTimes.get(id) ?? []), t.getTime()]);

async function step(id: string, patch: Record<string, unknown>, at: Date) {
  const { error } = await db.from("mission").update(patch).eq("id", id);
  if (error) throw new Error(`${id} ${JSON.stringify(patch)}: ${error.message}`);
  record(id, at);
}

function appEvent(missionId: string, businessId: string, driverId: string | null, type: string, at: Date, payload: Record<string, unknown> = {}, audience = ["business", "driver", "admin"]) {
  extraEvents.push({
    mission_id: missionId, business_id: businessId, driver_id: driverId,
    event_type: type, occurred_at: iso(at), actor_kind: "unknown",
    audience, source: "seed", payload,
  });
}

// ── volume: a growth curve, not a flat line ─────────────────────────────────
// An investor's first question is month over month; a flat seed answers it with
// a straight line, which is worse than no answer.
const TARGET = 340;
let made = 0, walked = 0;
/** ⚑ Every reason a trip was NOT created, counted. A seed that silently drops
 *  rows reports a smaller number and looks like a smaller month. */
const skipped = { noCard: 0, beforeWindow: 0 };
const outcomeTally: Record<string, number> = {};

console.log("── trips ──");
for (let day = 0; day < 92; day++) {
  // 0.55 at the start, 1.45 at the end — roughly a tripling across the quarter.
  const growth = 0.55 + (day / 92) * 0.9;
  for (const b of BIZ) {
    if (day < b.spec.joinDay) continue;
    const expected = (b.spec.weekly / 7) * growth;
    const n = Math.floor(expected) + (chance(expected % 1) ? 1 : 0);
    for (let k = 0; k < n && made < TARGET; k++) {
      if (await makeTrip(b, day)) made++;
    }
  }
  if (day % 20 === 19) console.log(`  day ${day + 1}/92 · ${made} trips`);
}

async function makeTrip(b: (typeof BIZ)[number], day: number): Promise<boolean> {
  const leg = pick(legsFor(b.spec.place));
  const from = PLACES[leg.from], to = PLACES[leg.to];
  const airport = !!(from.airport || to.airport);

  // Pickup time: airports skew early and late, town trips sit in the day.
  const hour = airport
    ? pick([6, 7, 8, 9, 10, 11, 14, 16, 17, 18, 19, 20, 21, 22])
    : pick([9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21]);
  const pickupAt = new Date(dayOf(day).getTime());
  pickupAt.setHours(hour, pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]), 0, 0);

  // Lead time — how far ahead hotels book. Mostly a day or two, sometimes weeks,
  // sometimes a panic an hour out.
  const leadH = chance(0.12) ? between(0.7, 4) : chance(0.55) ? between(5, 40) : between(48, 260);
  const postedAt = new Date(pickupAt.getTime() - leadH * HOUR);
  if (postedAt.getTime() < START.getTime()) { skipped.beforeWindow++; return false; }

  // Class: mostly the hotel's default, sometimes up, rarely down.
  const cat = chance(0.72) ? b.spec.defaultCategory : pick(["eco", "business", "luxury"] as const);
  const pax = airport ? intBetween(1, 4) : intBetween(1, 3);
  const bags = airport ? intBetween(1, 5) : intBetween(0, 2);
  const needsVan = pax > 4 || bags > 4;
  const body = needsVan ? "van" : chance(0.15) ? "sedan" : null;
  const lugOnly = chance(0.04) && airport;

  // ⚑ utcToParisLocal, NOT iso(). `iso()` is toISOString() — UTC — and the hour is
  // read as if it were local, which slid the night window by the zone offset and
  // mispriced 25 trips by 20% in silence ([[d124]]).
  const night = isNightPickup(utcToParisLocal(pickupAt));
  // ⚑ THE CARD IS LOOKED UP AT `NOW`, NOT AT THE HISTORICAL POST DATE — and that
  // is a real limitation worth writing down rather than hiding. Every rate_card
  // row is effective_from 2026-08-16, so asking for the card that applied in June
  // returns nothing and the trip silently prices at null. The first run of this
  // script lost 295 of 336 trips to exactly that, and the only symptom was a
  // smaller number than expected. Seeded history is therefore priced with
  // TODAY's card, which is the only card that has ever existed.
  const quote = priceFor(CARDS, cat, body ?? "sedan", leg.km, { night, at: NOW });
  if (!quote) { skipped.noCard++; return false; }
  const ceiling = round2(quote.ceiling);
  const floor = round2(quote.floor);
  const speedWin = chance(0.22);

  const guest = pick(GUESTS);
  const flight = airport && chance(0.75) ? `${pick(AIRLINES)}${intBetween(1000, 9899)}` : null;

  const { data: m, error } = await db.from("mission").insert({
    business_id: b.row.id,
    dispatcher_id: pick(b.desks).id,
    status: "pooled",
    mission_type: "transfer",
    category: cat,
    // ⚑ The town of the pickup, consistently. The old data put hotel names,
    // street addresses and terminals in here — 22 values for four towns — which
    // is why "trips by region" could not be answered at all.
    zone: from.zone,
    pickup_address: from.address, pickup_lat: from.lat, pickup_lng: from.lng, pickup_label: from.label,
    dropoff_address: to.address, dropoff_lat: to.lat, dropoff_lng: to.lng, dropoff_label: to.label,
    pickup_at: iso(pickupAt),
    flight_number: flight,
    flight_eta: flight ? iso(new Date(pickupAt.getTime() - intBetween(20, 55) * MIN)) : null,
    passenger_names: [guest],
    pax_count: pax, luggage_count: bags, luggage_only: lugOnly,
    required_body_type: body,
    comment: chance(0.25) ? pick(NOTES) : null,
    reference: chance(0.4) ? `${b.spec.name.slice(0, 3).toUpperCase()}-${intBetween(1000, 9999)}` : null,
    distance_km: leg.km, duration_min: leg.min,
    base_fare: floor, ceiling, pdp_start: floor, speed_win: speedWin,
    night_applied: night,
    rate_card_id: quote.rateCardId,
    // Stamped at creation, exactly where the app stamps them.
    commission_business_rate: RATES.business_rate_ht,
    commission_driver_rate: RATES.driver_rate_ht,
    commission_vat_rate: RATES.fee_vat_rate,
    created_at: iso(postedAt),
  }).select("id").single();
  if (error) throw new Error(`insert: ${error.message}`);

  // INSERT-as-pooled writes TWO events: created, then pooled.
  record(m.id, postedAt); record(m.id, postedAt);
  await walk(m.id, b, { from, to, leg, cat, body, lugOnly, pickupAt, postedAt, ceiling, floor, speedWin, guest, airport });
  return true;
}

async function walk(id: string, b: (typeof BIZ)[number], t: any) {
  const pickupMs = t.pickupAt.getTime();
  const pdp = { id, ceiling: t.ceiling, pdp_start: t.floor, speed_win: t.speedWin, pickup_at: iso(t.pickupAt), created_at: iso(t.postedAt) };

  const roll = rnd();
  const upcoming = pickupMs > NOW.getTime();

  // A trip whose pickup is still ahead can only be waiting or taken.
  const outcome = upcoming
    ? (roll < 0.62 ? "live_confirmed" : "live_pooled")
    : roll < 0.115 ? "expired"
    : roll < 0.165 ? "cancelled_business"
    : roll < 0.195 ? "walked_then_taken"
    : roll < 0.225 ? "cancelled_driver"
    : roll < 0.255 ? "no_show"
    : "completed";
  outcomeTally[outcome] = (outcomeTally[outcome] ?? 0) + 1;

  if (outcome === "expired") {
    // The sweep closes it out shortly after the pickup passes.
    await step(id, { status: "expired" }, new Date(pickupMs + intBetween(3, 40) * MIN));
    walked++;
    return;
  }

  if (outcome === "live_pooled") { walked++; return; }   // still sitting in the Pool

  // ── somebody takes it ─────────────────────────────────────────────────────
  const takers = eligible(t.cat, t.body, t.lugOnly, t.from, t.to, pickupMs, t.postedAt.getTime());
  if (!takers.length) {
    // Nobody could have taken it — so it honestly expires. This is the marketplace
    // failing, and it belongs in the data rather than being papered over.
    if (!upcoming) await step(id, { status: "expired" }, new Date(pickupMs + intBetween(3, 40) * MIN));
    outcomeTally[outcome]--; outcomeTally["expired_no_taker"] = (outcomeTally["expired_no_taker"] ?? 0) + 1;
    walked++;
    return;
  }
  takers.sort((x, y) => y.spec.appetite - x.spec.appetite);
  const driver = takers[Math.min(takers.length - 1, Math.floor(Math.abs(rnd() - rnd()) * takers.length))];

  const acceptAt = new Date(t.postedAt.getTime() + between(0.05, 0.85) * (pickupMs - t.postedAt.getTime()));
  const fare = round2(currentFare(pdp, acceptAt));
  busy.set(driver.row.id, [...(busy.get(driver.row.id) ?? []), pickupMs]);

  await step(id, {
    driver_id: driver.row.id, status: "confirmed",
    accepted_at: iso(acceptAt), confirmed_at: iso(acceptAt), accepted_fare: fare,
  }, acceptAt);

  if (outcome === "walked_then_taken" || outcome === "cancelled_driver") {
    // The Driver asks out, or simply drops it. Either way the trip goes back.
    const dropAt = new Date(acceptAt.getTime() + between(0.1, 0.6) * (pickupMs - acceptAt.getTime()));
    if (chance(0.4)) {
      // Through the proper door: a release request the hotel agreed to.
      const askAt = new Date(dropAt.getTime() - intBetween(20, 400) * MIN);
      const { data: rel } = await db.from("mission_release").insert({
        mission_id: id, driver_id: driver.row.id, status: "accepted",
        reason: pick(["Vehicle in the garage", "Family emergency", "Double-booked, sorry", "Sick"]),
        created_at: iso(askAt), responded_at: iso(dropAt),
      }).select("id").maybeSingle();
      if (rel) {
        appEvent(id, b.row.id, driver.row.id, "release_proposed", askAt, { reason: "asked to be let go" });
        appEvent(id, b.row.id, driver.row.id, "release_answered", dropAt, { answer: "accepted" });
      }
    }
    busy.set(driver.row.id, (busy.get(driver.row.id) ?? []).filter((x) => x !== pickupMs));

    if (outcome === "cancelled_driver") {
      await step(id, { status: "cancelled", cancelled_by: "driver", cancelled_at: iso(dropAt), cancellation_reason: "Driver cancelled" }, dropAt);
      await db.from("mission_cancellation").insert({
        mission_id: id, cancelled_by: "driver", cancelled_at: iso(dropAt),
        hours_before_pickup: round2((pickupMs - dropAt.getTime()) / HOUR),
        fee_amount: 0, reason: "Driver cancelled",
      });
      walked++;
      return;
    }

    // Back to the Pool → the trigger writes `repooled`, not `pooled`.
    await step(id, { driver_id: null, status: "pooled", accepted_at: null, confirmed_at: null, accepted_fare: null, checked_in_at: null }, dropAt);
    const again = eligible(t.cat, t.body, t.lugOnly, t.from, t.to, pickupMs, dropAt.getTime()).filter((f) => f.row.id !== driver.row.id);
    if (!again.length) {
      if (!upcoming) await step(id, { status: "expired" }, new Date(pickupMs + intBetween(3, 40) * MIN));
      walked++;
      return;
    }
    const second = pick(again);
    const retakeAt = new Date(dropAt.getTime() + between(0.05, 0.7) * (pickupMs - dropAt.getTime()));
    busy.set(second.row.id, [...(busy.get(second.row.id) ?? []), pickupMs]);
    await step(id, {
      driver_id: second.row.id, status: "confirmed",
      accepted_at: iso(retakeAt), confirmed_at: iso(retakeAt), accepted_fare: round2(currentFare(pdp, retakeAt)),
    }, retakeAt);
    if (upcoming) { walked++; return; }
    await run(id, b, second.row.id, pickupMs, t, false);
    walked++;
    return;
  }

  if (outcome === "cancelled_business") {
    const killAt = new Date(acceptAt.getTime() + between(0.1, 0.8) * (pickupMs - acceptAt.getTime()));
    const hrs = round2((pickupMs - killAt.getTime()) / HOUR);
    const fee = hrs < 24 ? round2(fare * (hrs < 2 ? 1 : hrs < 6 ? 0.5 : 0.25)) : 0;
    await step(id, { status: "cancelled", cancelled_by: "business", cancelled_at: iso(killAt), cancellation_fee: fee, cancellation_reason: "Guest changed plans" }, killAt);
    await db.from("mission_cancellation").insert({
      mission_id: id, cancelled_by: "business", cancelled_at: iso(killAt),
      hours_before_pickup: hrs, fee_amount: fee, reason: "Guest changed plans",
    });
    walked++;
    return;
  }

  if (outcome === "live_confirmed") { walked++; return; }   // taken, pickup still ahead

  await run(id, b, driver.row.id, pickupMs, t, outcome === "no_show");
  walked++;
}

/** The trip actually happening — or the guest never showing up. */
async function run(id: string, b: (typeof BIZ)[number], driverId: string, pickupMs: number, t: any, noShow: boolean) {
  const checkIn = new Date(pickupMs - intBetween(35, 110) * MIN);
  if (chance(0.86)) {
    await db.from("mission").update({ checked_in_at: iso(checkIn) }).eq("id", id);
    // Changes no status, so the trigger is blind to it — the app records it.
    appEvent(id, b.row.id, driverId, "checked_in", checkIn);
  }
  if (chance(0.3)) appEvent(id, b.row.id, driverId, "contact_revealed", new Date(pickupMs - intBetween(5, 30) * MIN), {}, ["admin"]);

  const enRoute = new Date(pickupMs - intBetween(12, 40) * MIN);
  const arrived = new Date(pickupMs - intBetween(1, 11) * MIN);
  await step(id, { status: "en_route" }, enRoute);
  await step(id, { status: "arrived" }, arrived);

  if (noShow) {
    // The free wait runs from when the Guest was DUE, never from the Driver's
    // arrival ([[d47]]) — so a Driver who turns up early waits longer, unpaid.
    const calledAt = new Date(pickupMs + intBetween(35, 75) * MIN);
    const mins = Math.round((calledAt.getTime() - pickupMs) / MIN);
    await step(id, {
      status: "completed", no_show: true, no_show_at: iso(calledAt), no_show_by: "driver",
      waiting_from: iso(new Date(pickupMs)), waiting_to: iso(calledAt),
      waiting_minutes: mins, waiting_rate: 1.1, waiting_fee: round2(Math.max(0, mins - 30) * 1.1),
    }, calledAt);
    return;
  }

  const board = new Date(pickupMs + intBetween(0, 26) * MIN);
  const waited = Math.max(0, Math.round((board.getTime() - pickupMs) / MIN));
  await step(id, {
    status: "on_board",
    ...(waited > 15
      ? { waiting_from: iso(new Date(pickupMs)), waiting_to: iso(board), waiting_minutes: waited, waiting_rate: 1.1, waiting_fee: round2(Math.max(0, waited - 15) * 1.1) }
      : {}),
  }, board);

  const done = new Date(board.getTime() + t.leg.min * MIN + intBetween(-6, 14) * MIN);
  const answered = chance(0.12);
  await step(id, {
    status: "completed",
    ...(answered ? { close_answer: "driven", close_answered_at: iso(new Date(done.getTime() + intBetween(60, 900) * MIN)) } : {}),
  }, done);
  if (answered) appEvent(id, b.row.id, driverId, "close_answered", new Date(done.getTime() + intBetween(60, 900) * MIN), { answer: "driven" });
}

console.log(`\n${made} trips created · ${walked} walked · skipped ${JSON.stringify(skipped)}`);
console.log("outcomes:", Object.entries(outcomeTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
fs.writeFileSync(".local/seed/_times.json", JSON.stringify({ trueTimes: [...trueTimes.entries()], extraEvents }));
console.log(`\nrecorded ${trueTimes.size} missions' true event times → .local/seed/_times.json`);
console.log("Next: npx tsx .local/seed/restamp.mts");
