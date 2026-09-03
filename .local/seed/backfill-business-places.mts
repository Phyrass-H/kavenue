// Fill in city / département / région for the four seeded Businesses.
//
// ⚑ WHY THIS IS NOT A MIGRATION. The columns arrived empty on 2026-08-30 and
// only a sign-up going through the register fills them. These four predate that,
// so they would sit under "no région on file" forever and the Businesses screen
// would have nothing to demonstrate. This is seed data catching up with the
// schema, not a schema change — so it lives with the other seeders.
//
// ⚑ AND IT IS NOT INVENTED. Every value here is the town in the address already
// stored on the row (`business_address_label`), written into the columns that now
// exist for it. The commune is INSEE's, which is why Belles-Rives is Antibes:
// Juan-les-Pins is a quarter of Antibes and has no commune of its own.
//
// ⚑ MONACO IS NOT FRANCE, AND THAT IS THE POINT OF THE FOURTH ROW. The Métropole
// has a city and NO département and NO région, because INSEE codes do not exist
// for it. It is not missing data to be cleaned up later — it is the shape a real
// slice of this market has, and any screen grouping by région has to survive it.
//
//   npx tsx .local/seed/backfill-business-places.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// région "93" is Provence-Alpes-Côte d'Azur in INSEE's list.
const PLACES: Record<string, { city: string; departement: string | null; region: string | null }> = {
  "Hôtel Majestic Cannes": { city: "CANNES", departement: "06", region: "93" },
  "Hôtel Negresco": { city: "NICE", departement: "06", region: "93" },
  "Hôtel Belles-Rives": { city: "ANTIBES", departement: "06", region: "93" },
  "Hôtel Métropole Monte-Carlo": { city: "MONACO", departement: null, region: null },
};

const { data: businesses } = await db.from("business").select("id, name, city");
let written = 0;
let skipped = 0;

for (const b of businesses ?? []) {
  const place = PLACES[b.name];
  if (!place) {
    // ⚑ A Business this script has never heard of is LEFT ALONE and reported.
    // Silently skipping is how a seeder claims success over an empty table.
    console.log(`  skip   ${b.name} — not in the map, left as it is`);
    skipped++;
    continue;
  }
  if (b.city) {
    console.log(`  keep   ${b.name} — already has ${b.city}`);
    skipped++;
    continue;
  }
  const { error } = await db.from("business").update(place).eq("id", b.id);
  if (error) {
    console.log(`  FAIL   ${b.name} — ${error.message}`);
    process.exitCode = 1;
    continue;
  }
  console.log(
    `  ok     ${b.name} → ${place.city}${place.region ? ` · dept ${place.departement} · region ${place.region}` : " · outside France"}`,
  );
  written++;
}

console.log(`\n${written} filled in, ${skipped} left alone.`);

// Read it back. A write is not verified until you have read the row back — the
// lesson of the départment that came out null on 2026-08-30.
const { data: after } = await db
  .from("business")
  .select("name, city, departement, region")
  .order("name");
console.log("\nas stored now:");
for (const b of after ?? []) {
  console.log(
    `  ${b.name.padEnd(30)} ${(b.city ?? "—").padEnd(10)} ${(b.departement ?? "—").padEnd(4)} ${b.region ?? "—"}`,
  );
}
