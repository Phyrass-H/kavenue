-- 2026-09-12 · M3 of 6 — THE TWO CHANGE LOGS. Safe to re-run.
--
-- ⚑ WHY. The founder, 2026-09-12: *"yes, keep the driver's history too"*. Until now a car and
-- a Driver were rows that every save overwrote — no old value, no date, no actor. Three
-- questions were therefore unanswerable for ever, and this file is what makes them answerable
-- from today (never backwards — see the baseline note):
--
--   • when did this Driver change car or plate, from what to what, and who did it?
--   • how many First cars did we have in March?
--   • could ANY car have reached this trip before it expired, or did we simply have none?
--     ⚑ [[d87]] assumed that last one could be answered later "by a query over data already
--     stored". It cannot: base, radius, luggage opt-in, `verified` and the car's own class are
--     all overwritten in place, so a replay uses today's fleet, not the one on the day.
--
-- ⚑ TRIGGER-WRITTEN, NOT APP-WRITTEN. Every write to `vehicle` runs as the service role
-- (2026-09-11b closed the browser door), and enrollment, Settings, the admin screen, the seeds
-- and any future tool all reach the same table. One AFTER trigger catches all of them; an app
-- call would be five call sites and the sixth writer would be silent. Same reasoning as
-- 2026-08-24's `db_trigger` half of the event log.
--
-- ⚑ AND THE ACTOR HAS TO BE HANDED IN. `auth.uid()` is NULL inside these triggers, because the
-- writer is the service role. So each write path sets `last_written_by` / `last_written_via`
-- (M1) in the same UPDATE, and the trigger copies them. A log that says "somebody changed the
-- class" is worth much less than one that says "the admin screen did, on the 12th".
--
-- Applied by the founder in the Supabase SQL editor.

-- ── 1 · the two tables ──────────────────────────────────────────────────────────────────
--
-- Shaped on business_event (2026-08-30), not mission_event: these are things that happen to
-- an ACCOUNT, and mission_event requires a mission_id.
-- ⚑ NO FOREIGN KEY on vehicle_id / driver_id, deliberately: a log that a delete can silently
-- take with it is not a log. `mission_event` made the same call for the same reason.
create table if not exists vehicle_event (
  id            uuid primary key default gen_random_uuid(),
  seq           bigserial,
  vehicle_id    uuid not null,
  driver_id     uuid,
  event_type    text not null,
  occurred_at   timestamptz not null default clock_timestamp(),
  actor_user_id uuid,
  actor_via     text,
  source        text not null default 'db_trigger',
  payload       jsonb not null default '{}'::jsonb
);

create table if not exists driver_event (
  id            uuid primary key default gen_random_uuid(),
  seq           bigserial,
  driver_id     uuid not null,
  event_type    text not null,
  occurred_at   timestamptz not null default clock_timestamp(),
  actor_user_id uuid,
  actor_via     text,
  source        text not null default 'db_trigger',
  payload       jsonb not null default '{}'::jsonb
);

comment on table vehicle_event is
  'Append-only history of every car row: filed, corrected, approved, rejected, retired, and every field change with its old and new value. Written by a trigger, so every door is covered.';
comment on table driver_event is
  'Append-only history of the Driver facts that decide who sees a trip (base, radius, luggage opt-in, verified) plus company identity. Written by a trigger.';
comment on column vehicle_event.payload is
  'Only the columns that actually changed, as {column: [old, new]}. An update that changes nothing writes no row at all.';
comment on column vehicle_event.actor_via is
  'Which door: onboarding | settings | admin | seed. NULL means the writer did not say, which is itself worth knowing — it is never guessed.';

create index if not exists vehicle_event_vehicle_idx on vehicle_event (vehicle_id, occurred_at desc);
create index if not exists vehicle_event_driver_idx  on vehicle_event (driver_id,  occurred_at desc);
create index if not exists driver_event_driver_idx   on driver_event  (driver_id,  occurred_at desc);

-- ── 2 · the diff ────────────────────────────────────────────────────────────────────────
--
-- ⚑ WHAT IT MUST NOT DO: write a row for an UPDATE that changed nothing. Next.js server
-- actions re-save whole forms, so a Driver pressing Save twice would otherwise file a second
-- "change" that never happened — and a log with invented entries is worse than none.
create or replace function jsonb_changes(o jsonb, n jsonb, ignore text[])
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, jsonb_build_array(o -> key, n -> key)), '{}'::jsonb)
    from (select jsonb_object_keys(o) as key union select jsonb_object_keys(n)) k
   where not (k.key = any(ignore))
     and (o -> k.key) is distinct from (n -> k.key);
$$;

comment on function jsonb_changes(jsonb, jsonb, text[]) is
  'The columns that really changed, as {col: [old, new]}. Returns {} when nothing did — the caller must skip the write in that case.';

-- ── 3 · the car trigger ─────────────────────────────────────────────────────────────────
create or replace function vehicle_event_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb;
  v_type    text;
