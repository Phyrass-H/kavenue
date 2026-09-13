// Does admin_driver_find agree with the app about who can't work — on the live database?
//
//   npx tsx .local/probe/driver-find.mts
//
// ⚑ RUN THIS AFTER PASTING docs/migrations/2026-09-13d_admin_driver_find.sql. Before that it stops at
// the first check. It only READS: nothing in this file writes a row.
//
// ⚑ WHY IT EXISTS. /admin/drivers' "Can't work yet" section is decided in SQL; the pills on each row,
// and every other screen's idea of "may this Driver work", come from lib/driver-approvals.ts. They are
// meant to be one rule written twice. This walks the whole fleet and names any Driver the two
// disagree about — the one lie that section could tell.
// ⚑ AND THE SEARCH IS TESTED WITH THE FLEET'S OWN VALUES, spelled differently from how they are
// stored. A search that only finds what was typed verbatim would pass on anything; the S78 phone
// lock was exactly that, and it was caught by reading, not by a probe.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { mayTakeWork } from "../../lib/driver-approvals.ts";
import { liveCarOf } from "../../lib/vehicle-approval.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};

type FindRow = {
  id: string; first_name: string; last_name: string; verified: boolean;
  car_status: string | null; waiting_since: string | null; total_count: number;
};
const find = async (p_q: string | null, p_blocked = false) => {
  const { data, error } = await db.rpc("admin_driver_find", { p_q, p_blocked, p_limit: 1000, p_offset: 0 });
  return { rows: (data ?? []) as FindRow[], error };
};

// ── the guard: is the migration there at all? ───────────────────────────────────────────
const blocked = await find(null, true);
if (blocked.error) {
  console.log(`FAIL  admin_driver_find() is not installed — paste docs/migrations/2026-09-13d_admin_driver_find.sql   (${blocked.error.code})`);
  process.exit(1);
}

// ── the fleet, read the way the app reads it ────────────────────────────────────────────
const { data: drivers, error: dErr } = await db.from("driver").select("id, first_name, last_name, verified, email, phone, siret");
const { data: cars, error: vErr } = await db.from("vehicle").select("driver_id, approval_status, retired_at, created_at, plate");
if (dErr || vErr || !drivers || !cars) {
  console.log("FAIL  could not read the fleet", dErr?.message ?? "", vErr?.message ?? "");
  process.exit(1);
}
const who = (id: string) => {
  const d = drivers.find((x) => x.id === id);
  return d ? `${d.first_name} ${d.last_name}` : id;
};
const liveOf = (id: string) => liveCarOf(cars.filter((c) => c.driver_id === id));
const appBlocked = new Set(drivers.filter((d) => !mayTakeWork(d, liveOf(d.id))).map((d) => d.id));

console.log(`\n── who can't work: the SQL against lib/driver-approvals.ts, all ${drivers.length} Drivers ──`);
const sqlBlocked = new Set(blocked.rows.map((r) => r.id));
const onlySql = [...sqlBlocked].filter((id) => !appBlocked.has(id));
const onlyApp = [...appBlocked].filter((id) => !sqlBlocked.has(id));
t("every Driver the section lists is one the app says cannot work", onlySql.length === 0, onlySql.map(who).join(", "));
t("every Driver the app says cannot work is in the section", onlyApp.length === 0, onlyApp.map(who).join(", "));
t("the section's count is its own length", blocked.rows.every((r) => Number(r.total_count) === blocked.rows.length),
  `${blocked.rows.length} row(s)`);
t("every listed Driver has been waiting since something", blocked.rows.every((r) => r.waiting_since !== null));
t("longest waiting first",
  blocked.rows.every((r, i, a) => i === 0 || new Date(a[i - 1]!.waiting_since!) <= new Date(r.waiting_since!)));

