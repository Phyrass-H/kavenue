// S68 — give the six baseless Drivers a real base and radius.
//
// ⚑ WHY. The Activity console's first live run found that six of nine Drivers
// have never set a base. The Pool matches on base + radius (lib/geo.ts), so
// their Pool is empty and always has been — they have never been offered a
// single trip. That also means the matching rules are barely exercised: two of
// the three pooled trips are invisible to the entire fleet, and the console has
// almost nothing to decide.
//
// This writes six rows and nothing else. The bases are spread along the Riviera
// and the RADII ARE DELIBERATELY UNEQUAL, so the radius rule actually bites for
// some trips instead of passing for everyone — a fleet where every check passes
// tests nothing.
//
// Reversible: `--undo` puts all six back to NULL, which is exactly what they
// were (recorded below, and re-asserted before writing).
//
//   npx tsx .local/probe/s68-driver-bases.mts
//   npx tsx .local/probe/s68-driver-bases.mts --undo
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const UNDO = process.argv.includes("--undo");

// name → where they work. Chosen to spread the fleet along the coast and to make
// the radius mean something: Thomas Rey sits in Monaco on a 25 km radius, so
// Cannes is genuinely out of his reach, and the console can say so.
const BASES = [
  { name: "Marc Fontaine",   label: "Nice, Alpes-Maritimes, France",    lat: 43.7009,  lng: 7.2683, km: 50 },
  { name: "Élodie Marchand", label: "Nice, Alpes-Maritimes, France",    lat: 43.7009,  lng: 7.2683, km: 35 },
  { name: "Sofia Berger",    label: "Cannes, Alpes-Maritimes, France",  lat: 43.5528,  lng: 7.0174, km: 40 },
  { name: "Nadia Bouchard",  label: "Cannes, Alpes-Maritimes, France",  lat: 43.5528,  lng: 7.0174, km: 60 },
  { name: "Karim Nasri",     label: "Antibes, Alpes-Maritimes, France", lat: 43.5808,  lng: 7.1251, km: 45 },
  { name: "Thomas Rey",      label: "Monaco",                           lat: 43.7384,  lng: 7.4246, km: 25 },
];

const { data: drivers } = await db.from("driver").select("id, first_name, last_name, base_lat, base_lng, base_label, service_radius_km");
const find = (n: string) => (drivers ?? []).find((d: any) => `${d.first_name} ${d.last_name}`.trim() === n);

let done = 0;
for (const b of BASES) {
  const d = find(b.name);
  if (!d) { console.log(`skip  ${b.name} — no such Driver`); continue; }

  if (UNDO) {
    const { error } = await db.from("driver")
      .update({ base_lat: null, base_lng: null, base_label: null, service_radius_km: 50 })
      .eq("id", d.id);
    console.log(error ? `FAIL  ${b.name} — ${error.message}` : `undone ${b.name} → no base`);
    if (!error) done++;
    continue;
  }

  // ⚑ Only ever fills an EMPTY base. A Driver who has set their own must never
  // be overwritten by a test script — Demo Driver, Pool Tester and Marc Dubois
  // all carry real bases and are deliberately not in the list above.
  if (d.base_lat != null || d.base_lng != null) {
    console.log(`skip  ${b.name} — already based at ${d.base_label ?? "somewhere"}`);
    continue;
  }
  const { error } = await db.from("driver")
    .update({ base_lat: b.lat, base_lng: b.lng, base_label: b.label, service_radius_km: b.km })
    .eq("id", d.id);
  console.log(error ? `FAIL  ${b.name} — ${error.message}` : `ok    ${b.name} → ${b.label}, ${b.km} km`);
  if (!error) done++;
}

const { data: after } = await db.from("driver").select("first_name, last_name, base_label, service_radius_km");
const homeless = (after ?? []).filter((d: any) => !d.base_label);
console.log(`\n${done} written · ${homeless.length} Drivers still without a base` +
  (homeless.length ? ": " + homeless.map((d: any) => d.first_name).join(", ") : ""));
