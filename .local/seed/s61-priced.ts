// Six trips priced the way the app prices them, so the S61 commission work is
// visible in the UI. Every mission that existed before 2026-08-17 predates
// commission and renders as one plain amount with no breakdown — correct, but it
// means the app looks unchanged until something priced lands in it.
//
// ⚑ NOTHING HERE IS HAND-TYPED. The ceiling comes from the SQL `mission_price()`
// RPC (the same function createMission calls), the rates from the live
// `commission_rate` row, and the Course from `courseFromBusinessTotal` — so
// these rows are indistinguishable from ones posted through the form. If any of
// that drifts, this script drifts with it rather than papering over it.
//
// All six carry reference S61DEMO, which is how they get removed:
//   node .local/seed/s61-priced.ts --undo
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { courseFromBusinessTotal, ratesFromRow } from "../../lib/commission.ts";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TAG = "S61DEMO";
const undo = process.argv.includes("--undo");

// ── undo ───────────────────────────────────────────────────────────────────
if (undo) {
  const { data: rows } = await db.from("mission").select("id").eq("reference", TAG);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) {
    for (const t of ["status_event", "mission_cancellation", "mission_guest_contact"]) {
      await db.from(t).delete().in("mission_id", ids);
    }
    await db.from("mission").delete().in("id", ids);
  }
  const { count } = await db.from("mission").select("id", { count: "exact", head: true });
  console.log(`removed ${ids.length} ${TAG} missions · ${count} left`);
  process.exit(0);
}

// ── who ────────────────────────────────────────────────────────────────────
const { data: biz } = await db
  .from("business")
  .select("id,name")
  .ilike("name", "%Grand%")
  .limit(1)
  .maybeSingle();
// ⚑ A throw, not a `!`. A bare non-null assertion is how a seed script writes rows
// against nothing at all, in silence — the exact shape of the bug this typechecking
// was turned on to catch.
if (!biz) throw new Error("s61: no Business matching %Grand% — seed the Businesses first");
const { data: disp } = await db
  .from("dispatcher")
  .select("id")
  .eq("business_id", biz.id)
  .limit(1)
  .maybeSingle();
if (!disp) throw new Error(`s61: no Dispatcher for Business ${biz.id}`);
// The dev-login Driver. ⚑ Matched on auth_user_id, never on `email` — the S50
// trap: demo.driver@pickup.local resolves to the Marc Dubois row, whose own
// email column is NULL.
const { data: drv } = await db
  .from("driver")
  .select("id,first_name,last_name,vat_number")
  .eq("first_name", "Marc")
  .eq("last_name", "Dubois")
  .maybeSingle();
if (!drv) throw new Error("s61: the dev-login Driver is missing — run seed-probe-accounts first");

const { data: rateRow } = await db
  .from("commission_rate")
  .select("*")
  .lte("effective_from", new Date().toISOString())
  .order("effective_from", { ascending: false })
  .limit(1)
  .maybeSingle();
const rates = ratesFromRow(rateRow);

console.log(`  business ${biz.name} · driver ${drv.first_name} ${drv.last_name} · rates ${!!rates}`);

const PLACES = {
  croisette: ["Boulevard de la Croisette, 06400 Cannes, France", 43.5495, 7.0175],
  monaco: ["Place du Casino, 98000 Monaco", 43.7396, 7.4276],
  nceAirport: ["Aéroport Nice Côte d'Azur, 06200 Nice, France", 43.6653, 7.2148],
  negresco: ["37 Prom. des Anglais, 06000 Nice, France", 43.6947, 7.2571],
  antibes: ["Port Vauban, 06600 Antibes, France", 43.5866, 7.1256],
} as const;

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

type Spec = {
  label: string;
  tier: "eco" | "business" | "luxury";
  body: "sedan" | "van" | null;
  from: keyof typeof PLACES;
  to: keyof typeof PLACES;
  km: number;
  min: number;
  pickupInH: number;
  postedHAgo: number;
  speedWin?: boolean;
  outcome?: "confirmed" | "completed" | "cancelled";
  acceptedHAgo?: number;
  waitingFee?: number;
  waitingMin?: number;
};

const SPECS: Spec[] = [
  {
    label: "pooled · climbing 20 min",
    tier: "business", body: "sedan",
    from: "croisette", to: "monaco", km: 55.7, min: 68,
    pickupInH: 20, postedHAgo: 0.34,
  },
  {
    label: "pooled · SPEED WIN",
    tier: "luxury", body: "sedan",
    from: "nceAirport", to: "monaco", km: 32.5, min: 41,
    pickupInH: 3, postedHAgo: 0.2, speedWin: true,
  },
  {
    label: "pooled · Eco, short",
    tier: "eco", body: null,
    from: "negresco", to: "nceAirport", km: 8.1, min: 19,
    pickupInH: 24, postedHAgo: 0.75,
  },
  {
    label: "confirmed · shows what the auction saved",
    tier: "business", body: "sedan",
    from: "antibes", to: "nceAirport", km: 24.3, min: 32,
    pickupInH: 18, postedHAgo: 20, outcome: "confirmed", acceptedHAgo: 19.5,
  },
  {
    label: "completed · with waiting on it",
    tier: "business", body: "van",
    from: "nceAirport", to: "croisette", km: 27.4, min: 38,
    pickupInH: -20, postedHAgo: 44, outcome: "completed", acceptedHAgo: 43.2,
    waitingFee: 17, waitingMin: 17,
  },
  {
    label: "cancelled by the Business · fee carries commission",
    tier: "luxury", body: "van",
    from: "croisette", to: "negresco", km: 33.6, min: 44,
    pickupInH: -70, postedHAgo: 96, outcome: "cancelled", acceptedHAgo: 95,
  },
];

