-- 2026-09-18 (b) — Money comes from the row, not from the caller. (S83, [[d146]]) · Paste AFTER
-- 2026-09-18a_browser_surface_locked.sql.
--
-- Four SECURITY DEFINER functions recorded a number the CALLER sent as the money that moved. A
-- signed-in Driver or Business holds its own JWT and can call the `_call` wrapper (or the raw
-- function, where EXECUTE allows) by hand with any number. Each fix is the D144 lesson applied to
-- a function: read the frozen fare off the trip, ignore what was sent. Measured on the throw-away
-- Postgres before and after (.local/probe/rls-audit/run.sh):
--
--   #4 · cancellation fee basis — both business_cancel_mission and driver_cancel_mission clamped
--        `coalesce(p_fare_snapshot, 0)` into the PDP band, never reading `accepted_fare`. A Business
--        sending 0 paid a fee on the floor instead of the agreed fare (49.50 → 36.00 on a probe); a
--        Driver sending 0 owed a penalty on the floor (55 → 40). Now the basis is the frozen fare.
--   #6 · no-show fee — mark_no_show and business_declare_no_show wrote `p_fare_snapshot` verbatim as
--        both the fee and the fare snapshot (a Driver recorded 99 999; a Business −500). No money
--        moves on a no-show today, but this row is the only record of the fee, so a future ledger
--        or dispute inherits the forged figure. Now it is the frozen fare.
--   #7 · propose_release trusted `p_proposed_by` (a Business named another Business's Dispatcher as
--        the author) and `p_from_fare` (any number, incl. negative, onto the release's cancellation
--        snapshot). Now the author is looked up from the caller and the fare is the frozen fare.
--   #9 · log_mission_event took an id from its caller and never checked the caller was party to the
--        trip, so any Driver could write `accept_rejected` / `pool_impression` rows — the admin-only
--        Pool signals — onto any Business's trip, with any payload. It also answered "no such
--        mission" before checking the caller, a (minor) id-probe oracle. Now the caller is resolved
--        first and must own the trip (or be a Driver while it is pooled), and the payload is capped.
--
-- NOT HERE: a Driver forging the ACCEPT fare (accept_mission / place_hold take p_fare and clamp it
--   to [opening, ceiling] — a Driver can always take the ceiling). Its only correct fix needs the
--   PDP curve in SQL (it lives only in lib/pdp.ts today) OR a service-role fare handoff the browser
--   cannot write — both are more than a privilege change, so they are the founder's call, written
--   up in the S83 findings. This file does NOT touch accept_mission or place_hold.
--
-- ⚑ Each function is reproduced WHOLE with `create or replace` (Postgres cannot patch a body). The
--   bodies were extracted from the live schema's rebuild and diffed back; only the lines marked
--   `⚑ S83` changed. Signatures are unchanged, so the app's rpc() calls are untouched. The dropped
--   arguments (p_fare_snapshot, p_from_fare, p_proposed_by) stay in the signature and are ignored.
-- One transaction; idempotent. After it, paste .local/probe/rls-audit/check.sql (all pass/info) and
-- re-run the money probes.

begin;

