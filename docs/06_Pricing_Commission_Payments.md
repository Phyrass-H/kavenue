# Doc 06 — Pricing, Commission & Payments

> **Status:** the V1 transfer pricing model. Written and locked with the founder 2026-08-14/15;
> **§4 rate card re-calibrated and re-locked 2026-08-16 (S60)** — two distance bands, First rebuilt,
> a First — van row added, Business van base raised.
> **§1 extended and commission SHIPPED 2026-08-17 (S61):** the pre-filled Ceiling is the Business's
> **all-in** maximum, the Pool price is the Driver's **payment**, and both are now built. Read §1's
> three new subsections before touching anything that displays money.
> **Scope: V1 transfers only.** *Mise à disposition* (MAD, hourly/daily hire) and long multi-week
> missions are **V2 — do not build them.** `mission_type` stays `transfer` for every V1 mission.
> **Source of truth.** Where this doc and any other document disagree about price or commission,
> this one wins. Hand *this file* to any outside session that touches pricing.
>
> Mechanics are locked. The rate-card values in §4 are calibrated against real market data but
> remain tunable — which is why every one of them lives in a table, never in code.

---

## 0. The constraint every rule obeys

Kavenue is an **agent / intermediary, never the principal.** It never buys and resells transport,
and there is no markup. Two things push a platform toward principal status, and both are pricing
questions: **controlling the fare**, and **guaranteeing the service**.

Binding on everything below:

- The Business sets its own Ceiling. Kavenue **recommends** a price; it does not impose one.
- Commission rates are **constants**. They never vary by event, time of day, season, zone,
  urgency, or Business.
- **No discretionary amount may ever be typed in** by a Driver, a Dispatcher or Kavenue after
  acceptance. Every extra must be pre-published, rule-based, and derived from data the system
  already holds.
- Kavenue controls only the **path between two numbers it did not choose** — the Business's
  ceiling above, the cost-based floor below.

If an implementation choice would require a free-text amount, **stop and flag it** rather than
building it.

---

## 1. Commission — LOCKED

| | Before VAT (HT) | With VAT (TTC) |
|---|---|---|
| **Business** pays, on top of the fare | 12.5% | **15%** |
| **Driver** has deducted from the fare | 10% | **12%** |

**The same rates written two ways.** `12.5 × 1.2 = 15` · `10 × 1.2 = 12`. Kavenue's commission
carries **20% VAT** (a platform service fee), which is not optional.

### On a €100 fare

| | |
|---|---|
| Hotel is invoiced | **€115.00** — reclaims the €2.50 VAT, so its real cost is €112.50 |
| Driver receives | **€88.00** — a VAT-registered Driver reclaims the €2, so their real cost is 10% |
| Kavenue collects €27.00 | pays **€4.50** VAT to the state, **banks €22.50** |

### The rule for what carries commission

> **Money moving from the Business to the Driver carries commission. Always.**

Payment for the trip, or compensation instead of it — both carry it. This replaces a list of
cases, because a rule cannot drift.

| Event | Carries commission? |
|---|---|
| Completed fare · waiting time · extra stops · no-show | **Yes** — 15% / 12% |
| Business cancellation compensation | **Yes** — a €90 fee becomes €103.50 paid / €79.20 received |
| Agreed release | **No** — no money moves |
| Driver cancellation penalty | **No** — it is an indemnity, not a payment. ⚑ **The RECIPIENT is open** — see below |

### How to talk about it

| Talking to | Say | Why |
|---|---|---|
| A **Business** | **15%** | It's what appears on their invoice |
| A **Driver** | **12%** | Same reason, their side |
| An **investor** | **22.5% of the fare**, or **~20% of Business spend** | 22.5% is actual revenue; 20% is like-for-like against Uber's ~40%, which is measured on what the customer pays |

⛔ **Never say "27%."** It counts VAT handed to the state as income — overstating the take rate and
understating competitiveness at the same time.

### ⚑ Who receives a Driver's cancellation penalty is OPEN (founder, 2026-08-20)

The line above used to read "it runs Driver → Business" as though that were settled. It is not, and the
founder opened it: **the hotel paid nothing, bills its Guest nothing, and the trip goes straight back into
the Pool — so 100% of the fare is not compensation for a 100% loss.** Their real damage is the price
difference when the trip re-fills dearer (SPEED WIN comes on automatically under 24h, §6), the whole fare
when it never re-fills, and sometimes nothing. The 100% figure is sized to **deter the Driver**, which is a
different job from making the Business whole, and the two point at different recipients.

**What is settled and is not in question:** the penalty **carries no commission** (it is not payment for
transport), and `carriesCommission` / `lib/earnings.ts` / the Driver's own copy already implement that. The
open part is only where the money ends up. Three candidates — damage-first with the remainder to Kavenue, all
to the Business, all to Kavenue — are written up with their trade-offs in BACKLOG **§ Y**, which is also
where the "is 100% enough on a cheap trip" and "100% of the fare or of what they'd have been paid" questions
live. **Decide all three together.**

⚑ **Until then, no screen names a recipient or an amount.** The Business's "Driver cancelled" block (shipped
2026-08-20) states only that a Driver held the trip, when they walked and why. Nothing is collected during
the beta, so nothing is lost by waiting — and a hotel told it is owed money it is not owed would be very hard
to take back.

⚑ **The old wrong wording:** `docs/migrations/2026-07-13_o7_cancellation.sql` (its header, and :93) says the
penalty is owed to **Kavenue**. That file is a superseded historical record — do not carry its wording
forward. The same error had been copied into `app/(app)/rides/history/page.tsx` and was corrected 2026-08-20.

**Have this ready:** someone will add 15 and 12. Kavenue takes **22.5% of the fare, split across two
parties**, each paying less than they would anywhere else. It is the Booking.com structure.

