-- 2026-09-07 · driver.verified starts refusing work
--
-- Founder, 2026-09-07: the flag starts biting TODAY.
--
-- Until now `driver.verified` was a note to yourself. It was written by the review
-- screen (lib/document-review.ts:151) and rendered in two places, and NOTHING read
-- it — `lib/eligibility.ts:25-27` said so out loud so nobody would assume otherwise:
-- *"an unverified Driver can accept work today"*. This migration makes it a door.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.
--
-- ⚑⚑ THREE PARTS, AND ALL THREE ARE LOAD-BEARING. Running only § 1 would be worse
--    than running nothing:
--
--   § 1  accept_mission  — an unverified Driver cannot TAKE a trip.
--   § 2  place_hold      — an unverified Driver cannot HOLD one either. A hold takes
--                          the trip off the market for EVERYONE for 15 s. Gate only
--                          § 1 and an unverified Driver can still freeze every trip
--                          in the Pool while never being able to accept one — a
--                          denial of service built out of a half-applied rule.
--                          app/(app)/missions/[id]/actions.ts:22-23 states the
--                          invariant in capitals: "a Driver who could never accept
--                          this trip must not be able to block it".
--   § 3  the privilege   — WITHOUT THIS THE OTHER TWO ARE THEATRE. Measured live on
--                          2026-09-07, signed in as an ordinary Driver:
--                              PATCH driver.verified -> true   200   rows=1
--                          `p_driver_self_update` (docs/kavenue_schema.sql:285) is
--                          `for update using (auth_user_id = auth.uid())` — it says
--                          WHICH ROW a Driver may edit and never WHICH COLUMNS. So a
--                          Driver could simply grant themselves the thing § 1 and § 2
--                          are checking. They can also zero their own
--                          `reliability_marks`, which is true today.
--
-- ⚑ THE TWO BODIES BELOW WERE NOT RETYPED. They were copied byte-for-byte out of
--   docs/migrations/2026-08-31i_accept_mission_hold.sql:25-139 and
--   docs/migrations/2026-08-31j_place_hold_returns_nothing.sql:32-120 — the files the
--   founder actually pasted — and then ONE guard was inserted into each. The copy was
--   diffed against its source before this file was written: +10 lines each, 0 removed.
--   The house rule is why: reproducing money logic to change one line is how you lose
--   the other 114.
--
-- ⚑ NO GRANT ON accept_mission, AND THE ABSENCE IS DELIBERATE — 31i:141-156 learned
--   this the hard way. `create or replace` PRESERVES a function's grants, so the
--   S72 wall (raw name revoked from authenticated; only accept_mission_call granted)
--   survives this change untouched. Adding a grant back would re-open the composite
--   return that handed a Driver the Ceiling. Same for place_hold: replace, do not drop
--   — a drop+create would reset the ACL to PUBLIC, which is the trap 31j:122-125 names.
--
-- ⚑ NO CHANGE TO accept_mission_call OR THE OTHER WRAPPERS. `perform` re-raises the
--   inner exception unchanged (31g:30-32), so both new refusals reach the app for free.


-- ── § 1 · accept_mission — you cannot take work until a person has approved you ──
CREATE OR REPLACE FUNCTION public.accept_mission(p_mission_id uuid, p_fare numeric DEFAULT NULL::numeric)
 RETURNS mission
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_driver_id uuid := current_driver_id();
  v_driver    driver;
  v_mission   mission;
  v_hold      mission_hold;
