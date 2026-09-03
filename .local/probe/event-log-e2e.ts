// § AG — DOES THE EVENT LOG HAVE HOLES?
//
// vitest cannot answer that: the guarantee lives in a Postgres trigger, not in
// TypeScript. This drives REAL missions through the REAL RPCs with REAL
// authenticated sessions and asserts the exact event sequence that comes out —
// then deletes everything by RECORDED ID, never by pattern.
//
//   node --experimental-strip-types .local/probe/event-log-e2e.ts
//   node --experimental-strip-types .local/probe/event-log-e2e.ts --undo
//
// Run it AFTER pasting docs/migrations/2026-08-24_mission_event_log.sql.
// The manifest is written BEFORE anything is created, so --undo always has
// something to work from.
//
// WHAT IT PROVES
//   1. post -> accept -> walk -> re-pool -> accept -> run -> complete emits
//      exactly EXPECTED_WALK_AND_RETRY, in order, all source='db_trigger'.
//   2. post -> expire emits exactly EXPECTED_POST_THEN_EXPIRE.
//   3. ⚑ A DIRECT PATCH of mission.status — the bypass that
//      p_mission_business_update (docs/kavenue_schema.sql:320-322, USING with no
//      WITH CHECK) still permits — STILL produces an event. This is the whole
//      argument for a trigger over per-writer inserts.
//   4. Actor attribution survives the SECURITY DEFINER RPCs: the Driver who
//      accepted is named, and the sweep is honestly 'unknown'.
//   5. RLS: the Driver who walked sees their own walk; the Driver who took the
//      mission next does NOT; the Business never sees a pool_impression.
//   6. log_mission_event() refuses a forged 'completed' from a browser JWT.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import nodeModule from "node:module";

const repoRoot = new URL("../../", import.meta.url);
nodeModule.registerHooks({
  resolve(spec, ctx, next) {
    if (!spec.startsWith("@/")) return next(spec, ctx);
    const rel = spec.slice(2);
    const withExt = /\.[cm]?[jt]s$/.test(rel) ? rel : `${rel}.ts`;
    return next(new URL(withExt, repoRoot).href, ctx);
  },
});
const { EXPECTED_POST_THEN_EXPIRE, EXPECTED_WALK_AND_RETRY } =
  await import("../../lib/mission-events.ts");

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const MANIFEST = ".local/probe/event-log-e2e-manifest.json";
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const TAG = "AGEVENT";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── cleanup, by recorded id only ─────────────────────────────────────────────
// mission_event has NO foreign key to mission, on purpose (a log must outlive its
// subject) — so it does NOT cascade and MUST be deleted explicitly here.
async function undo(ids: string[]): Promise<void> {
  if (!ids.length) { console.log("nothing recorded to undo"); return; }
  await db.from("mission_event").delete().in("mission_id", ids);
  await db.from("mission_cancellation").delete().in("mission_id", ids);
  await db.from("status_event").delete().in("mission_id", ids);
  const { error } = await db.from("mission").delete().in("id", ids);
  if (error) throw error;
  console.log(`cleaned up ${ids.length} tagged missions + their events`);
}

if (process.argv.includes("--undo")) {
  const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { missionIds: [] };
  await undo(m.missionIds ?? []);
  process.exit(0);
}

