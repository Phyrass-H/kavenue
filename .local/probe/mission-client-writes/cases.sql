-- S82 — the cases. Every case runs as a real role (anon / authenticated / service_role /
-- postgres) with a real JWT `sub`, inside a subtransaction that is ALWAYS rolled back, so no case
-- sees another's write. Each case states what it must do BEFORE the migration (31f's grants,
-- the hole) and AFTER it. ⚑ A want of `ok rows=1` on an attack BEFORE is the proof of the hole.
-- A case whose before-want equals its after-want is a write the app needs, or a wall that already stood.

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into business (id, name) values
  ('0000000a-0000-0000-0000-000000000001', 'Business A'),
  ('0000000a-0000-0000-0000-000000000002', 'Business B');
insert into dispatcher (id, business_id, auth_user_id) values
  ('0000000d-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('0000000d-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into driver (id, auth_user_id) values
  ('0000000e-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c');
insert into profile (auth_user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'dispatcher'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'dispatcher'),
  ('cccccccc-0000-0000-0000-00000000000c', 'driver');

-- three generations: an old one, the LIVE one, and a future one. The guard must pick the live one.
insert into commission_rate (effective_from, business_rate_ht, driver_rate_ht, fee_vat_rate, transport_vat_rate, standard_vat_rate) values
  (now() - interval '60 days', 0.05000, 0.05000, 0.20000, 0.10000, 0.20000),
  (now() - interval '30 days', 0.12500, 0.10000, 0.20000, 0.10000, 0.20000),
  (now() + interval '30 days', 0.99000, 0.99000, 0.99000, 0.10000, 0.99000);

insert into mission (id, business_id, dispatcher_id, driver_id, status, category, pickup_address, pickup_at,
                     ceiling, created_at, accepted_fare, commission_business_rate, commission_driver_rate,
                     commission_vat_rate, standard_vat_rate) values
  ('11111111-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001',
   null, 'draft', 'business', 'Hôtel de Paris', now() + interval '2 days', 100, now() - interval '3 days', null, null, null, null, null),
  ('11111111-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001',
   null, 'pooled', 'business', 'Hôtel de Paris', now() + interval '2 days', 100, now() - interval '1 hour', null, 0.125, 0.1, 0.2, 0.2),
  ('11111111-0000-0000-0000-000000000003', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001',
   '0000000e-0000-0000-0000-000000000001', 'confirmed', 'business', 'Hôtel de Paris', now() + interval '2 days', 100,
   now() - interval '1 day', 90, 0.125, 0.1, 0.2, 0.2),
  ('11111111-0000-0000-0000-000000000004', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001',
   null, 'pooled', 'business', 'Hôtel de Paris', now() + interval '2 days', 100, now() - interval '1 hour', null, 0.125, 0.1, 0.2, 0.2),
  ('11111111-0000-0000-0000-000000000005', '0000000a-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000002',
   null, 'pooled', 'business', 'Negresco', now() + interval '2 days', 100, now() - interval '1 hour', null, 0.125, 0.1, 0.2, 0.2);

-- ── the runner ──────────────────────────────────────────────────────────────
create table kv_case (
  n int primary key, label text not null, as_role text not null, sub uuid,
  sql text not null, check_sql text, want_before text not null, want_after text not null
);
create table kv_result (phase text, n int, label text, want text, got text, pass boolean);

create or replace function kv_try(p_role text, p_sub uuid, p_sql text, p_check text)
returns text language plpgsql as $$
declare
  v_rows bigint;
  v_check text;
  v_detail text;
begin
  begin
    perform set_config('request.jwt.claims',
      case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_role)::text end, true);
    if p_role <> 'postgres' then
      execute format('set local role %I', p_role);
    end if;
    execute p_sql;
    get diagnostics v_rows = row_count;
    reset role;
    if p_check is not null then
      execute p_check into v_check;
    end if;
    raise exception 'kv_rollback' using detail = 'ok rows=' || v_rows || coalesce(' ' || v_check, '');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = 'kv_rollback' then
      return v_detail;
    end if;
    return 'refused ' || sqlstate || ': ' || sqlerrm;
  end;
end;
$$;

create or replace function kv_run(p_phase text) returns void language plpgsql as $$
declare c kv_case; v_got text; v_want text;
begin
  for c in select * from kv_case order by n loop
    v_got := kv_try(c.as_role, c.sub, c.sql, c.check_sql);
    v_want := case when p_phase = 'before' then c.want_before else c.want_after end;
    insert into kv_result values (p_phase, c.n, c.label, v_want, v_got, v_got like v_want);
  end loop;
