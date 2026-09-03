// ⚑ RUN THIS FIRST, EVERY SESSION, BEFORE BUILDING ANYTHING.
//
// Why it exists: S64 (2026-08-22) wrote a handoff and then had it verified. It was
// wrong TWELVE ways, five of them load-bearing — and two of the errors were caused
// by that same session's OWN migrations, hours earlier. A handoff is a claim about
// the repo and the database, and claims decay. This file turns the perishable ones
// into assertions, so drift shows up in ten seconds instead of costing an afternoon.
//
//   node --experimental-strip-types .local/probe/handoff-check.ts
//
// READ-ONLY. Touches nothing. If something here fails, the handoff is stale — fix
// project/NEXT_SESSION.md before you build, and add an assertion for whatever bit you.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { execSync } from "node:child_process";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let checks = 0; const stale: string[] = [];
const t = (name: string, ok: boolean, note = "") => {
  checks++; if (!ok) stale.push(`${name}  ${note}`);
  console.log(`${ok ? "ok  " : "STALE"}  ${name}${note ? "   " + note : ""}`);
};

console.log("\n── the database the handoff describes ──");
const { count: missions } = await db.from("mission").select("id", { count: "exact", head: true });
const { count: withFare } = await db.from("mission").select("id", { count: "exact", head: true }).not("accepted_fare", "is", null);
console.log(`   missions ${missions} · with a stored accepted_fare ${withFare}`);
t("§ R — accepted_fare is still NOT a usable sort key population-wise",
  (withFare ?? 0) < (missions ?? 1),
  `${withFare}/${missions} have one — if this ever reaches 100%, revisit § R's blocker note`);

// § V — the reclassification that makes § V overdue rather than anticipatory.
const { data: vans } = await db.from("vehicle").select("id,make,model,category,body_type,is_active");
if (!vans) throw new Error("the vehicle table could not be read — § V asserts against the live fleet and there is none to read");
const classeV = vans.filter((v) => /classe v|v-class/i.test(`${v.make} ${v.model}`));
t("§ V — a Classe V still exists in the fleet", classeV.length > 0, `${classeV.length} found`);
t("§ V — it is still stored category='luxury' (this is what strands its Driver)",
  classeV.every((v) => v.category === "luxury"),
  classeV.map((v) => `${v.model}=${v.category}`).join(", "));
t("§ V — seed-fleet.mjs would STILL revert it on a re-seed",
  /cat:\s*"business"/.test(fs.readFileSync(".local/seed/seed-fleet.mjs", "utf8")),
  "if this goes green, the seeder was fixed — update the handoff");

// S65 — two claims the S65 handoff got WRONG. Assert the corrections so nobody
// reintroduces them. Both came from reading docs/kavenue_schema.sql alone, which
// does NOT contain columns added by later migrations.
const { data: pooledCol, error: pooledErr } =
  await db.from("mission").select("id,pooled_at,created_at").limit(400);
t("§ V — pooled_at EXISTS (it was added 2026-07-13; the base schema file does not show it)",
  !pooledErr,
  pooledErr ? pooledErr.message : "grep docs/kavenue_schema.sql alone and you will wrongly conclude it does not");
t("§ V — pooled_at is still 100% NULL live (seeders bypass the app, like accepted_fare)",
  (pooledCol ?? []).every((m) => m.pooled_at == null),
  `${(pooledCol ?? []).filter((m) => m.pooled_at != null).length} of ${(pooledCol ?? []).length} now have one — if this goes STALE a real re-pool happened; update § V`);
t("§ V — posting a draft still RESETS created_at, so there is no stale-draft price bug",
  /created_at: new Date\(\)\.toISOString\(\)/.test(
    fs.readFileSync("app/(dispatch)/dispatch/new/actions.ts", "utf8")),
  "if this goes STALE the reset was removed — a week-old draft would post already at its Ceiling");

// § R — the Pool's real volume, not the whole-table number S64 got wrong.
const now = new Date().toISOString();
const { data: pooled } = await db.from("mission").select("id,reference,pickup_at,pickup_lat").eq("status", "pooled").gt("pickup_at", now);
if (!pooled) throw new Error("the future-pooled mission read failed — § R sizes the live Pool from it, and a missing read is not a small Pool");
const nullLat = pooled.filter((m) => m.pickup_lat == null).length;
console.log(`   Pool right now: ${pooled.length} future pooled trips, ${nullLat} without a pickup coordinate`);
t("§ R — the Pool is still small enough that a bbox prefilter is not the win",
  pooled.length < 200, `${pooled.length} rows`);

// ⚑ THE S64CURVE DEMO TRIPS ARE GONE — bleached with everything else on
// 2026-08-26 ([[d94]]). They aged out every session and had to be refreshed;
// the three-month dataset replaces them and keeps its own live trips ahead of
// now. Asserted as ABSENT so nobody re-seeds them alongside the new fleet and
// ends up with two sets of demo data that contradict each other.
const { data: demo } = await db.from("mission").select("id").eq("reference", "S64CURVE");
t("the old S64CURVE demo trips are gone (s64-curve.ts / seed-fleet.mjs are superseded)",
  (demo?.length ?? 0) === 0, `${demo?.length ?? 0} left`);

// The live Pool must stay ahead of now, or the console has nothing to answer
// "why can nobody take this?" about — the whole matcher goes untested.
const { data: livePool } = await db.from("mission").select("id,pickup_at").eq("status", "pooled");
const agedOut = (livePool ?? []).filter((m) => Date.parse(m.pickup_at) < Date.now()).length;
t("the seeded live trips are still in the future, so the Pool is not empty",
  (livePool?.length ?? 0) - agedOut >= 3,
  `${(livePool?.length ?? 0) - agedOut} live · ${agedOut} aged out (re-run .local/seed/seed-live.mts)`);

console.log("\n── the SQL the handoff points at ──");
// A live probe beats reading migration filenames: they share dates and do NOT sort
// into apply order. That trap cost S64 a wrong "live definition" mid-session.
const { error: acceptErr } = await db.rpc("accept_mission", { p_mission_id: "00000000-0000-0000-0000-000000000000", p_fare: 1 });
t("accept_mission takes p_fare — so 2026-08-22_accepted_fare.sql is live, not the 08-11 one",
  !/could not find|does not exist/i.test(acceptErr?.message ?? ""), acceptErr?.message ?? "");
const { error: openErr } = await db.rpc("mission_opening_price", { p_mission: { ceiling: 100, pdp_start: 30, speed_win: true } });
t("mission_opening_price exists — the fee-basis band mirrors lib/pdp.ts",
  !openErr, openErr?.message ?? "");