// ── assertions ───────────────────────────────────────────────────────────────
let checks = 0; const failures: string[] = [];
const t = (name: string, ok: boolean, note = "") => {
  checks++; if (!ok) failures.push(`${name}  ${note}`);
  console.log(`${ok ? "ok   " : "FAIL "} ${name}${note ? "   " + note : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) =>
  t(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// The table must exist before anything else is worth running.
{
  const probe = await db.from("mission_event").select("id", { count: "exact", head: true });
  if (probe.error) {
    console.error(`\nmission_event is ABSENT (${probe.error.code}). Paste ` +
      `docs/migrations/2026-08-24_mission_event_log.sql into the Supabase SQL editor first.\n`);
    process.exit(1);
  }
  console.log(`mission_event exists · ${probe.count} rows before this run`);
}

// ── identities ───────────────────────────────────────────────────────────────
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const bizAuth = users?.users.find((u) => u.email === "demo.business@pickup.local");
const drvAuth = users?.users.find((u) => u.email === "demo.driver@pickup.local");
if (!bizAuth || !drvAuth) throw new Error("demo.business@ / demo.driver@pickup.local missing");

const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
const dispatcher = disp?.[0];
if (!dispatcher) throw new Error("demo business has no dispatcher row");

const { data: drvRow } = await db.from("driver").select("id,operational_zones").eq("auth_user_id", drvAuth.id).limit(1);
const driverA = drvRow?.[0];
if (!driverA) throw new Error("demo driver has no driver row");

// A SECOND Driver, for the RLS test: they must not be able to read Driver A's walk.
const { data: others } = await db.from("driver").select("id,auth_user_id").neq("id", driverA.id).limit(1);
const driverB = others?.[0] ?? null;

const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", dispatcher.business_id).limit(1);
const tmpl = tmplRows?.[0];
if (!tmpl) throw new Error("no template mission to copy shape from");

const asBusiness = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
{
  const { error } = await asBusiness.auth.signInWithPassword({ email: "demo.business@pickup.local", password: DEV_PASSWORD });
  if (error) throw new Error(`business sign-in failed: ${error.message}`);
}
const asDriver = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
{
  const { error } = await asDriver.auth.signInWithPassword({ email: "demo.driver@pickup.local", password: DEV_PASSWORD });
  if (error) throw new Error(`driver sign-in failed: ${error.message}`);
}
console.log(`signed in · dispatcher ${dispatcher.id.slice(0, 8)} · driver ${driverA.id.slice(0, 8)}`);

// ── the three missions ───────────────────────────────────────────────────────
const M_WALK = crypto.randomUUID();     // 1: the full walk-and-retry
const M_EXPIRE = crypto.randomUUID();   // 2: post -> expire
const M_PATCH = crypto.randomUUID();    // 3: the direct-PATCH bypass
const ids = [M_WALK, M_EXPIRE, M_PATCH];

fs.writeFileSync(MANIFEST, JSON.stringify({
  createdAt: new Date().toISOString(), tag: TAG,
  business: dispatcher.business_id, missionIds: ids,
}, null, 2));
console.log(`manifest written: ${ids.length} ids\n`);

const nowMs = Date.now();
const base = (id: string, hoursToPickup: number) => ({
  ...tmpl,
  id,
  business_id: dispatcher.business_id,
  dispatcher_id: dispatcher.id,
  driver_id: null,
  status: "pooled",
  category: tmpl.category,
  zone: tmpl.zone,
  reference: `${TAG}-${id.slice(0, 4)}`,
  pickup_at: new Date(nowMs + hoursToPickup * 3_600_000).toISOString(),
  created_at: new Date(nowMs).toISOString(),
  accepted_at: null, confirmed_at: null, accepted_fare: null,
  ceiling: 500, base_fare: null, pdp_start: 90, pdp_step: null, pdp_interval: null,
  speed_win: false, pooled_at: null, stops_reached: 0, waypoints: null,
  cancelled_by: null, cancelled_at: null, cancellation_fee: null, cancellation_reason: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, checked_in_at: null, close_answer: null, close_answered_at: null,
  passenger_name: `${TAG} probe`, passenger_names: null,
});

// ⚑ Inserted through the DISPATCHER's authenticated session, not the service
//    role, so the trigger can name the actor. That is half of what is being tested.
const { error: insErr } = await asBusiness.from("mission").insert([
  base(M_WALK, 8), base(M_EXPIRE, -0.25), base(M_PATCH, 8),
]);
if (insErr) throw new Error(`insert failed: ${insErr.message}`);

const events = async (missionId: string) => {
  const { data } = await db.from("mission_event")
    .select("event_type,source,actor_kind,actor_id,driver_id,audience,occurred_at,seq,payload")
    .eq("mission_id", missionId)
    .order("occurred_at").order("seq");
  return data ?? [];
};
const types = async (missionId: string) =>
  (await events(missionId)).filter((e) => e.source === "db_trigger").map((e) => e.event_type);

// ── 1. insert-as-pooled is TWO events, not one ───────────────────────────────
// This is what restores the timeline that app/(dispatch)/dispatch/new/actions.ts:381-384
// destroys: "the mission was created" and "it entered the Pool" stay separate facts.
eq("post emits created THEN pooled", await types(M_WALK), ["created", "pooled"]);
{
  const [created] = await events(M_WALK);
  t("the Dispatcher who posted it is named", created?.actor_kind === "dispatcher", `actor_kind=${created?.actor_kind}`);
  t("actor_id is the dispatcher row, not the auth user", created?.actor_id === dispatcher.id);
  t("the pool entry is NOT visible to Drivers", !(created?.audience ?? []).includes("driver"), JSON.stringify(created?.audience));
}

// ── 2. accept -> walk -> re-pool -> accept -> run -> complete ────────────────
// accept_mission is SECURITY DEFINER; auth.uid() survives it, so the Driver is named.
{
  const { error } = await asDriver.rpc("accept_mission", { p_mission_id: M_WALK, p_fare: 90 });
  if (error) throw new Error(`accept #1 failed: ${error.message}`);
}
{
  const ev = (await events(M_WALK)).at(-1);
  t("accept is logged as 'confirmed' (pooled->confirmed is one UPDATE; 'accepted' never commits)",
    ev?.event_type === "confirmed" && (ev?.payload as Record<string, unknown>)?.from === "pooled",
    `${ev?.event_type} from=${(ev?.payload as Record<string, unknown>)?.from}`);
  t("the accepting Driver is named through the SECURITY DEFINER RPC",
    ev?.actor_kind === "driver" && ev?.actor_id === driverA.id, `actor_kind=${ev?.actor_kind}`);
}

// The walk.
{
  const { error } = await asDriver.rpc("driver_cancel_mission", { p_mission_id: M_WALK });
  if (error) throw new Error(`driver_cancel_mission failed: ${error.message}`);
}
{
  const ev = (await events(M_WALK)).at(-1);
  t("the walk is logged as 'repooled', not as a bare 'pooled'", ev?.event_type === "repooled", ev?.event_type);
  t("⚑ the event keeps the WALKER's driver_id, so the next Driver cannot read it",
    ev?.driver_id === driverA.id, `driver_id=${ev?.driver_id}`);
  t("payload records who walked", (ev?.payload as Record<string, unknown>)?.previous_driver_id === driverA.id);
}

// Accept again (same Driver — the point is the second pass through the curve).
{
  const { error } = await asDriver.rpc("accept_mission", { p_mission_id: M_WALK, p_fare: 95 });
  if (error) throw new Error(`accept #2 failed: ${error.message}`);
}

// Drive it. Through the SERVICE ROLE, exactly as app/(app)/rides/actions.ts:127 does —
// so this also proves the trigger fires on the path where auth.uid() is NULL.
for (const s of ["en_route", "arrived"]) {
  const { error } = await db.from("mission").update({ status: s }).eq("id", M_WALK);
  if (error) throw new Error(`advance ${s} failed: ${error.message}`);
}
{
  const { error } = await asDriver.rpc("board_guest", { p_mission_id: M_WALK });
  if (error) throw new Error(`board_guest failed: ${error.message}`);
}
{
  const { error } = await db.from("mission").update({ status: "completed" }).eq("id", M_WALK);
  if (error) throw new Error(`complete failed: ${error.message}`);
}

eq("⚑ THE FULL SEQUENCE, no holes", await types(M_WALK), EXPECTED_WALK_AND_RETRY);
{
  const all = await events(M_WALK);
  t("every row of it is source='db_trigger' — nothing here was remembered by hand",
    all.every((e) => e.source === "db_trigger"),
    [...new Set(all.map((e) => e.source))].join(","));
  const serviceRole = all.filter((e) => ["en_route", "arrived", "completed"].includes(e.event_type));
  t("service-role writes are logged with actor 'unknown', never a guess",
    serviceRole.every((e) => e.actor_kind === "unknown"),
    serviceRole.map((e) => `${e.event_type}=${e.actor_kind}`).join(" "));
  const times = all.map((e) => e.occurred_at);
  t("occurred_at is non-decreasing across the whole life of the mission",
    times.every((v, i) => i === 0 || Date.parse(v) >= Date.parse(times[i - 1])));
}

// ── 3. post -> expire ────────────────────────────────────────────────────────
{
  const { error } = await db.rpc("expire_stale_missions");
  if (error) throw new Error(`expire_stale_missions failed: ${error.message}`);
}
eq("post -> expire", await types(M_EXPIRE), EXPECTED_POST_THEN_EXPIRE);
{
  const ev = (await events(M_EXPIRE)).at(-1);
  t("the sweep's actor is honestly unknown", ev?.actor_kind === "unknown", ev?.actor_kind);
  t("an expiry is not shown to Drivers", !(ev?.audience ?? []).includes("driver"));
}

// ── 4. ⚑ THE BYPASS. A direct PATCH of mission.status, no RPC involved. ──────
// p_mission_business_update is USING-only with no WITH CHECK
// (docs/kavenue_schema.sql:320-322), so a Dispatcher can do this straight through
// PostgREST today. Option A ("insert from each writer") is blind to it. The
// trigger is not — the bypass logs itself.
{
  const { error } = await asBusiness.from("mission").update({ status: "cancelled" }).eq("id", M_PATCH);
  t("a Dispatcher CAN still PATCH mission.status directly (the hole is real)", !error, error?.message ?? "");
}
{
  const seq = await types(M_PATCH);
  eq("⚑ the direct PATCH produced an event anyway", seq, ["created", "pooled", "cancelled"]);
  const ev = (await events(M_PATCH)).at(-1);
  t("and it named the Dispatcher who did it", ev?.actor_kind === "dispatcher" && ev?.actor_id === dispatcher.id,
    `${ev?.actor_kind}/${ev?.actor_id}`);
}

// A status UPDATE that changes nothing must NOT produce a row — `update of status`
// fires on mention, and every PostgREST patch mentions it.
{
  const before = (await events(M_PATCH)).length;
  await db.from("mission").update({ status: "cancelled" }).eq("id", M_PATCH);
  const after = (await events(M_PATCH)).length;
  t("a no-op status write emits nothing", before === after, `${before} -> ${after}`);
}

// ── 5. RLS ───────────────────────────────────────────────────────────────────
{
  const { data } = await asDriver.from("mission_event").select("event_type").eq("mission_id", M_WALK);
  const seen = (data ?? []).map((e) => e.event_type).sort();
  t("Driver A sees their own trip, including their own walk", seen.includes("repooled"), seen.join(","));
  t("Driver A does NOT see the pool entries (not their business)",
    !seen.includes("pooled") && !seen.includes("created"), seen.join(","));
}
if (driverB?.auth_user_id) {
  const bAuth = users?.users.find((u) => u.id === driverB.auth_user_id);
  const asDriverB = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: bErr } = bAuth?.email
    ? await asDriverB.auth.signInWithPassword({ email: bAuth.email, password: DEV_PASSWORD })
    : { error: { message: "no email" } as { message: string } };
  if (bErr) {
    console.log(`skip  another Driver cannot read Driver A's walk   (no signin for driver B: ${bErr.message})`);
  } else {
    const { data } = await asDriverB.from("mission_event").select("id").eq("mission_id", M_WALK);
    t("⚑ another Driver reads NOTHING of this mission's history", (data ?? []).length === 0, `${(data ?? []).length} rows`);
  }
} else {
  console.log("skip  another-Driver RLS check (only one driver row exists)");
}
{
  const { data } = await asBusiness.from("mission_event").select("event_type").eq("mission_id", M_WALK);
  const seen = (data ?? []).map((e) => e.event_type);
  t("the Business sees its own mission's whole trigger timeline",
    seen.length === EXPECTED_WALK_AND_RETRY.length, `${seen.length} of ${EXPECTED_WALK_AND_RETRY.length}`);
}

