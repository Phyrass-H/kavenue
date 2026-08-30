-- 2026-08-30 — DRIVER GENDER. Additive: one nullable column on `driver`.
-- Safe to re-run. Changes NO behaviour on its own.
--
-- ── WHY IT EXISTS (founder, S71) ────────────────────────────────────────────
-- > *"in the profil driver when they complete their profile with photos and
-- >  everything add a gender field just a toggle, you can also add other."*
--
-- It is asked on `/settings/profile`, beside the photo and the languages, and it
-- is for the console's own breakdown of the fleet. It decides NOTHING: no Pool
-- query reads it, no rule refuses on it, and a Business cannot ask for it.
--
-- ⚑ FOUR VALUES, AND THE FOURTH IS NOT A SYNONYM FOR THE THIRD.
--     woman · man · other · undisclosed
--   `other` is an answer about who someone is. `undisclosed` is a decision not
--   to answer. NULL is a third thing again — nobody ever asked, which is true of
--   all 13 Drivers the moment this lands. Collapsing them would make it
--   impossible to tell "people are refusing this question" from "we shipped it
--   yesterday", and those call for opposite responses.
--
-- ⚑ THE COLUMN IS NULLABLE AND THE FIELD IS OPTIONAL, PERMANENTLY. A Driver who
-- never touches it is not incomplete: `lib/driver-readiness.ts` does NOT gain a
-- gap for this, and it must not — a Driver's file is about whether they can
-- legally work.
--
-- ⚑ AND THE CONSOLE MUST SAY WHAT IT DOESN'T KNOW. Any breakdown built on this
-- says "9 of 13 answered" and never quietly divides by the ones who did. That is
-- the founder's own standing rule, given about Driver geography: *"I don't care"*
-- that only 3 of 9 are located — but a dashboard has to SAY 3 of 9.
--
-- ⚑ NO CHECK CONSTRAINT, same bargain as `business_type` ([[d99]]): the app
-- narrows on read and write, and `.local/probe/handoff-check.ts` refuses to pass
-- if a value outside the four ever reaches the column. Detection, without a
-- migration every time the list is touched.

alter table driver add column if not exists gender text;

comment on column driver.gender is
  'Optional self-declared gender: woman | man | other | undisclosed. NULL means never asked, which is different from ''undisclosed'' (asked, declined). Decides nothing — no Pool query, no eligibility rule and no Business preference reads it; it exists for the Activity Console''s fleet breakdown.';

-- What this changed, for the paste-and-report loop:
--   select coalesce(gender, '(never asked)') as gender, count(*)
--     from driver group by 1 order by 2 desc;
