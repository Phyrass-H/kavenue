// S68 — is the seeded dataset actually coherent? Read-only, writes nothing.
//
// ⚑ A SEED IS A CLAIM ABOUT THE DATABASE TOO. The script that built it reported
// success; that is not evidence. This checks the properties a real three months
// of trading would have — and, more importantly, the ones that would make the
// console lie if they were false: a Driver on a trip they could never have
// taken, money outside the curve, a terminal trip with no terminal event.
//
//   npx tsx .local/probe/dataset-audit.mts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { haversineKm } from "../../lib/geo.ts";
import { openingPrice } from "../../lib/pdp.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pass = 0, fail = 0;
const t = (n: string, ok: boolean, note = "") => {
  console.log(`${ok ? "ok   " : "FAIL "} ${n}${note ? "   " + note : ""}`); ok ? pass++ : fail++;
};

async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from(table).select(cols).range(from, from + 999);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

const missions = await all<any>("mission", "*");
const events = await all<any>("mission_event", "id, mission_id, event_type, occurred_at, source, seq");
const drivers = await all<any>("driver", "*");
const vehicles = await all<any>("vehicle", "*");
const businesses = await all<any>("business", "id, name, created_at");

console.log("── size and shape ──");
t("there are three months of trips", missions.length > 250, `${missions.length} missions`);
t("a fleet with more than one of each class", drivers.length >= 9, `${drivers.length} Drivers`);
t("more than one hotel, so cross-hotel questions have answers", businesses.length >= 3, `${businesses.length} hotels`);
t("the log is populated", events.length > 2000, `${events.length} events`);

console.log("\n── provenance: nothing pretends to be observed ──");
const bySrc = events.reduce((a: Record<string, number>, e) => ((a[e.source] = (a[e.source] ?? 0) + 1), a), {});
console.log("   " + Object.entries(bySrc).map(([k, v]) => `${k} ${v}`).join(" · "));
// ⚑ ORPHANS ARE EXCLUDED, and that is not a loophole. Every live probe creates a
// mission, drives it through the real RPCs and deletes it — and `mission_event`
// has no FK to `mission`, so the trigger rows it wrote are left stranded. They
// are genuinely observed events about trips that no longer exist. Counting them
// as "stray db_trigger" made this check fail with 356 after one probe session
// and said nothing about the dataset. Sweep them with
// .local/probe/sweep-orphans.mts, and judge the rest.
//
// ⚑ THIS CHECK USED TO ASK "was the trip created in the last 6 hours?" AS A PROXY
// for "was it posted for real rather than manufactured". The proxy decayed by
// design: a trip genuinely posted through the app is real forever, but stopped
// being *recent* after six hours — so the check went red on 2026-08-30 with 23
// stray, then 37, purely because time passed. Re-running seed-live did not clear
// it, because the old live trips survive alongside the new ones. It reported the
// clock, not the dataset.
//
// The question this section actually asks is its own heading: does anything
// PRETEND TO BE OBSERVED? A manufactured trip carries `source='seed'` events; a
// genuinely posted one carries `db_trigger` events written by the database. So
// the failure is a trip holding BOTH — a manufactured trip wearing the
// database's guarantee. That does not decay, and it is the thing that would
// actually make the console lie about what it witnessed ([[d94]]).
const missionIds = new Set(missions.map((m) => m.id));
const seeded = new Set(
  events.filter((e) => e.source === "seed" && missionIds.has(e.mission_id)).map((e) => e.mission_id),
);
const pretending = [
  ...new Set(
    events
      .filter((e) => e.source === "db_trigger" && missionIds.has(e.mission_id) && seeded.has(e.mission_id))
      .map((e) => e.mission_id),
  ),
];
t("no manufactured trip carries a db_trigger event — nothing pretends to be observed",
  pretending.length === 0,
  pretending.length ? `⚑ ${pretending.length} trips hold BOTH seed and db_trigger events` : `${seeded.size} manufactured trips, none of them pretending`);
t("the seeded history is labelled 'seed', not 'db_trigger'", (bySrc.seed ?? 0) > 2000, `${bySrc.seed ?? 0} seeded`);
t("there is at least some genuinely observed history to test with", (bySrc.db_trigger ?? 0) > 0, `${bySrc.db_trigger ?? 0} observed`);

