-- S83 — raise the Ceiling / change the car (2026-09-18c/d), case by case. Every case runs as a
-- real role (anon / authenticated / service_role / postgres) with a real JWT `sub`, inside a
-- subtransaction that is ALWAYS rolled back, so no case sees another's write. Runs AFTER the
-- migrations only (the functions do not exist before them).
--   APP     what the Dispatch screen does, which must work
--   REFUSE  what must be refused, with the reason the server action turns into words
--   RECORD  what the trigger must — and must not — write
--   WALL    the D144 freeze and the new column's walls, still standing
-- Trips: see fixtures.sql.

-- ── the runner (from .local/probe/rls-audit/cases.sql, S83) ─────────────────────────────────────
create schema kv;
set search_path = kv, public;
create table kv_case (n int primary key, label text not null, as_role text not null, sub uuid,
                      sql text not null, check_sql text, want text not null);
create table kv_result (n int, label text, want text, got text, pass boolean);

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
    perform set_config('request.jwt.claims', '', true);
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

create or replace function kv_run() returns void language plpgsql as $$
declare c kv.kv_case; v_got text;
begin
  for c in select * from kv.kv_case order by n loop
    v_got := kv.kv_try(c.as_role, c.sub, c.sql, c.check_sql);
    insert into kv.kv_result values (c.n, c.label, c.want, v_got, v_got like c.want);
  end loop;
end;
$$;

-- What a trip's price terms read: Ceiling|floor|steps|class|body|make
create or replace function kv.t(p uuid) returns text language sql as $$
  select ceiling || '|' || coalesce(pdp_start::text, '-') || '|' || coalesce(pdp_step_count::text, 'null')
         || '|' || category || '|' || coalesce(required_body_type::text, 'any') || '|' || coalesce(required_make, '-')
    from public.mission where id = p
$$;
-- The price-terms events on a trip: n=<count> then type:actor:via:all_in_from>all_in_to, oldest first
create or replace function kv.ev(p uuid) returns text language sql as $$
  select 'n=' || count(*) || coalesce(' ' || string_agg(
           event_type || ':' || actor_kind || ':' || coalesce(payload ->> 'via', '-') || ':'
           || coalesce(payload ->> 'all_in_from', '-') || '>' || coalesce(payload ->> 'all_in_to', '-'),
           ' ' order by seq), '')
    from public.mission_event
   where mission_id = p and event_type in ('ceiling_raised', 'trip_car_changed', 'price_terms_changed')
$$;

\set DA  '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set DB  '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set DR1 '''cccccccc-0000-0000-0000-00000000000c'''
\set T1  '''20000000-0000-0000-0000-000000000001'''
\set T2  '''20000000-0000-0000-0000-000000000002'''
\set T3  '''20000000-0000-0000-0000-000000000003'''
\set T4  '''20000000-0000-0000-0000-000000000004'''
\set T5  '''20000000-0000-0000-0000-000000000005'''
\set T6  '''20000000-0000-0000-0000-000000000006'''
\set T7  '''20000000-0000-0000-0000-000000000007'''
\set T8  '''20000000-0000-0000-0000-000000000008'''
\set T9  '''20000000-0000-0000-0000-000000000009'''
\set T10 '''20000000-0000-0000-0000-000000000010'''
\set T11 '''20000000-0000-0000-0000-000000000011'''
\set T12 '''20000000-0000-0000-0000-000000000012'''
\set T13 '''20000000-0000-0000-0000-000000000013'''
\set T14 '''20000000-0000-0000-0000-000000000014'''
\set T15 '''20000000-0000-0000-0000-000000000015'''

insert into kv_case values
-- ─── raise the Ceiling ──────────────────────────────────────────────────────────────────────────
(1,  'APP     raise 84,52 → 100: Ceiling up, steps frozen at 29, one event named to the Dispatcher', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 100)',
 'select kv.t(''20000000-0000-0000-0000-000000000001'') || '' '' || kv.ev(''20000000-0000-0000-0000-000000000001'')',
 'ok rows=1 100.00|27.35|29|business|sedan|- n=1 ceiling_raised:dispatcher:raise_ceiling:97.20>115.00'),
