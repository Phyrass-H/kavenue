-- 2026-09-18 (d) — mission_read carries pdp_step_count (S83, [[d147]]). Paste straight after 18c.
--
-- ⚑ WHY. `mission_read` is an explicit column list, and every Business screen reads the price
--   through it. lib/pdp.ts now uses pdp_step_count when set; a screen that cannot see it would
--   draw the old staircase for a trip whose Ceiling was raised — the very dip 18c exists to stop.
--
-- ⚑ THE BODY IS 2026-09-18a's VIEW, EXTRACTED PROGRAMMATICALLY from commit e1b78ac, not retyped
--   (the S74 lesson: two files carrying one view is how a mask gets undone). The ONLY change is
--   the one column appended LAST — `create or replace view` may add columns only at the end, and
--   it keeps the grants. .local/probe/pooled-trip-changes/run.sh diffs this body against 18a's and
--   fails on any other difference. From now on THIS file is the newest full rebuild.
-- ⚑ security_invoker stays FALSE (D145 rule 2).
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor after 18a, 18b and 18c.

begin;

-- ⚑ The paste order, ENFORCED: this is 18a's view plus one column, so 18a must already be in
--   (or it would half-apply here and fail later), and 18c must be (the column lives there).
do $$
begin
  if to_regprocedure('public.mission_guard_board_file()') is null then
    raise exception 'Paste 2026-09-18a first, then 18b, 18c, and only then this file (18d).';
  end if;
  if to_regprocedure('public.raise_ceiling(uuid, numeric)') is null then
    raise exception 'Paste 2026-09-18c_pooled_trip_changes.sql first, then this file (18d).';
  end if;
end $$;

create or replace view public.mission_read
with (security_invoker = false, security_barrier = true) as
select
  m.id,
  m.business_id,
  -- ⚑ S83 · the posting Dispatcher is the Business's affair until a Driver holds the trip
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.dispatcher_id end as dispatcher_id,
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
  -- ⚑ S83 · who the Guest is: only to the Driver who holds the trip
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.passenger_name end as passenger_name,
  m.pax_count,
  m.luggage_count,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.comment end as comment,

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
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.passenger_names end as passenger_names,
  m.required_languages,
  m.dress_code,
  m.driver_flags,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.board_name end as board_name,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.board_file_path end as board_file_path,
  -- free text from the Business to its Driver — it can name the Guest; shown after accept only
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.driver_message end as driver_message,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.reference end as reference,
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
  m.vehicle_plate,
  m.vehicle_make,
  m.vehicle_model,
  m.vehicle_colour,
  m.vehicle_body_type,
  m.vehicle_seats,
  m.vehicle_energy,
  m.vehicle_first_registration_date,

  -- ── § 7, the hold. The INSTANT, never the identity ───────────────────────
  case when m.hold_expires_at > now() then m.hold_expires_at end as hold_expires_at,

  -- ── S83 · the frozen step count (2026-09-18c). A Business number, masked exactly like
  --    the Ceiling: a Driver who knows it knows the Ceiling to within ~€2 (gap ÷ 2). ──
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.pdp_step_count end as pdp_step_count
from public.mission m
where (select app_role()) = 'admin'
   or m.business_id = (select current_business_id())
   or m.driver_id   = (select current_driver_id())
   -- ⚑ S83 · the Pool, to a Driver whose car may work — working_car()'s own test, written out:
   --   a view reads TABLES as its owner but calls FUNCTIONS as the caller, and working_car is
   --   (rightly) not callable by a browser. Measured: calling it here was a 42501 on every read.
   or ((select app_role()) = 'driver' and m.status = 'pooled'
       and exists (select 1 from public.vehicle v
                    where v.driver_id = (select current_driver_id())
                      and v.approval_status = 'approved'
                      and v.retired_at is null));

-- the view keeps exactly SELECT for signed-in sessions (create or replace kept it; stated in full)
revoke all on public.mission_read from public, anon;
revoke insert, update, delete, truncate on public.mission_read from authenticated;
grant select on public.mission_read to authenticated;

commit;

notify pgrst, 'reload schema';
