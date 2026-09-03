// S68 — does the Activity console's answer match what the DATABASE actually does?
//
// ⚑ WHY THIS EXISTS. lib/eligibility.ts is a MIRROR of two authorities it cannot
// import: `accept_mission` (SECURITY DEFINER SQL) and the Pool query (a server
// component). vitest pins its shape; nothing pins that the shape is still true.
// A mirror that drifts answers an admin's question confidently and WRONGLY —
// which is worse than the hand-written query it replaced.
//
// Read-only. Touches no rows, writes nothing, needs no cleanup.
//
// ⚑ RUN IT WITH tsx, NOT PLAIN node. It imports lib/eligibility.ts, which uses
// the `@/` tsconfig alias — node cannot resolve that and dies with
// ERR_MODULE_NOT_FOUND '@/lib'. The other probes get away with plain node only
// because they import alias-free modules (lib/geo.ts) or none at all.
//
// Run:  npx tsx .local/probe/eligibility-live.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { explainEligibility, RULES, SLOT_WINDOW_MINUTES } from "../../lib/eligibility.ts";

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

let pass = 0,
  fail = 0;
const t = (n: string, ok: boolean, note = "") => {
  console.log(`${ok ? "ok   " : "FAIL "} ${n}${note ? "   " + note : ""}`);
  ok ? pass++ : fail++;
};

