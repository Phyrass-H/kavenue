-- S82 — a STAND-IN for the parts of the live database that decide who may write `mission`.
-- ⚑ THROW-AWAY POSTGRES ONLY. Never run against Supabase. `run.sh` refuses any host but 127.0.0.1.
--
-- What is REAL here (read verbatim from docs/ by run.sh, never retyped):
--   the mission policies (docs/kavenue_schema.sql 309-322) · 2026-08-31d's SELECT grant ·
--   2026-08-31e's commission_rate wall · 2026-08-31f's UPDATE grant · 2026-09-04's
--   standard_vat_rate SELECT grant · the guest_ready_at guard (2026-07-22 fix) · the
--   pickup_at guard (2026-07-22_waiting_fee.sql § 8) · commission_for() (2026-08-17).
-- What is STOOD IN: the roles and auth.uid() Supabase ships, the mission table's columns
-- (from the migrations' add-column lines, S82), the people tables, and one SECURITY DEFINER
-- RPC shaped like accept_mission (it writes money as the function owner).
-- Left out on purpose: the event log, the vehicle gate and the transport-VAT snapshot. They
-- fire on `insert` / `update of driver_id` / `update of status` and write other tables or
-- NEW.vehicle_*; none of them grants or refuses a client write.

-- ── Supabase's roles and auth.uid() ─────────────────────────────────────────
-- roles are cluster-wide: they outlive a dropped database, so create them only once
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
grant usage on schema auth, public to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants ALL on every new public table to these three. That default is the
-- whole reason a column-level revoke is a no-op (2026-08-31d/e/f).
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create type mission_status     as enum ('draft','pooled','accepted','confirmed','en_route','arrived','on_board','completed','cancelled','expired');
create type mission_type       as enum ('transfer','hourly');
create type vehicle_category   as enum ('eco','business','first');
create type cancellation_party as enum ('driver','business','system');
create type user_role          as enum ('driver','dispatcher','admin');
create type body_type          as enum ('sedan','van','suv');

create table profile    (auth_user_id uuid primary key, role user_role not null);
create table business   (id uuid primary key default gen_random_uuid(), name text);
create table dispatcher (id uuid primary key default gen_random_uuid(), business_id uuid not null references business(id), auth_user_id uuid);
create table driver     (id uuid primary key default gen_random_uuid(), auth_user_id uuid);
create table vehicle    (id uuid primary key default gen_random_uuid());
create table rate_card  (id uuid primary key default gen_random_uuid());

create table commission_rate (
  id                 uuid primary key default gen_random_uuid(),
  effective_from     timestamptz not null default now(),
  business_rate_ht   numeric(6,5) not null,
  driver_rate_ht     numeric(6,5) not null,
  fee_vat_rate       numeric(6,5) not null,
  transport_vat_rate numeric(6,5) not null,
  standard_vat_rate  numeric(6,5) not null,
  note               text,
  created_at         timestamptz not null default now()
);

create table mission (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business(id) on delete cascade,
  dispatcher_id uuid not null references dispatcher(id),
  driver_id     uuid references driver(id),
  status        mission_status not null default 'draft',
  mission_type  mission_type   not null default 'transfer',
  group_id      uuid,
  category      vehicle_category not null,
  zone          text,
  pickup_address  text not null,
  pickup_lat      double precision,
  pickup_lng      double precision,
  dropoff_address text,
  dropoff_lat     double precision,
  dropoff_lng     double precision,
  waypoints       jsonb,
  pickup_at       timestamptz not null,
  flight_number   text,
  flight_eta      timestamptz,
  passenger_name  text,
  pax_count       int,
  luggage_count   int,
  comment         text,
  base_fare    numeric(10,2),
  ceiling      numeric(10,2) not null,
  pdp_start    numeric(10,2),
  pdp_step     numeric(10,2),
  pdp_interval int,
  speed_win    boolean not null default false,
  cancelled_by cancellation_party,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  confirmed_at timestamptz,
  -- added by later migrations
  accepted_fare numeric(10,2),
  board_file_path text, board_name text, dress_code text, driver_flags jsonb, driver_message text,
  cancellation_fee numeric(10,2), cancellation_reason text,
  checked_in_at timestamptz, close_answer text, close_answered_at timestamptz,
  commission_business_rate numeric(6,5), commission_driver_rate numeric(6,5), commission_vat_rate numeric(6,5),
  transport_vat_rate numeric(6,5), standard_vat_rate numeric(6,5),
  distance_km numeric(6,1), duration_min integer,
  guest_ready_at timestamptz, info_edited_at timestamptz,
  hold_expires_at timestamptz,
  luggage_only boolean not null default false,
  night_applied boolean not null default false,
  no_show boolean not null default false, no_show_at timestamptz, no_show_by cancellation_party,
  passenger_names jsonb, pickup_label text, dropoff_label text,
  pooled_at timestamptz,
  rate_card_id uuid references rate_card(id),
  reference text,
  required_body_type body_type, required_make text, required_model text, required_languages text[],
  stops_reached int not null default 0,
  vehicle_id uuid references vehicle(id),
  vehicle_plate text, vehicle_make text, vehicle_model text, vehicle_colour text, vehicle_body_type text,
  vehicle_seats int, vehicle_energy text, vehicle_first_registration_date date,
  waiting_from timestamptz, waiting_to timestamptz, waiting_minutes int,
  waiting_rate numeric(10,2), waiting_fee numeric(10,2)
);
alter table mission enable row level security;

-- ── the schema's own helpers (docs/kavenue_schema.sql 191-204, verbatim) ────
create or replace function app_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profile where auth_user_id = auth.uid()
$$;
create or replace function current_driver_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from driver where auth_user_id = auth.uid()
$$;
create or replace function current_business_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select business_id from dispatcher where auth_user_id = auth.uid() limit 1
$$;

-- ── a SECURITY DEFINER writer, shaped like accept_mission ────────────────────
-- It must keep writing money after the lock: inside it, current_user is its OWNER.
create or replace function standin_accept(p_mission_id uuid, p_fare numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update mission set
    driver_id = current_driver_id(), status = 'confirmed', accepted_at = now(),
    confirmed_at = now(), accepted_fare = p_fare, transport_vat_rate = 0.10000
  where id = p_mission_id and status = 'pooled';
end;
$$;