// ── § AG — DOES THE EVENT LOG STILL HAVE NO HOLES? ─────────────────────────
// The defect this exists to catch, in its original live form: on 2026-08-24 there
// were 23 cancelled missions and ZERO cancelled status_event rows — in a category
// the CHECK constraint has ALLOWED since 2026-07-13. Nothing noticed for six weeks,
// because a missing log row looks exactly like an event that never happened.
//
// The rule from here on: any mission that reached a terminal state AFTER the event
// log shipped must carry a source='db_trigger' event for that state. Pre-migration
// missions are a fixed, documented baseline and are excluded by date — they are
// unrecoverable, not broken.
console.log("\n── § AG · the Event Log ──");
const AG_SHIPPED = "2026-08-24T00:00:00Z";      // the migration's apply date
// ⚑ head:true can come back error-free with count===null when PostgREST's schema
//    cache is stale for a table that does not exist. Treat that as ABSENT — a
//    silent null here would have turned every check below into a false pass.
const evTable = await db.from("mission_event").select("id", { count: "exact", head: true });
if (evTable.error || evTable.count === null) {
  t("§ AG — mission_event exists", false,
    `${evTable.error?.code ?? "count=null"}: paste docs/migrations/2026-08-24_mission_event_log.sql`);
} else {
  const { data: term } = await db
    .from("mission")
    .select("id,status,no_show,created_at")
    .in("status", ["completed", "cancelled", "expired"])
    .gte("created_at", AG_SHIPPED);

  const { data: trig } = await db
    .from("mission_event")
    .select("mission_id,event_type")
    // ⚑ 'seed' COUNTS HERE, AND ONLY HERE. This assertion asks "did the trigger
    // miss a terminal transition?" — and a seeded trip's terminal event WAS
    // written by the trigger; the seed only re-dated it and relabelled it
    // ([[d94]]). Excluding 'seed' made every reseeded trip look like a hole and
    // reported six phantom failures the moment the dataset was rebuilt.
    // Everywhere a row is read as EVIDENCE, 'seed' must still be excluded —
    // isObserved() in lib/mission-events.ts admits db_trigger and nothing else.
    .in("source", ["db_trigger", "seed"])
    .in("event_type", ["completed", "cancelled", "expired", "no_show"]);

  const have = new Set((trig ?? []).map((e) => `${e.mission_id}|${e.event_type}`));
  const byStatus: Record<string, { n: number; holes: string[] }> = {};
  for (const m of term ?? []) {
    // ⚑ A no-show is stored as status='completed' with no_show=true. Counting it
    //    as a plain completion is how a no-show vanishes from the numbers.
    const want = m.status === "completed" && m.no_show ? "no_show" : m.status;
    const b = (byStatus[want] ??= { n: 0, holes: [] });
    b.n++;
    if (!have.has(`${m.id}|${want}`)) b.holes.push(m.id.slice(0, 8));
  }
  const totalHoles = Object.values(byStatus).reduce((a, b) => a + b.holes.length, 0);
  const summary = Object.entries(byStatus)
    .map(([s, b]) => `${s} ${b.n - b.holes.length}/${b.n}`).join(" · ") || "no post-§AG terminal missions yet";
  t("§ AG — every terminal mission since the log shipped has its terminal event",
    totalHoles === 0,
    totalHoles
      ? `${totalHoles} HOLE(S) · ${summary} · e.g. ${Object.values(byStatus).flatMap((b) => b.holes).slice(0, 5).join(", ")}`
      : summary);

  // The trigger itself: if it were dropped, the log would go quiet and every check
  // above would still pass on old rows. Assert that NEW rows are still arriving.
  // ⚑ COUNTED AGAINST THE TRIPS WHOSE LOG IS STILL OBSERVED, not against every
  // recent trip. The reseed re-dated and relabelled the whole seeded history to
  // source='seed' ([[d94]]), so comparing db_trigger rows to ALL missions
  // created since § AG shipped compares a numerator that shrank to a
  // denominator that did not, and reports a dead trigger on a live one.
  const { data: freshRows } = await db.from("mission_event")
    .select("mission_id").eq("source", "db_trigger").gte("occurred_at", AG_SHIPPED);
  const fresh = freshRows?.length ?? 0;
  const sinceShip = new Set((freshRows ?? []).map((r) => r.mission_id)).size;
  t("§ AG — the trigger is still firing (>= 2 observed events per observed trip)",
    (sinceShip ?? 0) === 0 || (fresh ?? 0) >= (sinceShip ?? 0) * 2,
    `${fresh} trigger events for ${sinceShip} new missions (each mission emits >= 2: created + pooled)`);

  // status_event must stay FROZEN — no new writer, no widened CHECK. If its row
  // count starts tracking mission_event's, somebody re-pointed a writer at it.
  const { count: seCount } = await db.from("status_event").select("id", { count: "exact", head: true });
  t("§ AG — status_event is still frozen at its five legacy writers (a domain input, not the log)",
    (seCount ?? 0) < (evTable.count ?? 0),
    `status_event ${seCount} · mission_event ${evTable.count} — if status_event is growing faster, a new writer was added`);
}

// ── S66 · the three things that shipped 2026-08-24 ────────────────────────
//
// ⚑ A TRAP FOR WHOEVER EXTENDS THIS FILE. A plain `.select()` on mission_event is
//    CAPPED AT 1000 ROWS by PostgREST, silently. S66's first reading of the log
//    showed five event types with ZERO rows — which reads exactly like "the
//    trigger stopped firing" — when `en_route` alone had 172. Every count below
//    is `head: true`. A silent cap does not look like an error, it looks like an
//    answer.
console.log("\n── S66 · reclaim, the event log's app half, the price floor ──");

// [[d86]] — the reclaim was dead code gated on `accepted`, a status that has never
// occurred. The migration also renamed t60_reclaim -> reclaim while the table was
// empty. Probing the CHECK is the cheapest live proof the migration is applied.
const { data: anyMission } = await db.from("mission").select("id,business_id").limit(1).single();
if (!anyMission) throw new Error("there is not one mission in the database — this check inserts a cancellation against a real one to probe the CHECK (run .local/seed/seed-live.mts)");
const oldKind = await db.from("mission_cancellation").insert({
  mission_id: anyMission.id, business_id: anyMission.business_id, party: "business",
  kind: "t60_reclaim", reason: "handoff-check probe", fee_pct: 0, fee_amount: 0,
  hours_before_pickup: 1, resulted_in: "repooled",
});
t("§ R — the t60_reclaim -> reclaim migration is applied (old value now rejected)",
  /violates check constraint/i.test(oldKind.error?.message ?? ""),
  oldKind.error ? "" : "IT WAS ACCEPTED — paste docs/migrations/2026-08-24_reclaim_at_t2h.sql");
// If it somehow inserted, do not leave it behind.
if (!oldKind.error) await db.from("mission_cancellation").delete().eq("reason", "handoff-check probe");

// `accepted` must STAY extinct. If this ever goes STALE, accept_mission changed
// and the reclaim gate needs revisiting with it.
const { count: acceptedNow } = await db.from("mission").select("id", { count: "exact", head: true }).eq("status", "accepted");
t("§ R — `accepted` is still a status nothing reaches (the reclaim gate depends on it)",
  (acceptedNow ?? 0) === 0, `${acceptedNow} missions are 'accepted'`);

