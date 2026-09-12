-- 2026-09-12 — THE BUSINESSES BREAKDOWN IS A CENSUS AGAIN. Safe to re-run.
--
-- ⚑ WHAT WENT WRONG, because the shape will come back otherwise.
-- 2026-09-10_business_country.sql recreated admin_business_overview to add the country key,
-- and its header says the body is "COPIED FROM 2026-08-30_admin_rollup_periods.sql, which is
-- the LAST definition of each". It was not. The last definition is
-- 2026-08-30_rollup_counts_are_a_census.sql, which had fixed exactly this function hours
-- later. So the country change was grafted onto a superseded body and silently reverted
-- [[d103]] on /admin/businesses:
--
--     by_type/by_region/by_city   count(*) filter (where trips > 0) as businesses
--     json_build_object(...)      ... from by_type t where t.trips > 0
--
-- ⚑ MEASURED LIVE BEFORE WRITING THIS (read-only, 2026-09-11):
--     all time   → by_type [["hotel", 4, 378]]              ← looks perfectly right
--     May 2026   → by_type [["hotel", 2, 10]]               ← 4 Businesses became 2
--     Jan 2027   → by_type []  ·  by_region []              ← the whole table vanishes
-- The default view is All time, where every Business has posted, so the screen looked
-- correct every time anyone opened it. That is why it survived a session and a review.
--
-- ⚑ THE RULE IT BROKE, UNCHANGED SINCE 2026-08-30 ([[d103]], founder's brief):
--   • the COUNT is a census — how many Businesses are of this type, in this région. It does
--     NOT move with the period. Choosing May does not make two Businesses stop existing.
--   • the TRIPS are activity — what happened inside the period.
--   • AND NO ROW IS DROPPED FOR HAVING NO ACTIVITY. A région that booked nothing in May is
--     exactly the row worth seeing in May.
--
-- ⚑ AND THE RULE FOR THE NEXT MIGRATION THAT TOUCHES A FUNCTION: `grep -rn "create or
-- replace function <name>" docs/migrations` lists every definition, and the newest FILE DATE
-- is not always the newest BODY — two files here are both dated 2026-08-30. Copy from the
-- live database (`select prosrc from pg_proc where proname = ...`), or from the file whose
-- header says it supersedes the others. S76 lost a week to a probe reading a superseded
-- migration; this is the same trap with the arrow pointing the other way.
--
-- WHAT THIS FILE DOES: the 2026-08-30_rollup_counts_are_a_census body, verbatim, plus the one
-- line 2026-09-10 meant to add (région in France, "C:" + ISO country outside it). Nothing
-- else changes: same name, same arguments, same JSON keys, same return type. admin_business_page
-- is NOT touched — its list has never been a census and 2026-09-10's copy of it is faithful.
--
-- ▶ Run this in the Supabase SQL editor. No data is read or written; it replaces one function.

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
         -- ⚑ 2026-09-10's one intended change: an INSEE région code in France, "C:" + the ISO
         --   country outside it. `regionKeyLabel` (lib/france-geo.ts) renders "C:MC" as "Monaco";
         --   the prefix keeps a two-letter country from colliding with a two-digit région.
         coalesce(b.region, case when b.country is not null then 'C:' || b.country end) as region,
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
   group by b.id, b.business_type, b.city, b.region, b.country
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
-- ⚑ Census counts: how many Businesses are of this kind / in this place, full stop.
--   `count(*)`, never `count(*) filter (where trips > 0)` — that filter is the bug this
--   file exists to undo, and it is NOT inert on All time: a Business that has never posted
--   has trips = 0 in every period, All time included.
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
  'Activity Console /admin/businesses. NULL period = all time, the default. Breakdown COUNTS are a census and do not move with the period; TRIPS are activity within it. No row is dropped for having no activity. by_region keys are an INSEE région code, or "C:" + ISO country for a Business outside France. Census restored 2026-09-12 after 2026-09-10 grafted the country key onto a superseded body.';