// ── 6. the B-side RPC ────────────────────────────────────────────────────────
{
  const { data, error } = await asDriver.rpc("log_mission_event", {
    p_mission_id: M_WALK, p_event_type: "pool_impression", p_payload: { probe: TAG },
  });
  t("a Driver can log a Pool impression", !error && !!data, error?.message ?? "");
}
{
  const { error } = await asDriver.rpc("log_mission_event", {
    p_mission_id: M_WALK, p_event_type: "completed", p_payload: {},
  });
  t("⚑ a Driver CANNOT forge a 'completed' through the B-side RPC", !!error, error?.message ?? "no error — FORGEABLE");
}
{
  const { data } = await asBusiness.from("mission_event").select("event_type").eq("mission_id", M_WALK).eq("event_type", "pool_impression");
  t("⚑ the Business cannot see what a Driver browsed", (data ?? []).length === 0, `${(data ?? []).length} rows`);
}
{
  const { error } = await asDriver.from("mission_event").insert({
    mission_id: M_WALK, event_type: "completed", source: "db_trigger",
  });
  t("⚑ a browser JWT cannot INSERT into the log directly", !!error, error?.message ?? "no error — WRITABLE");
}
{
  const { data: before } = await db.from("mission_event").select("id").eq("mission_id", M_WALK).eq("event_type", "completed").limit(1);
  const { error } = await asDriver.from("mission_event").delete().eq("id", before?.[0]?.id ?? "");
  const { data: after } = await db.from("mission_event").select("id").eq("mission_id", M_WALK).eq("event_type", "completed").limit(1);
  t("⚑ a browser JWT cannot DELETE from the log (append-only)", (after ?? []).length === 1, error?.message ?? "");
}

// ── 7. the reconciliation invariant, on this run's own rows ──────────────────
{
  const { data: ms } = await db.from("mission").select("id,status,no_show").in("id", ids);
  const holes: string[] = [];
  for (const m of ms ?? []) {
    const want = m.status === "completed" && m.no_show ? "no_show" : m.status;
    const { count } = await db.from("mission_event").select("id", { count: "exact", head: true })
      .eq("mission_id", m.id).eq("event_type", want).eq("source", "db_trigger");
    if (!count) holes.push(`${m.id.slice(0, 8)}:${want}`);
  }
  t("⚑ every mission this run created has a trigger event for its terminal state",
    holes.length === 0, holes.join(", "));
}

// ── cleanup, always ──────────────────────────────────────────────────────────
await undo(ids);
console.log(`\n${checks - failures.length}/${checks} passed`);
if (failures.length) { console.error("\nFAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
