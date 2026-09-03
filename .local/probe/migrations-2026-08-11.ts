// Verifies the three migrations the founder applied on 2026-08-09 (dated 08-11):
//   2026-08-11_fee_basis_band.sql            — the fee basis is clamped, not trusted
//   2026-08-11_accept_mission_eligibility.sql — accept enforces the Pool's match
//   2026-08-11_one_live_ask.sql              — one live ask per mission
//
//   node .local/probe/migrations-2026-08-11.ts          run + assert + clean up
//   node .local/probe/migrations-2026-08-11.ts --undo   clean up a run that died half-way
//
// Same discipline as write-test.ts: manifest FIRST, delete by RECORDED ID only, everything
// after creation inside try/finally, baseline asserted at the end. Two pieces of
// non-mission state are also snapshotted and restored: driver.reliability_marks (a driver
// cancel bumps it) and driver.accepts_luggage_runs (case B5 flips it).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const MANIFEST = ".local/probe/migrations-2026-08-11-manifest.json";
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const TAG = "M0811";

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function undo(ids: string[]): Promise<void> {
  if (!ids.length) { console.log("nothing recorded to undo"); return; }
  for (const t of ["mission_amendment", "mission_release", "mission_cancellation", "status_event"] as const) {
    await db.from(t).delete().in("mission_id", ids);
  }
  const { error } = await db.from("mission").delete().in("id", ids);
  if (error) throw error;
  const { count } = await db.from("mission").select("*", { count: "exact", head: true });
  console.log(`cleaned up ${ids.length} tagged missions · mission table now ${count} rows`);
}

if (process.argv.includes("--undo")) {
  const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { missionIds: [] };
  await undo(m.missionIds ?? []);
  process.exit(0);
}

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};
const eur = (n: unknown) => (n == null ? "null" : Number(n).toFixed(2));

const baseline = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
console.log(`baseline mission rows: ${baseline}\n`);

