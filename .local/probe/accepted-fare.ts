// ⚑ CALLS THE `*_call` WRAPPERS. 2026-08-31g closed the raw SECURITY DEFINER functions to
// browser sessions (a composite return bypasses column privileges, so `returns mission` was
// handing a Driver the Ceiling). A probe on the old names gets 42501 and reads like an
// outage; it is the wall. The service role still reaches the inner names, so only the
// `asDriver` calls move.
// READ+WRITE probe — the frozen fare and the RE-POOL FLOOR (founder, 2026-08-22).
// Drives the whole cycle on the REAL database through the REAL RPCs:
//   post → accept (fare freezes) → Driver walks → re-pool must NOT open below it.
// Cleans up in a finally.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types.ts";
import fs from "node:fs";
import type { MissionRow } from "../../lib/database.types.ts";
import { currentFare, openingPrice, settledFare } from "../../lib/pdp.ts";
import { COMMISSION_RATE_COLS, commissionSplit, courseFromBusinessTotal, ratesFromRow } from "../../lib/commission.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const signIn = async (email: string): Promise<SupabaseClient> => {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`sign-in ${email} failed: ${error.message}`);
  return c;
};

const TAG = "AFPROBE";
const HOUR = 3_600_000;
const FARE_COLS = "id, business_id, ceiling, pdp_start, speed_win, pickup_at, created_at, pooled_at, accepted_at, accepted_fare";
/** Exactly the columns FARE_COLS selects — keep the two in step. */
type FareRow = Pick<
  MissionRow,
  "id" | "business_id" | "ceiling" | "pdp_start" | "speed_win"
  | "pickup_at" | "created_at" | "pooled_at" | "accepted_at" | "accepted_fare"
