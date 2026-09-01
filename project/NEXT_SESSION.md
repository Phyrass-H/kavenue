# Prompt for the next Kavenue session

> Copy-paste the block below (from "We're continuing Kavenue" to the end) into a fresh
> Claude Code session. It orients a new Claude and sets the scope.

---

We're continuing Kavenue (B2B VTC booking marketplace).

---

## ⚑ § 4's OFFLINE GAP IS CLOSED (2026-09-01, S73) — and the Waybill lost its 1°–7°

`main` = **the S73 commits**, CI-green on a branch first. **857 → 873 tests. handoff-check 48 → 50.**
**No migration** — nothing for the founder to run.

A service worker (`public/sw.js`) keeps the Waybill for every HELD trip on the phone, refreshed on every app
open by `WaybillCacheSync` in the Driver layout. `/waybills` is the one page that opens with no signal and is
the worker's fallback for any other navigation. A saved copy carries two marks: app chrome (never prints) and
`Copie enregistrée le … à … h …` on the document (**grey, not amber** — founder). **No expiry** ([[d119]]).
Sign-out deletes the copies. The manifest finally ships icons — load-bearing, since an installed app keeps its
cache far longer than a browser tab.

⚑ **THE 1°–7° MARKS ARE GONE** from the document *and* from the refusal list ([[d122]], founder). Legally
free: the arrêté requires the seven pieces of INFORMATION, never its own numbering. Do not put them back
without asking.

⚑ **`handoff-check` grew two assertions (49, 50)** — the worker must be *registered by the app*, not merely
present in `public/`; and the manifest must name icons that exist. Both Rule-Zero'd. ⚑ The first was written
loose (`WaybillCacheSync` anywhere in the layout) and **stayed green with the render deleted**, because the
import line matched. It matches `<WaybillCacheSync` now.

⚑ **THE EXPLOITANT FIELDS WERE EMPTY ON EVERY DRIVER AND ARE NOW FILLED** (founder asked, same session).
All **13 Drivers clear `waybillGaps()`** — company name, registered address, REVTC and carte pro, plus two
SIRETs repaired that were not 14 digits and so yielded no SIREN. Before this the document had never rendered
against live data at all. ⚑ These are plausible test values, **not real registrations** — a real Driver fills
them in `/settings/company`.

⚑ **THERE WAS NO LIVE TRIP IN THE WHOLE DATABASE** (364 rows: completed/expired/cancelled/pooled), so the dev
seed left a few on `Demo Driver`, deliberately.

⚑ **AND THE SEED TOOL OWNS ITS OWN BUSINESS.** `/api/seed` creates **Carlton Cannes (seed)** with dispatcher
`Concierge Desk`, while `/api/dev-login?as=business` signs in as **Demo Desk → Hôtel Majestic Cannes**. A
seeded trip is therefore invisible on the Dispatch side, which cost the founder a confused ten minutes
(2026-09-01). Not a bug — but if you are checking one trip from BOTH sides, accept a trip belonging to
Hôtel Majestic Cannes, not a seeded one.

⚑ **iOS evicts the cache after ~7 days unopened.** Opening the app restores it. Print-to-PDF stays as the
belt-and-braces and its hint line stays on the document.

## ⚑ § 7's HOLD IS BUILT (2026-09-01) — and `docs/06` §7 now differs from it in two places
Shipped as `2026-08-31h` / `31i` / `31j`, all applied. **FIFTEEN seconds, not thirty** ([[d115]]) and a price
**FLOOR, not a freeze** ([[d116]]) — both the founder's calls, both deliberate departures from a LOCKED
section, both recorded. Voluntary: Accept is untouched and always there. ⚑ A spent hold blocks only a second
freeze, never the trip.

⚑ **`handoff-check` assertion 39 has done its job and now reads "built AND instrumented".** It stays armed:
if a future migration adds hold machinery without `hold_taken`/`hold_lapsed` in `lib/mission-events.ts` AND
the `mission_event_type` registry, it goes red again.

⚑ **THE ACCEPT PATH IS `accept_mission_call`, NEVER `accept_mission`** (31g). The raw name returning 42501 to
a browser session is the wall, not a fault — S72 misread exactly that and nearly restored the grant
([[d118]]). `.local/probe/column-leak.mts` and `handoff-check` call the raw names on purpose.

## ⚑⚑ RULE ZERO — MAKE IT GO RED ON PURPOSE BEFORE YOU TRUST THE GREEN

**Read this before the § 0 gate. It is the rule that catches the bugs the gate cannot.**

A check that passes tells you one of two things, and you cannot tell which by looking:

- the thing you built works, **or**
- the check is asking the wrong question and would pass no matter what

**It is a smoke alarm.** Silence might mean no fire, or a dead battery. The only way to know is to press the
test button. So: **break the thing the check is meant to catch, watch it go red, read the message, then
unbreak it.** Thirty seconds. Only after that does the green mean anything.

Three steps, and step 2 is the whole point:

1. break the exact thing the check exists to catch
2. **watch it go red — AND READ WHAT IT SAYS.** It must name the right thing. A red for the wrong reason is
   just a different lie
3. unbreak it, watch it go green

### ⚑ S72 HIT THIS FOUR TIMES IN ONE DAY. Every one was, technically, a green.
1. **A migration that ran perfectly and changed nothing.** `revoke select (ceiling) on mission` returned
   success — no error, no warning — and the column stayed readable. Three migrations in a row did this. Only
   re-running the probe and reading the values found it.
2. **A probe knocking on a door that had moved.** After the walls went up it printed four `BROKEN` lines, on a
   database behaving exactly as designed. The code was right; the *check* was out of date.
3. **A test that passed for a reason unrelated to what it tested.** *"The Driver can't read the Ceiling"* — true,
   but only because the database said *"Not your mission"* first. The wall itself was never exercised. Nobody
   had pressed the button, so nobody knew the alarm was unplugged.
4. **A CI check that was green about the previous commit.** `gh run list --limit 1` returned the newest run,
   which right after a push is often the one BEFORE yours — already passing. Pushed to `main` on the strength
   of it; the ruleset refused, correctly.

> ⚑ **The founder asked for this to be explained properly, with examples, in the next session** (2026-08-31) —
> they are not a developer and want to be able to judge for themselves whether a green means anything. Do not
> assume the four cases above are self-explanatory; walk through one end to end when asked.

---


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
- `project/SESSION_LOG.md` — skim the **newest entry (Session 71)** for recent technical detail; S65 behind it
  is the growth limit + the event log. Older sessions (1–33) are in `project/SESSION_LOG_ARCHIVE.md` — don't
  open it unless you need deep history.
