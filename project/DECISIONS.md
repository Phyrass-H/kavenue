# Kavenue — Decision Log

> Every non-trivial choice, why it was made, and when. Append-only; supersede rather
> than delete (note "superseded by Dn"). Decisions about *scope/legal/glossary* defer to
> the spec docs; this log captures *build/implementation* decisions.

---

### D1 — PWA-first for the Driver app (2026-06-16)
Per Doc 03. No native build for V1; revisit only when background GPS/push truly needs it.

### D2 — Driver sign-in via Supabase Auth email (OTP / magic-link) (2026-06-16)
Spec says "email". Chose passwordless OTP/magic-link over password (no password storage,
matches Supabase-native auth). Revisit if a password flow is preferred.

### D3 — Hand-write `database.types.ts` from `kavenue_schema.sql` (2026-06-16)
Can't run `supabase gen types` without DB/CLI credentials wired in this environment, and
the schema file is the source of truth and already applied. Hand-write types to match it.
If the Supabase CLI gets wired up later, regenerate to confirm parity.

### D4 — Use the modern Supabase key system as active keys (2026-06-16)
`sb_publishable_` (browser) + `sb_secret_` (server) are active in `.env.local`. Legacy JWT
`anon`/`service_role` kept as commented fallbacks in case a library expects JWT-form keys.

### D5 — Session-continuity docs live in `project/` (2026-06-16)
`STATUS.md` (resume point), `SESSION_LOG.md` (history), `DECISIONS.md` (this), `IDEAS.md`
(backlog). `CLAUDE.md` points new sessions here. Chosen over scattering notes so a fresh
session can resume from one place.

### D6 — Reads/Accept run as the user session; writes use the service role (2026-06-16)
Pool read, mission detail, My Rides, and `accept_mission` use the cookie-based **user-session**
client so RLS + `auth.uid()`/`current_driver_id()` resolve correctly. Onboarding inserts and the
seed route use the **service-role** client (server-only) because `profile`/`driver` have no INSERT
RLS policy in beta. Never call `accept_mission` with the service role (it'd see `auth.uid()` null).

### D7 — Contact unlock enforced in code via the service role (2026-06-16)
A Driver can't read `dispatcher`/`business` rows via RLS. "Reveal phone on acceptance" is done in
`/rides`: fetch Dispatcher/Business contact with the service-role client, **gated to missions whose
`driver_id` = this Driver** (themselves read under RLS first). This is the right place for the
service role — a rule RLS can't express. [[d6]]

### D8 — Magic-link auth; `/login` is a server-guarded client form (2026-06-16)
Passwordless OTP/PKCE (D2). `/login` is a server component that redirects already-authed users to
`/pool`/`/onboarding` and renders a client `<LoginForm>`; the callback validates the `next` param
(host-local only) and forwards link errors for the form to display.

### D9 — Dev-only seed route for test fixtures (2026-06-16)
`GET /api/seed` creates a Business + Dispatcher + pooled missions across zones/categories. Blocked
when `NODE_ENV=production` **or** on any Vercel env (`process.env.VERCEL`). Idempotent on the seed
dispatcher email; clears its missions before re-inserting. Replaces the "parked" fixtures idea.

### D10 — Pin `@supabase/ssr` to 0.12.x with `supabase-js` 2.108 (2026-06-16)
`@supabase/ssr@0.5.x` deep-imports a `supabase-js/dist/module/lib/types` path that no longer exists
in `supabase-js` 2.108 → the typed client silently collapsed every row to `never`. Upgrading ssr to
0.12.0 (peer-deps `supabase-js@^2.108`) fixed it. Also: each table in `database.types.ts` needs a
`Relationships: []` field (+ schema `CompositeTypes`) to satisfy supabase-js's `GenericSchema`.

### D11 — One app, role-aware via `profile.role` (2026-06-16)
Rather than two separate builds, a single Next app serves both surfaces. `lib/app-context.ts`
loads the user's profile + role-specific entities; `routeFor()` centralizes "where does this user
belong." Driver pages live under route group `(app)` (`/pool`, `/rides`, `/missions/[id]`);
Business pages under `(dispatch)` (`/dispatch`, `/dispatch/new`). `/welcome` picks the role on
first sign-in. Each area's layout guards its role. Revisit if the surfaces diverge enough to split.

### D12 — Dispatcher posts missions straight to the Pool via the user session (2026-06-16)
`/dispatch/new` inserts `status='pooled'` directly (no draft step in V1) using the **user-session**
client so RLS `p_mission_business_insert` authorizes it — service role NOT used for this write.
Business sets the **ceiling**; PDP curve params are auto-derived (`pdp_start` ≈ 50% of ceiling,
or = ceiling for SPEED WIN; `pdp_step` ≈ 5%; `pdp_interval` = 10 min) — tunable later. Maps
geocoding deferred (Doc 03): addresses are free text, `lat/lng` null, base fare is an optional
Dispatcher estimate that drives the soft-warning only. [[d6]]

### D13 — Status feed: status_event + service-role mission update; polling for now (2026-06-16)
The Driver's 4 status taps each write a `status_event` (the thing the Business watches) and advance
`mission.status`. Because there's no driver UPDATE policy on `mission`, the writes go through the
service role in a server action — gated by first verifying, under RLS, that the mission is the
Driver's and the requested step is the valid next one (`lib/mission-flow.ts`). The Business side
gets updates via **polling** (`LiveRefresh`, 4s) rather than websockets, so we don't have to modify
the DB (the `supabase_realtime` publication). Upgrade to true Realtime later by adding `status_event`
to that publication and swapping `LiveRefresh` for a subscription. [[d6]] [[d12]]

### D14 — Business side is a booking-style schedule + calendar, not cards (2026-06-16)
The Dispatch home is a **dense, day-grouped schedule** of rows (Today pinned) with an at-a-glance
**status colour** per line, expand-on-click detail (native `<details>`), and a month **calendar**
view. Status colour is **derived** from `mission.status` + time-to-pickup (`lib/dispatch-status.ts`),
so "red = not confirmed near pickup" works before the Lock-in scheduled job exists. The per-booking
**reference** (hotel room / event name) is stored in the existing `comment` column for now — a
deliberate no-schema-change choice (promote to a dedicated column later). Big cards remain the
Driver-side pattern only. [[d12]] [[d13]]

### D15 — Deploy from `main` on Vercel; key-gated dev sign-in for solo testing (2026-06-16)
Consolidated all work onto `main` (the feature branch was a session artifact) and deployed to
Vercel — `main` is now the permanent deploy branch (push → auto-redeploy). For solo live testing
without email/Supabase config, `/dev-login` + `/api/dev-login` require `?key=` matching the
`DEV_LOGIN_KEY` env var on hosted envs (local stays open; unset key = blocked). This is a
TEMPORARY scaffold — real drivers/businesses get email magic-link, and dev-login is turned off,
before real beta. Going forward: build on a branch, merge to `main` to deploy when verified.

### D16 — Storage buckets (private docs + public avatars) and a bank STUB, not raw capture (2026-06-17)
Accounts & records writes files to **Supabase Storage**, with buckets created on demand via the
service-role Storage API (`lib/supabase/storage.ts`). This is operational setup, **not** a DB schema
migration, so it respects hard-rule #4. Two buckets: **`documents`** is private — `document.file_url`
stores the storage PATH and reads mint short-lived **signed URLs** (sensitive proofs); **`avatars`**
is public — `business.logo_url` / `driver.profile_photo_url` store the public URL with a `?v=`
cache-buster (display assets). Document inserts + profile/business/dispatcher/vehicle updates go
through the **service role gated to the caller's own row** (no INSERT/UPDATE RLS for several of
these tables — extends D6/D7). Bank/card collection is a **deliberate stub**: status is derived from
the existing `stripe_account_id`/`stripe_customer_id` columns with an inert "coming soon" CTA. We do
**not** add or capture raw IBAN/card fields — there are no columns and storing raw bank/card data is
a PCI/compliance problem; Stripe Connect/Customer onboarding is the intended path, built later in the
Payments pillar. [[d6]] [[d7]]

