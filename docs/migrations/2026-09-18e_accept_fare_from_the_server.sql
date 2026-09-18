-- 2026-09-18 (e) — The accept fare comes from the server, not the caller. Finding #11. (S83, [[d148]])
-- Paste AFTER 2026-09-18d. ⚑ Independent of 18c/18d, but numbered after them to keep one order.
--
-- THE HOLE (S83 finding #11, proven on a throw-away Postgres). A trip's price climbs to the
-- Business's Ceiling; the Driver is paid the fare at the instant they accept, frozen into
-- accepted_fare. accept_mission / place_hold took that fare as p_fare FROM THE CALLER and only
-- clamped it to [opening, ceiling] — they never checked it against the true current price, because
-- the §6 curve lives only in lib/pdp.ts and the database cannot evaluate it. The server passes the
-- honest number, but accept_mission_call is EXECUTE-able by `authenticated`, so a Driver holding
-- their own JWT could POST the call by hand with p_fare = the Ceiling and be paid it (150 vs 90 on
-- a probe). Nobody is billed above the Ceiling the Business set, but the auction price is bypassed.
--
-- THE FIX (D144's lesson applied to the fare: money comes from the DATABASE, not the browser).
-- The server already computes the honest fare with the SERVICE ROLE (lib/pool-fares.ts). It now
-- STAMPS that number into a tiny table only the service role may write, keyed to the Driver, just
-- before the accept/hold. accept_mission and place_hold READ the stamp for the calling Driver and
-- IGNORE p_fare. A hand-built request carries no stamp it could forge, so:
--   · honest accept  → the stamp = the exact number the app computed today → accepted_fare identical
--   · forged accept  → no stamp → accepted_fare NULL → settledFare() recomputes the honest curve on
--                       read (legacy rows are already NULL), i.e. the honest price, NEVER the Ceiling
-- The hold's "you get at least what you were shown" rule is untouched: held_fare stays a floor
-- inside greatest(); only its SOURCE moves from p_fare to the stamp. The curve stays single-source
-- in lib/pdp.ts — this stores a number the server computed, it does not re-implement the curve.
--
-- Chosen over (b) porting the curve to SQL — Postgres float ln() and V8's differ ~1 ULP, so a SQL
-- port would misprice by up to ~€0.50 at a jittered step boundary — and (c) a signed fare token,
-- which needs a DB secret and two more functions (more rule-6 surface). A 3-way design panel ranked
-- this first (S83).
--
-- ⚑ p_fare STAYS in both signatures (now ignored) so no RPC signature changes — no deploy window
--   under dev=prod. Each function is reproduced WHOLE (Postgres cannot patch); only the fare source
--   changed, verified by diffing pg_get_functiondef back. One transaction; idempotent.
-- After it: paste .local/probe/rls-audit/check.sql — every row `pass`/`info`.

begin;

-- ── 1 · the stamp table: one honest price per (trip, Driver), writable ONLY by the service role ──
create table if not exists public.mission_accept_quote (
  mission_id uuid        not null references public.mission(id) on delete cascade,
  driver_id  uuid        not null references public.driver(id) on delete cascade,
  course     numeric(10,2) not null,            -- the GROSS Course the server computed (docs/06 §9)
  quoted_at  timestamptz not null default now(),
  primary key (mission_id, driver_id)           -- one row per Driver per trip; two Drivers never clash
);
comment on table public.mission_accept_quote is
  'S83 #11: the honest accept/hold fare, stamped by the server (service role) so accept_mission and '
  'place_hold read it instead of trusting the caller. Browser roles hold NOTHING here.';

-- ⚑ THREE LOCKS on the one wall this whole fix rests on (rule-6 has bitten 4+ times):
--   (1) name the roles in the revoke — a bare revoke from public is a no-op; 18a's default-privilege
--       change already means a new table starts ungranted, but state it anyway;
--   (2) RLS enabled with NO policy → even a future stray grant sees zero rows;
--   (3) check.sql asserts has_table_privilege false for anon+authenticated (paste it after).
revoke all on public.mission_accept_quote from public, anon, authenticated;
grant select, insert, update, delete on public.mission_accept_quote to service_role;
alter table public.mission_accept_quote enable row level security;

-- ── 2 · defense in depth: a stamp can never exceed the trip's Ceiling (a CHECK can't cross tables) ──
-- So even a leaked grant or a server bug cannot plant a value above the Business's maximum.
create or replace function public.mission_accept_quote_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_ceiling numeric;
begin
  select ceiling into v_ceiling from mission where id = new.mission_id;
  if new.course < 0 or (v_ceiling is not null and new.course > v_ceiling) then
    raise exception 'mission_accept_quote.course % is outside [0, ceiling %]', new.course, v_ceiling
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.mission_accept_quote_guard() from public, anon, authenticated;

drop trigger if exists trg_mission_accept_quote_guard on public.mission_accept_quote;
create trigger trg_mission_accept_quote_guard
  before insert or update on public.mission_accept_quote
  for each row execute function public.mission_accept_quote_guard();

-- ── 2b · A STAMP DIES WHEN THE PRICE TERMS MOVE ───────────────────────────────────────────────
-- ⚑ Found by an adversarial pass: a stamp quoted at the OLD price outlives a term change. A Driver
--   holds a pooled trip (holdMission stamps at, say, 140), the Business then swaps to a cheaper car
--   (change_trip_car lowers the Ceiling to 100 — [[d147]] allows it) but nothing deleted the stamp,
--   then the Driver hand-calls accept_mission_call: the stale 140 stamp clamps to the new Ceiling
--   100 — an overpay, exactly the #11 shape via a stale stamp instead of p_fare. (A RAISE only makes
--   a stale stamp UNDER-pay, but this trigger correctly clears it there too, so the Driver gets the
--   new honest price, not a stale low one.)
-- The fix, at the root and future-proof: ANY change to a price-determining column on `mission`
-- drops that trip's stamps. change_trip_car / raise_ceiling (18c) and any future price path all
-- write these columns, so none can leave a stamp behind. The honest accept path never trips it — it
-- stamps AFTER the terms are stable and the accept UPDATE touches none of these columns.
-- ⚑ SECURITY DEFINER — it fires on a `mission` UPDATE, which a Dispatcher's own session does (a
--   draft resume, an info edit), and it DELETES from mission_accept_quote, a table the browser roles
--   hold nothing on. An INVOKER trigger would raise 42501 and break every legitimate draft resume
--   that touches a watched column (the S82 draft-resume trap, one object along). As DEFINER it runs
--   as the owner and only ever clears the just-updated trip's own stamps. search_path is pinned.
create or replace function public.mission_accept_quote_invalidate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from mission_accept_quote where mission_id = new.id;
  return null;   -- AFTER trigger: the return is ignored
