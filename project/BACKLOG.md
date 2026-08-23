# Kavenue — Backlog (what's built, what's next)

> Single planning list for upcoming sessions. Tags map to the spec (Doc 02):
> ✅ done · 🔨 KEEP (build for V1) · 👤 MANUAL (a human does it in beta) ·
> ⚙️ infra/ops · 🅥 V2 (CUT in the spec — don't build unless re-prioritised) ·
> ❓ needs a founder/legal decision.
>
> Most KEEP items need NO schema change — the tables already exist in
> `docs/kavenue_schema.sql` (document, payment, ledger_transaction, payout,
> booking_voucher, status_event). Build against them.

---

## ✅ Already built & live (Vercel, `main`)
- Email-magic-link plumbing + key-gated dev sign-in (solo testing).
- Driver: Pool (zone/category filter) → mission detail → Accept (atomic RPC) →
  My Rides → 4 status buttons (en route→arrived→on board→completed).
- Business (Dispatch): post mission → booking-style **Schedule** (day-grouped,
  Today pinned, colour-coded, expandable rows) + month **Calendar**; live status.
- Contacts unlock on accept (both sides). PDP fare computed on read.

---

## A. Accounts, profiles & settings
- 🔨 Driver profile: photo, languages (zones/category/name already done) + **edit**.
- 🔨 Driver **vehicle** details: make / model / colour / plate / seats (category done).
- 🔨 Driver **documents upload** → `document` table + Supabase Storage:
  licence, VTC card, REVTC, insurance, RC Pro, vehicle registration. 👤 verify.
- 🔨 Driver **bank details / Stripe Connect** onboarding (for payouts).
- 👤 Driver video-interview validation (flag `driver.verified`).
- 🔨 Business profile: logo (name/field done) + **edit**; Dispatcher contact edit.
- 🔨 Business **documents upload**: company registration. 👤 verify.
- 🔨 Business **card/bank** (Stripe customer) details.
- 🔨 **Account settings** page both sides (edit profile, sign-out, GPS pref, etc.).
- 🔨 **Real email sign-in** for actual users (turn off dev-login; needs the one
  Supabase redirect-URL setting). Required before inviting real drivers/hotels.

## B. Mission lifecycle (gaps)
- 🔨 **Mission edit** (limited per Doc 02: free while pooled; material edits after
  accept need driver re-consent or cancel+repost).
- 🔨 **Cancel mission (O7)** — RULESET DECIDED 2026-07-13 ([[d45]]): driver voluntary cancel = always 100% (re-pools);
  business cancel = free >5h then 50%@−5h +10%/h→100%; no-show (status `arrived`, 1h airport/20min city) = driver paid
  full, business charged; T-60 reclaim (driver unconfirmed+unreachable) → re-pool as SPEED WIN. 👤 euro amounts MANUAL.
  Copilote hand-over = Phase 2 (below). See § N.
- ⚙️ **Scheduled jobs** (Supabase cron / Vercel cron): Lock-in auto-confirm +
  T-180 reminder, expiry of unfilled missions, return-to-pool on no-confirm.
- 🔨 **Maps/geocoding** (Mapbox): autocomplete + lat/lng ✅ (D17); **road ETA** ✅ (S12/D23); stops are now
  **geocoded** and the ETA is **routed through them** ✅ (S13); **France-biased** suggestions (country
  allowlist, pickup-proximity) ✅ (S13). Still to do: feed the ETA into a better **recommended base fare**
  (manual estimate today); use `duration_min` to replace the crude ±90-min `accept_mission` slot-conflict buffer.
- 🔨 Intelligent **flight tracking** API (paid) → auto-shift pickup on delay.
- 🔨 Native **welcome banner** (branded greeting) for the Driver app.

## C. History (both sides)
- 🔨 **Mission history**: month → list → detail, for Driver and Business
  (Dispatch shows current/active only today; no archived history view yet).

## D. Money (Stripe Connect)
- 🔨 **Card payment per mission** + auto **commission split** (Stripe Connect).
- 🔨 **Ledger transaction** written at completion (table ready; trigger/flow TODO).
- 🔨 **Booking voucher** (justificatif, 7 legal fields, arrêté 6 Aug 2025) per trip.
- ❓ **Invoice** to Business (2 lines: transport + service fee + 20% VAT) — KEEP but
  invoicing **direction** is pending the agent/principal + self-billing decision (Doc 01/03).
- 👤 **Driver payouts** weekly (manual batch in beta; automate via Connect later).
- 🅥 Auto invoice / quote / PO for drivers · wallet · periodic billing · SLA ·
  financial dashboard.

## E. Notifications & support
- 🔨 **Email notifications** (Resend): acceptance, T-180/Lock-in, status, reminders.
- 🔨 **Push notifications** (web push, PWA): same triggers.
- 🔨 Email support + static **FAQ** page.

## F. Analytics & reporting  ❓ (mostly V2 in the spec — confirm priority)
- 🅥 **Business-facing analytics**: by category / period / zone, profitability,
  CSV export, year-over-year. (Doc 02 marks reporting/analytics CUT for V1.)
- ⚙️ **Kavenue internal / investor metrics**: signups, missions posted vs accepted
  vs completed, **fill rate**, time-to-accept, GMV, commission earned, liquidity
  by zone/category, cancellation rate. (Admin dashboard; great for the raise.)
- ⚙️ **Dev observability**: error monitoring (e.g. Sentry), structured logs, uptime.
- 🔨/⚙️ **Admin role + dashboard** (`admin` role exists in schema): verify drivers,
  oversee missions, run payouts.

**Dispatch-side EARNINGS / spend (founder, 2026-07-31) 🔨** — the founder wants the money view on the Business side too:
what a hotel has spent over a period, per trip, and presumably by month for their own accounting. The Driver's Earnings
screen ([[d59]]) is the model to follow — same period filter (Day/Week/Month/Year), no charts, comparison against the
previous period — and `settledFare()` already gives the correct frozen fare, so the maths is solved. **Open:** does it
include cancellation fees and waiting charges (it should — a hotel's real cost), and does it need an export for their
accountant? ⚠️ Keep the **agent/intermediary** framing in the copy: Kavenue is not the seller of the transport.

## F2. Internal tooling & observability stack  ⚙️/🔨 (Kavenue back-office — future pillar)
> Founder request (2026-06-17): the Kavenue-internal layer for **dev / marketing /
> dispute-support** — so when a user calls about a bug we can see what happened, and
> marketing can follow usage. It's NOT one dashboard: it's a stack of distinct tools per
> audience. Consolidates the analytics/observability pieces above into one named pillar.
> Each piece is mostly copy-paste SDK + free tiers; the admin dashboard is the real build.
- ⚙️ **Product analytics** (marketing): clickstream + named events (`mission_posted`,
  `mission_accepted`, `signup_completed`) → funnels + retention. PostHog (recommended;
  bundles session replay + funnels + flags) or Mixpanel/Amplitude/GA4.
- ⚙️ **Error monitoring** (devs): Sentry SDK (browser + server) → stack trace, user, URL,
  breadcrumbs; on top of the free Vercel + Supabase logs. Search by user/time when a bug is
  reported. (~½ day to wire.)
- ⚙️ **Session replay** (support + dev): privacy-masked reconstruction of a real session to
  see what the user actually did. PostHog built-in, or Microsoft Clarity (free) / LogRocket.
- 🔨 **Admin dashboard / back-office** (dispute-support): in-app `/admin` gated to `role=admin`
  (RLS already grants admin read on every table). Search a Driver/Business/mission; view its
  **audit timeline** (built on the existing `status_event`), statuses, payments, documents,
  contacts. Highest-value piece — wanted before real users go live.
- 🔨 **Account verification workspace** (onboarding approval — **founder priority, 2026-06-17**):
  a dedicated **enrollment queue** in `/admin` listing every new **Driver** and **Business**
  awaiting validation. Per applicant: their profile/company details + **all uploaded documents**
  (Driver: licence, VTC card, REVTC, insurance, RC Pro, carte grise · Business: Kbis) shown inline
  via signed-URL preview, with **approve / reject** controls that set each `document.status`
  (pending → verified/rejected) and flip **`driver.verified`** true once the file is complete. This
  is the dedicated interface Kavenue staff use to **manually validate every new user in beta** (👤).
  Pairs with the 👤 verify + video-interview items in section A. Needs an admin **write** path
  (service role) — browser RLS is read-only for admins today. The upload side already exists
  (Session 7: documents land in the `documents` bucket as `pending`); this is the review/confirm side.
  - **Founder confirmed 2026-07-28: this back-office is wanted, and its scope is papers + disputes +
    "other things"** — i.e. the two 🔨 items above are one product, not two. Call it the **back-office**
    (`/admin`); "support console" works too. Not scheduled yet.
  - **S48 made the Driver side concrete — the reviewer's contract is now fixed** ([[d58]]): per document
    the back-office writes `status` (pending → verified/rejected), **`review_note`** (the Driver reads it
    verbatim: *"the bottom edge is cut off"*), and may correct **`expires_at`** (the Driver types it off
    the paper, so it's the field most likely to be wrong). Two-sided papers are **one row per `side`**
    (front/back) — approve them independently. The Driver-facing states already render all of this, so the
    back-office is genuinely just the write path. **Doc list to review** (9): licence · VTC card · REVTC ·
    medical certificate · Kbis · **URSSAF attestation de vigilance** (re-collect every 6 months — the one
    with a legal deadline on Kavenue) · RC Pro · carte grise · insurance.
  - **The expiry-reminder job belongs here too**, not in the Driver app: the account copy already promises
    "a month before, and again the week it lapses", which needs a scheduled query over `document.expires_at`
    + the notifications phase. Until it exists, a Driver only learns on opening the app.
- 📊 Doubles as **investor metrics** (fill rate, time-to-accept, GMV, commission) — see the
  ⚙️ "Kavenue internal / investor metrics" line in F.
- ⚠️ **GDPR dependency**: analytics + session replay capture PII → require PII masking,
  cookie consent, and listing Sentry/PostHog as processors in the privacy policy. Do together
  with **G › GDPR**. Don't enable for real users before that.

## G. Trust, legal, compliance
- 🔨 **GDPR**: privacy policy, consent capture, data-deletion path.
- 🔨 PII/financial **encryption** (use providers' built-in).
- 👤 DGITM declaration · Kavenue RC Pro insurance · verify each driver is registered VTC.

## H. Platform / production readiness
- ✅ **Custom domain**: `pickupbedriven.com` (OVH) live on Vercel with role subdomains
  **`driver.*`** (Driver app) + **`dispatch.*`** (Dispatch). See SESSION_LOG S9 / DECISIONS D18.
  - ↳ **Now unblocked — URL-restrict the Mapbox token:** the Default public token can't be
    restricted (no wildcards), so create a new token scoped to `driver.pickupbedriven.com` +
    `dispatch.pickupbedriven.com` + `localhost:3000`, then swap `NEXT_PUBLIC_MAPBOX_TOKEN` in
    Vercel + `.env.local` and redeploy. Until then the unrestricted token is in use (fine for beta).
  - ↳ **Bare root** `pickupbedriven.com` still points to OVH parking — decide its destination
    (redirect to a side, a "Driver / Business" splash, or a marketing landing).
  - ↳ **Supabase redirect URLs** — add `driver.*` + `dispatch.*` `/auth/callback` before real email.
- 🔨 **PWA polish**: icons, install prompt, offline shell — **per-role manifest** so each subdomain
  installs as its own app (Kavenue Driver / Kavenue Dispatch).
- 🔨 **Design/skin** pass. ✅ **Dispatch** (S10 / D20: tokens + Geist + Lucide + sidebar + schedule +
  calendar). ✅ **Route card** (S13: stop autocomplete + live ETA + "Add a stop" button + red stop marker).
  ✅ **App-wide navy + new-mission two-pane** (S14 / D24: navy `#25344C` at the token layer; `/dispatch/new` =
  section cards + sticky live Summary rail; status "info" → steel). The design loop is now **D25** (Claude
  Code inline HTML mockups). ↳ **Driver app layout next** — design it (D25 mockup or a Claude Design phone
  mockup), then apply. Navy polish (small): Driver "Complete ride" → green; re-export the logo to harmonise
  its sky-blue with navy.
- 🅥 Security audit / pen test (plan post-V1).

## H2. Engineering hardening (quality — before real production) ⚙️
> Flagged 2026-06-19. The foundations are clean (modern stack, lib/ domain separation, RLS-first
> security, strong docs), but this is still an MVP/beta codebase. These are the standard MVP→production
> steps a takeover dev team would expect. Founder intent: do them all eventually; not blocking beta.
- ✅ **Automated tests — SHIPPED S55/S56 (2026-08-08/09).** `npm test` = **261 vitest tests in ~0.5 s** over the
  money functions (`settledFare` · `rowCost` · `spendTotals` · `businessCancelPct` · `cancelFeeAmount` ·
  `currentSpan`/`comparisonSpan`) plus three cross-file invariants. Every money bug that ever shipped is pinned
  as a test. **Still uncovered, deliberately:** React components, server actions and RLS (need a DB + a browser);
  `missionTone`, `accept_mission` first-wins and geo radius matching are *not* yet tested and remain on this list.
- ✅ **SQL ↔ `lib/` parity — PROVEN for the waiting + cancel rules (S56, 2026-08-09).** The fee rules exist twice
  (in `lib/` and inside the RPCs) and nobody had ever proved they agree. Two probes now do, both kept in
  `.local/probe/` (git-ignored, re-runnable):
  - `diff-sql-vs-lib.ts` — **read-only.** `mission_is_airport()` and `mission_waiting()` are `immutable`, so
    PostgREST will *execute* them with no writes. 649 checks (NFC/NFD accents, both Paris DST nights, every
    boundary offset, all 34 real missions) → **0 mismatches**.
  - `write-test.ts` — drives tagged throwaway missions through the real Business-side RPCs with a real
    authenticated session, compares every stamped number, then deletes by recorded id. 170 checks → **0
    disagreements**. ⚠️ Run it after ANY change to the cancel/no-show RPCs or their mirrors.
  - ⚑ **The read-only plan in S55 had no input data:** excluding the seeded fleet there are **zero** cancelled or
    no-show missions and `mission_cancellation` / `mission_release` are both **empty** — every cancellation ever
    exercised was removed when the DB was restored to baseline. Recomputing historical fees is not an option;
    the write test is the only way.
- ⚙️ **CI on PRs** — GitHub Actions running `tsc` + lint + tests (+ build) on every PR. None today. **Now the top
  remaining § H2 item**: the suite exists and Claude sessions push straight to `main`, so nothing runs it but memory.
- ⚙️ **Generated DB types** — replace hand-written `lib/database.types.ts` with `supabase gen types`
  once the CLI is wired (D3); removes drift risk.
- 🔨 **Real email auth** — flip on magic-link, remove the dev-login scaffold (see A · needs the Supabase
  redirect-URL settings for `driver.*`/`dispatch.*`).
- ⚙️ **Error monitoring + product analytics** — Sentry + PostHog (also in F2).
- ⚙️ **Realtime** — swap `LiveRefresh` polling for Supabase Realtime websockets (also in I).
- 🅥 Security audit / pen test (also in H) — plan post-V1.
- **O7 review flags (2026-07-13, from the pre-deploy adversarial review — [[d45]]; before real Business users / payments):**
  - 🔒 **`p_mission_business_update` has no WITH CHECK** → a Business can bypass the O7 fee/reclaim gates with a direct
    PostgREST UPDATE on its own mission (set `status='cancelled'` skipping the fee, or unpool a *confirmed* trip). Fix with
    column-level grants (`REVOKE UPDATE … ; GRANT UPDATE (info cols) …`) once the legit business-write paths
    (updateMissionInfo, PhoneShareToggle, drafts) are audited. **HIGH for prod**; ~nil in beta (key-gated, no payments).
  - ✅ **Fee BASIS: `currentFare` never freezes at `accepted_at` — RESOLVED 2026-07-28 ([[d59]]).** Founder ruling:
    *"the final fare, whatever it is on the Business side or on the Driver side, is the price that the Driver accepted."*
    New `settledFare()` in `lib/pdp.ts` freezes the climb at `accepted_at`; applied to every display AND to the fee
    snapshots (`p_fare_snapshot` on driver cancel / no-show / business cancel / business no-show, and the amendment
    from-fare). Verified live both ways: a driver cancel on a €70-accepted / €100-ceiling trip recorded **€70** (was
    €100), and a business cancel at 83% recorded **58,17 € off a €70 basis** (would have been €83). ⚠️ The bug the live
    test caught: `settledFare` was optional-typed and the actions' narrow `FARE_COLS` select omitted `accepted_at`, so it
    silently fell back to the live fare — the column is now selected and the parameter is **required**, so a missing
    column is a compile error rather than a money bug.
  - 💶 **Penalty RULES need a rethink — founder, 2026-07-28. Not urgent, but before real money moves.** With the fee now
    correctly based on the accepted fare, **100% may be too weak a deterrent on cheap trips**: a €50 job costs €50 to
    walk away from, so a Driver offered something better is tempted to cancel and pay. The founder's words: *"100% is not
    enough … we need to fix rules later."* Sketch of the space (nothing decided): a **floor** under the penalty (max of
    100% and a fixed €X), a **multiplier** that scales as pickup nears, or a non-monetary cost (reliability marks that a
    Driver can actually see — itself an open founder conversation). Pairs with the reliability-marks discussion and with
    the postpone-then-cancel laundering note below.
  - ✅ **FIXED 2026-08-09 (S57b) — `docs/migrations/2026-08-11_fee_basis_band.sql`, applied by the founder and verified live (an omitted basis at T−1h now records 120,00 € → 108,00 € where it recorded 0,00 €; honest calls unchanged across write-test's 170).** The basis is
    CLAMPED into `[least(pdp_start ?? ceiling/2, ceiling), ceiling]` rather than recomputed — porting the PDP
    into SQL would make Postgres a second authority on the fare, against `lib/pdp.ts`'s own header. Provable
    no-op on every honest call; pinned by `tests/money-invariants.test.ts` § 4. ⚑ **A floor, not a fence** —
    understatement down to `pdp_start` (up to 50%) still succeeds. ⚑ **`mark_no_show` and
    `business_declare_no_show` keep the identical SQL hole**; all four signatures now REQUIRE the basis in
    TypeScript, which closes the app-side path only. ⚑ One honest-path change: an amendment committing between
    the modal's read and the RPC's lock now records MORE than the modal quoted. *Original finding:* confirmed
    2026-08-09 by the drift audit. The parameter is `numeric default null` and the write is
    `round(coalesce(p_fare_snapshot, 0) * v_pct / 100, 2)`, so calling
    `supabase.rpc('business_cancel_mission', { p_mission_id })` from the browser with the Dispatcher's own JWT —
    **no tampering, just leaving the argument out** — stores `fee_amount = 0.00` and `fare_snapshot = NULL` on a
    trip that owed the full fare. `driver_cancel_mission` has the identical shape, so a Driver can zero their own
    100% penalty. There is **no fare function in SQL at all** to recompute against (grep finds none; the PDP is
    TypeScript-only and `2026-07-13_o7_cancellation.sql:68` documents the snapshot as "(server-passed)" by design),
    so the fix is either a SQL pricing engine or a `not null` + sanity clamp against the mission's own
    `ceiling`/`pdp_*`. Beta-mitigated (MANUAL money, no payments) — but this is the one to fix first when money moves.
  - 👁 **Mid-run Business cancel visibility** → `MINE_STATUSES` excludes 'cancelled', so a trip cancelled while the Driver
    is en_route/arrived silently vanishes from My Rides. Surface a "trip was pulled" state — pairs with notifications.
- **No-show clock flags (2026-07-19, from the D47 fix — deferred by the founder):**
  - ✅ **RESOLVED by [[d48]] (2026-07-22) — the two entries below are SUPERSEDED, kept for the reasoning trail.** The
    founder cut the knot: **a booked trip's pickup time never moves.** Late Guests are handled by **waiting fees**
    (€1/min after the free wait, cap 60 min city / 120 min airport) and a genuine time change is a **cancel + rebook as a
    new trip**. So pickup time never becomes amendable, the postpone-then-cancel dodge cannot exist, and `pickup_at` gets
    a **blanket freeze after draft** — no status-aware rule, no amendment dependency. Research owed on the €1/min rate.
  - ~~❓ **BLOCKER on amendable time — "postpone then cancel" laundering (founder, 2026-07-22). DECIDE BEFORE BUILDING.**~~
    `business_cancel_mission` prices the fee from the **current** `pickup_at` (`v_hours := extract(epoch from
    (pickup_at - now()))/3600`). So the moment pickup time becomes amendable, a Business can dodge the fee **inside the
    app, with no technical skill**: at −30 min (100% = €180) propose "move to Friday" → the Driver accepts (rational — he
    keeps the job) → `pickup_at` is now 72h out → cancel → **€0**. The Driver consented to a DATE CHANGE, not to waiving
    his fee, but his tap is what unlocked it. Today this is closed only because time is not amendable
    (`2026-07-07_mission_amendment.sql:29` — "pickup_at (time) is NOT amended in v1"), so **building amendable time
    OPENS it**. Needs a founder POLICY decision, not just code — sketch: price a cancel that follows a POSTPONEMENT
    against the **pre-amendment** time (i.e. the fee clock never gets reset later by an amendment), with the founder
    deciding the edges: does it apply indefinitely or only for a window after the amendment? does a genuine
    later-cancellation of a long-postponed trip eventually price normally? Same family as the § H2 "fee basis doesn't
    freeze at `accepted_at`" flag — decide them together.
  - ~~⚠️ **ORDER MATTERS: add pickup-time amendments BEFORE freezing `pickup_at`.**~~ *(superseded by [[d48]] — time is
    never amendable, so the freeze has no dependency.)* The amendment table
    (`2026-07-07_mission_amendment.sql`) has `new_pickup_address` / `new_waypoints` / `new_fare` but **no
    `new_pickup_at`** — the amend screen only *displays* the time. So freezing `pickup_at` first would close the fee
    loophole AND remove the legitimate "the flight's delayed, can we push to 18:00?" path, with no route left for a real
    time change. Build (1) pickup time as an amendable field — `new_pickup_at` column + the field on `/dispatch/[id]/amend`
    + the before→after on the Driver's accept/decline card + apply it in `respond_to_amendment` — then (2) the freeze
    trigger. Worth doing on its own merits: "can we move it later?" is likely the commonest real Business request.
  - 🔒 **`pickup_at` is Business-writable and feeds two money gates** → `mark_no_show` measures the free wait from
    `coalesce(guest_ready_at, pickup_at)` and `business_cancel_mission` derives its fee tier from `pickup_at`, yet a
    Business can UPDATE it via raw PostgREST (so a late cancel can be re-tiered to 0%). Same root cause as the
    `p_mission_business_update` WITH CHECK flag above — fix **together** in the column-grant audit
    (`REVOKE UPDATE ON mission FROM authenticated` + `GRANT UPDATE (…legit cols…)`). `pickup_at` needs a **status-aware**
    rule, not a blanket block, because draft-resume legitimately rewrites it (`dispatch/new/actions.ts`).
    ✅ **`guest_ready_at` is DONE** — trigger `trg_mission_guard_guest_ready_at`
    (`2026-07-22_guest_ready_at_guard_fix.sql`), verified live (Business → 403, service role → 204). **Two Postgres
    gotchas worth remembering** when doing the audit: a column-level `REVOKE` is a **no-op** while the role holds
    table-level UPDATE (column privileges are only consulted when the table grant is absent), and a **`SECURITY DEFINER`
    trigger sees the function OWNER in `current_user`**, never the caller.
  - 💶 **`hours_before_pickup` is NEGATIVE on no-show rows** (e.g. `-0.5` = reported 30 min after pickup) — the opposite
    sign convention from the other four cancellation kinds, which count *down* to pickup. Arguably the honest value; decide
    the convention (signed / `abs()` / a separate column) before money is automated.
  - ⏱ **`advanceStatus` has no time guard** → a Driver can still mark themselves `en_route`/`arrived` arbitrarily early
    (sequencing is checked, timing is not). Since D47 this can no longer produce a no-show, so it is now a **data-quality**
    issue (the Business sees a bogus "arrived" a day out), not a money one. Needs a founder call on how early is too early.
  - 🕐 **Countdown uses the device clock** → `cancel-noshow.tsx` compares against `Date.now()` while the gate runs on
    Postgres `now()`. Fails safe and self-heals (the RPC re-checks and its message is surfaced), but device skew can show a
    button state the server disagrees with. Pass a server `now` from the RSC if it ever matters.

- 💶 **The tread is never re-checked between the click and the RPC — a boundary cancel can settle 5 points dearer
  than the button promised.** (Adversarial review of the step, 2026-08-09.) `businessCancelMission(missionId,
  reason)` carries no expected pct or amount, and `business_cancel_mission` recomputes `v_hours` from server
  `now()` at execution. Inside a tread that is harmless — it is the whole point of the step. **At the edge it is
  not:** client-clock skew plus network latency can carry execution across the boundary, so a modal reading
  "50% · 240,00 €" charges 264,00 € on a €480 trip, with no error and no notice. The step did not create the
  hazard, it **converted it from a sub-euro slope drift into a discrete 5-point jump**. Fix = pass the quoted pct
  and have the RPC either honour it for a short grace window or reject with "the price changed, look again" —
  a founder policy call (honour vs reject), not just code. Beta-mitigated: nothing is charged.
- **SQL ↔ TypeScript drift audit (2026-08-09, S56) — 17 confirmed, 8 refuted. 9 now closed; 2 written and
  awaiting the founder; 6 left.** S57 took the six that needed no founder ruling — four shipped in TypeScript
  (`06aae27`), two as migrations the founder applied the same day; a new re-runnable probe
  `.local/probe/migrations-2026-08-10.ts` proves both (68 checks). **Still open and needing a decision or a bigger job:** the pending
  amendment-vs-release supersede gap · `accept_mission` enforcing none of the Pool's matching rules (blocked on
  its own founder question — a TS-only check does not bind a direct RPC caller, and dev/prod share one Supabase
  project, so the honest options are a SQL backstop or an additive `driver.demo_bypass` column) · `p_fare_snapshot`
  being omittable · mid-run cancel visibility · and three cosmetics (the folded waiting label on a cancelled
  archive line, `respond_to_release`'s dead decline reason, the wrong driver-cancel comments). **Parked as its own
  item, found by the S57 plan check:** `p_amendment_business_update` is USING-only, so a Business can mutate
  `new_fare` on a proposal the Driver has already read — an RLS decision, unrelated to the lock order. Also noted:
  `rides/actions.ts:42-46` will still pass any raw Postgres message under 120 chars to the Driver once the
  deadlock source is gone. 30 agents: five finders by rule
  area, then an adversarial refutation pass on every claim. The refuted eight are listed at the bottom so nobody
  re-files them. Nothing here is a regression from the 30-minute step; these are pre-existing.
  **Money:**
  - ✅ **FIXED 2026-08-09 (S56, [[d71]]; migration `2026-08-09_waiting_settles_on_board` applied; deployed
    `7a37ee5`).** New RPC `board_guest` settles the meter at `arrived → on_board`, off the same
    `mission_waiting()` / `now()` as the three failure doors. Founder's ruling: waiting is owed whenever it
    happened. Verified live 51/51; double settlement proved impossible (all three other doors refuse a boarded
    trip). *Original finding, kept for the trail:* **A trip that ACTUALLY happens settles no waiting at all.**
    Guest is 45 min late at an airport; both apps run a meter showing "45 min · 45,00 €"; the Guest then turns up,
    the trip runs, and **nothing is written**. Only the three failure doors (`mark_no_show`,
    `business_declare_no_show`, `business_cancel_mission`) ever write `waiting_fee` — `advanceStatus`
    (`app/(app)/rides/actions.ts:101`) writes only `status`, and **no TypeScript path writes `waiting_fee`
    anywhere** (verified by grep). So a Driver is financially better off declaring a no-show than driving a late
    Guest, which inverts the incentive D48 exists to create. **The biggest hole in the waiting model.**
  - ✅ **FIXED 2026-08-09 (S56, deployed `1de76fe`)** — the headline is the TOTAL when a meter is running, the
    split sits beneath it, the button names it, and "Free to cancel" now means free of everything (an early
    landing can start the meter while the percentage is still 0). *Original finding:* **The cancel modal quotes
    `fare × %` but the RPC also bills accrued waiting.** `components/dispatch-cancel.tsx`
    computes the fee from the fare alone, while `business_cancel_mission` settles `waiting_fee` too when the trip is
    `arrived`. Confirmed in the S56 write test: case C0 showed **47,99 €** and the DB charged **47,99 € + 17,00 €
    waiting = 64,99 €**. The button literally reads "Cancel — accept 47,99 €". *(This is the finding that made the
    0,41 € clock drift look small — fix the total before anything else in the modal.)*
  - ✅ **FIXED 2026-08-09 (S56, deployed `3857de0`)** — the archive and the run card go through `missionAmount`
    and NAME the waiting (`incl. 40,00 € waiting`). *Original finding:* **A no-show's waiting fee is invisible on
    the Driver's side but billed to the Business.**
    `app/(app)/rides/history/page.tsx:157` — the archive line and the trip card show the fare, never the settled
    `waiting_fee`, so a Driver paid for 30 minutes of waiting cannot see that they were.
  - ✅ **FIXED 2026-08-09 (S57b) — `docs/migrations/2026-08-11_one_live_ask.sql`, applied and verified live in both directions, plus the money case: a 400 € pending amendment is retired and the trip re-pools off its original 200 € ceiling.** ONE LIVE ASK
    per mission, enforced at PROPOSE time on both sides: `propose_release` supersedes a pending amendment, and
    a `before insert` trigger on `mission_amendment` supersedes a pending release (it must be SQL — that side
    is a client INSERT, and `mission_release` has no client write policy). Also closes two-pending-amendments,
    which was TypeScript-only and broke a `.maybeSingle()`. ⚑ Founder ruling APPLIED, reversible: the newest
    ask replaces the older. Cost: the amend form doesn't prefill from a retired proposal, so a declined
    release means retyping the change — now stated in the release modal BEFORE the tap. *Original finding:*
    accepting the amendment first permanently raises the ceiling on a trip the Business is giving away free.
  - ✅ **FIXED 2026-08-09 (S57b) — `docs/migrations/2026-08-11_accept_mission_eligibility.sql`, applied and verified live (match accepts; wrong tier / wrong body / un-opted luggage all refused; the same luggage run accepts once opted in).**
    Three enum comparisons (category · required body · luggage consent) inside the RPC under the existing row
    lock. Radius and `required_make` stay out, deliberately a strict superset of the Pool filter so drift can
    only hide a trip, never refuse one. ⚑ **Honest limit:** it checks the DECLARED car — `/settings/vehicle`
    re-declares make/body/luggage through the service role with no `verified` gate — so the lie becomes public
    and persistent rather than impossible. ⚑ `?all=1` becomes LISTING-only; three rendered strings corrected.
    A `driver.pool_bypass_until` column was designed then dropped (the demo is already served by
    `/settings/vehicle` and the six seeded per-tier Drivers). **OPTIONAL companion, NOT written as a migration
    — needs a founder ruling:** revoke browser-role writes on `driver`/`vehicle`. It buys only the two states
    the app can't produce (category disagreeing with make/model; luggage opt-in on a sedan) and costs a
    standing rule that any future client-side write 403s. *Original finding:* the whole vehicle/zone/luggage
    match was TypeScript-only in `app/(app)/pool/page.tsx`; a sedan Driver could accept a luggage-only Van run.
  **Behaviour:**
  - ✅ **FIXED 2026-08-09 (S57) — `docs/migrations/2026-08-10_repool_clears_check_in.sql`, applied by the founder and verified live (all three re-pool paths, both sides of the 24h window, plus the SPEED-WIN pricing itself).** *Finding:*
    no re-pool path clears `checked_in_at` (driver cancel · reclaim · agreed release), so Driver B inherits Driver
    A's check-in, the Business is shown "Checked in" for a trip nobody confirmed, **and the red "Not checked in"
    wash is suppressed** because that branch returns first. Driver B also never sees the button and never appears
    in the My Rides badge. The migration is a mechanically-extracted **6-of-210-line diff** of the three re-pooling
    RPCs + a scoped one-shot repair (0 rows to repair as of 2026-08-09). ⚑ The optional `hasCheckedIn()` TS guard
    from the fix plan was **dropped on the plan check's advice** — it would have left the Business's row
    permanently red with nothing able to clear it.
  - ✅ **FIXED 2026-08-09 (S57) — `docs/migrations/2026-08-10_amendment_lock_order.sql`, applied by the founder and verified live (accept · decline · wrong Driver · running trip · double answer · unknown id).** *Finding:*
    `respond_to_amendment` locks amendment→mission, inverting the order every other RPC uses
    (`2026-07-07_mission_amendment.sql:112`) — an AB-BA deadlock the Driver would read verbatim as "deadlock
    detected". ⚑ Carries a correction the plan lacked: the unlocked `mission_id` read is guarded by a **post-lock
    assert**, because `p_amendment_business_update` is USING-only and the Business *can* PATCH `mission_id`.
  - ✅ **FIXED 2026-08-09 (S57, deployed `06aae27`)** — both pending cards now swap their framing outside
    accepted/confirmed ("The trip has moved on…" + **Dismiss**) instead of promising an answer the RPC refuses.
    ⚑ Deliberately NOT hidden, which was the plan's fix: hiding strands the `proposed` row with no way to clear
    it, and a stranded row masks the older `accepted` one (`dispatch/page.tsx:186-191` keeps only the latest
    non-superseded per mission). *Original finding:* the Business's "Change pending" card rendered on trips where
    `respond_to_amendment` will refuse (`components/trip-row.tsx:517`); the release card was status-gated.
  - ✅ **FIXED 2026-08-09 (S57, deployed `06aae27`)** — `advanceStatus` now supersedes both, mirroring the SQL
    (`status='superseded', responded_at=now()`) through the service role. *Original finding:* every SQL terminal
    path clears pending negotiation rows; the TypeScript completion path cleared neither, so a normally-completed
    trip could leave a permanently `proposed` amendment/release.
  - ✅ **FIXED 2026-08-09 (S57, deployed `06aae27`)** — one `canEditInfo()` in `lib/dispatch-status.ts` for the
    page and the schedule row, plus `.or('status.neq.pooled,pickup_at.gt.<iso>')` on the action's atomic UPDATE
    (a blanket `pickup_at` floor would be **wrong** — a `confirmed` trip past pickup is exactly when a phone
    number gets fixed). Cross-checked against the filter over all 271 live missions, 0 disagreements. *Original
    finding:* the Business edit gate read the raw `status` column instead of the § P expiry boundary
    (`dispatch/[id]/edit/page.tsx:64`), so a past-due trip stayed editable until some other page swept.
  **Cosmetic / stale:**
  - ✅ **FIXED 2026-08-09 (S57, deployed `06aae27`) — stale in THREE places, not two.** `kind` → new
    `CancellationKind` incl. `'business_no_show'`; `StatusEventStatus` widened to all 8 **and split** into a new
    `MissionStep = Extract<…>` (widening alone does not compile — `lib/mission-flow.ts:13`/:21 declare
    `Record<StatusEventStatus, string>` with four keys, and `advanceStatus` must keep refusing `"cancelled"` at
    compile time); and `mission_cancellation` was missing `waiting_minutes` / `waiting_rate` / `waiting_fee`
    entirely, which all three cancel RPCs write.
  - ✅ **FIXED 2026-08-09 (S57b, deployed `0bf3f3f`)** — the note now suffixes `· incl. N € waiting` on the
    cancelled AND no-show branches (the amount above it is `rowCost`, which includes waiting on every settled
    row). Not on a `farePending` row, which shows the bare agreed fare and is in no total.
  - ✅ **FIXED 2026-08-09 (S57b, deployed `0bf3f3f`)** — the Driver gets the amendment card's two-step decline
    with its OWN reason list (`lib/releases.ts` — a release is not an amendment), and the Business sees
    `Reason: …`. Both cards now promise "they'll see it" at the ask, per [[d57]]. Verified end to end.
  - ✅ **FIXED 2026-08-09 (S57b, deployed `0bf3f3f`)** — four comments corrected to the [[d46]] window.
    Reclaim genuinely IS always SPEED WIN (gated to pickup within 60 min) and now says why.
  **Refuted — do NOT re-file** (each was checked against the authoritative migration and failed): `mark_no_show`
  storing a NULL fee_amount; three call sites branching on `cancelled_by === 'driver'`; `driver_cancel_mission`
  discarding accrued waiting; `business_declare_no_show` lacking the on-site floor; the `guest_ready_at` ramp
  undercut; `no_show_by` being read by nothing; `business_cancel_mission` storing NULL where the no-show doors
  store 0; the Business keeping no record of an agreed release.

## I. Small follow-ups noted in code
- ✅ Promote the per-booking **reference** (room/event) to a dedicated DB column. **SHIPPED S20**
  (`mission.reference`, migration `2026-06-27_mission_reference`; legacy `comment` now vestigial).
- ✅ **Guest phone to the Driver (O2)** — **SHIPPED S20** with a Share gate: optional phone per Guest, revealed to the
  assigned Driver post-accept only when the Business toggles Share. Numbers in a Driver-unreadable side table
  (`mission_guest_contact`), so an un-shared number is physically private.
- **Calendar day → schedule** click-through (filter schedule to a day).
- Upgrade live status from polling to **Supabase Realtime websockets**
  (add `status_event` to the `supabase_realtime` publication).
- Make `pickup_at` timezone explicit (Europe/Paris) before relying on it in prod.

## J. Deferred (CUT in spec) — track only, don't build
Ratings/badges · in-app chat · live-map GPS · grouped missions · multi-dispatch
seats · substitute driver · multiple vehicles · favourite-driver priority ·
full ML dynamic pricing · Amadeus GDS.

## K. Session 11 — founder brain-dump triage (2026-06-19)
> 18 observations sorted. ✅ items shipped this session (branch `session-11-quickwins-postflow`).
> Glossary note: the borrowed settings mock had a "Clients" entry — **forbidden term**, dropped.

**✅ Shipped this session**
- ✅ **O1** trip distance on Driver Pool card, Dispatch row, both detail views + new-mission preview
  (straight-line; road/ETA = the Maps item in B).
- ✅ **O3** intermediate stops now shown on the Driver Pool **card** ("+N stops") — were detail-only.
- ✅ **O6** Driver car (make/colour/plate) captured at **onboarding**; shown on the **Dispatch** trip
  row when a Driver is assigned. (⚠️ plate = part of the legally-required VTC verification, not cosmetic.)
- ✅ **O9** pickup time is **Europe/Paris** explicit (UTC bug fixed) + quick chips + live echo + past guard.
- ✅ **O10** SPEED WIN starts at **70%** and climbs fast (D21). + **O10a** auto-suggest in preview when ≤5h.
- ✅ **O11** final **preview card** before posting. **O15** **save-as-draft** + resume + discard (`/dispatch/drafts`). (D22)
- ✅ **O13** Settings now link **Terms / Privacy / Support / Share feedback**; **O17** draft **Terms +
  Privacy pages, FR + EN** (`/legal/*`) — placeholder copy is fine for the MVP (founder owns the legal track).

**❓/🔨 Next — needs a schema change (additive ALTER, founder-approved, → `docs/migrations/`)**
- 🔨 **O2** show the **Guest phone** to the Driver (founder: fine to share across parties for the MVP) →
  new `mission.passenger_phone`; the Dispatcher toggle is optional. (Dispatcher↔Driver reveal already works.)
- ✅ **O5** vehicle **taxonomy** — SHIPPED (Session 12 / D23): tier (eco/business/luxury) × body
  (sedan/van) + maintained **car catalog** (`lib/vehicle-catalog.ts`); Dispatcher picks tier + Any/Sedan/Van
  + optional specific car; Pool matches tier + body + specific car. Additive migration applied.
  ↳ follow-ups: bind the **Driver's car to the catalog** (a picker) for fully-robust specific-car matching
  (today Drivers type make/model free-text, matched tolerantly); a DB/admin UI to edit the catalog later.
- 🔨 **O7** cancellation/no-show flow — **RULESET DECIDED ([[d45]]), see § N for the full spec.** Phase 1 spine =
  `cancel_mission` RPC (driver 100% / re-pool) + business cancel with the hour-ramp % + no-show@`arrived` + T-60 reclaim +
  re-pool-as-SPEED-WIN, big red Dispatch card (red-wash exists), driver reliability/"mark" field, cancellation **fee** data.
  (Fee/penalty *amounts* are a founder decision — MANUAL in beta per spec.) Phase 2 = copilote hand-over (§ N).

**🅥 Future (post-MVP — track, don't build)**
- 🅥 **O8** Guest/passenger app (phone-based, cross-business, post-trip Q&A, download invite). Net-new third
  surface — meaningful build (auth, Guest entity, feedback tables). Post-MVP.
- 🅥 **O12** at-disposal / *mise à disposition* (hourly) — confirmed **V2** (the `hourly` enum hook exists).
- 🅥 **O14** Business **multi-access**: per-staff logins + action attribution (structurally easy —
  `mission.dispatcher_id` exists) + **owner-only revenue** (needs a role/permission field + tighter RLS).
  Aligns with the already-deferred multi-dispatch (J).
- 🅥 **O17 (full)** real app **i18n** (FR/EN) framework — none today; the legal pages are bilingual by hand.

**Already covered before this session**
- **O4** area/radius zones — shipped in D17 (the St-Tropez→Lac example already works: pickup **or** drop-off
  in radius). The "stays smooth" answer: in-app filter now; add a DB bounding-box / PostGIS prefilter as the
  Pool grows (noted in D17).
- **O16/O18** settings page + mission-page redesign — the Driver design pass (BACKLOG H) is where the visual
  rework lands; this session improved structure (preview/draft/help-legal) but not the full skin.

## L. Dispatch mission-form — guidance & smart UX (founder idea dump, 2026-06-23) 🔨
> Theme: the mission page must be a **guided** experience. Most Businesses (hotel staff) don't know the VTC
> profession, so the form should teach the why/how inline and stop bad missions before they post. These are
> features/polish — buildable now (no third-party APIs). The strategic / V2 ideas from the same dump live in
> `IDEAS.md` (§ "Founder idea dump — 2026-06-23").
- ✅ **Input-driven guidance messages** — **SHIPPED S31/D36** (2 nudges): luggage count high for the body → "Consider a
  Van" (and, in a Van, "a dedicated luggage vehicle"); night pickup (≥22:00 / <06:00) → harder-to-fill nudge. Calm amber
  `.notice.warn`, only-when-relevant, never block. The **long-distance** nudge was **dropped** — it told the Business to
  price the empty return, contradicting the no-empty-return model (D37). More input-driven hints add the same way.
- 🔨 **Per-section "why/how" microcopy** — **REVISED (D36):** NOT always-on (heavier / more confusing). The full
  **guidance audit** (`project/GUIDANCE_AUDIT.md`) found the app already well-guided at point-of-use; concept teaching
  is the founder's **standalone tutorial's** job. In-app **Tier 2** = a small **"?" glossary tooltip** (Ceiling / Pool /
  SPEED WIN / Lock-in / status pills) + a **Dispatch status legend**, non-invasive.
- 🔨 **Smart "most-used" defaults** — pre-select the Dispatcher's *most frequently used* tier + body, not just
  the last one. A one-off different choice must NOT move the default; only a repeated pattern shifts it.
  (Per-dispatcher frequency from their own mission history — derivable on read, no schema change.)
- 🔨 **Saved base addresses (favourites)** — let a Business store frequent pickup/drop-off points (e.g. its own
  hotel) and pick them in one tap instead of retyping. Additive: a per-business saved-places list.
- ✅ **Multiple passenger names** — SHIPPED (Session 17 / D28): first + surname, multiple per mission, **capped
  by vehicle** (Sedan 4 / Van 7); structured `passenger_names` jsonb; rows = headcount.
- ✅ **Dress-code option** — SHIPPED (Session 19 / D30): a 4-rung ladder (Driver's choice → Smart casual →
  Business formal → Suit & tie) **inside the new "Driver & service" card**, with a **tier-keyed default that never
  lands on suit & tie**. Part of the § M Driver-section build.
- ↳ Saved places needs a small **additive** migration (founder-approved, → `docs/migrations/`); smart-defaults and
  guidance copy need none. (Multiple passengers + dress code already shipped.) All in-phase (not third-party APIs).

## M. Founder dump 2026-06-25 — bug fixes + Dispatch polish (Session 18) 🔨
> A founder testing pass produced fixes + small features. Most shipped in S18; the rest are the next chunk.
> (Detailed log: SESSION_LOG S18 · plain-language: `project/CHANGELOG.md`.)

**✅ Shipped (S18, deployed):**
- ✅ **"Review" accidentally posted the mission** — fixed (React node-reuse: the Review button was reconciled into
  the Post button mid-click); + a server **intent guard** so a stray submit writes nothing; + an **irreversible
  "This is final" warning** at the post step ("Post to the Pool" label kept).
- ✅ **Duplicate missions from double-clicking** a slow Post/Save (one trip posted 7×) — pending-state guard:
  every submit button disables + shows "Posting…/Saving…" while the action runs (`useFormStatus`).
- ✅ **Discard had no confirmation** — inline "Discard this draft? This can't be undone." step (also pending-guarded).
- ✅ **Keyboard nav** in the address autocomplete (↑/↓/Enter/Esc combobox). ✅ **Draft count badge** on the sidebar
  Drafts item (fresh via `revalidatePath`). ✅ **Calendar search matches the assigned driver's name** too.
  ✅ **Desktop width:** dense views (Schedule/Calendar/History) fill the screen (`.dx-main--wide`, mission page
  left untouched — D29).
- ✅ Cosmetic: un-squeezed the draft-card buttons; fixed a bogus "~4907 km" preview when no dropoff was picked.
- ❌ **Sidebar spacing** — founder **declined** (leave the sidebar as-is).

**✅ Shipped (S19, deployed — the "Driver & service" card, D30):**
- ✅ **A "Driver" section** on the mission form — SHIPPED: **languages** (display/preference, not a hard filter),
  **dress code** (tier-keyed, anti-suit default), **request flags** (`jsonb`: meet & greet, greeter, luggage help,
  child seat, quiet ride, pets — "card only" + PRM deliberately dropped), a **meet & greet name board** (typed name
  **or** an attached PDF/JPG/PNG, auto-filled from the first Guest), and a **private message to the Driver**
  (revealed post-accept). Migration `2026-06-25_mission_driver_section.sql` applied.
- ✅ **Message-to-the-driver half of the Reference split** — SHIPPED as the private message in the Driver card.

**🔨 Remaining (next chunk — each NEW field = a small founder-run additive migration):**
- ✅ **Reference field (the remaining half of the split)** — **SHIPPED S20:** the old "Reference / notes" field is now
  a short, **20-char Reference** (Business-only schedule tag, hidden from the Driver), backed by a dedicated
  `mission.reference` column. V2 still open: a per-business **custom reference label** (Hotel→Room, Restaurant→Table).
- ❓ **Ultra-luxury "Exception" tier** (Rolls/Bentley above First) — a taxonomy decision; bundle with the
  IDEAS vehicle-taxonomy V2 (Bus tier, First-van, cargo vehicle).

## N. O7 — Cancellation / no-show / hand-over (RULESET DECIDED 2026-07-13, [[d45]]) 🔨
> Founder settled the policy (see DECISIONS.md D45 for rationale + the legal confirmation). **Amounts stay MANUAL** in
> beta; the **rules** are fixed. All fees = penalties owed to Kavenue-the-intermediary, never a transport charge (Doc 01).
> The `cancelled`/`expired` states + `cancelled_by`/`cancelled_at` columns already exist (dormant). Mirror the amendment
> pattern (immutable record + SECURITY DEFINER atomic RPC).

**❓ WAITING-FEE RATE — research owed ([[d48]], 2026-07-22).** The €1/min-started rate is a **placeholder the founder set
to unblock the build**, not a researched number. Before real money: benchmark the French **préfecture *tarifs taxi***
orders (the hourly *tarif d'attente* is the legal reference point), what **Uber / Bolt / Blacklane / Welcome Pickups**
charge for waiting on airport transfers, and what Riviera VTC operators actually bill. Decide whether the rate should
vary by **tier** (an S-Class hour is not a Prius hour) and whether the airport rate differs from city. Feeds — and is
fed by — the founder's pricing engine. Also revisit the **caps** (60 min city / 120 min airport) once real data exists.

**🔨 PHASE 1 — the cancellation spine (buildable now, one additive migration):**
- **Driver voluntary cancel = always 100%** of the trip amount → re-pools the mission. Deliberately tough. Escape valves
  (no fee): copilote hand-over (Phase 2) or a Business-agreed release.
- **Business cancel = FREE while still pooled** (no Driver committed); once a Driver holds it: free >5h; **50% at −5h;
  +10%/h (linear, 5% / 30 min) → 100% at pickup** (−4h 60 · −3h 70 · −2h 80 · −1h 90 · 0h 100).
- **No-show** — fires when the Driver is on-site (**status `arrived`**) and the Guest doesn't appear within the wait
  window: **1h airport · 20 min city** (airport = a flight number **OR** an airport-looking pickup address). Business
  charged the full fare; Driver paid in full (like a completed mission); Kavenue keeps commission; the Business settles
  with its own Guest. **UI:** a professional "be sure before you report" confirm nudge; the report button is **amber, not
  red** (a no-show pays the Driver — not a destructive action). _(Deeper: contact-attempt gate + evidence + clock
  origin = later.)_
- **T-60 Business reclaim** (NOT a cancel) — only when the assigned Driver **hasn't confirmed the Lock-in AND is
  unreachable**, Kavenue unlocks a reclaim button (~T-60) → Business takes the trip back, re-pools as **SPEED WIN**,
  penalty-free for the Business, Driver takes a **reliability mark**. Gated to the non-confirmation state (anti-abuse).
- **Re-pool pricing** — any re-pool (driver cancel · reclaim · release) re-enters the Pool as **SPEED WIN at 70% of
  ceiling**. Needs a **`pooled_at`** climb-origin (PDP climbs from `created_at` today → would mis-price otherwise).
- **Closes the amendment dead-end** — a Driver-declined amendment today resolves nothing; O7 gives the Business the
  cancel/release path out of it.
- **Migration (additive, founder-run):** `mission.cancellation_fee`, `mission.cancelled_reason`, `mission.pooled_at`,
  no-show marker (`no_show` + `no_show_at`), a widened `status_event` CHECK **or** a `mission_cancellation` audit table,
  a Driver **reliability mark**, + `cancel_mission` / `repool_mission` RPCs (mirror `accept_mission`).
- **UI:** driver cancel + hand-over card (mirror `amendment-card.tsx`); a business cancel flow showing the live % it will
  cost; the T-60 reclaim button; the no-show flow on the driver `arrived` screen; reuse the existing **red-wash**
  (`missionTone`→danger) for the Dispatch alert. **Show D25 previews before building the UI.**

**🅥 PHASE 2 — the "copilote" community hand-over (LATER — net-new, needs the community layer):**
- A **full transfer (novation)** of a booked mission to another Driver — NOT subcontracting. Original Driver drops out
  entirely (no pay/invoice/liability), keeps only a **"passed on" trace**; the copilote **re-accepts on their own account**
  and becomes the Driver of record. **Legally confirmed** (D45) — cleaner than sous-traitance.
- Guardrails (mandatory): copilote is an **active, verified, same-category** Kavenue Driver (REVTC · carte pro · RC Pro ·
  conforming vehicle, checked live); own account (no account-sharing); zero money through the original Driver; **Business
  consents by default** via terms + explained in the **tutorial**; GDPR-minimised data transfer; audit trail
  (accepting-Driver vs performing-Driver).
- **Data-model NOW (in Phase 1):** distinct *accepting-Driver* vs *performing-Driver* fields so Phase 2 slots in.
- Precedent to study: Drivalty · iaDriver · **WAY-Partner** (credential-gated) · VTC cooperatives.

**🔨 MUTUAL-CONSENT RELEASE ("agreed cancellation") — Phase 2 (build right after the spine, or bundle here):** a free,
no-fee cancellation BOTH sides confirm (Business taps a dedicated "agreed release" button → Driver gets a notification
and must ACCEPT → releases free, re-pools as SPEED WIN). Scam protection: a Business can't dodge the fee by cancelling on
a committed Driver without consent. MODERATE build — reuses the amendment pattern (proposal + accept/decline + atomic
RPC, like `respond_to_amendment`). See [[d45]] + IDEAS.md.

**🔨 SPEED WIN reachability gate (DECIDED, build later — [[d45]]):** a SPEED WIN may only be accepted by a Driver who can
  **physically reach the pickup on time** — geolocate the Driver, compute the GPS ETA to pickup (Mapbox Directions), and
  **block acceptance with a popup** if they'd be late. Needs Driver geolocation (browser API / live location) + a
  point-in-time ETA call; also the clean way to replace the crude ±90-min `accept_mission` slot buffer. (Distinct from the
  CUT continuous live-map GPS — this is a one-shot check at accept.)

**⏸️ Disputes / mediation (deferred, documented):** the "Business disputes a hand-back / no-show / cancellation" path — no
  state today; V1 stays email + Kavenue mediates on the timestamped trail. Revisit deeper later.

---

## O. Trust & safety — incidents, investigation, and blocking a Driver (founder, 2026-07-30) 🔨❓

**Why this exists.** The founder's scenario: *a Business reports a Driver's behaviour towards a woman.* Today there is
**no** answer — the only lever is setting `driver.verified = false` by hand in the Supabase dashboard: no reason, no
timestamp, no notice to the Driver, no distinction between "papers lapsed" and "removed after a safety report". And
`blocksWork()` isn't wired into the Pool, so it isn't even certain that flag stops them being offered work.

**The boundary (positioning — hard rule #2).** Kavenue **investigates to make a platform decision, not to reach a legal
verdict.** Deciding who keeps access to the marketplace is entirely ours — we admitted them, we hold their papers, we are
the donneur d'ordre. Determining criminal guilt is not. If a report describes a crime, the two run in parallel: ours ends
at *"does this Driver stay"*, the police's at *"what happened in law"*. We preserve evidence and cooperate; we do not
take statements for a prosecution.

**Roles.** **Support receives** — takes the details, escalates immediately, promises nothing, adjudicates nothing, and
**never names the reporter**. **The team investigates** — Guest, Business and Driver, to understand what happened.
**Admin decides and clicks.** In beta all three are the founder.

### O.1 A two-stage model 🔨
1. **Precautionary hold** — immediate, needs no investigation, fully reversible. Stops the Driver being offered or
   accepting work now.
2. **Decision** — after the investigation: reinstate · warning · permanent block.

**Why suspend first:** the two errors are not symmetrical. A wrongly-held Driver loses income you can pay back. The other
error has no ceiling. Decide this *before* it happens — in the moment there will be an angry hotel on the phone.

### O.2 Schema — append-only, mirroring the O7 idiom 🔨
Three tables, all **deny-by-default RLS**, all writes through SECURITY DEFINER RPCs (the `mission_cancellation` /
`mission_release` pattern — tamper-proof, and they are the evidence if this ever goes further):

- **`driver_suspension`** (append-only) — `driver_id` · `kind` (`precautionary` | `permanent`) · `reason_internal` ·
  `notice_to_driver` · `opened_by` · `opened_at` · `lifted_at` · `lifted_by` · `lift_reason` · `incident_id`.
  A lift is a new column on the row, never a delete — re-suspension writes a new row, so the history reads in order.
- **`incident`** — `mission_id` (**nullable** — a report may not be tied to one trip) · `category`
  (`conduct` | `safety` | `vehicle` | `other`) · `severity` · `reported_by_type` / `reported_by_id` ·
  `subject_driver_id` · `subject_business_id` · `summary` · `status` (`open` | `investigating` | `decided` | `closed`) ·
  `decision` · `decided_by` · `decided_at`.
- **`incident_note`** (append-only) — `incident_id` · `party_spoken_to` (`guest` | `business` | `driver` | `other`) ·
  `body` · `author` · `created_at`. **This is the investigation trail** the founder described.

**⚠️ One shared SQL helper `driver_is_blocked(driver_id)`**, called by **both** the Pool query **and**
`accept_mission`. Do **not** denormalise a boolean onto `driver` — two sources of truth drift, and this one decides
whether a suspended Driver can take a Guest. Same reasoning as the shared `mission_waiting()` / `pdp.ts`.

**RLS is the sensitive part.** `incident` and `incident_note` hold **third-party allegations about a named person**.
No Driver read, no Business read, ever — not even "their own". The Driver sees exactly one field,
`driver_suspension.notice_to_driver`, served through a narrow read.

### O.3 What the Driver sees 🔨
A blocking screen where the Pool would be:
- **"Your account is on hold"** + the `notice_to_driver` text (written by admin, plain words, no jargon).
- What happens next, and **a way to respond** — otherwise it is a black box, which is both unfair and guarantees an
  angry email to `support@` anyway.
- **It must never reveal who reported, or any detail that identifies them.** Non-negotiable — in a conduct case that
  is itself a safety risk.
- Visual: the calm `.pempty` block idiom ([[d54]]), **not** an alarming red screen. This is a person's income.

### O.4 ✅ DECIDED (founder, 2026-07-30) — we block ACCOUNTS, not trips
*"I don't want to block a trip in progress but just a driver or a business account — we do not take care of trips apart
from having a sight on it."*

**The block is an account-level switch: no new work.** `driver_is_blocked()` gates the Pool query and
`accept_mission`. That is the whole mechanism. Kavenue does **not** reach into work two professionals already agreed —
consistent with hard rule #2.

- **A trip in progress:** untouched, it completes.
- **Upcoming accepted trips:** untouched **by Kavenue**. Instead, **tell the Business the assigned Driver's account is
  on hold** — the *fact*, never the reason — so they can use the tools they already have (**agreed release** [[d46]], or
  their own cancel). We surface the situation; the Business decides. That is giving them the tool rather than making the
  decision, which is the same line as *"we don't chase a Driver for them"*.
- **⚑ Accepted residual risk, recorded on purpose:** a Driver on hold can still perform tomorrow's trip if the Business
  does nothing. Known, accepted, defensible — not an oversight. Revisit only if it actually bites.
- **⚠️ The two stages differ here.** A **precautionary hold** leaves trips alone. A **permanent block** ends the
  relationship, so there is no Driver left to perform an accepted trip — those **must** be released and re-pooled (the
  O7 path, 24h SPEED-WIN window, supersede any pending amendment/release). Still open for that case only: is the release
  **free** for the Driver (*recommend yes* — they did not cancel), and who covers a higher re-pool price?

### O.5 Due process (this protects Kavenue as much as the Driver) 🔨
- Before a **permanent** block: the Driver is told there is an issue and given a chance to respond. A **precautionary
  hold does not wait** — that is the point of having two stages.
- Every decision records **who** and **when**. Append-only, nothing editable.
- A reinstatement path with its own reason, so a lift six months later can be explained.
- **⚠️ Real constraint:** the Guest is the person it happened to, and **Kavenue has no relationship with the Guest at
  all** — the report arrives third-hand via the Business, with no way to ask her anything. Another argument for the
  Guest touchpoint parked in IDEAS.md.

### O.6 Wire `blocksWork()` at the same time 🔨
`blocksWork()` already exists in `lib/account.ts` and **nothing calls it**. Suspension and document-readiness are the
same question — *may this Driver work right now?* Build **one** gate with two inputs (blocked, or a
missing/expired/rejected required document) rather than two mechanisms that disagree. Note the deliberate S48 decision:
readiness is shown, never enforced, until real Drivers onboard — flipping it is a founder call.

### O.7 ❓ For the lawyer — flag, don't gate ([[legal-not-mvp-blocker]])
Worth knowing the answer *before* it happens, not as a build gate: what Kavenue is **obliged** to do on receiving a
report of this kind, what it is obliged to **retain**, and whether a blocked Driver has a right of appeal or to know the
substance of an allegation. The model above is deliberately conservative — record everything, tell the Driver something,
always allow a lift.

### O.8 Also missing, same area 🔨
- **Businesses have no `verified` flag at all** (`driver.verified` exists; the business side has `siret` / `vat_number` /
  `legal_name` and can file a Kbis, but nowhere to record approval). A Business that behaves badly has even less of a
  lever than a Driver.
- **Nothing records a warning** short of a block — the middle outcome of an investigation currently has no home.

---

## P. Expired / unfilled trips — ✅ SHIPPED 2026-07-31 (S51, [[d62]]; migration `2026-07-31_expired_missions` applied; deployed `d7e06d4`)

**Founder's answers to the five questions below:** (1) expires **exactly at `pickup_at`**, no grace · (2) **stays on the
Dispatch schedule until the day ends**, then folds into "Earlier trips" (no query change needed) · (3) labelled with the
existing "Expired · Was not filled in time" · (4) **no re-post for now** — and note it could never have been a re-time,
since the [[d48]] trigger freezes `pickup_at`, so it would have to duplicate into a new mission · (5) **counts nowhere
yet** — fill rate still needs the § F2 back-office, which is the one piece of § P left open.

**Shipped:** a time check inside `accept_mission` (under the existing row lock), a `pickup_at` floor on the Pool query
(applied even under the dev `?all=1` bypass), `expire_stale_missions()` sweeping `pooled → expired` + writing the
`status_event` in one statement, called on the Pool/Schedule reads — **no cron** (Hobby caps at once per day; the
scheduler decision belongs to the notifications phase with [[d61]]'s T-180 reminder). `missionTone` also derives the
state for `pooled` + past-due so the calendar/history can't lag. Verified live 6/6 incl. a genuine UI accept race.

<details><summary>Original § P brief (kept for the record)</summary>

**Found by the founder in the live Pool:** *"trips on the pool exist even though the trips are outdated by weeks!"*

**Measured 2026-07-31:** **23 of 23 pooled missions have a pickup time in the past.** Oldest is **44 days** ago. The
Pool is, right now, entirely stale. **Zero** missions have ever been marked `expired`.

**Why.** The `expired` status exists in the enum, and `missionTone` already renders it ("Expired · Was not filled in
time"). **Nothing ever writes it** — there is no job, no trigger, no server-side sweep. The Pool query is simply
`status = 'pooled'` with no lower bound on `pickup_at` ([`app/(app)/pool/page.tsx:82`]). So an unfilled trip stays in
the Pool for ever.

**⚑ The sharp edge:** `accept_mission` checks `status = 'pooled'` and **does not check the time**. A Driver can accept
a trip whose pickup was six weeks ago — creating a live, confirmed, priced obligation out of a dead booking. That is a
money-and-trust bug, not just clutter.

### ❓ Founder decisions needed before building
1. **When does a trip expire?** At `pickup_at`? A grace period after (15 min? an hour)? The PDP climb ends at the
   ceiling long before pickup, so a trip sitting unfilled at T-0 is already a failure.
2. **Where does it go?** Out of the Pool, clearly — but does it land in the **Dispatch History** as a closed record,
   stay on the schedule, or get its own "didn't happen" list?
3. **How is it labelled to the Business?** `missionTone` already has the copy ("Expired · Was not filled in time"), so
   this may be free.
4. **Is the Business told, and can they re-post it?** A one-tap "post it again" is cheap and probably what a hotel
   wants when the trip is tomorrow rather than yesterday.
5. **Does it count anywhere?** An unfilled trip is the single most important marketplace-health number (fill rate) —
   see the metrics note in the § F2 back-office.

### How it would be built (no third-party anything)
- **The guard is the urgent half and needs no scheduler:** add a `pickup_at` floor to the Pool query *and* a time check
  inside `accept_mission`. That alone stops a Driver accepting a dead trip, today.
- **The sweep** (actually flipping `pooled → expired`) wants something that runs on a timer. Options: Vercel Cron
  (⚠️ **Hobby plan caps cron at once per day** — confirm the plan), or a lazy sweep on read, or a Postgres trigger.
  Deciding this overlaps with the T-180 reminder job (D61), which needs the same scheduler — **build the scheduler once.**
- ⚠️ Whatever writes `expired` must respect the **`pickup_at` freeze trigger** (D48) and must not disturb the O7
  cancellation/release paths.

**Note for the founder:** the 23 stale rows are demo data, so this reads worse in the beta DB than it would in
production — but the missing guard is real either way.

</details>

---

## Q. Abandoned trips — a Driver took it and never closed it ❓🔨 (found 2026-07-31 closing § P, [[d63]])

**⚠️ NEEDS A FOUNDER RULING BEFORE ANY CODE. It is a money question, not a cleanup question.**

**Measured 2026-07-31:** **8 missions have a pickup in the past and no ending** — 7 `confirmed`, 1 `on_board` (that one
for **36 days**). A Driver accepted each of them and never advanced it to `completed`. Nothing expires them, nothing
settles them, and they fall into no History bucket — which is exactly why the § P filter chips deliberately don't sum
to All (3 + 18 + 0 ≠ 28).

**Why this is worse than the unfilled case § P just closed.** An unfilled trip owes nobody anything — no Driver ever
held it. Each of these has **a fare, an assigned Driver, and the whole O7 fee machinery** ([[d45]], [[d48]]) still
treating it as live. As far as the system is concerned that `on_board` trip is *still driving*.

### ❓ The questions
1. **The same status means two opposite things.** A past `confirmed` trip might be one the Driver **drove and forgot to
   tap Complete on** (a data-entry failure — they should be paid) or one they **never turned up for** (a Driver no-show
   — the Business should not be charged, and it is a reliability event). The status cannot tell them apart, so **the
   rule probably can't be time alone.**
2. **Does anything auto-close?** And at what distance — 24h past pickup? A week? Or does it wait for a human (the § F2
   back-office) precisely because money hangs on it?
3. **Who pays?** Driver paid / Business charged / neither / held pending review.
4. **Does it mark the Driver?** `driver.reliability_marks` exists and is written silently on a driver cancel; the
   founder has already parked whether a Driver sees their own.
5. **`on_board` specifically** — the trip demonstrably started. Does that alone justify paying it out?

### Signals we already have (and their limits)
- **Check-in ([[d61]])** is the only "will you be there" signal, and it is **shown, never enforced**.
- **`status_event`** timestamps every advance, so "how far did this trip actually get" is answerable per trip.
- ⚠️ There is **no push**, so "the Driver didn't respond" cannot yet be distinguished from "the Driver wasn't asked" —
  the same blocker that keeps the T-60 take-back parked ([[d61]]).

### If/when it is built
Mirrors § P's shape: a sweep with a guard. But **§ P's sweep could be lazy and unattended precisely because expiring an
unfilled trip moves no money.** This one does, so it likely wants the real scheduler *and* a human review step — i.e.
it lands with the back-office (§ F2) or the notifications phase, not before.

### ✅ DESIGNED + PARKED 2026-07-31 (founder conversation, S52). Do not re-derive.
**Founder's ruling: leave it for now.** In beta the founder is the only one creating trips, so all 8 are test artifacts;
and the good version needs push, so building now means shipping the weak version twice. **The design below is settled —
pick it up in the notifications phase (menu option B) or with the back-office (§ F2).**

**The insight that resolved Q1 — there are two different holes, and only one is open.**
Every escape valve already built (copilote, agreed release, T-60, Business cancel) answers *"this trip is not going to
happen."* Someone is unhappy, so someone acts. **That case is covered.** The open hole is the opposite: *the trip DID
happen and nobody tapped the last button* — Driver drops the Guest, hotel is delighted, Driver drives off and never
reopens the app. **Nobody is unhappy, so nobody chases it.** The service was fine; only the record is wrong, and the
record is what pays the Driver and bills the Business. That is the case that survives real users, because it has no
complainer.

**So the answer is not a rule that guesses — it is a question.** Time alone cannot separate "drove and forgot" from
"never turned up" (Q1), and no threshold ever will. Ask the only party who knows.

1. **Trigger** — a trip still open a few hours after it should have ended (`pickup_at` + trip duration + buffer;
   founder's instinct **~3h after the expected end**, so a delayed flight is not nagged). Nothing auto-changes; the trip
   just becomes *askable*. **This answers Q2: nothing auto-closes.**
2. **Driver side** — a **pinned card, NOT a modal popup** (founder agreed: a popup trains people to tap ✕ without
   reading). Top of My Rides + a tab badge — the same pattern as the [[d61]] check-in badge. Stays until answered, never
   blocks the Pool. Three answers: **Yes, I drove it** → closes the trip dated at its real time, lands in Earnings/Past ·
   **No, the Guest never showed** → the existing no-show path · **Something else** → human review.
   ⚑ **No new abuse surface**: a Driver can already tap "Complete ride" without driving. Same exposure as today.
3. **Business side, meanwhile** — instead of a frozen "On board" from 36 days ago, an honest amber
   *"Waiting on the Driver to close this"* + a **Nudge the Driver** button. ⚑ **Nudge, never close** — a Business that can
   mark a trip complete is a Business declaring a Driver's work done, and that is money (**Q3**).
4. **The shelf life (founder's own question: "what if the Driver comes back a month later?")** — a month later *he does
   not remember either*, so the question expires. **~48h**, then it stops being his and **flips to the Business**, who
   knew that same day whether their Guest reached the airport. Two independent parties, one tap each, and they will
   almost always agree. Neither answers → back-office queue, unresolved, founder closes by hand (which is what happens
   today, minus anything telling them it is there). **The deadline must be short — days, not weeks; the value of the
   answer decays fast.**

**Why this needs push (and therefore waits).** The card only fires when the Driver opens the app. A notification is what
makes a 48h shelf life realistic instead of optimistic. Same blocker as the T-60 take-back.

**Geolocation auto-close — founder's idea, correct instinct, blocked today.** Kavenue is a PWA: a browser only gets
location **while the app is open on screen**, so there is no background "he arrived at the airport" detection without a
native app. V2 at the earliest. And even then, one hard rule: **location may suggest, never decide** — location closing a
trip is location *paying* someone. Failure case: the Driver returns to Nice airport at 11am for his *next* job and the
app closes and pays out yesterday's trip. The right shape is *"Looks like you finished — tap to complete."*

### ⚑ Q6 — THE BUSINESS HAS NO WAY OUT OF AN UNCLOSED ROW (found 2026-08-20, discussing § Q with the founder)

**The founder's position, and it is the right one:** an unclosed trip should stay lifted into today's band, in
plain sight beside real work, *because* that is uncomfortable — it pushes the desk to chase the Driver.
**Keep it as it is.** What follows is not a case for hiding them.

**The hole: friction only works while there is a door, and there isn't one.** On an unclosed row the trip row
switches OFF amend, release and cancel (`components/trip-row.tsx:215-245`, the `unclosed` gate) and leaves a
red line saying *"call them to confirm it happened."* That is the entirety of what a Dispatcher can do. If
they ring the Driver and are told *"yes, it ran"* — **there is no way to record it.** The only exit is the
Driver opening their own app and answering. The row stays lit indefinitely.

**Why that matters more than it sounds.** The § Q close prompt carries its own warning on the Driver's side:
answered is answered, because *"nagging them after that is how a prompt turns into noise people learn to
ignore."* The identical mechanism applies to the Business, and nothing protects them from it — a Dispatcher
who cannot clear a row learns to scroll past the band, which is the exact outcome the lift was designed to
prevent. **Measured 2026-08-20 on the test data: 18 unclosed rows in today's band, 14 of them over a month
old, 9 `on_board` and 9 `confirmed`, against 0 trips actually scheduled that day.** Seeded data exaggerates
it — a working hotel closes daily and would carry nought or two — but it is a faithful picture of what
unbounded accumulation looks like.

**What to build, smallest first:**
1. **A Business-side resolution: "I called them — it ran."** One control on the unclosed row. It records who
   said so and when, and it is the single change that turns a nag into a workflow. ⚠️ **It settles money**, so
   it is not a display change: it needs the same treatment as any close, and it is the trigger condition
   already written into `2026-08-10_mission_close_answer.sql` for moving `close_answer` out of a mutable
   column into `mission_close_answer` (read-only RLS, SECURITY DEFINER writes). Pairs with **U.3**.
2. **Ageing.** A trip 30 minutes past its expected arrival is *call them now*; five weeks past is accounting,
   not today's work. Carrying both at the same weight in the same band is what lets it grow without bound.
   Either they age out into a separate unsettled list, or the tone escalates and then relaxes.
3. **Point some of the cost at the Driver.** The missing tap is theirs; today the hotel's schedule carries the
   whole visible cost of it. Reliability marks already exist as the mechanism — gated on **Q4** below.

**Still open when it is built:**
- **Q4 (reliability mark)** — untouched, still gated on the founder's parked "does a Driver see their own?" decision.
- **Q5 (`on_board` specifically)** — moot under this design: `on_board` is asked the same question as `confirmed`.
- ⚑ **The "No, the Guest never showed" branch needs its own route.** The [[d47]]/[[d48]] no-show rules assume the Driver
  is standing at the pickup with a courtesy-wait clock running; reporting one three days later does not fit that shape
  and will not pass those guards.

---

## R. Dispatch History — ✅ SHIPPED 2026-07-31 (S52, [[d68]]; NO migration; deployed `0acdb68`)

Phase 1 shipped 2026-07-31 ([[d63]]): outcome filter chips (All / Completed / Unfilled / Cancelled) with counts, a
one-line summary, per-month failure counts, two empty states.

**Phase 2 — the rest of the way — is DONE.** Founder: *"it is a professional tool, and they need accurate infos and easy
to find a specific trip or mission by drivers name, or passenger or internal reference, or car… it need to be perfect
and complete."* Everything in the candidate list below shipped except the two items explicitly deferred at the end.
Full reasoning: [[d68]]. Files: `lib/history-filter.ts` (new — the one place a past trip is filtered/searched/sorted),
`components/history-filters.tsx` (new toolbar), `components/date-cal.tsx` (the Earnings calendar, extracted),
`app/(dispatch)/dispatch/history/{page.tsx,export/route.ts}`, `components/trip-row.tsx`, `lib/format.ts`, `globals.css`.

- ✅ **Search** — ONE box over Guest · Driver · reference · address · flight · car; every term must hit somewhere;
  **accent-folded** ("aeroport" finds "Aéroport"); the hit is painted in the row; and when it lands somewhere with no
  column (a plate, a make) the row prints `Car · Mercedes · Classe E · AB-123-CD` so the result never looks arbitrary.
- ✅ **Date range** — the Earnings calendar, extracted to `components/date-cal.tsx` and adopted unchanged. Presets:
  last 7 / last 30 / this month / all time.
- ✅ **Sort** — newest / oldest / highest fare / lowest fare, from the toolbar or by clicking the Date / Fare headers.
- ✅ **Export CSV** — the page and the export run the SAME `applyHistoryQuery`, so it is exactly what's on screen.
  `;` delimiter + French decimals + BOM (Excel FR), formula-injection escaped.
- ✅ **Per-Driver view** — a Driver dropdown listing everyone who has driven for this Business.
- ✅ **Deep links** — `?open=<id>` matches the Schedule; every filter is in the URL, so a filtered archive is a link.
- ✅ **Two gaps found and closed:** rows showed only a **time** inside month bands (3 July vs 19 July were
  indistinguishable), and there was **no fare column at all**.
- ✅ **Accuracy:** a past trip a Driver never closed (§ Q) shows its agreed fare greyed as **"Not settled"** and is
  **excluded from every total** — row, month band and summary. It has its own CSV column.
- ⏳ **Deferred, deliberately:** the compact/comfortable **density toggle** (the row is already dense — nobody asked)
  and **pagination/virtualisation** (fine at 28 trips; ⚑ **the hard break is 398, measured S65** — see below).

<details><summary>The original candidate list (kept for reference)</summary>

**Candidates (needs a founder pass to prioritise — this list is deliberately longer than one session):**
- **Search** — by Guest name, reference, address, Driver. The Calendar already has a search that matches the assigned
  Driver's name (S18); reuse that vocabulary rather than inventing a second one.
- **A date range** — "everything between these two dates", the same ask as the Driver's Earnings (§ B of the current
  worklist). **Build the range control once and share it** across History and both Earnings screens.
- **Sort** — newest/oldest, and by fare.
- **Export** (CSV) — a hotel's accountant is the real user here; pairs with the § S spend view. ⚠️ Agent framing in any
  document the Business hands on: Kavenue is not the seller of the transport.
- **Per-Driver view** — "show me every trip Marc did for us".
- **Columns/density** — the dense grid is fixed today; consider a compact/comfortable toggle.
- **Deep links** — `/dispatch/history?open=<id>` to match the Schedule's existing `?open=`/`?day=` (S33).
- **Pagination / virtualisation** — not needed at 34 missions; the whole archive is loaded in one query today, and
  that is the first thing to break at real volume. ⚑ **Measured S65: it breaks at 398, and a hotel is at 271.**

</details>

**⚑ STILL OPEN — the growth limit.** The page loads the Business's whole archive in one query and filters in memory.

⚑ **MEASURED 2026-08-23 (S65), and it is FAR lower than the 5 000 that was guessed:** the cancellation
fan-out (`.in("mission_id", <every archived id>)`, `dispatch/history/page.tsx:118-126`, duplicated at
`history/export/route.ts:94`) **fails at 398 archived trips for one Business** — binary-searched against the
live DB, ~14.8 KB of URL. It does not degrade, it **errors**. Live today the busiest Business has **271
archived trips: 127 of headroom.** This is near-term, not distant.

That is correct at 28 trips and deliberate (it is what lets the chip counts, the Driver dropdown and the class list all
be honest about the *whole* archive). It is also the first thing that breaks at real volume. When a hotel has thousands
of trips, the filters move into the SQL (`ilike`/`websearch_to_tsquery` on a generated search column) and the page
paginates — and at that point the chip counts need their own aggregate query. Not before.

---

## S. Dispatch EARNINGS / spend — "a real one, complete and pro" 🔨 (founder, 2026-07-31)

The Business-side money view. Supersedes the short note in § F.

**⚑ The one place it deliberately DIVERGES from the Driver's Earnings ([[d59]]): the founder wants CHARTS here.** The
Driver's screen has none — an explicit founder call ("no charts"), because a Driver wants to know what they made, on a
phone. A hotel's back-office is a different user on a bigger screen doing analysis, so "pro graphic", comparison tools
and desktop-class controls are the ask. **Do not treat the two screens as needing to match.**

**Already solved, reuse it:** `settledFare()` freezes the fare at `accepted_at` ([[d59]]), so the maths is correct and
already proven on both sides. The period-filter concept (Day/Week/Month/Year + step + jump) exists in
`components/earnings-period.tsx` — but see § B of the current worklist, **its picker is broken and is being fixed
first**; the fixed control is what this screen should adopt.

**Scope to design (D25 preview loop applies — this is a big UI job, mock it before building):**
- **Total spend** for the period + what it's made of (trip fares · waiting charges · cancellation fees · no-shows).
- **Comparison tools** — previous period, and same-period-last-year once there is a year of data (the Driver's screen
  turns that line on by itself once it's non-zero; do the same, don't render a zero).
- **Charts** — spend over time, and probably a breakdown by category. Research the best-in-class first (the founder's
  ask): hotel/travel back-offices, Stripe, Qonto, Pennylane, Booking's partner dashboards.
- **Breakdowns worth having:** by month, by vehicle class, by route/zone, by Driver, by Dispatcher (who booked it), and
  **fill rate** — the § P number that currently has no home.
- **Export** for the accountant (shares with § R).
- ⚠️ **Agent/intermediary framing throughout** (Doc 01): Kavenue takes a service fee, it does not sell the transport.
  Watch the copy on anything that looks like an invoice.
- ⚠️ **Amounts settle MANUAL in beta.** Every figure is what the model says is owed, not what has been paid — the
  screen must not imply a payment ran.

---

## T. Earnings feels laggy — MEASURED 2026-07-31, it's cold starts 🔨

**Founder, testing [[d66]]:** *"there is some lag but maybe because is the test version."* It was **not** a test build
— `driver.kavenue.fr` serves production. So the lag is real. Measured rather than guessed:

| What | Time |
|---|---|
| production `/earnings`, first request | **1.97 s** |
| same page, warm | **0.34–0.38 s** |
| all 7 Supabase queries, in parallel | 213–490 ms |
| one `loadPeriod` (2 queries) | 146 ms |
| `loadFirstDay` | 102 ms |

**⚑ The cause is a serverless COLD START, not the query count.** The queries run in `Promise.all`, so seven of them
cost roughly one query's latency. The first tap after an idle period pays ~2 s; every tap after is ~350 ms. Cold start
is inherent to the Vercel Hobby plan — not fixable in code.

### ❌ DON'T trim the queries — the measurement above already rules it out
An earlier draft of this section proposed skipping the always-empty year-ago query and caching `loadFirstDay`. **Both
are near-worthless and the table above says why:** seven queries in parallel cost 213–490 ms while ONE `loadPeriod`
costs 146 ms. They are concurrent, not queued, so removing two of seven saves roughly nothing — and gating the year-ago
query on `firstDay` would mean *sequencing* a round trip, plausibly making it slower. Recorded as a rejected option so
nobody re-derives it. (`force-dynamic` is likewise correct here; caching an archive is a different, later question.)

### ✅ The fix worth making — the wait should be honest, not shorter
`startTransition` already keeps the old UI up and `.eper.is-busy` dims the period row, but **the money total sits there
looking final while it is stale.** 350 ms of a visibly-loading number reads as deliberate; 350 ms of a confidently wrong
number reads as lag — which is exactly what the founder reported.

Shape: move the four loads out of `EarningsPage` into an async child, and render it inside
`<Suspense key={period+anchor+from+to} fallback={<skeleton/>}>` so the boundary re-suspends on every period change. The
skeleton wants to mirror `.etotal`/`.etotal__sub`/`.ecmp`, and `pool/loading.tsx` ([[d54]]) is the house precedent for
what a Kavenue skeleton looks like. Contained to one file, but a real restructure — **not an end-of-session job.**

### The bigger perceived win — make the wait honest, not shorter
`startTransition` already keeps the old UI up, and `.eper.is-busy` dims the period row — but **the money total sits
there looking final while it is stale**. 350 ms of a visibly-loading number reads as deliberate; 350 ms of a confidently
wrong number reads as lag. This is probably worth more than any query trimming.

**Applies to § S too** — the Dispatch spend view will have the same shape and should be built with this known.

---

## U. Location as evidence — what the native app unlocks 🔨❓ (founder, 2026-08-10)

**Gated on the native app. Nothing here is buildable on the PWA** — a browser only gets location while the app
is open on screen, so there is no background arrival detection, which is the whole premise. Recorded now
because § Q slice 2 (S58) built the seam these plug into: the close prompt already fires off **arrival**,
estimated today from the booked route and *observed* later. One term changes.

**⚑ The rule that governs all of it, and it is already recorded (§ Q, D-level):** *location may **suggest**,
never **decide***. Location closing a trip is location *paying* someone. Everything below has to survive that.

### U.1 A Driver can't tap "Arrived" unless they are actually there
**Founder's reason, and it is a real hole:** a Driver running late taps *Arrived* early so the Business's
screen never shows them as late. Today nothing stops it — `advanceStatus` has no time guard and no place
guard, which is documented in S41 (the same absence that made the no-show clock exploitable before D47).

⚠️ **Do not ship this as a hard block without a fallback, and here is why.** `arrived` is the precondition for
reporting a **no-show** (`mark_no_show` requires it). A Driver standing at the pickup with a broken GPS fix,
an urban canyon, or location permission denied would be unable to tap *Arrived*, therefore unable to report a
Guest who never came, therefore unable to claim a fee they are owed. The guard must degrade: **suggest and
record, don't refuse.** Something like — tap accepted, but stamped `arrived_verified: false`, and the
Business's row says so. That keeps the honest Driver whole and still makes the dishonest tap visible, which
is all the evidence needs to do.

### U.2 Lateness, measured and penalised
**Founder: penalties for late Drivers, using location.** Needs three things decided before any of it:
1. **What "late" means.** Arrival after `pickup_at`, by how much, and with what grace. A Guest is rarely
   ready at the second.
2. **Who is harmed.** Today lateness costs the Business nothing in the model — the Guest waits, and the only
   money that moves is the *waiting fee*, which runs the other way (the Business pays the DRIVER for waiting,
   D48). A lateness penalty is therefore net-new money in a direction nothing currently flows.
3. **Where it lands.** A fee, a reliability mark, or both. **Q4 is still parked** — the founder has not
   decided whether a Driver sees their own reliability marks — and this can't ship ahead of that.

⚑ **The existing tension to resolve first.** D61 shipped **check-in** ("will you be there?") and deliberately
hung *nothing punishing* off missing it, on the stated grounds that you may not punish someone for ignoring a
prompt they were never actually shown — no push, no reminder. That reasoning applies unchanged here: **a
lateness penalty needs the notification phase as much as it needs GPS.**

### U.4 Hard-closing a trip on observed arrival (founder, 2026-08-20) — YES, BUT NOT AS STATED

**The founder's proposal:** *"once we have the live location of the driver and the destination matches the
geo arrival of the drive then we can hard close the trip after a certain amount of time."*

**The mechanism is right and § Q was built for it** — the close prompt already fires off *arrival*, estimated
today and observed later, and the brief says one term changes and nothing else does. What follows is not a
rejection; it is the shape that survives the founder's own rule at the top of § U: *location may suggest,
never decide.* **A hard close settles the fare AND any waiting fee, so an automatic one is location paying
someone** — the exact thing that rule exists to prevent.

**Three corrections, in the order they matter:**

1. **Dwell is the wrong signal. Arrive-THEN-LEAVE is the right one.** A Driver sitting inside the destination
   geofence may still have the Guest aboard, or be part-way through a multi-stop. The signature of a completed
   drop-off is entering the geofence and then departing it. The founder's *"certain amount of time"* then
   stops being the evidence and becomes the **confirmation window** — which is where it belongs.
2. **Location should trigger a far STRONGER PROMPT, not the close.** *"We saw you at the drop-off at 15:47 —
   confirm?"*, one tap, pre-filled. That turns a cold *"did this happen three weeks ago?"* into a yes/no about
   something the Driver still remembers, which is a different response rate entirely. The Driver stays the
   decider, so the rule survives untouched — **and this alone removes most of the pile-up the auto-close was
   meant to solve.** Cheapest, safest, biggest share of the benefit: build this first and measure before
   building 3 at all.
3. **Auto-close ONLY where nothing is being decided.** The narrow safe case: the Driver already tapped
   `on_board` (so the trip demonstrably ran and the fare was already agreed), the geofence saw them reach the
   destination and then leave, **no waiting money is open on the meter, and no no-show is in play.** There
   every party's own signals already agree and the close invents no fact — corroboration, not decision.
   ⛔ **Never auto-close the ambiguous cases, which are precisely the ones § Q exists for:** a Driver who never
   marked `on_board`, a settled or running waiting meter, or a contested outcome. Those would pay someone on
   the strength of a satellite fix.

⚑ **§ Q ALREADY HOLDS THE KILLER FAILURE CASE, and it is the founder's own:** *"the Driver returns to Nice
airport at 11am for his next job and the app closes and pays out yesterday's trip."* It is a sharper argument
than any of the three above and it defeats naive dwell detection outright — which is why step 3 is gated on
`on_board` **and** a destination-specific geofence **and** an arrive-then-leave transition, rather than on
"the Driver's phone was near the drop-off." § Q also already names the right shape in one line: *"Looks like
you finished — tap to complete."* That is step 2.

⚑ **The inverse of U.1's fallback applies.** U.1 says a broken GPS fix must never punish an honest Driver;
here it means a Driver whose phone died simply gets no auto-close. **The manual path has to survive in full
regardless — auto-close is a fast lane, never the only lane.**

⚑ **Pairs with U.3's first condition.** The day a close happens without a human tapping it, the Business needs
a way to contest it — and that is the trigger written into `2026-08-10_mission_close_answer.sql` for turning
`close_answer` from a mutable column into a `mission_close_answer` table in the `mission_release` idiom
(read-only RLS, writes via SECURITY DEFINER). **Do not ship U.4 step 3 without that.**

### U.3 What this is really for — the dispute question (founder, 2026-08-10)
*"What proves the Driver actually did the trip?"* Today: **nothing does.** Every signal is self-reported by
the person being paid — the four status taps (no time guard, no place guard) — except the hotel's own
knowledge, which lives outside the app. § Q slice 2 added one genuinely new piece of evidence: whether a trip
was closed **at the time** or **by answering a prompt weeks later** (`close_answer` + `close_answered_at`).
That is a real distinction in a dispute and it did not exist before.

**Adequate for beta** (nothing is charged automatically; the founder settles by hand and the hotel always
knows). **Not adequate once money moves on its own.** Two conditions to watch:
- **The Business cannot contest a close in-app.** The day they get that button, `close_answer` must stop
  being a mutable column and become `mission_close_answer` in the `mission_release` idiom — read-only RLS,
  writes via SECURITY DEFINER. The condition is written into `2026-08-10_mission_close_answer.sql` itself.
- **Corroboration, not proof.** Even with GPS the Driver still confirms; what changes is that *"the app saw
  you at the drop-off at 15:47"* turns a claim into a corroborated one. That is the whole ambition — U.1's
  fallback exists because the alternative is a system that calls an honest Driver a liar when a satellite
  fix drops out.

---

## V. A Driver may opt in to lower-class trips 🔨 (founder, 2026-08-15 · **BRAINSTORMED AND PARKED 2026-08-23, S65**)

⚑ **PARKED BY THE FOUNDER, 2026-08-23: "it's too early to work on that."** Nothing was built. Everything
below is the design settled in the S65 brainstorm — read it before touching this, the answers cost a
session's thinking and several of them overturn the original spec.

**The rule.** A Driver whose car classifies above the mission's tier may choose to see and accept
lower-class work. **Opt-in, never automatic.** Founder's reasoning: *"Uber does that, it gives the
opportunity to accept trips on lower class if they wish."*

**Why it surfaced.** The Pool matches tier **exactly** (`app/(app)/pool/page.tsx:107-108`). The live
`Classe V` (plate IJ-905-KL, Karim Nasri) is stored `category='luxury'`, so **that Driver is stranded off
Business-van work right now** — and Business-van is where most van volume will be. § V is overdue, not
anticipatory.

### ✅ SETTLED IN THE S65 BRAINSTORM — do not re-open these

1. **ONE CLASS DOWN ONLY** (founder, explicit: *"Only one lower class max!"*). First → Business and
   Business → Eco. **First may NEVER reach Eco.** This is not just a simplification — it is most of the
   fairness fix, because it protects the Driver with the cheapest car and the thinnest margin from ever
   competing with a First car. A single boolean still works; the rule is "exactly one step below", not
   "anything below". ⚑ In SQL, do **not** use `v.category >= v_mission.category` — the `vehicle_category`
   enum is declared `('eco','business','van','luxury')` (`docs/kavenue_schema.sql:19`) so native enum order
   sorts the retired `'van'` between business and luxury. Use an explicit tier array; the app's order is
   `SERVICE_TIERS = ["eco","business","luxury"]` (`lib/vehicle-catalog.ts:18`).

2. **BODY TYPE NEEDS NO WORK — it already behaves exactly as the trade does.** Founder: *"a van can do a
   sedan trip if the business books any body type; a sedan cannot do a van trip, for lack of space. If body
   type matters to the Business or the Guest, we already have UI for it — they choose Any or specify."*
   Verified in both layers: `required_body_type is null or = v.body_type`, at `app/(app)/pool/page.tsx:125`
   and the live SQL guard `docs/migrations/2026-08-22_accepted_fare.sql:101`. **Confirmed, not assumed.**

3. **THE CURB IS A NON-ISSUE** — founder confirmed on the ground. A bigger car turning up is strictly
   better than booked; the Business chose "Any" if body did not matter to them. Nothing to disclose,
   nothing to refund.

4. **THE FARE IS THE MISSION'S, AND THIS IS ALREADY TRUE BY CONSTRUCTION.** `currentFare()` reads only
   mission columns and never sees the Driver or their vehicle. The §6 curve preserved that. § V's pricing
   requirement reduces to one negative rule: **the curve must resolve floor and ceiling from the MISSION's
   class, never the reader's.** Do not break it. No money-path work at all.

5. **THE VOLUME RISK IS ACCEPTED, KNOWINGLY.** Founder: *"they will lose volume probably and it's a risk I
   am willing to take for now and see feedback from drivers."* Conditional on it being easy to switch off
   for a given Driver — see the gap below.

6. **SEASON WINDOWS WERE CONSIDERED AND REJECTED.** The founder first proposed allowing this only between
   two dates (high season), then spotted the flaw themselves: seasons differ by region, so it would need
   geography too. ⚑ **And their reasoning INVERTED the original spec's.** The 2026-08-15 note recorded
   *"it's good in case of low seasons"*; in S65 the founder argued the opposite and better: *"if during the
   low season we don't have enough work and the First takes the job of the Eco, then it's unfair."* In a low
   season there is not less First work, there is less of **everything** — so a First Driver taking Business
   work does not create volume, it moves it downhill.
   **The paradox to keep in mind: the opt-in is most useful exactly when it is most unfair, and most
   harmless exactly when it is least needed.**

7. **THE REPLACEMENT: OPEN IT PER-TRIP, ON TIME-TO-PICKUP.** Calendar dates are a blunt proxy for the thing
   that actually matters — whether *this trip* is going to fill. A trip still sitting in the Pool near its
   pickup **is** the signal that supply is short for that class, at that moment, in that place. It
   self-adjusts with no dates and no regions:
   - **busy:** trips fill fast, never reach the class above, Business Drivers keep their volume
   - **quiet:** a trip that would have **expired** gets taken instead of dying — the Business Driver loses
     nothing, because nobody was taking it

### ⚑ THE ESCALATION LADDER — this is why the number matters

    posted  →  own class only, price climbs
      ↓
    still unfilled  →  WIDEN one class up      ← § V.  FREE. Business pays what they agreed.
      ↓
    still unfilled  →  ask the Business to raise the Ceiling   ← § AB. Costs the Business money.
      ↓
    nobody takes it  →  expires                ← § P, shipped

**Always pull the free lever before the paid one.** § AB's trigger is **T−5h**, so § V must fire *before*
T−5h or the ladder runs backwards.

### THE OPEN QUESTION — the threshold number

**Verified curve facts (S65, computed against three live missions through the real `lib/pdp.ts`):**
- The fare reaches the Ceiling at **exactly T−5h** for any trip posted with more than 5h of runway.
  Hardcoded: `TOP_LEAD_MS = 5 * HOUR_MS` at `lib/pdp.ts:43`. A trip posted *inside* 5h tops out at the
  midpoint instead (posted T−3h → Ceiling at T−1h30).
- Shape on a real row: **T−24h = 76 % of Ceiling · T−12h = 85 % · T−6h = 95 % · T−5h = 100 %.**
  **All the persuasion happens before T−12h; the last five hours give nothing.**

**Founder floated T−2h** (*"it sounds simpler, and even if it's posted 2 hours before the trip it is still
urgent, but with a good price — SPEED WIN"*). The **one-clock simplification is right and was kept**. The
number was argued down, for three reasons:
1. **T−2h is three hours AFTER the top-out**, so it runs the ladder backwards (see above).
2. **T−2h is past every deadline the app already sets.** Lock-in auto-confirms inside 3h, so the Driver is
   instantly bound (`docs/kavenue_schema.sql:240-245`). Check-in opens at **T−3h**
   (`CHECK_IN_OPENS_MS`, `lib/dispatch-status.ts:22`), so Dispatch already flags the trip as not-checked-in.
   The **±90-minute slot-conflict** rule (`docs/kavenue_schema.sql:228-238`) is a 3-hour exclusion band, so
   most working Drivers are inside somebody's band. **You would be widening into the narrowest audience the
   day contains.** Plus travel: the 50 km default radius is 45–75 min on the Riviera.
3. ⚑ **The SPEED WIN premise no longer holds.** [[d82]] removed automatic SPEED WIN — it is now only ever
   what the Business ticked, default **off** at every lead time (`mission-form.tsx:208`). A Business
   transfer posted at T−2h opens at **32,89 € net** with SPEED WIN off vs **69,61 €** with it on. "Urgent
   but with a good price" is conditional on the Dispatcher clicking a ≤5h nudge they can click straight
   past (`mission-form.tsx:511-517`).

**⚑ CLAUDE'S RECOMMENDATION, NOT YET ACCEPTED: T−6h.** One hour before the price tops out, so the free
lever fires before § AB's paid ask. The fare is already at 95 % of Ceiling, so it is near-maximally
attractive. Six hours is genuine planning and travel time rather than a scramble. Keeps the founder's
one-clock simplification exactly — one number, `pickup_at` only, no second clock.

### ⚑ NO MIGRATION IS NEEDED FOR THE TIMING — an earlier S65 claim was wrong

Claude first said there was no record of when a mission entered the Pool, and that a `pooled_at` column
would be needed. **Both wrong, corrected in-session:**
- **`pooled_at` already exists** (added `docs/migrations/2026-07-13_o7_cancellation.sql:27`). Its own
  comment: *"PDP climb origin for a RE-POOLED mission."* It is stamped **only** by the re-pool RPCs, never
  on first posting, and by [[d81]] it is deliberately **not** a pricing input (`lib/pdp.ts:36-37`).
  ⚑ **Live: NULL on all 280 missions** — same signature as `accepted_fare`, because the seeders bypass the
  app. Do not read a NULL here as "never re-pooled" until a real re-pool has happened.
- **The "stale draft" problem does not exist.** Posting a draft **resets `created_at` to now**
  (`app/(dispatch)/dispatch/new/actions.ts:381-384`), with a comment saying why: *"without this a draft
  saved hours/days ago would be posted already near/at the ceiling."*
- So **`pooled_at ?? created_at` already means "when did this trip last enter the Pool"** — exactly what
  `lib/spend.ts:143` already reads. A pickup-relative rule needs only `pickup_at` anyway.

**The only migration § V needs is the Driver's opt-in flag** (`driver.accepts_lower_tiers boolean not null
default false`, mirroring `accepts_luggage_runs`), plus the matching change to `accept_mission`. Both in one
file — see the drift rule below.

### ⚑ THE DRIFT RULE — three places, ONE commit

Relaxing the tier match must change all three together, or the Pool lists trips `accept_mission` then
refuses:
1. the Pool query — `app/(app)/pool/page.tsx:107-108`
2. **the SQL guard — `docs/migrations/2026-08-22_accepted_fare.sql:100`** (guard block `:97-108`).
   ⚑ **NOT the 2026-08-11 file** — the 08-22 migration drops `accept_mission(uuid)` at `:67` and recreates
   it with `p_fare`, carrying its own copy of the guard. Editing the 08-11 file changes **nothing** live.
3. the Pool card.

**The invariant:** the SQL guard is a deliberate **superset** of the app filter, so drift can only ever
*hide* a trip, never refuse one the Pool offered. Relaxing the app side alone **inverts** that guarantee.
Reasoning at `docs/migrations/2026-08-11_accept_mission_eligibility.sql:60-65` and
`app/(app)/pool/page.tsx:93-96`.

### STILL TO DESIGN WHEN THIS COMES BACK

- **The Pool card must name the class** so nobody accepts a Business fare thinking it is First, plus a
  contrast cue marking it as a deliberate downgrade they opted into. **D25 preview loop applies** — mock it
  and get sign-off before building.
- **The toggle** in Driver Account → *Where you work*, mirroring `accepts_luggage_runs`. Also D25.
- ⚑ **THE KILL SWITCH GAP.** The founder made the volume risk conditional on *"it would be easy to turn off
  if we have issues with a Driver"*. **Today that means editing a row by hand** — there is no back-office
  (§ F2, a future pillar). A per-Driver switch anyone can click is **its own build**, and the founder
  should know that before relying on it as the safety net.
- ⚑ **The seeder would silently undo the premise.** `.local/seed/seed-fleet.mjs:49` still seeds Karim with
  `cat: "business"` and `:268` writes `category: d.cat` verbatim, so a fresh fleet un-strands him by
  accident and hides the very bug § V exists to fix. Add to the seed-fix list.

### The V-Class re-classification (already done in the catalog)
`Classe V` is `tier: "luxury"`, body `van` (`lib/vehicle-catalog.ts:65`). **Vito stays Business** — founder
confirmed, already correct, no edit. Matches how the market draws the line (Transfeero: Vito = Standard
Van, V-Class = First Class Van).

**Related:** § AB (the paid rung of the same ladder) · § P (expired trips, shipped) · § AE (capacity —
found while scoping this) · § AF (the aggregate version, V2/V3) · [[d85]].

---

## W. Demand-based pricing — PARKED (founder asked to save it, 2026-08-16)

**The founder's question.** Transfeero shows *"High demand for your dates! Prices may rise further."*
on busy dates. Should Kavenue raise its prices the same way? Raised explicitly **"for later once we
lock prices"** — not a request to build.

**Claude's advice at the time, for whoever picks this up:**
1. **We already have demand pricing — it's the auction.** A trip nobody takes climbs toward the
   ceiling (§6). That is demand responding to what actually happened on *this* trip, not a guess
   about a date. Transfeero's banner prices a *date*; our curve prices a *trip*.
2. **A surge multiplier is the one thing §0 forbids.** Kavenue moving the fare on its own initiative
   is Kavenue controlling the price — the behaviour that pushes a platform from **agent** toward
   **principal**. The Business sets its own Ceiling; Kavenue only recommends. Any demand feature has
   to keep that true.
3. **§8 is the principled version of the same instinct.** Fill rate and time-to-fill already tell us
   when the card is low on a route or a period, learned from outcomes rather than a hand-maintained
   event calendar. The Riviera's spikes (Cannes, the Grand Prix, the yacht show) are known better by
   the hotel than by us — and the hotel already sets the ceiling.

**If it is ever built,** the safe shape is a *recommendation* that moves (a higher pre-filled ceiling
on a date the data says fills badly), never an imposed multiplier, and never applied after posting.

**⚑ Do not confuse with SPEED WIN**, which is the Business's own checkbox at any lead time (§6) and
is already the answer to "I'm worried this won't fill".

---

**⚑ THE FOUNDER'S REFINEMENT (2026-08-20) — measure demand from OUR OWN BOOKINGS, not from a calendar of
events.** Their words: *"we can't know all events on all locations, so we can create a kind of algorithm or
just simple code that understands that in the city or region there is a lot of bookings compared to the last
weeks or month, so that way we know that the demand is high and it's an opportunity for all to make more
money."*

This is a better idea than the event calendar and it should be recorded as the shape this feature takes:
- **It needs no external data.** A count of missions posted per zone per week, against that zone's own
  trailing average, is a query we can already run. No events API, no guessing which festival matters.
- **It is honest in a way a surge multiplier is not.** It measures what actually happened to us, in the same
  way §8 learns route prices from fill rate rather than from a published tariff.
- **⚠️ IT STILL MUST NOT MOVE THE FARE BY ITSELF.** See point 2 above — that is the line between agent and
  principal, and it is a legal position, not a preference. The demand signal has to surface as **advice to
  the Business**, e.g. *"bookings in Nice are up 40% on the last four weeks — trips are filling near the
  Ceiling"*, leaving the Business to raise its own Ceiling. Kavenue recommends; the Business decides.
- **The Driver side of the same signal** is the honest "opportunity" the founder is pointing at: a Pool that
  is busier than usual is worth telling Drivers about, and it costs nobody anything.
- **Open:** what the window is (week vs month), what counts as "a lot" (a percentage over trailing mean, or
  a fill-rate/time-to-fill drop, which §8 already tracks), and whether it is a Dispatch banner, a Pool
  banner, or both.

## X. Taxonomy cleanup — rename `luxury` → `first`, retire the vestigial `van` 🔨 (founder, 2026-08-16)

**The ask.** The frontend says **Eco · Business · First**; the code and the DB say `eco` ·
`business` · `luxury`. The founder asked whether the code side can match. Answer: yes, and it is not
technically hard — **but not during the pricing build**. Deliberately deferred.

**What it actually costs**
- **DB: one line.** `alter type vehicle_category rename value 'luxury' to 'first';` — metadata only,
  no row rewrite, instant, and every stored row follows automatically (enum values are stored as
  OIDs, not text). Verified there is **no SQL function, RLS policy or CHECK that embeds the literal**
  — `rate_card_for` / `mission_price` take the enum as a parameter, and `rate_card`'s CHECK is
  `tier <> 'van'`. The only SQL occurrences are the enum definition and the `rate_card` seed rows.
- **Code: 58 references across 14 files** (`lib/vehicle-catalog.ts`, `lib/format.ts`,
  `lib/driver-service.ts`, `lib/database.types.ts`, `app/(app)/pool/page.tsx`,
  `app/(dispatch)/dispatch/new/actions.ts`, both settings files, `app/api/seed/route.ts`,
  `components/service-class-fields.tsx`, `components/dispatch-calendar.tsx`, three test files).
  Mechanical, but it includes the Pool query and the new-mission action.
- **⚑ It cannot be gradual.** The instant the enum renames, any running code sending `'luxury'` to
  PostgREST fails. Options: (a) rename + deploy in one short window — fine in beta, nobody is on it;
  or (b) `ADD VALUE 'first'` → deploy → backfill, which never breaks but leaves `'luxury'` behind
  **forever**, because Postgres cannot drop an enum value without recreating the type.

**Why not now**
1. **Zero user benefit** — every screen already reads "First" (`lib/format.ts` `TIER_LABEL`).
2. It touches the exact files steps 3–5 of the pricing engine are rewriting. Tangling a rename into
   those diffs means a breakage can't be attributed to either change.
3. **S44 is the precedent:** the PickUp → Kavenue rename was run as its own isolated session with
   partitioned edit agents and four adversarial verify lenses, precisely because a rename is wide,
   shallow, and easy to get 95% right.

**Do it as one isolated job after the pricing engine ships**, and bundle the second half:
**`'van'` is vestigial in `vehicle_category`** (a mission's category is the *tier*; body has been its
own axis since `2026-06-19_vehicle_taxonomy_and_eta`). Both want the same surgery — recreating the
type to drop a value — so doing them together costs barely more than doing one.

---

## Y. The cancellation penalty is too weak on a cheap trip 🔨❓ (founder, raised repeatedly; parked with intent 2026-08-17)

**The founder's case, in their words and said more than once:** *"a €50 trip … a driver would be tempted to
cancel."* A 100% penalty sounds absolute, but on a Nice → Nice run it is fifty euros — cheap enough to buy your
way out of a bad afternoon. The penalty is meant to protect a Business that has a Guest waiting, and its
deterrent value does not scale with the fare the way the damage does: a hotel left without a car at 30 minutes'
notice has the same problem whether the trip was 50 € or 300 €.

**Status: 100% stays for now** (founder, 2026-08-17). This is a rule change to money, not a display choice, so
it waits for a decision rather than being slipped into another step.

**The shapes worth pricing out when it comes up** — none decided:
1. **A floor.** "100% of the fare, minimum X" — the founder floated **€150** *as an illustration, not a
   proposal*. Simple to explain and to enforce. The question is what X is: too high and a Driver who genuinely
   breaks down owes three times the job; too low and it changes nothing.
2. **A multiplier near pickup.** The damage is about *notice*, not price — a cancellation two weeks out costs
   the Business almost nothing, one at T−1h costs them a Guest. The Business side already ramps this way
   ([[d45]]: free while pooled, 50% at −5h, +10%/h). The Driver side is flat, which is the asymmetry.
3. **Visible reliability marks.** Non-monetary, and the thing professionals actually respond to. Needs the
   review/reputation layer, which is gated on the community work.

**⚑ THE THIRD QUESTION, AND THE FOUNDER RAISED IT FIRST (2026-08-20): WHO ACTUALLY RECEIVES THE MONEY?**
Asked while reviewing the Business-side "Driver cancelled" block, and it stopped that block shipping with a
figure on it. In their words: *"the hotel will in the end not pay anything and won't charge their clients, so
what do we do with the driver's money?"*

That is the hole in the current position. `docs/06` §1 makes the penalty an indemnity running **Driver →
Business**, and 100% of the fare is presented as if it made the hotel whole. It does not correspond to a loss:
the trip never ran, the Business paid nothing and billed its Guest nothing, and the trip goes straight back
into the Pool. **The hotel's real damage is the price difference when it re-fills dearer** (SPEED WIN comes on
automatically under 24h — `docs/06` §6), the **whole fare when it never re-fills at all**, and sometimes
**nothing**. The 100% figure is not sized to that damage; it is sized to **deter the Driver**. Two different
jobs, and they point at different recipients — which is exactly why `docs/06`:71 and the O7 migration header
disagreed for a month without anyone noticing.

**Three destinations, none decided:**
1. **Damage first, remainder to Kavenue.** The Business is made whole on what it actually cost them; what is
   left funds the platform that had to re-fill the trip. The standard "actual damage + deterrent" split, and
   it removes the perverse incentive in (2). Needs the re-fill OUTCOME before it can settle, so it is the most
   machinery.
2. **All to the Business** — today's written position. Simplest, and the Driver-facing copy already assumes it.
   But it over-pays a hotel whose trip re-fills in ten minutes, and it turns a service failure into revenue.
3. **All to Kavenue** — what the O7 migration header said. Pure deterrent, but Kavenue then profits from a
   failure, the hotel gets nothing for a real disruption, and collecting a penalty in its own name is the
   weakest of the three against the agent position in `docs/01`.

⚑ **Nothing is collected during the beta either way**, which is what made parking it safe. **Consequence
already shipped:** the Business's "Driver cancelled" block states only what is certain — a Driver held this
trip, when they walked, and their reason. No amount, no recipient. Decide the money and the block gains a
line; decide it wrong and a hotel has been told it is owed something it is not.

**⚑ Two things already settled that constrain the answer.**
- **A penalty must be predictable** (`docs/06` §6): people plan around it, unlike the auction, which must not
  be. Whatever shape wins has to be stateable in one sentence a Driver can repeat.
- **The basis question is open too, and pairs with this one.** After S61 the penalty is the ONE figure a Driver
  sees gross — `docs/06` §1 makes it an indemnity Driver → Business, so no commission comes off, and a Driver
  who has seen 87,00 € all week is told they owe 98,86 €. Charging 100% of what they were going to be *paid*
  would keep the deterrent story clean ("you lose exactly what you would have earned") at the cost of a
  slightly smaller penalty. Decide both together — they are the same conversation.

**Where it lives when it happens:** `driver_cancel_mission` (the amount), `lib/cancellation.ts` (the shared
ramp), `app/(app)/rides/cancel-noshow.tsx` (the copy). Money-critical: it ships with
`.local/probe/migrations-2026-08-11.ts` re-run and the money-invariants tests updated.

## Z. Should waiting be charged at an intermediate STOP? 🔨❓ (founder, 2026-08-20)

**The founder's case:** *"If a Guest at a stop takes too long over a certain amount of time."* Today the
meter is anchored to the PICKUP only — 40 minutes held at stop 2 is free, the same 40 minutes at the pickup
bills. A Driver waiting outside a shop while the Guest runs an errand earns nothing for it.

**What `docs/06` §10 says today.** Dwell time is **deliberately unpriced in V1**, on the reasoning that a
flat fee would charge the same for a 2-minute stop as a 20-minute one. That reasoning argues against a *flat
fee per stop*; it does not argue against a **metered** wait, which is exactly what we already do at the
pickup and which prices short and long stops differently by construction.

**⚑ The machinery already exists**, which is what makes this cheap: the Driver taps **"Reached — <stop>"**
on every stop, so the arrival instant is recorded (`stops_reached`), and `mission_waiting()` is already a
per-minute meter with a courtesy window and a cap.

**The shape worth pricing out — none decided:**
1. **A courtesy window per stop, then the same per-class rate.** Shorter than the pickup's 20 min — a stop is
   an errand, not a hotel lobby. 5 or 10 minutes is the obvious candidate.
2. **One shared cap for the whole trip**, so a trip with four stops cannot run away.
3. **Who starts the clock.** At the pickup the origin is when the Guest was DUE ([[no-show-clock-origin]] —
   never the Driver's arrival tap). At a stop there is no "due" time, so the only available origin IS the
   Driver's "Reached" tap — which is the exact anchor that was a live exploit at the pickup. **This is the
   hard part of the design, not the rate.** It needs a guard, e.g. the tap is only valid inside the routed
   corridor, or the stop clock only counts once the Guest is off the vehicle.

**Pairs with:** § Y (the cancellation penalty) and the waiting rate itself — all three are the same
conversation about what a Driver's time is worth when the trip is not moving.


---

## AA. SPEED WIN as a badge the PRICE can earn, not only a box the Business ticks 🔨 (founder, 2026-08-22 — DECIDED, not built)

**Decided in [[d83]].** A pooled trip whose fare climbs past **~70 % of its Ceiling** shows the SPEED WIN
badge on the Pool card, exactly as if the Business had ticked it. Same badge, same name, same meaning to a
Driver: *this one is priced hot — take it before someone else does.*

**Why it is not a lie, and not a dark pattern.** §6 defines SPEED WIN as *"the same curve with a higher
starting point — nothing more"*. A trip that **climbed** to 70 % and one that **opened** at 70 % are in the
identical state, and the Driver's decision is identical. The badge describes the PRICE, never the Business —
a last-minute booking is not a hotel being judged for anything. And the claim is true, which is the whole
difference between a cue and a manipulation.

**Why it will be rare, which is what makes it worth having.** At scale FOMO clears trips early: a Driver
takes a good fare rather than risk losing it, and does not wait for a Ceiling they cannot see. So crossing
70 % means the trip genuinely **failed to clear**, which is exactly the trip that deserves attention.
`docs/06` §5 already says the same: *"At scale this changes. With enough Drivers, trips clear early."*

### ⚑ IT RUNS BACKWARDS IN BETA — ship it behind a switch
With few Drivers, trips sit, and **most of them would earn the badge**. A badge on everything is wallpaper.
Build it with an on/off flag and turn it on when the Pool is liquid enough that it means something.
**This is the only real blocker; the feature itself is small.**

### What it needs
- A threshold constant next to the curve in `lib/pdp.ts`, and a predicate — `isHotPrice(m, now)` — beside
  `isAtCeiling`. It is a pure read, no migration, no column.
- The badge already exists (`components/mission-card.tsx`, `app/(app)/missions/[id]/page.tsx` both render
  `speed_win`); this widens the condition from `mission.speed_win` to `mission.speed_win || isHotPrice(m)`.
- **UI → preview first (D25).**

### The one objection, raised and dropped — recorded so it is not re-derived
A badge flipping at *exactly* 70 % lets a Driver invert their net fare into the Business's Ceiling
(`net ÷ 0.616`), which is the number §6 hides so nobody can compute how much is left to gain by waiting.
**Dropped**, because the exploit only pays off if waiting is safe, and waiting is only safe in a thin Pool —
in the liquid Pool the badge is for, a Driver stopping to do arithmetic loses the trip. **If it is ever
wanted, the fix is three lines:** jitter the threshold per mission (say 65–80 %) off the same
`xmur3(mission.id)` seed the curve already uses. Un-invertible, identical cue.

**Pairs with:** § W (demand pricing, parked) and `docs/06` §8 (learned route prices) — the badge that would
mean *"this is a good price for THIS route"* needs §8's baseline and ~15 trips per route to exist first.

---

## AB. A trip that will not fill near its pickup — ask the Business to raise the Ceiling 🔨❓ (founder, 2026-08-22)

**The gap [[d82]] left open, and the founder found it while asking about a "hard SPEED WIN at a later
stage".** They are reaching for something real, but it cannot be SPEED WIN: near the pickup the price is
already AT the Ceiling, so there is nothing left to give. Every lever we have is spent.

**The only lever left is raising the Ceiling — and that is the Business's money**, so it cannot be automatic.
§0 is explicit: *"The Business sets its own Ceiling. Kavenue recommends a price; it does not impose one."*
It has to be a genuine ask: *"nobody has taken this and it's in 3 hours — raise your maximum to €X?"*

**This is the one place a popup or a notification is honestly earned** — unlike the re-pool SPEED WIN
approval that [[d82]] made unnecessary, here something real is being asked of the Business and only they can
answer it.

### Why it is not next
It needs **notifications** (Resend), which the founder has deferred until the in-app experience is finished.
A prompt nobody sees because they are not looking at the Dispatch tab is worse than no prompt.

### Open questions when it comes up
1. **What does it suggest raising to?** The rate card has no number above the ceiling. A percentage step
   (+10 %, +20 %) is arbitrary; the honest anchor might be what similar trips actually cleared at, which is
   `docs/06` §8 again.
2. **When does it fire?** T−5h is when the price tops out and the trip stops improving — that is the natural
   trigger, and it is also the SPEED WIN nudge's own threshold.
3. **How often may it ask?** Once per trip, or it becomes nagging.
4. **Does raising the Ceiling re-open the auction?** Under the §6 curve the trip is past T−5h and pinned at
   the top, so a raised Ceiling would make it jump straight to the new maximum, not climb to it. That may be
   right — the trip is urgent — but it should be decided, not discovered.

**Pairs with:** § P (expired / unfilled trips, shipped) — that is the same trip one step later, after nobody
took it at all.

---

## AC. Business enrolment tutorial — teach the model, don't compress it into microcopy 🔨 (founder, 2026-08-22 — AFTER V1)

**Where this came from.** Four rewordings of the booking screen's price line were mocked up and all four
rejected ([[d84]]): *"people are not pros in that new to them domain of work."* The founder's read is that
the problem is not the sentence, it is that nobody has ever explained the model — and no sentence on a busy
form can carry it.

**What it is:** an enrolment tutorial / short training a Business goes through when they join, covering how
Kavenue actually works and how to deal with Drivers.

**Timing — explicitly AFTER V1 is complete** (founder). It teaches the finished product; building it against
a moving one means rebuilding it.

### What it has to teach — the things every screen currently assumes are already known
1. **The auction, and why the price they see is not the price they pay.** They set a Ceiling; the price opens
   at the floor and climbs; a Driver takes it somewhere in between; **they are billed what that Driver
   accepted, not the Ceiling.** This is the single biggest unexplained idea in the product.
2. **Why booking early is cheaper** — the whole argument for the auction, and currently made nowhere.
3. **What the Ceiling is** — their maximum, their decision, and the one number to quote their Guest from.
4. **When the price stops moving** — T−5h. §6's publishable sentence belongs HERE, where there is room to
   explain it, rather than crammed into a 12px line.
5. **SPEED WIN** — what ticking it does, and when it is worth it.
6. **Dealing with Drivers** — amendments, releases, cancellations, what a penalty is and who pays it, and
   what to do when a Driver goes quiet.
7. **Waiting time and no-shows** — the free window, when the clock starts (⚑ when the Guest was DUE, never
   the Driver's arrival — [[no-show-clock-origin]]), and what it costs.

### Constraints
- **It must not publish the schedule.** §6: publish the RULE, never the schedule. "The price rises in steps
  until 5 h before pickup" is safe; anything about step sizes or timings is not.
- **Kavenue is an agent, never the principal** (§0). The tutorial talks about how the marketplace works, and
  must not read as Kavenue selling transport.

**Pairs with:** `project/GUIDANCE_AUDIT.md` — the existing in-app guidance inventory and its gaps. That
audit is about guidance *inside* the screens; this is the thing that should come before them.

## AD. `pickup-marketplace.vercel.app` is still live and serving production ⚙️❓ (found 2026-08-23, S65)

**Founder's call — raised in S65 and deliberately left open.** They pushed back on scope: the ask was to
rename the GitHub repo, not to change Vercel. Recorded here so it is not lost. **Do not re-raise unprompted.**

**What it is.** `https://pickup-marketplace.vercel.app/login` → HTTP 200, `<title>Kavenue</title>`. It is a
live production alias. Renaming the *Vercel project* in S49 (`pickup-marketplace` → `kavenue`) did **not**
release its `.vercel.app` domain: Vercel mints that host from the project name at creation, **adds** the new
aliases on rename, and leaves the old one bound and auto-aliasing production. **There is no rename operation
for a `.vercel.app` domain — the only two states are bound and detached.**

**Why it outranks the repo slug it was found next to.** The repo name was a git URL. This is a running,
crawlable, publicly reachable site serving the real production build under a name that is a **registered
trademark of Pickup Services SAS / GeoPost (Groupe La Poste) in class 39 — transport, the exact sector**
([[rebrand-from-pickup]]). That is the thing a trademark search actually surfaces.

**Nothing real depends on it** — it is a broken shopfront, not a fallback:
- `lib/hosts.ts:11,46` treats `*.vercel.app` as a shared host and returns `null` for the role subdomain, so
  Driver and Dispatch collide on one origin — the session-overwrite bug already recorded at `DECISIONS.md:128`.
- its origin is not in the Supabase redirect allowlist (`.env.example` lists only the four `kavenue.fr`
  origins + localhost), so magic-link sign-in **silently fails** there. Anyone landing on it cannot sign in.

**The fix, when the founder wants it** (their dashboard, mutating — do not do it for them):
Vercel → project `kavenue` → Settings → Domains → remove `pickup-marketplace.vercel.app`.
`driver.kavenue.fr` and `dispatch.kavenue.fr` are separate aliases and are unaffected.

⚑ **Check the landing project too** — `kavenue-landing` was created later, so it likely never had an old-name
host, but nobody has looked.

## AE. Nothing checks that a car can CARRY what was booked ⚙️🔨 (founder, 2026-08-23 — found while scoping § V)

**The founder's question, verbatim:** *"check if we have created a limitation for Van who checked the
luggage van? I want to make sure that each body respects what they can carry and won't be surprised on set."*

**The answer, split in two.** *Who the car is* is enforced. *How much it holds* is not modelled anywhere.

✅ **Body type IS enforced, in both layers** — `required_body_type is null or = v.body_type`, at
`app/(app)/pool/page.tsx:125` and in the live SQL guard `docs/migrations/2026-08-22_accepted_fare.sql:101`.
A Sedan Driver can **never** take a luggage run (`:104-105`), and the luggage checkbox only renders for a
Van (`components/driver-vehicle-fields.tsx:100-127`, re-checked server-side). **Don't re-litigate this half.**

❌ **Capacity does not exist.** No bag capacity for any body type or model in `lib/vehicle-catalog.ts`. The
accept guard tests tier, body, and luggage-opt-in — **no `pax_count`, no `luggage_count`, no seats.**
`vehicle.seats` is dead data: every Driver types it free-text, 7 of 9 are NULL, and it is read by exactly
one display string (`app/(app)/settings/page.tsx:163`). `accepts_luggage_runs` is a **willingness** switch,
not a capacity limit — its own copy says *"turn it on if you're happy to carry luggage"*. Ticking it commits
a Van Driver to any bags-only run, **in any quantity**.

⚑ **The line to keep straight:** everything protecting the Driver today is a *hint on the Business's screen*
or a *number on the Driver's pre-accept screen*. Neither is a limitation. The only real limitation is body
type, and it goes silent the moment the Dispatcher leaves Body on "Any".

### The two ways a Driver gets surprised on set

1. **"Any" body + a big party.** `seatCap()` returns the **Van** cap (7) when no body is chosen
   (`lib/passengers.ts:32-34` — the comment says so deliberately). The Dispatcher adds up to 7 Guests, gets a
   grey note that blocks nothing (`components/passenger-list.tsx:53,76-84`), body is written NULL, and both
   layers read NULL as *anything qualifies*. A 4-seat Sedan Driver can accept it.
   **Live 2026-08-23: 17 missions have pax_count > 4, and all 17 already specify a body.** The hole is real
   but unexercised — what protects you is a human ticking Van, not code.
2. **The load changes after the Driver commits.** `pax_count` and `luggage_count` are on the info-edit
   whitelist (`app/(dispatch)/dispatch/[id]/edit/actions.ts:107-113`) and info edits are open on `pooled`,
   `accepted` **and** `confirmed` (`:36`) — no consent, by design (D39 classed bags as "info"). The Driver's
   run view shows **neither count** (`components/mission-run-view.tsx` — zero hits for either). So 2 bags →
   12 bags is invisible to a Driver who already said yes.

### ⚑ The one-line bug

The warning written for exactly this case — *"8 bags is a lot even for a Van"* — is switched **off** for
luggage-only runs. `app/(dispatch)/dispatch/new/mission-form.tsx:282` opens with `!luggageOnly &&`. **The one
trip type that is entirely about bags is the only one with no bag guidance.**
**Live: 6 missions carry more than 8 bags; the largest is 14.**

### Fix list, cheapest first

1. **`createMission`: if `pax_count > 4` and no body was chosen, force `required_body_type = 'van'`.** One
   line, and every layer below already enforces body. Closes surprise #1 outright.
2. **Drop the `!luggageOnly &&`** and give luggage runs their own bag threshold.
3. **Put both counts on the Driver's run view**, and treat an *increase* in pax/bags after acceptance as an
   **amendment needing consent**, not a silent info edit. (Touches D39 — that reclassification is a decision,
   not just a code change.)
4. **Put headcount and bags on the Pool card** — the "state on the row, not in a summary" rule; today they
   are one tap deeper, on the detail page (`app/(app)/missions/[id]/page.tsx:344,353`), which is the only
   defence in the whole system and is a bare number with no comparison to the Driver's own car.
5. **`pax_count` is a row count, not a headcount.** The form never asks "how many people?" — it counts Guest
   rows, and the copy says names are optional. A party of five booked under one lead name posts as
   **1 passenger**. Worth fixing on its own, because it makes every number above unreliable.

⚑ **Not a § V blocker.** § V changes which *class* of work a Driver sees; this is about what fits in the car,
and it is already true today with no § V. But § V widens the pool of cars that can reach a given trip, so
this gets slightly more likely, not less.

## AF. Let a class "come and help" when it can SEE that another class is short ⚙️🅥 (founder, 2026-08-23 — V2/V3)

**Founder's own words:** *"maybe the solution is about offer and demand — a class can come and 'help' when
the system understands that during this period a class has a hard time filling the demands? Or maybe this is
something we should work on after V2 or V3?"*

**It is the right idea, and it is V2/V3 — but not because it is hard.** Because it is **unmeasurable today.**
"This class is struggling to fill demand in this period" is a statistical claim, and the live marketplace is
**9 Drivers and 280 missions**. Any detector built on that fires on noise.

⚑ **§ V is the n = 1 version of exactly this idea.** A trip sitting unfilled near its pickup *is* the signal
that supply is short — for that class, at that moment, in that place — measured on the only unit there is
enough of. Same insight, one trip instead of an aggregate. So this is not a competing design; it is the same
design once there is enough data to average over.

**The sequence, and the two halves feed each other:**
1. **Now** — the per-trip rule (§ V). One number, no statistics.
2. **Now** — start recording Pool events (§ AG). They cost nothing and cannot be recovered later.
3. **V2/V3** — this. Measurable *because* of step 2.

**What it would need when it comes:** fill rate by class × region × period; a definition of "struggling"
that is not just "one trip did not fill"; and a decision on whether helping is automatic or still opt-in per
Driver. ⚑ The § V fairness paradox does not go away at aggregate scale — it sharpens. A detector firing in a
genuinely quiet season is a detector redistributing scarce work downhill, which is the case the founder
already rejected. **The trigger must be "this class is short relative to ITS OWN demand", never "this class
is quiet".**

---

## AG. Record every state transition — `status_event` cannot currently do it ⚙️🔨 (founder, 2026-08-23)

**Founder, when told nothing records a mission entering the Pool:** *"We need records of everything and
that's for us in admin side and for analyses and disputes and learn behaviour and getting better."*
Standing principle — saved to memory as [[record-every-event]].

**The gap.** `status_event` exists (`docs/kavenue_schema.sql:139`) but a CHECK constraint permits only
`en_route`, `arrived`, `on_board`, `completed`. It **cannot** record a trip being pooled, accepted,
cancelled, expired, or re-pooled. So the audit trail covers the driving steps and nothing else.

**Why sooner rather than later:** analysis can be added whenever you like, but **you cannot backfill events
you never wrote.** Every week without the log is a week of behaviour that can never be studied. That is true
even though nothing reads it yet — do not argue this one away as YAGNI, it has already been heard and
rejected.

⚑ **A concrete instance of the damage, found in S65.** Posting a draft **resets `created_at` to now**
(`app/(dispatch)/dispatch/new/actions.ts:381-384`). That is correct for pricing — it stops a week-old draft
opening at its Ceiling — but it fixes the price by **destroying the record** of when the draft was created.
**The clean version writes `pooled_at` on first posting too and leaves `created_at` alone.** Small change,
and it is exactly the shape the founder asked for. ⚑ Check `lib/pdp.ts` first: [[d81]] deliberately makes
`pooled_at` *not* a pricing input, so making it authoritative for pool-entry must not quietly feed the curve.

**Scope sketch:** widen the `status_event` CHECK to the full `mission_status` enum (plus a `pooled` /
`re_pooled` distinction), write a row from every RPC that changes status, and stamp `pooled_at` on first
post. Additive; the founder applies the migration.

