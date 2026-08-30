-- 2026-08-30 — ONE LINE, AND IT IS A CONSISTENCY FIX. Replaces
-- admin_driver_overview so its breakdown counts Drivers the same way the
-- Businesses breakdown counts Businesses. Safe to re-run.
--
-- ⚑ RUN 2026-08-30_admin_rollup_periods.sql FIRST — this replaces a function
-- that one creates.
--
-- ── THE MISMATCH, FOUND WHILE VERIFYING PERIODS ─────────────────────────────
-- With July selected, the two screens answered the same question differently:
--
--   Businesses · Where they are  →  "PACA — 3 businesses, 114 trips"
--                                    (3 = businesses that POSTED in July)
--   Drivers    · What they drive →  "Business · Sedan — 6 drivers, 60 trips"
--                                    (6 = drivers who OWN that class, ever)
--
-- The Drivers version invites the wrong arithmetic: 60 over "6 drivers" reads as
-- ten each, when two of those six did not drive in July at all. A count standing
-- beside a period-scoped number, that is not itself period-scoped, is exactly the
-- kind of quiet mismatch that gets believed.
--
-- ⚑ THE RULE, NOW TRUE ON BOTH SCREENS: everything follows the period EXCEPT the
-- headline figures that say otherwise on their own face — "on the platform
-- today", "all time". A breakdown row is activity within the period, so a class
-- nobody drove in July is not a row in July.
--
-- ⚑ AND NOTHING IS LOST, BECAUSE ALL TIME IS THE DEFAULT. On All time — the view
-- every screen opens with — the filter is inert and every class, every car and
-- every Driver appears, including the three who have never taken a trip. That is
-- where "do I have enough vans?" is answered. A period answers a different
-- question: what actually happened in it.

create or replace function admin_driver_overview(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns json
language sql
stable
as $$
with car as (
  select d.id as driver_id,
         v.category::text  as category,
         v.body_type::text as body_type,
         v.make
    from driver d
    left join lateral (
      select category, body_type, make
        from vehicle
       where driver_id = d.id
       order by is_active desc nulls last, created_at asc
       limit 1
    ) v on true
),
per_driver as (
  select d.id, d.gender, d.verified,
         d.base_lat is not null and d.base_lng is not null as based,
         c.category, c.body_type, c.make,
         count(m.id) filter (where m.accepted_at is not null)  as taken,
         count(m.id) filter (where m.status = 'completed')     as finished,
         max(m.accepted_at)                                    as last_took
    from driver d
    left join car c on c.driver_id = d.id
    left join mission m
      on m.driver_id = d.id
     and (p_from is null or m.accepted_at >= p_from)
     and (p_to   is null or m.accepted_at <  p_to)
   group by d.id, d.gender, d.verified, based, c.category, c.body_type, c.make
),
ever as (
  select d.id, count(m.id) filter (where m.accepted_at is not null) as taken_ever
    from driver d
    left join mission m on m.driver_id = d.id
   group by d.id
),
headline as (
  select (select count(*) from driver)                          as drivers,
         (select count(*) from ever where taken_ever = 0)        as never_took,
         count(*) filter (where not based)                       as without_base,
         sum(taken)                                              as taken,
         percentile_cont(0.5) within group (order by taken)
           filter (where taken > 0)                              as median_trips,
         count(*) filter (where taken > 0)                       as working_drivers
    from per_driver
),
-- ⚑ `filter (where taken > 0)` — the fix. On All time this is inert (a Driver who
-- has never worked still owns a car and still appears); inside a period it counts
-- the Drivers who actually drove, so "6 drivers, 60 trips" can no longer mean two
-- different things depending on which screen you are on.
by_class as (
  select category as key, body_type as parent,
         count(*) filter (where taken > 0) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by category, body_type
),
by_make as (
  select make as key, null::text as parent,
         count(*) filter (where taken > 0) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by make
),
-- ⚑ GENDER IS A CENSUS, NOT AN ACTIVITY MEASURE, so it is NOT period-scoped and
-- its count is NOT filtered. This was nearly the opposite: scoping it would have
-- put "Not asked — 9" in the table while the note above it said "1 of 13
-- answered" — two numbers about the same thirteen people, disagreeing on screen.
-- The screen renders only the count for these rows; `taken`/`finished` are
-- carried for one row shape and deliberately not shown ([[d101]]).
by_gender as (
  select gender as key, null::text as parent,
         count(*) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by gender
)
select json_build_object(
  'drivers',         (select drivers from headline),
  'taken',           (select coalesce(taken, 0) from headline),
  'never_took',      (select never_took from headline),
  'without_base',    (select without_base from headline),
  'median_trips',    (select median_trips from headline),
  'working_drivers', (select working_drivers from headline),
  'gender_answered', (select count(*) from driver where gender is not null),
  -- ⚑ A row with no activity in the period drops out, exactly as it does on the
  -- Businesses screen. On All time nothing drops, because nothing has zero.
  'by_class',  (select coalesce(json_agg(c order by c.drivers desc, c.taken desc), '[]'::json) from by_class c where c.taken > 0),
  'by_make',   (select coalesce(json_agg(m order by m.drivers desc, m.taken desc), '[]'::json) from by_make m where m.taken > 0),
  -- ⚑ EXCEPT GENDER, WHICH KEEPS ITS ZERO ROWS. "Not asked × 12" is the whole
  -- point of that table ([[d101]]) and the fleet's answers are not an activity
  -- measure — dropping the row would empty the section the day it shipped.
  'by_gender', (select coalesce(json_agg(g order by g.drivers desc), '[]'::json) from by_gender g)
);
$$;

comment on function admin_driver_overview(timestamptz, timestamptz) is
  'Activity Console /admin/drivers. NULL period = all time, the default. Breakdown counts are period-scoped, matching admin_business_overview; never_took and gender_answered are deliberately all-time.';

-- Check it after pasting — the July class counts should now be the drivers who
-- actually drove, and All time should be unchanged:
--   select admin_driver_overview();
--   select admin_driver_overview('2026-07-01'::timestamptz, '2026-08-01'::timestamptz);
