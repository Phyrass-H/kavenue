// Does the cancel fee a hotel is SHOWN equal the cent it is CHARGED?
//
// Two independent ways it could differ:
//   (1) ROUNDING — the modal rounds in float64, Postgres in exact decimal.
//   (2) THE CLOCK — the fee ramps continuously with time-to-pickup. The modal reads the
//       CLIENT clock and re-ticks only every 30 s (dispatch-cancel.tsx:44-49); the RPC
//       recomputes from the SERVER clock at execution. So the two are never the same instant.
//
// Part A settles (1) with pure arithmetic, no DB. Part B measures (2) live: quote the fee,
// wait like a real person reading a modal, then cancel and compare.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { settledFare } from "../../lib/pdp.ts";
import { businessCancelPct } from "../../lib/cancellation.ts";

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

// ── Part A: float vs exact decimal, no DB ────────────────────────────────────
// Postgres numeric rounds half AWAY FROM ZERO on exact decimal values.
function exactCents(fareCents: bigint, pctMicro: bigint): bigint {
  // fee = fare * pct / 100, in cents, scaled by 1e6 for the pct
  const num = fareCents * pctMicro;          // cents * 1e6 * pct
  const den = 100n * 1_000_000n;
  const q = num / den;
  const r = num % den;
  return r * 2n >= den ? q + 1n : q;
}
const jsCents = (fare: number, pct: number) => Math.round((fare * pct) / 100 * 100);

console.log("── Part A · rounding, 5 000 000 random (fare, pct) pairs ──");
let diverged = 0;
const examples: string[] = [];
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 5_000_000; i++) {
  const fareCents = BigInt(2000 + Math.floor(rnd() * 48000));      // €20.00 – €500.00
  const pctMicro = BigInt(50_000_000 + Math.floor(rnd() * 50_000_000)); // 50.000000 – 100.000000
  const fare = Number(fareCents) / 100;
  const pct = Number(pctMicro) / 1_000_000;
  if (jsCents(fare, pct) !== Number(exactCents(fareCents, pctMicro))) {
    diverged++;
    if (examples.length < 5)
      examples.push(`fare ${fare} × ${pct}% → modal ${jsCents(fare, pct) / 100} vs exact ${Number(exactCents(fareCents, pctMicro)) / 100}`);
  }
}
console.log(`divergences: ${diverged} in 5 000 000 (${((diverged / 5_000_000) * 100).toFixed(6)} %)`);
examples.forEach((e) => console.log("   " + e));

// A deliberately constructed exact tie — the worst case for float rounding.
const tieFare = 100, tiePct = 58.175;
console.log(`constructed tie: fare ${tieFare} × ${tiePct}% → modal ${jsCents(tieFare, tiePct) / 100} vs exact ${Number(exactCents(10000n, 58_175_000n)) / 100}`);

// ── Part B: the clock, live ──────────────────────────────────────────────────
const DWELL_MS = 30_000;
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MANIFEST = ".local/probe/quote-drift-manifest.json";
const TAG = "H2DRIFT";

async function undo(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.from("mission_cancellation").delete().in("mission_id", ids);
  await db.from("status_event").delete().in("mission_id", ids);
  await db.from("mission").delete().in("id", ids);
}
if (process.argv.includes("--undo")) {
  const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { missionIds: [] };
  await undo(m.missionIds ?? []);
  console.log(`cleaned ${m.missionIds?.length ?? 0}`);
  process.exit(0);
}

