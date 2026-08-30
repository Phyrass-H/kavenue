-- 2026-08-30 — MONEY COLUMN WALLS, part 1 of 2: the redacting read view.
--
-- ⚑ RUN THIS ONE FIRST, AND ON ITS OWN. It is purely ADDITIVE — it creates a
--   view and grants SELECT on it. Nothing is revoked here, no policy changes,
--   and the app keeps working identically whether or not it has been run.
--   Part 2 (`..._2_close.sql`) is what actually shuts the doors, and it must
--   NOT be run until the app half is deployed. Order matters: part 2 without
--   the app half turns every `select("*")` on `mission` into a 403.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- docs/06 §3 ends with a design rule: "The Business never sees driver_net or
-- the Driver-side rate." Until today that sentence was enforced by nothing but
-- which columns the UI chose to render. RLS on `mission` is ROW-level; a
-- signed-in Dispatcher could ask PostgREST for `commission_driver_rate` on its
-- own trips and get 0,10 back, which with `accepted_fare` (shown to them as
-- "Transport") is Kavenue's full 22,5 % take in one subtraction. Watched
-- happening, live, on 2026-08-30: `.local/probe/column-leak.mts`.
--
-- The mirror leak runs the other way: `p_mission_driver_read` lets a Driver
-- read ANY pooled mission, and that includes `ceiling` — the Business's
-- maximum, on a trip the Driver has not accepted. docs/06 §6 publishes the rule
-- that the curve tops out at T−5h. A Driver who also knows the LEVEL knows
-- exactly what waiting is worth, which is the one strategy the jitter exists to
-- prevent.
--
-- ── WHY A VIEW AND NOT A COLUMN REVOKE ──────────────────────────────────────
-- ⚑ THE THING THAT DECIDES THE WHOLE DESIGN: a Driver and a Dispatcher are the
--   SAME Postgres role, `authenticated`. Column privileges are per ROLE. So
--   `revoke select (ceiling)` hides the column from BOTH audiences, and every
--   one of these leaks is asymmetric — the Business legitimately needs the
--   Ceiling, the Driver legitimately needs its own commission rate. A column
--   ACL cannot express any of them. The precedent in this repo,
--   `revoke update (guest_ready_at)` (2026-07-19_no_show_airport_label.sql), is
--   a rule that applies to EVERYONE, which is exactly when a column ACL fits.
--
-- So: one view, `security_invoker = false`, therefore reading `mission` with the
-- OWNER's privileges (which survive part 2's revoke) and with the row predicate
-- restated in its own WHERE — the union of `p_mission_driver_read` and
-- `p_mission_business_read`, unchanged. `security_barrier` keeps that predicate
-- ahead of any function a caller pushes into a filter.
--
-- ── WHAT IS MASKED, AND TO WHOM ─────────────────────────────────────────────
--   commission_driver_rate     → driver + admin        (never the Business)
--   commission_business_rate   → business + admin      (never the Driver)
--   ceiling · pdp_start · base_fare
--                              → everyone EXCEPT a Driver looking at a trip
--                                they do not hold. A Driver still sees the
--                                Ceiling on their OWN missions, because
--                                `settledFare()` falls back to `currentFare()`
--                                on pre-`accepted_fare` rows and would
--                                otherwise print nothing on old trips.
--
-- ⚑ AND THE CONSEQUENCE THAT COST THE DESIGN AN ARGUMENT: with the Ceiling
--   masked, the Pool card CANNOT compute its own price. `currentFare()` climbs
--   TO the ceiling and lives only in TypeScript (lib/pdp.ts is deliberately
--   "the SINGLE place fare is computed"). So the app half computes pool fares
--   SERVER-SIDE, keyed by the ids the Driver's own session already returned
--   through this view — RLS stays the gate, the ceiling never reaches the
--   browser or the Driver's token. See lib/pool-fares.ts.
--
-- ⚑ THE TRAP THIS VIEW CREATES. Its column list is EXPLICIT, so a column added
--   to `mission` later does NOT appear here, and a screen reading it through
--   `mission_read` will silently get `undefined`. `.local/probe/column-leak.mts`
--   asserts the two column sets match; when it says a column is missing, add it
--   to this file.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.

