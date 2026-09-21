// O7 cancellation + waiting policy (D45 · D47 · D48). MIRRORS, and must be kept in step
// with, docs/migrations/: 2026-07-13_o7_cancellation.sql · 2026-07-19_repool_speedwin_window.sql
// · 2026-07-19_no_show_clock_origin.sql · 2026-07-19_no_show_airport_label.sql ·
// 2026-07-22_waiting_fee.sql (mission_waiting / business_declare_no_show).
// Euro AMOUNTS settle MANUAL in beta; these are the fixed RULES, shared by the UI (to show
// the live cost) and the server actions (the fare snapshot).
import type { MissionRow, VehicleCategory } from "@/lib/database.types";

// Euros to the cent. The meter multiplies a rate by a minute count, and a per-class rate
// makes that float-unsafe: 3 × 0,75 is 2.2500000000000004. Postgres rounds half away from
// zero on `round(w_min * v_rate, 2)`, and so does this.
function round2(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100;
}

// Airport pickup = a flight number OR an airport-looking pickup address OR place label.
// The label matters: the Mapbox autocomplete stores the POI name ("Aéroport Nice Côte
// d'Azur") in pickup_label and the navigable street address in pickup_address, so an
// airport booked from autocomplete has NO keyword in the address.
//
// Matches the bare ASCII substring 'roport' rather than a[eé]roport: that is present in
// aéroport / aeroport / Aeroporto whatever the accent, case or Unicode normalisation
// (NFC vs NFD). The old bracket expression silently failed inside Postgres for a multibyte
// character, so every accented airport pickup was being treated as a 20-min city one —
// see 2026-07-22_airport_accent_fix.sql, which this mirrors.
const AIRPORT_RE = /roport|airport/i;

/**
 * Is the PICKUP an airport? It decides the courtesy wait (60 min vs 20) and the money
 * ceiling (120 min vs 60), so it is worth more than it looks.
 *
 * ⚑ A FLIGHT NUMBER ALONE IS NOT AN AIRPORT PICKUP (fixed 2026-08-20). The old rule was
 * "has a flight number, OR the pickup says airport", which gave the 60-minute airport
 * courtesy wait to every Business → airport DEPARTURE — the flight number there describes the
 * flight the Guest is catching, not one they have landed from. Measured on the live data at
 * the time: 52 of the 89 trips carrying a flight number were departures, so a Driver waited
 * 40 extra minutes unpaid at a Business's door, and the meter's ceiling was doubled with it.
 *
 * The flight number still has to count for something: an arrival's pickup address is often
 * "Terminal 2, 06200 Nice" with no airport word in it at all. So the order is:
 *   1. the pickup itself says airport  → airport (an arrival)
 *   2. the DROP-OFF says airport and the pickup does not → a departure, city wait
 *   3. a flight number and neither end named → an arrival with an unlabelled terminal
 */
export function isAirportPickup(
  m: Pick<MissionRow, "flight_number" | "pickup_address"> & {
    pickup_label?: string | null;
    dropoff_address?: string | null;
    dropoff_label?: string | null;
  },
): boolean {
  if (AIRPORT_RE.test(`${m.pickup_address ?? ""} ${m.pickup_label ?? ""}`)) return true;
  if (AIRPORT_RE.test(`${m.dropoff_address ?? ""} ${m.dropoff_label ?? ""}`)) return false;
  return !!m.flight_number;
}

// The COURTESY WAIT (minutes) — free, charged to nobody: airport 60, city 20.
export function noShowWaitMinutes(isAirport: boolean): number {
  return isAirport ? 60 : 20;
}

