# Kavenue — Ideas & Parked Notes

> Loose ideas, "remember to consider", and things that aren't yet in the spec docs.
> When an idea becomes a real plan, promote it into the spec docs (00–05) or DECISIONS.md
> and remove it here. Keep this from becoming a second source of truth.

---

## The GUEST has no touchpoint — tracking link + post-trip feedback to the hotel (founder, 2026-07-30) ❓

**Founder asked to park this while reviewing the surface map.** Today the Guest — the person actually in the car, and
the only person the hotel is judged on — has **zero** contact with Kavenue at any point. Two connected pieces:

**1. A Guest tracking link.** Driver assigned, en route, ETA, driver first name + vehicle, per-stop progress. **No new
data needed** — `status_event`, `stops_reached`, the driver/vehicle rows and the traffic-aware ETA all exist. What it
needs is a **public, tokenised, expiring route** (no auth — the Guest never signs up), reachable by a link the Business
can hand over or that goes out with a confirmation. Design constraint: an unguessable token per mission, dead after the
trip closes, and it must expose only the Guest-safe subset — never the fare, never the Business's private message to the
Driver, never the reference tag.

**2. A post-trip feedback email — to the HOTEL, not to Kavenue.** The founder's framing, and it matters: the Guest tells
*the hotel* how the ride was. That makes it a **B2B value proposition** (a hotel finally learns what its guest
experienced in the car) rather than a rating system Kavenue owns. Keeps Kavenue in its **agent/intermediary** position —
we carry the message, we are not the operator being reviewed.

**What it would actually cost:**
- **A Guest email column.** `mission_guest_contact` stores name + phone only today, so this is a small additive
  migration — and it inherits that table's **deny-by-default RLS** (Drivers can't read it), which is the right default.
- **Notifications first.** The feedback email needs the deferred Resend phase. The tracking link does **not** — it is
  buildable today and is the cheaper half.
- **A lawful basis to email the Guest.** They are a third party who never signed up; the relationship is the hotel's,
  not ours. Practical consequence: it is probably the **Business** who chooses to send it, per booking, mirroring the
  existing **per-phone Share gate** (S20) rather than a blanket Kavenue mailing. Founder owns legal — flag, don't gate
  ([[legal-not-mvp-blocker]]).
- **Respect the S47 privacy rule** ([[d57]]): a Guest's data *leaves the Driver's app* once the trip closes. A feedback
  loop must not quietly reopen that door.
- **Don't let it become a Driver rating by the back door.** S40 already logged that a review system must be gated to a
  completed trip and double-blind ([[d46]]). Guest→hotel feedback about the *ride* is a different object from a
  Driver score; if it starts driving Driver reputation, it inherits every one of those constraints.

**Why it's worth doing eventually:** for a hotel choosing between Kavenue and the local VTC firm they already phone,
*"your guest gets a tracking link"* is concrete and demonstrable in a sales meeting. Consumer ride-hailing has trained
everyone to expect it, so its absence reads as a downgrade. **Split it:** the tracking link is a self-contained,
no-integration build; the feedback email waits for notifications.

## Build-time reminders
- Enforce the glossary in code: name variables/components Business/Dispatcher/Driver/
  Guest/Pool/Ceiling — never `client`/`principal`. Consider a lint note in review.
- PDP fare is computed on read — keep a single shared `pdp.ts` so Driver + Dispatch agree.
- Pool RLS lets a Driver read *any* pooled mission; the zone/category narrowing is done in
  the query, not by RLS. Keep that filter in one place to avoid drift.

## A class that "comes to help" when another is short — and why it waits for volume (2026-08-23, S65) 🅥

Founder, closing the § V brainstorm: *"maybe the solution is about offer and demand — a class can come and
'help' when the system understands that during this period a class has a hard time filling the demands?"*

Parked to **§ AF** in `BACKLOG.md`. Kept here for the thinking, which is the reusable part:

**It is unmeasurable, not hard.** With 9 Drivers and 280 missions, a "this class is struggling" detector is
averaging over nothing. The instinct to reach for market-level intelligence is right; the marketplace just
is not big enough to have a market signal yet.