-- ═══ business_cancel_mission — fee basis from accepted_fare (finding #4)
CREATE OR REPLACE FUNCTION public.business_cancel_mission(p_mission_id uuid, p_reason text DEFAULT NULL::text, p_fare_snapshot numeric DEFAULT NULL::numeric)
 RETURNS mission
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid := current_business_id();
  v_mission     mission;
  v_hours       numeric;
  v_tread       numeric;   -- hours-to-pickup rounded UP to the top of its half-hour tread
  v_pct         numeric;
  -- 2026-08-11 — the clamped fee basis. See the header.
  v_floor       numeric;        -- the lowest fare the PDP curve could possibly have produced
  v_basis       numeric(10,2);  -- what actually gets recorded, band-clamped
  -- Scalars, not a record: a ROW() constructor assigned to a record has no named
  -- fields, so the no-waiting branch must not fabricate one.
  v_wfrom       timestamptz;
  v_wto         timestamptz;
  v_wmin        int := 0;
  v_wrate       numeric(10,2);
  v_wfee        numeric(10,2) := 0;
begin
  if v_business_id is null then raise exception 'Not a dispatcher'; end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.business_id is distinct from v_business_id then
    raise exception 'Not your mission';
  end if;
  if v_mission.status not in ('pooled','accepted','confirmed','en_route','arrived') then
    raise exception 'This trip can no longer be cancelled';
  end if;

  -- The fee basis arrives from the Business's own session and the argument is
  -- omittable, so it is trusted only as far as the mission's columns can vouch for it.
  -- v_floor is never NULL: mission.ceiling is numeric(10,2) NOT NULL
  -- (docs/kavenue_schema.sql:121), so least(...) always has a non-null operand.
  -- The coalesce on p_fare_snapshot is explicit rather than load-bearing — Postgres
  -- GREATEST/LEAST already SKIP null inputs and return null only when every input is
  -- null, so greatest(null, v_floor) is v_floor either way. It is written out so no
  -- reader has to remember that Postgres differs from the SQL standard here.
  v_floor := mission_opening_price(v_mission);
  -- ⚑ S83 [[d146]] · THE BASIS IS THE FROZEN FARE, NOT THE CALLER'S NUMBER. p_fare_snapshot was
  --   recorded as sent, so a hand-built call chose the fee basis (0 → the cheapest fee, measured).
  --   accepted_fare was itself clamped to [floor, ceiling] at accept, so it is already in band; a
  --   trip with none (a pooled cancel) has v_pct = 0 below, so the floor is a placeholder there.
  --   The app passed settledFare (= accepted_fare) anyway, so the honest number does not move.
  v_basis := round(least(greatest(coalesce(v_mission.accepted_fare, v_floor), v_floor), v_mission.ceiling), 2);

  v_hours := extract(epoch from (v_mission.pickup_at - now())) / 3600.0;
  if v_mission.status = 'pooled' or v_mission.driver_id is null then
    v_pct := 0;
  elsif v_hours > 5 then
    v_pct := 0;
  elsif v_hours < 0 then
    v_pct := 100;
  else
    -- The step. ceil(h / 0.5) * 0.5 is the top of the half-hour tread h sits in, so the
    -- pct only moves when a boundary is actually crossed. At h = 4.6 the tread top is 5.0
    -- and the fee is 50%; at h = 4.5 it becomes 55%.
    v_tread := ceil(v_hours / 0.5) * 0.5;
    v_pct   := least(100, greatest(50, 50 + 10 * (5 - v_tread)));
  end if;

  -- Waiting only accrues once the Driver is actually on site.
  if v_mission.status = 'arrived' then
    select w_from, w_to, w_min, w_rate, w_fee
      into v_wfrom, v_wto, v_wmin, v_wrate, v_wfee
      from mission_waiting(v_mission, now());
  end if;

  insert into mission_cancellation
    (mission_id, business_id, party, actor_driver_id, kind, reason,
     fee_pct, fee_amount, fare_snapshot, hours_before_pickup, resulted_in,
     waiting_minutes, waiting_rate, waiting_fee)
  values
    (v_mission.id, v_business_id, 'business', null, 'business_cancel', p_reason,
     v_pct, round(v_basis * v_pct / 100, 2), v_basis,
     v_hours, 'terminal',
     nullif(v_wmin, 0), v_wrate, nullif(v_wfee, 0));

  update mission_amendment set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';
  update mission_release set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';

  update mission set
    status              = 'cancelled',
    cancelled_by        = 'business',
    cancelled_at        = now(),
    cancellation_reason = p_reason,
    cancellation_fee    = round(v_basis * v_pct / 100, 2),
    waiting_from        = v_wfrom,
    waiting_to          = v_wto,
    waiting_minutes     = nullif(v_wmin, 0),
    waiting_rate        = v_wrate,
    waiting_fee         = nullif(v_wfee, 0)
  where id = v_mission.id;

  insert into status_event (mission_id, status) values (v_mission.id, 'cancelled');

  select * into v_mission from mission where id = p_mission_id;
  return v_mission;
end;
$function$;


-- ═══ driver_cancel_mission — fee basis from accepted_fare (finding #4)
CREATE OR REPLACE FUNCTION public.driver_cancel_mission(p_mission_id uuid, p_reason text DEFAULT NULL::text, p_fare_snapshot numeric DEFAULT NULL::numeric)
 RETURNS mission
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_driver_id uuid := current_driver_id();
  v_mission   mission;
  v_hours     numeric;
  -- 2026-08-11 — the clamped fee basis. See the header.
  v_floor     numeric;
  v_basis     numeric(10,2);
begin
  if v_driver_id is null then raise exception 'Not a driver'; end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.driver_id is distinct from v_driver_id then
    raise exception 'Not your mission';
  end if;
  if v_mission.status not in ('accepted','confirmed','en_route','arrived') then
    raise exception 'This trip can no longer be cancelled';
  end if;

  -- Same clamp as business_cancel_mission, and here the caller is the party the 100%
  -- penalty is charged TO. As of the §6 curve the re-pool below no longer touches
  -- pdp_start, so the band describes the same floor before and after — but it is still
  -- read from v_mission, taken under the row lock, so the ordering cannot drift.
  v_floor := mission_opening_price(v_mission);
  -- ⚑ S83 [[d146]] · THE BASIS IS THE FROZEN FARE, NOT THE CALLER'S NUMBER. p_fare_snapshot was
  --   recorded as sent, so a hand-built call chose the fee basis (0 → the cheapest fee, measured).
  --   accepted_fare was itself clamped to [floor, ceiling] at accept, so it is already in band; a
  --   trip with none (the trip is always accepted here) has v_pct = 0 below, so the floor is a placeholder there.
  --   The app passed settledFare (= accepted_fare) anyway, so the honest number does not move.
  v_basis := round(least(greatest(coalesce(v_mission.accepted_fare, v_floor), v_floor), v_mission.ceiling), 2);

  v_hours := extract(epoch from (v_mission.pickup_at - now())) / 3600.0;

  insert into mission_cancellation
    (mission_id, business_id, party, actor_driver_id, kind, reason,
     fee_pct, fee_amount, fare_snapshot, hours_before_pickup, resulted_in)
  values
    (v_mission.id, v_mission.business_id, 'driver', v_driver_id, 'driver_cancel', p_reason,
     100, v_basis, v_basis, v_hours, 'repooled');

  update driver set reliability_marks = reliability_marks + 1 where id = v_driver_id;

  -- Any negotiation artifact with THIS Driver dies with the re-pool — it must not
  -- survive to the next Driver who accepts the re-pooled trip.
  update mission_amendment set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';
  update mission_release set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';

  -- A RE-POOL CHANGES NOTHING ABOUT THE PRICE EXCEPT THAT TIME HAS PASSED
  -- (founder, 2026-08-22, [[d82]]). It used to do three things here; it now does none:
  --   * RESTART the climb -- removed 2026-08-22 ([[d81]]): the curve runs to the
  --     pickup, so a trip dropped two days out simply reads the two-days-out price.
  --   * RAISE the opening price to the fare the last Driver agreed to -- removed
  --     here. It made a re-pooled trip permanently DEARER than one nobody had
  --     touched (52,70 against 43,37 on a live probe), which is exactly the
  --     history-dependence [[d81]] exists to remove.
  --   * FLIP SPEED WIN on under 24h -- removed here too. SPEED WIN raises where the
  --     curve OPENS, so its effect SHRINKS as the pickup nears: measured on a
  --     110 EUR Ceiling it is worth +33% at T-48h, +7% at T-12h and +0% at T-5h.
  --     Switching it on BECAUSE a trip became urgent does least exactly when it is
  --     needed most. It is also the Business's own checkbox and their money, and
  --     Kavenue moving it unasked is Kavenue nudging the fare (docs/01, docs/06 s0).
  --     It is now only ever what the Business set.
  -- With no flip there is nothing left to branch on, so the two branches collapse.
  -- The frozen fare is still cleared: nobody holds this trip any more.
  update mission set
    status = 'pooled', driver_id = null, accepted_at = null, confirmed_at = null, checked_in_at = null,
    stops_reached = 0, pooled_at = now(), accepted_fare = null
  where id = v_mission.id;

  insert into status_event (mission_id, status) values (v_mission.id, 'repooled');

  select * into v_mission from mission where id = p_mission_id;
  return v_mission;
end;
$function$;


-- ═══ mark_no_show — fee from accepted_fare (finding #6)
CREATE OR REPLACE FUNCTION public.mark_no_show(p_mission_id uuid, p_fare_snapshot numeric DEFAULT NULL::numeric)
 RETURNS mission
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_driver_id uuid := current_driver_id();
  v_mission   mission;
  v_arrived   timestamptz;
  v_wait      interval;
  v_guest_due timestamptz;
  v_floor     constant interval := interval '5 minutes';
  v_basis     numeric(10,2);
  v_w         record;
begin
  if v_driver_id is null then raise exception 'Not a driver'; end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.driver_id is distinct from v_driver_id then
    raise exception 'Not your mission';
  end if;
  if v_mission.status <> 'arrived' then
    raise exception 'You can only report a no-show once you have arrived at the pickup';
  end if;

  select max(created_at) into v_arrived
    from status_event where mission_id = p_mission_id and status = 'arrived';
  if v_arrived is null then
    raise exception 'You can only report a no-show once you have arrived at the pickup';
  end if;

  v_wait := case
              when nullif(v_mission.flight_number, '') is not null
                or v_mission.pickup_address ~* '(a[eé]roport|airport)'
                or coalesce(v_mission.pickup_label, '') ~* '(a[eé]roport|airport)'
              then interval '60 minutes'
              else interval '20 minutes'
            end;
  v_guest_due := coalesce(v_mission.guest_ready_at, v_mission.pickup_at);

  if now() < v_guest_due + v_wait then
    raise exception 'The courtesy wait has not elapsed yet';
  end if;
  if now() < v_arrived + v_floor then
    raise exception 'Give it a few minutes on site before reporting a no-show';
  end if;

  -- ⚑ S83 [[d146]] · the no-show fee is the frozen fare, not p_fare_snapshot (finding #6). A
  --   no-show only fires on an 'arrived' trip, so accepted_fare is always set; the floor is a
  --   belt-and-braces coalesce. p_fare_snapshot is no longer read.
  v_basis := round(coalesce(v_mission.accepted_fare, mission_opening_price(v_mission)), 2);

  select * into v_w from mission_waiting(v_mission, now());

  insert into mission_cancellation
    (mission_id, business_id, party, actor_driver_id, kind, reason,
     fee_pct, fee_amount, fare_snapshot, hours_before_pickup, resulted_in,
     waiting_minutes, waiting_rate, waiting_fee)
  values
    (v_mission.id, v_mission.business_id, 'driver', v_driver_id, 'no_show', 'Guest did not show',
     100, v_basis, v_basis,
     extract(epoch from (v_mission.pickup_at - now())) / 3600.0, 'terminal',
     v_w.w_min, v_w.w_rate, v_w.w_fee);

  -- A terminal path must clear any pending negotiation artifact (mark_no_show was the only
  -- one that superseded neither — the other terminal RPCs already do this).
  update mission_amendment set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';
  update mission_release set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';

  update mission set
    status          = 'completed',
    no_show         = true,
    no_show_at      = now(),
    no_show_by      = 'driver',
    waiting_from    = v_w.w_from,
    waiting_to      = v_w.w_to,
    waiting_minutes = v_w.w_min,
    waiting_rate    = v_w.w_rate,
    waiting_fee     = v_w.w_fee
  where id = v_mission.id;

  insert into status_event (mission_id, status) values (v_mission.id, 'no_show');

  select * into v_mission from mission where id = p_mission_id;
  return v_mission;
end;
$function$;


-- ═══ business_declare_no_show — fee from accepted_fare (finding #6)
CREATE OR REPLACE FUNCTION public.business_declare_no_show(p_mission_id uuid, p_fare_snapshot numeric DEFAULT NULL::numeric)
 RETURNS mission
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid := current_business_id();
  v_mission     mission;
  v_wait        interval;
  v_guest_due   timestamptz;
  v_w           record;
  v_basis       numeric(10,2);
begin
  if v_business_id is null then raise exception 'Not a dispatcher'; end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.business_id is distinct from v_business_id then
    raise exception 'Not your mission';
  end if;
  if v_mission.status <> 'arrived' then
    raise exception 'You can only stop the wait once the Driver is at the pickup';
  end if;

  v_wait := case
              when nullif(v_mission.flight_number, '') is not null
                or v_mission.pickup_address ~* '(a[eé]roport|airport)'
                or coalesce(v_mission.pickup_label, '') ~* '(a[eé]roport|airport)'
              then interval '60 minutes'
              else interval '20 minutes'
            end;
  v_guest_due := coalesce(v_mission.guest_ready_at, v_mission.pickup_at);

  -- Not before the courtesy wait is over: otherwise this becomes a cheap early cancel.
  if now() < v_guest_due + v_wait then
    raise exception 'The courtesy wait has not elapsed yet';
  end if;

  -- ⚑ S83 [[d146]] · the no-show fee is the frozen fare, not p_fare_snapshot (finding #6). A
  --   no-show only fires on an 'arrived' trip, so accepted_fare is always set; the floor is a
  --   belt-and-braces coalesce. p_fare_snapshot is no longer read.
  v_basis := round(coalesce(v_mission.accepted_fare, mission_opening_price(v_mission)), 2);

  select * into v_w from mission_waiting(v_mission, now());

  insert into mission_cancellation
    (mission_id, business_id, party, actor_driver_id, kind, reason,
     fee_pct, fee_amount, fare_snapshot, hours_before_pickup, resulted_in,
     waiting_minutes, waiting_rate, waiting_fee)
  values
    (v_mission.id, v_business_id, 'business', v_mission.driver_id, 'business_no_show',
     'Business stopped the wait — Guest not coming',
     100, v_basis, v_basis,
     extract(epoch from (v_mission.pickup_at - now())) / 3600.0, 'terminal',
     v_w.w_min, v_w.w_rate, v_w.w_fee);

  update mission_amendment set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';
  update mission_release set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';

  update mission set
    status          = 'completed',
    no_show         = true,
    no_show_at      = now(),
    no_show_by      = 'business',
    waiting_from    = v_w.w_from,
    waiting_to      = v_w.w_to,
    waiting_minutes = v_w.w_min,
    waiting_rate    = v_w.w_rate,
    waiting_fee     = v_w.w_fee
  where id = v_mission.id;

  insert into status_event (mission_id, status) values (v_mission.id, 'no_show');

  select * into v_mission from mission where id = p_mission_id;
  return v_mission;
end;
$function$;


-- ═══ propose_release — author + fare from the server, not the caller (finding #7)
CREATE OR REPLACE FUNCTION public.propose_release(p_mission_id uuid, p_note text DEFAULT NULL::text, p_from_fare numeric DEFAULT NULL::numeric, p_proposed_by uuid DEFAULT NULL::uuid)
 RETURNS mission_release
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid := current_business_id();
  v_mission     mission;
  v_release     mission_release;
begin
  if v_business_id is null then raise exception 'Not a dispatcher'; end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.business_id is distinct from v_business_id then
    raise exception 'Not your mission';
  end if;
  if v_mission.status not in ('accepted','confirmed') or v_mission.driver_id is null then
    raise exception 'This trip can no longer be released';
  end if;

  update mission_release set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';

  -- ONE LIVE ASK: a release request also retires a pending CHANGE request, so the
  -- Driver is never holding two contradictory asks whose answer order moves money.
  update mission_amendment set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';

  -- ⚑ S83 [[d146]] · the author and the fare come from the server's own facts, not the caller
  --   (finding #7): proposed_by is a Dispatcher of THIS Business, and from_fare is the frozen fare.
  --   The app already passed exactly these (ctx.dispatcher.id, settledFare), so nothing moves.
  insert into mission_release
    (mission_id, business_id, driver_id, proposed_by, status, note, from_fare, hours_before_pickup)
  values
    (v_mission.id, v_business_id, v_mission.driver_id,
     (select id from dispatcher where auth_user_id = auth.uid() and business_id = v_business_id limit 1),
     'proposed', p_note, v_mission.accepted_fare,
     extract(epoch from (v_mission.pickup_at - now())) / 3600.0)
  returning * into v_release;

  return v_release;
end;
$function$;


-- ═══ log_mission_event — caller must be party to the trip; probe + payload closed (finding #9)
CREATE OR REPLACE FUNCTION public.log_mission_event(p_mission_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ⚑ S83 [[d146]] · WHO is asking, decided BEFORE we say whether the trip exists — so a caller
  --   with no standing cannot use the "no such mission" message to probe ids (finding #9).
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

  select * into v_mission from mission where id = p_mission_id;
  if not found then
    raise exception 'log_mission_event: no such mission';
  end if;

  -- ⚑ AND THE CALLER MUST BE PARTY TO THIS TRIP: its Business's Dispatcher, its Driver, or a
  --   Driver while it is still pooled (a Pool impression / a refused accept). Anyone else could
  --   pollute another tenant's admin timeline with any event and any payload.
  if not (
       (v_actor_kind = 'dispatcher' and v_mission.business_id = current_business_id())
    or (v_actor_kind = 'driver' and (v_mission.driver_id = v_actor_id or v_mission.status = 'pooled'))
  ) then
    raise exception 'log_mission_event: not your mission';
  end if;

  -- A log payload is a handful of scalars; anything larger is not a legitimate client event.
  if length(coalesce(p_payload, '{}'::jsonb)::text) > 2000 then
    raise exception 'log_mission_event: payload too large';
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
$function$;

commit;

notify pgrst, 'reload schema';
