-- 2026-08-31 — the guest_ready_at revoke, made real.
--
-- `2026-07-19_no_show_airport_label.sql` protected this column two ways: a
-- `revoke update (guest_ready_at)` and the guard trigger that raises
-- *"guest_ready_at is set by the flight-tracking feed, not by a client"*.
--
-- ⚑ ONLY THE TRIGGER WAS EVER DOING ANYTHING. The revoke is the same no-op that
--   parts 3 and 4 fixed on `mission` and `commission_rate`: a column-level
--   revoke against the table-wide grant Supabase ships. Not a syntax error, not
--   a warning — it succeeds and does nothing.
--
-- ⚑ AND HERE IS HOW THAT WAS PROVED, RATHER THAN INFERRED. Postgres checks
--   column privileges BEFORE any row trigger fires. A Dispatcher session PATCHing
--   `guest_ready_at` came back with the TRIGGER's message, not
--   "permission denied" — so the privilege check had already let it through.
--   The order of those two checks is the whole evidence.
--
-- The column is still protected, and was never unprotected: the trigger blocks
-- every client write on its own. What this restores is the second lock the July
-- file believed it had. A trigger is code and can be edited or bypassed by a
-- future definer function; a privilege is enforced by the engine.
--
-- The original's intent, in its own words: *"a Business could PATCH it forward
-- via PostgREST and hold the no-show gate shut indefinitely, leaving the Driver
-- only the 100%-fee cancel."*
--
-- ⚑ `anon` IS NOT TOUCHED — it holds no UPDATE policy on `mission`, so RLS gives
--   it nothing to write in the first place.
-- ⚑ A NEW COLUMN ON `mission` IS NOT WRITABLE UNTIL IT IS ADDED BELOW. Same trap
--   as the read grant in part 3; the probe checks both lists against the table.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.

revoke update on public.mission from authenticated;

grant update (
  id, business_id, dispatcher_id, driver_id, status, mission_type, group_id, category, zone,
  pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  waypoints, pickup_at, flight_number, flight_eta, passenger_name, pax_count, luggage_count,
  comment, base_fare, ceiling, pdp_start, pdp_step, pdp_interval, speed_win, cancelled_by,
  cancelled_at, created_at, accepted_at, confirmed_at, required_body_type, required_make,
  required_model, distance_km, duration_min, passenger_names, required_languages, dress_code,
  driver_flags, board_name, board_file_path, driver_message, reference, pickup_label,
  dropoff_label, stops_reached, luggage_only, info_edited_at, cancellation_fee,
  cancellation_reason, pooled_at, no_show, no_show_at, waiting_from, waiting_to,
  waiting_minutes, waiting_rate, waiting_fee, no_show_by, checked_in_at, close_answer,
  close_answered_at, rate_card_id, night_applied, commission_business_rate,
  commission_driver_rate, commission_vat_rate, transport_vat_rate, accepted_fare, vehicle_id
) on public.mission to authenticated;

-- sanity — as a DISPATCHER session, on one of your own trips:
--   update mission set guest_ready_at = now() where id = '<one of yours>';
-- → must now say "permission denied", NOT the trigger's sentence.
