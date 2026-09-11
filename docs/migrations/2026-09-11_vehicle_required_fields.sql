-- A car says when it was first registered and what it runs on — and its colour comes
-- from a list.
--
-- ⚑ WHY. The founder, 2026-09-11: *"In order to have proper distribution in classes and
-- regions and categories and so on those infos has to be mandatories."* Until now every
-- car field was optional, and a blank make and model fell through categorize() into
-- Eco — so the Eco bucket also held every car nobody could identify.
--
-- Three changes to `vehicle`, all additive:
--
-- 1 · first_registration_date — box B on the carte grise (date de première
--     immatriculation). A DATE, not a year: the VTC age limit is "moins de sept ans"
--     (arrêté du 26 mars 2015, art. 1), and at a seven-year line "2019" can mean six
--     years old or nearly seven.
--
-- 2 · energy — box P.3. Founder: "it's important". It is, legally: the age limit does
--     NOT apply to hybrid and electric cars (same arrêté, art. 2), so without the energy
--     nobody can say whether a car's age matters at all.
--
-- 3 · colour becomes a CODE from a fixed list (noir, gris, argent, blanc, bleu, rouge,
--     vert, beige, marron, jaune, autre). Free text is how "Mercedes" and "Mercedes-Benz"
--     became two brands; colour was one "noir" away from the same fault. The existing
--     14 rows hold "Noir", "Gris", "Blanc", "Bleu" — all on the list — and are
--     lower-cased BEFORE the check is added, so the constraint cannot reject them.
--     Sources for the list: project/research/2026-09-11_plate_lookup_and_car_data.md.
--
-- ⚑⚑ NULLABLE IN THE DATABASE, REQUIRED IN THE APP — deliberately. The 14 cars already
-- on the fleet have no first-registration date and no energy, and a NOT NULL here would
-- either fail or force an invented value onto every one of them. The founder's rule is
-- "no invention". So: every NEW write is refused without them (lib/vehicle-rules.ts,
-- enforced at BOTH doors — enrollment and Settings), and every existing car without
-- them appears on its Driver's file as something to finish (lib/driver-readiness.ts),
-- which names the gap and never stops them working.
--
-- ⚑ THE CHECKS ARE ON THE VOCABULARY, NOT ON PRESENCE. A value that is present must be
-- one of the list; an absent one is allowed for the reason above.
--
-- Applied by the founder in the Supabase SQL editor.

alter table vehicle add column if not exists first_registration_date date;
alter table vehicle add column if not exists energy text;

comment on column vehicle.first_registration_date is
  'Carte grise box B. Nullable only for cars enrolled before 2026-09-11; the app requires it on every write.';
comment on column vehicle.energy is
  'Carte grise box P.3, as a code. Hybrid and electric are exempt from the VTC age limit (arrêté 26 mars 2015, art. 2).';

-- The vocabulary for energy.
alter table vehicle drop constraint if exists vehicle_energy_check;
alter table vehicle add constraint vehicle_energy_check check (
  energy is null or energy in (
    'essence', 'diesel', 'hybride', 'hybride_rechargeable', 'electrique', 'gpl', 'autre'
  )
);

-- ⚑ LOWER-CASE FIRST, THEN CONSTRAIN — the order matters. The fleet was written as
-- "Noir" / "Gris" / "Blanc" / "Bleu"; the list is lower-case codes.
update vehicle set colour = lower(trim(colour)) where colour is not null and colour <> lower(trim(colour));

alter table vehicle drop constraint if exists vehicle_colour_check;
alter table vehicle add constraint vehicle_colour_check check (
  colour is null or colour in (
    'noir', 'gris', 'argent', 'blanc', 'bleu', 'rouge', 'vert', 'beige', 'marron', 'jaune', 'autre'
  )
);

comment on column vehicle.colour is
  'A code from a fixed list (lib/vehicle-rules.ts COLOURS). Lower-cased from free text on 2026-09-11.';
