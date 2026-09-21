# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.
> ⚑ History lives in `project/SESSION_LOG.md` and `project/DECISIONS.md`. This file carries
> only what is TRUE TODAY and what happens NEXT. Rewritten 2026-09-21 at the S84 close.

---

We're continuing Kavenue (B2B VTC booking marketplace).

## 🎯 START HERE — S84 CLOSED 2026-09-21

S84 closed the **1 000-row cap** on the Business side, end to end. PostgREST stops an unbounded `.select()` at 1 000
rows and **reports no error** (measured here 2026-08-30: `mission_event` returned 1 000 of 2 503). Six reads relied on
that never happening. **Nobody was near it** (busiest Business measured at 271 trips), so no figure anyone has seen was
ever wrong — this was a wall built before someone walked into it.

1. **`lib/paged-read.ts`** — `readAllPages` (throws on a failed page) · `readAllPagesSoft` ({rows, failed}, logs) ·
   `readByIds` (batches of 200; an `.in(<ids>)` list ERRORS at 398, it does not truncate). Every paged query ends its
   ORDER BY on a **unique column** — OFFSET paging over a non-unique sort loses one row and repeats another.
2. **Paged:** the Schedule and its five side reads · History · Spend · both CSV routes · Drafts. Both CSVs now return
   **503 with no file** rather than write a short or Driver-less one. Spend's body is gated on `!error` (it used to
   draw `0,00 €` and **−100 % vs last month** off an unread archive). A failed Driver read says **"not loaded"** on the
   row — in the column AND in the open row.
3. **Merged: PR #4 → `main` `8f2a49d`** (2026-09-21 07:56 UTC), CI green, deployed. `docs/migrations/2026-09-20_paged_read_indexes.sql`
   **pasted live**; `.local/probe/paged-reads/check.sql` reads **5/5 pass**.

### ⏭ FIRST THING
1. **Ask the founder what today is** ([[wait-for-go-ahead]]). At the S84 close they said: **"I have to work on the
   landing page"**, and the Schedule redesign is **parked** (see `project/IDEAS.md`, "The Schedule's shape").
   ⚑ The landing site is its OWN repo, not this one — the brief is `project/LANDING_HANDOFF.md` (written 2026-08-04;
   read it before touching anything, and check its claims against today's product, e.g. S83's raise-the-Ceiling).
2. ~~Decide the unpushed glossary branch~~ — **done, merged as PR #6** (below).

### ⚑ The glossary sweep landed — `PR #6`, 2026-09-21 08:24 UTC
`claude/peaceful-turing-7035de` (the [[d99]] sweep, from one of the two sessions ended on 2026-09-20) was merged into
`main` as `066d55e` after this file first recorded it as unpushed. Verified on `main`: `app/(app)/rides/page.tsx:303`
now renders *"Waiting on the Business"*, and every remaining "the hotel" in the code is either a comment stating the
rule or a real hotel (the Negresco, in the address-autocomplete notes). It also brought
`tests/glossary-copy.test.ts`, which fails the build on a new bad string. **Nothing is left to do on it.**

