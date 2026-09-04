-- 2026-09-04 · the standard VAT rate gets its own home
--
-- Idempotent. Safe to re-run.
--
-- ⚑ WHY. `taxOf("disposal")` in lib/vat.ts read `mission.commission_vat_rate` to
-- find the French standard rate, because that column happens to hold 20 %. It was
-- arithmetically right and structurally wrong: the rate of a *mise à disposition*
-- ride is a fact of French tax law (CGI art. 278), while `commission_vat_rate` is
-- a fact about KAVENUE'S FEE. They are the same number today for two unrelated
-- reasons. The day the fee arrangement changes, the RIDE's tax rate would have
-- silently followed it — a legal rate taking orders from a commercial one.
--
-- ⚑ WHY A COLUMN AND NOT A CONSTANT. A rate must be frozen onto the mission, for
-- the same reason `transport_vat_rate` is (2026-08-17_transport_vat_snapshot):
-- if France changes the standard rate, a trip driven under the old one must keep
-- it. A constant in the code would retroactively re-rate every past trip.
--
-- ⚑ NOTHING READS IT YET. `mission_type` is `transfer` on 377 of 377 live rows,
-- so the disposal branch cannot fire in production. This ships the home before
-- the product that needs it, exactly as the disposal branch itself did.

begin;

-- ────────────────────────────────────── 1 · the generation gains a third rate ──
-- `commission_rate` already names its rates by MEANING: `fee_vat_rate` is the VAT
-- on Kavenue's fee, `transport_vat_rate` what a registered Driver charges on the
-- ride. `standard_vat_rate` is the third: the statutory rate, for a supply that is
-- not passenger transport.
--
-- ⚑ NOT `not null` IN ONE STEP. The table has a live row, so a bare NOT NULL add
-- fails 23502. Nullable → backfill → constrain.
alter table commission_rate add column if not exists standard_vat_rate numeric(6,5);

-- ⚑ AN UPDATE, NOT A NEW GENERATION, AND THE DISTINCTION MATTERS. The table's own
-- comment forbids UPDATEing a live row — "INSERT a new generation" — because that
-- would rewrite the rates already snapshotted onto priced missions. Nothing is
-- rewritten here: this column did not exist, so no mission ever snapshotted it,
-- and there is no history to damage. Inserting a generation instead would assert
-- that rates CHANGED on 2026-09-04, which is false, and would make every "there is
-- exactly one generation" note in the repo wrong.
update commission_rate set standard_vat_rate = 0.20000 where standard_vat_rate is null;

alter table commission_rate alter column standard_vat_rate set not null;

-- ⚑ A SEPARATE CONSTRAINT, because `commission_rate_sane` names its four columns
-- and a check cannot be extended in place. Dropped first so re-running is safe.
alter table commission_rate drop constraint if exists commission_rate_standard_sane;
alter table commission_rate add  constraint commission_rate_standard_sane
  check (standard_vat_rate > 0 and standard_vat_rate < 1);

comment on column commission_rate.standard_vat_rate is
  'The French STANDARD VAT rate in force for this generation (CGI art. 278, 20 % '
  'today). Used for a supply that is not passenger transport — a mise à disposition '
  'by the hour, per CE 13 mai 2025 n°499031 (Sté Chabé). ⚑ It is NOT fee_vat_rate: '
  'that one is the VAT on Kavenue''s commission. Both read 0,20 today, for two '
  'unrelated reasons, and they must be free to diverge.';

-- ─────────────────────────────────────────── 2 · the mission's snapshot ────────
-- docs/06 §9: settlement and history read the snapshot and never join back to the
-- live rates. NULL = created before this column existed.
alter table mission add column if not exists standard_vat_rate numeric(6,5);

comment on column mission.standard_vat_rate is
  'docs/06 §9 snapshot: the French standard VAT rate as it stood when this mission '
  'was created, stamped from commission_rate.standard_vat_rate. Read ONLY by an '
  'at-disposal (hourly) line — a transfer carries transport_vat_rate instead. '
  'NULL = created before 2026-09-04, or by a writer that does not stamp it.';

-- ⚑ NOT WALLED, ON PURPOSE. The five walled columns (base_fare, ceiling, pdp_start,
-- commission_business_rate, commission_driver_rate) are COMMERCIAL positions — what
-- Kavenue makes, what each side is quoted. A statutory tax rate is none of those:
-- it is published law, it is identical for every Business and Driver, and it has to
-- appear on the invoice the Guest is handed. Walling it would hide a number that
-- must be printed.
grant select (standard_vat_rate) on public.mission to authenticated;

-- ⚑ NO `grant update`. Nothing in a browser session may write a tax rate. It is
-- stamped once, server-side, when the mission is created — the same discipline as
-- commission_vat_rate, which is likewise absent from 2026-08-31f's update list.