>;
let checks = 0; const fails: string[] = [];
const t = (name: string, ok: boolean, note = "") => {
  checks++; if (!ok) fails.push(`${name}  ${note}`);
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "   " + note : ""}`);
};
const eur = (n: number | null | undefined) => (n == null ? "—" : Number(n).toFixed(2));

const { data: rateRow } = await db.from("commission_rate").select(COMMISSION_RATE_COLS)
  .lte("effective_from", new Date().toISOString()).order("effective_from", { ascending: false }).limit(1).maybeSingle();
const rates = ratesFromRow(rateRow);

const asDriver = await signIn("demo.driver@pickup.local");
const { data: drvAuth } = await asDriver.auth.getUser();
if (!drvAuth.user) throw new Error("signed in as demo.driver@pickup.local but getUser() returned no user — the session did not stick");
const { data: dRows } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.user.id).limit(1);
if (!dRows?.length) throw new Error(`no driver row for auth user ${drvAuth.user.id} (demo.driver@pickup.local) — run .local/seed/seed-probe-accounts.mts`);
const driverId = dRows[0].id as string;
// The Driver must have a matching vehicle or accept_mission refuses (§ B).
const { data: veh } = await db.from("vehicle").select("category, body_type").eq("driver_id", driverId).limit(1).maybeSingle();
if (!veh) throw new Error(`Driver ${driverId} (demo.driver@pickup.local) has no vehicle — run .local/seed/seed-probe-accounts.mts`);
const { data: biz } = await db.from("business").select("id").limit(1).maybeSingle();
if (!biz) throw new Error("no Business rows at all — this probe posts its mission as one; seed the Businesses first");
const { data: disp } = await db.from("dispatcher").select("id").eq("business_id", biz.id).limit(1).maybeSingle();
if (!disp) throw new Error(`Business ${biz.id} has no Dispatcher — a mission needs one to post it; run .local/seed/seed-probe-accounts.mts`);

const { data: q } = await db.rpc("mission_price",
  { p_tier: veh.category, p_body: veh.body_type, p_km: 31, p_night: false }).maybeSingle();
// ⚑ A THROW, NOT `q!`. With no rate card in force every number below is NaN, and
// NaN comparisons make assertions pass and fail at random. Stop, and say why.
if (!q) throw new Error(`mission_price returned no row for ${veh.category}/31 km — is there a rate card in force?`);
const course = courseFromBusinessTotal(Number(q.ceiling_price), rates);
const floorCourse = Math.round(courseFromBusinessTotal(Number(q.floor_price), rates) * 100) / 100;

// Posted 48h before the pickup; we are now at T−30h, so it has really climbed.
const pickupMs = Date.now() + 30 * HOUR;
const createdMs = pickupMs - 48 * HOUR;
const ids: string[] = [];

console.log(`\n${veh.category}/${veh.body_type} 31 km — floor ${eur(q.floor_price)} → ceiling ${eur(q.ceiling_price)} all-in`);
console.log(`stored Course: ceiling ${eur(course)} · floor ${eur(floorCourse)}\n`);

try {
  const { data: made, error: insErr } = await db.from("mission").insert({
    business_id: biz.id, dispatcher_id: disp.id, status: "pooled",
    category: veh.category, required_body_type: veh.body_type, zone: "nice", reference: TAG,
    pickup_address: "Aéroport Nice Côte d'Azur, Terminal 2, 06200 Nice", pickup_lat: 43.663, pickup_lng: 7.215,
    dropoff_address: "Cannes", dropoff_lat: 43.552, dropoff_lng: 7.017,
    pickup_at: new Date(pickupMs).toISOString(), created_at: new Date(createdMs).toISOString(),
    distance_km: 31, duration_min: 50, pax_count: 2, luggage_count: 2,
    ceiling: course, pdp_start: floorCourse, pdp_step: null, pdp_interval: null, speed_win: false,
    rate_card_id: q.rate_card_id, night_applied: false,
    commission_business_rate: rates?.businessHt ?? null, commission_driver_rate: rates?.driverHt ?? null,
    commission_vat_rate: rates?.feeVat ?? null,
  }).select("id").maybeSingle();
  if (insErr) throw insErr;
  if (!made) throw new Error("the mission insert reported no error and returned no row — nothing to accept");
  ids.push(made.id);

  // ⚑ THIS USED TO END `as never`, which is not a type — it is the compiler
  // being told "this case cannot happen". `never` has no properties, so every
  // `.accepted_fare` below was reading a field off a value the code had sworn
  // did not exist. It compiled only because nothing typechecked this folder.
  // Naming the real columns costs one line and makes the reads honest.
  const read = async (): Promise<FareRow> => {
    const { data, error } = await db.from("mission").select(FARE_COLS).eq("id", made.id).maybeSingle();
    // A throw, not a `!`. A probe that reads a missing row prints assertions
    // about nothing, and they all pass — the failure this session already met
    // once (seven greens over zero rows).
    if (error) throw new Error(`read(${made.id}) failed: ${error.message}`);
    if (!data) throw new Error(`read(${made.id}) found no row — the probe is measuring nothing`);
    return data as FareRow;
  };

  const beforeAccept = await read();
  const live = currentFare(beforeAccept);
  t("it has really climbed off its floor before anyone takes it",
    live > floorCourse, `now ${eur(live)} vs floor ${eur(floorCourse)}`);
  console.log(`   at T−30h the hotel sees ${eur(commissionSplit(live, rates).businessTotal)}\n`);

  // ── accept, exactly as the server action does: fare computed here, passed in ──
  const { error: accErr } = await asDriver.rpc("accept_mission_call", { p_mission_id: made.id, p_fare: live });
  t("accept_mission accepted the fare argument", !accErr, accErr?.message ?? "");

  const accepted = await read();
  t("the fare FROZE on the row", Number(accepted.accepted_fare) === live,
    `stored ${eur(accepted.accepted_fare)} vs sent ${eur(live)}`);
  t("settledFare now reads the column, not the curve",
    settledFare(accepted) === Number(accepted.accepted_fare), `${eur(settledFare(accepted))}`);
  t("the frozen fare is inside [floor, ceiling]",
    Number(accepted.accepted_fare) >= floorCourse && Number(accepted.accepted_fare) <= course);

  // ── the Driver walks at T−30h ────────────────────────────────────────────
  const { error: cancelErr } = await asDriver.rpc("driver_cancel_mission_call",
    { p_mission_id: made.id, p_reason: "probe", p_fare_snapshot: settledFare(accepted) });
  t("driver_cancel_mission ran", !cancelErr, cancelErr?.message ?? "");

  const repooled = await read();
  t("it went back to the Pool", repooled.pooled_at != null && repooled.accepted_at === null);
  t("SPEED WIN stayed OFF — the pickup is 30h away, not under 24h", repooled.speed_win === false);
  // ⚑ 2026-08-22 ([[d82]]) — the floor is NOT raised any more. [[d80]]'s intent is
  // met by the curve itself (it only rises toward the pickup), and raising the
  // stored floor on top made a re-pooled trip permanently dearer than an untouched
  // one — the very history-dependence [[d81]] removed.
  t("⚑ the stored floor is UNTOUCHED by the re-pool",
    Number(repooled.pdp_start) === floorCourse, `pdp_start ${eur(repooled.pdp_start)} vs floor ${eur(floorCourse)}`);
  t("⚑ SPEED WIN is untouched too — it is the Business's checkbox",
    repooled.speed_win === false, `speed_win=${repooled.speed_win}`);
  t("the frozen fare was cleared — nobody has this trip now", repooled.accepted_fare === null,
    `accepted_fare=${eur(repooled.accepted_fare)}`);
  t("⚑ it does NOT re-open at the original FLOOR PRICE — the curve has moved on",
    currentFare(repooled, new Date()) > floorCourse,
    `reads ${eur(currentFare(repooled, new Date()))}, floor is ${eur(floorCourse)}`);
  // ⚑ 2026-08-22 ([[d81]]) — the re-pool does NOT restart the climb. The trip goes
  // back out at TODAY's point on its own curve, which is at least what the last
  // Driver agreed to (the curve only rises), and usually more, because time has
  // passed since they took it.
  t("⚑ it re-opens at the DEADLINE price, not the price it was taken at",
    currentFare(repooled, new Date()) >= live,
    `now ${eur(currentFare(repooled, new Date()))} vs agreed ${eur(live)}`);
  t("…which is exactly where an untouched trip would be",
    currentFare(repooled, new Date()) === currentFare(beforeAccept, new Date()),
    `${eur(currentFare(repooled, new Date()))} vs ${eur(currentFare(beforeAccept, new Date()))}`);
  t("and still climbs from there to the Ceiling by T−5h",
    currentFare(repooled, new Date(pickupMs - 5 * HOUR)) === Math.round(course * 100) / 100);

  console.log(`\n   was at ${eur(commissionSplit(live, rates).businessTotal)} when the Driver walked`);
  console.log(`   re-opens at ${eur(commissionSplit(openingPrice(repooled), rates).businessTotal)} — NOT ${eur(Number(q.floor_price))}\n`);

  // ── a second re-pool can only ever raise it further ──────────────────────
  const { error: e2 } = await asDriver.rpc("accept_mission_call", { p_mission_id: made.id, p_fare: currentFare(repooled) });
  if (!e2) {
    await asDriver.rpc("driver_cancel_mission_call", { p_mission_id: made.id, p_reason: "probe 2", p_fare_snapshot: currentFare(repooled) });
    const twice = await read();
    t("a second re-pool never lowers the floor", Number(twice.pdp_start) >= Number(repooled.pdp_start),
      `${eur(repooled.pdp_start)} → ${eur(twice.pdp_start)}`);
  }

  // ── omitting the fare is still legal, and stores NULL ────────────────────
  const { data: plain, error: plainErr } = await db.from("mission").insert({
    business_id: biz.id, dispatcher_id: disp.id, status: "pooled",
    category: veh.category, required_body_type: veh.body_type, zone: "nice", reference: TAG,
    pickup_address: "12 Promenade des Anglais, 06000 Nice", pickup_lat: 43.695, pickup_lng: 7.265,
    dropoff_address: "Monaco", dropoff_lat: 43.738, dropoff_lng: 7.424,
    pickup_at: new Date(Date.now() + 200 * HOUR).toISOString(),
    distance_km: 31, ceiling: course, pdp_start: floorCourse, speed_win: false,
  }).select("id").maybeSingle();
  if (plainErr) throw new Error(`the no-fare mission insert failed: ${plainErr.message}`);
  if (!plain) throw new Error("the no-fare mission insert reported no error and returned no row — nothing to accept");
  ids.push(plain.id);
  const { error: e3 } = await asDriver.rpc("accept_mission_call", { p_mission_id: plain.id });
  const { data: p2raw } = await db.from("mission").select(FARE_COLS).eq("id", plain.id).maybeSingle();
  t("accept with no fare argument still works (safe to apply before the deploy)", !e3, e3?.message ?? "");
  // ⚑ The same `as never` lie as `read()` had, three times on two lines. Worse
  // here: `accepted_at` was fed straight to `new Date(...)`, so a missing row
  // meant `new Date(undefined)` — Invalid Date — and the assertion below would
  // have compared NaN, reporting a FAILURE about the curve rather than about the
  // row that was never there.
  if (!p2raw) throw new Error(`the plain-accept mission ${plain.id} vanished before it could be read`);
  const p2 = p2raw as FareRow;
  t("…and stores NULL, so readers fall back to the curve", p2.accepted_fare === null);
  t("…and settledFare recomputes for it",
    p2.accepted_at != null && settledFare(p2) === currentFare(p2, new Date(p2.accepted_at)));
} finally {
  if (ids.length) await db.from("mission").delete().in("id", ids);
  await db.from("driver").update({ reliability_marks: 0 }).eq("id", driverId);
  const { count } = await db.from("mission").select("id", { count: "exact", head: true }).eq("reference", TAG);
  t("cleaned up — no tagged stragglers", (count ?? 0) === 0, `${count} left`);
}

console.log(`\nchecks: ${checks}`);
console.log(fails.length ? `\n${fails.length} PROBLEM(S):\n` + fails.map((f) => "  " + f).join("\n") : "\nALL AGREE — 0 problems");
