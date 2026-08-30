-- 2026-08-30 — PERIODS ON THE CONSOLE ROLLUPS. Replaces the four functions from
-- today's two rollup migrations with versions that take a period. Safe to re-run.
--
-- ⚑ RUN THE OTHER THREE 2026-08-30 MIGRATIONS FIRST. This one only redefines
-- functions; it does not add the columns they read.
--
-- ── WHY (founder, S71) ──────────────────────────────────────────────────────
-- > *"The database has to give 100 % of all time infos, that is why we need to
-- >  break it into periods — the analyses are not only in the last few months but
-- >  from day one."*
--
-- ⚑ SO A PERIOD NARROWS AN ANSWER THAT IS ALREADY COMPLETE. It never stands in
-- for one. `p_from`/`p_to` NULL means all time, every screen opens there, and the
-- functions have always counted every row that has ever existed — there is no
-- window, no "last 90 days", and no cap anywhere in here.
--
-- ⚑ HALF-OPEN, ALWAYS: `>= p_from` and `< p_to`. lib/earnings.ts `periodRange`
-- returns an exclusive end for every granularity, so a trip at 23:59:59 on the
-- 31st belongs to July and a trip at 00:00:00 on the 1st belongs to August —
-- never both, never neither. Using `<=` here would double-count midnight.
--
-- ⚑ AND THE PERIOD IS APPLIED TO THE JOIN, NOT TO THE `where`. `left join mission
-- ... and m.created_at >= p_from` keeps a Business with no trips in July as a row
-- with zero, which is the interesting row. Moving that condition into the WHERE
-- turns the outer join into an inner one and the Business disappears — the
-- classic silent way to make a quiet month look like a busy one.