end;
$$;

-- ── the cases ───────────────────────────────────────────────────────────────
-- Roles: DA = Business A's Dispatcher · DB = Business B's · DR = the Driver.
-- Trips: 01 draft · 02 pooled · 03 confirmed (DR, accepted at 90) · 04 pooled · 05 Business B's.
\set DA '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set DR '''cccccccc-0000-0000-0000-00000000000c'''

insert into kv_case values
-- ─── what the app does, which must keep working ───
(1, 'APP  createMission INSERT, posted (44 columns, live rates as the app sends them)', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, zone, pickup_address, pickup_lat, pickup_lng,
   dropoff_address, dropoff_lat, dropoff_lng, waypoints, pickup_at, passenger_name, passenger_names, pax_count,
   luggage_count, luggage_only, flight_number, reference, ceiling, speed_win, required_body_type, required_make,
   required_model, required_languages, dress_code, driver_flags, board_name, driver_message, distance_km,
   duration_min, board_file_path, pickup_label, dropoff_label, rate_card_id, night_applied,
   commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate, pdp_start, pdp_step,
   pdp_interval)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', 'pooled', 'business',
   'monaco', 'Hôtel de Paris', 43.7, 7.4, 'Nice Aéroport', 43.6, 7.2, null, now() + interval '1 day', 'Jean Dupont',
   '[{"first":"Jean","last":"Dupont"}]', 1, 2, false, 'AF123', 'L1', 120, false, null, null, null, '{English}',
   'suit_tie', '{"meet_greet":true}', 'DUPONT', 'Call on arrival', 25.3, 32, null, 'Hôtel de Paris', 'Nice T1',
   null, false, 0.125, 0.1, 0.2, 0.2, 60, null, null) returning id$$,
 $$select (commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate, created_at = now())::text from mission where reference = 'L1'$$,
 'ok rows=1 (0.12500,0.10000,0.20000,0.20000,t)', 'ok rows=1 (0.12500,0.10000,0.20000,0.20000,t)'),

(2, 'APP  createMission INSERT, as a draft', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling, reference,
   commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', 'draft', 'business',
   'Hôtel de Paris', now() + interval '1 day', 120, 'L2', 0.125, 0.1, 0.2, 0.2) returning id$$,
 null, 'ok rows=1', 'ok rows=1'),

(3, 'APP  draft resume step 1 — the snapshot, on the SERVICE ROLE (S82 draft-resume fix)', 'service_role', null,
 $$update mission set rate_card_id = null, night_applied = false, commission_business_rate = 0.125,
   commission_driver_rate = 0.1, commission_vat_rate = 0.2, standard_vat_rate = 0.2, pdp_start = 60,
   pdp_step = null, pdp_interval = null
   where id = '11111111-0000-0000-0000-000000000001' and business_id = '0000000a-0000-0000-0000-000000000001' and status = 'draft'$$,
 null, 'ok rows=1', 'ok rows=1'),

(4, 'APP  draft resume step 2 — POST it, on the Dispatcher session (36 columns; created_at sent from a wrong clock)', 'authenticated', :DA,
 $$update mission set business_id = '0000000a-0000-0000-0000-000000000001', dispatcher_id = '0000000d-0000-0000-0000-000000000001',
   status = 'pooled', category = 'business', zone = 'monaco', pickup_address = 'Hôtel de Paris', pickup_lat = 43.7,
   pickup_lng = 7.4, dropoff_address = 'Nice Aéroport', dropoff_lat = 43.6, dropoff_lng = 7.2, waypoints = null,
   pickup_at = now() + interval '1 day', passenger_name = 'Jean Dupont', passenger_names = '[{"first":"Jean"}]',
   pax_count = 1, luggage_count = 2, luggage_only = false, flight_number = 'AF123', reference = 'L4', ceiling = 130,
   speed_win = false, required_body_type = null, required_make = null, required_model = null,
   required_languages = '{English}', dress_code = 'suit_tie', driver_flags = '{}', board_name = 'DUPONT',
   driver_message = 'hi', distance_km = 25.3, duration_min = 32, board_file_path = null,
   pickup_label = 'Hôtel de Paris', dropoff_label = 'Nice T1', created_at = '2020-01-01T00:00:00Z'
   where id = '11111111-0000-0000-0000-000000000001' and business_id = '0000000a-0000-0000-0000-000000000001' and status = 'draft'
   returning id$$,
 $$select (status, created_at = now(), commission_business_rate, commission_driver_rate, standard_vat_rate)::text from mission where id = '11111111-0000-0000-0000-000000000001'$$,
 'ok rows=1 (pooled,f,,,)', 'ok rows=1 (pooled,t,0.12500,0.10000,0.20000)'),

(5, 'APP  draft resume — re-saved AS A DRAFT (no created_at sent)', 'authenticated', :DA,
 $$update mission set status = 'draft', ceiling = 110, reference = 'L5'
   where id = '11111111-0000-0000-0000-000000000001' and business_id = '0000000a-0000-0000-0000-000000000001' and status = 'draft' returning id$$,
 $$select (created_at < now() - interval '2 days')::text from mission where id = '11111111-0000-0000-0000-000000000001'$$,
 'ok rows=1 true', 'ok rows=1 true'),

(6, 'APP  info edit on a CONFIRMED trip (13 columns, the action''s own WHERE)', 'authenticated', :DA,
 $$update mission set passenger_name = 'Marie Curie', passenger_names = '[{"first":"Marie"}]', pax_count = 1,
   luggage_count = 3, flight_number = 'BA1', reference = 'L6', required_languages = '{Français}',
   dress_code = 'business_formal', driver_flags = '{"quiet_ride":true}', board_name = 'CURIE',
   driver_message = 'Gate B', board_file_path = 'mission/x/board.pdf', info_edited_at = now()
   where id = '11111111-0000-0000-0000-000000000003' and business_id = '0000000a-0000-0000-0000-000000000001'
     and status in ('pooled','accepted','confirmed') and (status <> 'pooled' or pickup_at > now())
   returning id$$,
 null, 'ok rows=1', 'ok rows=1'),

(7, 'APP  info edit on a POOLED trip', 'authenticated', :DA,
 $$update mission set board_name = 'X', info_edited_at = now()
   where id = '11111111-0000-0000-0000-000000000002' and business_id = '0000000a-0000-0000-0000-000000000001'
     and status in ('pooled','accepted','confirmed') and (status <> 'pooled' or pickup_at > now()) returning id$$,
 null, 'ok rows=1', 'ok rows=1'),

(8, 'APP  a SECURITY DEFINER RPC writes money (accept, as the Driver)', 'authenticated', :DR,
 $$select standin_accept('11111111-0000-0000-0000-000000000004', 85)$$,
 $$select (status, accepted_fare)::text from mission where id = '11111111-0000-0000-0000-000000000004'$$,
 'ok rows=1 (confirmed,85.00)', 'ok rows=1 (confirmed,85.00)'),

(9, 'APP  the service role moves a trip on (a Driver''s step + check-in)', 'service_role', null,
 $$update mission set status = 'en_route', checked_in_at = now() where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'ok rows=1'),

(10, 'APP  a service-role seed keeps the rates it writes (the guard skips it)', 'service_role', null,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling, reference,
   driver_id, accepted_fare, commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', 'completed', 'business',
   'Seed', now() - interval '1 day', 100, 'L10', '0000000e-0000-0000-0000-000000000001', 90, 0.05, 0.05, 0.2, 0.2)$$,
 $$select (status, commission_business_rate)::text from mission where reference = 'L10'$$,
 'ok rows=1 (completed,0.05000)', 'ok rows=1 (completed,0.05000)'),

(11, 'APP  today''s DEPLOYED resume (sends standard_vat_rate) — broken since 2026-09-04, fixed by the S82 code', 'authenticated', :DA,
 $$update mission set ceiling = 110, standard_vat_rate = 0.2
   where id = '11111111-0000-0000-0000-000000000001' and status = 'draft'$$,
 null, 'refused 42501%', 'refused 42501%'),

-- ─── the attacks: a Dispatcher's own token, straight at PostgREST ───
(20, 'HOLE lower accepted_fare on a CONFIRMED trip', 'authenticated', :DA,
 $$update mission set accepted_fare = 1 where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(21, 'HOLE lower the ceiling on a CONFIRMED trip', 'authenticated', :DA,
 $$update mission set ceiling = 1 where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(22, 'HOLE zero Kavenue''s commission on a CONFIRMED trip', 'authenticated', :DA,
 $$update mission set commission_business_rate = 0, commission_driver_rate = 0 where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(23, 'HOLE move created_at on a POOLED trip (restarts the PDP climb)', 'authenticated', :DA,
 $$update mission set created_at = now() + interval '1 day' where id = '11111111-0000-0000-0000-000000000002'$$,
 null, 'ok rows=1', 'refused 42501%'),
(24, 'HOLE mark a CONFIRMED trip completed', 'authenticated', :DA,
 $$update mission set status = 'completed' where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(25, 'HOLE cancel a CONFIRMED trip with no fee, skipping the cancel RPC', 'authenticated', :DA,
 $$update mission set status = 'cancelled', cancellation_fee = 0, cancelled_by = 'driver' where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(26, 'HOLE a draft jumps straight to confirmed', 'authenticated', :DA,
 $$update mission set status = 'confirmed' where id = '11111111-0000-0000-0000-000000000001'$$,
 null, 'ok rows=1', 'refused 42501%'),
(27, 'HOLE unpost a POOLED trip back to draft', 'authenticated', :DA,
 $$update mission set status = 'draft' where id = '11111111-0000-0000-0000-000000000002'$$,
 null, 'ok rows=1', 'refused 42501%'),
(28, 'HOLE INSERT a trip born completed', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', 'completed', 'business', 'x', now(), 100)$$,
 null, 'ok rows=1', 'refused 42501%'),
(29, 'HOLE INSERT a posted trip with commission 0 (after: stored as the LIVE rates)', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling, reference,
   commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', 'pooled', 'business', 'x',
   now() + interval '1 day', 100, 'A29', 0, 0, 0, 0)$$,
 $$select (commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate)::text from mission where reference = 'A29'$$,
 'ok rows=1 (0.00000,0.00000,0.00000,0.00000)', 'ok rows=1 (0.12500,0.10000,0.20000,0.20000)'),
(30, 'HOLE INSERT a trip already accepted, with its fare', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling, driver_id, accepted_fare)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', 'pooled', 'business', 'x',
   now() + interval '1 day', 100, '0000000e-0000-0000-0000-000000000001', 1)$$,
 null, 'ok rows=1', 'refused 42501%'),
(31, 'HOLE INSERT with created_at far in the future (the climb never starts)', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling, created_at)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', 'pooled', 'business', 'x',
   now() + interval '1 day', 100, now() + interval '1 day')$$,
 null, 'ok rows=1', 'refused 42501%'),
(32, 'HOLE take the Driver off a CONFIRMED trip', 'authenticated', :DA,
 $$update mission set driver_id = null where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(33, 'HOLE turn SPEED WIN on for a POOLED trip', 'authenticated', :DA,
 $$update mission set speed_win = true where id = '11111111-0000-0000-0000-000000000002'$$,
 null, 'ok rows=1', 'refused 42501%'),
(34, 'HOLE change the pickup address of a POOLED trip', 'authenticated', :DA,
 $$update mission set pickup_address = 'Somewhere cheaper' where id = '11111111-0000-0000-0000-000000000002'$$,
 null, 'ok rows=1', 'refused 42501%'),
(35, 'HOLE zero the waiting fee on a trip', 'authenticated', :DA,
 $$update mission set waiting_fee = 0, waiting_minutes = 0 where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(36, 'HOLE zero the rates on a DRAFT, then post it', 'authenticated', :DA,
 $$update mission set commission_business_rate = 0, status = 'pooled' where id = '11111111-0000-0000-0000-000000000001'$$,
 null, 'ok rows=1', 'refused 42501%'),
(37, 'HOLE a draft''s created_at moved without posting', 'authenticated', :DA,
 $$update mission set created_at = now() - interval '10 days' where id = '11111111-0000-0000-0000-000000000001'$$,
 null, 'ok rows=1', 'refused 42501%'),
(38, 'HOLE an info column and the ceiling in one PATCH, on a POOLED trip', 'authenticated', :DA,
 $$update mission set board_name = 'Y', ceiling = 1 where id = '11111111-0000-0000-0000-000000000002'$$,
 null, 'ok rows=1', 'refused 42501%'),
(39, 'EDGE a bare status PATCH posts a stale draft — after: live rates + a fresh created_at', 'authenticated', :DA,
 $$update mission set status = 'pooled' where id = '11111111-0000-0000-0000-000000000001'$$,
 $$select (created_at = now(), commission_business_rate)::text from mission where id = '11111111-0000-0000-0000-000000000001'$$,
 'ok rows=1 (f,)', 'ok rows=1 (t,0.12500)'),

-- ─── walls that already stood, and must still ───
(50, 'WALL another Business''s trip: 0 rows (RLS)', 'authenticated', :DA,
 $$update mission set board_name = 'Z' where id = '11111111-0000-0000-0000-000000000005'$$,
 null, 'ok rows=0', 'ok rows=0'),
(51, 'WALL INSERT a trip into another Business (RLS)', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling)
   values ('0000000a-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000002', 'pooled', 'business', 'x', now() + interval '1 day', 100)$$,
 null, 'refused 42501%', 'refused 42501%'),
(52, 'WALL move your trip to another Business', 'authenticated', :DA,
 $$update mission set business_id = '0000000a-0000-0000-0000-000000000002' where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'refused 42501%', 'refused 42501%'),
(53, 'WALL pickup_at on a booked trip (the 2026-07-22 guard)', 'authenticated', :DA,
 $$update mission set pickup_at = now() + interval '5 days' where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'refused 42501%', 'refused 42501%'),
(54, 'WALL guest_ready_at (2026-08-31f)', 'authenticated', :DA,
 $$update mission set guest_ready_at = now() where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'refused 42501%', 'refused 42501%'),
(55, 'WALL a Driver session writes a fare (before: 0 rows by RLS · after: no privilege)', 'authenticated', :DR,
 $$update mission set accepted_fare = 999 where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=0', 'refused 42501%'),
(56, 'WALL anon writes a ceiling (before: 0 rows by RLS · after: no privilege)', 'anon', null,
 $$update mission set ceiling = 1 where id = '11111111-0000-0000-0000-000000000002'$$,
 null, 'ok rows=0', 'refused 42501%'),
(57, 'WALL delete your own trip (before: 0 rows, no policy · after: no privilege)', 'authenticated', :DA,
 $$delete from mission where id = '11111111-0000-0000-0000-000000000001'$$,
 null, 'ok rows=0', 'refused 42501%'),
(58, 'WALL call mission_client_rates() directly (it would hand out driver_rate_ht)', 'authenticated', :DA,
 $$select * from mission_client_rates()$$,
 null, 'refused %', 'refused 42501%'),
(59, 'WALL anon calls mission_client_rates()', 'anon', null,
 $$select * from mission_client_rates()$$,
 null, 'refused %', 'refused 42501%'),

-- ─── the door BESIDE the table: mission_read is auto-updatable and reads as its OWNER, so a
--     write through it skips part (a)'s column grants AND the mission policies. Its own WHERE is
--     the only limit left — and that WHERE shows a DRIVER every pooled trip there is.
(60, 'VIEW a Driver DELETES another Business''s pooled trip through mission_read', 'authenticated', :DR,
 $$delete from mission_read where id = '11111111-0000-0000-0000-000000000005'$$,
 null, 'ok rows=1', 'refused 42501%'),
(61, 'VIEW a Driver rewrites the Guest on another Business''s pooled trip', 'authenticated', :DR,
 $$update mission_read set passenger_name = 'Not their Guest', driver_message = 'x'
   where id = '11111111-0000-0000-0000-000000000005'$$,
 null, 'ok rows=1', 'refused 42501%'),
(62, 'VIEW a Dispatcher lowers accepted_fare on its own CONFIRMED trip', 'authenticated', :DA,
 $$update mission_read set accepted_fare = 1 where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'refused 42501%'),
(63, 'VIEW a Dispatcher puts a Driver and a fare on its own DRAFT (columns part (a) took away)', 'authenticated', :DA,
 $$update mission_read set driver_id = '0000000e-0000-0000-0000-000000000001', accepted_fare = 1
   where id = '11111111-0000-0000-0000-000000000001'$$,
 null, 'ok rows=1', 'refused 42501%'),
-- ⚑ MEASURED: an INSERT through the view is refused even BEFORE the fix, and not by any rule of
--    ours — `ceiling` is a CASE expression in the view (the money wall), so it is not insertable,
--    and `mission.ceiling` is NOT NULL with no default. The price wall blocks the forged trip.
(64, 'VIEW an INSERT through the view: refused either way (ceiling is masked, and NOT NULL)', 'authenticated', :DA,
 $$insert into mission_read (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling)
   values ('0000000a-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000002', 'pooled',
   'business', 'Not their trip', now() + interval '1 day', 100)$$,
 null, 'refused 0A000%', 'refused %'),
(65, 'VIEW a Dispatcher still READS its own trip through mission_read', 'authenticated', :DA,
 $$select ceiling from mission_read where id = '11111111-0000-0000-0000-000000000003'$$,
 null, 'ok rows=1', 'ok rows=1'),
(66, 'VIEW a Driver still READS a pooled trip''s price through the view (the money wall''s own door)', 'authenticated', :DR,
 $$select ceiling from mission_read where id = '11111111-0000-0000-0000-000000000005'$$,
 null, 'ok rows=1', 'ok rows=1'),
(67, 'VIEW a Driver reads nothing of a DRAFT (the view''s WHERE)', 'authenticated', :DR,
 $$select ceiling from mission_read where id = '11111111-0000-0000-0000-000000000001'$$,
 null, 'ok rows=0', 'ok rows=0');
