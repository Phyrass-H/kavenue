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

⚑ **S66 pushed three times this way (`s66-reclaim`, `s66-eventlog`, `s66-floor`) — it works.**

⚑ **S64 misread that rejection as "a PR is the only route" and opened PR #1** — the first this repo ever had —
which made the founder click a Merge button for no reason. It worked, and a PR is a legitimate second route,
but it is ceremony this project does not need. `CLAUDE.md` still says **do not open a PR unless explicitly
asked**; that stands, and now there is no reason to.

⚑ **The rule is INVISIBLE FROM THE CODE.** `.github/workflows/ci.yml` is in the repo, but the ruleset that
makes it *required* is a GitHub setting outside it. Read it with
`gh api repos/Phyrass-H/kavenue/rulesets`.

START BY READING — **just these four**; they get you fully up to date without bloating context:
- `CLAUDE.md` (root) — hard rules + glossary (auto-loaded anyway).
- **This file** (`project/NEXT_SESSION.md`) — the current state + what's next (the resume point).
- `project/CHANGELOG.md` — plain-language history, the **recent entries** (the big picture, fast). Older entries live in
  `project/CHANGELOG_ARCHIVE.md` — read it only if you need the deep history.
- `project/SESSION_LOG.md` — skim the **newest entry (Session 66)** for recent technical detail; S65 behind it
  is the growth limit + the event log. Older sessions (1–33) are in `project/SESSION_LOG_ARCHIVE.md` — don't
  open it unless you need deep history.
- `project/DECISIONS.md` — **read D86, D87 and D88** (the newest three). They are this session's decisions and
  the reasoning behind the next job; the "🔒 DECIDED IN S66" table below is only their summary.

READ ON DEMAND — open these **only when the task actually touches that area** (this is the big context saver,
and it loses nothing — the docs are all still here, just read when relevant):
- `project/DESIGN_BRIEF.md` — for any UI/design work (brand, navy `#25344C`, screen inventory, constraints).
- `docs/06_Pricing_Commission_Payments.md` — the curve (§6) and the build order (§13). **Shipped and live**;
  read it before touching money, not before every job. Never price anything from memory.
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

⚑ **The founder pastes them and reports back the same session.** Both S66 migrations were applied within
minutes of being written. Don't defer verification to "next time" — probe it while they're still at the desk.

---

## WHERE WE ARE (2026-08-26, end of S68)

`main` = **the S68 commit**, deployed. **NO migration was written or needed** — RLS already grants
`app_role()='admin'` read on everything, so the whole console shipped app-side.

### ✅ Shipped in S68 — THE ACTIVITY CONSOLE
| | |
|---|---|
| **the console** | `admin.kavenue.fr` — search a Driver / hotel / trip · one trip's story in order · one Driver · one hotel. Runs as the signed-in admin through the ordinary server client, **never the service role** |
| **the flagship** | *"Why can't this Driver take this trip?"* — pick any Driver against any trip, get one sentence back. Answering that used to mean querying the DB by hand |
| **D92** | ⚑ **Two fields recorded about every Driver decide nothing** — `operational_zones` and `verified`. Reported, not omitted; guarded by grep in two probes |
| **D93** | ⚑ **Refused ≠ never shown.** Six rules refuse (`accept_mission`), three only hide (the Pool query). Different problems, different fixes |
| **tests** | 555 → **636** (+81) across `eligibility` · `activity-findings` · `mission-story` |
| **browse** | `/admin/{drivers,businesses,trips}` + nav. The state is on the ROW — *"no base — Pool empty"*, *"3 nobody took"* — never a count at the top |
| **the founder's own check** | *"nobody has ever used the release request"* — true, all time. ⚑ Read from the **domain table**, never the log (the log is 2 days old; `mission_release` goes back to the beginning) |
| **probe** | `.local/probe/eligibility-live.mts` — 23 checks. ⚑ **`npx tsx`, not node** |
| **the fleet** | `.local/probe/s68-driver-bases.mts` gave the six baseless Drivers a real base + **unequal radii**. `--undo` puts them back |