-- ── 1 · Businesses ──────────────────────────────────────────────────────────
create or replace function admin_business_overview(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns json
language sql
stable
as $$
with per_business as (
  select b.id,
         b.business_type,
         b.city,
         b.region,
         count(m.id)                                            as trips,
         count(m.id) filter (
           where m.accepted_at is not null
              or m.status in ('expired', 'cancelled')
         )                                                      as settled,
         count(m.id) filter (where m.accepted_at is not null)    as filled,
         count(m.id) filter (where m.status = 'expired')         as unfilled,
         max(m.created_at)                                       as last_posted
    from business b
    left join mission m
      on m.business_id = b.id
     and (p_from is null or m.created_at >= p_from)
     and (p_to   is null or m.created_at <  p_to)
   group by b.id, b.business_type, b.city, b.region
),
-- ⚑ "Never posted once" is ALL TIME even inside a period, so it is counted from
-- its own unfiltered pass. Scoped to July it would mean "did not post in July",
-- which is a different and far less interesting fact — and it would jump around
-- as the founder steps ‹ › through the months, looking like a bug.
ever as (
  select b.id, count(m.id) as trips_ever
    from business b
    left join mission m on m.business_id = b.id
   group by b.id
),
headline as (
  select (select count(*) from business)                        as businesses,
         (select count(*) from ever where trips_ever = 0)       as never_posted,
         sum(trips)                                             as trips,
         percentile_cont(0.5) within group (order by trips)
           filter (where trips > 0)                             as median_trips,
         count(*) filter (where trips > 0)                      as posting_businesses
    from per_business
),
by_type as (
  select business_type as key, null::text as parent,
         count(*) filter (where trips > 0) as businesses, sum(trips) as trips,
         sum(settled) as settled, sum(filled) as filled
    from per_business group by business_type
),
by_region as (
  select region as key, null::text as parent,
         count(*) filter (where trips > 0) as businesses, sum(trips) as trips,
         sum(settled) as settled, sum(filled) as filled
    from per_business group by region
),
by_city as (
  select city as key, min(region) as parent,
         count(*) filter (where trips > 0) as businesses, sum(trips) as trips,
         sum(settled) as settled, sum(filled) as filled
    from per_business group by city
)
select json_build_object(
  'businesses',         (select businesses from headline),
  'trips',              (select coalesce(trips, 0) from headline),
  'never_posted',       (select never_posted from headline),
  'median_trips',       (select median_trips from headline),
  'posting_businesses', (select posting_businesses from headline),
  'by_type',   (select coalesce(json_agg(t order by t.trips desc, t.businesses desc), '[]'::json) from by_type t where t.trips > 0),
  'by_region', (select coalesce(json_agg(r order by r.trips desc, r.businesses desc), '[]'::json) from by_region r where r.trips > 0),
  'by_city',   (select coalesce(json_agg(c order by c.trips desc, c.businesses desc), '[]'::json) from by_city c where c.trips > 0)
);
$$;

comment on function admin_business_overview(timestamptz, timestamptz) is
  'Activity Console /admin/businesses. NULL period = all time, which is the default. "never_posted" is deliberately all-time even inside a period. Counts only; the app decides whether a sample earns a percentage.';

create or replace function admin_business_page(
  p_type   text default null,
  p_region text default null,
  p_city   text default null,
  p_limit  int  default 60,
  p_offset int  default 0,
  p_from   timestamptz default null,
  p_to     timestamptz default null
)
returns table (
  id            uuid,
  name          text,
  business_type text,
  city          text,
  region        text,
  trips         bigint,
  unfilled      bigint,
  last_posted   timestamptz,
  total_count   bigint
)
language sql
stable
as $$
with per_business as (
  select b.id, b.name, b.business_type, b.city, b.region,
         count(m.id)                                      as trips,
         count(m.id) filter (where m.status = 'expired')  as unfilled,
         max(m.created_at)                                as last_posted
    from business b
    left join mission m
      on m.business_id = b.id
     and (p_from is null or m.created_at >= p_from)
     and (p_to   is null or m.created_at <  p_to)
   where (p_type   is null or b.business_type is not distinct from p_type)
     and (p_region is null or b.region        is not distinct from p_region)
     and (p_city   is null or b.city          is not distinct from p_city)
   group by b.id, b.name, b.business_type, b.city, b.region
)
select id, name, business_type, city, region, trips, unfilled, last_posted,
       count(*) over () as total_count
  from per_business
 order by trips desc, name asc
 limit p_limit offset p_offset;
$$;

comment on function admin_business_page(text, text, text, int, int, timestamptz, timestamptz) is
  'Activity Console /admin/businesses list. NULL period = all time. total_count rides along so the page note can never lie about what it is hiding.';

-- ── 2 · Drivers ─────────────────────────────────────────────────────────────
create or replace function admin_driver_overview(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns json
language sql
stable
as $$
with car as (
  -- ⚑ Cast to text once: `vehicle.category` is the enum `vehicle_category` and
  -- `body_type` is the enum `body_type`; comparing either with a text parameter
  -- raises `operator does not exist: vehicle_category = text`.
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
         -- ⚑ taken/finished, not settled/filled ([[d102]]): every trip a Driver
         -- holds was accepted by that same Driver, so the Businesses pair would
         -- read ~100 % on every row forever. The Driver-side question is whether
         -- the work they take actually gets done.
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
-- All time even inside a period, for the same reason as "never posted once".
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
by_class as (
  select category as key, body_type as parent,
         count(*) as drivers, sum(taken) as taken, sum(finished) as finished
    from per_driver group by category, body_type
),
by_make as (
  select make as key, null::text as parent,
         count(*) as drivers, sum(taken) as taken, sum(finished) as finished
    from per_driver group by make
),
by_gender as (
  select gender as key, null::text as parent,
         count(*) as drivers, sum(taken) as taken, sum(finished) as finished
    from per_driver group by gender
)
select json_build_object(
  'drivers',         (select drivers from headline),
  'taken',           (select coalesce(taken, 0) from headline),
  'never_took',      (select never_took from headline),
  'without_base',    (select without_base from headline),
  'median_trips',    (select median_trips from headline),
  'working_drivers', (select working_drivers from headline),
  -- ⚑ The honest denominator. A NULL gender is "never asked", not an answer, and
  -- it is counted over the WHOLE fleet — the question is about Kavenue's rollout,
  -- not about who happened to drive in July.
  'gender_answered', (select count(*) from driver where gender is not null),
  'by_class',  (select coalesce(json_agg(c order by c.drivers desc, c.taken desc), '[]'::json) from by_class c),
  'by_make',   (select coalesce(json_agg(m order by m.drivers desc, m.taken desc), '[]'::json) from by_make m),
  'by_gender', (select coalesce(json_agg(g order by g.drivers desc), '[]'::json) from by_gender g)
);
$$;

comment on function admin_driver_overview(timestamptz, timestamptz) is
  'Activity Console /admin/drivers. NULL period = all time, the default. "never_took" and "gender_answered" are deliberately all-time even inside a period.';

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

comment on function admin_driver_page(text, text, text, text, int, int, timestamptz, timestamptz) is
  'Activity Console /admin/drivers list. NULL period = all time. held_unfinished preserves the fleet list''s third state - held some, finished none.';

-- ⚑ The old four-argument / five-argument signatures are NOT dropped by
-- `create or replace` — adding parameters creates a NEW overload and leaves the
-- previous one callable. Dropped explicitly so PostgREST cannot resolve an
-- ambiguous call, and so no page can quietly keep asking the period-blind version.
drop function if exists admin_business_page(text, text, text, int, int);
drop function if exists admin_driver_page(text, text, text, text, int, int);
drop function if exists admin_business_overview();
drop function if exists admin_driver_overview();

-- Check it after pasting:
--   select admin_business_overview();                                  -- all time
--   select admin_business_overview('2026-07-01'::timestamptz, '2026-08-01'::timestamptz);
--   select admin_driver_overview();