begin
  if tg_op = 'INSERT' then
    insert into vehicle_event (vehicle_id, driver_id, event_type, actor_user_id, actor_via, payload)
    values (new.id, new.driver_id, 'filed', new.last_written_by, new.last_written_via,
            jsonb_build_object('make', new.make, 'model', new.model, 'plate', new.plate,
                               'category', new.category, 'body_type', new.body_type,
                               'approval_status', new.approval_status));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into vehicle_event (vehicle_id, driver_id, event_type, payload)
    values (old.id, old.driver_id, 'deleted', jsonb_build_object('plate', old.plate));
    return old;
  end if;

  -- ⚑ The bookkeeping columns are excluded from the diff, or every write logs the fact that
  --   it was a write. `id` too: it cannot change and a row saying so is noise.
  -- ⚑ `replaced_by` is excluded with the bookkeeping columns, and that is not cosmetic:
  --   replace_vehicle() retires the old row and then writes the pointer forward in a second
  --   statement, so without this a replacement files "retired" AND a second "corrected" event
  --   about a column no person touched. Caught by running the migration against a throw-away
  --   Postgres and reading the log it produced.
  v_changes := jsonb_changes(to_jsonb(old), to_jsonb(new),
                             array['id', 'created_at', 'replaced_by',
                                   'last_written_by', 'last_written_via']);
  if v_changes = '{}'::jsonb then
    return new;   -- nothing changed: no row. A re-saved form is not a change.
  end if;

  -- The name says what a reader is looking for. A field change and an approval are both
  -- "updates" to Postgres and completely different events to a person.
  v_type := case
    when v_changes ? 'retired_at'      and new.retired_at is not null      then 'retired'
    when v_changes ? 'approval_status' and new.approval_status = 'approved' then 'approved'
    when v_changes ? 'approval_status' and new.approval_status = 'rejected' then 'rejected'
    when v_changes ? 'approval_status' and new.approval_status = 'pending'  then 'refiled'
    else 'corrected'
  end;

  insert into vehicle_event (vehicle_id, driver_id, event_type, actor_user_id, actor_via, payload)
  values (new.id, new.driver_id, v_type, new.last_written_by, new.last_written_via, v_changes);
  return new;
end;
$$;

drop trigger if exists vehicle_event_write on vehicle;
create trigger vehicle_event_write
  after insert or update or delete on vehicle
  for each row
  execute function vehicle_event_write();

-- ── 4 · the Driver trigger ──────────────────────────────────────────────────────────────
--
-- ⚑ WHICH COLUMNS MATTER, AND WHY THESE. Everything `lib/eligibility.ts` reads about the
-- person, so that "who could have taken this trip?" is replayable: accepts_luggage_runs,
-- base_lat, base_lng, service_radius_km, verified. Plus the base area (city / département /
-- région / country), because step 6 reports by area and an area that moved silently would
-- make last month's report unreproducible. Plus the company identity, because a SIRET that
-- changes is exactly the thing a support person will be asked about later.
create or replace function driver_event_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_type    text;
  v_key     text;
  v_watched text[] := array[
    'verified', 'accepts_luggage_runs', 'service_radius_km', 'base_lat', 'base_lng',
    'base_label', 'base_city', 'base_postcode', 'base_departement', 'base_region',
    'base_country', 'company_name', 'siret', 'vat_number', 'revtc_number',
    'pro_card_number', 'registered_address', 'phone', 'email'
  ];
begin
  if tg_op <> 'UPDATE' then
    return new;   -- a Driver appearing is already in driver.created_at; this log is for change.
  end if;

  v_all := jsonb_changes(to_jsonb(old), to_jsonb(new), array['last_written_by', 'last_written_via']);
  foreach v_key in array v_watched loop
    if v_all ? v_key then
      v_changes := v_changes || jsonb_build_object(v_key, v_all -> v_key);
    end if;
  end loop;

  if v_changes = '{}'::jsonb then
    return new;
  end if;

  v_type := case
    when v_changes ? 'verified' and new.verified      then 'approved'
    when v_changes ? 'verified' and not new.verified  then 'suspended'
    when v_changes ?| array['base_lat', 'base_lng', 'service_radius_km', 'accepts_luggage_runs']
                                                      then 'reach_changed'
    else 'corrected'
  end;

  insert into driver_event (driver_id, event_type, actor_user_id, actor_via, payload)
  values (new.id, v_type, new.last_written_by, new.last_written_via, v_changes);
  return new;
end;
$$;

drop trigger if exists driver_event_write on driver;
create trigger driver_event_write
  after update on driver
  for each row
  execute function driver_event_write();

-- ⚑ NO BASELINE ROW IS WRITTEN FOR THE 14 CARS ALREADY HERE. A row saying "this is how the car
-- looked on 12 September" would be an observation nobody made — the honest statement is that
-- the history starts today. Every screen built on these logs must say "since 12 September
-- 2026" rather than implying it knows what came before.

-- ── 5 · who may read them ───────────────────────────────────────────────────────────────
--
-- ⚑ THE PAYLOAD IS PERSONAL DATA. A driver_event carries SIRET, phone, address. Deny by
-- default, admin reads everything, a Driver reads their own — and nobody writes, because the
-- only legitimate writer is the trigger, which runs as the definer.
alter table vehicle_event enable row level security;
alter table driver_event  enable row level security;

drop policy if exists p_vehicle_event_admin_read on vehicle_event;
drop policy if exists p_vehicle_event_own_read   on vehicle_event;
drop policy if exists p_driver_event_admin_read  on driver_event;
drop policy if exists p_driver_event_own_read    on driver_event;

create policy p_vehicle_event_admin_read on vehicle_event for select
  using (app_role() = 'admin');
create policy p_vehicle_event_own_read on vehicle_event for select
  using (driver_id is not null and driver_id = current_driver_id());
create policy p_driver_event_admin_read on driver_event for select
  using (app_role() = 'admin');
create policy p_driver_event_own_read on driver_event for select
  using (driver_id = current_driver_id());

revoke insert, update, delete, truncate on vehicle_event from authenticated, anon;
revoke insert, update, delete, truncate on driver_event  from authenticated, anon;
grant  select on vehicle_event to authenticated;
grant  select on driver_event  to authenticated;

notify pgrst, 'reload schema';
