// ⚑ CALLS THE `*_call` WRAPPERS (2026-08-31g). The raw SECURITY DEFINER names are closed to
// browser sessions — a composite return bypasses column privileges, so `returns mission` was
// handing each side the other's money. A probe on the old names gets 42501 and reads like an
// outage; it is the wall. Service-role calls are unaffected and are left alone.
// D86 live verification — does reclaim_mission behave as the migration claims?
// Creates tagged missions, drives the REAL RPC with a REAL Business session, then
// restores the baseline. Read-write, but self-cleaning.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const TAG = "S66VERIFY";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, note = "") => {
  console.log(`${ok ? "ok   " : "FAIL "} ${name}${note ? "   " + note : ""}`);
  ok ? pass++ : fail++;
};

const base = await db.from("mission").select("id", { count:"exact", head:true });
if (base.error) throw new Error("counting the mission baseline failed: " + base.error.message);
// ⚑ `=== null`, not `!base.count` — 0 is a real baseline; only a count that never came back is not.
if (base.count === null) throw new Error("the mission count came back null — the run could not prove it restored the baseline");
const BASELINE = base.count;

const { data: users, error: usersErr } = await db.auth.admin.listUsers({ perPage: 200 });
if (usersErr) throw new Error("listing auth users failed: " + usersErr.message);
if (!users) throw new Error("the auth admin API returned no user list — check SUPABASE_SERVICE_ROLE_KEY in .env.local");
const demoB = users.users.find((u)=>u.email==="demo.business@pickup.local");
if (!demoB) throw new Error("demo.business@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: disp, error: dispErr } = await db.from("dispatcher").select("business_id").eq("auth_user_id", demoB.id).single();
if (dispErr) throw new Error("reading the dispatcher for demo.business@pickup.local failed: " + dispErr.message);
if (!disp) throw new Error("demo.business@pickup.local has no dispatcher row — run .local/seed/seed-probe-accounts.mts");
const businessId = disp.business_id;
const { data: tmpl } = await db.from("mission").select("*").eq("business_id", businessId).eq("category","business").limit(1).single();

// ⚑ RESOLVED BY EMAIL, NOT HARDCODED. This held a literal driver id, and the
// 2026-08-26 bleach deleted that Driver — so every run since died at
// `violates foreign key constraint "mission_driver_id_fkey"` before its first
// assertion. It was still listed in the handoff as "20 · D86 end to end", which
// is what a probe nobody has re-run looks like. Same lesson as
// seed-probe-accounts: the bleach removes the accounts the probes depend on, so
// a probe must LOOK THEM UP.
const demoD = users.users.find((u) => u.email === "demo.driver@pickup.local");
if (!demoD) throw new Error("demo.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: drvRow, error: drvErr } = await db.from("driver").select("id").eq("auth_user_id", demoD.id).single();
if (drvErr) throw new Error("reading the driver row for demo.driver@pickup.local failed: " + drvErr.message);
if (!drvRow) throw new Error("demo.driver@pickup.local has no driver row — run .local/seed/seed-probe-accounts.mts");
const DRIVER = drvRow.id;

const asBusiness = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth:{persistSession:false} });
const { error: sErr } = await asBusiness.auth.signInWithPassword({ email:"demo.business@pickup.local", password:DEV_PASSWORD });
if (sErr) throw new Error("sign-in failed: " + sErr.message);

async function make(hoursToPickup: number, over: Record<string, unknown>) {
  const m: any = { ...tmpl }; delete m.id; delete m.created_at;
  // ⚑ PINNED, NEVER INHERITED ([[d97]]) — and pinned to a NON-null number on
  // purpose. "the frozen fare is cleared" below asserts accepted_fare === null
  // after the reclaim; on a row that arrived null it proved nothing at all.
  // Inheriting it from `tmpl` made that assertion's strength depend on whatever
  // trip happened to be first in the table.
  m.accepted_fare = 90;
  const row = { ...m, business_id: businessId, reference: TAG,
    pickup_at: new Date(Date.now() + hoursToPickup*3.6e6).toISOString(),
    driver_id: DRIVER, accepted_at: new Date(Date.now()-3.6e6).toISOString(),
    confirmed_at: new Date(Date.now()-3.6e6).toISOString(),
    checked_in_at: null, no_show:false, close_answer:null, stops_reached:0,
    cancelled_at:null, cancelled_by:null, waiting_from:null, waiting_to:null, waiting_minutes:null,
    ...over };
  const r = await db.from("mission").insert(row).select("*").single();
  if (r.error) throw new Error("seed failed: " + r.error.message);
  return r.data;
}
const tryReclaim = async (id: string) => (await asBusiness.rpc("reclaim_mission_call", { p_mission_id: id })).error?.message ?? null;

