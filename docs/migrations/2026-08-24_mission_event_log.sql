-- ============================================================================
-- 2026-08-24 · § AG — the Event Log.
--
-- WHY NOW: analysis can be added whenever; events you never wrote can never be
-- backfilled. Every week without this is a week of behaviour that is gone.
--
-- WHAT SHIPS: one append-only table, `mission_event`, fed by
--   (1) a SECURITY DEFINER row trigger on `mission` — GUARANTEED for every
--       committed status transition, because it sits BELOW every write path:
--       accept_mission, the expiry sweep, the service-role writes in
--       app/(app)/rides/actions.ts:117-135, and the unguarded direct PATCH that
--       p_mission_business_update (docs/kavenue_schema.sql:320-322 — USING with
--       no WITH CHECK) still permits. The bypass logs itself instead of being
--       closed.
--   (2) explicit app / RPC inserts into the SAME table, marked source<>'db_trigger',
--       for the things the database cannot see: Pool impressions, contact reveals,
--       refused accepts, amendment/release proposals and answers.
--   Anything a reader trusts as complete must be filtered to source='db_trigger'.
--
-- WHAT IS NOT TOUCHED:
--   · No existing RPC is redefined. Not one. The trigger makes that unnecessary,
--     which is the point — S64 was bitten by a migration that silently reverted
--     an RPC, and this migration cannot repeat that.
--   · `status_event` is FROZEN and RECLASSIFIED. It is not the log; it is a
--     domain input that two live readers depend on:
--       – the waiting meter reads its 'arrived' row (2026-07-22_waiting_fee.sql:145)
--       – the arrival attestation reads it at app/(app)/missions/[id]/page.tsx:113-120
--     Its CHECK is NOT widened again. No new writer is added. Its five existing
--     writers keep working, unchanged. A later session retires it by moving those
--     two queries over.
--   · `mission.pooled_at` is NOT written by anything here, and `mission.created_at`
--     is NOT stopped from being reset on post. The true draft moment and each pool
--     entry are recorded as EVENT ROWS instead — in a table lib/pdp.ts never reads.
--     [[d81]] and the §6 curve are untouched by construction.
--
-- LIVE FACTS THIS WAS WRITTEN AGAINST (probed 2026-08-24, service role):
--   mission 280 = pooled 2 · confirmed 13 · on_board 9 · completed 184 ·
--                 cancelled 23 · expired 49 · (draft/accepted/en_route/arrived 0)
--   status_event 715 = en_route 172 · arrived 172 · on_board 172 · completed 173 ·
--                      expired 26.  ZERO cancelled, no_show, repooled.
--   status_event LIVE CHECK accepts: en_route, arrived, on_board, completed,
--     cancelled, no_show, repooled, expired.  Rejects: draft, pooled, accepted,
--     confirmed.  (⚑ no_show and repooled ARE allowed — an earlier note said
--     otherwise. Verified by probe insert+delete on 2026-08-24.)
--   THE HOLES ARE ALREADY IN CATEGORIES THE CHECK ALLOWS:
--     23 cancelled missions →  0 cancelled events
--     49 expired  missions → 26 expired  events   (23 short)
--    184 completed missions →173 completed events (11 short)
--   mission_cancellation is EMPTY (0 rows) despite 23 cancelled missions —
--     the side tables are not a substitute log either.
--   pooled_at NULL on all 280.  accepted_fare NULL on all 280.
--   ⚑ BUT accepted_at and confirmed_at are NON-NULL on 229/280, and
--     cancelled_at + cancelled_by on all 23. Part of the past IS recoverable;
--     §4 below backfills exactly that much and nothing more.
--
-- Additive. Idempotent. Safe to re-run.  Paste whole into the Supabase SQL editor.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. THE TABLE
-- ---------------------------------------------------------------------------
-- ⚑ event_type has NO CHECK CONSTRAINT, deliberately. A CHECK on an event log's
--    type column aborts the very transaction it is trying to record — the log
--    would take the business write down with it. That is strictly worse than a
--    row with a typo in it. The vocabulary is enforced where a rejection is safe:
--    in lib/mission-events.ts for app writers, and in the log_mission_event()
--    allowlist (§3) for client callers. Reference list in mission_event_type (§1b).
--
-- ⚑ NO FOREIGN KEYS, deliberately. A log that cascades away when its mission,
--    Business or Driver row is deleted is not a log. business_id / driver_id are
--    denormalised copies for RLS, not integrity claims. Join, expect misses.
create table if not exists mission_event (
  id                 uuid primary key default gen_random_uuid(),
  -- Insertion order. The tie-breaker for two events inside one transaction.
  seq                bigint generated always as identity,
  mission_id         uuid not null,
  -- Denormalised for RLS. business_id = the Business the mission belongs to.
  business_id        uuid,
  -- ⚑ The Driver the event is ABOUT, not the one currently assigned. On a
  --    re-pool this stays the Driver who WALKED, so they can see their own
  --    history and the next Driver cannot see theirs.
  driver_id          uuid,
  event_type         text        not null,
  -- clock_timestamp(), not now(): two events in one transaction must not collide.
  occurred_at        timestamptz not null default clock_timestamp(),
  -- 'dispatcher' | 'driver' | 'admin' | 'system' | 'unknown'
  -- ⚑ 'unknown' is a real answer and the honest one under the service role,
  --    where auth.uid() is NULL. Never guessed, never inferred.
  actor_kind         text        not null default 'unknown',
  actor_auth_user_id uuid,
  actor_id           uuid,                       -- dispatcher.id or driver.id
  -- Who may READ this row: subset of {'business','driver','admin'}.
  -- Default is admin-only: a new event type is invisible until someone decides
  -- it should not be.
  audience           text[]      not null default array['admin']::text[],
  -- ⚑ THE COLUMN THAT MAKES THE LOG HONEST.
  --   'db_trigger'              — guaranteed. The DB observed a committed change.
  --   'client_rpc'              — best effort, via log_mission_event().
  --   'app'                     — best effort, service-role insert from Next.js.
  --   'status_event_backfill'   — IMPORTED, not observed.
  --   'mission_row_backfill'    — IMPORTED from mission columns, not observed.
  source             text        not null,
  payload            jsonb       not null default '{}'::jsonb,
  -- Set only by backfills, so re-running this file is a no-op. NULL for live rows
  -- (a unique index permits unlimited NULLs).
  dedupe_key         text
);