**The general shape, worth remembering beyond this feature:** when an aggregate signal is not yet
measurable, look for the **n = 1 version of the same signal**. Here, a single trip sitting unfilled near its
pickup carries the same information as "this class is short" — for one trip, at one moment, in one place.
Ship the n = 1 rule, and it generates exactly the records that make the aggregate version possible later.

**And the trap to carry forward:** at aggregate scale the § V fairness paradox sharpens rather than
dissolving. A detector that fires in a genuinely quiet season is redistributing scarce work downhill — the
case the founder already rejected. The trigger must be *"this class is short relative to its own demand"*,
never *"this class is quiet"*.


## Parked (not yet scoped)
- **Address search → Google Places (New)** — the real fix for POI precision (Mapbox ranks a random shop over the Nice
  airport terminal; Google weights prominence). Deferred until the founder registers the final Kavenue domain, so the
  browser API key is restricted to the right domains ONCE. ~1 session, one file (`address-autocomplete.tsx`), keep Mapbox
  for routing. The founder already has a Google Cloud project ready (created under the earlier "RED Executive" name). See
  [[d43]] [[d50]].
- **Domain migration `pickupbedriven.com` → a Kavenue domain.** Separate ~1-session task: DNS + Vercel domains + Supabase
  redirect allowlist + `lib/hosts.ts` + the Google key restriction. Waiting on the founder registering the domain.
  See [[d44]] [[d50]].
- ~~**Code/copy rebrand PickUp → Kavenue**~~ — **DONE (Session 44, [[d50]])**: user-facing copy, spec docs, `project/`,
  package name, PWA manifest and the Dispatch topbar wordmark all say Kavenue. The glossary
  (Business/Dispatcher/Driver/Guest/Pool/Ceiling/SPEED WIN) was deliberately left untouched. Still outstanding and
  founder-owned: the repo directory name, the GitHub repo slug, and the domain (above).
- **Detail-edit change-log: multi-edit visible history** — today `mission_info_change` stores every edit as a row but the
  schedule shows only the LATEST. A small extension could show a "…and N earlier edits" expand. (S36 / D41.)
- **Pricing vehicle chip: include the specific car** — the chip shows class·body only; wire an `onCarChange` up from
  `ServiceClassFields` to add the picked model (e.g. "First · Sedan · Mercedes Classe S"). Minor. (S37 / D42.)
- **Amend-form fare field: numeric sanitize** — the new-mission + edit forms now block non-numbers (D42); the amendment
  "New agreed fare" field wasn't included — apply the same for consistency. Minor.
- ~~Seed/fixtures script~~ — DONE as dev-only `GET /api/seed` (see D9).
- Scheduled jobs the spine assumes (PDP climb, Lock-in/T-180, expiry, return-to-pool) —
  not in the first slice; plan where they run (Supabase cron / edge functions / Vercel cron).
- TypeScript type generation via Supabase CLI once credentials/CLI are wired (see D3).
- **Realtime Pool/My Rides** — currently `force-dynamic` (fresh on each load), no live
  subscription. Add Supabase Realtime so the Pool updates as missions are taken / PDP climbs.
- **PWA polish** — `manifest.webmanifest` has no icons yet; add icons + offline shell + install.
- **PDP climb origin** — fare climb is measured from `mission.created_at`; if a dedicated
  `pooled_at` is added later, switch `lib/pdp.ts` to that.
- ~~**Design layer**~~ — theme applied: blue/slate (S9) → Dispatch redesign (S10/D20) → **app-wide navy
  #25344C** (S14/D24). Dispatch + the new-mission form (two-pane + live Summary rail) are done; the **Driver
  app layout** is the remaining redesign. The design loop is now **D25** (inline HTML mockups from Claude Code).
- ~~**Maps / geocoding (Dispatcher)**~~ — DONE: Mapbox autocomplete (S8), geocoded pickup/dropoff **and
  stops** (S13), traffic-aware road ETA routed **through** stops (S12/S13), France-biased suggestions (S13).
  Remaining: feed the ETA into a better **recommended base fare** (still a manual estimate), and use
  `duration_min` to replace the crude ±90-min `accept_mission` slot-conflict buffer.
- ~~**Pickup-time timezone**~~ — DONE (Session 11): `lib/time.ts` interprets `datetime-local` as
  Europe/Paris and converts to a UTC instant; live posts are guarded against past pickup times.
