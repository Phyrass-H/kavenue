-- A Business gets a country, and the Businesses screen names it.
--
-- ⚑ WHY. The screen showed the Métropole Monte-Carlo as "Outside France". That wording
-- was written in S71 for a NULL région and was the honest thing to say when a NULL was
-- all we had. The founder settled it on 2026-09-10:
--   *"if it's outside of France then you name the country, period"*
-- A name needs a column. `region` is NULL for Monaco and always will be — INSEE codes do
-- not cover it — so there was nothing to name it with.
--
-- ⚑ THE DRIVER SIDE ALREADY HAS THIS. `driver.base_country` shipped the day before
-- (2026-09-09_driver_base_area.sql), so a Driver in Monaco read "Monaco" while a Business
-- in the same street read "Outside France". One vocabulary or neither number is worth
-- reading.
--
-- ⚑ WHY THE COUNTRY IS NOT DERIVED FROM `departement`. "No département" has two causes
-- that must never be merged: outside France, and not-looked-up-yet. The Carlton Cannes
-- seed row has no département because nobody ever ran the register on it — calling that
-- "abroad" would be an invention. The country is its own fact and is stored as one.
--
-- ⚑ NULLABLE, AND STAYING THAT WAY. Monaco is not in the French register at all, so a
-- Business can legitimately have no SIRET and no INSEE codes. NULL here means "nobody has
-- established it", which is a different thing from any country code, and the screen says
-- so in those words rather than guessing.
--
-- Additive: one column, plus both rollup functions recreated. No data is destroyed.
-- ⚑ THE FUNCTION BODIES BELOW ARE COPIED FROM 2026-08-30_admin_rollup_periods.sql, which
-- is the LAST definition of each — three migrations define them and only the newest is
-- live. (S76 lost a week to a probe reading a superseded migration; do not repeat it.)
--
-- Applied by the founder in the Supabase SQL editor.

alter table business add column if not exists country text;

comment on column business.country is
  'ISO-3166-1 alpha-2 country code ("FR", "MC"). NULL means not established yet — NOT abroad. Mirrors driver.base_country; see lib/place-area.ts.';

create index if not exists business_country_idx
  on business (country) where country is not null;

-- ── the breakdown: group by région in France, by COUNTRY outside it ──────────
--
-- ⚑ THE KEY IS "region code, or 'C:' + country". One grouping column, two kinds of
-- value, and the prefix is what tells them apart — `regionKeyLabel` in
-- lib/france-geo.ts renders "C:MC" as "Monaco". Without the prefix a two-letter
-- country code could collide with a two-digit région code.
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
         -- ⚑ THE ONE CHANGED LINE. Everything else is the 2026-08-30 body verbatim.
         coalesce(b.region, case when b.country is not null then 'C:' || b.country end) as region,
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
  'Activity Console /admin/businesses. NULL period = all time, which is the default. "never_posted" is deliberately all-time even inside a period. Counts only; the app decides whether a sample earns a percentage. ⚑ by_region keys are an INSEE région code, or "C:" + ISO country for a Business outside France (2026-09-10).';

-- ── and the list must accept the same key it just handed out ─────────────────
--
-- ⚑ THE BUG THIS AVOIDS: clicking "Monaco" would pass p_region = 'C:MC', which no
-- `b.region` ever equals, and the founder would get an empty list under a heading that
-- says there are two of them.
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
  select b.id, b.name, b.business_type, b.city,
         coalesce(b.region, case when b.country is not null then 'C:' || b.country end) as region,
         count(m.id)                                      as trips,
         count(m.id) filter (where m.status = 'expired')  as unfilled,
         max(m.created_at)                                as last_posted
    from business b
    left join mission m
      on m.business_id = b.id
     and (p_from is null or m.created_at >= p_from)
     and (p_to   is null or m.created_at <  p_to)
   where (p_type   is null or b.business_type is not distinct from p_type)
     and (
       p_region is null
       or (p_region like 'C:%' and b.region is null and b.country = substring(p_region from 3))
       or (p_region not like 'C:%' and b.region is not distinct from p_region)
     )
     and (p_city   is null or b.city          is not distinct from p_city)
   group by b.id, b.name, b.business_type, b.city, b.region, b.country
)
select id, name, business_type, city, region, trips, unfilled, last_posted,
       count(*) over () as total_count
  from per_business
 order by trips desc, name asc
 limit p_limit offset p_offset;
$$;

comment on function admin_business_page(text, text, text, int, int, timestamptz, timestamptz) is
  'Activity Console /admin/businesses list. ⚑ p_region accepts an INSEE région code OR "C:" + ISO country, the same keys admin_business_overview hands out (2026-09-10).';
