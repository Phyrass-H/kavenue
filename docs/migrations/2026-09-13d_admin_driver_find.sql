-- 2026-09-13 · S79 — /admin/drivers STEP 4: WHO CAN'T WORK YET, AND WHO IS THIS. Safe to re-run.
--
-- The founder's order of 2026-09-09: *"Search bar + a 'Not verified' section on /admin/drivers"*.
-- Shown both readings on a preview built from the live fleet, 2026-09-13: *"all three approvals"*.
--
-- ⚑ "CAN'T WORK YET" IS mayTakeWork, NOT `verified`. lib/driver-approvals.ts: a Driver works when a
-- person approved them AND their live car is approved. A verified Driver whose car is waiting
-- cannot take a trip — the S78 trigger refuses it — so a section keyed on `verified` alone listed
-- 3 of the 12 Drivers who could not work on the day it was built, and showed the other 9 as fine.
-- The company pile has no door of its own ([[d137]] rule 1), so it cannot decide who is listed;
-- the page still names it on the row when the Driver owes company papers.
--
-- ⚑ INVOKER RIGHTS, exactly like admin_driver_page: no SECURITY DEFINER, so it sees what the
-- caller's RLS lets them see (app_role()='admin' reads driver, vehicle and mission). There is
-- nothing to revoke — trap 1 is about DEFINER functions that read on a caller's behalf.
--
-- ⚑ THE TRIPS ARE COUNTED ON THE PAGE, NOT ON THE FLEET. The filter and the order run over each
-- Driver and their live car only; the mission aggregate runs for the ≤ p_limit rows that survive.
-- At 25 000 Drivers that is sixty aggregates, not twenty-five thousand.
--
-- Needs M5 (2026-09-13b_never_twice.sql) for phone_key(). Applied by the founder in the Supabase
-- SQL editor.