create index        if not exists mission_event_mission_idx  on mission_event (mission_id, occurred_at, seq);
create index        if not exists mission_event_business_idx on mission_event (business_id, occurred_at desc);
create index        if not exists mission_event_driver_idx   on mission_event (driver_id, occurred_at desc);
create index        if not exists mission_event_type_idx     on mission_event (event_type, occurred_at desc);
create index        if not exists mission_event_source_idx   on mission_event (source);
create unique index if not exists mission_event_dedupe_idx   on mission_event (dedupe_key);

comment on table mission_event is
  '§ AG. Append-only event log. source=''db_trigger'' rows are guaranteed complete '
  'for committed mission.status transitions; every other source is best effort. '
  'Never UPDATE or DELETE a row here.';

-- 1b. Reference vocabulary. A TABLE, not a constraint — documentation and a join
--     target for analysis. Nothing enforces it, on purpose (see above).
create table if not exists mission_event_type (
  event_type  text primary key,
  captured_by text not null,          -- 'db_trigger' | 'app' | 'rpc' | 'none'
  guaranteed  boolean not null,
  note        text
);

insert into mission_event_type (event_type, captured_by, guaranteed, note) values
  ('created',            'db_trigger', true,  'Row inserted. payload.to carries the status it was born in. This is the TRUE draft moment — it survives the created_at reset at app/(dispatch)/dispatch/new/actions.ts:381-384.'),
  ('pooled',             'db_trigger', true,  'First entry into the Pool. Emitted on insert-as-pooled AND on draft->pooled.'),
  ('repooled',           'db_trigger', true,  'Back to pooled from an assigned state. payload.previous_driver_id = who walked.'),
  ('accepted',           'db_trigger', false, 'COLLAPSED: accept_mission sets status=confirmed in one UPDATE (2026-08-22_accepted_fare.sql:124-136). This type will effectively never appear live; look for confirmed with payload.from=pooled.'),
  ('confirmed',          'db_trigger', true,  'The real acceptance. payload.from=pooled means it came straight from the Pool.'),
  ('en_route',           'db_trigger', true,  null),
  ('arrived',            'db_trigger', true,  null),
  ('on_board',           'db_trigger', true,  null),
  ('completed',          'db_trigger', true,  null),
  ('no_show',            'db_trigger', true,  'status goes to completed with no_show=true; the trigger reads NEW.no_show and labels it correctly.'),
  ('cancelled',          'db_trigger', true,  'payload carries cancelled_by / fee / reason.'),
  ('expired',            'db_trigger', true,  'The sweep. actor is unknown by definition (auth.uid() is NULL).'),
  ('pool_impression',    'app',        false, 'A Driver saw this mission in the Pool. No row changes; the DB cannot see it.'),
  ('mission_viewed',     'app',        false, 'A Driver opened the mission detail. No row changes; client-loggable.'),
  ('contact_revealed',   'app',        false, 'Guest phone / board tapped. No row changes.'),
  ('accept_rejected',    'app',        false, 'accept_mission raised. ⚑ Must be written AFTER the failed transaction — the raise destroys any log row written inside it.'),
  ('amendment_proposed', 'app',        false, 'Mirrors mission_amendment; the side table stays the domain record.'),
  ('amendment_answered', 'app',        false, null),
  ('release_proposed',   'app',        false, 'Mirrors mission_release.'),
  ('release_answered',   'app',        false, null),
  ('info_changed',       'app',        false, 'Mirrors mission_info_change.'),
  ('checked_in',         'app',        false, 'checkIn() changes no status, so the trigger is blind to it. app/(app)/rides/actions.ts:262 must write this.'),
  ('close_answered',     'app',        false, 'answer=not_driven changes no status (app/(app)/rides/actions.ts:241-250); the trigger is blind. answer=driven DOES move status and is covered.')