### ⚑ WHAT THE CONSOLE FOUND, AND WHAT WAS DONE ABOUT IT
- ~~Two of the three pooled trips could be taken by nobody~~ · ~~six of nine Drivers had no base~~ — **FIXED
  the same session** by giving those six a real base (see the table above). Every pooled trip now has at least
  one taker. ⚑ **Do not "re-fix" this** — and note the radii are unequal ON PURPOSE.
- **Marc Dubois is unverified and can accept work today** (see D92 — that is not a bug to "fix" quietly).
- **No Driver has ever asked to be let out of a trip** (`mission_release` = 0, all time) and **no Driver has
  ever filed a single document** (`document` = 0). Both are live findings on the console.
- **442 log entries point at a deleted trip.** Designed: `mission_event` has no FK to `mission`.

### ⚑ THE PATTERN — now SEVEN
D86 (a gate on a status nothing reaches) · D87 (event types nothing wrote) · D88 (a check skipped when data
was missing) · D90 (a role with no branch) · two in D91 the **compiler** caught · **and now D92: two fields
consulted by nothing.**

> **Where a value must cover every case, make the compiler the check.** `PHRASES` in `lib/mission-story.ts`
> refused to compile until `close_answered` had a sentence — in the first minute of writing it.
> And still: **a missing value is a REFUSAL, never a skip** (D88); **"zero rows" is not proof of a bug** (S67)
> — D92 was found by `grep -rn`, not by an empty query.

### 🎯 NEXT SESSION — the founder's stated order, confirm in one line

#### 0 · ⚑ THE QUOTE AND THE CHARGE DISAGREE ONCE `accepted_fare` IS SET — **START HERE**

**Found 2026-08-26 by the reseed. NOT a regression, NOT proven wrong money in production, and NOT patched.**

`write-test.ts` reports **24 problems**, and they are all one thing. The probe snapshots the fare with
`settledFare()`, which returns the frozen **`accepted_fare`** when it exists; `business_cancel_mission`
computes its own basis in SQL from the **live PDP curve**. Same cancellation percentage, three different
stored fees:

| case | pct | probe's basis | probe expects | SQL stored |
|---|---|---|---|---|
| A1 | 50 % | 81,06 | 40,53 | **42,75** |
| A2 | 50 % | 81,06 | 40,53 | **61,73** |
| A3 | 50 % | 81,06 | 40,53 | 40,53 ✓ |
| A4 | 55 % | 81,06 | 44,58 | **109,99** |
| A5 | 55 % | 81,06 | 44,58 | 44,58 ✓ |

⚑ **WHY IT WAS GREEN FOR FOUR DAYS.** `accepted_fare` shipped 2026-08-22 and was **NULL on all 280 live
missions** — so `settledFare()` always fell through to recomputing the curve, landed on the same number as
SQL, and the check passed. The S68 seed stamps it exactly where the app stamps it, and the disagreement
appeared at once. **The old data was hiding it.** (S67's "zero rows is not proof of a bug" has a twin: *zero
rows is not proof of correctness either.*)

**What to establish first, before changing any code:**
1. Which side is right — the modal's quote (`accepted_fare`, what the Business was shown) or the RPC's charge
   (the live curve)? Doc 06 §9 says *"the fare freezes at acceptance"*, which argues for the frozen one.
2. Is this the **§ H2 residual already on record** — *"the fee basis can still be understated down to
   `pdp_start`"* — surfacing, or something new?
3. ⚑ The A3 and A5 cases are **correct**, so the mechanism works. Find what differs about A1/A2/A4 (they are
   the cases whose `pickup_at` is moved to simulate the lead time — suspect the curve moving between the
   probe's read and the RPC's computation).

