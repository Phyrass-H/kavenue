-- 2026-09-12 · M2 of 6 — THE ONE-TIME BACKFILL. Re-runnable, but it is written for TODAY'S
-- data and must not be run after a car has been retired (see the note below).
--
-- M1 added the columns. This fills them for the trips and papers that already exist, so the
-- switch in M4 does not leave 264 finished trips with no car on their Waybill.
--
-- ⚑⚑ THE RULE THIS FILE OBEYS: NO INVENTION. Every statement writes only where the answer is
-- forced — exactly one car can match — and leaves the row alone otherwise. Measured live
-- before writing it (read-only, 2026-09-12):
--
--     missions with a Driver          296
--       already stamped (2026-08-31c)   2   ← untouched below
--       exactly one possible car      294
--       no possible car                 0
--       more than one                   0
--     vehicle-group documents          22
--       already linked to a car         0
--     Drivers with more than one car    0
--
-- ⚑ AND WHAT "DERIVABLE" HONESTLY MEANS HERE. No car has ever been replaced — there are 14
-- cars, one per Driver, none retired, and until today nothing could retire one. So today's
-- row IS the car that did those trips, as far as anything has ever recorded. That is a
-- reconstruction, not an observation: `vehicle` has no updated_at and no history, so if a
-- plate was edited at some point the old value is already gone and nothing anywhere knows it.
-- From M4 onwards the car is stamped AT THE MOMENT the trip changes hands and this kind of
-- reasoning is never needed again. ⚑ Do not re-run this file after any car has been retired:
-- the guard would still hold (a retired car is still the only match) but the answer would no
-- longer be forced. It is written for today's data, once.
--
-- Applied by the founder in the Supabase SQL editor.

-- ── 1 · a carte grise / insurance belongs to a car ──────────────────────────────────────
--
-- `document.vehicle_id` has existed since S48 and the upload path fills it
-- (lib/document-actions.ts:122-131) — but all 22 live vehicle papers were written by seeds
-- that skipped it. Left NULL, M4's "you may not approve a car whose papers are not verified"
-- would have no papers to find.
update document d
   set vehicle_id = v.id
  from vehicle v
 where d.owner_type = 'driver'
   and d.vehicle_id is null
   and d.type in ('vehicle_registration', 'insurance')
   and v.driver_id = d.owner_id
   -- The forced-answer guard: exactly one car, or this row is left alone.
   and (select count(*) from vehicle v2 where v2.driver_id = d.owner_id) = 1;

-- ── 2 · the car each trip was done with, frozen onto the trip ───────────────────────────
--
-- The same predicate the stamp trigger uses (2026-08-31c:53-62): the Driver's car whose
-- category equals the trip's, and whose body matches when the trip asked for one.
-- ⚑ `is_active` is deliberately NOT in the where — filtering on it would find no car where
-- the accept found one. It is not in the order-by either: with one car per Driver there is
-- nothing to break, and a tie-break on a column nothing writes is theatre.
-- ⚑⚑ GROUPED BY THE TRIP ALONE. The first version said `group by m.id, v.id` — two primary
--    keys, so every pair was its own group and `having count(*) = 1` eliminated NOTHING: a
--    Driver with two same-class cars would have had one picked by query plan. Caught by a
--    review agent, which reproduced it by turning off nested loops and watching a September
--    car land on a July trip. The guard is the whole no-invention rule in this file.
-- ⚑ `array_agg(...)[1]`, not `min(...)`: Postgres has no min() for uuid, and the first
--    attempt at this fix failed to apply at all. Caught by running the file rather than
--    reading it.
with only_one as (
  select m.id as mission_id, (array_agg(v.id))[1] as vehicle_id
    from mission m
    join vehicle v
      on v.driver_id = m.driver_id
     and v.category  = m.category
     and (m.required_body_type is null or m.required_body_type = v.body_type)
   where m.driver_id  is not null
     and m.vehicle_id is null
   group by m.id
  having count(*) = 1
)
update mission m
   set vehicle_id                      = v.id,
       vehicle_plate                   = v.plate,
       vehicle_make                    = v.make,
       vehicle_model                   = v.model,
       vehicle_colour                  = v.colour,
       vehicle_body_type               = v.body_type,
       vehicle_seats                   = v.seats,
       vehicle_energy                  = v.energy,
       vehicle_first_registration_date = v.first_registration_date
  from only_one o
  join vehicle v on v.id = o.vehicle_id
 where m.id = o.mission_id;

-- ── 3 · and the two trips that were already stamped keep their stamp, but gain the copy ──
--
-- They point at a car (2026-08-31c fired on them) and have no frozen columns yet. Copying
-- from the row they already name is not a derivation at all — it is the same row.
update mission m
   set vehicle_plate                   = v.plate,
       vehicle_make                    = v.make,
       vehicle_model                   = v.model,
       vehicle_colour                  = v.colour,
       vehicle_body_type               = v.body_type,
       vehicle_seats                   = v.seats,
       vehicle_energy                  = v.energy,
       vehicle_first_registration_date = v.first_registration_date
  from vehicle v
 where v.id = m.vehicle_id
   and m.vehicle_id is not null
   and m.vehicle_plate is null;

-- ⚑ WHAT IS DELIBERATELY LEFT EMPTY. A trip with no Driver has no car and gets no copy — a
-- pooled or cancelled trip must not carry one. A trip whose Driver has no matching car keeps
-- NULL and the Waybill says "not recorded", which is the truth. Neither is a gap to chase.

-- ── 4 · read back what this wrote (run it, look at it, then move on) ────────────────────
select
  (select count(*) from mission where driver_id is not null)                       as trips_with_a_driver,
  (select count(*) from mission where driver_id is not null and vehicle_id is null) as trips_without_a_car,
  (select count(*) from mission where vehicle_plate is not null)                    as trips_with_a_frozen_plate,
  (select count(*) from document
    where owner_type = 'driver' and type in ('vehicle_registration', 'insurance')
      and vehicle_id is null)                                                       as car_papers_not_linked;
