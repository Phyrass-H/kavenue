// S68 — the side tables the trip seed silently failed to write.
//
// ⚑ WHY THIS IS A SEPARATE FILE, AND WHY IT CHECKS EVERY ERROR. The first run of
// seed-trips.mts wrote cancellations and release requests with column names that
// do not exist — `cancelled_at` instead of `created_at`, `reason` on a table
// whose column is `note`. PostgREST answered "could not find the column in the
// schema cache" every single time, and the seed never looked: the inserts were
// fire-and-forget. It reported 340 trips built and 30 cancellations recorded,
// and there were zero. `dataset-audit.mts` is the only reason anyone knows.
//
// The probe lesson from S57, re-learned exactly: "an insert whose error is never
// checked reports success and silently does nothing."
//
//   npx tsx .local/seed/seed-sidetables.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let SEED = 424242;
const rnd = () => { SEED = (SEED * 1664525 + 1013904223) % 4294967296; return SEED / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const round2 = (n: number) => Math.round(n * 100) / 100;
const HOUR = 3_600_000, DAY = 86_400_000;

/** Every insert goes through here. Nothing is fire-and-forget any more. */
let wrote = 0;
const errs: string[] = [];
async function put(table: string, row: Record<string, unknown>) {
  const { error } = await db.from(table).insert(row);
  if (error) errs.push(`${table}: ${error.message}`);
  else wrote++;
}

// ── cancellations ───────────────────────────────────────────────────────────
const { data: cancelled } = await db
  .from("mission")
  .select("id, business_id, driver_id, cancelled_at, cancelled_by, cancellation_fee, cancellation_reason, pickup_at, accepted_fare, ceiling")
  .eq("status", "cancelled");

console.log(`── cancellations · ${cancelled?.length ?? 0} trips ──`);
for (const m of cancelled ?? []) {
  const at = m.cancelled_at ?? m.pickup_at;
  const hrs = round2((Date.parse(m.pickup_at) - Date.parse(at)) / HOUR);
  const fare = Number(m.accepted_fare ?? m.ceiling);
  const byDriver = m.cancelled_by === "driver";
  await put("mission_cancellation", {
    mission_id: m.id,
    business_id: m.business_id,
    party: byDriver ? "driver" : "business",
    actor_driver_id: byDriver ? m.driver_id : null,
    kind: byDriver ? "driver_cancel" : "business_cancel",
    reason: m.cancellation_reason ?? (byDriver ? "Driver cancelled" : "Guest changed plans"),
    // The Driver pays 100% of the fare; the Business pays a curve that steepens
    // as the pickup approaches (docs/06). Both are recorded, neither is settled.
    fee_pct: byDriver ? 100 : hrs < 2 ? 100 : hrs < 6 ? 50 : hrs < 24 ? 25 : 0,
    fee_amount: byDriver ? round2(fare) : Number(m.cancellation_fee ?? 0),
    fare_snapshot: round2(fare),
    hours_before_pickup: hrs,
    // These trips ended cancelled rather than going back to the Pool.
    resulted_in: "terminal",
    created_at: at,
  });
}

// ── no-shows: also a cancellation record, of a different kind ───────────────
const { data: noShows } = await db
  .from("mission")
  .select("id, business_id, driver_id, no_show_at, pickup_at, accepted_fare, ceiling, waiting_fee")
  .eq("no_show", true);
console.log(`── no-shows · ${noShows?.length ?? 0} trips ──`);
for (const m of noShows ?? []) {
  const at = m.no_show_at ?? m.pickup_at;
  await put("mission_cancellation", {
    mission_id: m.id, business_id: m.business_id,
    party: "business",                      // the Guest failed to appear; the Business carries it
    actor_driver_id: m.driver_id,           // the Driver who waited and reported it
    kind: "no_show",
    reason: "Guest never appeared",
    fee_pct: 100,
    fee_amount: round2(Number(m.accepted_fare ?? m.ceiling)),
    fare_snapshot: round2(Number(m.accepted_fare ?? m.ceiling)),
    hours_before_pickup: round2((Date.parse(m.pickup_at) - Date.parse(at)) / HOUR),
    resulted_in: "terminal",
    created_at: at,
  });
}

// ── release requests ────────────────────────────────────────────────────────
// A Driver asking the hotel to let them out of a trip they already hold. Rare in
// real life — a handful across three months — but it must not be ZERO, or the
// console's "nobody has ever used this" check has nothing to distinguish a dead
// feature from a lightly used one.
const { data: held } = await db
  .from("mission")
  .select("id, business_id, driver_id, dispatcher_id, pickup_at, accepted_fare, created_at")
  .not("driver_id", "is", null)
  .in("status", ["completed", "confirmed"])
  .order("pickup_at", { ascending: false })
  .limit(120);
const asks = (held ?? []).filter(() => chance(0.06)).slice(0, 7);
console.log(`── release requests · ${asks.length} ──`);
for (const m of asks) {
  const askAt = new Date(Date.parse(m.pickup_at) - (6 + rnd() * 60) * HOUR);
  if (askAt.getTime() < Date.parse(m.created_at)) continue;
  const accepted = chance(0.6);
  const declined = !accepted && chance(0.7);
  await put("mission_release", {
    mission_id: m.id,
    business_id: m.business_id,
    driver_id: m.driver_id,
    proposed_by: null,
    status: accepted ? "accepted" : declined ? "declined" : "proposed",
    note: pick(["Vehicle went into the garage this morning.", "Family emergency, very sorry.",
                "I've been double-booked — can someone else take it?", "Unwell, can't drive safely."]),
    decline_reason: declined ? "No replacement available at this notice" : null,
    from_fare: m.accepted_fare,
    hours_before_pickup: round2((Date.parse(m.pickup_at) - askAt.getTime()) / HOUR),
    created_at: askAt.toISOString(),
    responded_at: accepted || declined ? new Date(askAt.getTime() + rnd() * 4 * HOUR).toISOString() : null,
  });
}

// ── Driver paperwork ────────────────────────────────────────────────────────
// ⚑ The filing cabinet was completely empty before this, on the old data AND the
// new. A real fleet has papers, one of them is about to lapse, and one Driver
// has filed nothing at all — which is what makes the verification screen worth
// looking at.
const { data: drivers } = await db.from("driver").select("id, first_name, verified, created_at");
const TYPES = ["drivers_licence", "vtc_card", "insurance", "rc_pro", "vehicle_registration"] as const;
console.log(`── documents · ${drivers?.length ?? 0} Drivers ──`);
let filedFor = 0;
for (const d of drivers ?? []) {
  // One Driver deliberately files nothing; the unverified ones file only some.
  if (d.first_name === "Clara") { console.log(`  ${d.first_name}: nothing filed (deliberate)`); continue; }
  const set = d.verified ? TYPES : TYPES.slice(0, 2);
  for (const type of set) {
    // ⚑ THE LAPSING ONE MUST BELONG TO A DRIVER WHO ACTUALLY FILES IT. The first
    // version put it on Amine, who is unverified and therefore only files two
    // documents — insurance is not one of them, so the branch never ran and the
    // dataset had nothing expiring at all. It sits on Karim, who is verified.
    const soon = d.first_name === "Karim" && type === "insurance";
    await put("document", {
      owner_type: "driver",
      owner_id: d.id,
      type,
      file_url: `seed://${d.id}/${type}.pdf`,
      status: d.verified ? "verified" : "pending",
      expires_at: new Date(Date.now() + (soon ? 21 : 180 + rnd() * 500) * DAY).toISOString(),
      uploaded_at: new Date(Date.parse(d.created_at) + rnd() * 3 * DAY).toISOString(),
    });
  }
  filedFor++;
}
console.log(`  filed for ${filedFor} Drivers`);

console.log(`\n${wrote} rows written`);
if (errs.length) {
  console.log(`⚑ ${errs.length} FAILED:`);
  [...new Set(errs)].slice(0, 8).forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("Every insert was checked and every one succeeded.");