### Why the Driver's rate includes VAT

A Driver with a real company reclaims VAT, so 12% costs them 10%. A very small Driver under
*franchise en base* cannot reclaim, so 12% costs them 12% — the same as any other purchase their
status makes them bear. Kavenue does not adjust its rate for a counterparty's tax status.

---

### Which end of the invoice the Ceiling sits at — LOCKED 2026-08-17 (S61)

**The Ceiling Kavenue pre-fills is the Business's ALL-IN maximum: the service fee and its VAT are already
inside it.** A Business is never shown a number that later grows.

This was genuinely open until S61, and §4 and §1 pulled in opposite directions. §4 calibrated the card against
**retail** — published prices a *customer* pays — and concluded it sits at 70–94% of retail "so a Business
reselling to its Guest keeps a margin". §1 says the Business pays 12,5% HT **on top of the fare**. Read the
card as the fare and a Business's real cost is 80–108% of retail, which breaks §4's own claim on the
cheaper-quoting routes. Read it as all-in and the calibration stays true as written. The founder chose all-in.

⚑ **`mission.ceiling` DID NOT CHANGE MEANING, AND MUST NOT.** It stores the **Course** — the fare the §6 curve
climbs, the Driver is paid from, and every fee, band and cancellation basis is computed against. The all-in
figure is *derived* for display and converted back exactly once, in `createMission`. This is what let a
display-wide change ship without touching a single money RPC.

⚑ **Nobody is shown the Course.** The Business sees `course × 1,15`; the Driver sees `course × 0,88`. The
number in between belongs to neither of them.

⚑ **The Ceiling snaps down when a Business types.** `mission.ceiling` is `numeric(10,2)`, so the Course is held
to the cent — and a cent times 1,15 skips cents, making about one all-in value in eight unreachable (type
170,00 and the neighbouring Courses give 169,99 or 170,02). The form takes the largest Course whose all-in does
not exceed what was typed, and says so. A maximum is a promise not to go above a number.

### The Driver's number is the Driver's payment — LOCKED 2026-08-17 (S61)

Provisional since S48, now permanent: **the price in the Pool is what the Driver banks.** Commission is taken
before anything is displayed, and there is no gross/net language anywhere in either app.

The commission appears in exactly **one** place — the money detail on a trip they hold — because a Driver has
to invoice and file: they need the fee to reclaim its VAT, and the VAT inside the fare to declare it. The same
87,00 € leaves a VAT-registered Driver keeping 79,98 € and one under *franchise en base* keeping all 87,00 €,
which no single number can say.

⚑ **One figure stays gross, deliberately: a Driver's own cancellation penalty.** §1 makes it an indemnity
running Driver → Business, so no commission comes off it — meaning a Driver who has seen 87,00 € all week is
told they owe 98,86 €. The sheet says why. **Whether the BASIS should change** (100% of what they were going to
be *paid*, rather than of the Course) is open and pairs with the "is 100% enough on a cheap trip" question —
both in BACKLOG **§ Y**.

### Where VAT is broken out, and where it is not — LOCKED 2026-08-17 (S61)

**Driver: yes**, for the reason above. **Business: no** — they cannot reclaim VAT on passenger transport, so
the amount is not actionable on screen; what they *can* reclaim is the 20% on the service fee, and that is
already its own line. The transport VAT rate and amount still belong on the **invoice document** when invoicing
lands. **That document stays in French** (`Course` / `Frais de service` / `TVA sur frais de service`) even
though the app's own copy is English — founder's call, S61.

## 2. Every price shown is TTC — LOCKED

All prices displayed anywhere in the app are **TTC** (all taxes included).

**The reason, in the founder's words:** the price Kavenue advises is the base a Business uses to
charge its Guest, and the Guest is the final consumer. One convention everywhere removes any
confusion about which number is which.

---

## 3. The Business invoice — three lines, always — LOCKED

```
Course                      190,00 €
Frais de service (12,5 %)    23,75 €
TVA sur frais de service      4,75 €
─────────────────────────────────────
Total                       218,50 €
```

**Never one collapsed "service fee" line.** The Business reclaims the 20% VAT on Kavenue's fee but
**not** the 10% on the transport, so the two must be separable. The same three lines appear
everywhere the total appears. The Business never sees `driver_net` or the Driver-side rate.

⚑ The transport line must show the VAT that **actually applies**. Both halves of what this
paragraph used to say were wrong, and the code has never done either (corrected 2026-09-02, S74):

- **NOT "0% if not".** ⚑ **There is no 0% rate in France** — the rates are 20, 10, 5,5 and 2,1.
  A Driver who is not VAT-registered is under the **franchise en base**: in scope, charging no
  VAT, and their invoice must carry the exact words **« TVA non applicable, article 293 B du
  CGI »**. A "0 %" line asserts a taxable supply at a rate that does not exist. Since e-invoicing
  went live on 1 September 2026 each line carries a machine-read category code, so the two are
  no longer interchangeable in practice either.
- **NOT "read it from the Driver's `vat_number`".** Read the **snapshot on the mission**. A Driver
  who registers in September must not change the VAT on a trip they drove in August; the
  `2026-08-17_transport_vat_snapshot` trigger freezes the answer at acceptance and the code has
  always read that. This paragraph would have had someone reintroduce a live read and
  retroactively rewrite settled history.

**The rate belongs to the LINE, not the mission** (`lib/vat.ts`, S74):

    what a line carries  =  (the rate for THIS kind of supply)
                         ×  (does this Driver charge VAT at all)

