-- 2026-09-20_paged_read_indexes.sql — S84 follow-up to the 1 000-row paging fix.
--
-- ⚑ OPTIONAL AND LOW PRIORITY. Nothing is broken without it and no code depends on
-- it. Apply it whenever convenient. It is additive, idempotent, and at today's
-- volumes (a few hundred trips) Postgres will sequential-scan either way.
--
-- WHY. Every Business-side read that could outgrow one page is now PAGED, and each
-- one ends its ORDER BY on a unique column so two pages cannot overlap:
--
--   app/(dispatch)/dispatch/page.tsx          mission_read       pickup_at asc,  id asc
--   app/(dispatch)/dispatch/history/page.tsx  mission_read       pickup_at desc, id desc
--   app/(dispatch)/dispatch/spend/page.tsx    mission_read       pickup_at desc, id desc
--   both CSV routes                           mission_read       pickup_at desc, id desc
--   lib/side-tables.ts                        mission_cancellation  created_at desc, id desc
--   dispatch/page.tsx                         mission_amendment     created_at desc, id desc
--   dispatch/page.tsx                         mission_release       created_at desc, id desc
--   dispatch/page.tsx                         mission_info_change   created_at desc, id desc
--
-- `mission` has four indexes (docs/kavenue_schema.sql:133-136) and NONE on
-- pickup_at, so each of those pages is an index scan on business_id followed by a
-- sort of the whole archive — repeated once per page, and the Schedule re-renders
-- every 4 seconds while open (components/live-refresh.tsx). The four side tables
-- have an index on business_id alone, so the sort is likewise unsupported.
--
-- ⚑ ASC, not DESC. Postgres reads a btree backwards at no cost, so one ascending
-- index serves the Schedule's ASC read and the archive's DESC read both.
--
-- ⚑ NOT `concurrently`. That cannot run inside a transaction block, and these
-- tables are small enough today that the brief lock is nothing. If this is ever
-- applied to a large table, run each statement on its own, outside a transaction,
-- with `concurrently`.
--
-- Paste order: after 2026-09-18e_accept_fare_from_the_server.sql. No guard is
-- needed — every statement is `if not exists` and depends on nothing but the
-- tables themselves.

begin;

-- The trips themselves: business_id + pickup_at is the shape of all four archive
-- reads and of the Schedule. `id` last so the paged sort is fully index-ordered.
create index if not exists mission_business_pickup_idx
  on mission (business_id, pickup_at, id);

-- The four per-mission side tables, each read business-scoped and newest-first.
create index if not exists mission_cancellation_business_created_idx
  on mission_cancellation (business_id, created_at desc, id desc);

create index if not exists mission_amendment_business_created_idx
  on mission_amendment (business_id, created_at desc, id desc);

create index if not exists mission_release_business_created_idx
  on mission_release (business_id, created_at desc, id desc);

create index if not exists mission_info_change_business_created_idx
  on mission_info_change (business_id, created_at desc, id desc);

commit;
