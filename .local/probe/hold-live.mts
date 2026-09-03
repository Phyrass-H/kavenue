// § 7 — the 15-second hold, end to end against the real database.
//
// ⚑ WHY THIS PROBE IS LONG. `accept_mission` was REPRODUCED to add the hold gate (migration
// 2026-08-31e). Postgres cannot patch a function body, so every guard in it — § B
// eligibility, § P expiry, the ±90 min slot conflict, the atomic first-wins UPDATE, the §9
// ceiling clamp — was re-issued along with the change. A reproduction that silently dropped
// one of those would look exactly like a working hold. So the regression half matters as
// much as the feature half, and both are here.
//
// ⚑ IT CALLS `accept_mission_call`, NOT `accept_mission`. 2026-08-31g closed the raw
// SECURITY DEFINER functions to browser sessions — a composite return is not subject to
// column privileges, so `returns mission` was handing a Driver the Ceiling — and put void
// wrappers in front. A probe calling the raw name gets 42501 and reads like an outage. It is
// the wall.
//
// ⚑ AND IT ASSERTS THE CLOCK, NOT THE COLUMN. Nothing runs at T+15 s. `outcome='open'` means
// only that nobody has swept it; every guard must compare `expires_at` to now(). The test
// that proves it is the one that expires a hold by hand and then accepts as another Driver.
//
//   npx tsx .local/probe/hold-live.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");

