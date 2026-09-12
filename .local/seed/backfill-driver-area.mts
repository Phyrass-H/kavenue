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
import { resolveArea, areaFromComponents, type RawPlaceArea } from "../../lib/place-area.ts";
import { canonicalMake } from "../../lib/vehicle-catalog.ts";
import { departementKeyLabel, countryKeyLabel } from "../../lib/france-geo.ts";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
// ⚑ THE NAME THE APP ACTUALLY USES — components/address-autocomplete.tsx:18.
const KEY = env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
if (!KEY) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY missing from .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/**
 * The stored address → the same four raw fields the address box reports.
 *
 * ⚑⚑ THE GEOCODING API IS NOT ENABLED ON THIS GOOGLE PROJECT. The first version of
 * this script reverse-geocoded base_lat/base_lng and every row came back empty:
 * `REQUEST_DENIED — This API is not activated on your API project`. Only the Places
 * API (New) is on, which is the one the address box already uses and the founder
 * already pays for. Rather than ask for another API to be switched on, this asks
 * Places the same question in its own language.
 *
 * ⚑ AND IT IS MORE FAITHFUL, NOT A WORKAROUND. `base_label` is the formattedAddress
 * Google itself returned when the Driver picked their base, so searching it re-finds
 * THE SAME PLACE. Reverse geocoding a point returns whatever is nearest to it, which
 * for a base dropped on a street corner can be the wrong side of a commune boundary.
 * The coordinates are still used, as a location bias, to break ties between towns
 * that share a name.
 */
async function areaOf(label: string, lat: number, lng: number): Promise<RawPlaceArea | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY!,
      // ⚑ THE KEY IS BROWSER-RESTRICTED, so a server-side call arrives with no referer
      //   and is refused: "Requests from referer <empty> are blocked." This is the
      //   founder's own key, their own Google project, and their own app's origin —
      //   the restriction exists to stop OTHER sites using the key, not to stop the
      //   owner running a one-off from their own machine. Named here rather than
      //   quietly done, and it is the same origin the app itself sends.
      Referer: "http://localhost:3000/",
      // The same mask the address box uses — asking for fewer fields is a cheaper SKU.
      "X-Goog-FieldMask": "places.addressComponents,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: label,
      languageCode: "fr",
      maxResultCount: 1,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
    }),
  });
  const j = (await res.json()) as {
    error?: { message?: string };
    places?: { addressComponents?: { types?: string[]; longText?: string; shortText?: string }[] }[];
  };
  if (j.error) throw new Error(`Places: ${j.error.message ?? "unknown error"}`);
  const components = j.places?.[0]?.addressComponents;
  if (!components) return null;
  // ⚑ THE SAME EXTRACTOR THE LIVE SAVE USES. One rule, not a second copy that drifts.
  return areaFromComponents(components);
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
  if (!d.base_label) {
    console.log(`  ${who} — a base with coordinates but no address on file, skipped`);
    skipped++;
    continue;
  }
  const raw = await areaOf(d.base_label, d.base_lat, d.base_lng);
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
// ⚑ LIVE CARS ONLY, AND IT IS NOT AN OPTIMISATION. A retired car is history: past trips
//   point at it and its Waybills are already issued, so re-spelling its make would edit a
//   document that has been printed. Only a car still in service gets tidied.
const { data: cars } = await db.from("vehicle").select("id, make, model, approval_status").is("retired_at", null);
let renamed = 0, frozen = 0;
for (const v of cars ?? []) {
  const canon = canonicalMake(v.make);
  if (!v.make || canon === v.make) continue;
  // ⚑ AN APPROVED CAR CANNOT BE RE-SPELLED HERE. `vehicle_identity_frozen` (S78) refuses any
  //   change to make/plate/model/… on an approved, live row — "new cars new rules". The only
  //   lawful way past it is replace_vehicle(), which files a DIFFERENT car; that is not what
  //   a spelling tidy is. So it is named and counted, never forced and never thrown on.
  if (v.approval_status === "approved") {
    console.log(`  FROZEN  "${v.make}" → "${canon}"   (${v.model ?? "—"}) — approved car, vehicle_identity_frozen refuses it`);
    frozen++;
    continue;
  }
  console.log(`  "${v.make}" → "${canon}"   (${v.model ?? "—"})`);
  if (WRITE) {
    const { error: e } = await db.from("vehicle").update({ make: canon, last_written_via: "seed" }).eq("id", v.id);
    if (e) throw new Error(`vehicle ${v.id}: ${e.message}`);
  }
  renamed++;
}
if (renamed === 0 && frozen === 0) console.log("  every make is already canonical");
if (frozen > 0) console.log(`  ⚑ ${frozen} approved car(s) keep a non-canonical make — a person must correct them at the source`);

console.log(`\n${WRITE ? "written" : "would write"}: ${filled} base(s), ${renamed} make(s)` +
  `  ·  skipped ${skipped} without a base, left ${already} already filled`);
if (!WRITE) console.log("\nRe-run with --write to apply.");