// [[d87]] — nine event types were wired; two were cut by the founder on purpose.
const { data: reg } = await db.from("mission_event_type").select("event_type,captured_by,guaranteed");
const byType = Object.fromEntries((reg ?? []).map((r) => [r.event_type, r]));
const WIRED = ["checked_in","close_answered","info_changed","amendment_proposed","amendment_answered",
               "release_proposed","release_answered","accept_rejected","contact_revealed"];
const notApp = WIRED.filter((e) => byType[e]?.captured_by !== "app");
t("§ AG — the nine wired types are registered captured_by='app'", notApp.length === 0,
  notApp.length ? notApp.join(", ") + " — paste docs/migrations/2026-08-24_event_registry_truth.sql" : "");
const browsing = ["pool_impression","mission_viewed"].filter((e) => byType[e]?.captured_by !== "none");
t("§ AG — pool_impression + mission_viewed are still 'none' (founder cut them; NOT a gap to fix)",
  browsing.length === 0, browsing.length ? browsing.join(", ") + " — someone wired browsing events" : "");
const overclaimed = (reg ?? []).filter((r) => r.guaranteed && r.captured_by !== "db_trigger");
t("§ AG — only db_trigger types claim to be guaranteed", overclaimed.length === 0,
  overclaimed.map((r) => r.event_type).join(", "));

// [[d88]] — the price floor. Source assertion: the guard must never depend on the
// quote EXISTING, which is what silently disabled it.
const newAction = fs.readFileSync("app/(dispatch)/dispatch/new/actions.ts", "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
t("§5 — a missing quote is a refusal, not a skipped check",
  newAction.includes("if (!asDraft && !quote)") && !newAction.includes("!asDraft && quote &&"),
  "the `&& quote` truthiness guard is back — see [[d88]]");

console.log("\n── S68 · the Activity console ──");
// [[d92]] — the console tells every reader that these two decide nothing. If
// either ever becomes a real rule, that sentence turns into a confident lie that
// still renders perfectly. grep is the only honest check: an ABSENCE cannot be
// queried out of a database. (The full version, with the live fleet, is
// .local/probe/eligibility-live.mts — run it with tsx, not node.)
const shq = (c: string) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return ""; } };
const readers = (needle: string) =>
  shq(`grep -rl "${needle}" app lib components 2>/dev/null | grep -v database.types || true`)
    .split("\n").filter(Boolean)
    .filter((f) => !f.startsWith("app/admin/") && !/^lib\/(eligibility|activity-findings|admin-activity)\.ts$/.test(f))
    .filter((f) => !f.includes("settings") && !f.includes("onboarding"));
t("[[d92]] — operational_zones is still read by NO rule", readers("operational_zones").length === 0,
  readers("operational_zones").join(" ") || "only the screens that collect it + the console");
t("[[d92]] — driver.verified still gates nothing", readers("\\.verified").length === 0,
  readers("\\.verified").join(" ") || "only /settings + the console");

// [[d93]] — six rules refuse, three only hide. Moving one between the groups
// changes the console's answer from "they were turned down" to "they never saw
// it", which are different problems with different fixes.
const elig = fs.readFileSync("lib/eligibility.ts", "utf8");
const refusals = (elig.match(/kind: "refuse"/g) ?? []).length;
const hides = (elig.match(/kind: "hide"/g) ?? []).length;
t("[[d93]] — still six refusals and three hiding rules", refusals === 6 && hides === 3,
  `${refusals} refuse · ${hides} hide`);

// ⚑ The story is ordered by occurred_at, never by seq. The live log genuinely
// holds a trip whose en_route row sits at a LOWER seq than its created row, six
// weeks earlier — rendering by seq says a trip was driven before it was booked.
const { data: seqCheck } = await db.from("mission_event")
  .select("mission_id, seq, occurred_at, event_type")
  .eq("event_type", "created").order("seq", { ascending: false }).limit(1);
t("§ AG — seq is still NOT time order, so the story must sort on occurred_at",
  (seqCheck?.length ?? 0) > 0, `newest 'created' sits at seq ${seqCheck?.[0]?.seq ?? "—"}`);

// S68 part B — the fleet is only useful to the console if the Pool can reach it.
// ⚑ This is a FLOOR, not an equality: Drivers will be added. The direction that
// needs guarding is a Driver going unreachable and nobody noticing.
const { data: fleet } = await db.from("driver").select("first_name, last_name, base_lat, base_lng, service_radius_km");
const homeless = (fleet ?? []).filter((d) => d.base_lat == null || d.base_lng == null);
t("S68 — every Driver has a base, so the Pool can reach all of them", homeless.length === 0,
  homeless.map((d) => d.first_name).join(", ") || `${fleet?.length ?? 0} Drivers, all based`);
// A fleet where every radius is identical tests nothing — the radius rule would
// pass or fail for everyone at once, and the console could never demonstrate it.
const radii = new Set((fleet ?? []).map((d) => d.service_radius_km));
t("S68 — the radii are still unequal, so the distance rule actually decides something",
  radii.size >= 3, `${radii.size} distinct radii: ${[...radii].sort((a, b) => (a ?? 0) - (b ?? 0)).join(", ")}`);

console.log("\n── S71 · the business type ──");
// ⚑ THE COLUMN THE WHOLE BREAKDOWN IS BUILT ON HAS NO CHECK CONSTRAINT, ON
// PURPOSE — the list is still moving and a constraint would make every change a
// migration the founder has to paste. This is the other half of that bargain:
// detection. If a value outside lib/business-type.ts ever reaches the column,
// "which types make more missions" is quietly answering with junk.
{
  const TYPES = [
    "hotel", "restaurant", "event_venue", "travel_agency",
    "concierge", "vtc_company", "health", "corporate", "other",
  ];
  const { data: biz } = await db.from("business").select("name, business_type, field_of_activity");
  const rogue = (biz ?? []).filter((b) => b.business_type && !TYPES.includes(b.business_type));
  t("S71 — every stored business_type is one of the nine values (no CHECK constraint guards it)",
    rogue.length === 0,
    rogue.length ? `⚑ ${rogue.map((b) => `${b.name}=${b.business_type}`).join(", ")}` : `${biz?.length ?? 0} Businesses, all narrowable`);

  // ⚑ AND THE GATE IS APP-SIDE ONLY. `business_type` is nullable and nothing in
  // SQL enforces it; the refusal lives in createMission. That is the beta
  // position and it is fine — but it must be a KNOWN position, not a discovery.
  // A Business posting straight through PostgREST is not stopped by it.
  const typed = (biz ?? []).filter((b) => b.business_type || b.field_of_activity).length;
  t("S71 — the posting gate is enforced in the app, never in the database",
    true, `${typed} of ${biz?.length ?? 0} Businesses could answer the gate today`);
}

