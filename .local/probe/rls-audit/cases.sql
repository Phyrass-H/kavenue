-- S83 — the cases. Every case runs as a real role (anon / authenticated) with a real JWT `sub`,
-- inside a subtransaction that is ALWAYS rolled back, so no case sees another's write.
-- Each states what it must do BEFORE the S83 migrations (the state the files leave live) and AFTER.
--   APP   a write or read the app does — must work before AND after (nothing the founder sees changes)
--   HOLE  an attack a real login could run — before must be `ok…` (the proof), after refused / empty
--   LOCK  a privilege nothing uses, stopped only by RLS before — before `ok rows=0`, after refused
-- People: DA / DB = Business A's / B's Dispatcher · DR1 = Driver with an approved car ·
--         DR2 = a Driver who only signed up. Trips: see fixtures.sql.

-- ── the runner (from .local/probe/mission-client-writes/cases.sql) ─────────────────────────────
create schema kv;
set search_path = kv, public;
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
declare c kv.kv_case; v_got text; v_want text;
begin
  for c in select * from kv.kv_case order by n loop
    v_got := kv.kv_try(c.as_role, c.sub, c.sql, c.check_sql);
    v_want := case when p_phase = 'before' then c.want_before else c.want_after end;
    insert into kv.kv_result values (p_phase, c.n, c.label, v_want, v_got, v_got like v_want);
  end loop;
end;
$$;

\set DA  '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set DB  '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set DR1 '''cccccccc-0000-0000-0000-00000000000c'''
\set DR2 '''dddddddd-0000-0000-0000-00000000000d'''

insert into kv_case values
-- ─── what the app does, which must keep working ─────────────────────────────────────────────
(1, 'APP  createMission INSERT, posted (the columns new/actions.ts sends)', 'authenticated', :DA,
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
   'suit_tie', '{"meet_greet":true}', 'DUPONT', 'Call on arrival', 25.3, 32,
   'mission/0000000a-0000-0000-0000-000000000001/board-9b2c.pdf', 'Hôtel de Paris', 'Nice T1',
   null, false, 0.125, 0.1, 0.2, 0.2, 60, null, null)$$,
 null, 'ok rows=1', 'ok rows=1'),
(2, 'APP  draft resume: post draft A1 (session columns + created_at)', 'authenticated', :DA,
 $$update mission set status = 'pooled', created_at = now(), pickup_address = 'Hôtel de Paris'
    where id = '11111111-0000-0000-0000-0000000000a1' and business_id = '0000000a-0000-0000-0000-000000000001' and status = 'draft'$$,
 null, 'ok rows=1', 'ok rows=1'),
(3, 'APP  info edit on confirmed A3 (Guest name, board file)', 'authenticated', :DA,
 $$update mission set passenger_name = 'New Guest', info_edited_at = now(),
         board_file_path = 'mission/0000000a-0000-0000-0000-000000000001/board-77aa.png'
    where id = '11111111-0000-0000-0000-0000000000a3' and business_id = '0000000a-0000-0000-0000-000000000001'
      and status in ('pooled','accepted','confirmed')$$,
 null, 'ok rows=1', 'ok rows=1'),
(4, 'APP  info-change log row (mission_id, business_id, edited_by, items)', 'authenticated', :DA,
 $$insert into mission_info_change (mission_id, business_id, edited_by, items)
   values ('11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', '[]')$$,
 null, 'ok rows=1', 'ok rows=1'),
(5, 'APP  guest contact upsert + delete on own trip', 'authenticated', :DA,
 $$with u as (insert into mission_guest_contact (mission_id, contacts, updated_at)
     values ('11111111-0000-0000-0000-0000000000a3', '[{"phone":"+33600000000"}]', now())
     on conflict (mission_id) do update set contacts = excluded.contacts, updated_at = excluded.updated_at returning 1)
   delete from mission_guest_contact where mission_id = '11111111-0000-0000-0000-0000000000a3'$$,
 null, 'ok rows=%', 'ok rows=%'),
(6, 'APP  withdraw own change request (status → superseded)', 'authenticated', :DA,
 $$update mission_amendment set status = 'superseded'
    where mission_id = '11111111-0000-0000-0000-0000000000a3' and business_id = '0000000a-0000-0000-0000-000000000001' and status = 'proposed'$$,
 null, 'ok rows=1', 'ok rows=1'),
