-- 2026-09-17 (b) — `mission_read` is a READ view. Paste straight after 2026-09-17_mission_client_writes.sql.
--
-- ⚑ FOUND BY THE PROBE, ON THE LIVE DATABASE, MINUTES AFTER PART (a) WAS PASTED. check.sql's one
--   FAIL: `authenticated writes through the mission_read view` → true. Part (a) locked the TABLE;
--   this is the door beside it, and it has been open since the view shipped (2026-08-30).
--
-- ⚑ WHY IT WAS OPEN. `2026-08-30_money_column_walls_1_view.sql` ends with
--   `revoke all on public.mission_read from public;` + `grant select … to authenticated;` — and
--   every rebuild since (31h, 09-04, 09-12a) repeats exactly that pair. PUBLIC is not
--   `authenticated`: Supabase's `alter default privileges … grant all on tables to anon,
--   authenticated, service_role` had already given `authenticated` INSERT, UPDATE, DELETE and
--   TRUNCATE on the view in its own right, and revoking PUBLIC leaves that untouched. Same shape
--   as the no-op revokes of 2026-08-31d/e/f, one object along. ⚑ A VIEW IS A "TABLE" FOR DEFAULT
--   PRIVILEGES: every future view starts writable by every signed-in session unless it is revoked.
--
-- ⚑ WHY IT IS WORSE THAN THE TABLE'S HOLE, AND NOT THEORETICAL — measured on the throw-away
--   Postgres 17 with THIS view's real definition (.local/probe/mission-client-writes/):
--   `mission_read` is a single-table view with no aggregate, so Postgres makes it AUTO-UPDATABLE,
--   and it is deliberately `security_invoker = false` (it must read as its owner, or the money-column
--   walls would blind every screen). So a write through the view is checked as the OWNER:
--   it bypasses part (a)'s column grants AND the `mission` policies entirely. Its own WHERE is the
--   only limit, and that WHERE shows a DRIVER every pooled trip in the country. Before this file,
--   with part (a) already applied:
--     · a Driver's session DELETED another Business's pooled trip — one row, gone, no policy consulted
--     · a Driver's session rewrote the Guest's name and the message on another Business's pooled trip
--     · a Dispatcher put driver_id + accepted_fare on its own draft (columns part (a) had just taken away)
--   And one that did NOT work, measured rather than assumed: an INSERT through the view is refused
--   by itself (0A000). `ceiling` is a CASE expression there — the money wall — so it is not
--   insertable, and `mission.ceiling` is NOT NULL with no default. The price wall happens to block
--   a forged trip. UPDATE and DELETE need no such column, which is why they went through.
--   (Part (a)'s guard trigger still fires on a view write — a trigger is not a privilege — so the
--   posted-trip freeze held. Everything the trigger does not cover went through.)
--
-- THE FIX: the view keeps SELECT and loses the rest. Nothing writes through it — every
-- `from("mission_read")` in the app is a read (checked S82) — so this changes no behaviour.
-- `security_invoker` is NOT touched: the view must go on reading as its owner.
-- `service_role` is left alone: it is the server's own key and writes the table directly.
--
-- ⚑ FOR EVERY FUTURE VIEW: `revoke all … from public` is not enough. Name the roles, as below,
--   and keep check.sql's "views a browser can write through" row at 0.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor, then paste
-- .local/probe/mission-client-writes/check.sql again — every row must read `pass`.

revoke insert, update, delete, truncate on public.mission_read from anon, authenticated;

-- belt and braces: the grant the rebuilds intended, stated in full
revoke all    on public.mission_read from public;
grant  select on public.mission_read to   authenticated;

notify pgrst, 'reload schema';

-- sanity — in the SQL editor:
--   select has_table_privilege('authenticated','public.mission_read','SELECT') as must_be_true,
--          has_table_privilege('authenticated','public.mission_read','UPDATE') as must_be_false,
--          has_table_privilege('authenticated','public.mission_read','DELETE') as must_be_false;
