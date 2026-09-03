// Do lib/commission.ts and SQL commission_split() agree, to the cent?
//
// The pricing formula already lives twice on purpose (docs/06 §13 build note);
// commission now does too, for the same reason: the mission form re-prices on
// every keystroke and cannot round-trip to the server, and the server must never
// trust the browser. This probe is the thing that keeps the pair honest.
//
// Read-only. Touches no mission rows, so there is no baseline to restore.
//   npx tsx .local/probe/commission-parity.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import {
  commissionSplit,
  taxLineFor,
  type Rates,
} from "../../lib/commission.ts";

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

const n = (v: unknown) => Number(v);

// ── the live rates, read not assumed ────────────────────────────────────────
const { data: rateRows, error: rateErr } = await db
  .from("commission_rate")
  .select("*")
  .order("effective_from", { ascending: false })
  .limit(1);

if (rateErr) throw rateErr;
if (!rateRows?.length) throw new Error("no commission_rate row — was the migration run?");

const live = rateRows[0];
const rates: Rates = {
  businessHt: n(live.business_rate_ht),
  driverHt: n(live.driver_rate_ht),
  feeVat: n(live.fee_vat_rate),
};

console.log("── the live generation ──");
console.log(
  `  business ${(rates.businessHt * 100).toFixed(1)} % HT · driver ${(rates.driverHt * 100).toFixed(1)} % HT · ` +
    `fee VAT ${(rates.feeVat * 100).toFixed(0)} % · transport VAT ${(n(live.transport_vat_rate) * 100).toFixed(0)} %`,
);

const expected =
  rates.businessHt === 0.125 && rates.driverHt === 0.1 && rates.feeVat === 0.2 && n(live.transport_vat_rate) === 0.1;
console.log(`  matches docs/06 §1: ${expected ? "yes" : "NO — docs/06 §1 says 12,5 / 10 / 20 / 10"}`);

// ── every course a real trip could produce ──────────────────────────────────
const courses: number[] = [];
for (let c = 1; c <= 250000; c += 977) courses.push(c / 100); // 0,01 € → 2 500 €, 256 points
for (const c of [12.01, 33.13, 47.63, 54.78, 87, 98.86, 100, 111, 138.61, 159.4, 459.55, 674.94, 971.56, 1748.41])
  courses.push(c);

let checks = 0;
let bad = 0;
const shown: string[] = [];

for (const course of courses) {
  const { data, error } = await db.rpc("commission_split", {
    p_course: course,
    p_business_rate_ht: rates.businessHt,
    p_driver_rate_ht: rates.driverHt,
    p_fee_vat_rate: rates.feeVat,
  });
  if (error) throw error;

  const sql = Array.isArray(data) ? data[0] : data;
  const ts = commissionSplit(course, rates);

  const pairs: [string, number, number][] = [
    ["business_total", n(sql.business_total), ts.businessTotal],
    ["business_fee_ht", n(sql.business_fee_ht), ts.businessFeeHt],
    ["business_fee_vat", n(sql.business_fee_vat), ts.businessFeeVat],
    ["driver_net", n(sql.driver_net), ts.driverNet],
    ["driver_fee_ht", n(sql.driver_fee_ht), ts.driverFeeHt],
    ["driver_fee_vat", n(sql.driver_fee_vat), ts.driverFeeVat],
  ];

  for (const [field, a, b] of pairs) {
    checks++;
    if (a !== b) {
      bad++;
      if (shown.length < 10) shown.push(`  course ${course} · ${field}: SQL ${a} vs lib ${b}`);
    }
  }

  // The invariant that matters more than any single figure.
  checks++;
  const sums =
    Math.round((course + n(sql.business_fee_ht) + n(sql.business_fee_vat)) * 100) ===
    Math.round(n(sql.business_total) * 100);
  if (!sums) {
    bad++;
    if (shown.length < 10) shown.push(`  course ${course}: SQL invoice lines do not add to the total`);
  }
}

// ── the VAT inside the fare, both Driver statuses ───────────────────────────
//
// ⚑ THE TWO RATES ARE NOT TWO CASES OF ONE THING ANY MORE (S74, [[d126]]). SQL
// `transport_vat(course, 0)` still returns 0 and must — it is arithmetic, and the
// DB half is unchanged. What changed is TypeScript's side: `transportVat` is gone,
// because answering "0" for a franchise Driver and for a trip nobody has taken was
// the conflation. So the 0,10 case compares numbers, and the 0 case asserts the
// two halves agree that there is no amount at all — SQL by returning 0, the lib by
// returning a treatment that carries no `amount` field to compare.
//
// ⚑ THIS PROBE BROKE ON THE RESHAPE AND `tsc` DID NOT SEE IT, because
// `.local/probe/**` is still outside the typecheck (`.local/seed/**` was added in
// S73; probe was left, ~41 errors). Only running it found the dead import. That is
// the argument for turning it on, and it is why the § 0 gate lists these by hand.
const vatOf = (course: number, rate: number): number => {
  const line = taxLineFor(course, { kind: "taxable", rate });
  return line.kind === "taxable" ? line.amount : 0;
};

for (const course of [12.01, 87, 98.86, 138.61, 971.56]) {
  const { data, error } = await db.rpc("transport_vat", { p_course: course, p_rate: 0.1 });
  if (error) throw error;
  checks++;
  if (n(data) !== vatOf(course, 0.1)) {
    bad++;
    if (shown.length < 10)
      shown.push(`  course ${course} @ 0.1: SQL VAT ${n(data)} vs lib ${vatOf(course, 0.1)}`);
  }

  // The franchise case: SQL says 0, and the lib says "there is no amount here".
  const zero = await db.rpc("transport_vat", { p_course: course, p_rate: 0 });
  if (zero.error) throw zero.error;
  checks++;
  const franchise = taxLineFor(course, { kind: "franchise" });
  if (n(zero.data) !== 0 || "amount" in franchise) {
    bad++;
    if (shown.length < 10)
      shown.push(`  course ${course} @ franchise: SQL ${n(zero.data)}, lib ${JSON.stringify(franchise)}`);
  }
}

// ── nothing was backfilled ──────────────────────────────────────────────────
const { count: priced, error: cErr } = await db
  .from("mission")
  .select("id", { count: "exact", head: true })
  .not("commission_business_rate", "is", null);
if (cErr) throw cErr;

const { count: total, error: tErr } = await db.from("mission").select("id", { count: "exact", head: true });
if (tErr) throw tErr;

console.log("\n── parity ──");
console.log(`  ${checks - bad}/${checks} checks agree`);
shown.forEach((s) => console.log(s));

console.log("\n── the live table ──");
console.log(`  missions: ${total} (baseline 271)`);
console.log(`  carrying a commission snapshot: ${priced} — expected 0 until the app half writes one`);

console.log(bad === 0 ? "\nGREEN" : `\n${bad} DIVERGENCES`);
process.exit(bad === 0 ? 0 : 1);
