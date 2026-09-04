// Does the cancellation fee follow what was cancelled — on the REAL rows?
//
// Written 2026-09-04 (S75), when the founder answered the one question
// `lib/vat.ts` had refused: *"it works the same, apply the same rules on what
// was cancelled based on either it was a transfer or at disposal."* So
// `taxOf("cancellation_business")` stopped returning `undetermined` and started
// DELEGATING, exactly as `waiting` and `no_show` do.
//
// ⚑ THIS PROBE EXISTS TO CHECK A CLAIM MADE IN A COMMENT, which is the failure
// this repo keeps hitting. `components/mission-run-view.tsx` says the change
// "moves no number today" because every live row is a `transfer`. That is a
// statement about the DATABASE, not about the code, so it decays the moment an
// at-disposal trip is booked — and then the comment is a lie nobody notices.
// Here it is an assertion instead.
//
//   npx tsx .local/probe/cancellation-live.mts
//
// READ ONLY — creates nothing, writes nothing, deletes nothing.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { taxOf, type TaxTreatment } from "../../lib/vat.ts";
import type { MissionRow } from "../../lib/database.types.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};
const same = (a: TaxTreatment, b: TaxTreatment) => JSON.stringify(a) === JSON.stringify(b);

const { data, error } = await db.from("mission")
  .select("id,status,no_show,driver_id,mission_type,transport_vat_rate,commission_vat_rate");
if (error) { console.log(`FAIL  cannot read mission   ${error.message}`); process.exit(1); }
const rows = (data ?? []) as MissionRow[];

console.log("\n── the probe is looking at something ──");
t("there are missions to read", rows.length > 0, `${rows.length} rows`);
const cancelled = rows.filter((m) => m.status === "cancelled");
t("some of them are cancelled — the branch under test can actually fire",
  cancelled.length > 0, `${cancelled.length} cancelled`);

console.log("\n── the fee follows what was cancelled ──");
const withDriver = cancelled.filter((m) => m.driver_id != null);
const bad = withDriver.filter((m) =>
  !same(taxOf("cancellation_business", m), taxOf(m.mission_type === "hourly" ? "disposal" : "transfer", m)));
t("every cancelled trip that HAD a Driver bills at its own ride's treatment",
  bad.length === 0, `${withDriver.length} checked · ${bad.length} disagree`);

const noDriver = cancelled.filter((m) => m.driver_id == null);
const badNone = noDriver.filter((m) => taxOf("cancellation_business", m).kind !== "out_of_scope");
t("a cancellation with no Driver is out of scope — nothing was ever held",
  badNone.length === 0, `${noDriver.length} checked · ${badNone.length} disagree`);

console.log("\n── nobody can spell a zero rate, including here ──");
const zero = cancelled.filter((m) => {
  const x = taxOf("cancellation_business", m);
  return x.kind === "taxable" && !(x.rate > 0);
});
t("no cancellation resolves to a taxable line at 0 %", zero.length === 0, `${zero.length} found`);

console.log("\n── the claim the component makes about today's data ──");
// ⚑ The comment in mission-run-view.tsx says this change moved no number,
//   BECAUSE every live row is a transfer. Assert the reason, not the result —
//   the day this goes red the comment needs rewriting, which is the point.
const hourly = rows.filter((m) => m.mission_type !== "transfer");
t("every live mission is still a `transfer`, which is WHY no number moved",
  hourly.length === 0,
  hourly.length === 0
    ? `${rows.length}/${rows.length}`
    : `⚑ ${hourly.length} at-disposal row(s) exist now — the Driver screen's "moves no number" comment is STALE, and disposal still borrows commission_vat_rate`);

const movedRows = rows.filter((m) => !same(
  taxOf(m.no_show ? "no_show" : "transfer", m),
  taxOf(m.status === "cancelled" ? "cancellation_business" : m.no_show ? "no_show" : "transfer", m)));
t("the Driver's screen renders the same treatment as before on every live row",
  movedRows.length === 0, `${movedRows.length} of ${rows.length} would change`);

console.log(`\n${pass} passed · ${fail} failed`);
if (fail) process.exit(1);