-- ── 1 · text folded for a search: case and accents ─────────────────────────────────────
--
-- ⚑ NOT `unaccent`. That is an extension, and whether it is installed on this project is not
-- something a migration can assume; `translate` and `replace` are core and IMMUTABLE.
-- ⚑ UPPER CASE IS IN THE ALPHABET TOO, because lower() only folds ASCII under a C locale — "É"
-- would survive it and "Élodie" would never meet "elodie". The two alphabets must stay the same
-- length or translate() silently DROPS the extra letters; tests/admin-driver-find.test.ts counts.
create or replace function fold_text(p text)
returns text
language sql
immutable
parallel safe
as $$
  select replace(replace(replace(replace(lower(translate(p,
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ',
    'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuyy')),
    'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae')
$$;

comment on function fold_text(text) is
  'Case and French accents folded away, for the admin search. Core functions only — no unaccent extension.';

-- ── 2 · one function, two questions ─────────────────────────────────────────────────────
--
-- p_blocked = true   → the Drivers who cannot work, longest blocked first.
-- p_q       = a term → the Drivers it matches, by name.
--
-- WHAT A TERM MATCHES, and why each is guarded:
--   • the name, either order, and the email — folded, as a substring.
--   • the phone, in EITHER spelling: the digits as stored (so "+33 612" finds "+33 6 12 …"), or
--     the national form (so "06 12" finds it too). ⚑ A term DIALLED INTERNATIONALLY — it starts
--     with + or 00 — is folded as a partial number: the 00 dropped, a leading 33 or 33(0) turned
--     into 0, so "+33 6 12" meets a phone stored as "06 12 34 56 78". phone_key cannot do this
--     itself: it only folds a COMPLETE number (nine digits after the 33). And ONLY a dialled term
--     is folded: folding every leading 33 turned "332 737", a SIRET fragment, into a short needle
--     that met strangers' phones (S79 review and re-check).
--   • the SIRET, on the digits.
--   • the LIVE car's plate, compacted ("ab-123" meets "AB-123-CD"). A sold car's plate is not
--     searched: the row it would find says what they drive today, which would be false.
-- ⚑ EVERY NUMBER NEEDS 4 DIGITS — AND THE FLOOR IS ON THE NEEDLE ACTUALLY SEARCHED FOR. An empty
--   string is inside every string: phone_key('Marc') is '', so without a floor a name search
--   returned the whole fleet. And the floor has to be measured after the fold, not before it:
--   "0061" has four digits but folds to "61", which is inside most phone numbers.
-- ⚑ strpos, NEVER like: a term is typed by a person, and "%" or "_" in it would be a wildcard.
create or replace function admin_driver_find(
  p_q       text    default null,
  p_blocked boolean default false,
  p_limit   int     default 60,
  p_offset  int     default 0
)
returns table (
  id                uuid,
  first_name        text,
  last_name         text,
  verified          boolean,
  base_label        text,
  service_radius_km int,
  category          text,
  body_type         text,
  car_status        text,
  waiting_since     timestamptz,
  trips             bigint,
  held_unfinished   bigint,
  last_took         timestamptz,
  total_count       bigint
)
language sql
stable
as $$
with term as (
  select nullif(btrim(p_q), '')                                            as raw,
         fold_text(btrim(p_q))                                             as words,
         regexp_replace(coalesce(p_q, ''), '\D', '', 'g')                  as digits,
         case when btrim(coalesce(p_q, '')) ~ '^(\+|00)'
              then regexp_replace(regexp_replace(regexp_replace(p_q, '\D', '', 'g'),
                                                 '^00', ''), '^33(0)?', '0')
              else regexp_replace(coalesce(p_q, ''), '\D', '', 'g')
         end                                                               as dialled,
         upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g')) as compact
),
fleet as (
  select d.id, d.first_name, d.last_name, d.verified, d.base_label, d.service_radius_km,
         d.created_at, d.email, d.phone, d.siret,
         v.category::text        as category,
         v.body_type::text       as body_type,
         v.approval_status::text as car_status,
         v.plate,
         coalesce(v.pending_since, v.created_at) as car_queued
    from driver d
    -- ⚑ THE LIVE CAR, liveCarOf's rule: not retired, oldest first. vehicle_one_live_per_driver
    --   makes it at most one; the order only keeps the answer stable without that index.
    left join lateral (
      select category, body_type, approval_status, plate, pending_since, created_at
        from vehicle
       where driver_id = d.id
         and retired_at is null
       order by created_at asc
       limit 1
    ) v on true
),
hit as (
  select f.*,
         -- Since when they could not work: the older of the two doors still shut. A Driver with
         -- no car at all has been blocked since they joined.
         least(
           case when not f.verified then f.created_at end,
           case when f.car_status is distinct from 'approved'
                then coalesce(f.car_queued, f.created_at) end
         ) as waiting_since
    from fleet f
   cross join term t
   where (not p_blocked or not f.verified or f.car_status is distinct from 'approved')
     and (t.raw is null
       or strpos(fold_text(f.first_name || ' ' || f.last_name), t.words) > 0
       or strpos(fold_text(f.last_name || ' ' || f.first_name), t.words) > 0
       or strpos(fold_text(f.email), t.words) > 0
       or (length(t.digits) >= 4 and (
              strpos(regexp_replace(coalesce(f.phone, ''), '\D', '', 'g'), t.digits) > 0
           or strpos(regexp_replace(coalesce(f.siret, ''), '\D', '', 'g'), t.digits) > 0))
       or (length(t.dialled) >= 4 and strpos(coalesce(phone_key(f.phone), ''), t.dialled) > 0)
       or (length(t.compact) >= 2 and
           strpos(upper(regexp_replace(coalesce(f.plate, ''), '[^A-Za-z0-9]', '', 'g')), t.compact) > 0))
),
page as (
  select h.*, count(*) over () as total_count
    from hit h
   order by case when p_blocked then h.waiting_since end asc nulls last,
            h.last_name asc, h.first_name asc
   limit p_limit offset p_offset
)
select p.id, p.first_name, p.last_name, p.verified, p.base_label, p.service_radius_km,
       p.category, p.body_type, p.car_status, p.waiting_since,
       coalesce(m.trips, 0), coalesce(m.held_unfinished, 0), m.last_took,
       p.total_count
  from page p
  left join lateral (
    select count(*) filter (where accepted_at is not null)                           as trips,
           count(*) filter (where accepted_at is not null and status <> 'completed') as held_unfinished,
           max(accepted_at)                                                          as last_took
      from mission
     where driver_id = p.id
  ) m on true
 order by case when p_blocked then p.waiting_since end asc nulls last,
          p.last_name asc, p.first_name asc;
$$;

comment on function admin_driver_find(text, boolean, int, int) is
  'Activity Console /admin/drivers step 4. p_blocked: the Drivers who cannot work (mayTakeWork''s twin), longest blocked first. p_q: name, email, phone in either spelling, SIRET, live plate. Trips counted on the page only.';

notify pgrst, 'reload schema';

-- Check it after pasting — the first must equal the Drivers who cannot work, the second finds
-- Élodie without her accent:
--   select count(*) from admin_driver_find(null, true, 1000, 0);
--   select first_name, last_name from admin_driver_find('elodie');