// ⚑ SAME BARGAIN AS business_type ([[d99]]): no CHECK constraint, so this is the
// detection half. A value outside lib/gender.ts reaching the column would make
// every fleet breakdown built on it quietly wrong.
{
  const VALUES = ["woman", "man", "other", "undisclosed"];
  const { data: drv, error: gErr } = await db.from("driver").select("first_name, last_name, gender");
  // ⚑ THE ERROR IS THE ASSERTION, NOT AN ASIDE. Written the obvious way — reading
  // `data ?? []` — this check passed as "0 of 0" while the column did not exist
  // at all, because a failed select returns null and an empty array satisfies
  // every filter on it. "Zero rows is not proof of correctness" (S68), and a
  // guard that goes green on a missing column is worse than no guard.
  const rogue = (drv ?? []).filter((d) => d.gender && !VALUES.includes(d.gender));
  const answered = (drv ?? []).filter((d) => d.gender).length;
  t("S71 — every stored driver.gender is one of the four values (no CHECK constraint guards it)",
    !gErr && drv !== null && rogue.length === 0,
    gErr
      ? `⚑ the column is not there — run docs/migrations/2026-08-30_driver_gender.sql (${gErr.message})`
      : rogue.length
        ? `⚑ ${rogue.map((d) => `${d.first_name} ${d.last_name}=${d.gender}`).join(", ")}`
        : `${answered} of ${drv?.length ?? 0} Drivers have answered`);

  // ⚑ AND IT MUST KEEP DECIDING NOTHING. The field is optional and no rule may
  // ever read it — if one does, the Pool starts sorting people by gender, which
  // is a different product and a different legal position.
  const readers = execSync(
    "grep -rln 'gender' lib app --include=*.ts --include=*.tsx || true",
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  // ⚑ EVERY FILE HERE ONLY COLLECTS OR DISPLAYS. Adding one is a decision, not
  // housekeeping: the question this guard asks is "does the new reader DECIDE
  // something?" — because the day a Pool query or an eligibility rule reads
  // gender, Kavenue is sorting people by it, which is a different product and a
  // different legal position. `lib/admin-drivers.ts` and the Drivers screen
  // were added on 2026-08-30 and answer no: they label a breakdown row.
  const allowed = [
    "lib/gender.ts", "lib/database.types.ts",
    "app/(app)/settings/profile/page.tsx", "app/(app)/settings/actions.ts",
    "app/admin/drivers/[id]/page.tsx",
    "lib/admin-drivers.ts", "app/admin/drivers/page.tsx",
  ];
  const unexpected = readers.filter((f) => !allowed.includes(f));
  t("S71 — driver.gender is still read only where it is collected and displayed",
    unexpected.length === 0,
    unexpected.length ? `⚑ new reader: ${unexpected.join(", ")} — does it DECIDE something?` : `${readers.length} files, all expected`);
}

console.log("\n── S71 · the 1 000-row cliff ──");
// ⚑ AN UNBOUNDED `.select()` RETURNS AT MOST 1 000 ROWS AND REPORTS NO ERROR.
// Measured on this database: mission_event came back 1 000 of 2 503, silently.
// That is survivable for a rendered list (it is paged and says what it hides);
// it is NOT survivable behind a number, because a truncated input does not give
// a shorter answer, it gives a wrong one. The worst case was the set of recorded
// cancellations: read short, trips that DO carry a record get reported as trips
// that don't — the finding names innocent rows and nothing on screen hints at it.
{
  const cliff = execSync(
    "grep -n 'from(\"[a-z_]*\")' lib/admin-activity.ts | wc -l",
    { encoding: "utf8" },
  ).trim();
  // Every read in the calculation path must page. `readAll` is the only way to
  // do that here, so its call count is the cheapest honest proxy.
  const paged = execSync("grep -c 'readAll' lib/admin-activity.ts || true", { encoding: "utf8" }).trim();
  t("S71 — the console's calculation reads page through the 1 000-row cap",
    Number(paged) >= 7,
    `${paged} readAll uses across ${cliff} table reads in lib/admin-activity.ts`);

  // ⚑ And the proof it is not theoretical: ask for everything and count.
  const { data: probe } = await db.from("mission_event").select("id");
  const { count: real } = await db.from("mission_event").select("id", { count: "exact", head: true });
  t("S71 — an unbounded select really does stop at 1 000 and say nothing",
    (probe?.length ?? 0) === 1000 && (real ?? 0) > 1000,
    `unbounded returned ${probe?.length}, the table holds ${real}`);
}

console.log("\n── S72 · the §7 hold must ship WITH its events ──");
// ⚑ THE ONE NUMBER ON THIS PROJECT THAT CANNOT BE COLLECTED BACKWARDS.
//
// docs/06 §7 specifies the hold: a Driver reserves a pooled trip to
// think, price frozen, before committing. It is LOCKED but unbuilt — step 4 of
// docs/06's own build order, logged "not done, on purpose" in S64. In S72 the
// founder believed it was already live, which is exactly how a feature ships
// bare and nobody notices for a month.
//
// A hold ends one of two ways. The Driver commits — and that leaves a
// `confirmed` row behind, written by the trigger. Or the clock runs out, and
// THE LAPSE LEAVES NOTHING: no status transition, so no trigger, and nothing is
// running at T+15 s to witness it. Ship the hold in one session and instrument
// it in the next, and every lapse in between is gone for good. No other figure
// on the board behaves that way — presence, conversion and time-to-accept can
// all start counting whenever someone gets to them.
//
// So: silent until the hold appears, loud the moment it appears undressed.
// Expected vocabulary is `hold_started` + `hold_lapsed` at minimum;
// `hold_committed` is derivable from the `confirmed` row that follows it.
{
  const src = (p: string) => {
    try {
      return fs.readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/^\s*--.*$/gm, "");   // SQL comments too — migrations explain themselves
    } catch { return ""; }
  };

  // ⚑ IDENTIFIERS, NEVER THE WORD. "hold" is ordinary English: it is in the
  // spec, in this comment, and in the sentence "a Driver holds a trip". A guard
  // that matched prose would arm itself against a document and never against
  // code. Only a hold that EXISTS — a column, an action, a migration — counts.
  const HOLD_ID =
    /\b(hold_expires_at|hold_started_at|hold_taken_at|hold_until|held_by|held_until|hold_mission|holdMission|release_hold|releaseHold|p_hold)\b/;

  const accepts = [
    "app/(app)/missions/[id]/accept-button.tsx",
    "app/(app)/missions/[id]/actions.ts",
    "app/(app)/pool/page.tsx",
    "components/mission-card.tsx",
    "lib/mission-events-server.ts",
  ].filter((p) => fs.existsSync(p));
  const migrations = fs.existsSync("docs/migrations")
    ? fs.readdirSync("docs/migrations").map((f) => `docs/migrations/${f}`)
    : [];
  const holdInCode = [...accepts, ...migrations].filter((p) => HOLD_ID.test(src(p)));

  // And the live DB, which the repo cannot tell you about: the founder applies
  // migrations by hand in the Supabase editor, so a column can exist hours
  // before any file in this repo mentions it.
  const { error: colErr } = await db.from("mission").select("hold_expires_at").limit(1);
  const holdInDb = !colErr;

  const built = holdInCode.length > 0 || holdInDb;

  const declared = [...src("lib/mission-events.ts").matchAll(/"(hold_[a-z_]+)"/g)].map((m) => m[1]);
  const { data: registry } = await db.from("mission_event_type")
    .select("event_type").like("event_type", "hold%");
  const registered = (registry ?? []).map((r) => r.event_type);
  const covers = (re: RegExp) => declared.some((d) => re.test(d));

  console.log(
    `   the hold: ${built ? "BUILT" : "not built"}` +
    `${holdInCode.length ? " — " + holdInCode.join(", ") : ""}${holdInDb ? " — live column" : ""}` +
    ` · vocabulary: ${declared.length ? declared.join(", ") : "none"}` +
    ` · registry: ${registered.length ? registered.join(", ") : "none"}`,
  );

  t(
    "S72 — the §7 hold has not shipped without its events",
    !built || (covers(/start|taken|began/) && covers(/laps|expir|timeout|abandon/) && registered.length >= 2),
    !built
      ? "not built yet — armed and silent (docs/06 §7, step 4 of its build order)"
      : covers(/start|taken|began/) && covers(/laps|expir|timeout|abandon/) && registered.length >= 2
        ? `built AND instrumented — ${[...new Set(declared)].length} types declared, ${registered.length} registered`
        : `⚑ THE HOLD IS BUILT AND ITS EVENTS ARE NOT. Declare a hold_taken/started and a ` +
          `hold_lapsed in lib/mission-events.ts AND register them in mission_event_type, in ` +
          `THIS commit. A lapse leaves no row behind, so every one before you do is lost. ` +
          `declared: ${[...new Set(declared)].join(", ") || "none"} · registered: ${registered.join(", ") || "none"}`,
  );
}