begin
  if v_driver_id is null then
    raise exception 'Not a driver';
  end if;

  -- lock the row; must still be pooled
  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.status <> 'pooled' then
    raise exception 'Mission no longer available';
  end if;

  -- § P: a dead booking can never become a live obligation. Checked under the
  -- same row lock as the status, so it can't be raced by the sweep.
  if v_mission.pickup_at <= now() then
    raise exception 'Mission has expired';
  end if;

  -- § 7: is someone else holding this right now?
  -- ⚑ INSIDE THE SAME GATE, UNDER THE SAME ROW LOCK, exactly as docs/06:421-423 demands:
  --   "If it were checked separately, a Driver pressing Accept in the same tenth of a second
  --   could write past a live hold and steal it. One decision point, under the existing row
  --   lock." That sentence is the reason this function is being reproduced at all.
  -- ⚑ AND IT ASKS THE CLOCK, NOT THE COLUMN. Nothing runs at T+15 s, so outcome='open' says
  --   only that nobody has swept it yet. A hold whose expires_at has passed must not block
  --   anyone — that is precisely the founder's rule that the hold spends the hold, never the
  --   trip: the holder themselves comes back through this same door, at the live price.
  select * into v_hold from mission_hold
   where mission_id = p_mission_id and outcome = 'open' and expires_at > now()
   limit 1;

  if found and v_hold.driver_id <> v_driver_id then
    raise exception 'Another Driver is reviewing this mission';
  end if;

  -- § B: the Pool's matching rules, enforced where they cannot be skipped.
  -- Read AFTER the mission lock, to keep the house lock order (mission first).
  -- No FOR UPDATE on driver — this takes no lock and cannot join a deadlock cycle.
  select * into v_driver from driver where id = v_driver_id;

  -- ⚑⚑ S76 — THE VERIFIED GATE. Placed HERE, immediately after v_driver is loaded,
  --   and the placement is the whole correctness argument: one line higher `v_driver`
  --   is an unpopulated record, `v_driver.verified` is NULL, `not NULL` is NULL — and a
  --   plpgsql `if NULL then` DOES NOT FIRE. The gate would report success and refuse
  --   nobody, for ever, with nothing to see. `verified` is `not null default false`
  --   (docs/kavenue_schema.sql:67), so once the row IS loaded the test is total.
  if not v_driver.verified then
    raise exception 'Driver account not yet approved';
  end if;
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

  -- slot-conflict: block another active mission within +/-90 min of this pickup.
  -- NOTE: crude time buffer for now; refine once we store an estimated trip duration.
  if exists (
    select 1 from mission m
    where m.driver_id = v_driver_id
      and m.status in ('accepted','confirmed','en_route','arrived','on_board')
      and m.pickup_at between v_mission.pickup_at - interval '90 minutes'
                          and v_mission.pickup_at + interval '90 minutes'
  ) then
    raise exception 'Slot conflict with another mission';
  end if;

  -- Option A: accept confirms immediately — no Lock-in time gate (was: pickup <3h
  -- away -> 'confirmed', else 'accepted').
  update mission
     set driver_id    = v_driver_id,
         status       = 'confirmed',
         accepted_at  = now(),
         confirmed_at = now(),
         -- docs/06 §9: "the fare freezes at acceptance." Same clamp shape as the
         -- fee-basis band — the caller is trusted only as far as the mission's own
         -- columns can vouch for it. NULL stays NULL: a caller that sends nothing
         -- leaves the column empty and settledFare() recomputes, exactly as before.
         -- § 7, the FLOOR. If this Driver was holding the trip, they get AT LEAST the
         -- number they were shown, and more if the curve climbed while they thought.
         -- ⚑ docs/06 §7 says "frozen" and its ⚑ argues for honouring the displayed price so
         --   nothing "changed on me". That is consumer logic and the Driver is not the
         --   consumer — they are PAID this number, so a price that rose is good news and
         --   freezing it would bill them for thinking. Founder's call, S72. The greatest()
         --   sits INSIDE the existing clamp, so the ceiling still caps everything.
         accepted_fare = case when p_fare is null and v_hold.held_fare is null then null else
           round(least(greatest(greatest(p_fare, v_hold.held_fare),
                                least(coalesce(v_mission.pdp_start, v_mission.ceiling * 0.5), v_mission.ceiling)),
                       v_mission.ceiling), 2) end
   where id = p_mission_id and status = 'pooled'   -- conditional -> atomic, first wins
   returning * into v_mission;

  if not found then
    raise exception 'Mission no longer available';
  end if;

  -- § 7: the holder took it. ⚑ AFTER the conditional UPDATE, so this only ever runs for the
  -- Driver who actually won the row — and it is the one hold outcome that IS observed, since
  -- it commits in the same transaction as the accept.
  -- ⚑ Guarded on v_hold.id rather than a re-query: a hold that lapsed before this call is
  --   deliberately left alone, so it settles as `lapsed` and stays the price signal it is.
  if v_hold.id is not null and v_hold.driver_id = v_driver_id then
    update mission_hold set outcome = 'committed', settled_at = now() where id = v_hold.id;
  end if;

  return v_mission;
end;
$function$;