(7, 'APP  propose a change request (the 18 columns amend/actions.ts sends)', 'authenticated', :DA,
 $$insert into mission_amendment (mission_id, business_id, proposed_by, status, new_pickup_address, new_pickup_lat,
   new_pickup_lng, new_pickup_label, new_dropoff_address, new_dropoff_lat, new_dropoff_lng, new_dropoff_label,
   new_waypoints, new_distance_km, new_duration_min, new_fare, from_snapshot, note)
   values ('11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001',
   'proposed', 'Monte-Carlo Bay', 43.7, 7.4, 'MC Bay', 'Nice T1', 43.6, 7.2, 'T1', null, 12.1, 20, 110, '{"fare":90}', 'earlier')$$,
 $$select status from mission_amendment where id = '22222222-0000-0000-0000-0000000000a3'$$,
 'ok rows=1 superseded', 'ok rows=1 superseded'),
(8, 'APP  Driver accepts the change request on their trip', 'authenticated', :DR1,
 $$select respond_to_amendment_call('22222222-0000-0000-0000-0000000000a3', true)$$,
 $$select pickup_address || ' ' || accepted_fare from mission where id = '11111111-0000-0000-0000-0000000000a3'$$,
 'ok rows=1 Monte-Carlo Bay 120.00', 'ok rows=1 Monte-Carlo Bay 120.00'),
(9, 'APP  approved Driver sees the Pool (count of pooled trips via mission_read)', 'authenticated', :DR1,
 $$select 1 from mission_read where status = 'pooled'$$, null, 'ok rows=2', 'ok rows=2'),
(10, 'APP  Driver sees the Guest on the trip they HOLD', 'authenticated', :DR1,
 $$create temp table kv_o on commit drop as select passenger_name, reference from mission_read where id = '11111111-0000-0000-0000-0000000000a3'$$,
 $$select passenger_name || '/' || reference from kv_o$$, 'ok rows=1 Guest A3/A3', 'ok rows=1 Guest A3/A3'),
(11, 'APP  Business sees its own pooled trip in full', 'authenticated', :DB,
 $$create temp table kv_o on commit drop as select passenger_name, reference, board_file_path, dispatcher_id from mission_read where id = '11111111-0000-0000-0000-0000000000b1'$$,
 $$select passenger_name || '/' || reference || '/' || (board_file_path is not null) || '/' || (dispatcher_id is not null) from kv_o$$,
 'ok rows=1 Grace Kelly/ROOM-512/true/true', 'ok rows=1 Grace Kelly/ROOM-512/true/true'),
(12, 'APP  Driver accepts a pooled trip (honest fare)', 'authenticated', :DR1,
 $$select accept_mission_call('11111111-0000-0000-0000-0000000000b1', 90)$$,
 $$select status || ' ' || accepted_fare from mission where id = '11111111-0000-0000-0000-0000000000b1'$$,
 'ok rows=1 confirmed 90.00', 'ok rows=1 confirmed 90.00'),
(13, 'APP  the lazy sweep, from a signed-in page', 'authenticated', :DR1,
 $$select expire_stale_missions(), sweep_lapsed_holds()$$, null, 'ok rows=1', 'ok rows=1'),
(14, 'APP  Driver reads own trips on the mission TABLE (layout badge)', 'authenticated', :DR1,
 $$select id from mission where driver_id = '0000000e-0000-0000-0000-000000000001'$$, null, 'ok rows=4', 'ok rows=4'),

-- ─── the holes ──────────────────────────────────────────────────────────────────────────────
(20, 'HOLE a Driver who only signed up reads the Pool (view)', 'authenticated', :DR2,
 $$select 1 from mission_read where status = 'pooled'$$, null, 'ok rows=2', 'ok rows=0'),
(21, 'HOLE an approved Driver reads the Guest on a pooled trip (view)', 'authenticated', :DR1,
 $$create temp table kv_o on commit drop as select passenger_name, passenger_names, reference, board_name, board_file_path, driver_message, dispatcher_id from mission_read where id = '11111111-0000-0000-0000-0000000000b1'$$,
 $$select coalesce(passenger_name, '-') || '/' || coalesce(reference, '-') || '/' || coalesce(board_file_path, '-') || '/' || (dispatcher_id is not null) || ' flight=' || (select flight_number from mission_read where id = '11111111-0000-0000-0000-0000000000b1') from kv_o$$,
 'ok rows=1 Grace Kelly/ROOM-512/mission/%/true flight=AF123', 'ok rows=1 -/-/-/false flight=AF123'),
(22, 'HOLE a Driver who only signed up reads the Guest from the mission TABLE', 'authenticated', :DR2,
 $$select passenger_name, reference from mission where id = '11111111-0000-0000-0000-0000000000b1'$$, null, 'ok rows=1', 'ok rows=0'),
(23, 'HOLE Business A re-points its change request at Business B''s confirmed trip', 'authenticated', :DA,
 $$update mission_amendment set mission_id = '11111111-0000-0000-0000-0000000000b2', new_fare = 500 where id = '22222222-0000-0000-0000-0000000000a3'$$,
 null, 'ok rows=1', 'refused 42501%'),