| line | treatment | why |
|---|---|---|
| Transfer — destination agreed in advance | **10%** | `transport de voyageurs`, CGI art. 279 b quater |
| **Mise à disposition** — hourly, no agreed destination | **20%** | a hire, not a journey. CE 13 mai 2025 n° 499031 (Sté Chabé) upheld this against the trade's largest operator. ⚑ **This is the founder's decision of 2026-09-02 and reverses the earlier assumption of 10%.** |
| Waiting time | **follows the ride** | accessory supply. ⚑ If it stops being small next to the fare the exposure is the standard rate on the **whole job**, not a 20% waiting line |
| No-show fee | **in scope**, ride's rate | the Driver travelled and held the car available. Calling it an `indemnité` changes nothing |
| Cancellation — charged to the Business | ⚑ **OPEN** | taxable if it pays for capacity held; arguably out of scope if the Business used a right we granted. Not answered — `taxOf` returns `undetermined` |
| Cancellation — charged to a Driver | **out of scope** | an indemnity. **No VAT line at all**, on its own document, never netted off a commission invoice |
| **Kavenue's own commission** | **20%** | its own supply of intermediation; it does NOT inherit the ride's 10% |

One invoice may lawfully carry a 10% transport line beside a 20% commission line. What is
forbidden is two rates on **one** operation.

---

## 4. Kavenue calculates the price — LOCKED

The Business no longer invents a price. Kavenue computes and **pre-fills** it; the Business can
still edit the Ceiling (§0).

```
ceiling = ceiling_base
        + ceiling_per_km      × min(km, long_threshold_km)
        + ceiling_per_km_long × max(0, km − long_threshold_km)
floor   = floor_base + floor_per_km × km
```

**Distance only — no duration term.** The price must be final when the trip enters the Pool, so it
cannot depend on a traffic estimate that moves between posting and acceptance. Accepted
consequence: the same route prices identically at 07:00 and 18:00. This matches the premium
segment — a sales line, not a compromise. `km` is frozen on the mission at creation. The two
distance bands are still distance-only — one more coefficient, not a duration term.

### Rate card — market `riviera`

First calibrated 2026-08-14 against **192 published prices** from 9 operators plus the regulated taxi
tariff. **Re-calibrated 2026-08-16 (S60)** against four independent sources — **Blacklane**, two
transfer aggregators and **Uber** — across **eleven routes from 5.9 km to 619 km**, including Paris
and three cross-border runs. The card now sits at **70–94% of retail everywhere it was checked**, so
a Business reselling to its Guest keeps a margin. Uber anchors **Eco only**; above the entry tier it
distorts the premium classes.

| Class / body | `floor_base` | `floor_per_km` | `ceiling_base` | `ceiling_per_km` | `ceiling_per_km_long` |
|---|---|---|---|---|---|
| Eco | 12 | 0.65 | 20 | 1.85 | 1.30 |
| **Business — sedan** | **13** | **0.75** | **48** | **2.00** | **1.40** |
| Business — van | 17 | 0.90 | 52 | 2.25 | 1.58 |
| **First — sedan** | 20 | 1.10 | **86** | **3.60** | **2.52** |
| **First — van** | 20 | 1.10 | **82** | **3.42** | **2.39** |

**The two bands.** `ceiling_per_km` covers the first **150 km** (`long_threshold_km`);
`ceiling_per_km_long` — about **70%** of it — covers everything beyond. **The taper is real and was
measured twice, independently:** Blacklane charges 4.36 €/km for a Business sedan at 32 km and
**1.82 €/km at 595 km**; the aggregator reaches the same **1.82** at the same distance. A single
straight line put the card **above retail** past ~200 km. The **floor does not taper** — it stays
linear, and never approaches the ceiling (the tightest pair is 0.65 against 1.30).

⚑ **The threshold is the one unmeasured number** — nobody publishes where their own band turns. The
evidence brackets it (107 km · 193 km · 327 km all land inside the target band). Moving it to 200 km
changes a fare by **3–6%**, shrinking with distance — less than the spread between sources. Tune it
with an `UPDATE` once real trips cross it; do not treat it as load-bearing.

⚑ **First is 1.80× Business per km — measured, not assumed.** The old card had First *below*
Business per km (1.90 against 2.00), leaning on a €115 base fitted from 11 points with **nothing
under 28 km**, which made a 2 km trip cost 5% less than a 5 km one. Two sources put the true ratio
at 1.80. The base fell 115 → 86 and the slope nearly doubled: the line **pivoted around ~17 km**,
cheaper below, dearer above.

⚑ **First — van is 5% under First — sedan** (six paired observations average −5.2%). The S-Class is
the prestige object; the V-Class is a people-mover. Note this **inverts the Business tier**, where
the van is *dearer* than the sedan — a van is an upgrade at Business level and a downgrade at First.

⚑ **The Business van base rose 45 → 52 (2026-08-16)**: below 12 km the van was pricing *cheaper*
than the sedan. Three sources say a van costs more — Uber 1.14–1.37×, the aggregators 1.03–1.12×.
The card now holds **1.09–1.13×** at every distance.

⚑ **Which row a vehicle uses: the V-Class is First, the Vito is Business.** Founder's call
2026-08-16; the market draws the same line. Set in `lib/vehicle-catalog.ts`, and the reason a
**First — van** row exists at all. The Pool consequence is BACKLOG **§ V**.

⚑ **Do not reintroduce a single multiplier per class.** Every row was fitted on its own. The note
that used to sit here claimed First "collapses toward Business" with distance — that came from the
11 bad points and is **wrong**; First runs at 1.80× Business in both bands.

### Night pricing

**×1.20** on ceiling and floor alike, for a pickup between **22:00 and 06:00**, keyed to the
**pickup time**. Store `night_applied` so a past price stays explicable.

