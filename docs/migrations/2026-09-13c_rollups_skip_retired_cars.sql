-- 2026-09-13 · M6 of 6 — THE CONSOLE STOPS NAMING A CAR THE DRIVER NO LONGER HAS. Safe to re-run.
--
-- ⚑ WHY. Both /admin rollups resolve "this Driver's car" with a lateral that takes the active
-- row, else the oldest — a rule written when a Driver could only ever have one car. Since
-- S78 they can have a retired one (kept for ever: past trips point at it, and its carte grise
-- dies with it), and that row is usually the OLDEST. So the fleet breakdown would quietly
-- report the car they sold, and "how many First cars do we have" would count it.
--
-- ⚑ WHAT THIS FILE IS. The two newest bodies, reproduced whole with ONE line added to each
-- lateral. Postgres cannot patch a function body, so there is no smaller change available.
-- ⚑ AND THE BODIES WERE TAKEN FROM THE RIGHT FILES, which is the trap that bit S77 eight
-- days ago: `admin_driver_overview` comes from 2026-08-30_rollup_counts_are_a_census.sql (the
-- census fix, which SUPERSEDES 2026-08-30_driver_rollup_period_counts.sql), and
-- `admin_driver_page` from 2026-08-30_admin_rollup_periods.sql (the 8-argument overload the
-- app actually calls — the 6-argument one in _admin_driver_rollup.sql is an older signature
-- that still exists). Two files share the date 2026-08-30; the newest FILE NAME is not the
-- newest BODY. Check with: grep -rn "create or replace function <name>" docs/migrations
--
-- ⚑ LAST OF THE SIX, and nothing breaks while it waits: until it lands the console names a
-- retired car, which is wrong on screen but decides nothing.
--
-- Applied by the founder in the Supabase SQL editor.

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
         -- ⚑ S78 — NEVER A RETIRED CAR. A retired row is kept for ever because past trips
         --   point at it; naming it here would tell the founder a Driver drives a car they
         --   sold. `is_active` stays in the ordering only so this body is otherwise the
         --   2026-08-30 one verbatim — nothing writes that column, and "no car pause" is a
         --   decided product rule.
         and retired_at is null
       order by is_active desc nulls last, created_at asc
       limit 1
    ) v on true
),
per_driver as (
  select d.id, d.gender, d.verified,
         d.base_lat is not null and d.base_lng is not null as based,
         c.category, c.body_type, c.make,
         count(m.id) filter (where m.accepted_at is not null)  as taken,
         count(m.id) filter (where m.status = 'completed')     as finished
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
-- ⚑ Census, unfiltered. Choosing July does not make two Drivers stop owning a
-- Mercedes, and "you have three Eco cars and none of them worked in May" is
-- precisely the row worth seeing in May.
by_class as (
  select category as key, body_type as parent, count(*) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by category, body_type
),
by_make as (
  select make as key, null::text as parent, count(*) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by make
),
by_gender as (
  select gender as key, null::text as parent, count(*) as drivers,
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
  'by_class',  (select coalesce(json_agg(c order by c.taken desc, c.drivers desc), '[]'::json) from by_class c),
  'by_make',   (select coalesce(json_agg(m order by m.taken desc, m.drivers desc), '[]'::json) from by_make m),
  'by_gender', (select coalesce(json_agg(g order by g.drivers desc), '[]'::json) from by_gender g)
);
$$;

create or replace function admin_driver_page(
  p_category text default null,
  p_body     text default null,
  p_make     text default null,
  p_gender   text default null,
  p_limit    int  default 60,
  p_offset   int  default 0,
  p_from     timestamptz default null,
  p_to       timestamptz default null
)
returns table (
  id           uuid,
  first_name   text,
  last_name    text,
  gender       text,
  verified     boolean,
  base_label   text,
  service_radius_km int,
  category     text,
  body_type    text,
  make         text,
  model        text,
  trips        bigint,
  held_unfinished bigint,
  last_took    timestamptz,
  total_count  bigint
)
language sql
stable
as $$
with car as (
  select d.id as driver_id,
         v.category::text  as category,
         v.body_type::text as body_type,
         v.make, v.model
    from driver d
    left join lateral (
      select category, body_type, make, model
        from vehicle
       where driver_id = d.id
         -- ⚑ S78 — NEVER A RETIRED CAR. A retired row is kept for ever because past trips
         --   point at it; naming it here would tell the founder a Driver drives a car they
         --   sold. `is_active` stays in the ordering only so this body is otherwise the
         --   2026-08-30 one verbatim — nothing writes that column, and "no car pause" is a
         --   decided product rule.
         and retired_at is null
       order by is_active desc nulls last, created_at asc
       limit 1
    ) v on true
),
per_driver as (
  select d.id, d.first_name, d.last_name, d.gender, d.verified,
         d.base_label, d.service_radius_km,
         c.category, c.body_type, c.make, c.model,
         count(m.id) filter (where m.accepted_at is not null)  as trips,
         count(m.id) filter (
           where m.accepted_at is not null and m.status <> 'completed'
         )                                                     as held_unfinished,
         max(m.accepted_at)                                    as last_took
    from driver d
    left join car c on c.driver_id = d.id
    left join mission m
      on m.driver_id = d.id
     and (p_from is null or m.accepted_at >= p_from)
     and (p_to   is null or m.accepted_at <  p_to)
   where (p_category is null or c.category  is not distinct from p_category)
     and (p_body     is null or c.body_type is not distinct from p_body)
     and (p_make     is null or c.make      is not distinct from p_make)
     and (p_gender   is null or d.gender    is not distinct from p_gender)
   group by d.id, d.first_name, d.last_name, d.gender, d.verified,
            d.base_label, d.service_radius_km, c.category, c.body_type, c.make, c.model
)
select id, first_name, last_name, gender, verified, base_label, service_radius_km,
       category, body_type, make, model, trips, held_unfinished, last_took,
       count(*) over () as total_count
  from per_driver
 order by trips desc, last_name asc
 limit p_limit offset p_offset;
$$;

comment on function admin_driver_overview(timestamptz, timestamptz) is
  'Activity Console /admin/drivers. NULL period = all time. Breakdown COUNTS are a census and do not move with the period. ⚑ S78: a RETIRED car is never the Driver''s car here.';
comment on function admin_driver_page(text, text, text, text, int, int, timestamptz, timestamptz) is
  'Activity Console /admin/drivers list. ⚑ S78: the car named is the live one — a retired row is kept for the trips that point at it, never shown as what they drive.';

-- Check it after pasting: a Driver who has replaced a car must show the NEW one.
--   select category, body_type, make from admin_driver_page(null,null,null,null,60,0) limit 5;