- `project/DECISIONS.md` — **read D99 – D108** (S71's ten). They are the reasoning behind everything the
  Activity Console now does, and three of them ([[d102]], [[d105]], [[d108]]) are the traps that cost the most
  time. The tables below are only their summary.

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

## WHERE WE ARE (2026-09-01, end of S72)

`main` = **`0de4c6b`**. CI green on every push. **815 → 857 tests. handoff-check 38 → 48.**

⚑ **TWO SESSIONS RAN S72 SIDE BY SIDE** against the same `main` and the same database — the Waybill and the
hold in one, the money walls in the other. Both landed. Read § THE COLLISION before assuming either half is
the whole story; the short version is that they collided three times and every collision was survivable only
because someone checked.

### ✅ Shipped in S72 — this session's half, in the order the founder asked for it

**1 · The Waybill** (`31a` · `31b` · `31c`). The *justificatif de réservation préalable* a Driver shows at a
roadside check — the seven mandatory mentions of the **arrêté du 6 août 2025**, in the law's own 1°–7°
numbering. ⚑ *"Feuille de route" is not a term in VTC law*; the document carries the legal title.
⚑ **It REFUSES rather than printing a blank line** ([[d110]]): a justificatif with an empty 2° is a dated
admission of non-compliance produced by us, and the penalty rose to 3 years / €45 000 on 27 June 2026.
⚑ Kavenue is never in fields 1°–3° ([[d111]]). The price is the **Course** and sits LAST ([[d112]]) — not
because the Business would learn anything (they already see it) but because the **Guest** is standing there
and the Business resold them the ride at its own margin.
⚑ **The car had a bug under it** ([[d113]]): `mission` had no `vehicle_id`, so four readers each derived a
different car from the Driver *as of today*. Fixed by a trigger on `driver_id`, NOT a line in `accept_mission`
— accept is not the only way a trip changes hands, and a re-pool would have left a stale plate.

**2 · The 15-second hold** (`31h` · `31i` · `31j`), `docs/06` §7, now SHIPPED and rewritten to match.
Voluntary · 15 s not 30 · a price **FLOOR** not a freeze ([[d115]]–[[d117]]). ⚑ The hold spends the hold,
never the trip. ⚑ Its events shipped in the same commit because a lapse leaves no row behind — `hold_lapsed`
is `source: 'derived'`, stamped when the clock ran out, with `notice_lag_s`; `hold_void` is kept separate
because only one of the two is a price rejection.

### ⚑⚑ THE ONE TO CARRY OUT OF THIS HALF — I nearly undid a security fix
I reproduced `accept_mission`, saw `42501 permission denied` as a real Driver, concluded my `create or
replace` had dropped the grant, and **told the founder to run `grant execute … to authenticated`**. The
parallel session stopped them. The revoke was theirs, deliberate, hours old: a SECURITY DEFINER **composite
return is not subject to column privileges**, so `returns mission` handed a Driver the Ceiling through the
morning's walls. **The refusal was the wall working.**

⚑ **My checkout was thirteen commits behind and I never checked.** `git fetch` costs a second. Before
concluding the database is broken, confirm the repo is current — [[d118]].
⚑ **Every service-role probe stayed green throughout.** The service role bypasses ACLs; that seat is
structurally blind to permission bugs. Assertion: `handoff-check` now signs in as a real Driver and asserts
the INVERSE — the raw money RPCs must STAY refused, the wrappers must work.
⚑ **THE ACCEPT PATH IS `accept_mission_call`.** Five older probes were repointed (`accepted-fare`,
`accept-floor`, `reclaim-live`, `write-test`, `event-registry-live`); `column-leak` and `handoff-check` call
the raw names ON PURPOSE.

### 🔴 WAITING ON THE FOUNDER — nothing here is blocked on Claude
1. **The last-seen tracker.** Approved, deliberately deferred to **launch week** — today it would count Claude
   and the founder's own testing. One table (`person_id`, `day`, a DATE not a timestamp so per-session timing
   is impossible by construction), one upsert in the app layout, one in Dispatch. It buys DAU/MAU and
   "how many who came took a trip". ⚑ Explained to the founder 2026-09-01; they asked what DAU/MAU means, so
   lead with the plain version.
2. **The honest denominator, designed and unbuilt.** "How many opens before a trip" blames the DRIVER for
   what is usually a property of the POOL. Record what their Pool actually HELD that day and the number splits
   into "came and found nothing" (supply) vs "came and passed" (pricing).
3. **`docs/01`:28 still says "7 mandatory fields"** and now they are enumerated in `lib/waybill.ts` — worth
   pointing the doc at the code.
4. ~~**The offline gap on the Waybill.**~~ ✅ **DONE 2026-09-01 (S73)** — service worker + `/waybills` +
   the saved-copy stamp + the app icons. Print-to-PDF kept as the belt-and-braces ([[d119]]).
5. **§ Y / § AH / the VAT-per-group question** from the parallel half — see its sections below.

### 🎯 IF THE FOUNDER HAS NO PREFERENCE
The Waybill's **offline story** is the one with a real person on the other end of it. After that, § 5's
embarrassing details (the Driver's photo and languages shown to nobody, `manifest.webmanifest` shipping
`"icons": []`). The analytics page stays last and still needs the trackers above.

---

## WHERE WE ARE (2026-08-31, mid-S72 — the money walls half)

`main` = **`5ee1a3c`** (`69f3742` is the last commit with CODE in it; this one is the handoff).
Deployed and Ready on Vercel. **815 → 842 tests. handoff-check 38 → 45.**
**Two sessions ran S72 side by side** against the same `main` and the same database — the Waybill in one, the
money walls in the other. Both landed; read § THE COLLISION below before assuming either is the whole story.

### ✅ Shipped in S72 — the money walls
`docs/06 §3` says *"The Business never sees `driver_net` or the Driver-side rate."* Until this session the only
thing enforcing that was **which columns the UI chose to render**. Five doors, all watched open first and shut
after — `.local/probe/column-leak.mts`, **0 LEAK(S) OPEN · 18 closed · 0 broken**.

| door | how it is shut |
|---|---|
| Business → `mission.commission_driver_rate` | `mission_read`, one security-definer view masking by `app_role()` |
| Driver → `mission.ceiling` on a POOLED trip | same view; the Pool price is computed server-side, `lib/pool-fares.ts` |
| Business → `ledger_transaction.driver_net` | `p_ledger_read` narrowed to Driver + admin. Empty table, no writer — the cheap moment |
| both → the live `commission_rate` card | policy narrowed to dispatcher + admin; `driver_rate_ht` walled |
| Driver → `rate_card` + `mission_price()` | ⚑ **the Ceiling's back door** — recomputable from distance. One policy shuts table and function together |
| nine `returns mission` RPCs | EXECUTE revoked; nine `*_call` wrappers return `void` |

**Also shipped, from the founder reading the money themselves:** the Business's bill is now grouped by **what
each amount pays for** — each item carries its own fee and VAT, so the row's headline (the trip WITH its fee)
appears in the table meant to explain it instead of being an orphan. One item renders exactly as §3's flat
three lines always did, so 158 of 264 completed trips are unchanged on screen. ⚑ The last group absorbs the
cent: per-item rounding disagrees with the pooled total on 21 of the 106 trips with waiting, and an invoice
whose lines do not add up is wrong however defensible the arithmetic. `billGroups()` in `lib/commission.ts`;
pinned over 4 000 combinations. ⚑ **Flagged, not decided:** §3 says three lines never collapsed, and grouping
splits the fee across two — separable and reclaimable, but a change to the written invoice shape.

**Six migrations, applied in order:** `..._walls_1_view` · `..._walls_2_close` · `31d ..._3_the_revoke_that_did_nothing`
· `31e ..._4_the_same_no_op_again` · `31f guest_ready_at_the_revoke_made_real` · `31g rpc_returns_nothing`.

### ⚑⚑ THE RULE UNDERNEATH — the one thing to carry out of S72
**On this database a column-level `REVOKE` is ALWAYS a no-op.** Supabase ships
`grant all on all tables in schema public to authenticated`, so a *table-level* grant already covers every
column, and `revoke select (c) on t from authenticated` takes away a *column-level* grant that was never made.
It is not an error. It is not a warning. **It succeeds and does nothing.**

Walling a column means: `revoke <priv> on t from authenticated`, then `grant <priv> (the ones you keep) on t`.

⚑ It cost **three** migrations to learn — parts 2, 3 and 4 — and every one of them *ran successfully*.
⚑ And it had been wrong in this repo since **2026-07-19**: `revoke update (guest_ready_at)` was inert for six
weeks while the file claimed two locks. Fixed in `31f`.
⚑ **`handoff-check` now fails on the SHAPE, not the instance** — it reads every migration and flags any
column-level revoke that no table-level revoke backs up. That is the assertion, not this paragraph.

## WHERE WE ARE (2026-08-30, end of S71)

`main` = **`ec32cfb` plus the S71 close commits** — `git log --oneline -8` for the rest. Each was CI-green on a
branch before the push. **700 → 815 tests. handoff-check 32 → 38.**

### ⚑ THE GATE IS FULLY GREEN FOR THE FIRST TIME IN A WHILE
Every probe passes, including `dataset-audit` (30 · 0), which had been red since before this session started —
see [[d108]]. Run the § 0 gate anyway; that is the point of it.