-- ───────────────────────────────────── 3 · the view, rebuilt authoritatively ───
-- ⚑ READ THIS BEFORE TOUCHING mission_read AGAIN. Until today TWO files carried a
-- complete `drop view / create view public.mission_read`, both marked "safe to
-- re-run", and they were NOT the same view:
--
--   2026-08-30_money_column_walls_1_view.sql : m.hold_expires_at          (plain)
--   2026-08-31h_mission_hold.sql             : case when … end            (masked)
--
-- Re-running the OLDER one un-masks `hold_expires_at`, silently reverting the S72
-- decision that a finished hold must not read as a live one. Two files, one name,
-- opposite behaviour, and nothing said which was authoritative.
--
-- ⚑ THIS FILE IS NOW THE AUTHORITATIVE REBUILD. The body below is 31h's — masked
-- hold included — plus `m.standard_vat_rate`. It was extracted from 31h
-- programmatically rather than retyped, because a 77-column list is exactly the
-- thing a human miscopies. `.local/probe/handoff-check.ts` points here now.
drop view if exists public.mission_read;

create view public.mission_read
with (security_invoker = false, security_barrier = true) as
select
  m.id,
  m.business_id,
  m.dispatcher_id,
  m.driver_id,
  m.status,
  m.mission_type,
  m.group_id,
  m.category,
  m.zone,
  m.pickup_address,
  m.pickup_lat,
  m.pickup_lng,
  m.dropoff_address,
  m.dropoff_lat,
  m.dropoff_lng,
  m.waypoints,
  m.pickup_at,
  m.flight_number,
  m.flight_eta,
  m.passenger_name,
  m.pax_count,
  m.luggage_count,
  m.comment,

  -- ── the Business's own numbers. Hidden from a Driver browsing the Pool ────
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.base_fare end   as base_fare,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.ceiling end     as ceiling,
  case when (select app_role()) = 'driver'
        and m.driver_id is distinct from (select current_driver_id())
       then null else m.pdp_start end   as pdp_start,

  m.pdp_step,
  m.pdp_interval,
  m.speed_win,
  m.cancelled_by,
  m.cancelled_at,
  m.created_at,
  m.accepted_at,
  m.confirmed_at,
  m.required_body_type,
  m.required_make,
  m.required_model,
  m.distance_km,
  m.duration_min,
  m.passenger_names,
  m.required_languages,
  m.dress_code,
  m.driver_flags,
  m.board_name,
  m.board_file_path,
  m.driver_message,
  m.reference,
  m.pickup_label,
  m.dropoff_label,
  m.stops_reached,
  m.luggage_only,
  m.info_edited_at,
  m.cancellation_fee,
  m.cancellation_reason,
  m.pooled_at,
  m.no_show,
  m.no_show_at,
  m.guest_ready_at,
  m.waiting_from,
  m.waiting_to,
  m.waiting_minutes,
  m.waiting_rate,
  m.waiting_fee,
  m.no_show_by,
  m.checked_in_at,
  m.close_answer,
  m.close_answered_at,
  m.rate_card_id,
  m.night_applied,

  -- ── the two commission snapshots, each to its own side only (docs/06 §3) ──
  case when (select app_role()) in ('dispatcher', 'admin')
       then m.commission_business_rate end as commission_business_rate,
  case when (select app_role()) in ('driver', 'admin')
       then m.commission_driver_rate   end as commission_driver_rate,
  m.commission_vat_rate,
  m.transport_vat_rate,
  m.standard_vat_rate,

  m.accepted_fare,
  m.vehicle_id,

  -- ── § 7, the hold. The INSTANT, never the identity ───────────────────────
  -- Another Driver needs one fact: is this trip frozen right now, and until when.
  -- ⚑ WHO holds it is deliberately absent. "Marc is looking at this" is exactly the
  --    Pool behaviour [[d87]] cut, and it would leak a named contractor's activity to
  --    every other Driver in the region.
  -- ⚑ AND A PAST INSTANT READS AS NULL. Nothing runs at T+15 s, so the base column keeps
  --    a stale value until the sweep settles it. Masking it here means no reader can
  --    mistake a finished hold for a live one, even one that forgets to check the clock.
  case when m.hold_expires_at > now() then m.hold_expires_at end as hold_expires_at
from public.mission m
where (select app_role()) = 'admin'
   or m.business_id = (select current_business_id())
   or m.driver_id   = (select current_driver_id())
   or ((select app_role()) = 'driver' and m.status = 'pooled');
revoke all on public.mission_read from public;
grant select on public.mission_read to authenticated;
commit;

-- ⚑ AFTER RUNNING THIS, from the repo root:
--     npx tsx .local/probe/standard-rate.mts        -- expect 14 · 0 failed
--     node --experimental-strip-types .local/probe/handoff-check.ts
