# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.
> ⚑ History lives in `project/SESSION_LOG.md` and `project/DECISIONS.md`. This file carries
> only what is TRUE TODAY and what happens NEXT. Rewritten 2026-09-17 at the S81 close.

---

We're continuing Kavenue (B2B VTC booking marketplace).

## 🎯 START HERE — S81 CLOSED 2026-09-17

S81 shipped step 5 and moved the work onto the founder's V1 Runway:
1. **/admin/vehicles is live** ([[d142]]) — cars that can work today against the period's trips, by class × body
   ("Any body" its own row); rows in the Drivers table's words; a search that also finds replaced cars. The founder
   pasted `2026-09-14_admin_vehicles.sql`; `vehicle-find.mts` 33/33.
2. **The admin-door follow-up closed with NO change** ([[d143]]) — the case can no longer arise.
3. **The V1 Runway was checked against the code** — 3 items ticked, 11 rewritten, republished. The founder chose to
   work through its **rulings**, starting with **`unfilled`: what a Business is promised when nobody takes the trip.**

### ⏭ FIRST THING
1. Ask the founder what today is ([[wait-for-go-ahead]]). Their chosen thread is the `unfilled` ruling, explained to
   them at the close (below). **They decide; nothing is built until they do** — and a preview before any UI.

### State
| | |
|---|---|
| `main` | S81 merged 2026-09-17 (`6611f6e`), CI green; admin.kavenue.fr/admin/vehicles answers 307 → the admin sign-in |
| `s81-handoff` | D143 + this close, merged to `main` 2026-09-17. ⚑ git broke mid-close (Xcode license); the founder ran `sudo xcodebuild -license accept` |
| applied live | every file in `docs/migrations/` up to and including `2026-09-14_admin_vehicles.sql` |
| applied live, S82 | BOTH write-lock files, pasted by the founder 2026-09-17: `2026-09-17_mission_client_writes.sql` ([[d144]]) and `2026-09-17b_mission_read_is_read_only.sql` ([[d145]]). ⚑ `.local/probe/mission-client-writes/check.sql` reads ALL PASS on the live database (the 1 FAIL after (a) is what found (b)) |
| ⚑ a resumed draft is still broken live | until the draft-resume code fix ships (branch `claude/adoring-hertz-85d28e`, S82 parallel). Broken since 2026-09-04, NOT by these files: the deployed resume still sends columns a browser may not write. New posts, the info edit and everything else are unaffected |
| tests | **1275** |
| probes | `vehicle-find.mts` 33/33 (S81, 1 skip: no replaced car) · `car-gate.mts` 20/20 · `never-twice.mts` 5/5 · `driver-find.mts` 15/15 (S79) |
| ⚑ `handoff-check.ts` | NOT run in S81 (107 at S79). ⚑ It TRIES writes: a `mission_cancellation` insert the CHECK should refuse (deleted only if it got through), a vehicle update it expects refused, and three password sign-ins as probe accounts (auth sessions). Ask before running it |
| live, measured S81 (2026-09-17) | 14 Drivers · 14 cars, 0 replaced · 385 trips · 66 Driver papers · 2 cars can work (the two probe Drivers' Business sedans); the other 12 wait for approval |
| expected red | the seeded live trips age out (`npx tsx .local/seed/seed-live.mts` — it only inserts pooled trips) |

## 📎 THE V1 RUNWAY — the founder's working list
**https://claude.ai/artifact/Qq32gFCKGJ4hUQQHQTxQbg** (same artifact as `c0f723f7-…`; version 7, 17 Sept) · a copy in
the founder's folder `~/Documents/02_Cactus/Kavenue/Artifacts/KavenueV1Runway.html` (same content). Read it with the
Artifact tool's `read` action before planning — never re-derive it from the docs. **3 / 59 done · 28 left before a real
booking · 14 decisions.** ⚑ Ticks: the page's saved state wins only when it holds MORE ticks than the browser's
localStorage, so a browser can show an older set.

**The 14 open rulings, in the order agreed at the S81 close:**
1. **`unfilled`** — what a Business is promised when nobody takes the trip ← **NEXT**
2. **`penalty` + `checkin` + `reliability`, together** — a Driver who lets a trip down: who receives the cancellation
   money and how much · whether a Driver who goes silent pays anything when the Business takes the trip back ·
   whether a Driver sees their own reliability marks
3. `funnel` — record "started" / "abandoned" on the Business's booking form (unrecoverable later, [[record-every-event]])
4. `vetting` (a Business approves the Driver before confirm) · `waitstop` (waiting at a middle stop) · `airportbadge`
   (by class) · `speedwin` (final name) · `exception` (a class above First)
- Waiting on something else: `raiseceiling` (needs notifications — after features, [[phase-features-before-apis]]) ·
  `monacowindow` (the founder's visit to the Monaco authority) · `logo` · `owner` (not the booking flow)

### The `unfilled` ruling — as explained to the founder
- **Today:** a posted trip's price climbs from its start price to its Ceiling, which it reaches at T−5h — or halfway to
  pickup for a trip posted inside 5 hours (`lib/pdp.ts` `topLeadFor`). From T−3h the Business's schedule row warns
  *"No Driver yet"*. If nobody accepts, the trip expires at its pickup time (D62, `expire_stale_missions`) and the row
  reads *"Unfilled"* — *"No Driver accepted it before the pickup time."* — with *"Not taken"* in the fare cell
  (`lib/dispatch-status.ts` `expiredTone`, the founder's word, D63). No notification is sent.
  ⚑ S81 told the founder "Expired · Was not filled in time" — a stale comment in `app/(dispatch)/dispatch/page.tsx` — and
  corrected it in chat.
- **No V1 rescue step:** widening the class is V3 (BACKLOG § V, founder), the "raise your Ceiling" ask waits on
  notifications (§ AB), and a posted trip's Ceiling cannot be edited.
- **Admin:** the Activity finding `trip_nobody_can_take` (`lib/activity-findings.ts`) flags a pooled future trip that
  NO Driver in the fleet is able to take. Nothing flags a trip Drivers could take but haven't, as pickup nears.
- **The runway's options:** (a) cover it from the founder's own network · (b) ring the Business in time for them to find
  someone · (c) let the expiry stand. (a) and (b) both need a person to know in time — a "trip at risk" finding in the
  Activity console needs no notifications. The founder decides the promise first; the build follows it.

### ⚑ S81 LESSONS
1. ⚑⚑ **Before designing a fix, ask whether the case can still happen** ([[ask-if-case-still-happens]], D143). Three
   options were built for a stale cookie the S80 fix had already made impossible; the founder's plain question found it.
2. ⚑⚑ **When a page cannot run live, render the REAL page, not a redrawn mock-up.** S81 rendered
   `app/admin/vehicles/page.tsx` itself with `react-dom/server` (in S81's session scratchpad — NOT kept, rebuild it): a `tsconfig.json`
   (`jsx: react-jsx`, `baseUrl` = the repo, `paths` sending `@/lib/supabase/server` to a stub client that follows the SQL
   over rows read read-only, and `@/lib/supabase/client` + `next/navigation` to stubs, before `@/*`), a `node_modules`
   symlink to the repo's, `globalThis.React = React`, and `npx --offline tsx --tsconfig <it> render.tsx`. It showed the
   truncated model names the mock-up had hidden.
3. ⚑ **`mission_read` returns 0 rows to the service role** — its WHERE is on `app_role()` / `current_*_id()`. A
   read-only script reads the `mission` TABLE with named safe columns (never a money column).
4. ⚑ **A probe is not automatically read-only.** Grep for writes before running one (see `handoff-check.ts` above).
5. ⚑ **Layout defects were found only by MEASURING with the real CSS and Geist**, in headless Chrome at several widths
   (a Person cell 38px into Company; a pill under the wrong edge at 861–940px). Keep that step in every UI review.
6. ⚑ `git` and `python3` are Apple shims that stop when the Xcode license lapses; `node` kept working.
7. ⚑ **Resizable, Excel-style columns:** recommended not now (one narrow column; client JS and saved widths; it would
   split the Drivers/Vehicles table look). The model name wraps instead. The founder may raise it again later.
8. ⚑⚑ **Quote screen words from the code that RENDERS them, never from a comment.** S81 told the founder a trip nobody
   took reads "Expired · Was not filled in time" — a stale comment; the screen says "Unfilled" (D63). A handoff check of
   read-only agents caught it, with 13 other loose claims in these notes.

**Still true from S79–S80:** an unbounded select stops at 1 000 rows without an error (`readAll`) · a failed read draws
"unread", never confident facts · a throw-away Postgres needs TCP and `encoding 'UTF8' template template0` · review
workflows of read-only agents keep paying (S81: 12 findings → 8 real, then 5 more on re-check) · never sign in as admin
through `/api/dev-login` · a question is not a task — answer first ([[wait-for-go-ahead]]).

### ⚑ LEFT OPEN — none blocks
- The admin header scrolls sideways below ~641px wide (567px before the Vehicles link). The console is used on the Mac.
- A stale comment at `app/(dispatch)/dispatch/page.tsx:152` still says the Business sees "Expired · Was not filled in time"
  (the screen says "Unfilled" since D63) — it misled S81; fix it on the next branch that touches that file.
- `2026-09-13d_admin_driver_find.sql` was edited after it was applied (S79). Run `npx tsx .local/probe/driver-find.mts`
  (read-only): if "an email holding digits…" is red, re-paste 13d — it is safe to re-run.
- Supabase's built-in mailer hit "email rate limit exceeded" (2026-09-14). The lasting fix is Resend — integration
  phase, the founder's call.
- **Adding a second admin:** create the account in the Supabase dashboard, give it a `profile` row with
  `role = 'admin'`; they sign in at admin.kavenue.fr. V2: a master admin (BACKLOG § AL — which now also names the one
  case D143 left: an admin whose role is removed while signed in).
- **V2: a `document_event` log** — a second verdict on a paper overwrites the first (§ AK).
- The 11 Drivers verified before 2026-09-12 have no `verified_at` — left alone on purpose.
- `fold_text` folds only Latin-1 accents plus œ/æ (French, Spanish, Portuguese); Ş Ğ ı Ă Ș Ț Ł are not. A pasted
  80-character term cut mid-emoji makes the search RPC fail: /admin/drivers then blames the 13d migration, /admin/vehicles
  says "admin_vehicle_find couldn't be read".
- "Vehicle" vs "Car": the tab is "Vehicles", a Driver's page tile says "Vehicle", the table columns and pills say "Car".
- An "Everyone" row still prints the base label's first part ("Pl. du Casino") — the founder said not to touch it.
- **Surfaced by the Runway check, worth knowing:** replace the Mapbox token WITHOUT a URL restriction (the servers call
  Mapbox with no Referer); the Business side has no Kbis review screen and no `business.verified` (queued, deferred
  twice); a Driver's REVTC, card and VAT numbers are not shown on /admin/drivers/[id] (table editor only).

## 🔜 WHAT IS NEXT
~~step 5~~ **shipped S81** · **the Runway rulings, starting `unfilled`** (the founder's choice, 2026-09-17) · **step 6**
Driver analytics by région / city — not rescheduled; ask the founder where it sits against the rulings.

⚑ **Step 6 can stand on S78–S81's pieces:** the brainstorm's core is "based here" vs "can reach here" (Monaco: 1 based,
10 can reach it); counts always, a percentage only from 20 trips, the state on the row. Reuse `baseTownOf`,
`admin_vehicle_overview`'s census shape (supply today, demand by pickup date), `readAll`, the `.adm-apv` table and
`components/admin-approval-cell.tsx`. Still NOT recorded: whether any car could have REACHED a trip nobody took. The
history it needs starts 2026-09-12, and busy slots cannot be rebuilt (D142, parked).

## ⚑ TRAPS FROM S78 — each nearly shipped

1. ⚑⚑ **`create function` grants EXECUTE to PUBLIC.** Revoking from `authenticated` does NOT
   remove it. A SECURITY DEFINER function taking a driver id from its caller was callable by
   every signed-in session. Third time this shape has appeared (2026-08-31d/e). On every SECURITY
   DEFINER function that reads data, `revoke … from public` and check with `has_function_privilege`. ⚑ NOT on an
   index-expression helper such as `phone_key` (D138 rule 5): revoking it makes every phone save a 42501.
2. ⚑⚑ **RUN A MIGRATION BEFORE HANDING IT OVER.** A throw-away Postgres 17 on this Mac
   (`/opt/homebrew/opt/postgresql@17/bin`; ⚑ `initdb --locale=C` and `LC_ALL=C`, or the server
   will not start; ⚑ then create the test database with `encoding 'UTF8' template template0` — C locale defaults to
   SQL_ASCII, where `translate()` works on bytes and a text search can pass falsely) plus a stand-in schema found: `replace_vehicle` inserting before retiring (a
   partial unique index is per-statement and cannot be deferred, so EVERY car change would have
   failed); `min(uuid)` does not exist, so the corrected backfill would not have applied at all;
   and a spurious change-log row. None of it was visible by reading. (S81 did it again: 89/89, with 9 broken copies
   of the migration each turning it red.)
3. ⚑⚑ **A form posts everything it renders.** The luggage opt-in lives in the car form, so
   ticking it retired the approved car and shut that Driver's Pool. Compare before you write.
4. ⚑ **`mission_read` is an explicit column list.** A column added to `mission` and not to the
   view is invisible — and the Waybill, which names its columns, 404s. The gate now finds the
   NEWEST file containing a full rebuild rather than naming one.
5. ⚑ **`group by a.id, b.id` on two primary keys makes `having count(*) = 1` a no-op.** It
   looked like a guard and eliminated nothing.
6. ⚑ **The service role bypasses RLS, not TRIGGERS.** Every seed that assigns a Driver to a trip
   now needs that Driver's car approved; every seed that inserts a car writes `approved` — except
   `seed-test-driver.mts`, whose car (Théo's) is `pending` on purpose, and nothing gives Théo a trip.
   ⚑ And (S80) a service-role UPDATE that does not set `last_written_by` / `last_written_via` hands the change log the
   PREVIOUS writer as its actor — every write path must stamp both.
7. ⚑ **A subagent told to be read-only wrote to the live database** — it believed a migration
   was unapplied when it was applied. It restored and reported; audited after, unchanged. When a
   probe's behaviour depends on schema state, make it CHECK the state, never assume it.

## 🔒 DECIDED — do not re-open
- **The Vehicles page** — [[d142]]: supply = `mayTakeWork`, counted today; a period counts trips by PICKUP date; "Any
  body" its own row; car rows are D140's table; amber = cars to approve only ("person not approved" and "refused" stay
  neutral); search finds replaced cars ("Replaced by <plate> · <date>"); no insurance tag. The model name wraps onto two
  lines (founder, 2026-09-17, *"make 2 lines"* — not in D142's text).
- **A signed-in non-admin at the admin console: no change** — [[d143]]. Revisit only with BACKLOG § AL.
- **Car approval, all six rules** — [[d137]]: three approvals (person, company, vehicle); a
  change replaces the car (one car per Driver in V1, multi-car is V2); history frozen; never twice at signup; giving a
  trip away goes through support; everything surfaces in the Activity console.
- **"To be approved" is a table, and admins read "documents needed"** — [[d140]]: one column per approval; a done
  Person still says what is owed; no "Waiting" column until a document history exists; titles restyled on
  /admin/drivers only; "Everyone" keeps its pills.
- **The admin door** — [[d141]]: never creates an account; one neutral sentence before the link; "no admin access"
  only after it, to the mailbox's owner; an unreadable role says it could not check.
- **Sign out of the admin console = the email opens a card** (founder's pick, S80).
- **The admin home: numbers on top, findings underneath** (founder, S74, confirmed twice).
- **Every existing car starts pending** (founder: *"yes and yes"*).
- **Monaco is named as a country** · **no invention** (a row with nothing to derive from is left
  alone and named) · **the age rule is information, not a gate** · **plate-lookup API: not now**
  (licence law — `project/research/2026-09-11_plate_lookup_and_car_data.md`).
- **`driver.operational_zones` decides nothing** — matching is base + radius (`lib/geo.ts`).
- **Accept is `rpc('accept_mission_call')`**, never the raw name.
- **Bags: no capacity analytics** — Drivers make it work, and the guided mission form is the
  prevention.
- **The support console IS the Activity console** for now; split it when it hurts. "Kavenue Admin" is the admin
  sign-in page, "Kavenue" in the console header, and its first tab "Activity"; the web address admin.kavenue.fr is fine
  (founder: *"not urgent"*).
- **BACKLOG § AJ** — train the support team to check papers (founder, *"put it on the side"*).

## 🧪 HOW THE FOUNDER TESTS — settled 2026-09-09

**On the Mac. Not on a phone. Not on the live site.** One command:

    npm run test-app        # stops this project's own dev server if running, pins port 3000, opens /dev-login in the default browser (Safari on this Mac)

⚑ `localhost` needs no key — `/dev-login` is two buttons (Business, Driver). **The admin signs in at
`http://localhost:3000/admin`**, which sends to the admin door (`/login?side=admin`) and a magic link to
`admin@kavenue.fr` — so ⚑ Sign out means asking for a new link, and ⚑ open the link in the SAME browser window that
asked for it. The console's tabs: Activity · Drivers · **Vehicles** · Businesses · Trips. ⚑ One browser window = one
role; a Safari Private Window (⌘⇧N) holds a second, independent session. Others: `npm run test-driver` (resets Théo —
⚑ his car now comes back **pending**, on purpose) · `npm run dev:lan` · `npm run dev`.

⚑ **`npm run build` clobbers a running dev server's `.next`** → `Cannot find module
'./vendor-chunks/…'`. Stop the server, `rm -rf .next`, restart.

## ⚑ STANDING HAZARDS
- **Dev and prod share ONE Supabase project.** A migration is live for `main` the moment it is
  pasted. Code and constraint ship together, in that order.
- **The project lives inside iCloud Drive** (`~/Documents/02_Cactus` is the same inode as the
  one under `Mobile Documents`). `realpath` does not reveal it; `dev-guard.mts` warns each run.
  Untouched — moving the founder's folders is their call.
- **The repo is PUBLIC** (`Phyrass-H/kavenue`). Grep before committing anything previously
  ignored; a leaked secret is rotated, never edited out.
- **`pickup-marketplace.vercel.app` still serves the production build** — founder's call,
  `BACKLOG § AD`, do not re-raise.
- **`DEV_LOGIN_KEY` / `DEV_PASSWORD` are deleted from Vercel** (founder, 2026-09-09) and
  `next.config.mjs` throws on a production build carrying `DEV_LOGIN_KEY` (not on `DEV_PASSWORD` alone). Read that file before advising
  anything about env vars.
- **Pushing `main` deploys the live site** (Vercel) — admin.kavenue.fr included.
- **The Xcode license can lapse** (after a macOS / Xcode update) and take `git` and `python3` with it — the founder's
  `sudo xcodebuild -license accept` fixes it.

## ⚑ THE WORKING AGREEMENT
**Answer a question before acting on it.** Ask before starting substantial work. Show a preview before building UI
(unless the founder says no need) — built from the real page code where possible. Keep `SESSION_LOG.md` (technical)
and `CHANGELOG.md` (plain language, founder-facing) current as you ship. Develop on a branch, CI-green, then `main`.
Never open a PR unless asked.
