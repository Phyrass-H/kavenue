-- 2026-08-31h — Session 72: § 7, the hold. A Driver freezes a pooled trip to think.
--
-- Apply AFTER 2026-08-31g (the RPC wrappers). The accept-side gate is 2026-08-31i and must come after this.
--
-- ── WHAT THE FOUNDER DECIDED, S72 ───────────────────────────────────────────────────────
--  · FIFTEEN seconds, not the thirty in docs/06 §7. Their words: "we are the only one that
--    offers this because period of big season and big demands, 15 seconds there's a lot of
--    time to think." Half the time a trip spends off the market.
--  · VOLUNTARY. Accept is unchanged and always there; the hold sits beside it.
--  · A FLOOR, not a freeze — see `held_fare` below.
--  · LEAVING THE CARD RELEASES IT. Founder: "if you leave the card you lose the hold,
--    period." Best-effort from the client; the clock is the guarantee.
--
-- ⚑ THE HOLD SPENDS THE HOLD, NEVER THE TRIP. A Driver who freezes a trip, thinks, and
--   walks away can come back — five seconds or five minutes later — and accept it at the
--   live price. All they have used up is the right to freeze it again. `unique (mission_id,
--   driver_id)` enforces exactly that and nothing more; ACCEPT never consults this table
--   except to ask whether SOMEONE ELSE holds it right now.
--
-- ⚑ NOTHING RUNS AT T+15 s. No cron, no worker, no realtime — lib/expiry.ts:12-17 records
--   why (Vercel Hobby caps cron at once a DAY). So `outcome='open'` is a CLAIM ABOUT THE
--   CLOCK, not a state: correctness always compares `expires_at` to now(), and the sweep
--   below settles the column afterwards purely for the log's sake. Every guard here is
--   written that way, and none of them waits for the sweep.
--
-- ▶ Run this in the Supabase SQL editor (Claude's keys go through PostgREST = rows only).

-- ------------------------------------------------------------------ STEP 1: the table
create table if not exists mission_hold (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references mission(id) on delete cascade,
  driver_id   uuid not null references driver(id)  on delete cascade,

  -- ⚑ A FLOOR, NOT A CAP. docs/06 §7 says the price is "frozen", and its ⚑ argues that
  --   honouring the displayed price "removes any 'it changed on me' complaint". That is
  --   consumer logic, and the Driver is not the consumer — they are PAID this number, so a
  --   price that rose during their 15 seconds is good news and freezing it bills them for
  --   thinking. Measured on all 364 live trips at the real accept instants: a strict freeze
  --   changes the number on 3.4 % of accepts (mean €0.10), but on trips posted inside an
  --   hour it bites 70 % of the time, around €2 — aimed squarely at the urgent ones.
  --   So accept_mission takes greatest(held_fare, p_fare). Founder's call, S72.
  held_fare   numeric(10,2),

  taken_at    timestamptz not null default now(),
  expires_at  timestamptz not null,
  -- ⚑ Stored, not assumed. The window may change; an old row must still say what IT was
  --   granted rather than what today's constant happens to be. It is also the only place
  --   the number lives once the row is written — nothing reconstructs it by subtraction.
  hold_seconds int not null default 15,

  -- open | committed | lapsed | released | void — lib/hold.ts HOLD_OUTCOMES carries the
  -- reasoning. ⚑ The distinction that earns this column: `lapsed` (the clock ran out on a
  -- Driver looking at a price) is the sharpest price-rejection signal Kavenue will ever
  -- have, and `void` (the trip was cancelled underneath them) is not a signal at all.
  -- No timestamp can tell them apart after the fact, so the outcome is written, not derived.
  outcome     text not null default 'open'
                check (outcome in ('open','committed','lapsed','released','void')),
  settled_at  timestamptz
);

-- ⚑ ONE HOLD PER DRIVER PER TRIP, EVER (docs/06:419 — "no releasing and re-holding to reset
--   the clock"). A UNIQUE constraint, so it cannot be raced and needs no lock. This is the
--   rule that makes the hold voluntary rather than mandatory: if holding were the only route
--   to Accept, this line would ban a Driver from a trip because their phone slept.
create unique index if not exists mission_hold_once_idx
  on mission_hold (mission_id, driver_id);

-- ⚑ ONE HOLD AT A TIME PER DRIVER (docs/06:418 — "or someone parks three trips and blocks
--   the Pool"). Partial, so only a LIVE hold occupies the slot. place_hold() settles the
--   Driver's own expired rows first, or a lapse nobody swept would lock them out.
create unique index if not exists mission_hold_one_open_idx
  on mission_hold (driver_id) where outcome = 'open';

-- The sweep's working set, and the Pool's "is anyone holding this".
create index if not exists mission_hold_open_idx
  on mission_hold (expires_at) where outcome = 'open';

comment on table mission_hold is
  'docs/06 § 7. One row per (trip, Driver) that was ever frozen. outcome is WRITTEN, never '
  'inferred: lapsed (a Driver looked at the price and walked away) and void (the trip was '
  'cancelled underneath them) are indistinguishable from timestamps, and only the first is '
  'a price signal. ⚑ A spent hold never blocks Accept — it blocks only a second freeze.';

-- --------------------------------------------------------- STEP 2: the denormalised instant
-- ⚑ WHY A COLUMN AND NOT A JOIN. Every Pool render reads this per card, and mission_read is
--   read by every Dispatch screen; two correlated subqueries per row on the hot path is a
--   real cost for one nullable timestamp. It is the same denormalisation the four existing
--   side tables already make (mission_amendment.business_id and friends), for the same reason.
--   It also arms handoff-check's live-column detector, which probes exactly this name.
alter table mission add column if not exists hold_expires_at timestamptz;

comment on column mission.hold_expires_at is
  'docs/06 § 7. When the live hold on this trip runs out; maintained by mission_hold_apply(). '
  '⚑ A PAST value is not cleared promptly — nothing runs at T+15 s — so every reader must '
  'compare it to now(). mission_read masks it for exactly that reason.';

-- ------------------------------------------------- STEP 3: the trigger — mirror + event log
-- ⚑ D109: THE HOLD'S EVENTS SHIP IN THE SAME MIGRATION AS THE HOLD. A lapse leaves nothing
--   behind: no status transition, so no mission_event trigger, and nothing observing at
--   T+15 s. Ship the feature now and instrument it next session and every lapse in between
--   is gone for good. handoff-check assertion 39 goes red if this file lands without them.
create or replace function mission_hold_apply()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_type   text;
  v_biz    uuid;
begin
  select business_id into v_biz from mission where id = new.mission_id;

  -- Mirror the instant onto the mission. Cleared the moment the hold stops being open, so
  -- a released or committed hold never leaves a live-looking timestamp behind.
  if new.outcome = 'open' then
    update mission set hold_expires_at = new.expires_at where id = new.mission_id;
  else
    update mission set hold_expires_at = null
     where id = new.mission_id and hold_expires_at = new.expires_at;
  end if;

  v_type := case
    when tg_op = 'INSERT'      then 'hold_taken'
    when new.outcome = 'committed' then 'hold_committed'
    when new.outcome = 'lapsed'    then 'hold_lapsed'
    when new.outcome = 'released'  then 'hold_released'
    when new.outcome = 'void'      then 'hold_void'
    else null
  end;

  if v_type is not null and (tg_op = 'INSERT' or old.outcome is distinct from new.outcome) then
    insert into mission_event
      (mission_id, business_id, driver_id, event_type, occurred_at,
       actor_kind, actor_id, audience, source, payload)
    values (
      new.mission_id, v_biz, new.driver_id, v_type,
      -- ⚑ A LAPSE HAPPENED WHEN THE CLOCK RAN OUT, NOT WHEN SOMEONE NOTICED. Stamping it
      --   now() would date every lapse to whenever a Pool render happened to sweep it,
      --   which could be hours. The truth is expires_at; when we found out goes in the
      --   payload, so the lag is visible instead of hidden.
      case when new.outcome in ('lapsed','void') then new.expires_at else now() end,
      'driver', new.driver_id,
      -- ⚑ ADMIN ONLY. A Driver's consideration is not the Business's business — the same
      --   rule lib/mission-events.ts audienceFor() applies to every Pool-side event. The
      --   Business is told a Driver is reviewing, live, from mission.hold_expires_at; that
      --   is a status, not a log entry about a named contractor's hesitation.
      array['admin']::text[],
      -- ⚑ NOT 'db_trigger'. `hold_taken`, `hold_committed` and `hold_released` really are
      --   observed — they commit in the same transaction as the act. A LAPSE IS NOT: nothing
      --   watched it happen, the row is written when a sweep later infers it from a
      --   timestamp. Labelling that 'db_trigger' would make the log claim it witnessed
      --   something it reconstructed, which is the exact fault D86-D92 are all instances of.
      case when new.outcome in ('lapsed','void') then 'derived' else 'db_trigger' end,
      jsonb_strip_nulls(jsonb_build_object(
        'held_fare',    new.held_fare,
        'hold_seconds', new.hold_seconds,
        'noticed_at',   case when new.outcome in ('lapsed','void') then now() end,
        'notice_lag_s', case when new.outcome in ('lapsed','void')
                             then round(extract(epoch from (now() - new.expires_at))) end
      ))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists mission_hold_apply on mission_hold;
create trigger mission_hold_apply
  after insert or update of outcome on mission_hold
  for each row execute function mission_hold_apply();

-- ---------------------------------------------------------------- STEP 4: the registry
-- D87's registry: every event type declares who captures it and whether it is guaranteed.
insert into mission_event_type (event_type, captured_by, guaranteed, note) values
  ('hold_taken',     'db_trigger', true,
   'A Driver froze a pooled trip to think (docs/06 § 7). Commits with the hold itself.'),
  ('hold_committed', 'db_trigger', true,
   'The holder confirmed inside the window. The trip is theirs; accept_mission did the work.'),
  ('hold_lapsed',    'derived',    false,
   '⚑ THE SIGNAL: the clock ran out on a Driver who was looking at the price. Nothing '
   'observes T+15 s, so this row is written later by sweep_lapsed_holds() and stamped with '
   'expires_at; payload.notice_lag_s says how late we noticed.'),
  ('hold_released',  'db_trigger', true,
   'The Driver left the card before the clock ran out. Same as lapsed for the trip, '
   'different for the reading: they stopped considering it rather than running out of time.'),
  ('hold_void',      'derived',    false,
   'The trip stopped being available underneath the holder. ⚑ NOT a price rejection — '
   'merging it into hold_lapsed would poison the one number this table exists to produce.')
on conflict (event_type) do update
  set captured_by = excluded.captured_by,
      guaranteed  = excluded.guaranteed,
      note        = excluded.note;

-- ------------------------------------------------------------------- STEP 5: RLS
alter table mission_hold enable row level security;

-- Deny by default. A Driver reads only their OWN holds — whether someone else is holding a
-- trip reaches them through mission_read.hold_expires_at, which carries no identity.
drop policy if exists p_hold_self_read on mission_hold;
create policy p_hold_self_read on mission_hold for select
  using (driver_id = current_driver_id() or app_role() = 'admin');

-- ⚑ NO INSERT/UPDATE/DELETE POLICY, ON PURPOSE. Every write goes through the security
--   definer functions below, which enforce eligibility. A Driver who could INSERT here
--   directly would freeze trips they can never accept and block the Pool for everyone.

-- ------------------------------------------------------------- STEP 6: taking a hold
-- ⚑ EVERY GUARD accept_mission APPLIES, APPLIED HERE TOO. A hold is exclusive: it takes the
--   trip off the market for everyone. So a Driver who could never accept this trip must not
--   be able to freeze it — otherwise a full calendar or a wrong vehicle class blocks the
--   Pool for 15 seconds at a time. The § B, § P and ±90 min checks below are the same three
--   accept_mission runs, deliberately duplicated rather than referenced, because a shared
--   helper would have to be called under a different lock.
create or replace function place_hold(p_mission_id uuid, p_fare numeric default null)
returns mission_hold
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_driver_id uuid := current_driver_id();
  v_driver    driver;
  v_mission   mission;
  v_hold      mission_hold;
  v_seconds   int := 15;
begin
  if v_driver_id is null then
    raise exception 'Not a driver';
  end if;

  -- ⚑ SETTLE MY OWN STALE HOLDS FIRST. Nothing runs at T+15 s, so a Driver's previous hold
  --   can still read outcome='open' long after it died — and the one-at-a-time partial
  --   unique index would then lock them out of ever holding again. This is the sweep,
  --   scoped to one Driver, run at the only moment it is load-bearing.
  update mission_hold h
     set outcome = case when m.status <> 'pooled' then 'void' else 'lapsed' end,
         settled_at = now()
    from mission m
   where h.mission_id = m.id
     and h.driver_id  = v_driver_id
     and h.outcome    = 'open'
     and h.expires_at <= now();

  -- Lock the trip, exactly as accept_mission does, and in the same order.
  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.status <> 'pooled' then
    raise exception 'Mission no longer available';
  end if;

  -- § P: a dead booking can never become a live obligation.
  if v_mission.pickup_at <= now() then
    raise exception 'Mission has expired';
  end if;

  -- ⚑ SOMEONE ELSE IS ALREADY HOLDING IT. Under the row lock, so two Drivers tapping in the
  --   same tenth of a second cannot both win. Note the clock, not the column.
  if exists (
    select 1 from mission_hold h
     where h.mission_id = p_mission_id
       and h.outcome    = 'open'
       and h.expires_at > now()
       and h.driver_id <> v_driver_id
  ) then
    raise exception 'Another Driver is reviewing this mission';
  end if;

  -- § B: the Pool's matching rules.
  select * into v_driver from driver where id = v_driver_id;
  if not exists (
       select 1 from vehicle v
        where v.driver_id = v_driver_id
          and v.category  = v_mission.category
          and (v_mission.required_body_type is null
               or v_mission.required_body_type = v.body_type)
     )
     or (v_mission.luggage_only
         and not coalesce(v_driver.accepts_luggage_runs, false))
  then
    raise exception 'Not eligible for this mission';
  end if;

  -- The same ±90 min slot conflict. Freezing a trip you could never accept is the
  -- expensive mistake here, because it is everyone else's 15 seconds.
  if exists (
    select 1 from mission m
    where m.driver_id = v_driver_id
      and m.status in ('accepted','confirmed','en_route','arrived','on_board')
      and m.pickup_at between v_mission.pickup_at - interval '90 minutes'
                          and v_mission.pickup_at + interval '90 minutes'
  ) then
    raise exception 'Slot conflict with another mission';
  end if;

  -- ⚑ ONE PER TRIP, EVER — and the message says what it costs, because it costs almost
  --   nothing: they can still accept, they just cannot freeze it a second time.
  if exists (select 1 from mission_hold
              where mission_id = p_mission_id and driver_id = v_driver_id) then
    raise exception 'You have already held this mission';
  end if;

  insert into mission_hold (mission_id, driver_id, held_fare, expires_at, hold_seconds)
  values (
    p_mission_id, v_driver_id,
    -- Same clamp as accept_mission's: the caller is a server action, never a browser, and
    -- is trusted only as far as the mission's own columns can vouch for it.
    case when p_fare is null then null else
      round(least(greatest(p_fare, least(coalesce(v_mission.pdp_start, v_mission.ceiling * 0.5), v_mission.ceiling)),
                  v_mission.ceiling), 2) end,
    now() + make_interval(secs => v_seconds),
    v_seconds
  )
  returning * into v_hold;

  return v_hold;
end;
$$;

comment on function place_hold is
  'docs/06 § 7. Freezes a pooled trip for the caller for hold_seconds. Runs every guard '
  'accept_mission runs, because a hold is exclusive and a Driver who cannot accept must not '
  'be able to block. ⚑ One per Driver per trip EVER; a spent hold never blocks Accept.';

-- --------------------------------------------------------- STEP 7: giving it back early
-- Founder, S72: "if you leave the card you lose the hold, period." Best-effort from the
-- client — the clock is what guarantees the trip comes back.
create or replace function release_hold(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_driver_id uuid := current_driver_id();
begin
  if v_driver_id is null then
    raise exception 'Not a driver';
  end if;

  -- ⚑ Only a hold that is still RUNNING can be released. One already past its clock lapsed;
  --   recording that as `released` would say the Driver walked away deliberately when in
  --   fact they ran out of time, and those are the two readings this table exists to keep
  --   apart.
  update mission_hold
     set outcome = 'released', settled_at = now()
   where mission_id = p_mission_id
     and driver_id  = v_driver_id
     and outcome    = 'open'
     and expires_at > now();
end;
$$;

-- ------------------------------------------------------------------- STEP 8: the sweep
-- ⚑ THIS IS FOR THE LOG, NEVER FOR CORRECTNESS. Every guard above compares expires_at to
--   now(), so a hold is over the instant its clock runs out whether or not this ever runs.
--   What the sweep produces is the ROW — the hold_lapsed event that D109 exists to capture,
--   which cannot be collected retroactively. It rides in lib/expiry.ts's never-throws
--   wrapper beside sweepExpiredMissions, so it costs no new call sites.
create or replace function sweep_lapsed_holds()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n int;
begin
  update mission_hold h
     set outcome = case
           -- The holder took it inside the window: accept_mission already settled this to
           -- 'committed', so reaching here means the trip is theirs by some other path.
           when m.driver_id = h.driver_id then 'committed'
           -- ⚑ THE TRIP WENT AWAY UNDERNEATH THEM. Not a price rejection, and counting it as
           --   one would quietly corrupt the only number this table produces.
           when m.status <> 'pooled' then 'void'
           -- The clock ran out on a Driver looking at a price. THE signal.
           else 'lapsed'
         end,
         settled_at = now()
    from mission m
   where h.mission_id = m.id
     and h.outcome    = 'open'
     and h.expires_at <= now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function sweep_lapsed_holds is
  'Settles holds whose clock has run out, so the hold_lapsed event exists at all. ⚑ NOT a '
  'correctness mechanism: every guard reads expires_at against now(), so a hold ends on time '
  'whether or not this has run. Called from lib/expiry.ts, best-effort, never throws.';

grant execute on function place_hold(uuid, numeric)  to authenticated;
grant execute on function release_hold(uuid)         to authenticated;
grant execute on function sweep_lapsed_holds()       to authenticated;

-- --------------------------------------------------- STEP 9: the view learns one column
-- ⚑ REQUIRED, NOT OPTIONAL. .local/probe/column-leak.mts asserts mission_read's column list
--   matches mission's exactly — extras AND omissions both fail — so a new column on mission
--   that is not here turns that guard red. Which is the guard working: this view is the only
--   door onto mission for a browser session, and a column nobody added is a column nobody
--   decided the audience for.
drop view if exists public.mission_read;

create view public.mission_read
with (security_invoker = false, security_barrier = true) as
select
  m.id,
  m.business_id,
  m.dispatcher_id,
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
  m.passenger_name,
  m.pax_count,
  m.luggage_count,
  m.comment,

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
  m.passenger_names,
  m.required_languages,
  m.dress_code,
  m.driver_flags,
  m.board_name,
  m.board_file_path,
  m.driver_message,
  m.reference,
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

  m.accepted_fare,
  m.vehicle_id,

  -- ── § 7, the hold. The INSTANT, never the identity ───────────────────────
  -- Another Driver needs one fact: is this trip frozen right now, and until when.
  -- ⚑ WHO holds it is deliberately absent. "Marc is looking at this" is exactly the
  --    Pool behaviour [[d87]] cut, and it would leak a named contractor's activity to
  --    every other Driver in the region.
  -- ⚑ AND A PAST INSTANT READS AS NULL. Nothing runs at T+15 s, so the base column keeps
  --    a stale value until the sweep settles it. Masking it here means no reader can
  --    mistake a finished hold for a live one, even one that forgets to check the clock.
  case when m.hold_expires_at > now() then m.hold_expires_at end as hold_expires_at
from public.mission m
where (select app_role()) = 'admin'
   or m.business_id = (select current_business_id())
   or m.driver_id   = (select current_driver_id())
   or ((select app_role()) = 'driver' and m.status = 'pooled');
revoke all on public.mission_read from public;
grant select on public.mission_read to authenticated;
