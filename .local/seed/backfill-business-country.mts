// Establish where each Business is — country first, then anything else missing.
//
//   npx tsx .local/seed/backfill-business-country.mts          # show what it would do
//   npx tsx .local/seed/backfill-business-country.mts --write  # do it
//
// ⚑ WHY. The Businesses screen called the Métropole Monte-Carlo "Outside France".
// Founder, 2026-09-10: *"if it's outside of France then you name the country, period"*.
// Naming it needs a country column, and the column needs filling for the rows already
// there — the register lookup at sign-up never asked for one, because until now
// nothing read it.
//
// ⚑⚑ IT ESTABLISHES, IT DOES NOT INVENT. The only input is the address the Business
// itself gave us, resolved by the same Places API the address box uses. A Business with
// NO address is reported and LEFT ALONE — there is nothing to derive a country from,
// and "it is called Carlton Cannes so it must be in Cannes" is a guess, not a fact.
// The founder's instruction was explicit: no invention, everything clean.
//
// ⚑ DRY BY DEFAULT.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { resolveArea, areaFromComponents } from "../../lib/place-area.ts";
import { departementKeyLabel, countryKeyLabel, placeKey, regionKeyLabel } from "../../lib/france-geo.ts";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
if (!KEY) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY missing from .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function areaOf(address: string, lat: number | null, lng: number | null) {
  const body: Record<string, unknown> = { textQuery: address, languageCode: "fr", maxResultCount: 1 };
  if (lat != null && lng != null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } };
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY!,
      // See backfill-driver-area.mts — the key is browser-restricted and this is the
      // founder's own project and origin.
      Referer: "http://localhost:3000/",
      "X-Goog-FieldMask": "places.addressComponents,places.formattedAddress",
    },
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { error?: { message?: string }; places?: { addressComponents?: never[] }[] };
  if (j.error) throw new Error(`Places: ${j.error.message ?? "unknown"}`);
  const c = j.places?.[0]?.addressComponents;
  return c ? resolveArea(areaFromComponents(c)) : null;
}

console.log(WRITE ? "── BUSINESSES (writing) ──\n" : "── BUSINESSES (dry run) ──\n");

const { data: rows, error } = await db
  .from("business")
  .select("id,name,business_address,registered_address,business_address_lat,business_address_lng,city,departement,region,country")
  .order("name");
if (error) throw error;

let done = 0;
const stuck: string[] = [];
for (const b of rows ?? []) {
  const who = (b.name ?? "").slice(0, 28).padEnd(30);
  const address = b.business_address ?? b.registered_address;

  if (!address) {
    // ⚑ NOTHING TO ESTABLISH IT FROM. Not filled, not guessed — named.
    console.log(`  ${who} NO ADDRESS ON FILE — left alone, nothing to derive from`);
    stuck.push(b.name ?? b.id);
    continue;
  }
  if (b.country) {
    console.log(`  ${who} already ${countryKeyLabel(b.country)}, left alone`);
    continue;
  }

  const area = await areaOf(address, b.business_address_lat, b.business_address_lng);
  if (!area) {
    console.log(`  ${who} Places found nothing for "${address}" — left alone`);
    stuck.push(b.name ?? b.id);
    continue;
  }

  // ⚑ NEVER OVERWRITE WHAT THE REGISTER ESTABLISHED. The SIRET lookup is the better
  // source for a French Business — INSEE's own commune label and codes. This only
  // fills what is empty.
  const patch: Record<string, string | null> = { country: area.country };
  if (!b.city && area.city) patch.city = area.city.toUpperCase();
  if (!b.departement && area.departement) patch.departement = area.departement;
  if (!b.region && area.region) patch.region = area.region;

  const shown = regionKeyLabel(placeKey(patch.region ?? b.region ?? null, patch.country ?? null));
  const dept = (patch.departement ?? b.departement) ? departementKeyLabel(patch.departement ?? b.departement!) : "—";
  console.log(`  ${who} ${(patch.city ?? b.city ?? "—").padEnd(12)} ${dept.padEnd(18)} ${shown}`);

  if (WRITE) {
    const { error: e } = await db.from("business").update(patch).eq("id", b.id);
    if (e) throw new Error(`${b.name}: ${e.message}`);
  }
  done++;
  await new Promise((r) => setTimeout(r, 120));
}

console.log(`\n${WRITE ? "written" : "would write"}: ${done} Business(es)`);
if (stuck.length) {
  console.log(`\n⚑ ${stuck.length} could not be established and were NOT guessed at:`);
  for (const s of stuck) console.log(`    ${s}`);
  console.log(`  These have no address on file. Filling them would be invention — they need\n  an address, a SIRET lookup, or deleting. That is the founder's call, not this script's.`);
}
if (!WRITE) console.log("\nRe-run with --write to apply.");
