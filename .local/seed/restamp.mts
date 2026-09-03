// S68 — put the seeded log back on the right dates, and stop it claiming to be
// observed.
//
// ⚑ THE PROBLEM THIS SOLVES. `mission_event.occurred_at` defaults to
// clock_timestamp(), and the trigger does not override it. Walking three months
// of seeded trips through real status transitions therefore produces a perfectly
// correct log in which every single thing happened this afternoon — a trip
// booked in June, driven in July and closed in August has all ten of its entries
// stamped within the same minute.
//
// ⚑ AND THE PART THAT MATTERS MORE. Correcting the time is not enough. A row
// that says `source='db_trigger'` is a promise that the database watched it
// happen — `isObserved()` in lib/mission-events.ts admits nothing else, and the
// console renders those entries as fact. Re-dating them and leaving the label
// alone would manufacture evidence: exactly the shape of D86–D92, where a value
// meant one thing and every reader believed another. So the label is changed to
// 'seed', which is true, and the type system makes every reader deal with it.
//
//   npx tsx .local/seed/restamp.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { trueTimes, extraEvents } = JSON.parse(fs.readFileSync(".local/seed/_times.json", "utf8")) as {
  trueTimes: [string, number[]][];
  extraEvents: Record<string, unknown>[];
};

console.log(`${trueTimes.length} missions to re-stamp\n`);

let stamped = 0, mismatch = 0, missing = 0;
const problems: string[] = [];

for (const [missionId, times] of trueTimes) {
  const { data: rows, error } = await db
    .from("mission_event")
    .select("id, event_type, seq")
    .eq("mission_id", missionId)
    .eq("source", "db_trigger")
    .order("seq");
  if (error) { problems.push(`${missionId}: ${error.message}`); continue; }
  if (!rows?.length) { missing++; continue; }

  // ⚑ The counts MUST match. One event per status UPDATE, two on insert-as-pooled
  // — that is the trigger's contract. If they ever disagree, the walk and the
  // trigger have diverged and every timestamp after the divergence would be
  // attached to the wrong event. Refuse rather than guess.
  if (rows.length !== times.length) {
    mismatch++;
    problems.push(`${missionId}: ${rows.length} events vs ${times.length} recorded steps (${rows.map((r) => r.event_type).join(">")})`);
    continue;
  }

  for (let i = 0; i < rows.length; i++) {
    const { error: uErr } = await db
      .from("mission_event")
      .update({ occurred_at: new Date(times[i]).toISOString(), source: "seed" })
      .eq("id", rows[i].id);
    if (uErr) problems.push(`${rows[i].id}: ${uErr.message}`);
    else stamped++;
  }
}

console.log(`re-stamped ${stamped} trigger events`);
if (missing) console.log(`⚑ ${missing} missions had no trigger events at all`);
if (mismatch) console.log(`⚑ ${mismatch} missions REFUSED — event count did not match the walk`);

// The app-side events: things that change no status, so the trigger never saw
// them. Written straight in, already labelled 'seed'.
if (extraEvents.length) {
  for (let i = 0; i < extraEvents.length; i += 500) {
    const batch = extraEvents.slice(i, i + 500);
    const { error } = await db.from("mission_event").insert(batch);
    if (error) problems.push(`extra batch ${i}: ${error.message}`);
  }
  console.log(`inserted ${extraEvents.length} app-side events (checked in, released, closed…)`);
}

if (problems.length) {
  console.log(`\n⚑ ${problems.length} problem(s):`);
  problems.slice(0, 12).forEach((p) => console.log("  " + p));
}

const { count: seeded } = await db.from("mission_event").select("*", { count: "exact", head: true }).eq("source", "seed");
const { count: observed } = await db.from("mission_event").select("*", { count: "exact", head: true }).eq("source", "db_trigger");
console.log(`\nlog now: ${seeded} seeded · ${observed} still labelled db_trigger`);
console.log(observed === 0
  ? "Nothing claims to be observed. Add live trips next: npx tsx .local/seed/seed-live.mts"
  : "⚑ Some rows still claim db_trigger — check they are genuinely live trips.");