**Evidence it is not a regression:** `diff-sql-vs-lib` **1 921 checks · ALL AGREE** over the 350 real
missions · `curve-live` 8/8 · `accepted-fare` 20/20 · `migrations-2026-08-10` 63/63 ·
`migrations-2026-08-11` 23/23. Nothing S68 changed touches the money path.

⚑ **Do NOT make the probe green by relaxing the assertion.** One PAGE-READ assertion in it WAS relaxed this
session, correctly and for a different reason (it compared a commission-inclusive number to a
commission-exclusive one and had also been passing for the wrong reason). These 24 are not that.

#### 1 · A CLEAN TEST DATASET ← **START HERE** (partly begun)
The console exists now, which was the whole reason to build it first: *building the console is what reveals
which scenarios the dataset actually needs.* ⚑ **The six missing bases were already fixed** (S68 part B), so
the matching rules now decide something. What is still seeded junk: 280 trips, 23 cancellations with no
record, 442 stranded log entries, and three demo `S64CURVE` rows that age out every session.
- ⚑ **The sweep must include `mission_event` and `status_event`.** 431 log entries already point at deleted
  trips. Every S66/S68 probe cleans up after itself; copy that pattern.
- ⚑ The founder's own words: *"you and me we are going to delete every single Driver and company and trips
  ever tested in the database"*. Schema stays, only rows go.
- ⚑ `.local/seed/seed-fleet.mjs --undo` · `.local/probe/s64curve-refresh.mts` for the demo curve rows.

#### 2 · THE FOUNDER'S OWN UI/UX PASS ON THE CONSOLE
Agreed order: console → dataset → their pass. ⚑ **The console is bigger than the preview shows** — the
Artifact is the three original screens; `/admin/drivers`, `/admin/businesses` and `/admin/trips` shipped after
it and are not in it. ⚑ **The first preview was rejected as "overwhelming"** and the
second cut it to one sentence per finding, the blocker instead of the rulebook, and a hoverable `approx` tag
instead of caveat boxes. **That is the calibration for anything added here.** Preview:
`project/Activity-Console-Preview.html` (also published as an Artifact).

#### 3 · THE TWO TRACKERS — start them EARLY, they need weeks of data
Both are things the founder explicitly asked for and neither exists:
- **A "last seen" stamp** — one write per person per day. Answers *"how many Drivers actually opened the
  app"* (DAU/MAU, the first number an investor asks for). ⚑ Records **that** they came, never **what they
  looked at** — that distinction is what makes it acceptable after the founder cut browsing events.
- **Three events on the booking form** — started / posted / abandoned. One per booking attempt, not per
  scroll. This is a **funnel**, and it is the only way to answer *"how easy is it to create a trip"*.

#### 4 · THE BOOKING VOUCHER
Real Drivers get stopped by police. ⚑ **The founder does not remember the "7 mandatory fields" and asked to
START FRESH — do not lead with the arrêté.** Their framing: *"a tiny button that displays all the info about
the Driver, the Driver's company, who the mission is from, the passengers, the car and the mission, to show
the police in a control."* **Ask them for their list first**, then reconcile with
`docs/01_Legal_VAT_Compliance.md:28`. The table `booking_voucher` exists and no code touches it.

#### 5 · THE EMBARRASSING DETAILS
- The Driver's **photo and languages are collected and shown to nobody**, while two shipped strings promise
  otherwise. Small fix, bad look.
- `manifest.webmanifest` ships `"icons": []` — no app icon.
- No welcome banner · no FAQ · no free edits while pooled (D39 says there should be).
- `field_of_activity` and `business_type` are two columns that never talk.

#### 6 · THE ANALYTICS PAGE — last, deliberately
It needs data to say anything. **Free from what you already store:** counts of Drivers/Businesses/trips,
growth month over month (May 71 · June 101 · July 85 · Aug 23), signups per week, trips by area/class/hotel,
**GMV**, **take rate**, **retention by cohort**, **liquidity** (what share of posted trips get taken, and how
fast — arguably the most important number a marketplace has). **Needs the trackers above:** MAU/DAU, time to
post a trip, and where people abandon.

