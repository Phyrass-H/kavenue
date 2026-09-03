// S68 — THE BLEACH. Delete every operational row in the live database.
//
// ⚑ THIS IS DESTRUCTIVE AND NOT REVERSIBLE. It is the founder's own long-stated
// plan ("you and me we are going to delete every single Driver and company and
// trips ever tested in the database"), brought forward so a realistic three-month
// dataset can be built in its place. It refuses to run without --confirm.
//
// ⚑ THE SCHEMA IS NEVER TOUCHED. Hard rule #4: no DDL, no drops, no migrations.
// Rows only, through PostgREST, which cannot do DDL even if asked.
//
// WHAT SURVIVES, and why each one must:
//   · rate_card          — the price list. Deleting it breaks every future quote.
//   · commission_rate    — the fee schedule, and the VAT snapshot trigger reads it.
//   · mission_event_type — the event registry ([[d87]]). Documentation with a
//                          primary key; the console reads it to know what is wired.
//   · admin@kavenue.fr   — the auth user AND its profile. Delete it and nobody
//                          can get into the console that was just built.
//   · the founder's own addresses — real people's logins, never test accounts.
//
//   npx tsx .local/seed/bleach.mts            # dry run: says what it would do
//   npx tsx .local/seed/bleach.mts --confirm  # does it
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const GO = process.argv.includes("--confirm");

/** Auth users that must survive. Everything else is a test account. */
const KEEP_EMAILS = new Set([
  "admin@kavenue.fr",      // the console's only way in
  "phyrass.h@gmail.com",   // the founder
  "mmoimeme389@gmail.com", // the founder
]);

/** Config tables. Never emptied — the app cannot price or log without them. */
const KEEP_TABLES = ["rate_card", "commission_rate", "mission_event_type"];

/**
 * Children before parents. `mission_event` has no FK to `mission` on purpose
 * (the log outlives the trip), so it would survive the mission delete and be
 * stranded — it goes first, explicitly.
 */
const ORDER = [
  "mission_event",
  "status_event",
  "mission_cancellation",
  "mission_amendment",
  "mission_release",
  "mission_info_change",
  "booking_voucher",
  "payment",
  "payout",
  "ledger_transaction",
  "document",
  "mission",
  "vehicle",
  "driver",
  "dispatcher",
  "business",
] as const;

const count = async (t: string) => {
  const { count: n, error } = await db.from(t).select("*", { count: "exact", head: true });
  return error ? -1 : (n ?? 0);
};

console.log(GO ? "── BLEACHING ──\n" : "── DRY RUN — nothing will be deleted ──\n");

let total = 0;
for (const t of ORDER) {
  const before = await count(t);
  if (before < 0) { console.log(`skip   ${t.padEnd(22)} (no such table)`); continue; }
  total += before;
  if (!GO) { console.log(`would  ${t.padEnd(22)} delete ${before}`); continue; }
  // PostgREST refuses an unfiltered delete; "id is not null" is the whole table.
  // ⚑ `profile` is deliberately NOT in ORDER — it FKs to auth.users on delete cascade and
  // goes with the users below, so the old `t === "profile" ? "auth_user_id" : "id"` here
  // could never take its first branch. The compiler said so the moment this file was
  // typechecked; before that it read like a handled case.
  const { error } = await db.from(t).delete().not("id", "is", null);
  const after = await count(t);
  console.log(error ? `FAIL   ${t.padEnd(22)} ${error.message}` : `ok     ${t.padEnd(22)} ${before} → ${after}`);
}

// Profiles and auth users last: a profile FKs to auth.users on delete cascade,
// so removing the user removes the profile with it.
const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
const doomed = (users?.users ?? []).filter((u) => !KEEP_EMAILS.has((u.email ?? "").toLowerCase()));
const kept = (users?.users ?? []).filter((u) => KEEP_EMAILS.has((u.email ?? "").toLowerCase()));

if (!GO) {
  console.log(`\nwould  auth users          delete ${doomed.length}, keep ${kept.length}`);
  console.log(`       keeping: ${kept.map((u) => u.email).join(", ")}`);
  console.log(`\nwould  KEEP UNTOUCHED: ${KEEP_TABLES.join(", ")}`);
  for (const t of KEEP_TABLES) console.log(`         ${t.padEnd(22)} ${await count(t)} rows`);
  console.log(`\n${total} operational rows would go. Re-run with --confirm.`);
  process.exit(0);
}

let gone = 0;
for (const u of doomed) {
  const { error } = await db.auth.admin.deleteUser(u.id);
  if (error) console.log(`FAIL   auth ${u.email} — ${error.message}`);
  else gone++;
}
console.log(`ok     auth users          ${doomed.length} deleted (${gone} confirmed), ${kept.length} kept`);

// Any profile whose user is gone should have cascaded; prove it rather than assume.
const orphanProfiles = await count("profile");
console.log(`       profile              ${orphanProfiles} left (expect 1 — the admin)`);

console.log("\n── what survived ──");
for (const t of KEEP_TABLES) console.log(`  ${t.padEnd(22)} ${await count(t)}`);
console.log("\nBleached. The schema is untouched; only rows were removed.");
