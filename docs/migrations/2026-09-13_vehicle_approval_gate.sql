-- 2026-09-13 · M4 of 6 — THE DOOR. ⚑⚑ PASTE THIS ONLY AFTER THE CODE IS DEPLOYED.
--
-- ⚑ WHY THAT ORDER. Dev and prod share one Supabase project, so this file is live for the
-- founder's own browser the moment it runs. It refuses things the current code does not
-- expect (a car change is now an RPC; an accept can now fail on the car). Shipped early, it
-- breaks live saves — exactly how S77 broke car saves for an afternoon.
--
-- THE FOUNDER'S RULE, 2026-09-12, in their words:
--   *"a driver with a pending car validation just cannot work, period! So a driver with no
--    approved car just cannot access the pool, period this is MANDATORY! Be careful"*
--   *"imagine a car accident with a non approved car?"*
--
-- ⚑⚑ AND WHY THIS IS A TRIGGER AND NOT A LINE INSIDE accept_mission. [[d113]] settled this
-- shape for the stamp and every word of it applies here:
--   • Postgres cannot patch a function body. Adding one test to accept_mission means
--     reproducing all ~76 lines — the atomic first-wins UPDATE, the § B gate, the § P expiry,
--     the ±90 min slot conflict, the fare clamp — and any drift between the live body and the
--     file being copied is silently reverted.
--   • Accept is NOT the only way a trip changes hands. The re-pool and release RPCs move
--     `driver_id` too, and a check living in accept alone would let a trip land on an
--     unapproved car by another door.
-- One BEFORE trigger on the column that matters catches every door at once.
--
-- Applied by the founder in the Supabase SQL editor. Safe to re-run.

-- ── 1 · one predicate, one body: the car a Driver may actually work with ────────────────
--
-- ⚑ EVERY reader of "the Driver's car" now goes through this. Before today there were four
-- rules in the codebase and they disagreed (oldest row / the active one / whatever PostgREST
-- returned last) — [[d113]] found three answers for one trip. A SQL function and its
-- TypeScript twin (lib/vehicle-approval.ts) are two; a fifth is a compile error, because
-- every caller now names `workingCar`.
create or replace function working_car(p_driver uuid)
returns setof vehicle
language sql
stable
as $$
  select v.*
    from vehicle v
   where v.driver_id       = p_driver
     and v.approval_status = 'approved'
     and v.retired_at is null
   order by v.created_at
$$;

comment on function working_car(uuid) is
  'The one car a Driver may work with: approved by a human and not retired. The gate, the stamp and every screen ask this and nothing else.';

-- ── 2 · the database cannot hold two live cars for one Driver ──────────────────────────
--
-- V1 is one car per Driver (multi-car is V2/V3, decided). A retired car is exempt, which is
-- what lets a Driver replace one. ⚑ Measured before writing this: 0 Drivers have more than
-- one car and there are 0 duplicate plates, so both indexes create clean. An index that
-- cannot be created leaves the migration half-applied and the app half-gated.
create unique index if not exists vehicle_one_live_per_driver
  on vehicle (driver_id) where retired_at is null;

-- A plate identifies a car, not a Driver: when a car is sold its plate must be free for its
-- next owner, so retired rows are out of the lock. Two live cars sharing a plate is either a
-- typo or somebody enrolling a car that is not theirs.
create unique index if not exists vehicle_plate_live_uq
  on vehicle (plate) where retired_at is null and plate is not null;

-- ── 3 · the door itself ─────────────────────────────────────────────────────────────────
create or replace function mission_requires_approved_car()
returns trigger
language plpgsql
as $$
begin
  -- Releasing a trip back to the Pool is not taking one.
  if new.driver_id is null then
    return new;
  end if;

  -- ⚑ ONLY WHEN THE TRIP ACTUALLY CHANGES HANDS. On UPDATE, `is distinct from old.driver_id`
  --   is the right test; on INSERT there is no OLD, and `new.driver_id is distinct from
  --   old.driver_id` would be TRUE-by-accident against a NULL record. So the two arms are
  --   spelled separately — the S76 lesson about a guard that reads NULL and then does the
  --   wrong thing quietly.
  if tg_op = 'UPDATE' and new.driver_id is not distinct from old.driver_id then
    return new;
  end if;

  if not exists (select 1 from working_car(new.driver_id)) then
    -- ⚑ THE WORDING IS LOAD-BEARING. It must NOT contain "not yet approved": that is
    --   NOT_APPROVED_RAISE (lib/driver-review.ts:41), the PERSON's refusal, and the app maps
    --   it to "your file is under review". A car problem must send the Driver to their car.
    raise exception 'Car awaiting approval';
  end if;

  return new;
