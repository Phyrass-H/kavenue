# Dispatch SPEND — design proposal (BACKLOG § S)

> Researched 2026-08-06 (Session 54). 6 parallel agents: our own spec + data-field audit + reusable-UI audit,
> plus web research on B2B spend tools (Ramp · Brex · Navan · Stripe · QuickBooks · Spendesk · Pleo),
> travel/ground-transport back-offices (Uber for Business · Bolt Business · TravelPerk · Navan · Egencia ·
> Blacklane) and chart craft (FT Visual Vocabulary, dashboard-design literature, charting-library trade-offs).
> **Nothing here is built. This is the brief the founder rules on, then the D25 mockup follows.**

## ✅ FOUNDER RULINGS (2026-08-06)
1. **"Modular" = a fixed pro layout + saved views via the URL.** NOT drag-to-rearrange widgets, NOT tabs.
   Every filtered view is a shareable link; Back is undo; each module is a self-contained server component so
   adding or reordering one is a two-line change. §§ 3 and 8 stand as written.
2. **Pass 1 = modules 1–5 + the trip list + CSV export** (total with decomposed delta · the four components ·
   spend-over-time chart with comparison · the Class · Driver · Dispatcher breakdown · the waste panel ·
   trip list · export · honesty footnotes · Suspense skeleton · the History waiting-total fix). Modules 6–9
   follow in passes 2–3 exactly as § 9 phases them.
3. **No `cost_centre` migration.** The existing 20-char `reference` field is the allocation hook for now;
   revisit only if a beta hotel actually asks. Migrations 2 (`original_ceiling`) and 3 (`is_airport`) in § 7
   are **not** part of pass 1 either — pass 1 is buildable with zero schema change.

## 1. The one-line thesis

**`/dispatch/spend` is the hotel's back-office answer to "what did our transfers cost us, what changed, and
what could we have avoided" — one page, one filter bar, charts that are all links, and a CSV at the end of
every view.**

It is not the Driver's Earnings screen with a hotel's numbers in it. Same maths, same calendar, opposite
question: the Driver asks *what did I make*, the Business asks *where did the money go and what do I do about
it*. Everything below serves that second question.

---

## 2. The module list (ranked by value)

Each is marked **ACT** (a hotel changes behaviour because of it) or **KNOW** (true and useful, but nobody acts
on it) — and **TODAY** or **MIGRATION**.

### 1. Total spend + the decomposed delta — ACT / TODAY
**Question:** what did we spend, and *why is it different from last period*?
**Form:** the Driver hero, verbatim classes — `.etotal` (the figure) / `.etotal__sub` ("47 trips · 31 days") /
`.ecmp` (delta pill vs previous period, `TrendingUp`/`TrendingDown`) / `.eyear` ("Same month last year: …",
rendered only when non-zero, D59 rule). Then the one thing the Driver screen doesn't have: a single sentence
attributing the change — *"+1 240 € vs last month — 900 € of that airport transfers, 340 € waiting charges."*
**Reads:** the full fare column set (`id, business_id, ceiling, base_fare, pdp_start, pdp_step, pdp_interval,
speed_win, created_at, pooled_at, accepted_at`) plus `status, no_show, cancellation_fee, waiting_fee,
waiting_minutes, pickup_at`.
A total alone is a vanity metric — it rises whenever the hotel is busy. The attributed delta is the sentence a
GM repeats in a meeting.

### 2. What it's made of — ACT / TODAY
**Question:** how much of this was actual driving?
**Form:** `.ebreak` rows, the four components § S names — **Trip fares** (n trips) · **Waiting charges** (n min)
· **Cancellation fees** (n) · **No-shows** (n) — each with a Δ€ / Δ% pair against the comparison period (the
QuickBooks column pattern), each row a link that lenses the trip list below. Under a hairline, two excluded
lines: **Agreed, not settled** (€X, n trips, excluded from every total) and **Unfilled** (n missions, no cost).
**Reads:** as above. `settledFare()` only — `currentFare()` never appears on this screen.

