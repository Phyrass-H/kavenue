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
         accepted_fare = case when p_fare is null then null else
           round(least(greatest(p_fare, least(coalesce(v_mission.pdp_start, v_mission.ceiling * 0.5), v_mission.ceiling)),
                       v_mission.ceiling), 2) end
   where id = p_mission_id and status = 'pooled'   -- conditional -> atomic, first wins
   returning * into v_mission;

  if not found then
    raise exception 'Mission no longer available';
  end if;

  return v_mission;
end;
$function$
