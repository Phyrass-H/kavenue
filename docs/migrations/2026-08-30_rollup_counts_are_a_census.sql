-- 2026-08-30 — BREAKDOWN COUNTS ARE A CENSUS, AND NO ROW IS EVER DROPPED.
-- Replaces admin_business_overview and admin_driver_overview. Safe to re-run.
--
-- ⚑ THIS SUPERSEDES 2026-08-30_driver_rollup_period_counts.sql, WHICH WAS WRONG.
-- That one made the Driver counts period-scoped and claimed the filter was
-- "inert on All time". It is not: a Driver who has never worked has `taken = 0`
-- in EVERY period, all time included, so `filter (where taken > 0)` quietly
-- removed them from the fleet composition. `Business · Sedan` went from 6 drivers
-- to 4 on the default view, and "do I have enough vans?" started answering wrong
-- on the one screen that is supposed to answer it. Caught by reading the numbers,
-- not by a test — the third time in one session.
--
-- ── THE RULE, SETTLED ───────────────────────────────────────────────────────
-- A breakdown row has two kinds of number and they are not the same kind:
--
--   • the COUNT is a census — how many Businesses are in this région, how many
--     Drivers own this class of car. It describes the market and the fleet, and
--     it does NOT move when you change the period. Choosing July does not make
--     two of your Drivers stop owning a Mercedes.
--
--   • the TRIPS are activity — what happened inside the chosen period.
--
-- ⚑ AND NO ROW IS DROPPED FOR HAVING NO ACTIVITY. A class nobody drove in May is
-- exactly the row worth seeing in May: *"you had three Eco cars and none of them
-- worked."* The previous version hid it, which is the silent omission this whole
-- console exists to refuse — and on All time it could have hidden a whole class
-- whose owners had never driven, deleting it from the fleet.
--
-- ⚑ THE RESIDUAL, ACCEPTED AND FLAGGED: with a period chosen, a reader could
-- divide period trips by the census count and get a per-Driver average that is
-- too low, because some of those Drivers did not work that month. Mitigated
-- rather than hidden: the columns are headed "drivers" and "trips taken" — never
-- "trips each" — and the honest per-head figure has its own headline card,
-- computed as a median over the ones who actually worked.

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
  select b.id, b.business_type, b.city, b.region,
         count(m.id)                                            as trips,
         count(m.id) filter (
           where m.accepted_at is not null
              or m.status in ('expired', 'cancelled')
         )                                                      as settled,
         count(m.id) filter (where m.accepted_at is not null)    as filled,
         max(m.created_at)                                       as last_posted
    from business b
    left join mission m
      on m.business_id = b.id
     and (p_from is null or m.created_at >= p_from)
     and (p_to   is null or m.created_at <  p_to)
   group by b.id, b.business_type, b.city, b.region
),
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
-- Census counts: how many Businesses are of this kind / in this place, full stop.
by_type as (
  select business_type as key, null::text as parent, count(*) as businesses,
         sum(trips) as trips, sum(settled) as settled, sum(filled) as filled
    from per_business group by business_type
),
by_region as (
  select region as key, null::text as parent, count(*) as businesses,
         sum(trips) as trips, sum(settled) as settled, sum(filled) as filled
    from per_business group by region
),
by_city as (
  select city as key, min(region) as parent, count(*) as businesses,
         sum(trips) as trips, sum(settled) as settled, sum(filled) as filled
    from per_business group by city
)
select json_build_object(
  'businesses',         (select businesses from headline),
  'trips',              (select coalesce(trips, 0) from headline),
  'never_posted',       (select never_posted from headline),
  'median_trips',       (select median_trips from headline),
  'posting_businesses', (select posting_businesses from headline),
  -- ⚑ No `where trips > 0`. A région that booked nothing in May is a row in May.
  'by_type',   (select coalesce(json_agg(t order by t.trips desc, t.businesses desc), '[]'::json) from by_type t),
  'by_region', (select coalesce(json_agg(r order by r.trips desc, r.businesses desc), '[]'::json) from by_region r),
  'by_city',   (select coalesce(json_agg(c order by c.trips desc, c.businesses desc), '[]'::json) from by_city c)
);
$$;

comment on function admin_business_overview(timestamptz, timestamptz) is
  'Activity Console /admin/businesses. NULL period = all time, the default. Breakdown COUNTS are a census and do not move with the period; TRIPS are activity within it. No row is dropped for having no activity.';

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

comment on function admin_driver_overview(timestamptz, timestamptz) is
  'Activity Console /admin/drivers. NULL period = all time, the default. Breakdown COUNTS are a census of the fleet and do not move with the period; TAKEN/FINISHED are activity within it. No row is dropped for having no activity.';

-- Check it after pasting — all time must show the WHOLE fleet again:
--   select admin_driver_overview();      -- Business/Sedan back to 6 drivers
--   select admin_driver_overview('2026-05-01'::timestamptz, '2026-06-01'::timestamptz);
--                                        -- every class present, most with 0 trips
