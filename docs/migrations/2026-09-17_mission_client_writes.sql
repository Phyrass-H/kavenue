-- 2026-09-17 — mission: a browser session writes only what the app writes (S82, D144).
--
-- ⚑ THE HOLE. `p_mission_business_update` (docs/kavenue_schema.sql:320) says one thing: the
--   row is your Business's. 2026-08-31f then granted UPDATE back to `authenticated` on almost
--   every column, money included. Nothing guarded the values. So a Dispatcher holding their
--   own session token could PATCH /rest/v1/mission?id=eq.<their trip> and, on a trip a Driver
--   had ALREADY ACCEPTED, lower `accepted_fare` or `ceiling`, zero `commission_business_rate`,
--   move `created_at` (which restarts the PDP climb, lib/pdp.ts), or set `status` to anything.
--   The same token could INSERT a trip carrying commission 0, or born `completed`: INSERT was
--   still the table-wide grant Supabase ships. No screen offers any of it, but the database
--   allowed it. Proven on a throw-away Postgres 17 before this file was written:
--   .local/probe/mission-client-writes/ (run.sh) shows every attack landing on 31f's grants
--   and every one refused after this file.
--
-- ⚑ WHAT A BROWSER SESSION LEGITIMATELY WRITES ON `mission`: three writes, nothing else
--   (every other write is the service role or a SECURITY DEFINER RPC):
--     1. createMission's INSERT            app/(dispatch)/dispatch/new/actions.ts
--     2. the draft resume's session UPDATE  the same file; lib/draft-resume.ts SESSION columns
--        (the snapshot columns go through the service role since S82's draft-resume fix)
--     3. the info edit                      app/(dispatch)/dispatch/[id]/edit/actions.ts
--   Driver actions (check-in, stops, status steps, close) all use the service role or an RPC.
--   A Driver session has no UPDATE policy on `mission` at all.
--
-- THE LOCK, in two layers (same shape as 31f: a privilege the engine enforces, then a trigger
-- for the rules a privilege cannot express):
--   1-3 · GRANTS. UPDATE and INSERT shrink to exactly the columns in 1-3 above. DELETE and
--         TRUNCATE go (no policy ever allowed a delete; discardDraft uses the service role).
--         Every money column that is not a posting-time input is now ungranted, so a client
--         write to it is "permission denied" before any trigger runs.
--   4-5 · A GUARD TRIGGER, for current_user in (anon, authenticated) only:
--         · once a trip is posted (status ≠ draft), only its 13 info-edit columns may change.
--           This covers `status`, `ceiling`, `created_at` and the route, which have to stay
--           granted because a draft writes them.
--         · a new trip or a draft may only be `draft` or `pooled`.
--         · posting a draft sets `created_at` to now(), whatever was sent. On a draft that
--           stays a draft, `created_at` may not move.
--         · on a new trip or a draft, Kavenue's commission and the statutory VAT rate are
--           written from `commission_rate` (the live generation), whatever the browser sent.
--
-- ⚑ `current_user` IS THE WHOLE TEST, SO THE GUARD IS SECURITY INVOKER. Inside a SECURITY
--   DEFINER function current_user is the owner, and that made the first guest_ready_at guard a
--   no-op (2026-07-22_guest_ready_at_guard_fix.sql). As invoker: browser → anon/authenticated
--   (checked); service role → service_role (skipped); every accept/cancel/no-show/repool RPC →
--   its owner (skipped). ⚑ The service role bypasses RLS and this trigger too, on purpose.
-- ⚑ THE GUARD CANNOT READ THE DRIVER'S RATE ITSELF: an invoker trigger runs as `authenticated`,
--   and `driver_rate_ht` is walled from it (2026-08-31e). So it asks `mission_client_rates()`,
--   a SECURITY DEFINER helper. The helper must be EXECUTE-able by `authenticated` because the
--   trigger runs as it. Without a gate that would make it an RPC handing any browser the
--   Driver-side rate, so it answers only from inside a trigger (pg_trigger_depth() > 0).
--   It is not an index-expression helper, so the S78 rule 5 exception does not apply.
--
-- ⚑ A NEW COLUMN ON `mission` IS NOT WRITABLE FROM A BROWSER UNTIL IT IS ADDED BELOW, to INSERT
--   and/or UPDATE (the 31f trap, now for both). And once a trip is posted, the trigger freezes
--   every column that is not in its info list, new ones included. That is the safe default:
--   add a column to v_info only if a Dispatcher may change it after posting.
--   tests/draft-resume-grant.test.ts replays these grants against lib/draft-resume.ts.
--
-- NOT CLOSED HERE, named so nobody assumes otherwise:
--   · At posting, the price inputs createMission computes (ceiling, pdp_start, distance_km,
--     rate_card_id, night_applied) are still taken from the session. A hand-built request could
--     post its own trip below the rate-card floor, which is checked only in createMission. That
--     sets that Business's own offer, which a Driver may decline; it moves no money that is
--     already agreed.
--   · `dispatcher_id` on a new trip or draft is not checked to belong to the same Business.
--   · An info edit on a finished trip (completed / cancelled / expired) is refused by the app,
--     not by the database. Those columns are trip details, not money.
--
-- ORDER WITH THE CODE: safe either way. Before or after this file, today's INSERT and info edit
-- keep working. Before S82's draft-resume fix ships, a resumed draft already fails with 42501
-- (it sends standard_vat_rate, never granted since 2026-09-04), so this file breaks nothing that
-- worked. After it ships, resume works under 31f and under this file.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor, then paste
-- .local/probe/mission-client-writes/check.sql (read-only) and expect every row `pass`.

-- ── 1 · UPDATE ──────────────────────────────────────────────────────────────
revoke update on public.mission from anon, authenticated;

grant update (
  -- the draft resume, on the Dispatcher's session (lib/draft-resume.ts SESSION columns)
  business_id, dispatcher_id, status, category, zone,
  pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  waypoints, pickup_at, passenger_name, passenger_names, pax_count, luggage_count,
  luggage_only, flight_number, reference, ceiling, speed_win, required_body_type,
  required_make, required_model, required_languages, dress_code, driver_flags,
  board_name, driver_message, distance_km, duration_min, board_file_path,
  pickup_label, dropoff_label, created_at,
  -- the info edit writes a subset of the above, plus its own stamp
  info_edited_at
) on public.mission to authenticated;

-- ── 2 · INSERT ──────────────────────────────────────────────────────────────
-- createMission's row. The snapshot columns stay on the insert so a pooled trip is never visible
-- for a moment without its rates (§ 5 overwrites the commission ones anyway). `created_at` is
-- absent: the column default is the server clock.
revoke insert on public.mission from anon, authenticated;

grant insert (
  business_id, dispatcher_id, status, category, zone,
  pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  waypoints, pickup_at, passenger_name, passenger_names, pax_count, luggage_count,
  luggage_only, flight_number, reference, ceiling, speed_win, required_body_type,
  required_make, required_model, required_languages, dress_code, driver_flags,
  board_name, driver_message, distance_km, duration_min, board_file_path,
  pickup_label, dropoff_label,
  rate_card_id, night_applied, commission_business_rate, commission_driver_rate,
  commission_vat_rate, standard_vat_rate, pdp_start, pdp_step, pdp_interval
) on public.mission to authenticated;

-- ── 3 · DELETE, TRUNCATE ────────────────────────────────────────────────────
-- No policy ever allowed a browser delete, so RLS already answered "0 rows". This makes it
-- "permission denied" at the engine instead, the second lock 31f restored for UPDATE.
revoke delete, truncate on public.mission from anon, authenticated;

-- ── 4 · the live rates, for the guard only ──────────────────────────────────
create or replace function public.mission_client_rates(
  out business_rate_ht  numeric,
  out driver_rate_ht    numeric,
  out fee_vat_rate      numeric,
  out standard_vat_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r commission_rate;
begin
  -- Called directly (an RPC, a select) the depth is 0. From the mission guard it is 1.
  if pg_trigger_depth() = 0 then
    raise exception 'mission_client_rates is read by the mission write guard, not called directly'
      using errcode = 'insufficient_privilege';
  end if;
  r := commission_for(now());
  business_rate_ht  := r.business_rate_ht;
  driver_rate_ht    := r.driver_rate_ht;
  fee_vat_rate      := r.fee_vat_rate;
  standard_vat_rate := r.standard_vat_rate;
end;
$$;

-- ⚑ `create function` grants EXECUTE to PUBLIC (S78 trap 1): revoke that, then give it back to
-- the one role the guard runs as. anon holds no INSERT/UPDATE on mission, so it never gets here.
revoke all on function public.mission_client_rates() from public, anon;
grant execute on function public.mission_client_rates() to authenticated;

-- ── 5 · the guard ───────────────────────────────────────────────────────────
create or replace function public.mission_guard_client_write()
returns trigger
language plpgsql as $$
declare
  -- The info edit's allowlist (app/(dispatch)/dispatch/[id]/edit/actions.ts, infoRow + the board
  -- file). The ONLY columns a browser may change once a trip is posted.
  v_info constant text[] := array[
    'passenger_name', 'passenger_names', 'pax_count', 'luggage_count', 'flight_number',
    'reference', 'required_languages', 'dress_code', 'driver_flags', 'board_name',
    'driver_message', 'board_file_path', 'info_edited_at'
  ];
  v_rates record;
begin
  -- SECURITY INVOKER (the default): current_user is the role PostgREST switched to.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- A posted trip: the details may change, nothing else. Compared as whole rows minus the
  -- allowlist, so a column added to mission later is frozen here without anyone editing this.
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if (to_jsonb(new) - v_info) is distinct from (to_jsonb(old) - v_info) then
      raise exception
        'A posted trip''s price, route, time and status are not changed from the browser — only its trip details'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- A new trip, or a draft being saved or posted.
  if new.status not in ('draft', 'pooled') then
    raise exception
      'A trip is saved as a draft or posted to the Pool from the browser — any other status is set by Kavenue'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'pooled' then
      -- Posting: the climb starts now, by the database's clock.
      new.created_at := now();
    elsif new.created_at is distinct from old.created_at then
      raise exception
        'A draft''s creation time is not changed from the browser'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- docs/06 §9: the rates come from the table. Whatever the browser sent is replaced.
  select * into v_rates from public.mission_client_rates();
  new.commission_business_rate := v_rates.business_rate_ht;
  new.commission_driver_rate   := v_rates.driver_rate_ht;
  new.commission_vat_rate      := v_rates.fee_vat_rate;
  new.standard_vat_rate        := v_rates.standard_vat_rate;

  return new;
end;
$$;

drop trigger if exists trg_mission_guard_client_write on public.mission;

create trigger trg_mission_guard_client_write
  before insert or update on public.mission
  for each row
  execute function public.mission_guard_client_write();
