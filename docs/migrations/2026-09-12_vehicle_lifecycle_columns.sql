-- 2026-09-12 · M1 of 6 — THE COLUMNS ONLY. Nothing is enforced yet. Safe to re-run.
--
-- ⚑ WHY. The founder, 2026-09-12, settling how a car is approved and how history is kept:
--   *"a driver with a pending car validation just cannot work, period! So a driver with no
--    approved car just cannot access the pool, period this is MANDATORY!"*
--   *"why would a waybill from 2 months ago made with a car should update with the new car?
--    it's a false information probably illegal"*
--
-- Today a car is ONE row that every save overwrites, and a trip stores only a pointer to it
-- (`mission.vehicle_id`, 2026-08-31b/c). So the day a Driver re-plates or changes car, every
-- past Waybill, every Business history row and every CSV export silently print the NEW car.
-- [[d113]] believed the stamp prevented exactly that; it does not, because the stamp is a
-- pointer and `waybill/page.tsx:113` reads the row live. Measured, not assumed.
--
-- ⚑⚑ THIS FILE ADDS COLUMNS AND NOTHING ELSE — no index, no trigger, no backfill, no check
-- that could refuse a write. It is safe to paste BEFORE the code that uses it, which matters
-- because dev and prod share one Supabase project (S77 broke live car saves by shipping a
-- constraint ahead of its code). The gate arrives in M4, after the code is deployed.
--
-- Order of the six: M1 columns · M2 history backfill · M3 the two change logs ·
-- [deploy the code] · M4 the gate · M5 never-twice · M6 the rollups skip retired cars.
--
-- Applied by the founder in the Supabase SQL editor.

-- ── 1 · the car's life: pending → approved → retired, or → rejected ─────────────────────
--
-- ⚑ TWO AXES, NOT ONE. `approval_status` says what a human decided; `retired_at` says the car
-- is no longer this Driver's. A single enum with a 'retired' value cannot express "rejected,
-- being corrected" — and would force a rejected car to be retired before the Driver can file
-- the fix, which mints a retired car that never drove a metre.
--
--   pending   filed, waiting for a human. CANNOT work.
--   approved  a person looked at the carte grise and said yes. Works.
--   rejected  a person said no, with a reason. The Driver corrects THIS row and it returns
--             to pending — the row is never replaced, so the reason has somewhere to live.
--   retired   `retired_at is not null` — an APPROVED car the Driver has replaced. Kept for
--             ever: past trips point at it, and its papers die with it (on delete cascade,
--             2026-07-28…:41), so deleting one would delete the carte grise that proved it.
alter table vehicle add column if not exists approval_status text not null default 'pending';
alter table vehicle add column if not exists approved_at     timestamptz;
alter table vehicle add column if not exists approved_by     uuid;
alter table vehicle add column if not exists rejected_at     timestamptz;
alter table vehicle add column if not exists rejection_note  text;
alter table vehicle add column if not exists retired_at      timestamptz;
-- ⚑ WHEN IT ENTERED THE QUEUE, which `created_at` cannot say. A rejected car is corrected IN
-- PLACE (the reason has to live somewhere), so its created_at still points at the day the
-- Driver first filed it — and the console would print "waiting 30 days" for a car refiled an
-- hour ago, counting the days THEY took as days WE took. Found by a review agent.
alter table vehicle add column if not exists pending_since   timestamptz default now();
alter table vehicle add column if not exists replaced_by     uuid references vehicle(id);

-- ⚑ THE DEFAULT IS 'pending', AND THAT IS THE FOUNDER'S RULING FOR THE 14 CARS ALREADY HERE.
-- Asked whether existing cars should start approved, they said: *"yes and yes"* — every car
-- starts not approved, and Théo's is the first one approved through the new screen. No
-- backfill here: the default has already written it for every existing row.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_approval_status_check') then
    alter table vehicle add constraint vehicle_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

comment on column vehicle.approval_status is
  'pending | approved | rejected — a HUMAN act, never computed from the papers. A car works only when approved AND retired_at is null (working_car(), M4).';