// D48 — after the courtesy wait, the Business is charged per minute STARTED and the Driver
// is paid it. The meter stops at the ceiling (total from clock start), so the PAID stretch
// is 40 min city / 60 min airport. Settled rows pin their own rate in mission.waiting_rate,
// so changing these numbers never re-prices a trip that has already run.
//
// ⚑ PER SERVICE CLASS since S62 (docs/06 §10), replacing a flat 1,00 €. The founder's
// objection to the flat rate was that it is punishing on a 40 € trip and trivial on a 500 €
// one. The market answer is NOT to scale with the fare — no operator anywhere does — but to
// tier by vehicle class, which is the same lever, because a 40 € trip is an Eco job and a
// 500 € trip is a First one. Calibrated against the French regulated taxi tariff
// (0,58 €/min in the Alpes-Maritimes, 0,70 national ceiling) and FREE NOW, which charges
// exactly 0,50 and 0,75.
//
// ⚑ THESE ARE COURSE-SIDE NUMBERS AND MUST STAY CLEAN CENTS. `mission.waiting_rate` is
// numeric(10,2), so the Business-facing figure cannot be the round one: showing "0,50 €/min"
// to a Business would mean storing 0,43, which displays 0,49 and bills 9,89 € for twenty
// minutes. Stored this way it is exact at every duration — 20 min → 10,00 course · 11,50 to
// the Business · 8,80 to the Driver.
//
// ⚑ MIRRORED IN SQL `mission_waiting()` (docs/migrations/2026-08-18_waiting_rate_by_class.sql).
// Change one, change the other — the display and the charge are two copies on purpose.
// ⚠️ STILL PROVISIONAL until the founder signs the numbers off.
export const WAITING_RATE_PER_MIN: Record<VehicleCategory, number> = {
  eco: 0.5,
  business: 0.75,
  // Vestigial — the taxonomy moved body type onto `required_body_type` and `van` as a
  // CLASS should not occur (BACKLOG § X retires it). Priced with Business so an unexpected
  // row is never charged nothing.
  van: 0.75,
  // First. The enum keeps the old name until § X renames it.
  luxury: 1,
};

/** The rate in force for a mission's class. Never returns 0 — see the note above. */
export function waitingRatePerMin(category: VehicleCategory | null | undefined): number {
  return (category && WAITING_RATE_PER_MIN[category]) || WAITING_RATE_PER_MIN.business;
}

// Total minutes from clock start at which the METER stops. It does NOT end the trip —
// past this the Driver simply stops earning. Mirrors v_ceiling in mission_waiting().
export function waitingCeilingMinutes(isAirport: boolean): number {
  return isAirport ? 120 : 60;
}

export type Waiting = {
  /** When the paid meter starts = guest due + courtesy wait. */
  from: Date;
  /** When it stops paying = guest due + ceiling. */
  until: Date;
  /** Minutes STARTED so far, already clamped by the ceiling. */
  minutes: number;
  /** minutes * rate, in euros. */
  fee: number;
  /** True once the ceiling is reached — the meter is frozen. */
  capped: boolean;
  /** The most this trip can ever accrue. */
  maxFee: number;
};

// What the Business owes for waiting on this mission at `at`. MIRRORS the SQL helper
// mission_waiting() — keep the two in step; it is the single definition all three
// settlement paths (mark_no_show, business_declare_no_show, business_cancel_mission) use.
export function waitingAt(
  m: Pick<MissionRow, "pickup_at" | "flight_number" | "pickup_address" | "category"> & {
    guest_ready_at?: string | null;
    pickup_label?: string | null;
  },
  at: Date | number = Date.now(),
): Waiting {
  const airport = isAirportPickup(m);
  const due = guestDueAt(m).getTime();
  const from = due + noShowWaitMinutes(airport) * 60_000;
  const until = due + waitingCeilingMinutes(airport) * 60_000;
  const now = typeof at === "number" ? at : at.getTime();
  const rate = waitingRatePerMin(m.category);
  const { minutes, fee } = waitingBetween(from, until, now, rate);
  const maxMinutes = Math.round((until - from) / 60_000);
  return {
    from: new Date(from),
    until: new Date(until),
    minutes,
    fee,
    capped: now >= until,
    maxFee: round2(maxMinutes * rate),
  };
}

