// § AG — does the registry now describe what the code actually does? (D87)
// The registry is documentation with a primary key; if it lies, a missing row
// looks like an event that never happened.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

let pass = 0, fail = 0;
const t = (n: string, ok: boolean, note = "") => { console.log(`${ok?"ok   ":"FAIL "} ${n}${note?"   "+note:""}`); ok?pass++:fail++; };

const { data: reg } = await db.from("mission_event_type").select("*").order("event_type");
const by = Object.fromEntries((reg ?? []).map((r:any)=>[r.event_type, r]));

const WIRED = ["checked_in","close_answered","info_changed","amendment_proposed","amendment_answered",
               "release_proposed","release_answered","accept_rejected","contact_revealed"];
const UNWIRED = ["pool_impression","mission_viewed"];

console.log("── the nine that are wired ──");
for (const e of WIRED) t(`${e} is captured_by='app'`, by[e]?.captured_by === "app", by[e]?.captured_by);

console.log("\n── the two the founder cut ──");
for (const e of UNWIRED) {
  t(`${e} is captured_by='none'`, by[e]?.captured_by === "none", by[e]?.captured_by);
  t(`${e} says WHY, so nobody 'fixes' it`, /Deliberately not recorded/.test(by[e]?.note ?? ""), (by[e]?.note ?? "").slice(0,50) + "…");
}

console.log("\n── the promise that must never drift ──");
const wrong = (reg ?? []).filter((r:any)=> r.guaranteed !== (r.captured_by === "db_trigger"));
t("only db_trigger types are marked guaranteed", wrong.length === 0,
  wrong.map((r:any)=>`${r.event_type}(${r.captured_by}/${r.guaranteed})`).join(", "));
const trig = (reg ?? []).filter((r:any)=>r.captured_by === "db_trigger").length;
// ⚑ 12 → 15 in S72: § 7's hold added three trigger-written types (hold_taken, hold_committed,
//    hold_released). Its other two — hold_lapsed and hold_void — are `derived`, NOT trigger:
//    nothing observes T+15 s, so they are reconstructed from a timestamp by
//    sweep_lapsed_holds() and must never be counted as guaranteed. That distinction is what
//    the check above this one is for, and it is the reason this number is 15 and not 17.
const trigNames = (reg ?? []).filter((r:any)=>r.captured_by === "db_trigger").map((r:any)=>r.event_type).sort();
t("15 trigger-written types, as the migrations describe", trig === 15, `${trig}: ${trigNames.join(", ")}`);
// A bare count is a weak assertion — it cannot tell an addition from a swap. Name the ones
// that must be there and why, so a rename shows up as a rename.
const mustBeTrigger = ["hold_taken", "hold_committed", "hold_released"];
const missingTrig = mustBeTrigger.filter((x) => !trigNames.includes(x));
t("§ 7's observed hold events are trigger-written, and its inferred ones are not",
  missingTrig.length === 0
    && !trigNames.includes("hold_lapsed") && !trigNames.includes("hold_void"),
  missingTrig.length
    ? `⚑ missing from db_trigger: ${missingTrig.join(", ")}`
    : "hold_lapsed / hold_void correctly stay 'derived'");

console.log("\n── and the log itself is still intact ──");
// ⚑ THIS WAS AN EQUALITY CHECK (`=== 1848`) AND IT WAS WRONG BY CONSTRUCTION.
// The log is append-only: it grows every time anything happens to any trip, so the
// assertion went red on the first session that used the app — and a false alarm is
// indistinguishable from a real regression, which is the whole S66 pattern again.
// The direction that actually needs guarding is the other one: the table's own
// comment says `Never UPDATE or DELETE a row here`. So this is a FLOOR, not a match.
//   1848 = the count on 2026-08-24, the day [[d87]] wired the app half.
// Raise the floor when you have a reason to. Never lower it to make it pass.
const FLOOR = 1848;
const total = await db.from("mission_event").select("id", { count:"exact", head:true });
t("mission_event has only ever grown — nothing has been deleted from it",
  (total.count ?? 0) >= FLOOR, `${total.count} vs floor ${FLOOR}`);

// An observation, not an assertion, because the honest answer changes: `mission_id`
// carries NO foreign key (2026-08-24_mission_event_log.sql:78), on purpose — the log
// outlives the trip it describes. So deleting a mission strands its events instead of
// taking them with it, and the probes that create-and-delete missions leave a trail.
// Printed here so the number is visible before it matters: the pre-launch sweep has to
// include this table, and the Activity console will meet events with no trip behind them.
// ⚑ Both reads MUST page — `.select()` is silently capped at 1000 rows by PostgREST.
const page = async (table: string, col: string) => {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from(table).select(col).range(from, from + 999);
    if (!data?.length) break;
    out.push(...data.map((r:any) => r[col]));
    if (data.length < 1000) break;
  }
  return out;
};
const live = new Set(await page("mission", "id"));
const orphans = (await page("mission_event", "mission_id")).filter((id) => !live.has(id)).length;
console.log(`     · ${orphans} of ${total.count} events describe a mission that no longer exists (expected — no FK, and probes delete their missions)`);

console.log(`\n${pass} passed · ${fail} failed`);
