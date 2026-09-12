// Do the two new Activity-console jobs tell the truth about the live database?
//
//   npx tsx .local/probe/first-trips-live.mts
//
// READ ONLY — creates nothing, writes nothing, deletes nothing.
//
// ⚑ THE ONE THING THIS EXISTS TO CATCH, and it is not the arithmetic. The console
// reads as the SIGNED-IN ADMIN, not the service role (lib/admin-activity.ts:4).
// `2026-09-04b_document_review.sql` says `document` has "exactly one policy,
// SELECT only" — a sentence that reads like owner-only. If it WERE owner-only,
// the admin's session would return zero rows and the finding would simply never
// fire: no error, no warning, a permanently quiet check on the one obligation
// that carries a €300,000 fine. So this probe asks the same question twice —
// once as the admin, once as the service role — and fails if the answers differ.
//
// ⚑ AND IT SIGNS IN AS A REAL ACCOUNT. admin@kavenue.fr is the console's only way
// in, so ADMIN_PASSWORD, never DEV_PASSWORD, and never /api/dev-login — that
// endpoint RESETS the password of whatever account you point it at (S75).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { firstTrips, DROVE, DROVE_STATUSES, RECENT_DAYS, type FirstTripMission } from "../../lib/first-trips.ts";
import { splitByUse, findings, quietChecks } from "../../lib/activity-findings.ts";
import type { MissionStatus } from "../../lib/database.types.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !ANON || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, an anon/publishable key, or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
if (!env.ADMIN_PASSWORD)
  throw new Error("ADMIN_PASSWORD is not in .env.local — this probe reads the console's own view, so it signs in as admin@kavenue.fr");

const svc = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const as = createClient(URL, ANON, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};

const { error: authErr } = await as.auth.signInWithPassword({
  email: "admin@kavenue.fr", password: env.ADMIN_PASSWORD,
});
if (authErr) { console.log(`FAIL  cannot sign in as the admin console's own user   ${authErr.message}`); process.exit(1); }

console.log("\n── 1 · the console's own session can see other people's papers ──");
const pendAdmin = await as.from("document").select("id, owner_id, uploaded_at, type")
  .eq("owner_type", "driver").eq("status", "pending");
const pendSvc = await svc.from("document").select("id, owner_id, uploaded_at, type")
  .eq("owner_type", "driver").eq("status", "pending");
t("the admin session reads `document` without an error", !pendAdmin.error, pendAdmin.error?.message ?? `${pendAdmin.data?.length} pending`);
// ⚑ THE ASSERTION THAT MATTERS. Equal counts is the only proof that
// app_role()='admin' is really the first branch of p_document_owner on the LIVE
// database, rather than only in docs/kavenue_schema.sql.
t("the admin sees exactly what the service role sees — RLS is not hiding rows",
  (pendAdmin.data?.length ?? -1) === (pendSvc.data?.length ?? -2),
  `admin ${pendAdmin.data?.length} vs service role ${pendSvc.data?.length}`);
const ownerIds = new Set((pendAdmin.data ?? []).map((d) => d.owner_id));
t("and they belong to Drivers other than the admin", ownerIds.size > 0 || (pendSvc.data?.length ?? 0) === 0,
  `${ownerIds.size} Driver(s) waiting`);

console.log("\n── 2 · the fleet, and every trip a Driver has ever held ──");
const { data: drivers, error: dErr } = await as.from("driver")
  .select("id, first_name, last_name, phone, created_at, verified").order("created_at");
t("the admin session reads the fleet", !dErr && (drivers?.length ?? 0) > 0, dErr?.message ?? `${drivers?.length} Drivers`);
const { data: droveRows, error: mErr } = await as.from("mission")
  .select("id, driver_id, status, pickup_at, pickup_label, dropoff_label, pickup_address, dropoff_address, business_id")
  .not("driver_id", "is", null).in("status", DROVE_STATUSES).range(0, 999);
t("the admin session reads every held trip", !mErr && (droveRows?.length ?? 0) > 0, mErr?.message ?? `${droveRows?.length} trips`);
const { data: businesses } = await as.from("business").select("id, name, reception_phone");

const now = new Date();
const f = firstTrips(drivers ?? [], (droveRows ?? []) as FirstTripMission[], businesses ?? [], now);
console.log(`      → ${f.trips.length} in the window · ${f.neverDriven.length} never drove · ${f.settled} settled`);

console.log("\n── 3 · every Driver is accounted for exactly once ──");
t("trips + never-driven + settled = the whole fleet",
  f.trips.length + f.neverDriven.length + f.settled === (drivers?.length ?? 0),
  `${f.trips.length} + ${f.neverDriven.length} + ${f.settled} vs ${drivers?.length}`);
t("no Driver appears twice",
  new Set([...f.trips.map((x) => x.driverId), ...f.neverDriven.map((x) => x.driverId)]).size ===
    f.trips.length + f.neverDriven.length);

console.log("\n── 4 · the named trip really is that Driver's earliest, and not a cancelled one ──");
// Asked of the database independently, per Driver, rather than re-running the
// same in-memory sort and calling the agreement a check.
for (const trip of f.trips) {
  const { data: earliest } = await as.from("mission")
    .select("id, status, pickup_at").eq("driver_id", trip.driverId)
    .in("status", DROVE_STATUSES).order("pickup_at").limit(1);
  t(`${trip.driverName}: the database agrees on which trip was first`,
    earliest?.[0]?.id === trip.tripId, `${earliest?.[0]?.id?.slice(0, 8)} vs ${trip.tripId.slice(0, 8)}`);
}
for (const d of f.neverDriven) {
  // ⚑ `.select("id", …)`, NEVER `.select("*", { head: true })` — see § 7.
  const { count } = await as.from("mission").select("id", { count: "exact" })
    .eq("driver_id", d.driverId).in("status", DROVE_STATUSES);
  t(`${d.driverName}: really holds no trip anybody drove`, (count ?? -1) === 0, `${count} trip(s)`);
}

