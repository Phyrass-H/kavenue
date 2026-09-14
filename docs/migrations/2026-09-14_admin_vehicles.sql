-- 2026-09-14 · S81 — /admin/vehicles STEP 5: ARE THERE ENOUGH CARS, AND WHICH CAR IS THIS. Safe to re-run.
--
-- The founder's order, 2026-09-14 ([[d142]]), on a preview built from the live fleet:
--   • one row per class and body, the cars that can work TODAY beside the period's trips,
--     with "Any body" trips as their own row under each class;
--   • a search that *"also finds replaced cars … so we can have a trace of older cars and why
--     they are not in the circuit anymore"*.
--
-- ⚑ NEEDS fold_text() FROM 2026-09-13d_admin_driver_find.sql (which itself needs M5,
-- 2026-09-13b_never_twice.sql, for phone_key()). Paste 13d first or admin_vehicle_find fails to
-- create with "function fold_text(text) does not exist".
--
-- ⚑ INVOKER RIGHTS, exactly like admin_driver_find: no SECURITY DEFINER. RLS already lets
-- app_role()='admin' read vehicle (2026-09-11b p_vehicle_read), driver and mission. Anyone else who
-- calls them gets counts of nothing their own SELECT does not already return — their own car and
-- driver row; for mission, what p_mission_driver_read / p_mission_business_read already expose (a
-- Driver: the whole Pool plus their own trips; a Dispatcher: their Business's). Counted, never
-- widened — so there is nothing to revoke (S81 review corrected an earlier "only their own trips"). ⚑ And neither body names a money column (base_fare, ceiling, pdp_start,
-- commission_*): those are revoked from `authenticated` (2026-08-31d), and an invoker function
-- naming one would fail for the admin with "permission denied for table mission".
--
-- ⚑ A CAR IS "LIVE" WHEN retired_at IS NULL — NEVER is_active. Nothing writes is_active, and
-- replace_vehicle (2026-09-13_vehicle_approval_gate.sql) is the only way a car leaves: it sets
-- retired_at on the old row, then replaced_by on it once the new row exists.
--
-- Applied by the founder in the Supabase SQL editor.

-- ── 1 · the census and the trips, by class ──────────────────────────────────────────────
--
-- supply  → TODAY's live cars, by category × body. Never moved by the period ([[d103]]).
-- demand  → the trips whose PICKUP falls in [p_from, p_to), by category × required body.
-- Counts only; the page renders the rate, and only from MIN_FOR_RATE settled trips ([[d100]]).
--
-- ⚑ EXACTLY ONE BUCKET PER CAR, IN mayTakeWork's ORDER (lib/driver-approvals.ts). A CASE, not four
--   independent filters, so the four can never add up to more — or less — than live_cars:
--     can work           the Driver is verified AND the car is approved
--     to approve         the car is waiting (Kavenue's move) — whatever the person's state
--     refused            the car was refused (the Driver's move)
--     person to approve  the car is approved, the person is not
--   `else` is to_approve because statusOf reads anything unknown as pending; the check
--   constraint (2026-09-12_vehicle_lifecycle_columns.sql) makes that arm unreachable today.
--
-- ⚑ "SETTLED" IS NOT admin_business_overview's, ON PURPOSE. That one
--   (2026-09-12_business_overview_census_restored.sql:58-63) is `accepted_at is not null or
--   status in ('expired', 'cancelled')`. This one adds the trip still `pooled` whose pickup has
--   passed: it is dead — isExpired says so (lib/dispatch-status.ts) and the console already prints
--   it "Not taken" — the sweep simply has not reached the row. Leaving it out would let a class
--   whose trips nobody took read "nothing settled" until a cron ran. The three parts are
--   disjoint, so settled = filled + nobody_took + cancelled before anyone took it.
-- ⚑ AND THE PERIOD IS ON pickup_at, NOT created_at like the Businesses page ([[d142]] rule 4):
--   "were there enough Eco vans in May" is about the trips that had to be DRIVEN in May.
create or replace function admin_vehicle_overview(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns json
language sql
stable
as $$
with car as (
  select v.category::text  as category,
         v.body_type::text as body_type,
         case
           when d.verified is true and v.approval_status = 'approved' then 'can_work'
           when v.approval_status = 'rejected'                        then 'refused'
           when v.approval_status = 'approved'                        then 'person_not_approved'
           else                                                            'to_approve'
         end as bucket
    from vehicle v
    join driver d on d.id = v.driver_id
   where v.retired_at is null
),
supply as (
  select c.category,
         c.body_type,
         count(*)                                             as live_cars,
         count(*) filter (where c.bucket = 'can_work')          as can_work,
         count(*) filter (where c.bucket = 'to_approve')        as to_approve,
         count(*) filter (where c.bucket = 'refused')           as refused,
         count(*) filter (where c.bucket = 'person_not_approved') as person_not_approved
    from car c
   group by c.category, c.body_type
),
demand as (
  select m.category::text                              as category,
         -- A trip with no required body takes either — the page's "Any body" row.
         coalesce(m.required_body_type::text, 'any')   as body,
         count(*)                                      as trips,
         count(*) filter (
           where m.accepted_at is not null
              or m.status = 'expired'
              or (m.status = 'pooled' and m.pickup_at <= now())
              or m.status = 'cancelled'
         )                                             as settled,
         count(*) filter (where m.accepted_at is not null) as filled,
         -- isExpired's twin: expired, or still pooled with the pickup behind us — and nobody took it.
         count(*) filter (
           where m.accepted_at is null
             and (m.status = 'expired' or (m.status = 'pooled' and m.pickup_at <= now()))
         )                                             as nobody_took
    from mission m
   where (p_from is null or m.pickup_at >= p_from)
     and (p_to   is null or m.pickup_at <  p_to)
   group by m.category::text, coalesce(m.required_body_type::text, 'any')
)
select json_build_object(
  'supply', (select coalesce(json_agg(s order by s.category, s.body_type), '[]'::json) from supply s),
  'demand', (select coalesce(json_agg(d order by d.category, d.body), '[]'::json) from demand d)
);
$$;

comment on function admin_vehicle_overview(timestamptz, timestamptz) is
  'Activity Console /admin/vehicles. supply: TODAY''s live cars (retired_at is null) by category × body, one bucket each in mayTakeWork''s order — never moved by the period. demand: trips by category × required body (''any'' when none), period on pickup_at, half-open. settled counts a stale pooled trip (isExpired), unlike admin_business_overview. Counts only.';

-- ── 2 · which car is this ───────────────────────────────────────────────────────────────
--
-- p_q                    → the cars a term matches (the page trims and cuts it first).
-- p_category + p_body    → the cars of one grid row ('any' or null → both bodies).
-- p_include_replaced     → false: live cars only (a grid row). true: replaced cars too, each on
--                          its own row, with the plate of the car that replaced it.
--
-- WHAT A TERM MATCHES, and why each is guarded:
--   • EVERY WORD must hit SOME field — make, model, colour, the Driver's names, the company —
--     folded, as a substring. "mercedes noir" is a black Mercedes, not every Mercedes and every
--     black car. The fields are searched as one haystack joined by spaces: a word holds no space,
--     so a hit can never straddle two fields, and "Marchand Élodie" finds her in either order.
--   • or the word, compacted, is inside the compacted plate ("ab-123" meets "AB-123-CD").
--   • the WHOLE term compacted is inside the plate, so "AB 123 CD" works although its words, one
--     by one, might not all be on the same car.
--   • the SIRET, on the digits — ⚑ ONLY WHEN THE TERM IS A NUMBER, digits and phone punctuation
--     and nothing else, with the 4-digit floor, as 13d does: an email such as "ines2024@…" held
--     four digits and matched strangers' SIRETs there (S79 final review).
-- ⚑ EVERY NEEDLE HAS A FLOOR, MEASURED ON THE NEEDLE ACTUALLY SEARCHED FOR: 2 characters for a
--   compacted plate, 4 digits for a SIRET. An empty string is inside every string — "-" compacts
--   to '' and would otherwise return the whole fleet.
-- ⚑ strpos, NEVER like: a term is typed by a person, and "%" or "_" in it would be a wildcard.
--
-- ⚑ THE ORDER IS SPELLED OUT, NEVER THE ENUM'S. vehicle_category is ('eco','business','van',
--   'luxury') — the legacy 'van' sits between Business and First — so the tiers are ranked by
--   name, and anything else (that legacy 'van') comes after them, never dropped.
create or replace function admin_vehicle_find(
  p_q                text    default null,
  p_category         text    default null,
  p_body             text    default null,
  p_include_replaced boolean default true,
  p_limit            int     default 60,
  p_offset           int     default 0
)
returns table (
  vehicle_id        uuid,
  driver_id         uuid,
  first_name        text,
  last_name         text,
  company_name      text,
  verified          boolean,
  category          text,
  body_type         text,
  make              text,
  model             text,
  colour            text,
  plate             text,
  approval_status   text,
  retired_at        timestamptz,
  replaced_by       uuid,
  replaced_by_plate text,
  created_at        timestamptz,
  total_count       bigint
)
language sql
stable
as $$
with term as (
  select nullif(btrim(p_q), '')                                                  as raw,
         array_remove(regexp_split_to_array(fold_text(btrim(coalesce(p_q, ''))), '\s+'), '') as words,
         case when btrim(coalesce(p_q, '')) ~ '^[0-9+()./ -]+$'
              then regexp_replace(p_q, '\D', '', 'g') else '' end               as digits,
         upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g'))       as compact
),
car as (
  select v.id, v.driver_id, d.first_name, d.last_name, d.company_name, d.verified,
         v.category::text as category, v.body_type::text as body_type,
         v.make, v.model, v.colour, v.plate, v.approval_status, v.retired_at, v.replaced_by,
         v.created_at, d.siret,
         fold_text(concat_ws(' ', v.make, v.model, v.colour, d.first_name, d.last_name, d.company_name))
                                                                            as haystack,
         upper(regexp_replace(coalesce(v.plate, ''), '[^A-Za-z0-9]', '', 'g')) as plate_compact
    from vehicle v
    join driver d on d.id = v.driver_id
   where (p_category is null or v.category::text = p_category)
     and (p_body is null or p_body = 'any' or v.body_type::text = p_body)
     and (p_include_replaced is not false or v.retired_at is null)
),
hit as (
  select c.*
    from car c
   cross join term t
   where t.raw is null
      or (cardinality(t.words) > 0 and not exists (
            select 1
              from unnest(t.words) as w(word)
             where strpos(c.haystack, w.word) = 0
               and not (length(upper(regexp_replace(w.word, '[^A-Za-z0-9]', '', 'g'))) >= 2
                        and strpos(c.plate_compact, upper(regexp_replace(w.word, '[^A-Za-z0-9]', '', 'g'))) > 0)))
      or (length(t.compact) >= 2 and strpos(c.plate_compact, t.compact) > 0)
      or (length(t.digits)  >= 4 and strpos(regexp_replace(coalesce(c.siret, ''), '\D', '', 'g'), t.digits) > 0)
)
select h.id, h.driver_id, h.first_name, h.last_name, h.company_name, h.verified,
       h.category, h.body_type, h.make, h.model, h.colour, h.plate, h.approval_status,
       h.retired_at, h.replaced_by, nv.plate as replaced_by_plate, h.created_at,
       count(*) over () as total_count
  from hit h
  left join vehicle nv on nv.id = h.replaced_by
 order by (h.retired_at is not null) asc,
          case h.category when 'eco' then 1 when 'business' then 2 when 'luxury' then 3 else 4 end,
          h.category asc,
          case h.body_type when 'sedan' then 1 when 'van' then 2 else 3 end,
          h.last_name asc, h.first_name asc,
          h.retired_at desc,
          h.id asc
 limit p_limit offset p_offset;
$$;

comment on function admin_vehicle_find(text, text, text, boolean, int, int) is
  'Activity Console /admin/vehicles. p_q: every word in make, model, colour, names or company (folded), or in the compacted plate; the whole term compacted in the plate; a number in the SIRET (4 digits). p_category/p_body: one grid row (''any'' = both bodies). p_include_replaced: replaced cars on their own rows, with the plate that replaced them. Live first, then Eco, Business, First, then anything else.';

notify pgrst, 'reload schema';

-- Check it after pasting — the first must list every class with a car, the second must find a
-- replaced car by its old plate with the plate that replaced it:
--   select admin_vehicle_overview();
--   select plate, retired_at, replaced_by_plate from admin_vehicle_find('AB 123', null, null, true, 60, 0);
