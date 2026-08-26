# Kavenue — Session Log

> Append-only, newest at top. One entry per working session. Keep it short:
> what changed, what was decided, what's next.

---

## 2026-08-26 — Session 68 — THE ACTIVITY CONSOLE, AND THE TWO FIELDS THAT DECIDE NOTHING

**Gate first.** `handoff-check.ts` **23/23** — *"The handoff still matches reality"* — `tsc` clean, vitest
**555**. Nothing had drifted since S67 closed, so the queued job stood.

**Shipped: the Activity console** (`admin.kavenue.fr`, the surface [[d90]]/[[d91]] made reachable). No
migration — RLS already grants `app_role()='admin'` read on everything, and the console runs as the signed-in
admin through the ordinary server client, never the service role. A console that bypasses RLS can't be trusted
to show what an admin can really see.

### The design loop, and the correction that mattered
The first preview put three screens, five multi-paragraph findings, a ten-entry story with four amber caveat
boxes and a nine-row rule table on one page. The founder's entire reaction: **"it's overwhelming"** — and they
were right. The second cut one sentence per finding, replaced the caveat boxes with a hoverable `approx` tag,
and — the real change — made the answer panel show **the blocker, not the rulebook**. Artifact:
`project/Activity-Console-Preview.html`, published and updated in place.

### What was built
| module | what it is |
|---|---|
| `lib/eligibility.ts` | The nine rules, re-run and named. Pure. **Type-keyed `RULES: Record<EligibilityRuleId, …>`** so a new rule cannot be added without describing it |
| `lib/activity-findings.ts` | The named checks. Pure. Silent when they find nothing |
| `lib/mission-story.ts` | `mission_event` rows → sentences. **Type-keyed `PHRASES: Record<MissionEventType, …>`** |
| `lib/admin-activity.ts` | The reads. Server-only, every count `{ count: "exact", head: true }` |
| `app/admin/{page,trips/[id],drivers/[id],businesses/[id]}` | Activity, one trip, one Driver, one hotel |
| `.local/probe/eligibility-live.mts` | **23 checks.** ⚑ Run with **`npx tsx`**, not node — it imports `@/`-aliased modules |

`tsc` clean · vitest **555 → 636** (+81) · every read-only probe re-run green (693 · 8 · 20 · 16 · 20).

### ⚑ D92 — the seventh instance of the pattern
Writing the rules down for the first time revealed that **two of the things everyone assumed were rules are
not rules.** `driver.operational_zones` ("the towns they work") is read by **nothing** — the Pool matches on
base + radius, which is what the spine says. `driver.verified` is rendered once, on the Driver's own settings
page, and branched on **nowhere**: Marc Dubois is unverified and can accept work today.

⚑ **Verified before it was raised** — `grep -rn` over `app/ lib/ components/`, not an empty query result. That
is the S67 counter-lesson applied.

The console **reports both rather than omitting them** (a reader who doesn't see `verified` assumes it passed)
and rather than wiring them up (a product decision with a beta cost the founder has already priced). The
absence is guarded by grep in the probe, because **an absence cannot be queried out of a database**.

### ⚑ D93 — refused ≠ never shown
Six rules refuse (`accept_mission`, SQL). Three hide (the Pool query). § B makes the SQL a strict superset so
drift can only hide a trip, never refuse one the Pool offered — but that guarantee is worthless to an admin who
can't tell which happened. *"Turned down"* is a rules problem; *"never saw it"* is a reach problem. **Six of
nine live Drivers have never set a base**, so a merged "not eligible" would have buried the single most
important fact about the fleet.

### What the console found on its first live run
- **Two of the three pooled trips cannot be taken by anyone.** Both ask for Eco; the only Eco Driver
  (Élodie Marchand) has no base, so her Pool is empty and the trips were never shown to a soul.
- **Six of nine Drivers have no base** — never offered a single trip.
- 431 log entries point at a deleted mission (designed: no FK, the log outlives the trip).

### ⚑ Three defects the build caught, each worth keeping
1. **`"".trim()` satisfies `??`.** `tripLabel`'s fallback chain returned an empty string for a whitespace-only
   label. Caught by a test written *because* the live Pool rows have null labels. `|| undefined` before `??`.
2. **Colliding React keys silently drop rows.** The name list was keyed on `subject`, and the live DB has four
   trips called *"Le Grand Hôtel → Monaco"* — React warned children "may be duplicated and/or omitted". A
   findings screen that silently drops a finding is the one failure it cannot have. `Finding.key` is now
   `${id}:${entityId}`.
3. **The type-keyed map earned itself in the first minute** — `PHRASES` refused to compile until
   `close_answered` was written. That is [[make-the-compiler-check]] working exactly as intended.

### ⚑ Traps for next time
- **A probe importing `@/`-aliased app modules must run under `tsx`, not `node`.** Plain node dies with
  `ERR_MODULE_NOT_FOUND '@/lib'`. Every earlier probe got away with `node` only because it imported alias-free
  modules (`lib/geo.ts`) or none at all.
- **`mission_event.seq` is NOT time order.** The backfill inserted a table at a time, so the live log has
  `en_route` at a *lower* seq than `created`, six weeks earlier. Rendering by `seq` says a trip was driven
  before it was booked. `orderEvents()` already handles it — use it.
- **The first live render is the design review.** The 23-name wall and the duplicated *"never consulted · never
  consulted"* both looked fine in the mockup and were obvious the moment real data hit them.

### Part B — the fleet, and the three gaps the founder named

**The founder's call, asked and answered:** *"do you want to create new profiles?"* — recommended **no**.
Six of nine Drivers had no base, so the matching rules were barely exercised and two pooled trips were
invisible to everyone; that is six UPDATEs on Drivers who already exist, versus new accounts on a database
already earmarked for a wipe. They chose the recommendation.

**`.local/probe/s68-driver-bases.mts`** — six rows, `--undo`, and it **only ever fills an EMPTY base** so a
Driver who set their own can't be overwritten by a test script. Bases spread Nice / Cannes / Antibes / Monaco
with **deliberately unequal radii** (Thomas Rey: Monaco, 25 km — so Cannes is genuinely out of his reach). A
fleet where every check passes tests nothing. Result: every pooled trip now has at least one taker
(0 → 1, 2 → 5, 0 → 1).

**The three gaps, all closed:**
1. **`feature_never_used`** — the founder's own example of a good check. ⚑ **Read from the DOMAIN table, never
   from the event log**: the log started 2026-08-24, so "no `release_proposed` events" would mean "nobody in
   the last two days" — a much weaker claim wearing the same words. `mission_release` = **0 all time**, and
   `document` = **0** (no Driver has ever filed a paper).
2. **Browse lists** — `/admin/{drivers,businesses,trips}` + nav. The state is on the row, never a count at the
   top: *"no base — Pool empty"* in red beside *"Monaco · 25 km"*.
3. **Findings prove themselves** — `/admin/trips?flag=no-cancellation-record` is where *"which 23?"* is
   answered. A finding with no proof behind it is a claim a reader has to take on faith.

⚑ **A THIRD DEFECT THE FIRST LIVE RENDER CAUGHT.** Grouping collapsed the two dead features into *"2 shipped
features have never been used"* printed over the raw table names `mission_release` and `document` — the exact
roll-up the screen exists to avoid, produced by the code written to avoid it. **Grouping is now a per-check
decision** (`CHECKS[id].groups`, type-keyed): only checks whose sentences are variations on one template may
collapse. Six Drivers with no base read fine as six names; two unrelated sentences never do.

vitest **636 → 643**.

### Next
The founder's stated order stands: **a clean test dataset**, then their own UI/UX pass on the console. The
two trackers (§3 in the handoff) still want starting early — they cannot be reconstructed later.

---

## 2026-08-23 — Session 65 — THE REPO RENAME, AND THE BIGGER THING IT UNCOVERED

**Queue item 1 of 3, shipped.** `Phyrass-H/Pickup-marketplace` → **`Phyrass-H/kavenue`**. Chosen over
`kavenue-marketplace` because it matches the Vercel project; the landing repo stays `kavenue-landing`. The
driver was trademark, not tidiness: "Pickup" is registered to Pickup Services SAS / GeoPost (Groupe La Poste)
in **class 39 — transport**, and the repo is public.

**Gate first.** `handoff-check.ts` 11/11, `tsc` clean, `vitest` **462**, and all six DB probes green
(693 · 170 · 8 · 20 · 61 · 23, zero mismatches). Nothing had drifted since S64 closed, so the queue stood.

**The rename itself, and what was verified after it:**
- ruleset `main — CI must pass` **survived** — it binds by repo **ID**; GitHub rewrote `source` itself.
  Still `active`, `bypass_actors: []`, still requiring `types · tests · build`. `…/branches/main/protection`
  → 404, confirming the ruleset is the **only** gate on main.
- old URL redirects; `git fetch` over the new remote works; `main` in sync.
- webhooks `[]` · deploy keys `[]` · Actions secrets 0 · environments unprotected · topics `[]` · issues `[]`
  · forks 0 · releases none · PR #1 clean.
- the repo's public **`homepage` was still the old trademarked URL** and `description` was empty. Both set
  (`https://kavenue.fr` · "B2B VTC booking marketplace — centrale de réservation VTC").

**A 46-agent audit found no code exposure at all.** Nothing in the app, `.github/ci.yml`, `package.json`
(no `repository`/`homepage`/`bugs` fields) or `README.md` (9 bytes) ever named the repo. **Every** reference
was prose in `project/*.md` plus one gitignored probe line. That is why the rename was safe — and it is worth
remembering the next time a rename looks scary.

⚑ **`handoff-check.ts` was itself a landmine.** Its 11th assertion was `/Pickup-marketplace/.test(remote)` —
i.e. it asserted the rename had **not** happened. The moment we renamed, the mandatory session gate began
printing `STALE` and telling every future session to stop and chase the drift. **Inverted, not deleted**:
it now asserts the remote is on the new slug (count stays 11, matching the handoff's "Eleven assertions").
It still earns its place — GitHub's redirect means a clone left on the old slug keeps working *silently*,
so a wrong remote would never fail loudly on its own.

⚑ **THE REAL FIND, AND IT IS STILL OPEN.** `https://pickup-marketplace.vercel.app` is **live, HTTP 200,
serving the production build** (`<title>Kavenue</title>`). Renaming the Vercel project in S49 did **not**
release its `.vercel.app` host — Vercel mints it from the project name at creation, *adds* new aliases on
rename, and leaves the old one bound. **There is no rename operation for it; only bound or detached.** So
the trademarked name is publicly reachable — a larger exposure than the repo slug ever was. It is also a
**broken shopfront, not a fallback**: `lib/hosts.ts:11,46` treats `*.vercel.app` as a shared host so Driver
and Dispatch collide on one origin (the `DECISIONS.md:128` bug), and its origin is not in the Supabase
redirect allowlist, so magic-link sign-in silently fails there.

**The founder was asked and pushed back on scope** — the ask was to rename the repo, not to change Vercel.
Fair. Logged as `BACKLOG.md` **§ AD** with the exact dashboard steps, theirs to decide. Not re-raised.

**Docs corrected** (live instructions only — historical entries left as the record they are, per the
CHANGELOG's own convention): `NEXT_SESSION.md` (queue line, § 1 rewritten as shipped, three live `gh api`
paths, three "still owed" claims), `NEXT_MOVES_CHECKLIST.md:58`, `DECISIONS.md:722`, `BACKLOG.md` § AD.

### Then: § V was brainstormed in full and PARKED — nothing built

The founder chose § V over § R (it is costing a Driver work today), then stopped before any code:
*"we need to brainstorm about it first."* Five things settled, recorded as **[[d85]]** and rewritten into
`BACKLOG.md` § V. The headlines:

- **One class down, maximum** — First → Business, Business → Eco, First **never** to Eco. Not just a
  simplification: it permanently protects the Driver with the cheapest car, which is most of the fairness
  fix.
- **Body type needs no work.** The founder gave the trade rule (*a van does a sedan trip, a sedan cannot do a
  van trip*) and the code already implements exactly that, in both layers. Verified, not assumed.
- ⚑ **The founder inverted their own 2026-08-15 rationale, and the new one is better.** The spec recorded
  *"good in case of low seasons"*; they argued the opposite — in a low season there is less of *everything*,
  so a First Driver taking Business work moves volume downhill rather than creating it. **The paradox: the
  opt-in is most useful exactly when it is most unfair.** Season-date windows were considered and rejected
  (they would need geography, and dates are a blunt proxy anyway).
- **The trigger is per-trip on time-to-pickup**, which produces an escalation ladder:
  `own class → widen one class up (FREE) → ask the Business to raise the Ceiling (§ AB, PAID) → expires`.
  **Always pull the free lever first** — § AB fires at T−5h, so § V must fire before it.
- **The number is still open.** The founder floated T−2h; the one-clock simplification was kept but the
  number argued down (3h after the top-out, past Lock-in and the check-in window, inside the ±90min
  slot-conflict band, and its SPEED WIN premise dead since [[d82]] removed auto-enabling). **Claude
  recommended T−6h; not accepted yet.**

⚑ **Two of Claude's own claims were wrong mid-session and were corrected in the same turn.** It said nothing
records a mission entering the Pool and that a `pooled_at` column was needed. Both false: `pooled_at` exists
(`2026-07-13_o7_cancellation.sql:27`, stamped only on RE-pool, and **NULL on all 280 live rows** because the
seeders bypass the app — the `accepted_fare` signature again), and the "stale draft price" scenario does not
exist because posting a draft **resets `created_at`** (`dispatch/new/actions.ts:381-384`). The first claim
came from grepping `docs/kavenue_schema.sql` alone — **the base schema file does not contain columns added
by later migrations.** Probe the live DB.

**Verified curve facts** (computed against three live missions through the real `lib/pdp.ts`): the fare hits
the Ceiling at exactly **T−5h** (`TOP_LEAD_MS`, `lib/pdp.ts:43`; a trip posted inside 5h tops out at the
midpoint instead). Shape: **T−24h = 76 % · T−12h = 85 % · T−6h = 95 % · T−5h = 100 %** of Ceiling. All the
persuasion happens before T−12h.

**Draft pricing, answered (founder's question):** posting a draft re-prices **fully** — rate card re-quoted
at today's date, floor re-derived, commission re-snapshotted, `created_at` reset, and a Ceiling now below
today's floor is refused outright. The only carry-over is the Business's own Ceiling, deliberately. **Not a
bug.** Live drafts: 0, so the path has never run on real data.

### Two side-audits, both logged, neither built

- **§ AE — nothing checks that a car can CARRY what was booked.** The founder asked. Body type *is* enforced
  (a Sedan can never take a luggage run — closed in SQL, not just UI), but **capacity does not exist**: no bag
  capacity per body anywhere, and the accept guard tests tier/body/luggage-opt-in with **no `pax_count`, no
  `luggage_count`, no seats**. Two real surprise routes, plus a one-line bug — the *"8 bags is a lot even for
  a Van"* warning is switched **off** for luggage-only runs (`mission-form.tsx:282` opens with
  `!luggageOnly &&`), the one trip type entirely about bags. Live: 6 missions over 8 bags, max 14; 17
  missions over 4 Guests, all of which happen to specify a body — so the hole is real but unexercised, and
  what protects it is a human ticking Van, not code.
- **§ AG — record every state transition.** Founder principle: *"We need records of everything."* Saved to
  memory. `status_event` exists but its CHECK permits only the four execution statuses, so it cannot record
  pooling, acceptance, cancellation or expiry. ⚑ And the `created_at` reset above fixes pricing by
  **destroying** the record of when a draft was made — the clean version stamps `pooled_at` on first post and
  leaves `created_at` alone.
- **§ AF — the aggregate "a class comes to help" version** is V2/V3. Not hard; **unmeasurable** at 9 Drivers.
  § V is the n = 1 version of the same signal, and it generates the records that would make § AF possible.

### ⚑ Late finding: § R is NEAR-TERM, not distant — and it was renamed

Explaining § R to the founder, they asked what "volume ceiling" meant. Fair: **it collided with `Ceiling`,
a glossary term** (the maximum a Business will pay). Renamed throughout to **"the growth limit"** — 5 files.

Then, measuring instead of repeating the inherited estimate: **the archive fan-out breaks at 398 archived
trips for ONE Business, not the 5 000 every doc had claimed.** Binary-searched against the live DB
(~14.8 KB of URL); it does not degrade, it **errors**. **The busiest Business is at 271 — 127 of headroom.**
Corrected in `NEXT_SESSION.md`, `BACKLOG.md` and here.

⚑ **The lesson is the same one this session kept relearning:** the 5 000 was a plausible round number nobody
had run. One probe replaced it with a measurement two orders of magnitude tighter. **Measure the limit
before you schedule the work around it.**

### ✅ § R RULE 1 SHIPPED — the 398-id wall is gone

Founder: *"ok let's start with rule 1."* Eight unbounded `.in("mission_id", <every mission id>)` reads became
constant-size requests. ⚑ **The scope was 4× what I told the founder** — the map found five of them on
`dispatch/page.tsx` alone, and that page is **more exposed than History**: its id list is every non-draft
mission **past AND future** (no date bound at `:154-159`), and it fires the vulnerable query **five times per
render**.

Four side tables already carry a denormalised, indexed `business_id`, so seven sites are a plain
`.eq("business_id", …)`. `mission_guest_contact` has no such column, so that one site filters through the
relationship — `mission!inner(business_id)`, where `!inner` is load-bearing (a plain embed is a LEFT join and
would null the embed instead of dropping the row). New `lib/side-tables.ts` collapses **four byte-identical
copies** of the walk loader into one and provides the pure seams the tests needed.

⚑ **The one semantic change:** Business-scoping also returns rows for missions not on screen — extra KEYS in
the maps. Safe **only** because every consumer does `map.get(m.id)` and never iterates. Audited across five
files; recorded as a standing invariant in `lib/side-tables.ts` and BACKLOG § R.

**Verification mattered more than the change here, because `mission_cancellation` is EMPTY — "the query ran"
would have proved only that it parses, not that it returns the same rows.** Three independent legs:
1. **11 new tests** (462 → **473**): set-algebra equivalence, superset-invariance of both grouping helpers,
   a no-leak assertion, and a **negative control** that fails if the denormalised `business_id` disagrees.
2. ⚑ **Mutation-tested.** De-duplicating the walks fails 3 tests; inverting `latestPerMission` fails 2.
   A test that cannot fail proves nothing, so this was checked rather than assumed.
3. ⚑ **Real-row equivalence.** Cancellation and release are empty, but `mission_guest_contact` (4),
   `mission_amendment` (3) and `mission_info_change` (2) are not. Old vs new compared row-for-row across all
   three Businesses: **every comparison MATCHED**, the embed included.

RLS holds by construction — `p_mission_business_read` is `business_id = current_business_id()`
(`kavenue_schema.sql:314`), so the embed can only reach this Business's own trips.

**No migration needed.** One optional index is written and waiting for the founder:
`docs/migrations/2026-08-23_info_change_business_idx.sql` — `mission_info_change` is the only one of the four
whose `business_id` never got an index, and rule 1 makes it a per-render filter. Irrelevant at 2 rows.

✅ **Browser-verified after all.** The port-3000 conflict turned out to be a **stale reservation** — nothing
was actually listening (`lsof` clean), so this session's own server started fine. Signed in via `/dev-login`
as the demo Business and exercised every changed path: **Schedule** renders (5 of the 8 changed queries),
**History** shows all **271 trips** with the chip counts intact (Completed 183 · Unfilled 43 · Cancelled 23),
the **History CSV** returns **273 lines = header + all 271** (its whole-result-set promise preserved, not
paginated), and Spend + its CSV are clean. No console errors; server log shows only pre-sign-in auth noise.
⚑ Note for next time: `read_page` returned "(empty page)" with a 0×0 viewport throughout — screenshots,
clicks and `javascript_tool` all worked, so drive this app by screenshot rather than by the a11y tree.

### Closing S65 — the queue the founder set for next session

**In order, and the founder asked to be GUIDED through it:**
1. ⚑ **Brainstorm the Lock-in window BEFORE coding.** Their question: *"Is 1 hour too late? Would the
   business panic because 1 hour is really tight?"* The numbers say they are probably right — there is a
   **2-hour dead zone** between the Lock-in deadline (T−3h) and the earliest reclaim (T−60min), and a trip
   re-pooled at T−60min gives a replacement less than the travel time its own 50 km radius implies, into a
   Pool already thinned by the ±90 min slot band. Counter-argument to keep it honest: reclaiming early
   punishes a Driver who is mid-job and simply not looking at their phone. **The window is the founder's
   trade to make.**
2. Then fix it — mockup first, one commit, SQL guard + button together.
3. ⚑ **Wire the event log's app-side half** — explicitly requested. 12 event types write nothing today.
4. Settle Michelin vs Google by running both against real hotels and terminals.

**Founder decisions locked this session:** § V → V3+ (a supply contingency, not a feature — the stranded
Classe V is NOT a bug) · flight tracking → yes for V1 · waybill → restart from their own framing, not the
arrêté · mapping → Michelin for distance, Google for the address box, **to be proven not argued**.

⚑ **Process note the founder raised twice: brainstorm before coding.** It was honoured for § V and not for
the event log, which they called out fairly. Agree the shape first.

### ✅ THE EVENT LOG — LIVE. The founder applied it 2026-08-24 and it was verified on the real DB.

**Live after the paste:** `mission_event` = **1 737 rows** (715 status_event + 1 022 mission-row backfill).
⚑ **The 23-cancelled-0-events hole is CLOSED**, recovered from `mission.cancelled_at`; the 22 expired
missions with no `status_event` correctly got nothing — that moment is gone and was not invented.
⚑ **Live trigger proven, then cleaned to baseline:** a throwaway trip driven create → pooled → confirmed →
en_route → arrived → on_board → completed gave **exactly 7 `db_trigger` events in order**, written by plain
PostgREST updates with **no RPC**. `actor_kind='unknown'` is correct — the probe used the service role,
where `auth.uid()` is NULL.
⚑ **Supabase warns "destructive operations" on this file.** False alarm, audited line by line: 11 flagged
statements, all targeting objects the migration itself creates. No existing row is ever updated or deleted.

(Below: how it was designed and pre-verified against a local replica before the founder ran it.)

Founder: *"then need to create and test a full and complete Event Log ready for beta."*
`docs/migrations/2026-08-24_mission_event_log.sql` — 827 lines, transactional, additive, idempotent.

**Design: a DB trigger as the spine, `mission_event` as the body.** Three options were argued and attacked;
**the live data decided it.** Recording is already permitted for cancellation and expiry and already does
not happen — **23 cancelled → 0 events, 48 expired → 26 events** — and `p_mission_business_update`
(`kavenue_schema.sql:320-322`) is USING-only with no WITH CHECK, so a Dispatcher can PATCH `status` with no
RPC at all. Only a trigger sits below every path. App-side `log_mission_event()` covers what the DB cannot
see, tagged `source` so a reader can tell a guaranteed row from a best-effort one.

⚑ **VERIFIED BY EXECUTION.** A throwaway Postgres 17 was built locally from `kavenue_schema.sql` + **46 of
47 migrations** (one unrelated failure) — its reconstructed `status_event` CHECK matched live exactly. The
migration applied clean; a full lifecycle (draft → post → confirm → **walk** → re-pool → confirm → run →
complete) produced exactly 9 events in order; post → expire gave 3; a no-op status write emitted nothing;
re-running the migration twice stayed at 16 events; and disabling the trigger left writes working.
⚑ Every one of those was driven by **plain UPDATEs with no RPC** — i.e. the bypass path — and logged anyway.
⚑ **The destroyed draft timeline is rescued:** the `created` event is immutable — overwriting
`mission.created_at` by three days left it untouched, proved by measuring the resulting gap.

⚑ **NO DDL WAS RUN AGAINST SUPABASE** — Claude's keys are PostgREST, rows only. The founder is the first to
run it for real. Instant remedy if anything misbehaves:
`alter table mission disable trigger mission_event_log;` — the app keeps working, only logging stops.

⚑ **What it cannot capture, stated so the log is never over-trusted:** rolled-back transactions, actions
with no row change (Pool browsing, a contact tapped), the actor behind a service-role write (`auth.uid()`
is NULL — recorded `unknown`, never guessed), and **the entire pre-migration past** for the 280 existing
missions. Never infer that past from NULLs: `pooled_at` and `accepted_fare` are NULL on all 280 for reasons
unrelated to whether the thing happened.

✅ `status_event` is left alone — it is a domain input (the waiting meter and the arrival attestation read
it), not history. Its 715 rows are copied in once, marked imported. ⚑ Its live CHECK accepts **eight**
values, not the four in `kavenue_schema.sql:139` — that file is not the live truth. Claude asserted "four"
and then "six" during this session before probing properly; the six came from testing only `mission_status`
enum members, and `no_show`/`repooled` are not in that enum.

Suite **473 → 487**. `lib/mission-events.ts`, `tests/mission-events.test.ts`, `.local/probe/event-log-e2e.ts`,
plus a § AG reconciliation assertion in `handoff-check.ts` that would have caught the 23-cancelled-0-events
hole.

### The V1 audit — what is genuinely left

38 KEEP features in Doc 02: **27 built, 8 partial, 3 missing.** Nothing on the critical path is unbuilt.
⚑ **The one that blocks beta, verified:** the **Lock-in 3h rule cannot fire.** Since Option A/D55
`accept_mission` always writes `confirmed` (`2026-08-22_accepted_fare.sql:126`), but `reclaim_mission`
(`2026-08-22e_repool_touches_nothing.sql:145`) and the Business's button (`components/trip-row.tsx:255`)
both require `accepted`. **Live: 0 of 280 missions have ever been in `accepted`** — the reclaim has never
been reachable, and nothing else re-pools a silent Driver's trip. A Driver who accepts and vanishes holds
the trip until pickup. Fix: re-gate both on `confirmed AND checked_in_at IS NULL` (already set on 184 rows).
Other real gaps: no free edits while pooled (D39 says there should be), no FAQ, no consent capture or
deletion path (GDPR), booking voucher unbuilt (**blocked on the founder's 7-field template**), no welcome
banner + `manifest.webmanifest` ships `"icons": []`.
Thin: the Driver's photo and languages are captured and shown to nobody while two shipped strings claim
otherwise; an admin sign-in is an infinite redirect loop (`lib/app-context.ts:94`); `field_of_activity` and
`business_type` are two columns that never talk.
⚑ **Two founder decisions needed:** does **flight tracking** ship in V1 (needs a paid API — not covered by
the notifications/payments/auth/analytics deferral), and what are the **7 voucher fields**?

**Next:** the Lock-in fix is the one item where the product lies about a rule it advertises. Then § R rules
2-3, § AE, and § V once the founder picks the threshold.

---

## 2026-08-16 — Session 60 — THE RATE CARD, RE-CALIBRATED AND RE-LOCKED (docs only so far)

**Step 0 of the pricing-engine build order.** No code yet: `docs/06` §4 held numbers that a day of
market benchmarking showed were wrong at both ends. Founder ran the quotes; Claude took the real road
distances from Mapbox and did the fitting. Four independent sources, **eleven routes, 5.9 km → 619 km**:
Transfeero, Blacklane, a bid marketplace ("de €…" = *from*), and Uber. Working data:
session scratchpad `transfeero-benchmark.md`.

**What changed in the card**

| Class / body | before | after |
|---|---|---|
| Eco | 20 + 1.85 | unchanged, + long band 1.30 |
| Business — sedan | 48 + 2.00 | unchanged, + long band 1.40 |
| Business — van | 45 + 2.25 | **52** + 2.25, + long band 1.58 |
| Luxury (First) | 115 + 1.90 | **First — sedan 86 + 3.60**, + long band 2.52 |
| — | *did not exist* | **First — van 82 + 3.42**, + long band 2.39 |

**Floors untouched.** Claude flagged them as "too low to be viable" — the same flag S59 raised and the
founder overruled. Re-flagging it was the error; the ruling stands (§5 now records it so it cannot be
raised a third time). Claude had also proposed *raising* the First floor to 24 + 1.35 as part of the
re-fit and withdrew it, since it cut against that ruling.

**The four findings that drove it**
1. **First was the broken row.** Per-km 1.90, *below* Business's 2.00, propped up by a €115 base fitted
   from 11 points with nothing under 28 km — so a 2 km trip cost 5% less than a 5 km one. Two sources put
   the real ratio at **1.80× Business**. Base 115 → 86, slope nearly doubled; the line **pivots at ~17 km**.
2. **The market tapers; a straight line does not.** Blacklane: 4.36 €/km for a Business sedan at 32 km,
   **1.82 at 595 km**. Transfeero independently reaches **1.82** at the same distance. Linear pricing put
   the card **above retail** past ~200 km (130% of Transfeero's Eco at Courchevel). Fixed with a second
   band at **150 km**, long rate ≈ **70%** of the first. Chosen over a smooth curve deliberately: two bands
   rebuild by hand in a dispute and recalibrate with an `UPDATE`; an exponent does neither (§9).
   The **threshold itself is the one unmeasured number** — worth only 3–6%, evidence brackets it at
   107 / 193 / 327 km.
3. **The van scare was a class-mapping artefact — and it validated the V-Class call.** Blacklane's
   "Business Van" looked like it made our Business van 52–60% of market. It is a **V-Class**. Against the
   new **First — van** it is 80–99%. Our Business van (a Vito) matches the aggregator's Vito ratio exactly.
4. **Uber settled Eco, and made the Driver case.** We sit at 116–182% of UberX — correct, because UberX is
   a hail and Eco is a booked transfer. Against the *booked* market at Monaco we are 89% (Eco) and 99%
   (Business). And a 5.9 km airport run pays the Driver **27.20 €** here against roughly **12.70 €** on
   UberX — more than double, on the cheapest class.

**⚑ Discarded as noise, on the founder's call:** the aggregator charges a uniform **~3× premium into
Monaco** (identical multiple on all five classes) and ~17% extra into Switzerland. Destination pricing,
not distance. We stay distance-only; §8 learned routes is the designed answer if it ever matters.

**⚑ Data-integrity flag, still open:** Transfeero's Courchevel *Standard* and Blacklane's Courchevel
*Business Class* are **both 1 082,07 €**, identical to the cent, from two different companies. Founder to
re-open one quote. It does not change the conclusion — each source tapers within its own quotes — but the
"two independent sources agree at 595 km" line rests on it.

**Also decided and written down**
- **BACKLOG § V** — a Driver may **opt in** to lower-class trips (founder: *"Uber does that… good in case of
  low seasons"*). Locked: opt-in only · paid the **mission's** rate, not the car's · one-way (a Business car
  never takes First work). **Timed to ride with build step 3 (the §6 curve)**, which already reopens the Pool
  read path. Also records the V-Class → First / Vito → Business change and its Pool consequence
  (`pool/page.tsx:108` matches the tier exactly).
- **BACKLOG § W** — demand-based pricing, parked by the founder. Reasoning recorded: the auction already is
  demand pricing; a surge multiplier is Kavenue controlling the fare, which is the §0 principal risk; §8's
  fill-rate signal is the principled version.

**Files:** `docs/06_Pricing_Commission_Payments.md` (§4 rewritten, §5 floor ruling recorded, §11 stale-card
warning, §12 rebuilt), `project/BACKLOG.md` (§ V, § W).

**Step 1 — the migration is written and syntax-proven, awaiting the founder.**
`docs/migrations/2026-08-16_rate_card.sql`: the `rate_card` table (keyed market + tier + body +
`effective_from`, so a re-tune is an INSERT and priced missions keep pointing at the row that priced
them), the five seed rows, `mission.rate_card_id` + `mission.night_applied`, and two SQL functions
(`rate_card_for` / `mission_price`) so the formula starts life with **one** definition instead of
drifting between SQL and `lib/` the way the fee rules did before S56. CHECKs enforce the invariants
the calibration relies on: the taper may flatten a rate but never invert it, and `floor_per_km` stays
below `ceiling_per_km_long` so the floor can never catch the ceiling at any distance.
Commission snapshot columns deliberately **excluded** — their shape is decided by step 2, and columns
nothing writes to are debt.
- **Verified against a throwaway Postgres 17 cluster** (scratchpad, deleted after) built with stub
  `vehicle_category` / `body_type` / `mission`: migration applies clean, and all eight price checks
  match the figures signed off in chat to the decimal — Monaco 32.5 km 80.125 / 113.00 / 125.125 /
  203.00 / 193.15, Courchevel 595.4 km 971.56 and 1748.408, night x1.20 44.85 / 135.60, "any body"
  resolving to sedan, Eco ignoring body, and the van dearer than the sedan at **every** distance
  including 2 km (52.00 vs 56.50) — the bug this base change existed to kill.

**⚑ Migration APPLIED by the founder and verified live** against the real Supabase DB: five rows
seeded correctly; `mission_price` returns the signed-off figures through PostgREST at 32.5 km and
595.4 km (both bands), night x1.20 (44.85 / 135.60), "any body" resolving to the sedan row and Eco
ignoring body; `mission.rate_card_id` / `mission.night_applied` present. RLS behaves — the anon key
gets `[]` on a read (so the table GRANT is there and the *policy* is doing the blocking, not a missing
grant, which is what would have silently broken `authenticated`) and **401 on a write**.

**Step 2 — the V-Class re-classified.** `lib/vehicle-catalog.ts:65` `tier: "business"` -> `"luxury"`,
body unchanged. New `tests/vehicle-catalog.test.ts` (7 tests) pins it and the rest of the taxonomy —
there were **no catalog tests at all** before, and the tier picks the rate-card row, so a quiet edit
here is a quiet change to what a Business pays. `tsc` clean, **325/325**.
- ⚑ **One live vehicle needs a decision:** a Mercedes Classe V, active, still stored
  `category='business'`. The catalog only classifies on save, and the Pool reads the **stored**
  category — so that Driver keeps seeing Business-van work until the row is updated, and the moment
  it is, they see almost nothing until BACKLOG § V ships. Raised with the founder; not touched.

**Step 3 — ✅ THE CEILING IS PRE-FILLED AND THE FLOOR IS ENFORCED.** D25 loop ran first: mockup →
three copy rounds with the founder → built to the approved version.
- **`lib/rate-card.ts`** — the TS half of the §4 formula (two bands, night ×1.20, row selection). It
  **mirrors SQL on purpose**: the form must re-price on every keystroke, and a round trip per
  keystroke is not an option, while the server must never trust a browser's number.
  `tests/rate-card.test.ts` (31 tests) pins **both copies to the same figures** — the S56 discipline,
  applied before the drift can happen rather than after.
- **`/dispatch/new`** reads the five rows server-side and hands them to the form. The Ceiling
  pre-fills and keeps following the route and class until the first keystroke, after which the number
  is the Business's and is never overwritten (§0). Chip **Market rate** · helper
  `55,7 km · Business — raise it to find a Driver faster.` · amber below market · red below the floor.
- **The "Estimated base fare" field is GONE.** Its only job was a "below recommended" warning by
  comparing the Business's own two numbers; the card now knows the recommended price. Column left
  in place, no longer written.
- **The old amber night nudge is gone too** — it advised raising the ceiling for a late pickup, which
  the ×1.20 night rate now does by itself. The helper line says `· night rate` instead.
- **Server is the authority:** `createMission` calls the SQL `mission_price` with **its own** road
  distance and refuses a below-floor POST (`?error=belowfloor`). Drafts stay lenient (the S27 idiom).
  Snapshots `rate_card_id` + `night_applied` (§9).

**Verified live against the real Supabase DB** (Cannes Croisette → Hôtel de Paris Monaco, 55.7 km):
- pre-fill **159,40 €** = 48 + 2.00×55.7 · switch to First **286,52 €** · First van **272,49 €** —
  each exactly the formula.
- typed 400 → class changed afterwards → **stayed 400** (touched sticks); the "raise it" nudge
  disappears above market.
- below market → amber naming 159,40 € · below floor → red naming **54,78 €** (13 + 0.75×55.7).
- **Server guard proven by bypassing the browser:** a hand-submitted post at 40 € redirected to
  `?error=belowfloor` and **wrote nothing** (mission count unchanged at 271).
- One real post at a **23:30** pickup wrote `rate_card_id` = the business/sedan row (body was "Any",
  correctly resolved to sedan) and `night_applied` **true** — the server detected night from the
  submitted field, independently of the client. Probe mission deleted; **baseline restored to 271**.
- `tsc` clean · **356/356** · `next build` green.
- ⚑ Two things adjusted after seeing it live and not in the mockup: the helper used
  `formatDistance()`, the *straight-line* helper, which rounded a 55.7 km trip to "56 km" beside a
  price computed on 55.7; and the below-floor state blocked only on the server, so the founder would
  have gone through Review before being bounced — Review now stops too, with a short message that
  does **not** repeat the number the card is already showing.

**⚑ Step 3 follow-up — the re-price rule REVERSED, founder's call.** Shipped behaviour was "once the
Business types a ceiling, never overwrite it". The founder pushed back: *"if a user change class the
price should be updated to that class"* — and they are right, because the two failure modes are not
symmetrical. A typed number surviving a class change leaves e.g. 100 € (typed for Eco) sitting on a
First trip: **above First's floor so nothing blocks it**, wrong by a factor of three, and completely
silent. Re-pricing fails *visibly* — the number moves and the "Market rate" chip returns, which is
already the signal that the figure is Kavenue's again, so no new UI was needed.
- **The rule now:** the Ceiling shows Kavenue's price for the trip as it stands; an edit lasts until
  the trip changes (class · body · route · pickup hour). The `ceilingAuto` flag is gone — the effect
  keys on the quote, so a keystroke in the field changes neither route nor class and typing is safe.
- **One exception, kept:** reopening a saved draft is not a change to the trip, so the first quote
  must not wipe a ceiling the Business deliberately edited before saving (`keepDraftCeiling` ref).
- **Verified live, all exact:** prefill 159,40 → typed 400 → kept typing 4005 (not clobbered
  mid-edit) → First **286,52** + chip returns → First van **272,49** → Eco **123,05**. Draft saved at
  a hand-typed **333** and resumed: still 333, no chip. Probe draft deleted, baseline **271**.
- ⚑ **Dev-server trap that cost time:** two HMR runtime errors from mid-edit states left Next serving
  a stale bundle — the browser threw `ceilingAuto is not defined` against a line the file no longer
  had, and Mapbox autocomplete silently returned nothing. `tsc` was clean throughout. **A browser
  error naming a symbol that isn't in the file any more means the server is stale, not the code** —
  stop the preview, `rm -rf .next/cache/webpack`, restart.

**SESSION CLOSED 2026-08-16.** `main` = `19c04ea`, CI green, Vercel deployed, working tree clean, DB
baseline **271**, all eight stale local branches pruned (`git branch -d`, all fully merged). Five commits:
`69dcf55` doc · `f137fff` migration · `441b50f` V-Class · `8173782` pre-fill+floor · `19c04ea` re-price rule.

**Next:** step 4 — commission (the two displays, the three invoice lines, the snapshot columns). It needs a
**second migration the founder runs**; the S60 one deliberately shipped only `rate_card_id` +
`night_applied` because the commission snapshot's shape is decided by step 4. Full handoff, traps and the
locked card: `project/NEXT_SESSION.md`, the block headed **★★ START HERE**. (`rate_card` table + 5 seed rows + §9 snapshot
columns) for the founder to run, then the V-Class one-liner, then the pre-fill on `/dispatch/new` (D25
preview loop applies).

---

## 2026-08-14/15 — Session 59 — THE PRICING MODEL, LOCKED (no code; `docs/06` created)

**Nothing was built. Everything was decided.** Full model: **`docs/06_Pricing_Commission_Payments.md`**,
which is now the source of truth for anything touching price or commission. Decision entry: **[[d72]]**.
The session opened on § S Spend pass 2 and pivoted within the first hour — Spend totals money across
everything, and the commission shape (§4.1 of `PRICING_BRIEF`) decides *how many numbers a trip has*, so
building the analytics first would have meant rewriting them.

**⚑ `docs/06` never existed.** Two outside briefs cited it as their source of truth; git history has no trace
of it, in any branch, ever. What the founder had were two *extracts* (an implementation brief and a MAD
chapter). The V1 core was reconstructed in this session from those plus the repo, and written to the repo so
the next outside conversation starts current.

**The 27% mystery, solved.** The outside brief's `business_fee_pct 0.15 / driver_fee_pct 0.12` is not a
different proposal from `docs/04`'s 12.5/10 — it is the same pair with the 20% VAT folded in
(`12.5 × 1.2 = 15`, `10 × 1.2 = 12`). Both documents were right and neither said which basis it used.

**Two audits ran as workflows.** (1) A 5-lens audit of the outside brief against the live code — 86 agents,
4.3M tokens — which found the waiting-clock origin regression (§9 of the brief re-introduced the `arrived_at`
anchor fixed in S41), confirmed G2's "zones" gap was closed by base+radius in June, and flagged that removing
`pdp_start` is not free because `2026-08-11_fee_basis_band.sql:120` clamps every fee basis with
`least(coalesce(pdp_start, ceiling*0.5), ceiling)`. Its `verify:rulings` lens lost all 14 verifiers to a DNS
failure, so that one section is single-sourced. (2) A 6-source market benchmark — **192 real published
prices**, 9 operators plus the regulated taxi tariff — which rebuilt the rate card.

**⚑ The founder overruled the research, and was right to.** A mechanism-design workflow returned three named
alternatives (Convoy/Amazon-Relay pre-committed carrier prices, Uber Reserve's fixed fare + eligibility
gating, freight waterfall tendering) on the finding that *an ascending price rewards waiting, and only rival
risk ends it*. All three rejected: *"the fomo is going to do the work, I experience it everyday on Sixt,
drivers take trips cheaper by fear of missing it."* The research's thin-supply premise was wrong for a market
that already has many Drivers. The two "dangerous" flags (deadline-proximity surge, teaching the Pool to wait)
were rejected on the same grounds — Blacklane, Uber, Bolt and Sixt all run it.

**The curve, after one failed attempt.** The first proposal spread ~40 steps evenly across the window; the
founder's test — *"what happened in the last 12 hours with your mechanic for a trip posted two weeks ago"* —
killed it: **one step, €4.79 of movement**, price already at 96% of ceiling with 18h to go. The auction was
over before the trip was urgent. Replaced by **equal movement per halving of the remaining time** (€36 across
~25 steps in the same window), which is self-similar and therefore alive at every lead time. Steps log-spaced
then jittered; **one source of randomness** (jitter the times, uneven sizes fall out for free), **seeded from
the mission id** so the curve is unguessable outside but every read agrees and any past price replays.

**⚑ Two founder corrections that changed the model.** (1) The floor is an **opening bid, not a valuation** — I
had flagged the Eco floor as "too low to be viable" and it is *supposed* to be. (2) **Every trip opens at the
floor whatever the lead time.** I had argued time-to-pickup pricing (a 2-day posting entering mid-curve);
overruled because the Business saving money is what keeps the system alive, and the discipline against posting
late is the **risk of not filling**, not a higher opening price. SPEED WIN is the Business's answer to that,
and it is already a checkbox — verified in `mission-form.tsx:827`, a nudge at ≤5h with a one-tap enable, never
automatic. The ceiling point moved 6h → **T−5h** to match that nudge.

**⚑ The learned-price layer, and the trap the founder caught.** I proposed learning route prices from the
**accepted fare**; rejected — *"the accepted price is based on fomo in auction, nothing to do with price
market"* — and he is right: it would ratchet the card down forever (accepted fares set the anchor → lower
ceiling → lower accepted fares). Learn from **edited ceilings** + **fill rate** instead. He then pushed to
include *untouched* ceilings as weak votes; refuted with arithmetic — 90 hotels leaving €112 and 10 raising to
€140 averages €114.80, which measures the *edit rate*, not the route. Conceded one exception: a hotel that
normally edits and this time doesn't. He explicitly asked to be argued with even when he insists.

**The 30-second hold** came from the founder's own notebook and reversed my advice. I had said don't build it
(an exclusive option that blocks the Pool); his reason is **regret protection**, not price protection — an
impulsive FOMO accept becomes a Driver cancellation, i.e. a 100% penalty and a hotel with no car. Ships
**after** the pricing engine, since both touch `accept_mission`, and enforced **inside the same gate** or a
Driver pressing Accept in the same tenth of a second writes past a live hold.

**Rate card rebuilt.** Ceilings: Eco 20+1.85 · Business 48+2.00 · Business-van 45+2.25 · Luxury 115+1.90.
Floors: 12+0.65 · 13+0.75 · 17+0.90 · 20+1.10. Old Eco priced Nice → Saint-Tropez at **64%** of retail, now
79%. Uber excluded above the entry tier (*"they destroy the market"*). **Fixed class ratios dropped** —
observed retail ratios move with distance in opposite directions (Eco converges up on Business, Luxury
collapses toward it), which a single multiplier cannot express. Van at ×1.29 was contradicted outright: the
market prices vans at 0.97–1.09× a sedan.

**Three visuals generated from the real algorithm** (scratchpad + `~/Downloads`): the curve across four
posting scenarios, six real Riviera routes × four classes with the full money, and the SPEED WIN rule set.
⚑ Raw HTML opened from disk needs `<meta charset="utf-8">` or every `€` renders as mojibake.

**⚑ Carried into the build:** the Pool loads the whole archive and filters in memory (already flagged as the
first thing to break at 5 000) — fix it with the curve, since both land on the same read path.

## 2026-08-10 — Session 58 close — the founder's own test, and § U

**Deployed `9f99dd8` + `d50014b`, Vercel `success`. `npm test` = 318.** Six commits this session, all through
the new branch → CI → `main` loop.

**⚑ The founder tested slice 2 within the hour and found the bug the tests didn't.** `not_driven` writes no
status *on purpose* — nobody knows yet who is at fault — so the trip stays `confirmed`; and once
`close_answer` was set, `needsClosing` went false and dropped it **straight back into Upcoming**, and into the
tab count, as work they had just told us never happened. The partition now keys on the outcome being
**unsettled** (the same gate Cancel/Release already used) rather than on the question being unanswered, and the
card turns from an amber prompt into a quiet receipt — *"You said this trip didn't happen. The hotel has been
told and will be in touch."* The section retitles to **Waiting on the hotel** once everything in it is
answered. Pinned by a test.
- **The lesson worth keeping:** every automated check passed, and the defect was in the *state after the
  action* — the one place a unit test over a pure predicate can't look. Verifying a write path means looking
  at the screen the user lands on afterwards, not only at the row in the database.
- Across the founder's own seven test answers: **every `driven` closed with `waiting_fee` NULL.** The money
  guarantee held on their data, not just the two trips I drove.

**Also verified on their question — a NORMAL trip is untouched.** One real trip six hours out, both screens,
then deleted (baseline back to 271): Driver keeps *Start — I'm en route* + *Cancel this trip* and gets no close
card; Business keeps *Cancel trip*, *Agreed release*, *Edit details*, *Propose a change* and the Driver's phone,
with no wash. The new behaviour begins only once a trip is past when it should have ended.

**§ U added to BACKLOG — location as evidence, gated on the native app.** The founder's two asks (block
*Arrived* when GPS doesn't match; penalise lateness using location) plus the two things that would otherwise be
lost:
- **The Arrived guard must not be a hard block.** `arrived` is the precondition for reporting a **no-show**, so
  a dead GPS fix would stop an honest Driver claiming a fee they are owed. Suggest and record — stamp the tap
  unverified and show the Business — don't refuse.
- **A lateness penalty inherits D61's own reasoning:** you may not punish someone for ignoring a prompt they
  were never shown. It needs the notifications phase as much as it needs GPS. Three things undecided first
  (what "late" means · who is harmed — today lateness costs the Business nothing and the only money moving is
  the waiting fee, which flows *to* the Driver · fee vs reliability mark, and Q4 is still parked).
- **And the honest answer to "what proves the Driver did the trip?": nothing does.** Every signal is
  self-reported by the person being paid, except the hotel's knowledge, which is not in the app. Slice 2 added
  the one new piece of evidence there is — whether a trip was closed *at the time* or *by answering a prompt
  weeks later*.

## 2026-08-10 — Session 58 part C — § Q slice 2: the Driver answers

**⚠️ MIGRATION PENDING — `docs/migrations/2026-08-10_mission_close_answer.sql`, the founder runs it.** Until
then the cards render and every read is safe (`close_answer` comes back undefined, so `needsClosing` is
unaffected); only the two answer writes fail. `npm test` = **317**. Brief: `project/NEEDS_CLOSING_BRIEF.md`.

**Two columns, not an evidence table** — `close_answer` (`'driven' | 'not_driven'`) + `close_answered_at`. The
append-only tables (`mission_cancellation`, `mission_release`) exist because their rows are dispute proof over
money that moved; nothing moves here — it is one statement, from one party, that a human resolves off-platform.
The condition is written into the migration itself: **the day the Business can contest it in-app, this wants to
become `mission_close_answer` in the `mission_release` idiom.**

**`driven` does NOT go through `advanceStatus`, and that is the entire point of the slice.** One guarded
`→ completed` UPDATE with the status test inside the statement (a double tap, or a race with a Business cancel,
can only land once), **one** `status_event` stamped *now* rather than four backdated ones, and the same
amendment/release supersede the normal completion does. Nothing touches `waiting_*`. The reason is in the
S58-part-B log: the `on_board` step of that walk runs `board_guest`, and `mission_waiting()` returns the
ceiling when called days late — **660,00 €** invented across the 13 live `confirmed` rows. The comment on
`answerClose` says so at the call site, because the next person to "simplify" this will reach for
`advanceStatus`.

**`not_driven` writes no status at all.** Deliberately not a cancellation: that names a party at fault and
carries a fee (100% Driver / a ramped % Business), and nobody knows who is at fault — which is why we asked.
It clears the Driver's flag and gives the Business a red **"Driver says it didn't happen · nothing has been
charged — call them"**. Two taps on the Driver's side; it can't be undone from the app.

**`needsClosing` returns false once `close_answer` is set** — answered is answered, whichever way; a prompt
that survives its own answer is how people learn to ignore prompts. The Business's row deliberately does not go
quiet. **And while the close card shows, `StatusControl` stands down** — two competing sets of buttons on one
screen is how a Driver taps the wrong one.

**Copy shipped:** *"Should have finished 54 days ago."* + *"Closing it settles 120,00 € — the fare you
accepted. Waiting isn't included: it's only counted from an Arrived tap."* The waiting sentence is not
boilerplate — it is the difference between a Driver understanding the number and discovering a missing 40 €
later. `closingLine` moved into `lib/mission-cards.ts` so the list and the trip page cannot drift.

**✅ VERIFIED LIVE — the founder applied the migration the same session.** Both answers driven through the
real UI on real missions: `driven` → `completed` + `close_answer=driven` + `close_answered_at` set and
**`waiting_fee` still NULL** (the assertion the whole design exists to protect); `not_driven` → status
**unchanged**, answer recorded, no money touched. The Business's row went red with *"Driver says it didn't
happen · Nothing has been charged — call them"*. Both missions restored to their pre-test state, the single
`status_event` deleted by recorded id, baseline back at **271 missions**.

**⚑ Two more controls suppressed, found only by running it.** Answering `not_driven` makes `needsClosing`
false — which quietly handed **Cancel** and **Agreed release** back to the Business on a trip the Driver had
just said never happened. The gate is now keyed on the outcome being *unsettled*
(`needsClosing || close_answer === 'not_driven'`), not on it being unanswered. The same hole existed on the
Driver's own screen: **"Cancel this trip"** was still offered on a 51-day-old trip — a 100% penalty plus a
re-pool of a trip that already came and went. An unclosed trip now shows the Driver exactly **one** button.

## 2026-08-10 — Session 58 part B — § Q slice 1: "a trip the Driver never closed"

Branch `s58-needs-closing`. **No migration.** `npm test` = **314** (+20). Full brief, founder rulings and the
departures from § Q: **`project/NEEDS_CLOSING_BRIEF.md`**.

**How this started.** The founder asked what was wrong with the Driver's My Rides. Every one of the 8 trips in
**Upcoming** was 23–54 days old — and because the list sorts soonest-first, the *oldest dead trip was the first
thing on the screen*. Live count: **24 unclosed missions, 11 `on_board` + 13 `confirmed`** (`en_route` and
`arrived` have zero rows in the whole DB — Drivers never tap the middle steps).

**The founder's rule, and the departures from § Q.** Ask **30 minutes after the Driver reached the
destination** — their own worked examples: a 15-minute Nice run picked up at 14:00 reminds at 14:45; airport →
Saint-Tropez at 14:00 with a 15:45 ETA reminds at 16:15. **The anchor is arrival, and that is the GPS seam:**
today it's estimated from the booked route, later it's observed by a geofence — *one term changes and nothing
else does*, which is why building it on the clock now throws nothing away. § Q's 48h flip to the Business is
dropped (founder: "not 48H but almost instantly"); § Q's *nudge, never close* is kept.

**Where the founder's number could not apply, and why that is not a disagreement.** "30 minutes after arrival"
needs an arrival. A `confirmed` trip has none — so § Q's 3h stands for that group, floored so it can never fire
inside the check-in hour. The concrete failure otherwise: live `duration_min` has a **median of 27 minutes**, so
a flat arrival+30 fires at pickup+57 on **67%** of trips — replacing the schedule's red *"Not checked in — call
them"* with an amber clerical note while the Guest is still standing in the lobby.

**Adversarially refuted before a line was written, and it changed the work twice.**
- **The plan closed a never-started trip by walking `confirmed → en_route → arrived → on_board → completed`,
  "reusing every existing guard". The guard for the `on_board` step IS `board_guest`** — and `mission_waiting()`
  computes `w_to = least(now, guest_due + ceiling)`, so run days later `now` always loses and it returns **the
  ceiling every time**. Over the 13 live `confirmed` rows that is **660,00 €** of waiting nobody waited, billed
  to the Business and paid to the Driver. (Real waiting fees in this DB run 10–34 €.)
- **The same walk parks trips in `arrived`** — the one status that unlocks *both* no-show doors — and would
  write the `arrived` status_event `mark_no_show` looks for. § Q's reason the late-no-show branch was safe to
  omit is that it *can't* pass those guards; after the walk it can.
- Both are why the close action is **not in this slice at all**. Slice 1 ships no new money path whatsoever.

**Shipped.** A read-time predicate (`needsClosing`/`expectedArrival` in `lib/dispatch-status.ts`, mirroring
`isExpired`/`checkInOpen` — no column, no sweep, so the Driver's list, schedule, calendar and History can't
disagree), guarded against every false positive the refutation found: stops still being ticked off, at-disposal
hires, the check-in hour. Driver: a **Needs closing** section of full cards each carrying an amber line in
relative time that escalates minutes → hours → days (founder's call — full cards, not a summary: *"a trip that
wasn't closed is quite rare"*). Dispatch: a `Not closed` tone with the hint *"The Driver should have arrived at
11:05 and hasn't closed the trip — call them to confirm it happened"*, and the rows **lifted out of the
collapsed "Earlier trips" fold into today's band** — without that the tone was invisible, two clicks deep.

**⚑ The origin came from `waiting_to`, which removed the migration.** The refutation was right that reading the
boarding instant on some surfaces and not others reintroduces drift. The answer wasn't "join `status_event`
everywhere" (no index on `mission_id`, and only 2 of 11 live rows even have the event): `board_guest` stamps
**`waiting_to` on the mission row** at boarding, and it is NULL exactly when the Guest was on time. The one case
that matters is covered by a column every caller already selects.

**Three defects only a real screen caught** — a five-week-old `Checked in` still reading as current, Today's
count counting lifted rows (`23 trips` on an empty day), and the archive date overrunning the schedule's time
column into the route. All fixed, the first pinned by a test.

**Two controls removed from an unclosed row:** Cancel (`businessCancelPct` returns **100** on any past pickup —
a Dispatcher told to chase the row, unable to reach the Driver, would reach for the only button on it) and
Agreed release (re-pools a trip that already happened; `accept_mission` refuses a past pickup, so it would only
mint a dead pooled row). **Money-honesty fix in the same pass:** waiting settles at boarding, so an unclosed
trip can carry a real `waiting_fee` — `spendTotals` dropped it before the waiting block *and* `t.unsettled`
summed the fare only, so it appeared in no figure at all, including the line that exists so nothing is hidden.
Fixed in `lib/spend.ts` and the CSV together. **0 live rows carry one today**, which is why it was cheap now.

**Not in this slice, deliberately:** the close buttons themselves, the "it didn't happen" answer (Slice 2 needs
it — otherwise "Yes, I drove it" is the only control that clears the flag, with no time guard and a frozen
fare), email/SMS, and any GPS scaffolding.

## 2026-08-10 — Session 58 — CI: the checks now run on every push

Pushed `3032d8a` + `2a4e1de` (the action bump), both runs green in ~1 min. **One file: `.github/workflows/ci.yml`.**
There was no CI of any kind before this.

**What it does.** On every push (any branch) and every PR, a fresh Ubuntu runner does `npm ci` →
`npx tsc --noEmit` → `npm test` → `npx next build`. Node pinned to **25**, matching the Mac, so the runner can't
pass on a version we never ship from. `concurrency: cancel-in-progress` kills the superseded run when you push
twice to the same branch.

- **The build step gets placeholder env vars** (`https://placeholder.supabase.co` etc.) as step `env:`, because
  `next build` needs them to *exist* for page-data collection, not to be valid. **No real key is in the file** —
  it's public. This is the S55 trick, now permanent.
- **Nothing in CI touches the live DB.** The `.local/probe/*` scripts stay a human's tool; they're git-ignored so
  they aren't even on the runner.
- `actions/checkout` and `actions/setup-node` went straight to **v5** — v4 still targets the Node 20 runtime and
  GitHub annotates every single run about it. Second run is annotation-free.

**Verified before pushing, under real CI conditions.** A dev server was holding `:3000`, so the checks ran in a
**detached git worktree** (`node_modules` symlinked, **`.env.local` deliberately absent**) rather than against the
running server's `.next` — the S41 trick, and the right one here because it also proves the build works with no
local env file. `tsc` clean · **294/294 tests in 0.43 s** · build green (24 routes). Then confirmed live on the
runner twice with `gh run watch`.

**⚑ FOUNDER ACTION, and it is the half that matters: branch protection.** A green tick nobody enforces is
decoration. GitHub → the repo → **Settings → Branches → Add branch ruleset** on `main` → *Require status checks to
pass* → pick **`types · tests · build`**. Until that's clicked, CI tells you a push was broken *after* it deployed.
It is a web-UI setting; it cannot live in the workflow file.

## 2026-08-09 — Session 57 part B — THE LAST SIX OF THE 17

Founder: *"do the 6 left"*. Deployed `0bf3f3f` (the three cosmetics) and `ed9d660` (the three judgement
calls). `npm test` = **294**. **Three migrations written and NOT YET APPLIED** — they are the founder's to run.

### The three cosmetics (`0bf3f3f`)

- **The archive folded the waiting fee into the amount and named it only on a completed trip.** `rowCost()`
  adds waiting to every *settled* row, and the history page passes `rowCost(r)` as the displayed number
  (`history/page.tsx:306`) — so a cancellation and a no-show both had the waiting inside the figure with
  nothing saying so, on the two endings most likely to be queried. Now `… · incl. 33,00 € waiting`.
  Deliberately NOT on a `farePending` row: that one shows the bare agreed fare and is excluded from every
  total, so there is no waiting folded into it. Read back from the live archive.
- **`respond_to_release`'s decline reason was dead** — the RPC stored it, the only caller hardcoded `null`,
  nothing rendered it. The Driver now gets the amendment card's two-step decline, and the Business sees
  `Reason: …`. ⚑ The reasons are their **own** list in `lib/releases.ts`, not the amendment's: an amendment
  asks *"will you take these new terms?"* and a release asks *"will you give this trip up?"*, so
  "Schedule too tight" is not an answer to the second. Both cards now promise the same thing at the ask
  ("they'll see it · optional") — the Business has always been shown the amendment reason, so that card was
  under-promising, and [[d57]]'s rule is to change the promise before the text.
- **Comments claiming a driver cancel always re-pools as SPEED WIN.** It has been the [[d46]] 24h window
  since July. Reclaim genuinely is always SPEED WIN — gated to pickup within 60 min — and now says why.

### The three judgement calls (`ed9d660`) — designed, then refuted, then applied

A 13-agent workflow: one grounding pass, three designs, **two adversarial lenses each** (correctness and
blast radius), then a settle pass folding the refutations in. **Every plan was refuted at least once**, and
in each case the refutation changed the work — which is now the third session running where that has been
true. Worth keeping as method: the refuters also caught *each other*, and the settle pass overruled two of
their claims (a wrong test count of 281, and a wrong pair of line numbers both refuters agreed on).

**(A) The €0 fee hole — `docs/migrations/2026-08-11_fee_basis_band.sql`.** `p_fare_snapshot` is not merely
forgeable, it is **omittable**: leave the argument out and `business_cancel_mission` writes
`round(coalesce(null,0) * pct / 100, 2)` = **0,00 €**, while `driver_cancel_mission` has no coalesce at all
and writes NULL — so a Driver's 100% penalty renders as **"—"** in their own archive
(`rides/history/page.tsx:184`) and the manual settler gets no figure.
- **The fix is a band, not a recomputation.** `floor = least(coalesce(pdp_start, ceiling*0.5), ceiling)`,
  `basis = round(least(greatest(coalesce(p_fare_snapshot,0), floor), ceiling), 2)`. Porting the PDP into
  plpgsql was considered and rejected: it would make Postgres a second authority on the fare and contradict
  `lib/pdp.ts`'s own header ("the SINGLE place fare is computed"). The band is provable from that file —
  every branch returns `min(…, ceiling)` and the step count is floored at zero — so it is a **no-op on every
  honest call** and bites only on an omitted or understated one.
- **It is a floor, not a fence.** A forger can still understate to `pdp_start`: over the 271 live rows
  `pdp_start/ceiling` runs 0.50–1.00, so worst case is 50% off on a standard curve, 30% on SPEED WIN, exact
  after an amendment. Written down rather than glossed.
- **`mark_no_show` and `business_declare_no_show` have the identical SQL hole and are NOT fixed here.** What
  they got is the app-side half: all four RPC signatures now **require** the basis, so omitting it is a
  compile error. Say that plainly — the type does not imply the SQL is guarded.
- **One honest-path behaviour change**, surfaced by a refuter: if an amendment commits between the cancel
  modal's read and the RPC's lock, the floor becomes `new_fare` and the clamp records **more** than the modal
  quoted. Rare, arguably truer, and exactly the drift `.local/probe/quote-drift.ts` exists to police — so it
  is logged, not hidden.
- New drift pin: `tests/money-invariants.test.ts` § 4 transcribes the SQL clamp and asserts it is the identity
  on `settledFare` across five curves. **Proved able to fail** — removing the ceiling clamp from `settledFare`
  turns 5 red.

**(B) `accept_mission` enforced none of the Pool's matching rules —
`docs/migrations/2026-08-11_accept_mission_eligibility.sql`.** The whole vehicle/zone/luggage match was
TypeScript, while RLS hands every Driver every pooled mission id and the RPC is reachable with a Driver JWT.
Now three enum comparisons inside the RPC, under the existing row lock, in the house order (mission first;
the `driver` read takes no lock and cannot join a deadlock cycle). Radius and `required_make` stay out —
deliberately a strict superset of the Pool filter, so drift can only ever hide a trip, never refuse one.
- ⚑ **The honest limit, and the first draft got it wrong.** It checks that your accept matches your
  **declared** car, not that the car is real: `/settings/vehicle` re-declares make, model, body type and the
  luggage opt-in through the **service role** with no `verified` gate. What changes is the shape of the lie —
  public, attributable and persistent instead of invisible and per-request.
- ⚑ **The dev `?all=1` bypass is now LISTING-only** (SQL cannot read `NODE_ENV`; dev and prod share one
  Supabase project). Three **rendered** strings said the filters were off — corrected rather than left lying.
  A `driver.pool_bypass_until` column was designed and then **dropped**: the demo it existed for is already
  served twice over by `/settings/vehicle` and by the six seeded per-tier Drivers.
- **Verified live** on planted matching / mismatched / luggage-only pooled trips: Accept · notice · notice,
  with `?all=1` still listing all three.

**(C) A pending change and a pending release could both be live — `docs/migrations/2026-08-11_one_live_ask.sql`.**
Accepting the amendment first raises `ceiling`/`base_fare`/`pdp_start` to `new_fare`, and the release then
re-pools off that raised ceiling. One live ask per mission now, enforced at **propose** time on both sides:
`propose_release` supersedes a pending amendment, and a `before insert` trigger on `mission_amendment`
supersedes a pending release. It has to be SQL on that side — the amendment is a **client INSERT**, not an
RPC, and `mission_release` has no client write policy by design. The trigger also closes
**two pending amendments**, which was TypeScript-only and broke the `.maybeSingle()` on the Driver's page.
- ⚑ **The founder ruling, applied as recommended and reversible:** the newest ask REPLACES the older one.
  The cost is real and was hidden by the first draft — the amend form does not prefill from a retired
  proposal, so a Business that sends a release and is then declined must retype the whole change. A refuter
  also caught that the release modal promised *"the trip stays exactly as agreed"* on the very screen that
  destroys the change request; the modal and the schedule now say the cost **before** the tap.
- Deliberately unchanged: the respond side, and the Driver's page still loads both cards — if a legacy pair
  ever existed, showing both beats stranding one.

### Applied by the founder the same day, then verified — 23/23

**Regression cover first**, because four RPCs were replaced: `diff-sql-vs-lib` **649/0**, `write-test`
**170/0** (which is also the proof the clamp is a no-op on honest money — every one of its 170 stamped
numbers is unchanged), `migrations-2026-08-10` **68/68**. New re-runnable probe:
**`.local/probe/migrations-2026-08-11.ts`**.

- **(A) The band.** On a ceiling 200 / `pdp_start` 120 trip: an honest 150 passes through untouched; an
  **omitted** basis an hour before pickup now records **120,00 € basis → 108,00 € fee where it recorded
  0,00 €**; the Driver side records 120,00 € where it recorded NULL; 99 999 is capped to the ceiling; 1 is
  lifted to 120; a null `pdp_start` falls back to 100. A genuinely free cancel still records the basis with
  a 0,00 € fee.
  ⚑ **The first version of this probe passed for the wrong reason** — case A2 sat 6 hours out, where the
  cancel is free, so `0 × anything` is 0 and it proved nothing. Moved inside the fee window. A green test
  that would be green anyway is worse than no test.
- **(B) Eligibility.** A matching car accepts; wrong tier, wrong body and a luggage run the Driver hasn't
  opted into are all refused with `Not eligible for this mission`; and the *same* luggage run accepts once
  `accepts_luggage_runs` is flipped — the flag is snapshotted and restored.
- **(C) One live ask.** Both directions (release retires a pending change; a change INSERT retires a pending
  release, via the trigger), a second amendment retires the first, and the money case end to end: with a
  400 € amendment pending, the release retires it, `respond_to_amendment` then refuses, and the trip
  re-pools at **100,00 € = 0.5 × its original 200 € ceiling** — not off the inflated 400.
  ⚑ A label in the first run claimed the SPEED-WIN branch; the case sits 59h out, so it is the ≥24h branch.
  The value was right and the label was wrong — corrected, because a misleading green is a future trap.

Driver row and 271-mission baseline restored after every run.

### Verification

`tsc` clean · **294 tests** · `next build` green in a detached worktree (the shared `.next` belongs to
another chat's dev server) · the eligibility gate, the Pool copy, the archive waiting line and the release
decline all read back from the running app against the real DB · every probe undone, **271-mission baseline**.

⚑ **Two probe lessons.** An insert whose error is never checked reports success and silently does nothing —
three planted rows "existed" for two commands before the missing `if (error)` showed
`invalid input value for enum vehicle_category: "first"` (the tier is `luxury` in SQL and only *labelled*
"First"). And the `.local/probe/*.ts` scripts must be run with **`node`**, not `npx tsx` — no
`"type": "module"` in package.json, so tsx compiles them as CJS and top-level await fails.

---

## 2026-08-09 — Session 57 — the six drift-audit defects that needed no decision

Local session on the Mac, clean tree at `d8da366`. The founder's stated order put "the rest of the 17" first;
this is the six of them that need no founder ruling. Deployed `06aae27` → Vercel `success`. `npm test` = **273**.
**Two migrations are written and NOT yet applied** — they are the founder's to run.

**The plans were not re-derived.** S56 left verified fix plans in the workflow output
(`tasks/wrw5wnrkj.output` under the S56 session dir) plus a plan-check pass that came back `sound=false` on all
five areas. Both were read first, and the corrections changed the work in three material ways — all three are
recorded below, because in each case the *obvious* fix was the wrong one.

### Shipped in TypeScript

1. **`advanceStatus` supersedes pending negotiation rows on completion.** Every SQL terminal path already did
   (`business_cancel_mission` :102-105, `mark_no_show` and `business_declare_no_show` at
   `2026-07-22_airport_accent_fix.sql:123-126` / :191-194 — the plan cited :122/:188, the check corrected it).
   `advanceStatus` is the only terminal path written in TypeScript and it wrote status alone, so a normally
   completed trip could keep a permanently `proposed` amendment or release. The write mirrors the SQL exactly
   (`status='superseded', responded_at=now()`), through the service role — there is **no client write policy on
   `mission_release` at all**, and none for a Driver on `mission_amendment`.
2. **The pending cards stop promising an answer the RPC would refuse.** `trip-row.tsx:517` rendered
   "Change pending — Waiting for <Driver> to accept" gated only on `amendment.status === 'proposed'`, with no
   mission-status gate, while the release block at :595 had one.
   ⚑ **The correction that changed the design.** The plan's fix was to gate the amendment card the same way.
   The check pointed out that gating it *removes the only Withdraw affordance*, so a never-answered `proposed`
   row can never be cleared — and because `dispatch/page.tsx:186-191` keeps only the latest non-superseded row
   per mission, that stranded row **permanently masks an older `accepted` one**. So instead: both cards now
   render whatever the status, and swap their framing — `The trip has moved on — this change can't be accepted
   anymore` with a **Dismiss** button, versus the old "Waiting for … to accept" with **Withdraw**. The release
   card's existing hide-entirely gate was removed for the same reason. `close_release` / `closeAmendment` have
   no mission-status guard, so Dismiss genuinely works in both states (checked, not assumed).
3. **One `canEditInfo()` for the pre-departure edit rule** (`lib/dispatch-status.ts`), which was written by hand
   in three places and had already drifted: `edit/page.tsx:64` tested the raw `status` column, so a past-due
   `pooled` trip stayed editable until some other page happened to sweep it — while the same page rendered
   `missionTone()` above the form, correctly reading "Unfilled". The action keeps its own SQL half (it must —
   the guard has to be inside the one atomic UPDATE), now with `.or('status.neq.pooled,pickup_at.gt.<iso>')`
   added. **A blanket `pickup_at` floor would have been wrong**: a `confirmed` trip ten minutes past pickup is
   exactly when a Dispatcher fixes a Guest's phone number. The expired branch also gets its own copy — the old
   fallback would have read "it's already unfilled. Trip details are frozen once a Driver starts the run".
4. **`database.types.ts` was stale in THREE places, not two.** `kind` was missing `'business_no_show'` (extracted
   to `CancellationKind`); `StatusEventStatus` declared 4 of the 8 the CHECK allows; and `mission_cancellation`
   was missing `waiting_minutes` / `waiting_rate` / `waiting_fee` entirely, which all three cancel RPCs write.
   ⚑ **Widening `StatusEventStatus` alone does not compile** — `lib/mission-flow.ts:13`/:21 declare
   `Record<StatusEventStatus, string>` with exactly four keys. Split into a new `MissionStep = Extract<…>` so
   `advanceStatus` still refuses `"cancelled"` at compile time; the swap covers all 9 call sites (a repo-wide
   grep returns exactly those and nothing else).

### Written for the founder to run — NOT applied

- **`docs/migrations/2026-08-10_repool_clears_check_in.sql`.** All six re-pool UPDATEs across
  `driver_cancel_mission` / `reclaim_mission` / `respond_to_release` null `accepted_at` / `confirmed_at` /
  `stops_reached` but never `checked_in_at`, so Driver B inherits Driver A's D61 check-in. Damage verified
  against the readers, not assumed: `dispatch-status.ts:124` returns "Checked in" *and*, because that branch
  returns first, suppresses the red "Not checked in" wash; `checkInOpen()` is false so Driver B never sees the
  button; the My Rides badge filters `checked_in_at is null` so it never counts. Built **mechanically** — the
  three function bodies extracted from `2026-07-19_repool_speedwin_window.sql` (their authoritative definition)
  by line range, one token added, then diffed back: **exactly 6 of 210 lines differ**, all the intended token.
  `business_cancel_mission` is excluded on purpose (terminal, and re-creating the 2026-07-19 copy would roll
  back the 30-minute fee step); `accept_mission` is untouched (clearing on the way out is earlier and enough).
  ⚑ **The correction that removed work.** The plan offered an optional `hasCheckedIn()` TS guard as pre-migration
  scaffolding. The check showed it makes `checkInOpen` true while `check-in-card.tsx:34`, `rides/actions.ts:140`
  and :150 still read the column raw — so the button never renders, the action returns `ok:true` without
  writing, and the Business's row goes **permanently red with nothing able to clear it**. Dropped.
- **`docs/migrations/2026-08-10_amendment_lock_order.sql`.** `respond_to_amendment` locks
  amendment→mission (`2026-07-07_mission_amendment.sql:112` then :118), inverting the mission→negotiation order
  of all six other RPCs. A textbook AB-BA cycle, reachable because `/missions/[id]` renders the amendment and
  release cards on one screen — and it leaks, since `rides/actions.ts:42-46` passes any RPC message under 120
  chars straight through, so the Driver would read "deadlock detected". Inverted to match the already-fixed
  `respond_to_release`.
  ⚑ **The correction that was blocking.** The plan justified the now-unlocked `mission_id` read with "never
  updated by any code path". False: `p_amendment_business_update` is a USING-only policy with no WITH CHECK and
  no column restriction, so the owning Business **can** PATCH `mission_id` via PostgREST — which would apply a
  change to one mission and record it against another. The guard is now
  `... or v_am.mission_id is distinct from v_mid`, a post-lock assert, and that is the real reason the unlocked
  read is safe. Filename dated **08-10** on the check's advice: `_amendment_lock_order` sorts before
  `_cancel_fee_30min_steps` on the same date, and same-date ties are what made `respond_to_release` ambiguous.
  ⚑ **Parked, deliberately not bundled:** the same USING-only policy also lets a Business mutate `new_fare` on a
  proposal the Driver has already read. Unrelated to the lock order; needs its own RLS decision.

### Verification

`tsc` clean · **273 tests** (7 new in `tests/dispatch-gates.test.ts`, and **proved able to fail** — dropping the
`isExpired` call from `canEditInfo` turned one red, then reverted) · `next build` green (24 routes) in a
**detached worktree**, because another chat held `next dev` on :3000 and building in-place corrupts `.next`.

Against the **live DB**, all read-only unless stated:
- The new PostgREST filter run as a `SELECT` over all **271 missions** and cross-checked against `canEditInfo`:
  13 vs 13, **0 disagreements**. The 13 past-due **`confirmed`** rows stay editable — the counter-case that
  rules out a blanket floor.
- There are **0 `pooled` rows** in the DB (loading `/dispatch` sweeps them), so the pooled-exclusion branch
  can't be shown directly. The `.or()` **operator string** was proven instead on a status that does exist:
  192 rows in scope, 162 correctly excluded by the OR branch, 30 kept, 0 missing / 0 extra — which also settles
  that the dots in `.000Z` survive PostgREST's field.operator.value split.
- **One reversible write**, restored: the identical filter chain as an `UPDATE` — a live `confirmed` trip
  matched 1 row, an `expired` one matched 0, the write landed, then `reference` and `info_edited_at` were
  restored to the exact snapshot. 6/6.
- The edit page fetched per status through a real Business session: `expired` → the new unfilled copy ·
  completed / cancelled / on_board → the generic frozen copy · `confirmed` → the form.
- Both card states rendered for real: a `proposed` amendment + release planted on an `on_board` trip produced
  the "moved on" copy with **Dismiss** and zero "Waiting for … to accept"; re-pointed at a `confirmed` trip they
  went back to "Waiting for Marc Dubois to accept" with **Withdraw**.
- The supersede statements run verbatim against those planted rows. ⚑ **A better result than the assertion
  written for it**: that trip also carries a real `accepted` amendment from 2026-07-07, and the statement left
  it alone while superseding only the `proposed` one — which is precisely the masking case the check described.
- **Nothing needed repairing.** A read-only sweep found **0** stranded `proposed` rows and **0** missions whose
  `checked_in_at` predates a later `repooled` event. The one-shot repair in the migration is therefore a no-op
  safety net today, kept because it is scoped and idempotent and the founder may run it any time.
- Database restored to baseline after every probe: **271 missions**, 3 status events on the touched trip, 0
  proposed rows, no stragglers.

**Not verified, said plainly:** the trigger condition on the supersede (`requested === 'completed'` inside
`advanceStatus`) was not driven through the real UI. The two statements it guards were run against the real
tables; the guard itself is one line and compile-checked.

### Both migrations applied by the founder, then verified — 68/68

⚑ **Correction to the line above as first written:** the dev-login Driver was reported as having no `driver`
row. It does — `demo.driver@pickup.local` → Marc Dubois `c3758a83`. The lookup had selected a `name` column
that does not exist (it is `first_name` / `last_name`), and `.single()` on the error returned null. That gave a
real Driver session, which is what made the rest of this possible. *Match on `auth_user_id`, never on
`driver.email` — the S50 trap still holds.*

**Regression cover first**, because three RPCs were re-created: `diff-sql-vs-lib.ts` **649/0** and
`write-test.ts` **170/0**, baseline restored.

**Then the new behaviour**, via a new re-runnable probe `.local/probe/migrations-2026-08-10.ts` (manifest
first, delete by recorded id, `try/finally`, `--undo`) — 10 tagged throwaway missions, real Business and Driver
sessions:
- **`checked_in_at` is cleared on all three re-pool paths** — driver cancel, T-60 reclaim, agreed release —
  and on **both** sides of the 24h window, so all six UPDATE sites are covered. Alongside it: `status`,
  `driver_id`, `accepted_at`, `confirmed_at`, `pooled_at`.
- **The 24h SPEED-WIN window is intact**, which was the real risk in re-creating three whole functions: `<24h`
  → `speed_win=true`, `pdp_start=140` (0.7 × 200), `pdp_interval=5`; `≥24h` → `false`, `100` (0.5 × 200), `10`;
  `pdp_step=10` on both. A copy error here would have moved money silently rather than broken anything visible.
- **`respond_to_amendment` under the inverted lock order:** accept applies the new terms and collapses the
  curve (`ceiling=base_fare=pdp_start=175`, step 0, interval 0, no SPEED WIN); decline leaves the mission
  untouched and keeps the reason; an `on_board` trip is refused; a second answer is refused; an unknown id is
  refused. **The changed precedence is confirmed**: a Driver who doesn't hold the trip now reads *"Not your
  mission"* where the old order said *"no longer pending"*.
- Restored: **271 missions**, no tagged stragglers, and Marc's `reliability_marks` put back 3 → 0 (two driver
  cancels bump it as a side effect — worth remembering when driving that RPC).

**Still not proven, and it cannot be from outside:** the new `v_am.mission_id is distinct from v_mid` assert
only fires in a genuine race between the unlocked read and the lock. What is proven is that it does not
false-positive on any normal path.

---

## 2026-08-09 — Session 56 — § H2's SQL SIDE, and the cancellation fee stops sliding

Local session on the Mac. Started behind: `main` was at `1e78f84` while S55's three commits sat on `origin`
(S55 ran online). Fast-forwarded, `npm install`, **247/247 green**. Both S55 loose ends closed: `e05d1a7`
deployed to Production `success`, and `/dispatch/spend` → Today is grey and unscored as intended — though it
reads *"Nothing spent in Saturday 8 August either"* rather than the "Day still running" line, because the seeded
fleet stops on 7 August so yesterday was also zero. Branch order verified at `spend/page.tsx:308`; a finished day
still scores (7 Aug shows `+435,45 € · +725,7 %`).

### The read-only plan had no input data — so a better read-only route was found

S55's level (a) was "recompute the fees the real RPCs stamped, excluding the seeded fleet". **There are none.**
Excluding the 237 seeded missions: 34 real missions (23 expired · 6 confirmed · 3 completed · 2 on_board),
**zero** cancelled, **zero** no-shows, and `mission_cancellation` + `mission_release` are **empty tables**. Every
cancellation ever exercised (S39–S42, S51) was removed when the DB was restored to its 34-mission baseline. All
55 fee-stamped missions are seeded, i.e. written by the JS mirror — testing them would test the mirror against
itself, which S55 had already warned about.

**What worked instead:** `mission_is_airport()` and `mission_waiting()` are declared `immutable`, so **PostgREST
will execute them** with a JSON composite for the `mission` row — real SQL, zero writes. `.local/probe/diff-sql-vs-lib.ts`
drives them against `lib/cancellation.ts`: **649 checks, 0 mismatches** — NFC/NFD accents, casing, English/Italian,
`flight_number` `""` vs null, "Porto"/"Héliport" false-positive guards, four pickup dates including both Paris DST
nights, city+airport, `guest_ready_at` set/null/earlier, 20 offsets straddling every boundary, plus all 34 real
missions. Reusable; run it after any change to those two functions.

### The write test (founder's go-ahead) — 170 checks, and one process failure worth recording

`.local/probe/write-test.ts`: tagged throwaway missions on the demo Business, driven through the real
Business-side RPCs with a real `signInWithPassword` session (so `current_business_id()` resolves), every stamped
number compared against `lib/`, then deleted **by recorded id**. Manifest written before creation, `--undo` mode,
baseline count asserted at the end.

⚑ **The first run left 15 rows in the live database.** It crashed on a `@/lib` import *after* the RPCs had run and
*before* cleanup. Two fixes, both kept: everything after creation is now inside `try/finally`, and plain Node is
taught the `@/` alias via `module.registerHooks()` so the probe loads **exactly** the modules the app loads. Rows
were removed by hand within the minute; baseline restored.

⚑ **The probe also inlined its own copy of the euro rounding**, and went on reporting a failure after the app had
already been fixed. It now imports `cancelFeeAmount`. A probe with its own arithmetic tests its own arithmetic.

### D70 — the Business cancellation fee steps every 30 min (deployed `c41bc16`, Vercel `success`)

**The measurement that started it.** The ramp was continuous (`pct = 50 + 10 × (5 − hours)`) and recomputed from
`now()` inside the RPC, while the modal read the *client* clock and re-ticked only every 30 s. Measured live —
quote the fee, wait 30 s like a real person reading a modal, then cancel:

| fare | modal showed | DB charged | gap |
| --- | --- | --- | --- |
| 70 € | 49,00 € | 49,06 € | +0,06 € |
| 480 € | 393,61 € | 394,02 € | +0,41 € |

Always upward — the slope only climbs. **Rounding was investigated first and cleared:** 0 divergences in
5 000 000 random (fare, pct) pairs, and a deliberately constructed exact tie agreed. The clock was the whole gap.

**The founder's call, after arguing both sides.** Claude proposed ticking the modal every second (one line, no
policy change, ~1 cent) and treating steps as a separate pricing question. The founder went the other way and was
right: a slope cannot be explained, the modal's reference row had always *drawn* steps, and — their words —
*"we have to make rules and they'll get around it"*. They picked **30 minutes** over the hourly option; Claude had
argued 10 min on fairness and conceded 30 is better because it is **sayable** ("cancel before 14:30 and it's 60%")
where 10-minute treads are not. Claude's honest position, recorded: steps are *slightly less fair* arithmetically
(a slope charges exactly the proportional share of every second) but far more honest, and fairness nobody can
perceive is not experienced as fairness. Cliff per boundary: 5 points = 24 € on a 480 € trip.

**Shipped.** `treadTop()` rounds hours-to-pickup UP to its half-hour tread — **in the Business's favour**, so 50%
holds to T−4h30 rather than expiring at T−4h59, and the boundary itself belongs to the dearer band. Every hour
landmark is unchanged (5h→50 · 4h→60 … 0→100), so nothing that ever sat on an hour moved; only mid-tread values
change, all downward. New `nextCancelRaise()` returns the next boundary and the pct beyond it; the modal ticks
**every second** — but only the *countdown* moves, the price cannot — and renders
`This price holds until 16:20 — then 55% (264,00 €), in 6 min`, plus a `Free until … then 50%` variant.
Migration `2026-08-09_cancel_fee_30min_steps.sql` (founder applied it) replaces **only** the pct branch of
`business_cancel_mission`; guards, waiting settlement, supersede rules and the audit insert are byte-identical.

### ⚑ The bug the step CREATED, caught by the harness the same hour

Making pct a multiple of 5 made **exact half-cent ties routine** where the slope had made them essentially
impossible — which is why the 5-million-pair sweep had found nothing. **85,50 € × 95% = 81,225 €**: Postgres
`round(numeric, 2)` goes away from zero to **81,23**; float64 stores it as 81.2249999999999943 and rounds to
**81,22**. At 95% every fare whose cents are ≡ 10 (mod 20) ties — **one in twenty**. Caught by `write-test.ts`
case A17 on the first post-migration run. Fixed with `cancelFeeAmount()` (integer cents), now the single
definition the fee and the countdown both use; tests sweep **all 1.1 M** fare × pct pairs against exact decimal.
*(First version of that sweep used 1.1 M `expect()` calls and timed out at 5 s — it now compares plainly and
asserts once. The suite is a commit gate; a slow test is a skipped test.)*

**Verified:** 261 tests (was 247) in 473 ms · `tsc` clean · **the step proved able to fail** — the slope was
reinstated, produced 4 failures, reverted · **170 live checks post-migration, 0 disagreements**, at every tread
and both sides of every boundary · the boundary watched crossing in the browser
(`50% … in 5 sec` → `in 2 sec` → `55% · holds until 16:46`) · database restored to baseline every time
(271 missions · 0 cancellation rows · 705 status events · 0 stragglers).

### The drift audit — 17 confirmed, 8 refuted (all in BACKLOG § H2)

30 agents, five finders by rule area then adversarial refutation of every claim. **None are regressions from the
step; all pre-existing.** The two that matter most, both independently re-verified by hand rather than taken on
the agents' word:

1. **A trip that actually happens settles no waiting at all.** Both apps run a meter while a Guest is late; the
   Guest turns up, the trip runs, and nothing is written — `advanceStatus` writes only `status`, and **no
   TypeScript path writes `waiting_fee` anywhere**. So a Driver is better off declaring a no-show than driving a
   late Guest. The biggest hole in the D48 model.
2. **The cancel modal quotes `fare × %` and omits the accrued waiting the RPC also bills.** Confirmed by the
   write test's own output: case C0 quoted 47,99 € and the DB charged 47,99 € + 17,00 € = **64,99 €**. This is
   why the 0,41 € clock drift turned out to be the *small* problem in that modal.

Also confirmed: `p_fare_snapshot` is not merely forgeable but **omittable** — omit the argument and `coalesce(…, 0)`
stores a €0 fee (same shape on `driver_cancel_mission`, so a Driver can zero their own penalty); no re-pool path
clears `checked_in_at`; `respond_to_amendment` locks in the inverted order; `accept_mission` enforces none of the
Pool's matching rules. `database.types.ts` is stale in two places (`kind` is missing `'business_no_show'`, which
the DB has accepted since 2026-07-22 and which this session wrote for real; `StatusEventStatus` declares 4 of 8).

### D71 — THE WAITING MODEL COMPLETED (three jobs, all live)

The founder took the audit's biggest finding and ruled on it: *"the driver is paid the extra time by the
business, and the business will charge the guest"* — **waiting is owed whenever it happened; the trip going
ahead does not cancel it.** Kavenue bills the Business; what the Business recovers from its Guest is their side,
so Kavenue stays the agent. Parked for later, in their words: *"what if business don't want the driver to wait
after the courtesy wait"* — note the lever already half-exists as `business_declare_no_show`.

**Job 1 — the Driver could not see waiting they had been paid** (deployed `3857de0`; no migration). The Past
archive and the run card rendered `settledFare` alone while Earnings totalled `missionAmount` (fare + waiting),
so one trip read **60,00 € on the archive and 100,00 € on Earnings** — and the smaller number was the one that
looked like the record. Both now go through `missionAmount`, and the waiting is **named** rather than silently
added: `incl. 40,00 € waiting` under the total, on cancelled rows too (where the compensation had always folded
it in without saying so). Left alone deliberately: the two `settledFare` call sites feeding `DriverCancel` /
`NoShowControl` — those are the fee BASIS and must never include waiting.

**Job 2 — the cancel modal quoted the percentage, the RPC charged percentage + waiting** (deployed `1de76fe`;
no migration). Measured, not inferred: **47,99 € quoted, 64,99 € charged**. The headline is now the TOTAL when a
meter is running, with the split beneath, and the button names the same figure. Three corrections came out of
the plan review, all folded in:
- **"Free to cancel" now means free of EVERYTHING.** The meter runs from the Guest's *due* moment and
  `guest_ready_at` is the tracked landing instant, so an early flight can start it while pickup is still hours
  away and the percentage is 0 — that state used to render a green "Free to cancel" over a real charge.
- **The line added that morning went stale within hours.** "Any waiting already run is billed on top" was right
  while the headline showed the fee alone and became WRONG the moment the headline became the total. The
  hold-until promise is now scoped to the *percentage*, with a second line: "the waiting keeps running at
  1,00 €/min until you confirm."
- The reference row is captioned "How the **percentage** grows", since its "Free" chip would otherwise sit
  beside a real total.
Also removed a **third** hand-typed copy of the meter arithmetic — new `waitingBetween()` is the clock-free core
of `waitingAt`, and `dispatch-waiting.tsx` calls it instead of re-deriving `ceil((min(now,until)-from)/60000)`.

**Job 3 — a trip that RUNS now settles its waiting** ([[d71]]; migration `2026-08-09_waiting_settles_on_board`
applied; deployed `7a37ee5`). Only the three FAILURE doors ever wrote `waiting_fee`; `advanceStatus` writes
status and nothing else, and **no TypeScript path anywhere wrote a waiting column**. So a Guest 45 minutes late,
with a meter visibly running on both apps, cost nobody anything the moment they got in the car — and a Driver on
site was €1/min better off filing a no-show than driving them.
- New RPC **`board_guest`** handles `arrived → on_board` and settles the meter on the way. An RPC, not an
  extension of `advanceStatus`: that path writes through the service role and computes nothing, so putting the
  meter there would be a **fourth** hand-written copy on the one path with no SQL guard. It calls the same
  `mission_waiting()` off the same `now()` as the other three doors. `on_board` is the settlement point because
  it is when the waiting provably ENDED, it is the Driver's own action, and `FLOW` makes it unskippable
  (`completed` is unreachable from `arrived`).
- **NULL, not 0**, when the Guest was on time — a 0,00 € row on every completed trip would drown the ones that
  mean something.
- The Driver sees **one amber line** (`.dwait-kept`): `19,00 € waiting added · 19 min past the courtesy wait`.
  Founder: keep it very simple. They watched that money accrue; if it vanished at boarding they would have no
  reason to believe it counted. The Business is deliberately NOT notified at that moment (they already watch the
  same meter live), and there is deliberately **no waive button** — both founder calls.
- **The money screens needed NO change.** `spendTotals`, `totalsFor`, `rowCost` and `missionAmount` all already
  add `waiting_fee`, and `money-invariants.test.ts` already carried a completed-with-waiting fixture. Nothing had
  ever written the column. That was the entire bug — checked rather than assumed.

**Verified (job 3):** 51 live checks via `.local/probe/board-guest-test.ts` — city and airport, under the
courtesy wait, mid-meter, past both caps (40 € / 60 €), SQL matching `lib/` on every one. **Double settlement
proved impossible**: after boarding, all three other doors were called and all three refused, leaving the row
untouched; boarding twice also refused. Then the real UI path in the browser. 266 tests green, `tsc` clean,
database restored to baseline every time.

⚑ **Two process failures worth keeping.** The write probe's first run **left 15 rows in the live DB** — it
crashed on a `@/lib` import after the RPCs had run and before cleanup; everything after creation is now inside
`try/finally`, and plain Node is taught the `@/` alias via `module.registerHooks()`. And the probe had **inlined
its own copy of the euro rounding**, so it kept reporting a failure after the app was already fixed. A probe with
its own arithmetic tests its own arithmetic.

**Next on § H2: CI.** The suite exists, it is fast, and nothing runs it but memory — while Claude sessions push
straight to `main`.

---

## 2026-08-08 — Session 55 — AUTOMATED TESTS on the money (BACKLOG § H2, first pass)

**Why this and not a feature.** S54's own close named it: an adversarial audit of code that had already been
shipped *and* hand-verified turned up 17 real defects, three of them wrong money. The lesson recorded there was
that § H2's automated tests had become the highest-value engineering item in the backlog, ahead of any new
feature. The founder picked it from the menu. Nothing is charged in beta, so the risk being bought down is
**trust**, not euros.

**Session constraint, worth recording.** This ran as a **remote (cloud) session**, not on the founder's Mac:
no `.env.local`, so no live-Supabase reads and no browser verification, and pushes go to
`claude/new-session-e0zlki` rather than straight to `main`. That is exactly why the money functions were the
right pick — they are pure, and they are the one part of the app that can be verified at full strength with no
DB and no browser.

**What landed.** `vitest` as a dev dependency (`npm test` / `npm run test:watch`), `vitest.config.ts` aliasing
`@/` to the same paths `tsconfig` uses so a test imports exactly what the app imports, and **242 tests over 7
files** running in ~1.5 s:

| file | covers |
| --- | --- |
| `tests/pdp.test.ts` | `currentFare` · `settledFare` · `isAtCeiling` — the climb, the Ceiling clamp, SPEED WIN vs standard, `pooled_at` re-pool origin, rounding |
| `tests/cancellation.test.ts` | the airport predicate · courtesy wait · `waitingAt` meter · `noShowAvailableAt` · `businessCancelPct` · `cancelCompensation` |
| `tests/earnings.test.ts` | the Paris calendar (`dayKey`, `periodRange`, `parseDayParam`) + `totalsFor` / `missionAmount` |
| `tests/spend.test.ts` | `rowCost` · `spendTotals` · `breakdown` · `series` · `autoBucket` · `wasteLines` |
| `tests/history-filter.test.ts` | `historyFare` · `fold` / `highlightSegments` · `matchRow` · `parseHistoryQuery` · `applyHistoryQuery` |
| `tests/spend-filter.test.ts` | `currentSpan` / `comparisonSpan` — the pair behind the S54 landing-view defect |
| `tests/money-invariants.test.ts` | the cross-file identities (below) |

**The fixture is typed `MissionRow`, deliberately.** `tsconfig` includes `tests/`, so the day a money-critical
column is added to the schema the fixture stops compiling and the suite has to acknowledge it. A loose object
would have let the tests drift away from the table they claim to test.

**The regressions that are now pinned** — each one a bug that actually shipped, written as a test that fails if
it comes back: `settledFare` freezing at `accepted_at` (S48b — a trip accepted at €70 read €100 a week later);
the `roport` airport predicate across NFC/NFD/unaccented forms (S42 — the accented-airport 20-vs-60-minute bug,
with the two normalisations **built rather than typed**, since an editor silently normalises a pasted literal
and would make the case vacuous); the no-show clock running from the Guest's due time so a Driver tapping
`arrived` 33h early cannot bring the report forward (S41); `comparisonSpan` truncating a part-finished period so
8 days of August are measured against 8 days of July, not 31 (S54); waiting settled on a *cancelled* trip
staying out of cost-per-trip; and `series` counting only trips that ran.

**The three cross-file invariants** are the ones the founder checks by hand, now checked automatically:
1. **What the Business is charged is what the Driver is paid** — `spendTotals(...).total === totalsFor(...).total`
   for every ending (completed · completed-with-waiting · no-show · no-show-with-waiting · cancelled ·
   cancelled-with-waiting) and for a mixed period. This encodes [[d59]]: the Pool price *is* the Driver's price.
2. **The archive, the Spend page and the CSV total the same rows to the same number** — the 5 879,69 € agreement,
   asserted over the shared `applyHistoryQuery` → `rowCost` path, and re-asserted under four different filters
   so "Export CSV = exactly what's on screen" cannot quietly stop being true.
3. **`settledFare` is the one basis** — a fare, a no-show charge and a cancellation basis all price off the same
   frozen number, and reading a closed trip twice gives the same answer.

**The suite was proved able to fail.** Two mutations were applied to `lib/` and reverted: reverting `settledFare`
to the live climb → **28 failures across 5 files**; disabling the `comparisonSpan` truncation → **4 failures**.
A green suite that cannot go red is worth nothing, so this check belongs with any future addition to it.

**Verified:** 242/242 green · `tsc --noEmit` clean (tests included) · `next build` green. The build needs env
values to exist at page-data collection, so it was run once with placeholders to confirm the only failure in this
container is the absent `.env.local` and nothing to do with the change. Nothing under `app/`, `components/` or
`lib/` was modified — this commit adds tests and a dev dependency, and changes no product behaviour.

### Two things found while writing the tests — both then FIXED, same session

Found by reading, flagged to the founder, and fixed on their instruction (*"we need to have everything green and
stable"*). Neither was visible on screen as a wrong number; both were traps.

1. **`HistoryResult.spend` was dead and disagreed with both screens — DELETED.** `applyHistoryQuery` returned a
   `spend` that summed **fares only**, while `/dispatch/history` and `/dispatch/spend` both ignored it and
   re-totalled with `rowCost`, which adds waiting. So it was off by exactly the waiting on any period where a
   Driver waited, and it sat inside the one function both money screens run — the obvious-looking thing for a
   future session to reach for. Nothing read it (all four call sites checked), which is the only reason it was
   never wrong on screen. The interface now carries a comment saying there is deliberately no total here and
   that `rowCost` is the answer; a test asserts `"spend" in result === false` so it cannot come back quietly.
2. **"Today vs yesterday" was scored, and is now a target — `isRunningDay`.** `partial` is a day-granularity
   test (`today < toDay`), and today's own period *ends* on today, so no truncation happens and today-so-far was
   compared against all of yesterday. Because less spend is good news on a spend page, at 09:00 a hotel saw
   **"−320,00 € · −64,0 % vs Thursday 7 August" in GREEN** — the same "the period isn't over" trap S54 fixed for
   months, and visually identical to it.
   - **The founder's call, and it is the right one:** the comparison itself is *useful* — yesterday's total
     reads as a target for today. So it stays. What goes is the **scoring**.
   - New predicate `isRunningDay(span, now)` in `lib/spend-filter.ts` — true only when the span is one day and
     that day is today (which also catches a hand-picked range of just today). When it is true the hero chip
     goes **neutral grey with a flat icon** and reads `Day still running · Thursday 7 August came to 500,00 €`;
     the Trips caption reads `12 on Thursday 7 August` instead of `−9 vs …`.
   - **Deliberately narrow.** A running *month/week/year* is already truncated to the same number of days, so
     its green and red are earned and were left exactly as they are. Only the single day is unscoreable, because
     a day has no smaller unit here to truncate to. The fully general answer — compare against yesterday up to
     the same clock time, which is what GA4 and Stripe do — needs hour-level data and was not built.
   - 5 new tests cover the predicate (today only · not a running month/week/year · a range that is today · a
     single past day · read from the Paris calendar).

### What this does NOT cover — say it plainly

- **`RPC writes fee → page reads it` is still untested end to end.** These are tests of the TypeScript money
  functions. The SQL side (`accept_mission`, the four cancel/no-show RPCs, `mission_waiting()`) is mirrored in
  `lib/`, and the tests pin the mirror — they do not prove the two agree. S54 already flagged that the seeded
  fees were written by a JS mirror rather than the real RPCs; that gap is unchanged.
- **No React, no server actions, no RLS.** Deliberate: those need a DB and a browser, which this session had
  neither of, and the money functions were the highest-value target regardless.
- **No CI.** The suite runs on demand (`npm test`). Wiring it to run on push is a small, separate job — worth
  doing, and worth doing where a failing check can actually block something.

**Next on § H2, in order:**
1. **The SQL side, on the Mac.** The fee rules exist twice — in `lib/` and inside the RPCs — and only the `lib/`
   half is now tested. They were written to match and were checked by hand in July, but "written to match" is not
   "proven to match". The founder's call: **a Mac session does this**, since it needs the real DB. Two levels,
   cheapest first: (a) **read-only** — take missions the real RPCs already stamped with a
   `cancellation_fee`/`waiting_fee` and recompute what `lib/` says they should have been, ⚠️ excluding the seeded
   fleet, whose fees were written by a JS mirror and would only test the mirror against itself; (b) **write** —
   a tagged throwaway mission driven through the real RPCs and compared, then undone, which is the only way to
   prove `RPC writes fee → page reads it`.
2. **CI**, so the suite runs on push instead of when someone remembers. ~30 min; the value is that Claude sessions
   push to this repo.
3. Not planned: React/component tests. Slow to write, and they break on every redesign — and this app redesigns.

---

## 2026-08-08 — Session 54, part B — the Spend page in the founder's hands, then audited

**Shape of this stretch.** The founder tested the page against real volume and found things by using it; then asked
*"is everything wired?"*, which turned into a proper adversarial audit. Six deploys: `f04a91f` · `0b10759` ·
`b1cc85d` · `0bf4f08` · `3a76471` · `7378291`.

**A seeded fleet, because the real archive couldn't test anything.** 3 settled trips and one Driver proves nothing.
Seeded **237 missions over 3 months** onto the demo Business — 6 Drivers with real cars, **3 desks** (Concierge day /
night / Events) so the Desk breakdown finally has something to rank, and a realistic outcome mix (166 completed · 22
cancelled with ramp-computed fees · 10 no-shows · 23 unfilled · 16 never closed), **16 520,59 €** settled. Fees use the
app's own rules, so a wrong number on screen is the page's fault, not the data's. Everything past-dated, so the Pool and
today's Schedule stay clean. Script + manifest in the session scratchpad; `--undo` deletes by recorded id.
- **⚑ The trap, worth remembering:** `stops_reached` is NOT NULL, and **PostgREST writes NULL into any key missing from
  some rows of a batch insert**. An uneven row shape killed the first run half-way. The script now spreads every row
  over a template of all keys and writes its manifest incrementally, so a partial failure stays undoable.

**Founder-found, in order.** Delta column crushed against the amount (`.ebreak__r` existed in the approved mockup and
never reached globals.css) → rebuilt as an aligned grid with a named column head; then **the whole delta column deleted**
— *"a good UX means the user don't need to think"* — because a change column on a composition list made the reader work
out what a lone "+45,00 €" referred to. **The grey step line failed** (*"oh I got it, the grey steps was previous
period"*) → paired bars, founder's pick of three options. **Hover wash overhanging on the left** → twice wrong before it
was right: first the overlay was inset in literal pixels while the SVG is stretched by `preserveAspectRatio="none"`
(52 units renders ~73px), then the band was hard-coded at 72% which is only true when the 22-unit bar cap doesn't bite —
measured 5.0% on a day, 35.1% on a week. Now derived from the same geometry that places the bars. **"Does it look
ridiculous per day?"** → yes, and SPEND_BRIEF § 2 module 3 had already said *"Day → no chart at all"*; built it anyway,
now gated. **Search hint colliding** → hint and chips share one fixed-height row.

**Then the audit.** Five lenses (dead wiring · money · page-vs-CSV-vs-History parity · edge cases · copy), each finding
attacked by a skeptic instructed to default to "not real". 25 verdicts survived → **17 distinct defects**, all fixed in
`7378291`. The three that mattered most:
1. **The default view lied every month.** `currentSpan` returned the whole calendar month while the query only returns
   past trips, so 8 days of August were measured against all 31 of July — and the shortfall painted **green**. Span is
   clamped to today; `comparisonSpan` truncates the previous period to the same day count.
2. **History's CSV stopped matching History's screen** — caused by this session's own waiting fix, which touched the
   summary and not the export. Both now write `rowCost` under one header. Verified 5 879,69 € on both.
3. **Comparison bars duplicated and dropped days.** `compare[floor(i * len / len)]` drew 1, 10 and 19 February twice
   against March and never drew 11 January against February. Aligned by position now.
Also: cost-per-trip divided cancelled-trip waiting by a completed-trip count; the CSV total row was a lens subtotal
labelled as the period total; the CSV wrote `0,00` where the screen writes `—`; chart tooltips counted unfilled and
cancelled missions as trips while the hero didn't; a trip row said *"incl. N waiting"* under an amount that excluded it;
the legend/footnote/aria announced comparison bars the chart doesn't draw when the previous period is empty; "6
unfilled" was a dead end (new `unfilled` lens, every waste line is a link); lens clicks changed content 1500px below the
fold and never scrolled there; `aria-describedby` dangled the moment a chip replaced the hint; the loading skeleton drew
a chart the day view never renders.

**⚑ And the visual one, which was self-inflicted.** `preserveAspectRatio="none"` stretches the SVG's **text** along with
its geometry — every axis label rendered ~47 % wider than tall on the 1520px layout. Labels moved to an HTML overlay
positioned in percentages; only geometry stays in the SVG. Verified 19 label spans, 0 `<text>` nodes.

**Lesson worth keeping.** Three separate fixes to the hover band were each verified on ONE period and each shipped
wrong. Measuring painted geometry across *every* period is what finally settled it — and it was the founder asking *"did
you do it on all periods?"* that forced it.

**Still open, deliberately.** `?filter=` has no control on Spend (URL-only; the unfilled case is covered by a lens).
Modules 6–9 of the brief are phase 2/3. "Arrived on time" stays blank until check-in data exists. The seeded fleet is
still live in the DB until the founder runs `--undo`.

---

## 2026-08-07 — Session 54 — DISPATCH SPEND (BACKLOG § S, pass 1)

**Scope.** The founder opened by correcting the framing: *"it is actually spending right, we don't have access to their
earning"* — and asked for a full pro analysis tool for the trips a Business creates, with graphics, filters and
modularity, researched against the best available. So: research → brief → D25 preview → build.

**Research (7 agents).** Three read our own ground truth (BACKLOG § S + § R, a field-by-field audit of what the schema
can answer today, and what UI is already shipped and reusable); three read the outside world — B2B spend tools (Ramp ·
Brex · Navan · Stripe · QuickBooks · Spendesk · Pleo), travel/ground-transport back-offices (Uber for Business · Bolt
Business · TravelPerk · Egencia · Blacklane) and chart craft (FT Visual Vocabulary + charting-library trade-offs); one
synthesised. Output: **`project/SPEND_BRIEF.md`** — 9 modules ranked ACT/KNOW and TODAY/MIGRATION, page architecture,
filter model, charting decision, honesty rules, migrations, cuts, phasing.

**⚑ The data audit was the most valuable thing in the session, and it is bleak.** The whole live DB holds 34 missions;
the beta Business has 28; **exactly three have ever settled — 265,00 €**. Three of the four spend components are *real*
zeros (no mission has ever been cancelled, no-showed, or accrued waiting — the O7/D48 paths have never run against live
data). May 2026 is empty, so every "vs previous period" is against zero. And the single most striking fact: **603,50 €
across 6 past trips a Driver took and never closed — 2,3× everything that settled.** That is § Q showing up as money.

**Founder rulings.** (1) "Modular" = a **fixed pro layout + saved views via the URL**, not drag-to-rearrange widgets.
(2) Pass 1 = modules 1–5 + trip list + CSV. (3) **No `cost_centre` migration** — the 20-char `reference` is the
allocation hook for now. Pass 1 ships with **zero schema change**.

**The positive-values conversation, which changed the design twice.** The founder asked whether a page that is all
outgoing money could show anything positive. Four candidates were proposed; the founder **cut "Guests moved"** on their
own correct reasoning (`passenger_names` is optional, `pax_count` often blank — a headcount we can only half-observe is
worse than none). Then **"% under your Ceiling" was designed, built into the mockup, and cut.** The trap: under the PDP
the fare *starts* at a percentage OF the Ceiling, so raising your Ceiling improves the metric while you pay more
(100 € Ceiling → taken at 60 € = 40 % under; 200 € Ceiling → taken at 100 € = 50 % under, and 67 % more money). The
founder then closed it properly with a better argument than the trap: *the movement can come from season, hotel class,
demand* — so nobody can attribute it, and **a number nobody can read must not carry a positive framing**. It was
replaced by the thing it was proxying for: **time-to-accept**, which has no Ceiling confound.

**Built.** New `lib/spend.ts` (rowCost · spendTotals · breakdown · series · wasteLines · minutesToAccept),
`lib/spend-filter.ts` (SpendQuery extends HistoryQuery; parseSpendQuery defaults to *this month* where History defaults
to "any date"; comparisonSpan handles both anchor-stepped granularities and same-length custom ranges),
`components/spend-filters.tsx`, `components/spend-chart.tsx` (hand-rolled server-rendered SVG),
`app/(dispatch)/dispatch/spend/{page,loading}.tsx` + `export/route.ts`, `.dxs-*` CSS, and three shell registrations.

**Reuse was the design constraint.** `parseHistoryQuery`/`applyHistoryQuery`/`historyFare`/`TripRow`/`date-cal.tsx`/the
§ R filter vocabulary/the 8-column archive grid are all used as-is. No second calendar, no second filter vocabulary, no
second exporter.

**No charting library.** Recharts v3 is ~147 KB gzipped, ships a Redux runtime and forces `'use client'` so nothing
server-renders. Two chart forms did not justify it; `components/spend-chart.tsx` is ~80 lines of scale maths and paints
in the first server render. Click targets are real `<Link>`s layered over the SVG, so they are keyboard-reachable.

**Three bugs found by probing the running page, not by reading.**
1. **The breakdown counted unfilled missions as trips** — "Business · Van · 9 trips · 0,00 €" next to a euro column.
   Cause: `historyFare` returns `{ fare: null, counted: true }` for an expired mission, which is *correct* for a total
   (an unfilled trip really did cost zero) but wrong for a ranking of where money went. `!r.counted` alone does not
   filter them; the predicate needs `isExpired(m)` too.
2. **A zero-baseline delta rendered red.** "+265,00 €" and the hero pill were painted danger-red purely because May is
   empty — an alarm about nothing. Both are neutral now when the previous period is zero.
3. **A lone "Clear all" with no chips** when only a `lens` was active. The lens narrows the trip list, not the page, and
   already announces itself above that list — so it no longer counts toward the global "narrowed" state.

**One deliberate change to a shipped screen.** `HistoryResult.spend` sums the **fare only**, so Dispatch History was
quietly under-reporting any trip a Driver waited on and was paid for — and would have disagreed with Spend for the same
filter. History's summary bar and month bands now use the same `rowCost()` helper. Display-only; no per-row semantics
changed.

**Verified live against the real Supabase DB** (dev-login as the demo Business): 265,00 € · 3 settled trips · 20
missions ordered · 45,0 % requests covered · 11 min median time-to-accept · 603,50 € agreed-not-settled · 11 unfilled
with 1 710,00 € of Ceiling never spent — every figure matching a direct query of the DB. Day/week/month/year/range
spans, both lenses, all five dimensions, and the CSV (`;` + French decimals + BOM + a total row) all exercised.
`tsc --noEmit` clean, `next build` green (26 routes). Deployed `9849ecc`.

**⚑ What the page cannot prove yet, and it is not the page's fault.** One Driver and one Dispatcher hold 100 % of
everything, so the Driver and Desk breakdowns are single bars; three of the four components are zero; and the
comparison period is empty. **Testing this properly wants a seeded fleet** — the S42 approach (tagged fleet, restored
to a 34-mission baseline afterwards).

**Also this session.** `project/IDEAS.md` gained the V2 entry for a Driver reporting a bad booking: the founder ruled
out dedicated report buttons because the V2 in-app chat covers it, with the caveat kept on record that **chat gives
resolution but not measurement** — a tagged chat (reason chips that both send a message and record a countable tag)
preserves both, to be decided when the chat is designed. Confirmed from the code that **`mission_type` is read in two
places and written nowhere**, so "at disposal" cannot currently be booked at all; the founder scheduled it as its own
session, and IDEAS already carries the O12/V2 entry for it.

**Next.** Passes 2–3 in `project/SPEND_BRIEF.md` § 9: booking-notice (lead time × fare × fill rate), committed-spend
tail, Route breakdown, then service check (on-time from `status_event`) and the demand heatmap.

---

## 2026-07-31 — Session 51 — EXPIRED TRIPS: the missing protocol (BACKLOG § P, [[d62]])

**Scope.** The founder picked § P — item **A** of the three things they'd found by using the app. Five decisions were
open in the backlog; three of them changed what gets built, so I asked those and inferred nothing: expiry moment
(**exactly `pickup_at`**, no grace), where it lands (**stays on the schedule until the day ends**), re-post (**not now**).

**State on arrival, measured not assumed.** 34 missions; **23 pooled, every one past due**, oldest 2026-06-17 (44 days);
**zero** rows had ever been `expired`. `missionTone` had rendered the state since day one for nobody.

**⚑ The sharp edge.** `accept_mission` checked `status = 'pooled'` and not the time. Accepting a dead booking would
have produced a confirmed, priced trip that the whole O7 fee machinery ([[d45]]/[[d48]]) would then treat as real.

**Built.** Migration `2026-07-31_expired_missions.sql`: widen `status_event_status_check` to allow `'expired'`; a
`create or replace` of `accept_mission` adding one time check **inside the existing row lock** (everything else
byte-identical to the D55 version); and `expire_stale_missions()`, a `SECURITY DEFINER` sweep flipping `pooled → expired`
and inserting the `status_event` in **one statement** (a data-modifying CTE chain, so a row can't be expired without its
timeline entry). App: new `lib/expiry.ts` `sweepExpiredMissions()` called on the Pool + Dispatch schedule reads; a
`.gt("pickup_at", now)` floor on the Pool query (**including under `?all=1`**); `isExpired()` exported from
`lib/dispatch-status.ts` and used by `missionTone`, the trip-row Share lock, the "Edit details" gate and
`/missions/[id]`; an `expired` branch in `friendlyAcceptError`.

**No cron, on purpose.** Vercel Hobby caps cron at once per **day** — useless for a T-0 rule — and [[d61]]'s T-180
reminder needs a real scheduler regardless. Building half a scheduler here would have meant redoing it. The RPC is
idempotent, its UPDATE normally matches zero rows, and it **never throws** — which is what let the app deploy ahead of
the migration (confirmed in the browser: `Could not find the function…` logged, page rendered fine).

**Why `missionTone` also derives it.** The sweep runs on two pages; the calendar, the history and deep links don't
sweep. Without the display-level rule the founder's original complaint would have stayed true on the calendar.

**Verification (live, real Supabase DB, 34-mission baseline restored after).** Sweep closed **23 with 23 timeline rows**,
returns 0 on a second call. **A genuine UI race:** staged a trip 75s out → Accept rendered → clicked it **96s after** the
pickup passed → RPC raised, UI showed *"This mission expired — its pickup time has passed."* The sweep then caught that
newly-stale row on the next Pool read (timeline 23 → 24). Happy path: a +3d trip accepted → `confirmed` immediately
([[d55]] intact). Business schedule: **18 Expired rows** with the red wash. `tsc` + `next build` green (24 routes).
Deployed `d7e06d4` → Vercel `success`.

**⚑ Process note — my own error cost two round-trips.** I handed the founder a `bash` block (`open …`, then `pbcopy …`)
immediately above the words "paste this into the SQL editor"; they pasted the shell command into Postgres twice and got
`42601`. They then asked what a shell command even is — a fair question I should never have made them ask. **Name the
destination before the block, and give SQL as SQL.**

**⚑ Left open, deliberately:** an expired trip counts nowhere (fill rate needs § F2). And the third time now that a
feature has been found two-thirds built and unreachable — `reclaim_mission` after [[d55]], the check-in pill in
[[d61]], `expired` here. Worth a sweep for others.

**Noticed, not touched:** the Dispatch day headers render French (*"Samedi 11 Juillet"*) inside the English app — same
family as the French date picker already queued as item 2.

### Part C — the Earnings period picker + a custom range (item B of the founder's list; [[d64]]; deployed `684ae82`)

**Root cause, and it was a design decision not a slip.** `earnings-period.tsx` rendered a real `<input type="date">`,
hid it (`opacity: 0`, 1px, **`pointer-events: none`**) and drove it with `showPicker()`. Both reported symptoms fall
straight out of that: on a phone `showPicker()` on a non-interactive input does nothing, so the label was dead; on a
desktop the native calendar anchors to an invisible 1px box the user can't click away — "won't close". Probed live:
`showPicker()` also throws `NotAllowedError` without a gesture, so an uncaught throw in the handler was a second way
to fail silently. **And it was a dead end anyway** — `<input type="date">` cannot express a range, which was the other
half of the ask. So the native control is gone entirely rather than patched.

**Built.** The app's own calendar, deliberately the same shape as `components/date-time-picker.tsx` but NOT shared
code: that one is future-only + single-date, this one past-only + span. Merging them is a fair follow-up; doing it
inside a bug fix would have meant editing the money-critical mission form. New `lib/use-dismiss.ts` listens on
**`pointerdown`** (the old inline hook in the mission picker used `mousedown` only) — that is the actual mobile fix,
and the mission form should adopt it too. A 5th period `range`: two taps in either order, `?p=range&from=&to=`, with
the **‹ › arrows removed** rather than disabled. Presets: last 7 / last 30 / this month / **all time** (hidden when
the Driver has no history — `loadFirstDay()`). The band finally makes the pre-existing "granularity decides what a
tapped day means" rule *visible*: Month lights the whole month.

**⚑ Comparisons needed a new shape.** A custom span can't be expressed as an anchor, so `Range` gained
`prevCustom`/`lastYearCustom`. "The period before" is the **same-length** span ending the day before it starts —
comparing 46 days against a calendar month would be a lie wearing a real comparison's clothes. Copy borrows a neutral
`"period"` noun for range, since "the range before" and "same range last year" are nonsense.

**⚑ `parseDayParam` rejects 31 February.** `new Date(Date.UTC(y, 1, 31))` rolls over to 2/3 March silently, which
would have shifted a Driver's chosen span by days with no error anywhere. Reversed `from`/`to` is normalised rather
than rendered as zero earnings; an incomplete range URL falls back to the week.

**Verified live** on both viewports: tap opens · outside-tap and Escape close · two-tap range → "5 July – 20 July ·
16 days" · All time → "17 June – 31 July · 45 days", 265,00 €, 3 trips, and the comparison chip reads correctly with
the neutral noun · reversed URL normalised · `from=2026-02-31` falls back to Week with the arrows back. `tsc` +
`next build` green.

**⚑ Measurement trap worth remembering:** reading the DOM synchronously right after `.click()` shows the *old* state —
React hasn't re-rendered yet. I twice concluded the popover "wasn't opening" when it was; the third check, deferred by
120ms, showed it open. **Assert on React UI only after a tick.**

**Part C2 — the grid matches the period (founder's follow-up, deployed `df54770`).** The founder asked for the arrows
to step by period instead of always by month. **The arrows were the symptom:** the calendar always rendered DAYS, so
Month mode had you tap the 14th to mean "July" and Year mode had you tap any day at all to mean "2026" — it collected
information it discarded, and reaching 2024 took ~30 taps on ‹. Fixing the grid fixed the arrows for free. Month → a
12-month grid stepping a year; Year → a 12-year grid stepping 12 years; Day/Week/Range keep days and month steps,
because there the day is the unit or genuinely sits in the month on screen. **Year blocks END at the current year**
(2015–2026) rather than aligning to a calendar decade — a Driver's history runs backwards from today, so the default
block holds the data and no cell is spent on the future. The "pick any day — you'll get its X" footnote now shows for
**Week only**: it was a tautology in Day and is false in Month/Year. Month cells sliced to 3 chars (en-GB renders
"Sept" while every other month is 3 letters). Verified live across all five modes.

**⚑ The generalisable bit:** the founder asked for a control tweak; the actual defect was that the control was asking
the wrong question. Worth checking for the same shape elsewhere — a widget collecting precision the model then throws
away.

### Part B — Dispatch History, done properly (same day, [[d62]] cont.; deployed `73d7102`)

**Why it followed.** The founder's next question was whether the Business keeps a trace of an unfilled trip. It does —
18 rows already showed in History — but they said the screen "was never properly done", and they were right: 95 lines,
no filters, no counts, no per-view empty state. The Driver's Past tab got that in S47 ([[d56]]); this side never did.
So the expiry work had made a question answerable that the UI still couldn't ask.

**D25 loop honoured.** Mockup from the real tokens + the real July rows → founder amended the wording → built to match.

**Built.** `FILTERS` = All / Completed / **Unfilled** / Cancelled as server-side `?filter=` links, reusing the Driver's
`.rfilter`/`.rchip` (not a second control). **Counts are computed from the full set before narrowing** — a count that
moved with the active filter would force a click to discover an empty bucket. Plus a `.dxh-sum` one-liner and a
`.dx-count__bad` per-month failure count, both rendered only when non-zero, and the month suffix suppressed while the
Unfilled filter is active (redundant there). Two distinct empty states: never-any-history vs this-filter-is-empty.
A **no-show buckets under Completed** (`mark_no_show` pays the Driver in full) — same call `rides/history` makes.

**⚑ The wording fix, which is the part worth remembering.** "Expired" described the record, not the hotel's problem.
The founder chose **"Unfilled"** — and spotted that renaming the Schedule's live warning to **"No Driver yet"** frees
that word up. The two had both read "Unfilled": one a warning you can still act on, one a final outcome. That is the
single pair of labels a Dispatcher must never confuse, and it had shipped that way since S39. "No Driver yet" also
happens to match the Driver bar's pre-existing `No Driver yet · in the Pool`.

**⚑ The chip counts deliberately do not sum to All (3 + 18 + 0 ≠ 28).** The 8 past trips still sitting
`confirmed`/`on_board` have **no ending in the model** — accepted and never closed, one `on_board` for 36 days. The
founder declined a 5th bucket, so they appear under All and nowhere else, visibly. Hiding them would have implied we
handle them. **This is the next open question and it is a money question:** what does an abandoned trip cost, and who
pays? § P closed the *unfilled* hole; the *abandoned* one is untouched.

**Verified live:** Unfilled → 18 rows, month counts recomputed (7 + 11), suffix suppressed; Cancelled → 0 rows with its
own empty state and the chips still reachable; a staged 2h-out trip renders amber **"No Driver yet"** while a 30h-out
one stays **"In the Pool"**. DB restored to baseline. `tsc` + `next build` green.

---

## 2026-07-30 — Session 50 — CHECK-IN restored, and the fee hole that kept the take-back parked ([[d61]])

**Scope.** The founder ruled out the back-office and notifications for now — *"I need to have a complete functional
system between the Dispatch and the Driver and all UI done"* — so I audited what is actually open on that loop and read
the code rather than the notes. Top of the list: the Business's T-60 take-back is **dead code**. `trip-row.tsx` gates it
on `status === "accepted"`, which [[d55]] made unreachable. The founder's reply reframed it: *"At T-180 the system sends
a notification reminder to the driver, he has to confirm it, if not, at T-60 the dispatch has access to a button."* Same
feature — they were describing the design, I was describing the state.

**The archaeology.** That design shipped two-thirds built in S39 and then lost its other third. See [[d61]]; the short
version is that the pill, the hint and the red row wash all exist and have rendered for nobody since S46.

**⚑ I listed the take-back as buildable and had to withdraw it.** The S47 trigger — *"the Driver hasn't started"* — fires
on a Driver who simply intends to leave at 17:40 for an 18:00 pickup, turning a **90%** business-cancel fee into **0%**
one hour before every trip. The distinguishing signal is a response test, which needs push. Raised before any code;
the founder took the safe half.

**Built (9 files + 1 migration `2026-07-30_mission_check_in.sql`):** `mission.checked_in_at`; `checkInOpen()` +
`CHECK_IN_OPENS_MS` / `CHECK_IN_GRACE_MS` and a rewritten `confirmed` branch in `lib/dispatch-status.ts`; an explicit
`wash` flag on `MissionTone` driving a new `.dx-trip--warn` beside the existing `.dx-trip--alert`; `checkIn()` in
`rides/actions.ts` (+ implicit check-in on `en_route`); `components/check-in-card.tsx`; a flag on the My Rides list; a
count badge on the tab bar, counted in `app/(app)/layout.tsx`.

**Two decisions worth keeping.** No countdown copy on the check-in card — a live "pickup in 2h 47m" needs the client
clock and is how S33 shipped a hydration mismatch; the pickup time is already at the top of the card. And the badge is
computed in the **layout**, not the page, so it follows the Driver around the app: with no push, the badge *is* the
notification.

**⚑ Caught by probing, not by reading.** `within1h` (`pickup <= now + 1h`) is also true for a pickup in the **past**, so
six stale still-`confirmed` demo trips went red on the schedule alongside the three deliberate test rows. Bounded with a
1h grace in all three places (`missionTone`, `checkInOpen`, the badge query). Deployed as its own commit `aa18778`.

**⚑ Test-harness trap, recorded so the next session doesn't repeat it.** `?as=driver` signs in as
`demo.driver@pickup.local`, which maps to the **Marc Dubois** driver row — *not* the row whose `email` column reads
`s46.driver@pickup.local` ("Demo Driver"). I reassigned the test trips to the wrong driver on that assumption and got
three empty pages. The `driver.email` column is not the dev-login identity; `driver.auth_user_id` is.

**Verified live** on 3 tagged trips (T-2h / T-30m / T-8h) through real authenticated sessions on both subdomains: both
row washes, all four pill states, the badge counting 2 → 1, the button absent beyond 3h, `en_route` clearing the
warning, and 5 guards including a Driver being **denied** a direct PATCH of `checked_in_at`. DB restored to its
34-mission baseline, 0 leftover rows. Deployed `c6f13a0` + `aa18778` → Vercel `success`.

**⚑ Founder testing, 2026-07-31 — three findings, all recorded, none built:**
1. **The Pool is entirely stale.** 23 of 23 pooled missions have a pickup in the past (oldest 44 days); nothing has ever
   been marked `expired`. The status exists and `missionTone` renders it, but no code writes it and the Pool query has
   no time floor. **`accept_mission` has no time check either**, so a Driver can accept a dead trip and create a live
   priced obligation. Spec + the 5 open decisions → **BACKLOG § P**. The guard needs no scheduler; the sweep shares
   D61's.
2. **Driver Earnings:** no date-range filter, the calendar won't close on desktop, and it doesn't respond on mobile
   (`components/earnings-period.tsx`, `showPicker()` + focus fallback).
3. **Dispatch-side earnings/spend** wanted — mirror [[d59]] (BACKLOG § F).

**⚑ And a confirmation that matters:** the founder tested the "default vehicle class is ignored" item and reported
Business *was* selected. It is a **coincidence** — `service-class-fields.tsx:41` falls back to a hardcoded `"business"`
with no draft, and to `""` for the body (hence Sedan unselected). The setting is genuinely never read. Worth knowing
before someone "verifies" this is already working.

**Also this session:** the domain + email migration to `kavenue.fr` ([[d60]]) — logged separately under Session 49 —
and two scoping conversations that produced **BACKLOG § O** (trust & safety) and the parked **Guest touchpoint** idea.

---

## 2026-07-29 — Session 49 — THE DOMAIN MOVES TO kavenue.fr, and Kavenue gets email ([[d60]])

**Scope set by the founder, not the menu.** S49 opened with the A/B/C/D choice from `NEXT_SESSION.md`; the founder
picked none of them — *"before we are going further we have to update the domain name, I have bought kavenue.fr"* —
plus real mailboxes. This closes the gap the S44 rename left open: the product was called Kavenue but lived at
`pickupbedriven.com`.

**Answers that set the shape** (asked up front, three questions): registrar **OVHcloud** · email **Google Workspace** ·
old domain **full cutover**.

### Code (5 files, no schema, no behaviour change) — `0306bb7`, then `bce11e6`
- **`lib/hosts.ts`** — `PROD_BASE` → `kavenue.fr`. During the migration `isProdDomain()` checked a `PROD_DOMAINS` list
  accepting **both** domains while `originForRole`/`devLoginHref` still generated `PROD_BASE` URLs, so the old domain
  *funnelled onto* the new one and there was no switchover instant. Reverted to the single-domain check in `bce11e6`
  once every hostname was verified.
- **`support@` / `feedback@` mailto** → `kavenue.fr` (`components/help-legal-card.tsx`,
  `app/(dispatch)/dispatch/settings/page.tsx`). The stale comment claiming the addresses were placeholders is gone.
- Comment headers in `app/page.tsx` + `components/landing-splash.tsx` (the latter already imported `PROD_BASE`, so it
  followed automatically).
- **Sequencing that mattered:** DNS first, deploy second. Deploying while `kavenue.fr` was unresolved would have pointed
  live role-redirects at a dead host. Written into the runbook as a gate, not left as tribal knowledge.

### Infrastructure (founder-executed, Claude-verified at every gate)
Vercel: 4 domains, apex primary (**declined** Vercel's "redirect apex to www" default), `www` → 308 → apex, old
domains removed, project renamed `pickup-marketplace` → **`kavenue`**. OVH: parking A/AAAA/MX/SPF/ftp deleted, then
A + 3 CNAME + MX + SPF + DKIM + DMARC. Supabase: Site URL + 5 redirect URLs. Google Workspace: one user
`phyrass@kavenue.fr` + 3 free aliases, 2FA on.

### Verification — every gate probed, and two probes changed the plan
- **Vercel's DNS values were read off the panel, not assumed.** They were **not** the widely-documented
  `76.76.21.21` / `cname.vercel-dns.com` but a per-project `216.198.79.1` /
  `b995c589bd56b1fa.vercel-dns-017.com`. Guessing would have cost an hour.
- **An IPv6 false alarm, correctly dismissed.** `dig` returned an AAAA (`64:ff9b::d8c6:4f01`) for the apex — that is
  a NAT64/DNS64 *synthesis* of the A record by the local resolver (`d8c6:4f01` = `216.198.79.1`), not a zone record.
  Querying `dns106.ovh.net` directly returned nothing, which is the correct state.
- **The Mapbox step turned out to be a no-op.** Probing the geocoding API with referers `kavenue.fr`, the old domain,
  and *none* all returned 200 — a restricted token rejects the no-referer case, so the token was never restricted at
  all and nothing was gating the new domain. Step skipped, and the real finding logged instead (below).
- **DKIM proved twice.** Base64-decoded the published key and parsed it with `openssl` → valid **2048-bit RSA**, so the
  paste wasn't truncated (the usual DKIM failure). That still can't prove it's the *right* key — the real proof was
  `dkim=pass header.i=@kavenue.fr header.s=google` on a received message, with `spf=pass` and `dmarc=pass` beside it.
- Build output grepped: the only `pickupbedriven` string that shipped during the window was the deliberate
  `PROD_DOMAINS` constant; every `mailto:` resolved to `kavenue.fr`. After `bce11e6`, zero.
- Old domain → **404**. Cert: Let's Encrypt, valid to 2026-10-27. Both dev-logins hold **separate simultaneous
  sessions** on `driver.` and `dispatch.` — the host-only cookie split survived the move, which was the whole point of
  the subdomain design.

### ⚑ The OVH trap (worth remembering for `kavenue.com`)
A fresh OVH zone ships with its own **MX**, an **SPF** (`include:mx.ovh.com -all` — a *hard fail* that would have
blocked Google from sending as you), a parking **A**, an **AAAA**, and an `ftp` CNAME. Two subtleties: OVH files SPF
under its own record **type**, so it survives a "delete the TXT records" pass; and the **AAAA** is the dangerous one —
Vercel issues only an IPv4 A record, so a leftover AAAA sends IPv6 visitors to a parking page while the site looks
perfect to you over IPv4. Also: the **NS** records must be kept (deleting them takes the domain offline), and OVH's
"Overview of the recording" preview line is the reliable way to confirm `@` resolved to the bare domain and not
`@.kavenue.fr`.

### ⚑ Open / follow-ups
- **The Mapbox public token has no URL restrictions.** It ships in the JS bundle by design, so anyone can lift it and
  spend the quota. Mapbox's auto-created *Default public token* can't be meaningfully restricted — the fix is a **new**
  public token with restrictions, swapped into `.env.local` **and** Vercel, then a redeploy. ~30 min, not blocking.
  Logged in `DOMAIN_MIGRATION.md` step 5.
- **DMARC is at `p=none`** (monitor only) on purpose. Tighten to `quarantine` then `reject` once the `rua` reports show
  only your own senders — jumping straight to `reject` on a fresh domain bins your own mail.
- **`pickupbedriven.com` is removed from Vercel but still registered.** Worth ~€10/yr to keep parked; founder's call.
- **Transactional email (Resend, deferred phase) should send from a subdomain** — `send.kavenue.fr` with its own
  SPF/DKIM — so mission-alert volume never touches the reputation of the human mailbox. Noted in the runbook.

**Runbook:** `project/DOMAIN_MIGRATION.md` — 14 steps, each marked **[YOU]** or **[CLAUDE]** with a "done looks like"
gate. Written so `kavenue.com` later is the same file with one word changed.

**Session 50 is still the S49 menu** (back-office / notifications / pricing / the small ones) — untouched, nothing
consumed from it.

---

## 2026-07-28 — Session 48b — EARNINGS, and the fare freeze it exposed ([[d59]])

**Scope (founder-set).** "Simple but efficient", one-car independent Driver, **no charts**, filters by period, and a
comparison against the same period last year. D25 loop: mockup (week / month / quiet week) → founder feedback → a
second mockup for the date picker → sign-off → build.

**The bug found before building.** Probing the real DB showed a completed trip reading **€100** whose fare at accept was
**€70**: `currentFare()` climbs to `now`, so a finished trip keeps getting more expensive. New `settledFare()` freezes
the curve at `accepted_at` (falls back to the live fare when never accepted, so it's a safe drop-in). Swapped into every
**display** read of an assigned trip — `rides/page.tsx`, `rides/history/page.tsx`, `mission-run-view.tsx`,
`trip-row.tsx` (the Dispatch scan value), `dispatch/calendar/page.tsx`. **Left alone on purpose:** `p_fare_snapshot` on
cancel/no-show and the amendment from-fare — those set the euro basis of a penalty, which is founder-owned pricing
(BACKLOG § H2). Verified live: the Past tab now renders 70,00 € and no longer contains 100,00 €.

**Files.** New `lib/earnings.ts` (Paris-correct period maths — `parisMidnight` via a two-pass offset read so a DST
boundary can't shift a bucket, Monday-first weeks, `periodRange` returning label + prev/next/last-year anchors +
`isCurrent` — and the money: `totalsFor` / `missionAmount`), new `components/earnings-period.tsx` (segmented Day/Week/
Month/Year + ‹ › + the label opening a real-but-invisible `<input type=date>` via `showPicker()`; `display:none` would
make showPicker throw), rewritten `app/(app)/earnings/page.tsx` (was a "coming soon" placeholder), `lib/pdp.ts`
(`settledFare`), `app/globals.css` (`.eper*`, `.etotal*`, `.ecmp`, `.eyear`, `.ebreak*`, `.eday`, `.etrip*`, `.ejump`).

**Three queries per view** — the period, the one before it, the same one a year ago. The year-ago line renders only when
it's non-zero, so it activates by itself once there's a year of history instead of reading "no data" until mid-2027.

**Verified live vs the real DB** (3 completed missions, the only money in the fleet): month June = **265,00 € = 70 + 120
+ 75** (the settled fares, not the ceilings) · day 18 June = 120,00 € / 19 June = empty · year 2026 = 265,00 € · current
week = the empty state with › disabled and no comparison chip. The segmented control, both arrows and the date input all
navigate and carry `?p=&d=` into the URL. No console errors. `tsc` + `next build` clean (the two build warnings are
pre-existing: supabase-js on the edge runtime, webpack cache).

**Copy corrections during the build:** the preview's commission line was cut on the founder's instruction (the Pool price
IS the Driver's price — see [[d59]]); "No trips this week" becomes "that week" once you step away from now; and the trip
route wraps to two lines rather than truncating to "Cannes → 16…".

**Then the founder closed the fee-basis question the same session** — *"If a driver accepted a trip why would the fare
keep climbing? The final fare … is the price that the Driver accepted."* So `settledFare` went into the fee snapshots
too: `p_fare_snapshot` on `driver_cancel_mission` / `mark_no_show` / `business_cancel_mission` /
`business_declare_no_show`, `p_from_fare`, and the amendment's `buildFromSnapshot`. BACKLOG § H2's fee-basis flag is now
**RESOLVED**; a new § H2 entry records the founder's next question (100% is a weak deterrent on a €50 trip).

**⚑ The bug of the session, caught by probing not reading.** After the change the cancel modal quoted €70 and
`mission_cancellation.fee_amount` still recorded **€100**. Cause: `settledFare` typed `accepted_at` as *optional*, and
both actions files select a narrow `FARE_COLS` list that didn't include it — so it fell back to `currentFare(now)`.
The diff looked completely correct. Fixed by adding `accepted_at` to both `FARE_COLS` **and making the parameter
required**, so a narrow select is now a compile error rather than a wrong penalty. (Same shape as the S42 airport-regex
bug: correct-looking code, wrong at runtime, only live probing found it — more evidence for the § H2 automated-tests
argument.)

**Verified live, both directions, on throwaway missions** (ZZTEST, ceiling €100, accepted at €70, deleted after):
driver cancel → quoted €70, recorded `fee_amount 70 / fare_snapshot 70`; business cancel at T−1.7h → quoted 58,15 €,
recorded `fee_pct 83.09 / fee_amount 58,17 / fare_snapshot 70` (the few cents are the % clock ticking between render and
RPC, not a basis error). DB restored to its 34-mission baseline, `reliability_marks` back to 0, no ZZTEST rows left.
Dispatch's scan label now reads **"Agreed fare"** once `accepted_at` is set, "Fare now" only while pooled.

---

## 2026-07-28 — Session 48 — the Driver ACCOUNT rebuilt: hub + sub-pages, documents with a lifecycle ([[d58]])

**Scope (founder-set).** "Make a real and complete settings page like a real app" — research driver apps, do documents
properly, photos you can frame. D25 loop: two interactive mockups (hub + documents + capture, then vehicles + grouped
documents + the accept-time car picker) → founder Q&A → sign-off → build.

**Research fed the design.** French VTC roadside requirements (carte VTC, carte grise, assurance, RC Pro, REVTC, visite
médicale) and how Uber structures a driver account (documents with expiry dates + colour-coded warnings; vehicles;
payment; app settings). The URSSAF *attestation de vigilance* was the find that changed scope — it's an obligation on
**Kavenue** as donneur d'ordre (≥ €5 000 HT, re-collected every 6 months, joint liability if missing).

**Migration** `docs/migrations/2026-07-28_driver_account_and_documents.sql` (founder ran it, confirmed): 3 new
`document_type` values (`kbis`, `urssaf_vigilance`, `medical_certificate`); `document.side` (+ CHECK) / `review_note` /
`vehicle_id` (+ index); `vehicle.is_active`; `driver.company_name` / `siret` / `vat_number`. Additive only — an earlier
draft that also added `mission.vehicle_id` and rewrote `accept_mission` for a car picker was **cut** with multi-vehicle.

**Routes (net-new).** `/settings` is now a hub; `/settings/{profile,area,vehicle,company,documents,navigation,payouts,help}`
+ `/settings/documents/[type]` (unknown type → 404). `updateDriverSettings` split into `updateProfile` / `updateServiceArea`
/ `updateVehicle` / `updateCompany` / `updateNavigation`, each redirecting to its own page; every save
`revalidatePath("/settings","layout")` because the hub's readiness strip is computed from all of them.

**Files.** New: `lib/driver-readiness.ts`, `lib/nav-links.ts`, `components/image-framer.tsx`, `document-capture.tsx`,
`document-icon.tsx`, `language-picker.tsx`, `seg-field.tsx`, `settings-header.tsx`. Rewritten: `lib/account.ts` (doc
groups + `DocMeta` + `docState`/`docStateLabel`/`blocksWork`), `lib/documents.ts` (per-side rows, expiry, review note),
`components/avatar-editor.tsx` (now composes `ImageFramer`). Touched: `lib/document-actions.ts` (side + expiry validation
+ `vehicle_id`), `driver-tabbar.tsx` (Settings → **Account**), `help-legal-card.tsx` (`variant="driver"`),
`mission-run-view.tsx` + `missions/[id]/page.tsx` (Navigate button), `lib/database.types.ts`, `app/globals.css`
(`.dset*`/`.dback`/`.dident`/`.dready*`/`.drow*`/`.ddoc*`/`.dstage`/`.dnav`/`.dchip--btn`, and Driver-scoped 13px/500
form labels).

**Verified live against the real Supabase DB** (dev-login Driver, 375×812): all 10 routes 200 (unknown doc type 404);
**a real document filed end-to-end** — inject photo → framer → crop/rotate → upload → storage object + `document` row
with `side='front'` and `expires_at` → state computed **"Expires in 21 days"** (expiring/warn) → front View link, back
Missing; **rejected state** (`review_note` set via service role) → red pill + the note + the side picker moving to the
rejected side (fixed with a remount `key` — a client `useState` kept the stale side); SIRET validation rejects 9 digits
and saves 14 space-stripped, VAT upper-cased; Navigate on a live `on_board` trip resolved to the **drop-off** in **Waze**
(the Driver's own preference). No console errors. `tsc` clean. Test document + storage object deleted afterwards.

**Two design corrections made during verification.** Nine filled navy "Add" buttons on a fresh account was a wall →
outlined CTAs. And `Add your ${label.toLowerCase()}` produced "Add your vtc card" → labels stay verbatim, blockers sort
above warnings.

**Deliberately not built:** multi-vehicle (see [[d58]]); document *verification* (the admin workspace is a deferred
integration — states are honest, nothing reviews them); notification reminders for expiring papers (the copy promises
them; they need the notifications phase); and enforcement — readiness is shown, never gated.

---

## 2026-07-26 — Session 47 — My Rides tabs + day separators + the Past archive (Guest data leaves a closed trip) ([[d56]])

**Scope (founder-set, ask-first honoured).** The Earnings screen was deferred again; the founder asked for My Rides
first: "the history is an ugly link in the header, I want proper tabs and a clean page", plus **date separators** on
the current list and **Guest details gone from past rides** (Dispatch keeps them). D25 loop: two previews
(v1 tabs+separators+past card, v2 empty states + the cancelled question) → signed off before any code.

**Founder decisions:** tab style **A** (segmented pill, not underline) · labels **Upcoming / Past** · **no money
totals** on Past (that's Earnings' job) · a **filter row inside Past**, NOT a third tab (Claude's recommendation:
three segments crowd a phone and a cancelled trip is rare).

- **Tabs (`components/rides-tabs.tsx`, new).** A segmented control replacing the `History →` corner link. Deliberately
  still **two routes** (`/rides` + `/rides/history`) so each keeps its own server query and every deep link (the
  `← History` back link on a finished trip) still lands — the tabs are `<Link>`s, no client state. Counts render only
  when > 0; the Past count is always the **whole archive**, never the filtered slice.
- **Upcoming (`app/(app)/rides/page.tsx`).** Day separators from consecutive runs of `parisDayKey` (single pass, the
  query is already ordered): **Today** (navy) / **Tomorrow** / **Friday 31 July**, each with a ride count. New
  `formatDayGroup()` in `lib/format.ts` reuses the DST-safe Paris calendar arithmetic from `formatPoolWhen` (a Paris
  day is 23h/25h twice a year). **Found in the browser, not in the mockup:** every card repeated "Today · 26 Jul"
  under a separator already saying Today — the card now shows **only the time**, at 15.5px (`.pcard__time--lg`).
- **Past (`app/(app)/rides/history/page.tsx`).** Rebuilt off the old `.card`/`.route`/`.fare` markup onto a new
  **`.pastcard`** — a record, not work: date + time, a small status pill, a 2-dot rail with **single-line** addresses,
  Business + fare in the foot. No progress bar, no state-first lead. Month groups reuse the same `.dday` separator.
  Filter chips `All | Completed | Cancelled` are server-side (`?filter=`), hidden when the archive is empty.
  A **no-show ends as `completed` + `no_show=true`** (mark_no_show pays the Driver the FULL fare), so it correctly files
  under Completed — the founder chose to leave it there rather than add a 4th chip.
- **Cancelled trips: who + how much (founder follow-up, same session).** Traced a structural fact worth writing down:
  **a Driver only ever sees a cancelled trip that the BUSINESS cancelled.** `driver_cancel_mission` / `respond_to_release`
  / `reclaim_mission` all re-pool (`status='pooled'`, `driver_id=null`), so those leave the Driver's app entirely; only
  `business_cancel_mission` goes terminal with `driver_id` intact. So the card now says **"Cancelled by the Business"**
  and shows **real money** — `mission.cancellation_fee` (the 50–100% curve) + any `waiting_fee`, both already stamped on
  the row by the RPC — labelled **"Compensation"** so it can't be read as the trip fare. Shared
  `cancelCompensation()` in `lib/cancellation.ts` (list + detail can't drift); a legacy pre-2026-07-13 row with no
  stamped fee still shows "—". **This replaced the blanket "—" shipped hours earlier** — that caution was unnecessary
  once the asymmetry was understood.
- **Guest data leaves a closed trip (the privacy rule).** Enforced **server-side**, not hidden in CSS: for a terminal
  owned mission `missions/[id]/page.tsx` **never queries `mission_guest_contact`** and passes `archived` to
  `MissionRunView`, which drops the Guest name row, the name board and the Business's private message (both can quote
  the Guest). Kept: date, route, fare, status, **Business + Dispatcher** — a business counterparty and the Driver's
  only route to a dispute, not Guest data. A `.dlock` line says so once, plainly. **Dispatch is untouched.**
- **Also fixed at the root:** `formatMonth` was `fr-FR`, so month headings read "Juillet 2026" above "Fri 24 July"
  rows. Now `en-GB` — matches the rest of the (English) UI; the two `textTransform: capitalize` hacks it needed are
  gone, including in Dispatch history.
- **New CSS** (`app/globals.css`): `.rhead` `.rtabs/.rtab` `.dday` `.rfilter/.rchip` `.pastcard*` `.dpill--danger`
  `.dpill--sm` `.dlock--foot` `.pcard__time--lg`. `statusPill()` gained a **`cancelled`** case (danger + `CircleX`).
  Muted greys held at `--text-muted` (AA on both the sunken track and the page) per the founder's contrast note.

**Verified live** (localhost, real Supabase DB, 375×812): a tagged 8-mission set (`reference='S47QA'`) on the
dev-login Driver exercised Today/Tomorrow/weekday separators, both empty states, all three filters, the cancelled
"—", and the no-show pill; the archived detail showed **no Guest name / phone / board / message** while the same data
on an `en_route` trip still renders in full (no regression). No console errors. **DB restored to the exact 34-mission
baseline** (same status distribution) — the fleet + scripts live in the session scratchpad only, never the repo.
`tsc --noEmit` clean · `next build` green (24 routes).

- **Part B — the archive tells the WHOLE truth ([[d57]]).** The founder pushed back on "a cancelled trip in Past was
  always cancelled by the Business": a Driver can obviously cancel too (accident, breakdown). Both are true, and the
  gap between them was the bug — **a Driver cancel / agreed release RE-POOLS the trip and clears `driver_id`, so it
  vanished from the Driver's app entirely.** A Driver could pay a 100% penalty and take a reliability mark with **no
  record anywhere**. Both events are already recorded in side tables their own RLS lets them read
  (`mission_cancellation.actor_driver_id` / `mission_release.driver_id`) — never queried until now. No migration.
  - Past is now built from a `PastItem[]` union — missions (completed / Business-cancelled) + the two re-pooled
    endings — sorted together by `pickup_at` and grouped by month. The events' missions come via the **service role**,
    gated to exactly the ids the Driver's own event rows point at (after a re-pool they usually can't read them any
    more). Re-pooled cards are **not tappable** (`.pastcard--flat`, no chevron): the mission may belong to another
    Driver now, so no detail page would still be true.
  - Money reads in the Driver's direction: `Compensation` (owed to them) · **`Penalty` in red** (their own cancel is
    always 100%, D45 — founder chose to show it plainly) · `Free` · `—`.
  - **Reasons both ways.** The Business's `cancellation_reason` is now shown to the Driver — a **deliberate reversal of
    the S39 review**, which had hidden it; the founder's call. Condition attached: the Dispatch cancel field was a bare
    "Reason (optional)" promising nothing, so it now reads **"Reason (optional) — your Driver will see this"**, said at
    the point of writing rather than republished after the fact. The Driver's own reason is read back as *"You said: …"*.
  - **Cancelled pill lost its × icon** (founder: it reads as a dismiss control) — `statusPill` returns `Icon: null` for
    `cancelled`, both call sites handle it. `.dcancel-note` → `.dend-note`; new `.dreason`, `.pastcard__fare--pen`.
  - **⚑ Dead code found: the T-60 reclaim can never fire.** It requires `status='accepted'`, which Option A ([[d55]])
    made unreachable — accept now confirms instantly and existing rows were backfilled. The Business UI gate is the
    same condition, so the card simply never renders (dead, not broken — no failing button). **Deliberately NOT built
    a card for it.** Real consequence for next session: **a Business has lost its free remedy for a Driver who goes
    silent near pickup** — pairs with notifications. Founder also rejected "Lock-in"/"T-180" as jargon; agreed
    replacement when it returns: **"check in"** / "3 hours before pickup".
  - **Verified live** on 4 seeded endings (completed · Business cancel + reason + €130,40 compensation · own cancel +
    "You said" + €260 penalty, no chevron · agreed release + Free, no chevron), all three filters, and the relabelled
    Dispatch field. DB restored to the 34-mission baseline (missions + both event tables).

- **Part C — the T-60 remedy: designed, then deliberately NOT built (founder).** Worked the replacement through with
  the founder and stopped short of code, on purpose. Agreed shape: the take-back must **not** auto-re-pool — a confirm
  step offering **two** outcomes (back to the Pool as SPEED WIN, or a plain free cancel); trigger = the Driver hasn't
  started the trip (not `en_route`) inside the hour; a reliability mark only on a **real** no-response, which needs a
  response test (take-back instant, mark deferred ~10 min, dropped if the Driver touches the trip).
  **Why it stopped:** the founder asked whether any of it is necessary before notifications — correct. The response test
  is meaningless without push (**no service worker, no Web Push exists** — "enabling notifications on the phone" does
  nothing today), and fees settle MANUAL in beta, so the unfair ~90% charge exists only on paper. Building now = ship
  the weakest trigger, redo it later. Full decision trail parked in `project/NEXT_SESSION.md` so the next attempt
  doesn't restart from zero. An optional 10-min stopgap (a "Driver unreachable? Call us before cancelling." line in the
  Business modal) was offered and left undecided.
- **Housekeeping:** the spawned task on `mission.cancellation_reason` readability was **dismissed as superseded** —
  showing that reason to the Driver is now intended ([[d57]]), so the "leak" it was going to chase is the feature. The
  residual `mission_cancellation` actor-scoping inconsistency is harmless and noted here rather than tracked.

**Next (founder chose Driver Settings over Earnings):** (1) **redesign the Driver Settings screen** — the last
un-redesigned Driver screen, still on the generic `.card` styling; (2) the **T-60 replacement** + the "check in"
rename, once notifications exist; (3) **reliability marks** — whether a Driver sees their own; (4) the **Earnings
screen**. See `project/NEXT_SESSION.md` for the Settings brief and the full T-60 trail.

---

## 2026-07-25 — Session 46 — My Rides restructure + Pool empty/loading states + pre-accept polish + waiting-meter verification

**Part D — pre-accept card polish + Option A: accept always confirms (founder).** Three founder-flagged items on the
pre-accept / accepted Driver cards.
1. **Removed the redundant zone** from the pre-accept card footer (`missions/[id]/page.tsx`) — the city is already in
   the pickup address, and the Pool card never showed it. Footer now reads `distance · duration · Business · Sedan`,
   matching the Pool card.
2. **Shortened the unlock line** from "Guest name, the name board and any private message unlock once you accept." to
   **"Private details unlock once you accept."**
3. **Dropped the Lock-in time gate on accept (Option A).** The old `accept_mission` auto-confirmed only when pickup was
   <3h away, else left the trip `accepted` awaiting Lock-in at T-180 — but nothing flips it at T-180 (that needs the
   deferred cron), so a trip accepted 3h+ out sat in `accepted` limbo with no controls and a dead-end "awaiting readiness
   confirmation (Lock-in at T-180)" message. Founder chose: **accept ALWAYS confirms immediately.** Migration
   `docs/migrations/2026-07-25_accept_always_confirms.sql` (create-or-replace `accept_mission`, always `confirmed` +
   `confirmed_at`, plus a one-time backfill of existing `accepted` → `confirmed`). App: **removed the T-180 message**
   from `mission-run-view.tsx` and the dead "Awaiting Lock-in" list caption in `rides/page.tsx`. Done via the RPC (not by
   touching the shared `mission-flow` helpers, which the Dispatch `trip-row` also uses).
   - **⚠️ Needs the founder to run the migration** (Claude's keys can't run DDL). Deploy sequencing: run the migration
     first, then push — so no trip is briefly left in `accepted` limbo between the code deploy and the RPC change.
   - **Verified live (localhost, real DB):** footer zone gone; unlock line shortened; a `confirmed` trip shows
     "Start — I'm en route"; an `accepted` trip no longer shows the T-180 message (its controls return once the migration
     backfills it to `confirmed`). `tsc` clean.

**Part C — Pool empty + loading states (founder-approved, D25 preview signed off).** The un-designed parts S43 left.
- **New `app/(app)/pool/loading.tsx`** — a route-level Suspense fallback: the `pool-head` shell + three `.pcard--skel`
  card skeletons in the real Pool-card shape (fare/when/badge/route-rail/foot placeholders) that pulse via the existing
  `dx-pulse` keyframe, staggered `animation-delay 0 / 0.15 / 0.3s`. So navigating to the (force-dynamic) Pool shows
  structure, not a blank flash.
- **Both empty states redesigned** from the plain `.empty` text into a calm `.pempty` block (soft rounded icon tile +
  headline + muted subtext): the **no-trips** state names the filter in bold ("New **Business · Sedan** trips within
  **15 km of Paris** land here…") with a `ti`-less Radar icon + a quiet "Checking your area · pull to refresh" pulse
  line; the **no-service-area** state is a setup prompt (MapPin) with one filled navy CTA into Settings. New `.pempty*`
  + `.pskel*` CSS; no new keyframe (reuses `dx-pulse`).
- Files: `app/(app)/pool/page.tsx` (two empty states), `app/(app)/pool/loading.tsx` (new), `app/globals.css`. No schema,
  no data change.
- **Verified live** (localhost, real DB, mobile): both empty states screenshotted pixel-matching the preview (via a
  throwaway driver flipped null-base → Paris/15km); the loading skeleton **proven in the streamed `/pool` HTML** (the
  Suspense fallback ships the full `.pcard--skel` markup with the staggered delays — it renders correctly, just flashes
  too fast to screenshot on a local render). `tsc` clean.

**Part B — My Rides restructure (founder-approved, D25 preview signed off) [[d53]].** The complaint: `/rides` dumped every
active/completed trip in one scroll AND hung each mission's action buttons (Guest on board, the waiting meter, cancel,
amendment/release cards) inline under its card — so a live mission's controls sat sandwiched between unrelated rides.
The fix, per the approved 3-frame preview:
- **`/rides` is now a clean tap-through list** — one `<Link>` card per trip (state pill · when · progress · route ·
  business+fare · chevron), **current + upcoming only** (`accepted/confirmed/en_route/arrived/on_board`; completed &
  cancelled dropped to History). A small amber flag ("A change/release is waiting for your answer") when a
  `mission_amendment`/`mission_release` is `proposed`. No action buttons in the list.
- **`/missions/[id]` is the single "mission, opened" page, now branching by ownership.** OWNED (isMine) → the full run
  view (new `components/mission-run-view.tsx`, ported verbatim from the old inline rides card + `.dstack` actions) with
  a **`← My Rides`** back link and every action (StatusControl · NoShowControl · DriverCancel · Amendment/Release
  cards). OWNED + terminal (completed/cancelled) → the same view renders read-only (no executable step → no buttons) with
  a **`← History`** back link. NOT-mine → the unchanged pre-accept view (fare-first + Accept, `← Back to Pool`) or the
  "no longer available" notice.
- **Contact reveal moved from the batch list into the per-mission page**, still gated strictly to `isMine` (dispatcher/
  business/shared-guest phones via the service role, only inside the `isMine` branch; the list reveals business NAMES
  only). Amendment/release builders extracted to `lib/mission-cards.ts`; `statusPill`/`progressCaption` exported from
  `mission-run-view.tsx` so the list and the run view can't drift.
- **Copy (founder):** the no-show "The pro move" nudge cut to one generic line ("Make sure you've tried everything to
  reach the Guest — a call, the full wait. Then you're clear to report." — no more "bags"); the filled report button
  drops "you're paid" ("Report the no-show — €X + €Y waiting").
- Files: `app/(app)/rides/page.tsx` (rewrite → list), `app/(app)/missions/[id]/page.tsx` (branch + run data load),
  `components/mission-run-view.tsx` (new), `lib/mission-cards.ts` (new), `app/(app)/rides/cancel-noshow.tsx` (copy),
  `app/globals.css` (`.ridecard*`). No schema, no migration, no server-action/RPC change.
- **Verified live** (localhost, real DB, mobile) on a seeded 6-mission mix: list shows the 5 active as tap-through cards
  (completed correctly absent); the airport Arrived opens with `← My Rides` + meter + new copy + the "€95 + €23 waiting"
  button; completed opens read-only with `← History`; a seeded pending release shows the list flag AND the accept/decline
  card on the detail page; a pooled trip still shows the pre-accept Accept view. `tsc` clean; no console errors. 3-lens
  adversarial review (privacy-gating · parity · branching).

**Part A — verified the S45 waiting-meter visuals against live data (no code change, item #1).** Close the one gap S45
left open: the `arrived` waiting-meter (`.dmeter`),
its capped state, and the no-show confirm nudge were never seen against real data (no trip was in that state when S45
shipped). A *look*, not a rebuild — D48 logic is unchanged. No code, no schema, no migration.

**Method.** The UI can't post a past-pickup mission (the form, plus the D48 `pickup_at` freeze trigger — which is
`before update` only), so — per the S42 test-data precedent — a scratchpad service-role script seeded 3 tagged
(`reference = "S46-VERIFY"`) `arrived` missions with past `pickup_at` + a matching `arrived` status_event, under a
dedicated dev driver (`s46.driver@pickup.local`) so `/rides` stayed clean of the demo driver's ~20 legacy trips.
Dev-login as that driver → `/rides`, screenshotted each state, then deleted the 3 missions (DB restored, tree clean).

**Verified live (localhost, real Supabase DB), mobile 375×812:**
- **Running meter (amber `.dmeter`)** — city + airport variants. Warm amber panel, `Paid waiting · N min`, live-ticking
  fee, amber progress bar, note `1,00 € per minute started · stops at 40,00 € / 60,00 €`. Matches D48 exactly (€1/min
  started, courtesy 20/60 min, cap €40 city / €60 airport).
- **Capped meter (`.dmeter--capped`)** — a neutral "closed" look (deliberately NOT amber): `Waiting closed · 40 min ·
  40,00 €`, full bar, note "Stopped at the 40,00 € ceiling… report when you're ready." Good contrast: amber = money
  accruing, neutral = money stopped.
- **Confirm nudge** — tap "Report a no-show" → "The pro move" reassurance box + the one filled button `Report the
  no-show — you're paid 95,00 € + 24,00 € waiting` (fare + live waiting fee summed, the `waiting.fee > 0` branch) +
  quiet "Keep waiting". One filled button per card ("Guest on board"); no-show + cancel stay `.dquiet`.
- No console errors; the meter renders + ticks correctly, no visual defects.

**Outcome.** S45's flagged "not verified live" gap is CLOSED — no code change warranted. Inert test identities
(`s46.driver` / `s46.verify` dev auth + their driver/business rows) left in the DB like the existing seed identities;
the 3 test missions were removed.

---

## 2026-07-25 — Session 45 — the two remaining Driver cards (pre-accept + accepted), redesigned

**Scope.** Carry the S43 Pool-card design language onto the last two un-redesigned Driver screens. No schema, no
migration, no behaviour change — presentation only. Same data, same server actions, same RPCs, same copy strings,
same gating conditions. D25 loop: one preview covering both cards → founder sign-off with two notes (drop the fare
beside the Accept CTA; give the accepted card real breathing room, scrolling is fine) → built to match.

**Approach — the cards REUSE the Pool card's classes rather than copy them.** `.pcard__head/__fare/__when/__day/
__time/__body/__badges`, `.pbadge--type/--speed/--run` and the whole `.proute*` rail are plain (unnested) selectors,
so both screens now render an opened mission out of the *same* vocabulary as its Pool card. Only a roomier container
(`.dcard`) and the pieces the Pool card has no equivalent for are new (~230 lines appended to `app/globals.css`):
`.dcard__label`, `.dfact*`, `.dchips/.dchip`, `.dlock`, `.dpill--neutral/info/go/warn`, `.dprog*`, `.dcall*`,
`.dnote*`, `.dreached/.dnext` + `.proute__dot--done/--now`, `.dmeter*`, `.dcta/.dcta--done/--ghost`, `.dquiet*`,
`.dstack`. Nothing at weight 700 (the S43 rule). `.dcard` overrides give the Pool-card pieces more air — a detail
screen is *read*, a Pool card is *scanned*.

**1. Pre-accept — `/missions/[id]` (`page.tsx` + `accept-button.tsx`).** Now reads as "the Pool card, opened":
fare + `formatPoolWhen` head, badges, then the route rail **uncollapsed** — every waypoint shown with its full
address instead of the Pool card's `+N` (the one thing a Driver opens the screen for). `zone` rides on the facts
line. The `.kv` dt/dd list became a `Service` card of `.dfact` rows (Passengers / Luggage / Flight) plus `.dchip`s
for languages, dress code and request flags. The "revealed once you accept" sentence became a `.dlock` row with a
Lock icon, and is now shown **only while the mission is still pooled** (it was previously shown even to the Driver
who already owned the trip). Action is a full-width `.dcta` in normal flow — **no sticky bar, no fare beside it**
(founder's call); the `isMine` state is a `.dcta--ghost` link, the gone state keeps its `.notice.warn`.

**2. Accepted — My Rides (`rides/page.tsx`, `status-control.tsx`, `cancel-noshow.tsx`).** The card is a working
tool now, so **state leads and the fare stops being the headline**: a `.dpill` status pill (tone-mapped
info/go/neutral/warn) + day/time head, then progress, route, contacts, prep. The fare moved down to `.pcard__foot`
beside the Business name. `StatusSteps`' five cramped labels became one `.dprog` segment bar + a plain-words caption
("Not started" / "On the way" / "Waiting for the Guest" / "On board · 1/2 stops" / "Completed"), with an aria-label
so the bar isn't colour-only — it reuses the exported `progressSegments`/`progressDone` maths, and
**`components/status-steps.tsx` was left untouched** because Dispatch still renders it. Stop progress moved from
`.leg-tag` pills onto the rail itself (`--done` / `--now` dots + `.dreached` / `.dnext`). Contacts became
`.dcall` tap-to-call chips (Guest / Dispatcher) instead of `.contact-row`/`.kv` rows — same privacy gating, an
unshared number is still never rendered. Name board + private message became a `.dnote` prep box. The duplicated
Business row was dropped (it's in the card foot).

**3. One filled button per screen.** `StatusControl` is a `.dcta` (`.dcta--done` for "Complete ride" — that also
fixes the long-standing `success-btn` fall-through to navy, so **Complete ride is finally green**, one of the
open "navy polish" items). "Report a no-show" and "Cancel this trip" dropped to `.dquiet` text actions, so the pro
path is the loud one; the no-show **confirm** step keeps its filled amber button, because at that point it *is*
the action. `DriverCancel`'s hand-rolled sheet is now a `.dcard`. The D48 waiting meter kept every number, gate and
copy string and was restyled to `.dmeter` (amber accruing → `.dmeter--capped` neutral), fee at weight 600 not 700.

**Verified.** `tsc --noEmit` clean · `next build` green (24 routes) · both screens loaded in-browser at 375×812
against the **real Supabase DB** as a real authenticated Driver (Pool → mission detail → My Rides), 0 console errors.

**⚑ Not covered by live verification:** the `arrived` + waiting-meter and no-show confirm states, and the
release/amendment overlays, were not reachable with the demo data on hand — their logic is byte-for-byte unchanged
(class swaps only) and `tsc`/`build` are green, but the *visual* result of `.dmeter` is unproven against real data.
Worth a look next session, or the moment a real trip reaches `arrived`.

**Still open on the Driver side:** the Pool empty + loading states; the discreet-vehicle keep/drop call; the
Earnings screen; guidance Tier-2 tooltips.

---

## 2026-07-25 — Session 44 — PickUp → Kavenue rename (brand only, no behaviour change)
**Branch:** `rename/kavenue` → merged to `main`. **No migration. No schema, dependency or behaviour change.** Executes
[[d50]]; the full rationale + the never-rename list is **[[d51]]**.

**Scope: 51 files.** User-facing copy (Dispatch topbar wordmark → "Kavenue Dispatch", login/welcome/dev-login titles,
FR+EN legal pages, Business + Driver Settings, cancel/no-show, release + amendment cards), `app/layout.tsx`
`metadata.title`/`description`/`appleWebApp.title`, `public/manifest.webmanifest`, `package.json` + `package-lock.json`
(`pickup-driver` → `kavenue-driver`), `README.md`, `.claude/launch.json`, all of `docs/` + `project/`, and **SQL comments
only** in `docs/migrations/*.sql`. Two git-renamed files (tracked as renames, history preserved):
`docs/PickUp_Phase0_Data_Spine.md` → `docs/Kavenue_Phase0_Data_Spine.md` · `docs/pickup_schema.sql` →
`docs/kavenue_schema.sql`, all 12 references updated.

**The hard part was the never-rename list** — "PickUp" the brand and "pickup" the transport term are the same token.
Held back deliberately: every `pickupbedriven.com` hostname (DNS move hasn't happened) · the
`Phyrass-H/Pickup-marketplace` remote · the `PickUp_project_dev` directory · `PickUp Go` + La Poste's "Pickup" trademark
+ all rebrand/historical prose (renaming these makes the sentences self-contradicting) · the transport term and its DB
columns (`pickup_at`, `prefill_pickup`, `isAirportPickup`, the "Pickup"/"Route" headers) · and two **live-data
couplings**: the `pickup-dx-collapsed` localStorage key and the `*@pickup.local` dev-login/seed emails, which address
real Supabase auth rows — renaming the constant alone breaks dev-login. Full list in [[d51]].

**Method.** 7 parallel edit agents partitioned so no two touched the same file, under one explicit ruleset; then 4
adversarial verify lenses (missed-brand · over-rename · reference-integrity · copy-coherence). The decisive check was
**mechanical reversibility** — reverse every added line (Kavenue→PickUp) and diff against the removed line: **0 mismatches
across 209 changed lines**, proving no collateral edit. 23 findings → real ones fixed. Biggest miss: `NEXT_SESSION.md`
was skipped entirely and still claimed the rename hadn't happened (plus 2 dead file paths) — the one file every new
session reads first. Also fixed: stale "RED Executive" survivors in `IDEAS.md` + `SESSION_LOG.md:295`, and a
`package-lock.json` name drift that the next `npm install` would have silently rewritten.

**Verified.** `tsc --noEmit` clean · `next build` green (24 routes) · dev server on :3000 vs the **real Supabase DB**,
18 routes fetched (Driver + Dispatch + public + manifest + both legal pages) → **0 occurrences of "PickUp"** in rendered
HTML · no console errors · FR legal élision checked ("Kavenue" is consonant-initial, so "de Kavenue" is correct).

**Not done (founder-owned):** the repo **directory** rename, the **GitHub repo** rename, the **domain migration**, and
`.claude/settings.local.json` (a permission rule mentions the old brand; line 32 holds a stale — already-dead —
`pickup_schema.sql` path). Claude deliberately left the permissions file alone.
**Next:** the two remaining **Driver card redesigns** (pre-accept mission detail + the accepted/My-Rides run-flow incl.
the D48 waiting meter) via the D25 preview loop — the founder deferred these out of this session.

---

## 2026-07-24 — Session 43 — Driver Pool redesign + bottom tab bar (Pool-first)
**Branch:** `main`. **No migration** — `mission_type` (`'transfer'|'hourly'`, hourly = at-disposal) and a nullable
`dropoff_address` already exist in the schema. Design decided via the **D25 preview loop** (v1→v9 inline mockups, founder
sign-off each round), then built to match.

**The Driver app finally gets a layout redesign — Pool first.** It had inherited the navy palette (D24) but never a
structural redesign the way Dispatch did. This session: the shell + the Pool card.
- **Bottom tab bar** (`components/driver-tabbar.tsx`) replaces the old top text-nav (`components/app-header.tsx`, now
  unused): Pool (stack / Lucide `Layers`) · My Rides (`Car`) · Earnings (`Wallet`) · Settings (`Settings`). Fixed,
  safe-area aware, active-state by pathname (Pool stays active on `/missions/*`). Content moved into
  `<main class="dapp-main">` (bottom padding clears the bar). **Sign out** moved from the header into Settings
  (`components/driver-signout.tsx`).
- **Pool card** (`components/mission-card.tsx`, full rewrite) to the approved v9 mockup — uniform, quiet, refined weights
  (nothing 700):
  * head: fare (left) + when (right: day "Today · 24 Jul" / "Sun · 26 Jul" + time; today accented navy), a **gentle
    divider**, then **mission-only badges** — Transfer OR "At disposal" (`mission_type='hourly'`), SPEED WIN, Luggage run.
    The vehicle class is NOT a badge — it's the Driver's own car (the Pool is filtered to it), so it's redundant → demoted.
  * **route rail** (Dispatch-style): navy dot (pickup) → line → grey mid-dot with "+N" (waypoint count) → line → hollow
    ring (drop-off). Full **2-line** addresses (`addressLine()` + `-webkit-line-clamp:2`). An at-disposal (hourly) trip
    has no drop-off → pickup alone; the facts line shows "Flexible route" instead of distance.
  * **one-line footer**: trip facts (distance·duration) + a **discreet vehicle** (Car icon + class, muted, truncates
    first) | service-request icons **capped at 3 by priority** (child seat > pets > luggage > meet&greet > greeter >
    dress > language > quiet > flight) then "+N".
- **Earnings** = the new 4th tab (`app/(app)/earnings/page.tsx`) — honest "coming soon" placeholder; its own screen gets
  a D25 pass later (payouts settle manually in beta, Stripe deferred).
- **CSS** (`app/globals.css`): new `.dtabbar/.dtab`, `.dapp-main`, `.pool-head`, `.pcard/.proute/.pbadge`. The shared
  `.card/.route/.badge` are UNTOUCHED (still used by My Rides / mission detail — those screens redesign in a later pass).
- **`lib/format.ts`**: new `formatPoolWhen()` (Paris-tz relative Today/Tomorrow else weekday + "D Mon" + time).

**Verified** in-browser vs the real Supabase DB (Pool · My Rides · Earnings render, no console errors; 2-line wrap, route
rail, badges, capped icons, Luggage-run badge all correct). **3-lens adversarial review (13 agents) → 6 confirmed (0
high), ALL FIXED:** the "Tomorrow" **DST drift** (now Paris-calendar arithmetic, not +24h), `viewportFit:'cover'` for the
iOS safe-area, `.ac-list` z-index raised above the tab bar, `role="img"` on the service icons + an aria-label on "+N",
muted-grey **contrast** darkened to `--text-muted` (was failing WCAG AA on white), and real `<h1>`s for the Pool/Earnings
titles. `tsc` clean.

**Locked via the preview loop:** uniform cards; badges = mission-only; the route rail with a mid-dot "+N"; full 2-line
addresses (no truncated titles); one-line footer; icons capped 3 + N by priority; Pool tab icon = stack; 4 tabs (Earnings
added). **Not exercised by seed data (code-reviewed only):** SPEED WIN badge, the +N stop marker, the at-disposal card,
the Today/Tomorrow accent.

**⚑ Parked (founder to decide):** the **discreet vehicle** in the footer — keep (it truncates to "Business · Se…" on a
narrow card) or drop it (it's redundant); the **"Both"** mission type (needs a new enum value + the model). **Not yet
redesigned:** My Rides / mission detail / Settings cards (Pool-first); the Earnings screen; the Pool empty + loading
states. **Deployed `56211e7` → Vercel `success`; founder tested on phone + approved ("I like it, good job").**
**Next session (founder-set, in order):** (1) full **rename PickUp → Kavenue** everywhere — docs, code, folders, copy,
config ([[d50]]); (2) redesign the **extended pre-accept mission card** (`/missions/[id]`) + the **accepted mission card**
(My Rides run-flow, incl. the `arrived`/waiting-meter screen) via the D25 preview loop.

## 2026-07-23 — Session 42 — Waiting fees + a hard end-to-end stress test ([[d48]])
**Branch:** `main`. **Migrations (founder RAN all):** `2026-07-22_waiting_fee.sql`, `2026-07-22_airport_accent_fix.sql`,
`2026-07-22_guest_ready_at_guard_fix.sql`. Continues Session 41; the founder chose waiting fees over reschedulable time.

**D48 waiting model, SHIPPED + DEPLOYED (`0aed706`).** Courtesy wait (renamed from "free wait") 20 city / 60 airport,
then **€1/min started** Business→Driver, ceiling **€40 city / €60 airport** — the ceiling stops the MONEY not the trip
(no cron; a `least()` clamp). Two exits, both with a confirm: the Driver reports, or the Business declares via the
net-new **`business_declare_no_show`**. **`business_cancel_mission` now settles accrued waiting too** — it already
accepted `arrived` and charged a flat 100% past pickup, so without this "Cancel" was strictly cheaper than "stop
waiting" by the whole waiting amount (the loophole the pre-build review caught). A booked trip's **`pickup_at` is frozen
after draft** (blanket trigger, safe because time is never amendable) — this dissolves the postpone-then-cancel dodge.
- **Files.** SQL: the three migrations + one shared `mission_waiting()` / `mission_is_airport()` so the three settlement
  paths can't drift. App: `lib/cancellation.ts` (`waitingAt`, `WAITING_RATE_PER_MIN`, widened `isAirportPickup`),
  `rides/cancel-noshow.tsx` (the Driver meter states), `components/dispatch-waiting.tsx` (net-new Business meter +
  "stop waiting" confirm), `dispatch/actions.ts` (`businessDeclareNoShow`), `trip-row.tsx` (mount), `database.types.ts`.
- **THE BUG OF THE SESSION — found by probing, not reading.** The airport predicate `a[eé]roport` used a bracket
  expression with a multibyte char; **Postgres `~*` does not reliably match it**, so `"Aéroport Nice Côte d'Azur"` — the
  exact Mapbox string for the region's main airport — was classified CITY. Every accented airport pickup without a flight
  number had been getting a 20-min courtesy wait instead of 60 (a no-show fileable 40 min early). Latent since the O7
  spine (2026-07-13); the 07-19 label fix reused the same broken expression so didn't cure it. Proven with 3 identical
  missions differing only in the label; fixed by matching the ASCII substring `roport` (accent/case/NFC-NFD immune).
- **The guest_ready_at guard finally works (3rd try).** Two earlier attempts were no-ops (a column REVOKE against a
  table-level grant; a SECURITY DEFINER trigger where `current_user` is the owner). Fixed by dropping `security definer`.
  Live: Business PATCH → 403 unchanged; service role → 204. `pickup_at` still Business-writable (deferred, § H2).

**THE HARD END-TO-END STRESS TEST (founder-requested session close).** A tagged 14-driver / 3-business fleet provisioned
with real auth (`scratchpad/fleet.mjs`), then a **12-battery workflow** exercised the whole RPC + RLS + trigger layer
against the LIVE DB, each battery on dedicated drivers, each self-cleaning: **49/49 cases GREEN, 0 real bugs, 0 test
artifacts.** Batteries: accept_mission (atomic first-wins + lock-in) · driver-cancel + re-pool SPEED-WIN window ·
business-cancel ramp (fee_pct 0/50.83/80/90/100) · no-show clock D47 (incl. the accent regression as a discriminator) ·
waiting math + ceiling · money conservation across all 3 doors (identical totals, Business charged == Driver paid) ·
**concurrency race x5 (exactly one winner, RPC winner == DB driver_id)** + slot conflict · agreed release + supersede ·
amendment accept/decline · T-60 reclaim · RLS/privacy (cross-driver read denial, guest-contact side table, both column
guards) · state-machine guards. Fleet torn down; **DB verified back to baseline 34 missions**, no leftovers. Test scripts
live in the session scratchpad only (never the repo). Earlier the same paths were proven 13/13 + a 3-door settlement proof.

**Next:** the **Driver app redesign** (v2 preview approved in principle; the `arrived` screen needs a v3 drawn against the
now-shipped running meter, and the Pool filter chips are still an open keep/drop). Pricing-model research owed on the
€1/min rate + the caps. § H2 still holds: `pickup_at` freeze needs the column-grant audit; automated tests (this session
made the case — 3 of the session's bugs looked correct in code and only fell to live probing).

## 2026-07-22 — Session 41 — No-show clock origin: the Guest's due time, not the Driver's arrival ([[d47]])
**Branch:** `main`. **Migrations (founder RAN all three):** `2026-07-19_no_show_clock_origin.sql`,
`2026-07-19_no_show_airport_label.sql`, `2026-07-19_guest_ready_at_guard.sql` (the third is a **no-op** — see Failures).
Started as the Driver-app redesign; the founder corrected the no-show model mid-preview and the fix took the session.

**The correction (founder).** The free-wait countdown was anchored to the Driver's `arrived` tap in BOTH engines
(`mark_no_show` line ~310 and `rides/page.tsx` → `NoShowControl`). Wrong party: the free wait is the **Guest's** grace
period. Origin is now `coalesce(guest_ready_at, pickup_at)`; reporting unlocks at
`greatest(guest_due + wait, arrived_at + 5 min)`. Durations unchanged (60 airport / 20 city). `arrived` stays a
**precondition**, not the origin.

**It was a live exploit, not just a model error.** `advanceStatus` (`rides/actions.ts:76-79`) checks sequencing only — no
time guard — so a Driver could walk to `arrived` ~33h early, wait out the 20-min city window, and file: Business charged
100%, mission `completed`+`no_show`, Guest stranded. `pickup_at` anchoring closes it structurally.

**Second bug found by the review (pre-existing, from `2026-07-13_o7_cancellation.sql`).** Airport detection read only
`pickup_address`, but `address-autocomplete.tsx:235` writes `full_address` there and the POI name to `pickup_label`
(`2026-06-27_mission_place_labels`). So an autocomplete airport pickup **with no flight number** got the 20-min city
window. Hidden because `api/seed` writes "Aéroport" into `pickup_address`. Now tests both + `nullif(flight_number,'')`.

- **Files.** DB: the three migrations (`mission.guest_ready_at` nullable = the flight-tracking hook; deliberately NOT
  `flight_eta`, which is display-only). App: `lib/cancellation.ts` (new `guestDueAt` / `noShowAvailableAt` /
  `NO_SHOW_ON_SITE_FLOOR_MIN`, widened `isAirportPickup`), `rides/page.tsx` (passes `guestDueIso`+`availableAtIso`; stops
  swallowing the `status_event` query error), `rides/cancel-noshow.tsx` (separate `waitEnds` for the header chip so a
  floor-gated countdown can't claim the free wait is running; new "Starts HH:MM" state; `formatTime` instead of a
  per-tick `Intl` formatter), `rides/actions.ts` (comment), `lib/database.types.ts`.
- **Verification: 9/9 live** vs the real DB (scratchpad harness, real Driver JWT for `demo.driver@pickup.local` → Marc
  Dubois; creates disposable missions, exercises `mark_no_show`, deletes everything, `leftover=0`). The autocomplete-airport
  case was **demonstrated failing (ALLOWED) before the 2nd migration and passing (BLOCKED) after** — a genuine red→green.
  A city POI stays on 20 min, guarding against over-match. Two adversarial workflows ran (46 + 30 agents).

**The `guest_ready_at` guard took THREE attempts — two failed silently, both my error.** Worth recording as Postgres
gotchas, because each one *looked* applied and neither protected anything:
1. `revoke update (guest_ready_at) … from authenticated` — **no-op**: column privileges are only consulted when the role
   lacks **table-level** UPDATE, which `authenticated` has (via `p_mission_business_update`).
2. A `before update` trigger declared **`security definer`** — **no-op**: inside SECURITY DEFINER, `current_user` is the
   function OWNER, never the caller, so `current_user in ('anon','authenticated')` was never true.
3. ✅ **Same trigger, `security definer` removed** (`2026-07-22_guest_ready_at_guard_fix.sql`) — SECURITY INVOKER makes
   `current_user` the role PostgREST switched to. **Verified live: Business PATCH → 403 + value unchanged; normal Business
   column edit → 204; service role (the future tracking feed) → 204; no-show suite still 9/9.**
Each failure was caught only because the guard was **tested**, not assumed — migrations 1 and 2 both returned "success".
Test writes reverted (0 rows non-null). One live pooled mission (`2dd71a4d`, Antibes) had `luggage_count` set to 2 during
the "normal edits still work" check; prior value not recorded, founder chose to **leave it at 2**.

**Still open (BACKLOG § H2):** `pickup_at` has the same exposure and additionally feeds `business_cancel_mission`'s fee
tier, but it has a legitimate client writer (draft resume), so it needs a status-aware rule — folded into the
column-grant audit with the `p_mission_business_update` flag.

**Also logged to § H2:** negative `hours_before_pickup` on no-show rows (opposite sign to the other 4 kinds); the
`advanceStatus` early-tap (now data-quality, not money); device-clock vs Postgres-clock countdown skew (fails safe).

**Next:** back to the **Driver app redesign** — v2 preview approved in principle, two opens: (1) do the Pool filter chips
stay (they are a NEW feature I invented, not in the app today)? (2) the `arrived` screen still needs a v3 drawn against
the corrected model, since the "Starts HH:MM" state didn't exist when v2 was drawn.

## 2026-07-19 — Session 40 — O7 agreed release (Business-initiated) + the 24h re-pool SPEED-WIN window
**Branch:** `main`. **Migrations (founder RAN both):** `docs/migrations/2026-07-19_agreed_release.sql` (new `mission_release`
evidence table + `propose_release` / `respond_to_release` / `close_release` RPCs + widened `mission_cancellation.kind`) and
`docs/migrations/2026-07-19_repool_speedwin_window.sql` (the 24h re-pool window + review fixes; `create or replace` of the
four O7 RPCs). Both additive. **Decision [[d46]].** Finishes the actionable half of O7 (the copilote hand-over stays Phase 2 —
needs the community layer).

**The agreed release — the D45 mutual-consent "agreed cancellation".** A free, no-fee release that BOTH sides confirm.
**Direction = Business-initiated ONLY** (founder chose this over bidirectional, after seeing the D25 preview): the Business
taps a dedicated **"Agreed release · free"** button (distinct from the fee-paying Cancel) → the assigned Driver gets an
accept/decline card and **must accept** → the trip releases **free (no fee, no reliability mark)** and re-pools; decline →
the trip stays exactly as agreed. Eligible only while `accepted`/`confirmed`. The Driver's cancel-sheet escape valve ("Ask
the Business to release it — free") is the phone trigger; there is no Driver-initiated in-app proposal. Mirrors the amendment
pattern almost exactly (propose record + Driver accept/decline + atomic SECURITY DEFINER RPC).
- **Files.** DB: the two migrations. Driver: `components/release-card.tsx` (the card, with the safe-decline reassurance),
  `respondToRelease` in `rides/actions.ts`, loader + gate in `rides/page.tsx`, escape-valve copy in `rides/cancel-noshow.tsx`.
  Business: `components/dispatch-release.tsx` (`AgreedRelease` button + confirm modal), `proposeRelease`/`closeRelease` in
  `dispatch/actions.ts`, schedule states + button wiring + gates in `trip-row.tsx`, loader in `dispatch/page.tsx`. Types in
  `lib/database.types.ts`; CSS in `globals.css` (`.amc__lead`/`.amc__safe`/`.dx-amend--neutral`, else reuses the amendment classes).

**Dispute-ready evidence (founder's explicit concern — a Business coercing a committed Driver into a free release).** The
platform can't police the phone call, so it owns the defaults + the receipts: (1) declining is framed as **free, mark-free,
the Driver's choice** on the card, and the Business-side decline state is **calm, not alarmist**; (2) `mission_release` is
**append-only** — declines are retained; a Business only HIDES a resolved request (`dismissed_at`), never deletes/rewrites;
each row stores who/when/note/decision/`from_fare`/**`hours_before_pickup`** so "a free release proposed inside the fee
window, repeatedly declined" is legible and **per-Business counts are a query**. ALL writes go through the SECURITY DEFINER
RPCs (no client INSERT/UPDATE policy) → tamper-resistant (stronger than the amendment table; closes the class of gap the O7
review flagged). Abuse dashboard = deferred Admin workspace (BACKLOG F2); the data is ready for it. Logged the
review-weaponisation constraint (completed-trip + double-blind reviews) for whenever a Business→Driver review system is built.

**Re-pool pricing — the 24h SPEED-WIN window (founder decision; supersedes D45 "re-pool = always SPEED WIN at 70%").** A
re-pooled mission (driver cancel · T-60 reclaim · agreed release — ALL re-pool paths) now prices by time-to-pickup: **<24h →
SPEED WIN** (start 70% of ceiling, climb 5%/5 min); **≥24h → NORMAL Pool** (start 50% of ceiling, climb 5%/10 min, SPEED WIN
off) — the exact curves a fresh posting uses (`dispatch/new/actions.ts`). Re-pool re-bases the climb to `pooled_at`.

**Adversarial 3-lens review (SQL-security / TS-integration / UX-policy) → 6 confirmed of 10, ALL fixed** (2 verified-REJECTED:
client-forgeable `p_proposed_by` — tenant security holds; a hedged "24h" copy nuance). Fixes folded into the repool migration
+ UI: the cancel/reclaim/business-cancel RPCs now **supersede a pending `mission_release`** (business-cancel gained the
amendment supersede it was missing too); the release cards/briefs are **gated to a still-releasable trip** (no dead card past
accepted/confirmed; no stale "back in the Pool" once a new Driver re-accepts); `respond_to_release` locks **mission → release**
(matching `propose_release`) to kill a deadlock inversion.

**Verified live vs the real Supabase DB** — a self-contained script (`scratchpad/verify-release.mjs`) that creates a throwaway
tenant + missions, signs in as real Business + Driver auth users (the exact SECURITY DEFINER path), exercises the loop, and
cleans up: **28/28 assertions pass** — Test A (≥24h → normal 50%/int10/speed-off), B (<24h → SPEED WIN 70%/int5), C (decline
untouched + reason retained), D (business-cancel supersedes pending release), E (status guard blocks a stale accept), F
(deny-by-default writes: Business/Driver can't INSERT or rewrite a declined `mission_release`). `tsc` + `next build` green.
Founder ran migration #2 (a first-paste "syntax error" then a clean "success" — an incomplete `$$…$$` paste; the successful
idempotent re-run applied all four functions, confirmed by the 28 live checks). **Deployed to `main`.**

**Next here:** the **copilote hand-over** (O7 Phase 2 — needs the community/registration layer) is the last O7 piece. The
§ H2 review-flags remain (the Business-UPDATE RLS WITH CHECK; the fee basis freeze at `accepted_at`).

## 2026-07-13 — Session 39 — O7 cancellation: research + full ruleset decided + documented (no code yet)
**Branch:** `main`. **No code / no schema change this session — design + decisions only.** Founder chose to work on **O7
(cancellation)** and gave the full policy context; I ran a **4-agent research workflow** (canonical docs sweep · schema/code
sweep · global web benchmarks · French VTC + hand-over legal angle) to ground it, then captured the settled ruleset.

**Research highlights (fed the decisions):**
- Founder's model largely matches the market: **no-show → Driver paid after a wait** is universal; the **1h airport / ~20min
  city** split is the industry norm (Blacklane/Wheely/Uber Black/Welcome all = 60min from landing; city ~20–30min); an
  **escalating % as pickup nears** is validated (a Côte d'Azur operator publishes >24h 0% / 24–12h 50% / 12–6h 70% / <6h 100%).
- Kavenue-specific (not a market norm, flagged): a **Driver fined ≈ the trip amount** (elsewhere a bailing driver is just
  re-dispatched, not fined) — must live in the Driver↔Kavenue contract as an intermediary penalty, never a transport charge.
- **Copilote hand-over legal answer:** the founder's framing (full **transfer/novation** — original Driver drops out with
  zero pay/invoice/liability, copilote re-accepts on his own account) is **the clean, lawful structure** — cleaner than
  classic *sous-traitance* (which would make the original a "mini-principal" with URSSAF requalification risk). Guardrails:
  credential-gate to active same-category verified Drivers (2026 made *sous-traitance illicite* a named REVTC offence), own
  account, no money through the original, Business consent via terms. Precedent exists (Drivalty, iaDriver, WAY-Partner, VTC
  coops). Confirmed viable; **Phase 2, later.**
- Docs already encode part of it (driver-cancel-re-pools / business-cancel-terminal, dormant `cancelled_by`/`cancelled_at`,
  Lock-in = "T-180"). **Gaps O7 must invent:** no-show (entirely undefined), the **T-60 reclaim**, the hour-based business
  curve, the copilote layer, disputes, a fee/reliability data model, mid-trip cancel window (`arrived`), re-pool pricing.

**Decided ruleset (→ [[d45]]).** Driver voluntary cancel = **always 100%** (re-pools). Business cancel = **free >5h · 50% at
−5h · +10%/h → 100%** at pickup. No-show fires at status **`arrived`** (**1h airport / 20min city**) → **Business charged full,
Driver paid full like a completed mission**, Kavenue keeps commission, Business settles with its own Guest. **T-60 Business
reclaim** (NOT a cancel) only when the assigned Driver **hasn't confirmed the Lock-in AND is unreachable** → reclaim button →
re-pool as SPEED WIN, penalty-free for the Business, Driver takes a **reliability mark** (gated to non-confirmation = anti-
abuse). Re-pool re-enters the Pool as **SPEED WIN at 70% of ceiling** (needs a `pooled_at` climb-origin). **Copilote hand-over
= Phase 2.** **NEW: SPEED WIN reachability gate** — geolocate the Driver, GPS-ETA to pickup, **block accept with a popup** if
they'd be late (build later). **Disputes = deferred, documented.** Euro *amounts* stay MANUAL in beta; the *rules* are fixed.

**Documented in:** `project/DECISIONS.md` **D45** (authoritative + the legal confirmation) · `docs/05_Roadmap_Backlog_TODOs.md`
(Cancellation & conflict section rewritten to the decided rules; copilote + SPEED WIN gate added) · `docs/Kavenue_Phase0_Data_
Spine.md` (the "Cancellation %s" open decision resolved) · `project/BACKLOG.md` (new **§ N** with the full Phase 1 spine +
Phase 2 copilote + SPEED WIN gate + disputes; § B and § K O7 lines updated) · `project/IDEAS.md` (parked detail for the
copilote model, SPEED WIN gate, disputes).

**Phase 1 CODE BUILT (tsc + next build green; migration pending).** After the D25 previews were signed off (driver cancel
sheet + amber no-show + "be sure" nudge; dispatch live-% cancel modal + T-60 reclaim), implemented the cancellation spine.
- **Migration** `docs/migrations/2026-07-13_o7_cancellation.sql` (additive, founder-run): mission `cancellation_fee` /
  `cancellation_reason` / `pooled_at` / `no_show` / `no_show_at`; `driver.reliability_marks`; a widened `status_event`
  CHECK (adds cancelled/no_show/repooled); a `mission_cancellation` audit table (deny-by-default RLS, holds the fee record
  even for re-pooled trips); and 4 SECURITY DEFINER RPCs — `driver_cancel_mission` (100% → re-pool as SPEED WIN),
  `business_cancel_mission` (free while pooled / >5h, then 50%@−5h +10%/h → 100%; terminal), `reclaim_mission` (T-60,
  gated to accepted-but-unconfirmed), `mark_no_show` (from `arrived`, 60/20-min window, → completed + no_show) — all
  mirroring `accept_mission`.
- **Code:** `lib/pdp.ts` now climbs from `pooled_at ?? created_at`; `lib/cancellation.ts` (shared % ramp + airport
  heuristic, mirrors the SQL); driver `app/(app)/rides/cancel-noshow.tsx` (`DriverCancel` sheet + `NoShowControl` amber
  countdown) + 2 actions in `rides/actions.ts`; dispatch `app/(dispatch)/dispatch/actions.ts` + `components/dispatch-cancel.tsx`
  (`BusinessCancel` live-% modal + `ReclaimCard`) wired into `trip-row.tsx`; `missionTone` gained a "No-show" state;
  `lib/database.types.ts` extended (columns + table + 4 RPCs + `MissionCancellationRow`).
**Verified + reviewed (2026-07-13).** Migration applied by the founder. Ran a full end-to-end check via REAL authenticated
sessions (the browser pane was flaky, so signed in as the demo Driver/Business with the anon key — the exact SECURITY
DEFINER auth path the UI uses): all **5 money paths + 5 adversarial guards** pass against the live DB (business cancel
free / 70.02%, reclaim→SPEED WIN at 0.7×ceiling, driver cancel 100%, no-show→completed+charged; guards: reclaim-ineligible,
cross-tenant, no-show-too-early, role-mismatch ×2). UI rendering confirmed both sides via the a11y tree; airport heuristic
confirmed (flight OR airport address → 60 m). tsc + next build green. Test artifacts cleaned off the demo DB.
Then a **3-lens adversarial review** (correctness / security / integration) found 6 issues:
- **FIXED in the migration** (re-run the file — every statement is idempotent): (a) **HIGH** the re-pool RPCs
  (driver_cancel / reclaim) left a pending `mission_amendment` 'proposed', which could leak to the next Driver → now
  supersede it on re-pool; (b) **LOW** the widened `status_event` CHECK let a Driver spoof no_show/repooled rows → tightened
  `p_statusevent_driver_write` to the execution steps; (c) **LOW** a Business cancel's private `reason` was readable by the
  released Driver → `actor_driver_id` set null on business_cancel rows.
- **FLAGGED** (→ BACKLOG H2; not O7 regressions / beta-mitigated): **#1** `currentFare` doesn't freeze at `accepted_at`, so
  the recorded fee BASIS inflates toward the ceiling (pre-existing pricing behaviour; MANUAL settlement backstops it — a
  pricing-engine decision); **#2 (HIGH for prod)** `p_mission_business_update` has no WITH CHECK, so a Business could bypass
  the fee/reclaim gates via a direct PostgREST UPDATE (pre-existing RLS gap; ~nil risk in beta — key-gated, no payments;
  needs column-level grants before real Business users); **#3** `p_fare_snapshot` is client-supplied/forgeable → recompute
  in SQL when the pricing engine lands; **#6b** a mid-run Business cancel makes the trip vanish from the Driver's My Rides
  (visibility gap — pairs with notifications).
**Next:** founder re-runs the updated migration → re-verify the amendment fix → deploy. Then the immediate follow-ups:
the mutual-consent "agreed release" + the copilote hand-over (both reuse the amendment pattern).

## 2026-07-10 — Session 38 — Address search: Riviera-first ranking + narrower countries (Mapbox cleanup, Google deferred)
**Branch:** `main`. **No schema change.** **Touched:** `components/address-autocomplete.tsx` only. Founder flagged bad
autocomplete: typing "aéroport t2" returned a Roissy CDG Fnac #1, Barcelona/Geneva/Lisbon, with the Nice result buried at
#3. Asked whether to switch to Google.

**Diagnosis (tested the live Mapbox Search Box API directly):** two problems. (1) The country allowlist was a broad 12-
country EU list, so Spain/Portugal/etc. leaked in for vague queries. (2) Mapbox's POI ranking is genuinely weak for
prominent places — `proximity=Nice` only *nudges*, so a literal "T2" name match (CDG Fnac, a Barcelona parking) outranks
the local airport; `bbox`, `poi_category=airport`, tighter proximity all failed to float the real "Terminal 2, Aéroport
Nice-Côte d'Azur (NCE)" (it exists in Mapbox but ranks below shops/kiss-and-fly/Airbnbs). **Google Places weights
*prominence* and would genuinely rank major airports/hotels/stations first** — so the founder's instinct is sound.

**Decision (founder):** *Mapbox cleanup now (free, no new integration), Google later.* Google needs a Google Cloud
project + Places API key + billing the founder sets up (deferred to the integration phase, like the other third-party
integrations). Logged as the future fix for true POI precision.
**UPDATE (2026-07-10, later):** founder explicitly **deferred the Google swap until the final domain is registered** — so
the browser API key gets restricted to the *right* domains ONCE (avoids redoing it after the rebrand DNS move). The brand
name **at that date** was **RED Executive** (Riviera Executive Driver) — **since superseded by `Kavenue`, [[d50]]** — and a
Google Cloud project was created under that name, but the key/
switch waits. **For now: stay on Mapbox** (the Riviera-first cleanup above is the current state). When the switch happens
it's ~1 session, one file (`address-autocomplete.tsx`), Mapbox kept for routing. Related: the domain migration
(pickupbedriven.com → a Kavenue domain) is its own separate ~1-session task (DNS + Vercel + Supabase redirect allowlist +
`lib/hosts.ts` + the key restriction), also waiting on the founder registering the name/domain.

**Shipped (Mapbox cleanup):** (1) `DEFAULT_COUNTRIES` narrowed `fr,mc,it,ch,de,es,be,lu,nl,gb,at,pt` → **`fr,mc,it,ch`**
(France + the only neighbours a Riviera VTC actually DRIVES to: Monaco, Italy, Switzerland/Geneva). (2) A **Riviera-first
re-rank** — `isRiviera()` tests each suggestion's formatted address for a Côte d'Azur marker (postcodes 06/83/98000 or the
towns we serve) and a stable sort floats local hits to the top *without hiding* far destinations (they still show, below).
Verified live vs the real Mapbox API + in the browser field: "aéroport t2" now returns **"Kiss and Fly - Terminal 2, 06200
Nice" at #1** (Barcelona/Lisbon gone). Known limit: the exact NCE terminal still won't surface for that vague query — that's
the Google-later fix. `tsc` clean, no console errors. Deployed.

## 2026-07-10 — Session 37 — Mission-form polish: review card, capitalised names, numeric-only fields, trail time, pricing vehicle chip
**Branch:** `main`. **No schema change.** Five founder-requested tweaks; the two visual ones (review card + pricing chip)
went through a D25 preview (signed off "go"). **Touched:** `app/(dispatch)/dispatch/new/mission-form.tsx`,
`components/passenger-list.tsx`, `components/trip-row.tsx`, `app/(dispatch)/dispatch/[id]/edit/edit-form.tsx`,
`app/globals.css`.

1. **Review-before-posting card — lightly polished** (`mission-form.tsx`): the flat `.kv` + old `.route` swapped for the
   S36 detail vocabulary — the `.dx-rte` route rail (dot-to-dot connector), `.dx-srow` rows, and **chips** for Languages /
   Dress / Requests (`.dx-chip`). Guest + pax + bags collapse to one line; reference marked "· your team only". Same card,
   just coherent with the trip detail. Verified live (fare 65 €, connector route with a stop, all chips render).
2. **Names auto-capitalise** (`passenger-list.tsx`, shared by new + edit): a `capitalizeFirst` on the Guest first/surname
   `onChange` — first letter only (safe for "Al Souad"/"de la Croix") + `autoCapitalize="words"`. Verified: james→James.
3. **Numeric-only fields** (`mission-form.tsx` + `edit-form.tsx`): `luggage_count` (integer), `base_fare` + `ceiling`
   (money) switched from `type=number` to `type=text` + `inputMode` + a controlled sanitize (`digitsOnly` / `decimalOnly`
   — strips letters, `e`, `+`/`-`, extra dots; comma→dot). Reliable vs `type=number`'s quirks. Verified: `12ab.3cd9`→
   `12.39`, `9.9.9xx`→`9.99`, `3a4b`→`34`. Phone left flexible (needs `+`/spaces). (Amend-form fare left for later.)
4. **Edit trail shows the time** (`trip-row.tsx`): the `.dx-trail` now leads with the bold edit time
   (`formatDateTime(infoChange.at)`) then the changes; the separate top "Edited ·" stamp is suppressed when a trail is
   present (no double time). Verified live on trip `d6f7c70a`.
5. **Pricing card vehicle reminder** (`mission-form.tsx`, `.mx-vehiclechip`): a live accent-soft chip in the Pricing card
   head showing the class·body you're pricing (`serviceClassLabel(tier, body)`; "Business · Van" in luggage-only mode). The
   specific car isn't lifted from ServiceClassFields, so the chip is class·body only (the specific car is already in the
   review card) — a small follow-up could add `onCarChange` to include it. Verified: renders "Business" + accent-soft bg.

**Verified** on localhost vs the real Supabase DB: `tsc` clean, no console errors on the form or schedule. Deployed.

## 2026-07-10 — Session 36 — Expanded trip-row redesign + a "what changed" trail (detail-edit change-log)
**Branch:** `main`. **Migration (founder RUNS it):** `docs/migrations/2026-07-10_mission_info_change.sql` — a **new
`mission_info_change` table** (+ RLS, deny-by-default for Drivers). Additive only; base schema untouched (hard-rule #4).
**New files:** `lib/info-changes.ts`. **Touched:** `components/trip-row.tsx` (the detail rewrite), `app/globals.css`,
`app/(dispatch)/dispatch/page.tsx`, `app/(dispatch)/dispatch/[id]/edit/actions.ts`, `lib/database.types.ts`.
**D25 previews** (v1→v5 visualize mockups) all signed off ("that way better!!"). Founder decisions folded in below.

**Why:** the expanded `.dx-trip__detail` was one flat 15-row `.kv` definition list (When/Fare/Vehicle/Specific car/
Trip/Guest/Reference/Languages/Dress/Requests/Board/Message/Pax/Flight/Driver/Car) — equal weight, no grouping, and it
re-showed the collapsed row (When/Guest/Ref/Flight + the route drawn twice). Hard to scan across many trips. Founder
ask: "easy on the eyes, fast, efficient."

**The redesign (`.dx-trip__detail`, `.dx-*` classes; the flat `.kv`/`.route` kept for other pages — rides, missions,
new-mission form):** meta line (private **Reference lock-chip** "· your team only" + the detail-only "Edited ·" stamp)
→ **two edit-action tiles, each with a one-line helper** (Edit details = "Update guest, flight & service info · applies
now"; Propose a change = "New route or fare · the Driver must agree") so the two aren't confused (founder Q) → the
**"what changed" trail** → amendment state → hint → **scan-strip** (Pickup left · Vehicle · Flight · **Fare now right**,
per founder; the Flight tile drops out with no flight number) → **Route card** (full addresses + trip **distance·duration
in the header** beside the route, per founder; a **dot-to-dot connector that STOPS at the drop-off dot** — the old rail
overshot; live stop check-off preserved) → **slim single-line Driver bar** (avatar · name · tappable phone · car·plate;
"No Driver yet · in the Pool" when unassigned — was a stretched half-empty panel, per founder) → **Service · Guests
side-by-side** (`.dx-pgrid`; languages/dress/requests as **chips**; pax/bags shown **once**, in the Guests header, not
duplicated in the scan-strip per founder). Every variant handled: no driver, luggage-only, in-progress, no flight/guests/
service, and the amendment pending/declined/accepted states.

**"Can we see what a Business changed?" (founder Q) — two levels, both built:**
1. **Route/fare change (amendment) — no schema.** The "Change accepted" state now shows the **diff**: `Fare <s>120 €</s>
   → 140 € · Add a stop at 3 Bd de la Ferrage` (data already in `AmendmentBrief` — fareOld/fareNew/summary).
2. **Detail edit (guest/flight/service) — new migration.** `updateMissionInfo` now snapshots the info **before** the
   write, computes a human-readable diff (`lib/info-changes.ts` `diffMissionInfo` → phrases like "Flight BA342 → BA118",
   "Added guest X", "Dress Smart casual → Business formal"), and appends a row to **`mission_info_change`**. The schedule
   loads the **latest** row per mission (RLS-scoped) → a `.dx-trail` line under the actions. **Privacy:** the diff can
   contain the private reference tag / guest names, so it CAN'T sit on the mission row Drivers read — it's a **Business-
   only side table, deny-by-default RLS** (mirrors `mission_guest_contact` / `mission_amendment`). Founder chose the
   fuller "add the detail change-log too" option (vs amendment-diff-only). Both degrade gracefully pre-migration
   (missing-table query → empty; the insert logs + is non-fatal).

**Verified (localhost, real Supabase DB — `mission_info_change` NOT yet applied, so the trail degrades to empty):** `tsc`
clean. Dispatch schedule renders (27 real trips). Expanded a real Confirmed trip w/ an accepted amendment
(`d6f7c70a`, Jason Statham · Marc Dubois): the **whole redesign renders** — lock ref-chip, both action tiles w/ helpers,
the **enriched "Change accepted — Fare 120 → 140 € · Add a stop"**, scan-strip in order (Pickup·Vehicle·Flight·Fare-right),
route card w/ the connector **confirmed stopping at the drop-off dot** (`::before content:none` on the last leg), slim
driver bar, Guests panel "2 passengers · 2 bags". **No console errors.** Screenshot matches the approved v5 mockup.

**PENDING:** founder RUNS `2026-07-10_mission_info_change.sql` in Supabase → then deploy. (Redesign + amendment diff are
migration-independent; only the detail-edit trail waits on the table.) **Next:** the detail-edit change-log field-level
history is per-field human phrases stored at edit time (latest edit shown); a multi-edit visible history is a later
extension. Founder's other named items remain: Driver app redesign, the pricing-engine-dependent items.

## 2026-07-07 — Session 35 — Mission edit PHASE 2: the amendment / consent flow (propose → accept/decline)
**Branch:** `main`. **Migration (founder RUNS it):** `docs/migrations/2026-07-07_mission_amendment.sql` — a **new
`mission_amendment` table** (+ RLS + 2 indexes) and the atomic **`respond_to_amendment` RPC**. Additive only; the base
schema is untouched (hard-rule #4). **New files:** `lib/amendments.ts`, `app/(dispatch)/dispatch/[id]/amend/{page.tsx,
amend-form.tsx,actions.ts}`, `components/amendment-card.tsx`. **Touched:** `lib/database.types.ts`,
`components/{route-stops,trip-row}.tsx`, `app/(dispatch)/dispatch/{new/mission-form.tsx,page.tsx}`,
`app/(app)/rides/{page.tsx,actions.ts}`, `app/globals.css`. **D25 previews** (4 driver-card iterations → the muted-ends
route-diff card; the propose screen; the decline path) all signed off ("agreed go"). [[d40]]

**Why (D39 Phase 2):** once a Driver has ACCEPTED, Kavenue is the AGENT between two parties, so a **material change
(route / fare)** can't be applied silently — it's a **proposed amendment the Driver accepts or declines**, recorded
in-app even if they agreed by phone. Phase 1 (info-only edit, no consent) shipped S34; this is the consent flow.

**Data model (greenfield — nothing existed):** `mission_amendment` = the audit trail. Columns: the proposed NEW route
(`new_pickup_*`, `new_dropoff_*`, `new_waypoints`, `new_distance_km`, `new_duration_min`) + `new_fare` (the new agreed
TOTAL), a `from_snapshot jsonb` (the trip AS AGREED at propose-time incl. the current fare, for the "was …" display +
record), `note`, `decline_reason`, `status` (`proposed→accepted|declined|superseded`), timestamps, `business_id`
(denormalised for RLS), `proposed_by`. RLS: Business select/insert/update on its own missions (INSERT also checks the
mission is theirs); Driver select on missions assigned to them; **no Driver INSERT/UPDATE** — the response goes through
the RPC. Supabase default privileges cover the new table (base schema has no explicit grants).

**The atomic apply — `respond_to_amendment(p_amendment_id, p_accept, p_reason)` RPC** — a faithful **mirror of
`accept_mission`**: `SECURITY DEFINER`, resolves `current_driver_id()`, row-locks the amendment + mission, verifies the
mission is this Driver's and still `accepted/confirmed`, then in ONE transaction: **accept** → swaps the new route + fare
onto the mission and marks the amendment accepted; **decline** → leaves the mission untouched, marks it declined (+
reason). The fare is **frozen at `new_fare`** by collapsing the PDP curve (`ceiling = pdp_start = new_fare`, flat
step/interval, `speed_win=false`) so `currentFare()` reads exactly the agreed total (there's no stored "agreed fare"
today — the PDP climbs from `created_at`; this is the clean way to pin it). `stops_reached` resets. Conditional
`where … status='proposed'` → atomic first-wins (concurrent double-accept / accept-vs-decline can't half-apply).

**Business — propose screen (`/dispatch/[id]/amend`):** a locked "trip as agreed" header (route · time · assigned
Driver + car · agreed fare) + a two-pane form mirroring the new-mission layout: left = the exact `RouteStops` editor
(pickup + stops + destination **all editable** — founder asked to allow pickup) + a manual "New agreed fare" field
(shows the live delta) + an optional note; right = a **live "what the Driver will see" preview** (change summary +
fare/distance/drop-off deltas) + the send button. `proposeMissionAmendment` (USER session, RLS) verifies ownership +
`accepted/confirmed`, recomputes the ETA server-side (traffic-aware), snapshots the from-state (incl. `currentFare`),
**supersedes any still-pending proposal**, and inserts the new one. Redirects to `/dispatch?open=<id>` (the S33 deep
link) — the trip now reads "Change pending". `closeAmendment` withdraws a pending / dismisses a declined one.

**Driver — accept/decline card (`components/amendment-card.tsx`, in My Rides):** the approved v4 card — the change reads
**inside the route** (unchanged legs muted grey, the changed leg highlighted with a "New stop / New destination / New
pickup" badge; removed stops struck), a "was …" line, the Dispatcher's note, then **what it means for you** (fare
old→new + delta, distance·time, **Drop-off** [finish-flag icon, not a plane — founder's call]), an amber **slot heads-up**
(reuses the ±90-min idea: computes the trip's new end vs the Driver's next pickup — "tighter" or "overlaps"), and the
binding **Accept the change / Decline**. Decline opens an **optional one-tap reason** (Schedule too tight / Too far /
Timing / Other) — softens the rejection for the Business (founder ask). `respondToAmendment` calls the RPC via the USER
session (must NOT be service role — the RPC reads `auth.uid()`, like `accept_mission`, D6). Slot warning computed in
`rides/page.tsx` (`SLOT_TIGHT_MIN=30`).

**Business — schedule states (`trip-row.tsx` + `dispatch/page.tsx`):** the expanded detail gains a **"Propose a change"**
entry (accepted/confirmed only, next to "Edit details"), and renders the amendment state: **Change pending** (navy chip
+ summary + Withdraw), **declined** (a calm reassurance — "declines are normal in busy periods, not personal" — + the
reason + trip-stays-as-agreed + **Call / Adjust and re-send / Dismiss**), or a subtle **Change accepted · <time>**. The
dispatch page loads the latest non-superseded amendment per mission (RLS-scoped) → a compact `AmendmentBrief`.

**Founder feedback folded in (from the preview loop):** (1) enable **pickup edit** (not just destination + stops); (2)
the **decline reassurance** for the Business (busy-season scheduling, not personal) + the Driver's optional reason; (3)
fixed the send-rail copy — after sending you **leave for the schedule**, so it now says the answer shows there as
"Change pending" (was the wrong "you'll see his answer here"). Earlier: the driver card went through 4 iterations — the
change must read **in-context inside the route** (not an abstract hero banner), with the two unchanged ends muted so the
new stop stands out; and the drop-off row uses a **finish-flag**, not a landing-plane (a plane = a pickup to a Driver).

**Reused `RouteStops` (the most-worked component) safely:** added 3 additive fields to its `RouteSummary`
(`pickupText/dropoffText/stops`) so the amend preview can diff the live route; the new-mission rail ignores them (its
initial literal was updated to satisfy the type). Pure diff/summary helpers live in `lib/amendments.ts` (`routeDiff`,
`changeSummary`, `parseFromSnapshot`, `buildFromSnapshot`, `dropoffInstants`, `DECLINE_REASONS`), shared client + server.

**Verified (localhost, real Supabase DB — the mission_amendment table NOT yet applied, so the flow degrades gracefully):**
`tsc` clean. Dispatch schedule renders (27 real trips; the amendments query returns nothing without the table — no
crash). **Propose screen renders end-to-end** for a real Confirmed trip (locked header "Marc Dubois · Mercedes Classe E
· Agreed fare 130,00 €", RouteStops editor, live ETA, fare field) and the **live delta reacts** (145 € → "Current 130,00
€ · +15,00 €" green, and the preview rail "130,00 € → 145,00 € +15,00 €"); the empty-route-diff path shows "Fare change
only" (exercises `routeDiff`/`changeSummaryParts`). Driver rides page renders. **No console errors on any surface.** The
two-pane collapses to stacked under the narrow preview panel (correct; side-by-side ≥ ~600px content).
**Then the founder RAN the migration** (2026-07-07) and the FULL loop was **verified live vs the real DB**: (1) a
fare-only **propose → decline** (RPC decline branch; trip fare untouched; Business sees the reason + reassurance state);
(2) a fare-only **propose → accept** (RPC accept branch; fare swapped 55→70 €, frozen; "Change accepted"); (3) a real
**add-a-stop route change** — Business added "3 Bd de la Ferrage" (ETA recomputed 57 km · 1h13, fare 120→140 €) → the
Driver card rendered the **highlighted new stop + badge** with the deltas → accept → the **mission genuinely swapped**
(route now pickup → 3 Bd de la Ferrage → Pl. du Casino Monaco, Trip 57 km · 1h13, Fare 140 €). RLS (business insert +
driver read), the atomic RPC (both branches), and the fare-freeze all confirmed. No console errors. **Pushed + deployed**
(`fc63a37` — Vercel deployment SHA + build status verified `success`).

**Deploy note:** the follow-up **docs-only** commit `51784d8` hit a **transient Vercel build flake** (`failure`), even
though its app code is byte-identical to the successful `fc63a37`. Reproduced `next build` **locally → clean** (all
routes compile, incl. `/dispatch/[id]/amend`), confirming it was infra, not code; production was never down (Vercel keeps
the last successful deploy live). Re-triggered with an empty commit → **`ddeadf5` deployed `success`**. Lesson added to
the WORKFLOW note in `NEXT_SESSION.md` (a transient BUILD FAILURE, not just a dropped commit, also happens — reproduce
with `next build`, re-trigger if it passes). **Test artifacts left on the shared demo DB** (visible on prod too, all
revertible): trip `00a5e67b` fare 55→70 € (accepted), `d6f7c70a` +stop "3 Bd de la Ferrage" & 120→140 € (accepted),
`1b8a1444` a declined-change example.

**Next:** **Phase 3** (auto price-delta via the pricing engine + notifications so the Driver is alerted without watching the
app + an in-app "could we add a stop? +€X" note) — both wait on deferred integrations. Also queued: O7 cancel/re-pool
(the decline "or Business cancels" path), the unfolded-trip-row redesign (founder's other named item), Driver app redesign.

## 2026-07-05 — Session 34 — Edit a posted trip's INFO without touching price (mission edit, Phase 1)
**Branch:** `main`. **No schema change.** New: `app/(dispatch)/dispatch/[id]/edit/{page.tsx,edit-form.tsx,actions.ts}`.
Touched: `components/trip-row.tsx` ("Edit details" link + `editable` flag), `app/globals.css` (`.ex-*` / `.dx-editlink`).
**D25 preview** signed off ("ok"). First slice of the KEEP "limited edit" feature (Doc 02); design phased with the
founder — Phase 2 (amendment/consent for material changes) + Phase 3 (auto-delta + notifications) are in IDEAS.

**Shipped:** a Business can edit the **info a Driver sees** on a posted mission — Guest names + phones (+ share),
flight number, luggage, reference, and the whole Driver & service card (languages, dress, request flags, meet &
greet board + file, private message) — **without changing the price, route, or time.**
- **New route `/dispatch/[id]/edit`** (server `page.tsx`): loads the one mission + its `mission_guest_contact` phones
  (RLS-scoped), renders a **read-only "locked" header** (route rail · time · `Fare (now)` · ceiling · status pill,
  via `missionTone`) with a note that route/price changes are the Phase-2 amendment flow, then the editable form. If
  the trip isn't editable it shows a "frozen" notice instead of the form.
- **`edit-form.tsx`** (client) **reuses the exact new-mission components** — `PassengerList`, `ReferenceField`,
  `DriverServiceFields` — pre-filled the SAME way the form seeds a resumed draft (`mergeContacts` + `splitFullName`
  fallback + pad to `pax_count` bounded `VAN_SEATS`; `parseLanguages`/`parseDriverFlags`/`hasBoardFile`). Tier for the
  dress-code default derives from `mission.category` (SERVICE_TIERS, legacy `van`→business fallback). A luggage-only
  run hides the Guests card. `useFormStatus` Save button ("Saving…"), multipart for the board file.
- **`actions.ts` `updateMissionInfo(id, formData)`** — the safety core. **Whitelists ONLY info columns**; the UPDATE
  object literal can't receive price/route fields, so `base_fare/ceiling/pdp_*/speed_win/created_at/category/pickup*/
  dropoff*/waypoints/distance_km/duration_min/zone/status/luggage_only/required_*` are all untouched → the PDP curve
  and Pool matching can't move. **Atomic status guard** via `.in("status",["pooled","accepted","confirmed"])` on the
  update (+ `business_id` eq + RLS) — no TOCTOU with a mid-edit accept; 0 rows → `?error=locked`. Mirrors createMission
  for passenger parsing, the board-file upload/clear conditional-spread (keeps an existing board when no new file), and
  the `mission_guest_contact` upsert-else-delete (only after the row update matched — no orphan). Redirects to
  `/dispatch?open=<id>` (reuses the Session-33 deep link → row expands + scrolls). `revalidatePath` schedule/calendar/history.
- **Entry point:** an "Edit details" link in the expanded schedule trip detail, shown only while `pooled/accepted/confirmed`.

**Verified live** (localhost, real Supabase DB): edit link appears on an editable trip → edit page renders (locked
header Eco·Van €67.50/ceiling €90, all 3 cards) → set reference + driver message → save → redirected to `?open=` with
the row expanded; **reference + message persisted, and Fare 67,50 € · ceiling 90,00 € · route 9.7 km/18 min · status
"In the Pool" ALL UNCHANGED.** `tsc` clean; no console errors. **Adversarial 2-lens review (security + parity, Opus,
51 tool calls) → 0 findings** (price-safety invariant + createMission parity both hold).

**Follow-up (founder feedback, same day):** two polish asks on the edit feature.
- **Edit button placement** — it was at the BOTTOM of the expanded trip detail (expand + scroll = unintuitive). Moved
  it to the **TOP-right of the detail** as a filled navy button (first thing you see on expand). D25 mockup: founder
  picked "top of detail only" (declined a row-level pencil). No schema — shipped first (`5e6a0cb`).
- **"Edited" mention** — founder wanted a simple edited indicator **in the trip detail only, NOT on the collapsed row**
  (declined per-item "what changed" — that's really a Driver-notification feature, deferred to the edit Phase 3).
  Migration `docs/migrations/2026-07-05_mission_info_edited_at.sql` (`mission.info_edited_at timestamptz`, founder RAN
  it live). `updateMissionInfo` stamps `info_edited_at = now()` on every info edit (never on price/route/status).
  `trip-row.tsx` shows **"Edited · <time>"** (via `formatDateTime`) at the top-left of the detail edit bar, kept even
  after the trip is frozen; **never rendered on the collapsed `<summary>` row.** `lib/database.types.ts` updated (Row +
  Insert). Verified live: edit → "Edited · dim. 05 juil., 18:51" shows in the detail, absent from the row, ceiling
  unchanged. `tsc` clean.


---

## Older sessions (1–33) — archived
Sessions 1–33 (2026-06-16 → 2026-07-05) live in **`project/SESSION_LOG_ARCHIVE.md`** to keep this file — and
session startup — light. Read the archive only if you need that deep history; `project/CHANGELOG.md` has the
plain-language big picture.

---

## Session 52 — 2026-07-31 · § Q ruled on and parked · Dispatch History taken the rest of the way ([[d67]], [[d68]])

### Part A — abandoned trips (§ Q): a founder conversation, no code

The founder opened by challenging the premise: *"I am the only one here testing… in a real situation there will be
people taking care of it — a business who creates a mission will follow up on it… and if a driver has it we did offer
solution on both parties, copilote, agreed release, T-60."*

Mostly right, and the useful part was naming **which** case the valves cover. Every escape valve built to date
(copilote · agreed release · T-60 · Business cancel) answers **"this trip isn't going to happen"** — someone is
unhappy, so someone acts. That case is genuinely closed. The open hole is the opposite: **the trip DID happen and
nobody tapped the last button.** Driver drops the Guest, hotel is delighted, Driver moves on and never reopens the app.
Nobody is unhappy, so nobody chases it — the service was fine, only the *record* is wrong, and the record is what pays
the Driver and bills the Business. **That is the case that survives real users, because it has no complainer.**

So the answer isn't a rule (time can never separate "drove and forgot" from "never turned up") but a **question**:
a pinned card — **not a modal**, the founder agreed a popup trains people to tap ✕ without reading — on My Rides ~3h
after the trip should have ended. The founder's own best question closed the design: *"what if the driver comes back a
month later?"* A month later he doesn't remember either, so the question has a **48h shelf life** and then **flips to
the Business**, who knew that same day whether their Guest reached the airport.

The founder also proposed **geolocation auto-close**. Right instinct, blocked: Kavenue is a PWA and a browser only gets
location while the app is on screen — no background arrival detection without a native app. And even then, **location
may suggest, never decide**; location closing a trip is location *paying* someone (failure case: the Driver returns to
Nice airport at 11am for his next job and the app closes and pays out yesterday's trip).

**Founder's call: leave it.** All 8 rows are test artifacts, and the card only fires if a Driver opens the app, so the
design needs push. Written up in full in BACKLOG § Q + [[d67]] so it is never re-derived. Q4 (reliability mark) stays
open; Q5 dissolves; ⚑ the "No, the Guest never showed" branch will need its own route — the [[d47]]/[[d48]] no-show
rules assume a courtesy-wait clock running on the spot and will not pass their guards three days later.

### Part B — Dispatch History, § R phase 2 ([[d68]], deployed `0acdb68` → Vercel `success`)

Founder: *"it is a professional tool, and they need accurate infos and easy to find a specific trip or mission by
drivers name, or passenger or internal reference, or car… it need to be perfect and complete."*

**D25 loop:** researched back-office/reservation-log patterns, then built a **live** preview at real width (a static
harness on :4613 `<link>`-ing the real `app/globals.css`, with the founder's own addresses/refs/guests) — the search
actually filtered, so the founder could type in it. Signed off with one change: **the search placeholder was being
truncated**, so it became `Search trips…` with the covered fields shown under the box on focus.

**New files**
- `lib/history-filter.ts` — the ONE place a past trip is filtered, searched, sorted and priced. The page and the CSV
  route both call `applyHistoryQuery`, which is what makes "Export CSV = exactly what's on screen" survive future
  filters. Holds `fold()` (accent-blind compare), `foldWithMap()`/`highlightSegments()` (paint the ORIGINAL string from
  offsets found in the FOLDED one — folding the whole string loses the mapping the moment a character isn't 1:1),
  `matchRow()` (AND across terms, OR across fields, returns WHICH fields hit), `historyFare()` and `historyHref()`.
- `components/history-filters.tsx` — the toolbar. Search debounced 300 ms into the URL via `router.replace`; native
  `<select>` for Driver/class/sort (keyboard + SR correct for free, platform picker on a phone); Export is a plain `<a>`.
- `components/date-cal.tsx` — the Earnings calendar, **extracted** and adopted unchanged. Gained one optional
  `anchorDay` prop so it can open on a month while banding nothing.
- `app/(dispatch)/dispatch/history/export/route.ts` — CSV.

**Changed:** `history/page.tsx` (rewrite), `components/trip-row.tsx` (archive gains a date cell, a fare cell, the
highlight and the match-reason line), `components/earnings-period.tsx` (imports the shared calendar), `lib/format.ts`
(`formatArchiveDay`), `app/globals.css` (the 8-column archive grid + toolbar).

**Two gaps the work exposed:** rows showed only a **time** while grouped by **month** (3 vs 19 July indistinguishable),
and there was **no fare column at all**.

**⚑ The accuracy call.** First cut counted every non-expired trip's `settledFare` into the spend total — which silently
included the 8 § Q trips nobody ever closed, inflating the archive's spend by trips that may never have happened.
`historyFare()` now returns `{fare, counted}`: an unclosed trip shows its agreed fare **greyed, "Not settled", excluded
from row totals, month bands and the summary**, with its own CSV column.

**⚑ Bug caught in review, not by the compiler.** The search box tracked "has the user typed" with a boolean ref that
never reset — so after typing, **"Clear filters" could not clear the box**: the effect ignored the incoming empty
`query.q` and re-pushed the stale text. Replaced with a `sent` ref holding the last value the box itself pushed;
anything else arriving in `query.q` (Clear, Back, a pasted link) wins. Verified live.

**CSV specifics:** `;` delimiter and French decimals (58,17) because the reader is Excel FR, where a comma is the
decimal separator and a comma-delimited file lands entirely in column A; UTF-8 BOM (without it "Aéroport" arrives as
"AÃ©roport"); a leading `=`/`+`/`-`/`@` is quote-prefixed so a stray reference can't execute as a formula.

**Verified live** vs the real Supabase DB on `Le Grand Hôtel (demo)`, 28 past trips: accent search (`medecin` → matches
and highlights "Médecin"), car search (`mercedes` → 10 rows, each with the `Car ·` reason line), the settled/unsettled
money split (10 trips, only the 3 completed summing to 265,00 €), a two-tap range (1–6 Jul, band joins, calendar stays
open with Done, results narrow to 1), search→Clear round trip, CSV output (delimiter, decimals, accents, sort, columns),
narrow-viewport wrap + side-scroll, and **the Driver's Earnings picker re-checked at 430 px after the extraction** (no
regression). `tsc --noEmit` clean · `next build` green (25 routes) · no console errors.

**Left open, deliberately** (both recorded in § R): the **growth limit** — the page loads the whole archive in one
query and filters in memory, which is exactly what lets the chip counts, the Driver dropdown and the class list be
honest about the *whole* archive; correct at 28 trips, first thing to break at 5 000, at which point the filters move
into SQL and the counts need their own aggregate query. And the **density toggle** — the row is already dense and
nobody asked for it.


### Part C — the founder tested it, and three reports became ten fixes ([[d69]], deployed `8e1ca74` + `8b06038`)

**Founder's three reports.** (1) *"Please remove 'any drivers' — can you imagine there is 300, how it would look
like?"* (2) *"When writing it starts searching from the first letters which blocks me to keep typing, it removes what
I wrote then the writing comes back… and a cross appears on top of the other cross already in the field."* (3) *"The
calendar I can't select a specific week or month, can you use the same as the driver app you did?"* Then, after that
shipped: *"the day picker behaviour is confusing in both dispatch and driver — when I pick the from date the layout
changes, Done disappears, letters of the days week also; when I pick the to date the calendar displays today's date
for a moment before going back to from–to."*

**Every one of them was the same root shape: a control reading its own state back from something that lags.**

- **The revert bug (mine, from Part B).** The search input mirrored `query.q` into local state so "Clear filters"
  could empty it. `router.replace` runs in a transition, so between *pushed q=x* and *committed* there is a render
  where the prop still holds the OLD q — the sync read that as external, wrote the stale value in (text vanishes),
  then the new one (text returns). Once per keystroke. Local state is the sole owner now. Proved by typing
  `croisette` one character at a time and recording every value the field held: strictly monotonic.
- **The double cross.** `type="search"` draws the browser's own ✕ over `.dx-search__clear`. Now plain text (matching
  the calendar's search box, which always was) plus a CSS guard so it can't recur.
- **The layout jump.** The "Now pick the end date" prompt rendered at the TOP and Done was hidden mid-selection, so a
  first tap pushed the grid **down 27px** and shrank the popover **18px** — the date numbers slid up into where the
  weekday letters had been, which is precisely what the founder described. One fixed-height footer slot now holds
  either the prompt or Done. Measured: height 440 / gridTop 340 / dowTop 321, identical across all three states, on
  both screens.
- **The "today" flash.** The two-tap state lived in each CALLER, cleared the instant the second tap landed, while the
  new range only arrives on commit — one frame of OLD props. Moved into `DateCal` with an `optimistic` pair that is
  drawn immediately and dropped when the props catch up. Frame-by-frame capture across the second tap: before, the
  previous range reappeared at t=40ms; after, the correct band is there from the first frame. Deleted the duplicated
  logic from both callers as a side effect.

**Then a 4-lens / 29-agent adversarial review of the fixes (`Workflow`, ~1.96M subagent tokens): 8 confirmed, 8
refuted.** Nearly all of the confirmed ones were the SAME lag-shape as the bug being reviewed:
- **Tapping a month from "Any date" did nothing at all** — `period` is null until a filter exists; DateCal fell back
  to `"month"` for rendering but `pickDay` pushed the raw null, so `historyHref` wrote no params. **Reproduced live
  before fixing** (URL and label both unchanged after the tap). One `calPeriod` now feeds both sides.
- **Three fast ‹ clicks stepped one month.** Steps now compute from the live anchor via `periodRange`: July → April.
- **A debounced search reverted a sort changed within its 350 ms.** `push` merges patches onto a `live` ref of the
  last intent, guarded by an `inflight` href so a slower earlier response can't overwrite a newer one. Verified:
  `?q=croisette&p=month&d=2026-04-01&sort=high` — all three survive together.
- **No unmount cleanup on the debounce** — leaving History mid-word fired `router.replace` back to it, with Back
  already spent by the replace. Timer moved to a ref with an unmount cleanup.
- **The empty state's "Clear filters" was a soft `<Link>`** — it emptied the URL and left the typed text in the box
  next to every trip. Hard `<a>` now: the box owns its text, so only a remount can legitimately reset it.
- `?p=day&d=2026-02-31` rolled over to **3 March** — shape-only regex replaced with earnings' own `parseDayParam`.
- A query of just `^` or `¨` folds to nothing and **matched every row** with no highlight; it matches nothing now.
- Switching Month → Day anchored on the period's first day rather than the day you were on.

**Refuted and deliberately left alone (8)**, including: the export link lagging the visible rows (the rows are
server-filtered from the same URL, so it can't); a stuck `driver=` param with no UI to clear it (nothing writes it,
and Clear filters reaches it anyway); and two findings about files outside this change.

**Verified:** `tsc` clean · `next build` green · both apps driven live against the real Supabase DB (Dispatch at
1560px and 820px, Driver at 430px) · no console errors · popover never overflows the viewport. Deployed `8b06038`,
Vercel `success`.

**⚑ The pattern worth carrying forward.** In an App Router client component, `searchParams`-derived props are ALWAYS
one navigation behind the user's last action. Anything that (a) mirrors them into local state, (b) merges a patch
onto them, or (c) computes a "next" value from them will misbehave under fast input. Own the intent locally; let the
URL catch up. This session produced five separate bugs of that one shape.

---

## Session 53 — 2026-08-03/05 · The marketing site becomes its own project ([[d68]] follow-on; no product behaviour change)

### What the founder asked for, and what I got wrong first

*"I need to create a landing page that will introduce Kavenue the best way possible, a driver side a business
side and a investor side, also an account sign-up sign-in for business or should this be a different link or
place?"*

**The sign-in question has a technical answer, not a preference:** each app subdomain holds a **host-only session
cookie** (the [[d60]] design that lets one person be a Driver and a Business at once). A login form on the apex
**cannot** set a cookie for `dispatch.kavenue.fr`. So the landing page links out; it never hosts a form. And
sign-**up** must not be self-serve — a Business needs onboarding, and a Driver legally cannot work until their
documents are verified (Doc 01: €300,000 for connecting Guests with unregistered VTC drivers, and the admin
verification workspace is still unbuilt). The CTA is a capture, not an account.

**⚑ Then I built a finished four-page landing preview and it was rejected wholesale** — *"I like just about
nothing about it sorry, what I wanted is for you to tell me to set up everything for you."* The founder wanted
the **foundation**, with design and copy going to a separate brainstorm session. Rule #1 (preview first, get
sign-off) exists precisely to catch this and I skipped past it by building a complete thing. Recorded in the new
repo's own `CLAUDE.md` so the next attempt starts from a preview.

### The architecture conversation (worth keeping — it was a real decision)

I recommended a route group **inside** this repo: same deploy, hard CSS wall via `app/(marketing)/` with its own
layout. Argued the honest tradeoffs both ways — same repo risks a **shared build** (a broken landing page blocks
a *product* deploy, though Vercel keeps serving the last good deployment, so the product never goes down);
separate repo costs **brand-token drift** and a second thing to maintain, and buys a genuine security boundary
(two sets of env vars, so a marketing page cannot even reach the service-role key).

**Founder chose separate.** They reaffirmed after hearing the counter-argument — *"I would feel more comfortable
not to work on the same repo"* — so that is the decision, not a compromise to revisit.

### What shipped

**New repo `Phyrass-H/kavenue-landing`** (private), local `../kavenue-landing`, its own Vercel project. Next 16 +
TypeScript, **no Tailwind** so tokens lift across cleanly.
- Brand tokens copied **verbatim** from this repo's `app/globals.css` + a minimal reset and **nothing else** —
  the product's 3,000-line stylesheet is deliberately not copied, because its `.btn`/`.card`/`.row` collide with
  anything a landing page wants. That collision is not hypothetical: it silently broke the first mockup's buttons
  (the app's `.btn { width: 100% }` won on a property the landing CSS never declared).
- A **holding page**, not a landing page: presentable, true, links both sign-ins. Its purpose is to let the
  domain move happen **independently of the design work**.
- `robots.ts` already excludes `/investors` (unlisted — noindex + not in nav, *not* secret); `sitemap.ts` lists
  public pages only; full metadata + Open Graph.
- Dev server on **:3100** so it never fights this app on :3000.
- Its `CLAUDE.md` carries the agent/intermediary copy rules, the token block, the domain runbook, which claims
  are true today vs which need checking, and the founder's working preferences.

**The domain move — done and verified 2026-08-05.** `kavenue.fr` + `www.kavenue.fr` now belong to the landing
project; `driver.` and `dispatch.` stayed on this one and were **never interrupted**. Verified before and after:
apex 200 serving the landing project (its own `robots.txt` proves it), `www` still 308 → apex, both app
subdomains still 307 → `/login` with `/login` reachable.
- ⚑ **DNS at OVH was not touched.** Only the project↔hostname binding inside Vercel changed.
- ⚑ **Vercel's "Redirect apex domains to www (recommended)" was UNCHECKED on purpose** — it would have inverted
  the canonical domain, and `metadataBase` in both repos declares `kavenue.fr`.
- ⚑ Order matters: remove from the old project, then add to the new one. Vercel refuses two projects claiming one
  hostname, so the apex is unserved for the seconds in between.

**This repo:** `components/landing-splash.tsx` and the `isProdDomain && roleSubOf === null` branch in
`app/page.tsx` are **deleted** — unreachable once the apex moved, and unreachable branches rot. `lib/hosts.ts`
untouched; `isProdDomain`/`roleSubOf` still enforce role-per-subdomain in the two route-group layouts. Built
green, deployed `ab93849` → Vercel `success`, and all four hostnames re-verified *after* that deploy landed.

### Also written this session
- **`project/PRICING_BRIEF.md`** — a self-contained brief for the founder's pricing/commission brainstorm
  elsewhere, so a fresh Claude can be briefed without a 1,400-line decision log. ⚑ It surfaces something the
  founder was about to re-derive: **Doc 01's worked money-flow example already answers "is commission taken out
  of the Pool price or added on top"** — Driver €100, Business €118, so it is **added on top**, which means a
  mission needs **two** money figures where it has one today.
- **`project/LANDING_HANDOFF.md`** — the same content that became the new repo's `CLAUDE.md`.
- **`docs/migrations/2026-08-03_access_request.sql`** — written, **NOT applied**. A capture table for a real
  contact form. The founder will decide at design time whether the site takes a form or just shows
  `contact@kavenue.fr`; no migration is needed for the latter.

### ⚑ The standing cost of the split — say this out loud in future sessions
**Brand tokens now exist in two repos.** Change a colour here and it must change in
`../kavenue-landing/app/globals.css` too, or the navy drifts and it shows the moment the two are open side by
side. Both files carry a comment saying so.

### Housekeeping
The founder is renaming the working folder `02_Cactus/PickUp` → `02_Cactus/Kavenue` (the long-open task from
[[d51]]). Claude Code keys its per-project storage to the folder path, so the matching directory under
`~/.claude/projects/` has to move with it or the history and memory are orphaned. Steps written to
`02_Cactus/RENAME_STEPS.md` (outside both repos, so it survives the rename). **If any doc in this repo still
shows an absolute path containing `02_Cactus/PickUp`, it is stale — nothing depends on it.**

### Addendum, 2026-08-06 — the folder rename landed

The rename from the previous entry is **done**, and the founder went one level further than planned: **both**
levels are renamed, so the working directory is now `02_Cactus/Kavenue/Kavenue_project_dev` (not
`Kavenue/PickUp_project_dev`). The landing repo sits beside it at `02_Cactus/Kavenue/kavenue-landing`.

Claude Code keys its per-project storage to the folder path, so `~/.claude/projects/` had to move in the same
operation. Verified after: all 9 memory files present, session history intact.

⚑ **One thing worth remembering about this class of change:** the session doing the rename cannot perform it —
its shell is inside the folder being moved, and Claude Code is mid-write into the very `~/.claude/projects/`
directory being relocated. It has to be done by the founder from a plain Terminal with Claude Code quit. A
guarded script (`02_Cactus/finish-rename.sh`) was written to make that a single command; both it and
`02_Cactus/RENAME_STEPS.md` have since been deleted, having served their purpose.

Stale references cleaned up in the same pass: `NEXT_SESSION.md`, `NEXT_MOVES_CHECKLIST.md` and `DECISIONS.md` now
record the rename as done rather than outstanding; 10 absolute paths in `GUIDANCE_AUDIT.md` were repointed; the
landing repo's `CLAUDE.md` cross-reference was fixed; and the long-flagged dead `pickup_schema.sql` entry in
`.claude/settings.local.json` was removed (that file has not existed for some time — the path was already wrong
before the rename). **Historical prose in the logs, CHANGELOG and DOMAIN_MIGRATION was deliberately left alone** —
it describes what was true when written, and rewriting history to match the present makes the record useless.

**Still founder-owned and still open:** the GitHub repo is `Phyrass-H/Pickup-marketplace`. Renaming it breaks the
git remote, so it is not something to do casually mid-session.

### Session 53 close, 2026-08-06 — the landing brief pack

Wrote **`brief/` in the landing repo** — 8 files, ~740 lines, deliberately **self-contained** so a session over
there never needs to reach into this repo: what Kavenue is (including the trip flow end to end, which nothing
had written down in one place), the legal position as concrete copy rules, a claims ledger (true today / check
first / never), the three audiences, design tokens + the founder's taste, the technical constraints that settle
the sign-in question, and an honest account of the rejected first attempt. The landing `CLAUDE.md` now points
there instead of here.

⚑ **Landing-side decisions now live in `../kavenue-landing/CLAUDE.md` §0, not in this repo's DECISIONS.md.** The
founder's landing session has already recorded **D-L1** (English only for now; French is a later pass, don't
build i18n routing yet), **D-L2** (*no geography at all* — no "French Riviera", no city names; the page talks to
everyone) and **D-L3** (no Driver count, in any wording). Those supersede what the brief originally said about
the beta being Riviera-specific — the facts are still true internally, they just don't go on the page. **If a
future product session needs to know what the public site claims, read that file, not this one.**

---

## Session 61 — 2026-08-17 (Mac) — PRICING STEP 4: COMMISSION. Shipped `f85715f`.

**The decision that shaped everything: the Ceiling is ALL IN.** `docs/06` §4 calibrated the rate card against
*retail* — published prices a customer pays — and concluded the card sits at 70–94% of it, "so a Business
reselling to its Guest keeps a margin". §1 says the Business pays 12,5% HT / 15% TTC **on top of the fare**.
Those two cannot both describe the same number: read the card as the fare and a Business's real cost is
80–108% of retail, which breaks §4's own claim on the cheaper-quoting routes. Put to the founder with both
readings priced out; they chose **all-in** — the pre-filled Ceiling is what the Business pays, fee inside.

⚑ **`mission.ceiling` DID NOT CHANGE MEANING, and must not.** It still stores the **Course** — the fare the PDP
curve climbs, the Driver is paid from, and every fee/band/cancellation basis is computed against. The all-in
figure is derived for display only, and converted back to a Course exactly once, in `createMission`. This is
what made a display-wide change safe without touching a single money RPC or re-running the S57 probes.

**The Driver ruling is now permanent** (it was provisional from S48): the number in the Pool **is** what the
Driver banks. No gross/net language anywhere. The commission appears in exactly one place — the money detail on
a trip they hold — because a Driver has to invoice and file: they need the fee to reclaim its VAT, and the VAT
inside the fare to declare it. The same 87,00 € leaves a VAT-registered Driver keeping 79,98 € and one under
*franchise en base* keeping all 87,00 €, which no single number can say.

**Where VAT is broken out, and where it isn't.** Driver: yes, for the reason above. Business: no — they cannot
reclaim VAT on passenger transport (§3), so it is not actionable; what they *can* reclaim is the 20% on the
service fee, and that is its own line. The transport VAT rate + amount still belong on the **invoice document**
when invoicing lands, which stays French even though the app copy is English (founder asked for English on
screen; `docs/06` §3's French labels are the invoice's, left alone).

**⚑ THE BUG THE PARITY PROBE CAUGHT — read this before touching `lib/commission.ts`.** The first run of
`.local/probe/commission-parity.ts` found **14 divergences in 1 900 checks** between SQL and TypeScript. Every
one was an exact `.5` tie: Postgres computes `556.9 × 1.15` in exact decimal as `640.435` and rounds half away
from zero to **640,44**; JavaScript computes `640.4349999999999` and rounds to **640,43**. `Number.EPSILON`
nudging is two orders of magnitude too small to help. The whole split is therefore **integer arithmetic** —
cents and hundred-thousandths of a rate, in BigInt — and the probe is now 1900/1900. *A cent between the screen
and the invoice is a bug, not a rounding nicety.*

**The invoice always reconciles.** Each side's total and HT fee are computed independently and the **VAT line
is taken as the remainder**. It can sit a cent off 20% of the fee; it can never fail to add up. Same convention
in SQL. Pinned by `tests/commission.test.ts` over a thousand consecutive cents.

**⚑ The Ceiling snaps, and why it has to.** `mission.ceiling` is `numeric(10,2)`, so the Course is held to the
cent — and a cent times 1,15 skips cents. About **one all-in value in eight is unreachable**: type 170,00 and
the neighbouring Courses give 169,99 or 170,02. `courseFromBusinessTotal` therefore returns the largest Course
whose all-in does **not exceed** what was typed, and the form says so ("Rounded down from 170,00 € so the three
lines bill exactly"). A maximum is a promise not to go above a number, so down is the only honest direction.

**Two migrations, both written for the founder to run.** `2026-08-17_commission.sql` (applied same session):
one-row `commission_rate` table + four nullable snapshot columns + `commission_split()` / `transport_vat()` /
`commission_for()`. `2026-08-17_transport_vat_snapshot.sql` (**applied same session**): a
`before update of driver_id` trigger that freezes the accepting Driver's VAT status onto the mission and clears
it on re-pool. **Verified 10/10 live** via `.local/probe/transport-vat-2026-08-17.ts` — all three branches (a
registered Driver stamps 0,10 · re-pool clears it back to NULL · a Driver under franchise en base stamps **0,
not NULL**, which is the distinction the display depends on). The probe creates its own throwaway `S61VAT`
mission rather than borrowing a real one — the Pool is legitimately empty since § P — and deletes it, baseline
re-asserted at 271. Deliberately a trigger, not four edits to `accept_mission` and the three
re-pool RPCs — smaller blast radius on money-critical code, covers every path including future ones, and it
cannot affect who wins an accept race. **Not `security definer`** — that is the S41/S42 guard saga's lesson.

**⚑ NULL rates are not zero rates.** All 271 live missions predate commission and were billed no fee. They
carry NULL rates, `charged: false`, and render as a single amount with no breakdown. Defaulting the columns to
0,125 would have retroactively invented 15% of charges on the whole archive.

**What moved on screen.** Business: the Pricing card carries the three lines under the Ceiling; the expanded
trip row shows them plus what the auction saved ("Filled 45,71 € under your maximum — and the service fee fell
with it"), which is §6's argument made visible; Spend and History totals are **all-in and therefore ~15% higher
than the day before**, with `Service fee` and `VAT on service fee` as their own components. Driver: Pool card,
My Rides, the run view, the waiting meter, the no-show report and Earnings are all net.

**⚑ The one gross figure left, and the open question it raises.** A Driver's own cancellation penalty carries
no commission — §1 makes it an indemnity running Driver → Business, not payment for transport — so the sheet
shows the whole fare, larger than anything else that Driver has seen. The copy now says why. **But the basis is
worth the founder's ruling:** charging 100% of the *Course* means the number was never on their screen, while
100% of what they were going to be paid would keep the deterrent story clean ("cancel and you lose exactly what
you would have earned"). Left alone deliberately — it is a money rule in a tested RPC, not a display choice.

**Also flagged, not fixed:** a driver-cancellation fee still counts as Business *spend* in `historyFare`, which
predates this session; it is money the Business receives.

**Verified live** against the real DB: posted one probe trip (Cannes → Beausoleil, 55,7 km, Business sedan) —
stored `ceiling` **138,61** against a **159,40** maximum, `pdp_start` 69,31 in Course space, all three rates
snapshotted, `transport_vat_rate` NULL with no Driver. At the same instant the Business row read **79,71 €**
(69,31 + 8,66 + 1,74) and the Driver's Pool card read **60,99 €**. Probe deleted, **baseline restored to 271**.
`tsc` clean · **415 tests** · `next build` green · parity **1900/1900** · CI green before the fast-forward.

**⚑ SIX PRICED DEMO TRIPS, so the work is visible at all.** Every mission that existed before today predates
commission, so the app looked *unchanged* after shipping — no breakdown appears anywhere until something priced
lands. `.local/seed/s61-priced.ts` posts six carrying reference **S61DEMO** (three pooled incl. a SPEED WIN and
an Eco short-hop, one confirmed, one completed with 17 min of waiting, one Business cancellation), all priced
off the real `mission_price()` RPC and the live `commission_rate` row — nothing hand-typed. `--undo` removes
them; they are the founder's to keep until the whole-DB cleanup after step 5.
- ⚑ **Two seeding traps worth remembering.** (1) Inserting a row with `driver_id` already set produces a
  mission **no VAT status was ever frozen onto** — the trigger is `before update of driver_id`, deliberately,
  because a real trip is posted first and accepted second. The seeder now attaches the Driver in a second
  statement, the way `accept_mission` does. (2) The climb reaches the ceiling in about two hours at 10-minute
  5% steps, so a trip "accepted" three hours after posting settles at its maximum and the *"what the auction
  saved"* line has nothing to say — which is the one thing these rows exist to show. Accept early.
- **Verified on screen:** Business confirmed trip reads *"Filled 33,81 € under your maximum of 96,60 € — and
  the service fee fell with it, 10,50 € down to 6,83 €"*; the Driver's money detail on the completed trip reads
  Fare 86,18 → commission 8,62 → VAT 1,72 → **Paid to you 75,84 €**, matching the card footer exactly, with
  *"carries 7,83 € of VAT you collect… after settling both you keep 69,73 €"*. **Baseline is now 277**, not 271
  — deliberately, and `.local/probe/transport-vat-2026-08-17.ts` still asserts 271, so re-base it or run
  `--undo` first.

**S61 part B — the founder's review pass, four fixes (2026-08-17).** All copy/layout, no money logic touched;
`tsc` clean and 415 tests green throughout. Deployed `fdc24df` · `c959e61` · `0419dc3` · `eb09357`.
1. **"Agreed price" → "Accepted at".** "Agreed" read as though the two parties had negotiated and met in the
   middle. They don't: the Business sets a Ceiling and a Driver takes it at whatever the curve had reached.
   ("Agreed release" is untouched — that one genuinely is both sides agreeing.)
2. **The saving line lost three of its four numbers.** It read *"Filled 33,81 € under your maximum of 96,60 €
   — and the service fee fell with it, 10,50 € down to 6,83 €"*; the founder's objection was simply that a
   simple, good piece of news had four figures in one sentence. Now **"You saved 33,81 €"**, a quiet green line
   rather than a filled panel. The Ceiling is already in the tile above and the fee in the table above that.
3. **⚑ "max" → "Ceiling", and this one was a real lapse.** Ceiling is a glossary term (CLAUDE.md hard rule 1)
   and it had been glossed away as "max" / "your maximum" on the two screens where a Business meets it most —
   by me, while writing the very features that made it matter. **A gloss that replaces the term stops the
   vocabulary being learned by the people using it, which is the whole point of having one.**
4. **"Confirmed" → "Driver accepted"** (Business side only). A new Dispatcher reads "Confirmed" as *my mission
   was created properly*, not *a Driver has committed*. "Accepted" alone fails the same way — it can still be
   read as the system accepting the booking — so the label names the actor. The sequence is now a sentence:
   **Driver accepted → Not checked in → Checked in**. The Driver's own pill still says "Confirmed" (on their
   screen it means "this is yours"), and the `confirmed` STATUS is untouched — label only.
5. **Route back above the money.** The commission panel had been inserted between the scan strip and the route,
   pushing the one section that shows where the trip actually *is* (the rail checks off live as the Driver
   reaches each stop) below an accounting table. Order is now scan strip → Route → What you pay → Guests.
- ⚑ **The stale dev server bit again, exactly as S60 documented** — the browser threw a syntax error quoting
  lines that had already been fixed, while `tsc` was clean. Stop the preview, `rm -rf .next/cache/webpack`,
  restart. Do not debug the source.
- **Asked and answered, no change:** the Dispatch breakdown recomputes live as the curve climbs. The founder
  asked whether it should instead appear only at creation and after acceptance. Argued both ways and settled on
  leaving it: **it lives behind an expand**, so nobody meets it by accident, and when a Dispatcher opens a row
  more detail is what they came for.

---

## Session 62 — the all-in basis sweep, and a VAT sentence the app could not honestly say (2026-08-18)

Local session on the Mac, clean tree at `5622165`. The founder opened with two things: strip the
local/online environment check from `NEXT_SESSION.md`, then a design question — *"do we need TTC on the
hotel spend and on the driver income?"*

**The answer was no, and the question found a bug instead.** `docs/06` §2 already makes every displayed
price TTC by convention, and §1 (LOCKED, S61) settles the rest: the Business figure is all-in with the fee
and its VAT inside, so "TTC" is redundant; the Driver's figure is neither TTC nor HT but **cash received
after commission**, so "TTC" would invite them to read it as the fare they invoice. Offered "Total, all in"
on the two Business breakdown totals and argued against it — the total sits directly under three named
lines including *VAT on service fee*. Founder agreed to skip it. The app's money labels are also English;
`TTC` would have been the first French tax token in the UI, and the invoice document (which stays French)
is where it belongs.

**The founder then proposed removing the VAT detail from the Driver's trip card entirely** ("once they have
the info it's enough forever"). Laid out three options; they chose to **keep the four lines**. Noted the
tension with their own message rather than silently building either one.

### Shipped

1. **The Driver VAT sentence no longer asserts a tax status the app doesn't know**
   (`components/mission-run-view.tsx`). `transportVat()` coerces NULL to 0, so *"we have not been told"* and
   *"this Driver charges no VAT"* rendered identically — as **"You charge no VAT, so there is none to declare
   and none to reclaim."** The trigger's own comment says the intent is the opposite: *"the app renders no VAT
   line rather than guessing one."* Now gated on `vatKnown = m.transport_vat_rate != null`. NULL is reachable
   in production: the trigger clears the stamp on every re-pool.
   *Live check:* 6 charged trips, 4 held by a Driver, all 4 with a real rate — nothing on screen changes today.
   Probe left at `.local/probe/vat-null-check.ts`.

2. **The cancel modal is on the Business's basis** (`components/dispatch-cancel.tsx` + its call site).
   It quoted **1,00 €/min** for waiting while `dispatch-waiting.tsx`, on the same screen, quoted **1,15 €/min**
   — and the fee itself was Course-basis, though `docs/06` §1 is explicit that a Business cancellation carries
   commission (*"a €90 fee becomes €103,50 paid"*). Takes `rates` now and converts fee, fare, waiting,
   next-raise, per-minute rate and the confirm button. Converted **part by part, not once over the sum**, so
   the split always adds to the headline.
   *Verified live* on a purpose-made trip (`.local/probe/cancel-modal-trip.ts`, created and removed, baseline
   re-asserted at 277): modal reads **80% · 50,23 € of 62,79 €**, next raise **85% (53,37 €)**. Before: 43,68 €
   of 54,60 €.

3. **The Summary rail showed a Ceiling that will not be billed** (`.../new/mission-form.tsx:1023`). It printed
   the **typed** all-in while the Pricing card and the line directly beneath it printed the **billable** one.
   ~1 value in 8 is unreachable as a Course, so they disagreed by a cent — on the last number seen before Post.
   *Verified live:* typing 50,02 now reads 50,01 in all three places, with "Rounded down from 50,02 €" the one
   surviving mention of the typed figure.

4. **A failed rate read is no longer treated as "no commission"** (`.../new/page.tsx`, `.../new/actions.ts`,
   `mission-form.tsx`). Both reads dropped their error, and `ratesFromRow(null)` means *no generation in force*
   — a legitimate state. If the page's read failed while the server's succeeded, resuming a draft seeded the
   ALL-IN field with a raw Course and `createMission` converted it **a second time**: the stored fare falls
   ~13% per open-and-save cycle, silently, taking the Driver's pay with it (159,40 → 138,61 → 120,53 → 104,81).
   The mirror case — the server's read failing — stores the typed all-in as the Course, a 15% overcharge
   stamped "never charged a fee" forever. Now: the page seeds **blank**, shows a notice and blocks both submits;
   the action redirects `?error=rates` and writes nothing.

5. **Four more Business surfaces converted** — Drafts (`Ceiling`), the Edit header (`Fare · ceiling`), the
   Calendar drawer (converted at the page's event builder, so the component stays unaware of commission), and
   three Spend figures: **Cost per trip** (a Course-basis numerator beside an all-in total), **Agreed, not
   settled**, and **… of Ceiling never spent**.
   *Verified live on /dispatch/spend:* Cost per trip 84,99 € · Agreed-not-settled 62,79 € (54,60 × 1,15) ·
   Unfilled 308,00 € (203,00 + 105,00).

6. **`docs/06` §10 now says the €1/min waiting rate is provisional.** The section is headed LOCKED and stated
   the rate flat, while the SQL says `PROVISIONAL (D48)` and BACKLOG § N owes the research. Also recorded the
   two places it lives (`WAITING_RATE_PER_MIN` + `v_rate` in the live `mission_waiting()`, currently defined in
   `2026-07-22_airport_accent_fix.sql`, which superseded the original migration) and that **the caps move with
   the rate** — €40/€60 are 40 and 60 *paid minutes*, not typed figures.

7. **`project/NEXT_SESSION.md` no longer opens with the local/online check.** The S55 history entries keep the
   word; they are a record.

`tsc` clean · **415/415** throughout.

### Deliberately NOT changed

- **The four transport components on Spend** (Trip fares · Waiting · Cancellation fees · No-shows) stay
  Course-basis. They are the invoice decomposition — with the two fee lines they sum to the total, exactly, per
  `docs/06` §3. The same reasoning protects the "Transport" line on the mission form. **Do not "fix" these.**
- **The "What went wrong" panel** reuses those same variables, so its 319,66 € is Course-basis while the
  "17,8% of what you spent" it is measured against is all-in. Fixing it means a separate all-in accumulator,
  not a conversion — flagged to the founder as a decision, not done unilaterally.

### ⚑ FOUND, NOT FIXED — the amendment flow never got the S61 commission pass

`mission_amendment.new_fare` is Course space (the accept RPC sets `ceiling = new_fare`), and **nothing
converts it on either side**:
- `.../[id]/amend/amend-form.tsx:133,182` — the Business types and reads a raw Course. **This is a write
  path**: converting the display without `courseFromBusinessTotal` on the way in would store a 15%
  over-priced fare.
- `components/trip-row.tsx:620,678` — the Business's own row, raw Course.
- `components/amendment-card.tsx:118` — rendered inside `mission-run-view.tsx`, i.e. **the Driver**, showing a
  gross figure. That contradicts the LOCKED §1 ruling that no gross number exists anywhere in the Driver's app.

Three display sites plus one write path. **Founder said go — done, see below.**

### Session 62 part B — the amendment flow gets the commission pass (2026-08-18)

`mission_amendment.new_fare` is Course space (`accept_amendment` sets `ceiling = new_fare`), and nothing
converted it on either side. Fixed at the four boundaries, so no rendering component had to learn that
commission exists:

- **`.../[id]/amend/page.tsx`** — the "Agreed fare" and the pre-filled field are now the Business's all-in.
- **`.../[id]/amend/actions.ts`** — ⚑ the write. Validates the typed all-in, then stores
  `courseFromBusinessTotal(typed, ratesOf(mission))`. **The mission's own snapshot rates, never the live
  ones** — this trip's invoice is already stamped, and a rate change tomorrow must not re-price a trip
  agreed today. Without this the display fix alone would have stored a 15% over-priced fare.
- **`.../dispatch/page.tsx`** — `buildBrief` now takes the mission and converts both fares to the
  Business's side.
- **`lib/mission-cards.ts`** — `buildAmendmentData` converts both to `driverNet`. This card was the one
  place in the Driver's app still showing a gross figure, against the LOCKED §1 ruling.

*Verified end to end on the live DB*, on the `S61DEMO` confirmed trip (Course 84):
typed **70,00** → stored **60,87** (a Course) → the Business's schedule row reads *"Fare change · fare
62,79 € → 70,00 €"*, the Driver's card reads *"Your fare 48,05 € → 53,57 €"*, and `mission.ceiling` is
untouched at 84. Before the fix, typing 70,00 stored 70,00 as the Course: the Business would have been
billed 80,50 and the Driver paid 61,60. Amendment row deleted afterwards, baseline re-asserted at 277.
Probe: `.local/probe/amend-check.ts`.

⚑ **The snap applies here too, undocumented on screen.** About one all-in value in eight is unreachable as
a Course, so a typed fare can come back a cent under. The mission form says *"Rounded down from…"*; the
amend form does not. Left as is — same direction as the Ceiling (never above what was typed) — but if a
Business ever queries the cent, that is why.

### Session 62 part C — the waste panel stops mixing bases (2026-08-18)

The one thing part A flagged and deliberately did not fix. `wasteLines()` reused `cancelFees` / `noShow` /
`waiting` — Course-basis on purpose, because with the two fee lines they decompose the invoice exactly
(§3) — and then `avoidable()` divided their sum by `total`, which is all-in. Two bases in one ratio.

Fixed by **adding all-in twins rather than converting the originals**: `cancelFeesAllIn`, `noShowAllIn`,
`waitingAllIn`, accumulated per row through `businessCost` so a Driver-cancelled trip (which carries no
commission) is still handled correctly. The four transport components are untouched and still reconcile.

*Verified live:* the panel reads **345,33 € · 19,3 % of what you spent** (was 319,66 € · 17,8 %).
Cancellation fees 154,11 → 177,23 · Waiting 94,00 → 96,55 · No-shows unchanged at 71,55, correctly — that
trip predates commission.

### Session 62 part D — the pre-curve money audit, and the six things it found (2026-08-18)

A six-way sweep of every money surface and write path, each finding then handed to a separate agent told to
**refute** it. **26 raised, 15 survived**, collapsing to six real defects. The 11 refutations were mostly the
two deliberate exceptions being mistaken for bugs (the §3 invoice decomposition, the gross Driver
cancellation penalty) — worth knowing that both read as bugs to a fresh pair of eyes.

1. **The last gross fare in the Driver's app.** `CloseTripCard` was handed `settledFare(m)` raw
   (`mission-run-view.tsx:206`) and rendered it as *"closing settles X — the fare you accepted"*. On a
   100,00 € Course it promised 100,00 € and paid 88,00 € the instant they tapped Yes. `f85715f` netted
   every other Driver surface and missed this call site; `close-trip-card.tsx` has one commit and imports
   nothing from `lib/commission`. Now `driverNet(m, settledFare(m))`.
2. **My Rides dropped the waiting.** The card showed `driverNet(m, settledFare(m))` while the trip's own
   page showed `missionAmount(m)` — fare **plus** settled waiting. Waiting settles at boarding and
   `on_board` is in `ACTIVE_STATUSES`, so the two disagreed live, with the smaller number on the card seen
   first. Both now use `missionAmount`, the definition Earnings and Past rides already share.
3. **Unsettled rows showed the Course** on the archive and on Spend (`r.counted ? rowCost(r) : r.fare`).
   The bare-fare-no-waiting choice is deliberate for those rows; the basis was not.
4. **"incl. … waiting" was short by the fee** everywhere it appeared — the row caption, the archive summary
   line, and both CSV exports. It is a containment claim about a total built with `businessCost(fare +
   waiting)`, so it has to be the all-in waiting.
5. **Both CSV exports** were writing Course-basis columns beside all-in ones — "Of which waiting",
   "Agreed, not settled" (which also dropped waiting entirely in the History export) and "Ceiling". A
   spreadsheet could not reconcile its own columns.
6. **"Highest fare" sorted on a quantity nobody could see** (`history-filter.ts` `byFare`): the bare Course,
   waiting excluded, so the column visibly disordered itself — and a pre-commission trip was compared
   against a post-commission one 15% larger. Now keys on the same figure the column renders.

**And the one that needed thinking rather than a conversion — the breakdown decomposed the wrong amount.**
`fareSplit` was always `splitFor(mission, settledFare(mission))`, so "What you pay" disagreed with the row's
own headline on two endings. Live, before: a cancelled trip's headline read *"177,23 € · Your cancellation
fee"* while the table under it read *"What you pay … Total 157,53 €"* — the fare of a trip that never ran —
followed by *"You saved 39,38 €"*. A completed trip with waiting totalled the fare alone.

Now a second split, `paidSplit`, over **what the row's amount is actually made of** (`historyFare`'s rule in
Course space): a cancelled trip decomposes its fee, an expired one gets no table, and waiting has its own
line so "Transport" means transport. Gated on `carriesCommission`, mirroring `businessCost`, so a
Driver-cancelled indemnity stays one plain amount. "You saved" no longer renders on a cancellation.

*Verified live on the S61DEMO archive:* cancelled → Cancellation fee 154,11 · fee 19,26 · VAT 3,86 ·
**Total 177,23 €**, matching its headline. Completed-with-waiting → Transport 69,18 · Waiting 17,00 ·
fee 10,77 · VAT 2,16 · **Total 99,11 €**, matching its headline and its "incl. 19,55 € waiting" caption.

`tsc` clean · 415/415.

### Session 62 part E — the waiting rate, researched (2026-08-18)

The founder's objection to the flat €1: *"1 € on a 40 € trip doesn't make sense compared to a trip over
500 €."* A market scan answered it, and the answer is not the one the objection implies.

**Nobody scales waiting with the fare.** Every operator that publishes a rate tiers it by **vehicle class** —
which is the same lever, since a 40 € trip is an Eco job and a 500 € trip is a First one. Uber is explicit
that the wait rate is held out of surge, and their Berline rate is 1,57× their Eco rate on fares that run
2–3× apart.

**Proposed, written into `docs/06` §10 with sources, provisional until the founder signs off:**
Eco **0,50** · Business **0,75** · First **1,00** €/min. Free wait unchanged.

**The anchor worth remembering:** the French regulated taxi tariff is the only legally-fixed number in this
market — 42,15 €/h national ceiling (*arrêté du 24 décembre 2025*), and **34,55 €/h = 0,58 €/min in the
Alpes-Maritimes**, the founder's own département. FREE NOW France already charges exactly 0,50 and 0,75.

**⚑ The mechanical finding that closed the open question.** Whether the round number should sit on the
Business's side or the Driver's is not a taste question: `mission.waiting_rate` is `numeric(10,2)`, so a
Business-facing 0,50 € would have to be stored as 0,43 — which displays 0,49 and bills **9,89 €** for twenty
minutes. The headline would be false. Stored Course-side it is exact at every duration (20 min → 10,00 /
11,50 / 8,80). My earlier recommendation was the wrong way round; the code decided it.

**The free wait is confirmed, not just unchanged** (founder): 15–20 min city / 60 min airport is the
private-hire convention, and Blacklane publishes exactly that. The 2–5 minute windows in the scan are
ride-hail, a different product.

**⚑ Not a two-line change, contrary to what was said mid-session.** A per-class rate turns the flat
`WAITING_RATE_PER_MIN` into a lookup by `mission.category`, so `lib/cancellation.ts`, `dispatch-waiting.tsx`,
`dispatch-cancel.tsx`, `rides/cancel-noshow.tsx` and SQL `mission_waiting()` all have to learn the same rule
in one go.

**Research note for next time:** the first two attempts at this scan failed — five of seven agents died on
529s, then three stalled on retry. What worked was three narrow agents with a hard search budget and no
synthesis agent. The two surviving groups from the first run were recovered with `resumeFromRunId` rather
than re-run.

### Session 62 part F — the waiting rate, built (2026-08-18)

Founder said build it. Eco **0,50** · Business **0,75** · First **1,00** €/min, replacing the flat 1,00.

- **`lib/cancellation.ts`** — `WAITING_RATE_PER_MIN` is now a `Record<VehicleCategory, number>` and
  `waitingBetween()` takes `ratePerMin` as a **required 4th argument**. Deliberate: a default would let a
  screen quietly bill the wrong class, where a required argument makes the compiler find every call site.
  It found all seven. Added `round2` — a per-class rate makes the meter float-unsafe (3 × 0,75 is
  2.2500000000000004), and Postgres rounds half away from zero on `round(w_min * v_rate, 2)`.
- **`waitingAt()`** now needs `category` in its `Pick<>`, so it reads the rate from the mission itself.
- **The three meters** — `dispatch-waiting.tsx`, `dispatch-cancel.tsx`, `rides/cancel-noshow.tsx` — each take
  a `category` prop; `trip-row.tsx` and `mission-run-view.tsx` pass `mission.category`.
- **`docs/migrations/2026-08-18_waiting_rate_by_class.sql`** — `mission_waiting()`'s `v_rate` becomes a CASE
  on `p_mission.category`. Otherwise the 2026-07-22 body verbatim. **Founder runs it.**
- **Tests: 415 → 417.** The fixture is `category: "business"`, so every euro figure in the D48 block moved to
  0,75 (40-min cap 40,00 → 30,00; airport 60,00 → 45,00). Two new tests: the same 40 minutes priced across
  Eco/Business/First (20 / 30 / 40 with `minutes` identical), and one pinning the rates as clean cents plus
  the never-zero fallback. `money-invariants.test.ts` passes an explicit `1` — it pins the real 2026-08-09
  incident, so it keeps the rate that was in force that day rather than drifting with the table.

**⚑ THE CAP WAS ALWAYS IN MINUTES, which is what makes this work.** 40 paid minutes city / 60 airport, so the
euro ceiling follows the class down by itself — Eco tops out at 20,00 Course (23,00 to the Business) where it
used to reach 40,00. Most of the market caps the same way.

**✅ SHIPPED AND VERIFIED END TO END.** The founder ran
`docs/migrations/2026-08-18_waiting_rate_by_class.sql` (success), then `36ee3de` was fast-forwarded and
deployed. Proven on a real trip rather than inferred: `.local/probe/waiting-class-e2e.ts` put one **Eco**
mission at `arrived` with the meter running, the Driver's own screen read **"0,50 € per minute started ·
stops at 20,00 €"**, boarding the Guest through the app fired `board_guest` for real, and SQL stamped
`waiting_rate 0.50 · waiting_fee 9.50` on 19 minutes. The old flat rate would have stamped 1.00 / 19.00.
Trip deleted, baseline re-asserted at 277.

⚑ **Nothing was re-priced:** 33 already-settled rows still carry `waiting_rate 1.00`, which is the whole
point of stamping the rate per row.

⚑ **A note for whoever reads that probe:** the trip it clones is a pre-commission row, so its snapshot rates
are NULL and the Driver's screen showed the Course unconverted (0,50, not 0,44). That is correct for a
NULL-rate row, not a missing conversion — don't "fix" it.

### Session 62 part G — the completeness audit, and the four mislabels it found (2026-08-20)

The founder asked whether every kind of money is counted and broken down for both parties. Four passes:
inventory (doc + schema vs code), the Business view, the Driver view, and reconciliation.

**The arithmetic is complete and closes on both sides**, which is the part that matters most:
`total = transport + serviceFee + serviceFeeVat` and `transport = fares + noShow + waiting + cancelFees`
on the Business side; `total = trips + noShow + waiting + cancelledOnYou − penalties` on the Driver's.
Nothing uncounted, nothing double-counted. What the audit found is a **visibility** problem, plus two things
not charged at all.

**Fixed now — four labels, three of them introduced earlier today:**
1. **The Driver's "Fare" line was not the fare.** `mission-run-view.tsx:163` feeds `splitFor` with
   `grossToDriver(m)` = fare + settled waiting, and it rendered under `<dt>Fare</dt>` — so a 100 € trip with
   15 € of waiting read "Fare 115,00". Waiting now has its own line with its minutes, and the first line is
   named for what the money is: *Cancellation compensation* on a cancelled trip, *No-show — full fare* on a
   no-show, *Fare* otherwise. This closes the asymmetry part A opened by giving the Business panel a Waiting
   line and not the Driver's. *Verified live:* Fare 69,18 · Waiting · 17 min 17,00 · commission −8,62 ·
   VAT −1,72 · **Paid to you 75,84**, summing exactly.
2. **"Cost per trip" said "fare + waiting"** under a figure that has been all-in since part A. Now "fare,
   waiting and fee".
3. **`docs/06` §10 still said the migration was not applied.** It was, on 2026-08-18.
4. **Neither CSV had a service-fee or VAT column** — the one number a Business reclaims was missing from the
   file its accountant opens. Both exports now carry *Of which service fee* and *Of which VAT on the fee*,
   from `splitFor` so a Driver-cancelled trip carries none. *Verified live:* 135,49 = 117,82 + 14,73 + 2,94,
   matching that trip's own row on screen.

**⚑ STILL OPEN — three real gaps, in the order I would take them:**
- **An extra stop typed WITHOUT picking the address from the suggestions is free.** It has no coordinates, so
  `app/(dispatch)/dispatch/new/actions.ts:143-146` filters it out of the routed distance and it adds nothing
  to the price — but it is still stored in `waypoints`, drawn on the Driver's route, and needs a "Reached"
  tap. The Driver drives an unpaid detour. The pickup and drop-off already refuse an unlocated address
  (`mission-form.tsx:429,431`); stops impose nothing.
- **Adding a flight number to an ACCEPTED trip silently changes the waiting terms.** `flight_number` is
  editable at `accepted`/`confirmed` through the free info edit, and `isAirportPickup` keys off it, so the
  courtesy wait flips 20→60 min and the money ceiling 60→120. Real money, no Driver consent, no amendment
  trail. ⚑ Note the founder is right that the field itself must stay editable — it is what switches on flight
  tracking. The fix is consent or disclosure, not a lock.
- **Charged but invisible:** the night ×1,20 (`night_applied` is stored and read by no screen), the waiting
  rate + minutes on a settled trip (a Driver cannot check 13,20 € against anything), and a **Driver's
  cancellation penalty**, which the Business is owed and which appears on no Business screen at all.

**Two founder ideas parked properly** — BACKLOG **§ Z** (should waiting be charged at a STOP; the "Reached"
taps already record the arrival instant, and the hard part is the clock origin, not the rate) and an
addendum to **§ W** (measure demand from our own booking volume per zone against its trailing average — no
events API needed; it must surface as advice to the Business, never as Kavenue moving the fare).

### Session 62 part H — Kavenue prices the amendment, and a flight number stops meaning "airport" (2026-08-20)

**1. THE AMENDMENT FARE IS NO LONGER TYPED.** `docs/06` §0 forbids any discretionary typed amount and §10's
build note says an amendment's fare "must be recomputed from the rate card using the new distance — never
typed". It was typed, and the screen admitted it: *"Auto-pricing arrives with the pricing engine — for now
you enter it."* The engine shipped in S61.

**⚑ THE RULE THE FOUNDER CHOSE: price the CHANGE, not the whole trip.** Re-quoting the new distance outright
is the literal reading of §10, and it is wrong in practice — it throws away the auction result. A Driver who
won a 15 km trip at 62,79 € against a 96,60 € Ceiling would be handed **110,00 €** for one extra stop. Instead
the card prices the old route and the new one, and the **difference** is applied to the fare the two sides
agreed. *Verified with `.local/probe/amend-repricing.ts`:* 15→15 km +0,00 · 15→18 +6,00 · 15→22 +14,00 ·
15→31 **+32,00 → 94,79** (against 110,00 re-quoted) · 15→12 **−6,00**. Every result round-trips through
`courseFromBusinessTotal` and reads back to the cent.

- Server (`amend/actions.ts`) prices through the same `mission_price` RPC `createMission` uses, from the
  server's own road distance. If either quote is missing it **redirects rather than guessing** — a proposal
  with an invented fare is the thing §0 forbids.
- The form no longer has a `new_fare` input at all; it shows the computed figure and says what it did.

**⚑ AND THE TRAP THAT CAME WITH IT — measure BOTH routes at the same moment.** First run opened at
**−18,60 € on a route nobody had touched**: the demo trip's stored `distance_km` is 24 (hand-seeded) while
the router returns 15 for the same addresses today. Diffing a stale baseline against a fresh measurement
invents a fare change. Both the page and the action now **re-measure the agreed route** with `routeMetrics`
and diff fresh-against-fresh; the form also forces the delta to 0 when `routeDiff` reports no change. Now it
opens at 62,79 → 62,79, "The route is the same length, so the fare doesn't move."

**2. A FLIGHT NUMBER IS NOT AN AIRPORT PICKUP.** `isAirportPickup` answered true for any trip carrying a
flight number. On a hotel → airport DEPARTURE that number is the flight the Guest is *catching*, and the
pickup is a hotel door — so it was getting the airport courtesy wait: **60 free minutes instead of 20**, and
a 120-minute money ceiling instead of 60. The Driver waited 40 extra minutes unpaid.
**Measured live: of 89 missions carrying a flight number, 37 were arrivals and 52 were departures.** The
majority were on the wrong side of the rule.

New order, because an arrival's pickup is often "Terminal 2, 06200 Nice" with no airport word in it:
pickup says airport → true · **drop-off says airport and pickup does not → false** · flight number with
neither end named → true. Three new tests pin the departure, the arrival and the airport-to-airport case.
Mirrored in `docs/migrations/2026-08-20_airport_pickup_is_the_pickup.sql`. **Founder runs it.**

⚑ The founder's instinct was right that the field must stay editable — it is what switches on flight
tracking. The bug was never that they can add it; it was what the app inferred from it.

`tsc` clean · **420 tests** (was 417).

**⚑ NOT DEPLOYED — the airport migration must be applied first**, or the Driver's screen shows a 20-minute
courtesy wait while SQL settles on 60.

**⚑ SEEN IN PASSING, NOT YET FIXED — the unlocated stop hole, on the amend screen too.** Driving the amend
form with a typed-but-not-picked stop reproduced it live: the change summary said "Add a stop at Place du
Casino", the route stayed 15 km and the fare did not move. A stop with no coordinates is filtered out of
routing, so it is priced at zero on both the new-mission and the amend paths, while still being drawn on the
Driver's route and needing a "Reached" tap. Next.

### Session 62 — closing state (2026-08-20)

**Shipped and deployed, in order:** `487d879` the all-in basis sweep + the rate-read guard · `5bee3e8` the
amendment flow's commission pass · `2c139a6` the waste panel on one basis · `732ec14` the six defects the
pre-curve audit found · `72869a2` the waiting rate researched · `36ee3de` the waiting rate per class (with
`2026-08-18_waiting_rate_by_class.sql`) · `9242e63` the resume point · `838b9c2` the labels and the CSV fee
columns · `4fb5c53` amendment repricing + the airport predicate (with
`2026-08-20_airport_pickup_is_the_pickup.sql`). Both migrations were run by the founder and confirmed.

**Where the money stands.** Every Business-facing figure is on the all-in basis; both decompositions
reconcile exactly; the Driver's app has no gross figure left except the deliberate cancellation penalty; the
waiting meter is priced per class; and no fare is typed by a human anywhere — the amendment was the last one.

**Left deliberately, written into NEXT_SESSION under "FINISH THESE BEFORE THE CURVE":** the unlocated stop
that is priced at zero, three charges that are real but invisible (the night ×1,20, the waiting rate on a
settled trip, and the Driver penalty the Business is owed but never sees), and two Driver-side counting gaps
in Earnings. None of them is a wrong charge — they are things the app knows and does not say.

⚑ **Two comments disagree about who receives a Driver's cancellation penalty** — `docs/06:71` says it runs
Driver → Business; `app/(app)/rides/history/page.tsx:185` calls it "a penalty owed to Kavenue". That is a
one-line question with a real answer and it should be settled before anything is built on top of it.

**Method note.** The wide six-way audit workflows worked; the wide *research* ones did not — five of seven
agents died on 529s, then three stalled on retry. Three narrow agents with a hard search budget and no
synthesis agent got the answer in 97 seconds. When a workflow half-dies, `resumeFromRunId` replays the
survivors from cache rather than re-running them.


---

## Session 63 — 2026-08-20 · the loose ends the money sweep left (branch `main`)

**Scope, chosen by the founder in one line: "let's finish the little things."** The three items
`NEXT_SESSION` had queued before the §6 curve. All four surfaces were mocked and signed off before a line was
written; two of them changed shape as a result of what the founder asked back.

### 1. An unlocated stop is no longer free

A stop typed but never picked from the address suggestions carries no coordinates, and **six** separate
filters dropped it — `RouteStops`' live ETA, `/api/eta`, and four in the three server actions — so the route
never passed through it and the fare never counted it. It was stored all the same, drawn on the Driver's
route rail, counted in their stop progress and needing a "Reached" tap. The Driver drove an unpaid detour.

The fix is the rule the two ends have always carried, in three places:
- `components/route-stops.tsx` — the stop's `AddressAutocomplete` **dropped `compact`**. That prop's only
  effect is to suppress the *"Pick an address from the list so we can place it on the map"* nudge, which the
  stop needed most. `RouteSummary` also gained `unlocatedStops`.
- `lib/waypoints.ts` — new `unlocatedStops()`, so the client check and both server refusals share one rule.
- `dispatch/new/actions.ts` + `[id]/amend/actions.ts` — a `?error=nostop` redirect, with copy in the form's
  banner table and in the amend page's `ERROR_COPY`. **A draft may still be parked with a loose stop**, the
  same latitude a draft has always had over the drop-off.

### 2a. The night rate is finally visible

`night_applied` had been written on every mission since the rate card shipped and read by **no screen at
all**. Now: a `.dx-night` tag in the date cell of the Business row (all three variants), `Paris time · night
rate (22:00–06:00)` under the Pickup tile, a `pbadge` on the Driver's Pool card and mission detail, a suffix
on their Earnings row, and a column in both CSVs.

⚑ **Named, never numbered.** The multiplier lives on `rate_card.night_multiplier`, reachable only through
`mission.rate_card_id` — NULL on the whole pre-2026-08-16 archive. `×1,20` in the UI would be a constant in
code (`docs/06` §9) and would lie the day the card is re-tuned.
⚑ The CSS needed **two parent selectors** (`.dxh-when > .dx-night, .dx-trip__when > .dx-night`) to out-specify
`.dxh-when > span` and `.dx-trip__when > span`, both of which target it. The third date-cell variant (today's
Schedule, time only) was rewrapped in the § Q classes minus the `<b>`, so the time keeps its exact size and
weight while the cell becomes a column a tag can sit under.

### 2b. A settled wait states its own rate

`mission.waiting_rate` was stamped per row and rendered by zero lines of app code. New `formatWaitingSpell()`
and `formatPerMinute()` in `lib/format.ts`; used on the Driver's kept-money line and money table
(`mission-run-view`), their Earnings trip row, and the Business's invoice table.

⚑ **Each side on its own basis, and only where the arithmetic survives being checked.** The Driver's ×0,88
gives 0,44 · 0,66 · 0,88 — clean cents, so minutes × rate is exactly the amount beside it. The Business's
×1,15 turns 0,50 into **0,575**, which prints "0,58 €" and does *not* multiply out. So the Business gets the
rate **Course-side inside the invoice table** (where the fee lines follow and the total reconciles) and
**minutes without a rate** on the row face, in `rides/history`, and in both CSVs.
⚑ **The STAMPED column, never `waitingRatePerMin(category)`** — that one is the live rate, and rows settled
2026-07-22 → 2026-08-18 were billed a flat 1,00 whatever their class. No rate stamped → minutes alone.
⚑ Gate on **minutes**, not on the rate: both no-show paths stamp a rate with 0 minutes.

### 2c. The Driver-cancelled block — and the question that changed it

`mission_cancellation` is written by six RPCs and was read by exactly **two** Driver-side screens. No Dispatch
surface touched it, so a trip a Driver walked away from re-pooled silently and rendered *identically to one
nobody had ever accepted* — same status, no Driver, no trace. Added: the read on the Schedule and the archive
(`DriverWalk[]`, **never** the latest-per-mission de-dup the amendment and release blocks use — a re-pooled
trip can be walked again), a `.dx-amend--declined` block on the row, and a `Driver cancelled` column in both
CSVs.

**⚑ IT SHIPPED WITH NO MONEY ON IT, AND THAT IS THE FOUNDER'S CALL.** The mock said *"Owed to you:
190,00 €"*. The founder stopped it: *"the hotel will in the end not pay anything and won't charge their
clients, so what do we do with the driver's money?"* They are right, and it is the hole in `docs/06` §1: the
trip never ran, the Business paid nothing and billed nothing, and the trip went back into the Pool — so 100%
of the fare is not compensation for a 100% loss. It is sized to **deter the Driver**, a different job pointing
at a different recipient, which is exactly why `docs/06`:71 and the O7 migration header had disagreed for a
month. Parked with three costed destinations in BACKLOG **§ Y**, cross-referenced from `docs/06` §1 and §12.
Nothing is collected during the beta, so nothing is lost by waiting. **The block states only what is certain:
a Driver held this trip, when they walked, and their reason.**

**Settled on the way:** the `rides/history` comment calling the penalty *"owed to Kavenue"* was the outlier —
`docs/06`, `lib/commission.ts`, `lib/earnings.ts` and `cancel-noshow.tsx` all say indemnity, and CLAUDE.md
makes `docs/` canonical. Comment corrected; the code under it was always right.

### 3. The two Earnings counting gaps

- **GAP A.** `cancelCompensation` is fee **plus** waiting, and the whole sum landed in "Cancelled on you", so
  the minutes a Driver actually sat there never reached the "Waiting time" line. Now carved out —
  ⚑ **out of the NETTED figure, not netted separately**: `driverNet` rounds to the cent, so two calls can
  land a cent from one. `t.waiting += netWaiting; t.cancelledOnYou += netComp - netWaiting` conserves the
  euros exactly, which is what the identity test pins. Verified live: 30 min / 19,80 € where it had read
  17 min, with "Cancelled on you" falling 144,20 → 135,62 and the headline unmoved.
- **GAP B.** A driver cancellation clears `driver_id`, so the mission left the Driver's own query while its
  penalty stayed in the headline — the day rows summed to **more** than the total, by exactly the penalty,
  with nothing explaining it. Worst case: a period holding only a cancellation showed a *negative* headline
  above *"Trips show up here the moment you complete them."* The trip list is now a discriminated
  `ListItem[]` merging trips and penalties. `loadPeriod` gained an opt-in `withRows` (it runs **three** times
  per render; only the first draws a list) which re-reads the missions through the service role, gated to the
  ids the Driver's own cancellation rows point at — the `rides/history` pattern.
  ⚑ **Dated by `created_at`**, the basis the headline filters on. Dating by the pickup would push the row
  outside the period whenever a Driver walks away from next month's trip and the day rows would stop adding
  up; the due time goes in the subtitle instead. New `driverCancelPickupAt()` rebuilds it from
  `created_at + hours_before_pickup`, which reconcile exactly because both came off the same clock.

### Two bugs found while verifying, neither in scope

- **`Today · Today`** in the Earnings day heading. `formatDayGroup` already returns `"Today"`, and the page
  prefixed it again. Latent since the feature shipped — no trip in the archive had ever fallen on the current
  day, and a penalty row can. My Rides has always rendered the bare label; Earnings now matches it.
- **`.local/probe/diff-sql-vs-lib.ts` was stale and loudly wrong** — it asserted `Number(sql.w_rate) !== 1`, a
  flat rate that stopped being flat in S62. It reported **480 mismatches in 673 checks** on a codebase where
  SQL and lib fully agree: every MIN, FEE, FROM and TO check passed. Now compares against
  `waitingRatePerMin(m.category)` and reads **673 checks · ALL AGREE · 0 mismatches**. A future session would
  have lost an hour to that.
- **Also cleaned:** three unreachable `cancelled_by === "driver"` branches (row archive note, both CSV notes).
  No RPC ever writes that value — `business_cancel_mission` is the only writer of `cancelled_by` and it
  hard-codes `'business'` — and their presence made the missing case look handled.

### Verified against the live DB, and how the gaps were covered

The test data contained none of the new states: **0** missions with `night_applied`, **0** `driver_cancel`
rows, and every `waiting_rate` either NULL or the legacy flat 1,00. Two throwaway fixtures
(`.local/probe/_s63-display-seed.mjs`, `_s63-driver-seed.mjs`) wrote a manifest first, created exactly the
missing states, and `--undo` restored the recorded prior values — **baseline 277 before and after, and the
`waiting_rate` distribution back to `{1: 33, null: 1}`**.
- Business: `incl. 19,55 € waiting · 17 min` on the row face, `Waiting · 17 min` in the invoice table (that
  row has no stamped rate — the fallback), the `Night rate` tag rendering at 10px/slate-600, the Driver
  cancelled block with its reason, and the blocking sentence *"Before posting, add a drop-off address, a stop
  chosen from the address suggestions, a pickup time, and a ceiling price."*
- Driver: `17 min at 0,66 €/min wait` in Earnings, `17 min at 0,75 €/min` Course-side in the money table
  against `17 min at 0,66 €/min` on the kept line — **both multiplying out**, and the table still totalling
  72,10 €.
- CSVs fetched and parsed: 23 and 22 columns, the three new ones appended **last**, and the Spend total row
  still landing at index 12 under "Cost to you (EUR)" — the hand-padded row that a mid-list insert would have
  silently broken.
- **NOT verified live:** the Driver's Pool-card night badge. There is no future pooled mission in the test
  data, so the Pool is empty. It is a verbatim copy of the proven `pbadge--run` markup.

**Green:** `tsc` clean · **420 → 443 tests** (new `tests/format.test.ts` 8, `tests/waypoints.test.ts` 9,
`driverCancelPickupAt` 5, plus the two rewritten earnings cases) · `next build` clean · `diff-sql-vs-lib`
673/673 · `write-test` 170/170 · `migrations-2026-08-10` 68 · `migrations-2026-08-11` 23 ·
`commission-parity` GREEN. `transport-vat-2026-08-17` was **not** run — it still asserts a 271 baseline and
the six S61DEMO trips make it 277, exactly as `NEXT_SESSION` warns.

**Answered in passing:** the founder asked why today's Schedule is full. It reads
**"Today · Jeudi 20 Août — 0 trips · 18 to close"**. There are no trips today; those 18 rows are past trips a
Driver never closed, lifted into today's band by § Q, each carrying its own date and *"Not closed"*. Every
mission in the database is now in the past (the newest is 18 August), so the whole unclosed backlog has piled
into one band. It is the § Q feature working, not a bug — and it is one more argument for the wipe-and-reseed
already queued after the curve.

### Follow-up the same session — three real defects the adversarial review found, all mine

A six-lens review of the shipped diff (17 candidates, **6 survived** a two-verifier adversarial pass; four of
the six were the same defect). All three were **confirmed by hand before touching anything** — the reviewers
were right on every count.

1. **A negative lead time, printed two different wrong ways.** `mission_cancellation.hours_before_pickup` is
   **signed** — `driver_cancel_mission` computes `(pickup_at - now())/3600` and accepts a cancel from
   `accepted`, `confirmed`, `en_route` and `arrived`, the last two of which routinely happen *after* the
   pickup. A Driver who sits out a 60-minute airport courtesy wait and gives up stamps a negative number.
   `project/BACKLOG.md:272` already recorded exactly this on no-show rows; both my helpers ignored it. The
   CSVs printed **"1 · -18 min before pickup"** — a negative duration in a hotel's spreadsheet — while the row
   clamped with `Math.max(0, …)` to **"0 min before pickup"**, asserting they walked at the pickup moment.
   Neither was true, and they disagreed on the same row in a file whose whole promise is to be what the screen
   shows. They also rounded on different scales: 2,5 h read "3 h" in the CSV and "2 h 30" on screen.
   **Fixed by deleting both copies** for one `formatLeadTime()` in `lib/format.ts` that names the side:
   *"18 min after pickup"*. Verified live on a seeded walk at −0,3 h — screen and CSV both read
   `18 min after pickup`. Six new tests.
2. **The amend refusal stranded legacy trips.** `if (unlocatedStops(waypoints).length > 0)` fired on the stops
   `RouteStops` re-posts from the mission row, not only on ones being added — so a mission posted before today
   with an unlocated stop could not be amended **at all**. A hotel moving a pickup time at T−2h would have been
   told to re-pick a stop they never touched, on the one screen where minutes matter. My own comment in
   `amend-form.tsx` asserted *"A stored stop is always located"*, which is false for the whole pre-2026-08-20
   archive — and there is one such row in the live data right now. Now only a **newly** loose stop is refused;
   an already-stored one is exempt and keeps its nudge. Comment corrected.
3. **The Schedule's pickup time shrank 16px → 13px.** Rewrapping the third date-cell variant in
   `dxh-when dx-trip__when` pulled the time under `.dx-trip__when > span { font-size: 13px }` — the § Q lifted-row
   styling — where a bare `.dx-trip__time` had inherited the summary's 16px. The primary scan column ended up
   smaller than the Guest and Driver cells, and `.dx-trip__time` was left **matching no element in the
   codebase**, which is what gave it away. My comment claimed the opposite of what shipped. Measured in the
   browser both ways before and after (16 → 13 → 16). Now `.dxh-when` only, the inner span keeps
   `.dx-trip__time`, and one paired rule (`.dxh-when > .dx-trip__time { font-size: inherit }`) restores it —
   `inherit` rather than a literal so it keeps tracking the base size.

**Method note.** The three defects have one shape in common: **each was a place where I wrote a comment
asserting the behaviour I intended rather than the behaviour I had.** The font one was screenshotted after the
change with nothing to compare against, and looked fine. Duplicating a formatter across screen and export is
the same failure at a different scale — the CSV files are deliberate copies of each other, which makes a
shared helper the right default there, not the exception.

**Green after the fixes:** `tsc` clean · **448 tests** · `next build` clean · fixtures undone, baseline 277.

### Closing conversations — two rulings, both parked, neither built ([[d74]] · [[d75]] · [[d76]] · [[d77]])

The session ended on the founder's question about **why today's Schedule was full**. Measured rather than
guessed: **0 trips dated today, 0 trips in the future at all**, newest pickup anywhere 18 August — so all 18
rows in the band are § Q lifts (9 `on_board`, 9 `confirmed`, 14 of them over a month old, all one Business).
⚑ The first count said 13 and did not reconcile with the screen's "18 to close"; `needsClosing` also accepts
`on_board` and requires `close_answer` null. Re-measured against the real predicate before answering.

**The founder ruled the lift stays** — *"it would push business to handle it and reach the driver"* — and they
are right that the discomfort is the point. What the same measurement exposed is that **there is no exit**:
`components/trip-row.tsx:215-245` switches off amend, release and cancel on an unclosed row, leaving only
*"call them to confirm it happened"*, so a Dispatcher who rings the Driver and is told "yes, it ran" cannot
record it. § Q's own Driver-side comment already names the failure mode this produces. Written up as BACKLOG
**§ Q6**, three fixes smallest-first; the first settles money and therefore pairs with **U.3**.

**Then: "can live location hard-close a trip?"** The mechanism is right and § Q was built for exactly that
swap — but as stated it collides with the founder's **own** rule at the head of § U: *location may suggest,
never decide*, because closing settles the fare **and** any waiting fee. Written up as **§ U.4** with three
corrections: **arrive-then-leave, not dwell** (a Driver inside the geofence may still have the Guest aboard);
**location drives a one-tap prompt, not the close** — which keeps the Driver deciding and takes most of the
benefit on its own; and auto-close **only** where `on_board` was already tapped, arrival and departure were
both seen, and no waiting or no-show money is open.
⚑ **§ Q already held the sharper argument, and it is the founder's:** *"the Driver returns to Nice airport at
11am for his next job and the app closes and pays out yesterday's trip."* It defeats naive dwell detection
outright, which is why step 3 needs three signals agreeing rather than a phone near an address. Cross-linked.

**Method note that generalises.** Both answers came from re-measuring rather than reasoning: the "18 vs 13"
gap was a wrong predicate on my side, and it would have shipped as a confident wrong number in a message. The
same instinct caught the review's three defects — every one was verified by hand before a line was changed,
and every one held.

**Session close.** `main` at `6b35d21`, three commits: `d6f0932` the loose ends · `7bcbf49` the three defects
the review found in them · `6b35d21` the backlog write-ups. All CI-green, all deployed, working tree clean,
live DB baseline 277 with every fixture reverted. **No migration was written this session** — nothing here
needed one.

---

## Session 64 — 2026-08-22 · PRICING STEP 5: THE §6 CURVE (branch `main`)

**The last thing that changes what a newly posted trip looks like.** `pdp_start` / `pdp_step` /
`pdp_interval` — a fixed-size, fixed-interval ladder climbing from 50 % of the Ceiling since D21 — is
replaced by the curve `docs/06` §6 designed. Money-critical, so it shipped with the money tests
rewritten, both migration probes updated, `write-test` re-run, and a new live probe.

### What the curve is

`lib/pdp.ts`, rewritten. Given a mission and an instant it returns one number, for ever:

| | old (D21) | §6 |
|---|---|---|
| Opens at | 50 % of the Ceiling (70 % SPEED WIN) | **the rate-card floor** |
| Steps | fixed size, fixed interval | equal movement each time the remaining time **halves** |
| Anchored to | when it was posted | **the pickup** |
| Reaches the Ceiling | whenever the steps add up | exactly at **T−5h** |
| Predictability | a ladder anyone can compute | **jittered, seeded from the mission id** |

The shape is one line: the climb is **linear in `log(time remaining)`**, which *is* "equal movement every
time the remaining time halves". Progress runs from the trip's remaining time when it entered the Pool
down to the top lead, and the staircase is that continuous curve sampled at `n + 1` step positions —
evenly spaced (= log-spaced in time), each interior one slid by ±0.45 of a step by a `mulberry32` stream
seeded from `xmur3(mission.id)`. **Uneven step sizes fall out of the uneven step times for free — one
source of randomness, not two**, exactly as §6 asks. `n = clamp(round(gap / 2), 8, 60)`. The endpoints are
never jittered, so every trip opens exactly on its floor and lands exactly on its Ceiling.

**Both PRNGs are written out in the file rather than imported.** The curve has to be replayable years from
now to settle a dispute; the generator must be readable next to the thing it seeds, not versioned somewhere
else.

### The one judgement call, and the founder ruled on it

§6 rule 2 says the Ceiling is reached at T−5h. Rule 3 says a trip posted *inside* 5 hours climbs to the
midpoint instead. **Between 5h and 10h of lead the two collide** — read rule 2 literally and a trip posted
6 h out is at its Ceiling almost immediately; smooth it (`top = T − min(5h, lead/2)`) and that same trip is
only ~26 % up its gap at T−5h, ≈35 € all-in for a job five hours away.

**Founder, 2026-08-22: rule 2 wins wherever they overlap** ([[d78]]). An urgent trip should reach its
Ceiling fast and fill. `topLeadFor()` is therefore `lead > 5h ? 5h : lead/2` — nothing clever.

### Where the floor is stored — and the defect that decided it

`mission.ceiling` is the Course. The floor has to be the Course too, so `createMission` converts
`mission_price().floor_price` (which is **all-in**, like the field the Dispatcher types) with the *same*
snapshot rates as the Ceiling. Mixing the two spaces would have opened every auction 15 % high.

It goes in **`pdp_start`, which keeps its exact meaning** — the price the auction opens at. That was chosen
over a new column for one reason: **the SQL fee-basis band reads `pdp_start` and now works unchanged and
better.** `least(coalesce(pdp_start, ceiling * 0.5), ceiling)` used to describe a flat 50 %; it now
describes a real floor, which is the honest bottom of the legitimate range. The `coalesce` is what keeps
every pre-curve row reading exactly as it always did.

**⚑ The map found the defect that would have broken it.** The three re-pool RPCs — `driver_cancel_mission`,
`reclaim_mission`, `respond_to_release` — **overwrite `pdp_start` with `round(ceiling * 0.7)` or
`round(ceiling * 0.5)`**. Under the old curve that WAS the opening price and rewriting it was the whole
mechanism. Under the §6 curve it erases the floor the first time a Driver walks, permanently, since nothing
recomputes it. `docs/migrations/2026-08-22_pdp_curve.sql` re-creates the three functions **verbatim** from
their live definitions with only those three assignments removed — diffed line by line, 16/10/10 changed
lines, all of them the pdp block and one comment.

**SPEED WIN's hotter opening is derived, never stored.** `openingPrice()` returns
`speed_win ? max(floor, ceiling × 0.70) : floor`. That is precisely what lets a re-pool turn SPEED WIN on
(under 24h) and off (24h+) without ever losing the floor underneath — the RPCs now flip one boolean.
It also fixes a real edge: a Business may set a Ceiling close enough to the floor that 70 % of it is
*below* the floor.

**`pdp_step` / `pdp_interval` are dead.** The step count falls out of the gap and the step times out of the
mission id. Written `null` everywhere rather than left stale, so nothing can read a ladder that no longer
exists. The columns stay for the archive.

### The compile error that was the point

`PdpInputs` gained `id` and `pickup_at` as **required** fields, and `tsc` immediately failed on
`app/(app)/rides/actions.ts:15` and `app/(dispatch)/dispatch/actions.ts:12` — both `FARE_COLS` constants
selected neither. Those five reads produce the `p_fare_snapshot` argument to `driver_cancel_mission`,
`mark_no_show` and `business_cancel_mission`. **This is the exact bug class `lib/pdp.ts` already documents
having shipped once** (a narrow select silently fell back to the live fare and recorded a €100 penalty on a
€70 trip). Making the anchor and the seed non-optional turned it into a compile error instead of a money bug.
Both constants are now `id, …, ceiling, pdp_start, speed_win, pickup_at, created_at, pooled_at, accepted_at`.

`pickup_at` is safe as an anchor because **nothing moves it after posting**: the info edit whitelists it out
by name, `respond_to_amendment` rewrites the pickup *address* but not the time, and no SQL path assigns it.

### Tests — 448 → 455

`tests/pdp.test.ts` rewritten against the RULES, not a schedule. Pinning the euro value of step 7 would be
pinning the jitter. What it pins instead: opens on the floor at every lead time · lands on the Ceiling
exactly at T−5h and sits there through pickup and past it · climbs to the midpoint when posted inside 5h ·
**moves by the same amount on every halving** (within a step and a half — the staircase both lags the
continuous curve and carries the jitter) · monotone across 20 000 samples · step count 8/21/61 for a 6 €,
40 € and 400 € gap · a month-out and a fortnight-out trip priced identically at every instant (rule 4) ·
same id → same curve, different id → different schedule, both still hitting both endpoints · SPEED WIN
opens at 70 % but never below the floor · a null `pdp_start` falls back to half the Ceiling, the same
number the SQL band coalesces to · an amendment-collapsed curve is flat · re-pool restarts from `pooled_at`.

The other 25 failures were fixtures encoding the old ladder. `standardCurve()` is now a §6 curve
(100 € Ceiling / 60 € floor) and `completed()` **accepts at the instant it was posted**, so its settled fare
is the opening price, exactly 60 — deliberately, so that Spend, Earnings and History tests stay free of the
curve's jitter. Only `minutesToAccept` still passes an explicit later accept, because it is the one test
actually about fill time.

### Probes

- `.local/probe/write-test.ts` — **170 checks, ALL AGREE.** Its `FARE_COLS` now mirrors the app's.
- `.local/probe/migrations-2026-08-10.ts` — **55 passed · 3 failed**, and the three are one per re-pool RPC,
  all the new "pdp_start UNTOUCHED" assertion. `.local/probe/migrations-2026-08-11.ts` — **22 · 1**, same.
  **These four go green when the migration is applied**; they are red on purpose until then.
- `.local/probe/curve-live.ts` — NEW. Creates one mission on the live DB the way `createMission` does,
  reads it back through the app's own `FARE_COLS`, and asserts the endpoints. **8 checks, ALL AGREE**:
  opens on 26,30 € all-in (the exact quoted floor), the Business sees the floor it was quoted, the Ceiling
  is reached at T−5h to the second, monotone, frozen at accept. Cleans up after itself.
- `.local/seed/s64-curve.ts` — NEW, with `--undo`. Three POOLED trips at 14 days / 2 days / 6 hours of
  lead, priced through the real RPC. The Driver's Pool rendered **27,74 €** for the 31 km Business trip —
  the driver-net of its floor, matching the seeder to the cent. No console errors.

### Also changed

- `mission-form.tsx` carried a **second copy** of the opening-price formula for the preview card. It now
  mirrors `openingPrice()` exactly — three places compute it, all in Course space, converted once.
- The SPEED WIN checkbox said *"start high (70% of ceiling) and climb **fast**"*. It no longer climbs
  faster — §6 makes it "the same curve with a higher starting point, nothing more", and every trip reaches
  the Ceiling at T−5h whether it is on or off. Now: *"open at 70% of your Ceiling instead of the floor, so
  a Driver takes it sooner."*
- `.local/seed/seed-fleet.mjs` — its private copy of `settledFare` was the old linear climb; ported to the
  curve. **It still hand-sets ceilings and writes no commission snapshot** — flagged in place, and that is
  the re-seed job, which the founder sequenced after this one.
- `.local/seed/s61-priced.ts` and `app/api/seed/route.ts` — opening price and dead columns.

### Not done, on purpose

- **The two riders** (§ R growth limit, BACKLOG § V lower-class pricing) and **step 6, the §7 hold**.
- **The Business-facing copy pass.** §6 prescribes a publishable sentence — *"the price rises in steps
  until 5 hours before pickup, when it reaches the maximum you set"* — and the form still says only
  "climbs up to your Ceiling". True, but less than it could say. UI copy needs a preview first (D25).
- **No accepted-fare column.** `settledFare` still recomputes at `accepted_at`, so shipping the curve
  reprices historical accepted trips. Founder, 2026-08-22: *"no need to update prices on existing trips"* —
  it is all test data and the wipe follows. `docs/06` §9 still asks for the frozen fare to be stored, and
  §7's hold will need it. Parked, not solved.
- `.earn-probe.mjs` at the repo root is a tracked scratch probe carrying its own copy of the old linear
  fare. Left alone; it is stale, not load-bearing.

### The order this has to land in

**Migration first, then the code.** The app is correct before and after, but a re-pool run against the old
RPCs writes `ceiling × 0.5` into what is now the floor column. Nothing is pushed until the migration is in.

---

## Session 64, part B — 2026-08-22 · the frozen fare, and the re-pool floor ([[d80]])

**The founder read the re-pool behaviour off the curve and found the hole in it the same day.** Not a
regression — the D21 curve did the same thing — but the §6 curve made it visible, because the ≥24h branch
now opens at a real floor rather than at 50 % of the Ceiling.

**The scenario, on real numbers** (Business 31 km · floor 36,25 → Ceiling 110,00 all-in): a Driver accepts
at **50,68** and walks at **T−30h**. The trip re-pooled at **36,25**. Under 24h it never bit — SPEED WIN
comes on and 70 % of the Ceiling lands within 2 € of where the price already was (79,18 → 77,00).

Ruling and reasoning are in [[d80]]. Built as **a raised floor, not a special case**:

    pdp_start = greatest(pdp_start, accepted_fare)   -- then accepted_fare = null

so `openingPrice()` needs no branch and the SQL fee-basis band's bottom rises with it. `greatest` skips
NULLs, so a trip nobody ever took keeps its original floor. Repeated re-pools can only raise it.

### That forced §9's stored fare, which had never been built

`settledFare` re-derived the curve at `accepted_at` on every read. `docs/06` §9 has asked for the frozen
figure to be *stored* since it was written. `docs/migrations/2026-08-22_accepted_fare.sql`:

- **`mission.accepted_fare numeric(10,2)`**, nullable, Course space. **Nothing backfilled** (founder:
  *"no need to update prices on existing trips"*). NULL → every reader recomputes, exactly as before.
- **`accept_mission(p_mission_id uuid, p_fare numeric default null)`.** Postgres cannot evaluate the curve,
  so the number is computed in the **accept server action** with `lib/pdp.ts`. That is safe because the
  Driver's browser sends only a mission id — there is nothing to forge — and it is clamped into
  `[floor, ceiling]` in SQL regardless, using the fee-basis band's own expression. **The one-argument
  function is dropped first**, or `accept_mission(uuid)` becomes an ambiguous call. The DEFAULT is what made
  the migration safe to apply *before* the code deployed: the old call still worked and stored NULL.
- **`respond_to_amendment` sets `accepted_fare = new_fare`** beside the collapse it already does. Without
  that line an amended trip keeps billing the PRE-amendment number on the invoice, the cancellation basis
  and Earnings.
- The three re-pool RPCs raise the floor and clear the fare. `business_cancel_mission` / `mark_no_show`
  deliberately KEEP it — the trip was cancelled, not re-pooled, and that number is their fee's basis.

456 lines, of which **28 actually differ** and ~9 of those are a comment: Postgres cannot patch a function
body, so five whole functions are reproduced. All five were extracted from their live definitions by script
and diffed back, not retyped.

### The type system caught the read paths again

Adding `accepted_fare` to `settledFare`'s parameter type produced nine compile errors across `rides/actions`,
`dispatch/actions`, both amend files and two pages — every one a select list or a row shape that would have
silently read `undefined`. Both `FARE_COLS` gained the column.

### Verification

- **`.local/probe/accepted-fare.ts` — NEW, 18 checks, ALL AGREE.** Drives the whole cycle through the real
  RPCs as the real Driver: post at T−48h → sit until T−30h so it has really climbed → accept → the fare
  freezes on the row → `settledFare` reads the column not the curve → the Driver walks → **the floor rises
  to 44,07 Course (50,68 all-in), the frozen fare is cleared, and the trip re-opens at 50,68, not 36,25** →
  it still reaches the Ceiling by T−5h → a second re-pool never lowers it → and an accept with **no** fare
  argument still works and stores NULL, which is what made the migration deployable ahead of the code.
- `write-test` **170 · ALL AGREE** · `curve-live` **8 · ALL AGREE** · `migrations-2026-08-10` **58 · 0** ·
  `migrations-2026-08-11` **23 · 0**. All four green with both migrations applied.
- Suite **460**.

### Still owed after this

`docs/06` §7's hold now has the column it needs to freeze a price against. The Business-facing copy sentence
and the two riders (§ R, BACKLOG § V) are untouched, and the founder has asked to be reminded of both later.

---

## Session 64, part C — 2026-08-22 · the adversarial review, and the founder's better rule ([[d81]])

**A 47-agent adversarial review of the curve diff** (five lenses, each finding refuted by three independent
skeptics on different angles, majority-survives). **7 confirmed, 7 refuted.** The confirmed set collapsed to
four distinct defects — two were duplicates found by different lenses. All four reproduced by hand before
anything was changed; the refuted seven included two I would otherwise have chased (the "settledFare
re-prices 171 live missions" claim, and the 5h discontinuity, which is [[d78]] on purpose).

**1 · The floor could be silently replaced by a wrong number.** `createMission` wrote
`pdp_start = course * 0.5` whenever `quote` was null — and `quote` is null whenever routing fails, not only
when there is no drop-off. On a **re-saved draft that already carried a real rate-card floor**, one bad
minute from Mapbox overwrote it permanently, and the §5 floor guard was skipped in the same breath
(`!asDraft && quote &&`). Fixed with the file's own conditional-spread idiom, the same way `eta` already
works: absent, not overwritten. **Fixed in code.**

**2 · The fee-basis band lost its teeth on SPEED WIN trips.** Since the curve derives SPEED WIN's 70 %
opening on read rather than storing it, the SQL band went on clamping to the *stored* floor. On a SPEED WIN
trip with Ceiling 100 / floor 30, the curve can never produce a fare below 70 — yet a forged basis of 30
passed. At a 75 % cancellation that is **22,50 € charged instead of 60,00 €**, where the pre-curve code
would have caught it at 52,50. Fixed by `mission_opening_price(mission)`, an `immutable` SQL mirror of
`openingPrice()`, called by the band — and **wired into `diff-sql-vs-lib`** (now **693 checks**) so the two
halves cannot drift silently again. `docs/migrations/2026-08-22_opening_price_band.sql`, **applied**.

**3 · The amendment defect, and the rule the founder gave instead.** See [[d81]]. The review found that an
amended trip which later re-pools is pinned at one flat price for ever, because `respond_to_amendment`
collapses the curve to zero width. Offering the founder the choice produced something better than either
option: **a re-pool should not restart the climb at all.** `lib/pdp.ts` stopped reading `pooled_at`;
`respond_to_amendment` stops overwriting the Ceiling and the floor.
`docs/migrations/2026-08-22_amendment_keeps_ceiling.sql` — 17 changed lines, 5 of them real.

**4 · Cosmetic, not fixed.** The starting price previewed in the form can land a cent from the stored one on
~1 % of distances — the browser computes the rate card in floats, Postgres in `numeric`. The Ceiling has
carried the same property since S61 and already handles it (`snapped`). Noted, not chased.

**Test surgery.** The re-pool tests were the ones asserting the OLD behaviour, so they were rewritten around
the new rule: a re-pooled trip is worth the same as one nobody ever took; it goes back out at the deadline
price, not the price it was taken at; SPEED WIN still lifts the opening without restarting anything. Suite
**462**.

---

## Session 64, part D — 2026-08-22 · the re-pool stops touching the price ([[d82]], [[d83]])

**Two removals, from two directions, landing on one rule.** `docs/migrations/2026-08-22e_repool_touches_nothing.sql`
— the three re-pool RPCs each lose 15 lines and gain 4, because with no SPEED WIN flip the
`if v_hours < 24` split has nothing to branch on and collapses. Full reasoning in [[d82]].

1. **The floor raise, found by a probe.** `.local/probe/accepted-fare.ts` flagged that a re-pooled trip read
   **52,70 €** where an untouched one read **43,37 €** at the same instant — [[d80]]'s mechanism fighting
   [[d81]]'s rule. [[d80]]'s intent survives without it: the curve only rises toward the pickup, so a
   re-pooled trip is already worth at least what the last Driver agreed to.
2. **The SPEED WIN flip, found by the founder asking whether 24h was the right threshold.** It isn't, and no
   threshold is — SPEED WIN raises where the curve *opens*, so its lift shrinks from +33 % at T−48h to
   **+0 % at T−5h**. It did least exactly when it was supposed to help. Measured, tabulated in [[d82]].

⚑ **A naming trap, hit while writing that migration.** Five migrations now share `2026-08-22`, and their
filenames do **not** sort into apply order. A script that resolved "which file holds the live definition" by
sorting alphabetically pointed at the wrong version of `driver_cancel_mission` — it is live in
`_opening_price_band`, not `_pdp_curve`. Caught before it did damage; the fifth file is named **`2026-08-22e_`**
so it sorts last. **The date-prefix convention needs a real ordinal when a day carries more than one migration.**

**Copy that this made false, and is now fixed:** the reclaim button said *"Reclaim and re-pool as SPEED WIN"*
(now *"Take it back and re-pool"*, with the block above it explaining the real reason another Driver takes it —
this close to the pickup the curve has already carried the fare near the maximum); the release dialog said
*"(as a SPEED WIN if it's within 24h of pickup)"*; and `docs/06` §6's "on re-pool it is automatic" bullet is
struck through with the measurements.

**[[d83]] — SPEED WIN as an earned badge.** The founder's idea, argued against three ways and right on all
three: at scale FOMO clears trips early, so crossing 70 % of the Ceiling is rare and means something; §6
already says SPEED WIN is only a higher starting point on the same curve, so the two cases are identical to
a Driver; and the Driver needs the cue, not the number. **Designed, not built** — it is UI, so it gets a
preview first (D25), and it needs a switch because in beta's thin Pool it would be on everything.

Suite **462**. All six probes green: `diff-sql-vs-lib` 693 · `write-test` 170 · `curve-live` 8 ·
`accepted-fare` 20 · `migrations-2026-08-10` 61/0 · `migrations-2026-08-11` 23/0.

---

## Session 64 — CLOSED (2026-08-22). Shipped, deployed, and the queue the founder set

**Pricing step 5 is live.** The §6 curve, plus four corrections that came out of the founder reading the
design back and an adversarial review of the diff. Parts A–D above hold the detail.

| | |
|---|---|
| Migrations | **5, all applied** — `_pdp_curve` · `_accepted_fare` · `_opening_price_band` · `_amendment_keeps_ceiling` · `22e_repool_touches_nothing` |
| Decisions | **[[d78]]–[[d84]]** |
| Suite | **462** (was 448) |
| Probes | `diff-sql-vs-lib` 693 · `write-test` 170 · `curve-live` 8 · `accepted-fare` 20 · `migrations-08-10` 61/0 · `migrations-08-11` 23/0 — **all green** |
| Deployed | merged to `main`, CI green, live |

### Two process things worth carrying forward

**1 · The push route was misread, and it cost the founder a click.** `main` refuses commits CI has not
already passed — but required checks are evaluated **per commit SHA**, so the route that has always worked
here is: push a branch → wait ~1 min for CI → push the *same* SHAs to `main`, which then accepts them. S63
did exactly this (`s63-backlog` 08-20, `s63-close` 08-21). S64 pushed to `main` first, got rejected,
concluded "a PR is the only route", and opened **PR #1** — the first this repo ever had. It worked, but it
was ceremony, and it made the founder click a Merge button for nothing. Corrected in the handoff, and then
proved by pushing the correction itself straight to `main` after a branch CI run.

**2 · Five migrations share one date and their filenames do NOT sort into apply order.** A script resolving
"which file holds the live definition" alphabetically pointed at the wrong `driver_cancel_mission`. Caught
before it did damage; the fifth file is named `2026-08-22e_` so it sorts last. **The date-prefix convention
needs a real ordinal whenever a day carries more than one migration.**

### What S64 did NOT do, and why

- **§ R and § V** — the two riders that were meant to ride along with the curve. The session went long on the
  founder's corrections instead, which was the right trade. Both are fully mapped in the handoff with
  file:line, so the next session does not re-derive them.
  ⚑ **S64 first claimed it had unblocked § R's hardest part. IT HAD NOT** — caught by a verification pass
  over the handoff itself, before the session closed. `lib/history-filter.ts:458-461` sorts on
  `businessCost(fare + waiting_fee)`, the Business's ALL-IN figure, and `:452-457` records that keying on the
  bare Course was already a shipped defect. So `accepted_fare` is not the sort key, and sorting by fare is
  still the blocker. Worse, **no seeder writes `accepted_fare`** (`accept_mission` is its only writer), so the
  owed re-seed would reproduce a 100%-NULL archive — 0 of 280 missions carry one today. Both corrected in the
  handoff.
  ⚑ **§ V is already biting, not pending.** The same verification pass found the live `Classe V` is
  **already** stored `category='luxury'`, so that Driver is stranded off Business-van work right now —
  `441b50f` and this log's own S60 entry describe it as still `business` because they predate the row move.
  And `.local/seed/seed-fleet.mjs:49` still seeds that Driver as `business`, so the owed re-seed would
  silently undo the reclassification and hide the bug.
- **The Business-facing price sentence** — mocked up four ways, all rejected ([[d84]]). The fix is an
  enrolment tutorial after V1 (BACKLOG **§ AC**), not microcopy.
- **The repo rename** — queued for S65 as item 1. It is a trademark question, not cosmetics.

### The founder's queue for S65, set explicitly
**1.** rename the GitHub repo · **2.** § R growth limit · **3.** § V lower-class opt-in.

### ⚑ Post-close: the handoff was verified, and it was wrong in five ways

Written, then checked by three readers against the live repo and DB before the session closed. **Twelve
errors, five of them load-bearing** — every one confirmed by hand before correcting:

1. **`accepted_fare` does not make the fare sortable in SQL.** The sort key is `businessCost(fare + waiting)`,
   and keying on the bare Course is a defect this codebase already shipped once and fixed.
2. **No seeder writes `accepted_fare`** — the re-seed would produce a 100%-NULL archive. 0 of 280 today.
3. **"The Pool throws away 89 % of what it fetches" was a whole-TABLE figure**, not a Pool one. The Pool is
   bounded to future pooled trips: live, **2 rows, 0 with a null pickup**. A bounding-box prefilter is not
   the cheap win. The Pool's real problem is that RLS makes it marketplace-wide.
4. **The § V SQL guard moved** — S64's own `2026-08-22_accepted_fare.sql:100` superseded
   `2026-08-11_accept_mission_eligibility.sql`. Editing the old file would have changed nothing in the DB, and
   the next session would have wondered why.
5. **The V-Class row is already `luxury`**, so § V is overdue rather than anticipatory — and the re-seed would
   silently revert it.

Also corrected: 74 columns not 76 · History does have an upper date bound, it is the lower one that is missing ·
the truly unbounded History fan-out is the `mission_cancellation … .in(<every archived id>)` at `:118-126`,
not the driver join (which is bounded by fleet size) · the superset sentence is at `:60-65` · one S64CURVE
demo trip has aged into the past and the Pool hides it · the `s63-*` branches cited as push-route evidence
were deleted on merge.

**The lesson worth keeping: a handoff is a claim about the repo, and claims decay.** These were written the
same day, by the session that did the work, and a fifth of them were already false — several *because of that
same session's own migrations*. Verify a handoff against the code before closing, not just proofread it.

## Session 66 — 2026-08-24 · the reclaim was dead code; the Business can take a trip back now ([[d86]])

**Branch:** `main` (via `s66-reclaim`, per the CI ruleset). **Migration written, not yet applied.**

### The gate ran first, and it earned its keep

`handoff-check.ts` → 16 ok, **1 STALE** (an S64CURVE demo trip aged past its pickup — cosmetic, the seed
data, not a code claim). `npx tsc --noEmit` clean; **487 tests passing** (the handoff said 462 — it had
grown, not drifted). All six DB probes `ALL AGREE`: `diff-sql-vs-lib` 693, `write-test` 170, `curve-live` 8,
`accepted-fare` 20, `migrations-2026-08-10` 61/0, `migrations-2026-08-11` 23/0.

### Step 1 — the Lock-in brainstorm, before any code (the founder asked twice)

The question carried over from S65: *"Is 1 hour too late? Would the business panic because 1 hour is really
tight?"* Answered by measuring rather than reasoning, and the measurement changed the question.

**`accepted` has never happened.** Three independent probes on the live DB:

| probe | result |
|---|---|
| `mission.status` over 280 rows | `accepted` = **0** |
| `status_event` full history, 715 rows | `accepted` = **0** |
| `mission_cancellation` | **0 rows** — `reclaim_mission` had never run |

Both `reclaim_mission` (`2026-08-22e_repool_touches_nothing.sql:145`) and the button
(`components/trip-row.tsx:255`) demanded it. So the reclaim was not *late*, it was **unreachable**, and the
card had never rendered for anyone since D45 shipped it. 499 tests and three months of use did not catch it,
because a gate nothing satisfies is indistinguishable from a feature nobody uses.

**Second measurement, which decided the window.** Lead time posted → pickup, n=279:

    p10 2.6h · p25 6.6h · median 58.2h · p75 149.8h · p90 190.8h
    posted <3h ahead: 16%   ·   <6h ahead: 24%

Trips posted inside 3h auto-confirm on accept (`kavenue_schema.sql:241`) and never enter the Lock-in flow, so
widening the reclaim window cannot hurt them. The trade only touches the 84% with real lead time. The founder
chose **T−2h** from T−2h30 / T−2h / T−1h30.

**⚑ Claude was wrong once and the founder corrected it.** A draft of the card claimed a late re-pool mostly
fails because most Drivers are "too far away or already booked". The founder works this market: the Riviera
is densely covered by Drivers, so that is a false premise. The T−2h argument stands on travel time (45–75 min
implied by the default 50 km radius) and the ±90min slot band — **never on an empty Pool**, and the copy must
not imply it. Recorded in [[d86]] § 3 so it is not reintroduced.

### Step 2 — built it, mockup first (D25)

Three preview rounds before a line of code. The founder cut two things from the copy, and both cuts were
right for the same reason — the card was stating things as if they were procedure:

- *"You can take the trip back from 10:15"* → **removed**. An inexperienced Dispatcher reads that as a
  process to respect. The time now lives on the greyed button (`Take it back · from 14:25`), where it reads
  as the control's own state.
- *"Take it back and it returns to the Pool. No penalty to you."* → it implied the re-pool happens without
  checking. Replaced with **"Call {first name} first — they may be driving. If you can't reach them, take the
  trip back. No penalty to you."**

**Shipped:**

| file | change |
|---|---|
| `docs/migrations/2026-08-24_reclaim_at_t2h.sql` | the guard → `confirmed AND checked_in_at IS NULL AND now() >= pickup − 2h`; `kind` `t60_reclaim` → `reclaim` |
| `lib/dispatch-status.ts` | `RECLAIM_OPENS_MS`, `reclaimOpen()`, `reclaimUnlocksAt()` |
| `components/dispatch-cancel.tsx` | `ReclaimCard` rewritten — three states, tone follows the row |
| `components/trip-row.tsx` | `reclaimEligible` → `reclaimVisible` / `canReclaim` / `reclaimUrgent`; tone hint suppressed when the card shows |
| `tests/reclaim-window.test.ts` | 12 tests, incl. one that fails if `accepted` ever returns as the condition |

`reclaimOpen` is defined as a **narrowing of `checkInOpen`**, not its own window — so the card can never be
live-but-hidden, and one predicate cannot drift from the other. A test pins that relation directly.

**The SQL body was copied from `2026-08-22e_repool_touches_nothing.sql`**, which is the live definition: it is
the fifth and last of the five 2026-08-22 migrations and **records that order in its own header**. Only the
guard, the `kind` and the `reason` differ, so [[d81]]/[[d82]] survive intact.

**`t60_reclaim` → `reclaim`.** The name would have lied about when it fires. `mission_cancellation` holds 0
rows, so the correction was free — and this was the only moment it ever would be.

**Nothing to wire for the event log.** The re-pool's `update mission set status = 'pooled'` already fires the
§ AG trigger, which maps it to `repooled` with `source='db_trigger'`. A reclaim lands on the guaranteed side
of the log without an app-side call.

### Verified in the browser, not just in tests

Seeded three trips at T−2.5h / T−1.5h / T−0.5h (`reference = 'S66RECLAIM'`, `confirmed`, never checked in)
against the real DB and read all three states on the running app: locked with `Take it back · from 14:25`,
amber and live, then red inside the hour with **Call** promoted to the primary button. Console clean. Seed
removed afterwards; mission table back to its 280-row baseline, verified.

**Found while looking at it:** the card duplicated the tone's own hint — two sentences saying "the Driver
hasn't checked in" on one panel. The card supersedes it, so `t.hint` is now suppressed while the card shows.

`npx tsc --noEmit` clean · **499 tests passing** · `npm run build` clean.

### Two things worth carrying forward

- **§ AH (new).** The founder's question, raised mid-build: a Driver who wants out for free can simply not
  check in and let the Business reclaim. Cancelling properly costs up to 100% of the fare; silence costs one
  `reliability_marks` point. Four options written up, **none chosen** — the founder leans on reputation doing
  the work once reviews ship, and the honest counter is that a missed check-in is not proof of intent.
- **⚑ `npm run build` fails while `npm run dev` is running.** Both write `.next`, so the build reads a
  half-written manifest and dies with `PageNotFoundError: Cannot find module for page: /_not-found`. Stop the
  dev server and `rm -rf .next` first. It cost a confused minute; CI is unaffected (clean checkout).

## Session 66, part B — 2026-08-24 · the event log's app half, wired ([[d87]])

**Migration written, data-only, not yet applied:** `docs/migrations/2026-08-24_event_registry_truth.sql`.

### The measurement, and a trap inside the measurement

⚑ **The first probe of the event registry was WRONG, and wrong in the way that reads as a finding.** A plain
`.select("event_type")` on `mission_event` is **capped at 1000 rows by PostgREST**, silently. The truncated
read showed `en_route` and four other types with **zero** rows — i.e. "the trigger isn't firing" — when
`en_route` actually has 172. Re-done with `count:'exact', head:true` per type.

**Add it to the reflexes:** any count over a table with more than 1000 rows must be a `head:true` count or a
paginated read. A silent cap does not look like an error, it looks like an answer.

The true picture (n=1848 rows, 23 registered types):

| | |
|---|---|
| live writers (`db_trigger`) | created · pooled · repooled · confirmed · cancelled · no_show, plus the execution steps |
| rows but **no live writer** | checked_in 184 · close_answered 7 · amendment_proposed 3 · info_changed 2 — all `mission_row_backfill` |
| **no rows at all** | accept_rejected · contact_revealed · mission_viewed · pool_impression · release_proposed · release_answered · amendment_answered |

So the handoff's "12 write nothing" was right in substance: **eleven types had no live writer**, and
`log_mission_event()` was called from nowhere in the codebase.

### The decision that shaped the build — see [[d87]]

The founder cut `pool_impression` and then `mission_viewed`. Claude argued for impressions once (they are the
only way to tell "expired unseen" from "expired and refused" across 49 expired trips), and conceded: the
valuable half is a **query over stored data** — which Drivers matched a trip's category, zone and radius at
the time — not a ~300k-rows/day log. The founder's clarifying question is what settled `mission_viewed`: is
that page a Pool trip or one of their own? It is the Pool (`missions/[id]` is the pre-accept page), so it is
browsing one click deeper.

### Shipped

| file | change |
|---|---|
| `lib/mission-events-server.ts` | **new** — `recordMissionEvent()`. `source='app'`, never throws, optional `dedupeKey` |
| `lib/mission-events.ts` | records why two types stay unwired, so nobody "fixes" them |
| `lib/database.types.ts` | `mission_event` + `mission_event_type` added (hand-written, D3) |
| `app/(app)/rides/actions.ts` | checked_in · close_answered · amendment_answered · release_answered |
| `app/(app)/missions/[id]/actions.ts` | accept_rejected |
| `app/(app)/missions/[id]/page.tsx` | contact_revealed |
| `app/(dispatch)/dispatch/actions.ts` | release_proposed |
| `app/(dispatch)/dispatch/[id]/amend/actions.ts` | amendment_proposed |
| `app/(dispatch)/dispatch/[id]/edit/actions.ts` | info_changed |
| `tests/event-wiring.test.ts` | **17 tests** that count call sites |

⚑ **The tests read the source on purpose.** The failure being guarded against is an **absent call**, not a
broken one — nothing throws, nothing warns, the rows simply never appear. Only counting call sites catches
that. `DELIBERATELY_UNWIRED` distinguishes "the founder said no" from "someone forgot".

⚑ **`amendment_proposed` is written BEFORE the `redirect()`.** `redirect()` throws by design in Next, so
anything after it is dead code — an easy way to ship a call that never runs.

### Verified live, in the browser, against the real DB

Signed in as the demo Driver via `/api/dev-login?as=driver` and drove the real UI:

| event | proof |
|---|---|
| `checked_in` | tapped Check in → `source=app`, `actor_kind=driver`, `{"hours_before_pickup":2.45}` |
| `contact_revealed` | added a shared Guest phone, loaded the trip **three times** → **one** row, `{"phones":1}` |
| `accept_rejected` | ⚑ raced a real accept: loaded a pooled trip, took it with another Driver behind the page's back, then tapped Accept → row landed, `{"reason":"Mission no longer available"}` |

⚑ **The `accept_rejected` row is attributed to `c3758a83` — the Driver who was REFUSED — while the trigger's
`confirmed` row went to `619cf8c9`, the Driver who won the race.** That is the distinction the log has to get
right, and it survived a transaction that rolled back. Proof that writing it out of band was necessary.

Test data removed; mission table back to 280, `mission_event` back to 1848.

`npx tsc --noEmit` clean · **516 tests passing** (17 new) · `npm run build` clean.

## Session 66 — CLOSED (2026-08-24). Three fixes, all verified against the live DB

**`main` = `b16bedd`.** Both migrations applied by the founder mid-session and probed immediately.

| | shipped | verified |
|---|---|---|
| **[[d86]]** | The reclaim — dead code gated on `accepted`, now `confirmed AND never checked in` from T−2h | 20/20 live, driving the real RPC |
| **[[d87]]** | The event log's app half — nine types that wrote nothing | Real app, real Driver: check-in, contact reveal (3 renders → 1 row), a raced accept |
| **[[d88]]** | The price floor — a missing quote is now a refusal, not a skipped check | Posted a real trip through the real form |

### ⚑ THE FINDING THAT OUTLIVES THIS SESSION

**All three bugs were the same bug: a guard treating *absence of data* as *absence of a problem*.**

    reclaim   status = 'accepted'      // a status that never occurs → never fires
    event log captured_by = 'app'      // declared, registered, written by nothing
    floor     !asDraft && quote && …   // no quote → no check, silently

Nothing errored. Nothing warned. Each survived months because **a check that never fires is
indistinguishable from a feature nobody uses.** Written into [[d88]] as a rule: *where a check needs a value,
missing that value must be a refusal, never a skip.* Grep `&& x &&` in any guard you touch.

### What the founder decided (the durable half of this session)

Full reasoning in [[d86]]–[[d88]]; the one-line versions are in NEXT_SESSION's 🔒 table. The three that will
shape the most work:

1. **No browsing events.** *"a driver that looks around the pool it's just browsing and brings no values to
   us unless we need to understand like in a shopping website."* Claude argued once for `pool_impression` —
   it is the only way to tell "expired unseen" from "expired and refused" across 49 expired trips — and
   conceded: the valuable half is a **query over stored data** (which Drivers matched a trip's category, zone
   and radius at the time), not a ~300k-rows/day log. `mission_viewed` went with it once the founder asked
   the clarifying question that settled it: *is that page a Pool trip or one of their own?* It is the Pool.
2. **Two products, not one dashboard.** Support console (people and trips) and Analytics (counts over time).
   ⚑ And **don't call it an event log screen** — the founder will never think *"let me open the event log"*,
   they think *"why did that trip fail"*. The log is fuel; the product is **Activity**.
3. **Google for the address box, Mapbox for routing.** ⚑ The old "Michelin vs Google" framing **missed the
   incumbent** — Kavenue already runs Mapbox for both, and its routing is traffic-aware at the scheduled
   departure. Researched Michelin: its traffic option is a **country-level toggle**, not a departure
   timestamp, and a direct comparison describes ViaMichelin durations as excluding traffic. Change one thing,
   not two.

### Claude got two things wrong and corrected them from the code

Both about [[d88]], both stated to the founder before checking:
- *"The common cause is a typed address."* **No** — posting already requires a located pickup, drop-off and
  stops. On a post, no quote means **routing itself failed**.
- *"14 of 280 trips prove it's happening."* **No** — seed and legacy rows. **No evidence it has ever fired in
  production.** Latent, not leaking.

⚑ The lesson is the session's own: *check before you characterise severity.* A wrong severity sends the next
session at the wrong thing with the wrong urgency.

### Housekeeping

- **`handoff-check.ts` now runs 23 assertions** (was 17) — the reclaim CHECK constraint, `accepted` staying
  extinct, the nine wired event types, the two deliberately-unwired ones, `guaranteed` never over-claimed,
  and the floor guard's shape. First fully clean gate of the session: *"The handoff still matches reality."*
- **New probes:** `reclaim-live.mts` (20), `event-registry-live.mts` (16), `event-wiring-live.mts`,
  `event-accept-rejected.mts`, `lead-time.mts`, `find-mission.mts`, `s64curve-refresh.mts`.
- **`NEXT_SESSION.md` cut from 1884 lines to ~860.** The old state block had decayed — it still said the
  T−60 take-back was "STILL parked" hours after it shipped. History belongs in SESSION_LOG and DECISIONS;
  the handoff should only carry what is true today.
- Test data removed throughout: **280 missions · 1848 events**, both back to baseline.

`npx tsc --noEmit` clean · **523 tests passing** (36 new across three files) · `npm run build` clean.

## Session 67 — 2026-08-24 · the two probes that went stale the moment S66 shipped

Setup session. Ran the full gate from `NEXT_SESSION.md` § 0. **21 of 23 green; the two failures were both
stale probe expectations, not code regressions** — and both were confirmed against the live DB before touching
anything, per the S63 rule (*suspect the probe's expectations before the code*).

### The two failures

**1 · `.local/probe/migrations-2026-08-10.ts` — case P2 drove the reclaim through the dead gate.**
`mk("P2 reclaim <24h", 0.5, "accepted")`. [[d86]] had replaced that gate hours earlier: `accepted` is a status
nothing has reached since [[d55]] (0 of 280 mission rows, 0 of 715 `status_event` rows), which is exactly why
the reclaim was unreachable for months. So the probe was asserting the old, dead rule and failing on the fix.
- P2 is now `confirmed` + `checkedIn: false` at **T−30min** — what a real reclaim looks like.
- Added **P5**, which did not exist in any form: a `confirmed` trip the Driver **did** check in on must be
  **refused** (`Not eligible for reclaim`) and stay theirs. Without it the check-in clause could be dropped
  from `reclaim_mission` and every probe would still be green.
- ⚑ `repooled()`'s `checked_in_at CLEARED` assertion is now **vacuous on the P2 branch** and deliberately left
  in — [[d86]] only lets a reclaim start from `checked_in_at IS NULL`, so there is nothing to clear. The RPC
  still writes it, and P0/P1/P3/P4 still prove the clearing on rows that really were checked in. Noted at the
  call site so nobody reads that green tick as proof.
- **61 → 63 checks, 0 failed.** (The handoff's "61" reconciles: the P2 failure was skipping the seven
  `repooled()` assertions behind `if (!error)`.)

**2 · `.local/probe/event-registry-live.mts` — an equality check on an append-only table.**
`t("mission_event untouched by a data-only migration", total.count === 1848)`. The log grows every time
anything happens to any trip, so this was guaranteed to go red on the first working session after D87 — a
false alarm indistinguishable from a real regression. The direction that needs guarding is the opposite one
(the table comment: *"Never UPDATE or DELETE a row here"*). Now a **floor**: `count >= 1848`, dated, with a
note not to lower it to make it pass. **16 passed · 0 failed.**

### ⚑ The lesson, which is the S66 pattern one level up
**A probe is a claim about the repo too.** D86's own `reclaim-live.mts` was 20/20 green throughout — the
*old* probe was the only thing that noticed the change, and its red was ignored as breakage. The session that
changes a rule must re-run every probe that touches it: **`grep -rl "<rpc_name>" .local/probe/` before
closing.** Written into the S66 trap list in `NEXT_SESSION.md`.

### Found along the way — `mission_event` has no FK to `mission`
`2026-08-24_mission_event_log.sql:78` declares `mission_id uuid not null` with **no `references`**, on purpose:
the log outlives the trip. Unmeasured consequence: **221 of 1 959 events point at a mission that no longer
exists**, nearly all probe residue, because a probe's `undo()` deletes the mission and strands its events.
- `event-registry-live.mts` now **prints that count every run** (as an observation, not an assertion — the
  honest answer changes, and it should be 0 after the pre-launch sweep). Both reads page in 1000-row chunks;
  the PostgREST cap is the S66 trap.
- `migrations-2026-08-10.ts`'s `undo()` now deletes `mission_event` by **recorded id**. That is not a breach of
  *"never delete"* — those rows are the history of trips that never existed. Verified: the probe run creates
  11 missions and their events, and leaves the totals at **1 959 / 221**, unchanged.
- ⚑ **Two things follow for the Activity console (next session's job 2): it will meet events with no trip
  behind them, and the pre-launch sweep must include this table.**

### Gate, after the fixes
`handoff-check` 23/23 · `tsc` clean · **523 tests** · `diff-sql-vs-lib` ALL AGREE · `write-test` 170 ALL AGREE ·
`curve-live` 8 · `accepted-fare` 20 · `reclaim-live` 20/0 · `event-registry-live` **16/0** ·
`migrations-2026-08-10` **63/0** · `migrations-2026-08-11` 23/0. Mission table restored to **280**.

### Also closed
`CHANGELOG.md` had **no entry for 24 August** — S66's three shipped fixes (D86/D87/D88) never got their
plain-language lines. Written, together with today's.

**No migration. No app code touched — probes and docs only.**

## Session 67, part B — 2026-08-25 · the address box moves to Google ([[d89]])

Founder set up the Google Cloud project, key and restrictions live during the session; verified before any
code was written. One file changed: `components/address-autocomplete.tsx`. **No migration, no schema change,
no change to the exported interface** — all six call sites (`route-stops`, `onboarding`, both settings pages)
are untouched.

### What moved and what deliberately did not
- **Moved:** suggestions + the coordinates of the picked place. Mapbox Search Box `suggest`/`retrieve` →
  Google `places:autocomplete` / `places/{id}`.
- **NOT moved:** routing. `lib/directions.ts` still calls Mapbox `driving-traffic` with `depart_at`. That is
  the traffic-predicted duration **at the scheduled pickup time**, feeding the ETA and the ±90min slot band.
  A comment at the top of the component says so, because "finish the migration" is the obvious wrong instinct.

### The evidence (both live keys, 2026-08-25)
`Terminal 2 Nice` → Mapbox gave a pharmacy then **Terminal 1** twice; Google gave Terminal 2.
`Hôtel Negresco` → Mapbox gave three Airbnb flats *"near the Negresco"*; Google gave the hotel.
`Eden Roc` → Mapbox gave a vinyl café, a villa and a Nice building; Google gave the hotel (2nd).
`Hôtel du Cap Eden Roc` and `Hôtel Martinez` (full formal names) → both correct on both.
⚑ A fifth, `Le Grand Hôtel Cannes`, failed on both — **the founder pointed out that business no longer
exists.** Struck as a bad test, not a provider result.

### ⚑ Nothing was tuned — explicit instruction
Google ranks the Eden-Roc *restaurant* above the *hotel* (same address, so the coordinates are right; the line
just reads "Restaurant"). Claude offered a lodging bias; the founder said *"no don't tune anything leave it as
is"*. The existing Riviera re-rank was **kept**, as existing behaviour rather than new tuning — and it still
works: it pushed an "Eden Rock" in Cagliari to the bottom of the live list.

### Mechanical notes for whoever touches this next
- `countries` (comma string) → `includedRegionCodes` array. Prop shape unchanged for the call sites.
- `proximity` (a bare point for Mapbox) → `locationBias.circle`, which **requires a radius**: 50 km from Nice.
  ⚑ Bias, not limit — verified, a Riviera-biased "Hôtel Negresco" still returns Barcelona and Palma.
- `queryPrediction` results are dropped. They are search TERMS, not places — the exact analogue of the
  `brand`/`category` filter the Mapbox version had.
- ⚑ **The session token is the bill.** Autocomplete + details billed as ONE session only when both carry the
  same token. Minted per search, rotated after each pick.
- ⚑ **The details field mask is REQUIRED and is also the bill** — fewer fields, cheaper SKU. Ours is exactly
  `location,formattedAddress,displayName,addressComponents`, which is what the component reads and no more.
- Glance label now comes from `displayName.text` + the `locality` address component, replacing Mapbox's
  `name_preferred` + `context.place`. Same output shape.

### Verified in the real browser, not just by probe
Dev server, `/dispatch/new`. Typed `Eden Roc` → five suggestions, Cagliari last → picked the hotel →
hidden inputs took `43.5483462 / 7.1216026`, `pickup_label` = `Hôtel du Cap-Eden-Roc, Antibes`. Then
`Terminal 2 Nice` → picked → `dropoff_label` = `Terminal 2, Nice`. **Mapbox then routed the pair: 25 km ·
44 min**, curve opening 31,60 € against a 97,60 € Ceiling. No console errors, no CORS problem. Nothing was
submitted, so no DB rows were created and there is nothing to clean up.

⚑ **Trap for the next session: the booking form's address fields are PREFILLED with the Business's own
address, and `computer{action:"type"}` does not land in them** — the click focuses `body`, and a typed string
gets spliced into the middle of the existing value. `form_input` on the combobox ref works, and React picks it
up. This cost several turns.

### New probe
`.local/probe/google-places-live.mjs` — 4 checks: three real queries return suggestions, and **a request from
an unlisted website is refused (403)**, which is the one that proves the key restrictions are actually applied
rather than merely configured. Never prints the key.
## Session 67, part C — 2026-08-25 · admin access; the loop nobody could reach ([[d90]])

Step 1 of the support console: **an admin can get into the app.** No migration, no schema change.

### The bug, exactly
`routeFor()` had `driver` and `dispatcher` branches and fell through to `return "/welcome"`. `/welcome` opens
`if (ctx.profile) redirect(routeFor(ctx))`. `role='admin'` → `/welcome` → `routeFor()` → `/welcome`. Forever.
⚑ **0 admin accounts exist** (4 dispatchers, 4 drivers, measured), so it had never once run. Latent like
[[d88]]; a branch that never fires looks exactly like a feature nobody uses — four for four now.

### ⚑ The DB was never the problem
`app_role()='admin'` is already in RLS policies across `docs/kavenue_schema.sql` — driver, business, mission,
dispatcher, side tables. An admin has read on everything the moment one exists. **Only the app was missing.**

### Fixed three ways
1. `routeFor()` → `/admin` for admin.
2. `/welcome` will not follow a self-referential answer: `const to = routeFor(ctx); if (to !== "/welcome")
   redirect(to)`. An unknown role lands on the picker and **stops**. Dead end, never a loop.
3. `tests/app-routing.test.ts` — walks **every** value of `user_role` and asserts none routes to `/welcome`,
   `/login` or `/`. Suite **523 → 534**.

### ⚑ routeFor moved to lib/route-for.ts, and the reason matters
`lib/app-context.ts` imports `lib/supabase/server`, which reads env at module load — so the first test of
`routeFor()` died on *"Missing environment variable NEXT_PUBLIC_SUPABASE_URL"* before running a line, and
**would have died identically in CI, which has no `.env.local`**. The rule is pure logic; it now sits with
`lib/pdp.ts` and `lib/rate-card.ts`. `app-context.ts` re-exports `routeFor` and `AppContext`, so **no call
site changed**. ⚑ *It was untestable, which is a large part of why it stayed broken for two months.*

### ⚑ No admin subdomain, deliberately
`subForRole()` already returns null for admin, so `urlForRole()` yields a plain path and `/admin` is served
from whichever host they signed in on — `dispatch.kavenue.fr/admin` in practice. `admin.kavenue.fr` would
mean a DNS record + a Vercel domain + a Supabase redirect URL: infrastructure for a one-person surface.

### Identity
`admin@kavenue.fr` — a **free alias** on the existing paid Workspace mailbox, not a second user (~€7/mo for a
login). Deliberately not `support@`, which is printed in the app and therefore publicly writable-to.

### Verified by execution
Throwaway local user via `/api/dev-login?email=s67.admin@pickup.local`, promoted to admin with the service
role, then driven in the browser: `/` → `/admin` (renders, shows the signed-in email), `/welcome` → `/admin`,
and a signed-in Dispatcher hitting `/admin` → `/dispatch`. Then deleted — profile + auth user — and roles
re-asserted at **4 dispatchers / 4 drivers / 0 admins**.

### ⚑ Open, and it needs the founder
The real admin account does not exist yet. When they sign in with `admin@kavenue.fr` for the first time they
will have **no profile**, so they land on `/welcome` and are offered *"Driver or Business"* — **picking either
creates the wrong role.** They must sign in and STOP there; the profile row is then written with `role='admin'`
by whoever is at the keyboard. This ordering trap is the only awkward part of the job.

**Next: the Activity console — and it gets a design preview before any of it is built ([[d25]] loop).**
## Session 67, part D — 2026-08-25 · admin.kavenue.fr, and the compiler starts catching the family bug ([[d91]])

Part C shipped `/admin` with **no subdomain**, on the reasoning that DNS is infrastructure for a one-person
surface. The founder pushed back the same hour — *"why can't I have the admin elsewhere? Why here? it's
confusing…"* — and was right for a harder reason than the one they gave.

### ⚑ The session cookie is what settles it
`lib/hosts.ts` splits the app across hosts so each carries its **own** session cookie; that is why a Driver
session on `driver.` and a Business session on `dispatch.` coexist. An admin area with no host of its own
shares `dispatch.`'s cookie — **signing in as admin would sign the founder out of their Business account, and
back again, all day.** Broken, not untidy. Their stated reason also stands alone: Dispatch is the *hotel's*
app, and Kavenue is an agent, never the principal (hard rule #2).

### Shipped
- `RoleSub` → `"driver" | "dispatch" | "admin"`; `subForRole`, `roleSubOf` follow.
- `app/admin/layout.tsx` gains the wrong-subdomain bounce, identical in shape to the Driver and Dispatch
  layouts. **Keep all three the same** — they are the only three places this pattern appears.
- `.env.example` documents `https://admin.kavenue.fr/auth/callback` in the Supabase allowlist.
- **Founder did:** the OVH CNAME (`admin` → `b995c589bd56b1fa.vercel-dns-017.com.`, trailing dot),
  the Vercel domain, and the Supabase redirect URL.

### ⚑ TWO FALL-THROUGH BUGS THE COMPILER CAUGHT — the actual story of this part
1. `homePathForSub()` was `sub === "driver" ? "/pool" : "/dispatch"`. The moment `"admin"` joined `RoleSub`
   it would have **silently sent admins to Dispatch.** The D86–D90 family, a sixth time.
2. Fixing it as an exhaustive `switch` with a `never` assignment made the build fail on
   `app/login/login-form.tsx`, whose `COPY` map was keyed on a hand-written union — an admin would have been
   greeted with **"Kavenue Driver"**. Now keyed on `RoleSub` itself.

⚑ **Neither was found by looking. Both were found by widening the TYPE.** Where a value must cover every case,
make the compiler the check; a reviewer's memory is not one. This is the first change in the D86–D91 run that
moves the guarantee from discipline to the build.

### Tests — `tests/hosts.test.ts`, 21 assertions, suite 534 → **555**
Covers what the compiler cannot: every `user_role` maps to a subdomain · every subdomain has a **distinct**
home path (a fall-through would collapse two together) · the host↔sub mapping round-trips · admin is not the
same host as dispatch · and the whole mechanism stays a **no-op off production**, so localhost and previews
never redirect to the live site. Also pins `isProdDomain("notkavenue.fr") === false`.

### Verified live
`dig` → CNAME resolves to the Vercel target · TLS valid · `https://admin.kavenue.fr/admin` → 307 to
`/login` **on the admin host**, not to dispatch.

⚑ **Still open, unchanged from part C:** the real admin account does not exist. First sign-in with
`admin@kavenue.fr` lands on `/welcome` with no profile and offers *"Driver or Business"* — **picking either
creates the wrong role.** Sign in, stop, then write the profile row with `role='admin'`.
## Session 67 — CLOSED (2026-08-26). Four shipped, and the first change that makes the machine do the catching

`main` = **`7ca02ee`** + this close. **No migration was written or needed all session.**

| | |
|---|---|
| two stale probes | 63/0 and 16/0. Neither was a code regression — both were probes asserting yesterday's rules |
| [[d89]] | the address box → Google Places (New). **Routing stayed on Mapbox and must** |
| [[d90]] | an admin can get into the app — `routeFor()` had no `admin` branch, so `/welcome` redirected to itself |
| [[d91]] | `admin.kavenue.fr` — its own host, because each host carries its own session cookie |
| § AI | live Driver location backlogged behind the native app |

### ⚑ Six of the same fault this month — and S67 changed how it gets caught
D86 · D87 · D88 · D90 were all *a branch that never fires looks exactly like a feature nobody uses*. The two in
D91 **never shipped**: widening `RoleSub` from two values to three made the **compiler** fail the build twice —
`homePathForSub()` would have silently sent admins to Dispatch, and the login page would have said *"Kavenue
Driver"*. Neither was found by reading the code.

> **Where a value must cover every case, make the compiler the check. A reviewer's memory is not one.**

### ⚑ The counter-lesson, same session
Claude told the founder that `accepted_fare` being null on all 280 missions was urgent — the exact shape of the
four faults. It is not: wired, live since 2026-08-22, covered by `accepted-fare.ts`. **"Zero rows" is not proof
of a bug.** Corrected plainly in the artifact and to the founder.

### The founder's own contributions this session, worth recording
- **They caught D91's premise before the analysis did** — *"why can't I have the admin elsewhere? Why here?
  it's confusing…"* Claude had chosen "no subdomain" to avoid infrastructure. The session-cookie clash that
  made it genuinely broken was only found *because* they pushed back. See [[be-an-adviser-not-a-yes-man]].
- **They killed a bad test**: `Le Grand Hôtel Cannes` failed on both Mapbox and Google, and they pointed out
  the business no longer exists. Struck from the comparison. See [[founder-knows-the-market]].
- **They rejected a per-feature "definition of done" checklist as too heavy**, and chose a periodic audit
  session instead. Recorded in Claude's memory; do not re-propose the checklist.
- **They decided the admin area gets restricted access levels later, not now** — one column when a second
  person needs access.

### Deliverable: `project/What-Admin-Can-See.html`
Full inventory of everything the Admin page can show — every field, every sum, every cross-check, marked
Ready / Partial / Missing, **read from the live DB on 2026-08-26**, also published as an Artifact. Findings
worth carrying: `mission.zone` is unusable free text (22 values mixing hotel names, streets, terminals, and
`Nice` vs `nice`) so *"by region"* must come from coordinates · **23 cancelled missions with 0 cancellation
records** · Driver photo + languages collected and shown to nobody while two shipped strings promise otherwise
· `business_type` and `field_of_activity` still never talk · payment/payout/ledger/document all **0 rows**.

### Discussed and decided, so it is not re-argued
- **Console BEFORE the clean test dataset.** The founder asked Claude to make the call. Reasoning: the dataset
  exists to be looked at and there is no tool to look at it with; the console needs no new data; building the
  console reveals what the dataset should contain; and the dataset is thrown away after Stripe/email land.
- **Simulation, when it comes: script the real RPCs, never raw table inserts.** Raw inserts are what made the
  280 trips that cannot answer money questions. ⚑ Four months of *time* cannot be simulated — the curve,
  check-in windows and expiry all read the clock. ⚑ **Simulated scale is not real scale**: 35 fake Drivers must
  not reopen decisions parked at "revisit past ~50 Drivers".
- **Money: simulate the maths, never the movement.** Fares/commission/VAT/invoices are live and parity-checked;
  faking Stripe rows would prove nothing.
- **The founder will do their own UI/UX pass** on a clean dataset and report findings — complementary to
  Claude's dev-side testing, which catches the silent faults they cannot see.

### Gate at close
`tsc` clean · **555 tests** · handoff-check 23/23 · diff-sql-vs-lib · write-test 170 · curve-live 8 ·
accepted-fare 20 · reclaim-live 20/0 · event-registry-live 16/0 · migrations-08-10 **63/0** · migrations-08-11
23/0 · google-places-live **8/0**. Mission table restored to **280**; roles 4 dispatcher / 4 driver / **1 admin**.

### ⚑ THE NEXT ACTION, EXACTLY
**The Activity console — and the very next thing is the DESIGN PREVIEW** ([[d25]] loop), which Claude had just
offered when the session ran out of context. Read `project/What-Admin-Can-See.html` first. Build the *"why
can't this Driver take this trip?"* answer first within it.
