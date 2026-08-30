-- 2026-08-30 — THE BUSINESSES SCREEN AT 25 000. Additive: two read-only
-- functions, no table touched, no column added. Safe to re-run.
--
-- ── WHY IT EXISTS (founder, S71) ────────────────────────────────────────────
-- > *"you have listed the hotels but what if we have 25 000 businesses are you
-- >  going to make an infinite list? No! So please when you work on the Activity
-- >  Console think always as huge numbers and how we can access all easy and
-- >  easy to have main numbers."*
--
-- The screen stops being a list. The breakdown becomes the navigation, the list
-- only ever appears filtered, and search reaches one Business directly — so
-- 25 000 rows never render anywhere.
--
-- ⚑ AND THE ARITHMETIC MOVES INTO SQL, WHICH IS THE HALF THAT ACTUALLY SCALES.
-- `app/admin/businesses/page.tsx` read EVERY business and EVERY mission and
-- counted them in JavaScript. Two things were wrong with that and only one was
-- speed: PostgREST caps an unpaged select at **1 000 rows** and says nothing —
-- measured on this database on 2026-08-30, `mission_event` returned 1 000 of
-- 2 503 with no error. So past a thousand trips the "nobody took" column would
-- have been quietly counting a fraction of them. A screen that is wrong in
-- silence is the one thing this console exists to refuse.
--
-- ⚑ SECURITY INVOKER, DELIBERATELY — the default, and it must stay the default.
-- These read `business` and `mission`, and RLS already grants `app_role()`
-- ='admin' read on both. Marking them `security definer` would hand every
-- signed-in Dispatcher the whole marketplace's numbers.
--
-- ── THE DEFINITIONS ARE COPIED, NOT REINVENTED ──────────────────────────────
-- `settled` and `filled` mean exactly what lib/admin-numbers.ts means by them,
-- because the home band and this screen must never disagree about the same word:
--   settled = accepted_at is not null OR status in ('expired','cancelled')
--   filled  = accepted_at is not null
-- A trip still sitting in the Pool is in NEITHER — it has not failed to find a
-- Driver, it is still looking ([[d98]]).
--
-- ⚑ THE PERCENTAGE IS NOT COMPUTED HERE. Every row returns its counts and the
-- app decides whether the sample earns a rate (MIN_FOR_RATE = 20). Dividing in
-- SQL would put "0 %" on a Business with one unfilled trip, which is the exact
-- half-truth the small-N rule exists to stop. Counts travel; rates are rendered.

-- ── 1 · the overview: four numbers and the three breakdowns, in one round trip
create or replace function admin_business_overview()
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
    left join mission m on m.business_id = b.id
   group by b.id, b.business_type, b.city, b.region
),
-- The month boundary is Paris's, not UTC's. On the 1st of a month, between
-- midnight and 02:00 Paris, those are different months and the number would be
-- wrong for exactly the two hours nobody is awake to notice.
month_start as (
  select date_trunc('month', (now() at time zone 'Europe/Paris'))
           at time zone 'Europe/Paris' as t
),
headline as (
  select count(*)                                                as businesses,
         count(*) filter (
           where last_posted >= (select t from month_start)
         )                                                       as posted_this_month,
         count(*) filter (where trips = 0)                       as never_posted,
         -- ⚑ Over the Businesses that HAVE posted. Including the silent ones
         -- would drag the typical Business toward zero and describe nobody.
         percentile_cont(0.5) within group (
           order by trips
         ) filter (where trips > 0)                              as median_trips,
         count(*) filter (where trips > 0)                       as posting_businesses
    from per_business
),
-- ⚑ EVERY BREAKDOWN KEEPS ITS NULLS AS A ROW. A Business with no type, or one in
-- Monaco with no region, is not dropped from the table it belongs in — it is a
-- row whose key is null, and the screen names it. The founder's rule: a
-- dashboard says "3 of 9 located", it never quietly counts only what it can find.
by_type as (
  select business_type as key, null::text as parent,
         count(*) as businesses, sum(trips) as trips,
         sum(settled) as settled, sum(filled) as filled
    from per_business group by business_type
),
by_region as (
  select region as key, null::text as parent,
         count(*) as businesses, sum(trips) as trips,
         sum(settled) as settled, sum(filled) as filled
    from per_business group by region
),
by_city as (
  select city as key, min(region) as parent,
         count(*) as businesses, sum(trips) as trips,
         sum(settled) as settled, sum(filled) as filled
    from per_business group by city
)
select json_build_object(
  'businesses',         (select businesses from headline),
  'posted_this_month',  (select posted_this_month from headline),
  'never_posted',       (select never_posted from headline),
  'median_trips',       (select median_trips from headline),
  'posting_businesses', (select posting_businesses from headline),
  'by_type',   (select coalesce(json_agg(t order by t.trips desc, t.businesses desc), '[]'::json) from by_type t),
  'by_region', (select coalesce(json_agg(r order by r.trips desc, r.businesses desc), '[]'::json) from by_region r),
  'by_city',   (select coalesce(json_agg(c order by c.trips desc, c.businesses desc), '[]'::json) from by_city c)
);
$$;

comment on function admin_business_overview() is
  'Activity Console, /admin/businesses: the four headline numbers plus the by-type / by-region / by-city breakdowns, aggregated in SQL so 25 000 Businesses never cross the wire. Counts only — the app decides whether a sample earns a percentage.';

-- ── 2 · the list, which only ever appears filtered ──────────────────────────
-- ⚑ `total_count` RIDES ALONG ON EVERY ROW, so the page footer can say "the
-- first 60 of 2 118" without a second query — and so a cap can never be silent,
-- which is the whole of what S69 fixed on the other three lists.
create or replace function admin_business_page(
  p_type   text default null,
  p_region text default null,
  p_city   text default null,
  p_limit  int  default 60,
  p_offset int  default 0
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
    left join mission m on m.business_id = b.id
   -- A null filter means "no filter"; `is not distinct from` also lets the
   -- screen ask for the null bucket itself — the Businesses with no type on
   -- file are reachable, not just countable.
   where (p_type   is null or b.business_type is not distinct from p_type)
     and (p_region is null or b.region        is not distinct from p_region)
     and (p_city   is null or b.city          is not distinct from p_city)
   group by b.id, b.name, b.business_type, b.city, b.region
)
select id, name, business_type, city, region, trips, unfilled, last_posted,
       count(*) over () as total_count
  from per_business
 -- Busiest first: on a screen you reached by asking "who books in Nice?", the
 -- answer is ordered by how much they book.
 order by trips desc, name asc
 limit p_limit offset p_offset;
$$;

comment on function admin_business_page(text, text, text, int, int) is
  'Activity Console, /admin/businesses: one page of Businesses under an optional type / region / city filter, each with its trip and unfilled counts. total_count rides along so the page note can never lie about what it is hiding.';

-- Check it after pasting:
--   select admin_business_overview();
--   select * from admin_business_page(p_city => 'NICE');