on conflict (event_type) do update
  set captured_by = excluded.captured_by,
      guaranteed  = excluded.guaranteed,
      note        = excluded.note;

-- ---------------------------------------------------------------------------
-- 2. THE SPINE — the trigger. This is the part that cannot be bypassed.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER for two reasons: it must insert past mission_event's RLS
-- (which grants nobody INSERT), and it must read dispatcher/driver to name the
-- actor. It is owned by the migration runner, which bypasses RLS.
--
-- auth.uid() is schema-qualified so `set search_path = public` cannot break it.
-- It survives the SECURITY DEFINER RPCs above it (accept_mission etc.) because
-- SECURITY DEFINER swaps the role, not the JWT claims — so a Driver accepting
-- through the RPC IS named. It is NULL under the service role and in the sweep;
-- that becomes actor_kind='unknown', never a guess.
create or replace function trg_mission_event_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_prev       text;
  v_type       text;
  v_driver     uuid;
  v_audience   text[];
  v_actor_kind text := 'unknown';
  v_actor_id   uuid;
  v_payload    jsonb;
begin
  -- `after update of status` fires whenever the column is MENTIONED, even if the
  -- value is unchanged (every PostgREST .update({status}) mentions it). No
  -- transition, no event. This guard lives in the function rather than a WHEN
  -- clause because WHEN cannot reference OLD on the INSERT arm.
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;

  v_prev := case when tg_op = 'UPDATE' then old.status::text else null end;

  -- WHO. Dispatcher first, then Driver. Anything else stays 'unknown'.
  if v_uid is not null then
    select d.id into v_actor_id from dispatcher d where d.auth_user_id = v_uid limit 1;
    if found then
      v_actor_kind := 'dispatcher';
    else
      select dr.id into v_actor_id from driver dr where dr.auth_user_id = v_uid limit 1;
      if found then v_actor_kind := 'driver'; end if;
    end if;
  end if;

  -- The Driver the event is ABOUT. On a re-pool NEW.driver_id is already NULL,
  -- so fall back to OLD: the walker owns the walk.
  v_driver := coalesce(new.driver_id, case when tg_op = 'UPDATE' then old.driver_id end);

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'from',               v_prev,
    'to',                 new.status::text,
    'tg_op',              tg_op,
    'cancelled_by',       new.cancelled_by::text,
    'cancellation_fee',   new.cancellation_fee,
    'cancellation_reason',new.cancellation_reason,
    'no_show_by',         new.no_show_by::text,
    'accepted_fare',      new.accepted_fare,
    'ceiling',            new.ceiling,
    'speed_win',          new.speed_win,
    'pickup_at',          new.pickup_at,
    'category',           new.category::text,
    'zone',               new.zone,
    'previous_driver_id',
      case when tg_op = 'UPDATE' and old.driver_id is distinct from new.driver_id
           then old.driver_id end
  ));

  if tg_op = 'INSERT' then
    -- Row 1: the birth of the mission. payload.to says which status it was born
    -- in. For a draft this is the moment the founder wants preserved.
    insert into mission_event
      (mission_id, business_id, driver_id, event_type, actor_kind,
       actor_auth_user_id, actor_id, audience, source, payload)
    values
      (new.id, new.business_id, v_driver, 'created', v_actor_kind,
       v_uid, v_actor_id, array['business','admin'], 'db_trigger', v_payload);

    -- Row 2: posted straight to the Pool. A SEPARATE row, so "drafted" and
    -- "entered the Pool" are two facts even when one INSERT does both.
    if new.status = 'pooled' then
      insert into mission_event
        (mission_id, business_id, driver_id, event_type, actor_kind,
         actor_auth_user_id, actor_id, audience, source, payload)
      values
        (new.id, new.business_id, v_driver, 'pooled', v_actor_kind,
         v_uid, v_actor_id, array['business','admin'], 'db_trigger', v_payload);
    end if;

    return null;
  end if;

  -- UPDATE arm.
  v_type := case
    when new.status = 'pooled'    and v_prev = 'draft'          then 'pooled'
    when new.status = 'pooled'                                  then 'repooled'
    when new.status = 'completed' and coalesce(new.no_show, false) then 'no_show'
    else new.status::text
  end;

  v_audience := case v_type
    when 'pooled'   then array['business','admin']
    when 'expired'  then array['business','admin']
    else                 array['business','driver','admin']
  end;

  insert into mission_event
    (mission_id, business_id, driver_id, event_type, actor_kind,
     actor_auth_user_id, actor_id, audience, source, payload)
  values
    (new.id, new.business_id, v_driver, v_type, v_actor_kind,
     v_uid, v_actor_id, v_audience, 'db_trigger', v_payload);

  return null;
end;
$$;