// ── the two fields the console reports as deciding nothing ─────────────────
// ⚑ If either is ever wired into a real rule, the console's "never consulted"
// becomes a lie — and it is the kind of lie nobody would notice, because the
// screen would still render. grep is the only honest check here: these are
// ABSENCES, and an absence cannot be queried out of the database.
console.log("── the two fields that decide nothing (D92) ──");
const greppedIn = (needle: string) => {
  try {
    return execSync(
      `grep -rl "${needle}" app lib components 2>/dev/null | grep -v database.types || true`,
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
};
// The only places allowed to mention either: the screens that COLLECT them, and
// the console that REPORTS that they decide nothing. Anywhere else is a new rule
// — at which point the console's "never consulted" is a lie, and one nobody
// would notice, because the screen would still render.
const REPORTERS = [
  "app/admin/",
  "lib/eligibility.ts",
  "lib/activity-findings.ts",
  "lib/admin-activity.ts",
];
const COLLECTORS = ["settings", "onboarding"];
const allowed = (f: string) =>
  REPORTERS.some((r) => f.startsWith(r)) || COLLECTORS.some((c) => f.includes(c));

const zoneFiles = greppedIn("operational_zones").filter((f) => !allowed(f));
t(
  "operational_zones is still read by NO rule",
  zoneFiles.length === 0,
  zoneFiles.join(" ") || "only the screens that collect it and the console that reports it",
);
const verifiedFiles = greppedIn("\\.verified").filter((f) => !allowed(f));
t(
  "driver.verified still gates nothing — rendered, never branched on",
  verifiedFiles.length === 0,
  verifiedFiles.join(" ") || "only /settings and the console",
);

// ── the rule set the console claims accept_mission enforces ────────────────
console.log("\n── the refusals mirror accept_mission ──");
const sql = fs.readFileSync("docs/migrations/2026-08-22_accepted_fare.sql", "utf8");
const body = sql.slice(sql.indexOf("create or replace function accept_mission"));
t("still raises 'Mission no longer available' on a non-pooled trip", /Mission no longer available/.test(body));
t("still raises 'Mission has expired' past the pickup (§ P)", /Mission has expired/.test(body));
t("still raises 'Not eligible for this mission' on class/body/luggage", /Not eligible for this mission/.test(body));
t("still raises 'Slot conflict with another mission'", /Slot conflict with another mission/.test(body));
t(
  `the slot window is still ±${SLOT_WINDOW_MINUTES} minutes`,
  new RegExp(`interval '${SLOT_WINDOW_MINUTES} minutes'`).test(body),
);
t(
  "the eligibility clause still checks vehicle.category = mission.category",
  /v\.category\s*=\s*v_mission\.category/.test(body),
);
t(
  "…and required_body_type against the vehicle's body",
  /required_body_type\s*=\s*v\.body_type/.test(body),
);
t(
  "…and luggage_only against accepts_luggage_runs",
  /luggage_only[\s\S]{0,80}accepts_luggage_runs/.test(body),
);

console.log("\n── the hiding rules mirror the Pool query ──");
const pool = fs.readFileSync("app/(app)/pool/page.tsx", "utf8");
t("the Pool still filters on the driver's category", /query\.eq\("category", vehicle\.category\)/.test(pool));
t("…still matches pickup OR dropoff within the radius", /withinRadius[\s\S]{0,220}\|\|[\s\S]{0,220}withinRadius/.test(pool));
t("…still sends a Driver with no base to set one", /base_lat == null \|\| driver\.base_lng == null/.test(pool));
t("…still applies the specific-car rule", /carMatches\(/.test(pool));
t(
  "the console names the same nine rules and no more",
  Object.keys(RULES).length === 9,
  `${Object.keys(RULES).length} rules`,
);

// ── the live answer ────────────────────────────────────────────────────────
console.log("\n── the answer, against the live fleet ──");
const { data: drivers } = await db.from("driver").select("*");
const { data: vehicles } = await db.from("vehicle").select("*");
const { data: pooled } = await db
  .from("mission")
  .select("*")
  .eq("status", "pooled")
  .gt("pickup_at", new Date().toISOString())
  .order("pickup_at");
const { data: busy } = await db
  .from("mission")
  .select("driver_id, pickup_at")
  .in("status", ["accepted", "confirmed", "en_route", "arrived", "on_board"])
  .not("driver_id", "is", null);

t("there are Drivers and pooled trips to answer about", !!drivers?.length && !!pooled?.length,
  `${drivers?.length ?? 0} drivers · ${pooled?.length ?? 0} pooled`);

for (const m of pooled ?? []) {
  const answers = (drivers ?? []).map((d: any) =>
    explainEligibility({
      mission: m as any,
      driver: d,
      vehicle: (vehicles ?? []).find((v: any) => v.driver_id === d.id && v.is_active) ?? null,
      otherPickupsAt: (busy ?? [])
        .filter((b: any) => b.driver_id === d.id && b.pickup_at !== m.pickup_at)
        .map((b: any) => b.pickup_at),
    }),
  );
  const takers = answers.filter((a) => a.verdict === "can_take").length;
  const label = [m.pickup_label, m.dropoff_label].filter(Boolean).join(" → ") || m.id.slice(0, 8);
  t(
    `every Driver gets a NAMED reason for ${label} (${m.category})`,
    answers.every((a) => a.verdict === "can_take" || !!a.blocker?.says),
    `${takers} can take it`,
  );
  // A verdict with no blocker, or a blocker with no sentence, is the failure
  // mode that turns this console back into a shrug.
  t(
    `…and no reason is an empty string`,
    answers.every((a) => a.verdict === "can_take" || (a.blocker?.says.length ?? 0) > 10),
  );
}

// ⚑ The counter-check for D92: an unverified Driver must still be able to take
// work. If this ever goes red, `verified` became a gate and the console's
// "never consulted" is now wrong.
const unverified = (drivers ?? []).filter((d: any) => !d.verified);
t(
  "an unverified Driver is still allowed to take work (verified gates nothing)",
  unverified.length === 0 ||
    unverified.some((d: any) => {
      const v = (vehicles ?? []).find((x: any) => x.driver_id === d.id);
      return (pooled ?? []).some(
        (m: any) =>
          explainEligibility({
            mission: m,
            driver: d,
            vehicle: v ?? null,
            otherPickupsAt: [],
          }).verdict === "can_take",
      );
    }),
  `${unverified.length} unverified`,
);

console.log(`\nchecks: ${pass + fail} · ${fail} failed`);
if (fail) process.exit(1);
console.log("The console's answer still matches the database. Proceed.");
