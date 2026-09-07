// Does driver.verified actually refuse work, on the live database?
//
//   npx tsx .local/probe/verified-gate.mts
//
// ⚑ RUN THIS AFTER PASTING docs/migrations/2026-09-07_verified_gates_accept.sql.
// Before that it FAILS, and that is the point: it is the verification step for a
// migration Claude cannot run. A green here before the paste would mean the probe
// is asking the wrong question.
//
// ⚑ WHAT IT IS REALLY GUARDING — three things, and running only the first part of
// the migration leaves two of them open:
//   § 1  accept_mission refuses an unverified Driver
//   § 2  place_hold does too. A hold takes the trip off the market for EVERYONE
//        for 15 s, so gating only accept lets an unverified Driver freeze every
//        trip in the Pool while never being able to take one.
//   § 3  the Driver cannot simply set verified=true on themselves. Measured
//        before the migration: `PATCH driver.verified -> true` returned 200.
//        Without § 3 the other two are theatre.
//
// ⚑⚑ IT ASKS THE HARMLESS QUESTION FIRST, AND THAT ORDER IS A SCAR. The first
// version ran § 1 immediately: on a database WITHOUT the migration the accept was
// not refused — it SUCCEEDED, and the probe took a real pooled trip
// (Cannes → Valberg, 8 Sept) out of the Pool and confirmed it to a fixture
// Driver. It had to be restored by hand. A probe whose whole purpose is to fail
// before a migration must not cause damage when it fails. So § 0 below is a
// canary that cannot change anything, and § 1 and § 2 do not run unless it says
// the gate is really there.
//
// ⚑ IT MAKES ONE REVERSIBLE WRITE AND RESTORES IT IN A `finally`. There is no
// unverified Driver with a working password, so it borrows a fixture Driver,
// unverifies them, asks the questions, and puts them back. The restore is
// asserted, not assumed — `hold-live.mts` performs eight real accepts as this
// same account and would break if it were left unverified.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { NOT_APPROVED_RAISE, UNDER_REVIEW } from "../../lib/driver-review.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !ANON || !env.SUPABASE_SERVICE_ROLE_KEY || !env.DEV_PASSWORD)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, an anon key, SUPABASE_SERVICE_ROLE_KEY or DEV_PASSWORD is missing from .env.local");

const db = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const FIXTURE = "s46.driver@pickup.local";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};

const { data: drv } = await db.from("driver").select("id, verified, first_name").eq("email", FIXTURE).single();
if (!drv) { console.log(`FAIL  the fixture Driver ${FIXTURE} is missing — run .local/seed/seed-probe-accounts.mts`); process.exit(1); }
const WAS = drv.verified;

// A real, future, pooled trip. ⚑ The gate sits AFTER the mission lock in both
// functions, so a bogus id raises 'Mission no longer available' long before it —
// a probe using a fake id would pass on a database where the gate does not exist.
const { data: pooled } = await db.from("mission")
  .select("id, pickup_label, dropoff_label")
  .eq("status", "pooled").gt("pickup_at", new Date().toISOString()).limit(1);
const trip = pooled?.[0];