⚑ **And SHOW it — shipped 2026-08-20.** The column had been written on every mission since the card landed
and read by no screen at all, so a Dispatcher comparing two identical airport runs could not see why the
23:40 one cost 20% more, and the Driver never learned it either. Now: a quiet tag in the date cell of the
Business row, a badge on the Driver's Pool card and mission detail, a suffix on their Earnings row, and a
column in both CSVs. **Named, never numbered — the tag says "Night rate", not "×1,20".** The multiplier lives
on `rate_card.night_multiplier`, reachable only via `mission.rate_card_id`, which is NULL on the whole
pre-2026-08-16 archive; printing the number in the UI would be a constant in code (§9) and would lie the day
the card is re-tuned.

**This is the only time modifier in V1.** No season, no event calendar, no day of week, no demand
input, no surge, no personalised pricing. Demand-based pricing is commercial judgement and belongs
to the Business.

### Tolls

**Never mentioned, anywhere.** They are inside the price and the Driver deals with them. A toll
billed afterwards would be a discretionary typed amount, which §0 forbids absolutely.

---

## 5. The floor is a guard rail, not a valuation — LOCKED

A trip cannot be posted below the floor. If a Business edits the Ceiling below it, the app
**refuses** and shows the real number: *"The lowest this trip can be offered at is €104.90."*

**The floor is the auction's opening bid — it is not a price anyone is expected to accept.** Its
only job is to stop a Business posting something absurd. It is cost-anchored, which is also the
defensible position under §0: arithmetic on a Driver's cost base, not a fraction of the Business's
commercial decision.

⚑ **Flagged twice, ruled on twice — do not raise it a third time.** S59 flagged the Eco floor as
"too low to be viable". S60 measured it: the floors sit at **25–33% of the lowest price anyone in
the booked market will take** (Nice Airport → Monaco — our Eco floor 33.12 € against a cheapest
booked price of 90 €). Both times the founder's answer was the same, and it is the rule above:
**that is what an opening bid is.** The floors were left untouched in the 2026-08-16 re-calibration;
only ceilings moved.

⚑ **At scale this changes.** With enough Drivers, trips clear early and near the floor — so the
floor quietly becomes the effective price and deserves more care than a guard rail normally gets.

---

## 6. The auction (PDP) — LOCKED

### The shape

**Equal movement every time the remaining time halves.** Two weeks → one week is one step up; one
week → 3½ days, another; 10 hours → 5 hours, another. The same rule at every zoom level, so the
price is alive whether you look a fortnight out or the same morning.

### The rules

1. **Every trip opens at its floor**, whatever the lead time. The pace compresses into whatever
   time exists — a trip posted two days out runs the whole climb over two days.
2. **The ceiling is reached at T−5h**, and the trip then sits at the ceiling until taken or expired.
   Five hours matches the SPEED WIN nudge, so the moment the normal climb runs out is the same
   moment SPEED WIN becomes the tool.
3. **Posted inside 5 hours:** the climb runs from posting to the **midpoint** to pickup, then sits
   at the ceiling. Posted at T−3h → ceiling at T−1h30. Even a very late trip gets a real climb *and*
   time at the top to be taken.
   ⚑ **Rules 2 and 3 overlap between 5 and 10 hours of lead, and rule 2 wins** (founder, 2026-08-22,
   [[d78]]). Rule 3 governs only what it says — posted *inside* five hours. A trip posted 6h out is
   urgent and reaches its ceiling at T−5h like any other, rather than sitting a third of the way up
   its range while the clock runs down. In code: `topLeadFor(lead) = lead > 5h ? 5h : lead/2`.
4. **The curve never starts earlier than 2 weeks out.** A trip posted a month ahead sits at its
   floor until then. Two identical trips for the same pickup are therefore worth the same at every
   moment, whoever typed theirs in first.

### The steps

- **Roughly one step per €2 of gap**, floored at ~8 and capped at ~60, so every rise stays visible
  on a cheap trip and the app still feels alive on an expensive one.
- **Step times are log-spaced, then jittered.** Uneven step *sizes* fall out of that for free —
  one source of randomness, not two.
- **The jitter is seeded from the mission id.** The curve is unguessable from outside but perfectly
  reproducible: every read agrees, and any past price can be replayed and proved in a dispute.
- **The price never goes down**, and always lands exactly on the ceiling.

⚑ **BUILT 2026-08-22 (S64) — `lib/pdp.ts`.** The climb is **linear in `log(time remaining)`**, which is
what "equal movement every time the remaining time halves" means arithmetically. The staircase is that
continuous curve sampled at `n+1` positions, evenly spaced (= log-spaced in time), each interior one slid
by ±0.45 of a step by a `mulberry32` stream seeded from `xmur3(mission.id)`; `n = clamp(round(gap/2), 8, 60)`.
The endpoints are never jittered. **Where the opening price is stored, and why it had to survive a re-pool,
is [[d79]].** Both generators are written out in `lib/pdp.ts` rather than imported — a curve that has to be
replayable in a dispute years from now needs its generator readable beside it.

### Why unpredictable

A predictable ladder lets a Driver compute the optimal moment to wait. Unpredictable steps leave
only one sensible strategy: *take it when it's worth it to me.*

⚑ **This does not contradict the cancellation-fee ruling.** A *penalty* should be predictable so
people can plan around it. An *auction* must not be. Opposite goals, opposite answers.

⚑ **Publish the rule, never the schedule:** *"the price rises in steps until 5 hours before pickup,
when it reaches the maximum the Business set."* True, complete, and still unguessable.

### SPEED WIN

**The same curve with a higher starting point** — nothing more.

- Opens at **70% of the ceiling** instead of the floor. Same shape, same end point.
- **The Business's own checkbox**, available at **any** lead time. A hotel anxious about filling a
  trip can tick it a month out.