console.log("\n── the log tells each trip's story ──");
const byMission = new Map<string, any[]>();
for (const e of events) byMission.set(e.mission_id, [...(byMission.get(e.mission_id) ?? []), e]);
t("every trip has a log", missions.every((m) => byMission.has(m.id)),
  `${missions.filter((m) => !byMission.has(m.id)).length} without`);
t("every trip was born and posted", missions.every((m) => {
  const ev = byMission.get(m.id) ?? [];
  return ev.some((e) => e.event_type === "created") && ev.some((e) => e.event_type === "pooled");
}));
const terminal = missions.filter((m) => ["completed", "cancelled", "expired"].includes(m.status));
const missingEnd = terminal.filter((m) => {
  const want = m.status === "completed" && m.no_show ? "no_show" : m.status;
  return !(byMission.get(m.id) ?? []).some((e) => e.event_type === want);
});
t("every finished trip has the event that finished it", missingEnd.length === 0, `${missingEnd.length} missing`);
const outOfOrder = missions.filter((m) => {
  const ev = (byMission.get(m.id) ?? []).slice().sort((a, b) => a.seq - b.seq);
  const created = ev.find((e) => e.event_type === "created");
  const done = ev.find((e) => ["completed", "cancelled", "expired", "no_show"].includes(e.event_type));
  return created && done && Date.parse(created.occurred_at) > Date.parse(done.occurred_at);
});
t("no trip finished before it was booked", outOfOrder.length === 0, `${outOfOrder.length} impossible`);
// Probe residue accumulates here between sweeps; a small number is normal, a
// large one means somebody deleted real trips.
const orphans = events.filter((e) => e.mission_id && !missionIds.has(e.mission_id));
t("the log is not full of entries about deleted trips (sweep-orphans.mts clears them)",
  orphans.length < 100, `${orphans.length} orphaned`);

console.log("\n── the Driver on a trip could actually have taken it ──");
// ⚑ The one that would make the console incoherent: opening a finished trip and
// being told the Driver who drove it was never eligible for it.
const assigned = missions.filter((m) => m.driver_id);
const impossible = assigned.filter((m) => {
  const d = drivers.find((x) => x.id === m.driver_id);
  const v = vehicles.find((x) => x.driver_id === m.driver_id);
  if (!d || !v) return true;
  if (v.category !== m.category) return true;
  if (m.required_body_type && m.required_body_type !== v.body_type) return true;
  if (m.luggage_only && !d.accepts_luggage_runs) return true;
  const r = d.service_radius_km ?? 50;
  const near = Math.min(
    haversineKm(d.base_lat, d.base_lng, m.pickup_lat, m.pickup_lng),
    haversineKm(d.base_lat, d.base_lng, m.dropoff_lat, m.dropoff_lng),
  );
  return near > r;
});
t("every assigned Driver matches their trip's class, body, luggage and radius",
  impossible.length === 0, `${impossible.length} of ${assigned.length} impossible`);
const clashing = assigned.filter((m) =>
  assigned.some((o) => o.id !== m.id && o.driver_id === m.driver_id &&
    Math.abs(Date.parse(o.pickup_at) - Date.parse(m.pickup_at)) <= 90 * 60_000));
t("no Driver holds two trips within 90 minutes of each other", clashing.length === 0, `${clashing.length} clashing`);
// ⚑ COMPARED AGAINST THE ACCEPT, NOT THE POST. The first version of this check
// used `mission.created_at` and flagged one trip — wrongly. A trip posted on day
// 10, sat in the Pool while a new Driver signed up on day 12, and was taken by
// them on day 13 is a perfectly ordinary thing for a marketplace to do. The
// data was right and the assertion was wrong; the fix belonged here.
const beforeJoining = assigned.filter((m) => {
  const d = drivers.find((x) => x.id === m.driver_id);
  const took = m.accepted_at ?? m.confirmed_at;
  return d && took && Date.parse(took) < Date.parse(d.created_at);
});
t("nobody accepted a trip before they signed up", beforeJoining.length === 0, `${beforeJoining.length}`);

