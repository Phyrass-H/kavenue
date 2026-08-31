-- 2026-08-31 — MONEY COLUMN WALLS, part 3: the revoke that did nothing.
--
-- ⚑ PART 2 RAN CLEAN AND CHANGED NOTHING ON `mission`. Its two policy halves —
--   the ledger, the commission card, the price card — all took effect and were
--   watched closing. Its five `revoke select (column) on mission` statements
--   returned success and had **no effect whatsoever**:
--
--     after part 2:  business → mission.commission_driver_rate  = 0.1   ← still
--                    driver   → mission.ceiling on a POOLED trip = 100  ← still
--
-- ── WHY, AND IT IS THE WHOLE LESSON ─────────────────────────────────────────
-- In Postgres a TABLE-level `grant select on t` and a COLUMN-level
-- `grant select (c) on t` are **two separate privileges**. Supabase ships
-- `grant all on all tables in schema public to authenticated`, so `authenticated`
-- holds the table-wide one — and revoking a column-level grant it was never
-- given is a no-op. Not an error. Not a warning. `REVOKE` succeeds.
--
-- ⚑ SO THE ONLY WAY TO WALL A COLUMN IS TO TAKE THE TABLE GRANT AWAY AND HAND
--   BACK THE COLUMNS YOU MEAN. That is what this file does: one revoke, then an
--   explicit list of the 70 columns `authenticated` keeps. The five it does not
--   name are the wall.
--
-- ⚑ AND THE REASON THIS WAS CAUGHT AT ALL. The migration was correct-looking
--   SQL that ran without complaint, on a database that then behaved exactly as
--   before. Nothing but re-running `.local/probe/column-leak.mts` and reading
--   the lines would have found it. The S71 rule, in its purest form: **a change
--   nobody watched fail is not evidence.** Part 2's own "sanity" comment told
--   the reader to check by hand and would have caught it too — had it not been
--   a comment.
--
-- ── ORDER + BLAST RADIUS ────────────────────────────────────────────────────
-- Part 1 (the view) and part 2 (the policies) are already in. This is safe to
-- run NOW: `main` = e48783f is deployed, and no browser-session read of
-- `mission` names a walled column — `handoff-check` asserts it over all 184
-- source files, and it was watched going red on a reintroduced one.
--
-- INSERT and UPDATE are untouched. `anon` is deliberately left alone: RLS gives
-- it no rows on `mission` at all, so it is not a way round this.
--
-- ⚑ A NEW COLUMN ON `mission` IS INVISIBLE TO `authenticated` UNTIL IT IS ADDED
--   BELOW — the same trap `mission_read`'s explicit column list carries, now in
--   two places. The probe's drift check covers the view; this list is checked by
--   the same run, because a column nobody can read makes a screen go blank.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.

revoke select on public.mission from authenticated;

grant select (
  id, business_id, dispatcher_id, driver_id, status, mission_type, group_id, category, zone,
  pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  waypoints, pickup_at, flight_number, flight_eta, passenger_name, pax_count, luggage_count,
  comment, pdp_step, pdp_interval, speed_win, cancelled_by, cancelled_at, created_at,
  accepted_at, confirmed_at, required_body_type, required_make, required_model, distance_km,
  duration_min, passenger_names, required_languages, dress_code, driver_flags, board_name,
  board_file_path, driver_message, reference, pickup_label, dropoff_label, stops_reached,
  luggage_only, info_edited_at, cancellation_fee, cancellation_reason, pooled_at, no_show,
  no_show_at, guest_ready_at, waiting_from, waiting_to, waiting_minutes, waiting_rate,
  waiting_fee, no_show_by, checked_in_at, close_answer, close_answered_at, rate_card_id,
  night_applied, commission_vat_rate, transport_vat_rate, accepted_fare, vehicle_id
) on public.mission to authenticated;

-- sanity, after running — as a DISPATCHER session, this must ERROR
-- ("permission denied for table mission"):
--     select ceiling from mission limit 1;
-- ...and this must still return a row:
--     select ceiling, commission_business_rate from mission_read limit 1;
--
-- Or just run the probe, which is the same question asked 20 ways:
--     npx tsx .local/probe/column-leak.mts        → expect 1 LEAK OPEN (the RPCs)
