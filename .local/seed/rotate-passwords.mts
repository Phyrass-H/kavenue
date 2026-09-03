// Rotate the passwords on this Supabase project's accounts.
//
// ⚑ WHY THIS EXISTS. Until 2026-09-03 `pickup-dev-password-123` was a plain
// literal in app/api/dev-login/route.ts — a TRACKED file in a PUBLIC repo,
// committed in 98a89ff — so it was readable on GitHub, and the Supabase key a
// browser uses is NEXT_PUBLIC_ by design. The pair was complete. It opened SIX
// accounts including admin@kavenue.fr. A second literal, `kavenue-seed-2026` in
// seed-3months.mts, opened FIFTEEN more.
//
// ⚑ EDITING THOSE LINES WAS NOT THE FIX. Git history keeps the old value
// forever. Only changing the passwords closes the door. That is what this does.
//
// ⚑ AND THE SUPABASE DASHBOARD CANNOT DO IT. Its only option is "send a password
// recovery email", and this app has no page for such a link to land on — there is
// no set-a-new-password screen, only app/auth/callback. So the admin API it is.
//
//   1. Choose new passwords. Long, and different from each other.
//   2. Put them in .env.local (git-ignored, never leaves this machine):
//        ADMIN_PASSWORD=…    the real console account
//        DEV_PASSWORD=…      the demo/probe fixtures
//        SEED_PASSWORD=…     the seeded fleet and hotel desks
//   3. npx tsx .local/seed/rotate-passwords.mts
//
// Add --dry to list what WOULD change and touch nothing.
//
// ⚑ THE THREE ARE SEPARATE ON PURPOSE. admin@kavenue.fr is a REAL account — the
// console's only way in (see bleach.mts) — and it should not share a secret with
// twenty throwaway fixtures. Keep ADMIN_PASSWORD in a password manager too; the
// other two are fixture strings and matter far less.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const DRY = process.argv.includes("--dry");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** The real one. Everything else on this list is a fixture. */
const ADMIN = "admin@kavenue.fr";

/** Which secret each account should end up holding. */
const GROUPS: { name: string; envKey: string; emails: (all: string[]) => string[] }[] = [
  {
    name: "the console admin",
    envKey: "ADMIN_PASSWORD",
    emails: (all) => all.filter((e) => e === ADMIN),
  },
  {
    name: "demo + probe fixtures",
    envKey: "DEV_PASSWORD",
    emails: (all) => all.filter((e) => e.endsWith("@pickup.local") || e === "marc.fontaine@kavenue.test" || e === "marion.esteve@belles-rives.test"),
  },
  {
    name: "the seeded fleet and hotel desks",
    envKey: "SEED_PASSWORD",
    emails: (all) => all.filter((e) => e !== ADMIN && e !== "marc.fontaine@kavenue.test" && e !== "marion.esteve@belles-rives.test" && !e.endsWith("@pickup.local") && (e.endsWith(".test"))),
  },
];

const missing = GROUPS.filter((g) => !env[g.envKey]).map((g) => g.envKey);
if (missing.length) {
  console.log(`\n${missing.join(", ")} not set in .env.local.\nChoose new passwords, add those lines, then run this again.\n`);
  process.exit(1);
}
// ⚑ Refuse to "rotate" onto the values that were published. A rotation that
// lands back on the leaked string is the loudest possible false sense of safety.
const BURNED = ["pickup-dev-password-123", "kavenue-seed-2026"];
const reused = GROUPS.filter((g) => BURNED.includes(env[g.envKey]));
if (reused.length) {
  console.log(`\n${reused.map((g) => g.envKey).join(", ")} still holds a password that was PUBLISHED. Pick a different one.\n`);
  process.exit(1);
}
const same = new Set(GROUPS.map((g) => env[g.envKey]));
if (same.size !== GROUPS.length) console.log("⚑ Two of the three are the same string. Allowed, but the admin should not share with the fixtures.\n");

const { data, error } = await db.auth.admin.listUsers({ perPage: 500 });
if (error) throw new Error(`cannot list users — is SUPABASE_SERVICE_ROLE_KEY the service-role key? (${error.message})`);
const users = data?.users ?? [];
if (!users.length) throw new Error("the project has no accounts at all — nothing to rotate, and that is not an expected state");

const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email as string, u.id]));
const all = [...byEmail.keys()];

let done = 0, failed = 0;
const touched = new Set<string>();

for (const g of GROUPS) {
  const emails = g.emails(all);
  console.log(`\n── ${g.name} (${g.envKey}) — ${emails.length} account(s)`);
  for (const e of emails) {
    touched.add(e);
    if (DRY) { console.log(`  would rotate  ${e}`); continue; }
    const id = byEmail.get(e);
    if (!id) { console.log(`  SKIP  ${e} — no id`); continue; }
    const { error: uErr } = await db.auth.admin.updateUserById(id, { password: env[g.envKey] });
    if (uErr) { failed++; console.log(`  FAILED  ${e}   ${uErr.message}`); }
    else { done++; console.log(`  rotated  ${e}`); }
  }
}

// ⚑ Anything this script does not cover is still holding whatever it held. Say so
// by name — a rotation that silently misses an account is the bug it exists to fix.
const untouched = all.filter((e) => !touched.has(e));
if (untouched.length) {
  console.log(`\n⚑ ${untouched.length} account(s) NOT covered by any group — unchanged, and still holding their old password:`);
  for (const e of untouched) console.log(`     ${e}`);
  console.log(`   If any of those matter, add them to a group above.`);
}

console.log(DRY
  ? `\n--dry: nothing was changed. ${touched.size} account(s) would be rotated.`
  : `\n${done} rotated${failed ? `, ${failed} FAILED` : ""}. Sign-in checks: npx tsx .local/probe/admin-chips.mts`);
process.exit(failed === 0 ? 0 : 1);
