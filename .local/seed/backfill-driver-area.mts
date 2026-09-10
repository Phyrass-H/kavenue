// Fill in what we threw away — the town, postcode, département, région and country of
// every Driver's base, plus one spelling per car brand.
//
//   npx tsx .local/seed/backfill-driver-area.mts          # show what it would do
//   npx tsx .local/seed/backfill-driver-area.mts --write  # do it
//
// ⚑ WHY IT EXISTS. Capture-at-write only fills a base set or re-saved AFTER
// 2026-09-09. Every Driver already on the fleet would read "no city" until they happen
// to touch that screen again — which, for a Driver who is happy with their base, is
// never. The founder approved the one-off (2026-09-09).
//
// ⚑ IT INVENTS NOTHING. The only input is `base_lat`/`base_lng`, coordinates the Driver
// themselves chose. A row with no coordinates is skipped and SAID, not guessed at from
// `base_label` — splitting that on the comma gives a street, which is the mistake this
// whole change exists to stop.
//
// ⚑ DRY BY DEFAULT. Nothing is written without --write, because this touches every
// Driver row on a live database.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { resolveArea, type RawPlaceArea } from "../../lib/place-area.ts";
import { canonicalMake } from "../../lib/vehicle-catalog.ts";
import { departementKeyLabel, countryKeyLabel } from "../../lib/france-geo.ts";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? env.GOOGLE_MAPS_API_KEY;
if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
if (!KEY) throw new Error("No Google Maps key in .env.local (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/**
 * Coordinates → the same four raw fields the address box reports.
 *
 * ⚑ THE GEOCODING API, NOT PLACES. Places answers "which place is this id"; there is no
 * id here, only a point the Driver dropped. Reverse geocoding is the call that takes a
 * point — and its `address_components` carry exactly the same type names, so
 * `resolveArea` needs no second version of the rules.
 */
async function areaOf(lat: number, lng: number): Promise<RawPlaceArea | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&key=${KEY}`;
  const r = await fetch(url);
  const j = (await r.json()) as {
    status?: string;
    results?: { address_components?: { types?: string[]; long_name?: string; short_name?: string }[] }[];
  };
  if (j.status !== "OK" || !j.results?.length) return null;
  // The first result is the most specific; the components we want (locality, postcode,
  // admin level 1, country) may sit on a later, broader one, so search them all.
  const pick = (type: string, short = false): string | null => {
    for (const res of j.results ?? []) {
      const c = res.address_components?.find((x) => x.types?.includes(type));
      const v = (short ? c?.short_name : c?.long_name)?.trim();
      if (v) return v;
    }
    return null;
  };
  return {
    city: pick("locality") ?? pick("postal_town"),
    postcode: pick("postal_code"),
    regionName: pick("administrative_area_level_1"),
    country: pick("country", true),
  };
}

console.log(WRITE ? "── BACKFILL (writing) ──\n" : "── BACKFILL (dry run — nothing is written) ──\n");

// ── 1 · where each base is ──────────────────────────────────────────────────
const { data: drivers, error } = await db
  .from("driver")
  .select("id, first_name, last_name, base_label, base_lat, base_lng, base_city, base_country")
  .order("first_name");
if (error) throw error;

let filled = 0, skipped = 0, already = 0;
for (const d of drivers ?? []) {
  const who = `${d.first_name} ${d.last_name}`.padEnd(20);
  if (d.base_lat == null || d.base_lng == null) {
    console.log(`  ${who} — no base set, skipped (nothing to derive it from)`);
    skipped++;
    continue;
  }
  if (d.base_city && d.base_country) {
    console.log(`  ${who} — already has ${d.base_city}, left alone`);
    already++;
    continue;
  }
  const raw = await areaOf(d.base_lat, d.base_lng);
  const area = resolveArea(raw);
  const where = [
    area.city ?? "—",
    area.departement ? departementKeyLabel(area.departement) : countryKeyLabel(area.country),
    area.postcode ?? "",
  ].filter(Boolean).join(" · ");
  console.log(`  ${who} ${where}`);
  if (WRITE) {
    const { error: e } = await db.from("driver").update({
      base_city: area.city,
      base_postcode: area.postcode,
      base_departement: area.departement,
      base_region: area.region,
      base_country: area.country,
    }).eq("id", d.id);
    if (e) throw new Error(`${who}: ${e.message}`);
  }
  filled++;
  await new Promise((r) => setTimeout(r, 120)); // be polite to the API
}

// ── 2 · one spelling per brand ──────────────────────────────────────────────
console.log("\n── car makes ──");
const { data: cars } = await db.from("vehicle").select("id, make, model");
let renamed = 0;
for (const v of cars ?? []) {
  const canon = canonicalMake(v.make);
  if (!v.make || canon === v.make) continue;
  console.log(`  "${v.make}" → "${canon}"   (${v.model ?? "—"})`);
  if (WRITE) {
    const { error: e } = await db.from("vehicle").update({ make: canon }).eq("id", v.id);
    if (e) throw new Error(`vehicle ${v.id}: ${e.message}`);
  }
  renamed++;
}
if (renamed === 0) console.log("  every make is already canonical");

console.log(`\n${WRITE ? "written" : "would write"}: ${filled} base(s), ${renamed} make(s)` +
  `  ·  skipped ${skipped} without a base, left ${already} already filled`);
if (!WRITE) console.log("\nRe-run with --write to apply.");
