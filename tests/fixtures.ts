// Test fixtures — a real MissionRow, built by hand.
//
// Deliberately typed as MissionRow (not a loose object): `npm run typecheck`
// covers tests/, so the day a money-critical column is added to the schema the
// fixture stops compiling and the tests have to acknowledge it. A `Partial<>`
// spread over `any` would have let the suite drift away from the table it claims
// to test.
import { historyFare, type HistoryRow } from "@/lib/history-filter";
import type { MissionRow } from "@/lib/database.types";

/**
 * A neutral mission: posted at 10:00, pickup at 12:00 (Paris, summer = UTC+2),
 * ceiling 100, no curve. Every test overrides only what it is about.
 *
 * The ISO strings carry an explicit +02:00 offset rather than a `Z`, so a
 * "12:00 pickup" in a test reads as noon in Paris — the timezone every bucket in
 * this app is computed in.
 */
export function mission(over: Partial<MissionRow> = {}): MissionRow {
  return {
    id: "m-1",
    business_id: "b-1",
    dispatcher_id: "d-1",
    driver_id: null,
    status: "pooled",
    mission_type: "transfer",
    group_id: null,
    category: "business",
    zone: "nice",
    pickup_address: "58 Boulevard des Moulins, 06000 Nice, France",
    pickup_lat: 43.7,
    pickup_lng: 7.26,
    dropoff_address: "1 Promenade des Anglais, 06000 Nice, France",
    dropoff_lat: 43.69,
    dropoff_lng: 7.25,
    pickup_label: null,
    dropoff_label: null,
    waypoints: null,
    stops_reached: 0,
    pickup_at: "2026-07-15T12:00:00+02:00",
    flight_number: null,
    flight_eta: null,
    guest_ready_at: null,
    passenger_name: null,
    passenger_names: null,
    pax_count: 2,
    luggage_count: 1,
    luggage_only: false,
    comment: null,
    reference: null,
    base_fare: 50,
    ceiling: 100,
    pdp_start: null,
    pdp_step: null,
    pdp_interval: null,
    speed_win: false,
    required_body_type: "sedan",
    required_make: null,
    required_model: null,
    required_languages: null,
    dress_code: null,
    driver_flags: null,
    board_name: null,
    board_file_path: null,
    driver_message: null,
    distance_km: 12,
    duration_min: 25,
    rate_card_id: null,
    night_applied: false,
    // Priced before commission existed, like the 271 rows live today: both
    // parties see the fare itself and no fee is charged. A test about commission
    // sets the rates it needs.
    commission_business_rate: null,
    commission_driver_rate: null,
    commission_vat_rate: null,
    transport_vat_rate: null,
    cancelled_by: null,
    cancelled_at: null,
    created_at: "2026-07-15T10:00:00+02:00",
    accepted_at: null,
    accepted_fare: null,
    confirmed_at: null,
    checked_in_at: null,
    close_answer: null,
    close_answered_at: null,
    info_edited_at: null,
    cancellation_fee: null,
    cancellation_reason: null,
    pooled_at: null,
    no_show: false,
    no_show_at: null,
    no_show_by: null,
    waiting_from: null,
    waiting_to: null,
    waiting_minutes: null,
    waiting_rate: null,
    waiting_fee: null,
    vehicle_id: null,
    hold_expires_at: null,
    ...over,
  };
}

/**
 * A standard (non-SPEED-WIN) §6 curve: opens at the trip's FLOOR — 60 € on the
 * default 100 € Ceiling — and climbs to the Ceiling by T−5h. Mirrors what
 * dispatch/new/actions.ts writes: the floor in `pdp_start`, and nothing else.
 *
 * `pdp_step` / `pdp_interval` are dead columns as of the §6 curve. They are
 * written null here for the same reason the app writes them null — so nothing
 * can quietly read a fixed-step ladder that no longer exists.
 */
export function standardCurve(ceiling = 100, floor = ceiling * 0.6) {
  return {
    ceiling,
    pdp_start: floor,
    pdp_step: null,
    pdp_interval: null,
    speed_win: false,
  } satisfies Partial<MissionRow>;
}

/**
 * A SPEED WIN curve: the same shape, opening at 70 % of the Ceiling instead of
 * at the floor. The 70 % is DERIVED from `speed_win` on read — the stored
 * `pdp_start` is still the floor, which is what lets a re-pool flip SPEED WIN on
 * and off without ever losing it.
 */
export function speedWinCurve(ceiling = 100, floor = ceiling * 0.6) {
  return {
    ceiling,
    pdp_start: floor,
    pdp_step: null,
    pdp_interval: null,
    speed_win: true,
  } satisfies Partial<MissionRow>;
}

/**
 * A completed trip — the shape every archive read sees. `settledFare` on this is
 * what the Business owes and what the Driver is paid.
 *
 * ⚑ TAKEN THE INSTANT IT WAS POSTED, so its settled fare is the opening price,
 * exactly 60,00 €. That is deliberate: every test downstream of here (Spend,
 * Earnings, History) is about what happens TO a fare, not about how the curve
 * produced it. Pinning it at the opening keeps those tests free of the curve's
 * jitter — the curve itself is tested in tests/pdp.test.ts, where it belongs.
 */
export function completed(over: Partial<MissionRow> = {}): MissionRow {
  return mission({
    status: "completed",
    driver_id: "drv-1",
    ...standardCurve(),
    accepted_at: "2026-07-15T10:00:00+02:00", // = created_at → the opening price, 60
    confirmed_at: "2026-07-15T10:20:00+02:00",
    ...over,
  });
}

/**
 * Wrap a mission the way the page does — `fare`/`counted` come from the real
 * `historyFare`, not from the test, so a row built here is the row the page
 * builds. Override them explicitly only when a test is about a malformed row.
 */
export function row(m: MissionRow, over: Partial<HistoryRow> = {}): HistoryRow {
  const { fare, counted } = historyFare(m);
  return {
    mission: m,
    driverId: m.driver_id,
    driverName: m.driver_id ? "Marc Dubois" : null,
    car: null,
    fare,
    counted,
    ...over,
  };
}
