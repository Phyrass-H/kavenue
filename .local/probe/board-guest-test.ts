// Live test of board_guest — the fourth settlement door (2026-08-09).
// Tagged throwaway missions, driven through the REAL RPC on a REAL Driver session, then
// deleted by recorded id. Same discipline as write-test.ts: manifest first, try/finally.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import nodeModule from "node:module";
import { waitingAt, waitingRatePerMin } from "../../lib/cancellation.ts";

const repoRoot = new URL("../../", import.meta.url);
nodeModule.registerHooks({
  resolve(spec, ctx, next) {
    if (!spec.startsWith("@/")) return next(spec, ctx);
    const rel = spec.slice(2);
    return next(new URL(/\.[cm]?[jt]s$/.test(rel) ? rel : `${rel}.ts`, repoRoot).href, ctx);
  },
});

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const MANIFEST = ".local/probe/board-guest-manifest.json";
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function undo(ids: string[]) {
  if (!ids.length) return;
  await db.from("mission_cancellation").delete().in("mission_id", ids);
  await db.from("status_event").delete().in("mission_id", ids);
  await db.from("mission").delete().in("id", ids);
}
if (process.argv.includes("--undo")) {
  const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { ids: [] };
  await undo(m.ids ?? []);
  console.log(`cleaned ${m.ids?.length ?? 0}`);
  process.exit(0);
}

const baseline = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
if (!users) throw new Error("auth.admin.listUsers returned no data — check SUPABASE_SERVICE_ROLE_KEY in .env.local");
const bizAuth = users.users.find((u) => u.email === "demo.business@pickup.local");
const drvAuth = users.users.find((u) => u.email === "demo.driver@pickup.local");
if (!bizAuth || !drvAuth) throw new Error("probe accounts missing — run .local/seed/seed-probe-accounts.mts");
const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
if (!disp?.length) throw new Error(`demo.business@pickup.local (auth ${bizAuth.id}) has no Dispatcher row — run .local/seed/seed-probe-accounts.mts`);
const d = disp[0];
const { data: drvRows, error: de } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.id).limit(1);
if (de) throw de;
if (!drvRows?.length) throw new Error(`demo.driver@pickup.local (auth ${drvAuth.id}) has no Driver row — run .local/seed/seed-probe-accounts.mts`);
const driverId = drvRows[0].id;
const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", d.business_id).limit(1);
if (!tmplRows?.length) throw new Error(`Business ${d.business_id} has no mission to clone as the row template — seed one with GET /api/seed`);
const tmpl = tmplRows[0];

// Real sessions, so current_driver_id() / current_business_id() resolve.
const asDriver = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const asBusiness = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
for (const [c, email] of [[asDriver, "demo.driver@pickup.local"], [asBusiness, "demo.business@pickup.local"]] as const) {
  const { error } = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
}

type Case = { id: string; label: string; minsPastDue: number; airport: boolean };
const cases: Case[] = [
  { id: crypto.randomUUID(), label: "city · guest 37 min late  (17 min owed)", minsPastDue: 37, airport: false },
  { id: crypto.randomUUID(), label: "city · guest 5 min late   (nothing owed)", minsPastDue: 5, airport: false },
  { id: crypto.randomUUID(), label: "city · way past the cap   (40 € cap)", minsPastDue: 200, airport: false },
  { id: crypto.randomUUID(), label: "airport · 75 min late     (15 min owed)", minsPastDue: 75, airport: true },
  { id: crypto.randomUUID(), label: "airport · way past cap    (60 € cap)", minsPastDue: 300, airport: true },
];
const ids = cases.map((c) => c.id);
fs.writeFileSync(MANIFEST, JSON.stringify({ createdAt: new Date().toISOString(), ids }, null, 2));