- ~~Dispatcher realtime status feed~~ — DONE (Session 4) as near-realtime **polling** (`LiveRefresh`,
  4s). Upgrade to true Supabase Realtime websockets later: add `status_event` to the
  `supabase_realtime` publication and swap `LiveRefresh` for a channel subscription.
- **Completion side effects** — when a Driver marks `completed`, we only set the status. Still to
  build (later milestone): Stripe capture + `ledger_transaction` + `booking_voucher` generation.
- **Dispatcher mission edit — KEEP per Doc 02** (free edits while pooled; material edits after acceptance need
  re-consent). Design agreed with the founder 2026-07-05, phased. The **line that decides everything: has a Driver
  accepted yet?** Pooled = the mission is nobody's → edit anything freely (no consent). Accepted+ = two parties in
  a deal and **Kavenue is the AGENT between them, not the boss** → a material change is a *proposed amendment the
  Driver accepts or declines* (this is what keeps us an intermediary AND keeps the deal honest — the Driver
  consents to the new price + time).
  - **Phase 1 — info-only edit (BUILDING NOW, Session 34).** Let a Business edit the **pure-info** fields of a
    posted mission — Guest name(s) + phones, flight number/ETA, reference, Driver & service (languages, dress,
    request flags, name board, private message), luggage/pax counts — **without recomputing the fare**
    (base/ceiling/SPEED WIN + geocoded distance untouched). No consent needed (info doesn't change the deal).
    **Excludes** pickup/drop-off/stops (re-geocode → distance → material) and the required vehicle (matching).
    RLS already allows a Business to UPDATE its own non-draft mission; the app **whitelists** the info columns
    (no column-level RLS). Allowed on pooled/accepted/confirmed; blocked once en_route+ / terminal.
  - **Phase 2 — the amendment model (✅ SHIPPED + DEPLOYED S35, 2026-07-07 — [[d40]]; migration applied, full loop
    verified live).** A material change (new destination / add a stop / **now also pickup**) after a Driver
    accepted, as a **propose → accept/decline** on the mission (a mini `accept_mission`: atomic, consented, with
    an audit trail). Flow: Business proposes → app shows the **delta** (new route + ETA + a price change) → Driver
    sees "add a stop at X · +12 min · +€15 — accept?" and taps **accept/decline** → on accept the terms swap
    atomically, on decline nothing changes. The **app is the system of record even if they talk by phone** (beta:
    dispatch calls, they agree, dispatch proposes in-app, the Driver's **tap is the binding step**). **Price:** the
    app *suggests* the delta and the Driver *consents* — never silently applied. ⚠️ today's fare isn't
    distance-based (PDP climb), so **no auto "+€X for N km" yet** — the Dispatcher types the delta and the app shows
    the new km/ETA to justify it (auto-fills once the pricing engine lands — [[d37]]). **Timing:** reuse the
    `accept_mission` **slot-conflict** check to warn the Driver "this ends 16:40 — you have a pickup 16:30" before
    he accepts. **Decline path:** trip stays as agreed, or the Business cancels (needs the O7 cancel/re-pool flow,
    also not built). Accept/decline only in v1 — no counter-offer haggle loop (a decline just prompts a phone call
    + re-proposal).
  - **Phase 3 — polish (BACKLOG).** Auto-computed price delta (the founder's **pricing engine**) + real
    **notifications** (Resend / push — deferred) so the Driver is alerted to a pending amendment without watching
    the app + an optional lightweight in-app note attached to the proposal ("could we add a stop please? +€15").
    Depends on both the pricing model and notifications (both deferred integrations).

### Guard against midnight-edge date ambiguity (safety notification) ❓
> Founder concern, 2026-07-05.
- A pickup at **00h15 on Monday** is technically the very start of Monday (the Sunday→Monday midnight), but a
  Driver reading "**Monday 00h15**" may assume **Monday *night*** (i.e. Monday→Tuesday, ~24h later) — a
  potentially serious miss on a real transfer (e.g. Cannes → Monaco). We want a **"secure" confirmation** around
  these edge-of-midnight / very-late / very-early hours so both sides read the same instant.
- Ideas to explore (not decided): show the **weekday of BOTH the evening and the morning** for 00:00–~04:00
  pickups ("**nuit de dimanche à lundi**, 00h15" / "night of Sun→Mon"); a small **inline confirm** on the form
  when the time lands in the ambiguous band; and the same disambiguated label on the **Driver** Pool/detail +
  the Business schedule. Pairs with the existing night-pickup nudge and the S31 guidance work. **Locale:** the
  French "nuit de X à Y" phrasing is the natural fix. Capture now; design + build later.

## O7 hand-over / SPEED WIN gate / disputes — parked detail (2026-07-13, spec in DECISIONS D45 + BACKLOG § N)
> The O7 cancellation *spine* is decided + build-ready (BACKLOG § N Phase 1). These three pieces are parked for LATER;
> capturing the detail so nothing is lost. Promote into the spec docs when scoped.

### Copilote community hand-over (O7 Phase 2) 🅥
- **The model (founder, confirmed legal — D45):** a Driver who can't do a mission he holds **transfers** it to a friend
  ("copilote") instead of paying the 100% cancel fee. It is a **full transfer / novation, NOT sous-traitance**: the
  original Driver **drops out entirely** — no payment, no invoice, no legal obligation, no liability — and keeps only a
  **"passed on" trace** in his history. The copilote **re-accepts on his own account**, becomes the Driver of record, and
  carries everything (invoice to the Business via Kavenue's intermediary flow, RC Pro, VTC obligations) exactly as if he'd
  taken it from the Pool. "A Driver is a professional and must find solutions" — this is the sanctioned solution.
- **Why it's legal / why this framing matters:** the risky pattern is classic *sous-traitance* (A stays the contractor,
  pays B, invoices the Business, carries B's liability → a "mini-principal" + URSSAF requalification risk). The founder's
  transfer model avoids all of it: A earns nothing and carries nothing, B is the fresh Driver of record on his own
  account → no reselling, no *location de compte* (account-rental, banned), and **Kavenue stays the pure intermediary/agent**
  (VAT position intact, Doc 01). Since **2026 *sous-traitance illicite* is a named REVTC offence**, so the **credential gate
  is the thing that keeps it lawful.** Real precedent: **Drivalty**, **iaDriver**, **WAY-Partner** (credential-gated pass),
  plus VTC cooperatives (VTC Officiel, CoopVTC, Club VTC) — an established, buildable pattern.
- **Mandatory guardrails when built:** copilote must be an **active, verified, same-category** Kavenue Driver — valid REVTC
  inscription, carte pro VTC, RC Pro transport de personnes, conforming vehicle — **checked live at the moment of transfer**
  (block if any credential/insurance is expired); accepts on his **own account** (never the original's); **zero money flows
  through the original Driver**; the Business **consents by default** via its terms (must be **explained in the tutorial**);
  transfer only the Guest data the copilote needs (GDPR minimisation) + log it; **audit trail** distinguishing the
  *accepting Driver* from the *performing Driver* (ratings, no-show, penalties attach to the right person).
- **Needs first:** the **community/registration layer** (a Driver's trusted-copilote relations, all same-category verified
  Drivers). **Data-model NOW (in the Phase-1 spine):** distinct accepting-Driver vs performing-Driver fields so this drops
  in without a rewrite.
- **Open sub-questions:** does a hand-over always waive the original's cancel fee (yes — it's the fee's alternative)? Can a
  Driver hand over ANY trip voluntarily, or only on a genuine conflict? Can a copilote decline / hand it on again? Does the
  Business get notified of *who* now holds it? (All later.)

### SPEED WIN reachability gate (decided, build later — D45) 🔨
- A SPEED WIN can only be accepted by a Driver **within reach of the pickup on time**. On accept: geolocate the Driver
  (browser Geolocation / live location), compute the **GPS ETA** to the pickup (Mapbox Directions, traffic-aware), compare
  to `pickup_at`. If they'd make it → allow; if not → **block with a popup** ("you're too far to arrive on time"). Distinct
  from the CUT continuous live-map GPS — this is a **one-shot check at accept**. It is also the principled replacement for
  the crude ±90-min `accept_mission` slot-conflict buffer (use real ETA/`duration_min`). Consider extending the gate to
  *all* accepts later, not just SPEED WIN.

### Driver-initiated "ask for a release" button (later — founder, 2026-07-22) 🔨
- **The gap.** The agreed release is **Business-initiated only** ([[d46]]): the Driver's only route is the cancel-sheet
  escape valve telling him to **phone** the Business. So when a Driver genuinely asks to be released and the Business
  refuses (or stalls until he has to cancel and eat the 100%), **there is no record that he ever asked.** The
  `mission_release` table proves what the Business proposed and how the Driver answered — it cannot prove the request
  that came first.
- **Why it matters.** It is the mirror image of the abuse D46 was built to prevent. D46 protects the Driver from a
  Business pressuring him into a free release; this protects him from a Business *withholding* one. Same philosophy —
  *not something we control, but something we set up fairly and can prove* — applied to the other direction.
- **Shape.** A "Ask to be released" button on the Driver's cancel sheet (next to the existing phone valve) that records
  the request (who/when/reason/hours-before-pickup) and surfaces it to the Business as a card they accept or decline.
  It does NOT change the D46 rule that only the Business can grant a free release — it just makes the *asking* legible.
  Reuses the `mission_release` table (add a `requested_by` / direction column) + the amendment/release UI pattern.
- **Pairs with:** notifications (the Business needs to know a request is waiting) and the disputes/mediation work below.

### Mutual-consent release ("agreed cancellation") — O7 Phase 2 🔨
- **The founder's "dating-app" flow (2026-07-13).** A **free, no-fee** cancellation that BOTH parties confirm — distinct
  from the unilateral Business cancel (which always pays the ramp). Scenario: a Driver can't do a trip, calls the
  Business, they agree the Business will release it. The Business taps a **dedicated "agreed release" button** (NOT the
  normal cancel); the Driver receives a **notification and must ACCEPT**; only on the Driver's tap does the trip release
  free and re-pool as a SPEED WIN.
- **Why it matters (scam protection):** it stops a Business unilaterally cancelling on a *committed* Driver to dodge the
  cancel fee. Without the Driver's acceptance, the Business's only route is the fee-paying unilateral cancel. Consent
  makes the free path honest — the Driver agreed to be released.
- **Build cost = MODERATE** — it reuses the existing amendment infrastructure almost exactly: a proposal record + a
  Driver accept/decline + a SECURITY DEFINER atomic RPC (like `respond_to_amendment`). It degrades gracefully to
  refresh-based until notifications land (same as amendments do today). **Recommend building right after the Phase-1
  spine, or bundling as Phase 2.** (Full spec in DECISIONS D45.)

### Disputes / mediation (deferred, documented) ⏸️
- No dispute state exists (mission enum has none; mediation is email-only + deferred, Doc 05). The founder's flight-delay
  case — a Business **disputes** a Driver's hand-back — has no representation yet. V1 stays: report by email, **Kavenue
  mediates on the timestamped trail** (accept time · actual flight landing · in-app contact log · proof of service), the
  market-standard mediated-ticket model. When built: at least a "contested" marker on the mission + an evidence view (ties
  to the future admin/back-office dispute-support tool, BACKLOG F2). "Come back to this more deeply later" (founder).

## Navy / redesign follow-ups (parked Session 14)
- **Driver "Complete ride" button colour** — `app/(app)/rides/status-control.tsx` uses a `success-btn`
  class that has no CSS, so it falls through to the navy `.btn`. Make it intentionally **green** (define
  `.success-btn`) so "complete" reads as a positive terminal action, not just another navy primary.
- **Logo harmony with navy** — the mark (`public/logo.png`) is a purple→sky-blue gradient; next to the
  serious navy UI the bright sky-blue can clash. Re-export a navy-harmonised mark (an asset task, not a
  token change — the brand gradient tokens are logo-only and were left untouched).
- **Dispatch on a phone** — the Dispatch sidebar doesn't auto-collapse on narrow widths (only the manual
  toggle), so the desktop dashboard is cramped on mobile. Pre-existing; Dispatch is desktop-first. If mobile
  Dispatch ever matters, auto-collapse the sidebar to the 66px rail below ~720px.
- **Bind the Driver's car to the catalog** — Drivers type make/model free-text (matched tolerantly via
  `carMatches`). A picker bound to `lib/vehicle-catalog.ts` would make specific-car Pool matching fully robust.

## Naming / terminology pass — do it TOGETHER with the founder (2026-07-22) 🔨
> Founder ask: several features carry working names that were never chosen, just typed. Sit down and name them
> properly. The first one is settled in spirit — **"free wait" → "courtesy wait"** (warmer, and it frames the wait as
> hospitality rather than an entitlement being consumed). The rest are candidates to discuss, not decisions.
>
> **Two different jobs, don't mix them:**
> - **Plain labels** — invented in passing, rename freely, it's a copy change: *free wait · paid waiting · the cap ·
>   "Report a no-show" · "Stop waiting" · "Agreed release" · "reclaim" (the T-60 take-back — clunky) · "Luggage run" ·
>   "Edited ·" · the status pills.*
> - **Glossary terms** — Business · Dispatcher · Driver · Guest · Pool · PDP · Ceiling · SPEED WIN. These are a **hard
>   rule in `CLAUDE.md`** and are wired through code, docs and copy. Renaming one is a real decision with a migration of
>   its own (update `CLAUDE.md`, the spec docs, and every component). **SPEED WIN already has an open rename** in
>   DECISIONS ("Open decisions inherited from the spec" — candidates *Rush*, *Fast Track*).
>
> Specific ones worth a view:
> - **"Free wait" → "Courtesy wait"** ✅ founder's instinct, and it reads better to a hotel.
> - **"No-show"** — industry standard and instantly understood; probably keep, but the Driver-facing *button* could be
>   softer than the internal term.
> - **"Lock-in" / "T-180"** — pure jargon, taught nowhere. Already flagged in GUIDANCE_AUDIT as needing plain words.
> - **"PDP"** — internal only today; make sure it never leaks into user-facing copy.
> - **"At-disposal" / *mise à disposition*** — the French is the natural term for the trade; decide the English label
>   before O12 ships.
> - **FR vs EN**: the beta is the French Riviera with international Guests. Some of these need a French name that is
>   *the* professional term (*attente de courtoisie*, *course*, *mise à dispo*) and an English one that isn't a clumsy
>   translation. Ties to the deferred i18n work (O17).

## Questions to raise with the user when relevant
- ~~Beta zones / third town~~ — RESOLVED: founder confirmed the beta covers the **whole French
  Riviera, Saint-Tropez → Monaco/Menton**. `lib/zones.ts` now lists the Riviera communes.
- Preferred GPS deep-link behaviour (waze/google/apple) — confirm per-platform URLs later.

## Founder idea dump — 2026-06-23 (raw → triaged)
> Strategic / open-question / V2 ideas from a founder brain-dump. The concrete **guided-form polish** items
> from the same dump went to `BACKLOG.md` § L. Promote items here into the spec docs / DECISIONS when scoped.

### Vehicle taxonomy — expansion & catalog fixes
- **Catalog audit (facts, 2026-06-23):** `lib/vehicle-catalog.ts` has only **sedan** + **van** bodies (SUVs
  like Cayenne / Levante / X5 are filed as "sedan"); tiers are **business** + **luxury** only — **no Eco
  models** (Eco is the unlisted fallback). **Maserati** IS present (Quattroporte / Ghibli / Levante / Grecale)
  but as sedans/SUVs — **no sports coupés/convertibles** (a 2-seat sports car has no VTC use). All 7 vans
  (Classe V, Vito, Sprinter) are **business** → there is **no First-tier van**, and **Classe V is Business, not
  First**.
- 🅥 **"Bus" tier/body (V2)** — the **Sprinter** is really a **minibus**, currently mis-bucketed as a van. Add
  a proper people-mover axis: minibus (Sprinter) → midibus → coach, with seat-count bands. (Founder: MVP V2.)
- 🅥 **First-tier VIP van/people-mover** — a luxury Classe V / EQV (VIP captain seats) should be selectable as
  **First**, not only Business. Decide if "First van" is just a tier×body combo or its own service.
- 🅥 **Cargo / luggage vehicle (V2)** — a dedicated luggage option (Fr. *fourgon / utilitaire* — the
  cubic-metre vans used for moving) so the **luxury** range is complete (e.g. lead S-Class + a following
  luggage van). NOTE: "lead car + luggage van" is a **multi-vehicle / grouped mission**, already **CUT→V2**
  (Doc 02). Capture both: the cargo vehicle type AND the grouped mission that uses it.
  - ✅ **Phase 1 SHIPPED (Session 32, 2026-07-04)** — a **standalone "van for luggage" run**: a Business posts a
    `luggage_only` mission (forced Van + Business, no passengers, bags via `luggage_count`); Van Drivers **opt in**
    (`driver.accepts_luggage_runs`, off by default) to receive them; the Pool filters to opted-in Van Drivers and
    labels it "Luggage run". **Phase 2 (still V2):** real cargo/truck classes by **volume/m³ bands** (the "20 m³"
    idea) — likely a partly separate fleet — AND the grouped **car + luggage van** on one booking (the CUT
    grouped-mission feature; note the cargo leg can "stop before the end" of the passenger trip — a founder point).
- ❓ Body axis beyond sedan/van (SUV? coupé?) — likely unnecessary for VTC; revisit only if Guests ask.

### Driver specialisation / skills (V2)
- 🅥 Let Drivers opt into **specialisations / skills** for more accurate matching — e.g. decline
  "**luggage-van**" runs (a van used only for bags, with a separate lead car for the Guest), or flag
  VIP / security / multilingual / child-seat capability. Pairs with the grouped-mission idea above.

### Pricing engine (open — needed before real money) ❓
- ❓ **How is the fare actually computed?** Today the Business sets a **Ceiling** and Kavenue recommends a start
  (PDP climbs toward it); there is no objective base price by **tier × body × distance × season/time**. Founder
  ask: is there a known VTC/taxi pricing model or dataset to seed the MVP?
  - Initial take (research later — it's data/integration, deferred this phase): there is **no single public VTC
    price DB**. Practical seeds — French **taxi tariff orders** (préfecture *tarifs taxi* A/B/C/D) as a floor;
    a hand-tuned **base + €/km + €/min** grid per tier with airport/season multipliers; later, learn
    empirically from our own accepted-fare data. Kavenue stays the **recommender, never the price-setter**
    (Doc 01 — the Business sets the Ceiling). Connects to the Doc 05 "hard-floor" + "fare extras" open items.

### Smart Pool — trajectory-based Driver prioritisation · no empty-return charge (V2) 🅥
> Founder decision, 2026-07-04.
- **The Business is NEVER charged for the Driver's empty return leg (*retour à vide*).** Instead of pricing the
  deadhead into the fare, Kavenue solves it **structurally** with a **smart Pool** that prioritises Drivers by
  **trajectory**: a Driver finishing a trip is bumped up the Pool for missions whose **pickup is near their
  current drop-off**, within a **time window**, so the return isn't empty. Example: a Driver on
  **Cannes → Saint-Tropez** is prioritised for missions *departing* Saint-Tropez when the timing matches
  (backhaul / deadhead reduction — a natural fit for the Riviera corridor).
- **Blast radius (when built):** the Pool is a query today — `status='pooled' AND category=…` + base+radius
  (`app/(app)/pool/page.tsx`). This adds a **prioritisation/ordering layer** on top: rank a Driver's Pool by the
  proximity of each mission's pickup to that Driver's *in-progress / most-recent* mission drop-off, plus a timing
  overlap (their trip's ETA-end vs the candidate's pickup time). Needs the Driver's next-free position + time
  (derivable from their accepted missions). **Not a hard filter — a prioritisation**, so Drivers still see the full Pool.
- **Why it matters:** this is the *reason* there's no empty-return charge, so it feeds the pricing model directly —
  one-way long transfers get **no return-leg surcharge**. Connects to the Pricing-engine note above and the Doc 05
  "fare extras" open item. Status: **V2** (a matching upgrade beyond the MVP base+radius Pool) — capture now, build later.

### Business vets the Driver before confirm (optional) ❓
- ❓ Optional **Settings toggle**: a Business may require **reviewing/approving the assigned Driver** (photo,
  car, rating/docs) before the mission locks. Off by default (most won't want the extra step / it slows the
  SPEED WIN loop). Pros/cons discussed in chat 2026-06-23. Ties to driver verification (BACKLOG F2) + Lock-in.

### Keep both sides on the platform + overtime (later)
- 🅥 **Anti-disintermediation** — once a hotel meets a good Driver via Kavenue, what stops them going
  off-platform? Strategy/comms (belongs in **Doc 04 GTM**): position Kavenue as the **guarantee layer** — for
  Drivers, secured/guaranteed payment + dispute cover; for Businesses, vetted drivers, SLA, a backup if a
  Driver cancels, one invoice + VAT. Draft the "why stay on Kavenue" pitch for each side.
- 🅥 **Overtime / waiting time** — handle a mission running long (mise-à-disposition overrun, airport waiting).
  Connects to the existing **Doc 05 open decision "fare extras (waiting, tolls, airport, hourly overtime)"**.
  Later: a time-tracking / extra-charge mechanism.

### At-Disposal (mise à disposition) form UX — build with O12 (V2)
- 🅥 When **At-Disposal** is selected, the date/time picker should switch to a **from → to + hours/day** model
  instead of a single pickup instant. (O12 / hourly is confirmed **V2** — build this alongside it.)

### Convert a transfer INTO an at-disposal mid-mission (V2 — founder idea, 2026-07-22) 🅥
- **The scenario.** The Guest is running very late — late enough that the waiting model (free wait → €1/min → cap)
  isn't the right answer. Instead of letting it die as a no-show, the **Business converts the live mission**: e.g. a
  transfer becomes **1 hour at-disposal + the transfer**, so the Driver is paid for the held time as *service* rather
  than as a waiting penalty, and the Guest still gets taken where they're going.
- **Why it's attractive.** It turns a lose-lose (no-show: Business charged full, Guest stranded, Driver leaves) into a
  billable, useful outcome for all three. It also fits the real VTC habit of "mise à dispo" absorbing messy timing.
- **What it needs.** O12 (at-disposal / hourly) must exist first — the `hourly` enum hook is already in the schema but
  unbuilt. Then: changing `mission_type` **during execution**, a pricing recalculation (hourly rate + the transfer leg),
  and Driver consent — this is a material change to the deal, so it belongs in the **amendment** pattern (propose →
  Driver accepts/declines), not a silent Business edit. Note the tension with the "no rescheduling, cancel + rebook"
  rule: this is a *scope* change, not a *time* change, so it stays amendable.
- **Open:** does the free-wait/€1-per-min meter stop the moment the conversion is accepted (it should — the time is now
  billed as at-disposal, not as waiting)? Does the cap still apply?

### PRM / accessible transport — bundle with the Bus / vehicle-taxonomy expansion (later)
- 🅥 **PRM (wheelchair-accessible)** is a **vehicle category**, not a per-mission Driver flag — it needs an
  accessible vehicle + a Driver equipped/trained for it, so it belongs in the taxonomy, not the Driver card.
  Deferred out of the mission-form Driver section (2026-06-25, founder). Build it together with the **Bus
  tier / First-van / cargo-vehicle** expansion (see the vehicle-taxonomy V2 + Exception-tier notes).

### A Driver telling the Business "this booking was wrong" — chat, not buttons (V2, founder 2026-08-07) 🅥
- **The gap that surfaced.** Designing the Dispatch Spend page (§ S), the founder wanted an "experience" view —
  disputes, arrived on time, **wrong flight number, wrong phone number**, dropped off on time. On-time and the
  money outcomes (unfilled · no-show · late cancellation) are all computable from existing data. The data-quality
  ones are **not**: nothing anywhere records that a booking detail was wrong, and a Driver has no channel to say so.
- **Founder's call, same message: do NOT build report buttons.** The Driver gets an **in-app chat** in V2, so they
  can report anything to the Business directly. A dedicated set of "wrong phone number" buttons would be a second,
  narrower channel for something chat already covers — and it would land before the chat that makes it redundant.
- **⚑ The one caveat worth keeping.** Chat solves **resolution**, not **measurement**. A free-text message tells the
  Business about *that* trip; it never becomes a number on a page. If a "here's where your desk cost you money" view
  is ever wanted (and § S's waste panel is already the start of one), the cheap way is a **tagged chat** — the Driver
  picks a reason chip (*wrong phone · wrong flight · Guest not at pickup · address wrong*) that both sends the message
  **and** records a countable tag. That preserves the founder's call (one channel, chat) while keeping the data.
  Decide it when the chat is designed, not before — the tag list is worthless if it doesn't match what Drivers
  actually report.
- **Blocked on:** the V2 community/chat layer. Related: BACKLOG § O (trust & safety / disputes), § F2 (back-office),
  and the § S waste panel, which already reports the *money* half of the same story.