---

### 🔒 DECIDED IN S66 — do NOT re-open these
| decision | the founder's reasoning |
|---|---|
| **Reclaim at T−2h** | Driver keeps 1h grace after check-in opens; replacement gets 2h |
| **No `pool_impression`, no `mission_viewed`** | *"a driver that looks around the pool it's just browsing and brings no values to us"*. At 9 Drivers you phone them. Revisit at scale (§ AF) |
| **Names are enough — no new ID scheme** | 9 Drivers, 3 Businesses, **no duplicate full names**. SIRET already exists as the legal id (Drivers are companies too) and gets filled during verification. Revisit past ~50 Drivers |
| **Google for the address box, Mapbox for routing** | Evidence-backed — see below |
| **Michelin: almost certainly out** | Its traffic option is a **country-level toggle**, not a departure timestamp, and a direct comparison describes ViaMichelin durations as excluding traffic. Free key was a **time-limited trial**. One question if they still want to price it: *"can I pass a future departure date/time and get a duration reflecting predicted traffic for that moment?"* Expect no. ⚑ The trial key was pasted into chat — **treat as burned, rotate it** |
| **Support console BEFORE analytics** | Useful day one; analytics needs weeks of data |
| **Native app AFTER V1** | PWA is correct for beta. Real project — store accounts, review cycles, proper push |
| **Don't gate on thin data** | Founder: *"I don't care"* about geography being 3/9 Drivers located. ⚑ But any dashboard must **say "3 of 9 located"**, never quietly count only what it can find |
| **Flight tracking → the integration phase** | Founder said yes to V1, but it is a genuinely NEW paid API. Group it with payments + notifications |

### 🅥 PARKED — do not raise unprompted
- **§ AH · the check-in loophole** (founder raised it, wants it later). A Driver who wants out for free can
  simply not check in and let the Business reclaim — costs them one `reliability_marks` point, versus up to
  100% of the fare for cancelling properly. **Four options written up, none chosen.** The founder leans on
  reputation doing the work once reviews ship; the honest counter is that a missed check-in is not proof of
  intent. ⚑ Option 4 (free once, charged on repetition) is the only one separating "busy once" from
  "habitual", and § AG now makes it countable.
- **§ V** (lower-class opt-in) → V3+. **The stranded Classe V is NOT a bug to fix.**
- **§ AF** aggregate demand sensing — unmeasurable at 9 Drivers.
- **`pickup-marketplace.vercel.app` is still live** under La Poste's trademark. Founder's call, § AD.
- Notifications / payments / auth / analytics integrations — the founder's standing phase rule.

### 🧹 BEFORE REAL LAUNCH — the founder's own plan
*"you and me we are going to delete every single Driver and company and trips ever tested in the database"*.
Clean to do: the schema stays, only rows go. ⚑ **The sweep must include `mission_event` and `status_event`** —
test runs fill the log too. Every S66 probe cleans up after itself; copy that pattern.

### 📋 V1 COMPLETENESS
**38 KEEP features in Doc 02: 27 built · 8 partial · 3 missing.** Nothing on the critical path is unbuilt.
GDPR consent capture + account deletion are still absent — **founder-owned, do not gate on it**.

---

## ⚑ 0 · VERIFY BEFORE YOU BUILD — THIS IS A GATE, NOT A SUGGESTION

A handoff is a *claim about the repo*, and claims decay — fastest when the session writing them is also the
session changing things. S64's handoff was wrong twelve ways. **S66 found the old state block still saying the
T−60 take-back was "STILL parked" hours after shipping it.** Run this first:

    node --experimental-strip-types .local/probe/handoff-check.ts

