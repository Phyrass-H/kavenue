# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.
> ⚑ History lives in `project/SESSION_LOG.md` and `project/DECISIONS.md`. This file carries
> only what is TRUE TODAY and what happens NEXT. Rewritten 2026-09-12 (was 2318 lines).

---

We're continuing Kavenue (B2B VTC booking marketplace).

## 🎯 START HERE — S79 CLOSED 2026-09-13 · NOTHING TO PASTE · STEP 4 SHIPPED

S79 finished S78's paste — M4, M5 (rewritten, [[d138]]), M6 — then built **step 4**: a search and a
**"To be approved"** section on `/admin/drivers`, in words the founder chose on three previews
([[d139]]). The founder checked both admin pages in the browser: *"both pages look good"*.

### State
| | |
|---|---|
| `main` | S79 merged 2026-09-13 (`s79-paste-fixes`, `s79-admin-drivers-search`), CI green |
| applied live | every file in `docs/migrations/` up to and including `2026-09-13d_admin_driver_find.sql` |
| tests | **1212** |
| `handoff-check` | **107** |
| probes | `car-gate.mts` 20/20 · `never-twice.mts` 5/5 · `driver-find.mts` 15/15 · `business-census.mts` |
| live fleet | 14 cars · 2 approved (the probe Drivers) · 12 pending (the founder's ruling). Théo's may now be approved — `handoff-check` prints the count |
| expected red | the seeded live trips age out (`npx tsx .local/seed/seed-live.mts` — it only inserts pooled trips) |

### ⏭ FIRST THING
Ask the founder what today is ([[wait-for-go-ahead]]). The standing order is **step 5**, below.

### ⚑ S79 LESSONS
1. ⚑⚑ **Simulate a fix against the WHOLE table, not the rows you believe are involved.** S78's seed
   de-duplicated the two probe Drivers against each other — and handed them Théo's phone and Marc
   Fontaine's card. M5 would have failed on the paste.
2. ⚑⚑ **An unbounded select stops at 1 000 rows WITHOUT an error.** Anything that FEEDS a rule must
   page (`readAll`, lib/admin-list.ts) and treat a failed page as "unread", never as "empty".
3. ⚑⚑ **A failed read must not draw confident facts.** An empty car list reads "none yet" and empty
   papers read "to send". Show "unread" — and make every sentence around the rows true in that state.
4. ⚑ **A throw-away Postgres in the scratchpad:** TCP only (the socket path passes macOS's 104
   bytes): `-o "-p 54799 -c unix_socket_directories='' -c listen_addresses=127.0.0.1"`; and
   `create database … encoding 'UTF8' template template0`, because `initdb --locale=C` defaults to
   SQL_ASCII, where `translate()` works on bytes and a fold test can pass for the wrong reason.
5. ⚑ **Reviews as workflows of read-only agents paid for themselves:** three rounds, a dozen real
   defects, nothing written to the database. Every finding was verified by a skeptic before fixing.
6. ⚑ **Do not sign in as admin through `/api/dev-login`.** It can create users and reset passwords,
   and the admin account is the real `admin@kavenue.fr`. The founder does the browser check.

### ⚑ LEFT OPEN FROM S79's FINAL REVIEW — none blocks
- ⚑ **`2026-09-13d_admin_driver_find.sql` was edited after it was applied** (numbers are searched only
  when the term is one). Run `npx tsx .local/probe/driver-find.mts`: if "an email holding digits…" is
  red, it was not re-pasted — paste it again, it is safe to re-run.
- `fold_text` folds French accents only; Ş Ğ ı Ă Ș Ț Ł are not folded.
- The detail tile says "Vehicle", the list pill says "Car" — one word would be tidier.
- Between 721 and 860px the lone fallback pill in "To be approved" sits right, not under the name
  (the later `.adm-row .adm-pill` rule wins on source order).
- A pasted 80-character term cut mid-emoji makes the RPC fail, and the page then blames the migration.

## 🔜 WHAT IS NEXT, in the founder's own order

Given 2026-09-09: ~~step 4~~ **shipped S79** ([[d139]]) · **step 5** a Vehicles page with search and
analytics · **step 6** Driver analytics by région / city. S78 ran the analytics brainstorm that
feeds 5 and 6.

⚑ **Step 5 can stand on S79's pieces:** `fold_text` and the dialled-phone / compact-plate matching
in `admin_driver_find`; `latestSlots` for papers without signed URLs; `adminPiles` for a car's
approval in admin words; `readAll` for anything that feeds a count. And the loop the founder signed
off three times: a preview built from live rows → build → a review workflow → the founder's browser.

**⚑ The brainstorm's conclusions, worth re-reading before scoping 5 and 6:**
- Supply vs demand per class × body is the core of the Vehicles page (demo data: First trips
  requiring a sedan filled 9 of 22, with two First sedans in the fleet).
- "Based here" vs "can reach here" is the core of the by-area view (Monaco: 1 based, 10 can
  reach it).
- Counts always; a percentage only from 20 trips up; the state on the row, never a roll-up.
- ⚑ The three "record it now or lose it for ever" items are **DONE** (the car's history, the
  Driver's own facts, the car frozen onto each trip). What is still NOT recorded: whether any
  car could have REACHED a trip that went unfilled. The change logs make it replayable from
  2026-09-12 forward, never backwards.

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
7. ⚑ **A subagent told to be read-only wrote to the live database** — it believed a migration
   was unapplied when it was applied. It restored and reported; audited after, unchanged. When a
   probe's behaviour depends on schema state, make it CHECK the state, never assume it.

## 🔒 DECIDED — do not re-open
- **Car approval, all six rules** — [[d137]]: three approvals (person, company, vehicle); a
  change replaces the car; history frozen; never twice at signup; giving a trip away goes
  through support; one car per Driver in V1, multi-car is V2.
- **Every existing car starts pending** (founder: *"yes and yes"*).
- **Monaco is named as a country** · **no invention** (a row with nothing to derive from is left
  alone and named) · **the age rule is information, not a gate** · **plate-lookup API: not now**
  (licence law — `project/research/2026-09-11_plate_lookup_and_car_data.md`).
- **`driver.operational_zones` decides nothing** — matching is base + radius (`lib/geo.ts`).
- **Accept is `rpc('accept_mission_call')`**, never the raw name.
- **Bags: no capacity analytics** — Drivers make it work, and the guided mission form is the
  prevention.
- **The support console IS the Activity console** for now; split it when it hurts.
- **BACKLOG § AJ** — train the support team to check papers (founder, *"put it on the side"*).

## 🧪 HOW THE FOUNDER TESTS — settled 2026-09-09

**On the Mac. Not on a phone. Not on the live site.** One command:

    npm run test-app        # stops any running server, pins port 3000, opens Safari

⚑ `localhost` needs no key — `/dev-login` is two buttons. ⚑ One browser window = one role; a
Safari Private Window (⌘⇧N) holds a second, independent session. Others: `npm run test-driver`
(resets Théo — ⚑ his car now comes back **pending**, on purpose) · `npm run dev:lan` · `npm run dev`.

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

## 📎 THE FOUNDER'S V1 LIST — 59 things only they can do
**https://claude.ai/code/artifact/c0f723f7-b401-4b0b-8f23-87aee18eec2f** — read its ticks with
the Artifact tool's `read` action before planning anything; do not re-derive it from the docs.
⚑ Three items on it are overdue rather than upcoming: e-invoicing reception (1 Sept 2026, past),
DAC7 / art. 242 bis (appears nowhere in this repo), and no terms are recorded as accepted.

## ⚑ THE WORKING AGREEMENT
Ask before starting substantial work. Show a preview before building UI. Keep `SESSION_LOG.md`
(technical) and `CHANGELOG.md` (plain language, founder-facing) current as you ship. Develop on
a branch, CI-green, then `main`. Never open a PR unless asked.