- **Never applied automatically at posting.** At **≤5h** the form shows a nudge with a one-tap
  *Enable SPEED WIN* button. Nothing is ticked for them.
- ~~**On re-pool it is automatic** (Driver cancel · reclaim · agreed release): under 24h to pickup →
  on; 24h or more → off.~~ ⛔ **REMOVED 2026-08-22 ([[d82]]).** A re-pool now changes nothing about the
  price except that time has passed. That rule was written when a re-pool RESTARTED the climb at 50 % of
  the Ceiling and needed a boost to fill; there is no restart any more (§6 curve, [[d81]]). And SPEED WIN
  raises where the curve *opens*, so its effect shrinks as the pickup nears — on a 110 € Ceiling, **+33 %
  at T−48h, +7 % at T−12h, +0 % at T−5h**. Switching it on *because* a trip became urgent does least
  exactly when it is needed most. It is also the Business's own checkbox and their own money: Kavenue
  moving it unasked is Kavenue nudging the fare, which §0 forbids. **`speed_win` is now only ever what the
  Business set.** The ≤5h nudge at booking stays — that is the Business choosing.

### What the Business sees

At booking: **"Your maximum cost: €273.67"**, with the range beneath it. They quote their Guest
from the maximum and add their margin. After acceptance, the row shows **what they saved against
that maximum** — the argument for the whole auction, made visible on every booking.

⛔ **THE BOOKING SCREEN DELIBERATELY DOES NOT DO THIS — founder, 2026-08-22 ([[d84]]).** The form
leads with the STARTING price and keeps the maximum on the line beneath, and it stays that way.
Four rewordings were mocked up — including this paragraph's own "maximum first" shape — and **all
four were rejected as too technical for a reader new to how an auction works.** The Ceiling is not
hidden from anyone: the Business typed it two fields above, on the same screen. And a denser
sentence does not teach a model, it only makes a busy screen busier.
**The gap is real and the fix is onboarding, not microcopy** — an enrolment tutorial that teaches a
Business how the pricing works and how to deal with Drivers, once V1 is complete (BACKLOG **§ AC**).
⚑ **Do not "fix" the screen back to the paragraph above.** It records the design intent; [[d84]]
records what ships, and why.

⚑ **The commission follows the accepted fare, never the ceiling.** A hotel that fills cheaply saves
twice: on the fare *and* on the fee.

---

## 7. The 15-second hold — ✅ SHIPPED 2026-09-01 (S72)

A Driver can hold a pooled trip for **15 seconds** to think before committing.

**Why it exists:** an attractive number triggers an impulsive accept, and the Driver then finds it
does not fit their day. That becomes a Driver cancellation — a 100% penalty, a re-pooled trip and a
Business with no car. Fifteen seconds of thinking time is cheap against that.

⚑ **THIS SECTION WAS LOCKED AT THIRTY SECONDS AND A FROZEN PRICE. Both changed on the founder's
call, and both are recorded rather than quietly corrected** — [[d115]] and [[d116]]. What follows
is what is BUILT; where the earlier wording survives anywhere else, this section wins (§0).

- **Fifteen seconds, not thirty.** The founder, S72: *"we are the only one that offers this because
  period of big season and big demands, 15 seconds there's a lot of time to think."* Half the time
  a trip spends off the market, and the price moves even less inside the window.
- ⚑ **THE PRICE IS A FLOOR, NOT A FREEZE.** The Driver is paid **at least** the number they were
  shown, and **more if the curve climbed** while they thought. This reverses the ⚑ that used to
  close this section — *"accept at the price the Driver was shown … removes any 'it changed on me'
  complaint"* — which is consumer logic applied to the wrong party. **The Driver is not the
  consumer; they are PAID this number**, so a price that rose during their 15 seconds is good news,
  and honouring the lower displayed one would bill them for thinking. Measured with `currentFare()`
  across all 364 live trips at the real accept instants: a strict freeze would change the fare on
  **3.4%** of accepts, mean **€0.10**, and 15.6% of accepts are already on the Ceiling where it
  costs exactly zero — ⚑ but on trips posted inside an hour it bites **70%** of the time, ~€2,
  because §6 rule 3 compresses the whole climb into half the remaining lead. Small on average,
  aimed squarely at the urgent trips. The Business pays nothing extra either way: any Driver
  accepting at that same later second pays the climbed price regardless.
- ⚑ **IT IS VOLUNTARY. Accept is unchanged and always there**, and the hold sits beside it. The
  rule below decides this by itself: if holding were the only route to Accept, "one hold per Driver
  per trip" would permanently lock a Driver out of a trip because their phone slept for 15 seconds.
- **One hold at a time per Driver**, or someone parks three trips and blocks the Pool.
- **One hold per Driver per trip** — no releasing and re-holding to reset the clock.
  ⚑ **THE HOLD SPENDS THE HOLD, NEVER THE TRIP.** A Driver who freezes a trip, thinks, and walks
  away comes back — five seconds or five minutes later — to a normal card, and takes it at the live
  price. All they have used up is the right to freeze it again, and the screen says so
  (*"Hold used · you can still accept"*) rather than dropping the button, because a control that
  vanishes reads as a bug.
- **Enforced inside the same gate as Accept.** If it were checked separately, a Driver pressing
  Accept in the same tenth of a second could write past a live hold and steal it. One decision
  point, under the existing row lock. ⚑ This is why `accept_mission` had to be reproduced whole
  rather than fronted by a trigger — a trigger fires after the UPDATE has already picked a winner.
- **The card stays fully readable to everyone else.** On the trip page Accept is replaced by a
  quiet **"Being reviewed · 0:11"** counting down; when it lapses the card silently returns to
  normal. Showing the countdown is deliberate — another Driver knows whether to wait or move on.
  ⚑ On the Pool **list** it is a badge with no clock: making it tick would mean polling the Pool
  ~45 times a minute per idle Driver to carry a 15-second notice.