**29 assertions**, ending `The handoff still matches reality. Proceed.` Anything `STALE` means this file lies
about that point — **fix the file before you build on it.** Then:

    npx tsc --noEmit && npx vitest run          # expect 643 passing
    node --experimental-strip-types .local/probe/diff-sql-vs-lib.ts     # 693 · ALL AGREE
    node --experimental-strip-types .local/probe/write-test.ts          # 170 · ALL AGREE
    node --experimental-strip-types .local/probe/curve-live.ts          #   8 · ALL AGREE
    node --experimental-strip-types .local/probe/accepted-fare.ts       #  20 · ALL AGREE
    node --experimental-strip-types .local/probe/reclaim-live.mts       #  20 · D86 end to end
    node --experimental-strip-types .local/probe/event-registry-live.mts #  16 · D87 registry
    node --experimental-strip-types .local/probe/migrations-2026-08-10.ts   # 63 · 0 failed
    node --experimental-strip-types .local/probe/migrations-2026-08-11.ts   # 23 · 0 failed
    node .local/probe/google-places-live.mjs                             #  8 · D89 address box
    npx tsx .local/probe/eligibility-live.mts                            # 23 · D92/D93 — ⚑ tsx, NOT node

**If a probe fails, that is the job** — not whatever is queued above.

⚑ **When you finish, do the same to your own handoff**, and **add an assertion for anything that bit you**.

---

## ⚑ TRAPS LEARNED IN S68 — every one cost real time

- ⚑ **A PROBE THAT IMPORTS AN `@/`-ALIASED MODULE MUST RUN UNDER `tsx`, NOT `node`.** Plain
  `node --experimental-strip-types` dies with `ERR_MODULE_NOT_FOUND '@/lib'` — it does not read tsconfig
  paths. Every earlier probe got away with `node` only because it imported alias-free modules (`lib/geo.ts`)
  or nothing at all. `eligibility-live.mts` imports `lib/eligibility.ts`, which imports `@/lib/geo`.
- ⚑ **`mission_event.seq` IS NOT TIME ORDER.** The backfill inserted one table at a time, so the live log
  holds a trip whose `en_route` row sits at a **lower** seq than its `created` row, six weeks earlier.
  Rendering the log by `seq` states that a trip was driven before it was booked. `orderEvents()` in
  `lib/mission-events.ts` already sorts on `occurred_at` then `seq` — **use it, never re-sort by hand.**
- ⚑ **`"".trim()` SATISFIES `??`.** `tripLabel`'s fallback chain returned an empty string for a
  whitespace-only label, because `""` is not null or undefined. `|| undefined` before the `??`. Found by a
  test written *because* the live pooled rows have null labels — the seeded trips carry no route labels at all.
- ⚑ **COLLIDING REACT KEYS SILENTLY DROP ROWS.** A findings list keyed on the subject warned *"children may be
  duplicated and/or omitted"* — the live DB has **four** trips called *"Le Grand Hôtel → Monaco"*. A findings
  screen that silently drops a finding is the one failure it cannot have. Key on the entity id.
- ⚑ **GROUPING IS A PER-CHECK DECISION, AND THE DEFAULT IS WRONG FOR ABSENCES.** Collapsing findings that
  share a check printed *"2 shipped features have never been used"* over the raw table names `mission_release`
  and `document` — the exact roll-up count the screen exists to avoid, produced by the code written to avoid
  it. `CHECKS[id].groups` is now type-keyed: only checks whose sentences are variations on one template may
  collapse. **Six Drivers with no base read fine as six names; two unrelated sentences never do.**
- ⚑ **"NOBODY HAS EVER…" MUST COME FROM THE DOMAIN TABLE, NOT THE EVENT LOG.** The log started 2026-08-24. A
  zero count in `mission_event` means "nobody in the last two days" and reads as "nobody, ever" — a much
  weaker claim wearing the same words. `mission_release` and `document` go back to the beginning.
- ⚑ **THE FIRST LIVE RENDER IS THE DESIGN REVIEW.** A 23-name wall and a duplicated *"never consulted · never
  consulted"* both looked fine in the mockup and were obvious the second real data hit them. Screenshot the
  real page before calling a UI job done.