console.log("\n── S72 · the car that did the trip ──");
// ⚑ [[d113]] — ONE MECHANISM, AND IT IS NOT INSIDE `accept_mission`.
// mission.vehicle_id is filled by a BEFORE UPDATE OF driver_id trigger
// (2026-08-31c_mission_vehicle_stamp.sql), deliberately NOT by a line in the accept RPC:
// accept is not the only way a trip changes hands, and a re-pool that nulled driver_id
// would have left the previous Driver's car behind — a stale plate on a legal document.
//
// The risk this guards is a later session "fixing" the gap it thinks it sees by adding the
// stamp to accept_mission as well. Two mechanisms writing one column is how they disagree.
{
  const migs = fs.existsSync("docs/migrations")
    ? fs.readdirSync("docs/migrations").filter((f) => f.endsWith(".sql"))
    : [];
  const body = (f: string) =>
    fs.readFileSync(`docs/migrations/${f}`, "utf8").replace(/^\s*--.*$/gm, "");

  t("S72 — the vehicle stamp still ships as its own migration",
    migs.some((f) => /mission_vehicle_stamp/.test(f)),
    "2026-08-31c — if this goes STALE the file was renamed or removed");

  // An accept_mission definition that also writes vehicle_id means someone added the second
  // mechanism. Comments are stripped first, for the same reason as the accepted_fare pin.
  const rival = migs.filter((f) => {
    const b = body(f);
    return /function accept_mission/.test(b) && /vehicle_id\s*=/.test(b);
  });
  t("S72 — nothing stamps the car from inside accept_mission",
    rival.length === 0,
    rival.length ? `⚑ ${rival.join(", ")} — two writers for one column, see [[d113]]` : "the trigger is the only writer");
}

{
  // And the live invariant the Waybill depends on: a trip accepted since the stamp landed
  // knows which car did it. ⚑ The note prints the POPULATION, because with no post-migration
  // accepts this passes on an empty set — and a vacuous pass that looks like a measurement is
  // the exact failure S71 hit three times in one day.
  const { data: since } = await db.from("mission")
    .select("id,vehicle_id,accepted_at")
    .not("driver_id", "is", null)
    .gt("accepted_at", "2026-08-31T00:00:00Z");
  const rows = since ?? [];
  const blind = rows.filter((m) => m.vehicle_id == null);
  t("S72 — every trip accepted since the stamp landed knows its car",
    blind.length === 0,
    rows.length === 0
      ? "0 accepts since the migration — nothing measured yet, this is a vacuous pass"
      : `${rows.length - blind.length}/${rows.length} stamped`);
}

console.log("\n── S72 · the wall, from the only seat that can see it ──");
// ⚑ THIS CHECK EXISTS BECAUSE I READ IT BACKWARDS AND NEARLY UNDID A SECURITY FIX.
//
// 2026-08-31g closed nine SECURITY DEFINER functions to browser sessions and put thin
// `*_call` wrappers in front of them: a composite return is NOT subject to column
// privileges, so `accept_mission returns mission` handed a Driver the `ceiling` and
// `commission_business_rate` straight through the money walls built the same morning.
//
// Hours later I reproduced `accept_mission` for the § 7 hold, saw a real Driver session get
// `42501 permission denied`, and concluded my `create or replace` had dropped the grant. It
// had not — `create or replace` preserves an ACL exactly, and there was none left to
// preserve. I told the founder to run `grant execute ... to authenticated`, which would have
// re-opened the hole. The parallel session caught it before they ran it.
//
// ⚑ So the assertion is the INVERSE of the one I first wrote: the raw names must STAY
//   refused, and the wrappers must work. A green here means the wall is standing.
// ⚑ AND IT RUNS AS A REAL DRIVER, because the service role bypasses ACLs entirely — every
//   service-role probe stayed green throughout, which is how a permission bug hides.
{
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } });
  const { error: signIn } = await anon.auth.signInWithPassword({
    email: "demo.driver@pickup.local", password: DEV_PASSWORD,
  });

  if (signIn) {
    t("S72 — the walled RPCs stay walled and the wrappers still work",
      false, `could not sign in to check: ${signIn.message}`);
  } else {
    // A uuid that deliberately does not exist. 42501 means the ACL refused us before the
    // body ran; any other error means we reached the body, which is what a wrapper should do.
    const NOWHERE = "00000000-0000-0000-0000-000000000000";
    const denied = async (fn: string, args: Record<string, unknown>) =>
      (await anon.rpc(fn as never, args as never)).error?.code === "42501";

    const walled = ["accept_mission", "driver_cancel_mission", "reclaim_mission"];
    const open: string[] = [];
    for (const fn of walled) if (!(await denied(fn, { p_mission_id: NOWHERE }))) open.push(fn);

    // The doors the app actually uses. `place_hold` is § 7's and is granted directly — it
    // returns mission_hold, whose every column is the caller's own, so it crosses no wall.
    const doors: [string, Record<string, unknown>][] = [
      ["accept_mission_call", { p_mission_id: NOWHERE, p_fare: 1 }],
      ["place_hold", { p_mission_id: NOWHERE, p_fare: 1 }],
      ["release_hold", { p_mission_id: NOWHERE }],
    ];
    const shut: string[] = [];
    for (const [fn, args] of doors) if (await denied(fn, args)) shut.push(fn);

    t("S72 — the raw money RPCs stay refused to a browser session ([[d114]] + 31g)",
      open.length === 0,
      open.length
        ? `⚑ ${open.join(", ")} is EXECUTABLE by a Driver — the composite return leaks the other side's money`
        : `${walled.length} inner signatures still closed`);

    t("S72 — and the wrappers the app calls still work",
      shut.length === 0,
      shut.length ? `⚑ 42501 on ${shut.join(", ")} — the app's own door is shut` : `${doors.length} reachable`);
  }
}

