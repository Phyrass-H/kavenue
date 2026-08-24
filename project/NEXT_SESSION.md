# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.

---

We're continuing Kavenue (B2B VTC booking marketplace).

**This is a local session on the Mac** — working directory `…/02_Cactus/Kavenue/Kavenue_project_dev`, with
`.env.local` and `node_modules` in place. Don't spend a turn working out where you're running.

Everything works: `npm run dev`, the browser preview, reads against the real Supabase DB, the D25 preview loop.

⚑ **`main` ONLY ACCEPTS COMMITS CI HAS ALREADY PASSED — so push a BRANCH first, then `main`.**
The ruleset `main — CI must pass` (created 2026-08-10, `enforcement: active`, **no bypass actors**) requires
the check **`types · tests · build`**. Required checks are evaluated **per commit SHA**, which is the whole
trick:

    git push origin main:s64-my-work     # CI runs on the branch, ~1 min
    gh run list --branch s64-my-work     # wait for `success`
    git push origin main                 # SAME SHAs, now checked → accepted

**No PR is needed.** S63 did exactly this — see the branches `s63-backlog` (2026-08-20) and `s63-close`
(2026-08-21), each a CI run followed by a push to `main`. Pushing to `main` FIRST is what fails, because
brand-new SHAs have no check yet: *"Required status check `types · tests · build` is expected."*

⚑ **S64 misread that rejection as "a PR is the only route" and opened PR #1** — the first this repo ever had —
which made the founder click a Merge button for no reason. It worked, and a PR is a legitimate second route,
but it is ceremony this project does not need. `CLAUDE.md` still says **do not open a PR unless explicitly
asked**; that stands, and now there is no reason to.

⚑ **The rule is INVISIBLE FROM THE CODE.** `.github/workflows/ci.yml` is in the repo, but the ruleset that
makes it *required* is a GitHub setting outside it. Read it with
`gh api repos/Phyrass-H/kavenue/rulesets`.

**⚑ THE LIVE RESUME POINT IS THE BLOCK HEADED "★★ START HERE" (2026-08-22, S64 — closed).**
Search for it. Everything above it is history kept for its decision trail; several older "START HERE" and
"NEXT" headings are superseded and say so. **Steps 0–5 of the pricing engine are shipped and live — the §6
curve landed 2026-08-22, with both its migrations applied and every probe green.** What is left is listed in
that block, smallest first. Open by confirming it in one line, not by re-offering a menu.

START BY READING — **just these four**; they get you fully up to date without bloating context:
- `CLAUDE.md` (root) — hard rules + glossary (auto-loaded anyway).
- **This file** (`project/NEXT_SESSION.md`) — the current state + what's next (the resume point).
- `project/CHANGELOG.md` — plain-language history, the **recent entries** (the big picture, fast). Older entries live in
  `project/CHANGELOG_ARCHIVE.md` — read it only if you need the deep history.
- `project/SESSION_LOG.md` — skim the **newest entry (Session 63)** for recent technical detail; Sessions 61–62
  behind it are the commission and the money sweep. Older sessions (1–33) are in
  `project/SESSION_LOG_ARCHIVE.md` — don't open it unless you need deep history.

READ ON DEMAND — open these **only when the task actually touches that area** (this is the big context saver,
and it loses nothing — the docs are all still here, just read when relevant):
- `project/DESIGN_BRIEF.md` — for any UI/design work (brand, navy `#25344C`, screen inventory, constraints).
- `docs/06_Pricing_Commission_Payments.md` — **READ IN FULL BEFORE THE NEXT JOB.** §6 is the curve you are
  building; §13 is the build order. Do not price anything from memory.
- `project/SPEND_BRIEF.md` § 9 (§ S, Spend pass 2 — queued, not next) · `project/NEEDS_CLOSING_BRIEF.md` —
  § Q, both slices, and the two money traps that must not be re-introduced.
- `project/BACKLOG.md` — **§ Y** (the cancellation penalty, incl. who receives it) · **§ Q6** (the unclosed-trip
  pile) · **§ U.4** (hard-closing on observed arrival) · § V · § W · § X · § Z are the live ones; § M and § L are
  older dumps. · `project/DECISIONS.md` (newest **D77**) · `project/IDEAS.md` — for planning, "why was this
  decided", or parked ideas.
- `project/GUIDANCE_AUDIT.md` — the full in-app guidance inventory + gaps + roadmap (for any guidance/microcopy work).
- `docs/` — `00`–`05` + `Kavenue_Phase0_Data_Spine.md`: the canonical spec; read the doc for the area you're in.
- `docs/kavenue_schema.sql` (large) + `docs/migrations/` (`2026-06-17_driver_service_area`,
  `2026-06-19_vehicle_taxonomy_and_eta`, `2026-06-23_named_passengers`, `2026-06-25_mission_driver_section`,
  `2026-06-27_mission_reference`, `2026-06-27_mission_guest_contact`, `2026-06-28_mission_stops_reached`,
  `2026-06-28_business_profile_fields`, `2026-06-28_business_address_and_prefill`,
  `2026-07-04_luggage_run_phase1`, `2026-07-05_mission_info_edited_at`,
  `2026-07-07_mission_amendment`, `2026-07-10_mission_info_change`, `2026-07-13_o7_cancellation`,
  `2026-07-19_agreed_release`, `2026-07-19_repool_speedwin_window`, `2026-07-19_no_show_clock_origin`,
  `2026-07-19_no_show_airport_label`, `2026-07-19_guest_ready_at_guard`, `2026-07-22_waiting_fee`,
  `2026-07-22_airport_accent_fix`, `2026-07-22_guest_ready_at_guard_fix`, `2026-07-25_accept_always_confirms`,
  `2026-07-28_driver_account_and_documents`, `2026-07-30_mission_check_in`, `2026-07-31_expired_missions`,
  `2026-08-09_cancel_fee_30min_steps`, `2026-08-09_waiting_settles_on_board`, the three 08-10/08-11 drift
  migrations, `2026-08-10_mission_close_answer`, `2026-08-17_commission`,
  `2026-08-17_transport_vat_snapshot`, `2026-08-18_waiting_rate_by_class`,
  `2026-08-20_airport_pickup_is_the_pickup`) —
  **ONLY** for schema/data work. (All applied to the live DB.)
- For any **big read** (the schema, a wide code sweep), prefer a **subagent** that reads it and returns just the
  answer — so the bulk never enters the main conversation.

## HOW THE FOUNDER WANTS TO WORK (standing preferences — honor all)
1. **Show a preview FIRST for any UI/design job.** Build a self-contained inline mockup from the real tokens +
   data (the visualize widget) — or, for a *width/layout* tweak, apply the proposed CSS live in the browser and
   screenshot it — get the founder's sign-off, *then* implement, and make what ships **match the approved
   preview**. This is the D25 design loop, a hard expectation.
