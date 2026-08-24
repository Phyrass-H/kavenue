-- 2026-08-24 — THE BUSINESS CAN ACTUALLY TAKE A TRIP BACK NOW.
--
-- ⚑ THE BUG: `reclaim_mission` demanded `status = 'accepted'`. That status has
-- not existed since Option A / [[d55]] made `accept_mission` confirm immediately.
-- Measured on the live DB 2026-08-24, three ways, all agreeing:
--
--     mission.status            280 rows · 'accepted' = 0
--     status_event history      715 rows · 'accepted' = 0
--     mission_cancellation        0 rows · so this RPC has NEVER run
--
-- So the reclaim was not "late" — it was UNREACHABLE. The button in
-- components/trip-row.tsx carried the same dead condition and has never rendered
-- for anyone. This is the § R follow-up the S65 handoff queued as step 2.
--
-- WHAT CHANGES — two things, and nothing else:
--
--   1. THE GATE. `accepted` -> `confirmed AND checked_in_at IS NULL`. Check-in is
--      the signal that survived [[d55]]: `checked_in_at` is live and populated on
--      184 rows, and `checkInOpen()` in lib/dispatch-status.ts already reads it.
--
--   2. THE WINDOW. T-60min -> T-2h (founder, 2026-08-24, [[d86]]). Check-in opens
--      at T-3h (`CHECK_IN_OPENS_MS`), so the Driver keeps a full hour of grace
--      before the trip can be taken off them, and a replacement gets two hours.
--      T-60min left the replacement less time than the drive itself: the default
--      50 km radius implies 45-75 min on the Riviera, and the +/-90min slot band
--      has already excluded any Driver working either side of the pickup.
--
--      Widening it costs the short-notice trips nothing. Median lead time from
--      posting to pickup is 58h and 16% of trips are posted inside 3h — and those
--      auto-confirm on accept, so they never enter this flow at all.
--
-- ⚑ THE UI IS A SUBSET OF THIS GUARD, NEVER A SUPERSET. `reclaimOpen()` mirrors
-- the window and `reclaimVisible` shows the card (button locked) from T-3h so the
-- Dispatcher can call first. This function is the rule; the button only decides
-- what to OFFER, and re-checks here. Same drift rule as every other RPC pair.
--
-- Taken from docs/migrations/2026-08-22e_repool_touches_nothing.sql, which is the
-- live definition — it is the fifth and last of the five 2026-08-22 migrations and
-- records that order in its own header. Filenames share a date and do NOT sort
-- into apply order; that trap cost S64 an afternoon.

-- ---------------------------------------------------------------------------
-- 1. `t60_reclaim` would now be a lie — it fires at T-2h.
--    Free to correct: mission_cancellation holds 0 rows, so there is nothing to
--    backfill and no reader to break. This is the only moment it is free.
-- ---------------------------------------------------------------------------
alter table mission_cancellation drop constraint if exists mission_cancellation_kind_check;
alter table mission_cancellation add  constraint mission_cancellation_kind_check
  check (kind in ('driver_cancel','business_cancel','no_show','business_no_show',
                  'reclaim','agreed_release'));

-- ---------------------------------------------------------------------------
-- 2. The RPC. Only the guard, the `kind` and the `reason` differ from the
--    2026-08-22e body — the re-pool half is copied verbatim so [[d81]]/[[d82]]
--    (a re-pool changes nothing about the price except that time has passed)
--    survives this migration intact.
-- ---------------------------------------------------------------------------
create or replace function reclaim_mission(p_mission_id uuid)
returns mission
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid := current_business_id();
  v_mission     mission;
  v_driver_id   uuid;
  v_hours       numeric;
begin
  if v_business_id is null then raise exception 'Not a dispatcher'; end if;

  select * into v_mission from mission where id = p_mission_id for update;
  if not found or v_mission.business_id is distinct from v_business_id then
    raise exception 'Not your mission';
  end if;

  -- ⚑ `confirmed AND never checked in`, from T-2h. See the header for why each
  -- clause is what it is. No upper bound, deliberately: the UI stops offering the
  -- card an hour past the pickup (CHECK_IN_GRACE_MS) and this guard must stay a
  -- superset of the UI, never the other way round.
  if v_mission.status <> 'confirmed'
     or v_mission.checked_in_at is not null
     or now() < v_mission.pickup_at - interval '2 hours' then
    raise exception 'Not eligible for reclaim';
  end if;

  v_driver_id := v_mission.driver_id;
  v_hours := extract(epoch from (v_mission.pickup_at - now())) / 3600.0;

  insert into mission_cancellation
    (mission_id, business_id, party, actor_driver_id, kind, reason,
     fee_pct, fee_amount, fare_snapshot, hours_before_pickup, resulted_in)
  values
    (v_mission.id, v_business_id, 'business', v_driver_id, 'reclaim',
     'Driver did not check in',
     0, 0, null, v_hours, 'repooled');

  if v_driver_id is not null then
    update driver set reliability_marks = reliability_marks + 1 where id = v_driver_id;
  end if;

  update mission_amendment set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';
  update mission_release set status = 'superseded', responded_at = now()
    where mission_id = v_mission.id and status = 'proposed';

  -- A RE-POOL CHANGES NOTHING ABOUT THE PRICE EXCEPT THAT TIME HAS PASSED
  -- (founder, 2026-08-22, [[d82]]). Unchanged from 2026-08-22e — the climb is not
  -- restarted, the opening price is not raised to what the last Driver agreed,
  -- and SPEED WIN is not flipped. The frozen fare is still cleared: nobody holds
  -- this trip any more.
  update mission set
    status = 'pooled', driver_id = null, accepted_at = null, confirmed_at = null, checked_in_at = null,
    stops_reached = 0, pooled_at = now(), accepted_fare = null
  where id = v_mission.id;

  insert into status_event (mission_id, status) values (v_mission.id, 'repooled');

  select * into v_mission from mission where id = p_mission_id;
  return v_mission;
end;
$$;

-- ⚑ NOTHING TO WIRE FOR THE EVENT LOG. The `update mission set status = 'pooled'`
-- above fires the 2026-08-24 `mission_event_log` trigger, which maps a move to
-- `pooled` from any status other than `draft` to a `repooled` event with
-- source='db_trigger'. A reclaim is therefore already recorded, and recorded on
-- the guaranteed side of the log rather than best-effort from the app.