drop view if exists public.mission_read;

create view public.mission_read
with (security_invoker = false, security_barrier = true) as
select
  m.id,
  m.business_id,
  m.dispatcher_id,
  m.driver_id,
  m.status,
  m.mission_type,
  m.group_id,
  m.category,
  m.zone,
  m.pickup_address,
  m.pickup_lat,
  m.pickup_lng,
  m.dropoff_address,
  m.dropoff_lat,
  m.dropoff_lng,
  m.waypoints,
  m.pickup_at,
  m.flight_number,
  m.flight_eta,
  m.passenger_name,
  m.pax_count,
  m.luggage_count,
  m.comment,

  -- ── the Business's own numbers. Hidden from a Driver browsing the Pool ────
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.base_fare end   as base_fare,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.ceiling end     as ceiling,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.pdp_start end   as pdp_start,

  m.pdp_step,
  m.pdp_interval,
  m.speed_win,
  m.cancelled_by,
  m.cancelled_at,
  m.created_at,
  m.accepted_at,
  m.confirmed_at,
  m.required_body_type,
  m.required_make,
  m.required_model,
  m.distance_km,
  m.duration_min,
  m.passenger_names,
  m.required_languages,
  m.dress_code,
  m.driver_flags,
  m.board_name,
  m.board_file_path,
  m.driver_message,
  m.reference,
  m.pickup_label,
  m.dropoff_label,
  m.stops_reached,
  m.luggage_only,
  m.info_edited_at,
  m.cancellation_fee,
  m.cancellation_reason,
  m.pooled_at,
  m.no_show,
  m.no_show_at,
  m.guest_ready_at,
  m.waiting_from,
  m.waiting_to,
  m.waiting_minutes,
  m.waiting_rate,
  m.waiting_fee,
  m.no_show_by,
  m.checked_in_at,
  m.close_answer,
  m.close_answered_at,
  m.rate_card_id,
  m.night_applied,

  -- ── the two commission snapshots, each to its own side only (docs/06 §3) ──
  case when (select app_role()) in ('dispatcher', 'admin')
       then m.commission_business_rate end as commission_business_rate,
  case when (select app_role()) in ('driver', 'admin')
       then m.commission_driver_rate   end as commission_driver_rate,
  m.commission_vat_rate,
  m.transport_vat_rate,

  m.accepted_fare,
  m.vehicle_id
from public.mission m
where (select app_role()) = 'admin'
   or m.business_id = (select current_business_id())
   or m.driver_id   = (select current_driver_id())
   or ((select app_role()) = 'driver' and m.status = 'pooled');

comment on view public.mission_read is
  'docs/06 §3 + the §6 auction. The ONLY door onto mission for a browser '
  'session: same rows as p_mission_driver_read + p_mission_business_read, with '
  'each side''s money masked from the other. security_invoker=false on purpose '
  '— the owner''s privileges are what survive the column revokes in '
  '2026-08-30_money_column_walls_2_close.sql. Column list is explicit: a new '
  'column on mission must be added here too.';

revoke all on public.mission_read from public;
grant select on public.mission_read to authenticated;

-- ⚑ NOT GRANTED TO `service_role`, ON PURPOSE. The WHERE above is written in
--   app_role() / current_business_id() / current_driver_id(), and all three are
--   NULL for the service role — so a service-role select here returns ZERO rows
--   rather than an error, which is the most misleading answer a query can give.
--   Server code that legitimately bypasses RLS reads `mission` directly, and
--   keeps its own SELECT privileges through part 2.

-- sanity, after running:
--   select ceiling, commission_business_rate, commission_driver_rate
--     from mission_read limit 5;
