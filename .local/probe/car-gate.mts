// Does an unapproved car actually stop a Driver working — on the live database?
//
//   npx tsx .local/probe/car-gate.mts
//
// ⚑ RUN THIS AFTER PASTING docs/migrations/2026-09-13_vehicle_approval_gate.sql. Before that
// it reports red, which is the correct answer, not a fault: it is the verification step for a
// migration Claude cannot run.
//
// ⚑⚑ IT BUILDS ITS OWN TRIP AND DELETES IT. `verified-gate.mts` learned this the hard way in
// S76: its first version called accept on a REAL pooled trip, the gate was not there yet, the
// accept SUCCEEDED, and a Cannes → Valberg run had to be put back by hand. A probe whose
// purpose is to fail before a migration must be harmless when it fails. So everything below
// happens on one throw-away mission created by this file and removed in a `finally`.
//
// ⚑⚑ AND IT TESTS BOTH DIRECTIONS, WHICH IS THE WHOLE POINT. A gate that refuses EVERYBODY
// passes a one-sided check perfectly — and after this migration every car on the fleet starts
// `pending`, so "the pending Driver was refused" is true on a database where nobody can ever
// work again. § 2 is the half that catches that.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { CAR_AWAITING_RAISE } from "../../lib/vehicle-approval.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !ANON || !env.SUPABASE_SERVICE_ROLE_KEY || !env.DEV_PASSWORD)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, an anon key, SUPABASE_SERVICE_ROLE_KEY or DEV_PASSWORD is missing from .env.local");

const db = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const FIXTURE = "s46.driver@pickup.local";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};
const says = (e: { message?: string } | null) => (e?.message ?? "").toLowerCase();

// ── the fixture ─────────────────────────────────────────────────────────────────────────
const { data: drv } = await db.from("driver")
  .select("id, first_name, verified").eq("email", FIXTURE).maybeSingle();
if (!drv) { console.log(`FAIL  the fixture Driver ${FIXTURE} is missing — run .local/seed/seed-probe-accounts.mts`); process.exit(1); }

const { data: car } = await db.from("vehicle")
  .select("id, approval_status, retired_at, category, body_type, plate")
  .eq("driver_id", drv.id).is("retired_at", null).maybeSingle();
if (!car) { console.log(`FAIL  ${FIXTURE} has no live car — run .local/seed/seed-probe-accounts.mts`); process.exit(1); }
if (car.approval_status === undefined) {
  console.log("FAIL  vehicle.approval_status does not exist — paste docs/migrations/2026-09-12_vehicle_lifecycle_columns.sql first");
  process.exit(1);
}

// ⚑ Looked up, never hard-coded, and it throws rather than comparing undefined — a probe that
//   reads a missing fixture prints green checks about nothing (the S72 rule).
const { data: biz } = await db.from("business").select("id").limit(1).maybeSingle();
if (!biz) { console.log("FAIL  no Business to post a probe trip for"); process.exit(1); }
const { data: disp } = await db.from("dispatcher").select("id").eq("business_id", biz.id).limit(1).maybeSingle();
if (!disp) { console.log("FAIL  no Dispatcher to post a trip as"); process.exit(1); }

const WAS = car.approval_status;
let missionId: string | null = null;

