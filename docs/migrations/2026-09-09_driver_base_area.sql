-- Where a Driver's base actually IS — city, postcode, département, région, country.
--
-- ⚑ WHY NOW, AND WHY IT CANNOT WAIT. The founder asked for Drivers "by regions, by
-- city". A Driver's base has been three columns since 2026-06-17 — a label, a lat and
-- a lng — which answers "how far" and nothing else. There is no city column and no
-- région column, and neither can be recovered later:
--
--   · SPLITTING `base_label` ON THE COMMA GIVES A STREET, not a town, whenever the
--     base was picked from Google rather than typed by a seed. That mistake is already
--     shipped once, at app/admin/drivers/page.tsx:331.
--   · The Businesses screen gets its régions from INSEE codes fetched by SIRET
--     (lib/company-register.ts) — a lookup Drivers have never been through.
--
-- The data is in our hands and we throw it away. `addressComponents` is ALREADY in the
-- Places field mask (components/address-autocomplete.tsx:269), so the town, postcode,
-- région and country arrive on every base a Driver sets, at no extra cost, and are
-- discarded. Every day this is not applied is a day of history that cannot be rebuilt.
--
-- ⚑ THE SAME VOCABULARY AS A BUSINESS, DELIBERATELY. `business` stores city /
-- departement / region as INSEE values; these mirror them, so "who is in PACA" is one
-- question rather than two that cannot be added together. The `base_` prefix keeps them
-- with base_label / base_lat / base_lng and away from `registered_address`, which is the
-- company's legal address and a different fact
-- (docs/migrations/2026-08-31a_driver_exploitant_fields.sql:53-56).
--
-- ⚑⚑ OUTSIDE FRANCE, THE FRENCH CODES ARE NULL, AND MONACO IS WHY. The département
-- rule is "the first two digits of the postcode"; Monaco's 98000 would become "980", a
-- département that does not exist, and would file the Métropole Monte-Carlo under one.
-- Monaco is a large, real part of this market. `lib/place-area.ts` gates both French
-- codes on country = 'FR', and `regionKeyLabel(null)` already renders that as
-- "Outside France" — the wording the Businesses screen has used since S71.
--
-- ⚑ ADDITIVE ONLY. No column is dropped, no type is recreated, nothing is backfilled
-- destructively. Existing rows keep NULLs until their Driver next saves a base; the
-- backfill for those is .local/seed/backfill-driver-area.mts, which reads only
-- base_lat/base_lng and never invents a value.
--
-- Applied by the founder in the Supabase SQL editor.

alter table driver add column if not exists base_city       text;
alter table driver add column if not exists base_postcode   text;
alter table driver add column if not exists base_departement text;
alter table driver add column if not exists base_region     text;
alter table driver add column if not exists base_country    text;

comment on column driver.base_city is
  'Town of the Driver''s base, from the Places locality. Free text, as Google gives it.';
comment on column driver.base_postcode is
  'Postcode of the base. Kept even outside France, where it decides nothing.';
comment on column driver.base_departement is
  'INSEE département code ("06", "2A", "974"). NULL outside France — see place-area.ts.';
comment on column driver.base_region is
  'INSEE région code ("93"). NULL outside France, and NULL for a name we do not know.';
comment on column driver.base_country is
  'ISO-3166-1 alpha-2 country code ("FR", "MC", "IT"). The gate for the two codes above.';

-- Grouping columns. Partial, because a NULL here means "not asked yet" or "outside
-- France" and neither is ever grouped on.
create index if not exists driver_base_departement_idx
  on driver (base_departement) where base_departement is not null;
create index if not exists driver_base_region_idx
  on driver (base_region) where base_region is not null;
create index if not exists driver_base_city_idx
  on driver (base_city) where base_city is not null;

-- ⚑ NO GRANT, ON PURPOSE. S76 revoked UPDATE on `driver` from `authenticated` at table
-- level and dropped the self-update policy, after a Driver was measured setting their
-- own `verified` to true. `updateServiceArea` writes with the service role
-- (app/(app)/settings/actions.ts), so these columns need nothing added — and adding an
-- UPDATE grant here would quietly reopen that hole. Do not.