### ✅ Shipped in S71 — the founder's whole list, in their order
| | |
|---|---|
| **the vocabulary** | *"stop saying hotels"*. Gone from the console; **`CLAUDE.md` hard rule #1 now forbids it** |
| **business types** | nine, incl. `vtc_company` — an operator posting overflow is a customer. `lib/business-type.ts` |
| **the enrollment gate** | type + reception phone + billing email before a trip goes live. Bites at POST, never sign-up; a draft is never blocked ([[d99]]) |
| **the French register** | sign-up fills itself from `recherche-entreprises.api.gouv.fr` — free, keyless, France-only. Reads the ESTABLISHMENT, not the head office |
| **Businesses at 25 000** | breakdown IS the navigation; arithmetic in SQL ([[d100]]) |
| **Drivers, cars, classes** | the twin ([[d102]]) |
| **gender** | optional, four values, decides nothing — and a probe enforces that ([[d101]]) |
| **periods** | All time by default, from day one. Months sum exactly to the whole ([[d103]]) |
| **the 1 000-row cliff** | six reads paged; the gate proves the cap live ([[d104]]) |
| **`post_blocked`** | `business_event`, the funnel's first step ([[d106]]) |
| **the main page** | the September lie fixed, two new figures ([[d105]]) |
| **Range** | the app's own calendar, third caller ([[d107]]) |

### 🔴 WAITING ON THE FOUNDER — nothing below is blocked on Claude
These are decisions, not tasks. **Ask, do not assume.**

1. **THE DESIGN LOCK — three changes still unapproved.** The written decision for all seven console screens,
   published as an Artifact (`8cac11c8-73a4-4411-9b07-0adc30e0cd0d`). Five of its seven screens were ratified
   as they stand; two of its five proposed changes got built during S71 anyway. **The three left:**
   - **Move "Worth a look" ABOVE the numbers on `/admin`.** The stylesheet already says a finding must never
     be out-shouted by the band — and then renders the band first. A number is the same at 9am and 5pm.
   - ⚑ **CHECKED IN S72 AND DECLINED FOR NOW — but it grew a second half.** The founder opened a completed
     trip, saw `Accepted at 19,78 €` above `Transport 17,20 €`, and asked why. Both are correct; every number
     was recomputed from the live row and the old and new commission paths agree to the cent. **The row and
     the card are not just unlabelled — they are in DIFFERENT BASES and DIFFERENT SCOPES:** the row prints the
     agreed fare *with Kavenue's fee inside and the waiting excluded*, the card builds up from the bare fare
     *with the fee added at the bottom and the waiting included*. 19,78 + 7,59 = 27,37 either way.
     ⚑ And `components/trip-row.tsx:369`'s own comment claims the table "can never total something other than
     the figure at the top of the row" — **it still can, by exactly the waiting.** Half that fix landed and the
     comment says both halves did. A proposed labelling (`Agreed 19,78 €` / `Billed 27,37 € · incl. waiting`)
     was previewed and **declined — the founder is satisfied the money is right.** ⚑ Worth re-raising ONLY with
     the argument that was made and not answered: *the founder understands it after four messages of
     explanation; a Dispatcher at the hotel will never get that explanation.*
   - **Trip rows should say WHICH money they show.** Every row on every list prints the **Ceiling** — the most
     the Business would ever pay — unlabelled, even on a finished trip, where the true number is what it went
     for. Proposed: `Ceiling 120 €` while looking, `Went for 74 €` once taken, nothing on a cancelled row.
   - **(the third, the 1 000-row fix, is DONE — [[d104]].)** So it is really two.
2. **`Marc Fontaine`'s gender is `man` in the database** because S71 set it to prove the breakdown renders.
   Founder was told twice and has not said either way. **Clear it or keep it.**
3. **The booking funnel's other three events** — `started` / `abandoned` on the booking form (`posted` already
   exists as `mission_event.pooled`, trigger-guaranteed — do NOT duplicate it). Needs client instrumentation,
   and needs the founder to agree it is not the browsing they cut in S66.
4. **The "last seen" tracker** — one write per person per day, for DAU/MAU. Asked for in S66, never built.
   ⚑ Records THAT they came, never what they looked at — that distinction is what made it acceptable.

### 🔴 ASKED FOR IN S72 — VAT PER GROUP, BEFORE THE EXTRAS ARRIVE
The founder's own framing, 2026-08-31, immediately after the grouped bill shipped: *"I want to make sure that
the VAT — by doing groups like we just did — has to be different for transfers, at disposal, waiting time. Is
it 10 or 20 %? I want to make sure that once we have all the extras the code is ready to create groups like
that."* They are right, and the code is **not** ready. Here is exactly why.

**What the grouped bill shows today, and why it is safe.** Each group carries the fee and the VAT **on the
fee** — `commission_vat_rate`, 20 %, which is VAT on *Kavenue's own service* and is the same on every group by
definition. **No transport VAT appears on the Business side at all** (docs/06: a Business cannot reclaim VAT on
passenger transport, so it is not actionable on screen). So grouping is correct as shipped. The problem starts
the day the **invoice document** lands, because §3 puts the transport VAT rate on it.

**⚑ THE STRUCTURAL FINDING: `mission.transport_vat_rate` IS ONE RATE PER MISSION, NOT PER ITEM.**
- The live card holds a single `commission_rate.transport_vat_rate = 0.10`.
- The mission column is written by a trigger when a Driver is attached
  (`2026-08-17_transport_vat_snapshot`): `0.10` if they are VAT-registered, `0` under *franchise en base*,
  NULL if nobody holds it yet. Live spread today: **294 rows at 0, 70 NULL** — not one at 0,10.
- It is READ in exactly ONE place: `components/mission-run-view.tsx:179`, the Driver's "what you keep" note.

⚑ **So that column answers "is this Driver VAT-registered?", NOT "what rate does this kind of supply carry?"**
Two different questions in one column. A trip whose transfer is 10 % and whose waiting is 20 % cannot be
expressed by it at all.

**The shape that would work** — the rate belongs to the ITEM, and registration is a separate multiplier:

    effective rate = (rate for THIS supply type) × (does this Driver charge VAT at all)

so `billGroups()` grows a `vatRate` per group, and the card grows a rate per supply type instead of one number.

**⚑ AND THE FIVE QUESTIONS ONLY THE FOUNDER CAN ANSWER — do not guess these, they are tax, not design:**
1. **Transfer** (A → B passenger transport) — 10 %?
2. **At disposal / mise à disposition with driver** — 10 %, or 20 % because it is a hire rather than a journey?
   ⚑ `mission_type` is **100 % `transfer`** on all 364 live rows, so nothing has ever exercised this.
3. **Waiting time** — does it follow the transport as an accessory supply, or is it a separate service at 20 %?
4. **No-show** — a supply at all, or compensation?
5. **Cancellation fee** — docs/06 §1 already calls the Driver's penalty an *indemnity*. An indemnity is
   normally **outside the scope** of VAT, which on an invoice is **not the same as a 0 % line**.

⚑ 4 and 5 matter more than they look: "outside scope" means **no VAT line at all**, and `billGroups` currently
gives every group the same shape.

**When it becomes urgent:** the day invoicing ships, or the day the first at-disposal trip is posted —
whichever comes first. Not before. Nothing on screen today is wrong.

### 🎯 IF THE FOUNDER HAS NO PREFERENCE, the honest next jobs
- **§ 4 THE BOOKING VOUCHER** — real Drivers get stopped by police. ⚑ The founder does not remember the "7
  mandatory fields" and asked to **START FRESH — do not lead with the arrêté**. Ask for their list first, then
  reconcile with `docs/01_Legal_VAT_Compliance.md:28`. `booking_voucher` is an empty table no code touches.
- **§ 5 THE EMBARRASSING DETAILS** — the Driver's **photo and languages are shown to nobody** while two
  shipped strings promise otherwise · `manifest.webmanifest` ships `"icons": []` · no welcome banner, no FAQ ·
  `field_of_activity` and `business_type` still both exist (the app now only writes the second).
- **§ 6 THE ANALYTICS PAGE** — last, deliberately. It needs the trackers above to say anything new; the
  console already answers most of what it would.

