// ⚑ CALLS THE `*_call` WRAPPERS (2026-08-31g). The raw SECURITY DEFINER names are closed to
// browser sessions — a composite return bypasses column privileges, so `returns mission` was
// handing each side the other's money. A probe on the old names gets 42501 and reads like an
// outage; it is the wall. Service-role calls are unaffected and are left alone.
// BACKLOG § H2 — the WRITE half: does `RPC writes fee -> page reads it` hold?
//
// Creates a handful of TAGGED throwaway missions on the demo Business, drives them through
// the REAL Business-side RPCs with a REAL authenticated session (so current_business_id()
// resolves), compares every stamped number against lib/, then deletes everything by
// RECORDED ID — never by pattern.
//
//   node .local/probe/write-test.ts          run + compare + clean up
//   node .local/probe/write-test.ts --undo   clean up a run that died half-way
//
// The manifest is written BEFORE anything is created, so --undo always has something to work
// from. Same discipline as .local/seed/.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import nodeModule from "node:module";
import { settledFare } from "../../lib/pdp.ts";
import { businessCancelPct, cancelFeeAmount, waitingAt } from "../../lib/cancellation.ts";

// lib/spend.ts and lib/history-filter.ts import each other through the `@/` alias that
// tsconfig + vitest.config.ts define. Teach plain Node the same alias so this probe loads
// EXACTLY the modules the app and the test suite load — no second copy to drift.
const repoRoot = new URL("../../", import.meta.url);
nodeModule.registerHooks({
  resolve(spec, ctx, next) {
    if (!spec.startsWith("@/")) return next(spec, ctx);
    const rel = spec.slice(2);
    const withExt = /\.[cm]?[jt]s$/.test(rel) ? rel : `${rel}.ts`;
    return next(new URL(withExt, repoRoot).href, ctx);
  },
});

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const MANIFEST = ".local/probe/write-test-manifest.json";
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const TAG = "H2WRITE";

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── cleanup, by recorded id only ─────────────────────────────────────────────
async function undo(ids: string[]): Promise<void> {
  if (!ids.length) { console.log("nothing recorded to undo"); return; }
  await db.from("mission_cancellation").delete().in("mission_id", ids);
  await db.from("status_event").delete().in("mission_id", ids);
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

// ── exact-decimal reference, matching Postgres numeric round(x, 2) ───────────
// Postgres numeric is exact decimal and rounds half AWAY FROM ZERO. Model it with BigInt so
// there is no float anywhere in the reference.
function exactFeeCents(fare: number, pctStr: string): bigint {
  const scale = 12n;
  const toScaled = (s: string): bigint => {
    const neg = s.startsWith("-");
    const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
    const frac = (f + "0".repeat(Number(scale))).slice(0, Number(scale));
    const v = BigInt(i + frac);
    return neg ? -v : v;
  };
  const P = 10n ** scale;
  const f = toScaled(String(fare));
  const p = toScaled(pctStr);
  // fare * pct / 100, kept at `scale`, then rounded to 2 dp half-away-from-zero.
  const prod = (f * p) / P / 100n;                  // scaled by P
  const num = prod * 100n;                          // scaled by P, in cents
  const q = num / P;
  const r = num % P;
  const half = P / 2n;
  const away = r >= half ? 1n : r <= -half ? -1n : 0n;
  return q + away;
}

const baseline = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
console.log(`baseline mission rows: ${baseline}`);

// ── identities ───────────────────────────────────────────────────────────────
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const bizAuth = users?.users.find((u) => u.email === "demo.business@pickup.local");
if (!bizAuth) throw new Error("demo.business@pickup.local has no auth user");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
const dispatcher = disp?.[0];
if (!dispatcher) throw new Error("demo business has no dispatcher row");

const { data: drivers, error: drvErr } = await db.from("driver").select("id").limit(1);
if (drvErr) throw new Error(`driver lookup failed: ${drvErr.message}`);
const driverId = drivers?.[0]?.id;
if (!driverId) throw new Error("the `driver` table is empty — there is nobody to attach a trip to; run .local/seed/seed-probe-accounts.mts");

const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", dispatcher.business_id).limit(1);
const tmpl = tmplRows?.[0];
if (!tmpl) throw new Error(`Business ${dispatcher.business_id} has no mission to clone as the row template — seed one with GET /api/seed`);

// a real authenticated Business session — this is what makes current_business_id() resolve
const asBusiness = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: signInErr } = await asBusiness.auth.signInWithPassword({
  email: "demo.business@pickup.local", password: DEV_PASSWORD,
});
if (signInErr) throw new Error(`sign-in failed: ${signInErr.message}`);
console.log(`signed in as demo Business (business ${dispatcher.business_id.slice(0, 8)}), driver ${driverId.slice(0, 8)} attached`);

