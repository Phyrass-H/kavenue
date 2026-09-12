-- 2026-09-12 · M1b of 6 — THE VIEW LEARNS THE EIGHT NEW COLUMNS. Paste straight after M1.
--
-- ⚑⚑ WHY THIS FILE EXISTS, AND IT IS NOT OPTIONAL. `mission_read` is a view with an explicit
-- 77-column list, and every screen that shows a car reads the VIEW, never the table. M1 added
-- eight columns to `mission`; without this rebuild they are invisible to the app — every car
-- would silently read "not recorded", and the Waybill, which names them in its select, would
-- get 42703 and 404 on every trip. `2026-08-30_money_column_walls_1_view.sql` warns about this
-- in its own header; S71 lost time to the same thing with `hold_expires_at`.
--
-- ⚑ THE BODY IS THE 2026-09-04 VIEW, EXTRACTED PROGRAMMATICALLY, not retyped — a 77-column
-- list is precisely what a human miscopies. It keeps the masked `hold_expires_at` (a finished
-- hold must not read as a live one, S72) and every money-column wall. The ONLY change is the
-- eight lines added after `m.vehicle_id`.
-- ⚑ AND 2026-09-04_standard_vat_rate.sql IS NO LONGER THE AUTHORITATIVE REBUILD — this file
-- is. Two files carrying one view is how S74 nearly un-masked the hold; re-running the older
-- one now drops the eight columns again. handoff-check asserts THIS file is the newest.
--
-- Applied by the founder in the Supabase SQL editor. Safe to re-run.

begin;

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
  m.standard_vat_rate,

  m.accepted_fare,
  m.vehicle_id,

  -- ── S78 · the car AS IT WAS, frozen onto the trip when it changed hands ───
  -- ⚑ WITHOUT THESE THE VIEW IS THE WHOLE FEATURE'S BLIND SPOT. `mission_read` is an
  --    explicit column list, and every screen that shows a car — the Waybill, the
  --    Business's schedule, its history, both CSV exports — reads the view, not the
  --    table. A column added to `mission` and not to this list is invisible: the
  --    Waybill NAMES them, so it would 42703 and the page would 404 on every trip.
  --    Exactly the trap S71 hit with `hold_expires_at`.
  -- ⚑ NOTHING PRIVATE LEAKS. These are NULL until a trip has a Driver, and a Driver
  --    browsing the Pool only ever sees rows with no Driver on them.
  m.vehicle_plate,
  m.vehicle_make,
  m.vehicle_model,
  m.vehicle_colour,
  m.vehicle_body_type,
  m.vehicle_seats,
  m.vehicle_energy,
  m.vehicle_first_registration_date,

  -- ── § 7, the hold. The INSTANT, never the identity ───────────────────────
  -- Another Driver needs one fact: is this trip frozen right now, and until when.
  -- ⚑ WHO holds it is deliberately absent. "Marc is looking at this" is exactly the
  --    Pool behaviour [[d87]] cut, and it would leak a named contractor's activity to
  --    every other Driver in the region.
  -- ⚑ AND A PAST INSTANT READS AS NULL. Nothing runs at T+15 s, so the base column keeps
  --    a stale value until the sweep settles it. Masking it here means no reader can
  --    mistake a finished hold for a live one, even one that forgets to check the clock.
  case when m.hold_expires_at > now() then m.hold_expires_at end as hold_expires_at
from public.mission m
where (select app_role()) = 'admin'
   or m.business_id = (select current_business_id())
   or m.driver_id   = (select current_driver_id())
   or ((select app_role()) = 'driver' and m.status = 'pooled');
revoke all on public.mission_read from public;
grant select on public.mission_read to authenticated;
commit;

notify pgrst, 'reload schema';

-- ⚑ AFTER RUNNING THIS:
--     npx tsx .local/probe/standard-rate.mts        -- the money walls still stand
--     node --experimental-strip-types .local/probe/handoff-check.ts
