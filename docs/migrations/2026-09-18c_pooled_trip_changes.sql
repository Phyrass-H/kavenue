-- 2026-09-18 (c) — a Business raises its Ceiling, or changes the car, on a trip still in the Pool
-- (S83, [[d147]]). Paste AFTER 2026-09-18a and 2026-09-18b (the S83 security sweep, [[d146]]),
-- then 2026-09-18d, then .local/probe/pooled-trip-changes/check.sql (read-only: every row `pass`).
--
-- THE FOUNDER'S RULES (2026-09-18), both actions:
--   · only while the trip is in the Pool — pooled, no Driver, pickup ahead — and never under a
--     Driver's live 15-second hold (the price must not move under the Driver who is deciding);
--   · every change is recorded: who, from what, to what, when (§ 5, a TRIGGER, so no path can
--     skip it — not the service role, not an admin in the SQL editor).
--   RAISE: only up; as many times as they like; the price keeps its place on the climb (same
--     progress, a taller climb) — the clock never moves, so the trip tops out when it always would.
--   CHANGE THE CAR: "at any time for any reasons before Driver takes it and update the price based
--     on the new selection" — class, body, make and model. When the rate card prices the new car
--     differently, the floor becomes the new card's floor (computed HERE, never sent) and the
--     Ceiling is the Business's new number, not below that floor. A cheaper car may read cheaper.
--
-- ⚑ D144 FROZE A POSTED TRIP FROM THE BROWSER, on purpose, and this file does not reopen it: both
--   actions are SECURITY DEFINER functions that re-check ownership, status, the hold and the floor
--   against the LOCKED row. Inside them current_user is the owner, so D144's guard lets the write
--   through (its own header: "every accept/cancel/no-show/repool RPC → its owner (skipped)").
--   No table grant changes. The new column is written only here.
--
-- ⚑ THE PRICE MUST NEVER DIP ON A RAISE (docs/06:380). lib/pdp.ts draws the climb as a staircase
--   of `stepCount(gap)` steps, one per ~€2 of gap. A raise widens the gap, which redraws the
--   staircase — measured S83 on the real code: up to €0.95 LOWER, about 1 raise in 8. So the first
--   change FREEZES the step count the trip was climbing on (`pdp_step_count`), and the curve keeps
--   it: with the steps fixed, the price at every instant is (1−s)·opening + s·Ceiling for the SAME
--   s, which a higher Ceiling can only raise. Frozen once, never overwritten (coalesce). Not frozen
--   when there is nothing to protect: before the climb opens (T−14 days — the price is the opening
--   price either way, and the €2 steps survive) or with no gap (Ceiling at the floor).
--   Every existing trip keeps NULL, so its present and past prices are byte-identical.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.

begin;

-- ── 0 · the paste order, ENFORCED (review, S83) ─────────────────────────────────────────────
-- 18d is built on 18a's view, and this file on the sweep's grants. Pasted early, 18d would half-
-- apply 18a and then 18a itself would fail on the view. So: refuse loudly, change nothing.
do $$
begin
  if to_regprocedure('public.mission_guard_board_file()') is null then
    raise exception 'Paste 2026-09-18a_browser_surface_locked.sql first, then 18b, then this file (18c).';
  end if;
  if position('THE BASIS IS THE FROZEN FARE'
              in pg_get_functiondef('public.business_cancel_mission(uuid, text, numeric)'::regprocedure)) = 0 then
    raise exception 'Paste 2026-09-18b_money_from_the_row.sql first, then this file (18c).';
  end if;
end $$;

-- ── 1 · the frozen step count ───────────────────────────────────────────────────────────────
alter table public.mission add column if not exists pdp_step_count smallint;

alter table public.mission drop constraint if exists mission_pdp_step_count_range;
alter table public.mission add constraint mission_pdp_step_count_range
  check (pdp_step_count is null or pdp_step_count between 8 and 60);

comment on column public.mission.pdp_step_count is
  'S83 (D147). The number of steps in the PDP staircase, frozen by the first Ceiling raise or '
  'price-moving car change so a change can never lower the price (lib/pdp.ts). NULL = never '
  'changed: the curve derives it from the gap, as it always did. Written only by raise_ceiling '
  'and change_trip_car. ⚑ Not granted to any browser role; not the old pdp_step (euros).';

-- ── 2 · two helpers, called only from inside the definer functions ──────────────────────────
-- The step count lib/pdp.ts derives: openingPrice() then stepCount(). ⚑ float8, not numeric, so
-- it rounds exactly as JavaScript's Math.round does (the probe checks a grid of both).
create or replace function public.pdp_ladder_steps(
  p_ceiling numeric, p_pdp_start numeric, p_speed_win boolean
) returns smallint
language sql
immutable
set search_path = public, pg_temp
as $$
  with x as (
    select p_ceiling::float8                                   as c,
           coalesce(p_pdp_start::float8, p_ceiling::float8 * 0.5) as fl
  ), o as (
    select c, least(case when p_speed_win then greatest(fl, c * 0.7) else fl end, c) as op from x
  )
  select case when c - op > 0
              then least(60, greatest(8, floor((c - op) / 2 + 0.5)))::smallint
         end
    from o