// ── the cases ────────────────────────────────────────────────────────────────
// Group A: business_cancel_mission across the whole ramp, with awkward fares.
// Group B: business_declare_no_show — the waiting settlement write path.
// Group C: business_cancel_mission from 'arrived' — cancel fee AND waiting on one row.
type Case = {
  id: string; label: string; kind: "cancel" | "declare_no_show";
  hoursToPickup: number; fare: number; status: string; airport: boolean;
};
const FARES = [70, 85.5, 123.45, 47.99, 199.99, 66.67, 58.33, 91.11];
// 2026-08-09: the ramp now STEPS every half hour. Boundary-heavy on purpose — a tread edge
// is the one place Postgres `ceil(numeric/0.5)*0.5` and JS `Math.ceil(h/0.5)*0.5` could
// disagree, and mid-tread values prove the step is real rather than a relabelled slope.
const HOURS = [
  6,                                  // free, above the ramp
  5, 4.9, 4.75, 4.5001, 4.5, 4.4999,  // the first tread and its edge
  4.25, 3.5, 3.1,                     // mid-tread
  2.5, 2.4999, 2.4,                   // another edge
  1.75, 1.0, 0.9, 0.5, 0.4999, 0.25,  // the last treads
  0.01, -0.5,                         // pickup, and past it
];

const cases: Case[] = [];
HOURS.forEach((h, i) => {
  cases.push({
    id: crypto.randomUUID(), label: `A${i} cancel h=${h}`, kind: "cancel",
    hoursToPickup: h, fare: FARES[i % FARES.length], status: "confirmed", airport: false,
  });
});
// Group B — waiting must already have accrued: pickup in the past beyond the courtesy wait.
([[-0.6, false, "city 16min waiting"], [-1.5, false, "city capped"], [-1.5, true, "airport 30min"], [-3, true, "airport capped"]] as const)
  .forEach(([h, airport, note], i) => {
    cases.push({
      id: crypto.randomUUID(), label: `B${i} declare_no_show ${note}`, kind: "declare_no_show",
      hoursToPickup: h, fare: FARES[i % FARES.length], status: "arrived", airport,
    });
  });
// Group C — the "no door is cheaper" case: cancelling while the meter runs.
([[-0.6, false], [-1.5, true]] as const).forEach(([h, airport], i) => {
  cases.push({
    id: crypto.randomUUID(), label: `C${i} cancel from arrived airport=${airport}`, kind: "cancel",
    hoursToPickup: h, fare: FARES[(i + 3) % FARES.length], status: "arrived", airport,
  });
});

const ids = cases.map((c) => c.id);

// manifest FIRST
fs.writeFileSync(MANIFEST, JSON.stringify({
  createdAt: new Date().toISOString(), tag: TAG, business: dispatcher.business_id,
  missionIds: cases.map((c) => c.id),
}, null, 2));
console.log(`manifest written: ${cases.length} ids\n`);

