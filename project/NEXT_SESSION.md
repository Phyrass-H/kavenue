# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.
> ⚑ History lives in `project/SESSION_LOG.md` and `project/DECISIONS.md`. This file carries
> only what is TRUE TODAY and what happens NEXT. Rewritten 2026-09-12 (was 2318 lines).

---

We're continuing Kavenue (B2B VTC booking marketplace).

## 🎯 START HERE — S78 CLOSED 2026-09-12 · ⚑ THREE MIGRATIONS ARE STILL UNPASTED

S78 built **car approval**: a car must be approved by a person before a Driver can work, a car
change replaces the car rather than editing it, and every trip keeps the car that actually did
it. Full reasoning in [[d137]]; the founder's own words are quoted there.

### ⚑⚑ FIRST THING: FINISH THE PASTE. The code is live, the door is not.

| # | file | state |
|---|---|---|
| M1 | `2026-09-12_vehicle_lifecycle_columns.sql` | ✅ applied 2026-09-12 |
| M1b | `2026-09-12a_mission_read_carries_the_car.sql` | ✅ applied |
| M2 | `2026-09-12b_history_backfill.sql` | ✅ applied — 296 trips carry a frozen car, 22 papers linked |
| M3 | `2026-09-12c_vehicle_and_driver_event.sql` | ✅ applied — both logs exist, 0 rows |
| **M4** | **`2026-09-13_vehicle_approval_gate.sql`** | ⏭ **THE DOOR — not pasted** |
| **M5** | **`2026-09-13b_never_twice.sql`** | ⏭ not pasted · ⚑ run `npx tsx .local/seed/seed-probe-accounts.mts` FIRST or four indexes fail |
| **M6** | **`2026-09-13c_rollups_skip_retired_cars.sql`** | ⏭ not pasted — the console still names a retired car until it lands |

**The order, and why:** M4 refuses work for an unapproved car, so it must land AFTER the code
that expects it (on `main` since S78). M5 needs the probe seed to have de-duplicated its own
fixtures. M6 is cosmetic and last.

**After M4, in this order:**
1. `npx tsx .local/probe/car-gate.mts` — both directions, on a trip it creates and deletes. Run
   it only AFTER M4; before that it reports red and names the file to paste.
2. `node --experimental-strip-types .local/probe/handoff-check.ts` — 107 checks.
3. The founder, in the browser: approve Théo's car
   (`/admin/drivers/91a98570-3634-4bf8-8f9e-8a0d9161b52c`), then be him
   (`/api/dev-login?email=test.driver@kavenue.test`) and watch the Pool open.

⚑ **ALL 14 CARS ARE `pending` RIGHT NOW** — the founder's ruling (*"yes and yes"*). Until one is
approved, nobody can accept anything the moment M4 lands. That is expected, not a bug.

### State

| | |
|---|---|
| `main` | S78 merged 2026-09-12 (branch `s78-car-approval`) |
| tests | 1137 → **1178** |
| `handoff-check` | 95 → **107** |
| new probes | `.local/probe/car-gate.mts` · `.local/probe/business-census.mts` |
| expected red | the seeded live trips aged out (`npx tsx .local/seed/seed-live.mts`) |

## 🔜 WHAT IS NEXT, in the founder's own order

Given 2026-09-09 and unchanged: **step 4** search + a "Not verified" section on `/admin/drivers`
· **step 5** a Vehicles page with search and analytics · **step 6** Driver analytics by région /
city. S78 ran the analytics brainstorm that feeds 5 and 6, then built the car approval it turned
up as urgent.

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
