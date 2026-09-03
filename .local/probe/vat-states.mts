// The four-state VAT census, against the real database.
//
// Written 2026-09-02 (S74), when `mission.transport_vat_rate` stopped being read
// as a rate and started being read as a tri-state. The reshape's central claim is
// that it is LOSSLESS on live data — that no row changes meaning. This is the
// proof, and it is also the number the founder actually wanted: what does the
// database say about VAT today?
//
//   npx tsx .local/probe/vat-states.mts
//
// READ ONLY — creates nothing, writes nothing, deletes nothing.
//
// ⚑ Reads `mission` with the SERVICE ROLE on purpose, and that is allowed here:
// the columns it needs are not walled, and it wants the whole table rather than
// one role's view of it. (`handoff-check` assertion 51 forbids reading
// `mission_read` this way — that view is role-gated and returns zero rows to the
// service role, which is how a probe prints greens against nothing.)
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { taxOf, type BillLineKind } from "../../lib/vat.ts";
import type { MissionRow } from "../../lib/database.types.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); };

const { data, error } = await db
  .from("mission")
  .select("id,status,driver_id,mission_type,transport_vat_rate,commission_vat_rate");
if (error) { console.log(`FAIL  cannot read mission   ${error.message}`); process.exit(1); }
const rows = (data ?? []) as MissionRow[];

console.log("\n── the probe is looking at something ──");
// ⚑ The dead-battery guard. Every assertion below is a statement about a
// population; on an empty one they would all pass and mean nothing.
t("the table returns rows at all", rows.length > 0, `${rows.length} mission(s)`);
if (rows.length === 0) process.exit(1);

const census = (kind: BillLineKind) => {
  const by: Record<string, number> = {};
  for (const m of rows) {
    const x = taxOf(kind, m);
    const key = x.kind === "taxable" ? `taxable ${(x.rate * 100).toFixed(0)} %`
      : x.kind === "undetermined" ? `undetermined (${x.why})` : x.kind;
    by[key] = (by[key] ?? 0) + 1;
  }
  return by;
};

console.log("\n── what every live trip's TRANSFER line resolves to ──");
const ride = census("transfer");
for (const [k, n] of Object.entries(ride).sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${k}`);

// ⚑ THE CENTRAL CLAIM. Not one live row is taxable, so nothing reinterprets:
// every 0 is a franchise Driver and every NULL is a trip nobody has taken.
t("not one live row resolves to a taxable transfer",
  (ride["taxable 10 %"] ?? 0) === 0,
  `${ride["taxable 10 %"] ?? 0} taxable — every Driver's vat_number is empty, so this is expected to be 0`);
t("every trip is either franchise or undetermined, and nothing else",
  Object.keys(ride).every((k) => k === "franchise" || k === "undetermined (no_driver_yet)"),
  Object.keys(ride).join(" · "));
t("the two states account for every row",
  (ride["franchise"] ?? 0) + (ride["undetermined (no_driver_yet)"] ?? 0) === rows.length,
  `${ride["franchise"] ?? 0} + ${ride["undetermined (no_driver_yet)"] ?? 0} of ${rows.length}`);

console.log("\n── the tri-state is intact, so no repair is owed ──");
// A row with a Driver but no rate would mean the trigger had missed one, and the
// reshape would be reading "undetermined" over a trip that was actually settled.
const held = rows.filter((m) => m.driver_id != null && m.transport_vat_rate == null);
t("no trip has a Driver but no VAT snapshot", held.length === 0, `${held.length} such row(s)`);
const orphan = rows.filter((m) => m.driver_id == null && m.transport_vat_rate != null);
t("no trip has a VAT snapshot with no Driver", orphan.length === 0, `${orphan.length} such row(s)`);

console.log("\n── the lines that are not the ride ──");
const commission = census("commission");
console.log(`     commission:  ${Object.entries(commission).map(([k, n]) => `${n} ${k}`).join(" · ")}`);
t("every commission line is 20 %, or out of scope where no fee was charged",
  Object.keys(commission).every((k) => k === "taxable 20 %" || k === "out_of_scope"),
  Object.keys(commission).join(" · "));
t("a Driver's drop penalty is out of scope on every single row",
  rows.every((m) => taxOf("cancellation_driver", m).kind === "out_of_scope"));

console.log("\n── waiting and no-show follow the ride, on live rows not just fixtures ──");
const drift = rows.filter((m) =>
  JSON.stringify(taxOf("waiting", m)) !== JSON.stringify(taxOf("transfer", m)) ||
  JSON.stringify(taxOf("no_show", m)) !== JSON.stringify(taxOf("transfer", m)));
t("no live trip's waiting or no-show line disagrees with its own ride", drift.length === 0, `${drift.length} disagreeing`);

console.log("\n── what the founder asked ──");
const zero = rows.filter((m) => m.transport_vat_rate != null && Number(m.transport_vat_rate) === 0).length;
console.log(`     ${zero} of ${rows.length} trips carry a literal 0 in transport_vat_rate.`);
console.log(`     Under the old model that 0 was read as a RATE. It is not one — it means the`);
console.log(`     Driver is under franchise en base, and on an invoice that has to read`);
console.log(`     "TVA non applicable, article 293 B du CGI", never "0 %".`);

console.log(`\nchecks: ${pass + fail}   ${fail === 0 ? "0 failed — the reshape is lossless on live data." : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
