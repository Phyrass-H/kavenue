-- 2026-08-30 — THE DRIVERS SCREEN. Additive: two read-only functions, nothing
-- else. Safe to re-run.
--
-- ⚑ RUN docs/migrations/2026-08-30_driver_gender.sql FIRST. This reads
-- `driver.gender`, so pasting it before that one fails with "column does not
-- exist" — which is the right failure, not a bug to work around.
--
-- ── WHY IT EXISTS (founder, S71) ────────────────────────────────────────────
-- The same treatment the Businesses screen got, applied to the other side of the
-- market, plus the two things they asked for by name:
--   > *"We need also in activity console, cars, classes and categories"*
--   > *"Also Men and Women"*
--
-- Mirrors docs/migrations/2026-08-30_admin_business_rollup.sql exactly — same
-- shape, same `security invoker`, same rule that COUNTS TRAVEL AND RATES ARE
-- RENDERED. Reading the two side by side should show one idea, not two.
--
-- ⚑ ONE VEHICLE PER DRIVER, CHOSEN THE WAY THE APP CHOOSES IT. A Driver may hold
-- several rows in `vehicle`; `lib/admin-activity.ts readFleet` takes the active
-- one and falls back to the first. A plain join would count a Driver once per
-- car and quietly inflate every class — so the lateral below picks exactly one,
-- ordering `is_active` first, and a Driver with no car at all still appears,
-- under a null key that the screen names.
--
-- ⚑ AND THE GENDER BREAKDOWN CARRIES ITS OWN DENOMINATOR. `answered` is returned
-- beside the counts so the screen can say "9 of 13 answered" — never quietly
-- dividing by the ones who replied. NULL (never asked) and 'undisclosed'
-- (asked, declined) stay separate all the way through: the first is a fact about
-- Kavenue, the second about the Driver.

create or replace function admin_driver_overview()
returns json
language sql
stable
as $$
with car as (
  -- ⚑ CAST TO text HERE, ONCE. `vehicle.category` is the enum `vehicle_category`
  -- and `vehicle.body_type` is the enum `body_type`; comparing either with a
  -- text parameter raises `operator does not exist: vehicle_category = text`.
  -- Casting at the source means every CTE below, both filters and both json
  -- keys, is plain text — rather than four separate `::text` sprinkled around
  -- for one reader to miss. (`business_type` is a bare text column, which is
  -- why the Businesses rollup never hit this.)
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
  select d.id,
         d.gender,
         d.verified,
         d.base_lat is not null and d.base_lng is not null as based,
         c.category,
         c.body_type,
         c.make,
         -- ⚑ "TAKEN / FINISHED", NOT "SETTLED / FILLED" — and the difference is
         -- the whole point of this column. On the Businesses screen `filled`
         -- means a Driver was found, which is the question a Business has. Every
         -- trip a DRIVER holds was accepted by that same Driver, so the identical
         -- pair would read ~100 % for everyone forever and answer nothing. The
         -- Driver-side question is whether the work they take actually gets done.
         count(m.id) filter (where m.accepted_at is not null)   as taken,
         count(m.id) filter (where m.status = 'completed')      as finished,
         max(m.accepted_at)                                     as last_took
    from driver d
    left join car c on c.driver_id = d.id
    left join mission m on m.driver_id = d.id
   group by d.id, d.gender, d.verified, based, c.category, c.body_type, c.make
),
month_start as (
  select date_trunc('month', (now() at time zone 'Europe/Paris'))
           at time zone 'Europe/Paris' as t
),
headline as (
  select count(*)                                              as drivers,
         count(*) filter (where last_took >= (select t from month_start)) as took_this_month,
         count(*) filter (where taken = 0)                      as never_took,
         count(*) filter (where not based)                      as without_base,
         percentile_cont(0.5) within group (order by taken)
           filter (where taken > 0)                             as median_trips,
         count(*) filter (where taken > 0)                      as working_drivers
    from per_driver
),
-- What they drive: the class and the body together, because that pair is how
-- the whole app names a car (`serviceClassLabel`) and how the Pool matches one.
by_class as (
  select category as key, body_type as parent,
         count(*) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by category, body_type
),
by_make as (
  select make as key, null::text as parent,
         count(*) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by make
),
by_gender as (
  select gender as key, null::text as parent,
         count(*) as drivers,
         sum(taken) as taken, sum(finished) as finished
    from per_driver group by gender
)
select json_build_object(
  'drivers',         (select drivers from headline),
  'took_this_month', (select took_this_month from headline),
  'never_took',      (select never_took from headline),
  'without_base',    (select without_base from headline),
  'median_trips',    (select median_trips from headline),
  'working_drivers', (select working_drivers from headline),
  -- The denominator of the gender breakdown, computed here so the screen cannot
  -- forget it. A NULL gender is "never asked" and is NOT an answer.
  'gender_answered', (select count(*) from per_driver where gender is not null),
  'by_class',  (select coalesce(json_agg(c order by c.drivers desc, c.taken desc), '[]'::json) from by_class c),
  'by_make',   (select coalesce(json_agg(m order by m.drivers desc, m.taken desc), '[]'::json) from by_make m),
  'by_gender', (select coalesce(json_agg(g order by g.drivers desc), '[]'::json) from by_gender g)
);
$$;

comment on function admin_driver_overview() is
  'Activity Console, /admin/drivers: headline numbers plus the what-they-drive / cars / gender breakdowns, aggregated in SQL. gender_answered is the honest denominator — a NULL gender means never asked, not an answer.';

create or replace function admin_driver_page(
  p_category text default null,
  p_body     text default null,
  p_make     text default null,
  p_gender   text default null,
  p_limit    int  default 60,
  p_offset   int  default 0
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
  -- Same cast, same reason — see admin_driver_overview above. The RETURNS TABLE
  -- declares `category text` / `body_type text`, so this also keeps the returned
  -- columns matching their declared types.
  select d.id as driver_id,
         v.category::text  as category,
         v.body_type::text as body_type,
         v.make, v.model
    from driver d
    left join lateral (
      select category, body_type, make, model
        from vehicle
       where driver_id = d.id
       order by is_active desc nulls last, created_at asc
       limit 1
    ) v on true
),
per_driver as (
  select d.id, d.first_name, d.last_name, d.gender, d.verified,
         d.base_label, d.service_radius_km,
         c.category, c.body_type, c.make, c.model,
         count(m.id) filter (where m.accepted_at is not null)  as trips,
         -- ⚑ THE THIRD STATE THE FLEET LIST ALREADY KNOWS ABOUT (S69): "held 8,
         -- none finished" is a real Driver and neither "working" nor "never
         -- took a trip". Kept here so the row can still say it.
         count(m.id) filter (
           where m.accepted_at is not null and m.status <> 'completed'
         )                                                     as held_unfinished,
         max(m.accepted_at)                                    as last_took
    from driver d
    left join car c on c.driver_id = d.id
    left join mission m on m.driver_id = d.id
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

comment on function admin_driver_page(text, text, text, text, int, int) is
  'Activity Console, /admin/drivers: one page of Drivers under an optional class / body / make / gender filter. held_unfinished preserves the fleet list''s third state - held some, finished none.';

-- Check it after pasting:
--   select admin_driver_overview();
--   select * from admin_driver_page(p_category => 'business');