end;
$$;

-- ⚑ NAME MATTERS: BEFORE triggers on one table fire in NAME order, and
-- `mission_requires_approved_car` sorts before `mission_stamp_vehicle`. A refused accept
-- therefore never reaches the stamp.
drop trigger if exists mission_requires_approved_car on mission;
create trigger mission_requires_approved_car
  before insert or update of driver_id on mission
  for each row
  execute function mission_requires_approved_car();

-- ── 4 · and the hold, which is the other way to reach for a trip ───────────────────────
--
-- `place_hold` writes mission_hold, not mission.driver_id, so the trigger above never sees
-- it. S76 learned the same thing about `verified`: both doors or neither.
create or replace function hold_requires_approved_car()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from working_car(new.driver_id)) then
    raise exception 'Car awaiting approval';
  end if;
  return new;
end;
$$;

drop trigger if exists hold_requires_approved_car on mission_hold;
create trigger hold_requires_approved_car
  before insert on mission_hold
  for each row
  execute function hold_requires_approved_car();

-- ── 5 · the stamp now records the WORKING car ───────────────────────────────────────────
--
-- Reproduced whole, because Postgres has no other way. Two changes from 2026-08-31c:
--   • it selects from working_car(), so a pending or retired car can never be stamped;
--   • it copies the car's identity onto the trip, which is the half [[d113]] believed the
--     pointer already gave us. It does not: the row is mutable, and `waybill/page.tsx` read
--     it live, so a re-plate rewrote every past Waybill.
create or replace function mission_stamp_vehicle()
returns trigger
language plpgsql
as $$
declare
  v       vehicle%rowtype;
  changed boolean;
begin
  -- ⚑ THE TWO ARMS ARE SPELLED SEPARATELY. On INSERT there is no OLD row, and
  --   `new.driver_id is distinct from old.driver_id` against a NULL record is accidentally
  --   TRUE — the same shape as the guard above. Being explicit is what makes a trip INSERTED
  --   with a Driver already on it (every seed does this) carry its car like any other.
  changed := case
    when tg_op = 'INSERT' then new.driver_id is not null
    else new.driver_id is distinct from old.driver_id
  end;

  if changed then
    if new.driver_id is null then
      -- Re-pooled, released or cancelled back into the Pool. No exploitant, so no car — and
      -- the frozen copy goes with it, or the next Driver's Waybill prints the last one's car.
      new.vehicle_id                      := null;
      new.vehicle_plate                   := null;
      new.vehicle_make                    := null;
      new.vehicle_model                   := null;
      new.vehicle_colour                  := null;
      new.vehicle_body_type               := null;
      new.vehicle_seats                   := null;
      new.vehicle_energy                  := null;
      new.vehicle_first_registration_date := null;
    else
      select * into v
        from working_car(new.driver_id) w
       where w.category = new.category
         and (new.required_body_type is null or new.required_body_type = w.body_type)
       limit 1;

      new.vehicle_id                      := v.id;
      new.vehicle_plate                   := v.plate;
      new.vehicle_make                    := v.make;
      new.vehicle_model                   := v.model;
      new.vehicle_colour                  := v.colour;
      new.vehicle_body_type               := v.body_type;
      new.vehicle_seats                   := v.seats;
      new.vehicle_energy                  := v.energy;
      new.vehicle_first_registration_date := v.first_registration_date;
      -- ⚑ Still no exception when nothing matches. This trigger is a WITNESS, not a gate:
      --   § 3 above already refused a Driver with no approved car, and § B inside
      --   accept_mission refused an ineligible one. A witness that can raise turns a
      --   car-shaped edge case into a failed accept.
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mission_stamp_vehicle on mission;
create trigger mission_stamp_vehicle
  before insert or update of driver_id on mission
  for each row
  execute function mission_stamp_vehicle();

comment on function mission_stamp_vehicle() is
  'S78 — freezes WHICH car did a trip AND what it looked like, so a Waybill issued in July cannot be rewritten by a car bought in September. Fires on any change of driver_id (accept, re-pool, release); accept_mission itself is untouched.';