2. **Features + polish FIRST; APIs / third-party integrations LATER.** Get the in-app experience right before
   wiring external services. **Defer** (capture, don't build yet): notifications (Resend), payments (Stripe),
   real email/magic-link auth, flight tracking, analytics/monitoring, the admin verification workspace. The
   founder green-lights the integration phase explicitly. **Additive DB migrations are fine** (see below).
3. **No "dirty routes."** Fix the real root cause in the codebase's idiom — never a hidden hack. Pragmatic
   MVP shortcuts are OK *only if flagged* so the founder can accept the debt; surface anything you cut.
4. **⚠️ ASK BEFORE YOU START.** Do NOT read this file and launch straight into the listed priority — it records what *was*
   planned, not what the founder wants today. Orient, propose the scope in 1–2 lines, wait for a yes. (S44: the rename was
   started unprompted and the Driver-card prep had to be halted mid-turn.)
5. **⚠️ BE BRIEF — context is a real budget.** In S44 ~**83% of the context window went to Claude's own chat messages.**
   Report results, not narration. **Never post "still working / still waiting" turns** — background tasks re-invoke you
   automatically, so wait silently. Don't restate plans or re-explain finished work. Push big reads into a **subagent**
   that returns just the answer. Long-form detail belongs in `project/SESSION_LOG.md`, not the chat.

## DB MIGRATIONS — Claude can't run them; the founder does
The schema is already applied (hard-rule #4). For an **additive** column/enum: write the SQL to
`docs/migrations/<date>_<name>.sql`, give the founder the one-liner, and they run it in the **Supabase SQL
editor** (Claude's app keys go through PostgREST = rows only, NOT DDL). Then build + verify + deploy. The DB
also keeps the running app's data, so the dev server reads the **real** Supabase DB.

CURRENT STATE (live, deployed from `main`):
- **⚑ THE APEX IS NO LONGER THIS APP (2026-08-05).** `kavenue.fr` + `www.kavenue.fr` were moved to a **separate
  Vercel project + separate repo** for the marketing site (`Phyrass-H/kavenue-landing`, local folder
  `../kavenue-landing`). Founder's call after weighing a route group inside this repo: they wanted a hard wall.
  **This app now only ever receives `driver.kavenue.fr` and `dispatch.kavenue.fr` in production**, so the old
  `LandingSplash` branch in `app/page.tsx` was unreachable and both it and `components/landing-splash.tsx` are
  deleted. `lib/hosts.ts` is untouched — `isProdDomain`/`roleSubOf` still enforce role-per-subdomain in the two
  route-group layouts. Runbook + brand rules for the marketing site: **`project/LANDING_HANDOFF.md`**.
  ⚑ **Brand-token drift is the standing cost of the split:** the tokens are copied verbatim into the landing
  repo's `app/globals.css`. Change a colour here, change it there.
  ⚑ **Landing decisions live in `../kavenue-landing/CLAUDE.md` §0 — NOT in this repo's DECISIONS.md.** As of
  2026-08-06: **D-L1** English only for now (French is a later pass; no i18n routing yet) · **D-L2** *no geography
  anywhere on the site* (no "French Riviera", no city names — it talks to everyone) · **D-L3** no Driver count, in
  any wording. More will have been added since. **If you need to know what the public site says, read that file.**
  The full context pack for that repo is `../kavenue-landing/brief/` (8 files, self-contained — don't duplicate it here).
- **Custom domain + role subdomains — `kavenue.fr` since 2026-07-29 ([[d60]]):**
  `www.kavenue.fr` → 308 → apex (both now on the LANDING project) · `driver.kavenue.fr` = Driver app ·
  `dispatch.kavenue.fr` = Business/Dispatch (both still on this project).
  Each subdomain has its own host-only session cookie. Mapping in `lib/hosts.ts` (no-op on localhost +
  `*.vercel.app`). Registrar **OVHcloud**, DNS zone at OVH (app records + mail records in one zone), Vercel project
  renamed **`kavenue`**. `pickupbedriven.com` is removed from Vercel (404) but still registered.
  ⚑ **DNS at OVH was NOT touched** by the split — only the project↔hostname binding inside Vercel changed.
- **Email — Google Workspace on `kavenue.fr`:** one paid mailbox `phyrass@kavenue.fr`; **`support@` · `feedback@` ·
  `contact@` are free aliases into it** (`support@`/`feedback@` are hardcoded in the app — Driver help card +
  Dispatch settings). SPF + DKIM + DMARC all verified `pass` on a real message. **DMARC is at `p=none`** (monitor
  only) — tighten to quarantine → reject once the reports show only your own senders.
- **Core loop** works end-to-end both sides vs the real Supabase DB (Pool→Accept→run trip; post mission→
  Schedule/Calendar→live status; accounts/records; Mapbox autocomplete + traffic-aware ETA; base+radius Pool).
- **Dispatch redesign** shipped: navy palette app-wide (S14/D24), Geist + Lucide, collapsible sidebar shell,
  Schedule (flight col + T-180 wash), full Calendar, design tokens. **S18:** the dense views
  (Schedule/Calendar/History) now **fill the screen** (a `.dx-main--wide` 1520px modifier the shell applies by
  pathname; the new-mission page is deliberately left at 1120px). The **calendar search** also matches the
  **assigned driver's name** now.
- **New-mission form (`/dispatch/new`) is the most-worked screen** — two-pane (left section cards + a
  **read-only** sticky Summary rail). Passes:
  - **S15/D26** — Pricing grouped into its own card; the Summary rail is read-only.
  - **S16/D27** — Service class = tier tiles; specific-car dropdown restyled, hidden for Eco.
  - **S17/D28** — named Guests (first+surname, multiple, capped by vehicle: Sedan 4 / Van 7).
  - **S18 (bug round)** — **"Review" no longer accidentally posts** the mission (it was a React node-reuse bug:
    the Review button got reconciled into the Post button mid-click). Defence in depth: `createMission` now
    **requires an explicit `intent`** (a stray submit writes nothing); a **double-submit guard** disables all
    submit buttons + shows "Posting…/Saving…" while the action runs (rapid clicks were creating duplicate
    missions — one trip posted 7×); an **irreversible "This is final" warning** at the post step; the address
    fields are a **keyboard combobox** (↑/↓/Enter/Esc).
  - **S19/D30** — a new **"Driver & service" card** (between Trip details and Pricing): requested **languages**
    (display-only, not a hard filter), a **dress code** with a **tier-keyed anti-suit default** (eco→Driver's
    choice · business→Smart casual · First→Business formal — never suit & tie unless picked on purpose), **request
    flags** (meet & greet · greeter · luggage · child seat · quiet · pets), a **meet & greet name board** (typed
    name **or** an attached PDF/JPG/PNG, **auto-filled from the first Guest**), and a **private message to the
    Driver** (revealed post-accept). Migration `2026-06-25_mission_driver_section.sql` (applied). Driver sees
    language/dress/flags pre-accept; board + message post-accept.
  - **S20** — three Trip-details improvements. (1) The old free-text "Reference / notes" is now a **dedicated
    `reference` column** + a compact **20-char Reference** field — a Business-only schedule tag, **hidden from the
    Driver** (migration `2026-06-27_mission_reference`; legacy `comment` column now vestigial). (2) **Luggage + Flight
    number share one line** (equal halves, wraps on mobile). (3) **Passenger phones + a Share gate:** each Guest has an
    optional **phone** + a selectable, highlighted **main contact** (star); a per-phone **Share with Driver** toggle
    (off by default) in the form AND the schedule trip detail. **Airtight privacy** — numbers live in a
    **`mission_guest_contact`** side table Drivers can't read (RLS deny-by-default); `mission.passenger_names` keeps
    only `{first,last,main}`; a SHARED number is revealed to the assigned Driver post-accept via the service role
    (migration `2026-06-27_mission_guest_contact`).
- **Drafts:** a **discard confirmation** (inline "Discard this draft? This can't be undone.") + a **count badge**
  on the sidebar Drafts item, kept fresh after save/post/discard via `revalidatePath("/dispatch","layout")`.
- **Auth (testing):** key-gated dev-login on the live subdomains:
  - Business → `https://dispatch.kavenue.fr/dev-login?key=v1a-DbkJHN9Dw3aqWKDGSfZ9`
  - Driver  → `https://driver.kavenue.fr/dev-login?key=v1a-DbkJHN9Dw3aqWKDGSfZ9`
  Local (`npm run dev`): dev-login is open, no key. `GET /api/seed` (dev-only) creates a Business +
  Dispatcher + missions. Real magic-link wired but OFF (turning it on is a deferred integration).
- **Env:** `.env.local` (git-ignored) needs the 3 Supabase keys + `NEXT_PUBLIC_MAPBOX_TOKEN`; same in Vercel.
- **Shipped 2026-06-28/29 (Sessions 25–29) — all live (decisions [[d31]]–[[d34]]):**
  - **S25 — Schedule/History responsive (no schema):** the dense grid is now **fully flexible** — every column
    `minmax(floor, fr)`, so narrowing shrinks the whole row together (no more vanishing addresses / colliding
    `Route`/`Flight` headers); below the floors it holds `min-width:572px` and **side-scrolls** (`@media ≤880`).
  - **S26 — Per-stop trip progress** (migration `2026-06-28_mission_stops_reached`, `stops_reached int`): the Driver
    finally **sees the stops mid-trip** and taps **"Reached — <stop>"** (action `reachStop`) between "on board" and
    "Complete ride" (which is **guarded** until all stops done); the dense **route rail checks off live** (reached =
    green, next = accent) + an **"On board · k/N"** pill. Status enum untouched.
  - **S27 — New-mission validation (no schema):** the "Review" warning is now **dynamic** (names only what's missing,
    plain words) — fixed a latent `Number("")===0` bug that let an **un-located pickup** slip through; and a **POSTED
    mission now requires a located drop-off** (`error="nodrop"`) while **drafts stay lenient**.
  - **S28 — Business settings rebuilt** (migration `2026-06-28_business_profile_fields`): a **left-nav account area**
    (Booking/Airbnb-modelled) replacing the 4-field page — **Company** (business type / SIRET / VAT / legal name /
    registered address + Kbis), **Contact** (+ account email read-only, reception), **Branding**, **Booking defaults**;
    **Billing + Notifications** are honest **"coming soon" stubs** (agent-positioned billing copy, billing email saveable
    now). CUT: team/multi-seat, roles, financial dashboard, multi-property. Client `SettingsTabs` + per-section forms.
  - **S29 — Business-neutral saved address + pre-fill toggle + swap** (migration `2026-06-28_business_address_and_prefill`,
    renames `default_pickup_*` → `business_address_*` + adds `prefill_pickup bool`): the saved place is **"Your address"**
    (a Business can be the pickup OR the drop-off — or, for a concierge, neither). A **toggle** "pre-fill my address as
    the pickup" (default on) auto-fills it into a **new** mission's pickup (drafts keep their own; always editable), with a
    **pickup ⇄ drop-off swap** button. Groundwork for the saved-addresses book. Removed "Default Guest instructions".
- **Shipped 2026-07-03/04 (Sessions 30–32) — all live (decisions [[d35]]–[[d38]]):**
  - **S30 — Business identity → account chip in the topbar** (no schema): the Business logo + name moved OUT of the
    cramped sidebar bottom-left into a **top-right account chip** in `.dx-topbar` (a dropdown → Sign out). The topbar
    wordmark (now "Kavenue Dispatch") stays top-left as before; Settings stays in the sidebar footer. Founder picked this (Option C) after
    seeing the "workspace header" option (B) live and preferring the topbar chip. `components/dispatch-shell.tsx`.
  - **S31 — Mission-form input-driven nudges** (no schema) + a **full guidance audit** (`project/GUIDANCE_AUDIT.md`):
    2 calm amber `.notice.warn` nudges on `/dispatch/new` that appear ONLY when the input triggers them — **luggage >
    vehicle capacity** ("consider a Van") and **night pickup** (≥22:00 or <06:00, "harder to fill; raise ceiling /
    SPEED WIN"). Never block posting. Thresholds are tunable consts. The long-distance "cover the empty return" nudge
    was **dropped** (contradicts the no-empty-return model — see [[d37]]).
  - **S32 — Luggage-vehicle Phase 1 ("van for luggage")** (migration `2026-07-04_luggage_run_phase1`: `mission.luggage_only`
    + `driver.accepts_luggage_runs`, both bool default false): a **Trip type: Passengers | Luggage only** toggle on the
    new-mission form → luggage mode **forces Van + Business, hides passengers, keeps bags**; Van Drivers **opt in** at
    enrollment/settings (off by default); the **Pool routes luggage runs only to opted-in Van Drivers** and labels them
    **"Luggage run · no passengers · N bags"** (Pool card + Driver detail + Business schedule). Phase 2 (V2) = real
    cargo/truck classes by volume + the grouped car+van booking. [[d38]]
- **Shipped 2026-07-05 (Sessions 33–34) — all live ([[d39]]):**
  - **S33 — Calendar redesign** (no schema): the Dispatch calendar rebuilt into a **month "load-map"** (readable
    status-railed chips instead of near-white pastel tints, past-day dimming, a **status legend**, honest month-total
    KPIs) + a **week vertical time-grid** (hour axis, day headers, uniform cards at pickup time, overlap lane-splitting,
    a client-only navy "now" line) + a **trip-focused day panel** (click any chip/card → panel opens with THAT trip
    expanded). **Deep links** `/dispatch?open=<id>` (row expands + scrolls, opens the past-day fold) and
    `/dispatch?day=<key>` (`components/scroll-to-trip.tsx`). View+week persist in the URL (reload/Back-Forward safe).
    Founder rejected a horizontal hotel-tape-chart + duration-scaled cards ("a trip is a pickup moment"). Files:
    `components/dispatch-calendar.tsx` (rewrite), `app/(dispatch)/dispatch/calendar/{page,loading}.tsx`. 13-agent
    adversarial review → 7 findings fixed (incl. a real hydration mismatch on the now-line → gated client-only).
  - **S33 follow-ups (no schema):** the **night-pickup nudge moved from the Schedule card to the Pricing card** on
    `/dispatch/new` (it's pricing advice). **Dev-only Pool `?all=1`** (gated by the `NODE_ENV/VERCEL` hosted-check, like
    dev-login) bypasses the tier/zone/body/luggage filters so ONE demo Driver can test the whole Pool (a Class-E sedan
    now sees van/luxury/luggage runs). `app/(app)/pool/page.tsx`.
  - **S34 — Edit a posted trip's INFO without changing price** (migration `2026-07-05_mission_info_edited_at`): new
    route **`/dispatch/[id]/edit`** — a Business edits the info a Driver sees (guests+phones, flight, luggage, reference,
    Driver & service) with **price/route/time locked**. `updateMissionInfo` **whitelists only info columns** (never
    `base_fare/ceiling/pdp_*/created_at/category/pickup*/dropoff*/waypoints/distance/duration/zone/status`), atomic
    status guard (`.in pooled/accepted/confirmed`), mirrors createMission for parsing + board-file + guest-contact
    upsert. Reuses the exact new-mission info sub-components (`PassengerList`/`ReferenceField`/`DriverServiceFields`).
    Entry = **"Edit details" at the TOP of the expanded trip detail**; an **"Edited · <time>"** stamp shows in the
    detail ONLY (never the collapsed row), stamped by `info_edited_at`. Security+parity review → 0 findings. [[d39]]
- **Shipped 2026-07-10 (Sessions 36–38) — all live ([[d41]]–[[d44]]):**
  - **S36 — Expanded trip-row redesign + a "what changed" trail** (migration `2026-07-10_mission_info_change`): the flat
    15-row `.kv` detail rebuilt into grouped, scannable sections — a **scan-strip** (Pickup · Vehicle · Flight · **Fare
    right**), a **route card** (full addresses + a dot-to-dot connector that STOPS at the drop-off dot + trip
    distance/duration in the header), a **slim one-line Driver bar** ("No Driver yet" when unassigned), and **Service ·
    Guests side by side** with **chips** for languages/dress/requests. New `.dx-*` classes; the flat `.kv`/`.route` stay
    for other pages. **"See what changed"**: the amendment **"Change accepted"** state now shows the fare/route diff (no
    schema, existing `AmendmentBrief`); and **detail edits** log a diff to the new **Business-only `mission_info_change`**
    side table (deny-by-default RLS — the diff can hold the private reference/guest names) via `lib/info-changes.ts`,
    rendered as a `.dx-trail` line. Files: `components/trip-row.tsx` (rewrite), `app/globals.css`, `dispatch/page.tsx`,
    `dispatch/[id]/edit/actions.ts`, `lib/database.types.ts`. D25 previews v1→v5 signed off. [[d41]]
  - **S37 — Mission-form polish** (no schema): (1) **review-before-posting card** lightly polished to the S36 vocabulary
    (route rail + chips); (2) **Guest names auto-capitalise** the first letter; (3) **numeric fields** (luggage / base
    fare / ceiling) reject letters/`e`/`+`/`-` via a controlled sanitize (`type=text`+`inputMode`; phone stays flexible);
    (4) the **edit trail leads with the bold edit time**; (5) a live **vehicle-reminder chip** in the Pricing card head
    (class·body). Files: `mission-form.tsx`, `passenger-list.tsx`, `trip-row.tsx`, `edit-form.tsx`, `globals.css`. [[d42]]
  - **S38 — Address search: Riviera-first Mapbox cleanup** (no schema, `components/address-autocomplete.tsx` only):
    countries narrowed `fr,mc,it,ch,de,es,…` → **`fr,mc,it,ch`** + a client **Riviera-first re-rank** (`isRiviera()` floats
    Côte d'Azur hits to the top without hiding far destinations). "aéroport t2" now returns the Nice result at #1. **Mapbox
    POI ranking is still weak for prominent places** → **Google Places is the planned fix, DEFERRED until the founder
    registers the final domain** (so the API key is restricted once) — see BRAND/DOMAIN below + [[d43]].
- **Shipped 2026-07-13 (Session 39) — O7 cancellation spine, LIVE ([[d45]]; migration `2026-07-13_o7_cancellation` applied):**
  - **Driver cancel** (always 100% → re-pools as SPEED WIN; escape valves shown first — copilote "Soon", call the Business),
    **Business cancel** (FREE while pooled / >5h, then 50% at −5h, +10%/h → 100%; a live-% modal), **No-show** (on-site
    `arrived` + wait window 60 m airport / 20 m city → Business charged full, Driver paid like a completed trip; **amber**
    button + a "be sure" nudge), **T-60 reclaim** (assigned Driver never confirmed + unreachable → re-pool, penalty-free).
    Atomic SECURITY DEFINER RPCs (`driver_cancel_mission` / `business_cancel_mission` / `reclaim_mission` / `mark_no_show`)
    mirroring `accept_mission` + a `mission_cancellation` audit table. `lib/pdp.ts` climbs from `pooled_at ?? created_at`;
    `lib/cancellation.ts` shares the % ramp + airport heuristic. Files: `app/(app)/rides/cancel-noshow.tsx`,
    `components/dispatch-cancel.tsx`, `app/(dispatch)/dispatch/actions.ts`, `rides/actions.ts`, `trip-row.tsx`,
    `dispatch-status.ts`, `pdp.ts`, `database.types.ts`. Fee **amounts settle MANUAL** in beta; the rules are fixed.
  - **Verified** end-to-end vs the live DB via real authenticated sessions (5 money paths + 5 adversarial guards) + a
    3-lens adversarial review → **3 fixes applied** (supersede a pending amendment on re-pool; lock down status_event
    spoofing; keep the business-cancel reason private from the Driver). Deployed `e9052d7` → Vercel Production `success`.
  - **⚑ Flagged (BACKLOG § H2 — before real Business users / payments; NOT O7 regressions):** `p_mission_business_update`
    has no WITH CHECK (a Business could bypass the fee via a raw PostgREST UPDATE — **HIGH for prod**, ~nil in beta);
    `currentFare` doesn't freeze at `accepted_at` so the fee BASIS inflates to the ceiling (a **pricing-engine decision**);
    `p_fare_snapshot` is client-forgeable (recompute in SQL with the pricing engine); a mid-run Business cancel vanishes
    from the Driver's My Rides (pairs with notifications).
  - **✅ Agreed release SHIPPED (S40, below).** Remaining O7 piece: the **copilote hand-over** (Phase 2 — needs the community layer).
- **Shipped 2026-07-19 (Session 40) — O7 agreed release + the 24h re-pool window, LIVE ([[d46]]; migrations
  `2026-07-19_agreed_release` + `2026-07-19_repool_speedwin_window` applied):**
  - **Agreed release (Business-initiated).** The Business taps **"Agreed release · free"** (distinct from the fee Cancel) →
    the Driver **must accept** → the trip releases **free (no fee, no reliability mark)** and re-pools; decline → stays as
    agreed. New `mission_release` **append-only evidence** table (declines retained; `dismissed_at` hides-without-deleting;
    stores who/when/note/decision/fare/hours-before-pickup → dispute proof + per-Business abuse counts). ALL writes via
    SECURITY DEFINER RPCs `propose_release` / `respond_to_release` / `close_release` (no client write policy → tamper-proof).
    Driver `components/release-card.tsx` + `respondToRelease`; Business `components/dispatch-release.tsx` + `proposeRelease` /
    `closeRelease`; schedule states + gates in `trip-row.tsx`. Guardrails: declining is framed free/safe/no-mark; the Business
    decline state is calm. Review-weaponisation → gate a future Business→Driver review system to completed-trip + double-blind (logged).
  - **24h re-pool SPEED-WIN window (supersedes D45 "always 70%").** ALL re-pool paths (driver cancel · reclaim · release):
    **<24h → SPEED WIN** (70% / 5-min climb) · **≥24h → normal Pool** (50% / 10-min climb, SPEED WIN off) — the fresh-posting
    curves. `create or replace` of the 4 O7 RPCs.
  - **3-lens adversarial review → 6 fixes** (supersede pending release on cancel/reclaim/business-cancel; gate release cards to
    a still-releasable trip; `respond_to_release` lock order mission→release). **Verified live 28/28** vs the real DB via real
    Business+Driver sessions (pricing branches · free re-pool · decline · supersede · deny-by-default writes). Deployed `d939df7` → Vercel `success`.
- **VERIFICATION NOTE (this stretch):** another chat held the `next dev` server on **:3000**, so the preview/Chrome MCPs
  couldn't reach it. Workaround that worked well: a **static harness** (a tiny Node server on :4612 serving an HTML page
  that `<link>`s the **real** `app/globals.css` + the actual component markup) for CSS/layout checks, plus an **isolated
  `next build` in a detached git worktree** (`node_modules` symlinked, `.env.local` copied) to validate compile/RSC
  without corrupting the running server's `.next`. Reuse these when :3000 is taken.
- **Shipped 2026-07-22 (Session 41) — the no-show CLOCK ORIGIN fix, LIVE ([[d47]]; migrations `2026-07-19_no_show_clock_origin`
  + `2026-07-19_no_show_airport_label` + `2026-07-19_guest_ready_at_guard` applied):** the free-wait countdown was anchored to
  the **Driver's `arrived` tap** in both the client and `mark_no_show` — the wrong party. It now runs from **when the GUEST was
  due** = `coalesce(guest_ready_at, pickup_at)`; reporting unlocks at `greatest(guest_due + wait, arrived_at + 5 min)`. This
  **closed a live exploit** (`advanceStatus` has no time guard → a Driver could tap through ~33h early, wait out the 20-min
  window, and file a no-show, charging the Business full fare before the trip). `mission.guest_ready_at` (new, nullable) is the
  flight-tracking hook — NULL today, so airport falls back to the booked time. `arrived` stays a *precondition to report*, not the
  origin. Verified 9/9 live. **Guard saga:** two attempts to lock `guest_ready_at` were no-ops (a column REVOKE against a
  table-level grant; a SECURITY DEFINER trigger sees the owner in `current_user`) — fixed 3rd try (Session 42) by dropping
  `security definer`.
- **Shipped 2026-07-23 (Session 42) — WAITING FEES + a hard end-to-end stress test, LIVE ([[d48]]; migrations
  `2026-07-22_waiting_fee` + `2026-07-22_airport_accent_fix` + `2026-07-22_guest_ready_at_guard_fix` applied; deployed `0aed706`):**
  - **D48 waiting model.** Founder chose "pay the Driver to wait" over reschedulable time. **Courtesy wait** (renamed from "free
    wait") 20 city / 60 airport, then **€1/min started** Business→Driver, ceiling **€40 city / €60 airport**. The ceiling stops
    the MONEY not the trip (a `least()` clamp — no cron needed). **Two exits, both confirmed:** the Driver reports, or the
    Business declares via net-new **`business_declare_no_show`**. `business_cancel_mission` **also settles accrued waiting** (else
    Cancel was strictly cheaper than "stop waiting" — the loophole the pre-build review caught). A booked trip's **`pickup_at` is
    frozen after draft** (blanket trigger) → dissolves the postpone-then-cancel fee dodge. Net-new Business UI: the Dispatch row
    now **shows the running meter** (before it showed nothing while a Driver waited). Files: `lib/cancellation.ts`,
    `rides/cancel-noshow.tsx`, `components/dispatch-waiting.tsx`, `dispatch/actions.ts`, `trip-row.tsx`; one shared SQL
    `mission_waiting()` / `mission_is_airport()` so the three settlement paths can't drift.
  - **⚑ The bug of the session — found by PROBING, not reading.** The airport predicate `a[eé]roport` used a bracket expression
    with a multibyte char; **Postgres `~*` doesn't reliably match it**, so `"Aéroport Nice Côte d'Azur"` (the exact Mapbox string
    for the main airport) classified CITY → every accented airport pickup without a flight number got 20 min instead of 60. Latent
    since 2026-07-13. Fixed by matching the ASCII substring `roport`. **NOTE: this was Postgres, NOT Mapbox — moving to Google
    Places would NOT have fixed it.**
  - **Verification:** 13/13 live (clock + waiting) + a 3-door settlement proof (Business charged == Driver paid, no cheaper door)
    + a **12-battery / 49-case end-to-end stress test** on a tagged 14-driver/3-business fleet (accept atomicity · both cancel
    paths · no-show clock · waiting math · money conservation · **concurrency race x5, exactly one winner** · release · amendment ·
    reclaim · RLS/privacy · guards) → **49/49 GREEN, 0 real bugs**, DB restored to baseline 34 missions. Fleet lib +
    test scripts live in the **session scratchpad only** (never the repo).
- **Shipped 2026-07-24 (Session 43) — DRIVER POOL REDESIGN + bottom tab bar, LIVE ([[d49]]; NO migration —
  `mission_type` `'transfer'|'hourly'` + a nullable `dropoff_address` already exist in the schema; deployed `56211e7`):**
  the Driver app finally gets a layout redesign (**Pool first**). Decided via the D25 preview loop (v1→v9 mockups), built to match.
  - **Bottom tab bar** (`components/driver-tabbar.tsx`) replaces the old top text-nav (`components/app-header.tsx` DELETED):
    Pool (stack / Lucide `Layers`) · My Rides · **Earnings (net-new 4th tab)** · Settings. **Sign out** moved into Settings
    (`components/driver-signout.tsx`). Content in `<main class="dapp-main">`.
  - **Pool card rewrite** (`components/mission-card.tsx`) to the approved v9 mockup — uniform, refined weights (**nothing
    700**): fare+when head, a gentle divider, **mission-only badges** (Transfer / At disposal / SPEED WIN / Luggage run — the
    vehicle class is **demoted** to a discreet footer note, it's the Driver's own car), a **Dispatch-style route rail** (navy
    dot → line → grey mid-dot **"+N"** → hollow ring), **full 2-line addresses**, and a **one-line footer** (distance·duration
    + discreet vehicle | service icons **capped 3 + N by priority**: child seat>pets>luggage>meet&greet>greeter>dress>
    language>quiet>flight). New `formatPoolWhen()` (Today/Tomorrow/weekday + date). New CSS `.dtabbar/.pcard/.proute/.pbadge`
    (the shared `.card/.route/.badge` untouched — still used by the un-redesigned Driver screens).
  - **Earnings** = honest "coming soon" placeholder (its own screen = a later D25 pass). Verified in-browser vs the real DB;
    **3-lens adversarial review (13 agents) → 6 fixes** (DST "Tomorrow", iOS safe-area `viewportFit:'cover'`, `.ac-list`
    z-index above the tab bar, icon a11y, muted-grey **WCAG-AA contrast**, real `<h1>`s). `tsc` clean.
  - **⚑ Parked:** the discreet **vehicle** footer note — keep (truncates to "Business · Se…" on a narrow card) or drop
    (redundant). **NOT redesigned yet:** My Rides / mission detail / Settings / the Earnings screen / Pool empty+loading.
- **Shipped 2026-07-25 (Session 44) — the PickUp → Kavenue RENAME, LIVE ([[d51]]; NO migration, NO behaviour change):**
  a pure brand rename across **51 files**: user-facing copy (Dispatch topbar wordmark, login/welcome/dev-login titles, the
  FR+EN legal pages, Settings, cancel/no-show and release/amendment copy), `app/layout.tsx` metadata + `appleWebApp.title`,
  `public/manifest.webmanifest`, `package.json`/`package-lock.json` (`kavenue-driver`), `README.md`, `.claude/launch.json`,
  every `docs/` + `project/` doc, and SQL **comments only** in `docs/migrations/*.sql`. Two files git-renamed (tracked as
  renames, history preserved): `docs/PickUp_Phase0_Data_Spine.md` → **`docs/Kavenue_Phase0_Data_Spine.md`** and
  `docs/pickup_schema.sql` → **`docs/kavenue_schema.sql`**, with all 12 references updated.
  - **Method:** 7 parallel edit agents partitioned by file (no two touching the same file) under an explicit never-rename
    ruleset, then **4 adversarial verify lenses** (missed-brand · over-rename · reference-integrity · copy-coherence).
    The over-rename lens ran a **mechanical reversibility check** — reverse every added line and diff it against the removed
    line — **0 mismatches across all 209 changed lines**, proving no collateral edits. 23 findings → all real ones fixed
    (the big one: `project/NEXT_SESSION.md` had been skipped entirely and still claimed the rename hadn't happened).
  - **Verified:** `tsc --noEmit` clean · `next build` green (24 routes) · **18 routes fetched in-browser against the real
    Supabase DB → 0 occurrences of "PickUp"** in rendered HTML, including the PWA manifest and both legal pages · no
    console errors · French legal copy checked for élision (Kavenue is consonant-initial, so "de Kavenue" is correct).
  - **⚑ Founder actions:** **✅ The domain migration is DONE — S49, [[d60]].** **✅ The repo directory is DONE — S53,
    2026-08-06:** the folder is now `02_Cactus/Kavenue/Kavenue_project_dev` (both levels renamed), and the matching
    `~/.claude/projects/` directory moved with it, so the session history and memory survived. **✅ The GitHub repo is DONE — S65,
    2026-08-23:** renamed to `Phyrass-H/kavenue`; the local remote was repointed and the `main — CI must pass`
    ruleset survived (it binds by repo ID). The repo's public `homepage`/`description` were set at the same time.
    Also flagged, not
    touched: `.claude/settings.local.json` line 42 mentions the old brand inside a permission rule and line 32 has a stale
    `pickup_schema.sql` path (a dead entry — that path was already wrong pre-rename) — it's your permissions config, so
    edit it yourself if you want it tidy.
- **Shipped 2026-07-25 (Session 45) — the two remaining Driver cards redesigned, LIVE ([[d52]]; deployed `1a1e5b6`; NO
  migration):** `/missions/[id]` pre-accept reads as "the Pool card, opened" (uncollapsed route rail + a Service card +
  a `.dlock` reveal + a plain `Accept mission`); the My Rides card leads with STATE not price (`.dpill` + `.dprog` bar +
  `.dcall` tap-to-call + `.dnote` prep box, fare in the foot). One filled button per screen; no-show + cancel are
  `.dquiet`; Complete ride is green. Both reuse `.pcard*`/`.proute*`. **These Driver pages scroll by design.**
- **Shipped 2026-07-25 (Session 46) — My Rides restructure + Pool empty/loading + pre-accept polish + Option A, LIVE
  ([[d53]]–[[d55]]; migration `2026-07-25_accept_always_confirms` applied; deployed `7dd4c34` · `950612f` · `ea33515`):**
  - **D53 — My Rides is a tap-through LIST, and each trip opens its own page.** `/rides` = a clean list of `<Link>`
    cards (state · when · progress · route · fare), **current + upcoming only** (completed → History); a "change/release
    is waiting" flag when one is answerable. **`/missions/[id]` now branches by ownership:** OWNED → the full run view
    (new `components/mission-run-view.tsx`) + `← My Rides` + every action (status advance · waiting meter · no-show ·
    cancel · amendment/release cards); OWNED + terminal → read-only + `← History`; POOLED → the unchanged pre-accept +
    Accept + `← Back to Pool`. Contact/phone reveal moved into the per-mission page, still gated to `isMine`. Amendment/
    release builders extracted to `lib/mission-cards.ts`. Copy: shorter generic "pro move" nudge; report button drops
    "you're paid". 3-lens adversarial review → 3 fixes (amendment/release gating · swallowed arrived-read error · icon).
  - **D54 — Pool loading + empty states.** New `pool/loading.tsx` (skeleton cards, `dx-pulse`, staggered); both empty
    states rebuilt into a calm `.pempty` block (no-trips **names the filter**; no-service-area = a setup CTA to Settings).
  - **D55 — pre-accept polish + Option A.** Removed the redundant zone from the pre-accept footer; shortened the unlock
    line to "Private details unlock once you accept."; and **accept now ALWAYS confirms immediately** (dropped the
    Lock-in <3h gate that left 3h+ trips stuck `accepted` with no controls — nothing fired the T-180 auto-confirm). The
    migration replaces `accept_mission` + backfills existing `accepted` → `confirmed`. **The `accepted` status is now
    vestigial** (no path produces it). Verified live: accept → `confirmed`, controls immediately.

LEGAL — **not a build blocker.** The founder (Céline) owns the legal track personally; a lawyer writes the real
Terms/Privacy/positioning later. Do **not** gate work on legal or add "needs a lawyer" flags. Keep the glossary
+ agent/intermediary framing in code/copy (a product rule, not a legal gate). Sharing the Guest phone is fine for
the MVP — and is now an explicit **per-phone Business choice** (S20 Share gate), kept private from Drivers until shared.

**★ SESSION-46 — SHIPPED (2026-07-25).** Everything on the Driver track this session is done + deployed (see the S46
CURRENT STATE block above). What each proposed item became:
1. **✅ S45 verification gap — CLOSED.** The `arrived` waiting-meter + capped state + no-show confirm verified live.
2. **✅ Pool empty + loading states — SHIPPED ([[d54]]).**
3. **Earnings tab — DEFERRED, and deferred AGAIN in S47** (the founder chose My Rides, then Driver Settings ahead of it).
4. **✅ Discreet-vehicle note — DECIDED: KEEP** (founder). Left on the Pool card as-is; only the redundant **zone** was
   removed from the *pre-accept* footer ([[d55]]).
5. **✅ Also shipped, unplanned:** the My Rides restructure ([[d53]]) + Option A "accept always confirms" ([[d55]]).

- **Shipped 2026-07-26 (Session 47) — MY RIDES: Upcoming | Past tabs + day separators + the Past archive, LIVE
  ([[d56]]; NO migration; deployed `0fcb831` → Vercel `success`):** the founder re-ordered S47 — My Rides before
  Earnings ("the history is an ugly link in the header").
  - **Tabs** (`components/rides-tabs.tsx`): a segmented **Upcoming | Past** control (founder picked style A over
    underline) with counts, replacing the `History →` corner link. Deliberately still **two routes** (`/rides` +
    `/rides/history`) — each keeps its own server query and every deep link still lands.
  - **Upcoming:** **day separators** (Today / Tomorrow / Friday 31 July + a ride count) from consecutive `parisDayKey`
    runs; new DST-safe `formatDayGroup()`. The card now shows **only the time** (the day is written above it).
  - **Past:** rebuilt off the old `.card`/`.route` markup onto a lighter **`.pastcard`** (date, small pill,
    single-line route, Business + fare), month groups, and server-side **All | Completed | Cancelled** filter chips
    (a filter row, NOT a third tab). **No money totals** (Earnings owns money). A **cancelled trip shows "—", not €0**
    — its payout depends on who cancelled and when ([[d45]]) and settles manually in beta.
  - **⚑ The privacy rule:** a **Guest's data leaves the Driver's app once the trip closes** — name, phones, name board
    and the Business's private message, enforced **server-side** (`mission_guest_contact` is never queried for a
    terminal mission). Kept: date/route/fare/status + **Business & Dispatcher** (dispute route). **Dispatch untouched.**
  - Designed **empty states per tab**; `formatMonth` fixed `fr-FR` → `en-GB` (month headings read "July 2026" now, both
    Driver and Dispatch history). Verified live on a tagged 8-mission set, DB restored to its 34-mission baseline.
- **Shipped 2026-07-28 (Session 47, part B) — the archive tells the WHOLE truth, LIVE ([[d57]]; NO migration; deployed
  `3025c4a` → Vercel `success`):** a **driver cancel** and an **agreed release** re-pool the trip and clear `driver_id`,
  so they had **vanished from the Driver's app entirely** — a Driver could pay a 100% penalty and take a reliability
  mark with no record anywhere. Past is now a union of missions + those two events (read from
  `mission_cancellation.actor_driver_id` / `mission_release.driver_id`, which their own RLS already allows), sorted
  together; the events' missions come via the service role gated to those ids, and their cards are **not tappable**
  (the mission may belong to another Driver now). Money reads in the Driver's direction: **Compensation · Penalty (red)
  · Free · —**. **The Business's cancellation reason is now shown to the Driver** — a deliberate reversal of the S39
  review, the founder's call — with the Dispatch field relabelled **"Reason (optional) — your Driver will see this"**
  so the promise changes before the text does; the Driver's own reason reads back as *"You said: …"*. The **Cancelled
  pill lost its × icon** (it read as a dismiss control). **Six possible endings** now exist in the model: no-show ·
  Business cancel · Driver cancel · agreed release · T-60 take-back (dead, see below) · **copilote hand-over (NOT
  BUILT — needs the community layer, shows "Soon")**.

**★ SESSION-48 — ✅ SHIPPED (2026-07-28, [[d58]]; migration `2026-07-28_driver_account_and_documents` applied).**
The Driver **Account** replaced the old Settings scroll: a hub (identity · a readiness strip that *names* what's
missing · rows) with a sub-page each for Profile / Where you work / Your vehicle / Your company / Documents /
Navigation / Payouts / Help, each saving only what it shows. **Documents got a real lifecycle** — expiry dates (the
`expires_at` column had existed since day one and was never written), missing/pending/rejected/expiring/expired states,
a rejection reason, front+back sides — plus **camera-first capture with framing** (shared `<ImageFramer>`: round for a
face, rectangular + turn/straighten for a document; PDFs skip it). **Company papers added** (Kbis · RC Pro · the URSSAF
*attestation de vigilance*, which is Kavenue's own legal obligation as donneur d'ordre, renewed every 6 months) plus
`siret`/`vat_number`/`company_name`. Bank details deliberately NOT collected — Stripe's job. **`preferred_gps` was fake
(saved, never read); it's now real** — a **Navigate** button on a live trip targeting pickup → next stop → drop-off via
https universal links. Tab renamed **Settings → Account**. Languages are chips.
- **Founder call: ONE car per Driver for now.** The real multi-car case in VTC is a *fleet* (one company, several
  Drivers, several cars), which the data spine doesn't model — so multi-vehicle would serve nobody in beta while
  dragging `mission.vehicle_id` + a car picker into the money-critical `accept_mission` RPC. Groundwork shipped anyway
  (`document.vehicle_id`, `vehicle.is_active`): car #2 is now a small, contained job. See [[d58]] for what it costs.
- **⚑ Open, deliberately:** readiness is **shown, never enforced** (`blocksWork()` exists and is unused — wiring it into
  the Pool query is the switch to flip when real Drivers onboard, NOT before: no beta Driver has filed a document);
  **nothing reviews a document** (the admin verification workspace is a deferred integration, so every state is honest
  but a paper stays "with us for review" forever); and the expiry copy **promises reminders** ("a month before, and
  again the week it lapses") that need the notifications phase to become true.

**★ ALSO SHIPPED 2026-07-28 — EARNINGS ([[d59]]; no migration).** The 4th tab is real: total · what it's made of ·
trip-by-trip, with a **Day/Week/Month/Year** filter (‹ › steps, and the label opens the phone's date picker to jump
anywhere; state in the URL `?p=&d=`). **No charts** (founder). Comparison is the **previous period** — the founder asked
for same-period-last-year, but the oldest mission is 2026-06-16, so that line renders **only once it's non-zero** and
turns itself on. Non-trip money is included (waiting · no-show · cancelled-on-you · own cancellations in red).
- **⚑ Money bug fixed on the way, then fixed properly:** `currentFare()` climbs to `now`, so a COMPLETED trip kept
  getting more expensive — one accepted at €70 displayed €100. New `settledFare()` freezes the curve at `accepted_at`.
  The founder then ruled that it applies to **fees as well** ("the final fare … is the price that the Driver accepted"),
  so `p_fare_snapshot` on all four cancel/no-show RPCs and the amendment from-fare use it too. **BACKLOG § H2's
  fee-basis flag is RESOLVED.** Verified live both ways (driver cancel €70 not €100; business cancel 58,17 € off a €70
  basis). **The trap to remember:** `settledFare` needs `accepted_at`, and the actions select a narrow `FARE_COLS` list
  — it was omitted, so the fix silently did nothing until a live probe caught it. The parameter is **required** now, so
  that failure is a compile error.
- **⚑ Founder's next pricing question, logged in § H2, nothing decided:** with the basis correct, **100% may be too weak
  a penalty on cheap trips** ("a €50 trip … a driver would be tempted to cancel"). Options sketched: a floor, a
  multiplier near pickup, or visible reliability marks.
- **⚑ Founder ruling to carry into the pricing model:** *the fare shown in the Pool is the Driver's fare* — "like the
  other apps, the price shown in the Pool and paid to the Driver should be commission-taken". So no gross/net language
  anywhere in the app. Provisional until the pricing work lands.

**★ SESSION-49 — ✅ SHIPPED (2026-07-29, [[d60]]): the DOMAIN MOVE + EMAIL.** The founder took none of the menu below —
they'd bought **`kavenue.fr`** and wanted the product to finally live at its own name, plus real mailboxes. Done and
verified the same day: four hosts on `kavenue.fr` (apex primary, `www` → 308 → apex, `driver.`, `dispatch.`), the old
domain removed from Vercel, the Vercel project renamed **`kavenue`**, and Google Workspace email with `support@` /
`feedback@` / `contact@` as free aliases — SPF + DKIM + DMARC all verified `pass` on a real message. Runbook, gates and
the OVH traps: `project/DOMAIN_MIGRATION.md`. **No app behaviour changed; nothing was consumed from the menu below.**

**★ SESSION-50 — CHECK-IN shipped (2026-07-30, [[d61]]; migration `2026-07-30_mission_check_in.sql` applied; deployed
`c6f13a0` + `aa18778`).** The founder ruled out A–C for now — *"I need to have a complete functional system between the
Dispatch and the Driver and all UI done"* — so the work is the Driver↔Dispatch loop. Shipped: a Driver **checks in** 3h
before pickup; the Business's row reads `Confirmed` → **`Not checked in`** (amber, whole row) → red inside 1h →
**`Checked in`**; a count badge on the My Rides tab; `en_route` checks in implicitly. This revived the S39 pill + red row
wash that [[d55]] had made unreachable.
- **⚑ The T-60 take-back is STILL parked, and now for a documented reason.** Its S47 trigger ("the Driver hasn't
  started") fires on a Driver who simply plans to leave at 17:40 for an 18:00 pickup — turning a **90%** business-cancel
  fee into **0%**, an hour before every trip. It needs a response test, which needs push. See [[d61]].
- **⚑ Test-harness trap:** `?as=driver` → `demo.driver@pickup.local` → the **Marc Dubois** driver row, NOT the row whose
  `email` column says `s46.driver@pickup.local`. Match on `driver.auth_user_id`, never on `driver.email`.

**REMAINING ON THE DRIVER↔DISPATCH LOOP** (audited from the code 2026-07-30, + the founder's own testing 2026-07-31).
*(Historical, S51 — both A and B below shipped. **SUPERSEDED — the live START HERE is the 2026-08-22 block (search "THE CURVE IS LIVE")**; this heading is kept only so the A/B references still resolve.)*

**A. ✅ EXPIRED TRIPS — SHIPPED (S51, 2026-07-31, [[d62]]; migration `2026-07-31_expired_missions` applied; deployed
`d7e06d4` → Vercel `success`).** A trip now expires **exactly at `pickup_at`** (founder: no grace), leaves the Pool, and
shows the Business a red **"Expired · Was not filled in time"** row that stays on the schedule until the day ends. The
money bug is closed in three places — a time check **inside `accept_mission`** (under the existing row lock), a
`pickup_at` floor on the Pool query (**including under `?all=1`**), and `/missions/[id]` no longer offering Accept.
`expire_stale_missions()` sweeps `pooled → expired` + writes the `status_event` in one statement, called on the Pool and
Dispatch schedule reads — **deliberately no cron** (Vercel Hobby caps it at once a DAY; the scheduler decision belongs
with D61's T-180 reminder in the notifications phase). `missionTone` derives the same state for `pooled` + past-due so
the calendar and history can't lag behind the sweep. Verified live incl. a genuine UI accept race; DB restored to its
34-mission baseline. **Still open from § P: an expired trip counts nowhere** — fill rate needs the § F2 back-office.
**⚑ Note the side effect: the Pool is now legitimately EMPTY** (all 23 were dead), so testing needs freshly posted trips.
- **Part B, same day ([[d63]], deployed `73d7102`): Dispatch History done properly.** Filter chips **All / Completed /
  Unfilled / Cancelled** with counts (server-side `?filter=`, reusing the Driver's `.rfilter`/`.rchip`), a one-line
  summary, a per-month failure count, and two distinct empty states. **Wording changed:** "Expired" → **"Unfilled"**
  (the ending) and the Schedule's live warning "Unfilled" → **"No Driver yet"** (still fixable) — they had read almost
  identically since S39 and nobody noticed, because the outcome had never rendered.
  **→ Superseded/extended by [[d68]] (S52): History is now searchable, range-filterable, sortable and exportable.**

**B. ✅ Driver EARNINGS picker — SHIPPED (S51, 2026-07-31, [[d64]]; NO migration; deployed `684ae82` → Vercel
`success`).** One root cause behind both symptoms: the label drove a **hidden** `<input type="date">`
(`pointer-events: none`) via `showPicker()` — dead on phone, undismissable on desktop, and unable to express a range
at all. Replaced with the app's own calendar (opens on tap, closes on outside-tap/Escape, same on both), plus a 5th
period **Range** (two taps, `?p=range&from=&to=`, arrows removed) and presets last 7 / last 30 / this month / all
time. The selection band now makes the "granularity decides what a tapped day means" rule visible for the first time.
- **⚑ REUSE THIS for § R and § S.** `lib/use-dismiss.ts` (pointerdown, not mousedown) + the calendar in
  `components/earnings-period.tsx` are the controls Dispatch History and Dispatch Earnings should adopt — the founder
  asked for a date range in all three. **Do not build a second one.**
- **⚑ TESTED AND CLEAR — do NOT re-flag this.** Claude suspected the three other popovers that dismiss on `mousedown`
  only (`date-time-picker.tsx:38` · `address-autocomplete.tsx:204` · `dispatch-shell.tsx:77`) had the same mobile
  weakness, on the theory that iOS Safari skips synthetic mouse events when you tap a non-interactive area. **The
  founder tested all three on a real iPhone 2026-07-31: every one closes correctly**, and so does the new Earnings
  calendar. The theory was wrong — iOS synthesises the event fine here. They are NOT broken, and the Earnings bug was
  never about `mousedown` (it was `showPicker()` on a hidden input). Consolidating the three inline hooks onto
  `useDismiss` is optional tidying, worth doing only if one of those files is open for another reason.

**C. Dispatch-side EARNINGS / spend — "a real one, complete and pro" (founder, 2026-07-31).** Full spec now in
**BACKLOG § S**. ⚑ It deliberately **diverges** from the Driver's Earnings: the founder wants **charts, comparison
tools and desktop-class controls** here, where the Driver's screen has none by their own earlier call ([[d59]]) — a
hotel back-office is a different user doing analysis, not a Driver checking a phone. Research best-in-class first;
D25 preview loop applies. `settledFare()` already solves the maths, and it should adopt the **fixed** period control
from B rather than the broken one.

**§ R — ✅ SHIPPED (S52, 2026-07-31, [[d68]]; NO migration; deployed `0acdb68` → Vercel `success`).**
**Dispatch History is a tool you search, not a list you scroll.** Founder: *"it is a professional tool… easy to find a
specific trip by drivers name, or passenger or internal reference, or car… perfect and complete."*
- **One search box** over Guest · Driver · reference · address · flight · car. Every term must hit somewhere;
  **accent-folded** ("aeroport" finds "Aéroport" — the highlight maps folded offsets back to the original per
  character, which is why it paints correctly); and when the hit lands somewhere with **no column** the row prints
  `Car · Mercedes · Classe E · AB-123-CD`, so searching a plate never returns rows with no visible reason.
- **Date range · Driver · class · sort · Export CSV.** The export re-runs the **same** `applyHistoryQuery` on the
  server, so "exactly what's on screen" survives the next filter anyone adds. `;` + French decimals + BOM for Excel FR;
  formula-injection escaped. Every filter is in the URL → a filtered archive is a shareable link, and `?open=<id>`
  matches the Schedule.
- **Two gaps closed:** rows showed only a **time** inside month bands (3 vs 19 July were indistinguishable), and there
  was **no fare column at all**.
- **⚑ The accuracy call:** a past trip a Driver never closed (§ Q) shows its agreed fare **greyed as "Not settled" and
  excluded from every total** (row, month band, summary; its own CSV column). Counting it inflated a hotel's spend with
  trips that may never have happened.
- **⚑ The date-range control is now genuinely shared** — extracted from `earnings-period.tsx` to
  **`components/date-cal.tsx`**; the Driver's Earnings was re-verified after the extraction. **§ S adopts THAT file.
  Do not build a third.**
- **⚑ Left open on purpose (in § R):** the **growth limit** — the page loads the whole archive in one query and
  filters in memory, which is what lets the chip counts / Driver list / class list be honest about the *whole* archive.
  Correct at 28 trips. ⚑ **MEASURED S65: the hard break is at 398 archived trips for one Business, not the
  5 000 previously guessed — and the busiest Business is already at 271.** Also skipped: a density toggle.

**★★ START HERE — S65 CLOSED 2026-08-24. READ THIS BLOCK, THEN THE GATE BELOW.**

## WHERE WE ARE, IN ONE SCREEN

**Everything below is live and deployed unless marked otherwise. `main` = the truth.**

### ✅ Shipped in S65
| | |
|---|---|
| **Repo renamed** | `Phyrass-H/kavenue`. Trademark, not tidiness. Ruleset survived, homepage/description fixed |
| **§ R rule 1** | The 398-trip wall is **gone**. 8 unbounded reads made constant-size. Verified 3 ways + in-browser |
| **The Event Log** | **LIVE** — the founder applied the migration. 1 737 rows. A DB trigger no code path can bypass |
| **"volume ceiling" → "growth limit"** | It collided with `Ceiling`, a glossary term |

### 🎯 THE NEXT JOB — the Lock-in fix (founder said yes, wants a mockup first)
**The only place the product LIES about a rule it advertises to both sides.** A Driver who accepts and then
vanishes keeps the trip until pickup; the Business's "take it back" button has **never once rendered**.
- `accept_mission` always writes `confirmed` (`2026-08-22_accepted_fare.sql:126`) — the `accepted` state has
  not existed since Option A/D55. **Live: 0 of 280 missions have ever been in `accepted`.**
- But `reclaim_mission` (`2026-08-22e_repool_touches_nothing.sql:145`) and the button
  (`components/trip-row.tsx:255`) both require exactly that state.
- **Fix:** re-gate both on `confirmed AND checked_in_at IS NULL`. `checked_in_at` is live and populated on
  184 rows. ⚑ **D25 preview first** — this makes a button appear that has never been seen.
- ⚑ **The founder had a question about this that never got asked. Ask them before building.**

### ⏳ THE EVENT LOG'S SECOND HALF — app-side events
11 event types record automatically today. **12 more are defined in `mission_event_type` but NOTHING WRITES
THEM** — `log_mission_event()` is called from **nowhere** in the app (verified 2026-08-24). Those are the
"learn behaviour" half: `pool_impression`, `mission_viewed`, `contact_revealed`, `accept_rejected`,
`checked_in`, `info_changed`, amendment/release proposed+answered, `close_answered`.
⚑ Do not tell the founder these are tracked. They are not. Wiring them is a real job — **plan it first.**

### 🗺 MAPPING — decided in principle, one test outstanding
The founder has a **free Michelin / Mapping Factory key until Aug 2026** (routing, autocomplete, geocode,
mapstyle — West Europe) and would prefer Michelin-only because Kavenue is a French project.
**Claude argued against Michelin-only and the founder asked for no flattery:** the two providers are good at
different jobs. Michelin (the ViaMichelin engine) is excellent at **road distance — which sets the price**.
The weak spot in Kavenue is the **address box**, and finding hotels/terminals/POIs is Google Places's
strength (already named "the real POI fix" in this backlog). Recommendation: **Michelin for distance, Google
for the address box** — also the cheaper split.
⚑ **NEXT SESSION: settle it with evidence, not opinion.** Run both against a list of real Riviera hotels and
airport terminals and compare. If Michelin finds them well, Claude is wrong → Michelin-only, cheaper and
French. ⚑ The founder pasted the key into chat; **treat it as exposed and rotate it.** Keys belong in
`.env.local`.
⚑ Related, found in the V1 audit: **when routing fails today the price-floor guard silently skips**
(`dispatch/new/actions.ts:230`, `!asDraft && quote &&`). Fix alongside whichever provider wins.

### 📄 THE WAYBILL / BOOKING VOUCHER — restart from scratch
⚑ **The founder does not remember the "7 mandatory fields" and asked to START FRESH. Do not lead with the
arrêté.** Their own framing, which is the right one to build from: *"what all apps have — a tiny button that
displays all the info about the Driver, the Driver's company, who the mission is from, the passengers, the
car and the mission, to show the police in a control."* They also noted the trip card already carries most
of it. **Ask them for their simple list first**, then reconcile with `docs/01_Legal_VAT_Compliance.md:28`
(*justificatif de réservation*, 7 fields, arrêté 6 Aug 2025) — the table `booking_voucher` already exists and
no code touches it.

### 👤 FOUNDER-OWNED, NOT CLAUDE'S
- **`pickup-marketplace.vercel.app` is still live** and serving production under La Poste's trademarked name.
  Founder: *"we will fix it at the next session."* Steps in BACKLOG § AD.
- **Optional index** `docs/migrations/2026-08-23_info_change_business_idx.sql` — one line, irrelevant at
  current volume, paste whenever.

### 🅥 EXPLICITLY DEFERRED — do not raise
- **§ V (lower-class opt-in) → V3+.** Founder: *"forget about it... in case we don't have enough drivers, but
  if we do then maybe we'll never have to use it."* A supply contingency, not a feature. **The stranded
  Classe V is NOT a bug to fix.**
- **§ AF** (aggregate demand sensing) — V2/V3, unmeasurable at 9 Drivers.
- Notifications / payments / auth / analytics integrations — the founder's standing phase rule.

### 📋 V1 COMPLETENESS (audited 2026-08-24)
**38 KEEP features in Doc 02: 27 built · 8 partial · 3 missing. Nothing on the critical path is unbuilt.**
Real gaps beyond the Lock-in fix: no free edits while pooled (D39 says there should be) · no FAQ · no consent
capture or account-deletion path (GDPR) · booking voucher · no welcome banner + `manifest.webmanifest` ships
`"icons": []`. ✅ **Flight tracking: the founder said YES to V1** (needs a paid API — FlightAware /
AeroDataBox — plus localisation; scope it with the mapping decision).
Thin enough to embarrass: the Driver's photo and languages are captured and shown to **nobody** while two
shipped strings claim otherwise · an **admin sign-in is an infinite redirect loop**
(`lib/app-context.ts:94`) · `field_of_activity` and `business_type` are two columns that never talk.
Full detail: `BACKLOG.md` § AE and the S65 entry in `SESSION_LOG.md`.

### ⚑ THE LESSON OF S65 — it cost real time three times
**The docs were confidently wrong, and only RUNNING something settled it.** The growth limit was documented
as 5 000 and measured at **398**. `pooled_at` was said not to exist; it does. A "stale draft price" bug was
described in detail; it does not exist. `status_event`'s CHECK was read from `docs/kavenue_schema.sql` as
four values — it is **eight**.
⚑ **`docs/kavenue_schema.sql` DOES NOT CONTAIN COLUMNS OR CONSTRAINTS ADDED BY LATER MIGRATIONS. Probe the
live DB.** And when a number matters, measure it before scheduling work around it.
⚑ **The founder asked twice for a brainstorm BEFORE coding.** Honour it: agree the shape, then build.

---

## ⚑ 0 · VERIFY BEFORE YOU BUILD — THIS IS A GATE, NOT A SUGGESTION

**Read this first. It is here because the session that wrote the rest of this file got it wrong.**

S64 finished the §6 curve, wrote the handoff below, and then — as the last act before closing — had three
readers check every claim in it against the real code and the real database. **It was wrong twelve ways, five
of them load-bearing.** Not typos. Wrong enough to send you down a dead end:

- It told you `mission.accepted_fare` had made History's fare sortable in SQL. **It has not.** The list sorts
  on the Business's **all-in** figure (`businessCost(fare + waiting_fee)`), and the comment at
  `lib/history-filter.ts:452-457` records that keying on the bare Course is a defect this codebase **already
  shipped once and fixed.** Following that advice walks you straight back into it.
- It pointed § V's SQL change at `2026-08-11_accept_mission_eligibility.sql`. **S64 superseded that file
  itself, hours earlier** — the live guard is `2026-08-22_accepted_fare.sql:100`. Editing the file it named
  changes **nothing in the database**, and you would have lost an afternoon working out why.
- It said the wipe + re-seed would populate `accepted_fare`. **No seeder writes it.** A re-seed reproduces a
  100 %-NULL archive.
- It said § V was "one row update away". **It has already happened** — that Driver is stranded right now.
- It said the Pool discards ~89 % of what it fetches. That was a **whole-table** number. The Pool fetches
  **2 rows** and discards none.

⚑ **Two of those five were caused by S64's OWN migrations, written the same day.** That is the real lesson:
a handoff is a *claim about the repo*, and claims decay — fastest of all when the session writing them is
also the session changing the thing. Proofreading cannot catch that. Only re-reading the code can.

### So: run this before you write a line of code.

    node --experimental-strip-types .local/probe/handoff-check.ts

Fourteen assertions over the perishable claims in this file — the live SQL definitions (probed through the DB,
**never** by reading migration filenames, which share dates and do **not** sort into apply order), the § V
vehicle row, the `accepted_fare` population, the Pool's real size, the demo trips, and whether the repo has
been renamed yet. It is read-only and takes seconds. **Anything it prints `STALE` means this file lies about
that point — fix the file before you build on it.**

Then the usual, and all of it must be green before you start:

    npx tsc --noEmit && npx vitest run          # expect 462 passing
    node --experimental-strip-types .local/probe/diff-sql-vs-lib.ts     # 693 · ALL AGREE
    node --experimental-strip-types .local/probe/write-test.ts          # 170 · ALL AGREE
    node --experimental-strip-types .local/probe/curve-live.ts          #   8 · ALL AGREE
    node --experimental-strip-types .local/probe/accepted-fare.ts       #  20 · ALL AGREE
    node --experimental-strip-types .local/probe/migrations-2026-08-10.ts   # 61 · 0 failed
    node --experimental-strip-types .local/probe/migrations-2026-08-11.ts   # 23 · 0 failed

**If a probe fails, that is the job** — not whatever is queued below. Something drifted between S64 closing
and you opening, and finding out what matters more than starting the next feature.

⚑ **When you finish, do the same to your own handoff.** Do not just re-read it — open the files it cites and
check them, or have a subagent do it. And when something bites you that this probe did not catch, **add an
assertion for it** so the next session gets it for free.

## 1 · ✅ RENAME THE GITHUB REPO — SHIPPED (S65, 2026-08-23). Kept for the trail + one thing it uncovered.

The remote is now **`Phyrass-H/kavenue`** (`gh repo rename kavenue` + `git remote set-url`). Chosen over
`kavenue-marketplace` because it matches the Vercel project; the landing repo stays `kavenue-landing`.
Why it mattered: **"Pickup" is a registered trademark of Pickup Services SAS / GeoPost (Groupe La Poste) in
class 39 — transport, the exact sector** ([[rebrand-from-pickup]]).

Verified after the rename, all green:
- the ruleset `main — CI must pass` **survived** — it binds by repo **ID**, and GitHub rewrote its `source`
  itself. Still `enforcement: active`, still `bypass_actors: []`, still requiring `types · tests · build`.
  (`gh api repos/Phyrass-H/kavenue/branches/main/protection` → 404: the ruleset is the **only** gate on main.)
- the old URL redirects (`gh api repos/Phyrass-H/Pickup-marketplace` resolves to `Phyrass-H/kavenue`), so a
  stale clone keeps working — which is exactly why `handoff-check.ts` now asserts the remote is on the NEW
  slug rather than trusting that a wrong one would fail loudly. It would not.
- webhooks `[]` · deploy keys `[]` · Actions secrets 0 · topics `[]` · issues `[]` · forks 0 · releases none.
  Nothing in the app code, `.github/ci.yml`, `package.json` or `README.md` ever named the repo. Every
  reference was prose in `project/*.md`.
- the repo's public `homepage` had been left pointing at the OLD trademarked URL and `description` was empty;
  both were set (`https://kavenue.fr` · "B2B VTC booking marketplace — centrale de réservation VTC").

### ⚑ WHAT THE RENAME UNCOVERED, STILL OPEN, FOUNDER'S CALL

**`https://pickup-marketplace.vercel.app` is LIVE and serving production right now** — HTTP 200,
`<title>Kavenue</title>`. Renaming the *Vercel project* in S49 did **not** release its `.vercel.app` domain:
Vercel mints that host from the project name at creation, **adds** new aliases on rename, and leaves the old
one bound and auto-aliasing production. There is no rename operation for it — the only states are bound or
detached. So the trademarked name is publicly reachable and crawlable, which is a *bigger* exposure than the
repo slug ever was.

⚑ **It is not a working fallback, so nothing real depends on it.** Two existing bugs make it a broken
shopfront: `lib/hosts.ts:11,46` treats `*.vercel.app` as a shared host and returns `null` for the role
subdomain, so Driver and Dispatch collide on one origin (the session-overwrite bug at
`project/DECISIONS.md:128`); and its origin is not in the Supabase redirect allowlist, so magic-link sign-in
silently fails there.

**Fix (founder's dashboard, mutating — do not do it for them):** Vercel → project `kavenue` → Settings →
Domains → remove `pickup-marketplace.vercel.app`. `driver.kavenue.fr` and `dispatch.kavenue.fr` are
unaffected. ⚑ **The founder was asked in S65 and pushed back on scope** — the repo rename was the ask, not a
Vercel change. Logged as `project/BACKLOG.md` **§ AD**, theirs to decide. **Do not re-litigate it unprompted.**

## 2 · § R — THE GROWTH LIMIT  ⚑ RULE 1 SHIPPED S65. RULES 2 & 3 REMAIN.

### ✅ RULE 1 IS DONE — the hard wall is gone (S65, 2026-08-23, deployed `00e19a3`)

**Eight** unbounded `.in("mission_id", <every mission id>)` reads became constant-size requests. ⚑ Five of
the eight were on `dispatch/page.tsx`, which was **more exposed than History** — its id list is every
non-draft mission **past AND future** and it fired five times per render. Four side tables already carried
a denormalised indexed `business_id`, so seven sites are `.eq("business_id", …)`; `mission_guest_contact`
has no such column, so that one uses `mission!inner(business_id)` (`!inner` is load-bearing).
New `lib/side-tables.ts` collapses four byte-identical walk loaders into one.

⚑ **STANDING INVARIANT — do not break it.** Business-scoping also returns rows for missions **not on
screen** (future, drafts) — extra KEYS in those Maps. Safe only because every consumer does `map.get(m.id)`
and never iterates, never reads `.size`. **If you ever iterate one of these maps, narrow it to the missions
on screen first.** Full note at the top of `lib/side-tables.ts`.

Verified three ways (the table was empty, so "it ran" proved nothing): 11 new tests (462 → **473**),
**mutation-tested** (breaking the code fails 3 and 2 tests), and **real-row equivalence** on the three
populated side tables across all three Businesses. Then browser-verified end to end: Schedule renders,
History shows all 271 trips with chip counts intact, the CSV returns 273 lines = header + all 271.

**Waiting on the founder, OPTIONAL and low priority:**
`docs/migrations/2026-08-23_info_change_business_idx.sql` — `mission_info_change` is the only one of the four
whose `business_id` never got an index, and rule 1 makes it a per-render filter. Irrelevant at 2 rows.

### WHAT REMAINS — rules 2 and 3

**Rule 2** — move filtering and sorting into SQL. **Rule 3** — paginate the archive list.
⚑ Both are constrained, and the constraints are the whole difficulty:
- **the chip counts are computed over the WHOLE archive on purpose** (§ R note below), so paginating the
  list means a second aggregate query
- ⚑ **sorting by fare CANNOT move to SQL** — the fare is computed on read, never stored, and
  `lib/history-filter.ts:452-461` records that keying on the bare Course fare is a defect this codebase
  **already shipped once and fixed**. Treat a generated/denormalised all-in column as the candidate, not
  `accepted_fare`.
- ⚑ **do NOT paginate the CSV export** — its promise is "exactly what is on screen" over the whole set.

**The Driver side has the same fan-out with more room:** `rides/page.tsx:225-226`,
`rides/history/page.tsx:139,248`, `earnings/page.tsx:102`. Measured S65: the busiest Driver has 44 trips —
**354 of headroom** vs the Business side's 127. The driver+vehicle joins are bounded by **fleet** size
(9 Drivers), not archive size — same pattern, bites at ~398 Drivers.

### The original mapping, kept for the file:line trail

⚑ **MEASURED 2026-08-23 (S65), and it is FAR lower than the 5 000 that was guessed:** the cancellation
fan-out (`.in("mission_id", <every archived id>)`, `dispatch/history/page.tsx:118-126`, duplicated at
`history/export/route.ts:94`) **fails at 398 archived trips for one Business** — binary-searched against the
live DB, ~14.8 KB of URL. It does not degrade, it **errors**. Live today the busiest Business has **271
archived trips: 127 of headroom.** This is near-term, not distant.

Five screens load a table and filter it in JavaScript. Mapped in S64 **and then re-verified against the live
DB, which corrected four of the claims** — the numbers below are the checked ones, not the first draft.

| where | what it does |
|---|---|
| `app/(app)/pool/page.tsx:106-108` | bounds in SQL by `status='pooled'`, `pickup_at > now()` **and** the Driver's tier — then filters **four of the five** matching rules in JS at `:114-133` (radius · luggage · body · car) |
| `app/(dispatch)/dispatch/history/page.tsx:101-107` | the Business's whole archive, **74 columns**, no limit. There IS an upper date bound (`.lt("pickup_at", nowIso)`, `:106`); what is missing is a **lower** one |
| `…/history/page.tsx:118-126` | ⚑ **the genuinely unbounded fan-out** — `mission_cancellation … .in("mission_id", <every archived id>)`. This hits PostgREST's **URL length limit** long before anything else breaks. Duplicated at `…/history/export/route.ts:94` |
| `…/history/page.tsx:146-150` | the Driver + vehicle join. **Bounded by fleet size** (9 drivers live), not by archive size — lower priority than it looks, but it builds the name/plate search index |
| `app/(dispatch)/dispatch/spend/page.tsx:126-133` | the same unbounded archive query |
| `app/(app)/rides/history/page.tsx:96-101` | the Driver's own archive, same idiom |

⚑ **`project/SPEND_BRIEF.md`:197-198 IS WRONG.** It claims Spend "bounds its query by the period instants…
rather than loading the whole archive" and concludes § R does not apply to it. It does. Fix the brief.

⚑ **Do NOT paginate the CSV export** (`…/history/export/route.ts:137-142`). It runs the same query on
purpose — its promise is "exactly what is on screen", over the *whole* result set.

⚑ **The chip counts are computed over the whole archive on purpose** (BACKLOG:919-923). Moving the list to
SQL means a second aggregate query for them.

### ⚑ TWO THINGS S64's FIRST DRAFT OF THIS SECTION GOT WRONG. Read before you plan.

**1 · `accepted_fare` does NOT make the fare sortable in SQL.** S64 claimed it did. It does not.
`lib/history-filter.ts:458-461` sorts on
`businessCost(mission, fare + waiting_fee)` — the Business's **all-in** figure — and the comment directly
above it (`:452-457`) records that keying on the bare Course was **a shipped defect**: *"waiting was in the
number and not in the key, and a pre-commission trip was compared against a post-commission one 15 % larger."*
An `order('accepted_fare')` reintroduces exactly that bug. A SQL sort would have to reproduce `historyFare`'s
branches (`:380-388` — expired → NULL, cancelled → `cancellation_fee`, else the settled fare) **plus**
`waiting_fee` **plus** `businessCost`/`carriesCommission` over the four snapshot columns
(`lib/commission.ts:238-253`). **Sorting by fare is still the blocker. Treat a generated/denormalised
all-in column as the candidate fix, not `accepted_fare`.**

**2 · The wipe + re-seed will NOT populate `accepted_fare`.** No seeder writes it — `s61-priced.ts:239`
accepts with `.update({ driver_id, accepted_at, confirmed_at })` and `seed-fleet.mjs` inserts rows directly;
both bypass `accept_mission`, which is the **only** writer
(`docs/migrations/2026-08-22_accepted_fare.sql:133`). **Live right now: 0 of 280 missions have one.** A
re-seed as written reproduces a 100 %-NULL archive. **Add `accepted_fare` to the seed-fix list.**

⚑ **The "Pool throws away 89 %" claim was also wrong** and is corrected here so nobody re-derives it. The
241-of-280 `pickup_lat IS NULL` figure is a **whole-table** number dominated by the archive; the migration
that measured it (`2026-08-11_accept_mission_eligibility.sql:34-35`) says only that a faithful SQL *port of
the radius rule* would refuse ~89 % — a statement about porting, not about what the page transfers. The Pool
query is bounded to future pooled trips: **live, 2 rows, 0 of them with a null pickup.** And the rule is
pickup **OR** dropoff (`pool/page.tsx:115-117`), so a null pickup with a geocoded dropoff survives anyway.
**A bounding-box prefilter is not the cheap win here.** The Pool's real volume problem is structural — RLS
lets any Driver read any pooled mission (`docs/kavenue_schema.sql:310-313`), so it scales with total
marketplace supply, not with one Business's archive.

## 3 · § V — 🅥 DEFERRED TO V3+ (founder, 2026-08-24). NOT A QUEUE ITEM.

⚑ **"Forget about it please, it's going to be for at least V3 — in case we don't have enough drivers, but
if we do then maybe we'll never have to use it."** It is a **supply contingency**, not a feature. Do not
build it and do not raise it. The stranded Classe V is **not a bug to fix**. Design preserved in
`BACKLOG.md` § V + [[d85]] only in case supply ever runs short.

⚑ **"Ok record it please, it's too early to work on that."** Nothing was built. **Do not start this
unprompted** — one number is still the founder's to pick, and everything else is already decided.

**The full design lives in `project/BACKLOG.md` § V and `DECISIONS.md` [[d85]]. Read both before touching
it.** What was settled: one class down maximum (First → Business, Business → Eco, **never** First → Eco);
body type already correct in both layers, no work; the curb is a non-issue; the volume risk is accepted
conditional on a per-Driver kill switch that **does not exist yet**; season windows rejected; the trigger is
per-trip on time-to-pickup.

**The one open item — the threshold.** Founder floated T−2h, Claude recommended **T−6h**, not accepted.
The governing rule is the escalation ladder: `own class → widen one class up (FREE) → ask the Business to
raise the Ceiling (§ AB, PAID) → expires (§ P)`. **§ AB fires at T−5h, so § V must fire before it.**

**Still true, and still costing a Driver work:** the live `Classe V` (IJ-905-KL, Karim Nasri) is stored
`category='luxury'` and the Pool matches tier exactly (`app/(app)/pool/page.tsx:107-108`), so that Driver is
stranded off Business-van work today. ⚑ `.local/seed/seed-fleet.mjs:49` would silently revert it on a
re-seed and hide the bug.

⚑ **TWO CLAIMS THIS FILE USED TO MAKE THAT WERE WRONG — corrected in S65, do not reintroduce them:**
1. *"There is no record of when a mission was pooled, so § V needs a `pooled_at` column."* **`pooled_at`
   already exists** (`docs/migrations/2026-07-13_o7_cancellation.sql:27`) — stamped **only** on RE-pool, and
   **NULL on all 280 live rows** because the seeders bypass the app. ⚑ The claim came from grepping
   `docs/kavenue_schema.sql` alone: **that file does not contain columns added by later migrations.** Probe
   the live DB.
2. *"A draft saved Monday and posted Friday carries a stale price."* It does not — posting a draft **resets
   `created_at` to now** (`app/(dispatch)/dispatch/new/actions.ts:381-384`) and re-quotes the rate card,
   floor and commission. The only carry-over is the Business's own Ceiling, deliberately.

**§ V's only migration is the Driver opt-in flag + the matching `accept_mission` guard, in ONE commit with
the Pool query and the Pool card.** The drift rule and the superset invariant are in `BACKLOG.md` § V.

**Verified curve facts (S65):** the fare reaches the Ceiling at exactly **T−5h** (`TOP_LEAD_MS`,
`lib/pdp.ts:43`); a trip posted inside 5h tops out at the midpoint. **T−24h = 76 % · T−12h = 85 % ·
T−6h = 95 %** of Ceiling — all the persuasion happens before T−12h.

**Also logged in S65, none of it built:** § AE (nothing checks a car can CARRY what was booked — body type
is enforced, capacity is not modelled at all) · § AF (the aggregate "a class comes to help" version — V2/V3,
unmeasurable at 9 Drivers) · § AG (record every state transition; `status_event`'s CHECK permits only the
four execution statuses).

## HOW TO PUSH (S64 got this wrong; don't repeat it)

`main` accepts only commits CI has already passed, and required checks are per commit SHA:

    git push origin main:s65-my-work        # CI runs, ~1 min
    gh run list --branch s65-my-work        # wait for `success`
    git push origin main                    # SAME SHAs → accepted, deploys

**No PR needed.** Detail and the ruleset command are at the top of this file. (The `s63-*` branches cited
up there as evidence have since been deleted — GitHub removes a merged branch. The route is still right:
`s64-close` sits at the same SHA as `main`.)

## STATE OF THE DATABASE

- **Three `S64CURVE` demo trips exist**, priced through the real RPC. ⚑ **They were seeded 2026-08-22 with
  FIXED pickup times, so they age — which means the probe's demo-trip assertion WILL eventually go STALE on
  its own, every session, forever. That one is expected noise, not drift: re-seed or delete the trips to
  silence it.** As of writing: one at T−313h, one at T−25h, and **one already in the
  past — which the Pool hides** (`.gt("pickup_at", now)`, `app/(app)/pool/page.tsx:107`), so only two show.
  Re-seed them to see three, or just remove them:
  `node --experimental-strip-types .local/seed/s64-curve.ts --undo` (then re-run without `--undo`).
- **The wipe + re-seed is still owed** and still sequenced after the curve. ⚑ Fix `.local/seed/seed-fleet.mjs`
  FIRST — it hand-sets ceilings, invents an opening price (`ceiling × 0.45`, flagged in place) and writes no
  commission snapshot. `s61-priced.ts` and `s64-curve.ts` are both worked examples of seeding through the
  real `mission_price()` RPC with `courseFromBusinessTotal`.
- `.earn-probe.mjs` at the repo root is a **tracked, stale** scratch file carrying its own copy of the OLD
  linear fare. Harmless, but it will mislead someone. Delete it when convenient.

---

**(Superseded: "★★ START HERE — THE CURVE IS SHIPPED. THREE SMALL THINGS ARE QUEUED" — the same S64, earlier.)**


**SUPERSEDED (kept for [[d78]]–[[d81]] and the § AA / § AB write-ups) — "THE CURVE IS SHIPPED", S64 earlier the same day.**

> ⚑ **S64 RAN LONG AND DID FOUR MORE THINGS AFTER THE CURVE.** Read [[d78]]–[[d83]] before touching
> anything priced. The short version: the curve shipped, then the founder read the re-pool behaviour back
> and found the design was carrying history it should not; then an adversarial review of the diff found four
> real defects. **Five migrations, all applied. Six probes, all green. Suite 462.**
>
> **What S64 did.** Step 5, the whole of it. `lib/pdp.ts` is now the §6 curve: every trip opens at its
> **rate-card floor**, moves by an equal amount **every time the time left to the pickup halves**, is
> anchored to the **pickup** rather than to when it was posted, lands exactly on the Ceiling at **T−5h**,
> and its steps are **log-spaced then jittered from a seed made of the mission id** — unguessable from
> outside, perfectly replayable in a dispute. Then the founder read the re-pool behaviour off it the same
> day and found the hole: a trip a Driver walked away from re-opened BELOW what that Driver had agreed to
> pay. Fixed, which finally forced §9's stored fare into existence.
>
> **Two migrations, both APPLIED and verified:** `2026-08-22_pdp_curve.sql` (the three re-pool RPCs stop
> overwriting the opening price) and `2026-08-22_accepted_fare.sql` (`mission.accepted_fare`,
> `accept_mission` gains `p_fare`, the re-pool raises the floor to it, `respond_to_amendment` keeps it in
> step). Commits `8a5db4c` and `602c458`. Suite **460**. Probes: `accepted-fare` 18 · `write-test` 170 ·
> `curve-live` 8 · `migrations-2026-08-10` 58/0 · `migrations-2026-08-11` 23/0 — **all green**.
>
> **Seven things S64 decided that constrain what you build ([[d78]]–[[d83]], plus [[d73]] still standing):**
> 1. **`mission.pdp_start` is the price the auction OPENS at, and it is now the rate-card floor in Course
>    space.** The SQL fee-basis band reads it. Do not repurpose it, and do not let anything overwrite it
>    except the re-pool's `greatest(pdp_start, accepted_fare)`.
> 2. **SPEED WIN's 70 % opening is DERIVED on read, never stored.** That is what lets a re-pool turn it on
>    and off without losing the floor. Never write `ceiling * 0.7` into a column.
> 3. **Rule 2 beats rule 3 where §6 overlaps** — the Ceiling is reached at T−5h, full stop, for anything
>    posted more than five hours out.
> 4. **`accepted_fare` NULL is not zero.** It means priced before 2026-08-22, and those rows recompute the
>    curve. Nothing was backfilled and nothing should be.
> 5. **A RE-POOL TOUCHES NOTHING PRICE-RELATED** ([[d82]]). Not the climb, not the opening price, not
>    `speed_win`. The price is a function of how long is LEFT, never of what a Driver did. If you find
>    yourself writing "on re-pool, set the price to…", stop and read [[d81]].
> 6. **`pooled_at` IS NOT A PRICING INPUT.** `lib/pdp.ts` deliberately does not read it. It is still stamped
>    and still read by `lib/spend.ts` for the fill-time metric. **Do not wire it back into the curve.**
> 7. **AN AMENDMENT MAY ONLY RAISE THE CEILING, NEVER LOWER IT**, and no longer collapses the curve
>    ([[d81]]). The Ceiling is the Business's own maximum; `accepted_fare` is what freezes the agreed total.
>
> ⚑ **`pdp_step` and `pdp_interval` are DEAD.** Written null everywhere, read by nothing, left in the
> schema for the archive. If you find code reading them, it is stale.

## WHAT IS QUEUED, SMALLEST FIRST

1. **The Business-facing copy sentence — PREVIEWED 2026-08-22, awaiting the founder's pick.** §6
   prescribes one: *"the price rises in steps until 5 hours before pickup, when it reaches the maximum you
   set."* The form still says only "starting price · climbs up to your Ceiling" — true, but it never says
   *when* the rise stops, which is the half a hotel needs.
   ⚑ **A REAL DRIFT WAS FOUND WHILE MOCKING IT UP.** §6 says the Business should see **"Your maximum cost:
   €273.67", with the range beneath it** — the MAXIMUM leads. The form leads with the STARTING price
   instead. That matters: a hotel quotes its Guest off the maximum, so making 36,25 € the hero when they may
   pay 110,00 € invites them to underquote. Four variants were shown; **D restores §6's shape** (maximum
   first, "opens at X and rises in steps until 5 h before pickup" beneath) and **A** is the one-line
   minimum-change alternative. Preview first (D25) — the mockups are in the S64 transcript.
2. **The two riders the curve was supposed to carry, and didn't.** `§ R` — the Pool and the archive load
   everything and filter in memory. `BACKLOG § V` — a Driver may opt in to lower-class trips and must see
   the *lower class's* price, which needed steps 1 and 5 both in place, and now has them. **The founder
   asked to be reminded of these later too.**
3. **Step 6 — the §7 30-second hold.** Last, because it shares the accept gate. It now has what it was
   missing: `accepted_fare` gives it a price to freeze against, and the curve is a pure function of
   (mission, instant) so a held price is trivially reproducible.
4. **BACKLOG § AA — SPEED WIN as a badge the PRICE can earn** ([[d83]], decided, not built). Small: a
   predicate beside `isAtCeiling`, no migration. **Needs a switch** — in beta's thin Pool it would be on
   every trip. UI, so preview first.
5. **BACKLOG § AB — asking a Business to raise the Ceiling on a trip that will not fill.** Blocked on
   notifications (deferred). The one place a popup is honestly earned.

**THEN the wipe + re-seed**, which the founder sequenced after the curve and confirmed again on 2026-08-22.
⚑ **`.local/seed/seed-fleet.mjs` must be fixed FIRST or a fresh fleet is born stale** — it still hand-sets
ceilings, invents an opening price from the ceiling (`× 0.45`, flagged in place) and writes no commission
snapshot. `.local/seed/s61-priced.ts` and the new `.local/seed/s64-curve.ts` are both worked examples of
seeding through the real `mission_price()` RPC with `courseFromBusinessTotal`.

**Still the founder's call, none blocking:** BACKLOG **§ Y** (who receives a Driver's cancellation penalty —
no screen names one until it is answered) · **§ Q6** (the unclosed-trip pile) · **§ U.4** · **§ W** · **§ Z**.

---

**(Superseded: "★★ START HERE — STEP 5, THE §6 CURVE" — S63, 2026-08-20.)**

> **What S63 did, so you don't redo it.** It cleared the four loose ends S62 queued and nothing else. An
> unlocated stop is refused by both forms (drafts excepted); the night rate, the settled waiting rate and its
> minutes, and a Driver walking away from a trip are all finally visible; and the two Earnings counting gaps
> are closed. Then an adversarial review of that diff found **three real defects in it**, all fixed the same
> day — see SESSION_LOG Session 63, "Follow-up the same session". **No migration was needed or written.**
> `d6f0932` the loose ends · `7bcbf49` the three defects the review found in them · `6b35d21` the backlog
> write-ups · plus the docs/handoff commit that follows it.
>
> **Three things S63 decided that constrain what you build ([[d74]]–[[d77]]):**
> 1. **No screen names who receives a Driver's cancellation penalty, or how much** — the founder opened the
>    question (the hotel lost nothing it paid for, so 100% of the fare is not compensation) and it is parked in
>    BACKLOG **§ Y**. **Do not put a euro figure on the "Driver cancelled" block.**
> 2. **Name the rule, don't print the number, when the number lives in a table** — the night tag says "Night
>    rate", not "×1,20". Same reason the settled waiting rate is read from the row's own stamped column and
>    never re-derived from the service class.
> 3. **A Business-facing per-minute rate is checkable and fails the check** — `×1,15` turns 0,50 into 0,575.
>    The Business gets the rate Course-side inside the invoice table only, and minutes-without-a-rate
>    everywhere else.

> **What S62 did, so you don't redo it.** A six-way audit of every money surface and write path (26 findings
> raised, 15 survived an adversarial re-check) plus the fixes: every Business-facing figure is now on the
> all-in basis — the cancel modal, Drafts, the Calendar drawer, the Edit header, the Summary rail Ceiling,
> three Spend figures, both CSV exports, the archive sort key, and the "incl. … waiting" captions. **The
> amendment flow got the commission pass it never had** (it stored a typed all-in as the Course, and showed
> the Driver a gross figure). The expanded row's breakdown now decomposes *what was actually billed* rather
> than always the fare. On the Driver's side, the close-trip card stopped promising the gross fare, My Rides
> stopped dropping settled waiting, and the VAT sentence stopped asserting a tax status the app was never
> told. **The waiting rate is now per class** — Eco 0,50 · Business 0,75 · First 1,00 €/min, researched
> against the market and the regulated taxi tariff, migration applied and verified live.
> Read `SESSION_LOG.md` Session 62 parts A–F for the detail; `docs/06` §10 holds the waiting-rate sources.
>
> **Then 2026-08-20 (parts F–H):** the waiting rate is **per class and live** (Eco 0,50 · Business 0,75 ·
> First 1,00 €/min, migration applied, verified on a real trip). A completeness audit followed — the
> arithmetic closes on both sides, the labels did not, so the Driver's "Fare" line stopped silently
> containing the waiting, both CSVs gained the service fee and its VAT, and "Cost per trip" stopped claiming
> to be fare + waiting. Then the two the founder called out: **Kavenue now prices an amendment** (it prices
> the CHANGE against the rate card and leaves the agreed fare standing — never re-quoting the whole trip),
> and **a flight number no longer turns a departure into an airport pickup** (47 live trips moved from a
> 60-minute courtesy wait at a hotel door back to 20).

---

## ✅ THE PRE-CURVE LOOSE ENDS — ALL SHIPPED (S63, 2026-08-20). Kept for the decision trail only.

> **Do not rebuild any of this.** The list below is what S62 queued; every item is done and verified against
> the live DB. Read `SESSION_LOG.md` Session 63 for the detail. The three things worth carrying forward:
>
> 1. **Who receives a Driver's cancellation penalty is now an OPEN question** — the founder opened it
>    (*"the hotel will in the end not pay anything… so what do we do with the driver's money?"*) and they
>    are right: the trip never ran, so 100% of the fare is not compensation for a loss. **The Business's
>    "Driver cancelled" block therefore ships with NO amount and NO recipient** — only that a Driver held
>    the trip, when they walked, and why. Three costed destinations are in BACKLOG **§ Y**, cross-referenced
>    from `docs/06` §1 and §12. **Do not put a euro figure on that block until it is answered.**
> 2. **`docs/06`:71 vs `rides/history` is settled** — the penalty is an indemnity, it carries no commission,
>    and the "owed to Kavenue" comment was the outlier. Corrected; the code under it was always right.
> 3. **`.local/probe/diff-sql-vs-lib.ts` was stale and was fixed** — it asserted a flat 1,00 waiting rate and
>    reported 480 "mismatches" in 673 checks on a codebase that fully agrees. It now reads **673 · ALL
>    AGREE**. If you see mass mismatches there again, suspect the probe before the code.
>
> Also shipped in passing: `Today · Today` in the Earnings day heading (latent since the feature landed —
> `formatDayGroup` already returns "Today"), and three unreachable `cancelled_by === "driver"` branches
> removed. New helpers with tests: `formatWaitingSpell` / `formatPerMinute` (`lib/format.ts`),
> `unlocatedStops` (`lib/waypoints.ts`), `driverCancelPickupAt` (`lib/earnings.ts`), `formatLeadTime`
> (`lib/format.ts`). Suite is **448**.
>
> ⚑ **An adversarial review of that same diff found three real defects, all fixed the same session** — a
> signed `hours_before_pickup` printed as "-18 min before pickup" in the CSVs and clamped to "0 min before
> pickup" on screen (**it is signed by design; BACKLOG:272 already said so**), an amend refusal that stranded
> any trip whose stop was stored unlocated before today, and the Schedule's pickup time shrinking 16px → 13px.
> See SESSION_LOG Session 63, "Follow-up the same session".

<details>
<summary>The original S62 list, as written (all four now done)</summary>

They are small. They are also the tail of a money sweep, so they are worth clearing while the context is
warm rather than rediscovering them in three sessions' time. **Roughly in this order:**

1. **AN UNLOCATED STOP IS FREE.** A stop typed but not picked from the address suggestions has no
   coordinates, so `app/(dispatch)/dispatch/new/actions.ts:143-146` (and the same filter in the amend
   action) drops it from the routed distance — it adds **nothing** to the price. It is still stored in
   `mission.waypoints`, drawn on the Driver's route rail, counted in their progress, and needs a "Reached"
   tap. The Driver drives an unpaid detour. **Reproduced live on the amend screen**: the change summary read
   *"Add a stop at Place du Casino"* while the route stayed 15 km and the fare did not move.
   The pickup and drop-off already refuse an unlocated address (`mission-form.tsx:429,431`); stops impose
   nothing. Cheapest fix is that same rule — and it belongs on BOTH the new-mission form and the amend form.

2. **THREE CHARGES THAT ARE REAL BUT INVISIBLE.**
   - **The night ×1,20.** `night_applied` is written on every mission and read by **no screen at all**. A
     Dispatcher comparing two identical airport runs cannot see why the 23:40 one cost 20% more, and the
     Driver never learns it either. `docs/06` §4 stored it precisely so "a past price stays explicable".
     A tag on the trip row and a column in both CSVs is most of the fix.
   - **The waiting rate and minutes on a SETTLED trip.** `mission.waiting_rate` is stamped per row and
     rendered nowhere. A Driver who banks 13,20 € for waiting has nothing on screen to check it against;
     the rate is only ever shown while the meter is live. Both sides should see "N min at X €/min".
   - **A Driver's own cancellation penalty is invisible to the Business.** It is an indemnity Driver →
     Business (`docs/06` §1), it is recorded in `mission_cancellation`, and **no Dispatch screen reads that
     table** — not the row, not Spend, not History, not either CSV. A hotel whose Driver walked at T−2h sees
     no trace of what it is owed. ⚠️ Note the audit also found two comments disagreeing about who receives
     it (`docs/06:71` says the Business; `app/(app)/rides/history/page.tsx:185` says Kavenue) — settle that
     first, it is a one-line doc question with a real answer.

3. **TWO DRIVER-SIDE COUNTING GAPS** (found in the same audit, not yet fixed):
   - Waiting settled on a trip the **Business** then cancelled is absorbed into "Cancelled on you" in
     Earnings (`lib/earnings.ts:319-320` only adds waiting inside the `completed` branch), so the "Waiting
     time · N min" line under-reports both the euros and the minutes the Driver actually sat there.
   - A **driver-cancelled** mission has `driver_id` cleared, so it has no row in the Earnings trip list
     while its penalty is still in the headline total — the day rows sum to more than the total, with
     nothing on screen explaining the gap.

4. **Then the curve.**

</details>

**Still the founder's call, neither blocking:** the cancellation penalty (BACKLOG **§ Y** — too weak on a
cheap trip; three shapes sketched, and the basis question pairs with it), and whether the waiting caps stay
counted in minutes (they are, and the market agrees) or get pinned in euros. **New this session:** BACKLOG
**§ Z** — should waiting be charged at an intermediate stop (the "Reached" taps already record the arrival
instant; the hard part is the clock origin, not the rate) — and a **§ W** addendum recording the founder's
own version of demand pricing: measure it from our own booking volume per zone against that zone's trailing
average, and surface it as **advice to the Business**, never as Kavenue moving the fare.

**New in S63, also the founder's call, also non-blocking:** **§ Y** gained the question that matters most —
**who actually receives the penalty** (the hotel paid nothing and bills its Guest nothing, so 100% of the fare
is not compensation for a loss); three destinations are costed there and no screen names one until it is
answered. **§ Q6** — an unclosed trip stays lifted into today's band on purpose, but there is no way for a
Business to clear one, so the band grows without bound; three fixes, smallest first. **§ U.4** — can live
Driver location hard-close a trip? Yes in mechanism, but not as stated: it collides with § U's own rule that
*location may suggest, never decide*, since a close settles the fare and any waiting fee.

**(Superseded: "PRICING STEPS 0–4 ARE SHIPPED. NEXT IS STEP 5" — S61, 2026-08-17.)**

**Read `docs/06_Pricing_Commission_Payments.md` first — all of it.** Source of truth for anything
touching price or commission. §4 was re-calibrated in S60; **§1 gained three new locked subsections
in S61** (which end of the invoice the Ceiling sits at · the Driver's number is the Driver's payment ·
where VAT is broken out). §13 is the build order. Do not price anything from memory.

**SHIPPED AND LIVE (steps 0–4). Verified against the real Supabase DB.**

| | | commit |
|---|---|---|
| 0 | `docs/06` §4 rewritten — two distance bands, First rebuilt, First—van added | `69dcf55` |
| 1 | `rate_card` + seed + `mission_price()` / `rate_card_for()` | `f137fff` |
| 2 | The V-Class is First, the Vito is Business (`lib/vehicle-catalog.ts`) | `441b50f` |
| 3 | `/dispatch/new` pre-fills the Ceiling, refuses a post below the floor | `8173782` · `19c04ea` |
| 4 | **Commission** — all-in for the Business, net for the Driver | `f85715f` |

**THE ONE SENTENCE THAT EXPLAINS EVERY MONEY NUMBER IN THE APP ([[d73]]):**

> `mission.ceiling` stores the **Course**. Nobody is shown it. The Business sees `course × 1,15`
> (all in, fee inside — that is what the Ceiling field means); the Driver sees `course × 0,88` (what
> they bank). The conversion happens once on write, in `createMission`, and on read via
> `lib/commission.ts`.

**⚑ DO NOT "SIMPLIFY" `mission.ceiling` INTO THE ALL-IN NUMBER.** Every fee, every band and every
cancellation basis is computed against it in Course space, including the SQL fee-basis clamp. Changing
what the column means silently inflates every fee by 15%.

**Live and applied:** `2026-08-17_commission.sql` (one-row `commission_rate` + four nullable snapshot
columns on `mission` + `commission_split()` / `transport_vat()` / `commission_for()`) and
`2026-08-17_transport_vat_snapshot.sql` (a `before update of driver_id` trigger freezing the accepting
Driver's VAT status; verified 10/10). **NULL rates mean priced before commission** — the whole
pre-2026-08-17 archive renders as one plain amount, correctly, and must keep doing so.

**Six demo trips exist so the work is visible** — reference `S61DEMO`, made by
`.local/seed/s61-priced.ts` (`--undo` removes them). **The mission baseline is 277, not 271, while
they exist**, and `.local/probe/transport-vat-2026-08-17.ts` still asserts 271 — run `--undo` first or
re-base it.

---

## NEXT: STEP 5 — THE §6 CURVE. Money-critical. Read §6 in full first.

Replace `pdp_start` / `pdp_step` / `pdp_interval` with the designed curve. What changes:

| | today (D21) | §6 |
|---|---|---|
| Opens at | 50% of the ceiling (70% SPEED WIN) | **the floor** |
| Steps | fixed size, fixed interval | equal movement each time the **remaining time halves** |
| Anchored to | when it was posted | **the pickup** |
| Reaches the ceiling | whenever the steps add up (~2 h) | exactly at **T−5h** |
| Predictability | a ladder anyone can compute | **jittered, seeded from the mission id** — unguessable, but replayable in a dispute |

**⚠️ WHY THIS ONE IS DIFFERENT FROM EVERY OTHER STEP.** `pdp_start` is not only a display number: the
SQL clamps every cancellation and no-show fee basis into
`[least(pdp_start ?? ceiling × 0.5, ceiling), ceiling]`
(`docs/migrations/2026-08-11_fee_basis_band.sql:120`). Move where the curve opens and you move what a
fee can legally be. **This ships with the money tests updated and BOTH probes re-run** —
`.local/probe/migrations-2026-08-10.ts` (68 checks) and `.local/probe/migrations-2026-08-11.ts` (23),
plus `diff-sql-vs-lib` and `write-test` first, always.

**It carries two riders — do them together, they touch the same read path:**
1. **The § R growth limit** — the Pool and the archive load everything and filter in memory.
2. **BACKLOG § V** — a Driver may opt in to lower-class trips; they must see the *lower class's* price,
   which needs steps 1 and 5 both in place.

**Then step 6: the §7 30-second hold**, last, because it shares the accept gate.

---

## THEN, AND THE FOUNDER HAS ALREADY SEQUENCED IT

**Wipe the whole test database and re-seed once, AFTER the curve** (founder, 2026-08-17). The reasoning:
step 5 is the last thing that changes what a newly posted trip looks like, so anything created before it
is stale on arrival; and § S (Spend pass 2) still needs the 237-mission fleet for its charts. Doing it
once means doing the careful part once.
- It is **more than the `mission` table** — status events, cancellations, releases, amendments, guest
  contacts and info-change rows all hang off those trips.
- **Update `.local/seed/seed-fleet.mjs` FIRST**, or a fresh fleet is born stale: it still hand-sets
  ceilings and writes no commission snapshot. `.local/seed/s61-priced.ts` is the worked example of
  seeding through the real `mission_price()` RPC and `courseFromBusinessTotal`.

---

## SAVED, NOT FORGOTTEN — all in `project/BACKLOG.md`

- **§ V** — Driver opts in to lower-class trips. Ships with step 5.
- **§ W** — demand-based pricing. Parked with the reasoning (the auction already is demand pricing).
- **§ X** — rename the `luxury` enum to `first`, retire the vestigial `van`. Its own isolated session
  **after** the pricing engine — it touches the exact files steps 4–5 rewrote.
- **§ Y (new, S61)** — **the cancellation penalty is too weak on a cheap trip.** The founder's own
  case, raised more than once: *"a €50 trip … a driver would be tempted to cancel."* 100% stays for
  now. A floor (they floated €150 *as an illustration*), a multiplier near pickup, or visible
  reliability marks. **Pairs with the basis question:** after S61 the penalty is the one figure a
  Driver sees gross, so "100% of what you'd have been paid" is the same conversation.
  ⚑ **Extended S63 — and this is now the load-bearing part of § Y:** *who receives it.* The founder's
  question — *"the hotel will in the end not pay anything and won't charge their clients, so what do we do
  with the driver's money?"* — is the hole in `docs/06` §1. The trip never ran; 100% of the fare is sized to
  deter the Driver, not to make the hotel whole, and those two jobs point at different recipients. Three
  destinations costed. **Until it is answered, no screen names a recipient or an amount** ([[d74]]).
- **§ Q6 (new, S63)** — the unclosed-trip pile. The lift into today's band **stays** (founder: the
  discomfort is what makes a desk chase the Driver), but a Dispatcher has **no way to clear a row** — amend,
  release and cancel are all switched off and the only instruction is "call them". A nag with no door becomes
  wallpaper. Three fixes, smallest first; the first settles money ([[d75]]).
- **§ U.4 (new, S63)** — hard-closing a trip on observed arrival. Right mechanism, wrong shape as proposed:
  use arrive-**then-leave**, make location drive a one-tap prompt rather than the close, and auto-close only
  where `on_board` was already tapped and no waiting or no-show money is open. § Q's own failure case (the
  Driver returns to the airport next morning and the app pays out yesterday's trip) is the argument.

---

## TRAPS LEARNED IN S63 — every one of these cost real time

- **`.local/probe/diff-sql-vs-lib.ts` WAS LYING, and was fixed.** It asserted a flat 1,00 waiting rate — a
  rate that stopped being flat in S62 — and reported **480 mismatches in 673 checks** on a codebase where SQL
  and lib agree completely (every MIN, FEE, FROM and TO check passed). It now reads **673 · ALL AGREE**.
  ⚑ **If you ever see mass mismatches from a probe, suspect the probe's expectations before the code** — the
  probes are not covered by CI and drift silently when the thing they mirror changes.
- **`mission_cancellation.hours_before_pickup` IS SIGNED, and negative is normal.** `driver_cancel_mission`
  computes `(pickup_at - now())/3600` and accepts a cancel from `accepted`, `confirmed`, `en_route` AND
  `arrived` — the last two routinely happen *after* the pickup (a Driver who waits out a 60-minute airport
  courtesy wait and gives up). BACKLOG already recorded the same on no-show rows. **Clamping it at zero and
  printing it raw are both lies**; `formatLeadTime()` in `lib/format.ts` names the side ("18 min after
  pickup") and is shared by the row and both CSVs so they cannot drift.
- **`.dxh-when > span` and `.dx-trip__when > span` capture ANY child span.** Wrapping the Schedule's plain
  time cell in `dx-trip__when` silently shrank it **16px → 13px** — the column a Dispatcher scans first. The
  tell was `.dx-trip__time` ending up matching no element in the codebase. Adding a child to either of those
  cells needs a paired rule with two-class specificity.
- **`waiting_rate` non-null does NOT mean the trip waited.** Both no-show paths stamp the rate
  unconditionally, so a punctual no-show carries a rate with **0 minutes** and a 0,00 fee. Gate any waiting
  display on the MINUTES.
- **`needsClosing` also accepts `on_board`, and requires `close_answer` to be null.** Counting "unclosed past
  trips" as `{accepted, confirmed, en_route, arrived}` gave 13 against the screen's 18 and did not reconcile.
  Re-measure against the real predicate before quoting a number to the founder.
- **A refusal added to a form applies to STORED data too.** The new unlocated-stop rule fired on the stops the
  amend screen re-posts from the mission row, so any trip whose stop predated the rule became un-amendable.
  When you add a validation, ask what it does to rows written before it existed.
- ⚑ **Commit to a BRANCH, not to `main`.** `main` is protected and the push is rejected — recoverable
  (`git branch <name>` at the same SHA, push, wait for CI, then `git push origin main`), but it wastes a CI
  cycle. See the workflow warning further down; S63 tripped it once.

## TRAPS LEARNED IN S61 — they will cost you an hour each

- **JavaScript cannot reproduce Postgres money arithmetic with floats.** The first SQL-vs-lib parity
  run found **14 divergences in 1 900 checks**, every one an exact `.5` tie: Postgres computes
  `556.9 × 1.15` as `640.435` and rounds half away from zero to **640,44**; JS computes
  `640.4349999999999` → **640,43**. `Number.EPSILON` is two orders of magnitude too small to fix it.
  `lib/commission.ts` is therefore **integer cents in BigInt**, and
  `.local/probe/commission-parity.ts` holds the pair at 1900/1900. **Run it after any change to either
  copy.**
- **The invoice VAT line is a REMAINDER, not 20% of the fee.** That is what makes the three lines add
  to the total at every Course. It can sit a cent off; it can never fail to reconcile.
- **A trip inserted with `driver_id` already set gets no VAT stamp.** The trigger is `before update of
  driver_id` — deliberately, since a real trip is posted first and accepted second. Seed the way the
  app writes: insert, then attach the Driver in a second statement.
- **The current curve maxes out in ~2 hours**, so a seeded trip "accepted" three hours after posting
  settles at its ceiling and the *"what the auction saved"* line has nothing to say.
- **`?error=missing` after a post you thought worked:** the mission form's `pickup_at` is a
  React-controlled hidden input. Setting it from JS is wiped on the next render — drive the real date
  picker, and read the result in a SEPARATE tool call (React state has not flushed within the same one).

## TRAPS LEARNED IN S60 — still true

- **A browser error naming a symbol that is not in the file any more means the DEV SERVER is stale.**
  Stop the preview, `rm -rf .next/cache/webpack`, restart. Do not debug the source.
- **The pricing formula exists TWICE on purpose** — `lib/rate-card.ts` and SQL `mission_price()`. Same
  now for commission. `tests/rate-card.test.ts` and `tests/commission.test.ts` pin both.
- **`formatDistance()` is the STRAIGHT-LINE helper** and rounds to whole km above 10. Never use it for
  anything a price depends on.
- **Driving the address combobox from JS:** set the value with the native setter, fire `input`, wait
  ~2.5 s, then dispatch `ArrowDown` + `Enter` keydowns. The a11y tree does not load in the preview
  pane, and screenshots only capture at scroll 0 — hide preceding siblings to shoot a card lower down.
- **Verifying a write path costs a row.** Post, inspect, delete by id, then re-assert the baseline.

*(Everything below this line is S58's record, kept for its decision trail. The workflow warning immediately
following still applies to every push.)*

**⚠️⚠️ READ THIS FIRST OR YOUR FIRST PUSH WILL BE REJECTED — `main` IS PROTECTED SINCE 2026-08-10.**
The ruleset `main — CI must pass` (active, default branch, required check **`types · tests · build`**) refuses
any commit that has not already passed CI somewhere. **The loop, every time, including docs-only commits:**
```
git checkout -b <branch> && git commit && git push -u origin <branch>
gh run watch <id> --exit-status            # ~1 min
git checkout main && git merge --ff-only <branch> && git push origin main
git push origin --delete <branch> && git branch -D <branch>
```
The final push is accepted because that SHA already carries a green check. There is no exception and that is
the point. S58 ran it six times.
- ⚑ **Backticks in a `git commit -F -` heredoc get shell-expanded** — S58 lost a word to it. Quote the
  heredoc marker (`<<'EOF'`) or use plain quotes in the message.
- ⚑ If CI fails on something you can't reproduce locally: the runner has **no `.env.local`** and **no
  `.local/`**. Anything quietly depending on either only breaks there.

**JOB 1 — CI. ✅ SHIPPED (S58, 2026-08-10; commits `3032d8a` + `2a4e1de`, both runs green in ~1 min).**
One file, `.github/workflows/ci.yml`: on every push (any branch) + PR, a fresh Ubuntu runner does `npm ci` →
`npx tsc --noEmit` → `npm test` → `npx next build`. Node pinned to **25** (the Mac's), `checkout`/`setup-node`
at **v5** (v4 annotates every run about the Node 20 runtime), `concurrency: cancel-in-progress`. The build step
carries **placeholder** env vars — `next build` needs them to exist, not to be valid — and **no step touches the
live DB**. Verified before pushing in a detached worktree with **`.env.local` absent**, which is the honest CI
condition: `tsc` clean · 294/294 · build green.
- **✅ Branch protection is ON** — the founder created the ruleset the same session. See the warning at the top.

**★ SESSION-58 part B — ✅ § Q SLICE 1 SHIPPED (2026-08-10; deployed `53e433c` → Vercel `success`; NO
migration; `npm test` 314).** A trip the Driver never closed is no longer invisible. Full brief, the founder's
rulings, the departures from § Q and everything deliberately left out:
**`project/NEEDS_CLOSING_BRIEF.md`** — read that before touching any of it, and read § Q in BACKLOG for the
parts still standing.
- **The rule: 30 minutes after the Driver reached the destination.** The anchor is **arrival** — estimated
  today from the booked route, **observed by a geofence once there's a native app. One term changes and
  nothing else does**, which is why the founder green-lit building it on the clock.
- **A trip that never started keeps § Q's 3h** — "30 minutes after arrival" needs an arrival. Both are
  floored so neither fires inside the check-in hour. Don't collapse them back into one number: live
  `duration_min` has a **median of 27 min**, so a flat arrival+30 fires at pickup+57 on **67%** of trips and
  would replace the red *"Not checked in — call them"* with an amber clerical note.
- **✅ SLICE 2 SHIPPED AND VERIFIED LIVE.** `2026-08-10_mission_close_answer.sql` applied by the founder the
  same session. Both answers driven through the real UI: `driven` → `completed` with **`waiting_fee` NULL**;
  `not_driven` → status unchanged, nothing charged, the Business's row red with *"Driver says it didn't
  happen"*. Missions restored, baseline **271**.
- ⚑ **The thing that must not be "simplified" later:** `answerClose`'s `driven` branch is ONE guarded
  `→ completed` UPDATE and deliberately does **not** call `advanceStatus`. That walk's `on_board` step runs
  `board_guest`, and `mission_waiting()` returns **the ceiling** when called days late — **660,00 €** invented
  across the 13 live `confirmed` rows — and a walk that dies partway parks the trip in `arrived`, the one
  status unlocking both no-show doors. The comment says so at the call site. Leave it alone.
- ⚑ **The seeded data makes it look alarming:** Le Grand Hôtel's schedule opens on a wall of amber rows. Those
  are test trips nobody ran to the end, not a design problem — in real use it's one at a time. **The founder
  has decided the cleanup happens when the build is finished, not before** (their S56 ruling, re-confirmed
  2026-08-10 when they offered to clean now and the answer was no: slice 2 needs unclosed trips to test
  against, and § S needs the 237-mission seeded fleet for its charts). `.local/seed/seed-fleet.mjs --undo`
  when the time comes.
- ⚑ **§ U is new in BACKLOG** — location as evidence, gated on the native app: block an early *Arrived* tap on
  a GPS mismatch, and lateness penalties. Read it before agreeing to either — the Arrived guard **must not be a
  hard block** (`arrived` is the precondition for reporting a no-show, so a dead GPS fix would stop an honest
  Driver claiming a fee), and lateness penalties inherit D61's rule that you may not punish someone for
  ignoring a prompt they were never shown.
- ⚑ **The founder tests within the hour and finds what the tests can't.** S58's automated suite was green when
  a real defect shipped: `not_driven` writes no status, so an answered trip fell back into Upcoming. The bug
  was in **the state after the action**, which a unit test over a pure predicate cannot see. **When a write
  path ships, look at the screen the user lands on next — not only at the row in the database.**

**JOB 2 — § S Spend pass 2 — ⇦ STILL THE JOB, now that § Q slice 1 is in.** Full brief and the founder's rulings: **`project/SPEND_BRIEF.md` § 9**. Pass 1
(`/dispatch/spend`) is live and untouched since S54. Owed: booking-notice (lead time × fare × fill rate) ·
committed-spend tail · Route breakdown polish · then the service check (on-time from `status_event`) and the
demand heatmap. "Arrived on time" stays blank until check-in data exists. **D25 preview loop applies** — this
is a UI job, so show a mockup and get sign-off BEFORE building. Reuse `components/date-cal.tsx` and the § R
filter vocabulary; do not build a third date control.
- ⚑ **Context for why Spend was paused, which the founder asked about and should not have to ask twice:** it
  wasn't a detour. S54's Spend page was the first screen to total money across everything, and auditing it
  found 17 defects (3 wrong money). That is what produced S55 (tests) → S56 (SQL parity) → S57 (the other 17).
  **Two different audits each found 17 things** — S54's were Spend-page defects, S56's were cancellation and
  waiting drift. Unrelated lists, same number, and it confuses everyone who reads the logs.

---

**★ SESSION-57 — ALL 17 DRIFT-AUDIT DEFECTS CLOSED (2026-08-09/10, Mac).**
Deployed `06aae27` · `0bf3f3f` · `ed9d660`, all Vercel `success`. `npm test` = **294**. Detail: SESSION_LOG
S57 and S57 part B. **Five migrations were written and the founder applied all five the same day**, each
verified live immediately after.

**Two probes are the asset here — use them, don't rebuild them.** Both are git-ignored, re-runnable,
manifest-first, `--undo`, delete by recorded id, and assert the **271-mission baseline** at the end:
- `.local/probe/migrations-2026-08-10.ts` — **68 checks.** Re-pool clears `checked_in_at` on all three paths
  and both sides of the 24h window, the SPEED-WIN pricing each branch writes (`<24h` → 0.7 × ceiling / 5 min;
  `≥24h` → 0.5 / 10 min), and `respond_to_amendment` end to end.
- `.local/probe/migrations-2026-08-11.ts` — **23 checks.** The fee-basis band, accept eligibility, and one
  live ask incl. the money case. Run either after ANY change to the cancel RPCs, `accept_mission`,
  `propose_release`, `respond_to_amendment` or the `trg_amendment_replaces_release` trigger.
- Regression cover to run FIRST, always: `diff-sql-vs-lib` 649 · `write-test` 170.

**⚑ WORKFLOW CHANGE THE FOUNDER MUST REMEMBER:** `/pool?all=1` is now **LISTING-only**. It still shows every
pooled trip, but `accept_mission` enforces tier / body / luggage in SQL and cannot read `NODE_ENV`. To demo
another tier: change the car in `/settings/vehicle`, or sign in as a seeded per-tier Driver
(`/api/dev-login?email=seed.<first>@kavenue.test`).

**⚑ THE THREE HONEST RESIDUALS** (all in BACKLOG § H2, none blocking beta, none a decision anyone is waiting
on): the fee basis can still be **understated down to `pdp_start`** (~50% on a standard curve — closing it
needs a SQL pricing engine, which would contradict `lib/pdp.ts` being the single fare authority); the **two
no-show doors** keep the omittable-basis hole in SQL (their TypeScript signatures are tightened, which closes
the app path only); and `accept_mission` checks the **declared** car, not a real one (`/settings/vehicle`
re-declares it through the service role with no `verified` gate).

**⚑ ONE OPTIONAL THING, deliberately NOT written as a migration** — revoking browser-role writes on
`driver`/`vehicle`. It buys only the two states the app can't produce and costs a standing rule that any
future client-side write 403s. Founder's call; nothing waits on it.

**⚑ METHOD NOTE, now true three sessions running.** Fix plans were **adversarially refuted before being
applied**, and the refutations changed the work every single time — hiding the pending card would have
stranded it; a `hasCheckedIn` scaffold would have left the Business's row permanently red; an unlocked
`mission_id` read needed a post-lock assert. The refuters also got things wrong (a bogus test count, a pair of
line numbers both agreed on), so the settle pass has to overrule them, not just obey. **Keep doing this on
anything money-adjacent.** S56's plan output: that session's `tasks/wrw5wnrkj.output`, `.result.checks`.

**⚑ PROBE LESSONS worth not re-learning.** (1) An insert whose `error` is never checked reports success and
silently does nothing. (2) The tier is `luxury` in SQL and only *labelled* "First" — `'first'` is not a valid
`vehicle_category`. (3) Run `.local/probe/*.ts` with **`node`**, not `npx tsx` (no `"type": "module"` in
package.json, so tsx compiles them as CJS and top-level await fails). (4) A test can pass for the wrong
reason: the first fee probe sat 6 h out where the cancel is free, so `0 × anything` was 0 and it proved
nothing.

---

**★ SESSION-56 — THE SQL SIDE PROVEN · THE CANCEL FEE STEPS · THE WAITING MODEL COMPLETED (2026-08-09, Mac).**
Deployed `7a37ee5`, Vercel `success`. `npm test` = **266**. Two migrations applied by the
founder: `2026-08-09_cancel_fee_30min_steps` and `2026-08-09_waiting_settles_on_board`. Detail: SESSION_LOG S56.

**What shipped, in one line each:**
1. **§ H2's SQL side is no longer a guess.** 649 read-only checks (`mission_is_airport` / `mission_waiting` are
   `immutable`, so PostgREST will *execute* them) + 170 live checks driving tagged throwaway missions through the
   real RPCs → **0 disagreements**. ⚑ S55's plan of "recompute historical fees" was a **dead end** — excluding the
   seeded fleet there are **zero** cancelled/no-show missions and `mission_cancellation` is an empty table.
2. **The Business cancel fee steps every 30 min** instead of sliding ([[d70]]). Founder's call: a rule people can
   plan around beats a slope nobody can perceive. Rounded in the Business's favour; the modal shows the next raise
   and counts down to it. ⚑ **The step CREATED a bug the harness caught the same hour**: a multiple-of-5 pct makes
   exact half-cent ties routine (1 fare in 20 at 95 %), and float64 rounded them the other way from Postgres. New
   `cancelFeeAmount()` works in integer cents.
3. **The waiting model is complete** ([[d71]]). Founder's ruling: *waiting is owed whenever it happened.* A trip
   that RUNS now settles it (`board_guest`); the cancel modal quotes the whole bill; the Driver can see waiting
   they were paid.

**⚑ THE PROBES ARE THE ASSET — `.local/probe/` (git-ignored, re-runnable). Use them, don't rebuild them.**
- ⚠️ They are `.ts` with top-level await and no `"type": "module"` in package.json — run them with **`node`**,
  not `npx tsx` (tsx compiles them as CJS and they fail to transform). New `.mts` scratch probes run either way.
- `migrations-2026-08-10.ts` — 68 checks. Re-pool clearing `checked_in_at` on all three paths + both 24h
  branches + the SPEED-WIN pricing, and `respond_to_amendment` end to end. Bumps `reliability_marks` as a side
  effect of its two driver-cancels and puts it back.
- `diff-sql-vs-lib.ts` — read-only, 649 checks. Run after ANY change to `mission_is_airport` / `mission_waiting`.
- `write-test.ts` — 170 checks through the real Business-side RPCs, deletes by recorded id. Run after ANY change
  to the cancel/no-show RPCs or their `lib/` mirrors.
- `board-guest-test.ts` — 51 checks, incl. the double-settlement proof.
- ⚠️ **They write to the LIVE DB.** Manifest first, `try/finally`, `--undo` on each. The first run of `write-test`
  left 15 rows behind when it crashed before cleanup. Always confirm the baseline (**271 missions** today) after.

**★ NEXT, in the founder's stated order.**
1. ~~**The rest of the 17.**~~ **✅ The six that needed no decision are DONE (S57)** — four shipped, two written
   as migrations awaiting the founder. See the S57 block at the top for the six that remain and why.
2. **CI** (~30 min) — **now the top item.** The suite is fast and green and nothing runs it but memory, while
   Claude sessions push straight to `main`.
3. **The €0-fee hole** — `p_fare_snapshot` is not merely forgeable but **omittable**: omit the argument and
   `coalesce(…, 0)` stores a 0,00 € fee, on both `business_cancel_mission` and `driver_cancel_mission`. Nil risk
   in beta (needs a deliberate API call, no money moves) — **fix it before real money**. There is no fare function
   in SQL to recompute against, so it is `not null` + a clamp, or port the PDP into SQL.

**⚑ FOUNDER DECISIONS FROM THIS SESSION — do not reopen:**
- **Steps, not a slope**, at **30 minutes**, rounded in the Business's favour. They disagreed with Claude's
  fairness argument and were right: *"we have to make rules and they'll get around it."*
- **Waiting is owed whenever it happened.** Business pays the Driver; the Business charges its own Guest.
- The Driver sees **one simple amber line** at boarding. The Business is **not** notified at that moment. There is
  **no waive button**.
- **The boundary race is NOT worth fixing** (a ~2-second window every 30 min, one step, with a visible countdown).
  Logged in § H2; don't re-propose it.
- **The seeded fleet STAYS** until the build is finished — *"we will clean the database when we finish building."*
- **Parked for the pricing conversation:** penalty *paliers*. Claude's position, argued and recorded: bands keyed
  to fare backfire (they make the expensive trip the cheapest to abandon, and a €399/€401 edge is gameable); the
  cheap-trip weakness is a **floor** problem, the expensive end is already handled by *time*. Also parked:
  *"what if the Business doesn't want the Driver to wait past the courtesy wait"* — note `business_declare_no_show`
  is already half of that lever.

**⚑ HOW THE FOUNDER WANTED TO BE TALKED TO, by the end of this session (honor it):** very short answers, plain
words, **worked examples with real euro figures**, and **one job at a time announced before it starts**. They said
twice that it was getting hard to keep up. Long analytical messages actively cost comprehension here.

**★ SESSION-55 — MONEY TESTS SHIPPED + 2 fixes (2026-08-09, online session).**
Merged to `main` (`d4d98e9`, fast-forward). `npm test` = **247 tests, ~1.5 s** over the money functions —
`settledFare` · `rowCost` · `spendTotals` · `businessCancelPct` · the `currentSpan`/`comparisonSpan` pair — plus
the cross-file invariants (Business charged == Driver paid; History == Spend == CSV; `settledFare` as the one
basis). Vitest is a new dev dependency, so **`npm install` before `npm test`**. Every money bug that ever shipped
is pinned as a test. Detail: **SESSION_LOG Session 55**.
- **Two fixes shipped with it.** `HistoryResult.spend` (a fares-only total that forgot waiting, read by nobody)
  is **deleted**; and `/dispatch/spend` no longer *scores* a day that isn't over — a new `isRunningDay()` makes
  the "Today" chip neutral and reads `Day still running · <yesterday> came to <total>`. A running month/week/year
  is already truncated to matching days, so its green and red are untouched.
- **⚠️ NOT verified in a browser** (S55 was online, no DB). Worth one glance at `/dispatch/spend` → Today.
- **⚠️ Vercel deploy of `d4d98e9` was never confirmed** — the online session had no way to check. Verify it landed.

**★ NEXT ON § H2 — THE SQL SIDE. NEEDS THE MAC (founder's call).** The fee rules exist **twice**: in `lib/`
(`cancellation.ts` · `pdp.ts`) and inside the RPCs. S55 tested the `lib/` half thoroughly; **nobody has ever
proved the two agree.** They were written to match and were checked by hand in July — which is not the same thing.
Two levels, cheapest first, and **stop for the founder's go-ahead before writing to the DB**:
1. **Read-only.** Find missions the real RPCs already stamped with a `cancellation_fee`/`waiting_fee`, recompute
   what `lib/` says they should have been, report every disagreement. ⚠️ **EXCLUDE the seeded fleet** — those 237
   missions had their fees written by a **JS mirror** of the rules, so including them tests the mirror against
   itself and proves nothing. Use the founder's own real missions.
2. **Write.** One tagged throwaway mission driven through the real RPCs and compared, then undone — the only way
   to prove `RPC writes fee → page reads it`.
Then: **CI**, so `npm test` runs on push instead of when someone remembers (~30 min; the value is that Claude
sessions push to this repo). **Not planned:** React/component tests — slow to write and they break on every
redesign, and this app redesigns.

**★ SESSION-54 — DISPATCH SPEND SHIPPED (2026-08-07/08).**
`/dispatch/spend` is live: total + what makes it up + spend-over-time (paired bars vs the previous period) + a
breakdown by Type · Class · Route · Driver · Desk + "What went wrong" + the trip list + CSV. Pass 1 of **BACKLOG § S**.
Full brief, founder rulings, and what is deliberately deferred to passes 2–3: **`project/SPEND_BRIEF.md`**.
Deployed `7378291`. Detail in SESSION_LOG (Session 54 and 54 part B).

**⚑ FIRST THING: there is seeded test data in the LIVE DB.** 237 missions over 3 months, 6 Drivers, 3 desks on
**Le Grand Hôtel (demo)** — it exists because 3 settled trips could not test anything. It shows in Spend, History,
Calendar and the Schedule's past. The founder's own 28 missions are untouched and excluded from cleanup.
Remove it with **`node .local/seed/seed-fleet.mjs --undo`** (git-ignored, deletes by recorded id, never by pattern;
`.local/seed/README.md` explains it). **Decide early whether to keep it** — most § S follow-on work wants it there.

**⚑ THE HONEST STATE OF THE MONEY.** Everything was verified by hand this session and the numbers agree across the
page, the CSV and History (5 879,69 € on all three for the same filter). But an adversarial audit of code that had
ALREADY been shipped-and-verified found **17 real defects**, three of them wrong money — including a default landing
view that compared 8 days of one month against 31 of another and painted the gap green. The lesson is not "look
harder": it is that **§ H2's automated tests are now the highest-value engineering item in the backlog**, ahead of any
new feature. Money functions first — `settledFare` · `rowCost` · `spendTotals` · `businessCancelPct` · the
currentSpan/comparisonSpan pair. Nothing is charged in beta, so the risk today is trust, not euros.
> **✅ DONE in S55** — that exact list is now covered by 247 tests (`npm test`). What remains of § H2 is the **SQL
> side** (the RPCs, which need the Mac) and **CI** — see the START HERE block above. The tests were also proved
> able to fail: two real defects were reinstated in `lib/`, produced 28 and 4 failures, and were reverted.
- **Not yet exercised end-to-end:** the seeded fees were written by a JS mirror of the app's rules, not by the real
  RPCs. Page arithmetic over those columns is tested; `RPC writes fee → page reads it` is not.

**What § S still owes (all in SPEND_BRIEF § 9):** booking-notice (lead time × fare × fill rate), committed-spend tail,
Route breakdown polish, then service check (on-time from `status_event`) and the demand heatmap. "Arrived on time"
stays blank until check-in data exists. `?filter=` has no control on Spend (URL-only; the unfilled case is covered by
its own lens).

**★ THE OLDER MENU — the founder picks. Nothing is pre-selected; open with these in 2–3 lines (rule #4).**
The obvious candidates, in the order they'd help most:
1. **§ S — Dispatch-side Earnings / spend** ("a real one, complete and pro"): the founder already asked for it, it
   **wants charts and desktop-class controls** (unlike the Driver's, [[d59]]), `settledFare()` already solves the maths,
   and it should adopt `components/date-cal.tsx` + the § R filter vocabulary rather than inventing a second one.
   Research best-in-class first; D25 preview loop applies. **This is the natural follow-on from § R.**
2. **§ T — the Earnings lag** (below): one file, real restructure, well understood.
3. **The two quick ones** (§ 1 and § 2 in the worst-first list below): the Business default vehicle class that's saved
   and never read (~1h), and the 7 French strings in the English app (~30 min).

**Also open: § T — the Earnings lag, already measured, don't re-measure and don't trim the queries.** Production is
**1.97 s cold / 0.34 s warm**; the 7 queries run in parallel and cost about one query's latency (146 ms for one alone),
so **the cause is a serverless cold start, not the query count** — Hobby plan, not fixable in code. Query trimming is
**explicitly rejected in § T** with the numbers. The one fix worth making is perceptual: wrap the loads in a
`<Suspense key={period…}>` with a skeleton, so the total shows as loading instead of sitting there looking final while
it's stale. One file, but a real restructure — give it a proper slot, not the tail of a session.

**★ ABANDONED TRIPS — ✅ RULED ON + DESIGNED, then PARKED by the founder (2026-07-31, S52). Do NOT reopen it as an open
question, and do NOT re-derive the design — it's written out in full in BACKLOG § Q.**
§ P closed the *unfilled* hole; this was the other one (**8 past trips sit `confirmed`/`on_board`**, one for 36 days).
**Founder's call: leave it for now** — in beta they're the only one creating trips, so all 8 are test artifacts, and the
good version needs push, so building now ships the weak version twice.
- **What resolved it:** every escape valve already built (copilote · agreed release · T-60 · cancel) answers *"this trip
  isn't going to happen"* — someone's unhappy, so someone acts. **Covered.** The open hole is the opposite case: *the
  trip DID happen and nobody tapped the last button.* Nobody is unhappy, so nobody chases it — only the record is wrong,
  and the record is what pays the Driver and bills the Business.
- **The agreed shape:** not a rule that guesses (time can never separate "drove and forgot" from "never turned up") but a
  **question** — a pinned card (**not a modal**) on the Driver's My Rides ~3h after the trip should have ended, three
  answers; the Business meanwhile sees an honest "Waiting on the Driver to close this" + **Nudge, never close**; the
  question **expires in ~48h and flips to the Business**, who knew that day; neither answers → back-office.
- **Blocked on push** (the card only fires if the Driver opens the app) → lands with notifications (menu **B**) or the
  back-office (**§ F2**). **Geolocation auto-close was considered and is V2** — a PWA only gets location while the app is
  on screen; and location may **suggest, never decide** (location closing a trip = location *paying* someone).

Then, worst first:
1. **A Business's default vehicle class is saved and never read.** `default_vehicle_category` saves in Settings →
   Booking defaults; `/dispatch/new` ignores it. **⚑ Confirmed by the founder 2026-07-31 and it is a trap:** the form
   *looks* right because `service-class-fields.tsx:41` falls back to a hardcoded `"business"` — that is a coincidence,
   not the setting being read. The body type falls back to `""`, which is why Sedan is unselected. **Also decide:** the
   setting is ONE `default_vehicle_category` while the form has TWO controls (tier + body), so wiring it needs to say
   which it fills. ~1h.
2. **French strings inside the English app** — 7 in `components/date-time-picker.tsx` ("Choisir une date", "Mois
   précédent", "Heure exacte"…) on the most-worked screen, **plus the Dispatch schedule's day headers** ("Samedi 11
   Juillet" — spotted S51, `formatDate` in `lib/format.ts`; S47 fixed `formatMonth` to `en-GB` but not this one).
   Do both together. ~30 min.
3. **Only the latest edit shows.** `mission_info_change` records every edit to a posted trip; the schedule renders one
   ("…and 2 earlier edits"). ~half a session.
4. **A second vehicle** — scoped in [[d58]], groundwork shipped. ~half a session.
5. **Saved-addresses book** (§ L) — needs a small additive table. ~1 session.
6. **Reliability marks** — a conversation before any code: does a Driver see their own?
7. **Guidance Tier-2 tooltips** — the biggest UI-completeness item (Ceiling / Pool / SPEED WIN / the status pills are
   "taught in fragments and defined nowhere"), plus folding `.set-note`/`.rf-hint`/`.ds-note` into one component.
   ⚠️ `GUIDANCE_AUDIT.md` predates S31/S37, which closed some of its 15 gaps — re-check before using it as a worklist.
8. **The logo re-export** (sky-blue → navy) — founder's own, ~15 min.
- **Blocked, not forgotten:** the suggested Ceiling/base-fare range is the audit's highest-leverage item but needs the
  pricing rule (option C).

**★ The A–D menu below is UNTOUCHED and still current** when the founder wants to leave the Driver↔Dispatch loop.
Open with it in 2–3 lines and let the founder pick — do NOT start any of it unprompted (rule #4).

**The Driver app is now COMPLETE**: Pool (S43) · both mission cards (S45) · My Rides + Past (S46–S47) · Account +
documents (S48) · Earnings (S48b). There is no un-redesigned Driver screen left. That's why the next step is a genuine
choice rather than the next item on a list.

**A — The back-office (`/admin`).** *The one thing that unblocks real users.* **Scope grew on 2026-07-30:** the founder
walked through the surfaces and two additions came out of it — **BACKLOG § O (trust & safety: incidents, an investigation
trail, and blocking a Driver with a notice)**, which today has NO answer at all (the only lever is editing
`driver.verified` by hand), and the **admin subdomain** `admin.kavenue.fr` (separate host-only cookie so a staff session
survives testing as a Driver; plus origin-level gating on the most sensitive surface in the product). § O has **one
blocking question** — what happens to a suspended Driver's live and upcoming trips (§ O.4).
 Founder-confirmed 2026-07-28 as ONE
product: **document review + disputes + support**. Nobody can approve a paper today, so every Driver sits at "with us
for review" forever, and `driver.verified` can only be flipped by hand in Supabase. Half-built: the `admin` role exists
and RLS already grants admins read on every table; what's missing is a **write** path (service role). S48 fixed the
write contract (`status` · `review_note` · `expires_at`, one row per `side`). The **expiry-reminder job** belongs here
too. See BACKLOG § F2. **Biggest single build of the options; also the one with no design unknowns.**

**B — Notifications (Resend + web push).** *The #1 functional gap in the whole product* (a Driver only sees a Pool
mission if they're looking at the screen; a Business learns of an acceptance on refresh). It is an INTEGRATION, which
the founder has been deferring on purpose until the in-app experience is right — and the in-app experience is now
right. Several shipped features are **written as promises that only notifications can keep**: document expiry reminders
("a month before, and again the week it lapses"), the amendment/release cards, and the T-60 remedy below. Needs a
service worker + Web Push (neither exists) and the founder's explicit green light for the integration phase.

**C — Pricing.** *Founder-owned, and now the oldest blocker.* The suggested Ceiling/base-fare range on the mission form
and the amendment auto price-delta both wait on it, and two live questions surfaced in S48b: **100% is a weak penalty on
a cheap trip** (§ H2), and **commission** — the working assumption is now "the Pool price IS the Driver's price"
([[d59]]), which the real model has to either confirm or overturn. Nothing to build until the founder brings the rule.

**D — Smaller, self-contained, any time:**
- **Reliability marks — a conversation first.** A driver cancel adds one silently (`driver.reliability_marks`); the
  founder wants to decide whether a Driver sees their own before any UI ships. S47 shipped the cancel cards WITHOUT them.
- **The T-60 replacement + the "check in" rename** — designed in S47, deliberately not built; see the block below. It
  really wants notifications (option B) first.
- **A second vehicle** — fully scoped in [[d58]], ~half a session, worth doing the moment a real Driver has two cars.
- **Guidance Tier-2 tooltips** (`project/GUIDANCE_AUDIT.md`) and the **saved-addresses book** (BACKLOG § L) — both
  Business-side, both small, neither urgent.

**If the founder has no preference: A.** It's the only option that removes a human bottleneck rather than adding a
feature, it has no design unknowns, and every honest "we're reviewing it" state shipped in S48 is currently a promise
with nothing behind it.

**★ T-60 / silent-Driver remedy — DESIGNED IN S47, DELIBERATELY NOT BUILT.** Keep this whole block; it's the decision
trail so the next attempt doesn't restart from zero.
- **The state today:** a Driver can still advance a trip and the Business sees it on the schedule (on refresh, not
  pushed). But **there is no T-60 unlock** — `reclaim_mission` requires `status='accepted'`, which [[d55]] made
  unreachable, and the Business UI gate is the same condition, so the card never renders. Dead, not broken.
- **The gap:** at T-60 with a silent Driver, a Business's only working option is a **cancel at ~90% of the fare**
  (the [[d45]] curve at 1h). The agreed release is free but needs the Driver to accept — and they're not answering.
- **The design that was agreed** (founder, S47): the take-back must **not** auto-re-pool — a confirm step offering
  **two** outcomes, back to the Pool as SPEED WIN *or* a plain free cancel. Trigger: **the Driver hasn't started the
  trip** (not `en_route`) inside the hour. Reliability mark **only on a real no-response**, which needs a response test:
  take-back is instant, the mark waits ~10 min and is dropped if the Driver touches the trip.
- **Why it was deferred:** the response test is meaningless without push (we have **no service worker and no Web Push** —
  a Driver "enabling notifications" on their phone does nothing today), and fees settle **MANUAL** in beta, so the unfair
  90% charge exists only on paper. Building now would mean shipping the weakest trigger and redoing it later.
- **Optional 10-minute stopgap the founder did NOT decide on:** a line in the Business cancel modal for the
  under-an-hour case — *"Driver unreachable? Call us before cancelling."*
- **Terminology (founder, S47): "Lock-in" and "T-180" are jargon — do not ship them.** When the confirmation step
  returns, call it **"check in"** ("check in 3 hours before pickup" / "not checked in yet").

**Non-Driver items still parked** (both small, neither urgent — listed as **D** in the Session-49 menu above):
**guidance Tier-2 tooltips** (`project/GUIDANCE_AUDIT.md` — a "?" glossary tooltip for Ceiling / Pool / SPEED WIN /
check-in / the status pills, plus a Dispatch status legend) and the **saved-addresses book** (BACKLOG § L — the
Business's own address + the pre-fill/swap plumbing already exist; next is a small additive table for *multiple* saved
places + a one-tap picker on both ends of the new-mission Route card).

RECOMMENDED NEXT STEP (set by the founder at the end of Session 43 — ★1 and ★2 are now both SHIPPED):

**★ 1. ✅ RENAME PickUp → `Kavenue` — SHIPPED (S44, [[d51]]).** Done across app copy, spec docs, `project/`, package name,
PWA manifest, README and the Dispatch topbar wordmark; the two brand-named doc files were git-renamed to
`docs/Kavenue_Phase0_Data_Spine.md` + `docs/kavenue_schema.sql` and every reference updated. Verified by 4 adversarial
lenses (a mechanical reversibility check on all 209 changed lines found 0 collateral edits) + 18 routes in-browser.
**Deliberately NOT renamed at the time** (each would have broken something real): every `pickupbedriven.com` hostname
(**superseded — the DNS move shipped in S49, [[d60]]; the code is on `kavenue.fr` now**), the
`Phyrass-H/Pickup-marketplace` repo slug (**superseded — renamed 2026-08-23 to `Phyrass-H/kavenue`, S65**), the
`PickUp_project_dev` directory (**superseded — renamed 2026-08-06 to
`Kavenue_project_dev`**), `PickUp Go`, La Poste's
"Pickup" trademark, the `pickup_*` transport term/DB columns, the `pickup-dx-collapsed` localStorage key, and the
`*@pickup.local` dev-login/seed identities (they map to REAL Supabase auth rows — renaming the string alone breaks
dev-login). See the founder-action list at the end of this file.

**★ 2. ✅ Driver cards redesign — SHIPPED (S45, [[d52]]; deployed `1a1e5b6`, Vercel `success`).** Both remaining Driver
screens now carry the S43 Pool-card language: `/missions/[id]` reads as "the Pool card, opened" (uncollapsed route rail,
a `Service` card of `.dfact` rows + `.dchip`s, a `.dlock` reveal row, a plain full-width `Accept mission` — no sticky
bar, no fare beside it), and the My Rides card leads with **state not price** (`.dpill` + a `.dprog` segment bar with a
plain-words caption, stop progress on the rail, `.dcall` tap-to-call chips, a `.dnote` prep box, fare in the foot).
**One filled button per screen** — no-show + cancel dropped to `.dquiet` text actions; `Complete ride` is finally green.
No schema, no behaviour change. **✅ Now verified live (S46, 2026-07-25):** the `arrived`/waiting-meter (`.dmeter`) +
no-show-confirm visuals were checked against real data — amber running meter, neutral capped state, and the confirm
nudge all render correctly, no console errors.
**Founder preference recorded:** these pages **scroll by design** — breathing room beats fitting one viewport.

<details><summary>Original S45 brief (kept for reference)</summary>

**Redesign the two remaining Driver cards (ask first, then D25 preview → sign-off → build).**
The founder **deferred these out of S44** ("don't do the card now") — so confirm they still want it before starting.
A design brief was already gathered in S44 and is worth re-deriving cheaply: the shipped `.pcard`/`.proute`/`.pbadge` CSS
and tokens live in `app/globals.css` (~lines 6–127 for `:root`, ~1636–1838 for the Pool card); the Pool card DOM is
`components/mission-card.tsx`. Read those two, not the whole repo. The Pool card is done (S43);
these carry the same design language forward (`.pcard`/`.proute`/`.pbadge`, refined weights, route rail, service icons):
   1. **The extended pre-accept mission card** — what a Driver sees on **`/missions/[id]` BEFORE accepting** (today it's still
      the old `.card`/`.route`/`.kv` style; `app/(app)/missions/[id]/page.tsx` + `accept-button.tsx`).
   2. **The accepted mission card** — the **My Rides** trip card + run-flow once a trip is the Driver's
      (`app/(app)/rides/page.tsx`, `status-control.tsx`, `status-steps.tsx`, and the **`arrived`/waiting-meter** screen
      `cancel-noshow.tsx`). The `arrived` state **must be drawn against the shipped D48 waiting meter** (the old S41 v2
      preview predates it).

</details>

Smaller open: **guidance Tier-2** tooltips; the **saved-addresses book**. (✅ done since: the **Earnings screen**
[[d59]]; the Driver **Account + documents** [[d58]];
**Pool empty/loading** [[d54]]; the **discreet-vehicle** note — KEPT (founder); Driver **"Complete ride" → green** [[d52]];
the pre-accept **zone** removed [[d55]].) **Parked, founder-gated:** the €1/min **waiting-rate** research + cap review (pricing);
**§ H2** the `pickup_at` column-grant audit (still Business-writable) + **automated tests** (S42 made the case — 3 of its bugs
looked correct in code and only fell to live probing); the **"Both"** mission type (needs a new `mission_type` enum value).

**A. ✅ Mission-edit Phase 2 — SHIPPED + DEPLOYED (S35, 2026-07-07, [[d40]]; migration applied, full loop verified live).**
   The amendment/consent flow is live: a Business **Propose a change** screen (`/dispatch/[id]/amend` — route incl. pickup
   + fare, live preview), a Driver **accept/decline card** (in-context route diff + optional decline reason + slot
   heads-up), the schedule **pending / declined (calm reassurance) / accepted** states, and the atomic
   **`respond_to_amendment` RPC** mirroring `accept_mission`. Verified end-to-end on the real DB (fare accept + decline +
   a real add-a-stop route change → the mission genuinely swapped). **Phase 3 is the future here** (auto price-delta via
   the pricing engine + notifications so the Driver is alerted without watching the app + an in-app "could we add a stop?
   +€X" note) — deferred on those integrations. The **decline "or Business cancels" path is now unblocked by O7** —
   cancel + re-pool shipped (S39, [[d45]]) and the free mutual **"agreed release"** shipped (S40, [[d46]]).

**B. ✅ Unfolded (expanded) trip-row redesign — SHIPPED (S36, 2026-07-10, [[d41]]).** Plus the S37 mission-form polish
   ([[d42]]) and the S38 Riviera-first address-search cleanup ([[d43]]). So the freshest open items are now the **Driver
   app redesign**, the **guidance tooltips (Tier 2)**, the **saved-addresses book**, and the parked **Google Places switch
   + domain migration** (below).

**⚠️ BRAND / DOMAIN — name is `Kavenue` ([[d50]], supersedes RED Executive [[d44]]):** the rebrand away from "PickUp"
   (La Poste's EU transport trademark). **The code/copy rename SHIPPED in Session 44 ([[d51]])** — app copy, the Dispatch
   topbar wordmark, spec docs, `project/`, package name, PWA manifest and README all say **Kavenue**; `tsc` + `next build`
   green, 18 routes verified with zero "PickUp" leakage. **Kavenue ≠ PickUp Go** (separate product, hard rule) and the
   glossary (Business/Dispatcher/Driver/Guest/Pool/PDP/Ceiling/SPEED WIN) was deliberately untouched.
   **✅ The domain migration SHIPPED in Session 49 ([[d60]])** — `kavenue.fr` is live (the `.com` waits until it's
   affordable), old domain removed, Google Workspace email running. Runbook: `project/DOMAIN_MIGRATION.md`.
   **Still outstanding, founder-owned:** (1) ✅ the **repo directory** was renamed 2026-08-06 — now
   `02_Cactus/Kavenue/Kavenue_project_dev`; ✅ the **GitHub repo** was renamed 2026-08-23 to
   `Phyrass-H/kavenue` (S65);
   (2) **Google Places** swap for address search — this was gated on the DNS move so the key could be restricted once,
   and **that gate is now lifted**. Related: the Mapbox public token turned out to have **no URL restrictions at all**
   (probed in S49), so if we stay on Mapbox it wants a new restricted token anyway. See [[d43]] [[d50]] [[d51]] [[d60]]
   + IDEAS.md.

**PRICING is IN PROGRESS — the founder is working on the model themselves** (how a Ceiling / base-fare is estimated;
one-way vs round-trip). Respect **[[d37]] — NO empty-return charge** (a smart trajectory Pool solves the deadhead). Don't
build a pricing engine until the founder brings the rule; the **suggested Ceiling/base-fare range** on the form + the
Phase-2 **auto price-delta** both wait on it. Everything below is buildable now, no third-party APIs; any NEW field = a
small founder-run additive migration:
1. **Mission-form guidance — Tier 2** (see `project/GUIDANCE_AUDIT.md`; mostly NO schema): a small **"?" glossary
   tooltip** for the core terms (Ceiling, Pool, SPEED WIN, Lock-in, the status pills — taught in fragments today,
   defined nowhere), a **Dispatch status legend** (the S33 calendar already has one — reuse), and **Lock-in/T-180 in
   plain words** both sides. Plus **smart "most-used" defaults** + wiring the Business **default vehicle class** (Settings
   → Booking defaults) into the form (saved but not read yet). Keep it **non-invasive** ([[d36]]).
2. **Saved-addresses address book** (BACKLOG § L) — the Business's own address is its **first saved place** (S29), and
   the pre-fill + **swap** plumbing already exists. Next: a small additive table for **multiple** saved addresses + a
   one-tap insert/picker on both ends of the new-mission Route card.
3. ✅ **Driver app redesign — COMPLETE (S43 → S48b).** Pool [[d49]] · both mission cards [[d52]] · My Rides + Past
   [[d53]][[d56]][[d57]] · Account + documents [[d58]] · Earnings [[d59]]. No un-redesigned Driver screen remains.
   "Complete ride" is green; the only leftover from this item is the cosmetic **logo re-export** (sky-blue → navy).
4. **Luggage-vehicle Phase 2 (V2)** — real cargo/truck classes by **volume/m³ bands** (the "20 m³" idea, likely a
   partly separate fleet) + the grouped **car + luggage van** booking (the CUT grouped-mission feature; the cargo leg
   can "stop before the end" of the passenger trip). Bundle with the **Exception tier** (Rolls/Bentley above First) /
   Bus tier / First-van / PRM taxonomy expansion.
(✅ shipped 2026-07-05, S33–S34 — see the "Shipped" block + [[d39]]: calendar redesign; night-nudge→Pricing; dev Pool
see-all; mission-edit Phase 1 + placement + "Edited" stamp. Earlier S30–S32 ([[d35]]–[[d38]]): topbar account chip;
input-driven nudges + guidance audit; luggage-vehicle Phase 1. ❌ the founder **declined**: the sidebar-spacing tweak
(S-earlier); per-item "what changed" on edits (→ it's a Driver-notification feature, Phase 3); a row-level edit pencil
(edit entry is top-of-detail only); horizontal calendar tape-chart + duration-scaled week cards.)

DEFERRED until the founder okays the integration phase: **Notifications (Resend)** — the #1 functional gap
(today a Driver only sees a Pool mission if watching the screen; a Business sees an acceptance on refresh);
**real email auth** (retire dev-login); **the back-office / admin
verification workspace** (BACKLOG F2 — onboards real drivers/hotels; founder-confirmed 2026-07-28 as ONE product
covering documents + disputes + support, and it is **option A in the menu above**); **Payments/Stripe**; flight tracking;
analytics/monitoring. **Mailboxes now exist ([[d60]]) but that does NOT make notifications work** — Resend, a service
worker and Web Push are all still unbuilt, and when they land they should send from a **subdomain** (`send.kavenue.fr`,
its own SPF/DKIM) so mission-alert volume never touches the human mailbox's reputation.

OTHER OPEN ITEMS (pick what the founder asks):
- ✅ **Driver app redesign — COMPLETE (S43 → S48b).** See the Session-49 menu at the top: the next step is a real
  choice now, not the next screen in a queue.
- **Navy polish (all that's left):** re-export the **logo** to harmonise its sky-blue with navy. (Driver "Complete
  ride" → green shipped in [[d52]].)
- **Pricing engine** (IDEAS, ❓) — **founder is working on this now.** No objective base price by tier×body×distance×season;
  the Business sets the ceiling, Kavenue recommends. Principle: **NO empty-return charge** ([[d37]]) — a smart trajectory
  Pool handles the deadhead. Seeding approach in IDEAS (taxi tariff floor + base+€/km+€/min grid). Don't build until the
  founder brings the rule; then the suggested Ceiling/base-fare range on the form follows.
- **O7 cancellation — ✅ SHIPPED + DEPLOYED (spine S39 [[d45]]; agreed release + 24h re-pool window S40 [[d46]]).**
  Remaining: the **copilote hand-over** (Phase 2 — needs the community/registration layer), and the § H2 review-flag
  hardening (the Business-UPDATE RLS WITH CHECK gate; the fee basis freeze at `accepted_at` / pricing).
- **Engineering hardening (BACKLOG H2):** automated tests (money/PDP/`accept_mission`/RLS first), CI on PRs,
  generated DB types (`supabase gen types`), error monitoring.

HARD RULES (from CLAUDE.md): glossary exactly (Business, Dispatcher, Driver, Guest, Pool, PDP, Ceiling,
SPEED WIN — never "client"/"principal"); Kavenue is an AGENT, never principal; Kavenue ≠ PickUp Go; the Supabase
schema is ALREADY APPLIED — never re-run it (additive ALTERs only, founder-approved, in `docs/migrations/`);
build only KEEP items (Doc 02).

WORKFLOW: work on `main` (or a branch off it) for code. Keep **`npm test`** + `tsc` + `next build` green; verify
in the browser preview vs the real Supabase DB. **Don't run `next build` while the `next dev` preview is running** — it corrupts
`.next` (ChunkLoadError); if it happens, `rm -rf .next` + restart the dev server. Push `main` to deploy (Claude
Code may push). Append to `project/SESSION_LOG.md` when a chunk is done; keep `project/CHANGELOG.md` updated with
a plain-language line per shipped item.
- **⚠️ Vercel auto-deploy can silently drop a commit** (happened 2026-06-25 — a push got NO deployment, so the
  live site kept the old code even though the build was fine). After `git push origin main`, VERIFY a deployment
  landed: `gh api repos/Phyrass-H/kavenue/deployments --jq '.[0].sha'` should equal the pushed SHA. If
  it's dropped, push an **empty commit** (`git commit --allow-empty`) to re-trigger, or use the Vercel dashboard →
  Redeploy. (The deployments `?sha=` filter needs the FULL 40-char SHA.)
- **⚠️ Vercel can also fail a build TRANSIENTLY** (happened 2026-07-07 — a **docs-only** commit `51784d8` got a
  `failure` while its app code was byte-identical to the commit that had just deployed `success`). Don't panic: check
  the per-deployment status (`gh api repos/Phyrass-H/kavenue/deployments/<id>/statuses --jq '.[0]'`), then
  **reproduce `next build` locally** — if it passes clean, it was an infra flake, not your code, and production is still
  serving the last successful deploy (never down). Re-trigger with an empty commit. **Stop the `next dev` preview
  before `rm -rf .next && next build`** (building while dev runs corrupts `.next`).