### ⚑ THE PATTERN, NOW ELEVEN — and S71 added the sharpest three
D86 · D87 · D88 · D90 · two in D91 · D92 · and now:
- ⚑ **[[d102]] — COPYING A SCREEN COPIES ITS ASSUMPTIONS.** "Filled" means *a Driver was found*, which is the
  Business's question. Every trip a DRIVER holds was accepted by that same Driver, so the copied column would
  have read ~100 % on every row forever, looking like a measurement.
- ⚑ **[[d105]] — A CHART KEYED ON `pickup_at` HAS A FUTURE.** The home screen said *"5 trips last month, down
  from 147"* on 30 August, describing **September**. Not slightly wrong — inverted.
- ⚑ **[[d108]] — A CHECK WHOSE PREMISE IS "RECENTLY" REPORTS THE CLOCK.** Red since before the session began,
  for no reason but elapsed time.

> **And the meta-lesson, which arrived three times in one day wearing three disguises:** a guard reading
> `data ?? []` over a FAILED query went green; a probe comparing sorted rows with `JSON.stringify` reported
> four failures that were not real; and a planted violation was rejected by the database, so the check
> "passed". **All three looked like results. A check is only evidence once you have watched it fail on
> purpose.**

### ⚑ BOOKED IN S72 — THE HOLD SHIPS WITH ITS EVENTS, OR NOT AT ALL
⚑ **SUPERSEDED 2026-09-01 — THE HOLD IS BUILT** (§ above, [[d115]]–[[d117]]); `docs/06` §7 now reads 15 s and
a price FLOOR. The rule below is why the guard exists and why it stays armed, and is kept verbatim because it
is the clearest statement of the principle this project keeps rediscovering.

`docs/06` §7's **hold was NOT BUILT when this was written** — it was step 4 of that doc's own build order, logged
"not done, on purpose" in S64. ⚑ **The founder believed it was already live** (S72). That belief is exactly
how a feature ships bare.

**The rule, now enforced by `handoff-check` assertion 39:** a hold ends by commit — which leaves a
`confirmed` row behind — or by lapse, and **a lapse leaves nothing**: no status transition, so no trigger,
and nothing runs at T+15 s to witness it. So the hold's events (`hold_taken`, `hold_lapsed`) go in the
**same commit as the feature**, never a session later. Every lapse before that is lost for good.

The guard is silent while the hold does not exist and goes red the moment it does without its events. It
checks the accept path **and** `docs/migrations/` for hold *identifiers* (never the word — "hold" is
ordinary English and the spec is full of it), **plus the live DB column**, since the founder applies
migrations by hand hours before the repo mentions them. Both halves are load-bearing: the vocabulary in
`lib/mission-events.ts` **and** the `mission_event_type` registry row. ⚑ Verified by planting a hold
migration and watching it go STALE — twice, once with the vocabulary missing and once with the vocabulary
present but the registry empty.

⚑ **S72 SHIPPED THE WAYBILL ON TOP OF THIS** — `docs/migrations/2026-08-31a/b/c`, all three applied. `c` is a
`before update of driver_id` trigger and NOT a change to `accept_mission`, which stays untouched ([[d113]]);
`handoff-check` asserts no migration ever writes `vehicle_id` from inside that RPC.

⚑ **TWO `handoff-check` CLAIMS ARE RED AND BELONG TO THE PARALLEL RLS TASK** (`mission_read` view, spawned
2026-08-30). They were written red-first and the view does not exist yet. Not S72's, not a regression — but do
not build on top of them until that task lands.

⚑ **This is the ONLY measurement on the board that cannot be collected backwards.** Presence, conversion
and time-to-accept can all start counting whenever someone gets to them. That asymmetry is why this was
booked before the Waybill rather than queued behind it.

### 🔒 STILL DECIDED, do not re-open
Everything in the S66 table below, plus:
- **`vtc_company` is a Business type**, not a Driver. An operator with more trips than cars is a customer.
- **Bank details are NOT in the posting gate.** `PAYMENT_GATE_ON = false` with a test asserting it. Stripe is
  not wired; gating on it would stop every Business posting. One line the day Stripe lands.
- **The S70 city strip was REFUSED** — `/admin/businesses` now carries régions ▸ cities, so by [[d98]]'s own
  test it no longer earns the home page.
- **No CHECK constraint on `business_type` or `driver.gender`** — the app narrows, `handoff-check` detects.
- **Breakdown COUNTS are a census; TRIPS are activity** ([[d103]]). Do not make a count follow the period.

### 🅥 PARKED — do not raise unprompted
- **§ AH · the check-in loophole** (founder raised it, wants it later). Four options written up, none chosen.
- **§ V** (lower-class opt-in) → V3+. **The stranded Classe V is NOT a bug to fix.**
- **§ AF** aggregate demand sensing — unmeasurable at 13 Drivers.
- **`pickup-marketplace.vercel.app` is still live** under La Poste's trademark. Founder's call, § AD.
- Notifications / payments / real auth / flight tracking — the founder's standing phase rule.

### 🧹 BEFORE REAL LAUNCH
`.local/seed/bleach.mts --confirm` — ran 2026-08-26, removed 3 210 rows. ⚑ Read its KEEP list before running
it again; that list is the whole safety of the thing. ⚑ It deletes the accounts 15 live probes sign in as —
run `seed-probe-accounts.mts` straight after. ⚑ **And `.local/seed/backfill-business-places.mts`**, which is
the only thing that gives the seeded Businesses a city/région.

### 📋 V1 COMPLETENESS
**38 KEEP features in Doc 02: 27 built · 8 partial · 3 missing.** Nothing on the critical path is unbuilt.
GDPR consent capture + account deletion are still absent — **founder-owned, do not gate on it**.

---

## ⚑ 0 · VERIFY BEFORE YOU BUILD — THIS IS A GATE, NOT A SUGGESTION

A handoff is a *claim about the repo*, and claims decay. Run this first:

    node --experimental-strip-types .local/probe/handoff-check.ts

**50 assertions**, ending `The handoff still matches reality. Proceed.` Anything `STALE` means this file lies
about that point — **fix the file before you build on it.** Then:

    npx tsc --noEmit && npx vitest run          # expect 873 passing
    node --experimental-strip-types .local/probe/diff-sql-vs-lib.ts     # 1 949 · ALL AGREE (slow, ~4 min)
    node --experimental-strip-types .local/probe/write-test.ts          # 170 · ALL AGREE
    node --experimental-strip-types .local/probe/curve-live.ts          #   8 · ALL AGREE
    node --experimental-strip-types .local/probe/accepted-fare.ts       #  20 · ALL AGREE
    node --experimental-strip-types .local/probe/reclaim-live.mts       #  20 · D86 end to end
    node --experimental-strip-types .local/probe/event-registry-live.mts #  16 · D87 registry
    node --experimental-strip-types .local/probe/migrations-2026-08-10.ts   # 63 · 0 failed
    node --experimental-strip-types .local/probe/migrations-2026-08-11.ts   # 23 · 0 failed
    node .local/probe/google-places-live.mjs                             #   8 · D89 address box
    npx tsx .local/probe/eligibility-live.mts                            #  33 · ⚑ tsx, NOT node
    npx tsx .local/probe/dataset-audit.mts                               #  30 · 0 failed ([[d108]])
    npx tsx .local/probe/accept-floor.mts                                #   6 · the § H2 residual
    npx tsx .local/probe/column-leak.mts                                 #   S72 · expect 0 LEAK(S) OPEN
    npx tsx .local/probe/hold-live.mts                                   #  31 · § 7 end to end (⚑ uses accept_mission_call)
    npx tsx .local/probe/sweep-orphans.mts                               #  ⚑ after any live-probe session

**If a probe fails, that is the job** — not whatever is queued above.
⚑ **RUN THE LIVE PROBES ONE AT A TIME** — several assert a mission-count baseline and see each other's rows.
⚑ **When you finish, do the same to your own handoff**, and **add an assertion for anything that bit you**.

---

## ⚑ TRAPS LEARNED IN S73 — THREE GREENS, ALL LYING, ALL IN ONE SESSION