### D17 — Driver service area = base location + radius (Mapbox), replaces operational zones (2026-06-17)
Founder feedback: a fixed town checklist doesn't model real VTC behaviour (a Cannes Driver will do
Milan→Nice but not Paris→Normandie). Switched the Pool from `zone ∈ operational_zones` to a
**geofence**: each Driver sets a **base** (geocoded via **Mapbox** autocomplete, public
`NEXT_PUBLIC_MAPBOX_TOKEN`) + a **service_radius_km**; a mission qualifies when its **pickup OR
drop-off** is within the radius (`lib/geo.ts` haversine; filter in `app/(app)/pool/page.tsx`). The
Business booking form geocodes pickup/drop-off into the existing `mission.pickup_lat/lng` +
`dropoff_lat/lng`; `zone` becomes a display-only label derived from the pickup town. **Schema:** an
*additive* migration (founder-approved) added `driver.base_label/base_lat/base_lng/service_radius_km`
(`docs/migrations/2026-06-17_driver_service_area.sql`) — additive only, no re-run of the base schema
(respects hard-rule #4). `operational_zones` is kept as a now-unused column; `lib/zones.ts` (BETA_ZONES)
was deleted. Matching runs in-app for beta scale (add a bounding-box/PostGIS prefilter later). [[d12]]

### D18 — Production splits the two sides onto role subdomains (2026-06-18)
The founder's "role switching" was a single shared Supabase session cookie: both demo roles signed in
on one host (`pickup-marketplace.vercel.app`), so each sign-in overwrote the other and open tabs flipped
on refresh. Fix: on the production domain **`pickupbedriven.com`**, the Driver app is served on
**`driver.*`** and the Business/Dispatch app on **`dispatch.*`**. Because `@supabase/ssr` sets
**host-only** cookies (no Domain attribute), each subdomain holds its own independent session — you can
be a Driver on one and a Business on the other at once, no switching. `lib/hosts.ts` maps role ↔
subdomain; `app/page.tsx` + the `(app)`/`(dispatch)` layouts cross-redirect to the correct subdomain;
dev-login targets each role's own subdomain. It's a **no-op off the prod domain**: localhost and
`*.vercel.app` keep single-origin path-based routing, so local dev/previews are unchanged. Stays ONE
Next app / one Vercel project (D11) — subdomains are extra domains pointed at it, enforced in the layout
guards, not a second deployment. Caveat for later: with host-only cookies, real magic-link users must
sign in on the right subdomain (or we add a shared-cookie/login bridge) — tracked against the real-email
pillar (BACKLOG A). [[d11]] [[d15]]

### D19 — Design direction (clean blue/slate) + Claude Design via GitHub-connect, not /design-sync (2026-06-18)
Founder direction: **clean, conventional, trustworthy "SaaS" blue** — functional, not a design vitrine,
don't reinvent. Implemented as a CSS-variable theme in `app/globals.css` (action blue `#2563EB`, slate
neutrals, white header) + the brand logo (`public/logo.png`, a purple→blue pin). To bring in
**Claude Design** (claude.ai/design) for its design POV: link the **public GitHub repo** via Claude
Design's **"Create here → Connect to GitHub"** (it reads our real React components + `globals.css` +
`project/DESIGN_BRIEF.md`). We do **not** use the `/design-sync` skill: it targets packaged design-system
*libraries* (Storybook, or a component package with a build), but Kavenue is a Next.js *app* (no Storybook,
no library exports), and the `DesignSync` tool also needs a `claude.ai` `/login` (this session's
`CLAUDE_CODE_OAUTH_TOKEN` can't be granted design scopes). Handoff back is native: in Claude Design,
**Export → "Send to local coding agent"** drops a structured bundle (component spec + design tokens +
layout) into the Claude Code session to implement against the repo. `project/DESIGN_BRIEF.md` is the
shared context doc. Business app is designed first; the Driver app is delivered as a pixel-perfect phone
mockup. [[d11]] [[d17]]

### D20 — Dispatch redesign implemented from a Claude Design zip; Geist + Lucide adopted; `dx-` namespacing (2026-06-18)
Claude Design produced a handoff **zip** (`PickUp Design System-handoff.zip`). The `DesignSync`
connector stayed blocked (no design scopes on the session token; `/login` unavailable — see D19), so we
unzipped + implemented directly. Bundle lives at **`.design-handoff/`** (gitignored — reference for the
Driver phase, not committed). Founder-confirmed scope choices: **(1)** adopt **Geist + Geist Mono** (via
the `geist` pkg + `next/font`, self-hosted → no Google CDN, GDPR-safe) and **Lucide** (`lucide-react`);
**(2)** the Schedule **flight column shows flight number + ETA only — NO live flight status** (the
flight-tracking API isn't built; BACKLOG B); **(3)** build the **full calendar upgrade** (month+week,
peek drawer, KPI/search/vehicle filters). Implementation maps the design onto the repo's existing class
vocabulary where it already existed (reskinned `globals.css` tokens + shared classes) and introduces a
**`dx-`-prefixed** class set for the new Dispatch chrome (sidebar shell, schedule grid, calendar) so it
never collides with the Driver styles and maps 1:1 to the handoff for future syncs. Dispatch is done
first; the **Driver app is next, delivered as a phone mockup** then applied. Also: the dev-only
`/api/seed` now upserts the seed dispatcher's `profile` row (role=dispatcher) so a seeded Business is a
usable signed-in account — operational dev tooling, **not** a schema change (respects hard-rule #4). [[d19]] [[d17]]

### D21 — SPEED WIN starts at 70% of the ceiling and climbs fast (reverses D12) (2026-06-19)
Founder call (Session 11 triage): SPEED WIN should **not** start flat at 100% of the ceiling. New curve:
SPEED WIN now starts at **70%** of the ceiling and climbs **+5% every 5 min** toward it; a standard
mission still starts at 50% and climbs +5% every 10 min. This leaves the Driver some upside at the start
while still pulling a fast pickup. Implementation: removed the `speed_win → return ceiling` short-circuit
in `lib/pdp.ts` (the fare now always uses the normal climb from `pdp_start`); `dispatch/new/actions.ts`
sets `pdp_start = ceiling*0.7` and `pdp_interval = 5` for SPEED WIN. **No schema change** — `pdp_start`
already exists. Legally safe: the **Business still sets the ceiling** and Kavenue only *recommends* the
start point (Doc 01 — keeps Kavenue out of "the pricing algorithm controlling the fare"). The spec glossary
wording ("starts at/near the ceiling") is now superseded; updated here, not yet in Doc 00. [[d12]]

### D22 — New-mission flow: preview-before-post + save-as-draft (reverses D12 "straight to pool") (2026-06-19)
Founder call (Session 11): the Dispatcher should **review a final card before posting**, and be able to
**save a draft and resume later**. This reverses D12's "inserts status=pooled directly, no draft step".
New flow (`dispatch/new/mission-form.tsx`, a client form): fill → **Review** snapshots the fields into a
final **preview card** (O11) → **Post to the Pool** or **Save as draft** (O15). Drafts use the existing
`mission_status='draft'` enum value (no schema change). Resume loads the draft into the form
(`?draft=<id>`) and **updates in place** (UPDATE, not a new INSERT) via the user session
(`p_mission_business_update`); discard uses the **service role** (no DELETE RLS policy on `mission`),
scoped to the Business's own draft rows. Drafts are **excluded** from the Schedule/Calendar/History
(`.neq('status','draft')`) and live on a dedicated **`/dispatch/drafts`** page (new sidebar entry). Also
folded in: O9 — the pickup time is now interpreted as **Europe/Paris** wall time and converted to a real
UTC instant (`lib/time.ts`), fixing the old server-local-zone bug, plus a past-time guard for live posts
and quick date chips; and an O10a **SPEED WIN auto-suggest** in the preview when pickup is ≤5h away. [[d12]] [[d17]]

### D23 — Vehicle taxonomy = service tier × body + car catalog; real road ETA (2026-06-19)
Founder call (O5): model vehicles as **service tier (Eco/Business/Luxury) × body (Sedan/Van)**, each combo
resolving to a maintained **car catalog/classifier** (`lib/vehicle-catalog.ts`, founder's data); tiers
display as **Eco · Business · First**. The Dispatcher picks a tier + body (**Any/Sedan/Van** — Any reaches
both bodies) and, only when the Guest insists, a **specific car**. A Driver's tier is **auto-derived from
make+model** via a two-step fallback (`categorize()`: a checked-brands list + premium-model exceptions,
else Eco/Standard) — Drivers don't self-classify; body stays the Driver's pick. **Schema:** founder-approved additive migration
(`docs/migrations/2026-06-19_vehicle_taxonomy_and_eta.sql`, applied 2026-06-19): new `body_type` enum;
`vehicle.body_type`; `mission.required_body_type` (null = any) / `required_make` / `required_model`. The
existing `vehicle_category` enum becomes the **tier** (eco/business/luxury); the legacy `van` value was
backfilled to **business + body=van** and dropped from the UI/allowlists. **Pool** now matches tier (SQL)
+ body + specific car (in-app; specific-car uses a tolerant normalized match since Drivers type make/model
free-text — `carMatches()`). **ETA:** same migration adds `mission.distance_km` / `duration_min`, computed
once at creation via **Mapbox Directions** (`lib/directions.ts`) and cached. **Traffic-aware:** the
`driving-traffic` profile + `depart_at`=pickup time → the ETA reflects predicted traffic for that day &
hour (verified: a 27 km route returns 37 min Mon 9am vs 31 min Sun 2pm) — Mapbox's own historical+live
traffic, no Google. Cards show "27 km · 40 min" (straight-line `~` fallback for older/failed); the write
is conditional so a transient routing failure never wipes a cached ETA. Replaces the old flat 4-category enum (supersedes the
single-category model from the spine). Known follow-ups: bind the Driver's car to the catalog (a picker)
for fully-robust specific-car matching; geocode intermediate stops so ETA covers detours (today it's the
direct pickup→dropoff route). [[d17]]

### D24 — App-wide serious navy (#25344C) + Direction B two-pane new-mission form (2026-06-21)
Founder call: the bright action blue (#2563EB) read too "consumer/Facebook" and the new-mission page felt
narrow/cramped. **(1) Palette:** the action accent moves **app-wide** to a deep **navy #25344C** (hover
#1B2738, soft #E9EDF4) — swapped at the **token layer** (the `--blue-*` raws that `--accent*` chains to) so
every component follows with no per-component edits; `--ring` re-toned to navy so keyboard focus matches; the
status **info** tone (Confirmed/Accepted) shifted to a desaturated **steel #1B5E8A** (mirrored in
`lib/dispatch-status.ts` — the two MUST stay in sync) so a status pill never reads as a clickable navy
button; the few hardcoded blues (`.badge.status`, `.notice.info`, the date-picker focus ring) were
re-pointed to tokens. The **brand logo gradient is logo-only and unchanged**. Navy depth was picked from a
4-option inline comparison (ink / navy / steel / slate-blue) → the **midpoint of ink and navy**. **(2)
Layout:** `/dispatch/new` becomes a **two-pane** form — 4 section cards (Vehicle / Route / Schedule / Trip
details) on the left + a **sticky live Summary rail** (mini-route, ETA, ceiling, live starting fare =
`ceiling × (speedWin ? 0.7 : 0.5)`, SPEED WIN, actions) on the right, collapsing to one column <900px. It
stays **one `<form>`** so the `createMission` contract is unchanged; the D22 draft/Review flow, the live ETA
(`/api/eta`) and waypoints are preserved. `RouteStops` publishes a display snapshot up via `onSummaryChange`
and accepts an `etaDefault` to seed the rail on draft-resume. Verified app-wide incl. the Driver app;
deployed; a final 3-angle adversarial agent check returned ALL CLEAR. [[d19]] [[d20]] [[d22]]

### D25 — Design loop = Claude-Code-authored inline HTML mockups (augments D19/D20) (2026-06-21)
The founder found Claude Design (the export-zip round-trip of D19/D20) not yet smooth. New standing loop for
screen redesigns: **Claude Code builds a self-contained HTML mockup from the real tokens + data and renders
it inline** (the visualize widget); the founder reacts in plain language; we iterate the mockup (cheap to
change) until locked, then implement it for real against the repo and deploy. Used end-to-end this session
(two layout directions; cool vs warm palette; four navy depths) before any code was written. The Claude
Design zip path stays available when the founder prefers to design there; the **inline-mockup loop is the
default** for screens Claude Code can mock from existing code. [[d19]] [[d20]]

### D26 — New-mission form: pricing grouped into a card + the Summary rail is read-only (2026-06-21)
Founder call (Session 15): the right-hand **Summary rail is a read-only PREVIEW, not an input surface**. The
**Ceiling**, **Estimated base fare** and **SPEED WIN** were pulled into a dedicated left **"Pricing" section
card** (a 5th card, matching the others); the rail now shows the ceiling + live starting fare + a "Pricing
mode" line as *values* (no fields), then the actions (Review / Save draft / Post). The `createMission` contract
is unchanged. The too-low-fare warning renders in the Pricing card while editing, and a compact copy appears in
the rail **only in preview mode** (the editable sections are `display:none` there, so the nudge follows the user
to the post screen). [[d22]] [[d24]]

### D27 — Service class = tier tiles; specific-car a styled dropdown, hidden for Eco (2026-06-22)
Founder call (Session 16): the service-class **tier** picker (Eco / Business / First) became **three selectable
tiles** (was a native `<select>`), matching the body-type segmented control right below it. The **specific-car**
field stays a dropdown but is **`appearance:none` + a custom chevron** (the native one read thin/old-school on
desktop) and is **hidden entirely for Eco** — the car catalog has only business/luxury models (Eco is the
unlisted fallback), so an Eco specific-car list was a dead single-option dropdown; a one-line note shows instead.
Form fields unchanged (`category` via a hidden input / `required_body_type` / `required_make` / `required_model`).
WCAG-AA fix: the selected tile's example text was re-toned to `--slate-600`. [[d23]] [[d25]]

### D28 — Named passengers: structured `passenger_names` jsonb, rows = headcount, capacity-capped (2026-06-23)
Founder call (Session 17): a mission can **name N Guests** (`{first,last}`), stored **structured** in an additive
`mission.passenger_names jsonb` column (founder-applied migration `docs/migrations/2026-06-23_named_passengers.sql`
— I can't run DDL with the app keys; the founder runs it in the SQL editor). **The number of rows IS the
headcount** (`pax_count` = rows; default 1 row); names are optional per row. **Capacity-capped by Body type**
(Sedan 4 / Van 7 / Any 7, nudge past 4) — a **soft** cap (the UI disables Add; the server does not hard-block).
The cap depends on the body chosen in `ServiceClassFields`, **lifted** into `MissionForm` via an `onBodyChange`
callback and passed to `PassengerList`. `passenger_name` (singular) is kept as a **denormalised** display string
(first NAMED Guest) so the schedule line, Driver reveal and mission detail read it unchanged; stored **null**
(not a junk `[{"",""}]` blob) when no Guest is named. Resume **pads** rows up to `pax_count` so a legacy draft's
count survives. Shared helpers in `lib/passengers.ts`; UI in `components/passenger-list.tsx`. [[d22]] [[d23]]

### D29 — Dense Dispatch views fill the screen; the new-mission form stays narrow (2026-06-25)
Founder call: the Dispatch content read "squished to the left" — `.dx-main` was capped at **1120px** and
left-aligned (no auto-margin), leaving dead space on wide monitors (324px at a 1680px viewport). Rather than widen
everything and cap the form back (which would *change* the form page), added a **`.dx-main--wide` modifier
(max-width 1520px)** that the shell (`components/dispatch-shell.tsx`) applies **by `pathname`** to the dense data
views only — **Schedule, Calendar, History**. The **new-mission form is deliberately left at the 1120px default**
(founder asked NOT to touch it — it reads worse stretched: the tiles/inputs go sparse); Drafts (560px cards) +
Settings unchanged. Kept **left-aligned** (no centering) so the content stays in line with the topbar title.
Preview-first was done by applying the proposed CSS live in the browser at 1680px and screenshotting before/after
(the D25 loop works for width/layout tweaks too, not just full mockups). [[d24]]

### D30 — "Driver & service" mission-form card: anti-suit dress default, display-only languages, board file reuse (2026-06-25)
Founder ask (S19): a dedicated **Driver section** on `/dispatch/new` (BACKLOG § M item 2 + § L dress-code). Designed
via the D25 preview loop (6 mockup iterations) first, then built to match. Key calls:
- **Dress code** = a 4-rung ladder `driver_choice → smart_casual → business_formal → suit_tie`. Its default is
  **keyed to the service tier** (eco→Driver's choice · business→Smart casual · luxury/First→Business formal) and
  **never lands on suit & tie** — the Business must pick that on purpose (the founder's anti-over-asking goal). The
  default **tracks the tier** until the Dispatcher manually picks one (a per-mission `touchedRef`), then their pick
  sticks. The cross-mission **learned** default (adopt a repeated override after ~N times) is **deferred** (needs
  history aggregation). Suit & tie wording is neutral ("Specific event or VIP protocol", a `Sparkles` note), since
  most Drivers already wear a dark suit — anything specific goes in the message.
- **Requested languages are display / preference only — NOT a hard Pool filter** (filtering would shrink the Pool).
  Stored as label strings (curated set FR/EN/IT/ES/DE/AR), shown to the Driver and matched visually against their
  existing free-text `driver.languages`. **No proficiency "level"** — Drivers don't store one (founder dropped it).
- **Request flags** = one `jsonb` (meet_greet, greeter, luggage_help, child_seat, quiet_ride, pets). **"Card only"
  dropped** (Kavenue handles payment); **PRM dropped** — it's a *vehicle category*, parked to IDEAS for the Bus
  expansion, not a per-mission flag.
- **Meet & greet name board** = a typed name **or** an attached PDF/JPG/PNG, reusing the existing private
  `documents` Storage bucket. Uploaded inside `createMission` with a **random storage path** (no insert-return-id)
  and a **conditional-spread** write (mirrors the `eta` pattern) so a draft re-save never wipes it; a dismiss writes
  `board_file_path: null` via `board_file_clear`. On-demand signed URL (`lib/mission-board-actions.ts` →
  `getMissionBoardUrl`, authz = Dispatcher-of-business OR assigned Driver) so lists never eagerly mint URLs. The
  **board name auto-fills from the first Guest** (name + surname) and tracks it live until overridden — lifted from
  `PassengerList` via `onPrimaryNameChange`, same pattern as the body/tier lifts.
- **Reveal gating:** languages / dress / flags show to the Driver **pre-accept** (so they self-select); board name +
  file + private message reveal only **post-accept** (same rule as Guest contact). **Migration**
  `docs/migrations/2026-06-25_mission_driver_section.sql` (founder-applied): additive `required_languages text[]`,
  `dress_code text`, `driver_flags jsonb`, `board_name text`, `board_file_path text`, `driver_message text`.
  Adversarially reviewed (auth sound, schema/types/writes exact match) + browser-verified end-to-end (draft
  write+read round-trip vs the real DB). [[d27]] [[d28]]

### D31 — Schedule rows shrink as one: fully-flexible grid + minimum + side-scroll (2026-06-28)
S25. Narrowing the Schedule made addresses vanish and the `Route`/`Flight` headers overlap — because the dense grid
had **4 rigid pixel columns** (time/flight/ref/status), so the only flexible track (route `minmax(0,1.9fr)`) absorbed
all the loss and collapsed to 0. Founder's words: *"the whole trip card to equally shrink horizontally"* + *"fix a
minimum limit"*. Decision: make **every** column `minmax(floor, fr)` so the row scales together; clip the header
cells (anti-overlap); below the summed floors hold `min-width: 572px` and **side-scroll** (`@media ≤880`, header drops
its sticky `top` offset). **Rejected** a reflow-to-stacked-cards (founder explicitly wanted the table to stay a table,
just smaller). CSS-only; History shares the grid; calendar untouched (own `.dx-peektrip`/fixed drawer).

### D32 — Per-stop trip progress WITHOUT touching the status enum (2026-06-28)
S26. A multi-stop trip had no progress story (stops stored in `waypoints` but no per-stop state; status jumped
`on_board → completed`; the Driver never even saw the stops mid-trip). Decision: keep the `mission_status` enum (hard
rule) and add **one additive counter** `stops_reached`. Between "on board" and "completed" the Driver taps
**"Reached — <stop>"** (server action `reachStop` — validates next-in-order + `on_board`); `advanceStatus → completed`
**guards** all stops are done. Business sees it on the dense **route rail** (reached = green, next = accent halo) + an
**"On board · k/N"** pill — **no new pill status** (would fight the tone system). **No `status_event` rows for stops**
(that table is enum-constrained). Real-time stays refresh-based (notifications deferred). Migration
`2026-06-28_mission_stops_reached`.

### D33 — New-mission validation: honest message + drop-off required to POST (2026-06-28)
S27. The "Review" warning was a **fixed catch-all** that recited every required field even when filled (it told the
founder to choose a vehicle class they'd chosen). Decision: make it **dynamic** — name only what's missing, in plain
words ("a pickup chosen from the address suggestions"). Fixed a latent bug: `review()` read coords with `Number()`,
and `Number("")` is `0` (finite), so an **un-located pickup slipped past** the client gate → switched to `toNum` +
`isValidLatLng`. And: a **POSTED (live) mission now requires a LOCATED drop-off** (picked from suggestions, like
pickup), enforced client + server (`error="nodrop"`); **DRAFTS stay lenient** (parked incomplete). Founder's call —
drop-off is critical for a transfer; the DB allows null only for future by-the-hour bookings. No migration.

### D34 — Business settings IA + the saved place is "the Business's address" (either end), not a "default pickup" (2026-06-28/29)
S28–S29. The Business account was 4 editable fields. **Researched** (audit + data-model + Booking/Airbnb/B2B study +
adversarial critique workflow) and **founder signed off an inline IA mockup** (D25). Decision: a **left-nav settings
area** — **Company** (business type / SIRET / VAT (TVA) / legal name / registered address + the existing Kbis),
**Contact** (+ account email read-only, reception line), **Branding**, **Booking defaults**; **Billing** + **Notifications**
as **clearly-marked DEFERRED stubs** (agent-positioned billing copy — fare *collected on the Driver's behalf*, service
fee + 20% VAT on the fee a separate line, **no derived VAT / invoice preview**). **CUT** (Doc 02): team/multi-seat,
roles, financial dashboard, multi-property. Each section is its own server-action form (`?s=<key>` re-opens the saved
tab); sections are server-rendered + passed into a client `SettingsTabs`. Migration `2026-06-28_business_profile_fields`.
**Founder follow-up (S29):** *not all Businesses are hotels*, and a Business is a fixed point that can be the **pickup
(departure) OR drop-off (arrival)** — or, for a concierge, **neither**. So a single "default pickup" was wrong. The
saved place is now **"Your address"** (`business_address_*`, renamed from `default_pickup_*`) with a **`prefill_pickup`
toggle** (default on; off when the address is never an endpoint) that auto-fills it into a new mission's pickup (new
missions only; drafts keep their own; always editable), plus a **pickup ⇄ drop-off swap** button (remounts the
uncontrolled `AddressAutocomplete`s via a `swapNonce` key). First entry toward the **saved-addresses address book**.
Removed the case-by-case "Default Guest instructions". Migration `2026-06-28_business_address_and_prefill`. [[d25]]

### D35 — Business identity → an account chip in the top-right topbar (2026-07-03)
S30. The Business was a cramped avatar + name tucked under "Settings" at the bottom-left of the Dispatch sidebar —
reading like a footnote. Showed 3 directions in a visualize mockup (D25): A = polished account card at the bottom · B
= business identity at the TOP of the sidebar (workspace header) · C = account chip in the top-right of the topbar.
Founder first picked B; on seeing it live, **corrected to C** — keep "Kavenue Dispatch" top-left exactly as before, and
put the business name **top-right** as a chip that opens a dropdown (Sign out). Settings stays in the sidebar footer.
Uses the previously-empty right side of the topbar; standard SaaS account-menu pattern. [[d25]]

### D36 — Mission-form guidance = non-invasive, only-when-relevant nudges; concept teaching lives in a separate tutorial (2026-07-04)
S31–S32. The founder's recurring "very guided page" ask. A **4-way guidance audit** (`project/GUIDANCE_AUDIT.md`)
found the app is already substantially guided; the gap is **input-driven** reactive guidance. Decision: guidance
**surfaces only when the Dispatcher's own input triggers it** (never always-on — that's heavier/more confusing), in the
existing amber `.notice.warn` style, and **never blocks posting**. The founder is building a **standalone tutorial** in
parallel, so in-app we don't stuff concept definitions onto the page (a small glossary tooltip comes later, Tier 2).
Shipped 2 nudges (luggage-vs-vehicle, night pickup). The suggested Ceiling/base-fare range (highest-leverage) is
**deferred to the pricing work**. See D37. [[d25]]

### D37 — No empty-return charge; a smart trajectory-based Pool solves the deadhead instead (2026-07-04)
Founder decision. A long one-way transfer means the Driver drives back empty (*retour à vide*) — but the Business is
**never charged for it**. Instead of pricing the deadhead into the fare, Kavenue will solve it **structurally** with a
**smart Pool** that prioritises Drivers by **trajectory**: a Driver finishing Cannes→Saint-Tropez is bumped up the Pool
for missions *departing* Saint-Tropez when the timing matches (backhaul / deadhead reduction). This is why the S31
long-distance "cover the return" nudge was **dropped before building** — it contradicted the model. The smart Pool is a
**V2 matching upgrade** (captured in `project/IDEAS.md`, not built); it feeds the pricing model (one-way transfers get
no return-leg surcharge).

### D38 — Luggage-vehicle Phase 1 = a standalone "van for luggage" run (2026-07-04)
S32 (Sujet B). "Sometimes we just hire an additional Van for luggages and it's enough." Decision: Phase 1 models a
**van USED for luggage**, not a new vehicle *class* and not a grouped booking. A Business posts a `luggage_only`
mission (forced **Van + Business** class — catalog vans are business-tier, so that's how it matches Van Drivers — no
passengers, bags via `luggage_count`); Van Drivers **opt in** at enrollment (`driver.accepts_luggage_runs`, **off by
default** — a Driver who won't risk bags in their van is never offered one); the Pool routes luggage runs only to
opted-in Van Drivers and labels them "Luggage run". **Boundary:** a standalone luggage run is its own mission — the
grouped **car + luggage van** on one booking is the **CUT grouped-mission** feature (Phase 2), and the cargo leg can
"stop before the end" of the passenger trip. **Phase 2 (still V2):** real cargo/truck classes by **volume/m³ bands**
(the "20 m³" idea, likely a partly separate fleet). Migration `2026-07-04_luggage_run_phase1` (additive; founder ran
it live). Preview signed off (D25).

### D39 — Mission edit is PHASED; the line is "has a Driver accepted yet?"; Phase 1 = info-only, no consent (2026-07-05)
S34. The KEEP "limited edit" (Doc 02) is built in phases, and the deciding principle is **whether a Driver has
accepted**. **Pooled** = the mission is nobody's → the Business edits anything freely (no consent). **Accepted+** =
two parties in a deal and **Kavenue is the AGENT between them, not the boss** → a *material* change (route/price/time)
must be a **proposed amendment the Driver accepts or declines** (this is what keeps us an intermediary AND keeps the
deal honest — the Driver consents to the new price/time).
- **Phase 1 (SHIPPED):** info-only edit of a posted mission (guests+phones, flight, luggage, reference, Driver &
  service) with **no consent** (info doesn't change the deal) and **no price movement** — `updateMissionInfo`
  whitelists only info columns (never `base_fare/ceiling/pdp_*/created_at/category/pickup*/dropoff*/waypoints/distance/
  duration/zone/status`), atomic status guard (`pooled/accepted/confirmed`), RLS + `business_id` ownership. Migration
  `2026-07-05_mission_info_edited_at` stamps `info_edited_at`. **UX decisions:** edit entry = **"Edit details" at the
  TOP of the expanded trip detail** (founder rejected a row-level pencil); an **"Edited · time"** stamp shows in the
  **detail only, never the collapsed row** (founder's call); **per-item "what changed" was DECLINED** here — it's
  really a *Driver-notification* feature, so it's deferred to Phase 3.
- **Phase 2 (BACKLOG, founder to drive next):** the amendment model — change destination / add a stop after acceptance,
  as **propose → accept/decline** (atomic + audited, like `accept_mission`). App shows the delta (route + ETA + a price
  change), Driver taps accept/decline, terms swap atomically. **App is the system of record even if they agree by
  phone.** Price delta is **manual for now** (fare isn't distance-based yet — the PDP climb; auto-delta waits on the
  founder's pricing engine). Reuse `accept_mission`'s slot-conflict check to warn the Driver. Accept/decline only (no
  counter-offer). Decline → trip unchanged or Business cancels (needs O7).
- **Phase 3 (BACKLOG):** auto-computed delta (pricing engine) + notifications + an in-app "could we add a stop? +€X"
  note. Full design in `project/IDEAS.md` ("Dispatcher mission edit"). Previews signed off (D25).

### D40 — Mission edit PHASE 2 = amendment table + an atomic `respond_to_amendment` RPC mirroring `accept_mission` (2026-07-07)
S35, implementing the D39 Phase-2 design. The consent flow is **propose → accept/decline**, built as:
- **A new `mission_amendment` table** (the audit trail; greenfield — no amendment infra existed), holding the proposed
  new route + `new_fare` + a `from_snapshot` of the trip as agreed + `note` / `decline_reason` / `status`
  (`proposed→accepted|declined|superseded`). Additive migration `2026-07-07_mission_amendment.sql` (founder runs it);
  the base schema is untouched. RLS: Business r/w its own missions' amendments, Driver read-only on missions assigned
  to them, **no Driver write** (the RPC handles it).
- **`respond_to_amendment(id, accept, reason)` RPC** — chosen over a plain server action because the consented swap
  must be **atomic across two rows** (amendment + mission), which a server action can't transact. It's a faithful
  clone of `accept_mission`: `SECURITY DEFINER`, `current_driver_id()`, row-lock + verify (`accepted/confirmed`),
  first-wins conditional update. Called via the **USER session** (reads `auth.uid()`), never the service role (D6).
- **Fare is pinned, not stored separately:** there's no "agreed fare" column (the PDP fare computes from
  `ceiling`/`created_at`), so on accept the RPC **freezes** it by setting `ceiling = pdp_start = new_fare` + a flat
  curve + `speed_win=false`, so `currentFare()` returns exactly the agreed total. Clean, uses existing columns.
- **Scope (v1):** the amendable route = **pickup + stops + destination** (founder asked to allow pickup, beyond the
  D39 "destination + stops"); the **pickup TIME is not amended** in v1. Price delta is **manual** (typed) — auto-delta
  waits on the pricing engine ([[d37]]). **Accept/decline only** (no counter-offer); "adjust and re-send" supersedes.
- **Decline UX (founder ask):** the Driver gives an **optional one-tap reason**, and the Business sees the decline
  wrapped in a **calm reassurance** ("declines are normal in busy periods, not personal; the trip stays as agreed") —
  so a rejection never reads as cold. The **app is the system of record** even if they agreed by phone.
- **Driver card design (D25, 4 iterations):** the change must read **in-context inside the route** — unchanged legs
  muted, the changed leg highlighted with a badge (rejected an abstract "hero" restatement that lost the where) — and
  the drop-off row uses a **finish-flag**, not a landing-plane (to a Driver a plane = a pickup). **Phase 3** (auto
  price-delta + notifications + an in-app note) stays deferred on those integrations. [[d39]] [[d37]] [[d6]] [[d25]]

### D41 — Expanded trip-row redesign + a Business-private detail-edit change-log (2026-07-10)
S36. The expanded `.dx-trip__detail` (a flat 15-row `.kv` list that half-repeated the collapsed row) rebuilt into grouped,
scannable sections — a **scan-strip** (Pickup · Vehicle · Flight · Fare-right), a **route card** (full addresses + a
dot-to-dot connector that stops at the drop-off dot + trip distance/duration in the header), a **slim one-line Driver
bar**, and **Service · Guests side by side** with chips for languages/dress/requests. The flat `.kv`/`.route` classes
stay for the other pages that use them (rides, missions, new-mission). Founder drove it via the D25 preview loop (v1→v5).
**Plus "see what changed":** (a) the amendment **"Change accepted"** state now shows the fare/route diff from existing
`AmendmentBrief` data (no schema); (b) a new **`mission_info_change`** table logs **detail-edit** diffs (human phrases via
`lib/info-changes.ts`), rendered as a `.dx-trail` line. **Why a side table:** a detail-edit diff can contain the private
reference tag / guest names, so it CANNOT sit on the Driver-readable mission row — deny-by-default RLS, Business-only,
mirroring `mission_guest_contact` / `mission_amendment`. Migration `2026-07-10_mission_info_change.sql` (applied). Founder
chose the fuller "add the detail change-log too" option. [[d40]] [[d25]]

### D42 — Mission-form polish bundle (2026-07-10)
S37, five founder-requested tweaks (the two visual ones via a D25 preview). (1) **Review-before-posting card** lightly
polished to the S36 vocabulary (route rail + chips), staying recognisable. (2) **Guest names auto-capitalise** the first
letter only (safe for "Al Souad"/"de la Croix"). (3) **Numeric fields** (luggage / base fare / ceiling) switched from
`type=number` to `type=text` + `inputMode` + a controlled **sanitize** (`digitsOnly` / `decimalOnly`) — reliable vs
`type=number`'s quirks; phone stays flexible (`+`/spaces). (4) **Edit trail leads with the bold edit time**; the separate
"Edited ·" stamp is suppressed when a trail is present (no double time). (5) **Pricing card shows a live vehicle-reminder
chip** (`serviceClassLabel(tier, body)`) — the specific car isn't lifted from ServiceClassFields, so it's class·body only.

### D43 — Address search: tune Mapbox now (Riviera-first), Google Places later (2026-07-10)
S38. Founder flagged bad autocomplete (typing "aéroport t2" ranked a Roissy CDG shop / Barcelona / Geneva above the Nice
result) and asked about Google. **Tested the live Mapbox Search Box API:** the far-junk is a broad-country-list problem
(fixable), but Mapbox's **POI ranking is genuinely weak** — `proximity` only nudges, so a literal "T2" name match beats
the local airport; `bbox` / `poi_category` / tighter proximity all failed to surface the real NCE terminal. **Google
Places weights *prominence*** and would rank major airports/hotels/stations first — the founder's instinct is right.
**Decision:** ship a **free Mapbox cleanup now** (countries → `fr,mc,it,ch`; a client **Riviera-first re-rank** floats
local hits to the top without hiding far destinations) and **defer the Google swap until the final domain is registered**
(so the browser API key is restricted to the right domains ONCE, after the rebrand DNS move). Google = ~1 session, one
file (`address-autocomplete.tsx`), keep Mapbox for routing. [[d44]]

### D44 — Brand name = RED Executive (Riviera Executive Driver) (2026-07-10)
The long-open rebrand away from "PickUp" (La Poste holds "Pickup" as an EU transport trademark) resolves to **RED
Executive** — RED = **R**iviera **E**xecutive **D**river. The **repo/docs stay codenamed "PickUp" for now**; a code/copy
rename is a later task (don't assume it's been done). The **domain migration** (`pickupbedriven.com` subdomains → a RED
domain, e.g. `dispatch.redexecutive.com` / `driver.redexecutive.com`, or the on-brand `.red` TLD) is its own separate
~1-session task (DNS + Vercel + Supabase redirect allowlist + `lib/hosts.ts` + the Google key restriction), waiting on the
founder registering the name/domain. **Not to be confused with PickUp Go** (a separate product — hard rule).

### D45 — O7 cancellation / no-show / hand-over ruleset (2026-07-13)
Founder settled the full O7 policy: cancellation (both sides), no-show, the T-60 Business reclaim, re-pool pricing, and the
future Driver→Driver hand-over. **Split: Phase 1 = the cancellation spine (build now); Phase 2 = the "copilote" community
(later); disputes/mediation deferred but documented.** Fee *amounts* stay MANUAL to settle in beta, but the *rules* below
are fixed. All fees are penalties owed to **Kavenue-the-intermediary**, never a transport charge (agent position, Doc 01).

- **DRIVER cancel (voluntary) = ALWAYS 100% of the trip amount** — no early-notice reduction. Deliberately tough because
  Kavenue must be reliable for Businesses. The two escape valves (no fee): **hand the mission to a copilote** (Phase 2) or
  **the Business agrees to release** it back to the Pool. (A flight delay does NOT auto-waive the fee — the Driver's out is
  an escape valve, not an exception; whether a *documented* delay earns a protected release is an open sub-question.)
- **BUSINESS cancel = free until 5h before pickup; then a per-hour ramp.** >5h = **0%**; at **T-5h (−300 min) = 50%**;
  then **+10% per hour to 100% at pickup** (−4h 60 · −3h 70 · −2h 80 · −1h 90 · 0h 100). Replaces the earlier week-based
  draft in Doc 05 (Riviera/airport transfers are short-lead). Kavenue's commission stays non-refundable.
- **NO-SHOW = Driver paid in full, like a completed mission.** Fires when the Driver is on-site (status **`arrived`**) and
  the Guest doesn't appear within the wait window: **1h airport · 20 min city/point-to-point.** The **Business is charged
  the full agreed fare** (Driver fully paid, Kavenue keeps commission); the Business settles with its own Guest. Deeper
  mechanics (contact-attempt gate, evidence, whether the clock starts at scheduled time or flight landing) = defined later.
- **T-60 Business reclaim (NOT a Business cancel).** ONLY when the assigned Driver **hasn't confirmed the Lock-in
  notification AND is unreachable by phone**, Kavenue **unlocks a reclaim button** (~T-60) so the Business takes the trip
  back and **re-pools it as SPEED WIN** — penalty-free for the Business (the Driver flaked → Driver takes a reliability
  mark). The button is **gated to the non-confirmation state** so a Business can't use it to dodge a legit cancel fee.
- **Re-pool pricing.** A re-pooled mission (Driver cancel · T-60 reclaim · released hand-back) re-enters the Pool as a
  **SPEED WIN starting at 70% of the ceiling**, like any SPEED WIN. Needs a `pooled_at` climb-origin (PDP climbs from
  `created_at` today, so a re-pool would mis-price without it).
- **DRIVER→DRIVER hand-over ("copilote") — Phase 2, LATER.** A full **transfer (novation)**, NOT subcontracting: the
  original Driver **drops out entirely** — no pay, no invoice, no liability; the copilote **re-accepts on their own
  account**, becomes the Driver of record (invoices, gets paid, carries every obligation) exactly as if taken from the
  Pool. The original Driver keeps only a **"passed on" trace** in history. **Legally confirmed viable — and this transfer
  model is *cleaner* than classic sous-traitance** (see the legal note below + IDEAS.md). Mandatory guardrails: copilote is
  an **active, verified, same-category** Kavenue Driver (REVTC · carte pro · RC Pro · conforming vehicle — checked live at
  transfer); accepts on their **own account** (no account-sharing / *location de compte*); **zero money flows through the
  original Driver**; **Business consents by default** via terms (explained in the tutorial); GDPR-minimised data transfer;
  full **audit trail** (accepting-Driver vs performing-Driver). Needs the community/registration layer first. **Data-model
  NOW:** design distinct *accepting-Driver* vs *performing-Driver* fields so Phase 2 slots in without a rewrite.
- **Legal confirmation (the founder's explicit question).** YES, there is a lawful way — and the founder's framing IS the
  right one. The risky version is *sous-traitance* (A stays the contractor, pays B, invoices the Business, carries B's
  liability → a "mini-principal" + URSSAF requalification traps). The founder's version is a **clean transfer**: A earns
  nothing and carries nothing, B is the fresh Driver of record on their own account → no reselling, no account-rental, and
  Kavenue stays the pure intermediary/agent (VAT position intact). Since 2026 *sous-traitance illicite* is a named REVTC
  offence, so the **credential gate is what keeps it legal.** Real precedent exists (Drivalty, iaDriver, and WAY-Partner —
  which credential-gates the pass — plus VTC cooperatives), so it's an established, buildable pattern.
- **Disputes / mediation = deferred, documented.** No dispute state today; V1 stays email + Kavenue mediates on the
  timestamped trail (accept time · flight landing · contact log · proof of service), per Doc 05. Revisit deeper later.
- **NEW — SPEED WIN reachability gate (decided, build later).** A SPEED WIN may only be accepted by a Driver who can
  **physically reach the pickup on time**: geolocate the Driver, compute the GPS ETA to pickup, and **block acceptance with
  a popup** if they'd arrive late. Needs Driver geolocation + a Directions ETA call; relates to replacing the crude
  ±90-min `accept_mission` slot buffer. Captured in IDEAS.md + BACKLOG.
- **Refinements (founder answers, 2026-07-13):**
  - **Business cancel is FREE while the trip is still `pooled`** (no Driver has committed). The fee only protects a
    *committed* Driver, and Kavenue's commission is taken at completion, so there is no cut to refund. The ramp applies
    only once a Driver holds it (accepted/confirmed/en_route/arrived).
  - **The Business ramp is LINEAR — 5% every 30 min** (= +10%/hour, landing exactly on 50/60/70/80/90/100 at each whole
    hour; fairer in between).
  - **No-show airport detection uses BOTH signals:** a flight number **OR** an airport-looking pickup address
    (`~* '(a[eé]roport|airport)'`) → 60 min; else 20 min city. (Businesses don't always supply a flight number.)
  - **No-show "be sure" nudge (Phase 1 UI):** before a Driver finalises a no-show, a professional confirm step
    encourages patience ("a quick call or a few more minutes — Businesses remember Drivers who go the extra mile"), so
    reporting the instant the window opens doesn't read as bailing. Pairs with a later contact-attempt gate.
  - **The no-show button is NOT red** (red = destructive/punitive; a no-show pays the Driver in full) — use amber/warn
    (caution + confirm), visually distinct from the red *cancel* action.
  - **MUTUAL-CONSENT RELEASE ("agreed cancellation") — Phase 2, precise spec.** A **free, no-fee** release that BOTH
    sides confirm (a "dating-app" double opt-in), separate from the unilateral Business cancel (which always pays the
    ramp). Flow: Driver + Business agree by phone that the Business should release the trip → the Business taps a
    **dedicated "agreed release" button** (NOT the normal cancel) → the Driver gets a **notification and must ACCEPT** →
    only on the Driver's accept does the trip release free (→ re-pool as SPEED WIN). **Why:** it stops a Business
    unilaterally cancelling on a committed Driver to dodge the fee (scam protection) — without the Driver's tap, the
    Business's only route is the fee-paying unilateral cancel. **Build cost: MODERATE** — reuses the amendment pattern
    almost exactly (a proposal record + a Driver accept/decline + an atomic RPC, like `respond_to_amendment`); degrades
    gracefully to refresh-based until notifications land. **Recommend: right after the Phase-1 spine (or as Phase 2).**
- **Migration (additive, founder-run) will add:** `mission.cancellation_fee`, `mission.cancelled_reason`,
  `mission.pooled_at`, a no-show marker (`no_show` + `no_show_at`), a widened `status_event` CHECK **or** a
  `mission_cancellation` audit table, a Driver **reliability mark**, and cancel/re-pool RPCs mirroring
  `accept_mission` / `respond_to_amendment`. The dormant `cancelled_by` / `cancelled_at` columns already exist.

### D46 — O7 agreed release BUILT (Business-initiated) + the 24h re-pool SPEED-WIN window (2026-07-19)
Built the mutual-consent **agreed release** (the D45 Phase-2 "agreed cancellation") and, in the same session, the founder
refined the re-pool pricing rule. Migrations `2026-07-19_agreed_release.sql` + `2026-07-19_repool_speedwin_window.sql`
(both additive, founder-run). Verified + 3-lens adversarially reviewed (6 findings fixed).

- **Direction = Business-initiated ONLY** (founder chose this over bidirectional). The Business taps a dedicated **"Agreed
  release · free"** button (distinct from the fee-paying Cancel) → the assigned Driver gets an accept/decline card and
  **must accept** → the trip releases **free (no fee, no reliability mark)** and re-pools. Decline → the trip stays exactly
  as agreed. The Driver's cancel-sheet escape valve ("Ask the Business to release it — free") is how a Driver *starts* it
  by phone; there is **no** Driver-initiated in-app proposal. Eligible only while `accepted`/`confirmed` (pre-execution).
- **Guardrails against pressure (founder's concern — a Business coercing a committed Driver into a free release).** The
  platform can't police the phone call, but it owns the **defaults + the receipts**: (1) declining is framed as **free,
  mark-free, and the Driver's choice** on the card; the Business-side decline state is **calm, not alarmist**; (2)
  **dispute-ready audit** — `mission_release` is append-only, **declines are retained** (a Business only HIDES a resolved
  request via `dismissed_at`, never deletes/rewrites), each row records who/when/note/decision/fare/**hours-before-pickup**
  so "a free release proposed inside the fee window, repeatedly declined" is legible and **per-Business counts are a query**.
  All writes go through **SECURITY DEFINER RPCs** (no client write policy) so the evidence can't be tampered with. The
  founder's framing: *not something we control, but something we set up fairly and can prove.* Abuse-rate **dashboard** =
  the deferred Admin workspace (BACKLOG F2); the data will be ready for it. **Review-weaponisation** (threatening a bad
  review) → when a Business→Driver review system is built, gate reviews to **completed trips + double-blind** so a
  released/declined trip generates no review right (logged as a constraint on that future feature).
- **RE-POOL PRICING — the 24h SPEED-WIN window (founder decision; supersedes D45 "re-pool = always SPEED WIN at 70%").**
  A re-pooled mission (driver cancel · T-60 reclaim · agreed release — **all re-pool paths**, for consistency) now prices
  by time-to-pickup: **< 24h → SPEED WIN** (start 70% of ceiling, climb 5%/5 min); **≥ 24h → NORMAL Pool** (start 50% of
  ceiling, climb 5%/10 min, SPEED WIN off) — no reason to burn SPEED-WIN margin when there's time to fill it. These are the
  exact curves a fresh posting uses. (T-60 reclaim is structurally always <24h, so always SPEED WIN — kept uniform.)
- **Review fixes folded in:** the cancel/reclaim/business-cancel RPCs now **supersede a pending `mission_release`** (they
  already did this for `mission_amendment`; `business_cancel` gained the amendment supersede it was missing too), the
  release cards/briefs are **gated to a still-releasable trip** (no dead/stale cards past accepted/confirmed or after a
  new Driver re-accepts a released trip), and `respond_to_release` locks **mission → release** (matching `propose_release`)
  to remove a deadlock inversion.

### D47 — No-show clock runs from when the GUEST was due, not from the Driver's arrival (2026-07-19)
Founder correction to D45. The free-wait countdown was anchored to the **Driver's** `arrived` tap — the wrong party. The
free wait is the **Guest's** grace period, so it runs from **when the Guest was due to be available**. Migrations
`2026-07-19_no_show_clock_origin.sql` + `2026-07-19_no_show_airport_label.sql` (additive, founder-run). Verified **9/9
live** against the real DB via a real Driver session.

- **The rule.** `guest_due := coalesce(guest_ready_at, pickup_at)`; reporting unlocks at
  `greatest(guest_due + wait, arrived_at + 5 min)`. Wait durations **unchanged** (60 min airport / 20 min city) — only the
  ORIGIN moved. The founder's two cases: an **airport** pickup starts the clock when the flight is **marked landed**; a
  **town** pickup starts it at the **ordered pickup time**, even if the Driver turns up early.
- **`arrived` is still required to report — it is just no longer the origin. Gate ≠ origin.** It remains a timestamped
  on-site attestation and part of the D45 dispute trail.
- **The 5-min on-site floor** (founder-approved) exists because a pure `pickup_at` anchor *introduces* a new abuse: a
  Driver arriving after the window already closed could file instantly and collect 100% for their own lateness. The floor
  never binds for an on-time Driver.
- **This closed a live exploit, not just a modelling error.** `advanceStatus` gates the `confirmed → en_route → arrived`
  walk on **sequencing only** — no time check. So a Driver could tap through ~33h early, wait out the 20-min city window
  and file a no-show: Business charged the full fare a day and a half before the trip, mission driven terminal, Guest
  stranded. Anchoring to `pickup_at` closes it, because the window can no longer elapse before the trip exists.
- **`mission.guest_ready_at`** (new, nullable) is the flight-tracking hook — the tracked instant the Guest became
  available. NULL until that integration lands, so today the behaviour is pure `pickup_at`. Deliberately **not**
  `flight_eta`, which is documented display-only: wiring a billing gate to a display column is how this bug happens twice.
- **Airport detection also reads `pickup_label`** (second migration). The Mapbox autocomplete stores the POI name in
  `pickup_label` and the navigable street address in `pickup_address`, so an airport booked from autocomplete **with no
  flight number** had no keyword in the address and silently got the 20-min city window. Pre-dates this work (it is in the
  original D45 migration); hidden because the seed writes "Aéroport" straight into `pickup_address`.
- **`hours_before_pickup`** is now recorded on no-show rows (it was hardcoded `0`, blanking the audit trail exactly where
  it is needed). It is **negative** for a no-show — reported *after* pickup — which is the opposite sign convention from
  the other four cancellation kinds. Cosmetic while settlement is MANUAL; noted in BACKLOG § H2.
- **`guest_ready_at` is now guarded (3rd attempt, verified live).** It feeds a money gate, so a Business must not be able
  to push it forward and hold the no-show gate shut. Trigger `trg_mission_guard_guest_ready_at` (migration
  `2026-07-22_guest_ready_at_guard_fix.sql`) rejects a change from `anon`/`authenticated`. Verified: Business PATCH →
  **403, value unchanged**; a normal Business column edit → 204; the **service role** (the future flight-tracking feed) →
  204. The two earlier attempts FAILED and are worth remembering as Postgres gotchas: (1) a **column-level `REVOKE` is a
  no-op** while the role holds table-level UPDATE — column privileges are only consulted when the table-level grant is
  absent; (2) a **`SECURITY DEFINER` trigger sees the function OWNER in `current_user`**, never the caller, so the guard
  never matched. The fix was dropping `security definer` (SECURITY INVOKER is what makes `current_user` the caller).
- **Still deferred to BACKLOG § H2 (founder):** **`pickup_at` has the same exposure** and additionally feeds
  `business_cancel_mission`'s fee tier — but it has a LEGITIMATE client writer (draft resume rewrites it), so it needs a
  status-aware rule, not a blanket block. Fix it with the full column-grant audit alongside the
  `p_mission_business_update` WITH CHECK flag.

### D48 — Waiting fees replace rescheduling: pay the Driver to wait, never move a booked trip (2026-07-22)
Founder simplification, and it **supersedes the amendable-pickup-time plan** logged the same day. The chain that led here:
freezing `pickup_at` would block a delayed flight from being moved → so make time amendable first → but then a Business
could postpone, get the Driver to accept, and cancel free (the Driver's consent to a *date* change silently waiving his
fee). The founder cut the knot: **a booked trip's time never moves.**

- **The rule.** *"A Guest who is late is charged for the waiting — the Driver has a reason to wait because he is paid
  for it. If the Business or Guest needs a different time, that is a NEW trip: cancel, rebook, post it to the Pool.
  Nothing to do with the current Driver."* Same model every ride-hailing app uses.
- **The meter.** Free wait unchanged (**20 min city / 60 min airport**). After it: **€1 per minute started** charged to
  the Business, paid to the Driver. **⚠️ The rate is PROVISIONAL — proper research owed** (benchmark VTC/taxi waiting
  tariffs, the préfecture *tarifs taxi* orders, and what Uber/Bolt/Blacklane charge). Revisit with the pricing engine.
- **The cap stops the MONEY, not the trip** (founder revised this after seeing the preview — the earlier "cap ends the
  trip" wording is superseded). Total **60 min city / 120 min airport** from clock start, so the PAID portion is
  **40 min (€40) city / 60 min (€60) airport**. At the ceiling the **meter stops and the Business is warned**; the trip
  does **not** auto-terminate. The Driver may keep waiting if he chooses — he simply stops earning — and files whenever
  he's ready. Rationale: the problem was a Driver with an empty afternoon billing forever, which the ceiling alone fixes.
  Nothing is gained by *also* having the app end someone's job, and it avoids a money action with nobody tapping anything.
  **Build consequence: no auto-termination logic and no cron question at all** — the cap is a `least()` clamp on the fee.
- **Two exits, both human:** (1) the **Business** declares *"stop waiting, the Guest isn't coming"* — NET-NEW, they're
  the one being charged and the one who knows, and the founder's preferred primary; (2) the **Driver** reports a no-show,
  already available from the moment the free wait ends. **Both get a confirm step** — closing a trip is delicate, so
  neither side terminates on a single tap.
- **Known dangling state (accepted):** if neither party acts, the mission sits at `arrived` indefinitely. That is already
  true today and the money is now bounded by the ceiling, so it is not a new exposure — but it is the thing a future
  scheduled-jobs pass (BACKLOG § B) should sweep up.
- **AIRPORT CLOCK — the founder's operational point, from driving.** *"As long as the plane is on the way or hasn't
  taken off, the trip is still mine — the countdown starts at the landing."* A flight still in the air cannot burn
  anyone's free wait. This is exactly what `guest_ready_at` was built for in [[d47]]; the model needs no new mechanism,
  only the flight feed. **Interim (today): `guest_ready_at` is always NULL, so an airport clock falls back to the BOOKED
  time** — acceptable for beta, but it is the strongest argument for prioritising flight tracking.
- **No rescheduling ⇒ `pickup_at` freezes after draft.** With no legitimate post-draft writer, a blanket trigger works —
  no status-aware subtlety, no amendment dependency. This **kills the postpone-then-cancel dodge outright** rather than
  policing it. Route/stop changes stay amendable ([[d40]]); only TIME leaves the amendment flow.
- **`business_cancel_mission` must settle the accrued waiting too** (found by the pre-build review, verified live).
  Today it accepts `status='arrived'` and charges a flat **100%** past pickup (`v_hours < 0 → v_pct := 100`) — i.e. the
  Business's existing **Cancel** button already costs exactly what a no-show costs, **minus the waiting**. Ship the meter
  without this and "stop waiting" is strictly the dearer door, growing €1/min worse, so every Dispatcher learns to press
  Cancel and the Driver never sees his waiting money. Both doors must cost the same — they are the same economic event,
  differently declared.
- **Parked to IDEAS (V2):** converting a transfer into an **at-disposal** mid-mission when a Guest is very late (turns a
  lose-lose no-show into a billable, useful outcome — needs O12 first, and it is a *scope* change so it stays amendable);
  and a **Driver-initiated "ask to be released"** button, because today nothing records that a Driver ever asked.

### D49 — Driver Pool redesign + bottom tab bar; the Driver app's first layout pass (2026-07-24)
The Driver app had inherited the navy palette ([[d24]]) but never a structural redesign the way Dispatch did. Session 43
did the shell + the Pool card (Pool-first), decided via the D25 preview loop (v1→v9 inline mockups) then built to match.
- **Shell:** a fixed **bottom tab bar** (Pool = stack · My Rides · Earnings · Settings) replaces the old top text-nav
  (which the founder called "cheap / WordPress-like"); Sign out moved into Settings. **Earnings** is a net-new 4th tab
  (honest placeholder screen; payouts settle manually in beta).
- **Pool card:** uniform, quiet, **refined weights (nothing 700)** — the founder rejected the first bold/large draft
  ("looks made for old people who can't see properly"). Badges are **mission-only** (Transfer / At disposal =
  `mission_type 'hourly'` / SPEED WIN / Luggage run); the **vehicle class is demoted** to a discreet footer note because
  the Pool is filtered to the Driver's own single car, so it's redundant on every card. A **Dispatch-style route rail**
  (navy dot → grey mid-dot "+N" → hollow ring), **full 2-line addresses**, and a **one-line footer** (distance + discreet
  vehicle | service icons **capped 3 + N** by a fixed priority: child seat > pets > luggage > meet&greet > greeter >
  dress > language > quiet > flight).
- **No migration** — `mission_type` + a nullable `dropoff_address` already exist. **Adversarial review (13 agents) → 6
  fixes**, incl. a DST "Tomorrow" drift and muted-grey **WCAG-AA contrast** (the one caveat that overrides "lighter":
  keep small text legible for on-road, outdoor use). **Parked:** the discreet-vehicle keep/drop; the "Both"
  `mission_type` (needs a new enum value). My Rides / mission detail / Settings / the Earnings screen / empty+loading =
  later passes. Deployed `56211e7`.

### D50 — Brand name = `Kavenue` (supersedes RED Executive) (2026-07-25)
The product name is now **Kavenue** — the founder's final choice, superseding "RED Executive" ([[d44]]). Still the
rebrand away from "PickUp" (La Poste's EU transport trademark; **Kavenue ≠ PickUp Go**). **Session 44 will do the full
rename across docs, code, folders, copy, and config** (repo dir, package name, `metadata.title`/`appleWebApp.title`, the
Dispatch/Driver wordmarks, `manifest.webmanifest`, every `docs/` + `project/` mention) — but NOT the product hard-rule
glossary (Business/Dispatcher/Driver/Guest/Pool/PDP/Ceiling/SPEED WIN). The **domain** move (`pickupbedriven.com` → a
Kavenue domain) + the **Google Places** key restriction still wait on the founder registering the Kavenue domain
(restrict the key once, after the DNS move). Legal (INPI/EUIPO trademark search classes 39/35/42) stays the founder's
track — flag, don't gate ([[legal-not-mvp-blocker]]).

### D51 — The Kavenue rename: what changed, and the six things that deliberately did NOT (2026-07-25)
Executes [[d50]]. The rename is a **pure brand substitution — no behaviour change, no schema change, no new dependency.**
51 files: user-facing copy, `app/layout.tsx` metadata + `appleWebApp.title`, `public/manifest.webmanifest`,
`package.json`/`package-lock.json` (`kavenue-driver`), `README.md`, `.claude/launch.json`, all of `docs/` + `project/`,
and **SQL comments only** in `docs/migrations/*.sql` (never a line of executable SQL — those migrations are already
applied). Two files git-renamed with history preserved: `docs/PickUp_Phase0_Data_Spine.md` →
`docs/Kavenue_Phase0_Data_Spine.md`, `docs/pickup_schema.sql` → `docs/kavenue_schema.sql`.

**The decision that mattered was what NOT to rename.** "PickUp" the brand and "pickup" the transport term are the same
token, so a blind sweep would have been destructive. Six categories were held back, each because renaming breaks something
real:
1. **Every `pickupbedriven.com` hostname** — the DNS move hasn't happened; renaming these breaks the live site.
2. **`Phyrass-H/Pickup-marketplace`** — the actual git remote and the deploy-verification `gh api` path.
   **✅ Renamed 2026-08-23** to `Phyrass-H/kavenue` (S65). The `main — CI must pass` ruleset binds by repo ID and
   survived; GitHub redirects the old URL, so stale clones keep working. Every `gh api` path in the docs was updated.
3. **The `PickUp_project_dev` directory** — the session cwd and the Claude project config path. Founder-owned.
   **✅ Renamed 2026-08-06** to `02_Cactus/Kavenue/Kavenue_project_dev` (both levels). The `~/.claude/projects/` directory
   is keyed to the folder path, so it had to move in the same operation or the history and memory would have been orphaned.
4. **`PickUp Go`** (hard rule #3, a different product) and **La Poste's "Pickup" trademark** — renaming these makes the
   sentences that explain *why we rebranded* into nonsense. Same for historical/rebrand prose in the logs and D44/D50.
5. **The transport term** — `pickup_at`, `pickup_address`, `prefill_pickup`, `isAirportPickup`, `nextPickupIso`, the
   "Pickup" column header, "pickup ⇄ drop-off". All DB columns and identifiers.
6. **Two live-data couplings:** the `pickup-dx-collapsed` localStorage key (renaming silently resets every Dispatcher's
   sidebar state for zero user benefit) and the `*@pickup.local` dev-login/seed identities — those strings address **real
   Supabase auth rows**, so renaming the constant alone would break dev-login. Rename only alongside the DB rows.

**Method (worth repeating for any wide sweep):** 7 parallel edit agents partitioned so no two touch the same file, under
one explicit never-rename ruleset — then 4 adversarial verify lenses. The decisive check was **mechanical reversibility**:
reverse every added line (Kavenue→PickUp) and diff it against the removed line — **0 mismatches over 209 changed lines**,
which proves no collateral edit slipped in alongside the brand token. That is a far stronger guarantee than re-reading the
diff. 23 findings → the real ones fixed; the largest was that `project/NEXT_SESSION.md` had been skipped entirely and still
asserted the rename hadn't happened — the one file every new session reads first.

**Verified:** `tsc` clean · `next build` green (24 routes) · 18 routes fetched in-browser vs the real Supabase DB with
**0 "PickUp"** in rendered HTML (incl. the PWA manifest + both legal pages) · no console errors. French legal copy checked
for élision — "Kavenue" is consonant-initial, so "de Kavenue" / "Rôle de Kavenue" are correct.

---

### D52 — The Driver detail + accepted cards REUSE the Pool card's classes, and carry one filled button (2026-07-25)
Completes the Driver redesign started in [[d49]] (S43 Pool card). Three choices worth recording:

**1. Reuse, don't re-cut.** `.pcard__*`, `.pbadge*` and `.proute*` are unnested selectors, so the two detail screens
render out of the *same* CSS the Pool card uses; only a roomier container (`.dcard`) and genuinely new pieces
(`.dfact`, `.dpill`, `.dprog`, `.dcall`, `.dnote`, `.dmeter`, `.dcta`, `.dquiet`) were added. **Why:** an opened
mission must read as the same *object* as its Pool card — a second, parallel card vocabulary would drift within a
session or two, which is exactly how the codebase ended up with three disjoint systems (`.card`/`.kv`, `.pcard`,
`.amc*`). The trade: `.pcard__*` is no longer private to `components/mission-card.tsx`, so changing it now moves
three screens — that's the point, but it must be done deliberately.

**2. The accepted card leads with STATE, not price.** Pre-accept, the fare is the decision, so it's the headline.
Post-accept the fare is settled and the Driver's question is "what do I do next / who do I call" — so the status
pill, the progress bar and the route lead, and the fare drops to the card foot. **Why:** the same data, ranked by
what the screen is *for*. This is why the two cards deliberately differ despite sharing a vocabulary.

**3. Exactly one filled button per screen; escape hatches go quiet.** The next status step is the only filled CTA;
"Report a no-show" and "Cancel this trip" become `.dquiet` text actions. **Why:** they're rare, consequential and
one-tap-from-money — a filled amber no-show button sitting beside the primary action invited a mis-tap on a phone
used one-handed at a kerb. The no-show *confirm* step keeps a filled amber button, because by then it is the action
and the "be sure" nudge has already been read. Also fixes `success-btn` falling through to navy: **Complete ride is
green** ([[founder-design-taste]] — hierarchy from restraint).

**Founder notes that shaped it (D25 preview, v1):** drop the fare beside the Accept CTA (it was in a sticky bar —
the whole sticky bar went with it); and give the accepted card real breathing room — *"the screen does not have to
fit in a fixed screen… it always needs to be easy to read fast and comfortably"*, so these pages scroll by design.

**Not verified live:** the `arrived`/waiting-meter and no-show-confirm visuals (no trip in that state to hand).
Logic unchanged; only classes moved. **(Closed S46: verified live — see [[d53]] context.)**

### D53 — My Rides is a tap-through LIST; `/missions/[id]` is the single "mission, opened" screen (2026-07-25)
The old `/rides` dumped every trip in one scroll AND hung each mission's actions (status advance, waiting meter,
cancel, amendment/release) inline under its card — so a live trip's controls sat sandwiched between unrelated rides.
Restructured (founder complaint → D25 preview → build):
- **`/rides` = a clean list of tap-through cards** (state pill · when · progress · route · fare), current + upcoming
  only (`accepted/confirmed/en_route/arrived/on_board`); completed & cancelled move to **History**. No inline actions;
  a small amber flag surfaces when a change/release is waiting an answer.
- **`/missions/[id]` branches by ownership** — the same URL is "the mission, opened" for both sides: OWNED → the full
  run view (`components/mission-run-view.tsx`) + a `← My Rides` back link + every action; OWNED+terminal → read-only +
  `← History`; POOLED → the unchanged pre-accept view + Accept + `← Back to Pool`.

**Why one page, not inline controls:** one trip, one screen — the run controls belong to the trip you opened, not
stacked among others. The pre-accept view already lived at `/missions/[id]`; extending it to the owned/run case keeps a
single "opened mission" object. **Trade:** the contact/phone reveal (dispatcher/business/shared-guest) moved from the
batch list into the per-mission page, but stays gated to `isMine` exactly as before; `statusPill`/`progressCaption` are
now exported from `mission-run-view` so the list + run view can't drift. Also this session: the "pro move" no-show
nudge cut to one generic line (no "bags"), the report button dropped "you're paid". 3-lens adversarial review → 3 fixes
(amendment/release not gated to the answerable window; a swallowed `arrived`-read error; a `UserX`→`UserRound` drift).

### D54 — Pool loading skeleton + designed empty states (2026-07-25)
The un-designed parts S43 left. **Loading:** a route-level `pool/loading.tsx` — three skeleton cards in the real
Pool-card shape (`.pcard--skel` + `.pskel*`), pulsing via the existing `dx-pulse` keyframe, staggered, so the
force-dynamic Pool shows structure not a blank flash. **Empty:** both states rebuilt from the plain `.empty` text into
a calm `.pempty` block (soft icon tile + headline + muted subtext) — the *no-trips* state **names the filter in bold**
("New Business · Sedan trips within 50 km of Nice land here…") so it's clear WHY it's empty, plus a quiet "checking your
area · pull to refresh" line; the *no-service-area* state is a setup prompt with one navy CTA into Settings. **Why:** an
empty/loading screen is where a Driver decides the app is broken or just quiet — naming the filter + card-shaped
skeletons say "working". Presentational only; no new keyframe.

### D55 — Accept always confirms immediately (Option A); pre-accept card polish (2026-07-25)
Three founder-flagged items. Two are polish: **removed the redundant zone** from the pre-accept footer (the city is
already in the pickup address; the Pool card never showed it), and **shortened the unlock line** to "Private details
unlock once you accept."

The third is a model call. `accept_mission` auto-confirmed a trip **only** when pickup was <3h away; otherwise it left
the trip `accepted` to await the **Lock-in at T-180** (3h before pickup). But nothing flips `accepted` → `confirmed` at
T-180 — that auto-confirm needs the deferred cron/notifications phase — so a trip accepted 3h+ out sat in limbo with
**no Driver controls** and a dead-end "awaiting readiness confirmation (Lock-in at T-180)" message. **Founder chose
Option A: accept ALWAYS confirms immediately.** (Weighed: A drop the gate; B a manual "I'm ready" confirm; C keep it +
build the T-180 cron.) **Why A:** simplest, no stuck trips; the O7 reclaim / no-show paths already cover a Driver who
goes silent, so nothing depended on the never-fired Lock-in transition. Done via a create-or-replace of the RPC
(migration `2026-07-25_accept_always_confirms`, + a backfill of existing `accepted` → `confirmed`), NOT by touching the
shared `mission-flow` helpers (the Dispatch `trip-row` uses those). App removed the T-180 message + the dead "Awaiting
Lock-in" list caption. **The Lock-in / `accepted` status is now vestigial** — kept in the enum + RPC IN-lists for
safety, but no path produces it. Verified live: accepting a >3h pooled trip lands at `confirmed`, controls immediately.

### D56 — My Rides = Upcoming | Past tabs, and Guest data leaves a closed trip (2026-07-26)
**Tabs, not a corner link.** The archive was reachable only via an underlined `History →` in the header. Now a
**segmented control** (founder picked style A over underline tabs) labelled **Upcoming / Past**, with counts. Kept as
**two routes** (`/rides` + `/rides/history`) rather than one route with a query param: each keeps its own server query,
and every existing deep link still lands. Day separators (**Today / Tomorrow / Friday 31 July**) group the Upcoming
list; the card then shows only the time, since the day is written above it.

**Past is a record, not work** — its own lighter `.pastcard` (date, small pill, single-line route, Business + fare); no
progress bar, no state-first lead. **No money totals** on Past (founder): the Earnings tab owns money. Cancelled trips
get a **filter row inside Past (All | Completed | Cancelled), not a third tab** — three segments crowd a phone and a
cancelled trip is rare. **No-shows stay under Completed** (founder): `mark_no_show` files them as `completed` +
`no_show=true` because they pay the Driver the FULL fare, and the amber pill already makes them stand out.

**A cancelled trip in a Driver's Past was always cancelled BY THE BUSINESS** — structural, not a heuristic: driver
cancel · agreed release · T-60 reclaim all re-pool the mission and clear `driver_id`, so only `business_cancel_mission`
ends terminal with the Driver still attached. Two consequences: the card **says "Cancelled by the Business"**, and it
shows **real money, not a dash** — `mission.cancellation_fee` (50–100% per [[d45]]) plus any `waiting_fee` accrued,
both stamped on the row by the RPC. Shared helper `cancelCompensation()` in `lib/cancellation.ts` so the list and the
detail can't drift. The amount is **labelled "Compensation"** so it can't be misread as the trip fare, and a legacy row
stamped before 2026-07-13 (no fee) still shows "—" rather than a wrong €0. (First shipped as a blanket "—"; corrected
same session once the re-pool asymmetry was traced — the caution was unnecessary.)

**The privacy rule: a Guest's data leaves the Driver's app when the trip closes.** Guest names, phone numbers, the name
board and the Business's private message are all dropped from a terminal mission — enforced **server-side** (the
`mission_guest_contact` query never runs for a closed trip), not hidden in the markup. **Kept:** date, route, fare,
status, and the **Business + its Dispatcher** — a business counterparty and the Driver's only route to a dispute, not
Guest data. **Dispatch is untouched: the Business keeps the full record**, which is what makes the removal safe rather
than lossy. A single `.dlock` line tells the Driver so, so it reads as a rule instead of a loading failure.

### D57 — A Driver's archive shows every ending, and both sides' reasons (2026-07-28)
**The gap.** Only two of the four ways a trip can end leave the mission attached to the Driver. A **driver cancel** and
an **agreed release** re-pool it (`status='pooled'`, `driver_id=null`), so they vanished from the Driver's app —
a Driver could pay a 100% penalty and take a reliability mark with **no record anywhere**. Fixed by building Past from
a union of missions + those two event tables (`mission_cancellation.actor_driver_id`, `mission_release.driver_id`),
which their own RLS already permits. No migration. Re-pooled cards are **not tappable** — the mission may belong to
another Driver now, so no detail page would still be true. Money reads in the Driver's direction: Compensation ·
**Penalty in red** · Free · —.

**Reasons are shown both ways.** The Business's `cancellation_reason` now reaches the Driver — a **deliberate reversal
of the S39 review decision**, which hid it. That was a reviewer's judgment, not a founder call; the founder overrode it
on the grounds that a Driver who just lost a job is owed the why. **Condition:** the Dispatch field promised nothing
("Reason (optional)"), so it now says **"— your Driver will see this"** at the point of writing. Never republish text
written under a different expectation; change the promise first. The Driver's own reason is read back as "You said: …".

**Cancelled pill has no icon** (founder): a bare × reads as a dismiss control, not a state.

**Not built: a T-60 reclaim card — the reclaim is dead code.** `reclaim_mission` requires `status='accepted'`, which
[[d55]] (accept always confirms) made unreachable; the Business UI gate is the same condition, so nothing renders and
nothing errors. **Open consequence:** a Business no longer has a free remedy for a Driver who goes silent near pickup.
Deferred with notifications. Founder also rejected **"Lock-in" / "T-180"** as jargon — the agreed plain-words
replacement, when that step returns, is **"check in"** ("check in 3 hours before pickup" / "not checked in yet").

### D58 — The Driver account: a hub of sub-pages, documents with a lifecycle, one car (2026-07-28)
**Shape.** The last un-redesigned Driver screen was one ~1400px scroll of generic `.card` blocks with a **single Save
that silently wrote the vehicle too** — editing a phone number re-derived the service tier. It becomes an **account hub**
(identity · readiness · rows) with a sub-page per pile, each saving only what it shows. Uber/Bolt/FREE NOW all use a hub;
on a phone it beats anchors, and Dispatch already went sub-pages in S28. The tab is renamed **Account** — preferences are
the smallest thing on it.

**Readiness names what's missing, and never gates.** Not a completion percentage: it lists *"URSSAF attestation — not
added"*, blockers sorted first, each a link. **Deliberately display-only** — no beta Driver has filed a document, so
enforcing would empty every Pool overnight. `blocksWork()` exists and is unused; wiring it into the Pool query is the
switch to flip when real Drivers onboard.

**A Driver is a company, and Kavenue is the donneur d'ordre.** New document types: **Kbis / SIRENE notice**, **URSSAF
attestation de vigilance** and the **medical certificate**. The URSSAF one is a legal obligation on *us*: for contracts
≥ €5 000 HT the ordering party must hold a current attestation, **re-collected every 6 months**, or it is jointly liable
for the sub-contractor's unpaid contributions. Company identity (`company_name`/`siret`/`vat_number`) is captured;
**bank details deliberately are not** — Stripe collects those, Kavenue stores no IBAN.

**`document.expires_at` existed since day one and had never been written.** Documents now have real states — missing ·
pending · rejected · **expiring (≤30 days)** · expired — with expiry outranking review status, because a verified-but-
lapsed paper is exactly as useless as a missing one. Plus `review_note` (a rejection with no reason is a dead end),
`side` front/back (a licence and a VTC card are two-sided; the newest-row-per-type read buried the front), and
`vehicle_id`.

**One car, on purpose.** The founder asked for multi-vehicle; the recommendation against it was accepted. The real
multi-car case in VTC is a **fleet** — one company, several Drivers, several cars — which the data spine doesn't model,
so "one Driver, many cars" would serve almost nobody in beta while dragging `mission.vehicle_id` and a car-picker into
the **money-critical `accept_mission` RPC**. `document.vehicle_id` + `vehicle.is_active` shipped anyway: they cost
nothing and make car #2 a small job instead of a re-attribution of history.

**Framing is shared, and the camera is first.** The avatar cropper became `<ImageFramer>` — round for a face, rectangular
for a document, with quarter-turns and tilt kept as **separate** controls (one slider doing both fights itself). With no
aspect given, react-easy-crop falls back to 4:3 and slices the ends off an ID card, so the frame **starts at the photo's
own shape**: the first thing a Driver sees is their whole document. A **PDF skips framing entirely** — you can't crop one
in the browser and pretending otherwise loses the file.

**The navigation setting was fake, so it was made real.** `preferred_gps` was saved in two places and read nowhere.
A **Navigate** button now sits on the live trip and targets the pickup, then the next unreached stop, then the drop-off.
Deep links are **https universal links**, not `waze://` schemes: a missing app makes a scheme fail silently, whereas
these open the app when present and the website when not. A web app **cannot** detect installed apps — that check is a
native-build feature (founder: fine, do it at the native migration).

### D59 — Earnings, and the fare that wouldn't stop climbing (2026-07-28)
**The bug found while designing it.** `currentFare()` computes the PDP climb up to *now*. That is right while a mission
sits in the Pool and wrong the instant someone takes it: a demo trip accepted at **€70 read €100** — the ceiling —
weeks later, because the clock kept running. Every archive read had it, so the Past tab was overstating that trip by
43%, and an Earnings screen built on the same call would have inflated a Driver's income. New **`settledFare(m)`**:
the same curve frozen at `accepted_at`, falling back to the live fare when a mission was never accepted — so it is a
drop-in for display everywhere, including a still-pooled trip. Applied to every **display** read of an assigned trip
(My Rides, Past, the run view, the Dispatch row + calendar).
**Then applied to the fee snapshots too, same day, on the founder's ruling.** It was raised as a pricing decision rather
than fixed silently; the founder's answer closed it: *"If a driver accepted a trip why would the fare keep climbing? The
final fare, whatever it is on the Business side or on the Driver side, is the price that the Driver accepted."* So
`p_fare_snapshot` (driver cancel · no-show · business cancel · business no-show) and the amendment from-fare all read
`settledFare` now. **The climb exists to fill a mission; it has no business running afterwards.**

**⚑ The live test earned its keep.** After the change the UI quoted €70 and the database still recorded **€100**:
`settledFare` typed `accepted_at` as optional, and the actions' narrow `FARE_COLS` select didn't include it, so it fell
straight back to the live fare. Reading the diff would never have shown this. Fixed by selecting the column *and* making
the parameter **required**, so the next narrow select is a compile error instead of a wrong penalty. Re-verified live:
driver cancel on a €70-accepted / €100-ceiling trip → €70 recorded; business cancel at 83% → 58,17 € off a €70 basis
(€83 before). Dispatch also stops calling it **"Fare now"** once a Driver holds the trip — it reads **"Agreed fare"**.

**Still open, founder-owned:** with the basis correct, **100% may be too weak a penalty on cheap trips** — a €50 job
costs €50 to abandon. Founder: *"100% is not enough … we need to fix rules later."* Logged in BACKLOG § H2 with a sketch
of the options (a floor, a multiplier near pickup, or visible reliability marks); nothing decided.

**Asked and closed the same session: the [[d45]] business-cancel RAMP is unchanged.** Seeing a business cancel recorded
at 58,17 € on a €70 trip read as the ceiling creeping back in; it was the *percentage* (83% at T−1.7h), not the basis.
The founder was offered the choice — keep the sliding scale, or make a Business that cancels on an accepted trip owe the
full agreed fare — and **kept the scale as it is**. So: free above 5h · 50% at −5h · +10%/h · 100% at pickup, now always
applied to the accepted fare. Worth remembering that the number looked wrong until the two rules were separated: when a
fee combines a basis and a rate, show the arithmetic, not the result.

**Commission: the fare shown in the Pool is the Driver's fare.** The preview carried a line saying the total was what
the Business pays with commission not yet deducted; the founder cut it — "it has to be like the other apps, the price
shown in the Pool and paid to the Driver should be commission-taken". So Earnings is a straight sum of accepted fares,
with **no gross/net language anywhere** — inventing a percentage that hasn't been designed only creates a promise to
walk back. Provisional until the pricing model lands, but it is now the working assumption the pricing work inherits.

**No charts** (founder). The week-by-week and day-by-day rows carry what a bar chart would, in numbers that survive a
phone screen. Restraint, not a limitation.

**The filter is granularity + a step + a jump.** Day / Week / Month / Year, ‹ › to move one unit, and the label itself
opens the phone's native date picker — the selected granularity decides what the picked date *means* (that day, its
week, its month, its year). No custom ranges, no second picker. State lives in the URL (`?p=week&d=2026-07-28`) so
reload and Back land on the same view. Weeks start Monday and every bucket is **Europe/Paris**, not UTC: a 00:30
pickup belongs to the night that was worked.

**Comparison is the PREVIOUS period, not last year.** The founder asked for same-period-last-year; the first mission in
the database is 16 June 2026, so that line would have read "no data" for eleven months. The headline chip compares to
the period before (works from day one) and the year-ago line **renders only when there is something to show** — it
turns itself on. A permanent empty comparison is worse than none.

**The breakdown includes money that isn't a trip**, because a Driver can't otherwise reconcile the total: waiting time,
a no-show (which pays them the full fare), a Business cancelling on them — and **their own cancellation as a red
negative**. The founder was asked whether penalties belong in Earnings and kept them: it's the only place a Driver sees
what walking away cost.

## Open decisions inherited from the spec (not ours to close — track only)
From Doc 05 / Data Spine — values, not structure; don't let them block the build:
- Commission split exact numbers (~12.5% Business / ~10% Driver, teaser).
- Commission carved-out vs added-on.
- Charge timing: auth-at-booking vs capture-at-completion.
- ~~Cancellation %s (Business compensation tiers, Driver penalty cap).~~ **DECIDED — [[d45]]** (Business: free >5h · 50% at −5h · +10%/h → 100%; Driver voluntary cancel: always 100%). Euro *settlement* stays MANUAL in beta.
- Hard-floor field (floor-vs-benchmark).
- Fare extras (waiting, tolls, airport fee, hourly overtime).
- Final name for "SPEED WIN" (candidates: Rush, Fast Track).

### D60 — kavenue.fr is the production domain, and Kavenue has real email (2026-07-29)
**The domain.** The founder bought **`kavenue.fr`** (the `.com` is deferred until affordable), closing the last gap
left by the S44 rename: the product was called Kavenue but still *lived* at `pickupbedriven.com`. Registrar **OVHcloud**,
DNS stays at OVH so the app records and the mail records live in one zone. Four hosts, same role-split as before:
`kavenue.fr` (landing splash) · `www` (308 → apex) · `driver.` · `dispatch.`

**Apex, not www.** Vercel's "Redirect apex domains to www" default was declined: `kavenue.fr` is what goes on a business
card, and it reads consistently beside `driver.` / `dispatch.` The old domain had it the other way round.

**A cutover with no cutover moment.** `isProdDomain()` was widened to a `PROD_DOMAINS` list accepting *both* domains
while only ever *generating* `PROD_BASE` URLs, so the old domain funnelled onto the new one and nothing had to switch at
an instant. Closed the same day (`bce11e6`) once every hostname was verified. Sequencing that mattered: **DNS first,
deploy second** — deploying while `kavenue.fr` was unresolved would have pointed live role-redirects at a dead host.

**Email: one paid mailbox, three free aliases.** Google Workspace Business Starter, a single user
`phyrass@kavenue.fr`, with `support@` / `feedback@` / `contact@` as aliases into the same inbox. Three separate users
would have been ~€21/month for one person's mail. `support@` and `feedback@` were already hardcoded in the shipped app
(Driver help card + Dispatch settings), so those two had to exist. **Bank/billing addresses deliberately not created** —
that waits for the payments phase.

**⚑ The OVH trap, avoided.** OVH pre-fills a new zone with its *own* MX, an SPF record (`include:mx.ovh.com -all` — a
hard fail that would have blocked Google from sending), a parking A record, and an AAAA. The AAAA is the nasty one:
Vercel issues only an IPv4 A record, so a leftover OVH AAAA sends IPv6 visitors to a parking page while the site looks
perfect to you over IPv4. All deleted before the new records went in. OVH also files SPF under its own record *type*
rather than TXT, which is why it survives a "delete the TXT records" pass.

**Verification was empirical throughout, and twice it changed the plan.** Vercel's DNS values were read off the panel
rather than assumed — they were **not** the long-documented `76.76.21.21` / `cname.vercel-dns.com` but a per-project
`216.198.79.1` / `b995c589bd56b1fa.vercel-dns-017.com`. And the planned Mapbox token restriction turned out to be a
**no-op**: probing the geocoding API with no referer returned 200, proving the token was never restricted at all
(logged as a follow-up — an unrestricted public token ships in the JS bundle and anyone can spend the quota).
DKIM was checked by base64-decoding the published key and parsing it with `openssl` (valid 2048-bit RSA → the paste
wasn't mangled), then proven correct end to end by `dkim=pass header.s=google` on a real received message, alongside
`spf=pass` and `dmarc=pass`. DMARC starts at **`p=none`** deliberately; tightening to quarantine/reject on a fresh
domain is how people bin their own mail.

**Runbook kept:** `project/DOMAIN_MIGRATION.md` — 14 steps marked [YOU]/[CLAUDE] with a gate each, so adding
`kavenue.com` later is the same file with one word changed.

### D61 — Check-in: the Driver confirms they'll be there, and the Business can see it (2026-07-30)
**What was already there, and dead.** The O7 design ([[d45]]) had a Driver confirm at T-180. Two thirds of it shipped in
S39: `accept_mission` parked a far-out trip in `accepted`, and the Business side got a red **"Not confirmed"** pill
(`lib/dispatch-status.ts`) plus a whole-row red wash (`.dx-trip--alert`, whose CSS comment still read *"the T-180
alert"*). The missing third was the part that **asks the Driver** — no reminder, no button, nothing. So a trip accepted
4h out sat in `accepted` limbo with no Driver controls, and [[d55]] fixed that by confirming on accept and backfilling
every row. Correct fix — but it made `accepted` unreachable, so the pill and the wash had rendered for nobody since.
This gives that machinery a condition it can actually reach. **The founder remembered the feature working; it did.**

**Scope, split on what push can and can't do.** Built: the check-in state, the Driver's button, and the Business's
visibility. **Deliberately not built:** the T-180 reminder and the T-60 take-back. Both need Web Push, which does not
exist (no service worker, no subscriptions).

**⚑ The reason that split is not arbitrary — a 90%→0% fee hole.** S47 had designed the take-back to trigger on *"the
Driver hasn't started the trip"*, a proxy for silence chosen precisely because there was no way to ask. But a Driver
with an 18:00 pickup who intends to leave at 17:40 is `confirmed` and not `en_route` at 17:15 — doing their job. Under
that trigger a Business could take the trip back, or free-cancel it, at 17:00. A business cancel at 1h costs **90%** of
the fare; this would have made it **0%** — an on-demand fee dodge available one hour before every trip, structurally
identical to the postpone-then-cancel trick closed by freezing `pickup_at` and to cancel-being-cheaper-than-waiting
caught by the S42 pre-build review. **Nothing punishing may hang off a missed check-in until the Driver has actually
been asked.** Raised before writing code; the founder chose to ship the safe half.

**Design.** The pill sequence is the founder's: `Confirmed` beyond 3h → **`Not checked in`** inside 3h (amber) → red
inside 1h → **`Checked in`** → then the Driver's own progress. Each state *replaces* the last — after [[d55]] every
accepted trip is confirmed, so that word carries no information; what a Dispatcher scans for is the exception. The
founder asked for the **whole row** to wash, not just the pill: that comes from a new explicit `wash` flag on
`MissionTone` rather than being derived from `tone`, because "No-show" and "Unfilled" are also warn/danger and must keep
their current unwashed behaviour. On the Driver's My Rides **list** it is a flag, not a button — that list is a pure
tap-through ([[d53]]) and the card is one big `<Link>`, so a nested button was never an option; the real button is on
the trip's own page. A **count** on the tab badge, not a dot (founder): two trips waiting is a different morning from
one. Computed in the Driver layout so it follows them around the app — **without push, the badge is the notification.**

**Going `en_route` checks in implicitly.** Starting the trip is a stronger signal than the button, and a Driver already
on their way must never show the hotel a "not checked in" row.

**⚑ Found by probing the live site, not by reading the diff.** `within1h` is `pickup <= now + 1h` — which a pickup in
the **past** also satisfies. Six stale still-`confirmed` demo trips lit up red alongside the three deliberate test rows.
Fixed with `CHECK_IN_GRACE_MS` (1h past pickup) in `missionTone`, `checkInOpen` **and** the badge query: a Driver five
minutes late genuinely hasn't checked in, but a trip left confirmed for three weeks is stale data, not a check-in
problem. Same lesson as the S42 airport regex and the [[d59]] `accepted_at` omission — **the diff looked right.**

**Verified live** (3 tagged trips at T-2h / T-30m / T-8h, DB restored to its 34-mission baseline): both washes and all
four pill states render; the tab badge counts 2 → 1 as trips are checked in; the button is absent beyond 3h; and five
guards hold — RLS read of an own trip, a beyond-window trip refused, first-write-wins, a double tap moving nothing
(`0 rows`), and a Driver PATCHing `checked_in_at` directly still **denied** (there is no driver UPDATE policy on
`mission`; the action writes through the service role after an RLS ownership check, mirroring `advanceStatus`).

### D62 — Expired trips: a booking dies at its pickup time, and can no longer be accepted (2026-07-31)
**Found by the founder using the app**, not by reading code: *"trips on the pool exist even though the trips are
outdated by weeks!"* Measured the same day — **23 of 23 pooled missions had a pickup in the past, the oldest 44 days
ago**, and **zero** missions had ever been marked `expired`.

**The machinery existed and was never connected.** The `expired` status has been in the enum since day one and
`missionTone` already rendered it ("Expired · Was not filled in time"). But nothing ever wrote it — no job, no trigger,
no sweep — and the Pool query had no lower bound on `pickup_at`. Same shape as [[d61]]: a feature two thirds built,
sitting unreachable. **The third time this pattern has cost a session** (see also `reclaim_mission` after [[d55]]).

**⚑ Why this was a money bug, not clutter.** `accept_mission` checked `status = 'pooled'` and **not the time**. A Driver
could accept a six-week-dead booking and create a live, confirmed, priced obligation on a Business that had long since
made other arrangements — and every O7 fee path ([[d45]], [[d48]]) would then treat it as a real trip.

**The founder's rules.** (1) A trip expires **exactly at `pickup_at`** — no grace. A trip still unfilled at T-0 is
already a failure; the PDP climb hit the ceiling long before then. (2) It **stays on the Dispatch schedule until the day
ends**, then falls into the "Earlier trips" fold — which needed no query change, because the schedule already pins
today's group and folds past days by Paris day key. (3) **No re-post.** Worth recording *why* that could never have been
a simple re-time: the [[d48]] trigger freezes `pickup_at` once a trip leaves `draft`, so "post it again" has to
duplicate into a **new** mission. Deferred, not refused.

**Three guards, deepest first — the shallow ones are convenience, the deep one is the truth.**
`accept_mission` raises `Mission has expired` **under the same row lock as the status check**, so the sweep can't race
it. The Pool query gets a `pickup_at` floor, applied **even under the dev `?all=1` bypass**: that bypass drops the
*matching* filters so one demo Driver can see the whole Pool, but a dead trip isn't a filtered-out trip — listing one
`accept_mission` would refuse is a lie. And `/missions/[id]` stops offering Accept, saying why instead of the generic
"someone else took it".

**No cron — deliberately, and this is the reusable part.** `expire_stale_missions()` is a `SECURITY DEFINER` RPC that
flips `pooled → expired` and writes the `status_event` **in one statement**, called on the Pool and Dispatch schedule
reads. Vercel's Hobby plan caps cron at **once per day**, useless for a T-0 rule, and [[d61]]'s T-180 reminder needs a
real scheduler anyway — so the scheduler decision is **deferred to the notifications phase rather than half-made here**.
The RPC never throws, which is what let the app deploy ahead of the migration. If `mission` ever grows, this is the
first thing to move onto a timer.

**`missionTone` treats `pooled` + past-due exactly like `expired`.** The sweep only runs on two pages; the calendar,
the history and any deep link don't sweep. Without this the founder's original complaint would still be true on the
calendar for as long as the DB lagged. One exported `isExpired()` predicate now backs the tone, the Share lock and the
"Edit details" gate, so those three can't drift.

**Verified live against the real Supabase DB** (34-mission baseline restored afterwards): the sweep closed 23 with 23
timeline rows and returns 0 on a second call; a **genuine UI race** — Accept rendered while the trip was 75s out,
clicked 96s after the pickup passed — hit the RPC guard and surfaced the honest copy; the sweep caught that
newly-stale row on the next Pool read; a future trip still accepts and confirms immediately ([[d55]] intact); and 18
Expired rows render with the red wash on the Business schedule. `tsc` + `next build` green.

**⚑ Left open, deliberately:** an expired trip **counts nowhere**. Fill rate is the single most important
marketplace-health number and it has no home until the § F2 back-office exists. Logged there, not built here.

### D63 — Dispatch History gets outcome filters, and "Unfilled" means the ending (2026-07-31)
Follows [[d62]] the same day. The founder asked whether a Business keeps a trace of an unfilled trip; it did — 18 rows
already rendered in History — but they said the screen *"was never properly done, with filter"*, and the code agreed:
95 lines, no filters, no counts, no per-view empty state. The Driver's Past tab got that in [[d56]]; this side never did.
**The expiry work had made a question answerable that the UI still couldn't ask.**

**Filters: All / Completed / Unfilled / Cancelled**, server-side `?filter=` links reusing the Driver's `.rfilter`/`.rchip`
rather than growing a second control. **Counts come from the full set before narrowing** — a count that moved with the
active filter would make you click a bucket to find out it was empty. A **no-show buckets under Completed**, since
`mark_no_show` charges the Business in full and pays the Driver like a completed trip; the same call `rides/history` makes.
Two empty states, because "you have no history" and "this filter found nothing" must never read alike.

**⚑ The wording, which is the durable part.** The app said **"Expired"** — a word about the record, not about the
hotel's problem. Founder's choice: **"Unfilled"**. Their second observation is the good one: that word was *already*
taken by the Schedule's live warning for a soon-but-unaccepted trip, so renaming that one to **"No Driver yet"** frees
it. The two had both read "Unfilled" since S39 — one a warning you can still act on, one a final outcome. **That is the
one pair of labels a Dispatcher must never confuse**, and nobody had noticed because the outcome had never rendered
([[d62]]: nothing wrote `expired`). Reachability hid a copy bug. "No Driver yet" also matches the Driver bar's
pre-existing `No Driver yet · in the Pool`, so the rename cost nothing in consistency.

**⚑ The counts deliberately do not sum (3 + 18 + 0 ≠ 28), and that is the finding.** Eight past trips sit
`confirmed`/`on_board` — a Driver accepted them and never closed them, one `on_board` for **36 days**. They have **no
ending in the data model at all**. The founder declined a fifth bucket, so they show under All and nowhere else,
visibly. Hiding them would have implied we handle them. **§ P closed the *unfilled* hole; the *abandoned* one is
untouched, and it is a money question** — an unfilled trip owes nobody anything, but each of these has a fare, a Driver
and the whole O7 fee machinery attached. Nothing decided; it is the next thing to rule on.

**Process.** D25 loop honoured: mockup from the real tokens + the real July rows → founder amended the wording →
built to match. **⚑ And a lesson about explaining:** the founder asked twice for the four changes in plainer words, and
the second ask was fair — the first attempt led with mechanism ("server-side links", "per-month outcome count") instead
of with what they'd see. **Describe the screen, not the implementation.**

### D64 — The Earnings period picker: stop hiding a native control, and pick your own dates (2026-07-31)
Item **B** of the founder's 2026-07-31 list: *"no way to ask what did I earn between these two dates, the calendar
won't close on desktop, and it doesn't respond at all on phone."*

**⚑ One root cause behind both symptoms, and it was a design decision.** `earnings-period.tsx` rendered a real
`<input type="date">`, hid it (`opacity: 0`, a 1px box, **`pointer-events: none`**) and drove it with `showPicker()`.
On a phone `showPicker()` on a non-interactive input does nothing — the tap was dead. On a desktop the native calendar
anchors to an invisible 1px box the user cannot click away — "won't close". Probed live: it also throws
`NotAllowedError` without a user gesture, so an uncaught throw in the handler was a second silent failure mode. **The
CSS comment even admitted the hack** (*"Real and focusable (showPicker() refuses a display:none input), just
invisible"*) — the workaround was documented, which made it look considered rather than fragile.

**Why the fix is a replacement, not a patch.** `<input type="date">` **cannot express a range**, which is the feature
actually being asked for. Patching the picker would have delivered half the ask and then needed replacing anyway. So
the native control is gone and the app uses its own calendar.

**Not shared with the mission form's picker — yet, deliberately.** `components/date-time-picker.tsx` has the same
month-grid shape, but it is future-only and single-date; this is past-only and picks a span. Unifying them is a fair
follow-up; doing it *inside a bug fix* would have meant editing the money-critical mission form. What WAS extracted is
`lib/use-dismiss.ts` — and it listens on **`pointerdown`**, where the mission form's inline hook listens on
`mousedown` only.

**⚑ Correction, same day — that `pointerdown` change was hardening, NOT the fix, and the follow-up it implied does not
exist.** Claude flagged the three other `mousedown`-only popovers (`date-time-picker.tsx` · `address-autocomplete.tsx`
· `dispatch-shell.tsx`) as carrying "the same class of mobile bug", reasoning that iOS Safari withholds synthetic mouse
events on non-interactive targets. **The founder tested all three on a real iPhone and every one dismisses correctly**
— as does the new Earnings calendar. The hypothesis was wrong; iOS synthesises the event here. Recorded because a
plausible-sounding phantom in the backlog costs a future session, and because the lesson generalises: **a mechanism
confirmed in the code (`pointerdown` is ignored — verified) is not the same as a failure confirmed on a device.** The
Earnings bug was only ever `showPicker()` on a hidden input. Unifying the three hooks is optional tidying now.

**Range design.** Two taps in either order; `?p=range&from=&to=`; the **‹ › arrows are removed, not disabled** —
stepping an arbitrary span is meaningless, and a disabled control invites a click that will never work. Presets: last
7 / last 30 / this month / **all time**, the last hidden for a Driver with no history (an "all time" over nothing is a
lie). Switching to Range **seeds from the period already on screen**, so the numbers don't reset to nothing.

**⚑ A side effect worth more than the feature:** the band makes the pre-existing rule *"the granularity decides what a
tapped day means"* **visible** for the first time — pick Month, the whole month lights up. That rule shipped in
[[d59]] and lived only in a code comment.

**⚑ Comparisons needed a new shape.** A custom span has no anchor, so `Range` gained `prevCustom`/`lastYearCustom`,
and "the period before" is the **same-length** span ending the day before it starts. Comparing 46 days against a
calendar month would be a lie wearing a real comparison's clothes. Copy borrows a neutral `"period"` noun, because
"the range before" and "same range last year" are nonsense.

**⚑ `parseDayParam` rejects 31 February.** `Date` rolls it over to early March **silently** — a hand-edited URL would
have shifted a Driver's chosen span by days with no error anywhere. Reversed `from`/`to` is normalised rather than
rendered as zero earnings; an incomplete range URL falls back to the week.

**⚑ Reusable, and § R + § S are waiting for it.** The founder queued a date range for Dispatch History and Dispatch
Earnings the same day. This is the control those should adopt — build once.

**⚑ Measurement trap, logged so the next session doesn't repeat it:** reading the DOM synchronously right after
`.click()` shows the state *before* React re-renders. That made the popover look broken twice; a check deferred by
120 ms showed it working. **Assert on React UI only after a tick.**

### D65 — The Earnings calendar shows the unit it's picking (2026-07-31, founder)
Founder, right after [[d64]] shipped: *"in calendar it would be great to move forward or backward based on the period,
month by month on month tab and so on for the others, should we?"*

**⚑ The arrows were the symptom, not the defect.** The calendar always rendered a DAY grid whatever the period, so in
Month mode you tapped the 14th to mean "July" and in Year mode you tapped any day at all to mean "2026" — the control
was **collecting precision the model immediately discarded**, and month-stepping meant reaching 2024 took about thirty
taps on ‹. Match the grid to the unit and the founder's request falls out for free.

- **Month** → a 12-month grid; arrows step a **year**.
- **Year** → a 12-year grid; arrows step **twelve years**.
- **Day / Week / Range** → unchanged. There a day genuinely *is* the unit, or sits inside the month already on screen.

**Year blocks end at the current year (2015–2026), not on a calendar decade.** A Driver's history runs backwards from
today, so the default block is the one holding the data and not a single cell is spent on unpickable future years.
This is a deliberate deviation from the approved mockup, which showed 2020–2031 with four dead cells.

**Copy followed the structure.** The nav labels now say previous/next month · year · years, and the "pick any day —
you'll get its X" footnote shows for **Week only**: it was a tautology in Day mode ("you'll get its day") and is now
simply false in Month and Year, where you pick the unit itself. Month cells are sliced to three characters because
en-GB renders September as "Sept" and one wider label in a 3-across grid reads as a bug.

**⚑ The lesson to carry:** the founder proposed a control tweak; the real problem was that the control was asking the
wrong question. Before implementing a requested adjustment, check whether the thing being adjusted should exist in
that form at all — and look for the same shape elsewhere in the app.

### D66 — A completed date range stays on screen (2026-07-31, founder)
Founder, testing [[d64]]/[[d65]]: *"when I pick the date 'from' and then the date 'to' the calendar disappears… I would
like to first have a visual, but I understand why it disappears."* They diagnosed it correctly and asked whether it was
worth changing. It was: **the one moment a range picker most needs to confirm itself is the moment it was destroying
its own evidence.**

**What changed.** The second tap still commits the range — the URL and the totals update immediately — but the calendar
no longer closes. The band joins up, the label rewrites, and a **Done** button closes it. Because navigation already
happened on the tap, that confirming tap costs **no waiting**; by the time it's pressed the numbers are there. It also
gives a mis-tap on a 34px day cell somewhere to be caught before leaving the screen.

**Why not the alternatives.** A timed auto-close (~½ s) needs no extra tap but commits a mis-tap regardless and is
either too slow or too fast depending on the person. Staying open with no button is the cleanest to look at but says
nothing about the selection being finished — which is the whole complaint.

**Presets deliberately keep closing instantly** (founder's call): one tap, unambiguous intent, nothing to confirm.
Making a shortcut cost a second tap defeats the shortcut. A knowing inconsistency, not an oversight.

**Two details that make it correct rather than merely open:** Done is **hidden mid-selection**, so it can't be pressed
over a half-built range; and clearing `pendingFrom` on completion is what makes the next tap **start a fresh range**
instead of extending the finished one.

---

### D67 — Abandoned trips: don't guess who drove, ask — and not yet (2026-07-31, founder)

**The hole.** § P closed the *unfilled* case. This is the other one: 8 past trips still sat `confirmed`/`on_board`, one
for 36 days. A Driver accepted them and never tapped Complete, so nothing settles them and they fall into no History
bucket.

**The founder's reading, and why it's mostly right.** *"In a real situation there will be people taking care of it — a
Business follows up, there are passengers behind it, and we did offer solutions to both parties."* True: copilote, the
agreed release, T-60 and Business cancel all answer **"this trip isn't going to happen."** Someone is unhappy, so
someone acts. **That case is genuinely covered.**

**What they don't cover — the case with no complainer.** The opposite one: *the trip DID happen and nobody tapped the
last button.* The Driver drops the Guest, the hotel is delighted, the Driver moves to the next job and never reopens the
app. Nobody is unhappy, so nobody chases it — the service was fine, only the **record** is wrong, and the record is what
pays the Driver and bills the Business. **That is the case that survives real users.**

**So: a question, not a rule.** Time can never separate "drove and forgot" from "never turned up" — same status,
opposite meanings. Only the Driver knows. A **pinned card, not a modal popup** (a popup trains people to tap ✕ without
reading) on My Rides ~3h after the trip should have ended: *Yes, I drove it* / *No, the Guest never showed* / *Something
else*. It adds **no abuse surface** — a Driver can already tap Complete without driving.

**The shelf life — the founder's own best question: "what if the Driver comes back a month later?"** A month later *he
doesn't remember either*. So the question expires in ~48h and **flips to the Business**, who knew that same day whether
their Guest reached the airport. Neither answers → back-office. The Business meanwhile sees an honest "Waiting on the
Driver to close this" and can **Nudge, never close** — a Business that can mark a trip complete is a Business declaring
a Driver's work done, and that is money.

**Geolocation (founder's idea) — right instinct, V2.** Kavenue is a PWA: a browser only gets location **while the app is
open on screen**, so there's no background arrival detection without a native app. And even then, **location may
suggest, never decide** — location closing a trip is location *paying* someone. Failure case: the Driver returns to Nice
airport at 11am for his next job and the app closes and pays out yesterday's trip.

**PARKED.** In beta the founder is the only one creating trips, so all 8 are test artifacts; and the card only fires
when a Driver opens the app, so the design needs **push** to be worth building. Building now ships the weak version
twice. Lands with notifications (menu B) or the back-office (§ F2). Full spec: BACKLOG § Q.

---

### D68 — Dispatch History is a tool you search, not a list you scroll (2026-07-31, S52)

**The ask.** Founder: *"it is a professional tool, and they need accurate infos and easy to find a specific trip or
mission by drivers name, or passenger or internal reference, or car… it need to be perfect and complete."* § R phase 1
([[d63]]) had given it outcome chips and counts; this is the rest.

**One search box, not five fields.** A Dispatcher doesn't know which field they remember a trip by — they remember
*something*. So one box covers Guest · Driver · reference · address · flight · car, every term must hit somewhere (AND
across terms, OR across fields), so "marc negresco" narrows the way a person narrows out loud.

**It is accent-blind, and that isn't cosmetic.** Half the beta's addresses are "Aéroport Nice Côte d'Azur" and "Hôtel
Negresco"; typing "aeroport" in a hurry has to find them. The highlight paints the ORIGINAL text from offsets found in
the folded one, which needs a per-character index map — folding the whole string loses the mapping the moment a
character doesn't fold 1:1. (Related to the S42 airport-predicate bug: accents are never incidental in this product.)

**The row says WHY it matched, when the hit has no column.** Searching a plate or a make otherwise returns rows with no
visible reason, which reads as a broken search. So a car hit prints `Car · Mercedes · Classe E · AB-123-CD` under the
route. That is what makes "find it by car" work without spending a column on it.

**Two gaps the redesign exposed, both fixed.** (1) Rows showed only a **time** while being grouped by **month** — 3 July
and 19 July were indistinguishable without opening the row. (2) There was **no fare column at all**; an archive with no
money in it cannot be the thing an accountant opens.

**⚑ The accuracy call that matters most: an unclosed trip is not spend.** A past trip still `confirmed`/`on_board`
(§ Q / [[d67]]) has an agreed fare but nothing settled. It now shows that fare **greyed, labelled "Not settled", and
excluded from every total** — the row, the month band and the summary. Counting it would inflate a hotel's spend with
trips that may never have happened; hiding it would lose a real number. The CSV gives it its own column.

**Export CSV re-runs the same query on the server.** The page and the export both call `applyHistoryQuery`, so "exactly
what's on screen" survives the next filter someone adds. Delimiter is `;` and amounts are French-style (58,17) because
the reader is Excel FR, where a comma is the decimal separator and a comma-delimited file lands entirely in column A;
a BOM keeps "Aéroport" from arriving as "AÃ©roport". A leading `=`/`+`/`-`/`@` is escaped so a stray reference can't
execute as a formula.

**The date range is the Earnings calendar, not a second one.** Extracted to `components/date-cal.tsx` and adopted
unchanged ([[d64]]–[[d66]]); the Driver's screen was verified after the extraction. Third surface asking for a range,
still one control. § S adopts the same.

**Everything lives in the URL** — filter, search, from/to, driver, class, sort — so a filtered archive is a link you can
send, Back works, and the CSV is that link with a different extension.

**Native `<select>` for Driver / class / sort** rather than three more popovers: keyboard- and screen-reader-correct for
free, and they render as the platform picker on a phone. Only the calendar needed to be custom.

**Not built, on purpose:** a density toggle (the row is already dense), and pagination — fine at 28 trips, the first
thing to break at 5 000, and still noted in § R rather than pre-built.

---

### D69 — The shared calendar owns its own range, and the toolbar owns its own intent (2026-07-31, S52)

Three founder reports on the [[d68]] History screen, then an adversarial review of the fixes. All of it is one
theme: **a control must not read its own state back from something that lags behind it.**

**"Can you imagine there is 300, how it would look like?"** The Driver `<select>` is gone. A native dropdown over
every Driver a hotel ever used is unusable at real scale, and typing a name in the search box already finds them
with the match highlighted. `driverId` survives as a URL param with no UI, so a row-level "every trip this Driver
did" stays one link away.

**"It removes what I wrote to search then the writing comes back."** The input mirrored `query.q` back into local
state so "Clear filters" could empty it. But `router.replace` runs in a transition, so between *we pushed q=x* and
*the navigation committed* there is a render where the prop still holds the OLD q — the sync read that as an
external change, wrote the stale value in, then the new one when it landed. Once per keystroke. **Local state is
now the sole owner of the box**; the things that clear it clear it explicitly, and the empty state's link is a hard
navigation rather than a soft one that would leave the text sitting there. (Also: the field was `type="search"`,
so the browser drew its own ✕ over the app's — "a cross on top of the other cross".)

**"I can't select a specific week or month, can you use the same as the driver app."** The date filter is now the
Earnings control whole — Day · Week · Month · Year · Range — with the segmented picker inside the popover so the
toolbar stays one button wide, ‹ › steps around the label, and an "Any date" reset that the Driver's screen has no
need for. The URL carries `?p=&d=` (or `p=range&from=&to=`) and from/to are **derived** via `periodRange`, so the
page and the CSV can't disagree about what "July" means.

**"The layout changes… Done disappears, letters of the days week also."** The prompt appeared at the TOP and Done
vanished, so a first tap pushed the grid down 27px and shrank the popover 18px — the date numbers slid up into
where the weekday letters had been, which is exactly what the founder saw. **One footer slot of a fixed height**
now holds either the prompt or Done. Measured identical (440 / 340 / 321) across open, first tap and complete.

**"It displays today's date for a moment before going back to from–to."** The two-tap state lived in each CALLER,
which cleared it the instant the second tap landed — but the new range only arrives when the navigation commits, so
for one frame the calendar drew the OLD props: the previous range, or nothing with only "today" lit. **The range
now lives inside `DateCal`, which paints the completed pair optimistically** and drops it once the props catch up.
Fixes Driver and Dispatch at once and deletes the duplicated logic from both callers.

**⚑ The review's real lesson, and the pattern to remember.** A 4-lens / 29-agent adversarial pass over the first fix
confirmed 8 more defects (and refuted 8). Almost every one was the SAME shape as the bug it was reviewing — code
reading a value that hadn't caught up yet:
- Tapping a month from "Any date" did **nothing**: `period` is null until a filter exists; the calendar fell back to
  `"month"` for rendering but `pickDay` pushed the raw null, so no params were written. Reproduced live.
- Clicking ‹ three times fast stepped **one** month — each step recomputed from a prop mid-flight.
- A debounced search fired with the query as it was 350 ms earlier, **reverting** a sort changed in between.
- No unmount cleanup on the debounce: leaving History mid-word navigated you back to it, with Back already spent.
So `push` now merges patches onto **the last intent this component asked for**, guarded so a slower earlier
response can't overwrite a newer one — and steps compute from that same ref, not from the prop.

Also fixed: `?p=day&d=2026-02-31` rolled over to 3 March (shape-only regex → earnings' own `parseDayParam`); and a
query of just `^` or `¨` folds away to nothing and used to match **every** row with no highlight — it matches
nothing now, which is the honest answer.

### D70 — The Business cancellation fee steps every 30 minutes; it does not slide (2026-08-09, S56)
The ramp was continuous (`pct = 50 + 10 × (5 − hours)`), recomputed from `now()` inside the RPC while the modal
read the *client* clock and re-ticked every 30 s. Measured live against the real RPC: over a 30-second dwell the
charge exceeded the quoted figure by **0,06 € on a 70 € trip and 0,41 € on a 480 € one** — always upward, since
the slope only climbs. Rounding was investigated first and cleared (0 divergences in 5 000 000 random pairs).

Claude proposed the small fix — tick the modal every second, ~1 cent, no policy change — and treat steps as a
separate pricing question. **The founder went the other way and was right:** a slope cannot be explained, the
modal's reference row had always *drawn* steps, and in their words *"we have to make rules and they'll get around
it."* They chose **30 minutes** over hourly. Claude argued 10 min on fairness and conceded 30 is better because it
is **sayable** — "cancel before 14:30 and it's 60%" fits on a card; 10-minute treads do not.

Rounding is **in the Business's favour**: 50 % holds to T−4h30 rather than expiring at T−4h59, and the boundary
belongs to the dearer band. Every hour landmark is unchanged (5h→50 … 0→100), so nothing that sat on an hour
moved. The cost is a 5-point cliff per boundary (24 € on a 480 € trip), which is why the modal now shows the next
raise and counts down to it — *a deadline you can see is not a trap*.

Claude's honest position, recorded because it lost: steps are *slightly less fair* arithmetically (a slope charges
exactly the proportional share of every second). But fairness nobody can perceive is not experienced as fairness,
and a rule you can plan around beats one you cannot see.

⚑ **The step created a money bug, caught by the § H2 harness within the hour.** Making pct a multiple of 5 made
**exact half-cent ties routine** where the slope had made them essentially impossible: 85,50 € × 95 % = 81,225 €,
which Postgres rounds away from zero to 81,23 and float64 rounds down to 81,22. At 95 %, one fare in twenty ties.
`cancelFeeAmount()` now works in integer cents and is the single definition; the tests sweep all 1.1 M pairs.

⚑ **Ruled NOT worth fixing:** the tread boundary race (client clock vs server clock can settle one step dearer).
A ~2-second window every 30 minutes, one step, on a screen that visibly counts down to that exact moment. The fix
— sending the quoted price and deciding honour-vs-refuse — is more machinery than the problem. Logged in § H2.

### D71 — Waiting is owed whenever it happened, including on a trip that goes ahead (2026-08-09, S56)
Founder: *"the driver is paid the extra time by the business, and the business will charge the guest."*

Before this, only the three FAILURE doors (`mark_no_show`, `business_declare_no_show`, `business_cancel_mission`)
ever wrote `waiting_fee`. A Guest 45 minutes late, with a meter visibly running at 1,00 €/min on **both** apps,
cost nobody anything the moment they got in the car — so a Driver on site was **€1/min better off filing a
no-show than driving the Guest they had waited for**, inverting the incentive D48 exists to create.

Kavenue bills the Business; what the Business recovers from its own Guest is the Business's side of the
arrangement, so the agent positioning (Doc 01) is untouched.

Settlement happens at **`arrived → on_board`** via the new `board_guest` RPC: it is the moment the waiting
provably ended, it is the Driver's own action, and `FLOW` makes the step unskippable. It is an RPC rather than an
extension of `advanceStatus` because that path writes through the service role and computes nothing — the meter
belongs in SQL, off the same `mission_waiting()` and the same `now()` as the other three doors. Double settlement
is impossible: after boarding, all three other doors refuse (proved live, not reasoned).

Founder's UI calls: the Driver sees **one simple amber line** at boarding (they watched the money accrue; if it
vanished silently they would have no reason to believe it counted). The Business is **not** notified at that
moment — they already watch the same meter live on the row. There is deliberately **no waive button**, so a
generous Driver cannot forgive it; accepted knowingly.

**NULL, not 0**, when the Guest was on time — a 0,00 € row on every completed trip would drown the ones that
mean something.

⚑ Accepted residual: settlement is timed off the Driver's own tap, so a Driver who boards an on-time Guest and
taps twenty minutes later bills twenty minutes the Guest never caused. The Business watches the same meter and can
call, the ceiling caps it at 40 €/60 €, and in beta every euro settles by hand.

⚑ Parked for the pricing conversation: *"what if the Business doesn't want the Driver to wait past the courtesy
wait"* — `business_declare_no_show` is already half of that lever.

### D72
**2026-08-14/15 — THE PRICING MODEL, LOCKED END TO END. Source of truth is now
`docs/06_Pricing_Commission_Payments.md`** — a file that did not exist before this session, despite two
outside briefs citing it. Everything below is recorded there in full; this entry is the pointer.

**Commission.** 12.5% Business / 10% Driver **before VAT** = **15% / 12% TTC**. The "15/12" in the outside
brief and the "12.5/10" in `docs/04` were never two proposals — they are the same rates with and without the
20% VAT on Kavenue's fee. On a 100 € fare: hotel invoiced 115 €, Driver receives 88 €, Kavenue banks **22.50 €**
and hands 4.50 € to the state. **Never quote 27%** — it counts VAT as income. The rule that replaced the case
list: **money moving Business → Driver carries commission, always**; an agreed release moves none, and the
Driver's own penalty runs the other way so it is an indemnity. This settles the cancellation-fee question — a
90 € fee becomes 103.50 € paid / 79.20 € received.

**The auction.** Founder rejected all three researched alternatives (pre-committed driver prices, fixed fare +
access gating, waterfall tendering) and the two "dangers" the research flagged, from operator experience:
*"the fomo is going to do the work, I experience it everyday on Sixt."* Kept the ascending auction and built a
proper curve: **equal movement per halving of the remaining time**, opening at the floor, ceiling at **T−5h**,
steps log-spaced then **jittered from a seed derived from the mission id** (unguessable outside, perfectly
replayable in a dispute). Posted inside 5h → the climb runs to the **midpoint**. The curve never starts earlier
than 2 weeks, so two identical trips are worth the same whoever typed theirs in first. **SPEED WIN is the same
curve opening at 70% of ceiling** — not a separate mechanic.

**Two founder corrections that changed the design.** (1) *The floor is an opening bid, not a valuation* — a
guard rail against an absurd posting, which is why it being "too cheap" is the auction working. (2) *Every trip
opens at the floor whatever the lead time*, because the Business saving money is what keeps the whole system
alive; pricing a late posting higher would have punished them for their own urgency.

**The rate card was rebuilt from 192 real market prices** (9 operators + the regulated taxi tariff), positioned
at ~77% of retail. Uber excluded above the entry tier — *"they destroy the market"*. The old Eco card priced
Nice → Saint-Tropez at 64% of retail; it is now 79%. **Fixed class ratios were dropped** — observed ratios move
with distance in opposite directions.

**Learned route prices, designed not built.** ⛔ **Never learn from the accepted fare** — the founder caught
this: accepted fares are FOMO under auction pressure, so learning from them ratchets the card down forever.
Learn from **edited ceilings** (outcome referees the motive) and **fill rate**. ⛔ **Untouched ceilings do not
move the price** — they are Kavenue's own number handed back, and pooling them measures the edit rate, not the
route. They validate through the outcome instead.

**The 30-second hold ([[d72]] part 2), from the founder's own notebook.** A Driver holds a trip for 30 s to
think, price frozen. Not a price protection — a **regret protection**: an impulsive accept becomes a Driver
cancellation, which is a 100% penalty plus a hotel with no car. One hold at a time, one per trip, **enforced
inside the same gate as Accept** or a Driver pressing Accept in the same tenth of a second writes past it. The
card stays readable to everyone with a visible countdown.

---

### D73 — The Ceiling is the Business's all-in maximum; the Pool price is the Driver's payment (2026-08-17, S61)

**The question, which `docs/06` could not answer on its own.** §4 calibrated the rate card against *retail* —
published prices a customer pays — and concluded it sits at **70–94% of retail**, "so a Business reselling to
its Guest keeps a margin". §1 says the Business pays 12,5% HT / 15% TTC **on top of the fare**. Both are
LOCKED, and they cannot both describe the same number: read the card as the fare and a Business's real cost is
**80–108% of retail**, which breaks §4's own margin claim on the routes where the market quotes cheapest.

**Decided: ALL-IN.** The Ceiling Kavenue pre-fills is what the Business pays, service fee and VAT inside. It is
the only reading that keeps the calibration true as written, and it matches §2's one-convention rule — a
Business is never shown a number that later grows. Founder's call after both readings were priced out on the
same trip (Cannes → Monaco: 159,40 € all-in with the Driver banking 121,98 €, against 183,31 € with the Driver
banking 140,27 €).

⚑ **What made it cheap to ship: `mission.ceiling` did not change meaning.** It still stores the **Course**. The
all-in figure is derived for display and converted back exactly once, on write — so every fee, band and
cancellation basis downstream kept its meaning, no money RPC was touched, and the S57 probes did not need
re-running for this step.

**And the Driver ruling, provisional since S48, is now permanent:** the number in the Pool **is** what they
bank. No gross/net language anywhere. Nobody is shown the Course — the Business sees `× 1,15`, the Driver sees
`× 0,88`, and the number in between belongs to neither.

**The commission appears once on the Driver's side**, in the money detail of a trip they hold, because they
have to invoice and file. The same 87,00 € leaves a VAT-registered Driver keeping 79,98 € and one under
*franchise en base* keeping all 87,00 € — a difference no single number can express. The Business does **not**
get the transport VAT broken out on screen: they cannot reclaim it, so it is not actionable; the 20% on
Kavenue's fee, which they can reclaim, already has its own line.

**Two consequences accepted with it.** (1) Spend and History totals rose ~15% overnight — they now show what
leaves the account rather than the fare alone. (2) A Driver's own cancellation penalty stays **gross**, since
§1 makes it an indemnity; whether its *basis* should become "100% of what you'd have been paid" is open in
BACKLOG **§ Y**, alongside whether 100% is enough on a cheap trip at all.

**Superseded nothing.** [[d59]]'s "no gross/net language" instinct is now the implemented rule.

### D74 — Nobody is told who receives a Driver's cancellation penalty until it is decided (2026-08-20, S63)

The Business-side "Driver cancelled" block was mocked with **"Owed to you: 190,00 €"**. The founder stopped it
with the question that breaks the current position: *"the hotel will in the end not pay anything and won't
charge their clients, so what do we do with the driver's money?"*

They are right. `docs/06` §1 called the penalty an indemnity running Driver → Business as though 100% of the
fare made the hotel whole. It does not correspond to a loss: **the trip never ran, the Business paid nothing
and billed its Guest nothing, and the trip goes straight back into the Pool.** Their real damage is the price
difference when it re-fills dearer (SPEED WIN comes on automatically under 24h), the whole fare when it never
re-fills, and sometimes nothing at all. The 100% figure is sized to **deter the Driver** — a different job,
pointing at a different recipient. That is why `docs/06`:71 and the O7 migration header had disagreed for a
month without anyone noticing: two true-sounding sentences about two different purposes.

**Decided: park the money, ship the facts.** The block states only what is certain — a Driver held this trip,
when they walked, and their reason. **No amount, no recipient.** Nothing is collected during the beta, so
nothing is lost by waiting, and a hotel told it is owed something it is not would be very hard to take back.
Three costed destinations (damage-first with the remainder to Kavenue · all to the Business · all to Kavenue)
are in BACKLOG **§ Y**, to be decided together with "is 100% enough on a cheap trip" and "100% of the fare or
of what they'd have been paid" — the same conversation.

**Settled on the way:** the penalty carries **no commission**, which was never in doubt and is already
implemented in `carriesCommission` / `lib/earnings.ts` / the Driver's copy. The `rides/history` comment calling
it "owed to Kavenue" was the outlier and was corrected; the code under it was always right.

### D75 — An unclosed trip stays in plain sight, but friction needs a door (2026-08-20, S63)

§ Q lifts a trip a Driver never closed into **today's band**, mixed in with real work. The founder was asked
whether that is noise and ruled deliberately: **keep it.** *"It's as you said noisy and bothering, so it would
push business to handle it and reach the driver to close the trip."* The discomfort is the feature.

**But the same session measured what it degrades into.** On the test data: **18 unclosed rows in today's band,
14 of them over a month old, against 0 trips actually scheduled that day.** And on an unclosed row the app
switches **off** amend, release and cancel, leaving only *"call them to confirm it happened"* — so a Dispatcher
who rings the Driver and is told *"yes, it ran"* has **nowhere to record it**. The only exit is the Driver
answering in their own app.

The § Q close prompt already carries the warning for the Driver's side — *"nagging them after that is how a
prompt turns into noise people learn to ignore"* — and nothing protects the Business from the identical
mechanism. **A nag with no door is what turns pressure into wallpaper.** Seeded data exaggerates the volume (a
working hotel closes daily and would carry nought or two), so the plain-sight design is right at real density;
the accumulation is the part that needs an answer. Three fixes queued smallest-first in BACKLOG **§ Q6**, the
first being a Business-side *"I called them — it ran"*, which settles money and therefore pairs with **U.3**.

### D76 — Name the rule, don't print the number, when the number lives in a table (2026-08-20, S63)

`mission.night_applied` became visible this session on five surfaces. The tag says **"Night rate"**, never
**"×1,20"**.

The multiplier lives on `rate_card.night_multiplier`, reachable from a mission only through
`mission.rate_card_id` — which is **NULL on the entire pre-2026-08-16 archive**. Printing the literal would put
a pricing constant in the UI, which `docs/06` §9 forbids ("numbers live in tables, not in code"), and it would
**lie the day the card is re-tuned** while every historical row silently kept claiming the new figure.

**The general rule this sets:** a display may name a rule that was applied; it may only print the number when
it reads that number from the row that was actually charged. The same principle decided the waiting rate the
same day — the *stamped* `mission.waiting_rate`, never `waitingRatePerMin(category)`, because rows settled
between 2026-07-22 and 2026-08-18 were billed a flat 1,00 whatever their class. Where no number was stamped,
the display says less rather than guessing: minutes alone, no rate.

### D77 — Each side reads a rate on its own basis, and only where the arithmetic survives being checked (2026-08-20, S63)

A settled wait now states *"N min at X €/min"*. The two sides get **different numbers**, deliberately.

The Driver's net rate is `× 0,88` → **0,44 · 0,66 · 0,88**, all clean cents, so minutes × rate is exactly the
amount printed beside it. The Business's all-in rate is `× 1,15`, and a Course-side 0,50 becomes **0,575**: it
displays "0,58 €", and 0,58 × 20 is **11,60** against a true **11,50**. Any Business-facing per-minute rate is
therefore *checkable* and **fails the check on two classes in three**.

**Decided:** the Business sees the rate **Course-side only, inside the invoice table**, where the fee lines
follow it and the total still reconciles — and **minutes without a rate** on the row face, in the archive and
in both CSVs. Better to say less than to print a number a reader can disprove with a calculator. The same
reasoning kept the per-minute rate out of the CSVs entirely: every euro column in those files is all-in.

### D78 — Rule 2 wins where rules 2 and 3 overlap: the Ceiling is reached at T−5h (2026-08-22, S64)

`docs/06` §6 rule 2 says the Ceiling is reached at **T−5h**. Rule 3 says a trip posted **inside 5 hours**
climbs to the **midpoint** between posting and pickup instead. Both are written as absolutes, and
**between 5 and 10 hours of lead they contradict each other.**

The two readings, on a trip posted 6 hours before its pickup:

| | rule 2 read literally | `top = T − min(5h, lead/2)` |
|---|---|---|
| Tops out at | T−5h | T−3h |
| Price at T−5h | the Ceiling | ~26 % of the way up the gap — ≈35 € all-in on a 26,30 → 60,70 trip |
| At the 5h boundary | discontinuous | continuous |

The smooth version is mathematically nicer and it is the one that reproduces both of §6's own worked
examples. It was still rejected. **A trip five hours from its pickup with no Driver is urgent, and an
urgent trip should be at the top of its range so it fills.** Pricing it a third of the way up because it
happened to be posted at T−6h rather than T−14d gets the incentive backwards, and "five hours" is exactly
where §6 already puts the SPEED WIN nudge — the moment the normal climb runs out is the moment the trip
is meant to be as attractive as it will ever be.

**Decided:** `topLeadFor(lead) = lead > 5h ? 5h : lead/2`. Rule 3 governs only what it actually says —
posted *inside* five hours. The discontinuity at exactly 5h of lead is real and accepted: a Business could
in principle wait two minutes past T−5h to get a floor-opening auction instead of an instant Ceiling, at
the cost of two minutes of fill time on a trip that already has none to spare.

### D79 — The floor lives in `pdp_start`, and SPEED WIN's opening is derived, never stored (2026-08-22, S64)

The §6 curve opens at the rate-card **floor**, so the floor became a money input on every read and had to be
snapshot on the row. Three homes were possible: a new `price_floor` column, the vestigial `base_fare`, or
`pdp_start` itself.

**`pdp_start` won because the SQL fee-basis band already reads it.**
`least(coalesce(pdp_start, ceiling * 0.5), ceiling)` (`2026-08-11_fee_basis_band.sql`) clamps every
cancellation and no-show basis. Putting the floor there leaves that expression **byte-identical and more
correct**: it used to describe a flat 50 % of the Ceiling, and now describes the real bottom of the
legitimate range. The `coalesce` keeps every pre-curve row reading exactly as it always did. A new column
would have meant a second number to keep in step with the band, for nothing.

The consequence, and the reason this is a decision rather than a detail: **`pdp_start` must now survive a
re-pool.** The three re-pool RPCs overwrote it with `ceiling × 0.7` / `× 0.5`, which under the old curve
*was* the opening price. `2026-08-22_pdp_curve.sql` removes those assignments and nothing else.

That is only safe because **SPEED WIN's 70 % opening is derived on read** — `openingPrice()` returns
`speed_win ? max(floor, ceiling × 0.70) : floor`. A re-pool flips one boolean, so SPEED WIN can come on
(under 24h) and go off (24h+) any number of times without the floor underneath ever being lost. Storing the
*effective* opening instead would have destroyed the floor on the first re-pool that turned SPEED WIN on.
The `max` also closes a real edge: a Business may set a Ceiling close enough to its floor that 70 % of it
falls below the floor.

**The band's bottom moved as a side effect, and that is intended.** It was a flat 50 % of Ceiling; it is now
the floor, which sits at roughly 27–47 % of Ceiling depending on class and distance. The band is a guard
against a forged fee basis, not a valuation — and a fare genuinely *can* now be the floor, so the wider band
is the honest one. See [[d78]] for the curve's shape and `docs/06` §5 for why the floor is a guard rail.

### D80 — A re-pool never re-opens below the fare the last Driver agreed to (2026-08-22, S64)

Spotted by the founder the day the §6 curve shipped. A Business 31 km trip, floor 36,25 → Ceiling 110,00
all-in. A Driver accepts at **50,68** and walks at **T−30h**. The trip re-pooled and re-opened at **36,25**.

Three things wrong with that, in order of how much they cost:

1. **The trip is now more urgent and is being offered cheaper.** It has 30 hours of runway instead of 48,
   and less time to climb, and we drop the ask by a quarter.
2. **It throws away the only real market signal we have.** Nobody took it under 50,68, and one Driver
   actually said yes at exactly that. Re-opening below it is worse information, not fresh information —
   the §8 learned-prices design says the same thing about which signals are safe to learn from.
3. **A Business whose Driver walks ends up with a better "saved against your maximum" figure** than one
   whose Driver didn't. The number that exists to argue for the auction rewards the failure case.

⚑ **Under 24h it never bit**, which is why it survived the D21 curve unnoticed: the re-pool turns SPEED WIN
on and 70 % of the Ceiling lands near where the price already was (79,18 → 77,00 in the same worked example).
It is only the ≥24h branch, which opens at the floor, that drops.

**Decided:** the opening becomes `max(floor or 70 %, the fare the last Driver agreed to)`.

**Built as a raised floor, not a special case.** The three re-pool RPCs write
`pdp_start = greatest(pdp_start, accepted_fare)` and then clear `accepted_fare`. `openingPrice()` in
`lib/pdp.ts` needs no branch at all, and the **SQL fee-basis band follows for free** — its bottom rises to
the agreed fare, which is strictly more protective than the floor. `greatest` skips NULLs in Postgres, so a
trip nobody ever accepted keeps its original floor. Repeated re-pools can only ever raise it.

**This is what finally forced §9's stored fare.** There was no frozen fare in the database — `settledFare`
re-derived the curve at `accepted_at` on every read, which `docs/06` §9 has asked us not to do since it was
written. `mission.accepted_fare` (2026-08-22 migration) is that column. Nothing was backfilled: founder,
same day, *"no need to update prices on existing trips."* NULL means "never accepted, or accepted before the
migration" and every reader falls back to recomputing, exactly as before.

**Where the number comes from, and why it is not forgeable.** Postgres cannot evaluate the §6 curve —
`lib/pdp.ts` is the only place it exists — so `accept_mission` gained `p_fare`. It is computed inside the
**accept server action**, where the Driver's browser has sent only a mission id; there is no number to
forge. It is clamped into `[floor, ceiling]` in SQL anyway, with the same expression the fee-basis band
uses, because a money column should not depend on its caller being well-behaved. The argument **defaults to
NULL**, which is what made the migration safe to apply before the code deployed.

`respond_to_amendment` sets `accepted_fare = new_fare` alongside the collapse it already does. Without that
one line an amended trip would keep billing the pre-amendment number on every downstream read. See
[[d79]] for why the opening price lives in `pdp_start` in the first place.

### D81 — The price is a function of the time left, not of what any Driver did (2026-08-22, S64)

**Supersedes the mechanism of [[d80]], not its intent.** D80 said a re-pool must never open below the fare
the last Driver agreed to, and implemented that by *restarting* the auction from that fare. The founder read
it back the same day and gave the better rule:

> *"A driver accepts a price then lets it go, then going back to the Pool should start at the price it
> should have been if the driver didn't take it and it would have kept rising. Trip 150 €, a driver takes it
> at 65 € one week before, walks away 2 days before — the price should be what it was supposed to be at that
> moment, which is 2 days before the trip, regardless of the driver behaviours. Otherwise the trip would be
> re-pooled at the price from 7 days ago and doesn't make sense with the deadline."*

They are right, and it is simpler than what was built. **A re-pool no longer restarts the climb at all.**
`lib/pdp.ts` stopped reading `pooled_at`; the curve runs from when the trip FIRST entered the Pool to its
pickup, and a re-pooled trip is simply read at today's point on it. A trip taken a week out and dropped two
days out goes back to the Pool at the **two-days-out price** — because that is what a trip with two days
left is worth, and re-opening it at a week-out price would ignore the deadline entirely.

**D80's rule now holds for free.** The curve only rises as the pickup approaches, so whatever a Driver
agreed at t₁, the price at any later t₂ is at least that. The `greatest(pdp_start, accepted_fare)` raise in
the re-pool RPCs stays as a **backstop for the one corner the curve does not cover**: a SPEED WIN trip
re-pooled at 24h+, where §6 switches SPEED WIN off and the opening would otherwise drop.

**It also forced the amendment fix that came with it.** `respond_to_amendment` used to write
`ceiling = base_fare = pdp_start = new_fare` — freezing the agreed fare by collapsing the curve to zero
width. That was correct before `accepted_fare` existed, when `ceiling` doubled as "the fare". It now does
two wrong things: it leaves an amended trip with **no band to auction inside** (so a re-pool after an
amendment sits flat at one price for ever), and it **silently lowers the Business's own stated maximum** —
Ceiling 110,00 → an amendment agreed at 71,53 → maximum 71,53, decided by nobody.

**Decided:** `ceiling = greatest(ceiling, new_fare)` — an amendment may only ever RAISE the maximum —
`pdp_start` is left holding the real floor, and `accepted_fare` does the freezing. Founder chose this over
leaving it flat, with the cost stated: if an amended trip's Driver walks, it re-auctions up towards the
original maximum, so the Business can pay more than it agreed with *that* Driver — but never more than the
maximum it set itself, which is the deal on every other trip.

⚑ **`pooled_at` is no longer a pricing input.** It still records when a trip re-entered the Pool and is
still read by `lib/spend.ts` for the fill-time metric. Do not wire it back into the curve.

### D82 — A re-pool changes nothing about the price except that time has passed (2026-08-22, S64)

The last of the day's three corrections, and the one that makes the other two coherent. A re-pool used to do
**three** things to the price. It now does none.

| | what it did | why it's gone |
|---|---|---|
| Restart the climb | `pooled_at` became the new curve origin | [[d81]] — the price is what the deadline says, not what any Driver did |
| Raise the opening | `pdp_start = greatest(pdp_start, accepted_fare)` | [[d80]]'s mechanism, made redundant by [[d81]] and actively harmful |
| Flip SPEED WIN | on under 24h, off at 24h+ | the rule it served no longer exists, and it is the Business's checkbox |

**The floor raise had to go because it fought [[d81]].** `.local/probe/accepted-fare.ts` caught it: an
untouched trip read **43,37 €** at T−30h and the same trip, taken and dropped, read **52,70 €** at the same
instant. A 21 % premium for nothing but a Driver having held it — precisely the history-dependence [[d81]]
exists to remove. [[d80]]'s intent survives untouched, because the curve only rises toward the pickup: a
re-pooled trip is *already* worth at least what the last Driver agreed to, with nothing enforcing it.

**The SPEED WIN flip had to go for a different reason, and the founder found it by asking whether 24h was
the right threshold.** It isn't, and no threshold is, because the premise is inverted. SPEED WIN raises
where the curve *opens*, so its effect shrinks as the pickup nears — measured on a 110 € Ceiling:

| | T−48h | T−24h | T−12h | T−6h | T−5h |
|---|---|---|---|---|---|
| off | 67,84 | 79,18 | 94,19 | 105,51 | 110,00 |
| on | 90,16 | 97,37 | 100,95 | 106,90 | 110,00 |
| **lift** | **+33 %** | **+23 %** | **+7 %** | **+1 %** | **0 %** |

Switching it on *because* a trip became urgent does least exactly when it is needed most. The rule was
written when a re-pool restarted the climb at 50 % of the Ceiling and needed a boost to fill; there is no
restart any more. **And it is the Business's own checkbox and their own money** — Kavenue flipping it
unasked is Kavenue nudging the fare, which §0 forbids. `speed_win` is now only ever what the Business set.

⚑ **This also removed the need for the popup the founder was weighing** (should a re-pool ask the Business
to approve SPEED WIN?). With nothing being changed on their behalf there is nothing to approve, no
notification, and no extra work for the hotel. The ≤5h nudge at booking stays — that is the Business
choosing, which was always the right shape.

**What is left when a trip really will not fill near its pickup:** the price is already at the Ceiling, so
there is nothing left to give. The only lever is *raising the Ceiling*, which is the Business's money and
needs a genuine ask. Parked in `BACKLOG.md` — it needs notifications, which are deferred.

⚑ **`pooled_at` is not a pricing input any more** but is still stamped: `lib/spend.ts` reads it for the
Business's "time to fill" metric.

### D83 — SPEED WIN becomes a badge the price can earn, not only a box the Business ticks (2026-08-22, S64)

Founder's idea, argued through and accepted. **A pooled trip whose fare climbs past ~70 % of its Ceiling
shows the SPEED WIN badge**, exactly as if the Business had ticked it. Designed, not yet built.

Claude argued against it three ways and was wrong on all three:

1. *"The badge would be on every trip."* Only in a thin Pool. At the scale this is built for, FOMO clears
   trips early — a Driver takes a good fare rather than risk another Driver taking it, and does not wait
   for a Ceiling they cannot see. **Crossing 70 % will mean the trip genuinely failed to clear, which is
   rare and therefore worth flagging.** `docs/06` §5 already says the same thing: *"At scale this changes.
   With enough Drivers, trips clear early."* ⚑ It runs backwards during beta — few Drivers, so most trips
   would earn the badge. **Ship it behind a switch and turn it on when the Pool is liquid.**
2. *"It would make SPEED WIN mean two things."* It does not. §6: SPEED WIN is *"the same curve with a higher
   starting point — nothing more"*, so a trip that climbed to 70 % and one that opened there are in the
   identical state and the Driver's decision is identical. The distinction protected was one no Driver uses
   — and a last-minute booking is not a Business being judged for anything.
3. *"The Driver cannot see the Ceiling, so 70 % is meaningless to them."* They do not need the number. They
   need the cue — *this is a good one, take it before someone else does* — and the cue is TRUE, which is
   what separates it from a dark pattern. Drivers are driven by money, not by timing.

**The one objection raised and then dropped:** a badge flipping at exactly 70 % lets a Driver invert their
net fare into the Business's Ceiling (`net ÷ 0.616`), which is the number §6 hides so nobody can compute how
much is left to gain by waiting. Dropped because the exploit only pays off if waiting is safe, and waiting
is only safe in a thin Pool — in the liquid Pool the badge is for, a Driver doing arithmetic loses the trip.
**If it is ever wanted, the fix is three lines: jitter the threshold per mission (65–80 %) off the seed the
curve already uses.** Recorded so it need not be re-derived.

### D84 — The booking screen keeps its wording; the fix for "hotels don't get it" is a tutorial (2026-08-22, S64)

`docs/06` §6 prescribes a sentence the Business screen could safely publish — *"the price rises in steps
until 5 hours before pickup, when it reaches the maximum the Business set"* — and specifies that the
Business should see **"Your maximum cost: €273.67", with the range beneath it**. The form does neither: it
leads with the starting price and says only *"climbs up to your Ceiling, 110,00 €"*.

Four variants were mocked up (D25 loop) — a one-line minimum change, a two-line version, a from→to range,
and §6's own maximum-first shape. **The founder rejected all four:**

> *"I found them technical and to that end a bit confusing, because people are not pros in that new to them
> domain of work. I find the current one simple and enough, they already know the ceiling because they fixed
> it themselves."*

**They are right on the mechanics.** The Ceiling is not hidden — the Business typed it two fields above the
rail, on the same screen. The argument for leading with the maximum was that a hotel might underquote its
Guest by anchoring on the starting price, and that assumed they had forgotten a number they had just entered.

**And right on the diagnosis.** None of the four wordings *teaches* how an auction works; they compress it.
A reader who does not already hold the model gets a denser sentence, not an understanding. Microcopy is the
wrong instrument for a first-principles gap.

**Decided:** the screen ships as it is. **The gap is real and gets a real fix** — an enrolment
tutorial / training that teaches a Business how the pricing works and how to deal with Drivers, built once
V1 is complete. BACKLOG **§ AC**.

⚑ **This is a deliberate deviation from `docs/06` §6, recorded in §6 itself**, so no future session "fixes"
the screen back to the spec and undoes it.

### D85 — § V opens ONE class down, per trip on time-to-pickup, never on the season (2026-08-23, S65)
Founder call across a full brainstorm; **nothing was built — § V was parked as "too early"**. Five things
were settled and should not be re-opened:

**1. One class down, maximum.** *"Only one lower class max!"* First → Business, Business → Eco, and First
**never** reaches Eco. This is not only a simplification: it is most of the fairness fix, because it
permanently protects the Driver with the cheapest car and the thinnest margin from competing against a First
car. ⚑ In SQL this cannot be `category >= category` — the `vehicle_category` enum is declared
`('eco','business','van','luxury')` (`docs/kavenue_schema.sql:19`), so enum order sorts the retired `'van'`
between business and luxury. Use an explicit tier array matching `SERVICE_TIERS` (`lib/vehicle-catalog.ts:18`).

**2. Body type is already correct — no work.** Founder, from the trade: *"a van can do a sedan trip if the
Business books any body type; a sedan cannot do a van trip, for lack of space. If body type matters, they
already choose Any or specify."* Verified in both layers (`app/(app)/pool/page.tsx:125` and the live guard
`docs/migrations/2026-08-22_accepted_fare.sql:101`). The curb is a non-issue for the same reason.

**3. The volume risk to Business Drivers is accepted knowingly** — *"a risk I am willing to take for now and
see feedback from drivers"* — **conditional** on being able to switch it off per Driver. ⚑ That switch does
not exist and is its own build (§ F2, no back-office). Today it means editing a row by hand.

**4. ⚑ THE ORIGINAL RATIONALE WAS INVERTED, BY THE FOUNDER, AND THE NEW ONE IS BETTER.** The 2026-08-15 note
recorded *"it's good in case of low seasons."* In S65 the founder argued the opposite: in a low season there
is not less First work, there is less of **everything**, so a First Driver taking Business work does not
create volume — it moves it downhill, from the cheapest car to the most expensive. **The paradox: the opt-in
is most useful exactly when it is most unfair, and most harmless exactly when it is least needed.**
Season-date windows were considered and **rejected** — the founder spotted that seasons differ by region, so
dates would need geography too, and calendar dates are a blunt proxy for the thing that matters.

**5. The trigger is per-trip, on time-to-pickup.** A trip still pooled near its pickup **is** the signal that
supply is short for that class, at that moment, in that place. Self-adjusting: busy periods fill fast and
never widen; quiet periods rescue trips that would otherwise expire, costing the Business Drivers nothing
because nobody was taking them. The aggregate "detect a struggling class" version is **V2/V3** (§ AF) — not
because it is hard but because it is unmeasurable at 9 Drivers.

**The escalation ladder this creates, and the rule that governs the number:**
`posted → own class only → WIDEN one class up (free) → ask the Business to raise the Ceiling (§ AB, paid) →
expires (§ P)`. **Always pull the free lever before the paid one.** § AB fires at **T−5h**, so § V must fire
before it.

**STILL OPEN: the number.** The founder floated **T−2h**; the one-clock simplification was kept but the
number was argued down on three grounds — it is 3h *after* the curve tops out (running the ladder
backwards); it is past Lock-in (3h auto-confirm), past the check-in window (`CHECK_IN_OPENS_MS` = T−3h) and
inside the ±90-minute slot-conflict band, so it widens into the narrowest audience of the day; and its SPEED
WIN premise no longer holds since [[d82]] removed auto-enabling (a T−2h Business transfer opens at 32,89 €
net with SPEED WIN off vs 69,61 € on, and the ≤5h nudge can be clicked straight past).
**Claude recommended T−6h; not yet accepted.** Verified curve: the fare reaches the Ceiling at exactly
**T−5h** (`TOP_LEAD_MS`, `lib/pdp.ts:43`), and runs **T−24h = 76 % · T−12h = 85 % · T−6h = 95 %** of Ceiling
— all the persuasion happens before T−12h.

**No migration is needed for the timing.** Two in-session claims were wrong and were corrected: `pooled_at`
**already exists** (`docs/migrations/2026-07-13_o7_cancellation.sql:27`, stamped only on RE-pool, NULL on all
280 live rows because the seeders bypass the app), and the "stale draft price" problem **does not exist**
because posting a draft resets `created_at` to now (`app/(dispatch)/dispatch/new/actions.ts:381-384`). So
`pooled_at ?? created_at` already means "when this trip last entered the Pool". § V's only migration is the
Driver opt-in flag plus the matching `accept_mission` guard, **in one commit** with the Pool query and card.

Full design and the open items: `project/BACKLOG.md` § V. [[d81]] [[d82]] · § AB · § AF · § AG


### D86 — The Business takes a trip back at T−2h, and the gate is check-in, not a status nobody reaches (2026-08-24, S66)
The founder's question, verbatim, carried over from S65: *"Is 1 hour too late? Would the business panic
because 1 hour is really tight?"* Brainstormed before any code, as asked.

**The answer was worse than "too late": it was never possible at all.** Both `reclaim_mission` and the button
in `components/trip-row.tsx` were gated on `status = 'accepted'` — a status that has not existed since
Option A / [[d55]] made `accept_mission` confirm immediately. Measured live on 2026-08-24, three ways:

    mission.status          280 rows · 'accepted' = 0
    status_event history    715 rows · 'accepted' = 0
    mission_cancellation      0 rows · the RPC had never once run

So a Business could not take a trip back from a silent Driver by any route, and the card had never rendered
for anyone. Nothing in 499 tests noticed for three months, because a gate that is never satisfied looks
exactly like a feature nobody happens to use.

**1. The gate is now `confirmed AND checked_in_at IS NULL`.** Check-in is the signal that survived [[d55]] —
`checked_in_at` is live and populated on 184 rows, and `checkInOpen()` already read it. `accepted` is not a
state to restore; it is a state to stop referring to.

**2. The window is T−2h** (founder's call, chosen over T−2h30 and T−1h30). Check-in opens at T−3h, so the
Driver keeps a **full hour of grace** before the trip can be taken off them, and a replacement gets **two
hours**. T−60min gave the replacement less time than the drive itself — the default 50 km radius implies
45–75 min on the Riviera, and the ±90min slot band has already excluded any Driver working either side.

**⚑ The measurement that made this cheap.** Median lead time from posting to pickup is **58 hours**, and
**16% of trips are posted inside 3h**. Those short-notice trips auto-confirm on accept and never enter this
flow, so widening the window costs them nothing — the trade only touches the 84% booked with real lead time,
where it is close to pure upside. Worth remembering as a method: the founder's instinct was right, and the
data turned a judgement call into an easy one.

**3. Claude was wrong about the Pool, and the founder corrected it.** A draft of the card said re-pooling
this late mostly fails because "most Drivers are too far away or already booked". The founder: the Riviera
has a very dense concentration of Drivers everywhere, so that is a false assumption. **The argument for T−2h
rests on travel time and the slot band, never on an empty Pool** — and the copy must not imply otherwise.

**4. The card shows from T−3h with its button locked**, naming the unlock time, then goes live at T−2h and
red inside T−1h where the row already escalates. Founder's steer on the copy: *do not tell the Dispatcher
when they MAY act* — an inexperienced one reads that as a process to respect — so the time lives on the
button as the control's own state, not as a sentence. And the card advises **calling first**, because a
Driver who hasn't answered may simply be driving a Guest.

**5. `t60_reclaim` became `reclaim`.** The name would have lied about when it fires. `mission_cancellation`
held 0 rows, so this was the only moment the correction was free.

**Nothing to wire for the event log.** The re-pool's `update mission set status = 'pooled'` already fires the
§ AG trigger, which records it as `repooled` with `source='db_trigger'` — the guaranteed side of the log.

**⚑ Still open, founder-raised, not decided (see BACKLOG § AH):** a Driver who wants out for free can simply
not check in and let the Business take the trip back. Today that costs them one `reliability_marks` point and
nothing else. Whether it should carry the cancellation penalty is the next question.

Migration: `docs/migrations/2026-08-24_reclaim_at_t2h.sql`. [[d45]] [[d55]] [[d61]] [[d82]]

### D87 — The event log records what happens to a TRIP, not what a Driver browses (2026-08-24, S66)
Wiring § AG's app half. The trigger already wrote every committed status transition; eleven types were
declared, registered in the DB as `captured_by='app'`, and written by **nothing**. `log_mission_event()` was
called from nowhere in the codebase. Nine are now wired; **two were deliberately left out**, and that is the
decision worth recording.

**⚑ The founder's question, verbatim:** *"I don't think we should record a driver just checking the pool,
what would be the use for it?"* and then, on being shown the design: *"a driver that looks around the pool
it's just browsing and brings no values to us unless we need to understand like in a shopping website, they
need to understand users behaviour and why do they close or not a purchase, so do we need it?"*

**Claude argued for it once, then conceded.** The honest case: `pool_impression` answers a question Kavenue
cannot answer at all — of 49 expired trips, which were **seen and refused** (price too low) versus **never
seen** (matching broken: category, zone, radius, slot conflict)? Those need opposite fixes.

**Why the founder is right anyway, and this is the part to remember:** the valuable half needs no impressions.
For any expired trip you can ask *"how many Drivers matched its category, zone and radius, with no slot
conflict, at that moment?"* — a **query over data already stored**, not a new firehose (~300 000 rows/day at
200 Drivers × 50 pooled trips). And at nine Drivers a phone call beats a log. § AF deferred aggregate demand
sensing on the same reasoning.

**`mission_viewed` went with it.** Claude tried to keep it — a Driver *opening* a trip is deliberate, not a
page render, and "opened it and didn't take it" is a sharp price signal. The founder asked the clarifying
question that settled it: is this a trip in the Pool or one of their own? It is the Pool — `missions/[id]` is
the pre-accept page. So it is browsing one click deeper, the same category, and it goes too.

**The two that stayed, because neither is browsing:**
- **`accept_rejected`** — a Driver who **tried and was refused by Kavenue's own rules**. If one guard
  dominates, the rule is misconfigured, not the Driver.
- **`contact_revealed`** — who was given a Guest's phone number, and when. A data-access trail for GDPR and
  disputes, on a trip the Driver already holds.

**Two implementation facts that are load-bearing:**
1. **`accept_rejected` MUST be written from the app, after the RPC returns.** `accept_mission` refuses by
   `raise`, and a raise rolls back the transaction — a row written inside it disappears with the very error it
   exists to record. Verified by racing a real accept: the event landed attributed to the Driver who was
   **refused**, while the trigger's `confirmed` row went to the Driver who **won**.
2. **`contact_revealed` is deduped per Driver per trip**, using the table's existing unique `dedupe_key`. It
   fires on a page *render*; a Driver reloading twenty times is one disclosure. Verified: three renders, one row.

**Every app-written row is `source='app'` and best effort, by construction.** Only `db_trigger` rows are
guaranteed, and `isObserved()` is the single gate for that. The helper swallows its own errors on purpose: a
log write that throws would turn *"your check-in worked but we failed to note it"* into *"your check-in
failed"*. The log is a witness, never a participant.

**`checked_in` carries `hours_before_pickup`** — the exact number [[d86]] had to be argued from because
nothing recorded it. In a few weeks the Lock-in window becomes a measurement rather than a judgement call.

Migrations: `docs/migrations/2026-08-24_event_registry_truth.sql` (data only — stop the registry claiming
writers that don't exist). [[d86]] · § AG · § AF

### D88 — The absence of a price is not evidence that the price is fine (2026-08-24, S66)
The §5 floor guard on posting read:

    if (!asDraft && quote && round2(ceiling!) < round2(quote.floor_price))

`quote` is null whenever routing fails, so a **missing** price was indistinguishable from one that **passed**.
The trip posted with no floor check at all — and `pdp_start` fell back to 50 % of the Ceiling in the same
breath, re-opening the auction in the wrong place permanently. A previous session found this while fixing the
`pdp_start` half and wrote it into a comment (*"…skipped in exactly the same breath"*) without closing it.

**Fixed:** a missing quote is now its own refusal (`noprice`), and the floor comparison runs unconditionally.

**⚑ Two claims Claude made to the founder were wrong and were corrected from the code:**
1. *"The common cause is a typed address that wasn't picked from the suggestions."* **No** — posting already
   requires a located drop-off (`nodrop`) and located stops (`nostop`), and a located pickup even for a draft.
   On a POST, no quote means **routing itself failed**. The typed-address path only reaches this on a draft,
   which is lenient by design.
2. *"14 of 280 trips prove this is happening."* **No** — those 14 are seed and legacy rows (June/July, several
   predating the `nodrop` guard). There is **no evidence it has ever fired in production**. The bug is
   **latent**, not leaking: it waits for a Mapbox outage. Still worth fixing, at its real severity.

**⚑ Routing is now retried once before refusing.** Making the guard strict without this would have traded a
silent money bug for a loud availability one — a single transient blip becoming a hotel that cannot book. One
retry kills blips; a real outage still stops at the guard, which is the correct place to stop.

**Found alongside, same family:** `amend/page.tsx` renders `error && ERROR_COPY[error]`, and the amend action
had redirected with `noprice` since it was written **with no copy for that key** — so a Dispatcher whose change
couldn't be priced was bounced back to the form with **no message at all**. A refusal nobody is told about
reads as a broken button. Copy added, and a test now asserts every error key the posting action can emit has a
banner.

**The pattern worth naming, because it has now appeared three times in two days:** a guard that treats
*absence of data* as *absence of a problem*. The § R reclaim gate (`status = 'accepted'`, [[d86]]), the event
log's eleven declared-but-unwritten types ([[d87]]), and this. In each case nothing errored, nothing warned,
and the silence read as success. **Where a check needs a value, missing that value must be a refusal, never a
skip.**

No migration. [[d86]] [[d87]]
