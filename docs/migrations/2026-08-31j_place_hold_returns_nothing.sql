-- 2026-08-31j — Session 72: § 7's hold joins the wrapper rule.
--
-- Apply AFTER 2026-08-31i.
--
-- ⚑ WHY, WHEN NOTHING IS LEAKING TODAY.
-- `2026-08-31g_rpc_returns_nothing.sql` closed nine SECURITY DEFINER functions to browser
-- sessions and put void wrappers in front, because a function's COMPOSITE RETURN is not
-- subject to column privileges: `returns mission` handed each side the other's money
-- straight through the walls, whatever the column grants said.
--
-- `place_hold` was written hours later and shipped `returns mission_hold`, granted directly
-- to `authenticated` — the same shape, missed because I was reading the hold spec and not
-- the wall. Every column of `mission_hold` belongs to the caller (their own held_fare, their
-- own clock), so nothing crosses a wall today. That is the whole problem with leaving it:
-- **the day someone adds an admin note, a review flag or a Business-side figure to that
-- table, it leaks with no code change and no warning.** The class of bug is the return type,
-- not the columns that happen to be in it right now.
--
-- ⚑ AND THE APP NEVER USED THE RETURN VALUE. `holdMission` checks `error` and discards the
--   row; the screen re-reads through `mission_hold`'s RLS, which is scoped to the caller.
--   So this costs nothing to adopt.
--
-- ⚑ A RETURN TYPE CANNOT BE CHANGED BY `create or replace` — Postgres refuses. Hence the
--   drop, and hence this being its own migration rather than an edit to 31h.
--
-- ▶ Run this in the Supabase SQL editor (Claude's keys go through PostgREST = rows only).

-- The body is unchanged and is NOT reproduced here: `place_hold` keeps every guard it has.
-- Only the outermost door changes.
drop function if exists place_hold(uuid, numeric);

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

-- ⚑ EXECUTE DEFAULTS TO PUBLIC IN POSTGRES, and a `drop` + `create` starts from that default
--   rather than from whatever the old function carried. State it explicitly, in both
--   directions — the same shape 31g used, and the reason S72 spent an hour on a permission
--   it had misdiagnosed.
revoke execute on function place_hold(uuid, numeric) from public, anon;
grant  execute on function place_hold(uuid, numeric) to authenticated;

comment on function place_hold is
  'docs/06 § 7. Freezes a pooled trip for the caller for hold_seconds. Returns VOID by the '
  '31g rule: a SECURITY DEFINER composite return is not subject to column privileges, so no '
  'row shape crosses to a browser session. The screen re-reads mission_hold under its own RLS.';