end;
$$;
revoke all on function public.mission_accept_quote_invalidate() from public, anon, authenticated;

drop trigger if exists trg_mission_accept_quote_invalidate on public.mission;
create trigger trg_mission_accept_quote_invalidate
  after update of ceiling, pdp_start, pdp_step_count, speed_win, pickup_at, created_at, category,
                  required_body_type, required_make, required_model, rate_card_id
  on public.mission
  for each row execute function public.mission_accept_quote_invalidate();

-- ── 3 · accept_mission: the fare is the stamp, not p_fare (reproduced whole) ──────────────────
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
  v_course    numeric;   -- ⚑ S83 #11: the fare the SERVER stamped for this Driver (mission_accept_quote)
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

  -- ⚑ S83 #11 — THE FARE COMES FROM THE STAMP, NOT THE CALLER. The server (service role) wrote the
  --   honest current price into mission_accept_quote for THIS Driver just before this call; the
  --   browser cannot write that table. p_fare (below) is ignored. No stamp -> v_course NULL ->
  --   accepted_fare NULL -> settledFare recomputes the honest curve on read (as legacy rows do), so
  --   a hand-built accept with a forged p_fare can never set the fare. held_fare stays the floor.
  select course into v_course from mission_accept_quote
   where mission_id = p_mission_id and driver_id = v_driver_id;

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
         accepted_fare = case when v_course is null and v_hold.held_fare is null then null else
           round(least(greatest(greatest(v_course, v_hold.held_fare),
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

  -- ⚑ S83 #11: the trip is taken — every Driver's stamp for it is spent.
  delete from mission_accept_quote where mission_id = p_mission_id;

  return v_mission;
end;
$function$
;

-- ── 4 · place_hold: held_fare is the stamp, not p_fare (reproduced whole) ─────────────────────
CREATE OR REPLACE FUNCTION public.place_hold(p_mission_id uuid, p_fare numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_driver_id uuid := current_driver_id();
  v_driver    driver;
  v_mission   mission;
  v_seconds   int := 15;
  v_course    numeric;   -- ⚑ S83 #11: the stamped fare (mission_accept_quote), not p_fare
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

  -- ⚑ S83 #11: held_fare is the SERVER's stamped price for this Driver, never the caller's p_fare.
  --   No stamp -> no fabricated floor (v_course NULL), so a forged hold cannot plant a high floor.
  select course into v_course from mission_accept_quote
   where mission_id = p_mission_id and driver_id = v_driver_id;

  insert into mission_hold (mission_id, driver_id, held_fare, expires_at, hold_seconds)
  values (
    p_mission_id, v_driver_id,
    case when v_course is null then null else
      round(least(greatest(v_course, least(coalesce(v_mission.pdp_start, v_mission.ceiling * 0.5), v_mission.ceiling)),
                  v_mission.ceiling), 2) end,
    now() + make_interval(secs => v_seconds),
    v_seconds
  );
end;
$function$
;

-- ── 5 · re-assert the doors (create-or-replace keeps grants, but rule-6 says state them) ──────
revoke execute on function public.accept_mission(uuid, numeric) from public, anon, authenticated;   -- raw: closed since 2026-08-31g
revoke execute on function public.place_hold(uuid, numeric)     from public, anon;
grant  execute on function public.place_hold(uuid, numeric)     to authenticated;

commit;

notify pgrst, 'reload schema';

-- sanity — in the SQL editor (first three false, last true):
--   select has_table_privilege('authenticated','public.mission_accept_quote','SELECT') as auth_reads,
--          has_table_privilege('authenticated','public.mission_accept_quote','INSERT') as auth_writes,
--          has_table_privilege('anon','public.mission_accept_quote','SELECT')          as anon_reads,
--          has_table_privilege('service_role','public.mission_accept_quote','INSERT')  as service_writes;