const everyone = await find(null, false);
t("with no term, every Driver comes back", everyone.rows.length === drivers.length, `${everyone.rows.length} of ${drivers.length}`);
const carMismatch = everyone.rows.filter((r) => (liveOf(r.id)?.approval_status ?? null) !== r.car_status);
t("car_status is the live car's, for every Driver", carMismatch.length === 0,
  carMismatch.map((r) => `${who(r.id)}: sql ${r.car_status} vs app ${liveOf(r.id)?.approval_status ?? "none"}`).join("; "));
t("nobody who can work is waiting since anything",
  everyone.rows.filter((r) => !appBlocked.has(r.id)).every((r) => r.waiting_since === null));

// ── the search, with the fleet's own values spelled another way ─────────────────────────
console.log("\n── the search, with the fleet's own values spelled another way ──");
const finds = async (label: string, term: string, id: string) => {
  const { rows, error } = await find(term);
  t(`${label}: "${term}" finds ${who(id)}`, !error && rows.some((r) => r.id === id),
    error ? error.message : `${rows.length} row(s)`);
};
const skip = (why: string) => console.log(`skip  ${why}`);

const unaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const accented = drivers.find((d) => unaccent(`${d.first_name}${d.last_name}`) !== `${d.first_name}${d.last_name}`);
if (accented) await finds("a name without its accents", unaccent(accented.first_name).toLowerCase(), accented.id);
else skip("no Driver has an accented name to test the fold on");

const phoned = drivers.find((d) => String(d.phone ?? "").replace(/\D/g, "").length >= 9);
if (phoned) {
  const { data: key } = await db.rpc("phone_key", { p: phoned.phone });
  const national = String(key ?? "");
  // The way a person reads a mobile aloud: "06 00 00" — spaces, and no +33.
  await finds("a phone, national spelling", `${national.slice(0, 2)} ${national.slice(2, 4)} ${national.slice(4, 6)}`, phoned.id);
} else skip("no Driver has a phone");

const plated = cars.find((c) => !c.retired_at && /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(String(c.plate ?? "")));
if (plated) await finds("a plate, compact and in lower case", String(plated.plate).replace(/-/g, "").slice(0, 5).toLowerCase(), plated.driver_id);
else skip("no live car has a French plate");

const sireted = drivers.find((d) => String(d.siret ?? "").replace(/\D/g, "").length >= 9);
if (sireted) await finds("a SIRET, from the middle", String(sireted.siret).replace(/\D/g, "").slice(3, 9), sireted.id);
else skip("no Driver has a SIRET");

const emailed = drivers.find((d) => String(d.email ?? "").includes("@"));
if (emailed) await finds("an email, in capitals", String(emailed.email).split("@")[0]!.toUpperCase(), emailed.id);
else skip("no Driver has an email");

const named = drivers.find((d) => String(d.last_name).length >= 4);
if (named) {
  const byName = await find(named.last_name);
  t("a surname does not return the whole fleet", byName.rows.length < drivers.length, `${byName.rows.length} of ${drivers.length}`);
}
// ⚑ An email-shaped term with digits in it must search no phone and no SIRET (S79 final review). Built
//   from the fleet: one Driver's email name, plus the last four digits of ANOTHER Driver's phone.
const donor = drivers.find((d) => String(d.phone ?? "").replace(/\D/g, "").length >= 8);
const other = drivers.find((d) => d.id !== donor?.id && String(d.email ?? "").includes("@"));
if (donor && other) {
  const term = `${String(other.email).split("@")[0]}${String(donor.phone).replace(/\D/g, "").slice(-4)}@`;
  const { rows } = await find(term);
  t(`an email holding digits searches no phone: "${term}" finds nobody`, rows.length === 0,
    rows.length ? `${rows.map((r) => who(r.id)).join(", ")} — re-paste 2026-09-13d` : "0 row(s)");
}
const wild = await find("%");
t("% is a character, not a wildcard", wild.rows.length === 0, `${wild.rows.length} row(s)`);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