/**
 * The meter between its two endpoints — the clock-free core of `waitingAt`.
 *
 * A client that holds only the two instants (the Business's waiting panel, the Driver's
 * no-show meter, and now the cancel modal) needs the running total without re-deriving the
 * airport predicate or the courtesy wait. Before this existed each screen re-typed
 * `ceil((min(now, until) - from) / 60000)` by hand, which is three chances to disagree with
 * `mission_waiting()` in SQL rather than one.
 *
 * "Per minute STARTED": minute 1 is owed the instant the courtesy wait lapses.
 *
 * ⚑ `ratePerMin` is REQUIRED, not defaulted. It became per-class in S62, and a default here
 * would let a screen quietly bill the wrong class rather than fail to compile.
 */
export function waitingBetween(
  fromMs: number,
  untilMs: number,
  at: number,
  ratePerMin: number,
): { minutes: number; fee: number } {
  const minutes = Math.max(0, Math.ceil((Math.min(at, untilMs) - fromMs) / 60_000));
  // Cents, not floats: 3 × 0,75 is 2.2500000000000004 before rounding.
  return { minutes, fee: round2(minutes * ratePerMin) };
}

// On-site floor: a Driver who turns up AFTER the courtesy wait already closed still has to be
// present for a few minutes before filing. Never binds for an on-time Driver. Mirrors
// v_floor in mark_no_show().
export const NO_SHOW_ON_SITE_FLOOR_MIN = 5;

// When the Guest was due to be available — the ordered pickup time, or a tracked
// landing-derived instant (guest_ready_at) once flight tracking lands. This is the origin
// of the courtesy wait: it belongs to the GUEST, never to the Driver's "I've arrived" tap.
export function guestDueAt(
  m: Pick<MissionRow, "pickup_at"> & { guest_ready_at?: string | null },
): Date {
  return new Date(m.guest_ready_at ?? m.pickup_at);
}

// When the no-show report unlocks: the courtesy wait measured from the Guest's due moment,
// but never before the Driver has been on site for the floor. MIRRORS mark_no_show().
export function noShowAvailableAt(
  m: Pick<MissionRow, "pickup_at" | "flight_number" | "pickup_address"> & {
    guest_ready_at?: string | null;
  },
  arrivedAtIso: string,
): Date {
  const windowEnds =
    guestDueAt(m).getTime() + noShowWaitMinutes(isAirportPickup(m)) * 60_000;
  const floorEnds =
    new Date(arrivedAtIso).getTime() + NO_SHOW_ON_SITE_FLOOR_MIN * 60_000;
  return new Date(Math.max(windowEnds, floorEnds));
}

// The fee ramp moves in HALF-HOUR STEPS, not continuously (founder, 2026-08-09).
//
// It used to be a slope: pct = 50 + 10 × (5 − hours), recomputed off the clock, so it rose
// every second. Two things were wrong with that. The number a Business was QUOTED was never
// the number it was CHARGED — the modal reads the client clock, the RPC reads the server
// clock at execution, and on a €480 trip thirty seconds of hesitation cost 41 cents more
// than the screen said. And a slope cannot be explained: "cancel before 14:30 and it's 60%"
// fits on a card, "the fee rises at ten points an hour" does not.
//
// A step fixes both. Inside a tread the fee is CONSTANT, so quote == charge, and the rule is
// something a receptionist can plan around. The cost is a cliff at each boundary — 5 points,
// so €24 on a €480 trip — which is why the modal must show the next raise and count down to
// it (components/dispatch-cancel.tsx). A deadline you can see is not a trap.
export const CANCEL_STEP_HOURS = 0.5;

// Where the ramp starts biting, and the pct at that moment.
const CANCEL_RAMP_HOURS = 5;
const CANCEL_RAMP_START_PCT = 50;
const CANCEL_PCT_PER_HOUR = 10;

/** Hours-to-pickup rounded UP to the top of its half-hour tread — the Business's favour. */
function treadTop(hoursToPickup: number): number {
  return Math.ceil(hoursToPickup / CANCEL_STEP_HOURS) * CANCEL_STEP_HOURS;
}

