-- 2026-09-18 (a) — A browser session holds only what the app writes. Every other door is shut,
-- and new objects start shut. (S83, [[d146]]) · Paste BEFORE 2026-09-18b.
--
-- ⚑ WHY. D144 and D145 were one shape: Supabase's DEFAULT PRIVILEGES hand `anon` and
--   `authenticated` ALL on every new table and view (and EXECUTE on every new function), so an
--   object is open until someone remembers to close it, and `revoke … from public` closes nothing
--   (CLAUDE.md rule 6). S83 swept every object for that shape on a rebuild of the live schema
--   (.local/probe/rls-audit/) and found more of it. What THIS file closes, each measured on the
--   throw-away Postgres before and after (run.sh):
--
--   § 1 · a signed-out visitor (`anon`) held SELECT, INSERT, UPDATE, DELETE and TRUNCATE on every
--         table — only the row rules (RLS) stood between the public key and the data.
--   § 2 · a signed-in session held INSERT/UPDATE/DELETE/TRUNCATE on 20 tables the app never writes
--         from a browser (the app writes them through the service role or a database function).
--   § 3 · CHANGE REQUESTS. `p_amendment_business_update` was USING-only with a table-wide UPDATE,
--         so a Business could rewrite any column of its own request:
--           · re-point `mission_id` at ANOTHER Business's confirmed trip — that trip's Driver saw
--             the request and accepted it: its pickup moved and its agreed fare went 150 → 500;
--           · change `new_fare` / the drop-off AFTER its Driver had seen the request;
--           · mark it `accepted` or `declined` in the Driver's name.
--         The app only ever writes `status = 'superseded'`, so that is all the browser keeps.
--   § 4 · WHO DID IT. A Business could name another Business's Dispatcher on its trip, its change
--         request and its info-change log (the Driver's trip page and Waybill then print that
--         person's name and phone). D144 left `dispatcher_id` open on purpose; this closes it.
--   § 5 · A FINISHED TRIP'S DETAILS. D144 left "an info edit on a finished trip" to the app; the
--         Business's UPDATE policy now reaches only draft / pooled / accepted / confirmed trips —
--         exactly the statuses the app's own writes touch.
--   § 6 · A Driver could insert trip steps (arrived, completed…) with any date. The app never
--         does; the service role and the database functions write every step.
--   § 7 · THE POOL AND THE GUEST (founder, S83: "trip, not Guest"). Any account that finished the
--         Driver sign-up — no papers, car pending — could read every pooled trip of every Business
--         WITH the Guest's name, the room reference and the sign file, through `mission_read` and
--         through the `mission` table's own policy. Now: a Driver sees pooled trips only with an
--         approved car (what /pool already requires), and sees the trip — route, time, flight,
--         price — but not who the Guest is until they hold it.
--   § 8 · THE SIGN FILE. The server signs a link for whatever `board_file_path` holds, and the
--         Business writes that column — so it could point it at a Driver's papers in the same
--         private bucket. A path must now be the Business's own board file.
--   § 9 · FUNCTIONS. Every database function a browser calls stays callable by a signed-in
--         session and stops being callable signed-out (the two clean-up sweeps were).
--   § 10 · THE ROOT CAUSE (founder, S83: "yes, start locked"). New tables, views, sequences and
--         functions created by `postgres` in `public` no longer go to anon/authenticated
--         automatically. ⚑ FROM NOW ON every migration GRANTS what the app needs — SELECT on a new
--         table to authenticated, EXECUTE on a new RPC / policy helper / index-expression helper.
--         Forgetting it is a loud 42501 on the first test, not a silent hole.
--
-- NOT HERE: the money functions (accept, cancel, no-show, release, event log) — 2026-09-18b.
--           Posting below the rate-card floor — parked by the founder (D144's own note).
--
-- ⚑ `service_role` is never touched: it is the server's own key. Nothing here changes a screen:
--   every revoke is a privilege the app does not use (checked in S83, one call site at a time).
-- One transaction: it applies whole or not at all. Idempotent — safe to re-run.
-- After it: paste .local/probe/rls-audit/check.sql — every row must read `pass` or `info`.

begin;

-- ── § 1 · anon holds nothing on any table or view in public ─────────────────────────────────
-- The app never reads or writes signed-out (every server path returns before a query when there
-- is no user: lib/app-context.ts, lib/driver.ts). `revoke all` also clears column grants.
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as rel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke all on %s from anon', r.rel);
  end loop;
end $$;

-- ── § 2 · authenticated: no TRUNCATE / REFERENCES / TRIGGER anywhere; writes on four tables only ──
-- The four a browser session writes (S83 inventory of every .insert/.update/.upsert/.delete):
--   mission               — D144's column lists, untouched here
--   mission_amendment     — § 3 below
--   mission_info_change   — § 4 below
--   mission_guest_contact — insert / upsert / update / delete of the Guest's phones (RLS: own trips)
-- ⚑ A table-level REVOKE UPDATE also drops every column-level UPDATE grant — which is why `mission`
--   is kept out of the write revoke: D144's lists live there.
do $$
declare
  r record;
  v_maint text := case when current_setting('server_version_num')::int >= 170000 then ', maintain' else '' end;
begin
  for r in
    select c.oid::regclass as rel, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke truncate, references, trigger%s on %s from authenticated', v_maint, r.rel);
    if r.relname not in ('mission', 'mission_amendment', 'mission_info_change', 'mission_guest_contact') then
      execute format('revoke insert, update, delete on %s from authenticated', r.rel);
    end if;
  end loop;
end $$;

-- ── § 3 · change requests: the Business inserts one; afterwards it can only withdraw it ─────────
revoke insert, update, delete on public.mission_amendment from authenticated;
-- exactly the columns app/(dispatch)/dispatch/[id]/amend/actions.ts inserts
grant insert (mission_id, business_id, proposed_by, status,
              new_pickup_address, new_pickup_lat, new_pickup_lng, new_pickup_label,
              new_dropoff_address, new_dropoff_lat, new_dropoff_lng, new_dropoff_label,
              new_waypoints, new_distance_km, new_duration_min, new_fare, from_snapshot, note)
  on public.mission_amendment to authenticated;
grant update (status) on public.mission_amendment to authenticated;

drop policy if exists p_amendment_business_insert on public.mission_amendment;
create policy p_amendment_business_insert on public.mission_amendment for insert with check (
  business_id = current_business_id()
  and status = 'proposed'
  and mission_id in (select id from mission where business_id = current_business_id())
  and (proposed_by is null or proposed_by in (select id from dispatcher where business_id = current_business_id()))
);

-- USING = the rows it may touch (its own, still open); WITH CHECK = the only thing it may make of
-- them. Postgres reuses USING as the check when WITH CHECK is missing — that was the hole.
drop policy if exists p_amendment_business_update on public.mission_amendment;
create policy p_amendment_business_update on public.mission_amendment for update
  using (business_id = current_business_id() and status in ('proposed', 'declined'))
  with check (business_id = current_business_id() and status = 'superseded');

-- ── § 4 · who did it: a Dispatcher named on a row is one of the Business's own ─────────────────
drop policy if exists p_mission_business_insert on public.mission;
create policy p_mission_business_insert on public.mission for insert with check (
  business_id = current_business_id()
  and (dispatcher_id is null or dispatcher_id in (select id from dispatcher where business_id = current_business_id()))
);

-- § 5 rides on the same policy: USING names the statuses a browser may still edit.
drop policy if exists p_mission_business_update on public.mission;
create policy p_mission_business_update on public.mission for update
  using (business_id = current_business_id() and status in ('draft', 'pooled', 'accepted', 'confirmed'))
  with check (
    business_id = current_business_id()
    and (dispatcher_id is null or dispatcher_id in (select id from dispatcher where business_id = current_business_id()))
  );

revoke insert, update, delete on public.mission_info_change from authenticated;
-- exactly the columns app/(dispatch)/dispatch/[id]/edit/actions.ts inserts (not created_at: the clock is the database's)
grant insert (mission_id, business_id, edited_by, items) on public.mission_info_change to authenticated;
drop policy if exists p_info_change_business_insert on public.mission_info_change;
create policy p_info_change_business_insert on public.mission_info_change for insert with check (
  business_id = current_business_id()
  and mission_id in (select id from mission where business_id = current_business_id())
  and (edited_by is null or edited_by in (select id from dispatcher where business_id = current_business_id()))
);

-- ── § 6 · trip steps are written by the server and the database functions only ────────────────
drop policy if exists p_statusevent_driver_write on public.status_event;

-- ── § 7 · the Pool: an approved car to see it, and the trip without the Guest ─────────────────
-- The table: a Driver reads their OWN trips here. Every Driver-side read of `mission` in the app
-- filters on driver_id (layout badges, rides, earnings); the Pool reads `mission_read`.
drop policy if exists p_mission_driver_read on public.mission;
create policy p_mission_driver_read on public.mission for select using (
  driver_id = current_driver_id()
);

-- The view: rebuilt IN PLACE (create or replace keeps its grants), same columns, same order, same
-- types, from the newest full rebuild (2026-09-12a). Two changes, both marked ⚑ S83:
--   · the pooled branch of WHERE needs an approved, unretired car (working_car()'s test — the rule
--     /pool and the accept already apply)
--   · the Guest's identity is NULL to a Driver who does not hold the trip, exactly like the money
-- ⚑ security_invoker stays FALSE (D145 rule 2).
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
  case when m.hold_expires_at > now() then m.hold_expires_at end as hold_expires_at
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

-- ── § 8 · a sign file is the Business's own board file ────────────────────────────────────────
-- Checked only when the path CHANGES, so an old row is never blocked from anything else.
-- (app/(dispatch)/dispatch/new/actions.ts and …/edit/actions.ts write `mission/<business>/board-<uuid>.<ext>`;
-- lib/mission-board-actions.ts refuses any other path too, for the rows written before this.)
create or replace function public.mission_guard_board_file()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.board_file_path is not distinct from old.board_file_path then
    return new;
  end if;
  if new.board_file_path is not null
     and new.board_file_path not like 'mission/' || new.business_id::text || '/board-%' then
    raise exception 'A sign file must be one this Business uploaded'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
-- a trigger function is never called over the API; nothing needs EXECUTE on it
revoke all on function public.mission_guard_board_file() from public, anon, authenticated;

drop trigger if exists trg_mission_guard_board_file on public.mission;
create trigger trg_mission_guard_board_file
  before insert or update of board_file_path on public.mission
  for each row execute function public.mission_guard_board_file();

-- ── § 9 · functions: callable signed-in, not signed-out ───────────────────────────────────────
-- ⚑ Both PUBLIC (`create function` gives it EXECUTE) and anon (Supabase's default gives it its
--   own) must go, or the revoke is the no-op of rule 6. The raw functions behind the `_call`
--   wrappers were closed in 2026-08-31g and stay closed.
-- ⚑ NOT touched: app_role(), current_*_id() (RLS policy helpers), phone_key / fold_text
--   (index-expression helpers — D138 rule 5), and the pure invoker helpers.
do $$
declare
  f text;
begin
  foreach f in array array[
    -- the doors the browser calls (S83 inventory of every .rpc(): SESSION client)
    'accept_mission_call(uuid, numeric)', 'place_hold(uuid, numeric)', 'release_hold(uuid)',
    'board_guest_call(uuid)', 'reclaim_mission_call(uuid)',
    'business_cancel_mission_call(uuid, text, numeric)', 'driver_cancel_mission_call(uuid, text, numeric)',
    'business_declare_no_show_call(uuid, numeric)', 'mark_no_show_call(uuid, numeric)',
    'respond_to_amendment_call(uuid, boolean, text)', 'respond_to_release_call(uuid, boolean, text)',
    'propose_release(uuid, text, numeric, uuid)', 'close_release(uuid)',
    'log_mission_event(uuid, text, jsonb)',
    'expire_stale_missions()', 'sweep_lapsed_holds()',
    -- the admin console's reads (invoker, RLS-bound; called with the admin's signed-in session)
    'admin_business_overview(timestamptz, timestamptz)',
    'admin_business_page(text, text, text, integer, integer, timestamptz, timestamptz)',
    'admin_driver_overview(timestamptz, timestamptz)',
    'admin_driver_page(text, text, text, text, integer, integer, timestamptz, timestamptz)',
    'admin_driver_find(text, boolean, integer, integer)',
    'admin_vehicle_overview(timestamptz, timestamptz)',
    'admin_vehicle_find(text, text, text, boolean, integer, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── § 10 · new objects start locked ───────────────────────────────────────────────────────────
-- For objects `postgres` creates in `public` — every migration pasted into the SQL editor.
-- service_role keeps its default: the server's key is meant to reach everything.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- ⚑ PUBLIC's EXECUTE on a new function is BUILT IN, not a schema default, and a per-schema
--   `revoke … from public` cannot remove a global default (Postgres docs, ALTER DEFAULT
--   PRIVILEGES: "IN SCHEMA … can only add"). So this one line is global — every schema.
alter default privileges for role postgres revoke execute on functions from public;

commit;

notify pgrst, 'reload schema';

-- sanity — in the SQL editor (all four must read false):
--   select has_table_privilege('anon', 'public.mission', 'SELECT')              as anon_reads_mission,
--          has_table_privilege('authenticated', 'public.mission_amendment', 'UPDATE') as amend_table_wide_update,
--          has_function_privilege('anon', 'public.expire_stale_missions()', 'EXECUTE') as anon_runs_sweep,
--          exists (select 1 from pg_policies where policyname = 'p_statusevent_driver_write') as driver_step_policy;