- **The Business sees "a Driver is reviewing this"** — reassuring, not alarming, and deliberately
  without a countdown: a ticking clock on their screen invites *"so will they take it?"*, and the
  answer is often no.

⚑ **AND THE LAPSE IS RECORDED, WHICH IS THE PART THAT COULD NOT BE ADDED LATER** ([[d109]],
[[d117]]). A hold ends by commit — observed, in the same transaction — or by the clock running out,
which **nothing watches**: no status transition, no trigger, no cron. `hold_lapsed` is therefore
written afterwards by `sweep_lapsed_holds()`, stamped with **when the clock ran out** rather than
when anyone noticed, and labelled `source: 'derived'` so the log never claims to have witnessed
what it reconstructed. `payload.notice_lag_s` carries the delay. ⚑ `hold_void` — the trip cancelled
underneath the holder — is kept SEPARATE from `hold_lapsed`: they are identical in the data and
opposite in meaning, and only the second is a price rejection.

---

## 8. Learned route prices — LOCKED as the design, build later

Per-km pricing is the base everywhere. On top of it, routes learn their own price — so Paris,
Normandy and the Riviera diverge on their own with nobody drawing a zone map.

- **Route key:** start and end snapped to a ~1 km grid, so Cannes → Monaco is always the same key.
- **Threshold:** roughly 15 trips before a key overrides the card. Below that, the card applies.

### ⛔ Never learn from the accepted fare

It would ratchet prices down: accepted fares set the anchor → lower ceiling → lower accepted fares
→ repeat. That is auction psychology deflating the card, not the market speaking.

### The two signals that are safe

1. **Edited ceilings.** A hotel that *raises* the pre-filled number says the card is low on that
   route; one that cuts it says the opposite. The motive is ambiguous — a raise may be anxiety
   rather than valuation — but **the outcome referees it**: raised and it fills instantly at a low
   price means they were anxious, not right.
2. **Fill rate and time-to-fill.** Filling at the floor in minutes says over-priced or
   over-supplied; unfilled, or only clearing near the ceiling, says the card is too low. This is
   how airlines do it — watch the booking curve, not the sale price.

### ⛔ Untouched ceilings do not move the price

An untouched ceiling is Kavenue's own number handed back, not an opinion. Pooling it with real
opinions dilutes them: 90 hotels leaving €112 and 10 raising it to €140 averages to €114.80, which
measures *how many hotels bother to edit*, not what the route is worth. Untouched ceilings
**validate** through the outcome — untouched and unfilled is the strongest signal the card is too
low, because Kavenue's own number failed on its own terms.

**One exception:** a hotel that normally edits and this time does not is a real vote, because
changing it was live for them.

### Where the absolute level comes from

External market benchmarking, refreshed periodically — as in the §4 calibration. The learned layer
adjusts routes relative to that; it never sets the level on its own.

---

## 9. Data rules — LOCKED

- **The snapshot rule.** At creation, the computed values and both commission rates are **copied
  onto the mission row**. Settlement, invoicing and history read the snapshot and must **never**
  join back to the live rate card.
  ⚑ **NULL rates are not zero rates.** A mission with no snapshot was priced *before commission existed* and
  was billed no fee — it renders as one plain amount with no breakdown. Defaulting the columns would
  retroactively invent 15% of charges on every historical row.
  ⚑ **The transport VAT is snapshot LATER, at acceptance**, because it is the assigned Driver's status and
  does not exist while a trip is pooled. A `before update of driver_id` trigger writes it and clears it on
  re-pool — not `accept_mission`, which would have meant editing four money-critical RPCs to copy one column.
- **Changing a rate never rewrites history.** Add a row with a later `effective_from`.
- **Numbers live in tables, not in code.** Recalibration is an `INSERT`/`UPDATE` — never a redeploy.
- **The fare freezes at acceptance.** That frozen figure is the contract price and the basis for
  every cancellation fee, however late the trip closes. Storing it also closes the €0-fee hole,
  since there is finally a fare in the database to recompute a fee against.
  ✅ **BUILT 2026-08-22 (S64)** — `mission.accepted_fare`, written by `accept_mission` from a number
  computed server-side by `lib/pdp.ts` (Postgres cannot evaluate the §6 curve) and clamped into
  `[floor, ceiling]` in SQL. **NULL means priced before this existed** — readers recompute, and nothing
  was backfilled. It is also what makes [[d80]] possible: a re-pool raises `pdp_start` to it, so a trip
  never re-opens below a fare a Driver already agreed to.
- **Rounding: store full precision, round only at render.** Never back-derive a fare from a rounded
  displayed total.
- **Category, never model.** The Business picks a service class, never a make or model.

---

## 10. Extras — LOCKED

### Extra stops — no tariff, three cases

1. **Booked in advance** — the route runs through it, so it is already in the price.
2. **Last minute, short or on the way** — the Driver does it as goodwill.
3. **The Business formally adds it** — an **amendment**: route, distance and fare are recomputed and
   the **Driver accepts or declines**, with an audit trail.

There is no fourth case common enough to justify a tariff. **Dwell time is deliberately unpriced**
in V1 — a flat fee would charge the same for a 2-minute stop and a 20-minute one.

⚑ When dwell time is eventually priced, the machinery exists: the Driver already taps
**"Reached — <stop>"** on every stop, so the timestamps are recorded.

⚑ **Build note:** an amendment's new fare must be **recomputed from the rate card** using the new
distance — never typed.

### Waiting time