- ⚑ **`npm run build` STILL FAILS WHILE A DEV SERVER IS RUNNING** (S66 trap, hit again — the dev server on
  :3000 belonged to another session). CI is the honest build check; push a branch and read the run.
- ⚑ **THE CONSOLE MUST NOT USE THE SERVICE ROLE.** RLS already grants `app_role()='admin'` read on everything,
  so it runs as the signed-in admin. A console that bypasses RLS cannot be trusted to show what a real admin
  can see — and it would hide the day a policy breaks.

## ⚑ TRAPS LEARNED IN S67 — every one cost real time

- ⚑ **`computer{action:"type"}` DOES NOT LAND IN THE BOOKING FORM'S ADDRESS FIELDS.** They are prefilled with
  the Business's own address, the click leaves focus on `body`, and a typed string gets **spliced into the
  middle of the existing value** ("58 Bd de la Croisette Cs 40**Eden Roc**052…"). Triple-click, ⌘A and
  clicking by screenshot coordinates all failed. **`form_input` on the combobox ref works** and React picks it
  up. This cost several turns.
- ⚑ **A PROBE IS A CLAIM ABOUT THE REPO TOO, AND IT ROTS.** Two probes went red the moment S66 shipped, and
  neither was a code regression. D86's own `reclaim-live.mts` was 20/20 green throughout — the *old* probe was
  the only thing that noticed the change, and its red was misread as breakage.
  **When you change a rule: `grep -rl "<rpc_name>" .local/probe/` before closing the session.**
- ⚑ **NEVER ASSERT EQUALITY ON AN APPEND-ONLY TABLE.** `mission_event count === 1848` was guaranteed to go red
  on the first working day. It is a dated **floor** now. The direction worth guarding is rows *disappearing*.
- ⚑ **`mission_event` HAS NO FOREIGN KEY TO `mission`** (`2026-08-24_mission_event_log.sql:78`) — deliberate,
  the log outlives the trip. So deleting a mission **strands its events**: 221 of ~2 057 point at a mission
  that no longer exists, nearly all probe residue. `event-registry-live` prints the count every run. Probe
  `undo()` helpers now delete `mission_event` by recorded id.
- ⚑ **A PROBE THAT DIES MID-RUN LEAVES A TAGGED ROW, AND THE NEXT RUN CATCHES IT.** `accepted-fare.ts` failed
  its own *"no tagged stragglers"* check with one `AFPROBE` mission left over (and it carried an
  `accepted_fare`, which quietly changed the population). Deleted by tag + its events; the re-run is 20/20.
  **That straggler assertion is the safety net — never delete it to make a probe pass.**
- ⚑ **"ZERO ROWS" IS NOT PROOF OF A BUG — CHECK BEFORE ALARMING.** `accepted_fare` null on all 280 looks
  exactly like D86–D88. It is fine: wired, live since 2026-08-22, covered by `accepted-fare.ts`. Claude told
  the founder it was urgent and had to correct that. Read the call site before raising it.
- ⚑ **`lib/app-context.ts` CANNOT BE IMPORTED BY A TEST.** It imports `lib/supabase/server`, which reads env at
  module load — a test dies on *"Missing environment variable NEXT_PUBLIC_SUPABASE_URL"* before running a
  line, **and would die the same way in CI, which has no `.env.local`.** Pure logic goes in its own module
  (`lib/route-for.ts` now, beside `lib/pdp.ts` / `lib/rate-card.ts`). ⚑ `routeFor` being untestable is much of
  why D90 survived two months.
- ⚑ **The Google key is restricted to `*.kavenue.fr` + `localhost:3000` — the `*.vercel.app` origins are
  REFUSED.** Opening the app through a vercel.app URL gives a dead address box. Deliberate: a `*.vercel.app`
  wildcard would let any Vercel site spend the quota.
