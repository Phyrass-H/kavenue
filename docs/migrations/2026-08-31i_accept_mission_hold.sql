-- 2026-08-31i — Session 72: § 7's gate, inside accept_mission.
--
-- Apply AFTER 2026-08-31h (which creates mission_hold).
--
-- ⚑ THIS BODY WAS EXTRACTED FROM THE LIVE DATABASE, NOT COPIED FROM A FILE.
--   `select pg_get_functiondef(...)` on 2026-08-31, diffed against
--   docs/migrations/2026-08-22_accepted_fare.sql: identical apart from the delimiter Postgres
--   prints ($function$ vs $$). One row returned, so no stale overload was resolvable either.
--   Everything below is that text with FOUR changes, applied programmatically:
--     1. `v_hold mission_hold;` in the declare block
--     2. the § 7 hold gate, after § P and before § B — under the SAME row lock
--     3. greatest(p_fare, v_hold.held_fare) inside the existing clamp — the FLOOR
--     4. settling the holder's own hold to 'committed' after the conditional UPDATE
--   Nothing else is touched: § B eligibility, § P expiry, the ±90 min slot conflict, the
--   atomic first-wins UPDATE and the §9 ceiling clamp are the live text, byte for byte.
--
-- ⚑ WHY IT HAD TO GO IN HERE AT ALL, when S72 went out of its way to use a trigger for the
--   vehicle stamp: docs/06:421-423. "If it were checked separately, a Driver pressing Accept
--   in the same tenth of a second could write past a live hold and steal it. One decision
--   point, under the existing row lock." A trigger fires after the UPDATE has already chosen
--   a winner — too late to refuse one.
--
-- ▶ Run this in the Supabase SQL editor (Claude's keys go through PostgREST = rows only).

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
$function$

-- ⚑ NO GRANT HERE, AND THE ABSENCE IS DELIBERATE — THIS IS THE PART I GOT WRONG.
--
--   Having replaced this function, I found `accept_mission` returning
--   `42501 permission denied` to a real Driver session and concluded my `create or replace`
--   had dropped its EXECUTE grant. It had not. `create or replace` preserves a function's
--   ACL exactly, and there was no grant left to preserve: the parallel S72 session revoked
--   it hours earlier in `2026-08-31g_rpc_returns_nothing.sql`, because a SECURITY DEFINER
--   function's COMPOSITE RETURN is not subject to column privileges — so `returns mission`
--   handed a Driver the `ceiling` and `commission_business_rate` straight through the wall
--   built that morning. Nine functions were closed and given thin `*_call` wrappers that
--   return void.
--
--   ⚑ SO THE RIGHT DOOR IS `accept_mission_call`, AND THIS FUNCTION STAYING REFUSED IS THE
--     WALL WORKING. Adding `grant execute ... to authenticated` here would silently re-open
--     it. I very nearly did, and told the founder to run it. handoff-check now asserts the
--     opposite: the raw name must KEEP returning 42501 while the wrapper works.
--
--   ⚑ THE WRAPPER NEEDS NO CHANGE FOR THE HOLD. It calls accept_mission(p_mission_id,
--     p_fare) by signature, and this file keeps that signature and return type. The wrapper
--     therefore picks up the § 7 gate for free.
--
--   ⚑ AND THE REAL LESSON, which is not about permissions at all: I diagnosed a live outage
--     without once checking whether my checkout was current. It was thirteen commits behind.
--     The 42501 was real, my reading of it was not, and "the database is broken" should have
--     been the LAST hypothesis after "I am out of date", not the first.