Courtesy **20 min city / 60 min airport**, then **€1/min** Business → Driver, capped at **€40 city /
€60 airport**. Derived from status timestamps, never typed. Billed at completion, carrying both
commissions.

⚑ **THE €1/min IS A PLACEHOLDER, NOT A LOCKED RATE (D48).** The founder set it to unblock the build. It lives
in exactly two places, on purpose: `WAITING_RATE_PER_MIN` in `lib/cancellation.ts` (what is displayed) and
`v_rate` in the live `mission_waiting()` (what is charged — currently defined in
`docs/migrations/2026-07-22_airport_accent_fix.sql`, which superseded the original migration). Changing it
never re-prices a settled trip: `mission.waiting_rate` is stamped onto each row.

### The rate, researched — BUILT, awaiting the migration (S62, 2026-08-18)

**The founder's objection to the flat €1:** *"1 € on a 40 € trip doesn't make sense compared to a trip that
costs over 500 €."* A market scan was run to answer it. **The finding is that nobody scales waiting with the
fare — every operator that publishes a rate tiers it by VEHICLE CLASS**, which is the same lever, because a
40 € trip is an Eco job and a 500 € trip is a First one. Uber is explicit that the wait rate is excluded from
surge; their Berline rate is only 1,57× their Eco rate on fares that run 2–3× apart.

**PROPOSED — per class, replacing the flat €1:**

| | proposed | the Business sees | the Driver banks | cap, city | cap, airport |
|---|---|---|---|---|---|
| Eco | **0,50 €/min** | 0,58 | 0,44 | 23,00 € | 34,50 € |
| Business | **0,75 €/min** | 0,86 | 0,66 | 34,50 € | 51,75 € |
| First | **1,00 €/min** | 1,15 | 0,88 | 46,00 € | 69,00 € |

**The market it is calibrated against** (all EUR/min, gathered 2026-08-18):

| | rate | note |
|---|---|---|
| Welcome Pickups (airport transfers) | 0,40 · 0,60 · 0,80 | per 15-min block, tiered by vehicle |
| **French taxi, Alpes-Maritimes** | **0,58** | 34,55 €/h — the local regulated ceiling |
| French taxi, national ceiling | 0,70 | 42,15 €/h, *arrêté du 24 décembre 2025*, in force 2026-02-01 |
| Uber France | 0,70 Eco · 0,90 Comfort/Van · 1,10 Berline | raised 2024-09-16 |
| FREE NOW France | 0,50 Standard · 0,75 Priority/Van | **the same two numbers proposed above** |
| Marcel | 0,50 e•co · 0,60 Berline · 0,70 Business | |
| GroundLink | 0,80 sedan · 0,89 SUV | the one operator that scales — non-airport waiting prorates the hourly rate of the class booked |
| Addison Lee ≈ 1,15 · Sixt Ride ≈ 1,45 | | chauffeur segment, secondary sources |
| LeCab | 0,33 Green → 1,88 Prestige | figures look derived from an hourly rate |
| Blacklane · Wheely | not published | |

**The sentence it buys:** *an Eco minute costs less than a taxi minute in this département; a First minute
costs what a chauffeur firm charges.*

⚑ **THE STORED RATE MUST BE THE COURSE-SIDE NUMBER, and it must be a clean cent.** `mission.waiting_rate` is
`numeric(10,2)`. Rounding the *Business-facing* rate instead would mean storing 0,43 to show "0,50 €/min" —
which actually displays 0,49 and bills **9,89 €** for twenty minutes. The headline would be false. Stored on
the Course side the arithmetic is exact at every duration: 20 min → meter 10,00 · Business 11,50 · Driver 8,80.

**The free wait is CONFIRMED as it stands** — 20 min city / 60 min airport (founder, 2026-08-18): that is the
private-hire convention, and Blacklane's published policy is 15 min at a street address and 60 min at an
airport. The 2–5 minute windows found in the scan are ride-hail (Uber, Bolt, FREE NOW), a different product.

⚠️ **The caps move with the rate.** €40 / €60 are not typed anywhere — they are 40 and 60 *paid minutes* (the
60/120-minute money ceiling less the courtesy wait) times the rate, which is why the table above shows Eco
falling to 23 €/34,50 € while First is unchanged. Most of the market caps in MINUTES rather than euros (FREE
NOW stops the meter at 3 min) or not at all, leaving the Driver the right to go. Decide the minute ceilings in
the same pass as the rate.

**Status: SHIPPED 2026-08-18** — migration applied, deployed, and verified end to end on a live Eco trip
(the Driver's screen read "0,50 € per minute started · stops at 20,00 €"; boarding the Guest made SQL stamp
`waiting_rate 0.50 · waiting_fee 9.50` on 19 minutes). Already-settled rows keep their own stamped rate. `WAITING_RATE_PER_MIN` in
`lib/cancellation.ts` is now a per-class table and `waitingBetween()` takes the rate as a REQUIRED argument,
so a screen that forgets it fails to compile rather than billing the wrong class. The three meters
(`dispatch-waiting`, `dispatch-cancel`, `rides/cancel-noshow`) each read it from the mission's own class.
⚑ **The two halves must always move together** — `docs/migrations/2026-08-18_waiting_rate_by_class.sql`
and `WAITING_RATE_PER_MIN`. If either is changed alone the meter quotes one rate and settles another.

⛔ **The clock starts when the GUEST was due** — `guest_ready_at ?? pickup_at` — **never from the
Driver's "I've arrived" tap.** Anchoring it to arrival was a live exploit and was fixed. Do not
re-introduce it.

✅ **The Business keeps its live running meter.** They are the only party who can stop the clock by
calling the Guest.

### The SETTLED wait now states its own rate — shipped 2026-08-20