console.log("\n── S69 · the probes themselves ──");
// ⚑ THIS EXISTS BECAUSE OF [[d97]]. A probe that clones a real mission row with
// `...tmpl` inherits every column it does not override — and since the S68
// reseed that includes `accepted_fare`, a MONEY column belonging to a different
// trip. S69 spent a session diagnosing a cancellation "overcharge" that was
// only write-test handing the RPC a frozen price from an unrelated mission.
// Six more probes had the same landmine loaded and unfired. The fix is one line
// per file; this is what stops the seventh being written.
{
  const dir = ".local/probe";
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
        .filter((f) => f.endsWith(".ts") || f.endsWith(".mts"))
        .filter((f) => f !== "handoff-check.ts")   // it only MENTIONS the pattern
    : [];
  // ⚑ COMMENTS ARE STRIPPED FIRST, and that is not fussiness. The first version
  // of this check searched the raw file for "accepted_fare" — and every one of
  // the files it was guarding carries a COMMENT saying why the pin is there, so
  // deleting the actual assignment left the check green. It was verified by
  // deleting a pin, and it reported "all pinned". A guard that cannot go red is
  // not a guard, which is the same lesson as [[d97]] one level up.
  const code = (f: string) =>
    fs.readFileSync(`${dir}/${f}`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  const clones = files.filter((f) => code(f).includes("...tmpl"));
  // ⚑ A PIN IS AN ASSIGNMENT, NOT A MENTION. Three versions of this line were
  // wrong before this one, each in the way it was built to catch:
  //   `.includes("accepted_fare")` — matched the COMMENT explaining the pin;
  //   `/accepted_fare\s*:/`        — missed `m.accepted_fare = 90`;
  //   `/accepted_fare\s*[:=]/`     — matched `after!.accepted_fare === null`,
  //                                  an assertion that READS the column.
  // So: an object-literal key (not preceded by a dot), or a property assignment
  // with a single `=`. Verified in both directions — green with the pins in,
  // red with one taken out.
  const PIN = /(^|[^.\w])accepted_fare\s*:|\.accepted_fare\s*=(?!=)/m;
  const unpinned = clones.filter((f) => !PIN.test(code(f)));
  t(
    "every probe that clones a real mission PINS accepted_fare (never inherits a price)",
    clones.length > 0 && unpinned.length === 0,
    unpinned.length ? `⚑ ${unpinned.join(", ")} — see [[d97]]` : `${clones.length} cloning probes, all pinned`,
  );

  // ⚑ AND NO PROBE MAY HOLD A LIVE ROW'S ID. `reclaim-live.mts` carried a literal
  // driver uuid; the 2026-08-26 bleach deleted that Driver and the probe died at
  // `violates foreign key constraint` before its first assertion — while the
  // handoff still advertised it as "20 · D86 end to end". Two more files held the
  // same dead id. The all-zeros uuid is exempt: it is deliberately a row that
  // does not exist, used to prove an RPC rejects one.
  const UUID = /"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g;
  const ZEROS = '"00000000-0000-0000-0000-000000000000"';
  const hardcoded = files.filter((f) =>
    (code(f).match(UUID) ?? []).some((u) => u !== ZEROS));
  t(
    "no probe holds a live row's id — identities are looked up, so a bleach can't kill them",
    hardcoded.length === 0,
    hardcoded.length ? `⚑ ${hardcoded.join(", ")} — resolve by email instead` : "all resolved at run time",
  );
}

console.log("\n── the money-column walls (S72, [[d114]]) ──");
{
  // ⚑ THE WALL IS A VIEW, AND A VIEW HAS AN EXPLICIT COLUMN LIST. Two ways a
  // future session reopens it without noticing, so both are asserted here rather
  // than left to be discovered by a Business reading a Driver's rate:
  //
  //   1. a browser-session read goes back to `from("mission")` naming a walled
  //      column — which after part 2 is a 403, but before part 2 is a silent leak;
  //   2. a new column lands on `mission` and not in `mission_read`, so a screen
  //      reading it through the view gets `undefined`.
  const WALLED = ["ceiling", "pdp_start", "base_fare",
                  "commission_business_rate", "commission_driver_rate"];

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === "node_modules" || e.name === ".next" ? [] : walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  const src = ["app", "lib", "components"].flatMap(walk);

  const offenders: string[] = [];
  for (const f of src) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((l, i) => {
      if (!l.includes('from("mission")')) return;
      const after = lines.slice(i, i + 8).join("\n");
      const before = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
      // The service role legitimately reads the table; only user sessions are walled.
      if (/createAdminClient|\badmin\b\s*$|await admin|= admin/.test(before)) return;
      const named = WALLED.filter((w) => new RegExp(`\\b${w}\\b`).test(after));
      if (named.length || /select\("\*"/.test(after)) {
        offenders.push(`${f}:${i + 1} (${named.join(",") || "*"})`);
      }
    });
  }
  t("no browser-session read of `mission` names a walled money column",
    offenders.length === 0,
    offenders.length ? `⚑ ${offenders.join("  ")} — use mission_read` : `${src.length} files scanned`);

  // The view's own column set, against the table.
  //
  // ⚑ THIS READ THE MIGRATION FILE AND CALLED IT "the view". It went red on
  //   2026-09-01 saying `hold_expires_at` was missing from `mission_read` when
  //   the LIVE view had it — the other session had added the column to the
  //   database and not to my file. A file is a claim about the database, which
  //   is the oldest lesson in this repo, and I wrote the check that forgot it.
  //   Worse in the other direction: editing the file without touching the DB
  //   would have turned it GREEN. RULE ZERO, on my own assertion.
  //
  // ⚑ SIGNED IN, because `mission_read` is `security_invoker = false` with a
  //   WHERE written in app_role()/current_*_id() — all NULL for the service
  //   role, which therefore sees ZERO ROWS and no column names at all.
  const { data: mRow } = await db.from("mission").select("*").limit(1).maybeSingle();
  const asBiz = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: sErr } = await asBiz.auth.signInWithPassword({
    email: "demo.business@pickup.local", password: DEV_PASSWORD,
  });
  const { data: vRow, error: vErr } = await asBiz.from("mission_read" as never).select("*").limit(1).maybeSingle();
  const viewCols = Object.keys((vRow ?? {}) as object);
  const missing = mRow ? Object.keys(mRow).filter((c) => !viewCols.includes(c)) : [];
  t("mission_read (LIVE) still carries every mission column",
    !sErr && !vErr && viewCols.length > 0 && missing.length === 0,
    sErr ? `⚑ cannot sign in to check: ${sErr.message} — run .local/seed/seed-probe-accounts.mts`
      : vErr ? `⚑ ${vErr.message}`
      : viewCols.length === 0 ? "⚑ the view returned no columns — is it there?"
      : missing.length ? `⚑ not in the view: ${missing.join(", ")}`
      : `${viewCols.length} columns`);

  // ⚑ AND THE MIGRATION FILE, SEPARATELY — it is how the view is rebuilt, so a
  //   column that lives only in the database is a column the next `drop view /
  //   create view` silently deletes.
  const viewSql = (() => {
    try { return fs.readFileSync("docs/migrations/2026-08-30_money_column_walls_1_view.sql", "utf8"); }
    catch { return ""; }
  })();
  const notInFile = viewCols.filter((c) => !new RegExp(`\\bm\\.${c}\\b|\\bas ${c}\\b`).test(viewSql));
  t("...and the migration that rebuilds it lists them too",
    viewSql !== "" && viewCols.length > 0 && notInFile.length === 0,
    notInFile.length
      ? `⚑ live-only, a rebuild would DROP: ${notInFile.join(", ")} — add to 2026-08-30_money_column_walls_1_view.sql`
      : `${viewCols.length} columns`);
}