const now = Date.now();
const rows = cases.map((c, i) => ({
  ...tmpl, id: c.id, business_id: d.business_id, dispatcher_id: d.id, driver_id: driverId,
  status: "arrived", reference: `BOARD-${i}`,
  pickup_address: c.airport ? "Aéroport Nice Côte d'Azur, 06206 Nice" : "12 Promenade des Anglais, 06000 Nice",
  pickup_label: null, flight_number: null, guest_ready_at: null,
  pickup_at: new Date(now - c.minsPastDue * 60_000).toISOString(),
  created_at: new Date(now - 86_400_000).toISOString(),
  accepted_at: new Date(now - 86_400_000).toISOString(),
  confirmed_at: new Date(now - 86_400_000).toISOString(),
  ceiling: 300, base_fare: null, pdp_start: 80, pdp_step: 5, pdp_interval: 10, speed_win: false,
  // ⚑ PINNED, NEVER INHERITED FROM `tmpl` ([[d97]]). The template is a REAL
  // mission, and since the S68 reseed real missions carry an `accepted_fare`.
  // Spreading one in silently gives every case a frozen price belonging to
  // another trip — which is precisely how S69 spent a session on a money bug
  // that did not exist. `accepted_at` == `created_at` here, so the honest
  // frozen fare is the opening price: pdp_start.
  accepted_fare: 80,
  pooled_at: null, cancelled_by: null, cancelled_at: null, cancellation_fee: null,
  cancellation_reason: null, no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, checked_in_at: null, stops_reached: 0,
  passenger_name: "Board probe", passenger_names: null, waypoints: null,
}));
const { error: insErr } = await db.from("mission").insert(rows);
if (insErr) { console.error("INSERT FAILED:", insErr.message); await undo(ids); process.exit(1); }
for (const id of ids) await db.from("status_event").insert({ mission_id: id, status: "arrived" });
console.log(`created ${rows.length} tagged 'arrived' missions\n`);

const fails: string[] = [];
let checks = 0;
const check = (ok: boolean, msg: string) => { checks++; if (!ok) fails.push(msg); };