console.log("\n── 5 · skipping cancelled trips is not theoretical on this data ──");
// ⚑ The whole reason DROVE exists. If no live Driver's earliest ANY-status trip
// is a cancelled one, this rule is untested by reality and the check below says
// so out loud rather than printing a green that means nothing.
let skipped = 0;
for (const d of drivers ?? []) {
  const { data: anyFirst } = await as.from("mission").select("id, status, pickup_at")
    .eq("driver_id", d.id).order("pickup_at").limit(1);
  const s = anyFirst?.[0]?.status as MissionStatus | undefined;
  if (s && !DROVE[s]) skipped++;
}
t("at least one live Driver's earliest trip is one nobody drove", skipped > 0,
  `${skipped} Driver(s) — counting it would name the wrong trip, date and Business`);

console.log("\n── 6 · every row can actually be acted on ──");
for (const trip of f.trips) {
  const { data: row } = await as.from("driver").select("phone").eq("id", trip.driverId).single();
  t(`${trip.driverName}: the number on the row is the number on the Driver`,
    (row?.phone ?? null) === trip.driverPhone, trip.driverPhone ?? "none on file");
}
t("no row shows an empty route", f.trips.every((x) => x.route.trim().length > 0));
t("no row shows a blank name", [...f.trips, ...f.neverDriven].every((x) => x.driverName.trim().length > 0));
t(`the window is still the agreed ${RECENT_DAYS} days`, RECENT_DAYS === 7, `${RECENT_DAYS}`);

console.log("\n── 7 · a refused count must never read as a count of zero ──");
// ⚑ THE TRAP THIS PROBE WALKED INTO, NOW THE FIX IT GUARDS. Counting `mission`
// with `head: true` is REFUSED for an admin session, and the error message is
// the EMPTY STRING — so `r.count ?? 0` turns a 403 into a confident "0". S72's
// money walls revoked `select (ceiling)` from `authenticated`, and a HEAD still
// asks for `select=*`, which asks for a column the role does not hold.
//
// Two halves to the fix, and this section proves BOTH against the live database:
//   • ask a question the role can answer — `select("id")`, never `select("*")`
//   • never let an absent number become zero — splitByUse, never `?? 0`
const headStar = await as.from("mission").select("*", { count: "exact", head: true });
t("a `select=*` HEAD on `mission` is still refused, and still says nothing about why",
  headStar.count === null, `status ${headStar.status}, message "${headStar.error?.message ?? ""}"`);

// The exact call readNeverUsed now makes, against every table it could ever be
// pointed at — including the one that used to 403.
for (const table of ["document", "mission_release", "mission"] as const) {
  const r = await as.from(table).select("id", { count: "exact", head: true });
  t(`\`select("id")\` answers on \`${table}\` — the form readNeverUsed uses`,
    r.count !== null, `${r.count} row(s), status ${r.status}`);
}

// ⚑ END TO END, ON REAL REPLIES. The refused reply and the two real ones go
// through the very function the console uses. `mission` is not a tracked feature
// — it is here BECAUSE it is the only table that can produce a live refusal, and
// a rule about refusals that is only ever fed successes is not tested at all.
const replies = [
  { id: "release_request", reply: await as.from("mission_release").select("id", { count: "exact", head: true }) },
  { id: "driver_documents", reply: await as.from("document").select("id", { count: "exact", head: true }) },
  { id: "release_request", reply: headStar },
] as const;
const good = splitByUse(
  ["release_request", "driver_documents"],
  [replies[0].reply, replies[1].reply],
);
t("the two real counts read as USED — neither is reported as never used",
  good.neverUsed.length === 0 && good.uncountable.length === 0,
  `neverUsed [${good.neverUsed}] · uncountable [${good.uncountable}]`);

const refused = splitByUse(["release_request", "driver_documents"], [headStar, replies[1].reply]);
t("a genuinely refused count lands in `uncountable`, NOT in `neverUsed`",
  refused.uncountable.includes("release_request") && refused.neverUsed.length === 0,
  `neverUsed [${refused.neverUsed}] · uncountable [${refused.uncountable}]`);

// And the console must not swap one false claim for the other.
const fired = findings({
  pooled: [], drivers: [], documentsWaiting: [],
    carsWaiting: [], cancelledWithoutRecord: [],
  passedAround: [], neverUsed: [], uncountable: refused.uncountable, orphanedEvents: 0,
});
t("a refusal withholds the footer's “every shipped feature has been used”",
  !quietChecks(
    { pooled: [], drivers: [], documentsWaiting: [], carsWaiting: [], cancelledWithoutRecord: [],
      passedAround: [], neverUsed: [], uncountable: refused.uncountable, orphanedEvents: 0 },
    fired,
  ).includes("every shipped feature has been used at least once"),
  `it says instead: ${fired.map((f) => f.sentence).join(" ") || "(nothing)"}`);

console.log(`\nchecks: ${pass + fail}   ${fail === 0 ? "ALL AGREE" : `⚑ ${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