(24, 'HOLE Business switches new_fare / drop-off after its Driver saw the request', 'authenticated', :DA,
 $$update mission_amendment set new_fare = 5, new_dropoff_address = 'Monaco' where id = '22222222-0000-0000-0000-0000000000a3'$$,
 null, 'ok rows=1', 'refused 42501%'),
(25, 'HOLE Business marks its request "declined" in the Driver''s name', 'authenticated', :DA,
 $$update mission_amendment set status = 'declined', decline_reason = 'Driver: I refuse' where id = '22222222-0000-0000-0000-0000000000a3'$$,
 null, 'ok rows=1', 'refused 42501%'),
(26, 'HOLE Business inserts a request already "accepted"', 'authenticated', :DA,
 $$insert into mission_amendment (mission_id, business_id, status, new_pickup_address, new_fare, from_snapshot)
   values ('11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', 'accepted', 'X', 999, '{}')$$,
 null, 'ok rows=1', 'refused 42501%'),
(27, 'HOLE Business posts a trip naming another Business''s Dispatcher', 'authenticated', :DA,
 $$insert into mission (business_id, dispatcher_id, status, category, pickup_address, pickup_at, ceiling)
   values ('0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000002', 'draft', 'business', 'X', now() + interval '1 day', 100)$$,
 null, 'ok rows=1', 'refused 42501%'),
(28, 'HOLE Business moves its trip onto another Business''s Dispatcher', 'authenticated', :DA,
 $$update mission set dispatcher_id = '0000000d-0000-0000-0000-000000000002' where id = '11111111-0000-0000-0000-0000000000a1'$$,
 null, 'ok rows=1', 'refused 42501%'),
(29, 'HOLE info-change log row signed by another Business''s Dispatcher', 'authenticated', :DA,
 $$insert into mission_info_change (mission_id, business_id, edited_by, items)
   values ('11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000002', '[]')$$,
 null, 'ok rows=1', 'refused 42501%'),
(30, 'HOLE info-change log row back-dated', 'authenticated', :DA,
 $$insert into mission_info_change (mission_id, business_id, items, created_at)
   values ('11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', '[]', '2020-01-01')$$,
 null, 'ok rows=1', 'refused 42501%'),
(31, 'HOLE Business rewrites the Guest on a COMPLETED trip (the Waybill)', 'authenticated', :DA,
 $$update mission set passenger_name = 'Someone else' where id = '11111111-0000-0000-0000-0000000000a4'$$,
 null, 'ok rows=1', 'ok rows=0'),
(32, 'HOLE Driver inserts a back-dated "arrived" step', 'authenticated', :DR1,
 $$insert into status_event (mission_id, status, created_at) values ('11111111-0000-0000-0000-0000000000a3', 'arrived', '2020-01-01')$$,
 null, 'ok rows=1', 'refused 42501%'),
(33, 'HOLE Business points its sign file at a Driver''s papers', 'authenticated', :DA,
 $$update mission set board_file_path = 'driver/0000000e-0000-0000-0000-000000000001/vtc_card-1758000000000.pdf'
    where id = '11111111-0000-0000-0000-0000000000a3'$$,
 null, 'ok rows=1', 'refused 42501%'),
(34, 'HOLE signed-out visitor runs the clean-up sweeps', 'anon', null,
 $$select expire_stale_missions(), sweep_lapsed_holds()$$, null, 'ok rows=1', 'refused 42501%'),

-- ─── the locks: privileges only RLS stood behind ────────────────────────────────────────────
(40, 'LOCK signed-out SELECT on mission (RLS gave 0 rows)', 'anon', null,
 $$select 1 from mission$$, null, 'ok rows=0', 'refused 42501%'),
(41, 'LOCK signed-out SELECT on commission_rate (driver_rate_ht included)', 'anon', null,
 $$select driver_rate_ht from commission_rate$$, null, 'ok rows=0', 'refused 42501%'),
(42, 'LOCK signed-out UPDATE on driver (already shut by 2026-09-11b)', 'anon', null,
 $$update driver set verified = true$$, null, 'refused 42501%', 'refused 42501%'),
(43, 'LOCK signed-in UPDATE of profile.role (RLS gave 0 rows)', 'authenticated', :DR2,
 $$update profile set role = 'admin' where auth_user_id = 'dddddddd-0000-0000-0000-00000000000d'$$,
 null, 'ok rows=0', 'refused 42501%'),
(44, 'LOCK signed-in DELETE on document', 'authenticated', :DR1,
 $$delete from document$$, null, 'ok rows=0', 'refused 42501%'),
(45, 'LOCK signed-in TRUNCATE (RLS does not apply to TRUNCATE)', 'authenticated', :DR1,
 $$truncate status_event$$, null, 'ok rows=0', 'refused 42501%'),