- ⚑ **OVH CNAME targets need the TRAILING DOT** or OVH appends the zone silently. Check the *Aperçu de
  l'enregistrement* line before adding. Vercel's target is **per-project** — read it off the panel, never from
  memory (`b995c589bd56b1fa.vercel-dns-017.com.` today).

## ⚑ TRAPS LEARNED IN S66 — every one cost real time

- ⚑ **TWO PROBES WENT STALE THE MOMENT S66 SHIPPED — fixed 2026-08-24 (S67), read this before writing another.**
  Both failed for the same reason, and neither was a code regression:
  - `event-registry-live.mts` asserted `mission_event count === 1848`. **An equality check on an
    append-only table fails on the first session that uses the app.** It is now a FLOOR (`>= 1848`),
    because the direction that needs guarding is rows *disappearing* — the table's own comment says
    *"Never UPDATE or DELETE a row here"*.
  - `migrations-2026-08-10.ts` case **P2 drove the reclaim from `status='accepted'`** — the exact dead
    gate D86 deleted hours earlier. It now starts from `confirmed` + never checked in at T−30min, and a
    new **P5** proves the other side (a Driver who DID check in keeps the trip), so the check-in clause
    cannot be dropped unnoticed. **61 → 63 checks.**
  ⚑ **The lesson: a probe is a claim too, and the session that changes behaviour must re-run every probe
  that touches it, not just the one it wrote.** D86's own `reclaim-live.mts` was green at 20/20 the whole
  time — the *old* probe was the only thing that noticed, and it was ignored because it looked broken.
  **When you change a rule, `grep -rl "<rpc_name>" .local/probe/` before you close the session.**

- ⚑ **`mission_event` has NO foreign key to `mission`** (`2026-08-24_mission_event_log.sql:78`) — deliberate,
  the log outlives the trip. Consequence nobody had measured: **221 of 1 959 events describe a mission that
  no longer exists**, mostly probe residue, because deleting a mission strands its events. `event-registry-live`
  now prints that number every run. Two things follow: the pre-launch sweep **must** include this table (already
  noted), and **the Activity console will meet events with no trip behind them** — design for it. Probe `undo()`
  helpers now delete `mission_event` by recorded id; that is not a violation of *"never delete"*, because those
  rows are the history of trips that never existed.

- **`.select()` IS SILENTLY CAPPED AT 1000 ROWS BY PostgREST.** The first read of `mission_event` showed five
  event types with **zero** rows — which reads exactly like "the trigger stopped firing" — when `en_route`
  alone had 172. **Any count over a table with >1000 rows must be `{ count: "exact", head: true }`.** A
  silent cap does not look like an error, it looks like an answer.
- **`npm run build` fails while `npm run dev` is running.** Both write `.next`, so the build reads a
  half-written manifest and dies with `PageNotFoundError: Cannot find module for page: /_not-found`. Stop the
  dev server and `rm -rf .next`. CI is unaffected (clean checkout).
- **Browser screenshots go blank after a JS scroll.** `window.scrollTo` leaves the capture surface unpainted.
  To see a row far down a list, **hide the others** (`style.display='none'`) so it lands at the top — do not
  scroll.
- **React owns the form's hidden inputs.** Setting `.value` on `pickup_lat` etc. is discarded on the next
  render. To test the booking form, **drive the real UI**: type into the combobox, click a suggestion.
- **"Post to the Pool" opens a confirm dialog** ("This is final"). A click that seems to do nothing has
  probably opened it — screenshot before concluding the button is broken.
- **`gh run list` can sit `queued` for 15+ minutes** on GitHub's side. Not a code problem. Background the
  wait (`run_in_background`) instead of blocking, and never post "still waiting" turns.
- **Decision numbers collide.** D83 was already taken by S64; S66 wrote D86–D88. **Check
  `grep -n "^### D" project/DECISIONS.md | tail -3` before numbering.**
- **The S64CURVE demo trips age out** and trip the gate every session. Refresh, don't delete:
  `node --experimental-strip-types .local/probe/s64curve-refresh.mts`.


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