// ── create ───────────────────────────────────────────────────────────────────
const nowMs = Date.now();
const rows = cases.map((c, i) => ({
  ...tmpl,
  id: c.id,
  business_id: dispatcher.business_id,
  dispatcher_id: dispatcher.id,
  driver_id: driverId,
  status: c.status,
  reference: `${TAG}-${i}`,
  pickup_address: c.airport ? "Aéroport Nice Côte d'Azur, 06206 Nice" : "12 Promenade des Anglais, 06000 Nice",
  pickup_label: null,
  flight_number: null,
  guest_ready_at: null,
  pickup_at: new Date(nowMs + c.hoursToPickup * 3_600_000).toISOString(),
  created_at: new Date(nowMs - 86_400_000).toISOString(),
  accepted_at: new Date(nowMs - 86_400_000).toISOString(), // == created_at -> settledFare == the opening price
  confirmed_at: new Date(nowMs - 86_400_000).toISOString(),
  ceiling: 500,
  base_fare: null,
  // The §6 curve opens at pdp_start and is frozen at accept; accepting at the
  // instant it was posted therefore pins the fare at exactly c.fare, whatever
  // the curve would have done afterwards. pdp_step / pdp_interval are dead.
  pdp_start: c.fare,
  pdp_step: null,
  pdp_interval: null,
  speed_win: false,
  // ⚑ SET EXPLICITLY, AND THIS IS THE WHOLE POINT. Every row here is built by
  // spreading `tmpl`, a REAL mission — so any column this list forgets is
  // silently inherited from it. `accepted_fare` was forgotten, and on
  // 2026-08-26 the reseed put 81,06 on the template. All 27 cases then carried
  // a frozen fare of 81,06 whatever their own pdp_start said, settledFare()
  // returned it, and business_cancel_mission correctly clamped it back up to
  // each case's opening price. The probe read that as 24 money defects in the
  // app. There were none: a trip accepted at the instant it was posted freezes
  // at its opening price, which is exactly c.fare.
  //
  // ⚑ It had been green for four days for the mirror-image reason — the
  // template's accepted_fare was NULL, so every case inherited NULL and
  // settledFare() recomputed from that case's own curve. Inheriting the right
  // answer by accident is not the same as testing for it.
  accepted_fare: c.fare,
  pooled_at: null,
  cancelled_by: null, cancelled_at: null, cancellation_fee: null, cancellation_reason: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, checked_in_at: null, stops_reached: 0,
  passenger_name: `${TAG} probe`, passenger_names: null, reference_note: undefined,
}));
for (const r of rows) delete (r as Record<string, unknown>).reference_note;

const { error: insErr } = await db.from("mission").insert(rows);
if (insErr) { console.error("INSERT FAILED:", insErr.message); await undo(cases.map((c) => c.id)); process.exit(1); }
console.log(`created ${rows.length} tagged missions`);