### 3. Spend over time — ACT / TODAY
**Question:** is this going up, and which weeks did it?
**Form:** the **one** detailed chart on the page. Vertical columns, zero baseline, single navy series, solid
hairline gridlines, four y-ticks, no y-axis rule, direct label on the tallest bar only, no legend. Buckets
derive from the period: year → 12 months, month → days, week → 7 days, range → auto (≤31 d daily, ≤182 d
weekly, else monthly) with a `?g=` override. Day → no chart at all, the tile carries it.
Two extras: the comparison period as a **ghost step line** behind the bars, and a **committed** tail in
`#A9B5C9` — future accepted/confirmed missions at their frozen fare ("4 100 € this month, 1 900 € already
committed for next"). Future *pooled* missions show as a count only, never a euro, because no fare has been
accepted yet.
Clicking a column sets the global date to that bucket. Card header carries a table toggle (Lucide `Table`)
rendering the same numbers as a real `<table>`.

### 4. Where the money went — ACT / TODAY
**Question:** which class, which route, which Driver, which desk?
**Form:** one widget, one segmented control (`.seg`) switching the dimension: **Class · Route · Driver ·
Dispatcher**. Body is an ordered horizontal-bar table, top 8 plus an explicit "Other (n)": label · trips · € ·
% share · Δ€ vs comparison. Single colour, `tabular-nums`, right-aligned.
- **Class** — `serviceClassLabel(category, required_body_type)`, the existing "Business · Van" label.
- **Route** — top pairs of `shortPlaceLabel(pickup_address) → shortPlaceLabel(dropoff_address)`, accent-folded.
  Honest caveat printed on the card: these are typed addresses, near-duplicates don't merge. `mission.zone` is
  **not** used — it's `pickup_address.split(",")[0]` and would give one bucket per address string.
- **Driver** — needs `createAdminClient()` server-side, same as History. **Clicking a row sets `?driver=`** —
  so the Driver dimension arrives as a ranked top-8 you click, never a 300-item dropdown, and it finally gives
  the `driverId` param the UI entry point History left open.
- **Dispatcher** — `mission.dispatcher_id → dispatcher.name`, readable without the service role. Never surfaced
  anywhere in the product today; spend-by-desk is exactly what a hotel with a night concierge and a day
  concierge wants.

### 5. What it cost when things went wrong — ACT / TODAY
**Question:** how much of this was avoidable?
**Form:** a quiet panel, five lines, each with a count, a euro figure and a link into the trip list. Late
**cancellation fees** · **no-show charges** · **waiting beyond the courtesy wait** (minutes and €) · trips that
**cleared at or within 5% of the Ceiling** · **unfilled missions** (€0, but unserved demand).
**Reads:** `cancellation_fee`, `no_show`, `waiting_fee`/`waiting_minutes`, `isAtCeiling()`, `isExpired()`.
This is the module that converts the page from something a hotel looks at into something that pays for itself.
Caveat printed on the card: amended trips are excluded from the Ceiling line, because an accepted amendment
overwrites `ceiling`.

### 6. Booking notice, and what it cost — ACT / TODAY (phase 2)
**Question:** does booking earlier actually save us money?
**Form:** lead-time buckets (<3 h · 3–12 h · 12–24 h · 1–3 d · 3 d+) as a small ordered table: trips · average
fare · average % of Ceiling reached · **fill rate**. This is where § P's homeless fill-rate number lands, with
a reason to exist.
**Reads:** `pickup_at − coalesce(pooled_at, created_at)`, `settledFare / ceiling`, `isExpired()`.
**The only module no generic finance tool could produce**, because it depends on the PDP. "Trips booked under
3 hours cost you 22% more and 1 in 6 never filled" is a behaviour change, not a report. Two caveats stated on
the card: `created_at` resets when a saved draft is posted, so this measures notice-from-posting; amended trips
are excluded from the Ceiling column.

### 7. Every trip + Export — ACT / TODAY
**Form:** the History archive rows, unchanged — `TripRow`, the `.dx-colhead--arch` 8-column grid, the `.rchip`
outcome chips with counts, the `.dxh-sort` column sorts, `?open=<id>` and `<ScrollToTrip>`. The same component
reading the same filters, which is the point: the spend page and History can never disagree about a number
because they run the same functions.
Export is an `<a>` to `/dispatch/spend/export` carrying the page's own query string verbatim.

### 8. Service check — KNOW, edging into ACT / TODAY (phase 3)
Four stat tiles: **fill rate**, **median time to accept**, **on-time arrival** (`status_event` 'arrived' vs
`pickup_at`), **re-pooled** (a Driver dropped it and it was refilled — visible only in `mission_cancellation`).
Kavenue reporting its own service quality to the Business — the trust question a hotel actually has about a
pool of independent Drivers. `checked_in_at` is deliberately **not** used: it's NULL on every row before
2026-07-30 and that is not the same as "didn't check in".

### 9. When we book — KNOW / TODAY (phase 3)
Hour × weekday heatmap of **trip count** (not euros), navy ramp `#A9B5C9 → #25344C`. Operational rather than
financial — it's how a concierge desk staffs a shift. Goes last; first thing to drop under time pressure.

**Marked vanity, not built:** total spend without a rate beside it; spend per Guest / repeat-guest counts
(string matching over `passenger_names`, no Guest entity — a wrong "M. Dupont: 4 200 €" is worse than nothing);
CO2; SPEED WIN usage as a metric (the flag is mutated by re-pooling, so it doesn't mean what it looks like).

---

## 3. Page architecture

Top to bottom, one column, `.dx-main--wide` (1520 px):

1. **Head** — `<h1 className="dset__h1">Spend</h1>` + `.dset__sub` naming the period, plus a freshness stamp
   ("as of 14:32, Paris"). Not decoration: fares are computed on read, so the hotel must never wonder whether
   the number is stale.
2. **Filter bar** — one row, `.dxs-tools` (a clone of `.dxh-tools`), governs *everything below it including the
   CSV*. No per-module date pickers, ever.
3. **Applied-filter chips** — dismissible, between the controls and the data, never inside the filter row (so
   the panel doesn't shift as they accumulate).
4. **KPI row** — four `.dx-kpi` tiles: Total spend · Trips · Cost per trip · Fill rate. Each with the period
   delta and a 24 px sparkline. Tiles are *not* filters — they summarise; only chart marks and breakdown rows
   filter. Two tiles disagreeing about their date range is the classic dashboard failure; one page-level filter
   is the fix.
5. **Hero card** (`.dcard`) — module 1 + module 2.
6. **The chart** (`.dcard`) — module 3, full width.
7. **Two-column band** — module 4 (left, wider) | module 5 (right).
8. **Module 6** full width.
9. **The trip list** — module 7.
10. **Footer** — `.dlock dlock--foot`: the manual-settlement note and the agent framing, one quiet strip.

**Drill-down — two kinds of click, and the distinction is deliberate:**
- A **dimension** click (a chart column, a class, a Driver, a Dispatcher, a lead-time bucket) sets a **global**
  filter. A chip appears, the whole page recomputes, the URL changes.
- A **component** click (Trip fares, Waiting, Cancellations, No-shows, Not settled, Unfilled) sets `?lens=`,
  which filters **only the trip list** and scrolls to it, with a labelled header ("Showing: waiting charges ·
  12 trips"). It must not touch the charts — a "cancellations" lens that repainted the spend chart would make
  the headline total disagree with itself.

Either way the answer arrives on the same page. No drawer, no separate report screen — `TripRow` already
expands in place, so a drawer would duplicate it.

**What "modular" means here — RECOMMENDED: a fixed pro layout plus saved views via the URL, not
user-rearrangeable widgets.** A hotel GM has no analyst and shouldn't have to build a dashboard to get value on
day one; a drag-to-rearrange board is a large build whose payoff is letting someone construct a worse default.
The modularity that matters is in the code (each module is a self-contained server component reading one
`SpendResult`, so adding or reordering one is a two-line change) and in the URL (every view is a link you can
send to your accountant, and Back is undo). **← founder ruling needed.**

---

## 4. The filter model

**Global — every module and the export obey these:**

| Param | Values | Control |
|---|---|---|
| `p` | `day \| week \| month \| year \| range` | `.seg seg--full seg--5` granularity strip inside the date popover |
| `d` | anchor `YYYY-MM-DD` | `.dxs-date` ‹ label › stepper + **`components/date-cal.tsx`** in a popover |
| `from` / `to` | inclusive Paris day keys, `p=range` only | two taps in `DateCal`, either order, `Done` |
| `cmp` | `prev` (default) `\| year \| none` | small native `<select>` |
| `cat` | `VehicleCategory` | native `<select>` (§ R) |
| `driver` | driver id | **no dropdown** — set by clicking a Driver breakdown row |
| `disp` | dispatcher id | set by clicking a Dispatcher breakdown row |
| `q` | free text | the one `.dx-search` box, `fold()`-ed, over Guest · Driver · reference · address · flight · car |

**Per-module (view state, still in the URL so a link reproduces the screen):** `filter` (§ R outcome chips,
unchanged vocabulary), `lens` (`waiting \| noshow \| unsettled \| ceiling \| late` — money lenses, *not*
outcomes, so § R's four-token vocabulary stays intact), `sort` (§ R's `recent/oldest/high/low`), `dim` (which
breakdown is showing), `g` (chart granularity override), `open` (mission id).

**Two deliberate differences from History:**
- Spend **always has a period** — default `month`, no "Any date". A spend total with no period is meaningless,
  and § T's Suspense key needs a period to re-suspend on.
- Spend **bounds its query by the period instants** (the Earnings shape, `.gte('pickup_at', from).lt('pickup_at',
  to)`) rather than loading the whole archive. Its chip counts are within the period, so § R's growth limit
  does **not** inherit here. A single `loadFirstDay` row powers the "All time" preset.

New files: `lib/spend-filter.ts` (`parseSpendQuery` calls `parseHistoryQuery` first and only adds the five new
params; `spendHref(q, patch)` mirrors `historyHref`) and `lib/spend.ts` (`spendTotals()` returning the same
`x`/`xCount` field-pair shape as `Totals`, built on `settledFare` and `historyFare`). Reuse `HistoryFilters`'
three non-obvious mechanics verbatim: the `live`/`inflight` refs, the never-synced-back local search state with
a 350 ms debounce cleared on unmount, and `step()` computing off the live ref.

Registration: three places in `components/dispatch-shell.tsx` — `NAV` (`{ href: "/dispatch/spend", label:
"Spend", icon: Wallet }`, last), `TITLES`, and the `wideMain` OR-chain. New CSS namespaced `dxs-`.

**Latency (§ T):** the period loads in one `Promise.all`, no query trimming, wrapped in
`<Suspense key={`${p}:${d}:${from}:${to}:${cmp}`}>` with a skeleton mirroring `.etotal` / `.etotal__sub` /
`.ecmp` **and the chart's exact SVG geometry including the axis band**, so nothing jumps. On a same-key
refetch, hold the previous render at 0.55 opacity (the `.dx-calwrap--busy` precedent) instead of flashing a
skeleton.

---

## 5. Charting decision

**RECOMMENDED: hand-rolled SVG, server-rendered, zero new dependencies.** A small `lib/chart.ts` with a linear
scale, a band scale and a nice-ticks helper is about eighty lines and covers all five forms this page needs
(columns, ghost step line, horizontal bars, sparkline, heatmap cells); the charts then render inside Server
Components and appear in the first paint with no measure-then-draw flash and no client bundle.

Recharts v3 is ~147 KB gzipped, ships a full Redux runtime for its state, forces `'use client'` so nothing
server-renders, and has open blank-chart regressions on React 19 — for five chart forms in an app whose entire
dependency list is Supabase, Geist and Lucide, that trade is wrong. If we'd rather not hand-roll the scales,
the only library worth adding is `d3-scale` + `d3-shape` (~22 KB gzipped combined, side-effect-free,
server-renderable). The break-even where a real charting library starts paying for itself is around eight
distinct chart types; we have five.

**Chart rules, applied everywhere:** bars start at zero, rates may not; one navy series plus greys, never a
categorical palette (a muted 5-colour set stops being separable even for full-colour readers); gridlines
`#E3E6EA` solid hairline, axis labels `#5F6B7C` (5.41:1), title `#25344C`; direct labels instead of legends;
every chart card carries a table toggle rendering a real `<table>` with `<caption>`; `role="img"` with a
one-sentence `aria-label`, arrow-key traversal of marks, focused mark announced via `aria-live="polite"`.
**No pie, no donut, no dual axis, no dashed gridlines.**

---

## 6. Honesty and accuracy rules

Non-negotiable, and each gets a one-line footnote on the module it governs — the definitions are published, not
buried.

1. **Not settled stays not settled.** A past trip still `confirmed`/`en_route`/`arrived`/`on_board` shows its
   agreed fare **greyed, labelled "Not settled", excluded from every total** — row, chart bucket, breakdown,
   KPI, CSV column. Exactly `historyFare()`'s `counted: false`. It appears as its own explicit line under the
   components with a count and a euro figure, so it is excluded but never hidden. Counting it would inflate a
   hotel's spend with trips that may never have happened.
2. **Unfilled costs nothing.** `fare: null, counted: true` — renders "—", never "€0", contributes zero, counts
   in the trip count and the fill rate. Its own line: "6 unfilled — no cost".
3. **A cancelled trip with no fee shows "—", not €0.** Legacy rows before 2026-07-13 have a NULL
   `cancellation_fee`; the count is honest, the euro is blank, the note says "fee not set".
4. **Waiting is in the total, on both screens.** § S names waiting charges as one of the four components, but
   History's `spend` currently excludes them. Fix History in the same pass — its `.dxh-sum` bar shows the same
   total with the waiting portion as a sub-line — rather than let two screens report different totals for the
   same filter. A hotel's real bill is fare + waiting.
5. **No double counting a no-show.** A no-show is `status='completed' && no_show=true`, charged at
   `settledFare` plus its waiting. `mission_cancellation.fee_amount` for that row is the *same money* and is
   never added.
6. **Nothing has been charged.** Every figure is what the model says is owed. The footer says so in plain
   words. No "paid", "charged", "invoice", "receipt", "amount due", no settlement affordance, no VAT column in
   the CSV. There is no way to close or settle a trip from here — a Business marking a Driver's work done is
   money, and § Q forbids it.
7. **Agent framing.** The page never shows Kavenue's price. No commission line, no service-fee breakout, no
   gross/net, no "revenue". The fare shown is the fare the Driver accepted — one sentence under the total:
   *"Each fare is the price the Driver accepted, frozen at that moment."* Export filename
   `kavenue-spend-….csv`, and the header row must not read like an invoice.
8. **Freshness stamped.** "as of HH:MM (Paris)", because fares are computed on read.
9. **Caveats printed where they bite.** Amended trips excluded from any Ceiling metric (an accepted amendment
   overwrites `ceiling`); lead time measured from posting (`created_at` resets when a draft goes live); Route
   built from typed addresses that don't merge.
10. **Paris everywhere.** `parisDayKey` / `periodRange`, weeks start Monday, a 00:30 pickup belongs to the
    night that was worked.
11. **French money.** `58,17` on screen and in the CSV; `;` delimiter, BOM, formula-injection escaping — the
    existing export route copied wholesale.

---

## 7. What needs a migration

Three, in order. Everything else on this page is buildable today.

1. `ALTER TABLE mission ADD COLUMN cost_centre text;` plus
   `ALTER TABLE business ADD COLUMN cost_centres text[], ADD COLUMN cost_centre_required boolean NOT NULL DEFAULT false;`
   **Unlocks:** spend by desk / department / event (concierge, events, crew, F&B) — the cut every hotel
   back-office asks for and the only one the data genuinely can't fake. Today the sole allocation hook is
   `reference`, a 20-char unvalidated free-text field. Every tool researched enforces this *at booking*, because
   retro-allocating trips is the chore the product is supposed to remove.
2. `ALTER TABLE mission ADD COLUMN original_ceiling numeric(10,2);` — stamped at post time, never touched by
   `respond_to_amendment`.
   **Unlocks:** a truthful "% of Ceiling reached" and the Ceiling-spread metric on amended trips. Today an
   accepted amendment sets `ceiling = new_fare`, collapsing the spread to zero; the original survives only
   inside `mission_amendment.from_snapshot`.
3. `ALTER TABLE mission ADD COLUMN is_airport boolean;` — written at booking from the existing
   `isAirportPickup()` logic.
   **Unlocks:** airport share as a real dimension (the benchmark for corporate ground transport is 45–50%, and
   a hotel's is higher) instead of a regex over three fields that classifies an airport *hotel* as an airport
   trip.

Worth asking the beta hotels about, not worth building blind: `ALTER TABLE mission ADD COLUMN charge_to text;`
(house / guest) for transfers posted to a folio — a real hotel workflow, and "absorbed vs recharged" is a split
no generic dashboard produces.

Explicitly **not** now: writers for `ledger_transaction`, `payment` or `booking_voucher`; a Guest entity;
`property_id`; actual distance/duration; a real zone table. Each is a phase of its own.

---

## 8. What I would cut

- **Commission, take rate, gross vs net, "service fee" as a line.** D59 and Doc 01. The Pool fare *is* the
  Driver's fare. Doc 01's two-line invoice is the future invoicing artefact, not this screen.
- **A VAT / recoverable-VAT report.** High value and genuinely differentiated — and wrong to ship before
  invoicing exists, because it implies a document Kavenue hasn't issued and a payment that hasn't run.
- **Peer benchmarking ("your no-show rate vs hotels your size").** A real moat later. At beta scale the "peer
  average" is one identifiable hotel. Revisit past ~30 Businesses.
- **Budget vs actual.** No budget table, and "a hotel sets a transport budget inside Kavenue" is a product
  decision nobody has made.
- **CO2 / sustainability.** No emissions data, and distance is a Mapbox estimate.
- **Drag-to-rearrange widgets, an "Add widget" catalog, a report builder.** Enormous build, worse default,
  unsupportable at beta. Fixed layout plus a good CSV; the CSV requests you get tell you which fixed module to
  build next.
- **Scheduled email reports and threshold alerts.** Right idea, wrong phase — notifications are deferred.
- **Async export jobs with an exports history.** An enterprise-volume answer. At 28–500 trips the synchronous
  CSV is instant.
- **Natural-language query.** A dead end without a saveable report model underneath it.
- **Repeat-guest / spend-per-Guest.** Free-text names, no Guest id, no dedupe.
- **A second calendar, a second filter vocabulary, a second exporter.** `date-cal.tsx`, § R's tokens and the
  History export route are the ones.
- **`mission_type` / hourly split and `group_id`.** Dead columns — nothing writes them.
- **Pie charts, donuts, dual-axis, gauges, 3D.**

---

## 9. Phasing

**Pass 1 — the screen you'd call complete.** Filter bar with `DateCal`; KPI row; hero total with decomposed
delta; the four components with Δ columns; spend-over-time chart with the comparison ghost; the breakdown
switcher (Class · Driver · Dispatcher); the waste panel; the trip list; CSV export; the honesty footnotes; the
Suspense skeleton. Plus the companion fix so History's summary bar counts waiting the same way. Fill rate ships
here as a KPI tile.

**Pass 2 — why it cost that.** The booking-notice module (lead time × fare × % of Ceiling × fill rate); the
committed-spend tail on the chart; the Route breakdown; the `cmp=year` control once there's a year of data.

**Pass 3 — the rest.** Service check (on-time from `status_event`, time to accept, re-pooled); the demand
heatmap; the `cost_centre` migration and spend-by-department; a clean one-page PDF the concierge manager
forwards to the GM.

**Before any of it:** the D25 mockup, built from real tokens and the beta Business's real numbers, for the
founder to rule on.
