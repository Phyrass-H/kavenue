-- 2026-09-13 · M5 of 6 — NEVER TWICE. Safe to re-run.
--
-- ⚑ THE FOUNDER'S RULE, 2026-09-12: *"if infos is used twice the system should tell them,
-- phone number, plates, email and so on, never twice"* — and the scope, in their next answer:
-- *"brand new enrollment should not have same infos from different persons or companies"*,
-- with *"if a business needs daughter account then we can manage"*.
--
-- So this is about a DIFFERENT person or company reusing an identity, not about two rows that
-- legitimately belong together. Three consequences, all of them deliberate:
--
-- 1 · THE LOCKS ARE WITHIN A SIDE, NOT ACROSS THE APP. The same SIRET on a Driver AND on a
--     Business is legitimate and already happens by design: `vtc_company` is one of the nine
--     business types (lib/business-type.ts) — a VTC operator with more trips than cars posts
--     its overflow as a Business and drives as a Driver. A cross-table lock would refuse the
--     founder's own model.
-- 2 · A DAUGHTER ACCOUNT IS EXEMPT. `business.parent_business_id` (M1) is set by support when
--     a second account belongs to an existing Business, and the SIRET lock only applies to
--     parents. That is the "we can manage" path, made explicit rather than left to a rule
--     somebody has to remember.
-- 3 · THE APP MUST SAY WHICH FIELD. A 23505 with no translation reads "Something went wrong",
--     which tells a person nothing they can act on. `lib/duplicate.ts` maps each index NAME
--     below to a sentence — so ⚑ RENAMING AN INDEX HERE SILENTLY BREAKS THAT, and
--     tests/duplicate.test.ts asserts every name in the map exists in this file.
--     ⚑ And no sentence ever names WHO holds the value: that would hand one person's data to
--     whoever guessed their plate.
--
-- ⚑⚑ MEASURED BEFORE WRITING, AND FOUR OF THESE WOULD HAVE FAILED (2026-09-12, read-only):
--     driver.phone           2 rows share +33 6 00 00 00 00
--     driver.siret           2 rows share 51234567800011
--     driver.revtc_number    2 rows share EVTC06210024
--     driver.pro_card_number 2 rows share 06-2024-00412
-- All four are SEED fixtures — `.local/seed/seed-probe-accounts.mts` wrote one hard-coded set
-- onto every probe Driver. The seed now derives them from the account's email and RESTATES
-- them on an existing row, so the fix is to run it, not to delete anybody:
--     npx tsx .local/seed/seed-probe-accounts.mts      (needs M1, for last_written_via)
-- ⚑ Deleting the row would not work anyway: `document.owner_id` has no foreign key, that
-- Driver holds confirmed missions, and `vehicle` cascades — a delete would take a carte grise
-- with it. ⚑ RUN THE SEED FIRST, THEN THIS FILE. An index that cannot be created leaves the
-- migration half-applied and the app half-locked.
--
-- Applied by the founder in the Supabase SQL editor.

-- ── 0 · pre-flight: this must return zero rows, or the file below will fail ─────────────
select 'driver.phone' as what, regexp_replace(phone, '\D', '', 'g') as value, count(*)
  from driver where phone is not null group by 2 having count(*) > 1
union all
select 'driver.siret', regexp_replace(siret, '\D', '', 'g'), count(*)
  from driver where siret is not null group by 2 having count(*) > 1
union all
select 'driver.revtc_number', upper(regexp_replace(revtc_number, '[^A-Za-z0-9]', '', 'g')), count(*)
  from driver where revtc_number is not null group by 2 having count(*) > 1
union all
select 'driver.pro_card_number', upper(regexp_replace(pro_card_number, '[^A-Za-z0-9]', '', 'g')), count(*)
  from driver where pro_card_number is not null group by 2 having count(*) > 1
union all
select 'vehicle.plate', upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')), count(*)
  from vehicle where plate is not null and retired_at is null group by 2 having count(*) > 1;

-- ── 1 · the Driver's own identity ───────────────────────────────────────────────────────
--
-- ⚑ NORMALISED IN THE INDEX, because "+33 6 00 00 00 01" and "0600000001" are the same phone
-- and a raw unique index would let both in. The expressions are immutable, which is what lets
-- them be indexed at all.
-- ⚑ PARTIAL (`where … is not null`): NULLs are already distinct in Postgres, but saying it
-- keeps the index small and the intent readable.
create unique index if not exists driver_email_uq
  on driver (lower(email)) where email is not null;

create unique index if not exists driver_phone_uq
  on driver (regexp_replace(phone, '\D', '', 'g')) where phone is not null;

create unique index if not exists driver_siret_uq
  on driver (regexp_replace(siret, '\D', '', 'g')) where siret is not null;

create unique index if not exists driver_vat_uq
  on driver (upper(regexp_replace(vat_number, '[^A-Za-z0-9]', '', 'g'))) where vat_number is not null;

-- The two numbers that are a person's licence to do this work at all. A second account
-- carrying them is either a typo or somebody enrolling on another Driver's registration.
create unique index if not exists driver_revtc_uq
  on driver (upper(regexp_replace(revtc_number, '[^A-Za-z0-9]', '', 'g'))) where revtc_number is not null;

create unique index if not exists driver_pro_card_uq
  on driver (upper(regexp_replace(pro_card_number, '[^A-Za-z0-9]', '', 'g'))) where pro_card_number is not null;

-- ── 2 · the Business side ───────────────────────────────────────────────────────────────
--
-- ⚑ PARENTS ONLY. A daughter account (parent_business_id set by support) shares its group's
-- SIRET legitimately — the founder's *"if a business needs daughter account then we can
-- manage"*. Everyone else gets one account per SIRET.
create unique index if not exists business_siret_uq
  on business (regexp_replace(siret, '\D', '', 'g'))
  where siret is not null and parent_business_id is null;

create unique index if not exists business_vat_uq
  on business (upper(regexp_replace(vat_number, '[^A-Za-z0-9]', '', 'g')))
  where vat_number is not null and parent_business_id is null;

-- ⚑ THE RECEPTION PHONE IS *NOT* LOCKED WITHIN A GROUP, for the same reason: several desks of
-- one hotel group answer on one switchboard number. Two unrelated Businesses sharing it is
-- the flag.
create unique index if not exists business_phone_uq
  on business (regexp_replace(reception_phone, '\D', '', 'g'))
  where reception_phone is not null and parent_business_id is null;

-- ── 3 · the Dispatcher ──────────────────────────────────────────────────────────────────
--
-- ⚑ EMAIL ONLY. A hotel's front desk hands out ONE phone number and three receptionists all
-- give it, so locking `dispatcher.phone` would refuse the second colleague to sign up — a
-- rule that punishes the customer for being a real hotel. The email is the account.
create unique index if not exists dispatcher_email_uq
  on dispatcher (lower(email)) where email is not null;

-- ⚑ THE PLATE'S LOCK IS NOT HERE. It lives in M4 (vehicle_plate_live_uq) because it is part
-- of the car's life rather than of identity: it excludes RETIRED cars, so a sold car's plate
-- is free for its next owner. Named `vehicle_plate_live_uq` in lib/duplicate.ts all the same.

notify pgrst, 'reload schema';