// From here on, NOTHING may leave rows behind — the first run of this probe crashed on an
// import after the RPCs had run, and 15 rows sat in the live DB until they were cleaned by
// hand. Everything below is inside try/finally.
try {

// ── drive them through the REAL RPCs ─────────────────────────────────────────
// Kept byte-identical to FARE_COLS in app/(dispatch)/dispatch/actions.ts — the
// whole point of this probe is to read what the server action reads.
const FARE_COLS = "id, business_id, ceiling, pdp_start, speed_win, pickup_at, created_at, pooled_at, accepted_at, accepted_fare";
const observed: Array<Record<string, unknown>> = [];

for (const c of cases) {
  // exactly what the server action does: read FARE_COLS, snapshot with settledFare
  const { data: m } = await db.from("mission").select(FARE_COLS).eq("id", c.id).maybeSingle();
  const snapshot = settledFare(m as never);

  // ⚑ THE GUARD FOR THE TRAP ABOVE. Every case is built to freeze at exactly
  // c.fare, so a snapshot that isn't c.fare means a money column leaked in from
  // the template mission — NOT that the app is mispricing. Twelve cases once
  // reported "quote drift" for precisely that reason. Fail loudly, and name it.
  if (Math.abs(snapshot - c.fare) > 0.005) {
    console.error(
      `\nSETUP BROKEN — ${c.label}: settledFare() is ${snapshot} but this case was built to ` +
      `freeze at ${c.fare}. A money column has been inherited from the template mission ` +
      `(the row build spreads \`tmpl\`). Fix the probe, not the app.`,
    );
    throw new Error("probe setup: frozen fare does not match the case");
  }

  const row = rows.find((r) => r.id === c.id);
  if (!row) throw new Error(`${c.label}: no built row for mission ${c.id} — the case list and the inserted rows have drifted apart`);

  // What the MODAL would have quoted at this instant. Calls the SAME functions the modal
  // calls — never a local copy of the formula. A probe with its own arithmetic tests its
  // own arithmetic: this file inlined the euro rounding once, and went on reporting a
  // failure after the app had already been fixed.
  const quoteHours = (Date.parse(row.pickup_at) - Date.now()) / 3_600_000;
  const quotePct = businessCancelPct(quoteHours, true);
  const quoteFee = cancelFeeAmount(snapshot, quotePct);

  // ⚑ THE `_call` WRAPPER, not the inner name — see the header.
  const fn = c.kind === "cancel" ? "business_cancel_mission_call" : "business_declare_no_show_call";
  const args = c.kind === "cancel"
    ? { p_mission_id: c.id, p_reason: `${TAG} probe`, p_fare_snapshot: snapshot }
    : { p_mission_id: c.id, p_fare_snapshot: snapshot };
  const { error } = await asBusiness.rpc(fn, args);

  observed.push({ case: c, snapshot, quoteHours, quotePct, quoteFee, rpc: fn, rpcError: error?.message ?? null });
}

// ── read back ────────────────────────────────────────────────────────────────
const { data: after } = await db.from("mission").select("*").in("id", ids);
const { data: audit } = await db.from("mission_cancellation").select("*").in("mission_id", ids);
const byId = new Map((after ?? []).map((m) => [m.id, m]));
const auditById = new Map((audit ?? []).map((a) => [a.mission_id, a]));

const fails: string[] = [];
let checks = 0;
const check = (ok: boolean, msg: string) => { checks++; if (!ok) fails.push(msg); };

console.log("\n─── per-case ───");
for (const o of observed) {
  const c = o.case as Case;
  const m = byId.get(c.id);
  const a = auditById.get(c.id);
  if (o.rpcError) { fails.push(`${c.label}: RPC REJECTED — ${o.rpcError}`); console.log(`${c.label}: RPC ERROR ${o.rpcError}`); continue; }
  if (!a) { fails.push(`${c.label}: no mission_cancellation row written`); continue; }

  const snapshot = o.snapshot as number;
  const storedPct = String(a.fee_pct);
  const storedFee = Number(a.fee_amount);
  const exactCents = exactFeeCents(snapshot, storedPct);
  const jsFromStoredPct = cancelFeeAmount(snapshot, Number(storedPct));

  console.log(
    `${c.label.padEnd(38)} snap=${snapshot} pct=${Number(storedPct).toFixed(4)} ` +
    `stored=${storedFee} exact=${Number(exactCents) / 100} jsQuoted=${o.quoteFee} ` +
    `wait=${m?.waiting_minutes ?? "-"}min/${m?.waiting_fee ?? "-"}€`,
  );

  // 1. the ramp: SQL's pct == businessCancelPct on SQL's own hours
  if (c.kind === "cancel") {
    const libPct = businessCancelPct(Number(a.hours_before_pickup), true);
    check(Math.abs(libPct - Number(storedPct)) < 1e-9,
      `${c.label}: RAMP sql=${storedPct} lib=${libPct} (hours=${a.hours_before_pickup})`);
  } else {
    check(Number(storedPct) === 100, `${c.label}: no-show pct should be 100, got ${storedPct}`);
  }

  // 2. rounding: what Postgres stored vs exact decimal
  check(Math.round(storedFee * 100) === Number(exactCents),
    `${c.label}: ROUNDING sql stored ${storedFee} but exact decimal is ${Number(exactCents) / 100}`);

  // 3. the mission row agrees with the audit row
  if (c.kind === "cancel") {
    check(Number(m?.cancellation_fee) === storedFee,
      `${c.label}: mission.cancellation_fee=${m?.cancellation_fee} != audit.fee_amount=${storedFee}`);
  }

  // 4. the waiting settlement matches lib/
  if (c.status === "arrived") {
    const settledAt = m?.no_show_at ?? m?.cancelled_at;
    const row = rows.find((r) => r.id === c.id);
    if (!row) throw new Error(`${c.label}: no built row for mission ${c.id} — the waiting settlement has no pickup_at to measure against`);
    const lib = waitingAt(
      { pickup_at: row.pickup_at, guest_ready_at: null,
        flight_number: null, pickup_address: row.pickup_address } as never,
      new Date(settledAt as string),
    );
    check(Number(m?.waiting_minutes ?? 0) === lib.minutes,
      `${c.label}: WAITING min sql=${m?.waiting_minutes} lib=${lib.minutes}`);
    check(Number(m?.waiting_fee ?? 0) === lib.fee,
      `${c.label}: WAITING fee sql=${m?.waiting_fee} lib=${lib.fee}`);
  }

  // 5. the quote the hotel SAW vs the cent it was CHARGED
  if (c.kind === "cancel" && Math.abs((o.quoteFee as number) - storedFee) > 0.0001) {
    fails.push(
      `${c.label}: QUOTE DRIFT modal would have shown ${o.quoteFee} € but the DB stored ${storedFee} € ` +
      `(quote pct ${(o.quotePct as number).toFixed(4)} vs charged ${Number(storedPct).toFixed(4)})`,
    );
  }
  checks++;

  // 6. float formula vs exact decimal, on the pct Postgres actually used
  if (Math.round(jsFromStoredPct * 100) !== Number(exactCents)) {
    fails.push(`${c.label}: FLOAT-vs-DECIMAL on identical inputs — js=${jsFromStoredPct} exact=${Number(exactCents) / 100}`);
  }
  checks++;
}

// ── the page-read chain: what Spend/History would total from these rows ──────
// This is the whole point of the write test: the RPC stamps a number, and the Spend page
// re-derives its own. For a cancel the page reads cancellation_fee back; for a no-show it
// recomputes settledFare. Both must land on what the RPC actually charged.
const { rowCost } = await import("../../lib/spend.ts");
const { historyFare } = await import("../../lib/history-filter.ts");
const { businessCost } = await import("../../lib/commission.ts");
for (const o of observed) {
  const c = o.case as Case;
  const m = byId.get(c.id);
  const a = auditById.get(c.id);
  if (!m || !a) continue;
  const { fare, counted } = historyFare(m as never);
  const cost = rowCost({ mission: m, driverId: null, driverName: null, car: null, fare, counted } as never);
  // ⚑ THE EXPECTED VALUE IS ALL-IN, AND THIS CHECK WAS GREEN FOR THE WRONG
  // REASON UNTIL 2026-08-26. `rowCost` has been commission-inclusive since
  // 2026-08-17 — what leaves the Business's account is the fare plus Kavenue's
  // fee and its VAT (lib/spend.ts:37) — while the RPC's `fee_amount` is the bare
  // cancellation basis. Comparing them directly is comparing two different
  // numbers.
  //
  // It passed anyway for nine days because NOT ONE mission in the live database
  // had `commission_business_rate` stamped (the migration's own note says so:
  // "select count(*) ... -- 0"), so `businessCost` passed every figure straight
  // through and ×1.15 was ×1.00. The S68 reseed stamps the rates exactly where
  // the app stamps them, and every one of these 22 checks went red at once.
  // The code was right; the expectation was not.
  //
  // This is the recorded trap in its purest form: a test can pass for the wrong
  // reason, and only new data will tell you.
  const expected = businessCost(m as never, Number(a.fee_amount ?? 0) + Number(m.waiting_fee ?? 0));
  check(Math.abs(cost - expected) < 0.005,
    `${c.label}: PAGE READ rowCost=${cost} (fare=${fare}, counted=${counted}) but all-in fee+waiting=${expected}`);
}

  console.log(`\nchecks: ${checks}`);
  console.log(fails.length ? `\nPROBLEMS (${fails.length}):\n` + fails.map((f) => "  · " + f).join("\n") : "\nALL AGREE — 0 problems");
} finally {
  // ── cleanup, always ────────────────────────────────────────────────────────
  console.log("");
  await undo(ids);
  const restored = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
  console.log(restored === baseline ? `baseline restored (${restored})` : `⚠️ NOT RESTORED: ${restored} vs baseline ${baseline}`);
}
