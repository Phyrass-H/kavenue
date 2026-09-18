-- S83 — the people and trips the raise / change-the-car cases run against, on the REPLAYED live
-- schema (replay.sh: stand-in + kavenue_schema.sql + every migration, 18a/18b included).
-- ⚑ THROW-AWAY POSTGRES ONLY. Inserted as postgres (the table owner): RLS and the D144 guard do
--   not apply here; every CASE then runs as anon / authenticated with a real JWT `sub`.
--
--   DA = Business A's Dispatcher · DB = Business B's Dispatcher · DR1, DR2, DR3 = Drivers with an
--   approved Business sedan (one OPEN hold per Driver is a unique index, so one Driver per hold). Every trip is Business A's, Business · Sedan, 24,6 km, day rate, posted 6 h
--   ago for a pickup in 9 h, Ceiling 84,52 (97,20 all-in), floor 27,35 (31,45) — unless noted:
--     T1  the plain pooled trip            T2  pickup in 21 days (the climb has not opened)
--     T3  a Driver's LIVE hold             T4  a hold released early (future expires_at)
--     T5  confirmed, DR1                   T6  Business B's pooled trip
--     T7  a luggage run (Business · Van)   T8  six Guests, any body
--     T9  no distance on record            T10 pickup already passed
--     T11 Eco, any body                    T12 no gap: Ceiling on the floor
--     T13 First · Sedan · Mercedes-Benz Classe S, Ceiling 200
--     T14 already frozen at 20 steps (for the view's mask)
--     T15 an OPEN hold whose clock has run out, not yet swept (must not block)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'da@example.test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'db@example.test'),
  ('cccccccc-0000-0000-0000-00000000000c', 'dr1@example.test'),
  ('dddddddd-0000-0000-0000-00000000000d', 'dr2@example.test'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'dr3@example.test');
insert into profile (auth_user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'dispatcher'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'dispatcher'),
  ('cccccccc-0000-0000-0000-00000000000c', 'driver'),
  ('dddddddd-0000-0000-0000-00000000000d', 'driver'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'driver');
insert into business (id, name) values
  ('0000000a-0000-0000-0000-000000000001', 'Business A'),
  ('0000000a-0000-0000-0000-000000000002', 'Business B');
insert into dispatcher (id, business_id, auth_user_id, name, phone) values
  ('0000000d-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Disp A', '+33 6 00 00 00 01'),
  ('0000000d-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Disp B', '+33 6 00 00 00 02');
insert into driver (id, auth_user_id, first_name, last_name, verified) values
  ('0000000e-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 'Dri', 'One', true),
  ('0000000e-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-00000000000d', 'Dri', 'Two', true),
  ('0000000e-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-00000000000e', 'Dri', 'Three', true);
insert into vehicle (id, driver_id, category, body_type, approval_status) values
  ('0000000c-0000-0000-0000-000000000001', '0000000e-0000-0000-0000-000000000001', 'business', 'sedan', 'approved'),
  ('0000000c-0000-0000-0000-000000000002', '0000000e-0000-0000-0000-000000000002', 'business', 'sedan', 'approved'),
  ('0000000c-0000-0000-0000-000000000003', '0000000e-0000-0000-0000-000000000003', 'business', 'sedan', 'approved');

-- One template row, then each trip is a variation of it.
create temp table t (like mission including defaults);
insert into t (id, business_id, dispatcher_id, status, category, required_body_type, pickup_address, dropoff_address,
               pickup_at, created_at, ceiling, pdp_start, distance_km, night_applied, pax_count, luggage_only,
               commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate)
values ('20000000-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001',
        'pooled', 'business', 'sedan', 'Hôtel de Paris', 'Nice T1', now() + interval '9 hours', now() - interval '6 hours',
        84.52, 27.35, 24.6, false, 2, false, 0.125, 0.1, 0.2, 0.2);

create or replace function pg_temp.trip(p_n int, p_patch jsonb default '{}') returns void language plpgsql as $$
declare r t;
begin
  select * into r from t limit 1;
  r := jsonb_populate_record(r, to_jsonb(r) || jsonb_build_object('id',
         ('20000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))) || p_patch);
  insert into mission select (r).*;
end $$;

select pg_temp.trip(1);
select pg_temp.trip(2,  jsonb_build_object('pickup_at', now() + interval '21 days', 'created_at', now() - interval '2 hours'));
select pg_temp.trip(3);
select pg_temp.trip(4);
select pg_temp.trip(5,  jsonb_build_object('status', 'confirmed', 'driver_id', '0000000e-0000-0000-0000-000000000001',
                                           'accepted_at', now() - interval '1 hour', 'accepted_fare', 70));
select pg_temp.trip(6,  jsonb_build_object('business_id', '0000000a-0000-0000-0000-000000000002',
                                           'dispatcher_id', '0000000d-0000-0000-0000-000000000002'));
select pg_temp.trip(7,  jsonb_build_object('luggage_only', true, 'required_body_type', 'van'));
select pg_temp.trip(8,  jsonb_build_object('pax_count', 6, 'required_body_type', null));
select pg_temp.trip(9,  jsonb_build_object('distance_km', null));
select pg_temp.trip(10, jsonb_build_object('pickup_at', now() - interval '1 hour', 'created_at', now() - interval '20 hours'));
select pg_temp.trip(11, jsonb_build_object('category', 'eco', 'required_body_type', null, 'ceiling', 60, 'pdp_start', 20));
select pg_temp.trip(12, jsonb_build_object('ceiling', 27.35));
select pg_temp.trip(13, jsonb_build_object('category', 'luxury', 'required_make', 'Mercedes-Benz',
                                           'required_model', 'Classe S', 'ceiling', 200, 'pdp_start', 70));
select pg_temp.trip(14, jsonb_build_object('pdp_step_count', 20));
select pg_temp.trip(15);

-- T3: a live hold (10 minutes — long enough for every case). T4: released early, clock still
-- ahead. T15: open, but its clock has run out and nothing has swept it (the column is truth
-- only against now()).
insert into mission_hold (mission_id, driver_id, held_fare, expires_at, hold_seconds, outcome) values
  ('20000000-0000-0000-0000-000000000003', '0000000e-0000-0000-0000-000000000001', 50, now() + interval '10 minutes', 15, 'open');
insert into mission_hold (mission_id, driver_id, held_fare, expires_at, hold_seconds, outcome) values
  ('20000000-0000-0000-0000-000000000004', '0000000e-0000-0000-0000-000000000002', 50, now() + interval '10 minutes', 15, 'open');
update mission_hold set outcome = 'released', settled_at = now()
 where mission_id = '20000000-0000-0000-0000-000000000004';
insert into mission_hold (mission_id, driver_id, held_fare, expires_at, hold_seconds, outcome) values
  ('20000000-0000-0000-0000-000000000015', '0000000e-0000-0000-0000-000000000003', 50, now() - interval '1 minute', 15, 'open');
