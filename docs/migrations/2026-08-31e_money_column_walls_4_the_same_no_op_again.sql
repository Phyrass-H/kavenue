-- 2026-08-31 — MONEY COLUMN WALLS, part 4: the same no-op, in the other file.
--
-- ⚑ PART 2'S OTHER COLUMN REVOKE WAS ALSO A NO-OP, FOR THE IDENTICAL REASON.
--   `revoke select (driver_rate_ht) on commission_rate from authenticated`
--   returned success and changed nothing, because `authenticated` holds the
--   TABLE-level grant Supabase ships and there was no column-level grant to take
--   away. Part 3 fixed this on `mission`; the probe then showed the rate card
--   still answering:
--
--     after part 3:  business → commission_rate.driver_rate_ht = 0.1   ← still
--
--   The Driver side of the card closed in part 2, but by the ROW policy (a
--   Driver is no longer `dispatcher` or `admin`, so the table returns them
--   nothing at all) — which is why one of the pair went quiet and the other did
--   not. Two mechanisms, one file, and only the policy half worked.
--
-- ⚑ THE GENERALISATION, WHICH IS THE PART WORTH REMEMBERING: on this database a
--   column-level REVOKE is ALWAYS a no-op. Every table in `public` carries a
--   table-wide grant to `authenticated`. Walling a column means revoking the
--   table and granting back the columns you mean — every time, on every table.
--   `docs/migrations/2026-07-19_no_show_airport_label.sql`'s
--   `revoke update (guest_ready_at)` is the same shape and is very likely inert
--   too; it is checked in the same probe run now, not assumed either way.
--
-- The Business's mission form needs business_rate_ht + fee_vat_rate +
-- transport_vat_rate to price a trip. `driver_rate_ht` reaches the mission
-- snapshot through `createMission`, which reads this card with the service role.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.

revoke select on public.commission_rate from authenticated;

grant select (
  id, effective_from, business_rate_ht, fee_vat_rate, transport_vat_rate, note, created_at
) on public.commission_rate to authenticated;

-- sanity — as a DISPATCHER session:
--   select driver_rate_ht from commission_rate limit 1;   → permission denied
--   select business_rate_ht from commission_rate limit 1;  → still returns 0.125
