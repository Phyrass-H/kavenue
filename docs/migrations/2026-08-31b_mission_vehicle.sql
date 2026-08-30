-- 2026-08-31b — Session 72: which car actually did this trip.
--
-- WHY THIS EXISTS
-- The Waybill (the *justificatif de réservation préalable*, see 2026-08-31a) prints the
-- vehicle. Every plate, model and colour is already stored on `vehicle` — but nothing ties
-- a `vehicle` row to a `mission`, so every reader re-derives the car from the DRIVER, as of
-- NOW. A document that prints a plate must print the plate of the car that was there.
--
-- ⚑ AND THE READERS ALREADY DISAGREE, which is the part that makes this a bug today rather
--   than a future one. For a Driver with two rows:
--       lib/driver.ts:34, lib/app-context.ts:57       → the OLDEST vehicle
--       lib/admin-activity.ts:56, admin/drivers/[id]  → the ACTIVE vehicle
--       dispatch/history/export/route.ts:138          → whichever PostgREST returned last
--   Three answers, one trip. Nobody has seen it because all 13 live Drivers have exactly one
--   car each (measured 2026-08-30). It bites the first Driver who buys a second or re-plates.
--
-- ⚑ THIS REVERSES PART OF A DELIBERATE S48 DECISION, and says so out loud.
--   `2026-07-28_driver_account_and_documents.sql`:11-13 reads: "the rest of multi-vehicle
--   (mission.vehicle_id + a car picker inside accept_mission) is deliberately NOT built, so
--   the money-critical accept RPC stays untouched." That call was right for S48 and the
--   reason has not weakened — `accept_mission` is still the riskiest function in the project.
--   What changed is that a legal document now prints the car, so "the Driver's current car"
--   stopped being a harmless approximation. ⚑ The CAR PICKER is still not built: this stamps
--   the car the Driver was already qualified on, and adds no UI.
--
-- ⚑ NO CASCADE. `document.vehicle_id` cascades on purpose — a carte grise dies with its car.
--   A MISSION must not. Deleting a car may not delete the trips it drove, so this FK is left
--   at the default (restrict), and a Driver who wants a car gone gets `is_active = false`.
--
-- ⚑ NULL IS EXPECTED AND IS NOT A HOLE. Every trip accepted before this migration has none,
--   and nothing is backfilled — the same stance as `accepted_fare` (2026-08-22: "no need to
--   update prices on existing trips"). Readers fall back to the Driver's current car, i.e.
--   they keep today's exact behaviour, which is correct while every Driver has one car.
--
-- ⚑ A RE-POOL LEAVES IT SET. The three re-pool RPCs (2026-08-22e_repool_touches_nothing.sql)
--   null `driver_id` and know nothing about this column. So a re-pooled trip can carry the
--   PREVIOUS Driver's car with `driver_id is null`. Every reader must gate the car on
--   `driver_id is not null` — the next accept overwrites it (2026-08-31c).
--
-- Additive: one nullable column. The stamp that fills it is 2026-08-31c, which must be
-- applied AFTER this file.
--
-- ▶ Run this in the Supabase SQL editor (Claude's keys go through PostgREST = rows only).

alter table mission add column if not exists vehicle_id uuid references vehicle(id);

comment on column mission.vehicle_id is
  'The car that was on this trip, stamped by accept_mission from the vehicle row that satisfied '
  'eligibility (2026-08-31c). NULL = accepted before 2026-08-31, or never accepted — readers fall '
  'back to the Driver''s current car. ⚑ Gate on driver_id is not null: a re-pool clears the Driver '
  'and leaves this set until the next accept overwrites it.';
