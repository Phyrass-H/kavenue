// Does /admin/vehicles agree with the app about the cars and the trips — on the live database?
//
//   npx tsx .local/probe/vehicle-find.mts
//
// ⚑ RUN THIS AFTER PASTING docs/migrations/2026-09-14_admin_vehicles.sql (which needs
// 2026-09-13d_admin_driver_find.sql for fold_text()). Before that it says "not pasted" and stops,
// having read nothing else. It only READS: nothing in this file writes a row.
//
// ⚑ WHY IT EXISTS. The grid is decided in SQL; every other screen's idea of "may this Driver work"
// and "is this trip dead" comes from lib/driver-approvals.ts and lib/dispatch-status.ts. They are
// meant to be one rule written twice. This recomputes both halves of the grid from the tables — All
// time and the last 30 Paris days — and names any class the two disagree about.
// ⚑ AND THE SEARCH IS COMPARED WITH A TYPESCRIPT TWIN, not only with "found something": a search that
// returns the whole fleet also finds the car you typed. Every term below must return EXACTLY the
// cars the twin predicts.
//
// ⚑ THE SERVICE ROLE, AS driver-find.mts DOES. Both functions are SECURITY INVOKER and the service role
// bypasses RLS, so it sees what an admin sees; no admin JWT is needed. ⚑ The trips are read from the
// mission TABLE with named safe columns: mission_read filters on app_role(), which is null for the
// service role, and returns 0 rows without an error.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { mayTakeWork } from "../../lib/driver-approvals.ts";
import { statusOf } from "../../lib/vehicle-approval.ts";
import { isExpired } from "../../lib/dispatch-status.ts";
import { parseAdminPeriod } from "../../lib/admin-period.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};
const skip = (why: string) => console.log(`skip  ${why}`);

type Supply = { live_cars: number; can_work: number; to_approve: number; refused: number; person_not_approved: number };
type Demand = { trips: number; settled: number; filled: number; nobody_took: number };
type Overview = {
  supply: (Supply & { category: string; body_type: string })[] | null;
  demand: (Demand & { category: string; body: string })[] | null;
};
type FindRow = {
  vehicle_id: string; driver_id: string; category: string; body_type: string; plate: string | null;
  retired_at: string | null; replaced_by: string | null; replaced_by_plate: string | null; total_count: number;
};

