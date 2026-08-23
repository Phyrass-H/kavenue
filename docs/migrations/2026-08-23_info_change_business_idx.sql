-- 2026-08-23_info_change_business_idx.sql — § R rule 1 follow-up.
--
-- ⚑ OPTIONAL AND LOW PRIORITY. Nothing is broken without it. Apply it whenever
-- convenient; there is no rush and no dependency on it.
--
-- WHY. § R rule 1 changed the per-mission side-table reads from
--     .in("mission_id", <every mission id of this Business>)     -- errored at 398 ids
-- to
--     .eq("business_id", <this Business>)                        -- constant-size request
--
-- Three of the four side tables with a denormalised `business_id` already carry an
-- index on it, added alongside the column for exactly this access pattern:
--     mission_cancellation_business_idx   2026-07-13_o7_cancellation.sql:74
--     mission_amendment_business_idx      2026-07-07_mission_amendment.sql:56
--     mission_release_business_idx        2026-07-19_agreed_release.sql:58
--
-- `mission_info_change` was the one that never got one (2026-07-10_mission_info_change.sql
-- adds the column at :30 but no index). Before rule 1 that column was never filtered
-- on, so it cost nothing. Now it is the filter on every Dispatch schedule render.
--
-- At today's volumes this is genuinely irrelevant — the table holds 2 rows and Postgres
-- will sequential-scan it either way. It matters at the volume § R exists to survive.
--
-- Additive, idempotent, no lock of consequence on a table this size.

create index if not exists mission_info_change_business_idx
  on mission_info_change (business_id);