⚑ **1 · A STAMP THE SERVICE WORKER INJECTS DOES NOT SURVIVE REACT** ([[d120]]). A cached page HYDRATES:
React reconciles the real DOM against its own component tree and deletes every node the worker added.
**The same code passed and failed the same test thirty minutes apart** — the first offline run had a second
bug in it (the Next stylesheet cached under a `?v=` key and looked up without one), so nothing hydrated and
the stamp was THERE. Fixing the stylesheet made the page hydrate and the stamp vanished. *The first green was
produced by the bug.* Anything a service worker adds to HTML in this app is temporary by construction.

⚑ **2 · `navigator.onLine` IS NOT "CAN I REACH KAVENUE"** ([[d121]]). It reports whether the device has *a*
network. With the dev server off it was **true**, and the saved list said *"Up to date. Your 2 trips will open
without signal."* Use `reachable()` in `lib/offline-waybill.ts` — a real request — anywhere the answer is a
promise to the Driver.

⚑ **3 · A CHECK THAT MATCHES AN IMPORT IS NOT CHECKING THE FEATURE.** The new assertion 49 tested for
`WaybillCacheSync` anywhere in the layout. Deleting the render left the import, and it stayed green with the
feature switched off. Match the *call site* (`<WaybillCacheSync`), not the name.

⚑ **4 · ON THIS APP, CACHE EVERYTHING BY PATHNAME, QUERY STRIPPED.** `next dev` serves
`/_next/static/css/app/layout.css?v=<timestamp>` with a NEW timestamp per rebuild. Keeping the query files one
copy per rebuild *and* misses on lookup — the saved document came back with the right words in Times New
Roman. In production the filename carries a content hash, so the pathname IS the version.

⚑ **5 · A SERVICE WORKER MUST NEVER KEEP A REDIRECT.** A redirect to `/login` is a 200 by the time `fetch`
resolves it. `keepable()` checks `res.ok && !res.redirected && res.type === "basic"` — caching the other kind
hands a Driver a login screen at a roadside check.

⚑ **6 · THE SCREENSHOT IS PART OF THE TEST.** Trap 1 was found by *looking at* an offline render, not by any
assertion. Both DOM probes said the document was there and both were right. "It rendered" and "it rendered as
the document we designed" are different questions.

---

## ⚑ TRAPS LEARNED IN S72 — THE WAYBILL AND THE HOLD

- ⚑ **A PERMISSION ERROR IS NOT PROOF THAT YOU BROKE SOMETHING.** Before concluding the database is broken,
  `git fetch` and check the repo is current. Thirteen commits behind, and the error was another session's
  deliberate wall. [[d118]] — the fullest version of this is worth reading before touching an RPC.
- ⚑ **A FUNCTION IS FOUR THINGS AND `pg_get_functiondef` PRINTS ONE.** Body, owner, `search_path`, ACL.
  `create or replace` preserves all four; `drop` + `create` (needed to change a return type) resets EXECUTE to
  the PUBLIC default. State grants explicitly in both directions.
- ⚑ **A SERVICE-ROLE PROBE CANNOT SEE A PERMISSION BUG.** It bypasses ACLs. Anything about who may do what
  must sign in as a real Driver / Dispatcher.
- ⚑ **A PROBE FAILURE IS AS LIKELY TO BE THE PROBE.** Two hold checks went red because the fares they used
  (40, 45) sit BELOW this template's rate-card floor of 51.25, so the pre-existing clamp raised them. The
  clamp was right. It now has its own deliberate assertion instead of being something other checks trip over.
- ⚑ **A CHECK THAT LEAVES STATE BEHIND BREAKS THE ONES AFTER IT.** One hold at a time is a partial UNIQUE
  index; a probe that held and never released produced nine red lines with one cause.
- ⚑ **ORPHANED EVENTS DRAG A RATIO.** `mission_event` has no FK, so every probe mission deleted leaves its
  `created` row and pushes "≥ 2 observed events per trip" under 2 on a healthy trigger.
  `npx tsx .local/probe/sweep-orphans.mts --delete` after any live-probe session.