comment on function trg_mission_event_log is
  '§ AG spine. Writes one mission_event per COMMITTED mission.status transition '
  '(two on insert-as-pooled). Cannot be bypassed: every RPC, the sweep, the '
  'service role and the direct PATCH allowed by p_mission_business_update all '
  'commit through it. Blind to: rolled-back transactions, no-row-change actions, '
  'and two transitions collapsed into one statement.';

drop trigger if exists mission_event_log on mission;
create trigger mission_event_log
  after insert or update of status on mission
  for each row execute function trg_mission_event_log();

-- ---------------------------------------------------------------------------
-- 3. THE B-SIDE — the only way to record what the database cannot see.
-- ---------------------------------------------------------------------------
-- An allowlist HERE is safe and necessary: a rejection is not a hole in the
-- guaranteed set, and without it a Driver could POST a forged 'completed'
-- straight into the log. business_id / driver_id are derived from the mission and
-- the caller — never from caller input.
create or replace function log_mission_event(
  p_mission_id uuid,
  p_event_type text,
  p_payload    jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_mission    mission;
  v_actor_kind text := 'unknown';
  v_actor_id   uuid;
  v_driver     uuid;
  v_audience   text[];
  v_id         uuid;
begin
  if p_event_type not in
     ('pool_impression','contact_revealed','accept_rejected','mission_viewed') then
    raise exception 'log_mission_event: % is not client-loggable', p_event_type;
  end if;

  select * into v_mission from mission where id = p_mission_id;
  if not found then
    raise exception 'log_mission_event: no such mission';
  end if;

  select d.id into v_actor_id from dispatcher d where d.auth_user_id = v_uid limit 1;
  if found then
    v_actor_kind := 'dispatcher';
  else
    select dr.id into v_actor_id from driver dr where dr.auth_user_id = v_uid limit 1;
    if found then v_actor_kind := 'driver'; v_driver := v_actor_id; end if;
  end if;

  if v_actor_kind = 'unknown' then
    raise exception 'log_mission_event: caller is neither a Dispatcher nor a Driver';
  end if;

  -- ⚑ A Driver's Pool behaviour is NOT the Business's business, and it is
  --    certainly not another Driver's. Admin only.
  v_audience := array['admin']::text[];

  insert into mission_event
    (mission_id, business_id, driver_id, event_type, actor_kind,
     actor_auth_user_id, actor_id, audience, source, payload)
  values
    (p_mission_id, v_mission.business_id, v_driver, p_event_type, v_actor_kind,
     v_uid, v_actor_id, v_audience, 'client_rpc', coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function log_mission_event is
  '§ AG B-side. Best effort, source=''client_rpc''. Allowlisted types only. '
  'Server-side best-effort events are inserted directly with source=''app''.';

-- ---------------------------------------------------------------------------
-- 4. BACKFILL — imported, never observed. Idempotent, and safe to re-run
--    LATER, after the beta has been running.
-- ---------------------------------------------------------------------------
-- ⚑ dedupe_key alone is NOT enough. It stops the backfill duplicating ITSELF,
--    but not duplicating the TRIGGER: re-run this file in three weeks and every
--    mission posted since would get a second 'created' and 'pooled' row —
--    imported copies sitting next to the observed ones. So the backfill is
--    frozen to the moment it first ran, by a one-row marker table, and every
--    statement below is bounded by it. The first run stamps the cutoff; every
--    later run reads the SAME cutoff and inserts nothing new.
create table if not exists mission_event_backfill (
  only_row boolean primary key default true check (only_row),
  cutoff   timestamptz not null default now(),
  note     text default 'The instant the § AG backfill first ran. Everything before it is imported; everything after it is the trigger''s job. Never edit this row.'
);
insert into mission_event_backfill (only_row) values (true) on conflict (only_row) do nothing;


-- 4a. status_event's 715 rows, keeping their original created_at.
-- ⚑ CAVEAT recorded on every row: today's writer inserts the status_event row
--    BEFORE the mission update (app/(app)/rides/actions.ts:117 then :127), so an
--    imported event does NOT prove the transition committed. This is precisely
--    why the trigger, not the insert, becomes the source of truth from now on.
-- ⚑ CAVEAT 2: driver_id is the mission's CURRENT Driver, which after a re-pool is
--    not the Driver who performed the imported step.
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select
  se.mission_id,
  m.business_id,
  m.driver_id,
  se.status,
  se.created_at,
  'unknown',
  -- Same mapping as the trigger and lib/mission-events.ts audienceFor():
  -- only 'expired' is withheld from the Driver. 'repooled' is the Driver's own
  -- walk and they may read it; RLS scopes it to them by driver_id.
  case when se.status = 'expired'
       then array['business','admin']
       else array['business','driver','admin'] end,
  'status_event_backfill',
  jsonb_build_object(
    'imported_from',   'status_event',
    'status_event_id', se.id,
    'caveat',          'written BEFORE the mission update (app/(app)/rides/actions.ts:117 vs :127) — does not prove the transition committed',
    'driver_caveat',   'driver_id is the mission''s CURRENT Driver, not necessarily the one at the time'),
  'status_event:' || se.id::text
from status_event se
join mission m on m.id = se.mission_id
where se.created_at < (select cutoff from mission_event_backfill)
on conflict (dedupe_key) do nothing;

-- 4b. What the mission row itself still remembers. Nothing here is inferred:
--     every row below is a stored timestamp, copied.
--
-- ⚑ NOT backfilled, and NOT guessed:
--     · the 23 expired missions with no status_event — there is no expired_at
--       column. The moment is gone. A pickup_at-shaped guess would poison the log.
--     · the 11 completed missions with no status_event — no completed_at column.
--     · accepted_at / confirmed_at for any PREVIOUS assignment: re-pool NULLs them
--       (2026-08-22_accepted_fare.sql:198). Only the CURRENT assignment survives.
--     · every actor, everywhere in the past.

-- created: mission.created_at. For a posted mission this IS the post moment,
-- because posting resets created_at. That reset is why there is no true draft
-- time for these 280 rows.
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, null, 'created', m.created_at, 'unknown',
       array['business','admin'], 'mission_row_backfill',
       jsonb_build_object('to', m.status::text, 'column', 'mission.created_at',
         'caveat', 'created_at is RESET when a draft is posted — for a resumed draft this is the post moment, not the draft moment'),
       'mission_created:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and not exists (select 1 from mission_event e
              where e.mission_id = m.id and e.source = 'db_trigger' and e.event_type = 'created')
on conflict (dedupe_key) do nothing;

-- pooled: same timestamp. Every one of the 280 has been in the Pool at least once
-- (0 are still drafts), and created_at is the post moment.
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, null, 'pooled', m.created_at, 'unknown',
       array['business','admin'], 'mission_row_backfill',
       jsonb_build_object('column', 'mission.created_at',
         'caveat', 'pool entry approximated by created_at; pooled_at is NULL on all pre-migration rows because it was only ever stamped on RE-pool'),
       'mission_pooled:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and m.status <> 'draft'
  and not exists (select 1 from mission_event e
              where e.mission_id = m.id and e.source = 'db_trigger' and e.event_type = 'pooled')
on conflict (dedupe_key) do nothing;

-- confirmed: 229 rows have it.
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, m.driver_id, 'confirmed', m.confirmed_at, 'unknown',
       array['business','driver','admin'], 'mission_row_backfill',
       jsonb_build_object('column', 'mission.confirmed_at',
         'accepted_fare', m.accepted_fare,
         'caveat', 'CURRENT assignment only — a re-pool NULLs accepted_at/confirmed_at, so earlier acceptances of this mission are unrecoverable'),
       'mission_confirmed:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and m.confirmed_at is not null
  and not exists (select 1 from mission_event e
              where e.mission_id = m.id and e.source = 'db_trigger' and e.event_type = 'confirmed')
on conflict (dedupe_key) do nothing;

-- accepted: only where it is a distinct moment from confirmed (it is not, live —
-- accept_mission stamps both with the same now() — so this is expected to insert 0).
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, m.driver_id, 'accepted', m.accepted_at, 'unknown',
       array['business','driver','admin'], 'mission_row_backfill',
       jsonb_build_object('column', 'mission.accepted_at'),
       'mission_accepted:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and m.accepted_at is not null
  and m.accepted_at is distinct from m.confirmed_at
  and not exists (select 1 from mission_event e
              where e.mission_id = m.id and e.source = 'db_trigger' and e.event_type = 'accepted')
on conflict (dedupe_key) do nothing;

-- cancelled: all 23 have cancelled_at + cancelled_by, and status_event has none.
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, m.driver_id, 'cancelled', m.cancelled_at, 'unknown',
       array['business','driver','admin'], 'mission_row_backfill',
       jsonb_strip_nulls(jsonb_build_object('column', 'mission.cancelled_at',
         'cancelled_by', m.cancelled_by::text, 'cancellation_fee', m.cancellation_fee,
         'cancellation_reason', m.cancellation_reason)),
       'mission_cancelled:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and m.cancelled_at is not null
  and not exists (select 1 from mission_event e
              where e.mission_id = m.id and e.source = 'db_trigger' and e.event_type = 'cancelled')
on conflict (dedupe_key) do nothing;

-- no_show
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, m.driver_id, 'no_show', m.no_show_at, 'unknown',
       array['business','driver','admin'], 'mission_row_backfill',
       jsonb_strip_nulls(jsonb_build_object('column', 'mission.no_show_at',
         'no_show_by', m.no_show_by::text, 'waiting_fee', m.waiting_fee)),
       'mission_no_show:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and m.no_show_at is not null
  and not exists (select 1 from mission_event e
              where e.mission_id = m.id and e.source = 'db_trigger' and e.event_type = 'no_show')
on conflict (dedupe_key) do nothing;

-- checked_in
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, m.driver_id, 'checked_in', m.checked_in_at, 'unknown',
       array['business','driver','admin'], 'mission_row_backfill',
       jsonb_build_object('column', 'mission.checked_in_at'),
       'mission_checked_in:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and m.checked_in_at is not null
on conflict (dedupe_key) do nothing;

-- close_answered
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, audience, source, payload, dedupe_key)
select m.id, m.business_id, m.driver_id, 'close_answered', m.close_answered_at, 'unknown',
       array['business','driver','admin'], 'mission_row_backfill',
       jsonb_build_object('column', 'mission.close_answered_at', 'answer', m.close_answer),
       'mission_close_answered:' || m.id::text
