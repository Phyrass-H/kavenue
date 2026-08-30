-- 2026-08-30 — BUSINESS EVENT LOG. Additive: one table, one index, two policies.
-- Safe to re-run. Nothing reads it yet except the Activity Console.
--
-- ── WHY IT EXISTS ───────────────────────────────────────────────────────────
-- Today, when a Business is turned away from posting because its file is
-- incomplete ([[d99]]), NOTHING anywhere records that it happened. They see what
-- is missing, they fix it or they leave, and the moment is gone. So nobody can
-- ever answer *how many Businesses hit that wall, and how many gave up there* —
-- which is the only way to find out whether the gate is costing customers.
--
-- ⚑ AND IT CANNOT BE ADDED RETROACTIVELY. Trips and money leave rows behind; you
-- can count them a year later. A moment nobody wrote down is simply gone. That
-- is why this went in the same session as the gate rather than after it.
--
-- ⚑ WHY NOT `mission_event`. That table's whole point ([[d87]]) is that it records
-- what happens to a TRIP, and it requires a `mission_id`. A blocked post has no
-- mission — that is the entire event. Widening `mission_event` to allow a null
-- mission would break the one guarantee it makes about itself.
--
-- ── WHAT THIS IS *NOT* ──────────────────────────────────────────────────────
-- ⚑ NOT BROWSING. The founder cut `pool_impression` and `mission_viewed` in S66:
-- *"a driver that looks around the pool is just browsing and brings no value."*
-- The same test applies here and this passes it: a refusal is a thing that
-- HAPPENED TO someone, with a consequence — they could not post — not a record
-- of where they looked.
--
-- ⚑ AND `trip_posted` IS DELIBERATELY ABSENT. The success side of the funnel is
-- already recorded, guaranteed, by the `mission_event` trigger as `pooled`. A
-- second copy here would be a second source of truth for the same fact, and the
-- two would disagree the first time one of them missed a write.

create table if not exists business_event (
  id                 uuid primary key default gen_random_uuid(),
  seq                bigserial,
  business_id        uuid not null references business(id) on delete cascade,
  -- Which seat hit it. Nullable because the actor may not resolve to one.
  dispatcher_id      uuid references dispatcher(id) on delete set null,
  event_type         text not null,
  occurred_at        timestamptz not null default now(),
  actor_auth_user_id uuid,
  -- ⚑ Always 'app' here, and it matters. Unlike mission_event's trigger rows,
  -- NOTHING in the database can observe this: a crash between the refusal and
  -- the write loses the event in silence. So this log may say what DID happen
  -- and must never be read as proof that something did NOT.
  source             text not null default 'app',
  payload            jsonb not null default '{}'::jsonb
);

comment on table business_event is
  'Things that happen to a Business account rather than to a trip. Best-effort (source=app): it may prove an event occurred, never that one did not. Trip events live in mission_event and are trigger-guaranteed.';
comment on column business_event.event_type is
  'post_blocked = tried to post a live trip with an incomplete file; payload.missing lists the requirement keys. Trip posting itself is NOT logged here - mission_event records it from a trigger.';

-- Reading the log is always "this Business, newest first".
create index if not exists business_event_business_idx
  on business_event (business_id, occurred_at desc);

alter table business_event enable row level security;

drop policy if exists p_business_event_admin_read on business_event;
drop policy if exists p_business_event_own_read   on business_event;

-- The console, which is the only thing that reads it today.
create policy p_business_event_admin_read on business_event for select
  using (app_role() = 'admin');

-- ⚑ A Business may read its OWN. It is a record of something that happened to
-- them, and hiding it would be the wrong default the day anyone asks "why was I
-- stopped last Tuesday". No INSERT policy for anyone: writes go through the
-- service role, exactly like mission_event's app half.
create policy p_business_event_own_read on business_event for select
  using (business_id = current_business_id());

-- Check it after pasting:
--   select event_type, count(*) from business_event group by 1;