// ── identities ───────────────────────────────────────────────────────────────
const { data: users, error: usersErr } = await db.auth.admin.listUsers({ perPage: 500 });
if (usersErr) throw new Error(`listing auth users failed: ${usersErr.message}`);
if (!users) throw new Error("the auth admin API returned no user list — check SUPABASE_SERVICE_ROLE_KEY in .env.local");
const bizAuth = users.users.find((u) => u.email === "demo.business@pickup.local");
if (!bizAuth) throw new Error("demo.business@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const drvAuth = users.users.find((u) => u.email === "demo.driver@pickup.local");
if (!drvAuth) throw new Error("demo.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: disp, error: dispErr } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
if (dispErr) throw new Error(`reading the dispatcher for demo.business@pickup.local failed: ${dispErr.message}`);
if (!disp?.length) throw new Error("demo.business@pickup.local has no dispatcher row — run .local/seed/seed-probe-accounts.mts");
const dispatcher = disp[0];
const { data: dRows, error: dErr } = await db.from("driver").select("id,accepts_luggage_runs,reliability_marks").eq("auth_user_id", drvAuth.id).limit(1);
if (dErr) throw new Error(`reading the driver row for demo.driver@pickup.local failed: ${dErr.message}`);
if (!dRows?.length) throw new Error("demo.driver@pickup.local has no driver row — run .local/seed/seed-probe-accounts.mts");
const driver = dRows[0];
const { data: vRows, error: vErr } = await db.from("vehicle").select("category,body_type").eq("driver_id", driver.id).limit(1);
if (vErr) throw new Error(`reading the vehicle for driver ${driver.id} failed: ${vErr.message}`);
if (!vRows?.length) throw new Error(`driver ${driver.id} has no vehicle — every (B) case is built from its category and body type; run .local/seed/seed-probe-accounts.mts`);
const myCar = vRows[0];
const otherCategory = myCar.category === "luxury" ? "business" : "luxury";
const otherBody = myCar.body_type === "van" ? "sedan" : "van";

const { data: tmplRows, error: tmplErr } = await db.from("mission").select("*").eq("business_id", dispatcher.business_id).limit(1);
if (tmplErr) throw new Error(`reading a template mission for business ${dispatcher.business_id} failed: ${tmplErr.message}`);
if (!tmplRows?.length) throw new Error(`business ${dispatcher.business_id} has no mission to copy as a template — seed one first with GET /api/seed`);
const tmpl = tmplRows[0];

const signIn = async (email: string): Promise<SupabaseClient> => {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`sign-in ${email} failed: ${error.message}`);
  return c;
};
const asBusiness = await signIn("demo.business@pickup.local");
const asDriver = await signIn("demo.driver@pickup.local");
console.log(`business ${dispatcher.business_id.slice(0, 8)} · driver ${driver.id.slice(0, 8)} · car ${myCar.category}/${myCar.body_type}`);
console.log(`snapshot: reliability_marks=${driver.reliability_marks} accepts_luggage_runs=${driver.accepts_luggage_runs}\n`);

// ── the missions ─────────────────────────────────────────────────────────────
// Pickup times are spread >90 min apart so accept_mission's slot-conflict check
// never fires and can't be mistaken for an eligibility refusal.
type Case = { id: string; label: string } & Record<string, unknown>;
const mk = (label: string, over: Record<string, unknown> = {}): Case => ({
  ...tmpl,
  id: crypto.randomUUID(),
  label,
  business_id: dispatcher.business_id,
  dispatcher_id: dispatcher.id,
  driver_id: null,
  status: "pooled",
  reference: `${TAG}`,
  pickup_address: "12 Promenade des Anglais, 06000 Nice",
  pickup_label: null, flight_number: null, guest_ready_at: null,
  category: myCar.category, required_body_type: null, luggage_only: false,
  ceiling: 200, base_fare: null,
  pdp_start: 120, pdp_step: 5, pdp_interval: 10, speed_win: false,
  // ⚑ PINNED, NEVER INHERITED ([[d97]]). `tmpl` is a REAL mission and since the
  // S68 reseed real missions carry an `accepted_fare`. Spreading one in gives
  // every case a frozen price belonging to a different trip.
  // A pooled trip has not been accepted, so it has no frozen fare. `held()`
  // below sets one, the way accept_mission would.
  accepted_fare: null,
  created_at: new Date(Date.now() - 86_400_000).toISOString(),
  accepted_at: null, confirmed_at: null, checked_in_at: null, pooled_at: new Date(Date.now() - 86_400_000).toISOString(),
  cancelled_by: null, cancelled_at: null, cancellation_fee: null, cancellation_reason: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, stops_reached: 0,
  passenger_name: `${TAG} probe`, passenger_names: null,
  ...over,
});
const held = (label: string, hours: number, over: Record<string, unknown> = {}) =>
  mk(label, {
    status: "confirmed", driver_id: driver.id,
    // Accepted at posting time, so the frozen fare is the opening price.
    accepted_fare: 120,
    pickup_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
    accepted_at: new Date(Date.now() - 86_400_000).toISOString(),
    confirmed_at: new Date(Date.now() - 86_400_000).toISOString(),
    ...over,
  });
const pooled = (label: string, hours: number, over: Record<string, unknown> = {}) =>
  mk(label, { pickup_at: new Date(Date.now() + hours * 3_600_000).toISOString(), ...over });

const cases: Case[] = [
  // (A) the fee-basis band. ceiling 200 / pdp_start 120 → floor 120.
  held("A1 honest business cancel", 3),
  held("A2 business cancel, basis OMITTED, INSIDE the fee window", 1),
  held("A2b business cancel, basis OMITTED, free window", 6),
  held("A3 driver cancel, basis OMITTED", 9),
  held("A4 basis absurdly high", 12),
  held("A5 basis below the floor", 15),
  held("A6 null pdp_start → floor = ceiling/2", 18, { pdp_start: null }),
  // (B) accept eligibility. Pooled, spread far apart.
  pooled("B1 accept matches the car", 30),
  pooled("B2 wrong tier", 33, { category: otherCategory }),
  pooled("B3 wrong body type", 36, { required_body_type: otherBody }),
  pooled("B4 luggage run, not opted in", 39, { luggage_only: true }),
  pooled("B5 luggage run, opted in", 42, { luggage_only: true }),
  // (C) one live ask.
  held("C1 amendment then release", 50),
  held("C2 release then amendment", 53),
  held("C3 two amendments", 56),
  held("C4 the money case", 59),
];
const ids = cases.map((c) => c.id);
fs.writeFileSync(MANIFEST, JSON.stringify({ createdAt: new Date().toISOString(), tag: TAG, missionIds: ids }, null, 2));
console.log(`manifest written: ${ids.length} ids`);

const rows = cases.map(({ label, ...row }) => row);
const { error: insErr } = await db.from("mission").insert(rows);
if (insErr) { console.error("INSERT FAILED:", insErr.message); await undo(ids); process.exit(1); }
console.log(`created ${rows.length} tagged missions\n`);

const get = async (id: string) => {
  const { data, error } = await db.from("mission").select("*").eq("id", id).single();
  if (error) throw new Error(`re-reading mission ${id} failed: ${error.message}`);
  if (!data) throw new Error(`mission ${id} is gone — every assertion built on this row would compare undefined and print green`);
  return data;
};
const cancRow = async (id: string) =>
  (await db.from("mission_cancellation").select("*").eq("mission_id", id).limit(1).maybeSingle()).data;
const C = (l: string) => {
  const found = cases.find((c) => c.label.startsWith(l));
  if (!found) throw new Error(`no probe case whose label starts with "${l}" — this lookup and the cases list above disagree`);
  return found;
};
const propose = async (missionId: string, newFare: number) => {
  const m = await get(missionId);
  const { data, error } = await db.from("mission_amendment").insert({
    mission_id: missionId, business_id: dispatcher.business_id, status: "proposed",
    new_pickup_address: m.pickup_address, new_dropoff_address: m.dropoff_address,
    new_fare: newFare, from_snapshot: { fare: 120 }, note: `${TAG} probe`,
  }).select("id").single();
  if (error) throw error;
  if (!data) throw new Error(`the amendment insert for mission ${missionId} reported no error and returned no row — nothing to respond to`);
  return data.id as string;
};

try {
  // ── (A) THE FEE BASIS IS CLAMPED ───────────────────────────────────────────
  console.log("── 2026-08-11_fee_basis_band ──   (ceiling 200 · pdp_start 120 → floor 120)");
  {
    const c = C("A1");
    const { error } = await asBusiness.rpc("business_cancel_mission", { p_mission_id: c.id, p_reason: null, p_fare_snapshot: 150 });
    const r = await cancRow(c.id);
    t("A1 an honest basis passes through UNCHANGED", !error && Number(r?.fare_snapshot) === 150,
      `${error?.message ?? ""} snapshot=${eur(r?.fare_snapshot)} fee=${eur(r?.fee_amount)} pct=${r?.fee_pct}`);
  }
  {
    // THE headline case: before the fix this recorded 0,00 € on a trip that owed 90%.
    const c = C("A2 ");
    const { error } = await asBusiness.rpc("business_cancel_mission", { p_mission_id: c.id, p_reason: null });
    const r = await cancRow(c.id);
    const expected = Math.round(120 * Number(r?.fee_pct) / 100 * 100) / 100;
    t("A2 ⚑ an OMITTED basis inside the fee window now COSTS money",
      !error && Number(r?.fare_snapshot) === 120 && Number(r?.fee_amount) === expected && Number(r?.fee_amount) > 0,
      `pct=${r?.fee_pct} snapshot=${eur(r?.fare_snapshot)} fee=${eur(r?.fee_amount)} — was 0,00 € before the migration`);
    const m = await get(c.id);
    t("A2 mission.cancellation_fee agrees", Number(m.cancellation_fee) === expected, `${eur(m.cancellation_fee)}`);
  }
  {
    // And a genuinely free cancel still records the basis, with a 0,00 € fee.
    const c = C("A2b");
    await asBusiness.rpc("business_cancel_mission", { p_mission_id: c.id, p_reason: null });
    const r = await cancRow(c.id);
    t("A2b a FREE cancel still records the basis, fee 0,00 €",
      Number(r?.fare_snapshot) === 120 && Number(r?.fee_pct) === 0 && Number(r?.fee_amount) === 0,
      `pct=${r?.fee_pct} snapshot=${eur(r?.fare_snapshot)} fee=${eur(r?.fee_amount)}`);
  }
  {
    const c = C("A3");
    const { error } = await asDriver.rpc("driver_cancel_mission", { p_mission_id: c.id, p_reason: null });
    const r = await cancRow(c.id);
    t("A3 ⚑ Driver side: OMITTED basis records the floor, not NULL",
      !error && Number(r?.fare_snapshot) === 120 && Number(r?.fee_amount) === 120,
      `${error?.message ?? ""} snapshot=${eur(r?.fare_snapshot)} fee=${eur(r?.fee_amount)} (was null before)`);
  }
  {
    const c = C("A4");
    await asBusiness.rpc("business_cancel_mission", { p_mission_id: c.id, p_reason: null, p_fare_snapshot: 99_999 });
    const r = await cancRow(c.id);
    t("A4 an inflated basis is capped at the Ceiling", Number(r?.fare_snapshot) === 200, `snapshot=${eur(r?.fare_snapshot)}`);
  }
  {
    const c = C("A5");
    await asBusiness.rpc("business_cancel_mission", { p_mission_id: c.id, p_reason: null, p_fare_snapshot: 1 });
    const r = await cancRow(c.id);
    t("A5 a basis below the floor is lifted to it", Number(r?.fare_snapshot) === 120, `snapshot=${eur(r?.fare_snapshot)}`);
  }
  {
    const c = C("A6");
    await asBusiness.rpc("business_cancel_mission", { p_mission_id: c.id, p_reason: null });
    const r = await cancRow(c.id);
    t("A6 a null pdp_start falls back to ceiling/2 = 100", Number(r?.fare_snapshot) === 100, `snapshot=${eur(r?.fare_snapshot)}`);
  }

  // ── (B) ACCEPT ENFORCES THE POOL'S MATCH ───────────────────────────────────
  console.log("\n── 2026-08-11_accept_mission_eligibility ──");
  {
    const c = C("B1");
    const { error } = await asDriver.rpc("accept_mission", { p_mission_id: c.id });
    const m = await get(c.id);
    t("B1 a matching car ACCEPTS", !error && m.status === "confirmed" && m.driver_id === driver.id,
      `${error?.message ?? ""} status=${m.status}`);
  }
  // ⚑ B4 SETS THE FLAG IT DEPENDS ON. It used to assume the probe Driver was
  // not opted in, which was true when it was written and stopped being true on
  // 2026-08-26: the bleach deleted the probe accounts and seed-probe-accounts
  // recreated them with `accepts_luggage_runs: true`. B4 then failed with "no
  // error — it accepted!", which reads exactly like a broken SQL guard. A check
  // that reads a precondition instead of setting it is a claim about the
  // database, not about the code. The snapshot taken at startup is restored
  // after B5 either way, so this is safe.
  await db.from("driver").update({ accepts_luggage_runs: false }).eq("id", driver.id);
  for (const [label, why] of [["B2", "wrong tier"], ["B3", "wrong body type"], ["B4", "luggage run, not opted in"]] as const) {
    const c = C(label);
    const { error } = await asDriver.rpc("accept_mission", { p_mission_id: c.id });
    const m = await get(c.id);
    t(`${label} ${why} is REFUSED`, !!error && /not eligible/i.test(error.message) && m.status === "pooled",
      error?.message ?? "(no error — it accepted!)");
  }
  {
    await db.from("driver").update({ accepts_luggage_runs: true }).eq("id", driver.id);
    const c = C("B5");
    const { error } = await asDriver.rpc("accept_mission", { p_mission_id: c.id });
    const m = await get(c.id);
    t("B5 the same luggage run ACCEPTS once the Driver opts in", !error && m.status === "confirmed",
      `${error?.message ?? ""} status=${m.status}`);
    await db.from("driver").update({ accepts_luggage_runs: driver.accepts_luggage_runs }).eq("id", driver.id);
  }

  // ── (C) ONE LIVE ASK PER MISSION ───────────────────────────────────────────
  console.log("\n── 2026-08-11_one_live_ask ──");
  {
    const c = C("C1");
    const amId = await propose(c.id, 175);
    const { error } = await asBusiness.rpc("propose_release", { p_mission_id: c.id, p_note: `${TAG}` });
    const { data: am } = await db.from("mission_amendment").select("status,responded_at").eq("id", amId).single();
    const { data: rel } = await db.from("mission_release").select("status").eq("mission_id", c.id).single();
    t("C1 proposing a release retires the pending change",
      !error && am?.status === "superseded" && !!am?.responded_at && rel?.status === "proposed",
      `${error?.message ?? ""} amendment=${am?.status} release=${rel?.status}`);
  }
  {
    const c = C("C2");
    const { error: pe } = await asBusiness.rpc("propose_release", { p_mission_id: c.id, p_note: `${TAG}` });
    const amId = await propose(c.id, 175);
    const { data: rel } = await db.from("mission_release").select("status,responded_at").eq("mission_id", c.id).single();
    const { data: am } = await db.from("mission_amendment").select("status").eq("id", amId).single();
    t("C2 ⚑ and the other way: inserting a change retires the pending release (the trigger)",
      !pe && rel?.status === "superseded" && !!rel?.responded_at && am?.status === "proposed",
      `release=${rel?.status} amendment=${am?.status}`);
  }
  {
    const c = C("C3");
    const first = await propose(c.id, 150);
    const second = await propose(c.id, 175);
    const { data: a1 } = await db.from("mission_amendment").select("status").eq("id", first).single();
    const { data: a2 } = await db.from("mission_amendment").select("status").eq("id", second).single();
    t("C3 a second change retires the first — enforced in SQL now, not just the app",
      a1?.status === "superseded" && a2?.status === "proposed", `first=${a1?.status} second=${a2?.status}`);
  }
  {
    // The money case, end to end: the amendment must NOT be answerable once the
    // release is out, so the trip re-pools off its ORIGINAL ceiling.
    const c = C("C4");
    const before = await get(c.id);
    const amId = await propose(c.id, 400);
    const { data: rel } = await asBusiness.rpc("propose_release", { p_mission_id: c.id, p_note: `${TAG}` });
    const relId = Array.isArray(rel) ? rel[0].id : (rel as { id: string }).id;

    const { error: amErr } = await asDriver.rpc("respond_to_amendment", { p_amendment_id: amId, p_accept: true, p_reason: null });
    t("C4 the retired change can no longer be accepted", !!amErr && /no longer pending/i.test(amErr.message),
      amErr?.message ?? "(no error — the ceiling would have been raised!)");

    await asDriver.rpc("respond_to_release", { p_release_id: relId, p_accept: true, p_reason: null });
    const after = await get(c.id);
    t("C4 ⚑ the trip re-pools off its ORIGINAL ceiling, not the amended 400 €",
      Number(after.ceiling) === Number(before.ceiling) && Number(after.ceiling) === 200,
      `ceiling ${eur(before.ceiling)} → ${eur(after.ceiling)}, NOT the amended 400`);
    t("C4 and it re-pooled as a normal free release", after.status === "pooled" && after.driver_id === null,
      `status=${after.status}`);
    // ⚑ 2026-08-22, the §6 curve: the re-pool no longer rewrites the opening price at
    // all — pdp_start holds the trip's floor and must survive untouched. Before the
    // curve this read 0.5 × ceiling, and the point of the assertion was that the
    // ceiling it used was the ORIGINAL one. That point is now made by the line above.
    t("C4 the opening price is untouched by the re-pool (still the floor, 120)",
      Number(after.pdp_start) === 120, `pdp_start=${eur(after.pdp_start)}`);
  }
} finally {
  console.log("");
  await undo(ids);
  await db.from("driver").update({
    reliability_marks: driver.reliability_marks,
    accepts_luggage_runs: driver.accepts_luggage_runs,
  }).eq("id", driver.id);
  const { data: d } = await db.from("driver").select("reliability_marks,accepts_luggage_runs").eq("id", driver.id).single();
  t("driver row restored", d?.reliability_marks === driver.reliability_marks && d?.accepts_luggage_runs === driver.accepts_luggage_runs,
    JSON.stringify(d));
  const { count } = await db.from("mission").select("*", { count: "exact", head: true });
  t("baseline restored", count === baseline, `${count} vs ${baseline}`);
  const { data: strag } = await db.from("mission").select("id").eq("reference", TAG);
  t("no tagged stragglers", (strag?.length ?? 0) === 0);
}

console.log(`\n${pass} passed · ${fail} failed`);