comment on column vehicle.retired_at is
  'Set when an APPROVED car is replaced. The row is kept for ever: past trips point at it and its papers cascade with it.';
comment on column vehicle.replaced_by is
  'The car that took over from this one. NULL while live, and NULL for a car retired with no replacement.';

-- ── 2 · who wrote it, and through which door ────────────────────────────────────────────
--
-- ⚑ WHY THIS EXISTS AT ALL: every write to `vehicle` runs as the SERVICE ROLE since
-- 2026-09-11b closed the browser door, so `auth.uid()` is NULL inside any trigger. A change
-- log that cannot name the actor is half a log. Each write path sets these two in the same
-- UPDATE, and M3's trigger copies them into the event. `last_written_via` also tells a seed
-- write from a real one, which is the difference between demo noise and evidence.
alter table vehicle add column if not exists last_written_by  uuid;
alter table vehicle add column if not exists last_written_via text;
alter table driver  add column if not exists last_written_by  uuid;
alter table driver  add column if not exists last_written_via text;

comment on column vehicle.last_written_via is
  'onboarding | settings | admin | seed — the door the write came through. Set by the writer, read by the change-log trigger (M3).';

-- ── 3 · when the person was approved, and by whom ───────────────────────────────────────
--
-- ⚑ `driver.verified` is a boolean with no memory: `setDriverVerified` (lib/document-review.ts)
-- writes the flag and nothing else, so a suspension — which now takes someone's living away —
-- leaves no actor, no time and no reason. BACKLOG § O, raised repeatedly. These columns do not
-- fix the suspension record on their own; they are what M3's driver_event needs to be worth
-- reading from day one.
alter table driver add column if not exists verified_at timestamptz;
alter table driver add column if not exists verified_by uuid;

-- ⚑ NOT BACKFILLED. 11 Drivers are verified today and nobody recorded when or by whom. Filling
-- those with now() and "an admin" would be an invention, and the founder's rule is that a row
-- with nothing to derive from is left alone and named. They read "recorded before we kept it".

-- ── 4 · the car, frozen onto the trip ───────────────────────────────────────────────────
--
-- The eight facts a Waybill (justificatif de réservation préalable) and a Business's history
-- print. Copied by M4's stamp trigger at the moment a trip changes hands, so that what the
-- document says stays true whatever the Driver drives next year.
-- ⚑ No `vehicle_category`: the stamp only ever matches a car whose category equals
-- `mission.category`, so a separate copy could only ever disagree with it.
alter table mission add column if not exists vehicle_plate                  text;
alter table mission add column if not exists vehicle_make                   text;
alter table mission add column if not exists vehicle_model                  text;
alter table mission add column if not exists vehicle_colour                 text;
alter table mission add column if not exists vehicle_body_type              text;
alter table mission add column if not exists vehicle_seats                  int;
alter table mission add column if not exists vehicle_energy                 text;
alter table mission add column if not exists vehicle_first_registration_date date;

comment on column mission.vehicle_plate is
  'The plate AS IT WAS when this trip changed hands (M4 stamp). The Waybill prints this, never the car row, so a later re-plate cannot rewrite a document that was already issued.';

-- ⚑ NO GRANTS ADDED. `mission` already refuses the browser the columns it must (the money
-- walls, 2026-08-30/31). These eight are stamped by a trigger and read by the same sessions
-- that already read the trip; a Driver or Dispatcher who can see the trip may see the car.

-- ── 5 · a Business that is a daughter of another ────────────────────────────────────────
--
-- ⚑ Needed by M5, declared here so M5 is one file of indexes. The founder, on locking a SIRET
-- to one account: *"if a business needs daughter account then we can manage"*. A group booking
-- through two accounts is legitimate; a stranger reusing a SIRET is not. The lock in M5 applies
-- to parent accounts only, and support links a daughter by setting this column.
alter table business add column if not exists parent_business_id uuid references business(id);

comment on column business.parent_business_id is
  'Set by support when a second account legitimately belongs to an existing Business (a group, a second desk). Exempts the row from the one-SIRET-per-Business lock (M5).';
