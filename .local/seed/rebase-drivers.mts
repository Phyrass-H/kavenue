// Move every seeded Driver off a hotel and into the town they live in.
//
//   npx tsx .local/seed/rebase-drivers.mts            # dry run, changes nothing
//   npx tsx .local/seed/rebase-drivers.mts --confirm  # writes
//
// ⚑ WHY IT EXISTS. The S68 seed set each Driver's base from PLACES, the map of
// trip endpoints, so the console read "Élodie Marchand · Hôtel Negresco · 35 km"
// — a Driver apparently living in a hotel. The app itself has always asked the
// Driver for their own address; only the test data was wrong. `BASES` in
// riviera.mts is now a separate map of towns, and this brings the live rows in
// line with it without re-running the whole seed.
//
// ⚑ IT REFUSES ANY MOVE THAT WOULD STRAND A TRIP. The three months of history
// were generated against the OLD bases. If a new town put a past trip's pickup
// outside the range of the Driver who actually drove it, the console's
// past-tense matcher would then report that the holder could never have taken
// it — a screen contradicting itself. Every move is checked against every trip
// the Driver holds BEFORE anything is written, and one failure aborts the lot.
//
// ⚑ EVERY WRITE IS CHECKED. An insert or update whose `error` is never read
// reports success and silently does nothing (S57, re-learned in S68 when 90-odd
// rows were rejected and the seed printed success).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { BASES, DRIVERS } from "./riviera.mts";
import { haversineKm } from "../../lib/geo.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WRITE = process.argv.includes("--confirm");

/** The two probe accounts are ordinary members of the fleet and move too. */
const EXTRA: { email: string; base: keyof typeof BASES }[] = [
  { email: "demo.driver@pickup.local", base: "nice" },
  { email: "s46.driver@pickup.local", base: "cannes" },
];

const want = new Map<string, keyof typeof BASES>([
  ...DRIVERS.map((d) => [d.email, d.base] as const),
  ...EXTRA.map((e) => [e.email, e.base] as const),
]);

const { data: drivers, error: dErr } = await db
  .from("driver")
  .select("id, email, first_name, last_name, base_lat, base_lng, base_label, service_radius_km");
if (dErr) throw new Error(`read drivers: ${dErr.message}`);

const { data: missions, error: mErr } = await db
  .from("mission")
  .select("id, driver_id, pickup_lat, pickup_lng, pickup_label, dropoff_label")
  .not("driver_id", "is", null);
if (mErr) throw new Error(`read missions: ${mErr.message}`);

let stranded = 0;
let unknown = 0;
const moves: { id: string; who: string; from: string; to: string; label: string; lat: number; lng: number }[] = [];

for (const d of drivers ?? []) {
  const key = d.email ? want.get(d.email) : undefined;
  if (!key) {
    console.log(`  ?  ${d.email ?? d.id} — not in the seed, left alone`);
    unknown++;
    continue;
  }
  const to = BASES[key];
  const radius = d.service_radius_km ?? 50;
  const held = (missions ?? []).filter((m) => m.driver_id === d.id);
  const lost = held.filter(
    (m) =>
      m.pickup_lat != null &&
      m.pickup_lng != null &&
      d.base_lat != null &&
      d.base_lng != null &&
      haversineKm(d.base_lat, d.base_lng, m.pickup_lat, m.pickup_lng) <= radius &&
      haversineKm(to.lat, to.lng, m.pickup_lat, m.pickup_lng) > radius,
  );
  const who = `${d.first_name} ${d.last_name}`.trim();
  console.log(
    `  ${lost.length ? "✗" : "→"}  ${who.padEnd(18)} ${String(d.base_label ?? "—").slice(0, 26).padEnd(28)}→ ${to.label.padEnd(20)} ${String(radius).padStart(2)} km · holds ${String(held.length).padStart(3)}${lost.length ? `  STRANDS ${lost.length}` : ""}`,
  );
  for (const l of lost) {
    if (l.pickup_lat == null || l.pickup_lng == null) throw new Error(`mission ${l.id} has no pickup coordinates — the range filter above only keeps missions that have them`);
    console.log(`        ${l.pickup_label} → ${l.dropoff_label} is now ${haversineKm(to.lat, to.lng, l.pickup_lat, l.pickup_lng).toFixed(1)} km out`);
  }
  stranded += lost.length;
  moves.push({ id: d.id, who, from: d.base_label ?? "—", to: to.label, label: to.label, lat: to.lat, lng: to.lng });
}

if (stranded > 0) {
  console.error(`\n${stranded} trip(s) would fall outside their own Driver's range. Nothing written.`);
  process.exit(1);
}

console.log(`\n${moves.length} Driver(s) to move · ${unknown} left alone · 0 trips stranded`);

if (!WRITE) {
  console.log("Dry run. Re-run with --confirm to write.");
  process.exit(0);
}

for (const m of moves) {
  const { error } = await db
    .from("driver")
    .update({ base_label: m.label, base_lat: m.lat, base_lng: m.lng })
    .eq("id", m.id);
  if (error) throw new Error(`update ${m.who}: ${error.message}`);
}

// Read it back — the only proof that PostgREST accepted what it said it did.
const { data: after, error: aErr } = await db.from("driver").select("email, base_label");
if (aErr) throw new Error(`verify: ${aErr.message}`);
const wrong = (after ?? []).filter((d) => {
  const key = d.email ? want.get(d.email) : undefined;
  return key && d.base_label !== BASES[key].label;
});
if (wrong.length) {
  console.error(`\n${wrong.length} row(s) did not take the new base.`);
  process.exit(1);
}
console.log(`\n${moves.length} Drivers moved, and every row reads back with its new town.`);
