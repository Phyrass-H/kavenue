# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.
> ⚑ History lives in `project/SESSION_LOG.md` and `project/DECISIONS.md`. This file carries
> only what is TRUE TODAY and what happens NEXT. Rewritten 2026-09-12; S80 block 2026-09-13.

---

We're continuing Kavenue (B2B VTC booking marketplace).

## 🎯 START HERE — S80 CLOSED 2026-09-13 · NOTHING TO PASTE · ALL MERGED TO `main`

S80 began as a design review the founder led and ended as four shipped changes, none touching the database:
1. **"To be approved" is a six-column table** on /admin/drivers, and every admin surface says **"documents needed"** ([[d140]]).
2. **The admin console has a Sign out** — the email in the header opens a card.
3. **A Driver's approval is logged as the admin's act** — who, when, through the admin door (it was copying the Driver).
4. **The admin sign-in is an admin door** ([[d141]]): it never creates an account, answers any email with one neutral
   sentence, and a non-admin who opens the link is signed out and told *"This email doesn't have admin access."*

### State
| | |
|---|---|
| `main` | S80 merged 2026-09-13 — `s80-approvals-columns`, `s80-handoff`, `s80-approval-actor`, `s80-admin-door`; CI green each time |
| applied live | every file in `docs/migrations/` up to and including `2026-09-13d_admin_driver_find.sql` (S80 added none) |
| tests | **1235** |
| `handoff-check` | 107 at S79 — not run in S80 (nothing in the database changed) |
| probes | `car-gate.mts` 20/20 · `never-twice.mts` 5/5 · `driver-find.mts` 15/15 · `business-census.mts` (S79 runs) |
| live, measured S80 | 14 Drivers, **12 in "To be approved"** (9 approved persons whose car waits; they still owe the REVTC register, the medical certificate and the Kbis) · 7 Business users · **1 admin, `admin@kavenue.fr`** · 25 sign-in accounts, 3 with no profile · **0** approval/suspension events yet |
| expected red | the seeded live trips age out (`npx tsx .local/seed/seed-live.mts` — it only inserts pooled trips) |

### ⏭ FIRST THING
Ask the founder what today is ([[wait-for-go-ahead]]) — and **answer a question in words before touching a file**
(S80 lesson 1). The standing order is still **step 5**, below.

### ⚑ S80 LESSONS
1. ⚑⚑ **A question is not a task.** *"I would like to review the design of the driver page"* meant *look at it with
   me*. I read ten files and wrote a DB script without a word; the founder stopped it — *"I just ask you a question,
   not to do anything"* — and asked three more times for an answer before a build. Reply first; say in one line
   what you will read, and why.
2. ⚑ **"The driver page" was the LIST** (/admin/drivers). When a name fits two screens, ask which.
3. ⚑⚑ **Check a claim about what is RECORDED in the write path before saying it.** I told the founder a Driver's
   approval recorded who; it copied the Driver. My first correction was wrong too — two review rounds to get it true.
4. ⚑ **Argue with realistic cases.** "A Driver trying the admin page" drew *"why in the world would a driver…"*. Name
   the real people first: the founder with another email, staff, a stranger.
5. ⚑ **A `justify-self: end` grid cell overflows to its START side** — a layout check on right edges only misses it.
6. ⚑ **The Supabase redirect allowlist lists the bare `/auth/callback`.** Don't put `?next=` on `emailRedirectTo` —
   a link that fails to match falls back to the Site URL, a sign-in that silently fails. S80 used a short cookie
   marker instead (`lib/admin-signin.ts`).
7. ⚑ **Measuring a page without an admin session:** a READ-ONLY script calls the page's own rule functions → JSON; a
   static page in the scratchpad loads a COPY of `app/globals.css`; a temporary `.claude/launch.json` entry serves
   it — `/bin/sh -c "cd <scratchpad> && exec python3 -m http.server 8765 --bind 127.0.0.1"` (python3's
   `--directory` crashed on `getcwd`). Revert the entry before committing. Signed-OUT pages (/login) can be checked
   in the Browser pane on localhost directly.
8. ⚑ **The founder may choose against the recommendation** (the sign-out menu over a visible link) — build exactly
   what was previewed and chosen.