(2,  'APP     a second raise keeps the FIRST frozen count (29, not the new gap''s)', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 100); select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 130)',
 'select kv.t(''20000000-0000-0000-0000-000000000001'') || '' '' || kv.ev(''20000000-0000-0000-0000-000000000001'')',
 'ok rows=1 130.00|27.35|29|business|sedan|- n=2 ceiling_raised:%:97.20>115.00 ceiling_raised:%:115.00>149.50'),
(3,  'REFUSE  a "raise" to the same Ceiling', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 84.52)', null, 'refused P0001: A raise must be higher%'),
(4,  'REFUSE  a lower Ceiling', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 80)', null, 'refused P0001: A raise must be higher%'),
(5,  'REFUSE  no Ceiling at all', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', null)', null, 'refused P0001: A raise must be higher%'),
(6,  'APP     21 days out: the climb has not opened, so nothing is frozen', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000002'', 100)', 'select kv.t(''20000000-0000-0000-0000-000000000002'')',
 'ok rows=1 100.00|27.35|null|business|sedan|-'),
(7,  'APP     no gap (Ceiling on the floor): nothing to protect, nothing frozen', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000012'', 60)', 'select kv.t(''20000000-0000-0000-0000-000000000012'')',
 'ok rows=1 60.00|27.35|null|business|sedan|-'),
(8,  'REFUSE  a Driver''s LIVE hold', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000003'', 100)', null, 'refused P0001: A Driver is reviewing this trip'),
(9,  'APP     a hold released early (future expires_at) does not block', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000004'', 100)', 'select kv.t(''20000000-0000-0000-0000-000000000004'')',
 'ok rows=1 100.00|27.35|29|%'),
(10, 'APP     an open hold whose clock ran out (unswept) does not block', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000015'', 100)', 'select kv.t(''20000000-0000-0000-0000-000000000015'')',
 'ok rows=1 100.00|27.35|29|%'),
(11, 'REFUSE  a trip a Driver has taken', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000005'', 100)', null, 'refused P0001: This trip is no longer in the Pool'),
(12, 'REFUSE  a pickup already passed', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000010'', 100)', null, 'refused P0001: Mission has expired'),
(13, 'REFUSE  another Business''s trip', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000006'', 100)', null, 'refused P0001: Not your mission'),
(14, 'REFUSE  a trip that does not exist', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000099'', 100)', null, 'refused P0001: Not your mission'),
(15, 'REFUSE  a Driver''s session', 'authenticated', :DR1,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 100)', null, 'refused P0001: Not a dispatcher'),
(16, 'REFUSE  anon', 'anon', null,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 100)', null, 'refused 42501:%'),

-- ─── change the car ─────────────────────────────────────────────────────────────────────────────
(20, 'APP     Business → First, at a price above the new floor: re-priced, floor from the card, frozen 29', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''luxury'', ''sedan'', null, null, 150)',
 'select (ceiling = 150)::text || ''|'' || (pdp_start = public.course_from_business_total(round((select floor_price from public.mission_price(''luxury'', ''sedan'', 24.6, false)), 2), 0.125, 0.2))::text
         || ''|'' || (pdp_step_count = 29)::text || ''|'' || (rate_card_id = (public.rate_card_for(''luxury'', ''sedan'')).id)::text || ''|'' || category
         || '' '' || kv.ev(''20000000-0000-0000-0000-000000000001'') from public.mission where id = ''20000000-0000-0000-0000-000000000001''',
 'ok rows=1 true|true|true|true|luxury n=1 trip_car_changed:dispatcher:change_trip_car:97.20>172.50'),
(21, 'APP     a specific model within the same class and body: the car changes, no price column moves', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''business'', ''sedan'', '' Mercedes-Benz '', ''Classe E'', null)',
 'select kv.t(''20000000-0000-0000-0000-000000000001'') || '' '' || required_model || '' '' || kv.ev(''20000000-0000-0000-0000-000000000001'') from public.mission where id = ''20000000-0000-0000-0000-000000000001''',
 'ok rows=1 84.52|27.35|null|business|sedan|Mercedes-Benz Classe E n=1 trip_car_changed:dispatcher:change_trip_car:97.20>97.20'),
(22, 'APP     Sedan → Any body: one rate-card row, so no price moves', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''business'', null, null, null, null)',
 'select kv.t(''20000000-0000-0000-0000-000000000001'')', 'ok rows=1 84.52|27.35|null|business|any|-'),
