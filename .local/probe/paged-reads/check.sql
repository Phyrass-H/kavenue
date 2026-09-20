-- Read-only. Paste into the Supabase SQL editor AFTER
-- docs/migrations/2026-09-20_paged_read_indexes.sql. Every row must read `pass`.
-- It writes nothing and locks nothing.
with want(tbl, idx) as (
  values
    ('mission',               'mission_business_pickup_idx'),
    ('mission_cancellation',  'mission_cancellation_business_created_idx'),
    ('mission_amendment',     'mission_amendment_business_created_idx'),
    ('mission_release',       'mission_release_business_created_idx'),
    ('mission_info_change',   'mission_info_change_business_created_idx')
)
select
  w.tbl                                        as "table",
  w.idx                                        as "index",
  case when i.indexname is null then 'FAIL — missing' else 'pass' end as "state",
  coalesce(i.indexdef, '(not created)')        as "definition"
from want w
left join pg_indexes i
  on i.schemaname = 'public' and i.tablename = w.tbl and i.indexname = w.idx
order by w.tbl;