from mission m
where m.created_at < (select cutoff from mission_event_backfill)
  and m.close_answered_at is not null
on conflict (dedupe_key) do nothing;

-- The side tables ARE the domain record for these; the log carries a pointer, not
-- a copy, so there is one place to fix a wrong amendment. dedupe_key is the side
-- row's own id, so re-running is a no-op and a later row is picked up next run.
insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, actor_id, audience, source, payload, dedupe_key)
select a.mission_id, a.business_id, m.driver_id, 'amendment_proposed', a.created_at,
       'dispatcher', a.proposed_by, array['business','driver','admin'], 'mission_row_backfill',
       jsonb_strip_nulls(jsonb_build_object('side_table','mission_amendment','row_id',a.id,
         'status',a.status,'new_fare',a.new_fare,'responded_at',a.responded_at)),
       'amendment:' || a.id::text
from mission_amendment a join mission m on m.id = a.mission_id
where a.created_at < (select cutoff from mission_event_backfill)
on conflict (dedupe_key) do nothing;

insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, actor_id, audience, source, payload, dedupe_key)
select r.mission_id, r.business_id, r.driver_id, 'release_proposed', r.created_at,
       'dispatcher', r.proposed_by, array['business','driver','admin'], 'mission_row_backfill',
       jsonb_strip_nulls(jsonb_build_object('side_table','mission_release','row_id',r.id,
         'status',r.status,'from_fare',r.from_fare,'responded_at',r.responded_at)),
       'release:' || r.id::text