$$;

-- lib/commission.ts courseFromBusinessTotal(): the LARGEST Course whose all-in does not exceed
-- the total (a maximum is a promise). Rows with no saved rates take the total as it is.
create or replace function public.course_from_business_total(
  p_total numeric, p_business_rate_ht numeric, p_fee_vat_rate numeric
) returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  t numeric := round(greatest(coalesce(p_total, 0), 0), 2);
  f numeric;
  c numeric;
begin
  if p_business_rate_ht is null or p_fee_vat_rate is null or t = 0 then
    return t;
  end if;
  f := 1 + p_business_rate_ht * (1 + p_fee_vat_rate);
  c := round(t / f, 2);
  while c > 0 and round(c * f, 2) > t loop c := c - 0.01; end loop;
  while round((c + 0.01) * f, 2) <= t loop c := c + 0.01; end loop;
  return c;
end;
$$;

revoke all on function public.pdp_ladder_steps(numeric, numeric, boolean)            from public, anon, authenticated;
revoke all on function public.course_from_business_total(numeric, numeric, numeric)  from public, anon, authenticated;

-- ── 3 · raise the Ceiling ───────────────────────────────────────────────────────────────────
-- p_ceiling is the new Ceiling in COURSE space (mission.ceiling's own unit). The server action
-- converts the Business's all-in figure with the trip's OWN saved rates (docs/06 §3).
create or replace function public.raise_ceiling(p_mission_id uuid, p_ceiling numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := current_business_id();
  v_mission  mission;
  v_new      numeric := round(p_ceiling, 2);
  v_n        smallint;
begin
  if v_business is null then
    raise exception 'Not a dispatcher';
  end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.business_id is distinct from v_business then
    raise exception 'Not your mission';
  end if;
  if v_mission.status <> 'pooled' or v_mission.driver_id is not null then
    raise exception 'This trip is no longer in the Pool';
  end if;
  if v_mission.pickup_at <= now() then
    raise exception 'Mission has expired';
  end if;
  -- The clock, never the column — and BOTH conditions, as accept_mission reads it: a hold
  -- released early keeps a future expires_at and must not block.
  if exists (select 1 from mission_hold h
              where h.mission_id = p_mission_id and h.outcome = 'open' and h.expires_at > now()) then
    raise exception 'A Driver is reviewing this trip';
  end if;
  if v_new is null or v_new <= v_mission.ceiling then
    raise exception 'A raise must be higher than the current Ceiling';
  end if;

  if v_mission.pdp_step_count is null and now() > v_mission.pickup_at - interval '14 days' then
    v_n := pdp_ladder_steps(v_mission.ceiling, v_mission.pdp_start, v_mission.speed_win);
  end if;

  perform set_config('kavenue.write_via', 'raise_ceiling', true);
  update mission
     set ceiling        = v_new,
         pdp_step_count = coalesce(pdp_step_count, v_n)
   where id = p_mission_id;
end;
$$;

-- ── 4 · change the car ──────────────────────────────────────────────────────────────────────
-- p_ceiling: the new Ceiling in COURSE space when the price moves, NULL when it does not (a make/
-- model change, "Any" ↔ Sedan, any Eco body — the card has one row for those). The floor is never
-- a parameter: it is priced here, from the trip's own distance and night flag, exactly as a post is.
create or replace function public.change_trip_car(
  p_mission_id uuid,
  p_category   vehicle_category,
  p_body       body_type,
  p_make       text,
  p_model      text,
  p_ceiling    numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := current_business_id();
  v_mission  mission;
  v_make     text := nullif(btrim(coalesce(p_make, '')), '');
  v_model    text := nullif(btrim(coalesce(p_model, '')), '');
  v_old_card uuid;
  v_new_card uuid;
  v_q        record;
  v_floor    numeric;
  v_new      numeric := round(p_ceiling, 2);
  v_n        smallint;
begin
  if v_business is null then
    raise exception 'Not a dispatcher';
  end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.business_id is distinct from v_business then
    raise exception 'Not your mission';
  end if;
  if v_mission.status <> 'pooled' or v_mission.driver_id is not null then
    raise exception 'This trip is no longer in the Pool';
  end if;
  if v_mission.pickup_at <= now() then
    raise exception 'Mission has expired';
  end if;
  if exists (select 1 from mission_hold h
              where h.mission_id = p_mission_id and h.outcome = 'open' and h.expires_at > now()) then
    raise exception 'A Driver is reviewing this trip';
  end if;

  -- The request itself, the booking form's own rules.
  if v_mission.luggage_only then
    raise exception 'A luggage run is always Business · Van';
  end if;
  if p_category is null or p_category::text not in ('eco', 'business', 'luxury') then
    raise exception 'Unknown class';
  end if;
  if (v_make is null) <> (v_model is null) then
    raise exception 'A specific car needs both a make and a model';
  end if;
  if v_make is not null and p_body is null then
    raise exception 'A specific car needs a body type';
  end if;
  if v_make is not null and p_category::text = 'eco' then
    raise exception 'Eco has no specific cars';
  end if;
  if length(coalesce(v_make, '')) > 60 or length(coalesce(v_model, '')) > 60 then
    raise exception 'Car name too long';
  end if;
  if p_body = 'sedan' and coalesce(v_mission.pax_count, 0) > 4 then
    raise exception 'A Sedan seats 4';
  end if;
  if (v_mission.category, v_mission.required_body_type, v_mission.required_make, v_mission.required_model)
     is not distinct from (p_category, p_body, v_make, v_model) then
    raise exception 'Nothing changed';
  end if;

  -- Does the price move? Only when the rate-card ROW differs — both looked up now, as a post is.
  v_old_card := (rate_card_for(v_mission.category, v_mission.required_body_type)).id;
  v_new_card := (rate_card_for(p_category, p_body)).id;
  if v_new_card is null then
    raise exception 'No price for this class';
  end if;

  perform set_config('kavenue.write_via', 'change_trip_car', true);

  if v_old_card is not distinct from v_new_card then
    if p_ceiling is not null and v_new is distinct from v_mission.ceiling then
      raise exception 'The price does not change with this car';
    end if;
    update mission
       set category           = p_category,
           required_body_type = p_body,
           required_make      = v_make,
           required_model     = v_model
     where id = p_mission_id;
    return;
  end if;

  if v_mission.distance_km is null then
    raise exception 'This trip has no distance on record, so the new price cannot be worked out';
  end if;
  select * into v_q
    from mission_price(p_category, p_body, v_mission.distance_km, coalesce(v_mission.night_applied, false));
  if v_q.rate_card_id is null then
    raise exception 'No price for this class';
  end if;
  v_floor := course_from_business_total(round(v_q.floor_price, 2),
                                        v_mission.commission_business_rate,
                                        v_mission.commission_vat_rate);
  if v_new is null then
    raise exception 'A new Ceiling is needed for this car';
  end if;
  if v_new < v_floor then
    raise exception 'Below the lowest price for this car';
  end if;

  if v_mission.pdp_step_count is null and now() > v_mission.pickup_at - interval '14 days' then
    v_n := pdp_ladder_steps(v_mission.ceiling, v_mission.pdp_start, v_mission.speed_win);
  end if;

  update mission
     set category           = p_category,
         required_body_type = p_body,
         required_make      = v_make,
         required_model     = v_model,
         rate_card_id       = v_q.rate_card_id,
         pdp_start          = v_floor,
         ceiling            = v_new,
         pdp_step_count     = coalesce(pdp_step_count, v_n)
   where id = p_mission_id;
end;
$$;

-- ⚑ `create function` grants EXECUTE to PUBLIC (CLAUDE.md rule 6), and 18a's default privileges
--   give a new function nothing at all. State both directions explicitly.
revoke execute on function public.raise_ceiling(uuid, numeric) from public, anon;
grant  execute on function public.raise_ceiling(uuid, numeric) to authenticated;
revoke execute on function public.change_trip_car(uuid, vehicle_category, body_type, text, text, numeric) from public, anon;
grant  execute on function public.change_trip_car(uuid, vehicle_category, body_type, text, text, numeric) to authenticated;

-- ── 5 · the record: a trigger, so nothing can change the price terms of a trip in the Pool ──
--   without leaving a row. `after update of <cols>` fires whenever a column is MENTIONED, so the
--   first test is whether anything actually changed.
create or replace function public.trg_mission_price_terms_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_actor_kind text := 'unknown';
  v_actor_id   uuid;
  v_car        boolean;
  v_type       text;
  v_b          numeric := new.commission_business_rate;
  v_v          numeric := new.commission_vat_rate;
  v_all_from   numeric;
  v_all_to     numeric;
  v_market     numeric;
begin
  if (old.ceiling, old.pdp_start, old.speed_win, old.category, old.required_body_type,
      old.required_make, old.required_model, old.rate_card_id, old.pdp_step_count)
     is not distinct from
     (new.ceiling, new.pdp_start, new.speed_win, new.category, new.required_body_type,
      new.required_make, new.required_model, new.rate_card_id, new.pdp_step_count) then
    return null;
  end if;

  -- WHO — exactly as trg_mission_event_log names an actor. auth.uid() survives a SECURITY
  -- DEFINER function (it swaps the role, not the JWT claims); NULL under the service role.
  if v_uid is not null then
    select d.id into v_actor_id from dispatcher d where d.auth_user_id = v_uid limit 1;
    if found then
      v_actor_kind := 'dispatcher';
    else
      select dr.id into v_actor_id from driver dr where dr.auth_user_id = v_uid limit 1;
      if found then v_actor_kind := 'driver'; end if;
    end if;
  end if;

  v_car := (old.category, old.required_body_type, old.required_make, old.required_model)
           is distinct from
           (new.category, new.required_body_type, new.required_make, new.required_model);
  v_type := case
    when v_car then 'trip_car_changed'
    when new.ceiling > old.ceiling
     and (old.pdp_start, old.speed_win, old.rate_card_id)
         is not distinct from (new.pdp_start, new.speed_win, new.rate_card_id) then 'ceiling_raised'
    else 'price_terms_changed'
  end;

  select s.business_total into v_all_from from commission_split(old.ceiling, v_b, 0, v_v) s;
  select s.business_total into v_all_to   from commission_split(new.ceiling, v_b, 0, v_v) s;
  if new.rate_card_id is distinct from old.rate_card_id and new.distance_km is not null then
    select p.ceiling_price into v_market
      from mission_price(new.category, new.required_body_type, new.distance_km,
                         coalesce(new.night_applied, false)) p;
  end if;

  insert into mission_event
    (mission_id, business_id, driver_id, event_type, actor_kind,
     actor_auth_user_id, actor_id, audience, source, payload)
  values
    (new.id, new.business_id, null, v_type, v_actor_kind,
     v_uid, v_actor_id, array['business', 'admin'], 'db_trigger',
     jsonb_build_object(
       'from', jsonb_build_object(
         'ceiling', old.ceiling, 'pdp_start', old.pdp_start, 'speed_win', old.speed_win,
         'category', old.category::text, 'required_body_type', old.required_body_type::text,
         'required_make', old.required_make, 'required_model', old.required_model,
         'rate_card_id', old.rate_card_id, 'pdp_step_count', old.pdp_step_count),
       'to', jsonb_build_object(
         'ceiling', new.ceiling, 'pdp_start', new.pdp_start, 'speed_win', new.speed_win,
         'category', new.category::text, 'required_body_type', new.required_body_type::text,
         'required_make', new.required_make, 'required_model', new.required_model,
         'rate_card_id', new.rate_card_id, 'pdp_step_count', new.pdp_step_count),
       'all_in_from',           v_all_from,
       'all_in_to',             v_all_to,
       'business_rate_ht',      v_b,
       'fee_vat_rate',          v_v,
       'market_ceiling_all_in', round(v_market, 2),
       -- nullif: once a pooled connection has seen the setting, "unset" reads '' rather than NULL
       'via',                   nullif(current_setting('kavenue.write_via', true), '')));

  return null;
end;
$$;

revoke all on function public.trg_mission_price_terms_log() from public, anon, authenticated;

-- The schedule reads a Business's price-terms events on every render (it refreshes every 4 s
-- while open): a partial index keeps that read on the rows it wants.
create index if not exists mission_event_price_terms_idx
  on public.mission_event (business_id, occurred_at desc)
  where event_type in ('ceiling_raised', 'trip_car_changed', 'price_terms_changed');

drop trigger if exists mission_price_terms_log on public.mission;
create trigger mission_price_terms_log
  after update of ceiling, pdp_start, speed_win, category, required_body_type,
                  required_make, required_model, rate_card_id, pdp_step_count
  on public.mission
  for each row
  when (old.status = 'pooled' and new.status = 'pooled')
  execute function public.trg_mission_price_terms_log();

-- ── 6 · the vocabulary (D109: a new type ships with its registry row) ──────────────────────
insert into mission_event_type (event_type, captured_by, guaranteed, note) values
  ('ceiling_raised',      'db_trigger', true,
   'S83. A pooled trip''s Ceiling went up, nothing else about its price. payload.from/to carry '
   'every price term; all_in_from/all_in_to the Business''s figures; via = raise_ceiling.'),
  ('trip_car_changed',    'db_trigger', true,
   'S83. A pooled trip''s class, body, make or model changed (not a Driver''s own car: that is '
   'car_changed). payload.from/to carry every price term; market_ceiling_all_in when re-priced.'),
  ('price_terms_changed', 'db_trigger', true,
   'S83. Any other change to a pooled trip''s price terms (e.g. a service-role edit of speed_win). '
   'Actor unknown under the service role.')
on conflict (event_type) do update
  set captured_by = excluded.captured_by,
      guaranteed  = excluded.guaranteed,
      note        = excluded.note;

commit;

notify pgrst, 'reload schema';
