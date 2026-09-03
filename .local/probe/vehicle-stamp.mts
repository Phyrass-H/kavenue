// 2026-08-31c — does the vehicle stamp actually fire, and does a re-pool clear it?
//
// ⚑ RUN THIS ONLY AFTER THE FOUNDER HAS APPLIED 2026-08-31c. Before that it reports the
// trigger as absent, which is a correct answer, not a failure of the probe.
//
// ⚑ AND IT PROVES BOTH DIRECTIONS. A stamp that appears is half the claim; the half that
// matters for a legal document is that a re-pooled trip STOPS carrying the old car. A probe
// that only checked the happy path would have gone green on the exact bug this trigger
// exists to prevent (a stale plate on a justificatif).
//
//   npx tsx .local/probe/vehicle-stamp.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let n = 0; const bad: string[] = [];
const t = (name: string, ok: boolean, note = "") => {
  n++; if (!ok) bad.push(name);
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "   " + note : ""}`);
};
// ⚑ NOT `ok`. Checks 2 and 3 both assert that vehicle_id is NULL — which is trivially true
// when nothing ever stamps it. Reported as passes they would go green on a database with no
// trigger at all, i.e. they would confirm the feature precisely when it is absent. That is
// the S71 meta-lesson in one line: a check is only evidence once you have watched it fail on
// purpose, and these two cannot fail until check 1 passes. So they are SKIPPED, loudly.
const skip = (name: string, why: string) => {
  console.log(`skip  ${name}   ${why}`);
};

// Identities are looked up, never hard-coded — a bleach must not be able to kill this probe.
// ⚑ AND EVERY LOOKUP THROWS. A probe that reads a missing fixture compares undefined and prints
// green checks about nothing — the exact failure this file exists to catch.
const { data: drv, error: drvErr } = await db.from("driver")
  .select("id,first_name,last_name").eq("email", "marc.fontaine@kavenue.test").single();
if (drvErr) throw new Error(`could not read the probe Driver marc.fontaine@kavenue.test: ${drvErr.message}`);
if (!drv) throw new Error("marc.fontaine@kavenue.test is missing — run .local/seed/riviera.mts");
const { data: car, error: carErr } = await db.from("vehicle")
  .select("id,plate,category,body_type").eq("driver_id", drv.id).limit(1).single();
if (carErr) throw new Error(`could not read a vehicle for driver ${drv.id}: ${carErr.message}`);
if (!car) throw new Error(`driver ${drv.id} (marc.fontaine@kavenue.test) has no vehicle — there is no car to stamp; run .local/seed/riviera.mts`);
const { data: tmpl, error: tmplErr } = await db.from("mission")
  .select("*").eq("category", car.category).limit(1).single();
if (tmplErr) throw new Error(`could not read a ${car.category} mission to copy: ${tmplErr.message}`);
if (!tmpl) throw new Error(`no mission in category ${car.category} to copy — this probe clones an existing row as its template`);

console.log(`   Driver ${drv.first_name} ${drv.last_name} · car ${car.plate} (${car.category})`);

// A throwaway mission of our own — never touch a real row.
// ⚑ accepted_fare is PINNED, never inherited from the template ([[d97]]).
const { data: m, error: insErr } = await db.from("mission").insert({
  ...tmpl,
  id: undefined as unknown as string,
  reference: "S72 vehicle-stamp probe",
  status: "pooled",
  driver_id: null,
  vehicle_id: null,
  accepted_fare: null,
  required_body_type: null,
  pickup_at: new Date(Date.now() + 36e5 * 30).toISOString(),
  created_at: new Date().toISOString(),
}).select().single();
if (insErr) { console.log("could not create the probe mission:", insErr.message); process.exit(1); }
if (!m) throw new Error("the probe mission insert reported no error and returned no row — there is nothing to drive");

try {
  // 1 — the stamp lands when the trip changes hands.
  await db.from("mission").update({ driver_id: drv.id, status: "confirmed" }).eq("id", m.id);
  const { data: after, error: afterErr } = await db.from("mission").select("vehicle_id").eq("id", m.id).single();
  if (afterErr) throw new Error(`could not re-read probe mission ${m.id} after the hand-over: ${afterErr.message}`);
  if (!after) throw new Error(`probe mission ${m.id} is gone between the hand-over and the re-read`);
  t("the car is stamped when a Driver takes the trip",
    after.vehicle_id === car.id,
    after.vehicle_id ? `stamped ${after.vehicle_id}` : "⚑ NULL — is 2026-08-31c applied?");

  const stamped = after.vehicle_id === car.id;

  if (!stamped) {
    skip("a re-pooled trip stops carrying the previous Driver's car",
      "nothing was stamped, so 'it is gone' proves nothing");
    skip("an ordinary status move leaves the stamp alone",
      "nothing was stamped, so 'it is unchanged' proves nothing");
  } else {
    // 2 — and it is cleared when the trip goes back to the Pool. THIS is the one that matters:
    // an RPC-side stamp would pass check 1 and fail here, leaving a stale plate to print.
    await db.from("mission").update({ driver_id: null, status: "pooled" }).eq("id", m.id);
    const { data: repooled, error: repooledErr } = await db.from("mission").select("vehicle_id").eq("id", m.id).single();
    if (repooledErr) throw new Error(`could not re-read probe mission ${m.id} after the re-pool: ${repooledErr.message}`);
    if (!repooled) throw new Error(`probe mission ${m.id} is gone between the re-pool and the re-read`);
    t("a re-pooled trip stops carrying the previous Driver's car",
      repooled.vehicle_id === null,
      repooled.vehicle_id ? `⚑ STILL ${repooled.vehicle_id} — a stale plate would print` : "cleared");

    // 3 — a status move that is not a change of hands must NOT re-resolve the car. Blanked
    // first so a re-resolve would be VISIBLE: if the trigger fired on any update, the car
    // would come back, and this reads NULL only because it correctly did nothing.
    await db.from("mission").update({ driver_id: drv.id, status: "confirmed" }).eq("id", m.id);
    await db.from("mission").update({ vehicle_id: null }).eq("id", m.id);
    await db.from("mission").update({ status: "en_route" }).eq("id", m.id);
    const { data: moved, error: movedErr } = await db.from("mission").select("vehicle_id").eq("id", m.id).single();
    if (movedErr) throw new Error(`could not re-read probe mission ${m.id} after the status move: ${movedErr.message}`);
    if (!moved) throw new Error(`probe mission ${m.id} is gone between the status move and the re-read`);
    t("an ordinary status move leaves the stamp alone",
      moved.vehicle_id === null,
      moved.vehicle_id ? "⚑ re-resolved on a status change — history would rewrite itself" : "untouched");
  }
} finally {
  await db.from("mission").delete().eq("id", m.id);
  console.log("   probe mission deleted");
}

// ---------------------------------------------------------------- END TO END
// ⚑ EVERYTHING ABOVE DROVE THE TABLE DIRECTLY. That proves the trigger fires on an UPDATE
// of driver_id — it does NOT prove that accepting a trip records the car, because the real
// path goes through accept_mission under a Driver's JWT, with its own lock, its own § B gate
// and its own conditional UPDATE. A stamp that worked on a hand-written UPDATE and not on a
// real accept would leave every genuine trip unstamped while this probe reported "ALL AGREE".
{
  // ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
  const asDriver = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: sErr } = await asDriver.auth.signInWithPassword({
    email: "demo.driver@pickup.local", password: DEV_PASSWORD,
  });

  if (sErr) {
    skip("a REAL accept_mission call stamps the car", `could not sign in: ${sErr.message}`);
  } else {
    const { data: demo } = await db.from("driver").select("id")
      .eq("email", "demo.driver@pickup.local").maybeSingle();
    const { data: demoCar } = demo
      ? await db.from("vehicle").select("id,plate,category,body_type")
          .eq("driver_id", demo.id).order("is_active", { ascending: false }).limit(1).maybeSingle()
      : { data: null };

    if (!demo || !demoCar) {
      skip("a REAL accept_mission call stamps the car", "the demo Driver has no car to stamp");
    } else {
      const { data: t2 } = await db.from("mission")
        .select("*").eq("category", demoCar.category).limit(1).single();
      // ⚑ Far in the future and well clear of the demo Driver's other trips: accept_mission
      //   refuses a ±90 min slot conflict, and that refusal would look like a missing stamp.
      const { data: live, error: e2 } = await db.from("mission").insert({
        ...t2,
        id: undefined as unknown as string,
        reference: "S72 accept-stamp probe",
        status: "pooled",
        driver_id: null,
        vehicle_id: null,
        accepted_fare: null,
        required_body_type: null,
        luggage_only: false,
        pickup_at: new Date(Date.now() + 36e5 * 24 * 40).toISOString(),
        created_at: new Date().toISOString(),
      }).select().single();

      if (e2) {
        skip("a REAL accept_mission call stamps the car", `could not post one: ${e2.message}`);
      } else {
        try {
          const { error: aErr } = await asDriver.rpc("accept_mission_call", { p_mission_id: live.id });
          const { data: got, error: gotErr } = await db.from("mission")
            .select("vehicle_id,status,driver_id").eq("id", live.id).single();
          if (gotErr) throw new Error(`could not re-read mission ${live.id} after accept_mission: ${gotErr.message}`);
          if (!got) throw new Error(`mission ${live.id} is gone after accept_mission — no row left to read the stamp from`);
          t("a REAL accept_mission call stamps the car",
            !aErr && got.vehicle_id === demoCar.id,
            aErr ? `⚑ the accept itself failed: ${aErr.message}`
                 : `${got.status} · ${demoCar.plate}`);
        } finally {
          await db.from("mission").delete().eq("id", live.id);
          console.log("   accept probe mission deleted");
        }
      }
    }
  }
}

console.log(`\nchecks: ${n}`);
console.log(bad.length ? `\n⚑ ${bad.length} FAILED:\n` + bad.map((b) => "  " + b).join("\n") : "\nThe stamp behaves. ALL AGREE.");