from mission_release r
where r.created_at < (select cutoff from mission_event_backfill)
on conflict (dedupe_key) do nothing;

insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, actor_id, audience, source, payload, dedupe_key)
select c.mission_id, c.business_id, c.actor_driver_id, 'cancelled', c.created_at,
       case c.party when 'driver' then 'driver' when 'business' then 'dispatcher' else 'system' end,
       c.actor_driver_id, array['business','driver','admin'], 'mission_row_backfill',
       jsonb_strip_nulls(jsonb_build_object('side_table','mission_cancellation','row_id',c.id,
         'party',c.party::text,'kind',c.kind,'fee_amount',c.fee_amount,'resulted_in',c.resulted_in)),
       'cancellation:' || c.id::text
from mission_cancellation c
where c.created_at < (select cutoff from mission_event_backfill)
  -- ⚑ mission.cancelled_at already produced a 'cancelled' row for this mission
  --    a few statements up. Two 'cancelled' events for one cancellation would
  --    make every count double. The mission column wins; this table only fills
  --    in cancellations the mission row does not remember. (Live today: 0 rows
  --    here vs 23 cancelled missions, so this inserts nothing — but it must not
  --    become a double-count the first time a cancellation IS recorded.)
  and not exists (select 1 from mission_event e
                  where e.mission_id = c.mission_id and e.event_type = 'cancelled')
on conflict (dedupe_key) do nothing;

insert into mission_event
  (mission_id, business_id, driver_id, event_type, occurred_at,
   actor_kind, actor_id, audience, source, payload, dedupe_key)
select i.mission_id, i.business_id, m.driver_id, 'info_changed', i.created_at,
       'dispatcher', i.edited_by, array['business','driver','admin'], 'mission_row_backfill',
       jsonb_build_object('side_table','mission_info_change','row_id',i.id,'items',i.items),
       'info_change:' || i.id::text