`mission.waiting_rate` was stamped on every settled row and rendered nowhere: the rate was only ever spoken
while the meter was live, so a Driver who banked 13,20 € had nothing on screen to check it against. Both
sides now read **"N min at X €/min"**.

⚑ **Each side sees the rate on ITS OWN basis, and only where the arithmetic survives being checked.** The
Driver's net rate is ×0,88 — 0,44 · 0,66 · 0,88, all clean cents, so minutes × rate is exactly the amount
printed beside it. The Business's all-in rate is ×1,15, and 0,50 becomes **0,575**: it displays "0,58 €" and
0,58 × 20 is 11,60 against a true 11,50. So a Business rate is stated **Course-side only, inside the invoice
table** where the fee lines follow it and the total still reconciles; the row face and both CSVs get the
**minutes without a rate**.

⚑ **Read the STAMPED column, never `waitingRatePerMin(category)`.** That helper is the LIVE rate. Rows
settled between 2026-07-22 and 2026-08-18 were billed a flat 1,00 whatever their class, and older rows have
no rate at all — re-deriving one from the class would put a false number beside a real amount. A row with no
stamped rate shows the minutes alone. `formatWaitingSpell` in `lib/format.ts` is the one place this is
decided; `tests/format.test.ts` pins it.

⚑ **`waiting_rate` non-null does NOT mean the trip waited.** Both no-show paths stamp the rate
unconditionally, so a punctual no-show carries a rate with 0 minutes and a 0,00 fee. Gate on the minutes.

---

## 11. Corrections that must not be re-imported

Outside sessions have produced pricing material without access to what is already built. If these
reappear, they are stale, not new:

- The waiting clock does **not** start at the Driver's arrival (§10).
- The Business **does** keep its live waiting meter (§10).
- The Pool has no "zone list" — it filters on the **Driver's base + service radius**.
- Commission is **not** 15%/12% before VAT. Those are the TTC forms of 12.5%/10% (§1).
- The rate card is **not** a single straight line, and First is **not** `115 + 1.90`. Both were
  superseded 2026-08-16 (§4). Anything quoting a **four-row** card, a row called **"Luxury"**, no
  long-distance band, or First priced *below* Business per km is the pre-S60 version.
- `docs/06` is this file. Any other numbering for it is a document that never existed here.

---

## 12. Still open

| | Question | Status |
|---|---|---|
| 1 | ~~First card is provisional — no market data below 28 km~~ | ✅ **Closed 2026-08-16** — re-fitted on four sources; First is 1.80× Business per km |
| 2 | Is 100% a strong enough Driver-cancellation penalty on a cheap trip? | Parked, not blocking |
| 2b | **Who actually receives that penalty** — the hotel lost nothing it paid for | **Opened by the founder 2026-08-20.** Parked with § Y; no screen names a recipient until it is answered |
| 3 | ~~Business and Van read slightly low against the founder's market knowledge~~ | ✅ **Closed 2026-08-16** — Business confirmed at 80–90% of Blacklane; van base 45 → 52 |
| 4 | The 150 km band threshold has no direct evidence | Tunable; worth 3–6%. Revisit once real long-distance trips run |
| 5 | Eco has no premium-source check above 110 km | Blacklane sells no entry tier; aggregators + the founder's own Geneva figure cover it |
| 6 | Should prices rise with demand, as aggregators do? | Parked by the founder → BACKLOG **§ W** |

**Payments (Stripe) are deliberately deferred.** When they land: collection-on-behalf wording, a
self-billing vs Driver-issued-invoice decision, and the invoice of §3. Driver bank details are not
collected today — that is Stripe's job. Build the payment layer behind an interface; do not
hard-wire Stripe into mission logic.

---

## 13. Build order

1. **`rate_card` table + seed rows + the §4 formula.** Pre-fill the ceiling on `/dispatch/new`,
   enforce the floor.
2. ~~**Commission, the two displays, the three invoice lines, snapshot columns.**~~ ✅ **SHIPPED 2026-08-17
   (S61)** — `commission_rate` + snapshot columns + `commission_split()`, mirrored by `lib/commission.ts` in
   integer cents (float loses the exact `.5` ties Postgres rounds). All-in for the Business, net for the
   Driver; see §1.
3. ~~**The §6 curve**, replacing the `pdp_start`/`pdp_step`/`pdp_interval` climb.~~ ✅ **SHIPPED
   2026-08-22 (S64)** — `lib/pdp.ts` + `2026-08-22_pdp_curve.sql` (the three re-pool RPCs stop
   overwriting the opening price). `pdp_start` now holds the rate-card **floor** in Course space and the
   fee-basis band is unchanged and more accurate for it ([[d79]]); `pdp_step` / `pdp_interval` are dead
   columns. Money tests rewritten (455), both migration probes updated, `write-test` 170/170, plus a new
   `curve-live` probe against the real DB. **Still owed:** the two riders (§ R growth limit, BACKLOG
   § V), the Business-facing copy sentence, and §9's stored accepted fare.
4. ~~**The §7 hold** — after the pricing engine, since both touch the accept path.~~ ✅ **SHIPPED
   2026-09-01 (S72)** — `2026-08-31h` (`mission_hold`, the events, `place_hold`/`release_hold`/
   `sweep_lapsed_holds`), `2026-08-31i` (the gate inside `accept_mission`, transformed from the
   extracted live body), `2026-08-31j` (`place_hold` returns void — a SECURITY DEFINER composite
   return is not subject to column privileges). **Shipped at 15 s and with a price FLOOR** — see §7.
   ⚑ Its events shipped in the same commit as the feature, because a lapse leaves no row behind.
5. **§8 learned routes** — once there is volume.

⚑ **Fix on the way:** the Pool loads the whole archive and filters in memory. Already flagged as the
first thing to break at scale, and the curve arrives at the same time.
