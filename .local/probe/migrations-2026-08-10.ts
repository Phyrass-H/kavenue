// Verifies the two migrations the founder applied on 2026-08-09:
//   2026-08-10_repool_clears_check_in.sql   — every re-pool path nulls checked_in_at
//   2026-08-10_amendment_lock_order.sql     — respond_to_amendment still behaves
//
//   node .local/probe/migrations-2026-08-10.ts          run + assert + clean up
//   node .local/probe/migrations-2026-08-10.ts --undo   clean up a run that died half-way
//
// Same discipline as write-test.ts: manifest FIRST, delete by RECORDED ID only, everything
// after creation inside try/finally, baseline asserted at the end.
//
// It also re-checks the pricing each re-pool branch writes, because the check-in migration
// re-creates three whole RPCs — a copy error there would silently move the 24h SPEED-WIN
// window rather than break anything visible.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const MANIFEST = ".local/probe/migrations-2026-08-10-manifest.json";
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const TAG = "M0810";

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function undo(ids: string[]): Promise<void> {
  if (!ids.length) { console.log("nothing recorded to undo"); return; }
  await db.from("mission_amendment").delete().in("mission_id", ids);
  await db.from("mission_release").delete().in("mission_id", ids);
  await db.from("mission_cancellation").delete().in("mission_id", ids);
  await db.from("status_event").delete().in("mission_id", ids);
  // ⛑ mission_event carries NO foreign key to mission (on purpose — the log outlives the
  // trip), so deleting these missions would otherwise strand their events forever. The
  // table says `Never UPDATE or DELETE a row here` and that rule is about HISTORY; these
  // rows are the history of trips that never existed. Deleted by recorded id only.
  await db.from("mission_event").delete().in("mission_id", ids);
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

const baseline = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
console.log(`baseline mission rows: ${baseline}\n`);

// ── identities ───────────────────────────────────────────────────────────────
const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
if (!users) throw new Error("auth.admin.listUsers returned no data — check SUPABASE_SERVICE_ROLE_KEY in .env.local");
const bizAuth = users.users.find((u) => u.email === "demo.business@pickup.local");
if (!bizAuth) throw new Error("demo.business@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const drvAuth = users.users.find((u) => u.email === "demo.driver@pickup.local");
if (!drvAuth) throw new Error("demo.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const other = users.users.find((u) => u.email === "s46.driver@pickup.local");
if (!other) throw new Error("s46.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");

const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
if (!disp?.length) throw new Error(`no dispatcher row for auth user ${bizAuth.id} (demo.business@pickup.local) — run .local/seed/seed-probe-accounts.mts`);
const dispatcher = disp[0];
// Match on auth_user_id, never on driver.email — the two disagree (NEXT_SESSION S50 trap).
const { data: dRows } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.id).limit(1);
if (!dRows?.length) throw new Error(`no driver row for auth user ${drvAuth.id} (demo.driver@pickup.local) — run .local/seed/seed-probe-accounts.mts`);
const driverId = dRows[0].id as string;
const { data: oRows } = await db.from("driver").select("id").eq("auth_user_id", other.id).limit(1);
if (!oRows?.length) throw new Error(`no driver row for auth user ${other.id} (s46.driver@pickup.local) — run .local/seed/seed-probe-accounts.mts`);
const otherDriverId = oRows[0].id as string;

const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", dispatcher.business_id).limit(1);
if (!tmplRows?.length) throw new Error(`business ${dispatcher.business_id} has no mission to use as a template — every probe row below is built by spreading a real one`);
const tmpl = tmplRows[0];

const signIn = async (email: string): Promise<SupabaseClient> => {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`sign-in ${email} failed: ${error.message}`);
  return c;
};
const asBusiness = await signIn("demo.business@pickup.local");
const asDriver = await signIn("demo.driver@pickup.local");
console.log(`business ${dispatcher.business_id.slice(0, 8)} · driver ${driverId.slice(0, 8)} · other driver ${otherDriverId.slice(0, 8)}\n`);

// ── the cases ────────────────────────────────────────────────────────────────
type Case = {
  id: string; label: string; hours: number; status: string;
  driver?: string; checkedIn: boolean; ceiling: number;
};
const mk = (label: string, hours: number, status: string, o: Partial<Case> = {}): Case => ({
  id: crypto.randomUUID(), label, hours, status, checkedIn: true, ceiling: 200, driver: driverId, ...o,
});

const cases: Case[] = [
  mk("P0 driver_cancel  <24h", 2, "confirmed"),
  mk("P1 driver_cancel  >=24h", 48, "confirmed"),
  // ⛑ 2026-08-24, [[d86]] — this case was `("P2 reclaim <24h", 0.5, "accepted")` and it
  // stopped being reachable the day the reclaim was fixed. `accepted` is a status NOTHING
  // has reached since [[d55]] (0 of 280 mission rows, 0 of 715 status_event rows) — which
  // is precisely why the reclaim sat there as dead code for months. The gate is now
  // `confirmed AND checked_in_at IS NULL`, from T−2h, so the case has to be what a real
  // reclaim looks like: a trip a Driver took and then never checked in on.
  mk("P2 reclaim        T−30min, never checked in", 0.5, "confirmed", { checkedIn: false }),
  // ...and the other half of that gate, which nothing tested before. Without it the probe
  // would still pass on a `reclaim_mission` that had lost its check-in clause entirely.
  mk("P5 reclaim refused · Driver checked in", 0.5, "confirmed"),
  mk("P3 release accept <24h", 2, "confirmed"),
  mk("P4 release accept >=24h", 48, "confirmed"),
  mk("Q0 amendment accept", 6, "confirmed", { checkedIn: false }),
  mk("Q1 amendment decline", 6, "confirmed", { checkedIn: false }),
  mk("Q2 amendment other driver", 6, "confirmed", { checkedIn: false, driver: otherDriverId }),
  mk("Q3 amendment on_board", 6, "on_board", { checkedIn: false }),
  mk("Q4 amendment already answered", 6, "confirmed", { checkedIn: false }),
];
const ids = cases.map((c) => c.id);

fs.writeFileSync(MANIFEST, JSON.stringify({
  createdAt: new Date().toISOString(), tag: TAG, business: dispatcher.business_id, missionIds: ids,
}, null, 2));
console.log(`manifest written: ${ids.length} ids\n`);

const { data: marksRow } = await db.from("driver").select("reliability_marks").eq("id", driverId).single();
if (!marksRow) throw new Error(`driver ${driverId} has no row to read reliability_marks from — the finally block below restores this number and cannot invent it`);
const marksBefore = marksRow.reliability_marks;
console.log(`driver reliability_marks before: ${marksBefore}`);

const nowMs = Date.now();
const day = new Date(nowMs - 86_400_000).toISOString();
const rows = cases.map((c, i) => ({
  ...tmpl,
  id: c.id,
  business_id: dispatcher.business_id,
  dispatcher_id: dispatcher.id,
  driver_id: c.driver ?? null,
  status: c.status,
  reference: `${TAG}-${i}`,
  pickup_address: "12 Promenade des Anglais, 06000 Nice",
  pickup_label: null, flight_number: null, guest_ready_at: null,
  pickup_at: new Date(nowMs + c.hours * 3_600_000).toISOString(),
  created_at: day, accepted_at: day, confirmed_at: day,
  checked_in_at: c.checkedIn ? day : null,
  ceiling: c.ceiling, base_fare: null,
  pdp_start: 100, pdp_step: 5, pdp_interval: 10, speed_win: false, pooled_at: null,
  // ⚑ PINNED, NEVER INHERITED ([[d97]]). Exactly 100 — equal to pdp_start — so the
  // re-pool's `pdp_start = greatest(pdp_start, accepted_fare)` is a no-op and the
  // "pdp_start UNTOUCHED at 100" assertion below still measures what it says.
  accepted_fare: 100,
  cancelled_by: null, cancelled_at: null, cancellation_fee: null, cancellation_reason: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, stops_reached: 0,
  passenger_name: `${TAG} probe`, passenger_names: null,
}));

const { error: insErr } = await db.from("mission").insert(rows);
if (insErr) { console.error("INSERT FAILED:", insErr.message); await undo(ids); process.exit(1); }
console.log(`created ${rows.length} tagged missions\n`);

const get = async (id: string) => {
  const { data, error } = await db.from("mission").select("*").eq("id", id).single();
  if (error) throw new Error(`reading mission ${id} back failed: ${error.message}`);
  if (!data) throw new Error(`mission ${id} is gone — every assertion below it would compare undefined`);
  return data;
};
const byLabel = (l: string) => {
  const found = cases.find((c) => c.label.startsWith(l));
  if (!found) throw new Error(`no probe case whose label starts with '${l}' — the case list and the blocks below disagree`);
  return found;
};

try {
  // ── MIGRATION 1 — every re-pool path must null checked_in_at ────────────────
  console.log("── 2026-08-10_repool_clears_check_in ──");

  const repooled = async (label: string, id: string, expectSpeedWin: boolean) => {
    const m = await get(id);
    t(`${label} · status back to pooled`, m.status === "pooled", `status=${m.status}`);
    t(`${label} · driver_id cleared`, m.driver_id === null);
    t(`${label} · accepted_at + confirmed_at cleared`, m.accepted_at === null && m.confirmed_at === null);
    t(`${label} · ⚑ checked_in_at CLEARED`, m.checked_in_at === null, `checked_in_at=${m.checked_in_at}`);
    t(`${label} · pooled_at re-stamped`, m.pooled_at !== null);
    // ⚑ 2026-08-22 ([[d82]]) — a re-pool no longer flips SPEED WIN. It is the
    // Business's own checkbox and their own money, and under the §6 curve the flip
    // did least exactly when it was supposed to help (+0 % at T−5h). Whatever the
    // Business set is what survives — here, false. `expectSpeedWin` now records
    // which branch the OLD rule would have taken, and is deliberately unused.
    t(`${label} · ⚑ speed_win UNTOUCHED (would once have been ${expectSpeedWin})`,
      m.speed_win === false, `got ${m.speed_win}`);
    // ⚑ 2026-08-22, the §6 curve: a re-pool must now LEAVE pdp_start ALONE. It holds
    // the trip's floor, snapshot once at creation, and the curve opens there for
    // every Driver who ever sees the trip. The old RPCs overwrote it with
    // 0.7 × ceiling / 0.5 × ceiling, which under the new curve would erase the floor
    // the first time a Driver walked. SPEED WIN's hotter opening is derived from
    // `speed_win` on read instead, which is why that assertion above is unchanged.
    t(`${label} · ⚑ pdp_start UNTOUCHED at 100 (the floor survives the re-pool)`,
      Number(m.pdp_start) === 100, `got ${m.pdp_start}`);
  };

  for (const [label, sw] of [["P0", true], ["P1", false]] as const) {
    const c = byLabel(label);
    const { error } = await asDriver.rpc("driver_cancel_mission", { p_mission_id: c.id, p_reason: null, p_fare_snapshot: 100 });
    t(`${c.label} · RPC accepted`, !error, error?.message ?? "");
    if (!error) await repooled(c.label, c.id, sw);
  }

  {
    const c = byLabel("P2");
    const { error } = await asBusiness.rpc("reclaim_mission", { p_mission_id: c.id });
    t(`${c.label} · RPC accepted`, !error, error?.message ?? "");
    // ⛑ `checked_in_at CLEARED` inside repooled() is now VACUOUS on this branch, and is
    // deliberately left in place: [[d86]] only lets a reclaim START from checked_in_at IS
    // NULL, so there is nothing here to clear. The RPC still writes it
    // (2026-08-24_reclaim_at_t2h.sql), and P0/P1/P3/P4 still prove the clearing on rows
    // that really were checked in — which is where migration 1's guarantee now lives.
    if (!error) await repooled(c.label, c.id, true); // reclaim is structurally always <2h
  }

  {
    const c = byLabel("P5");
    const { error } = await asBusiness.rpc("reclaim_mission", { p_mission_id: c.id });
    t(`${c.label} · refused`, !!error && /Not eligible for reclaim/i.test(error.message),
      error?.message ?? "(no error!)");
    const m = await get(c.id);
    t(`${c.label} · still the Driver's, still confirmed`,
      m.status === "confirmed" && m.driver_id === driverId, `status=${m.status} driver=${m.driver_id}`);
  }

  for (const [label, sw] of [["P3", true], ["P4", false]] as const) {
    const c = byLabel(label);
    const { data: rel, error: pe } = await asBusiness.rpc("propose_release", { p_mission_id: c.id, p_note: `${TAG} probe` });
    t(`${c.label} · release proposed`, !pe, pe?.message ?? "");
    if (pe) continue;
    const relId = Array.isArray(rel) ? rel[0].id : (rel as { id: string }).id;
    const { error } = await asDriver.rpc("respond_to_release", { p_release_id: relId, p_accept: true, p_reason: null });
    t(`${c.label} · release accepted`, !error, error?.message ?? "");
    if (!error) await repooled(c.label, c.id, sw);
  }

  // ── MIGRATION 2 — respond_to_amendment under the inverted lock order ────────
  console.log("\n── 2026-08-10_amendment_lock_order ──");

  const propose = async (missionId: string, newFare: number) => {
    const m = await get(missionId);
    const { data, error } = await db.from("mission_amendment").insert({
      mission_id: missionId, business_id: dispatcher.business_id, status: "proposed",
      new_pickup_address: m.pickup_address, new_dropoff_address: m.dropoff_address,
      new_fare: newFare, from_snapshot: { fare: 100 }, note: `${TAG} probe`,
    }).select("id").single();
    if (error) throw error;
    if (!data) throw new Error(`the amendment insert on mission ${missionId} reported no error and returned no row — there is nothing to respond to`);
    return data.id as string;
  };

  {
    const c = byLabel("Q0");
    const amId = await propose(c.id, 175);
    const { error } = await asDriver.rpc("respond_to_amendment", { p_amendment_id: amId, p_accept: true, p_reason: null });
    t(`${c.label} · RPC accepted`, !error, error?.message ?? "");
    const m = await get(c.id);
    const { data: am } = await db.from("mission_amendment").select("status,responded_at").eq("id", amId).single();
    t(`${c.label} · amendment marked accepted`, am?.status === "accepted" && !!am?.responded_at, `status=${am?.status}`);
    // ⚑ 2026-08-22 ([[d81]]) — an amendment NO LONGER collapses the curve, and no
    // longer overwrites the Ceiling. The agreed total is frozen in accepted_fare;
    // the Ceiling is the Business's own maximum and may only ever RISE (here 200
    // stays 200, because the 175 agreed is below it); and pdp_start keeps the
    // trip's real floor, so a re-pool after an amendment still has a band to
    // auction inside. pdp_step / pdp_interval are dead columns, written null.
    t(`${c.label} · the agreed total is frozen in accepted_fare`,
      Number(m.accepted_fare) === 175 && Number(m.base_fare) === 175,
      `accepted_fare=${m.accepted_fare} base_fare=${m.base_fare}`);
    t(`${c.label} · ⚑ the Ceiling is NOT lowered by the amendment`,
      Number(m.ceiling) === 200, `ceiling=${m.ceiling}`);
    t(`${c.label} · ⚑ the floor survives, so the trip can still re-auction`,
      Number(m.pdp_start) === 100, `pdp_start=${m.pdp_start}`);
    t(`${c.label} · dead columns cleared, SPEED WIN off`,
      m.pdp_step === null && m.pdp_interval === null && m.speed_win === false,
      `step=${m.pdp_step} int=${m.pdp_interval} sw=${m.speed_win}`);
    t(`${c.label} · the trip is still the Driver's`, m.driver_id === driverId && m.status === "confirmed");
  }

  {
    const c = byLabel("Q1");
    const amId = await propose(c.id, 175);
    const { error } = await asDriver.rpc("respond_to_amendment", { p_amendment_id: amId, p_accept: false, p_reason: "Can’t extend it" });
    t(`${c.label} · RPC accepted`, !error, error?.message ?? "");
    const m = await get(c.id);
    const { data: am } = await db.from("mission_amendment").select("status,decline_reason").eq("id", amId).single();
    t(`${c.label} · amendment marked declined + reason kept`, am?.status === "declined" && am?.decline_reason === "Can’t extend it");
    t(`${c.label} · mission terms untouched`, Number(m.ceiling) === 200 && Number(m.pdp_start) === 100, `ceiling=${m.ceiling} start=${m.pdp_start}`);
  }

  // The new lock order reads the mission FIRST, so a Driver who doesn't hold it is now
  // rejected with 'Not your mission' where the old order said 'no longer pending'.
  {
    const c = byLabel("Q2");
    const amId = await propose(c.id, 175);
    const { error } = await asDriver.rpc("respond_to_amendment", { p_amendment_id: amId, p_accept: true, p_reason: null });
    t(`${c.label} · refused, and by the new precedence`, !!error && /Not your mission/i.test(error.message), error?.message ?? "(no error!)");
  }

  {
    const c = byLabel("Q3");
    const amId = await propose(c.id, 175);
    const { error } = await asDriver.rpc("respond_to_amendment", { p_amendment_id: amId, p_accept: true, p_reason: null });
    t(`${c.label} · refused (trip already running)`, !!error && /can no longer be changed/i.test(error.message), error?.message ?? "(no error!)");
    const m = await get(c.id);
    t(`${c.label} · mission untouched`, Number(m.ceiling) === 200 && m.status === "on_board");
  }

  {
    const c = byLabel("Q4");
    const amId = await propose(c.id, 175);
    const first = await asDriver.rpc("respond_to_amendment", { p_amendment_id: amId, p_accept: false, p_reason: null });
    t(`${c.label} · first answer accepted`, !first.error, first.error?.message ?? "");
    const second = await asDriver.rpc("respond_to_amendment", { p_amendment_id: amId, p_accept: true, p_reason: null });
    t(`${c.label} · second answer refused`, !!second.error && /no longer pending/i.test(second.error.message), second.error?.message ?? "(no error!)");
  }

  {
    const { error } = await asDriver.rpc("respond_to_amendment", {
      p_amendment_id: "00000000-0000-0000-0000-000000000000", p_accept: true, p_reason: null,
    });
    t("Q5 unknown amendment id refused", !!error && /no longer pending/i.test(error.message), error?.message ?? "(no error!)");
  }
} finally {
  console.log("");
  await undo(ids);
  const { count } = await db.from("mission").select("*", { count: "exact", head: true });
  t("baseline restored", count === baseline, `${count} vs ${baseline}`);
  const { data: strag } = await db.from("mission").select("id").like("reference", `${TAG}-%`);
  t("no tagged stragglers", (strag?.length ?? 0) === 0);
  // two driver-cancels bump Marc's reliability count as a side effect — put it back
  // ⚑ These two guards throw from inside `finally`. That is safe here and nowhere earlier:
  // undo() above has already deleted every tagged mission, so the only thing a throw can
  // still cost is the reliability_marks restore below — which a missing driver row would
  // have cost anyway, as a bare TypeError.
  const { data: afterRow } = await db.from("driver").select("reliability_marks").eq("id", driverId).single();
  if (!afterRow) throw new Error(`driver ${driverId} is gone — reliability_marks cannot be read back or restored to ${marksBefore}`);
  const after = afterRow.reliability_marks;
  await db.from("driver").update({ reliability_marks: marksBefore }).eq("id", driverId);
  const { data: restoredRow } = await db.from("driver").select("reliability_marks").eq("id", driverId).single();
  if (!restoredRow) throw new Error(`driver ${driverId} is gone — cannot confirm reliability_marks went back to ${marksBefore}`);
  const restored = restoredRow.reliability_marks;
  t("driver reliability_marks restored", restored === marksBefore, `${after} -> ${restored} (was ${marksBefore})`);
}

console.log(`\n${pass} passed · ${fail} failed`);