try {
  for (const c of cases) {
    const row = rows.find((r) => r.id === c.id);
    if (!row) throw new Error(`no built row for case ${c.id} (${c.label}) — the cases and the inserted rows have drifted apart`);
    const { error } = await asDriver.rpc("board_guest_call", { p_mission_id: c.id });
    if (error) { fails.push(`${c.label}: RPC REJECTED — ${error.message}`); continue; }

    const { data: after } = await db.from("mission").select("*").eq("id", c.id).maybeSingle();
    // ⚑ Stop here rather than assert. With no row every check below compares
    // `undefined` or NaN and still prints green — a probe that passes against
    // nothing is worse than one that fails.
    if (!after) throw new Error(`mission ${c.id} (${c.label}) is not readable after board_guest — there is nothing to check`);
    const lib = waitingAt(
      { pickup_at: row.pickup_at, guest_ready_at: null, flight_number: null, pickup_address: row.pickup_address } as never,
      new Date(),
    );
    console.log(
      `${c.label.padEnd(42)} status=${after.status.padEnd(8)} ` +
      `sql=${String(after.waiting_minutes ?? 0).padStart(3)}min/${String(after.waiting_fee ?? 0).padStart(5)}€ ` +
      `lib=${String(lib.minutes).padStart(3)}min/${String(lib.fee).padStart(5)}€`,
    );

    check(after.status === "on_board", `${c.label}: status is ${after.status}, expected on_board`);
    check(Number(after.waiting_minutes ?? 0) === lib.minutes,
      `${c.label}: minutes sql=${after.waiting_minutes} lib=${lib.minutes}`);
    check(Number(after.waiting_fee ?? 0) === lib.fee,
      `${c.label}: fee sql=${after.waiting_fee} lib=${lib.fee}`);

    // NULL, not 0, when the Guest was on time.
    if (lib.fee === 0) {
      check(after.waiting_fee === null && after.waiting_minutes === null && after.waiting_from === null,
        `${c.label}: on-time trip should leave the waiting columns NULL, got fee=${after.waiting_fee} min=${after.waiting_minutes} from=${after.waiting_from}`);
    } else {
      // ⚑ THE RATE IS PER SERVICE CLASS since 2026-08-18 — 0,50 Eco / 0,75
      // Business / 1,00 First. This asserted a flat 1,00 and was therefore
      // guaranteed to go red on any trip that is not First. Exactly the S63
      // finding ("diff-sql-vs-lib WAS LYING, asserting a flat 1,00") in a file
      // that never got the same fix. Assert against the rate card, not a
      // number that used to be true.
      // Read the class off the row the DB actually stamped, not off the
      // template the case was cloned from.
      const expectRate = waitingRatePerMin(after.category as never);
      check(!!after.waiting_from && !!after.waiting_to && Number(after.waiting_rate) === expectRate,
        `${c.label}: window/rate not stamped (from=${after.waiting_from} to=${after.waiting_to} rate=${after.waiting_rate}, expected ${expectRate})`);
    }

    // The page-read chain: what the money screens make of it.
    const { rowCost } = await import("../../lib/spend.ts");
    const { historyFare } = await import("../../lib/history-filter.ts");
    const { missionAmount, grossToDriver } = await import("../../lib/earnings.ts");
    const { fare, counted } = historyFare(after as never);
    const business = rowCost({ mission: after, driverId: null, driverName: null, car: null, fare, counted } as never);
    const driverSide = missionAmount(after as never);
    // ⚑ `missionAmount` is NET of commission (`driverNet(m, grossToDriver(m))`),
    // and `fare + waiting` is GROSS. Comparing them has been wrong since
    // commission shipped on 2026-08-17 — the same defect S68 found in
    // write-test's page-read check, where a commission-inclusive number was
    // compared against a bare one. The code was right; the expectation was not.
    // Compare gross with gross, then assert the commission step separately so
    // neither half can drift unnoticed.
    const gross = grossToDriver(after as never);
    check(Math.abs(gross - (Number(fare ?? 0) + Number(after.waiting_fee ?? 0))) < 0.005,
      `${c.label}: Driver gross ${gross} != fare+waiting ${Number(fare ?? 0) + Number(after.waiting_fee ?? 0)}`);
    check(driverSide <= gross + 0.005,
      `${c.label}: Driver net ${driverSide} exceeds gross ${gross}`);
    check(counted === false && business === 0,
      `${c.label}: an on_board trip must stay OUT of the Business total until it completes (counted=${counted}, cost=${business})`);

    // No double settlement: every other door must now refuse.
    // ⚑ `PromiseLike`, not `Promise`. A Supabase query builder is *thenable* — it has
    // `.then`, so `await` works — but it has no `.catch`/`.finally`, so it is not a
    // Promise. The old annotation claimed it was; nothing noticed until this folder
    // was typechecked. `PromiseLike` says exactly what these are.
    const doors: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
      ["mark_no_show (Driver)", asDriver.rpc("mark_no_show_call", { p_mission_id: c.id, p_fare_snapshot: 80 })],
      ["business_declare_no_show", asBusiness.rpc("business_declare_no_show_call", { p_mission_id: c.id, p_fare_snapshot: 80 })],
      ["business_cancel_mission", asBusiness.rpc("business_cancel_mission_call", { p_mission_id: c.id, p_reason: "probe", p_fare_snapshot: 80 })],
    ];
    for (const [name, p] of doors) {
      const { error: e } = await p;
      check(!!e, `${c.label}: ${name} was ACCEPTED on an on_board trip — double settlement is possible`);
    }
    // …and the fee is untouched by those attempts.
    const { data: post } = await db.from("mission").select("status,waiting_fee").eq("id", c.id).maybeSingle();
    if (!post) throw new Error(`mission ${c.id} (${c.label}) is not readable after the refused doors — cannot tell whether one of them touched the row`);
    check(post.status === "on_board" && Number(post.waiting_fee ?? 0) === lib.fee,
      `${c.label}: a refused door still changed the row (status=${post.status} fee=${post.waiting_fee})`);
  }

  // Guard: boarding twice must fail.
  const { error: twice } = await asDriver.rpc("board_guest_call", { p_mission_id: cases[0].id });
  check(!!twice, "board_guest ran a SECOND time on an already-boarded trip");

  console.log(`\nchecks: ${checks}`);
  console.log(fails.length ? `\nPROBLEMS (${fails.length}):\n` + fails.map((f) => "  · " + f).join("\n") : "\nALL AGREE — 0 problems");
} finally {
  await undo(ids);
  const restored = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
  console.log(restored === baseline ? `\ncleaned up · baseline restored (${restored})` : `\n⚠️ NOT RESTORED ${restored} vs ${baseline}`);
}