(46, 'LOCK signed-in INSERT on mission_cancellation', 'authenticated', :DA,
 $$insert into mission_cancellation (mission_id, business_id, party, kind, fee_pct, fee_amount)
   values ('11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', 'business', 'x', 0, 0)$$,
 null, 'refused 42501%', 'refused 42501%'),
(47, 'LOCK signed-in UPDATE on mission_release', 'authenticated', :DA,
 $$update mission_release set from_fare = 1$$, null, 'ok rows=0', 'refused 42501%'),
(48, 'LOCK signed-in writes through mission_read (D145 — must stay shut)', 'authenticated', :DA,
 $$update mission_read set pickup_label = 'x'$$, null, 'refused 42501%', 'refused 42501%'),

-- ─── money: the fee/fare basis comes from the row, not the caller (migration B) ─────────────────
(50, 'APP  Business cancels its confirmed trip honestly (basis = accepted_fare 90; a trip >5h out is a 0%% fee)', 'authenticated', :DA,
 $$select business_cancel_mission_call('11111111-0000-0000-0000-0000000000a3', 'x', 90)$$,
 $$select fare_snapshot from mission_cancellation where mission_id = '11111111-0000-0000-0000-0000000000a3' order by created_at desc limit 1$$,
 'ok rows=1 90.00', 'ok rows=1 90.00'),
(51, 'HOLE Business cancels sending 0 -> cheapest fee basis', 'authenticated', :DA,
 $$select business_cancel_mission_call('11111111-0000-0000-0000-0000000000a3', 'x', 0)$$,
 $$select fare_snapshot from mission_cancellation where mission_id = '11111111-0000-0000-0000-0000000000a3' order by created_at desc limit 1$$,
 'ok rows=1 60.00', 'ok rows=1 90.00'),
(52, 'HOLE Driver cancels sending 0 -> penalty on the floor not the fare', 'authenticated', :DR1,
 $$select driver_cancel_mission_call('11111111-0000-0000-0000-0000000000a3', 'x', 0)$$,
 $$select fee_amount from mission_cancellation where mission_id = '11111111-0000-0000-0000-0000000000a3' order by created_at desc limit 1$$,
 'ok rows=1 60.00', 'ok rows=1 90.00'),
(53, 'HOLE Business declares no-show with a forged fee (-500)', 'authenticated', :DB,
 $$select business_declare_no_show_call('11111111-0000-0000-0000-0000000000b3', -500)$$,
 $$select fee_amount from mission_cancellation where mission_id = '11111111-0000-0000-0000-0000000000b3' order by created_at desc limit 1$$,
 'ok rows=1 -500.00', 'ok rows=1 150.00'),
(54, 'HOLE Driver marks no-show with a forged fee (99999)', 'authenticated', :DR1,
 $$select mark_no_show_call('11111111-0000-0000-0000-0000000000b3', 99999)$$,
 $$select fee_amount from mission_cancellation where mission_id = '11111111-0000-0000-0000-0000000000b3' order by created_at desc limit 1$$,
 'ok rows=1 99999.00', 'ok rows=1 150.00'),
(55, 'HOLE Business names another Business Dispatcher as release author, negative fare', 'authenticated', :DA,
 $$select propose_release('11111111-0000-0000-0000-0000000000a3', 'note', -1234, '0000000d-0000-0000-0000-000000000002')$$,
 $$select proposed_by || '/' || coalesce(from_fare::text,'null') from mission_release where mission_id='11111111-0000-0000-0000-0000000000a3' order by created_at desc limit 1$$,
 'ok rows=1 0000000d-0000-0000-0000-000000000002/-1234.00', 'ok rows=1 0000000d-0000-0000-0000-000000000001/90.00'),
(56, 'APP  Driver logs a Pool impression on a pooled trip (allowed)', 'authenticated', :DR1,
 $$select log_mission_event('11111111-0000-0000-0000-0000000000b1', 'pool_impression', '{}')$$,
 null, 'ok rows=1', 'ok rows=1'),
(57, 'HOLE Driver logs an event on a CONFIRMED trip they do not hold', 'authenticated', :DR2,
 $$select log_mission_event('11111111-0000-0000-0000-0000000000b2', 'contact_revealed', '{}')$$,
 null, 'ok rows=1', 'refused P0001%'),
(58, 'NOTE the raw accept fare still clamps to the ceiling (finding #1, NOT fixed here)', 'authenticated', :DR1,
 $$select accept_mission_call('11111111-0000-0000-0000-0000000000b1', 999999)$$,
 $$select accepted_fare from mission where id='11111111-0000-0000-0000-0000000000b1'$$,
 'ok rows=1 150.00', 'ok rows=1 150.00');
