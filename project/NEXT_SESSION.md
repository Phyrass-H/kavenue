# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.
> ⚑ History lives in `project/SESSION_LOG.md` and `project/DECISIONS.md`. This file carries
> only what is TRUE TODAY and what happens NEXT. Rewritten 2026-09-18 at the S83 close.

---

We're continuing Kavenue (B2B VTC booking marketplace).

## 🎯 START HERE — S83 CLOSED 2026-09-18

S83 ruled the first V1 Runway item and built what the ruling gives the Business ([[d147]]):
1. **`unfilled` is ruled — the expiry stands.** Kavenue does not cover an untaken trip from a network (*"I don't have my
   own network, it's the network period"*) and does not phone the Business (*"That is not our job"*). The Business gets
   tools instead.
2. **LIVE and tested by the founder on the Mac:** **Raise the Ceiling** (raise only · only while in the Pool with no
   Driver and no live 15 s hold · the price keeps its place on the climb, top-out time unchanged · every change
   recorded · unlimited — *"it's an auction… remember the FOMO"*) · the **At Ceiling** advice when the price has topped
   out untaken (*"Raise your Ceiling to attract more Drivers"*) · **No car match** when no Driver's car can take it
   (*"No Driver available for this car yet. Try changing the car."*) · **Change the car** (class, body or model; the
   price follows the rate card) · a Driver's accept is refused if the car or a lower net changed under them.
3. **The security sweep ([[d146]]) ran as a parallel session.** Its two migrations are LIVE (pasted 2026-09-18); its
   branch is NOT merged — the founder continues that session in its own worktree right after S83.

### ⏭ FIRST THING
1. Ask the founder what today is ([[wait-for-go-ahead]]). Expected: the security session finishes first (in ITS
   worktree, not here), then **step 6 — Driver analytics by région / city**, which the founder asked to do "properly"
   once the Ceiling work was done. Or the next Runway ruling. **They decide.**
2. Update the V1 Runway with them: `unfilled` is ruled (D147) and `raiseceiling` is built in-app (the in-app advice
   stands in for the notification in V1). S83 did not edit the artifact.

### State
| | |
|---|---|
| `main` | **S83 merged 2026-09-18** (fast-forward of `s83-unfilled`; CI green, deployed by Vercel). S82 before it (`677838e`) |
| NOT on `main` | the security sweep — branch `claude/dazzling-mendeleev-f3a500` (`e1b78ac`, D146): migrations live, code + probes + docs on the branch. Its session merges it |
| applied live | every file in `docs/migrations/` up to and including **`2026-09-18d_mission_read_step_count.sql`**. The four of 2026-09-18 were pasted by the founder in order **18a → 18b → 18c → 18d**. ⚑ An early 18c paste (before 18a) was refused by its own guard — nothing ran |
| live checks, 2026-09-18 | `.local/probe/pooled-trip-changes/check.sql` all pass · the sweep's `rls-audit/check.sql` (run after 18b, before 18c) all pass except `rls_auto_enable()` — **confirmed Supabase's event trigger** (`ensure_rls`, `ddl_command_end`, search_path pinned; cannot be called directly) · read-only probe: PostgREST serves `pdp_step_count`; anon `rpc/raise_ceiling` → 42501 |
| tests | **1336** · tsc clean |
| probes | `.local/probe/pooled-trip-changes/run.sh` (throw-away PG17, the whole live schema): 53/53 cases · check 20/20 · parity 0 mismatches (step counts, Course, floors) · `mutants.sh` 15/15 red |
| in flight | chip `task_78e0da44` "Page the Dispatch schedule's trip read past 1,000" — a separate session. ⚑ It started from `main` BEFORE S83, and S83 rewrote much of `app/(dispatch)/dispatch/page.tsx`: it must rebase on `main` |
| ⚑ `handoff-check.ts` | NOT run since S79. ⚑ It TRIES writes (a `mission_cancellation` insert, a vehicle update, three probe sign-ins). Ask before running it |
| expected red | the seeded live trips age out (`npx tsx .local/seed/seed-live.mts` — it only inserts pooled trips) |

## 🔐 FOR THE SECURITY SESSION — what S83 added to the database (after your 18a / 18b)
Both files start with `begin;` and a guard that refuses unless 18a and 18b are in. Both are in `docs/migrations/` on
`main`. Proof: `.local/probe/pooled-trip-changes/` (its `apply-order.txt` = yours + 18c/18d).

**`2026-09-18c_pooled_trip_changes.sql`**
- column `mission.pdp_step_count smallint` + check `mission_pdp_step_count_range` (null or 8–60). **No grant** to any
  browser role: not insertable, not updatable, and (after your 18a) not selectable on `mission` — browsers read it
  through `mission_read`.
- `pdp_ladder_steps(numeric, numeric, boolean)` and `course_from_business_total(numeric, numeric, numeric)` — invoker,
  immutable helpers; EXECUTE revoked from public, anon, authenticated → `-/-`.
- `raise_ceiling(uuid, numeric)` and `change_trip_car(uuid, vehicle_category, body_type, text, text, numeric)` —
  SECURITY DEFINER, `search_path = public, pg_temp`; EXECUTE revoked from public, anon; granted to authenticated → `-/X`.
  Both check: the caller's Business owns the trip · pooled, no Driver · pickup ahead · no live hold (`outcome = 'open'`
  AND `expires_at > now()`). They write `ceiling` (and for a car change `category`, `required_body_type`,
  `required_make`, `required_model`, `rate_card_id`, `pdp_start`) + `pdp_step_count`, tagging
  `kavenue.write_via` for the log. D144's guard exempts them (they run as the owner).