try {
  // ── § 0 · a throw-away trip, in the fixture's own class ───────────────────────────────
  // Pooled and comfortably in the future, so nothing else in this database is affected and
  // no sweep can expire it mid-run.
  const pickupAt = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
  const { data: made, error: mkErr } = await db.from("mission").insert({
    business_id: biz.id, dispatcher_id: disp.id, status: "pooled",
    category: car.category,
    pickup_address: "PROBE — car gate, delete me", pickup_at: pickupAt,
    pickup_lat: 43.5513, pickup_lng: 7.0128,
    dropoff_address: "PROBE — car gate", dropoff_lat: 43.6584, dropoff_lng: 7.2159,
    ceiling: 100, base_fare: 60, pdp_start: 60,
  }).select("id").single();
  if (mkErr || !made) throw new Error(`could not create the probe trip: ${mkErr?.message}`);
  missionId = made.id;
  console.log(`\n   probe trip ${missionId} · ${car.category} · pickup ${pickupAt.slice(0, 16)}`);

  const as = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: authErr } = await as.auth.signInWithPassword({ email: FIXTURE, password: env.DEV_PASSWORD });
  if (authErr) throw new Error(`cannot sign in as ${FIXTURE}: ${authErr.message}`);

  // ── § 1 · a PENDING car is refused ───────────────────────────────────────────────────
  console.log("\n── § 1 · a car nobody has approved cannot take work ──");
  await db.from("vehicle").update({ approval_status: "pending" }).eq("id", car.id);
  const refused = await as.rpc("accept_mission_call", { p_mission_id: missionId, p_fare: 70 });
  t("accept_mission_call is refused while the car is pending",
    !!refused.error && says(refused.error).includes(CAR_AWAITING_RAISE),
    refused.error ? refused.error.message : "⚑ IT WAS ACCEPTED — the gate is not there");

  const heldRefused = await as.rpc("place_hold", { p_mission_id: missionId });
  t("place_hold is refused too — a hold takes the trip off the market for everyone",
    !!heldRefused.error && says(heldRefused.error).includes(CAR_AWAITING_RAISE),
    heldRefused.error ? heldRefused.error.message : "⚑ THE HOLD WENT THROUGH");

  // ⚑ And the trip must be untouched by a refused accept — a gate that raises AFTER the
  //   atomic UPDATE would leave the trip taken and the Driver told it failed.
  const { data: afterRefusal } = await db.from("mission")
    .select("driver_id, status, vehicle_id").eq("id", missionId).single();
  t("the refused trip is still pooled, with nobody on it",
    afterRefusal?.driver_id === null && afterRefusal?.status === "pooled" && afterRefusal?.vehicle_id === null,
    JSON.stringify(afterRefusal));

  // ── § 2 · an APPROVED car goes through ───────────────────────────────────────────────
  // ⚑ WITHOUT THIS, § 1 IS WORTHLESS. Every car on this fleet starts pending, so a gate that
  //   refuses the whole marketplace passes § 1 and nothing else would notice for weeks.
  console.log("\n── § 2 · an approved car still works (the half that catches a gate refusing everybody) ──");
  await db.from("vehicle").update({ approval_status: "approved" }).eq("id", car.id);
  const ok = await as.rpc("accept_mission_call", { p_mission_id: missionId, p_fare: 70 });
  t("accept_mission_call succeeds once the car is approved",
    !ok.error, ok.error ? `⚑ REFUSED: ${ok.error.message}` : "");

  const { data: taken } = await db.from("mission")
    .select("driver_id, vehicle_id, vehicle_plate, vehicle_make").eq("id", missionId).single();
  t("the trip now belongs to the Driver", taken?.driver_id === drv.id, String(taken?.driver_id));

  // ── § 3 · the stamp freezes the car ONTO the trip, not a pointer to it ───────────────
  console.log("\n── § 3 · what the trip remembers ──");
  t("the accepted trip carries the car's own plate", taken?.vehicle_plate === car.plate,
    `${taken?.vehicle_plate} vs ${car.plate}`);
  t("…and its make", !!taken?.vehicle_make, String(taken?.vehicle_make));
  t("…and the id it was stamped with", taken?.vehicle_id === car.id, String(taken?.vehicle_id));

  // ⚑ THE BREAK THIS CATCHES: an in-place edit of an approved car. Before S78 this is exactly
  //   how a Driver changed car, and it rewrote every past Waybill.
  const edit = await db.from("vehicle").update({ plate: "XX-999-XX" }).eq("id", car.id).select("id");
  t("an approved car cannot be edited in place — the plate is refused",
    !!edit.error, edit.error ? edit.error.message : "⚑ THE EDIT WENT THROUGH — vehicle_identity_frozen is missing");

  // ── § 4 · a re-pool takes the car back off the trip ──────────────────────────────────
  console.log("\n── § 4 · giving it back ──");
  await db.from("mission").update({ driver_id: null, status: "pooled" }).eq("id", missionId);
  const { data: repooled } = await db.from("mission")
    .select("vehicle_id, vehicle_plate").eq("id", missionId).single();
  t("a re-pooled trip carries no car at all — neither the id nor the plate",
    repooled?.vehicle_id === null && repooled?.vehicle_plate === null,
    JSON.stringify(repooled));

  // ── § 5 · the insert door ────────────────────────────────────────────────────────────
  // Seeds create missions with a Driver already on them. That path never passes through an
  // UPDATE of driver_id, so a trigger written only for updates would leave it wide open.
  console.log("\n── § 5 · a trip inserted with a Driver already on it ──");
  await db.from("vehicle").update({ approval_status: "pending" }).eq("id", car.id);
  const sneak = await db.from("mission").insert({
    business_id: biz.id, dispatcher_id: disp.id, status: "accepted", driver_id: drv.id,
    category: car.category,
    pickup_address: "PROBE — insert door, delete me",
    pickup_at: new Date(Date.now() + 40 * 3600 * 1000).toISOString(),
    dropoff_address: "PROBE — insert door", ceiling: 100,
  }).select("id").single();
  t("inserting a trip with an unapproved Driver's car is refused",
    !!sneak.error, sneak.error ? sneak.error.message : "⚑ IT WAS INSERTED");
  if (sneak.data?.id) await db.from("mission").delete().eq("id", sneak.data.id);
} finally {
  // ⚑ RESTORED AND ASSERTED, not assumed. hold-live.mts performs eight real accepts as this
  //   same account and would break if its car were left pending.
  await db.from("vehicle").update({ approval_status: WAS, plate: car.plate }).eq("id", car.id);
  const { data: back } = await db.from("vehicle").select("approval_status, plate").eq("id", car.id).single();
  t("the fixture car is back as it was", back?.approval_status === WAS && back?.plate === car.plate,
    `${back?.approval_status} · ${back?.plate}`);
  if (missionId) {
    await db.from("mission_event").delete().eq("mission_id", missionId);
    await db.from("mission").delete().eq("id", missionId);
    const { data: gone } = await db.from("mission").select("id").eq("id", missionId).maybeSingle();
    t("the probe trip is deleted", !gone, missionId);
  }
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) {
  console.log("⚑ If every § 1 line is red, the gate is not applied: paste");
  console.log("  docs/migrations/2026-09-13_vehicle_approval_gate.sql");
  process.exit(1);
}