const made: string[] = [];

for (const s of SPECS) {
  const [fromAddr, fromLat, fromLng] = PLACES[s.from];
  const [toAddr, toLat, toLng] = PLACES[s.to];
  const pickupAt = hours(s.pickupInH);
  const night = (() => {
    const h = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Paris" })
        .format(new Date(pickupAt)),
    );
    return h >= 22 || h < 6;
  })();

  // The price, from the same SQL the server calls.
  const { data: quoted, error: qErr } = await db.rpc("mission_price", {
    p_tier: s.tier,
    p_body: s.body,
    p_km: s.km,
    p_night: night,
  });
  if (qErr) throw qErr;
  const q = Array.isArray(quoted) ? quoted[0] : quoted;

  // The rate card's ceiling is the Business's ALL-IN maximum; the column stores
  // the Course behind it (docs/06 §1, founder 2026-08-17).
  const allIn = Number(q.ceiling_price);
  const course = courseFromBusinessTotal(allIn, rates);
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const row: Record<string, unknown> = {
    business_id: biz.id,
    dispatcher_id: disp.id,
    status: s.outcome === "cancelled" ? "cancelled" : s.outcome === "completed" ? "completed" : s.outcome === "confirmed" ? "confirmed" : "pooled",
    category: s.tier,
    required_body_type: s.body,
    zone: "nice",
    reference: TAG,
    pickup_address: fromAddr, pickup_lat: fromLat, pickup_lng: fromLng,
    dropoff_address: toAddr, dropoff_lat: toLat, dropoff_lng: toLng,
    pickup_at: pickupAt,
    distance_km: s.km,
    duration_min: s.min,
    pax_count: 2,
    luggage_count: 2,
    ceiling: course,
    // §6: the auction opens at the FLOOR, in Course space — the same conversion
    // as the ceiling above, from the same snapshot rates. SPEED WIN's 70 %
    // opening is derived from `speed_win` on read, never stored, so a re-pool
    // can turn it on and off without losing the floor. pdp_step / pdp_interval
    // are dead columns as of the §6 curve.
    pdp_start: courseFromBusinessTotal(Number(q.floor_price), rates),
    pdp_step: null,
    pdp_interval: null,
    speed_win: !!s.speedWin,
    rate_card_id: q.rate_card_id,
    night_applied: night,
    commission_business_rate: rates?.businessHt ?? null,
    commission_driver_rate: rates?.driverHt ?? null,
    commission_vat_rate: rates?.feeVat ?? null,
    created_at: hours(-s.postedHAgo),
  };

  // ⚑ The Driver is attached in a SECOND statement, never on the insert. The
  // transport-VAT trigger is `before update of driver_id` — deliberately, since
  // a real trip is always posted first and accepted second — so inserting a row
  // with a Driver already on it produces a mission nobody's VAT status was ever
  // frozen onto, and the Driver's money detail silently loses its VAT line.
  if (s.outcome === "confirmed") row.checked_in_at = null;
  if (s.outcome === "completed") {
    row.waiting_fee = s.waitingFee ?? null;
    row.waiting_minutes = s.waitingMin ?? null;
  }
  if (s.outcome === "cancelled") {
    row.cancelled_by = "business";
    row.cancelled_at = hours(-(s.postedHAgo - 6));
    row.cancellation_reason = "The Guest's flight was rebooked to another day.";
  }

  const { data: made1, error } = await db.from("mission").insert(row).select("id,ceiling").maybeSingle();
  if (error) throw new Error(`${s.label}: ${error.message}`);
  if (!made1) throw new Error(`${s.label}: insert returned no row`);

  // Accept it, the way accept_mission does — this is what fires the trigger.
  if (s.outcome) {
    const at = hours(-(s.acceptedHAgo ?? 1));
    const { error: accErr } = await db
      .from("mission")
      .update({ driver_id: drv.id, accepted_at: at, confirmed_at: at })
      .eq("id", made1.id);
    if (accErr) throw new Error(`${s.label} (accept): ${accErr.message}`);
  }

  // A Business cancellation fee is settled money and carries commission
  // (docs/06 §1) — computed off the fare frozen at acceptance, like the RPC does.
  if (s.outcome === "cancelled") {
    await db.from("mission").update({ cancellation_fee: round2(course * 0.9) }).eq("id", made1.id);
  }

  made.push(`  ${s.label} — all-in ${allIn.toFixed(2)} · course ${course.toFixed(2)}`);
}

console.log(made.join("\n"));
const { count } = await db.from("mission").select("id", { count: "exact", head: true });
console.log(`\n${SPECS.length} ${TAG} missions created · ${count} missions total`);
