// Does the SHIPPED predicate get departures right? Imports the app's own helper
// rather than restating the rule, so it cannot drift from what runs.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { isAirportPickup, noShowWaitMinutes, waitingCeilingMinutes } from "../../lib/cancellation.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("mission")
  .select("id,flight_number,pickup_address,pickup_label,dropoff_address,dropoff_label");
if (error) throw new Error(`reading the mission table: ${error.message}`);
if (!data) throw new Error("reading the mission table returned neither rows nor an error");
const rows = data;
const withFlight = rows.filter((m) => (m.flight_number ?? "").trim() !== "");
const airport = withFlight.filter((m) => isAirportPickup(m as never));
const city = withFlight.filter((m) => !isAirportPickup(m as never));
console.log(`missions carrying a flight number   ${withFlight.length}`);
console.log(`  treated as an AIRPORT pickup      ${airport.length}  → ${noShowWaitMinutes(true)} min free, meter stops at ${waitingCeilingMinutes(true)} min`);
console.log(`  treated as a CITY pickup          ${city.length}  → ${noShowWaitMinutes(false)} min free, meter stops at ${waitingCeilingMinutes(false)} min`);
console.log("\nsample of the ones that moved to the city wait:");
for (const m of city.slice(0, 3)) {
  console.log(`  ${m.flight_number}  from ${String(m.pickup_address).slice(0, 40)}`);
  console.log(`             to   ${String(m.dropoff_address).slice(0, 44)}`);
}
const stillAirport = airport.filter((m) => !/roport|airport/i.test(`${m.pickup_address} ${m.pickup_label ?? ""}`));
console.log(`\nkept as airport on the flight number alone (unlabelled terminal): ${stillAirport.length}`);