- ⚑ **WRITE IS NOT VERIFIED UNTIL THE ROW IS READ BACK** (S71's, earned again on the Driver company fields).
- ⚑ **`.next` IS SHARED BETWEEN WORKTREES.** Two concurrent builds produce `routes.d 2.ts`-style duplicates
  that `tsc` reports as `Duplicate identifier` in code nobody wrote; `rm -rf .next` then breaks the other
  session's dev server with `ENOENT routes-manifest.json`. Neither is a code fault and both look like one.
- ⚑ **THE DECISION LOG HAS NO LOCK.** Two sessions both appended a `D109` on the same day. Claim your numbers
  before writing when another session is live.

## ⚑ TRAPS LEARNED IN S72 — THE MONEY WALLS

- ⚑ **WAITING FOR CI MEANS WAITING FOR *YOUR* SHA.** `gh run list --limit 1` returns the newest run, which on a
  branch you just pushed is often still the PREVIOUS commit's — already `completed success`. A poll that breaks
  on that pushes to `main` before this commit has been checked, and the ruleset correctly refuses it. Filter by
  `headSha` and wait for a run that exists FOR your commit:

      SHA=$(git rev-parse HEAD)
      gh run list --branch <b> --limit 8 --json status,conclusion,headSha \
        -q ".[] | select(.headSha==\"$SHA\") | .status"

  Same family as everything else this session: a green that was true, about the wrong thing.
- ⚑ **A BACKTICK IN A `git commit -m` STRING IS COMMAND SUBSTITUTION.** ``all 364 live missions are `transfer` ``
  committed as "…live missions are ." with the word silently gone, and `transfer: command not found` scrolling
  past in the output. Use `git commit -F -` with a QUOTED heredoc (`<<'MSG'`) for any message containing
  backticks — which, in this repo's commit style, is most of them.

- ⚑⚑ **A COLUMN-LEVEL `REVOKE` IS ALWAYS A NO-OP HERE.** See § THE RULE UNDERNEATH above. Three migrations and
  a six-week-old inert guard. **`handoff-check` assertion 45 now catches the shape** — watched red on a planted
  `revoke select (driver_net) on ledger_transaction`, green with it gone.
- ⚑ **A COLUMN PRIVILEGE IS PER POSTGRES ROLE. A DRIVER AND A DISPATCHER ARE THE SAME ROLE** (`authenticated`).
  A revoke hides a column from BOTH audiences and can never say "this side but not that one". That needs a
  view. [[d114]]
- ⚑ **A SECURITY DEFINER FUNCTION'S COMPOSITE RETURN IGNORES COLUMN PRIVILEGES.** Nine `returns mission` RPCs
  handed the other side's money back THROUGH the closed table. Closed by revoking EXECUTE and adding `*_call`
  wrappers that return `void` — **the bodies were not touched**, because reproducing the cancel-fee bands and
  the waiting meter to change a return type is how a correct system acquires a silent defect.
- ⚑ **REVOKE EXECUTE BY LOOPING OVER `pg_proc`, NEVER BY A HAND-WRITTEN SIGNATURE LIST** — adding a parameter
  creates an OVERLOAD, and PostgREST resolves by the arguments the CLIENT sends.
- ⚑ **POSTGRES CHECKS COLUMN PRIVILEGES *BEFORE* ROW TRIGGERS FIRE.** That ordering is what proved
  `revoke update (guest_ready_at)` was dead: the refusal came back as the TRIGGER's sentence, not
  "permission denied". Use it to tell a real privilege from a guard standing in for one.
- ⚑ **A `security_invoker = false` VIEW SEES NOTHING AS THE SERVICE ROLE** when its WHERE is written in
  `app_role()` / `current_*_id()` — all NULL there. It returns ZERO ROWS rather than an error, the most
  misleading answer a query can give. `mission_read` is granted to `authenticated` only.
- ⚑ **HIDING A NUMBER THE UI COMPUTES FROM MEANS MOVING THE COMPUTATION.** `currentFare()` climbs TO the
  Ceiling, so masking it breaks the Pool card. `lib/pool-fares.ts` computes it server-side from ids the
  caller's own RLS read returned; `PoolMissionRow` types the masked columns `null` so the compiler refuses.
- ⚑ **`ratesOf` REQUIRED ALL THREE RATES**, which silently means "no commission charged" the moment one is
  masked — a Business would have seen **190,00 € where it owes 218,50 €**. Use `businessRatesOf` /
  `driverRatesOf`; their narrowed return types make reading the wrong half a compile error. `ratesOf` /
  `splitFor` are ADMIN and service-role only.
- ⚑ **MASKING ONE DOOR IS THEATRE WHILE ANOTHER IS OPEN.** `commission_rate` AND `rate_card` were both
  `to authenticated using (true)`, so the Driver rate and the Ceiling were both reachable without touching
  `mission` at all. Ask what ELSE answers the same question before congratulating yourself on a wall.
- ⚑ **THE MIGRATION ORDER IS REVERSED FROM THE USUAL ONE.** Normally a new column breaks the WRITE path until
  the migration lands. A revoke breaks the READ path until the app half is DEPLOYED. `31g` in particular kills
  nine buttons if it runs before the deploy.
- ⚑ **THIS REPO'S WORKTREES HAVE NO `.local`, `node_modules` OR `.env.local`** — symlink them in from the main
  checkout, then add `.local` and `node_modules` to `.git/info/exclude`: `.gitignore` matches `.local/` (a
  DIRECTORY) and will not match a symlink, so the gate reports "git is clean" as STALE for your own scaffolding.
- ⚑ **A REGEX OVER A COLUMN LIST MISSES THE LAST COLUMN** — it has no trailing comma.

### ⚑ FOUR FALSE RESULTS IN ONE SESSION — the S71 meta-lesson, still the sharpest thing here
Every one of these *looked* like an answer:
1. **The migration that ran clean and changed nothing.** Only re-running the probe found it.
2. **Four `BROKEN` lines that were the probe knocking on the OLD door**, on a database behaving exactly as
   designed. A permanently-red check is one a future session learns to ignore ([[d108]]) — so they were moved
   to the new door, and the old one got an assertion that it must now REFUSE.
3. **`guest_ready_at` looked inert.** PostgREST returns **success with ZERO ROWS** when RLS matches nothing, so
   "no error" proved nothing. Read the row back — and try it as the party the guard was written to stop
   (the BUSINESS), not the one RLS refuses first.
4. **A Driver-side RPC probe that scored `closed` on "Not your mission"** — a refusal for a reason unrelated to
   the leak. The honest test used a trip the Driver actually held.

> **A check is only evidence once you have watched it fail on purpose.** Four disguises in one day, on top of
> S71's three.

### ⚑ THE COLLISION — two sessions, one `main`, one database
- Both appended a **D109** on the same day. Theirs landed first, so the walls decision is **[[d114]]**.
- ⚑ **THE MERGE DID NOT FIND THE REAL COLLISION — THE STANDING ASSERTION DID.** Their new Waybill page read
  `mission` with `select("*")`, which `31g`'s sibling would have 403'd. It now takes both fixes: the view
  (enforcement) and named columns (it prints eight fields, so it asks for eight).
- ⚑ **`.next` IS SHARED BETWEEN WORKTREES AND NOT SAFE TO DELETE UNDER A RUNNING SERVER.** Two concurrent
  builds produce `Duplicate identifier` errors in code nobody wrote; clearing it breaks the other session's
  dev server. **Set `autoPort: true` and take your own port** (`.claude/launch.json`, done) — Spend and
  Calendar appeared to hang for twenty minutes on the shared one and were perfectly fine on a clean server.
- ⚑ **A RED GATE THAT IS NOT YOURS IS WORTH NAMING, NOT "FIXING".**



- ⚑ **THIS REPO'S WORKTREES DO NOT HAVE `.local`, `node_modules` OR `.env.local`** — all three are ignored and
  live only in the main checkout. Symlink them in (`ln -sfn ../../../.local .local`, etc.), then add `.local`
  and `node_modules` to `.git/info/exclude`: `.gitignore` matches `.local/` (a DIRECTORY) and will not match a
  symlink, so `handoff-check` reports "git is clean" as STALE for your own scaffolding.
- ⚑ **A COLUMN PRIVILEGE IS PER POSTGRES ROLE. A DRIVER AND A DISPATCHER ARE THE SAME ROLE** (`authenticated`).
  So `revoke select (x) on t from authenticated` hides `x` from BOTH audiences and can never express "this side
  but not that one". That needs a view. See [[d114]].
- ⚑ **A SECURITY DEFINER FUNCTION'S COMPOSITE RETURN IGNORES COLUMN PRIVILEGES.** `accept_mission`,
  `business_cancel_mission` and a dozen more are `returns mission`, so the whole row crosses regardless of what
  is revoked. **Still open** — see below.
- ⚑ **A `security_invoker = false` VIEW SEES NOTHING AS THE SERVICE ROLE** when its WHERE is written in
  `app_role()` / `current_*_id()` — all NULL there. It returns ZERO ROWS rather than an error, which is the most
  misleading answer a query can give. `mission_read` is granted to `authenticated` only, and the drift probe
  reads it as the BUSINESS for exactly this reason.
- ⚑ **HIDING A NUMBER THE UI COMPUTES FROM MEANS MOVING THE COMPUTATION.** `currentFare()` climbs TO the
  Ceiling, so masking the Ceiling breaks the Pool card. `lib/pool-fares.ts` computes it server-side from ids the
  caller's own RLS read returned. `PoolMissionRow` types the masked columns as `null` so the compiler refuses.
- ⚑ **`ratesOf` REQUIRED ALL THREE RATES**, which quietly means "no commission charged" the moment one is
  masked — a Business would have been shown 190,00 € where it owes 218,50 €. Use `businessRatesOf` /
  `driverRatesOf`; they return narrowed `BusinessSplit` / `DriverSplit`, so reading the wrong half is a compile
  error. `ratesOf` / `splitFor` are for ADMIN and the service role only.
- ⚑ **THE MIGRATION ORDER IS REVERSED FROM THE USUAL ONE.** Normally a new column breaks the write path until
  the migration lands; here `..._2_close.sql` breaks the READ path until the app half is deployed. Part 1
  (the view) is additive and can go in any time; part 2 waits for the deploy.
- ⚑ **A REGEX OVER A COLUMN LIST MISSES THE LAST COLUMN** — it has no trailing comma. The drift check reported
  `vehicle_id` missing from a view that contained it. Which is also the check doing its job: it was watched
  going red on a real near-miss and again on a planted one, then green.

### 🔴 STILL OPEN FROM S72 — named, not hidden
**~~The SECURITY DEFINER RPCs return whole `mission` rows~~ — CLOSED (`31g`).** Kept as the shape: `business_cancel_mission`, `respond_to_amendment`,
`reclaim_mission` and ~14 more hand a Business `commission_driver_rate` on any trip it touches. Closing it means
redefining each function's return type — a job of its own, and deliberately not in the same paste as the walls.
`.local/probe/column-leak.mts` § 5 measures it. **Done in `31g`** — the entry stays as the shape to recognise:
a definer function's return value is not covered by anything you do to the table it reads.

---

## ⚑ TRAPS LEARNED IN S71

- ⚑ **A WRITE IS NOT VERIFIED UNTIL YOU HAVE READ THE ROW BACK.** The first register sign-up stored
  `region: "93"` and **`departement: null`**, silently — the register sends that field on `siege` and not on
  `matching_etablissements`. Every field looked right on screen.
- ⚑ **`vercel env pull` REDACTS EVERY VALUE TO `""`**, including non-secret ones. It looks like a broken
  project. Read `NEXT_PUBLIC_*` out of the deployed JS bundle instead — that is what the browser actually runs.
- ⚑ **`DEV_LOGIN_KEY` IS IN VERCEL ONLY, NOT `.env.local`** — the production dev-login URL cannot be built
  from this machine.
- ⚑ **THE FOUNDER'S OWN ACCOUNTS HAVE NO `profile` ROW.** `phyrass.h@gmail.com` and `mmoimeme389@gmail.com`
  have no role, so `routeFor()` sends them to `/welcome` and every screen is empty. Exactly ONE account can see
  the console: `admin@kavenue.fr`. ⚑ **They never said how they got in — this may recur.**
- ⚑ **`lib/database.types.ts` IS HAND-WRITTEN.** New columns go in Row **and** Insert, new RPCs in the
  `Functions` block — or `tsc` reports `not assignable to type 'never'`, which reads like a broken generic.
- ⚑ **A NEW COLUMN BREAKS THE WRITE PATH UNTIL THE MIGRATION LANDS.** Say so out loud when handing one over.
- ⚑ **`vehicle.category` AND `body_type` ARE POSTGRES ENUMS; `business_type` IS BARE TEXT.** Comparing an enum
  to a text parameter raises `operator does not exist`. Cast once in the source CTE.
- ⚑ **ADDING A PARAMETER CREATES AN OVERLOAD, IT DOES NOT REPLACE.** Drop the old signature explicitly or
  PostgREST can resolve to the period-blind version.
- ⚑ **APPLY A PERIOD TO THE JOIN, NEVER THE `where`** — in the `where` an outer join becomes an inner one and
  a Business with no trips vanishes, making a quiet month look busy.
- ⚑ **`.ecal` POSITIONS ITSELF ACROSS ITS PARENT.** In a toolbar tab it renders as a ribbon one column wide.
  Copy `.dxh-cal`: the wrapper sets the width, the calendar sits inside in normal flow.
- ⚑ **A RAW `fetch` POST DOES NOT INVOKE A NEXT SERVER ACTION** (404 — it needs the `Next-Action` header).
  Append a real submit button carrying the intent and click it.
- ⚑ **A `ref` CLICK FROM THE BROWSER TOOL DOES NOT ALWAYS LAND** at a scaled viewport. Twice it silently did
  nothing and looked like a broken control. Verify with `element.click()` before concluding the UI is wrong.
- ⚑ **`window.innerWidth` IS 0 WHILE THE BROWSER PANE IS HIDDEN**, so every `max-width` media query matches and
  a desktop layout reads as mobile. Pin a width with `resize_window` before judging a responsive layout.
- ⚑ **`querySelectorAll(...).textContent` IGNORES `display:none`** — read `getComputedStyle(el).display`.
- ⚑ **A REGEX THAT EDITS AN IMPORT BLOCK WILL EAT IT.** vitest then dies inside esbuild with no line number.
  Edit import lists by exact string.
- ⚑ **AN AUDIT LOG WITH A MANUFACTURED ROW IS WORSE THAN AN EMPTY ONE.** The `post_blocked` proof row was
  deleted after verifying.

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

### 🧹 BEFORE REAL LAUNCH — ✅ THE TOOL EXISTS AND HAS BEEN RUN ONCE
The founder's plan — *"you and me we are going to delete every single Driver and company and trips ever tested
in the database"* — is now a script: **`.local/seed/bleach.mts --confirm`**. It ran on 2026-08-26 and removed
**3 210 rows**, including `mission_event` and `status_event`. The schema was never touched; it cannot be, since
PostgREST does not do DDL.
- ⚑ **It keeps `rate_card`, `commission_rate`, `mission_event_type`, the admin login and the founder's own two
  addresses.** Everything else goes. Read the KEEP list before running it again — that list is the whole
  safety of the thing.
- ⚑ **It deletes the accounts 15 live probes sign in as.** Run `seed-probe-accounts.mts` straight after, or
  they all die at `Invalid login credentials`.
- Before the real launch, run it once more and DON'T re-seed.

### 📋 V1 COMPLETENESS
**38 KEEP features in Doc 02: 27 built · 8 partial · 3 missing.** Nothing on the critical path is unbuilt.
GDPR consent capture + account deletion are still absent — **founder-owned, do not gate on it**.

---

## ⚑ 0 · VERIFY BEFORE YOU BUILD — THIS IS A GATE, NOT A SUGGESTION

A handoff is a *claim about the repo*, and claims decay — fastest when the session writing them is also the
session changing things. S64's handoff was wrong twelve ways. **S66 found the old state block still saying the
T−60 take-back was "STILL parked" hours after shipping it.** Run this first:

    node --experimental-strip-types .local/probe/handoff-check.ts

**32 assertions**, ending `The handoff still matches reality. Proceed.` Anything `STALE` means this file lies
about that point — **fix the file before you build on it.** Then:

    npx tsc --noEmit && npx vitest run          # expect 700 passing
    node --experimental-strip-types .local/probe/diff-sql-vs-lib.ts     # 1 921 · ALL AGREE
    node --experimental-strip-types .local/probe/write-test.ts          # 170 · ALL AGREE (the 24 were the probe — [[d97]])
    node --experimental-strip-types .local/probe/curve-live.ts          #   8 · ALL AGREE
    node --experimental-strip-types .local/probe/accepted-fare.ts       #  20 · ALL AGREE
    node --experimental-strip-types .local/probe/reclaim-live.mts       #  20 · D86 end to end
    node --experimental-strip-types .local/probe/event-registry-live.mts #  16 · D87 registry
    node --experimental-strip-types .local/probe/migrations-2026-08-10.ts   # 63 · 0 failed
    node --experimental-strip-types .local/probe/migrations-2026-08-11.ts   # 23 · 0 failed (B4 fixed in S69)
    node .local/probe/google-places-live.mjs                             #  8 · D89 address box
    npx tsx .local/probe/eligibility-live.mts                            # 33 · D92/D93 — ⚑ tsx, NOT node
    npx tsx .local/probe/dataset-audit.mts                               # 30 · the seeded dataset (D94)
    npx tsx .local/probe/accept-floor.mts                                #  6 · the § H2 two-floors residual
    npx tsx .local/probe/sweep-orphans.mts                                #    after any live-probe session

**If a probe fails, that is the job** — not whatever is queued above.

⚑ **When you finish, do the same to your own handoff**, and **add an assertion for anything that bit you**.

---

## ⚑ TRAPS LEARNED IN S69

- ⚑ **A PROBE THAT CLONES A REAL MISSION INHERITS ITS MONEY.** `{ ...tmpl }` copies every column not
  overridden, and since the S68 reseed that includes **`accepted_fare`** — a frozen price belonging to a
  different trip. This produced a full session's false alarm about cancellation overcharging ([[d97]]) and was
  loaded in **eight** more probes. All pinned, and `handoff-check.ts` now **refuses to pass** if a cloning
  probe has no `accepted_fare` pin. ⚑ **Pin it explicitly even when null** — `null` is a decision, an absent
  key is an accident.
- ⚑ **A CHECK IS NOT VERIFIED UNTIL YOU HAVE WATCHED IT GO RED.** The guard above was wrong three times, each
  time passing when it should have failed: `.includes("accepted_fare")` matched the *comment* explaining the
  pin; `/accepted_fare\s*:/` missed `m.accepted_fare = 90`; `/accepted_fare\s*[:=]/` matched
  `after!.accepted_fare === null`, an assertion that merely *reads* the column. Every one was "confirmed" by
  running it and seeing green. **Break the thing on purpose and watch the check fail before you trust it.**
- ⚑ **`board-guest-test.ts` WAS RED AND NOBODY HAD LOOKED** — 9 problems, all stale expectations, none an app
  bug. It asserted a **flat 1,00 €/min waiting rate** (per-class since 2026-08-18 — the *same* finding as S63's
  `diff-sql-vs-lib`, in a file that never got the fix) and compared `missionAmount` (**net** of commission)
  against fare + waiting (**gross**) — the same defect S68 found in `write-test`'s page-read check. **When a
  rule changes, `grep -rl` the probes for the OLD number, not just for the function name.** 56 · 0 now.
- ⚑ **`reclaim-live.mts` HAD BEEN DEAD SINCE THE BLEACH** on a hardcoded driver id, dying at
  `violates foreign key constraint` before its first assertion — while the handoff still advertised it as
  *"20 · D86 end to end"*. **A probe must LOOK UP its identities by email, never hold an id.** 20/20 now, and
  two more files held the same dead uuid (`reclaim-seed`, `event-accept-rejected`) plus one holding a dead
  mission id (`amend-check`). ⚑ **`handoff-check` now refuses to pass on a literal uuid in any probe**, with
  the all-zeros one exempt because it deliberately names a row that does not exist. Both new assertions were
  verified by breaking a file on purpose and watching them go red.
- ⚑ **RUNNING *SOME* OF THE GATE IS NOT RUNNING THE GATE.** S69's own opening pass skipped `reclaim-live`,
  `curve-live`, `accepted-fare`, `event-registry-live` and `board-guest-test` — two of which were already
  broken. The list at § 0 is a list, not a menu.

- ⚑ **`main` IS UNPUSHABLE WHILE GITHUB ACTIONS IS DOWN, AND THAT IS THE RULESET WORKING.** On 2026-08-26 at
  **15:11 UTC** Actions went into a major outage (database primary failover, inbound traffic throttled). The
  symptoms in order, all of which look like a broken repo and are not: a push that produces **no run at all**,
  a run that completes as **`startup_failure`** with GitHub emailing *"CI: No jobs were run"*, and a re-run
  that sits **`queued`** for half an hour. `gh workflow list` says `active`, the YAML is untouched since S58,
  and `gh api .../actions/permissions` says enabled — **check `githubstatus.com` before debugging any of it.**
  ⚑ **The one command that settles it in five seconds**, since `gh` will not tell you:

      curl -s https://www.githubstatus.com/api/v2/components.json | grep -A2 '"Actions"'

  It went down TWICE on 2026-08-26 and read `major_outage` both times. S69's commits waited on branches
  (`s69-probe-truth`, `s69-close`) until it cleared, then went to `main` on the same SHAs. ⚑ **Do not weaken the ruleset to
  get round it** — "no commit lands unchecked" is exactly the rule an outage tests.

- ⚑ **A MOCKUP APPROVED ON FIVE ROWS IS NOT APPROVED ON FORTY.** Day bands were signed off on a preview
  showing five trips and were obviously wrong the moment the real page rendered: a hotel books about **one
  trip a day**, so its own 42 trips produced **42 one-row bands** — a striped wall, worse than the flat list
  it replaced. `/admin/trips` (the whole marketplace, ~3 a day) groups properly. `lib/admin-list.ts` now
  takes `band: "day" | "month"`, following what the app already does: Dispatch's **Schedule** bands by day,
  its **History** bands by month. **Preview the shape at the real row count, not at a comfortable one.**
- ⚑ **EVERY `.adm-row` IS ITS OWN GRID, SO `auto` COLUMNS DO NOT LINE UP DOWN THE PAGE.** With two cells that
  only looked untidy; with four, the activity column jumped fifty pixels a row. Fixed widths are what make
  N separate grids read as one table — and the last column has to be sized for a pill **even on the rows
  that have none**, or those rows shift left. Also: `.adm-pill` now has `white-space: nowrap`; a pill that
  wraps to two lines makes its whole row taller than its neighbours.
- ⚑ **`Math.round` TURNED AN EXPLANATION INTO A CONTRADICTION.** The console gave *"it is **60** km from
  their base, and they drive up to **60** km"* as the REASON a Driver was refused — he is at 60,4. The bug
  only appears within half a kilometre of a boundary, which is **exactly** when a human comes looking for
  the reason. `quoteKm()` in `lib/eligibility.ts`. **A number a sentence argues from cannot be rounded like
  a number a reader merely glances at.**
- ⚑ **A CHECK THAT *READS* ITS PRECONDITION IS A CLAIM ABOUT THE DATABASE, NOT ABOUT THE CODE.**
  `migrations-2026-08-11` case **B4** asserts a luggage run is refused to a Driver who has not opted in — and
  never set the flag. The bleach deleted the probe accounts and `seed-probe-accounts.mts` recreated them with
  `accepts_luggage_runs: true`, so B4 had been failing since **2026-08-26** with *"no error — it accepted!"*,
  which reads exactly like a broken SQL guard. It was NOT a regression and nothing in S69 caused it. It now
  sets the flag it depends on.
- ⚑ **TIDYING TEST DATA CAN BREAK THE HISTORY GENERATED FROM IT.** Moving the Drivers off hotel addresses had
  to keep every past trip inside the range of the Driver who actually drove it — otherwise the past-tense
  matcher ([[d95]]) would report that the holder could never have taken it, a screen contradicting itself.
  `rebase-drivers.mts` checks all 294 held trips and **refuses to write** if any would be stranded.
- ⚑ **A SEEDED GAP IS AS MUCH A PART OF THE DATASET AS A SEEDED TRIP.** Karim Nasri's distance from Valberg
  is the entire reason *"nobody can take Valberg → Marseille Airport"* is true. Antibes (59,4 km) would have
  silently deleted a finding the console exists to make; Juan-les-Pins (60,4) keeps it. **Before moving any
  seeded row, ask which sentence on screen depends on it.**
- ⚑ **THE DEV SERVER ON :3000 MAY BELONG TO ANOTHER CHAT** and still serve your edits — it reads the same
  working directory. Fine for verifying; do not `npm run build` against it (S66/S68 trap, still true).

## ⚑ TRAPS LEARNED IN S68 — every one cost real time

- ⚑ **RUN THE LIVE PROBES ONE AT A TIME.** `write-test`, `migrations-2026-08-10/11`, `event-wiring-live` and
  `reclaim-live` each create tagged missions and assert a mission-count baseline at the end. Run concurrently,
  they see each other's rows and all report a false *"baseline NOT restored"*. Three probes were debugged for
  a failure that was only the other two running.
- ⚑ **"ZERO ROWS IS NOT PROOF OF A BUG" HAS A TWIN: it is not proof of correctness either.** `write-test`'s
  fee checks were green for four days because `accepted_fare` was NULL on all 280 live missions, so
  `settledFare()` fell through to recomputing the curve and matched SQL by accident. The reseed stamps it
  where the app stamps it and 24 checks went red at once. **A dataset that exercises nothing proves nothing.**
- ⚑ **AND THE SAME PROBE HAD A SECOND CHECK PASSING FOR THE WRONG REASON.** Its PAGE-READ assertion compared
  `rowCost` (commission-INCLUSIVE since 2026-08-17) against the RPC's bare `fee_amount`. It only ever passed
  because no mission had commission rates stamped, so ×1.15 was ×1.00. Fixed by wrapping the expectation in
  `businessCost` — the code was right, the expectation was not.
- ⚑ **`mission_event.occurred_at` DEFAULTS TO `clock_timestamp()` AND THE TRIGGER DOES NOT OVERRIDE IT.** Any
  script that walks historical trips writes a log dated today. See [[d94]] for what to do about it, and what
  not to do about it.
- ⚑ **AN INSERT WHOSE ERROR IS NEVER CHECKED REPORTS SUCCESS AND SILENTLY DOES NOTHING.** Recorded in S57,
  re-learned in full: cancellations, release requests and every Driver document were written with column names
  that do not exist, PostgREST rejected all 90-odd, and the seed printed success. Three tables silently empty.
  **Route every insert through one checked helper and exit non-zero.**
- ⚑ **THE RATE CARDS ARE ALL `effective_from` 2026-08-16.** Asking `priceFor(..., { at: <a date in June> })`
  returns **null**, and a seed that treats null as "skip" loses 295 of 336 trips with no symptom but a smaller
  number. Seeded history must be priced with TODAY's card.
- ⚑ **LIVE PROBES LEAVE ORPHANED EVENTS BY DESIGN** — they delete their missions and `mission_event` has no FK.
  356 accumulated in one session. `sweep-orphans.mts` clears them; run it before quoting any log number.
- ⚑ **THE BLEACH DELETES THE ACCOUNTS THE PROBES SIGN IN AS.** Fifteen probes died at `Invalid login
  credentials`. `seed-probe-accounts.mts` puts `demo.driver@`, `demo.business@` and `s46.driver@` back as
  ordinary members of the fleet — do not edit the probes.


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