### State
| | |
|---|---|
| `main` | **066d55e** — the glossary sweep (**PR #6**, 2026-09-21 08:24 UTC) on top of S84's paging (**PR #4**, `8f2a49d`) and this session's close (**PR #5**). Before them: PR #2 (`1cb6c5c`, the security sweep) 2026-09-18, PR #3 (`9c1a902`) |
| ⚑ pushing `main` | **REFUSED** — branch protection requires the check `types · tests · build` on a PR. "Merge it to main" = push the branch, `gh pr create`, `gh pr checks <n> --watch`, `gh pr merge <n> --merge` |
| NOT on `main` | only `origin/claude/new-session-xa2aop` — 1 commit, 2026-08-08, adds a `test/` directory the repo no longer has (tests live in `tests/`): **stale, delete it** |
| local `main` | 5 behind origin; the main checkout is parked on `s83-unfilled` (`0532d9d`), clean. 7 worktrees, all clean but `charming-mayer-bae0a3` (one untracked `.local`, detached HEAD) |
| applied live | **every file in `docs/migrations/`, up to and including `2026-09-20_paged_read_indexes.sql`** (pasted 2026-09-21; `.local/probe/paged-reads/check.sql` 5/5 `pass`). Before it: 18a → 18b → 18c → 18d, then 18e (2026-09-19) |
| tests | **2186** across 63 files, measured on `main` after PR #6 (S84 alone was 1390; the glossary branch claimed 2129 on its own base — the merged figure is neither, which is why it is re-measured, never added) · `tsc --noEmit` clean · `next build` clean |
| probes | `vehicle-find.mts` 33/33 · `car-gate.mts` 20/20 · `never-twice.mts` 5/5 · `driver-find.mts` 15/15 · `pooled-trip-changes/run.sh` 53/53 · `rls-audit/check.sql` all pass/info |
| ⚑ `handoff-check.ts` | NOT run since S79. ⚑ It TRIES writes (a `mission_cancellation` insert, a vehicle update, three probe sign-ins). Ask before running it |
| live, measured | 271 trips at the busiest Business (2026-08-23) · `mission_event` 2 569 rows (2026-09-03) · `mission` 377 rows |
| expected red | the seeded live trips age out (`npx tsx .local/seed/seed-live.mts` — it only inserts pooled trips) |

## 📎 THE V1 RUNWAY — the founder's working list
**https://claude.ai/artifact/Qq32gFCKGJ4hUQQHQTxQbg** · a copy in `~/Documents/02_Cactus/Kavenue/Artifacts/KavenueV1Runway.html`.
Read it with the Artifact tool's `read` action before planning — never re-derive it from the docs.
⚑ **It is stale in three ways** (masthead still "updated 17 September"): `unfilled` is ruled ([[d147]]) and
`raiseceiling` is built in-app, neither is ticked; and the `unfilled` body still says *"a Business cannot raise a
posted trip's Ceiling"*, which S83 made false. Update it WITH the founder.
⚑ Ticks: the page's saved state wins only when it holds MORE ticks than the browser's localStorage.

**The open rulings, in the order agreed at the S81 close:** ~~`unfilled`~~ **ruled S83** · **`penalty` + `checkin` +
`reliability`, together** ← next up · `funnel` (record "started"/"abandoned" on the booking form — unrecoverable later,
[[record-every-event]]) · `vetting` · `waitstop` · `airportbadge` · `speedwin` · `exception`. Waiting on something else:
`monacowindow` · `logo` · `owner`.

### ⚑ S84 LESSONS
1. ⚑⚑ **Paging turns a snapshot into a window.** One request sees one instant; N requests see N. Both CSV routes built
   `new Date()` INSIDE the paged callback, so the "past" boundary walked forward between pages: a trip that became past
   in the gap sorts to the TOP of a DESC result, shifts every offset, and the boundary rows are written **twice** —
   into a file with a Total row. One request had made that impossible; paging created it. Compute the clock ONCE, above
   the loop. The tie-break `.order("id")` fixes ties between pages; it cannot fix a boundary that moves.
2. ⚑⚑ **A screen that computes from an empty array states a confident falsehood.** `spendTotals([])` renders a
   complete, plausible, entirely wrong page. Gate the BODY on the read, not just the notice.
3. ⚑⚑ **Prove a pager with a SMALLER page, not more rows.** `PAGE_ROWS` forced to 25 turned the 169-trip demo Business
   into a 7-page read against the real database — identical totals to the cent. No seeding, no throw-away Postgres.
   ⚑ But it cannot catch a race: the moving clock was found by READING the diff, not by running it.
4. ⚑ **Fix a failed-read state in every place the screen states it.** The first cut said "not loaded" in the Driver
   column and "No Driver assigned" one click below. `tests/paged-call-sites.test.ts` now counts both.
5. ⚑ `readAll` (`lib/admin-list.ts`) fails OPEN — a failed page reads as the last page. That is why `lib/paged-read.ts`
   is a second helper and not a reuse; the reason is in both file headers.
6. ⚑ **A source-scan test is the only guard for this class of fault** (`tests/paged-call-sites.test.ts`, in the idiom
   of `tests/event-wiring.test.ts`): it lists every paged call site, its tie-break column, and refuses a `new Date()`
   inside a paged callback. Mutation-checked — deleting a tie-break turns it red.

### ⚑ LEFT OPEN — none blocks
**From S84, with exact pointers:**
- ⚑ **The admin console's pager fails open.** `readAll` (`lib/admin-list.ts:261`) does not even take `error` in its
  signature: a failed page returns null data and reads as the end. **20 call sites** (16 in `lib/admin-activity.ts`,
  2 in `app/admin/trips/page.tsx`, 1 each in `app/admin/drivers/page.tsx`, `app/admin/vehicles/page.tsx`); only the two
  document reads hand-roll a guard. Start with the two `mission_cancellation` reads (`lib/admin-activity.ts:199`,
  `app/admin/trips/page.tsx:85`): a failed page there does not under-count, it **names every cancelled trip as
  unrecorded** under "Cancelled trips with no record of who cancelled them, or why."
- ⚑ **14 of those 20 page with NO `.order()`** — unstable across pages. `countOrphanedEvents`
  (`lib/admin-activity.ts:393-396`) pages `mission_event` (2 569 rows) three times unordered. ⚑ **Its number is right
  today** (0 orphans, `mission` is one page) — it breaks when either changes, so fix it, but do not tell the founder a
  number is wrong. The `repooled` read (`:207`) is the sharp one: it accuses at n≥2
  (`lib/activity-findings.ts:414-421`), so one duplicated row is a **false accusation**.
- **The Schedule runs six reads one after another** (`app/(dispatch)/dispatch/page.tsx:235, 266, 287, 311, 341, 348`)
  before the existing `Promise.all` at `:373`. Only two need `missions` (the Driver batch, `noCarMatch`); the rest are
  Business-scoped (and `rate_card` is global). Folding them in turns seven sequential steps into two on a screen that
  re-reads every 4 s. ⚑ Keep `sweepExpiredMissions` (`:180`) ahead of the trip read, and keep the
  `missionIds.length > 0` guards (`:265, 283, 310, 347`) by building the array conditionally. ⚑ `loadDriverWalks`
  (`:341`) has **no** guard today — it runs on every refresh, empty schedule or not.
- **At real volume, push the period into the QUERY** on Spend and History, as `app/(app)/earnings/page.tsx:52-62,
  213-217` already does. ⚑ It costs three cheap extra queries to stay honest: a LIMIT-1 row for the date-picker floor
  (both pages take it from the LAST row today), a `{ count: "exact", head: true }` for History's "of N"
  (`history/page.tsx:270`) and its "No past missions yet." gate (`:227`), and four head counts for the class dropdown.
  ⚑ Do **Spend first** — it always has a period; History defaults to "any date" (`lib/history-filter.ts:66-69`) and its
  search spans the whole archive (Guest, Driver, reference, address, flight, plate, class), so a period would silently
  narrow it.
- The pages still print the database's own wording in their red notice (pre-existing). The CSVs no longer do.

**Still open from before:**
- "At Ceiling" / "No car match" show only on the Dispatch schedule; the calendar, edit and amend pages still say
  "In the Pool" for such a trip.
- A millisecond window remains on a direct accept (the Driver's price check reads, then the RPC runs); the RPC's own
  checks still hold.
- The admin header scrolls sideways below ~641px wide. The console is used on the Mac.
- `2026-09-13d_admin_driver_find.sql` was edited after it was applied (S79). Run `npx tsx .local/probe/driver-find.mts`
  (read-only): if "an email holding digits…" is red, re-paste 13d — it is safe to re-run.
- Supabase's built-in mailer hit "email rate limit exceeded" (2026-09-14). The lasting fix is Resend — integration
  phase, the founder's call.
- **Adding a second admin:** create the account in the Supabase dashboard, give it a `profile` row with
  `role = 'admin'`; they sign in at admin.kavenue.fr. V2: a master admin (BACKLOG § AL).
- **V2: a `document_event` log** — a second verdict on a paper overwrites the first (§ AK).
- The 11 Drivers verified before 2026-09-12 have no `verified_at` — left alone on purpose.
- `fold_text` folds only Latin-1 accents plus œ/æ; Ş Ğ ı Ă Ș Ț Ł are not. A pasted 80-character term cut mid-emoji
  makes the search RPC fail.
- "Vehicle" vs "Car": the tab is "Vehicles", a Driver's page tile says "Vehicle", the table columns and pills say "Car".
- An "Everyone" row still prints the base label's first part ("Pl. du Casino") — the founder said not to touch it.
- **Worth knowing:** replace the Mapbox token WITHOUT a URL restriction (the servers call Mapbox with no Referer); the
  Business side has no Kbis review screen and no `business.verified`; a Driver's REVTC, card and VAT numbers are not
  shown on /admin/drivers/[id].

## 🔜 WHAT IS NEXT
**The founder is on the landing page** (its own repo — `project/LANDING_HANDOFF.md`). In this repo, in rough order:
1. **The admin pager** — `readAll` fails open at 20 call sites, 14 of them unordered, with a false-accusation risk in
   the `repooled` read.
2. Then either **step 6 — Driver analytics by région / city** (the founder, S83: *"go back to step 6 to finish
   properly"*) or the next Runway ruling (**`penalty` + `checkin` + `reliability`**). Ask.

⚑ **PARKED, on the founder's word (2026-09-21): the Schedule's shape.** The whole brainstorm — what the Calendar and
History can and cannot carry, the four arguments against a today-only Schedule, and the recommended rolling
today + tomorrow window — is written up in `project/IDEAS.md` under **"The Schedule's shape"**. Nothing was built; a
preview comes first when it is picked up ([[show-preview-before-coding]]).

⚑ **Step 6 can stand on S78–S81's pieces:** "based here" vs "can reach here" (Monaco: 1 based, 10 can reach it); counts
always, a percentage only from 20 trips, the state on the row. Reuse `baseTownOf`, `admin_vehicle_overview`'s census
shape, `readAll`, the `.adm-apv` table and `components/admin-approval-cell.tsx`. S83 adds `lib/fleet-fit.ts`
`nobodyFits`. Still NOT recorded: whether any car could have REACHED a trip nobody took (D142, parked).

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
- **Pushing `main` deploys the live site** (Vercel) — admin.kavenue.fr included. ⚑ And a direct push to `main` is
  **refused**: branch protection requires the `types · tests · build` check on a pull request (first hit S84, PR #4).
- **The Xcode license can lapse** (after a macOS / Xcode update) and take `git` and `python3` with it — the founder's
  `sudo xcodebuild -license accept` fixes it.

## ⚑ THE WORKING AGREEMENT
**Answer a question before acting on it.** Ask before starting substantial work. Show a preview before building UI
(unless the founder says no need) — built from the real page code where possible. Keep `SESSION_LOG.md` (technical)
and `CHANGELOG.md` (plain language, founder-facing) current as you ship. Develop on a branch, CI-green, then `main`.
Never open a PR unless asked.