const overview = async (p_from: string | null, p_to: string | null) => {
  const { data, error } = await db.rpc("admin_vehicle_overview", { p_from, p_to });
  return { o: data as Overview | null, error };
};
/** Every row of a find, paged — PostgREST caps an answer at 1 000 rows without a word. */
const findAll = async (p_q: string | null, p_category: string | null = null, p_body: string | null = null, p_include_replaced = true) => {
  const rows: FindRow[] = [];
  for (let p_offset = 0; ; p_offset += 500) {
    const { data, error } = await db.rpc("admin_vehicle_find", { p_q, p_category, p_body, p_include_replaced, p_limit: 500, p_offset });
    if (error) throw new Error(`admin_vehicle_find(${JSON.stringify(p_q)}): ${error.code ?? ""} ${error.message}`);
    const page = (data ?? []) as FindRow[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows;
};

// ── the guard: is the migration there at all? ───────────────────────────────────────────
const guard = await overview(null, null);
const guardFind = await db.rpc("admin_vehicle_find",
  { p_q: null, p_category: null, p_body: null, p_include_replaced: true, p_limit: 1, p_offset: 0 });
if (guard.error || guardFind.error) {
  const e = guard.error ?? guardFind.error!;
  console.log(`not pasted — ${e.code ?? ""} ${e.message}`);
  console.log("   paste docs/migrations/2026-09-14_admin_vehicles.sql (after 2026-09-13d_admin_driver_find.sql), then run this again. Nothing was checked.");
  process.exit(0);
}

// ── the tables, read the way the app reads them ─────────────────────────────────────────
/** Every row, 1 000 at a time. THROWS on an error: an empty answer and a refused one must never look alike. */
async function readAll<T>(label: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let lo = 0; ; lo += 1000) {
    const { data, error } = await db.from(label).select(cols).order("id").range(lo, lo + 999);
    if (error) throw new Error(`${label}: ${error.code ?? ""} ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}
type Car = {
  id: string; driver_id: string; category: string; body_type: string; make: string | null; model: string | null;
  colour: string | null; plate: string | null; approval_status: string; retired_at: string | null; replaced_by: string | null;
};
type Person = { id: string; first_name: string; last_name: string; company_name: string | null; siret: string | null; verified: boolean };
type Trip = { id: string; status: string; category: string; required_body_type: string | null; pickup_at: string; accepted_at: string | null };

const [cars, drivers, trips] = await Promise.all([
  readAll<Car>("vehicle", "id, driver_id, category, body_type, make, model, colour, plate, approval_status, retired_at, replaced_by"),
  readAll<Person>("driver", "id, first_name, last_name, company_name, siret, verified"),
  // ⚑ No money column named: this probe must not be the thing that proves the wall has a hole.
  readAll<Trip>("mission", "id, status, category, required_body_type, pickup_at, accepted_at"),
]);
const person = new Map(drivers.map((d) => [d.id, d]));
const carById = new Map(cars.map((c) => [c.id, c]));
const live = cars.filter((c) => !c.retired_at);
console.log(`   ${cars.length} cars (${live.length} live) · ${drivers.length} Drivers · ${trips.length} trips`);

// ── the grid: the SQL against the app's own rules ───────────────────────────────────────
function supplyOfApp(): Map<string, Supply> {
  const m = new Map<string, Supply>();
  for (const c of live) {
    const d = person.get(c.driver_id);
    if (!d) continue;
    const k = `${c.category}|${c.body_type}`;
    const s = m.get(k) ?? { live_cars: 0, can_work: 0, to_approve: 0, refused: 0, person_not_approved: 0 };
    s.live_cars++;
    // mayTakeWork's order: the person and the car first, then the car, then the person.
    if (mayTakeWork(d, c as never)) s.can_work++;
    else if (statusOf(c as never) === "rejected") s.refused++;
    else if (statusOf(c as never) === "approved") s.person_not_approved++;
    else s.to_approve++;
    m.set(k, s);
  }
  return m;
}
function demandOfApp(fromIso: string | null, toIso: string | null, now: Date): Map<string, Demand> {
  const m = new Map<string, Demand>();
  const lo = fromIso ? new Date(fromIso).getTime() : -Infinity;
  const hi = toIso ? new Date(toIso).getTime() : Infinity;
  for (const x of trips) {
    const at = new Date(x.pickup_at).getTime(); // ⚑ the PICKUP, half-open — never created_at
    if (at < lo || at >= hi) continue;
    const k = `${x.category}|${x.required_body_type ?? "any"}`;
    const d = m.get(k) ?? { trips: 0, settled: 0, filled: 0, nobody_took: 0 };
    const taken = x.accepted_at != null;
    const dead = isExpired({ status: x.status as never, pickup_at: x.pickup_at }, now);
    d.trips++;
    if (taken) d.filled++;
    if (!taken && dead) d.nobody_took++;
    if (taken || dead || x.status === "cancelled") d.settled++;
    m.set(k, d);
  }
  return m;
}
function same<T extends Record<string, number>>(label: string, app: Map<string, T>, sql: Map<string, T>, fields: (keyof T)[]) {
  const diffs: string[] = [];
  for (const k of new Set([...app.keys(), ...sql.keys()])) {
    for (const f of fields) {
      const a = Number(app.get(k)?.[f] ?? 0), s = Number(sql.get(k)?.[f] ?? 0);
      if (a !== s) diffs.push(`${k} ${String(f)}: sql ${s} vs app ${a}`);
    }
  }
  t(label, diffs.length === 0, diffs.slice(0, 8).join("; ") || `${sql.size} class(es)`);
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const [ty, tm, td] = today.split("-").map(Number);
const from30 = new Date(Date.UTC(ty!, tm! - 1, td! - 29)).toISOString().slice(0, 10);
const range = parseAdminPeriod({ period: "range", from: from30, to: today }, new Date());
const windows: [string, string | null, string | null][] = [
  ["All time", null, null],
  [`the last 30 days (${range.fromIso} → ${range.toIso})`, range.fromIso ?? null, range.toIso ?? null],
];

const appSupply = supplyOfApp();
let firstSupply: string | null = null;
for (const [label, fromIso, toIso] of windows) {
  console.log(`\n── the grid, ${label} ──`);
  // ⚑ `now` is taken just before the call. A pooled trip picked up in the very millisecond between
  //   the two clocks would differ by one nobody_took — rerun before believing it.
  const now = new Date();
  const { o, error } = await overview(fromIso, toIso);
  if (error || !o) { t(`admin_vehicle_overview answers for ${label}`, false, error?.message ?? "no answer"); continue; }
  const sqlSupply = new Map((o.supply ?? []).map((r) => [`${r.category}|${r.body_type}`, r as Supply]));
  const sqlDemand = new Map((o.demand ?? []).map((r) => [`${r.category}|${r.body}`, r as Demand]));
  same("the cars: can work / to approve / refused / person not approved, per class, match mayTakeWork", appSupply, sqlSupply,
    ["live_cars", "can_work", "to_approve", "refused", "person_not_approved"]);
  same("the trips: trips / settled / filled / nobody took, per class, match isExpired on pickup_at", demandOfApp(fromIso, toIso, now), sqlDemand,
    ["trips", "settled", "filled", "nobody_took"]);
  const supplyText = JSON.stringify(o.supply ?? []);
  if (firstSupply === null) firstSupply = supplyText;
  else t("the cars do not move with the period (census)", supplyText === firstSupply);
}

// ── the list: every car, in the page's order ────────────────────────────────────────────
console.log("\n── the car list ──");
const everyCar = await findAll(null);
t("with no term, every car comes back — replaced ones included", everyCar.length === cars.length, `${everyCar.length} of ${cars.length}`);
t("total_count is the whole list", everyCar.every((r) => Number(r.total_count) === cars.length));
const firstReplaced = everyCar.findIndex((r) => r.retired_at);
t("live cars before replaced ones", firstReplaced === -1 || everyCar.slice(firstReplaced).every((r) => r.retired_at));
const rank = (c: string) => ({ eco: 1, business: 2, luxury: 3 } as Record<string, number>)[c] ?? 4;
const liveRows = everyCar.filter((r) => !r.retired_at);
t("Eco, then Business, then First, then anything else", liveRows.every((r, i, a) => i === 0 || rank(a[i - 1]!.category) <= rank(r.category)));
const wrongSuccessor = everyCar.filter((r) => r.retired_at && r.replaced_by
  && r.replaced_by_plate !== (carById.get(r.replaced_by)?.plate ?? null));
t("every replaced row names the plate that replaced it", wrongSuccessor.length === 0, wrongSuccessor.map((r) => r.plate).join(", "));
const liveOnly = await findAll(null, null, null, false);
t("p_include_replaced false never returns a replaced car", liveOnly.every((r) => !r.retired_at) && liveOnly.length === live.length,
  `${liveOnly.length} of ${live.length} live`);

for (const [k, s] of appSupply) {
  const [category, body] = k.split("|");
  const rows = await findAll(null, category!, body!, false);
  t(`a grid row opens exactly its cars: ${k}`, rows.length === s.live_cars, `${rows.length} vs ${s.live_cars}`);
}
for (const tier of new Set(live.map((c) => c.category))) {
  const rows = await findAll(null, tier, "any", false);
  const want = live.filter((c) => c.category === tier && person.has(c.driver_id)).length;
  t(`"any" opens both bodies: ${tier}`, rows.length === want, `${rows.length} vs ${want}`);
}

// ── the search, against its TypeScript twin ─────────────────────────────────────────────
console.log("\n── the search, against its TypeScript twin ──");
// fold_text, from the SAME alphabets the migration holds — read out of 13d, never retyped here.
const alphabets = fs.readFileSync("docs/migrations/2026-09-13d_admin_driver_find.sql", "utf8")
  .match(/translate\(p,\s*'([^']*)',\s*'([^']*)'\)/);
if (!alphabets) throw new Error("fold_text's alphabets were not found in 2026-09-13d_admin_driver_find.sql");
const FROM = [...alphabets[1]!], TO = [...alphabets[2]!];
const foldText = (s: string) =>
  [...s].map((ch) => { const i = FROM.indexOf(ch); return i >= 0 ? TO[i]! : ch; }).join("").toLowerCase()
    .replaceAll("œ", "oe").replaceAll("æ", "ae");
const compact = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const twin = (term: string) => {
  const words = foldText(term.trim()).split(/\s+/).filter(Boolean);
  const digits = /^[0-9+()./ -]+$/.test(term.trim()) ? term.replace(/\D/g, "") : "";
  const whole = compact(term);
  return new Set(cars.filter((c) => {
    const d = person.get(c.driver_id);
    if (!d) return false;
    const hay = foldText([c.make, c.model, c.colour, d.first_name, d.last_name, d.company_name].filter((v) => v != null).join(" "));
    const plate = compact(c.plate);
    return (words.length > 0 && words.every((w) => hay.includes(w) || (compact(w).length >= 2 && plate.includes(compact(w)))))
      || (whole.length >= 2 && plate.includes(whole))
      || (digits.length >= 4 && (d.siret ?? "").replace(/\D/g, "").includes(digits));
  }).map((c) => c.id));
};
const searches = async (label: string, term: string, mustHold: string[] = []) => {
  const rows = await findAll(term);
  const got = new Set(rows.map((r) => r.vehicle_id));
  const want = twin(term);
  const extra = [...got].filter((id) => !want.has(id)).map((id) => carById.get(id)?.plate ?? id);
  const missing = [...want].filter((id) => !got.has(id)).map((id) => carById.get(id)?.plate ?? id);
  t(`${label}: "${term}" returns exactly the twin's cars`, extra.length === 0 && missing.length === 0,
    extra.length || missing.length ? `extra ${extra.join(",") || "-"} · missing ${missing.join(",") || "-"}` : `${got.size} car(s)`);
  if (mustHold.length) t(`${label}: "${term}" holds the car it was built from`, mustHold.every((id) => got.has(id)));
  return rows;
};

const plated = [...live].sort((a, b) => a.id.localeCompare(b.id)).find((c) => compact(c.plate).length >= 5);
if (plated) {
  const p = compact(plated.plate);
  await searches("a plate fragment, lower case, with a space", `${p.slice(0, 2)} ${p.slice(2, 5)}`.toLowerCase(), [plated.id]);
  await searches("a whole plate typed with spaces", String(plated.plate).replace(/[^A-Za-z0-9]+/g, " "), [plated.id]);
} else skip("no live car has a plate of 5 characters");

const replaced = cars.find((c) => c.retired_at && c.plate);
if (replaced) {
  const rows = await searches("a REPLACED car by its plate", String(replaced.plate), [replaced.id]);
  const row = rows.find((r) => r.vehicle_id === replaced.id);
  t("…on its own row, with the plate that replaced it",
    !!row && !!row.retired_at && row.replaced_by_plate === (replaced.replaced_by ? carById.get(replaced.replaced_by)?.plate ?? null : null),
    row ? `replaced by ${row.replaced_by_plate}` : "not found");
} else skip("no car has been replaced yet");

await searches("make + colour, every word must hit", "mercedes noir");

const named = live.map((c) => person.get(c.driver_id)).find((d) => d && d.last_name.trim().length >= 4);
if (named) {
  // ⚑ Folded as fold_text folds (French accents only), not by NFD: "Şahin" stays "şahin" in SQL, and an
  //   NFD needle would report a false FAIL (S81 review).
  const surname = foldText(named.last_name);
  const rows = await searches("a surname, folded as fold_text folds it", surname,
    cars.filter((c) => c.driver_id === named.id).map((c) => c.id));
  t("a surname does not return the whole fleet", rows.length < cars.length, `${rows.length} of ${cars.length}`);
} else skip("no live car's Driver has a surname of 4 letters");

const wild = await searches("% is a character, not a wildcard", "%");
t("…and it is not the whole fleet", wild.length < cars.length, `${wild.length} of ${cars.length}`);

const sireted = drivers.find((d) => (d.siret ?? "").replace(/\D/g, "").length >= 9 && cars.some((c) => c.driver_id === d.id));
if (sireted) {
  const digits = String(sireted.siret).replace(/\D/g, "").slice(3, 9);
  await searches("a SIRET, from the middle", digits, cars.filter((c) => c.driver_id === sireted.id).map((c) => c.id));
  // ⚑ An email-shaped term holding those same digits must search no SIRET (13d's S79 final review).
  const rows = await searches("an email holding SIRET digits", `probe${digits}@example.invalid`);
  t("…and it does not find the SIRET's Driver", !rows.some((r) => r.driver_id === sireted.id), `${rows.length} row(s)`);
} else skip("no Driver with a car has a SIRET");

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