let n = 0; const bad: string[] = [];
const t = (name: string, ok: boolean, note = "") => {
  n++; if (!ok) bad.push(name);
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "   " + note : ""}`);
};

async function session(email: string) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

// Identities resolved at run time — a bleach must not be able to kill this probe.
const A = await session("demo.driver@pickup.local");
const B = await session("s46.driver@pickup.local");
const { data: dA } = await db.from("driver").select("id").eq("email", "demo.driver@pickup.local").single();
if (!dA) throw new Error("demo.driver@pickup.local has no driver row — run .local/seed/seed-probe-accounts.mts");
const { data: dB } = await db.from("driver").select("id").eq("email", "s46.driver@pickup.local").single();
const { data: carA } = await db.from("vehicle").select("category,body_type").eq("driver_id", dA.id).limit(1).single();
if (!carA) throw new Error(`demo.driver@pickup.local (driver ${dA.id}) has no vehicle — the probe reads its category to pick a trip both Drivers are eligible for`);
const { data: tmpl } = await db.from("mission").select("*").eq("category", carA.category).limit(1).single();

const { count: baseline } = await db.from("mission").select("id", { count: "exact", head: true });
const made: string[] = [];

/** A throwaway pooled trip both probe Drivers are eligible for. */
async function trip(overrides: Record<string, unknown> = {}) {
  const { data, error } = await db.from("mission").insert({
    ...tmpl,
    id: undefined as unknown as string,
    reference: "S72 hold probe",
    status: "pooled",
    driver_id: null,
    vehicle_id: null,
    // ⚑ accepted_fare PINNED, never inherited from the template ([[d97]]).
    accepted_fare: null,
    required_body_type: null,
    required_make: null,
    required_model: null,
    luggage_only: false,
    hold_expires_at: null,
    // Far out, so the ±90 min slot rule and § P can never be what refuses us.
    pickup_at: new Date(Date.now() + 36e5 * 24 * (40 + made.length)).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  }).select().single();
  if (error) throw new Error(`insert: ${error.message}`);
  made.push(data.id);
  return data;
}

const events = async (id: string) =>
  (await db.from("mission_event").select("event_type,source,occurred_at,payload")
    .eq("mission_id", id).order("seq")).data ?? [];

try {
  // ── 1 · taking a hold ───────────────────────────────────────────────────────────
  const m1 = await trip();
  const { error: e1 } = await A.rpc("place_hold", { p_mission_id: m1.id, p_fare: 60 });
  t("a Driver can freeze a pooled trip", !e1, e1?.message ?? "");

  const { data: h1 } = await db.from("mission_hold").select("*").eq("mission_id", m1.id).single();
  t("the hold row records the window it was granted", h1?.hold_seconds === 15, `${h1?.hold_seconds}s`);
  t("the fare it was shown is stored", Number(h1?.held_fare) === 60, `${h1?.held_fare}`);
  const { data: m1b } = await db.from("mission").select("hold_expires_at").eq("id", m1.id).single();
  t("the instant is mirrored onto the mission", m1b?.hold_expires_at === h1?.expires_at);
  const ev1 = await events(m1.id);
  t("hold_taken is written, and it is OBSERVED",
    ev1.some((e) => e.event_type === "hold_taken" && e.source === "db_trigger"),
    ev1.map((e) => e.event_type).join(","));

  // ── 2 · exclusivity ────────────────────────────────────────────────────────────
  const { error: e2 } = await B.rpc("accept_mission_call", { p_mission_id: m1.id, p_fare: 60 });
  t("⚑ another Driver CANNOT accept a held trip",
    !!e2 && /reviewing/i.test(e2.message), e2?.message ?? "it went through");

  const { error: e2b } = await B.rpc("place_hold", { p_mission_id: m1.id, p_fare: 60 });
  t("another Driver cannot hold it either", !!e2b && /reviewing/i.test(e2b.message), e2b?.message ?? "");

  // ── 3 · the holder commits, and gets the FLOOR ─────────────────────────────────
  // Held at 40; the server offers 55. The floor pays the higher of the two.
  const { error: e3 } = await A.rpc("accept_mission_call", { p_mission_id: m1.id, p_fare: 90 });
  t("the holder can accept their own held trip", !e3, e3?.message ?? "");
  const { data: m1c } = await db.from("mission").select("accepted_fare,status,driver_id,hold_expires_at").eq("id", m1.id).single();
  t("⚑ the FLOOR pays the higher of held and current, never the lower",
    Number(m1c?.accepted_fare) === 90, `${m1c?.accepted_fare} (held 60, curve now 90)`);
  t("the trip is confirmed to the holder", m1c?.status === "confirmed" && m1c?.driver_id === dA.id);
  t("the mirrored instant is cleared on commit", m1c?.hold_expires_at === null);
  const { data: h1b } = await db.from("mission_hold").select("outcome").eq("mission_id", m1.id).single();
  t("the hold settles to committed", h1b?.outcome === "committed", `${h1b?.outcome}`);
  t("hold_committed is written", (await events(m1.id)).some((e) => e.event_type === "hold_committed"));

  // ── 4 · the floor never pays MORE than the curve offers ────────────────────────
  const m2 = await trip();
  await A.rpc("place_hold", { p_mission_id: m2.id, p_fare: 120 });
  await db.from("mission_hold").update({ outcome: "released", settled_at: new Date().toISOString() }).eq("mission_id", m2.id);
  // Held at 120 then released; accepting later must use the LIVE number, not the stale one.
  // ⚑ This is the founder's rule from the money side: the hold spends the hold, never the
  //   trip — and a spent hold must not keep paying a price the Driver is no longer owed.
  const { error: e4 } = await A.rpc("accept_mission_call", { p_mission_id: m2.id, p_fare: 70 });
  const { data: m2b } = await db.from("mission").select("accepted_fare").eq("id", m2.id).single();
  t("⚑ a hold that is OVER does not float the price",
    !e4 && Number(m2b?.accepted_fare) === 70,
    `${m2b?.accepted_fare} (released hold held 120)${e4 ? " · " + e4.message : ""}`);

  // ── 4b · the clamp the hold inherits ──────────────────────────────────────────
  // ⚑ THIS ASSERTION EXISTS BECAUSE ITS ABSENCE COST AN HOUR. Two tests above once used a
  //   fare below the rate-card floor; the clamp raised it, both went red, and the failure
  //   looked like the hold mispricing. The clamp was right. Test it on purpose, once.
  const m2c = await trip();
  await A.rpc("place_hold", { p_mission_id: m2c.id, p_fare: 5 });
  const { data: hLow } = await db.from("mission_hold").select("held_fare").eq("mission_id", m2c.id).single();
  const { data: mLow } = await db.from("mission").select("pdp_start").eq("id", m2c.id).single();
  t("a hold below the rate-card floor is raised to it, not stored as typed",
    Number(hLow?.held_fare) === Number(mLow?.pdp_start),
    `${hLow?.held_fare} vs floor ${mLow?.pdp_start}`);
  // ⚑ HAND IT BACK. One hold at a time per Driver is a partial UNIQUE index, so a check that
  //   leaves its hold open silently breaks every place_hold after it — which is exactly what
  //   happened on the first run of this block, producing nine red lines with one cause.
  await A.rpc("release_hold", { p_mission_id: m2c.id });

  // ── 5 · one per trip, ever — and it never blocks Accept ────────────────────────
  const m3 = await trip();
  await A.rpc("place_hold", { p_mission_id: m3.id, p_fare: 60 });
  await A.rpc("release_hold", { p_mission_id: m3.id });
  const { data: h3 } = await db.from("mission_hold").select("outcome").eq("mission_id", m3.id).single();
  t("leaving the card releases the hold", h3?.outcome === "released", `${h3?.outcome}`);
  t("hold_released is written", (await events(m3.id)).some((e) => e.event_type === "hold_released"));

  const { error: e5 } = await A.rpc("place_hold", { p_mission_id: m3.id, p_fare: 60 });
  t("⚑ the same Driver cannot freeze the same trip twice",
    !!e5 && /already held/i.test(e5.message), e5?.message ?? "it went through");

  const { error: e5b } = await A.rpc("accept_mission_call", { p_mission_id: m3.id, p_fare: 60 });
  t("⚑ BUT A SPENT HOLD NEVER BLOCKS ACCEPT — the founder's whole rule",
    !e5b, e5b?.message ?? "");

  // ── 6 · one hold at a time ─────────────────────────────────────────────────────
  const m4 = await trip();
  const m5 = await trip();
  await A.rpc("place_hold", { p_mission_id: m4.id, p_fare: 60 });
  const { error: e6 } = await A.rpc("place_hold", { p_mission_id: m5.id, p_fare: 60 });
  t("a Driver cannot park two trips at once", !!e6, e6?.message ?? "it went through");

  // ── 7 · the clock, not the column ──────────────────────────────────────────────
  // Backdate m4's live hold. Nothing swept it, so outcome is still 'open' — and it must
  // stop protecting the trip anyway. This is the assertion the whole design rests on.
  const past = new Date(Date.now() - 1000).toISOString();
  await db.from("mission_hold").update({ expires_at: past }).eq("mission_id", m4.id);
  await db.from("mission").update({ hold_expires_at: past }).eq("id", m4.id);
  const { error: e7 } = await B.rpc("accept_mission_call", { p_mission_id: m4.id, p_fare: 60 });
  t("⚑ an EXPIRED hold stops protecting the trip, though nothing swept it",
    !e7, e7?.message ?? "");

  // ── 8 · the lapse becomes a row ────────────────────────────────────────────────
  const m6 = await trip();
  await A.rpc("place_hold", { p_mission_id: m6.id, p_fare: 60 });
  const lapseAt = new Date(Date.now() - 90_000).toISOString();
  await db.from("mission_hold").update({ expires_at: lapseAt }).eq("mission_id", m6.id);
  await db.rpc("sweep_lapsed_holds");
  const { data: h6 } = await db.from("mission_hold").select("outcome").eq("mission_id", m6.id).single();
  t("the sweep settles a lapsed hold", h6?.outcome === "lapsed", `${h6?.outcome}`);
  const lapse = (await events(m6.id)).find((e) => e.event_type === "hold_lapsed");
  t("hold_lapsed exists at all — the row D109 was booked for", !!lapse);
  t("⚑ it is labelled DERIVED, not observed — nothing watched T+15s",
    lapse?.source === "derived", `${lapse?.source}`);
  t("⚑ it is stamped when the clock RAN OUT, not when we noticed",
    !!lapse && Math.abs(Date.parse(lapse.occurred_at) - Date.parse(lapseAt)) < 2000,
    `occurred_at ${lapse?.occurred_at}`);
  t("and the lag we noticed it with is recorded, not hidden",
    Number((lapse?.payload as Record<string, unknown>)?.notice_lag_s) >= 80,
    `${(lapse?.payload as Record<string, unknown>)?.notice_lag_s}s`);

  // ── 9 · a cancelled trip is VOID, never a price rejection ──────────────────────
  const m7 = await trip();
  await A.rpc("place_hold", { p_mission_id: m7.id, p_fare: 60 });
  await db.from("mission_hold").update({ expires_at: past }).eq("mission_id", m7.id);
  await db.from("mission").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", m7.id);
  await db.rpc("sweep_lapsed_holds");
  const { data: h7 } = await db.from("mission_hold").select("outcome").eq("mission_id", m7.id).single();
  t("⚑ a trip cancelled underneath the holder is VOID, not lapsed",
    h7?.outcome === "void", `${h7?.outcome} — merging these would poison the price signal`);

  // ── 10 · the reproduction did not drop a guard ─────────────────────────────────
  const m8 = await trip({ pickup_at: new Date(Date.now() - 36e5).toISOString() });
  const { error: e8 } = await A.rpc("accept_mission_call", { p_mission_id: m8.id, p_fare: 60 });
  t("§ P regression — a past-due trip is still refused", !!e8 && /expired/i.test(e8.message), e8?.message ?? "");

  const m9 = await trip({ required_body_type: "van" });
  const { error: e9 } = await A.rpc("place_hold", { p_mission_id: m9.id, p_fare: 60 });
  t("§ B regression — a wrong-body trip is still refused, on the HOLD path too",
    !!e9 && /eligible/i.test(e9.message), e9?.message ?? "");
  const { error: e9b } = await A.rpc("accept_mission_call", { p_mission_id: m9.id, p_fare: 60 });
  t("§ B regression — and on the accept path", !!e9b && /eligible/i.test(e9b.message), e9b?.message ?? "");

  const m10 = await trip();
  const { error: e10 } = await A.rpc("accept_mission_call", { p_mission_id: m10.id, p_fare: 999999 });
  const { data: m10b } = await db.from("mission").select("accepted_fare,ceiling").eq("id", m10.id).single();
  t("§9 regression — the ceiling still clamps a silly fare",
    !e10 && Number(m10b?.accepted_fare) === Number(m10b?.ceiling),
    `${m10b?.accepted_fare} vs ceiling ${m10b?.ceiling}`);
} finally {
  for (const id of made) {
    await db.from("mission_hold").delete().eq("mission_id", id);
    await db.from("mission_event").delete().eq("mission_id", id);
    await db.from("mission").delete().eq("id", id);
  }
  const { count: after } = await db.from("mission").select("id", { count: "exact", head: true });
  console.log(`\n   cleaned up ${made.length} probe missions · ${after} rows (baseline ${baseline})`);
  if (after !== baseline) console.log("   ⚑ BASELINE NOT RESTORED");
}

console.log(`\nchecks: ${n}`);
console.log(bad.length ? `\n⚑ ${bad.length} FAILED:\n` + bad.map((b) => "  " + b).join("\n") : "\nThe hold behaves. ALL AGREE.");
