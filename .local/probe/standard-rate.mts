// Did the standard VAT rate actually get its own home?
//
// Run this AFTER pasting docs/migrations/2026-09-04_standard_vat_rate.sql into
// the Supabase SQL editor. Before that it FAILS, and that is the point: it is
// the verification step for a migration Claude cannot run.
//
//   npx tsx .local/probe/standard-rate.mts
//
// ⚑ WHAT IT IS REALLY GUARDING. `taxOf("disposal")` used to read
// `mission.commission_vat_rate` because that column happens to hold 20 %. Two
// unrelated facts had collided in one column: the VAT on Kavenue's FEE, and the
// statutory rate for a supply that is not passenger transport (CGI art. 278).
// Both are 0,20 today. The day the fee changed, a court's rate would have
// followed a commercial decision — silently, with nothing going red.
//
// ⚑ AND THE MIGRATION IS ALSO A VIEW REBUILD, which is the sharper hazard: a new
// `mission` column that is not in `mission_read` arrives at the app as
// `undefined`, `rateOf` turns that into "no rate", and the line renders a
// plausible WRONG treatment instead of an error. Nothing in TypeScript or the
// tests would complain, because the view's Row type is declared as the table's.
//
// READ ONLY — creates nothing, writes nothing, deletes nothing.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { taxOf, type TaxFacts } from "../../lib/vat.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!URL || !ANON || !env.SUPABASE_SERVICE_ROLE_KEY || !DEV_PASSWORD)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY or DEV_PASSWORD is missing from .env.local");
const db = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};

console.log("\n── 1 · the generation carries the statutory rate ──");
const { data: gens, error: gErr } = await db.from("commission_rate").select("*");
t("commission_rate is readable", !gErr && (gens?.length ?? 0) > 0, gErr?.message ?? `${gens?.length} generation(s)`);
const gen = (gens ?? [])[0] as Record<string, unknown> | undefined;
t("...and it now has a `standard_vat_rate` column",
  gen != null && "standard_vat_rate" in gen,
  gen == null ? "no generation row" : "standard_vat_rate" in gen ? "present" : "⚑ MIGRATION NOT RUN — paste docs/migrations/2026-09-04_standard_vat_rate.sql");
t("...holding 0,20 — the French standard rate (CGI art. 278)",
  Number(gen?.standard_vat_rate) === 0.2, String(gen?.standard_vat_rate));
t("...and it is NOT NULL on every generation",
  (gens ?? []).every((g) => (g as Record<string, unknown>).standard_vat_rate != null),
  `${gens?.length} row(s) checked`);

console.log("\n── 2 · it is a DIFFERENT column from the fee's rate ──");
// ⚑ The two are 0,20 today. That is exactly why they must be separate columns
//   and not one — this asserts they are two, not that they differ.
t("`fee_vat_rate` and `standard_vat_rate` are both present and independent",
  gen != null && "fee_vat_rate" in gen && "standard_vat_rate" in gen,
  `fee ${gen?.fee_vat_rate} · standard ${gen?.standard_vat_rate} — same number, unrelated reasons`);

console.log("\n── 3 · the mission snapshots it ──");
const { data: miss, error: mErr } = await db.from("mission").select("id,mission_type,standard_vat_rate").limit(5);
t("mission.standard_vat_rate exists", !mErr, mErr?.message ?? `${miss?.length} row(s) sampled`);

console.log("\n── 4 · the VIEW exposes it, which is the silent-failure risk ──");
// ⚑ A column in the table but not the view arrives as `undefined`, becomes "no
//   rate", and renders a wrong-but-well-formed treatment. This is the check that
//   would have caught that, and it must run as a NON-service role — the view is
//   role-gated and returns nothing to the service key.
const asDriver = createClient(URL, ANON, { auth: { persistSession: false } });
const signIn = await asDriver.auth.signInWithPassword({ email: "demo.driver@pickup.local", password: DEV_PASSWORD });
t("a real Driver session signs in (the view returns nothing to the service role)",
  !signIn.error, signIn.error?.message ?? "signed in");
const { data: viewRows, error: vErr } = await asDriver.from("mission_read").select("*").limit(1);
const viewRow = (viewRows ?? [])[0] as Record<string, unknown> | undefined;
t("mission_read returns rows to that session", !vErr && viewRow != null, vErr?.message ?? "1 row");
t("...and `standard_vat_rate` is one of its columns",
  viewRow != null && "standard_vat_rate" in viewRow,
  viewRow == null ? "no row to inspect"
    : "standard_vat_rate" in viewRow ? "exposed"
    : "⚑ IN THE TABLE BUT NOT THE VIEW — the app would read `undefined` and render a wrong rate silently");

console.log("\n── 5 · it is readable, not walled ──");
// ⚑ The walled columns are COMMERCIAL positions. A statutory rate is published
//   law, identical for everyone, and has to appear on the invoice.
const { error: baseErr } = await asDriver.from("mission").select("standard_vat_rate").limit(1);
t("a signed-in session may read mission.standard_vat_rate directly",
  !baseErr, baseErr ? `⚑ ${baseErr.code} ${baseErr.message} — the grant is missing` : "granted");

console.log("\n── 6 · and the resolver uses it ──");
const facts = (standard: number | string | null, fee: number): TaxFacts => ({
  transport_vat_rate: 0.1, commission_vat_rate: fee, standard_vat_rate: standard,
  mission_type: "hourly", driver_id: "dr-1",
});
t("an at-disposal line resolves to the STANDARD rate",
  JSON.stringify(taxOf("disposal", facts(0.2, 0.2))) === JSON.stringify({ kind: "taxable", rate: 0.2 }),
  JSON.stringify(taxOf("disposal", facts(0.2, 0.2))));
t("...and does NOT follow the fee when the fee alone moves",
  JSON.stringify(taxOf("disposal", facts(0.2, 0.155))) === JSON.stringify({ kind: "taxable", rate: 0.2 }),
  "the borrow would have returned 0.155 here");
t("...and a missing snapshot is `undetermined`, never today's rate applied backwards",
  taxOf("disposal", facts(null, 0.2)).kind === "undetermined", JSON.stringify(taxOf("disposal", facts(null, 0.2))));

console.log("\n── 7 · nothing moved, and here is why ──");
const { count: hourly } = await db.from("mission").select("id", { count: "exact", head: true }).neq("mission_type", "transfer");
t("no live mission is at-disposal, so no rendered number changed",
  (hourly ?? 0) === 0,
  (hourly ?? 0) === 0 ? "0 hourly of 377" : `⚑ ${hourly} hourly row(s) — re-check every VAT line on screen`);

console.log(`\n${pass} passed · ${fail} failed`);
if (fail) process.exit(1);
