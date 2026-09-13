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
-- All four involve `demo.driver@pickup.local`, a probe account `.local/seed/seed-probe-accounts.mts`
-- writes. ⚑ CORRECTED S79 (2026-09-13): the phone and SIRET pair is the two probe Drivers, but
-- the REVTC and card pair is demo.driver and `marc.fontaine@kavenue.test`, a fleet Driver — and
-- the S78 repair moved the collision instead of removing it (its new values gave a probe Driver
-- Théo's phone and Marc's card number). The seed's values now collide with nobody, measured
-- across every live Driver, so the fix is still to run it, not to delete anybody:
--     npx tsx .local/seed/seed-probe-accounts.mts      (needs M1, for last_written_via)
-- ⚑ Deleting the row would not work anyway: `document.owner_id` has no foreign key, that
-- Driver holds confirmed missions, and `vehicle` cascades — a delete would take a carte grise
-- with it. ⚑ RUN THE SEED FIRST, THEN THIS FILE. An index that cannot be created leaves the
-- migration half-applied and the app half-locked.
--
-- Applied by the founder in the Supabase SQL editor.

-- ── 0 · one phone rule ──────────────────────────────────────────────────────────────────
--
-- ⚑ S79 — A PHONE IS COMPARED BY THE NUMBER IT DIALS, NOT BY ITS DIGITS. The S78 index used
-- the digits alone, so "+33 6 12 34 56 78" (33612345678) and "06 12 34 56 78" (0612345678)
-- were two values and one person could enrol twice — the very case § 1 says it prevents.
-- Nothing normalises a phone before saving (onboarding, settings and the dispatch desk all
-- store what was typed), so the index is the only place the rule can live.
-- The fold: digits only · a leading 00 dropped · +33 and +33 (0) onto the national 0.
-- Other countries keep their code, so "+377 93 15 20 00" meets "00377 93 15 20 00" and never
-- a French number.
-- ⚑ EXECUTE STAYS PUBLIC ON PURPOSE. It reads no table and is not SECURITY DEFINER; and an
-- index expression is evaluated as whoever writes the row, so revoking it would turn every
-- phone save from a signed-in session into a 42501 (proved on the S79 dry run).
create or replace function phone_key(p text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
           regexp_replace(regexp_replace(p, '\D', '', 'g'), '^00', ''),
           '^33(?:0)?(\d{9})$', '0\1')
$$;

comment on function phone_key(text) is
  'The number a phone dials, for "never twice": digits, no leading 00, +33 folded onto 0. Indexed by driver_phone_uq and business_phone_uq.';

-- ── 0b · pre-flight: this must return zero rows, or the file below will fail ────────────
-- ⚑ S79: every index in this file, each with its own expression. The S78 version checked
-- four Driver fields and skipped the emails, the VAT numbers and the whole Business side.
select 'driver.email' as what, lower(email) as value, count(*)
  from driver where email is not null group by 2 having count(*) > 1
union all
select 'driver.phone', phone_key(phone), count(*)
  from driver where phone is not null group by 2 having count(*) > 1
union all
select 'driver.siret', regexp_replace(siret, '\D', '', 'g'), count(*)
  from driver where siret is not null group by 2 having count(*) > 1
union all
select 'driver.vat_number', upper(regexp_replace(vat_number, '[^A-Za-z0-9]', '', 'g')), count(*)
  from driver where vat_number is not null group by 2 having count(*) > 1
union all
select 'driver.revtc_number', upper(regexp_replace(revtc_number, '[^A-Za-z0-9]', '', 'g')), count(*)
  from driver where revtc_number is not null group by 2 having count(*) > 1
union all
select 'driver.pro_card_number', upper(regexp_replace(pro_card_number, '[^A-Za-z0-9]', '', 'g')), count(*)
  from driver where pro_card_number is not null group by 2 having count(*) > 1
union all
select 'business.siret', regexp_replace(siret, '\D', '', 'g'), count(*)
  from business where siret is not null and parent_business_id is null group by 2 having count(*) > 1
union all
select 'business.vat_number', upper(regexp_replace(vat_number, '[^A-Za-z0-9]', '', 'g')), count(*)
  from business where vat_number is not null and parent_business_id is null group by 2 having count(*) > 1
union all
select 'business.reception_phone', phone_key(reception_phone), count(*)
  from business where reception_phone is not null and parent_business_id is null group by 2 having count(*) > 1
union all
select 'dispatcher.email', lower(email), count(*)
  from dispatcher where email is not null group by 2 having count(*) > 1
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

-- ⚑ DROPPED FIRST, unlike its neighbours: `if not exists` would keep an index built from the
-- S78 digits-only expression, had that version ever been pasted, and say nothing.
drop index if exists driver_phone_uq;
create unique index if not exists driver_phone_uq
  on driver (phone_key(phone)) where phone is not null;

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
drop index if exists business_phone_uq;   -- dropped first, for driver_phone_uq's reason
create unique index if not exists business_phone_uq
  on business (phone_key(reception_phone))
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