console.log("\n── the guard REFUSES what it should ──");
const early = await make(2.6, { status:"confirmed" });
t("T−2.6h — too early, still inside the Driver's grace", (await tryReclaim(early.id)) === "Not eligible for reclaim");

const ci = await make(1.5, { status:"confirmed", checked_in_at:new Date().toISOString() });
t("checked in — the Driver has answered, so it is not reclaimable", (await tryReclaim(ci.id)) === "Not eligible for reclaim");

const enr = await make(1.5, { status:"en_route" });
t("en_route — the Driver is already executing", (await tryReclaim(enr.id)) === "Not eligible for reclaim");

const acc = await make(1.5, { status:"accepted" });
t("⚑ `accepted` is NO LONGER the gate — the dead status is refused", (await tryReclaim(acc.id)) === "Not eligible for reclaim");

console.log("\n── the guard ALLOWS what it should, and does the right thing ──");
const good = await make(1.5, { status:"confirmed" });
const err = await tryReclaim(good.id);
t("T−1.5h, confirmed, never checked in — ACCEPTED", err === null, err ?? "");

const { data: after, error: afterErr } = await db.from("mission").select("*").eq("id", good.id).single();
if (afterErr) throw new Error(`re-reading mission ${good.id} after the reclaim failed: ${afterErr.message}`);
if (!after) throw new Error(`mission ${good.id} is gone after the reclaim — the assertions below would compare undefined and print green`);
t("the trip is back in the Pool", after.status === "pooled", `status=${after.status}`);
t("the Driver is released", after.driver_id === null);
t("the frozen fare is cleared", after.accepted_fare === null);
t("check-in is cleared", after.checked_in_at === null);
t("pooled_at is stamped", !!after.pooled_at);
t("the Ceiling is untouched — a re-pool changes nothing about the price (D82)",
  Number(after.ceiling) === Number(good.ceiling), `${good.ceiling} -> ${after.ceiling}`);

const { data: canc } = await db.from("mission_cancellation").select("*").eq("mission_id", good.id).single();
t("a cancellation record was written", !!canc);
t("⚑ kind is `reclaim`, not the old `t60_reclaim`", canc?.kind === "reclaim", `kind=${canc?.kind}`);
t("no fee to the Business", Number(canc?.fee_amount) === 0 && Number(canc?.fee_pct) === 0);
t("it is recorded as a re-pool, not a terminal cancel", canc?.resulted_in === "repooled");
t("the reason says check-in, not Lock-in", canc?.reason === "Driver did not check in", String(canc?.reason));

const { data: ev } = await db.from("mission_event").select("event_type,source").eq("mission_id", good.id);
const repooled = (ev ?? []).find((e)=>e.event_type === "repooled");
t("§ AG — the event log caught it with no app-side call", !!repooled);
t("§ AG — and on the guaranteed side (db_trigger)", repooled?.source === "db_trigger", `source=${repooled?.source}`);

console.log("\n── the CHECK constraint ──");
const bad = await db.from("mission_cancellation").insert({
  mission_id: good.id, business_id: businessId, party:"business", kind:"t60_reclaim",
  reason:"x", fee_pct:0, fee_amount:0, hours_before_pickup:1, resulted_in:"repooled" });
t("the old `t60_reclaim` value is now rejected by the CHECK", /violates check constraint/i.test(bad.error?.message ?? ""), bad.error?.message ?? "IT WAS ACCEPTED");

console.log("\n── cleanup ──");
const { data: mine } = await db.from("mission").select("id").eq("reference", TAG);
for (const m of mine ?? []) {
  await db.from("mission_cancellation").delete().eq("mission_id", m.id);
  await db.from("mission_event").delete().eq("mission_id", m.id);
  await db.from("status_event").delete().eq("mission_id", m.id);
}
await db.from("mission").delete().eq("reference", TAG);
await db.from("driver").update({ reliability_marks: 0 }).eq("id", DRIVER);
const end = await db.from("mission").select("id", { count:"exact", head:true });
t("baseline restored", end.count === BASELINE, `${end.count} vs ${BASELINE}`);

console.log(`\n${pass} passed · ${fail} failed`);