try {
  await db.from("driver").update({ verified: false }).eq("id", drv.id);
  const as = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: authErr } = await as.auth.signInWithPassword({ email: FIXTURE, password: env.DEV_PASSWORD });
  if (authErr) throw new Error(`cannot sign in as ${FIXTURE}: ${authErr.message}`);

  // ── § 0 · the canary ──────────────────────────────────────────────────────
  // ⚑ HARMLESS BY CONSTRUCTION: it writes `false` onto a flag that is already
  // false, so being ALLOWED changes nothing. All three parts ship in one file,
  // so if the Driver still owns their own row, § 1 and § 2 are not there either —
  // and calling accept would TAKE A REAL TRIP rather than be refused.
  console.log("\n── § 0 · is the migration actually applied? ──");
  const canary = await as.from("driver").update({ verified: false }).eq("id", drv.id).select("id");
  const applied = (canary.data?.length ?? 0) === 0;
  t("a Driver may not write their own driver row (§ 3 of the migration)", applied,
    applied ? "refused — the migration is applied" : "⚑ ACCEPTED — the migration has NOT been pasted");

  if (!applied) {
    console.log("\n⚑⚑ STOPPING HERE ON PURPOSE, AND NOTHING BELOW WAS RUN.");
    console.log("   Without the gate, calling accept_mission would not be refused — it would");
    console.log("   SUCCEED and take a real trip out of the Pool. Paste");
    console.log("   docs/migrations/2026-09-07_verified_gates_accept.sql, then run this again.");
    for (const skipped of [
      "§ 1 accept_mission refuses",
      "§ 2 place_hold refuses",
      "§ 3 no other column is self-writable",
    ]) t(skipped, false, "not run — the migration is not applied");
  } else {

  console.log("\n── § 1 · an unverified Driver cannot TAKE a trip ──");
  if (!trip) {
    t("there is a future pooled trip to test against", false,
      "⚑ NOT A PASS AND NOT A SKIP — run `npx tsx .local/seed/seed-live.mts`, then re-run this");
  } else {
    const r = await as.rpc("accept_mission_call", { p_mission_id: trip.id, p_fare: null });
    const msg = r.error?.message ?? "";
    t("accept_mission refuses", msg.includes(NOT_APPROVED_RAISE), msg || "⚑ NO ERROR — the accept went through");
    // ⚑ The exact needle, because it is a string contract across two languages.
    t("and the refusal carries the needle both translators match on",
      msg.includes(NOT_APPROVED_RAISE), `"${NOT_APPROVED_RAISE}" in "${msg}"`);

    console.log("\n── § 2 · nor can they HOLD one, taking it off the market ──");
    const h = await as.rpc("place_hold", { p_mission_id: trip.id, p_fare: null });
    const hMsg = h.error?.message ?? "";
    t("place_hold refuses too", hMsg.includes(NOT_APPROVED_RAISE), hMsg || "⚑ NO ERROR — the hold was placed");
    // Nothing may have been written by a refused hold.
    const { count } = await db.from("mission_hold").select("id", { count: "exact" })
      .eq("mission_id", trip.id).eq("driver_id", drv.id).eq("outcome", "open");
    t("and it left no open hold behind", (count ?? -1) === 0, `${count} open hold(s)`);
  }

  console.log("\n── § 3 · they cannot let themselves in ──");
  // ⚑ The RAISING version of § 0's canary: true, not false. If this were ever
  // allowed the Driver would have granted themselves everything above.
  const w = await as.from("driver").update({ verified: true }).eq("id", drv.id).select("id, verified");
  t("a Driver may not set their own verified flag TRUE",
    (w.data?.length ?? 0) === 0,
    w.error?.message ?? (w.data?.length ? "⚑⚑ THE WRITE WAS ACCEPTED — the gate is decorative" : "refused"));
  const { data: after } = await db.from("driver").select("verified").eq("id", drv.id).single();
  t("and the flag really is still false on the database", after?.verified === false, `verified=${after?.verified}`);
  const w2 = await as.from("driver").update({ reliability_marks: 0 }).eq("id", drv.id).select("id");
  t("nor any other column of their own row", (w2.data?.length ?? 0) === 0,
    w2.error?.message ?? (w2.data?.length ? "⚑ reliability_marks is still self-writable" : "refused"));

  console.log("\n── § 4 · the gate sits AFTER the mission lock, as documented ──");
  // ⚑ Proves the probe above is asking a real question. With a bogus id the
  // mission lookup fails first, so the answer must NOT be the approval refusal.
  const bogus = await as.rpc("accept_mission_call",
    { p_mission_id: "00000000-0000-0000-0000-000000000000", p_fare: null });
  t("a trip that does not exist still fails on the trip, not on the Driver",
    !(bogus.error?.message ?? "").includes(NOT_APPROVED_RAISE),
    bogus.error?.message ?? "no error");

  console.log("\n── § 5 · the app turns that raise into the founder's sentence ──");
  t("the Driver-facing wording is the one signed off on 2026-09-07",
    UNDER_REVIEW.refused === "Your file is still with us. You’ll be able to take trips as soon as it’s approved.",
    UNDER_REVIEW.refused);
  }
} finally {
  // ⚑ ALWAYS, and asserted — hold-live.mts performs eight real accepts as this
  // Driver and would fail confusingly if this probe left them unverified.
  await db.from("driver").update({ verified: WAS }).eq("id", drv.id);
  const { data: back } = await db.from("driver").select("verified").eq("id", drv.id).single();
  console.log("");
  t(`${drv.first_name} was put back exactly as found`, back?.verified === WAS, `verified=${back?.verified} (was ${WAS})`);
}

console.log(`\nchecks: ${pass + fail}   ${fail === 0 ? "ALL AGREE" : `⚑ ${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