(23, 'APP     Eco any → Eco van: one Eco row for every body, no price moves', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000011'', ''eco'', ''van'', null, null, null)',
 'select kv.t(''20000000-0000-0000-0000-000000000011'')', 'ok rows=1 60.00|20.00|null|eco|van|-'),
(24, 'APP     First S-Class → Business sedan (a cheaper car): allowed, floor from the Business card', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000013'', ''business'', ''sedan'', null, null, 80)',
 'select kv.t(''20000000-0000-0000-0000-000000000013'') || '' '' || (pdp_start = public.course_from_business_total(round((select floor_price from public.mission_price(''business'', ''sedan'', 24.6, false)), 2), 0.125, 0.2))::text from public.mission where id = ''20000000-0000-0000-0000-000000000013''',
 'ok rows=1 80.00|%|%|business|sedan|- true'),
(25, 'APP     First S-Class → First BMW Série 7: the model only, no price moves', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000013'', ''luxury'', ''sedan'', ''BMW'', ''Série 7'', null)',
 'select kv.t(''20000000-0000-0000-0000-000000000013'')', 'ok rows=1 200.00|70.00|null|luxury|sedan|BMW'),
(26, 'REFUSE  a new class below its floor', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''luxury'', ''sedan'', null, null, 10)', null,
 'refused P0001: Below the lowest price for this car'),
(27, 'REFUSE  a new class with no Ceiling', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''luxury'', ''sedan'', null, null, null)', null,
 'refused P0001: A new Ceiling is needed for this car'),
(28, 'REFUSE  the same car', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''business'', ''sedan'', null, null, null)', null,
 'refused P0001: Nothing changed'),
(29, 'REFUSE  a luggage run', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000007'', ''business'', ''sedan'', null, null, null)', null,
 'refused P0001: A luggage run is always Business · Van'),
(30, 'REFUSE  a Sedan for six Guests', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000008'', ''business'', ''sedan'', null, null, null)', null,
 'refused P0001: A Sedan seats 4'),
(31, 'REFUSE  a specific car with no body', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''business'', null, ''Mercedes-Benz'', ''Classe E'', null)', null,
 'refused P0001: A specific car needs a body type'),
(32, 'REFUSE  Eco with a specific car', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000011'', ''eco'', ''sedan'', ''Toyota'', ''Prius'', null)', null,
 'refused P0001: Eco has no specific cars'),
(33, 'REFUSE  a make without a model', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''business'', ''sedan'', ''Mercedes-Benz'', '' '', null)', null,
 'refused P0001: A specific car needs both a make and a model'),
(34, 'REFUSE  a price change on a trip with no distance', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000009'', ''luxury'', ''sedan'', null, null, 150)', null,
 'refused P0001: This trip has no distance on record%'),
(35, 'REFUSE  a Ceiling sent where the car does not move the price (no back door to lower it)', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''business'', null, null, null, 50)', null,
 'refused P0001: The price does not change with this car'),
(36, 'REFUSE  the legacy ''van'' class', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''van'', ''van'', null, null, 150)', null,
 'refused P0001: Unknown class'),
(37, 'REFUSE  a Driver''s LIVE hold', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000003'', ''luxury'', ''sedan'', null, null, 150)', null,
 'refused P0001: A Driver is reviewing this trip'),
(38, 'REFUSE  a trip a Driver has taken', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000005'', ''luxury'', ''sedan'', null, null, 150)', null,
 'refused P0001: This trip is no longer in the Pool'),
(39, 'REFUSE  another Business''s trip', 'authenticated', :DA,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000006'', ''luxury'', ''sedan'', null, null, 150)', null,
 'refused P0001: Not your mission'),
(40, 'REFUSE  a Driver''s session', 'authenticated', :DR1,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''luxury'', ''sedan'', null, null, 150)', null,
 'refused P0001: Not a dispatcher'),
(41, 'REFUSE  anon', 'anon', null,
 'select public.change_trip_car(''20000000-0000-0000-0000-000000000001'', ''luxury'', ''sedan'', null, null, 150)', null,
 'refused 42501:%'),