// Business-cancel fee %, by hours-to-pickup. FREE while still pooled (no Driver
// committed). Once a Driver holds it: free >5h; 50% at −5h; then +5 points every half hour
// → 100% at pickup. Rounding is in the BUSINESS's favour: the cheaper rate holds until the
// boundary is actually crossed, so 50% runs all the way to T−4h30, not to T−4h59.
// Mirrors business_cancel_mission() — see docs/migrations/2026-08-09_cancel_fee_30min_steps.sql.
export function businessCancelPct(hoursToPickup: number, hasDriver: boolean): number {
  if (!hasDriver) return 0;
  if (hoursToPickup > CANCEL_RAMP_HOURS) return 0;
  if (hoursToPickup < 0) return 100;
  const pct = CANCEL_RAMP_START_PCT + CANCEL_PCT_PER_HOUR * (CANCEL_RAMP_HOURS - treadTop(hoursToPickup));
  return Math.min(100, Math.max(CANCEL_RAMP_START_PCT, pct));
}

/**
 * The euro fee for a given fare and pct — rounded EXACTLY the way Postgres rounds it.
 *
 * ⚑ This exists because the half-hour step created a bug that the slope had hidden. SQL
 * computes `round(fare * pct / 100, 2)` in exact decimal numeric, rounding halves AWAY FROM
 * ZERO. The modal computed the same thing in float64 as `Math.round(fare * pct / 100 * 100)
 * / 100`. Those agree until the true answer lands on an exact half-cent — and then float
 * loses, because a value like 81.225 is stored as 81.2249999999999943 and rounds DOWN.
 *
 * While the ramp was a slope, pct was an arbitrary long decimal (95.0062…) and an exact
 * half-cent essentially never occurred — a 5-million-pair sweep on 2026-08-09 found zero.
 * The step made pct a multiple of 5, and ties became routine: at 95 %, every fare whose
 * cents are ≡ 10 (mod 20) ties, which is one fare in twenty. Caught live by the § H2 write
 * test on a 85,50 € trip — SQL stored 81,23 €, the modal said 81,22 €.
 *
 * Working in integer cents removes the float entirely: `fare * 100` is rounded to cents
 * first (so an inexact literal like 47.99 is pinned), the multiply by an integer pct is
 * exact, and the `/ 100` lands on a value with at most one binary-exact decimal place.
 */
export function cancelFeeAmount(fare: number, pct: number): number {
  const cents = Math.round(Math.round(fare * 100) * pct) / 100;
  return Math.round(cents) / 100;
}

/**
 * The next time this trip gets more expensive to cancel, and what it becomes — so the modal
 * can show a deadline instead of a number that silently jumps.
 *
 * Returns hours-to-pickup AT the raise (count down to `pickup_at` minus that), and the pct
 * on the far side. `null` once there is nothing left to rise to.
 */
export function nextCancelRaise(
  hoursToPickup: number,
  hasDriver: boolean,
): { atHoursToPickup: number; pct: number } | null {
  if (!hasDriver) return null;
  // Still free: the next event is the ramp switching on at T−5h, and it starts at 50%.
  if (hoursToPickup > CANCEL_RAMP_HOURS) {
    return { atHoursToPickup: CANCEL_RAMP_HOURS, pct: CANCEL_RAMP_START_PCT };
  }
  // Already at the ceiling — nothing above 100%.
  if (businessCancelPct(hoursToPickup, true) >= 100) return null;
  const at = treadTop(hoursToPickup) - CANCEL_STEP_HOURS;
  return { atHoursToPickup: at, pct: businessCancelPct(Math.max(0, at), true) };
}

// What a Driver is owed on a trip that ended cancelled: the policy fee (50–100% of
// the fare at the time) PLUS any waiting already accrued — business_cancel_mission
// settles both onto the mission row, so this is the stored truth, not a re-derivation.
//
// A Driver only ever SEES a cancelled trip that the Business cancelled: every other
// path (driver cancel · agreed release · T-60 reclaim) re-pools the mission and clears
// driver_id, so it leaves their app instead of ending terminal.
//
// null on a legacy row stamped before 2026-07-13 — show nothing rather than a wrong
// number. PostgREST returns `numeric` as a STRING, hence the coercion.
export function cancelCompensation(m: MissionRow): number | null {
  if (m.status !== "cancelled" || m.cancellation_fee == null) return null;
  return Number(m.cancellation_fee) + Number(m.waiting_fee ?? 0);
}
