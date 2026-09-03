// The rule the founder picked: price the CHANGE, not the whole trip.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { priceFor, RATE_CARD_COLS } from "../../lib/rate-card.ts";
import { commissionSplit, courseFromBusinessTotal, ratesFromRow } from "../../lib/commission.ts";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: card } = await db.from("rate_card").select(RATE_CARD_COLS);
const { data: rr } = await db.from("commission_rate").select("*")
  .lte("effective_from", new Date().toISOString()).order("effective_from", { ascending: false }).limit(1).maybeSingle();
const rates = ratesFromRow(rr);
const round2 = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100;

const AGREED_ALLIN = 62.79;   // what the Driver won on the S61DEMO confirmed trip
const OLD_KM = 15;
console.log(`agreed ${AGREED_ALLIN.toFixed(2)} all-in on ${OLD_KM} km (Business sedan)\n`);
for (const newKm of [15, 18, 22, 31, 12]) {
  const was = priceFor(card as any, "business", "sedan", OLD_KM, { night: false });
  const now = priceFor(card as any, "business", "sedan", newKm, { night: false });
  if (!was || !now) throw new Error(`the rate card prices no Business sedan at ${OLD_KM} km or at ${newKm} km`);
  const delta = round2(now.ceiling - was.ceiling);
  const newAllIn = round2(AGREED_ALLIN + delta);
  const course = courseFromBusinessTotal(newAllIn, rates);
  const back = commissionSplit(course, rates);
  console.log(`  ${String(OLD_KM).padStart(2)} → ${String(newKm).padStart(2)} km   delta ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}   new fare ${newAllIn.toFixed(2)}   (stored course ${course.toFixed(2)} → reads back ${back.businessTotal.toFixed(2)}, Driver ${back.driverNet.toFixed(2)})`);
}
const requote = priceFor(card as any, "business", "sedan", 31, { night: false });
if (!requote) throw new Error("the rate card prices no Business sedan at 31 km");
console.log(`\n  for contrast, RE-QUOTING the whole trip at 31 km would be ${requote.ceiling.toFixed(2)} — the option the founder rejected`);