- `trg_mission_price_terms_log()` — SECURITY DEFINER trigger function, EXECUTE revoked from everyone; trigger
  **`mission_price_terms_log`** AFTER UPDATE on `mission` (pooled → pooled only) writes `mission_event` rows
  `ceiling_raised` / `trip_car_changed` / `price_terms_changed`, audience {business, admin}.
- 3 rows in `mission_event_type` (db_trigger, guaranteed) · index `mission_event_price_terms_idx`.

**`2026-09-18d_mission_read_step_count.sql`** — `mission_read` = **your 18a view exactly** (extracted from `e1b78ac`;
`run.sh` diffs them) **plus one last column** `pdp_step_count`, NULL to a Driver unless the trip is theirs (a Pool
price is computed on the server, `lib/pool-fares.ts`, service role). Same revokes
and `grant select … to authenticated` as 18a; still reads as owner.

**⚑ Your `rls-audit/check.sql` reads FAIL "(not reviewed)" on all of this until you add:**
- `fn_expected`: `('raise_ceiling(uuid, numeric)','-/X')`, `('change_trip_car(uuid, vehicle_category, body_type, text, text, numeric)','-/X')`,
  `('pdp_ladder_steps(numeric, numeric, boolean)','-/-')`, `('course_from_business_total(numeric, numeric, numeric)','-/-')`,
  `('trg_mission_price_terms_log()','trigger')`, and **`('rls_auto_enable()','trigger')`** — plus make `is_trigger`
  also match `'event_trigger'::regtype` (today it counts only `trigger`, so the event trigger reads as callable X/X).
- `trg_expected`: `('mission','mission_price_terms_log')`.
- `col_expected` mission `SELECT (walled)`: add `pdp_step_count` (it sorts after `pdp_start`).
- If you replay: append 18c and 18d to your `apply-order.txt`.
- ⚑ Finding #11 (a Driver can forge the accept fare) is still open. Any SQL port of the price curve must take
  `pdp_step_count` (`lib/pdp.ts` `currentFare`: `m.pdp_step_count ?? stepCount(gap)`).

## 📎 THE V1 RUNWAY — the founder's working list
**https://claude.ai/artifact/Qq32gFCKGJ4hUQQHQTxQbg** (same artifact as `c0f723f7-…`; version 7, 17 Sept) · a copy in
the founder's folder `~/Documents/02_Cactus/Kavenue/Artifacts/KavenueV1Runway.html` (same content). Read it with the
Artifact tool's `read` action before planning — never re-derive it from the docs. ⚑ Ticks: the page's saved state wins
only when it holds MORE ticks than the browser's localStorage, so a browser can show an older set. ⚑ Not yet updated
for S83 (see FIRST THING).

**The open rulings, in the order agreed at the S81 close:**
1. ~~`unfilled`~~ — **ruled S83 (D147)**
2. **`penalty` + `checkin` + `reliability`, together** — a Driver who lets a trip down: who receives the cancellation
   money and how much · whether a Driver who goes silent pays anything when the Business takes the trip back ·
   whether a Driver sees their own reliability marks
3. `funnel` — record "started" / "abandoned" on the Business's booking form (unrecoverable later, [[record-every-event]])
4. `vetting` (a Business approves the Driver before confirm) · `waitstop` (waiting at a middle stop) · `airportbadge`
   (by class) · `speedwin` (final name) · `exception` (a class above First)
