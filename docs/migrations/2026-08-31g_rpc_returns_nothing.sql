-- 2026-08-31 — MONEY COLUMN WALLS, part 5: the door the walls could not close.
--
-- ⚑ A SECURITY DEFINER FUNCTION'S RETURN VALUE IS NOT SUBJECT TO COLUMN
--   PRIVILEGES. Nine RPCs are `returns mission`, so after parts 1–4 shut every
--   table read, this still worked from a Dispatcher session:
--
--     select commission_driver_rate
--       from business_cancel_mission('<my own trip>', 'reason', 30);   → 0.1
--
--   Watched doing exactly that in `.local/probe/column-leak.mts` § 5, on every
--   run from the first one to the one before this file.
--
-- ── WHY THE FIX IS A WRAPPER AND NOT A REWRITE ──────────────────────────────
-- The obvious repair is to change each function's return type. That means
-- `create or replace`-ing nine bodies containing the cancel-fee bands, the
-- waiting meter, the Lock-in rule and the atomic accept — reproducing them from
-- whichever migration last defined each. Reproducing money logic to change a
-- return type is how a correct system acquires a silent defect.
--
-- So the bodies are not touched at all. Each keeps its name, its arguments and
-- its behaviour; EXECUTE on it is taken away from the browser roles, and a thin
-- `*_call` wrapper is what a session may run.
--
-- ⚑ THE WRAPPERS RETURN `void`, NOT A REDACTED ROW. Every one of the nine call
--   sites in the app already destructures `{ error }` and throws the row away —
--   checked, all nine. `void` is therefore the honest interface, and unlike a
--   redaction it cannot be reopened by a column added to `mission` next month.
--   A caller that needs the result reads `mission_read`, which redacts per side.
--
-- ⚑ ERRORS STILL PROPAGATE, WHICH IS THE ENTIRE PROTOCOL. These functions refuse
--   by RAISE — "Mission no longer available", "Slot conflict with another
--   mission" — and the app shows that text. `perform` re-raises unchanged.
--
-- ⚑ AND `auth.uid()` IS UNCHANGED INSIDE A DEFINER WRAPPER. SECURITY DEFINER
--   swaps the privilege role, not the JWT, so `current_driver_id()` /
--   `current_business_id()` inside the inner function still resolve to the person
--   who called. If that were not true every one of these would refuse.
--
-- ── THE REVOKE LOOPS OVER pg_proc ON PURPOSE ────────────────────────────────
-- ⚑ ADDING A PARAMETER CREATES AN OVERLOAD, IT DOES NOT REPLACE (the S71 trap).
--   Older signatures of these functions may still exist, and PostgREST resolves
--   by the arguments the CLIENT sends — so revoking one signature by hand would
--   leave whichever ones a hand-written list forgot. The block below revokes
--   EVERY overload of each name, whatever it is called with, and says how many.
--
-- Additive and idempotent. Run in the Supabase SQL editor.

-- ── 1 · the wrappers ────────────────────────────────────────────────────────
create or replace function accept_mission_call(p_mission_id uuid, p_fare numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin perform accept_mission(p_mission_id, p_fare); end $$;

create or replace function respond_to_amendment_call(p_amendment_id uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin perform respond_to_amendment(p_amendment_id, p_accept, p_reason); end $$;

create or replace function driver_cancel_mission_call(p_mission_id uuid, p_reason text default null, p_fare_snapshot numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin perform driver_cancel_mission(p_mission_id, p_reason, p_fare_snapshot); end $$;

create or replace function business_cancel_mission_call(p_mission_id uuid, p_reason text default null, p_fare_snapshot numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin perform business_cancel_mission(p_mission_id, p_reason, p_fare_snapshot); end $$;

create or replace function reclaim_mission_call(p_mission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform reclaim_mission(p_mission_id); end $$;

create or replace function mark_no_show_call(p_mission_id uuid, p_fare_snapshot numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin perform mark_no_show(p_mission_id, p_fare_snapshot); end $$;

create or replace function business_declare_no_show_call(p_mission_id uuid, p_fare_snapshot numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin perform business_declare_no_show(p_mission_id, p_fare_snapshot); end $$;

create or replace function board_guest_call(p_mission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform board_guest(p_mission_id); end $$;

create or replace function respond_to_release_call(p_release_id uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin perform respond_to_release(p_release_id, p_accept, p_reason); end $$;

-- ── 2 · the browser roles may run the wrappers, and only the wrappers ───────
-- EXECUTE defaults to PUBLIC in Postgres, so each wrapper is opened explicitly
-- after being closed, rather than relying on the default.
do $$
declare
  r     record;
  names text[] := array[
    'accept_mission', 'respond_to_amendment', 'driver_cancel_mission',
    'business_cancel_mission', 'reclaim_mission', 'mark_no_show',
    'business_declare_no_show', 'board_guest', 'respond_to_release'];
  n_closed int := 0;
  n_opened int := 0;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and (p.proname = any (names) or p.proname = any (
             select x || '_call' from unnest(names) as x))
  loop
    if r.proname like '%\_call' then
      execute format('grant execute on function %s to authenticated', r.sig);
      n_opened := n_opened + 1;
    else
      -- ⚑ Every overload, not a guessed signature list.
      execute format('revoke execute on function %s from authenticated, anon, public', r.sig);
      n_closed := n_closed + 1;
    end if;
  end loop;
  raise notice 'money walls part 5: % inner signature(s) closed, % wrapper(s) opened', n_closed, n_opened;
end $$;

-- sanity — as a DISPATCHER session, the first must ERROR and the second work:
--   select * from business_cancel_mission('<id>', 'x', 30);   → permission denied
--   select business_cancel_mission_call('<id>', 'x', 30);      → cancels, returns null
--
-- ⚑ THE APP MUST BE ON THE `_call` NAMES BEFORE THIS RUNS, or every cancel,
--   accept, no-show and board button returns "permission denied".
