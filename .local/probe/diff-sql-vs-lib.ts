// READ-ONLY differential probe — BACKLOG § H2 (SQL side), level (a).
// Executes the REAL SQL rules (mission_is_airport / mission_waiting, both `immutable`,
// callable via PostgREST) and compares them to their lib/ mirror. No writes.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { isAirportPickup, waitingAt, waitingRatePerMin } from "../../lib/cancellation.ts";
import { openingPrice } from "../../lib/pdp.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let checks = 0;
const fails: string[] = [];
const note = (s: string) => fails.push(s);

// ─── 1. the airport predicate ────────────────────────────────────────────────
const NFC = "Aéroport Nice Côte d'Azur";          // é as one code point
const NFD = "Aéroport Nice Côte d'Azur";        // e + combining acute
const addrCases: Array<[string, string | null, string | null]> = [
  ["Aéroport NFC label", "12 Rue Inconnue, Nice", NFC],
  ["Aéroport NFD label", "12 Rue Inconnue, Nice", NFD],
  ["unaccented", "Aeroport Nice", null],
  ["english", "Nice Airport Terminal 2", null],
  ["italian", "Aeroporto di Genova", null],
  ["uppercase", "AÉROPORT DE CANNES", null],
  ["plain city", "12 Promenade des Anglais, Nice", null],
  ["plain city + label", "3 Rue Massena", "Hôtel Negresco"],
  ["label null, addr airport", "Aéroport Nice Côte d'Azur", null],
  ["'Porto' must NOT match", "5 Rue de Porto, Nice", null],
  ["heliport must NOT match", "Héliport de Monaco", null],
];
for (const [name, address, label] of addrCases) {
  for (const flight of [null, "", "AF1234"]) {
    const m = { flight_number: flight, pickup_address: address, pickup_label: label };
    const { data, error } = await db.rpc("mission_is_airport", { p_mission: m });
    if (error) { note(`RPC ERROR ${name}/${flight}: ${error.message}`); continue; }
    const lib = isAirportPickup(m as never);
    checks++;
    if ((data ?? false) !== lib) note(`airport MISMATCH  ${name} flight=${JSON.stringify(flight)}  sql=${data} lib=${lib}`);
    if (data === null) note(`airport NULL (not false)  ${name} flight=${JSON.stringify(flight)}`);
  }
}

// ─── 2. the waiting meter ────────────────────────────────────────────────────
const PICKUPS = [
  "2026-08-01T10:00:00Z",
  "2026-03-29T00:30:00Z", // Paris DST spring-forward night
  "2026-10-25T00:30:00Z", // Paris DST fall-back night
  "2026-12-31T23:00:00Z",
];
// offsets in minutes from the guest-due moment, straddling every boundary
const OFFSETS = [-90, -1, 0, 0.5, 1, 19, 19.5, 20, 20.5, 21, 59, 59.5, 60, 60.5, 61,
                 119, 119.5, 120, 121, 300];
for (const pickup of PICKUPS) {
  for (const airport of [false, true]) {
    for (const ready of [null, "+45", "-30"]) {
      const guest_ready_at = ready === null ? null
        : new Date(Date.parse(pickup) + Number(ready) * 60_000).toISOString();
      const m = {
        pickup_at: pickup,
        guest_ready_at,
        flight_number: null,
        pickup_address: airport ? NFC : "12 Promenade des Anglais, Nice",
        pickup_label: null,
      };
      const due = Date.parse(guest_ready_at ?? pickup);
      for (const off of OFFSETS) {
        const at = new Date(due + off * 60_000).toISOString();
        const { data, error } = await db.rpc("mission_waiting", { p_mission: m, p_at: at });
        if (error) { note(`RPC ERROR waiting ${pickup}/${off}: ${error.message}`); continue; }
        const sql = (data as never as Array<Record<string, unknown>>)[0];
        const lib = waitingAt(m as never, new Date(at));
        checks++;
        if (Number(sql.w_min) !== lib.minutes)
          note(`waiting MIN  pickup=${pickup} airport=${airport} ready=${ready} at=+${off}m  sql=${sql.w_min} lib=${lib.minutes}`);
        if (Number(sql.w_fee) !== lib.fee)
          note(`waiting FEE  pickup=${pickup} airport=${airport} ready=${ready} at=+${off}m  sql=${sql.w_fee} lib=${lib.fee}`);
        // ⚑ STALE UNTIL 2026-08-20: this asserted a flat 1,00, which the waiting
        // rate stopped being in S62 (per class: eco 0,50 · business 0,75 · van
        // 0,75 · luxury 1,00). It reported 480 "mismatches" out of 673 checks on
        // a codebase where SQL and lib in fact agree — MIN, FEE, FROM and TO all
        // passed throughout. Compare against the same table the lib uses.
        const libRate = waitingRatePerMin((m as { category?: never }).category);
        if (Number(sql.w_rate) !== libRate)
          note(`waiting RATE pickup=${pickup} at=+${off}m  sql=${sql.w_rate} lib=${libRate}`);
        if (Date.parse(sql.w_from as string) !== lib.from.getTime())
          note(`waiting FROM pickup=${pickup} airport=${airport} ready=${ready} at=+${off}m  sql=${sql.w_from} lib=${lib.from.toISOString()}`);
        // SQL w_to is the CLAMPED stop; lib exposes the unclamped ceiling as `until`.
        const libStop = Math.min(Date.parse(at), lib.until.getTime());
        if (Date.parse(sql.w_to as string) !== libStop)
          note(`waiting TO   pickup=${pickup} airport=${airport} ready=${ready} at=+${off}m  sql=${sql.w_to} libStop=${new Date(libStop).toISOString()}`);
      }
    }
  }
}

