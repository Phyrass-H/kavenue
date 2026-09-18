-- S83 — the people and trips every case runs against, on the REPLAYED schema (replay.sh).
-- ⚑ THROW-AWAY POSTGRES ONLY. Inserted as postgres (the table owner), so RLS does not apply here;
--   every CASE then runs as anon / authenticated with a real JWT `sub` (cases.sql).
--
--   DA  = Business A's Dispatcher        DB  = Business B's Dispatcher
--   DR1 = a Driver with an approved Business sedan (can work)
--   DR2 = a Driver who only signed up: profile + driver row, car PENDING, nothing approved
--   Trips: A1 draft · A2 pooled · A3 confirmed (DR1, 90) · A4 completed (DR1)
--          B1 pooled (Guest "Grace Kelly", AF123, ref ROOM-512) · B2 confirmed (DR1, 150)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'da@example.test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'db@example.test'),
  ('cccccccc-0000-0000-0000-00000000000c', 'dr1@example.test'),
  ('dddddddd-0000-0000-0000-00000000000d', 'dr2@example.test');
insert into profile (auth_user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'dispatcher'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'dispatcher'),
  ('cccccccc-0000-0000-0000-00000000000c', 'driver'),
  ('dddddddd-0000-0000-0000-00000000000d', 'driver');
insert into business (id, name) values
  ('0000000a-0000-0000-0000-000000000001', 'Business A'),
  ('0000000a-0000-0000-0000-000000000002', 'Business B');
insert into dispatcher (id, business_id, auth_user_id, name, phone) values
  ('0000000d-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Disp A', '+33 6 00 00 00 01'),
  ('0000000d-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Disp B', '+33 6 00 00 00 02');
insert into driver (id, auth_user_id, first_name, last_name, verified) values
  ('0000000e-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-00000000000c', 'Dri', 'One', true),
  ('0000000e-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-00000000000d', 'Dri', 'Two', false);
insert into vehicle (id, driver_id, category, body_type, approval_status) values
  ('0000000c-0000-0000-0000-000000000001', '0000000e-0000-0000-0000-000000000001', 'business', 'sedan', 'approved'),
  ('0000000c-0000-0000-0000-000000000002', '0000000e-0000-0000-0000-000000000002', 'business', 'sedan', 'pending');
insert into document (id, owner_type, owner_id, type, file_url) values
  ('0000000f-0000-0000-0000-000000000001', 'driver', '0000000e-0000-0000-0000-000000000001', 'vtc_card',
   'driver/0000000e-0000-0000-0000-000000000001/vtc_card-1758000000000.pdf');

insert into commission_rate (effective_from, business_rate_ht, driver_rate_ht, fee_vat_rate, transport_vat_rate, standard_vat_rate)
values (now() - interval '30 days', 0.12500, 0.10000, 0.20000, 0.10000, 0.20000);

insert into mission (id, business_id, dispatcher_id, driver_id, status, category, pickup_address, dropoff_address,
                     pickup_at, ceiling, pdp_start, accepted_fare, passenger_name, flight_number, reference,
                     board_file_path, commission_business_rate, commission_driver_rate, commission_vat_rate, standard_vat_rate) values
  ('11111111-0000-0000-0000-0000000000a1', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', null,
   'draft',     'business', 'Hôtel de Paris', 'Nice T1', now() + interval '2 days', 100, 60, null, 'Guest A1', null, 'A1', null, null, null, null, null),
  ('11111111-0000-0000-0000-0000000000a2', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', null,
   'pooled',    'business', 'Hôtel de Paris', 'Nice T1', now() + interval '2 days', 100, 60, null, 'Guest A2', null, 'A2', null, 0.125, 0.1, 0.2, 0.2),
  ('11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', '0000000e-0000-0000-0000-000000000001',
   'confirmed', 'business', 'Hôtel de Paris', 'Nice T1', now() + interval '2 days', 100, 60, 90, 'Guest A3', null, 'A3', null, 0.125, 0.1, 0.2, 0.2),
  ('11111111-0000-0000-0000-0000000000a4', '0000000a-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', '0000000e-0000-0000-0000-000000000001',
   'completed', 'business', 'Hôtel de Paris', 'Nice T1', now() - interval '2 days', 100, 60, 95, 'Guest A4', null, 'A4', null, 0.125, 0.1, 0.2, 0.2),
  ('11111111-0000-0000-0000-0000000000b1', '0000000a-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000002', null,
   'pooled',    'business', 'Negresco', 'Nice T2', now() + interval '5 days', 150, 90, null, 'Grace Kelly', 'AF123', 'ROOM-512',
   'mission/0000000a-0000-0000-0000-000000000002/board-5e1f.pdf', 0.125, 0.1, 0.2, 0.2),
  ('11111111-0000-0000-0000-0000000000b2', '0000000a-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000002', '0000000e-0000-0000-0000-000000000001',
   'confirmed', 'business', 'Negresco', 'Nice T2', now() + interval '3 days', 150, 90, 150, 'Guest B2', null, 'B2', null, 0.125, 0.1, 0.2, 0.2),
  -- B3: at the pickup, Guest overdue — the no-show cases (53/54) act on this (accepted_fare 150)
  ('11111111-0000-0000-0000-0000000000b3', '0000000a-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000002', '0000000e-0000-0000-0000-000000000001',
   'arrived', 'business', 'Negresco', 'Nice T2', now() - interval '30 minutes', 150, 90, 150, 'Guest B3', null, 'B3', null, 0.125, 0.1, 0.2, 0.2);
update mission set guest_ready_at = now() - interval '2 hours' where id = '11111111-0000-0000-0000-0000000000b3';
insert into status_event (mission_id, status, created_at)
  values ('11111111-0000-0000-0000-0000000000b3', 'arrived', now() - interval '30 minutes');

-- Business A has a change request waiting on its confirmed trip A3 (Driver DR1)
insert into mission_amendment (id, mission_id, business_id, proposed_by, status, new_pickup_address, new_fare, from_snapshot) values
  ('22222222-0000-0000-0000-0000000000a3', '11111111-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001',
   '0000000d-0000-0000-0000-000000000001', 'proposed', 'Monte-Carlo Bay', 120, '{}');