-- ─── the record ─────────────────────────────────────────────────────────────────────────────────
(50, 'RECORD  a service-role edit of SPEED WIN on a pooled trip is logged, actor unknown', 'service_role', null,
 'update public.mission set speed_win = true where id = ''20000000-0000-0000-0000-000000000001''',
 'select kv.ev(''20000000-0000-0000-0000-000000000001'')', 'ok rows=1 n=1 price_terms_changed:unknown:-:97.20>97.20'),
(51, 'RECORD  an admin SQL raise is logged too (no path skips the record)', 'postgres', null,
 'update public.mission set ceiling = 90 where id = ''20000000-0000-0000-0000-000000000001''',
 'select kv.ev(''20000000-0000-0000-0000-000000000001'')', 'ok rows=1 n=1 ceiling_raised:unknown:-:97.20>103.50'),
(52, 'RECORD  nothing for a change that is not a price term', 'service_role', null,
 'update public.mission set pickup_label = ''Lobby'' where id = ''20000000-0000-0000-0000-000000000001''',
 'select kv.ev(''20000000-0000-0000-0000-000000000001'')', 'ok rows=1 n=0'),
(53, 'RECORD  nothing when a price column is MENTIONED but not changed', 'postgres', null,
 'update public.mission set ceiling = ceiling, category = category where id = ''20000000-0000-0000-0000-000000000001''',
 'select kv.ev(''20000000-0000-0000-0000-000000000001'')', 'ok rows=1 n=0'),
(54, 'RECORD  nothing on a trip that is not in the Pool (an amendment has its own record)', 'postgres', null,
 'update public.mission set ceiling = 95 where id = ''20000000-0000-0000-0000-000000000005''',
 'select kv.ev(''20000000-0000-0000-0000-000000000005'')', 'ok rows=1 n=0'),
(55, 'RECORD  the event is the Business''s to read, and not a Driver''s', 'authenticated', :DA,
 'select public.raise_ceiling(''20000000-0000-0000-0000-000000000001'', 100)',
 'select (select array_to_string(audience, '','') from public.mission_event where mission_id = ''20000000-0000-0000-0000-000000000001'' and event_type = ''ceiling_raised'') || ''|'' || coalesce((select driver_id::text from public.mission_event where mission_id = ''20000000-0000-0000-0000-000000000001'' and event_type = ''ceiling_raised''), ''no-driver'')',
 'ok rows=1 business,admin|no-driver'),

-- ─── the walls ──────────────────────────────────────────────────────────────────────────────────
(60, 'WALL    a browser still cannot PATCH a posted trip''s Ceiling (D144)', 'authenticated', :DA,
 'update public.mission set ceiling = 200 where id = ''20000000-0000-0000-0000-000000000001''', null, 'refused 42501:%'),
(61, 'WALL    nor its class', 'authenticated', :DA,
 'update public.mission set category = ''luxury'' where id = ''20000000-0000-0000-0000-000000000001''', null, 'refused 42501:%'),
(62, 'WALL    nor the new column', 'authenticated', :DA,
 'update public.mission set pdp_step_count = 8 where id = ''20000000-0000-0000-0000-000000000001''', null, 'refused 42501:%'),
(63, 'WALL    nor its status (D144 still stands)', 'authenticated', :DA,
 'update public.mission set status = ''confirmed'' where id = ''20000000-0000-0000-0000-000000000001''', null, 'refused 42501:%'),
(64, 'WALL    the step-count helper is not callable from a browser', 'authenticated', :DA,
 'select public.pdp_ladder_steps(100, 30, false)', null, 'refused 42501:%'),
(65, 'WALL    nor the all-in → Course helper', 'authenticated', :DA,
 'select public.course_from_business_total(100, 0.125, 0.2)', null, 'refused 42501:%'),
(66, 'APP     the Business reads the frozen count through mission_read', 'authenticated', :DA,
 'select 1 from public.mission_read where id = ''20000000-0000-0000-0000-000000000014'' and pdp_step_count = 20', null, 'ok rows=1'),
(67, 'WALL    a Driver browsing the Pool does NOT (≈ the Ceiling ÷ 2)', 'authenticated', :DR1,
 'select 1 from public.mission_read where id = ''20000000-0000-0000-0000-000000000014'' and pdp_step_count is null and ceiling is null', null, 'ok rows=1'),
(68, 'WALL    anon reads nothing from mission_read', 'anon', null,
 'select 1 from public.mission_read limit 1', null, 'refused 42501:%');