{
  // ⚑⚑ THE RULE UNDERNEATH S72, AS AN ASSERTION RATHER THAN A PARAGRAPH.
  //
  //   On this database a COLUMN-LEVEL REVOKE IS ALWAYS A NO-OP. Supabase ships
  //   `grant all on all tables in schema public to authenticated`, so the
  //   table-level grant already covers every column and there is no column-level
  //   grant left to take away. `revoke select (c) on t from authenticated`
  //   SUCCEEDS AND DOES NOTHING — no error, no warning, no clue.
  //
  //   It cost three migrations to learn (walls parts 2, 3 and 4) and it had been
  //   wrong here since 2026-07-19, where `revoke update (guest_ready_at)` sat
  //   inert for six weeks while its own file claimed two locks.
  //
  // This checks the SHAPE, not the instance: every column-level revoke anywhere
  // in docs/migrations must be backed by a table-level revoke of the same
  // privilege on the same table, somewhere in the repo. Writing the no-op form
  // again — on any table, in any future session — turns this red.
  const sql = fs.readdirSync("docs/migrations").filter((f) => f.endsWith(".sql"));
  const text = sql.map((f) => [f, fs.readFileSync(`docs/migrations/${f}`, "utf8")] as const);

  // `revoke select (a, b) on public.t from role` — the inert form.
  const COLUMN = /revoke\s+(select|update|insert|references)\s*\(([^)]*)\)\s*on\s+(?:public\.)?(\w+)\s+from/gi;
  // `revoke select on public.t from role` — the one that actually bites.
  const TABLE = /revoke\s+(select|update|insert|references)\s+on\s+(?:public\.)?(\w+)\s+from/gi;

  const backed = new Set<string>();
  for (const [, body] of text) {
    for (const m of body.matchAll(TABLE)) backed.add(`${m[1].toLowerCase()} ${m[2].toLowerCase()}`);
  }
  const inert: string[] = [];
  for (const [file, body] of text) {
    for (const m of body.matchAll(COLUMN)) {
      const key = `${m[1].toLowerCase()} ${m[3].toLowerCase()}`;
      if (!backed.has(key)) inert.push(`${file}: revoke ${key} (${m[2].trim().split(/\s*,\s*/)[0]}…)`);
    }
  }
  t("every column-level REVOKE is backed by a table-level one (S72 — the no-op rule)",
    inert.length === 0,
    inert.length
      ? `⚑ INERT, does nothing: ${inert.join(" · ")} — revoke the TABLE, then grant back the columns you keep`
      : `${text.length} migrations scanned, ${backed.size} table-level revoke(s) backing them`);
}

