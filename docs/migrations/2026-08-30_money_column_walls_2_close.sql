-- 2026-08-30 — MONEY COLUMN WALLS, part 2 of 2: shut the doors.
--
-- ⚑ DO NOT RUN THIS UNTIL PART 1 HAS RUN **AND** THE APP HALF IS DEPLOYED.
--   Part 1 (`..._1_view.sql`) is additive and safe on its own. This file
--   revokes columns off `mission`, so from the moment it runs, every
--   `select("*")` on `mission` from a browser session is a 403. The app half
--   moves those reads to `mission_read`; run this after it is live, not before.
--
-- Three doors, all watched open on 2026-08-30 by
-- `.local/probe/column-leak.mts` before this file existed:
--
--   1. business → mission.commission_driver_rate      = 0.1
--   2. driver   → mission.ceiling on a POOLED trip    = 100
--      driver   → mission.commission_business_rate    = 0.125
--   3. business → ledger_transaction.driver_net       = 88
--
-- ── AND A FOURTH, WHICH IS WHY 1 AND 2 ALONE WOULD HAVE BEEN THEATRE ────────
-- ⚑ `p_commission_rate_read` was `to authenticated using (true)`. The LIVE RATE
--   CARD was world-readable, so a Business did not need `commission_driver_rate`
--   at all — `select driver_rate_ht from commission_rate` returned 0,10 to
--   anyone signed in, and `business_rate_ht` returned 0,125 to any Driver.
--   Masking the mission snapshot while the card stayed open would have closed a
--   keyhole beside an open door. Both shut here, together.
--
--   No Driver screen reads `commission_rate` at all — the two readers are the
--   mission form and `createMission`, both Dispatcher-side (grep says so, and
--   the probe asserts it) — so the whole card goes to dispatcher + admin. The
--   Driver's own rate reaches them the way it always did: as the snapshot on
--   the mission, through `mission_read`.
--
-- ── STILL OPEN AFTER THIS FILE, ON PURPOSE — see project/NEXT_SESSION.md ────
-- ⚑ THE SECURITY DEFINER RPCs. `business_cancel_mission`, `respond_to_amendment`,
--   `reclaim_mission` and a dozen more are `returns mission`, and a definer
--   function's composite return is NOT subject to column privileges. A Business
--   that calls one gets the whole row back, `commission_driver_rate` included.
--   Closing that means redefining every money RPC's return type; it is a
--   separate job and it does not belong in the same paste as this one. The
--   probe measures it so it cannot be forgotten.
--
-- Idempotent. Safe to re-run. Run in the Supabase SQL editor.

-- ── 1 + 2 · the mission money columns ───────────────────────────────────────
-- Each of these is now reachable only through `mission_read`, which decides per
-- caller. `authenticated` keeps SELECT on all 70 other columns, so every narrow
-- read that does not name one of these (FARE_COLS, the `mission!inner(business_id)`
-- embed, the id/status probes) is untouched, and INSERT/UPDATE are untouched.
revoke select (base_fare)                on public.mission from authenticated;
revoke select (ceiling)                  on public.mission from authenticated;
revoke select (pdp_start)                on public.mission from authenticated;
revoke select (commission_business_rate) on public.mission from authenticated;
revoke select (commission_driver_rate)   on public.mission from authenticated;

-- ── 3 · the ledger is the DRIVER's settlement record ────────────────────────
-- gross_fare / commission_pct / commission_amount / driver_net are all
-- Driver-side. The Business's three invoice lines (docs/06 §3) are built from
-- `mission` — accepted_fare + commission_business_rate + commission_vat_rate —
-- and never from here, so the Business needs no row at all.
--
-- ⚑ THE CHEAP MOMENT IS NOW. The table is empty and nothing in the codebase
--   writes to it. Once Stripe lands and starts filling it, this same change
--   stops being free.
drop policy if exists p_ledger_read on public.ledger_transaction;
create policy p_ledger_read on public.ledger_transaction for select using (
  exists (select 1 from mission m where m.id = mission_id
          and m.driver_id = (select current_driver_id()))
  or (select app_role()) = 'admin'
);

-- ── 4 · the live rate card ──────────────────────────────────────────────────
drop policy if exists p_commission_rate_read on public.commission_rate;
create policy p_commission_rate_read on public.commission_rate for select
  to authenticated
  using ((select app_role()) in ('dispatcher', 'admin'));

-- ...and within that, the Driver-side rate is not the Dispatcher's business
-- either. The mission form needs business_rate_ht + fee_vat_rate +
-- transport_vat_rate to price a trip; `driver_rate_ht` is snapshot onto the
-- mission by `createMission`, which reads the card with the service role.
revoke select (driver_rate_ht) on public.commission_rate from authenticated;

-- ── 5 · the PRICE card, which is the Ceiling's back door ────────────────────
-- ⚑ WITHOUT THIS, MASKING `ceiling` IS DECORATION. `p_rate_card_read` was also
--   `to authenticated using (true)`, so any Driver could read ceiling_base /
--   ceiling_per_km / night_multiplier and recompute Kavenue's recommended
--   Ceiling for a pooled trip from its own distance — and docs/06 §4 has the
--   Business posting at that recommended number most of the time, so the
--   derived figure IS the stored one on a market-rate trip.
--
-- `mission_price()` and `rate_card_for()` are SECURITY INVOKER (no `security
-- definer` in 2026-08-16_rate_card.sql — checked, not assumed), so they read
-- `rate_card` with the caller's own privileges and this one policy shuts the
-- table and both functions together. Every reader in the app is Dispatcher-side:
-- the mission form, the amend form, and createMission.
drop policy if exists p_rate_card_read on public.rate_card;
create policy p_rate_card_read on public.rate_card for select
  to authenticated
  using ((select app_role()) in ('dispatcher', 'admin'));

-- sanity, after running — as a DISPATCHER session, both must ERROR:
--   select ceiling from mission limit 1;
--   select driver_rate_ht from commission_rate limit 1;
-- ...and this must still work:
--   select ceiling, commission_business_rate from mission_read limit 1;