**Still true from S79:** an unbounded select stops at 1 000 rows without an error (`readAll`) · a failed read must
draw "unread", never confident facts (S80 applied it to the admin door's role check) · a throw-away Postgres needs
TCP and `encoding 'UTF8' template template0` · review workflows of read-only agents keep paying (S80: 6 rounds,
8 real defects, all fixed before merge) · never sign in as admin through `/api/dev-login`.

### ⚑ LEFT OPEN — none blocks
- ⚑ `2026-09-13d_admin_driver_find.sql` was edited after it was applied (S79). Run
  `npx tsx .local/probe/driver-find.mts`: if "an email holding digits…" is red, re-paste it — it is safe to re-run.
- **Adding a second admin today:** the admin door creates no account, so create theirs in the Supabase dashboard
  (Authentication → Users), give it a `profile` row with `role = 'admin'`, then they sign in at admin.kavenue.fr.
  Every admin has full access; their approvals are logged under their own id. **V2: a master admin who adds and
  removes staff** (`project/BACKLOG.md` § AL).
- **V2: a `document_event` log** — a second verdict on a paper overwrites the first (§ AK, docs/05).
- The 11 Drivers verified before 2026-09-12 have no `verified_at` — left alone on purpose (nothing true to fill).
- `fold_text` folds French accents only (Ş Ğ ı Ă Ș Ț Ł are not). A pasted 80-character term cut mid-emoji makes the
  RPC fail, and the page then blames the migration.
- A Driver's page tile says "Vehicle"; the table column and the pills say "Car".
- An "Everyone" row still prints the base label's first part ("Pl. du Casino") — the founder said not to touch that
  list. Between 861 and 940px its name column is 101px.
- On a phone the admin header is wider than the screen, so the email and its Sign-out card sit off to the right.
  The console is used on the Mac.
- Sign-in emails appear to go through Supabase's built-in mailer (a low hourly limit) — a dashboard setting, not
  visible from the repo.

## 🔜 WHAT IS NEXT, in the founder's own order

Given 2026-09-09: ~~step 4~~ **shipped S79, reshaped S80** ([[d139]], [[d140]]) · **step 5** a Vehicles page with
search and analytics · **step 6** Driver analytics by région / city. S78 ran the analytics brainstorm that feeds 5
and 6.

⚑ **Step 5 can stand on S79–S80's pieces:** `fold_text` and the dialled-phone / compact-plate matching in
`admin_driver_find`; `latestSlots` for papers without signed URLs; `adminPiles` (with `detail`) for a car's approval
in admin words; `readAll` for anything that feeds a count; `baseTownOf` for a town; the `.adm-apv` fixed-column
table and `.adm-main--drivers`' titles. And the loop the founder keeps signing off: a preview built from live rows →
build → a review workflow → the founder's browser.

**⚑ The brainstorm's conclusions, worth re-reading before scoping 5 and 6:**
- Supply vs demand per class × body is the core of the Vehicles page (demo data: First trips
  requiring a sedan filled 9 of 22, with two First sedans in the fleet).
- "Based here" vs "can reach here" is the core of the by-area view (Monaco: 1 based, 10 can
  reach it).
- Counts always; a percentage only from 20 trips up; the state on the row, never a roll-up.
- ⚑ The three "record it now or lose it for ever" items are **DONE** (the car's history, the
  Driver's own facts, the car frozen onto each trip). What is still NOT recorded: whether any
  car could have REACHED a trip that went unfilled. The change logs make it replayable from
  2026-09-12 forward, never backwards. (S80: a Driver's approval now names the admin as its actor.)

## ⚑ TRAPS FROM S78 — each nearly shipped

1. ⚑⚑ **`create function` grants EXECUTE to PUBLIC.** Revoking from `authenticated` does NOT
   remove it. A SECURITY DEFINER function taking a driver id from its caller was callable by
   every signed-in session. Third time this shape has appeared (2026-08-31d/e). Always
   `revoke … from public`, and check with `has_function_privilege`.
2. ⚑⚑ **RUN A MIGRATION BEFORE HANDING IT OVER.** A throw-away Postgres 17 on this Mac
   (`/opt/homebrew/opt/postgresql@17/bin`; ⚑ `initdb --locale=C` and `LC_ALL=C`, or the server
   will not start) plus a stand-in schema found: `replace_vehicle` inserting before retiring (a
   partial unique index is per-statement and cannot be deferred, so EVERY car change would have
   failed); `min(uuid)` does not exist, so the corrected backfill would not have applied at all;
   and a spurious change-log row. None of it was visible by reading.
3. ⚑⚑ **A form posts everything it renders.** The luggage opt-in lives in the car form, so
   ticking it retired the approved car and shut that Driver's Pool. Compare before you write.
4. ⚑ **`mission_read` is an explicit column list.** A column added to `mission` and not to the
   view is invisible — and the Waybill, which names its columns, 404s. The gate now finds the
   NEWEST file containing a full rebuild rather than naming one.
5. ⚑ **`group by a.id, b.id` on two primary keys makes `having count(*) = 1` a no-op.** It
   looked like a guard and eliminated nothing.
6. ⚑ **The service role bypasses RLS, not TRIGGERS.** Every seed that assigns a Driver to a trip
   now needs that Driver's car approved; every seed that inserts a car writes `approved`.
   ⚑ And (S80) a service-role UPDATE that does not set `last_written_by` / `last_written_via` hands the change log the
   PREVIOUS writer as its actor — every write path must stamp both.
7. ⚑ **A subagent told to be read-only wrote to the live database** — it believed a migration
   was unapplied when it was applied. It restored and reported; audited after, unchanged. When a
   probe's behaviour depends on schema state, make it CHECK the state, never assume it.

## 🔒 DECIDED — do not re-open
- **Car approval, all six rules** — [[d137]]: three approvals (person, company, vehicle); a
  change replaces the car; history frozen; never twice at signup; giving a trip away goes
  through support; one car per Driver in V1, multi-car is V2.
- **"To be approved" is a table, and admins read "documents needed"** — [[d140]]: one column per approval; a done
  Person still says what is owed; no "Waiting" column until a document history exists; titles restyled on
  /admin/drivers only; "Everyone" keeps its pills.
- **The admin door** — [[d141]]: never creates an account; one neutral sentence before the link; "no admin access"
  only after it, to the mailbox's owner; an unreadable role says it could not check.
- **Sign out of the admin console = the email opens a card** (founder's pick, S80).
- **Every existing car starts pending** (founder: *"yes and yes"*).
- **Monaco is named as a country** · **no invention** (a row with nothing to derive from is left
  alone and named) · **the age rule is information, not a gate** · **plate-lookup API: not now**
  (licence law — `project/research/2026-09-11_plate_lookup_and_car_data.md`).
- **`driver.operational_zones` decides nothing** — matching is base + radius (`lib/geo.ts`).
- **Accept is `rpc('accept_mission_call')`**, never the raw name.
- **Bags: no capacity analytics** — Drivers make it work, and the guided mission form is the
  prevention.
- **The support console IS the Activity console** for now; split it when it hurts. On screen it is "Kavenue Admin"
  and its first tab "Activity"; the web address admin.kavenue.fr is fine (founder: *"not urgent"*).
- **BACKLOG § AJ** — train the support team to check papers (founder, *"put it on the side"*).

## 🧪 HOW THE FOUNDER TESTS — settled 2026-09-09

**On the Mac. Not on a phone. Not on the live site.** One command:

    npm run test-app        # stops any running server, pins port 3000, opens Safari

⚑ `localhost` needs no key — `/dev-login` is two buttons (Business, Driver). **The admin signs in at
`http://localhost:3000/admin`**, which sends to the admin door (`/login?side=admin`) and a magic link to
`admin@kavenue.fr` — so ⚑ Sign out means asking for a new link. ⚑ One browser window = one role; a Safari Private
Window (⌘⇧N) holds a second, independent session. Others: `npm run test-driver` (resets Théo — ⚑ his car now comes
back **pending**, on purpose) · `npm run dev:lan` · `npm run dev`.

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
  `next.config.mjs` throws on a production build carrying one. Read that file before advising
  anything about env vars.
- **Pushing `main` deploys the live site** (Vercel) — admin.kavenue.fr included.

## 📎 THE FOUNDER'S V1 LIST — 59 things only they can do
**https://claude.ai/code/artifact/c0f723f7-b401-4b0b-8f23-87aee18eec2f** — read its ticks with
the Artifact tool's `read` action before planning anything; do not re-derive it from the docs.
⚑ Three items on it are overdue rather than upcoming: e-invoicing reception (1 Sept 2026, past),
DAC7 / art. 242 bis (appears nowhere in this repo), and no terms are recorded as accepted.

## ⚑ THE WORKING AGREEMENT
**Answer a question before acting on it.** Ask before starting substantial work. Show a preview before building UI
(unless the founder says no need). Keep `SESSION_LOG.md` (technical) and `CHANGELOG.md` (plain language,
founder-facing) current as you ship. Develop on a branch, CI-green, then `main`. Never open a PR unless asked.