console.log("\n── money ──");
const priced = missions.filter((m) => m.ceiling != null);
t("every trip has a ceiling and a floor", priced.length === missions.length, `${priced.length}/${missions.length}`);
t("the floor is always below the ceiling", missions.every((m) => Number(m.pdp_start) < Number(m.ceiling)));
const withFare = missions.filter((m) => m.accepted_fare != null);
const badFare = withFare.filter((m) => {
  const open = openingPrice({ id: m.id, ceiling: Number(m.ceiling), pdp_start: Number(m.pdp_start), speed_win: m.speed_win, pickup_at: m.pickup_at, created_at: m.created_at });
  return Number(m.accepted_fare) < open - 0.01 || Number(m.accepted_fare) > Number(m.ceiling) + 0.01;
});
t("every agreed fare sits between where the auction opened and the Ceiling",
  badFare.length === 0, `${badFare.length} of ${withFare.length} outside`);
t("the commission rates are frozen on every trip",
  missions.every((m) => m.commission_business_rate != null && m.commission_driver_rate != null));
t("the transport VAT was snapshot when a Driver was attached",
  assigned.every((m) => m.transport_vat_rate != null),
  `${assigned.filter((m) => m.transport_vat_rate == null).length} missing of ${assigned.length}`);
const cancelled = missions.filter((m) => m.status === "cancelled");
const { count: cancelRecords } = await db.from("mission_cancellation").select("*", { count: "exact", head: true });
t("every cancelled trip has a cancellation record", (cancelRecords ?? 0) >= cancelled.length,
  `${cancelRecords} records for ${cancelled.length} cancellations`);

console.log("\n── the waiting meter ──");
const waited = missions.filter((m) => m.waiting_minutes != null && m.waiting_minutes > 0);
t("waiting was charged on some trips, not all", waited.length > 0 && waited.length < missions.length * 0.4,
  `${waited.length} trips waited`);
t("a waiting fee never appears without minutes behind it",
  missions.every((m) => !(Number(m.waiting_fee) > 0) || Number(m.waiting_minutes) > 0));

console.log("\n── what an investor asks first ──");
const month = (iso: string) => iso.slice(0, 7);
const perMonth = missions.reduce((a: Record<string, number>, m) => ((a[month(m.created_at)] = (a[month(m.created_at)] ?? 0) + 1), a), {});
const months = Object.keys(perMonth).sort();
console.log("   trips booked: " + months.map((k) => `${k} ${perMonth[k]}`).join(" · "));
t("there is more than one month of history", months.length >= 3, `${months.length} months`);
const statuses = missions.reduce((a: Record<string, number>, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {});
console.log("   statuses: " + Object.entries(statuses).map(([k, v]) => `${k} ${v}`).join(" · "));
const filled = missions.filter((m) => m.driver_id).length;
t("the fill rate is believable, not perfect", filled / missions.length > 0.6 && filled / missions.length < 0.98,
  `${Math.round((filled / missions.length) * 100)}% of trips found a Driver`);
t("some trips genuinely expired — a marketplace that never fails is not one",
  (statuses.expired ?? 0) > 5, `${statuses.expired ?? 0} unfilled`);

console.log("\n── the field that was unusable before ──");
const zones = new Set(missions.map((m) => m.zone));
t("zone now holds towns, not a mixture of hotels, streets and terminals",
  zones.size <= 8, `${zones.size} values: ${[...zones].sort().join(", ")}`);

console.log("\n── the features the console reports on ──");
for (const [table, label] of [["mission_release", "release requests"], ["mission_cancellation", "cancellations"], ["document", "Driver documents"]] as const) {
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  console.log(`   ${label.padEnd(20)} ${count}`);
}
// ⚑ These three were ALL zero after the first seed run, because every insert
// used a column name the table does not have and nobody checked the error. The
// seed reported success. Assert them, or the next silent failure is invisible.
const { count: relCount } = await db.from("mission_release").select("*", { count: "exact", head: true });
const { count: docCount } = await db.from("document").select("*", { count: "exact", head: true });
t("release requests exist, so a dead feature and a rare one look different",
  (relCount ?? 0) > 0, `${relCount} requests`);
t("Drivers have filed paperwork, and not all of them", (docCount ?? 0) > 10, `${docCount} documents`);
const { data: expiring } = await db.from("document").select("id, expires_at")
  .lt("expires_at", new Date(Date.now() + 30 * 86_400_000).toISOString());
t("at least one document is about to lapse — the only urgent thing on that screen",
  (expiring?.length ?? 0) > 0, `${expiring?.length ?? 0} expiring within 30 days`);

console.log(`\nchecks: ${pass + fail} · ${fail} failed`);
if (fail) process.exit(1);
console.log("The dataset holds together.");