// ─── 3. the same two functions over the REAL mission rows ────────────────────
const manifest = JSON.parse(fs.readFileSync(".local/seed/seed-manifest.json", "utf8"));
const seeded = new Set<string>(manifest.missions.map((x: any) => x.id ?? x));
const { data: rows, error: rerr } = await db.from("mission")
  .select("id,pickup_at,guest_ready_at,flight_number,pickup_address,pickup_label");
if (rerr) throw rerr;
const real = (rows ?? []).filter((r) => !seeded.has(r.id));
for (const r of real) {
  const m = { pickup_at: r.pickup_at, guest_ready_at: r.guest_ready_at, flight_number: r.flight_number,
              pickup_address: r.pickup_address, pickup_label: r.pickup_label };
  const { data: a } = await db.rpc("mission_is_airport", { p_mission: m });
  checks++;
  if ((a ?? false) !== isAirportPickup(m as never))
    note(`REAL airport MISMATCH ${r.id.slice(0,8)} "${r.pickup_label ?? r.pickup_address}" sql=${a} lib=${isAirportPickup(m as never)}`);
  for (const off of [25, 65, 125]) {
    const at = new Date(Date.parse(r.guest_ready_at ?? r.pickup_at) + off * 60_000).toISOString();
    const { data } = await db.rpc("mission_waiting", { p_mission: m, p_at: at });
    const sql = (data as never as Array<Record<string, unknown>>)[0];
    const lib = waitingAt(m as never, new Date(at));
    checks++;
    if (Number(sql.w_min) !== lib.minutes || Number(sql.w_fee) !== lib.fee)
      note(`REAL waiting MISMATCH ${r.id.slice(0,8)} +${off}m sql=${sql.w_min}min/${sql.w_fee}€ lib=${lib.minutes}min/${lib.fee}€`);
  }
}

// ─── 3. the opening price — the SQL fee-basis band's own floor ───────────────
// mission_opening_price() must agree with openingPrice() in lib/pdp.ts to the
// cent, because the cancel RPCs clamp every fee basis to it. Since SPEED WIN's
// 70 % opening is DERIVED rather than stored, an inlined `least(pdp_start, …)`
// in SQL silently stopped matching — that is exactly the drift this checks for.
const openingCases: Array<[string, Record<string, unknown>]> = [
  ["plain floor", { ceiling: 100, pdp_start: 30, speed_win: false }],
  ["SPEED WIN, floor below 70 %", { ceiling: 100, pdp_start: 30, speed_win: true }],
  ["SPEED WIN, floor ABOVE 70 %", { ceiling: 100, pdp_start: 82.4, speed_win: true }],
  ["floor == ceiling (amendment-collapsed)", { ceiling: 175, pdp_start: 175, speed_win: false }],
  ["floor above ceiling (must clamp)", { ceiling: 100, pdp_start: 140, speed_win: false }],
  ["null pdp_start (pre-curve row)", { ceiling: 100, pdp_start: null, speed_win: false }],
  ["null pdp_start + SPEED WIN", { ceiling: 100, pdp_start: null, speed_win: true }],
  ["odd cents", { ceiling: 87.31, pdp_start: 41.07, speed_win: true }],
];
for (const [label, m] of openingCases) {
  const { data, error } = await db.rpc("mission_opening_price", { p_mission: m });
  checks++;
  if (error) { note(`opening RPC ERROR ${label}: ${error.message}`); continue; }
  const lib = openingPrice(m as never);
  if (Math.round(Number(data) * 100) !== Math.round(lib * 100))
    note(`opening MISMATCH  ${label}  sql=${data} lib=${lib}`);
}

console.log(`real missions probed: ${real.length}`);
console.log(`\nchecks run: ${checks}`);
console.log(fails.length ? `MISMATCHES: ${fails.length}\n` + fails.join("\n") : "ALL AGREE — 0 mismatches");