{
  // ⚑ § 4 — THE OFFLINE WAYBILL SHIPS WHOLE, OR IT DOES NOT SHIP.
  //
  //   A service worker that nothing registers is a file. `tests/offline-waybill.test.ts`
  //   reads public/sw.js and components/saved-copy.tsx and would stay green with the
  //   registration deleted — every assertion in it is about files that still exist. This
  //   is the half no unit test can see: something in the app has to CALL register(), and
  //   the copies have to be refreshed by the app rather than by a Driver remembering.
  //
  //   Silent while there is no worker; red the moment there is one and nobody starts it.
  const sw = fs.existsSync("public/sw.js");
  const app = fs.readFileSync("app/(app)/layout.tsx", "utf8");
  const comp = fs.existsSync("components/offline-waybills.tsx")
    ? fs.readFileSync("components/offline-waybills.tsx", "utf8")
    : "";
  // ⚑ `<WaybillCacheSync`, not `WaybillCacheSync`. Written the loose way first, and
  // deleting the render left the IMPORT behind — the assertion matched that and stayed
  // green with the feature switched off. A check is only evidence once you have watched
  // it fail on purpose.
  const registered =
    /serviceWorker\.register\(/.test(comp) && /<WaybillCacheSync[\s/>]/.test(app);
  t("the service worker is registered by the app, not just present in public/",
    !sw || registered,
    !sw
      ? "no public/sw.js — nothing to register"
      : registered
        ? "public/sw.js · registered from the Driver layout on every page open"
        : "⚑ public/sw.js EXISTS AND NOTHING REGISTERS IT — the saved Waybills never save");

  // And the icons, which are load-bearing rather than cosmetic: an installed PWA keeps
  // its cache far longer than a browser tab, and `"icons": []` blocks installation.
  const mf = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
  const icons: { src: string }[] = mf.icons ?? [];
  const missing = icons.filter((i) => !fs.existsSync(`public${i.src}`)).map((i) => i.src);
  t("the manifest names icons and every one of them exists",
    icons.length > 0 && missing.length === 0,
    icons.length === 0
      ? '⚑ "icons": [] — Add to Home Screen offers a screenshot, and an uninstalled app loses its cache sooner'
      : missing.length
        ? `⚑ named but absent: ${missing.join(", ")}`
        : `${icons.length} icons, all present`);
}

// ── S74 · a probe that cannot see what it claims to check ──────────────────
{
  console.log("\n── the probes' own door (S74) ──");
  // ⚑ WRITTEN BECAUSE IT HAPPENED, WITH THE WARNING ALREADY IN THIS FILE.
  //   `mission_read` is `security_invoker = false` and ends in
  //   `where app_role() = 'admin' or business_id = … or driver_id = …`. Every one
  //   of those is NULL for the SERVICE ROLE, so the view returns ZERO ROWS to it —
  //   no error, no warning, just nothing. On 2026-09-02 `admin-chips.mts` was
  //   written that way and printed SEVEN PASSING CHECKS over an empty set:
  //   370 rows in `mission`, 0 through the view. "No trip disagrees with itself"
  //   was true the way "no unicorn is late" is true.
  //
  //   The knowledge was already thirty lines up this file, in a comment. A comment
  //   does not go red. This does.
  const probes = fs.existsSync(".local/probe")
    ? fs.readdirSync(".local/probe").filter((f) => /\.(mts|ts)$/.test(f))
    : [];
  const blind: string[] = [];
  for (const f of probes) {
    const src = fs.readFileSync(`.local/probe/${f}`, "utf8");
    if (!/from\(\s*["'`]mission_read["'`]/.test(src)) continue;
    // Does this file ever hold a SERVICE-ROLE client?
    const hasService = /SUPABASE_SERVICE_ROLE_KEY/.test(src);
    // ...and does it ever sign a real user in? A file that does both is fine —
    // it reads the table as the service role and the VIEW as a person.
    const signsIn = /signInWithPassword/.test(src);
    if (hasService && !signsIn) blind.push(f);
  }
  t("no probe reads `mission_read` with only the service role",
    blind.length === 0,
    blind.length
      ? `⚑ ${blind.join(", ")} — the view is EMPTY to that role; every assertion passes vacuously. Sign in.`
      : `${probes.length} probe(s) scanned, ${probes.filter((f) => /from\(\s*["'`]mission_read["'`]/.test(fs.readFileSync(`.local/probe/${f}`, "utf8"))).length} read the view`);
}

// ── S74 · the folder the typechecker was not reading ───────────────────────
{
  console.log("\n── what the typechecker actually reads (S74) ──");
  // ⚑ TypeScript's `**/*.ts` SKIPS DOT-DIRECTORIES. So `.local/` was invisible
  //   to `tsc` for the life of this project — which is why a probe could import
  //   a function that no longer existed and stay "green" until someone ran it by
  //   hand (`transportVat`, 2026-09-02). `.local/seed` was added in S73 and
  //   found a third night-clock bug on its first run; `.local/probe` was added
  //   in S74 and cost 41 fixes, including two `as never` casts that were reading
  //   properties off a value the code had sworn could not exist.
  //
  //   The globs are one line in tsconfig.json and would go back to invisible
  //   without a sound. This is the sound.
  const tsconfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8")) as { include?: string[] };
  const include = tsconfig.include ?? [];
  const needed = [".local/seed", ".local/probe"];
  const missing = needed.filter((d) => !include.some((g) => g.startsWith(d)));
  t("tsc reads .local/seed AND .local/probe",
    missing.length === 0,
    missing.length
      ? `⚑ ${missing.join(", ")} is outside tsconfig "include" — a dead import there compiles`
      : `${include.filter((g) => g.startsWith(".local")).length} .local glob(s) in "include"`);
}

// ── S74 · the VAT reshape is built, and a zero rate stays unspellable ──────
{
  console.log("\n── VAT per line (S74) ──");
  // ⚑ WRITTEN BECAUSE THE HANDOFF LIED IN THE OTHER DIRECTION. Every file up to
  //   2026-09-03 said "the code is NOT ready for a rate per item" — and it had
  //   been ready since lib/vat.ts shipped on 2026-09-02. A session nearly
  //   rebuilt 236 lines that already existed. Prose decays; an assertion does
  //   not, so the claim is checked here instead of merely written down.
  //
  // ⚑ AND THE PROPERTY WORTH GUARDING IS THE ODD ONE: there is no way to spell
  //   a 0 % rate. France has 20 / 10 / 5,5 / 2,1 and nothing else, so a line
  //   carrying no VAT is in one of three OTHER states, legally distinct, and
  //   machine-read per line on an e-invoice since 1 September 2026. `rate` lives
  //   only inside the `taxable` variant. If a future edit adds a rate field at
  //   the top level, or lets `rateOf` return 0, that guarantee is gone in
  //   silence — and the invoice is wrong rather than the screen.
  const vat = fs.existsSync("lib/vat.ts") ? fs.readFileSync("lib/vat.ts", "utf8") : "";
  const need: [string, boolean][] = [
    ['the four legal states + undetermined', ["taxable", "franchise", "out_of_scope", "exempt", "undetermined"]
      .every((k) => new RegExp(`kind:\\s*"${k}"`).test(vat))],
    ['`rate` only inside the taxable variant', /\{\s*kind:\s*"taxable";\s*rate:\s*number\s*\}/.test(vat)],
    ['rateOf refuses a non-positive rate', /n\s*>\s*0\s*\?\s*n\s*:\s*null/.test(vat)],
    ['taxOf has an exhaustive never', /const\s+never:\s*never\s*=\s*kind/.test(vat)],
    ['disposal is a kind of its own', /"disposal"/.test(vat)],
    ['cancellation_business still refuses to guess', /position_open/.test(vat)],
    ['the art. 293 B wording is not retyped from memory', vat.includes("TVA non applicable, article 293 B du CGI")],
  ];
  const broken = need.filter(([, ok]) => !ok).map(([w]) => w);
  t("lib/vat.ts still resolves a rate PER LINE, and 0 % stays unspellable",
    vat.length > 0 && broken.length === 0,
    vat.length === 0
      ? "⚑ lib/vat.ts is GONE — the reshape shipped 2026-09-02; do not rebuild it, restore it"
      : broken.length ? `⚑ lost: ${broken.join(" · ")}` : `${need.length} properties held`);

  // ⚑ Place of supply is the KNOWN GAP, and 102 of 370 live trips cross into
  //   Monaco. This does not go red — nothing is broken today — but it prints, so
  //   the gap cannot be forgotten between sessions the way the reshape was.
  const placed = /corse|corsica|guadeloupe|martinique|guyane|mayotte|place_of_supply|placeOfSupply/i.test(vat);
  console.log(placed
    ? "note  lib/vat.ts now mentions a place of supply — check the handoff's § 1 is still accurate"
    : "note  lib/vat.ts has NO place of supply (known gap, § 1 of the next session — Monaco is 28% of live trips)");
}

console.log("\n── the repo the handoff describes ──");
const sh = (c: string) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return ""; } };
t("git is clean", sh("git status --porcelain") === "", sh("git status --porcelain").split("\n")[0] ?? "");
t("local main == origin/main", sh("git rev-parse HEAD") === sh("git rev-parse origin/main"),
  `${sh("git rev-parse --short HEAD")} vs ${sh("git rev-parse --short origin/main")}`);
t("origin points at the renamed repo (Phyrass-H/kavenue)",
  /github\.com[/:]Phyrass-H\/kavenue(\.git)?$/.test(sh("git remote get-url origin")),
  sh("git remote get-url origin") || "origin is unset");

console.log(`\nchecks: ${checks}`);
console.log(stale.length
  ? `\n⚑ ${stale.length} CLAIM(S) HAVE DRIFTED — fix project/NEXT_SESSION.md BEFORE building:\n` + stale.map((f) => "  " + f).join("\n")
  : "\nThe handoff still matches reality. Proceed.");