-- ── 6 · an approved car cannot be quietly edited into a different car ───────────────────
--
-- ⚑ THE HOLE THIS CLOSES. Without it, "change my car" is `update vehicle set plate = …` and
-- the whole approval means nothing: the Driver keeps working, the papers on file describe a
-- car that no longer exists, and every past trip that points at the row starts naming the new
-- one. The founder: *"new cars new rules period"*. So an approved, live car is frozen — a
-- change of identity means retiring it and filing a new one (§ 7).
-- Colour is in the list: it is on the carte grise and it is what a Guest looks for.
create or replace function vehicle_identity_frozen()
returns trigger
language plpgsql
as $$
begin
  if old.approval_status = 'approved' and old.retired_at is null
     and (new.plate                   is distinct from old.plate
       or new.make                    is distinct from old.make
       or new.model                   is distinct from old.model
       or new.category                is distinct from old.category
       or new.body_type               is distinct from old.body_type
       or new.seats                   is distinct from old.seats
       or new.energy                  is distinct from old.energy
       or new.colour                  is distinct from old.colour
       or new.first_registration_date is distinct from old.first_registration_date)
  then
    raise exception 'An approved car cannot be edited — file the new car instead';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_identity_frozen on vehicle;
create trigger vehicle_identity_frozen
  before update on vehicle
  for each row
  execute function vehicle_identity_frozen();

-- ── 7 · replacing a car is ONE act ──────────────────────────────────────────────────────
--
-- Retire the old row and file the new one in a single transaction, so the unique index in § 2
-- can never see two live cars and a crash between the two halves cannot leave a Driver with
-- none. ⚑ The old row is RETIRED, never deleted: past trips point at it, and `document`'s
-- carte grise dies with its car (on delete cascade, 2026-07-28) — deleting one would destroy
-- the paper that proved it.
create or replace function replace_vehicle(p_driver uuid, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  select id into v_old from vehicle
   where driver_id = p_driver and retired_at is null
   order by created_at limit 1;

  -- ⚑⚑ RETIRE FIRST, THEN FILE. The obvious order — insert the new car, then retire the old
  --   one — CANNOT WORK: `vehicle_one_live_per_driver` is a partial unique INDEX, which
  --   Postgres checks per statement and cannot be deferred, so the insert is refused while the
  --   old row is still live. Found by running this file against a throw-away Postgres before
  --   it was ever pasted; every car change would have failed with a duplicate-key error the
  --   Driver could do nothing about. The whole function is one transaction, so a failure in
  --   the insert below rolls the retirement back with it and the Driver keeps their car.
  if v_old is not null then
    update vehicle set retired_at = now() where id = v_old;
  end if;

  insert into vehicle (driver_id, category, body_type, make, model, colour, plate, seats,
                       energy, first_registration_date, is_active, approval_status,
                       last_written_by, last_written_via)
  values (p_driver,
          (p_fields ->> 'category')::vehicle_category,
          (p_fields ->> 'body_type')::body_type,
          p_fields ->> 'make',
          p_fields ->> 'model',
          p_fields ->> 'colour',
          p_fields ->> 'plate',
          (p_fields ->> 'seats')::int,
          p_fields ->> 'energy',
          (p_fields ->> 'first_registration_date')::date,
          true,
          'pending',
          (p_fields ->> 'last_written_by')::uuid,
          p_fields ->> 'last_written_via')
  returning id into v_new;

  -- The pointer forward is written once the new row exists. Two statements, one transaction:
  -- a reader outside it sees either the old car live, or the new one with the old one retired
  -- and pointing at it — never a Driver with no car at all.
  if v_old is not null then
    update vehicle set replaced_by = v_new where id = v_old;
  end if;

  return v_new;
end;
$$;

comment on function replace_vehicle(uuid, jsonb) is
  'Retire the Driver''s live car and file its replacement as pending, in one transaction. The only way a car changes once it has been approved.';

-- ⚑ NO GRANT TO `authenticated`. 2026-09-11b closed the browser''s door onto `vehicle` on
-- purpose, and this function is SECURITY DEFINER — granting it would reopen that door with a
-- ribbon on it. The server actions call it with the service role, having authorised the
-- session themselves, which is the same shape as the document review ([[d132]]).
revoke execute on function replace_vehicle(uuid, jsonb) from authenticated, anon;
revoke execute on function working_car(uuid)            from anon;

notify pgrst, 'reload schema';
