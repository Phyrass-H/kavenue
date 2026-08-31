-- 2026-08-31c — Session 72: fill mission.vehicle_id, WITHOUT touching accept_mission.
--
-- Apply AFTER 2026-08-31b (which adds the column).
--
-- ⚑ WHY A TRIGGER AND NOT A LINE INSIDE `accept_mission`.
-- The obvious change is three lines in the accept RPC: turn its § B eligibility check into
-- a `select … into v_vehicle_id` and add `vehicle_id = v_vehicle_id` to the UPDATE. That was
-- the plan. It is the wrong plan, for two reasons that only became clear once written out:
--
--   1. Postgres cannot patch a function body — changing one line means reproducing all 76 of
--      them with `create or replace`. `accept_mission` carries the atomic first-wins UPDATE,
--      the § B gate, the § P expiry, the ±90 min slot conflict and the docs/06 §9 fare clamp.
--      Any drift between the live body and the file being copied is silently reverted, and
--      `docs/migrations/README.md` is explicit that the live body lives in Postgres, not in
--      whichever file you happened to open. S48 named this exact risk when it deferred
--      multi-vehicle "so the money-critical accept RPC stays untouched".
--
--   2. ⚑ ACCEPT IS NOT THE ONLY WAY A MISSION CHANGES HANDS. The three re-pool RPCs
--      (2026-08-22e_repool_touches_nothing.sql) null `driver_id` and know nothing about this
--      column, so an RPC-side stamp would leave the PREVIOUS Driver's car on a re-pooled trip
--      — a stale plate on a legal document, which is the very failure this is meant to end.
--      A trigger on the column that actually changes catches every path at once: accept,
--      re-pool, release, and any admin reassignment that ever exists.
--
-- ⚑ AND THE "QUALIFY ON A, STAMP B" OBJECTION DOES NOT APPLY. It would, if the RPC had
--   qualified the Driver on one SPECIFIC car and the trigger then picked another. It does
--   not: § B is an `exists` test, so it establishes that *a* qualifying car exists and never
--   which. This trigger repeats that predicate verbatim and adds a deterministic order, so it
--   resolves the same set the RPC approved and picks one row from it reproducibly.
--
-- ⚑ THE PREDICATE IS COPIED VERBATIM from accept_mission's § B, including the fact that it
--   does NOT filter on `is_active`. Adding that filter here would let the trigger find no car
--   where the RPC found one, leaving vehicle_id NULL on a legitimate accept. `is_active` is
--   used only to ORDER, so a paused car loses to a live one and is still stamped if it is the
--   only match.
--
-- ▶ Run this in the Supabase SQL editor (Claude's keys go through PostgREST = rows only).

create or replace function mission_stamp_vehicle()
returns trigger
language plpgsql
as $$
begin
  -- Only when the trip changes hands. An ordinary status move, a price edit or a waiting
  -- settlement must not re-resolve the car: the Driver may have bought a new one since,
  -- and the document has to keep saying which car was actually there.
  if new.driver_id is distinct from old.driver_id then
    if new.driver_id is null then
      -- Re-pooled, released, or cancelled back into the Pool. There is no exploitant now,
      -- so there is no car — leaving the old one is how a stale plate gets printed.
      new.vehicle_id := null;
    else
      select v.id into new.vehicle_id
        from vehicle v
       where v.driver_id = new.driver_id
         and v.category  = new.category
         and (new.required_body_type is null
              or new.required_body_type = v.body_type)
       -- A live car beats a paused one; ties break on age, so the answer never depends on
       -- what order PostgREST happened to return.
       order by v.is_active desc, v.created_at
       limit 1;
      -- ⚑ No exception if nothing matches. This trigger is a WITNESS, not a gate: § B inside
      -- accept_mission already refused an ineligible Driver, and a trigger that could raise
      -- would turn a car-shaped edge case into a failed accept. NULL here means the Waybill
      -- falls back to the Driver's current car, exactly as it did before this column existed.
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mission_stamp_vehicle on mission;

-- BEFORE, so the value is written in the same row-write as the accept — no second UPDATE,
-- no extra trigger pass, and nothing observable between the two.
-- ⚑ Name: fires after `mission_...` triggers that sort earlier (the transport_vat_rate
--   stamp). They touch different columns, so the order is irrelevant, but it is worth
--   knowing that BEFORE triggers on one table fire in NAME order, not creation order.
create trigger mission_stamp_vehicle
  before update of driver_id on mission
  for each row
  execute function mission_stamp_vehicle();

comment on function mission_stamp_vehicle() is
  'S72 — records WHICH car did a trip, so the Waybill (justificatif de réservation préalable) '
  'cannot print the plate of a car the Driver bought later. Fires on any change of driver_id, '
  'which covers accept, re-pool and release alike; accept_mission itself is untouched.';