from mission_info_change i join mission m on m.id = i.mission_id
where i.created_at < (select cutoff from mission_event_backfill)
on conflict (dedupe_key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
-- READ ONLY, for both browser roles. There is NO insert / update / delete policy,
-- so nothing holding an anon or authenticated JWT can write, amend or erase the
-- log — writes arrive only through the SECURITY DEFINER trigger, log_mission_event(),
-- or the server's service-role key.
--
-- Append-only is enforced by ABSENCE of policies plus the REVOKEs below, NOT by a
-- blocking trigger: a hard block would also stop the service role, and the live
-- probe (.local/probe/event-log-e2e.ts) must be able to clean up its own rows by
-- recorded id. That is a deliberate trade — the service role is trusted, browsers
-- are not.
alter table mission_event          enable row level security;
alter table mission_event_type     enable row level security;
-- ⚑ Every table in `public` is exposed through PostgREST the moment it exists.
--    The marker table is internal bookkeeping: RLS on, and NO policy at all, so
--    no browser JWT can read it or move the cutoff. Only the service role and
--    the migration runner (both RLS-exempt) can see it.
alter table mission_event_backfill enable row level security;

drop policy if exists p_mission_event_admin_read    on mission_event;
drop policy if exists p_mission_event_business_read on mission_event;
drop policy if exists p_mission_event_driver_read   on mission_event;

create policy p_mission_event_admin_read on mission_event for select
  using (app_role() = 'admin');

-- A Business sees its OWN missions' events, and only those the audience opens to
-- it. Pool impressions (audience = {admin}) stay invisible: what a Driver browsed
-- is not the Business's business.
create policy p_mission_event_business_read on mission_event for select
  using (
    business_id is not null
    and business_id = current_business_id()
    and 'business' = any(audience)
  );

-- A Driver sees only events ABOUT THEMSELVES. ⚑ This is what hides one Driver's
-- behaviour from another: a 'pooled' event has driver_id NULL, and a 'repooled'
-- event keeps the WALKER's driver_id, so the Driver who picks the mission up next
-- can never read that someone dropped it.
create policy p_mission_event_driver_read on mission_event for select
  using (
    driver_id is not null
    and driver_id = current_driver_id()
    and 'driver' = any(audience)
  );

-- The vocabulary table is public reference material.
drop policy if exists p_mission_event_type_read on mission_event_type;
create policy p_mission_event_type_read on mission_event_type for select using (true);

revoke insert, update, delete, truncate on mission_event      from authenticated, anon;
revoke insert, update, delete, truncate on mission_event_type from authenticated, anon;
revoke all                              on mission_event_backfill from authenticated, anon;
grant  select                           on mission_event      to   authenticated;
grant  select                           on mission_event_type to   authenticated, anon;
grant  execute on function log_mission_event(uuid, text, jsonb) to authenticated;

commit;

-- PostgREST caches the schema. Without this the founder gets
-- "Could not find the table 'public.mission_event' in the schema cache" for a
-- minute or two after pasting, and reasonably concludes the migration failed.
notify pgrst, 'reload schema';


-- ============================================================================
-- COMPLETENESS TABLE — every transition, and where it is captured.
-- A row marked HOLE is an admission, not an omission.
-- ============================================================================
--
-- TRANSITION / ACTION            CAPTURED BY            GUARANTEED?  EVENT
-- ------------------------------ ---------------------- -----------  -----------------
-- row inserted (draft)           trigger, INSERT arm    YES          created
-- row inserted (posted live)     trigger, INSERT arm    YES          created + pooled (2 rows)
-- draft -> pooled  (posting)     trigger                YES          pooled
-- pooled -> confirmed (accept)   trigger                YES          confirmed
-- pooled -> accepted             — never commits —      n/a          HOLE (see note 1)
-- accepted -> confirmed          — never commits —      n/a          HOLE (see note 1)
-- * -> pooled      (re-pool)     trigger                YES          repooled
-- confirmed -> en_route          trigger                YES          en_route
-- en_route -> arrived            trigger                YES          arrived
-- arrived -> on_board            trigger                YES          on_board
-- on_board -> completed          trigger                YES          completed
-- arrived -> completed+no_show   trigger                YES          no_show   (note 2)
-- * -> cancelled                 trigger                YES          cancelled
-- pooled -> expired (sweep)      trigger                YES          expired   (actor unknown)
-- direct PATCH of mission.status trigger                YES          the target status
--   (the p_mission_business_update bypass logs itself — that is the design)
--
-- --- things with NO status change. The database cannot see these. ---
-- check-in                       app  (rides/actions.ts) NO           checked_in
-- close answer = not_driven      app  (rides/actions.ts) NO           close_answered
-- amendment proposed / answered  app                     NO           amendment_*
-- release proposed / answered    app                     NO           release_*
-- guest info changed             app                     NO           info_changed
-- Driver sees mission in Pool    log_mission_event()     NO           pool_impression
-- Guest phone / board tapped     log_mission_event()     NO           contact_revealed
-- mission detail opened          log_mission_event()     NO           mission_viewed
-- accept_mission RAISED          app, out-of-band        NO           accept_rejected (note 3)
--
-- --- EXPLICIT HOLES. Nothing captures these. Do not pretend otherwise. ---
--  H1  'accepted' as a distinct state. accept_mission sets status='confirmed' in
--      ONE update (2026-08-22_accepted_fare.sql:124-136), so 'accepted' never
--      commits and no AFTER trigger can observe it. Read `confirmed` with
--      payload.from='pooled' as "was accepted straight from the Pool".
--  H2  Anything ROLLED BACK. A failed accept_mission `raise` destroys its own log
--      row along with the transaction. 'accept_rejected' MUST be written from the
--      app after the RPC returns an error — never from inside the RPC.
--  H3  The ACTOR behind any service-role write. auth.uid() is NULL there, so
--      actor_kind='unknown'. That includes every write in rides/actions.ts and
--      the whole expiry sweep. Honest, and never guessed.
--  H4  Two transitions collapsed into one UPDATE. The trigger sees the end state
--      only. (No live path does this today besides H1.)
--  H5  THE PRE-MIGRATION PAST. For the 280 existing missions: the true draft
--      moment, the true pool-entry moment, every actor, and any acceptance
--      before the current one (re-pool NULLs accepted_at/confirmed_at). Also the
--      23 expired and 11 completed missions with no status_event — there is no
--      expired_at or completed_at column, so those moments are simply gone.
--      ⚑ A NULL here never means "it did not happen": pooled_at and accepted_fare
--        are NULL on all 280 for reasons unrelated to the event.
--  H6  Deletions. A hard-deleted mission leaves its events behind (no FK), which
--      is intended — but nothing records the deletion itself.
--
-- ============================================================================
-- WHAT THIS DOES NOT COVER (beyond the holes above)
-- ============================================================================
--   · It is not an audit trail of FIELD changes. Only status transitions and the
--     payload snapshot at that moment. Who edited a dropoff address is
--     mission_info_change's job; the log carries a pointer to it, not a copy.
--   · No retention or partitioning. At beta volume (280 missions in ~2 months)
--     this is irrelevant; revisit past ~1M rows.
--   · No admin UI. The founder reads it with SQL until § AG-2.
--   · status_event is NOT retired here. Two live readers still depend on it (the
--     waiting meter and the arrival attestation). Until they move, the two tables
--     are RECONCILED, not merged — and handoff-check.ts asserts status_event is
--     not growing faster than mission_event, which would mean a new writer.
--   · Append-only is enforced by REVOKE + absence of policies, not by a blocking
--     trigger. The service role can still edit the log. That is deliberate: a
--     hard block would also stop the probe cleaning up after itself.
--
-- ============================================================================
-- ROLLBACK — paste this to undo the migration completely.
-- ============================================================================
-- ⚑ Dropping mission_event DESTROYS every event recorded since it shipped, and
--    those cannot be backfilled — that is the whole premise of § AG. Prefer
--    disabling the trigger and leaving the data alone:
--
--      alter table mission disable trigger mission_event_log;   -- stop logging
--      alter table mission enable  trigger mission_event_log;   -- resume
--
--    Nothing in the app breaks with the trigger disabled: no existing code path
--    reads mission_event, and status_event is untouched by this migration.
--
-- FULL removal, if it must happen:
--
--   begin;
--   drop trigger  if exists mission_event_log on mission;
--   drop function if exists trg_mission_event_log();
--   drop function if exists log_mission_event(uuid, text, jsonb);
--   drop table    if exists mission_event;
--   drop table    if exists mission_event_type;
--   drop table    if exists mission_event_backfill;
--   commit;
--   notify pgrst, 'reload schema';
--
--   Then delete lib/mission-events.ts, tests/mission-events.test.ts and
--   .local/probe/event-log-e2e.ts, and remove the § AG block from
--   .local/probe/handoff-check.ts.
--
-- ⚑ RE-APPLYING AFTER A FULL DROP re-stamps mission_event_backfill.cutoff to the
--    new now(), so the backfill re-imports everything up to that point — which
--    now includes rows the trigger had already observed. Those come back as
--    'mission_row_backfill' copies. Acceptable, but know that a drop-and-reapply
--    downgrades observed history to imported history.
--
-- ============================================================================
-- VERIFY — read-only. Run after, in the same editor. Expected values are from
-- the 2026-08-24 probe; they move as the beta runs.
-- ============================================================================
-- -- 1. The trigger exists and IS security definer (it must be, to write past RLS):
-- select t.tgname, p.prosecdef, t.tgenabled
--   from pg_trigger t join pg_proc p on p.oid = t.tgfoid
--  where t.tgname = 'mission_event_log';            -- expect prosecdef = t, tgenabled = O
--
-- -- 2. status_event was NOT touched:
-- select count(*) from status_event;                                -- expect 715
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conname = 'status_event_status_check';
--   -- expect: en_route, arrived, on_board, completed, cancelled, no_show, repooled, expired
--
-- -- 3. The backfill landed and is marked as imported, never observed:
-- select source, count(*) from mission_event group by 1 order by 2 desc;
--   -- expect status_event_backfill 715, mission_row_backfill ~ 280+280+229+23+5, db_trigger 0
-- select count(*) from mission_event where source = 'db_trigger';   -- expect 0 immediately after
--
-- -- 4. THE HOLE CHECK, from now on (this is the 23-cancelled-0-events assertion):
-- select m.status,
--        count(*)                                                   as missions,
--        count(*) filter (where e.id is not null)                   as with_event,
--        count(*) filter (where e.id is null)                       as HOLE
--   from mission m
--   left join lateral (
--     select 1 as id from mission_event x
--      where x.mission_id = m.id
--        and x.event_type = case when m.no_show then 'no_show' else m.status::text end
--      limit 1) e on true
--  where m.status in ('cancelled','expired','completed')
--  group by 1;
--   -- 2026-08-24 baseline AFTER backfill: cancelled 23/23/0 · expired 26/49/23 ·
--   -- completed 173+/184/<=11. Those remaining holes are PRE-MIGRATION and unrecoverable.
--   -- ⚑ Any mission created AFTER this migration that lands in the HOLE column is
--   --   a live defect — see .local/probe/handoff-check.ts.
-- ============================================================================
