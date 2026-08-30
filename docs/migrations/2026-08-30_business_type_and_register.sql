-- 2026-08-30 — BUSINESS TYPE + THE FRENCH REGISTER. Additive: four nullable
-- columns on `business`, one backfill. Safe to re-run. Changes NO behaviour on
-- its own — the app half is what starts writing them.
--
-- ── WHY IT EXISTS (founder, S71) ────────────────────────────────────────────
-- Two rules, given in the same breath:
--   1. *"A business cannot post mission without filling the business type"* —
--      so the type has to be a real, picked category on every Business, not a
--      sentence somebody typed once.
--   2. *"Kavenue is open for all type of businesses including actual drivers who
--      have too much trips and want to post them"* — so the list is the whole
--      market, and a VTC operator posting its overflow is a Business here.
--
-- ⚑ THE SPLIT THIS CLOSES. Sign-up wrote a FREE-TEXT `field_of_activity`
-- ("Hotel, concierge, event agency…" as a placeholder, and whatever they liked
-- as the answer). Settings wrote a PICKED `business_type`, from a list that
-- existed only inside a page component. The two columns never met. A Business
-- that enrolled and never opened Settings therefore had no category at all,
-- which means the "which types make more missions" breakdown was impossible for
-- every real sign-up. It only looked fine because the seed wrote BOTH columns on
-- all four hotels.
--
--   ⚑ `business_type` WINS. `field_of_activity` is no longer written by anything
--     after this migration. It is NOT dropped — hard rule #4, and it is the only
--     record of what pre-S71 Businesses said about themselves. It stays as a
--     read-only fallback (lib/business-type.ts `typeOf`).
--
-- ⚑ NO CHECK CONSTRAINT ON `business_type`, DELIBERATELY. The list will move —
-- the founder is still deciding whether clinics and restaurants each deserve
-- their own row — and a constraint would make every one of those a migration
-- they have to paste. The app narrows on read and write (`isBusinessType`), and
-- `.local/probe/handoff-check.ts` asserts no stored value has fallen outside the
-- list. Detection without the friction.
--
-- ── THE REGISTER COLUMNS ────────────────────────────────────────────────────
-- `recherche-entreprises.api.gouv.fr` is free, open and unauthenticated. Given a
-- company name it returns the establishment's SIRET, legal name, address, city,
-- département, région and `activite_principale` — the official NAF/APE code.
-- Sign-up looks the business up instead of interviewing it.
--
--   ⚑ `naf_code` IS STORED RAW, AND THAT IS THE WHOLE TRICK. The Kavenue type is
--     only a VIEW of the official code. Change the categories in a year and it is
--     a re-map over stored codes, not a re-survey of 25 000 Businesses. It is
--     also the audit trail for a mapping that is, by design, a suggestion a human
--     confirmed rather than a silent classification.
--
--   ⚑ `region` AND `departement` HOLD INSEE CODES ("93", "06"), NOT LABELS. Same
--     reason: the code is the fact, the words are a rendering. The label map
--     lives in TypeScript where it can change without touching a row.
--
--   ⚑ AND THE REGISTER IS FRANCE ONLY. Monaco is not in it, and one of the four
--     Businesses on the platform today is the Métropole Monte-Carlo. Every one of
--     these columns is nullable and always will be: the manual path is not a
--     fallback for failure, it is the normal path for a whole slice of the
--     Côte d'Azur market.

alter table business add column if not exists naf_code    text;
alter table business add column if not exists city        text;
alter table business add column if not exists departement text;
alter table business add column if not exists region      text;

comment on column business.naf_code is
  'Official French activity code (NAF/APE, e.g. 55.10Z) from recherche-entreprises.api.gouv.fr. The raw fact behind business_type; null for Monaco, for foreign businesses, and for anyone who picked their type by hand.';
comment on column business.city is
  'INSEE commune label, e.g. NICE. Stored, not derived, because the Activity Console breaks 25 000 Businesses down by it and cannot recompute that per page load.';
comment on column business.departement is 'INSEE departement code, e.g. 06.';
comment on column business.region is 'INSEE region code, e.g. 93 for Provence-Alpes-Cote d''Azur.';

-- Backfill: where the old free-typed answer happens to BE one of the values, it
-- counts. Where it is "Boutique hotel on the Croisette", it does not, and that
-- Business is asked once, the next time it tries to post.
--
-- ⚑ Only fills a NULL business_type — a picked value is never overwritten by a
-- typed one. And `event_venue` is matched from the two spellings a person could
-- plausibly have left behind, nothing looser: guessing here would put confident
-- nonsense into the column the whole breakdown is built on.
update business
   set business_type = lower(replace(trim(field_of_activity), ' ', '_'))
 where business_type is null
   and field_of_activity is not null
   and lower(replace(trim(field_of_activity), ' ', '_')) in (
     'hotel', 'restaurant', 'event_venue', 'travel_agency',
     'concierge', 'vtc_company', 'health', 'corporate', 'other'
   );

-- What this changed, for the paste-and-report loop:
--   select business_type, count(*) from business group by business_type order by 2 desc;
