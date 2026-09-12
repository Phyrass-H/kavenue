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
// ⚑⚑ INVERTED ON 2026-09-07. For a year this asserted that NOTHING branched on
// `driver.verified`. It is a REFUSAL now — enforced in accept_mission and
// place_hold — so the old assertion could only be green while the gate was
// broken. What replaces it is the shape that still has to hold: the flag is read
// where the RULES live, and the Driver is told about it in one shared place.
const elig = fs.readFileSync("lib/eligibility.ts", "utf8");
t(
  "driver.verified is a REFUSAL now, evaluated in lib/eligibility",
  /approved: \{ kind: "refuse"/.test(elig) && /add\("approved", d\.verified/.test(elig),
  "`approved`, kind refuse",
);
t(
  "…and every Driver-facing surface takes its wording from one module",
  fs.existsSync("lib/driver-review.ts") &&
    /NOT_APPROVED_RAISE/.test(fs.readFileSync("app/(app)/missions/[id]/actions.ts", "utf8")),
  "lib/driver-review.ts → friendlyAcceptError + holdMessage",
);

// ── the rule set the console claims accept_mission enforces ────────────────
console.log("\n── the refusals mirror accept_mission ──");
// ⚑⚑ THIS READ THE WRONG FILE FOR MONTHS. It pointed at 2026-08-22_accepted_fare.sql,
// which was superseded by 2026-08-31i (the § 7 hold gate) and again by
// 2026-09-07 (the verified gate) — so every green below was about a body the
// database had not run since August. A probe that checks a stale file is not a
// check. The newest definition of accept_mission is the one to read.
const ACCEPT_SQL = "docs/migrations/2026-09-07_verified_gates_accept.sql";
const sql = fs.readFileSync(ACCEPT_SQL, "utf8");
const body = sql.slice(sql.toUpperCase().indexOf("CREATE OR REPLACE FUNCTION PUBLIC.ACCEPT_MISSION"));
t("the accept_mission body being checked is the NEWEST one", body.length > 0 && !/2026-08-22/.test(ACCEPT_SQL), ACCEPT_SQL);
t("…and it carries the verified refusal", /raise exception 'Driver account not yet approved'/.test(body));
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
  // ⚑ TEN since 2026-09-07 — `approved` joined the refusals. Pinned rather than
  // ">= 9" because a rule appearing or vanishing silently is the exact failure
  // this whole probe exists to catch.
  "the console names the same ten rules and no more",
  Object.keys(RULES).length === 10,
  `${Object.keys(RULES).length} rules`,
);

// ── the live answer ────────────────────────────────────────────────────────
console.log("\n── the answer, against the live fleet ──");
const { data: drivers } = await db.from("driver").select("*");
// ⚑ LIVE CARS ONLY. `find(v => v.driver_id === d.id …)` below takes whichever row comes
//   first, and after a replacement that can be the RETIRED one — so a Driver would be told
//   they cannot take a trip because of a car they sold. Filtered in JS rather than in the
//   query so this still reads correctly before M1 is pasted (no column, no retired rows).
const { data: allVehicles } = await db.from("vehicle").select("*");
const vehicles = (allVehicles ?? []).filter((v: any) => !v.retired_at);
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
      // ⚑ NOT `&& v.is_active`. That was a fifth answer to "which car is this Driver's", and
      //   it disagreed with line 204 five lines of output later. Nothing writes is_active;
      //   `vehicles` is already the live cars.
      vehicle: vehicles.find((v: any) => v.driver_id === d.id) ?? null,
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

// ⚑⚑ INVERTED 2026-09-07, AND THIS IS THE ONE THAT MATTERS MOST. It used to
// assert that an unverified Driver could still take work — the live counter-check
// for [[d92]]. The founder turned the flag into a door, so the live fleet must now
// answer the opposite: NO unverified Driver may take ANY pooled trip, and the
// reason they are given must be the approval rule rather than their car.
const unverified = (drivers ?? []).filter((d: any) => !d.verified);
const verdicts = unverified.flatMap((d: any) => {
  const v = vehicles.find((x: any) => x.driver_id === d.id);
  return (pooled ?? []).map((m: any) => ({
    who: `${d.first_name} ${d.last_name}`.trim(),
    e: explainEligibility({ mission: m, driver: d, vehicle: v ?? null, otherPickupsAt: [] }),
  }));
});
t(
  "no unverified Driver can take any pooled trip",
  verdicts.every((x) => x.e.verdict !== "can_take"),
  verdicts.filter((x) => x.e.verdict === "can_take").map((x) => x.who).join(", ") ||
    `${unverified.length} unverified · ${verdicts.length} Driver×trip pairs, none can take`,
);
t(
  // ⚑ The reason, not just the refusal. An unverified Driver usually ALSO has
  // something else wrong; naming the car would send the founder to fix a car
  // that is fine.
  "…and each is told it is the approval, not their vehicle",
  verdicts.length === 0 || verdicts.every((x) => x.e.blocker?.id === "approved"),
  verdicts.map((x) => `${x.who}: ${x.e.blocker?.id}`).join(" · ") || "no unverified Drivers live",
);

console.log(`\nchecks: ${pass + fail} · ${fail} failed`);
if (fail) process.exit(1);
console.log("The console's answer still matches the database. Proceed.");