- Waiting on something else: `monacowindow` (the founder's visit to the Monaco authority) · `logo` · `owner` (not the
  booking flow). `raiseceiling` is built in-app (S83); a push notification for it still waits on the integrations phase
  ([[phase-features-before-apis]]).

### ⚑ S83 LESSONS
1. ⚑⚑ **A paste file must refuse the wrong order.** `begin;` then a `do $$ … raise exception … $$` guard naming the file
   to paste first. The founder pasted 18c first; it said so and changed nothing.
2. ⚑⚑ **An RPC whose errors differ per trip is an oracle.** The review found the Driver accept guard answering for ANY
   trip id; it now reads the caller's own `mission_read` first. Check "what does a refusal reveal?" on every new door.
3. ⚑ **Money that must equal SQL `round(…, 2)` is computed in integer cents in TypeScript** (`lib/rate-card.ts`
   `exactFloorAllIn`). Floats disagreed by a cent on 928 of 36 000 floors (half cents).
4. ⚑ **A new `mission` column is walled from browsers on every side after 18a** — no SELECT, INSERT or UPDATE grant.
   Read it through `mission_read` (and mask it where it must not travel), write it through a DEFINER RPC, and add it to
   the sweep's `check.sql` lists. Only if the booking form writes it: one of `lib/draft-resume.ts`'s two lists
   (`pdp_step_count` is in neither — nothing posts it).
5. ⚑ **The sweep's `rls-audit/check.sql` flags every new object "(not reviewed)" on purpose.** A migration that adds a
   function, trigger, policy or column adds its line there in the same commit.
6. ⚑ **The founder's copy asks, S83:** less text · no "everything in" (*"no need they know"*) · two short lines instead of
   a formula (*"the math explanation is confusing"*) · warnings generic (*"simpler and more generic"*). And Drivers do
   not wait for a higher price — it is an auction ([[auction-fomo-drivers-dont-wait]]).
7. The desktop app's Run button on `npm run test-app` says *"Couldn't send the command's output to Claude"* — harmless:
   the command never ends. Read the Terminal tab with `read_terminal`.

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
- **The founder's call from S83:** sweep finding #11 (a Driver can forge the accept fare), with the security session.
  (The other one is decided: a car change MAY lower the Ceiling — D147 item 3, founder 2026-09-18.)
- "At Ceiling" / "No car match" show only on the Dispatch schedule (where the fleet check runs); the calendar, edit and
  amend pages still say "In the Pool" for such a trip.
- A millisecond window remains on a direct accept (the Driver's price check reads, then the RPC runs); the RPC's own
  checks still hold.
- `/dispatch` re-renders every 4 s (`components/live-refresh.tsx`) and runs ~10 database reads one after another
  (~110–150 ms each from the Mac): about 3 s a render in dev. S83 added one parallel round. Watch it if the page
  feels slow; batching the reads would help.
- The admin header scrolls sideways below ~641px wide (567px before the Vehicles link). The console is used on the Mac.
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
**The security session** (its own worktree, the founder's next move) → then **step 6 — Driver analytics by région / city**
(the founder, S83: finish the Ceiling work, *"then go back to step 6 to finish properly"*) · or the next Runway ruling
(`penalty` + `checkin` + `reliability`). Ask.

⚑ **Step 6 can stand on S78–S81's pieces:** the brainstorm's core is "based here" vs "can reach here" (Monaco: 1 based,
10 can reach it); counts always, a percentage only from 20 trips, the state on the row. Reuse `baseTownOf`,
`admin_vehicle_overview`'s census shape (supply today, demand by pickup date), `readAll`, the `.adm-apv` table and
`components/admin-approval-cell.tsx`. S83 adds `lib/fleet-fit.ts` `nobodyFits` (can ANY approved car reach and fit this
trip — class, body, specific car, base + radius). Still NOT recorded: whether any car could have REACHED a trip nobody
took. The history it needs starts 2026-09-12, and busy slots cannot be rebuilt (D142, parked).

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
- **When nobody takes a trip** — [[d147]]: the expiry stands; no network cover, no phone call. Raise the Ceiling (raise
  only · Pool, no Driver, no live hold · same place on the climb, top-out time unchanged · every change recorded ·
  unlimited) · the At Ceiling advice · No car match · Change the car (its own tile, not inside Edit details). The price
  never dips on a raise (`pdp_step_count` frozen on the first change).
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