const baseline = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const bizAuth = users?.users.find((u) => u.email === "demo.business@pickup.local");
if (!bizAuth) throw new Error("demo.business@pickup.local is missing — run npx tsx .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
if (!disp?.length) throw new Error(`no dispatcher row for auth user ${bizAuth.id} (demo.business@pickup.local) — run npx tsx .local/seed/seed-probe-accounts.mts`);
const dispatcher = disp[0];
const { data: drivers } = await db.from("driver").select("id").limit(1);
if (!drivers?.length) throw new Error("no driver rows at all — this probe needs one to own the confirmed missions it creates");
const driverId = drivers[0].id;
const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", dispatcher.business_id).limit(1);
if (!tmplRows?.length) throw new Error(`no existing mission for business ${dispatcher.business_id} to copy as a row template — seed the dataset first`);
const tmpl = tmplRows[0];

const asBusiness = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await asBusiness.auth.signInWithPassword({ email: "demo.business@pickup.local", password: DEV_PASSWORD });

const FARES = [70, 150, 250, 480];
const cases = FARES.map((fare, i) => ({ id: crypto.randomUUID(), fare, hours: 3 - i * 0.4 }));
const ids = cases.map((c) => c.id);
fs.writeFileSync(MANIFEST, JSON.stringify({ createdAt: new Date().toISOString(), tag: TAG, missionIds: ids }, null, 2));

const nowMs = Date.now();
const rows = cases.map((c, i) => ({
  ...tmpl, id: c.id, business_id: dispatcher.business_id, dispatcher_id: dispatcher.id,
  driver_id: driverId, status: "confirmed", reference: `${TAG}-${i}`,
  pickup_address: "12 Promenade des Anglais, 06000 Nice", pickup_label: null, flight_number: null,
  guest_ready_at: null,
  pickup_at: new Date(nowMs + c.hours * 3_600_000).toISOString(),
  created_at: new Date(nowMs - 86_400_000).toISOString(),
  accepted_at: new Date(nowMs - 86_400_000).toISOString(),
  confirmed_at: new Date(nowMs - 86_400_000).toISOString(),
  ceiling: 900, base_fare: null, pdp_start: c.fare, pdp_step: 5, pdp_interval: 10, speed_win: false,
  // ⚑ PINNED, NEVER INHERITED ([[d97]]). `tmpl` is a REAL mission and since the
  // S68 reseed real missions carry an `accepted_fare`. Spreading one in gives
  // every case a frozen price belonging to a different trip.
  // accepted_at == created_at, so the honest frozen fare is the opening price.
  accepted_fare: c.fare,
  pooled_at: null, cancelled_by: null, cancelled_at: null, cancellation_fee: null,
  cancellation_reason: null, no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, checked_in_at: null, stops_reached: 0, passenger_name: `${TAG} probe`,
  passenger_names: null,
}));
const { error: insErr } = await db.from("mission").insert(rows);
if (insErr) { console.error("INSERT FAILED:", insErr.message); await undo(ids); process.exit(1); }

// ⚑ Must stay byte-identical to FARE_COLS in app/(dispatch)/dispatch/actions.ts.
// `accepted_fare` was missing here, so this probe was quoting from a NARROWER
// column set than the app reads — it could not have caught a frozen-fare bug
// even in principle. Reading what the app reads is the whole point of it.
const FARE_COLS = "id, business_id, ceiling, base_fare, pdp_start, pdp_step, pdp_interval, speed_win, created_at, pooled_at, accepted_at, accepted_fare";
try {
  console.log(`\n── Part B · the clock, live (modal read, then ${DWELL_MS / 1000}s dwell, then cancel) ──`);
  // 1. what the modal shows the moment it opens
  const quotes = [];
  for (const c of cases) {
    const { data: m } = await db.from("mission").select(FARE_COLS).eq("id", c.id).maybeSingle();
    const snapshot = settledFare(m as never);
    const seeded = rows.find((r) => r.id === c.id);
    if (!seeded) throw new Error(`case ${c.id} is not among the rows this probe just inserted — no pickup time to quote against`);
    const hours = (Date.parse(seeded.pickup_at) - Date.now()) / 3_600_000;
    const pct = businessCancelPct(hours, true);
    quotes.push({ c, snapshot, pct, fee: Math.round((snapshot * pct) / 100 * 100) / 100 });
  }
  // 2. the hotel reads it, hesitates, clicks
  await new Promise((r) => setTimeout(r, DWELL_MS));
  // 3. the RPC charges from the SERVER clock
  for (const q of quotes) {
    await asBusiness.rpc("business_cancel_mission", {
      p_mission_id: q.c.id, p_reason: `${TAG} probe`, p_fare_snapshot: q.snapshot,
    });
  }
  const { data: audit } = await db.from("mission_cancellation").select("*").in("mission_id", ids);
  const auditById = new Map((audit ?? []).map((a) => [a.mission_id, a]));

  let worst = 0;
  for (const q of quotes) {
    const a = auditById.get(q.c.id);
    if (!a) { console.log(`${q.c.fare}: no audit row`); continue; }
    const charged = Number(a.fee_amount);
    const gap = Math.round((charged - q.fee) * 100) / 100;
    worst = Math.max(worst, Math.abs(gap));
    console.log(
      `fare ${String(q.snapshot).padStart(6)} € · modal showed ${String(q.fee.toFixed(2)).padStart(7)} € ` +
      `(${q.pct.toFixed(4)} %) · DB charged ${String(charged.toFixed(2)).padStart(7)} € ` +
      `(${Number(a.fee_pct).toFixed(4)} %) · gap ${gap >= 0 ? "+" : ""}${gap.toFixed(2)} €`,
    );
  }
  console.log(`\nworst gap over a ${DWELL_MS / 1000}s dwell: ${worst.toFixed(2)} €`);
} finally {
  await undo(ids);
  const restored = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
  console.log(restored === baseline ? `cleaned up · baseline restored (${restored})` : `⚠️ NOT RESTORED ${restored} vs ${baseline}`);
}