-- ── § 2 · place_hold — nor can you take a trip off the market while you decide ──
create or replace function place_hold(p_mission_id uuid, p_fare numeric default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_driver_id uuid := current_driver_id();
  v_driver    driver;
  v_mission   mission;
  v_seconds   int := 15;
begin
  if v_driver_id is null then
    raise exception 'Not a driver';
  end if;

  -- Settle this Driver's own stale holds first: nothing runs at T+15 s, so an unswept lapse
  -- would otherwise occupy the one-at-a-time slot for ever.
  update mission_hold h
     set outcome = case when m.status <> 'pooled' then 'void' else 'lapsed' end,
         settled_at = now()
    from mission m
   where h.mission_id = m.id
     and h.driver_id  = v_driver_id
     and h.outcome    = 'open'
     and h.expires_at <= now();

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.status <> 'pooled' then
    raise exception 'Mission no longer available';
  end if;

  if v_mission.pickup_at <= now() then
    raise exception 'Mission has expired';
  end if;

  -- The clock, never the column.
  if exists (
    select 1 from mission_hold h
     where h.mission_id = p_mission_id
       and h.outcome    = 'open'
       and h.expires_at > now()
       and h.driver_id <> v_driver_id
  ) then
    raise exception 'Another Driver is reviewing this mission';
  end if;

  -- § B — a hold is exclusive, so a Driver who could never accept must not be able to block.
  select * into v_driver from driver where id = v_driver_id;

  -- ⚑⚑ S76 — THE VERIFIED GATE. Placed HERE, immediately after v_driver is loaded,
  --   and the placement is the whole correctness argument: one line higher `v_driver`
  --   is an unpopulated record, `v_driver.verified` is NULL, `not NULL` is NULL — and a
  --   plpgsql `if NULL then` DOES NOT FIRE. The gate would report success and refuse
  --   nobody, for ever, with nothing to see. `verified` is `not null default false`
  --   (docs/kavenue_schema.sql:67), so once the row IS loaded the test is total.
  if not v_driver.verified then
    raise exception 'Driver account not yet approved';
  end if;
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

  if exists (
    select 1 from mission m
    where m.driver_id = v_driver_id
      and m.status in ('accepted','confirmed','en_route','arrived','on_board')
      and m.pickup_at between v_mission.pickup_at - interval '90 minutes'
                          and v_mission.pickup_at + interval '90 minutes'
  ) then
    raise exception 'Slot conflict with another mission';
  end if;

  -- One per Driver per trip, ever. A spent hold never blocks Accept, only a second freeze.
  if exists (select 1 from mission_hold
              where mission_id = p_mission_id and driver_id = v_driver_id) then
    raise exception 'You have already held this mission';
  end if;

  insert into mission_hold (mission_id, driver_id, held_fare, expires_at, hold_seconds)
  values (
    p_mission_id, v_driver_id,
    case when p_fare is null then null else
      round(least(greatest(p_fare, least(coalesce(v_mission.pdp_start, v_mission.ceiling * 0.5), v_mission.ceiling)),
                  v_mission.ceiling), 2) end,
    now() + make_interval(secs => v_seconds),
    v_seconds
  );
end;
$$;

-- ── § 3 · a Driver may no longer write their own driver row ─────────────────────
--
-- ⚑ A TABLE-LEVEL REVOKE, NOT A COLUMN-LEVEL ONE, AND THAT DISTINCTION IS THIS
--   REPO'S OWN SCAR. In S72 `revoke select (ceiling) on mission` returned success
--   three times running and the column stayed readable, because a COLUMN-level
--   revoke does not bite against a TABLE-level grant — and Supabase grants tables
--   wholesale to `authenticated`. Only re-running the probe and reading the values
--   found it. This is the form that actually works.
--
-- ⚑ AND NOTHING IN THE APP LOSES ANYTHING. Every write to `driver` already goes
--   through the SERVICE ROLE after a server-side check — the profile, area, vehicle
--   and company forms (app/(app)/settings/actions.ts:63,109,141,195), onboarding
--   (app/onboarding/actions.ts:103,111), the avatar (lib/avatar-actions.ts:87,107)
--   and the review screen itself (lib/document-review.ts:160). Grepped exhaustively:
--   there is not one `.from("driver").update(` on a user session anywhere.
revoke update on driver from authenticated, anon;

-- ⚑ BELT AND BRACES, DELIBERATELY. With the grant gone this policy is already
--   unreachable — but dropping it means that if someone ever re-grants UPDATE by
--   accident, RLS denies by default (no permissive UPDATE policy = no writes) instead
--   of silently re-opening the hole. Two things must now fail, not one.
drop policy if exists p_driver_self_update on driver;

comment on column driver.verified is
  'Set by a human on /admin/drivers/[id] (lib/document-review.ts). Since 2026-09-07 '
  'this REFUSES work: accept_mission and place_hold both raise "Driver account not '
  'yet approved" when it is false. Not writable by the Driver — § 3 of '
  '2026-09-07_verified_gates_accept.sql revoked UPDATE on driver from authenticated.';


-- ⚑ AFTER RUNNING THIS, from the repo root:
--       npx tsx .local/probe/verified-gate.mts        -- expect ALL AGREE
--
--   It signs in as a REAL unverified Driver and proves all three parts on the live
--   database: accept refused, hold refused, and the self-write refused. ⚑ It FAILS
--   before this migration is pasted, by design — that is the point of it.
