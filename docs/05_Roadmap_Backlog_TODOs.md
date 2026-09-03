# 05 — Kavenue · Roadmap, Backlog & To-dos

> Scope: features deferred past V1 (with their original detail preserved so nothing is lost), open decisions, and immediate action items. V1 scope is in Doc 02.
> **Last updated:** current session.

---

## Immediate to-dos
- [ ] Book a French VTC/tax lawyer + expert-comptable; bring the open questions from Doc 01.
- [ ] Confirm all ~200 Drivers are REVTC-registered with valid carte pro + insurance.
- [ ] Start/declare DGITM registration; obtain Kavenue RC Pro insurance.
- [ ] Secure hotel-side connections for the beta (the liquidity gap — Doc 04).
- [ ] Lock commission % and the exact PDP curve parameters (start %, step size, interval, ceiling logic, hard-floor level).
- [ ] Define the booking-voucher template (7 mandatory fields, arrêté 6 Aug 2025).
- [ ] Confirm who is the technical owner of the build.
- [ ] Decide native vs PWA for the Driver app (default: PWA first).

## Open decisions
- Commission split exact numbers (teaser says ~12.5% Business / ~10% Driver).
- Whether commission is carved out of the fare or added on top (shifts invoice presentation + the money-flow numbers in Doc 01).
- Native Driver app trigger: when does background GPS / push justify going native?

---

## V2+ backlog (deferred features, with original detail preserved)

### Payments & billing (V1 = card per mission + Stripe Connect split only)
- **Prepaid account / virtual wallet** — Dispatchers prepay; costs of large missions or series auto-deducted from the wallet.
- **Periodic (weekly) billing** — for Businesses managing high ride volume, to simplify payment.
- **Service Level Agreements (SLA)** — negotiated terms (payment conditions, deadlines) for large accounts or complex missions.
- **Diversified payment options** — bank transfers, direct debits for substantial payments.
- **Financial dashboard** — monitor costs, payment status, wallet balance.
- **Driver payouts** — weekly; a pay-week runs Mon 04:00 to the following Mon 03:59 (per original mockup). V1 = manual weekly batch; automate via Stripe Connect later.

### Cancellation & conflict (DECIDED 2026-07-13 — see project/DECISIONS.md D45; euro amounts settle MANUAL in beta)
- **Driver cancellation (voluntary) = ALWAYS 100% of the trip amount** — no early-notice reduction; deliberately tough (Kavenue must be reliable for Businesses). It is a penalty owed to Kavenue-the-intermediary, never a transport charge (agent position, Doc 01). Escape valves (no fee): hand the mission to a copilote (Phase 2, below) or the Business agrees to release it back to the Pool. _(Supersedes the earlier draft tier: >1wk €10 / gradual / <48h full.)_
- **Business cancellation = free until 5h before pickup; 50% at T-5h; then +10% per hour to 100% at pickup** (−4h 60% · −3h 70% · −2h 80% · −1h 90% · 0h 100%). Replaces the earlier week-based draft (Riviera/airport transfers are short-lead). **Kavenue's commission is non-refundable.**
- **No-show = Driver paid in full (like a completed mission).** Fires on-site (status `arrived`) when the Guest doesn't appear within the wait window — **1h airport · 20 min city**. The Business is charged the full fare and settles with its own Guest. Deeper mechanics (contact-attempt gate, evidence, clock origin) TBD.
- **T-60 Business reclaim** (NOT a cancel): only when the assigned Driver hasn't confirmed the Lock-in AND is unreachable, Kavenue unlocks a reclaim button so the Business takes the trip back and re-pools it as a SPEED WIN (penalty-free for the Business; Driver takes a reliability mark). Gated to the non-confirmation state so it can't be abused.
- **Mediation / conflict resolution (deferred):** report via email; Kavenue reviews evidence (accept time, flight landing, contact log, proof of service) and mediates; corrective actions range from financial restitution to rating adjustments or sanctions.

### Communication (V1 = reveal phone numbers + tap-to-call)
- **In-app chat & voice calls** — message/call without leaving the app.
- **Group event chat** — broadcast to all Drivers on a multi-driver event, replacing external WhatsApp groups.

### Tracking (V1 = 4 status buttons → realtime feed)
- **Continuous live-map GPS** of the Driver moving toward pickup.
- **Geolocated alerts** — strikes, road closures, local events.

### Mission creation & scale (V1 = single missions)
- **Grouped missions** — create many missions in one process (e.g. 26 V-Class vans, 11–23 May, 9am–10pm); the app posts them individually, with tools to adjust/track/communicate across the group.
- **Management via Administrator account** — assign roles, adjust permissions, oversee all dispatch activity.
- **Multi-Dispatch** — multiple Dispatcher seats per Business account, each with individual rights, under centralized control.

### Access badges — where a Driver is allowed to PICK UP (founder, 2026-09-03 · [[d128]])

⚑ **The asymmetry is the whole feature: a drop-off is always allowed; a PICKUP is what needs the
permit.** A Driver with no badge can take a hotel guest *to* the airport or *to* Monaco all day.

**Live data, 2026-09-03 (370 missions):**

| | pick up there | drop off only |
|---|---|---|
| **Monaco** | **46** (First 37 · Business 4 · Eco 5) | 56 |
| **Nice airport** | 4 (Eco 3 · Business 1) | 107 |

⚑ Today's airport mix is drop-off-heavy, but that is the seed's shape, not real demand — design
for the traffic at scale, not for these four rows.

#### MONACO — decided, and it is not just a badge
A French VTC needs **three** things (Ord. Souveraine n° 1.720 du 4 juillet 2008, modified by
n° 9.841 du 27 mars 2023, in force 1 April 2023):
1. an **authorisation** from the Direction de la Sûreté Publique — French applicants must be
   registered in **Alpes-Maritimes or Var** and adhere to a **quality charter**;
2. a **vignette per VEHICLE**, unique and non-transferable;
3. ⚑ a **déclaration préalable de course, at least TWO HOURS before the journey, for every trip.**

⚑⚑ **THE PRODUCT CONSEQUENCE, and it is not a settings field.** Kavenue is an auction whose price
climbs toward pickup and whose trips are often taken late. **A Monaco pickup cannot be lawfully
accepted inside two hours of pickup — by anyone.** Monaco therefore needs a **lead-time floor**
as well as a capability flag. A trip that reaches T−2h unaccepted is dead for Monaco pickups even
though the curve says it is still climbing.

⚑ **THE RETURN LEG IS EXEMPT (founder, 2026-09-03) — and this is what makes Monaco workable.**
*"Yes you can take the same person back out, but I think it's within 3 hours or something like
that."* ⚑ **The window is NOT confirmed** — the founder is verifying it at the authority in person.
**Do not code 3 h until they come back with it.**

So the T−2h floor applies to a **cold** Monaco pickup, not to a **return**. Kavenue can pair an
outbound with its return, and the pairing is what makes the return legal — meaning a Monaco
pickup at short notice is possible for the Driver who brought that passenger in, and only them.

**Questions to put to the Direction de la Sûreté Publique**, so the visit is productive:
1. Does the return still need a *déclaration préalable*, or none at all?
2. What starts the clock — drop-off, or arrival in Monaco — and how long is it?
3. Same Driver only, or same vehicle too? Same passenger, or same booking?
4. Must the outbound declaration have announced the return?
5. ⚑ Does the exemption cover the **declaration only**, or the whole regime? If the authorisation
   and vignette are still needed, an unpermitted Driver still cannot do the return — and that one
   answer decides whether this is a **scheduling** rule or a **capability** rule.
6. What if the party changes size (brought 2, take 4 back)?

#### AIRPORT — NOT decided, on purpose
Aéroport Nice Côte d'Azur gates its dedicated pickup lanes on **two** things: a nominative driver
**badge bleu** (≈ 13,89 € HT/year) **and** an annual **vehicle** access authorisation.
⚑ One hangs on the Driver, one on the car.

The founder is explicitly undecided: *"I'm not sure I want to filter that — maybe not for Eco,
they can park in the parking and deal with it. Before business or first maybe the airport badge
should be mandatory."* So a possible rule is **class-dependent** (Eco unfiltered, Business/First
requiring the badge) — which no existing rule in `lib/eligibility.ts` is, and that is a real
design step, not a flag.

#### The shape to build
`lib/eligibility.ts` already has the right structure — a type-keyed
`Record<EligibilityRuleId, { kind: "refuse" | "hide" }>` where **`refuse`** is SQL turning an
accept down and **`hide`** is the trip never appearing, plus a `decidesNothing` list for facts
recorded but consulted by nothing.

⚑ **Staged to match the founder's own certainty:**
- **Monaco → enforce.** A new rule, and because `refuse` rules live in `accept_mission`, it needs
  a **migration** (the founder runs it). Plus the T−2h floor.
- **Airport → `decidesNothing` first.** Recorded on the Driver, rendered on their settings and on
  the admin console, gating nothing, until the founder decides. This is what the `decidesNothing`
  list is *for*, and it means the data starts accumulating before the rule exists.

⚑ **DO NOT key any of this off `driver.operational_zones`.** That column decides nothing and has
since 2026-06-17; matching is base + radius ([[d128]], and `CLAUDE.md` § Key data facts, corrected
2026-09-03). ⚑ And `mission.zone` is **not** safe as-is either: the live spread is
`cannes` 159 / `Cannes` 2 / `nice` 114 / `Nice` 3 / `antibes` 44 / `Antibes` 1 / `monaco` 46 —
**mixed case**, harmless while nothing reads it, a silent mismatch the day something does. The
pickup's coordinates are the fact; a town label is a convenience.

### Driver tools & reliability
- **Driver→Driver hand-over ("copilote") — O7 Phase 2 (DECIDED model, 2026-07-13, D45).** A full **transfer (novation)** of a booked mission to another verified, **same-category** Kavenue Driver — **NOT subcontracting**: the original Driver drops out entirely (no pay, no invoice, no liability) and keeps only a "passed on" trace; the copilote **re-accepts on their own account** and becomes the Driver of record. Avoids the outright-cancel penalty and keeps service uninterrupted. **Legally confirmed viable** (cleaner than sous-traitance — Kavenue stays the pure intermediary; the credential gate is what keeps it legal, since *sous-traitance illicite* is a named REVTC offence from 2026). Requires the community/registration layer + credential-gating (WAY-Partner model). Precedent: Drivalty · iaDriver · WAY-Partner · VTC cooperatives. See D45 + IDEAS.md.
- **SPEED WIN reachability gate (DECIDED, build later — D45)** — a SPEED WIN can only be accepted by a Driver who can **physically reach the pickup on time**: geolocate the Driver, compute the GPS ETA to pickup, and **block acceptance with a popup** if they'd be late. Needs Driver geolocation + a Directions ETA call.
- **Multiple vehicles** per Driver.
- **Auto invoice / quote / purchase-order (PO) generation** for Drivers operating as companies, with a feature opt-in selector.

### Ratings & trust
- **Mutual rating** after each ride; **excellence badge**; rating-based ride-access priority/throttling; automated punctuality/quality scoring.

### Targeting & priority
- **Favourite-driver** priority window before pool release; **badged-driver** targeting; **SPEED WIN** visibility boosts (SPEED WIN itself is in V1).

### Reporting & analytics
- Performance reports by period/client/vehicle/segment/Driver/mission; year-over-year comparator; profitability analysis with external expense import; CSV export.

### Pricing (V1 = simplified deterministic PDP)
- **Full Dynamic Pricing** — algorithm suggests a rate from demand, season, time of day, local events (with Business able to adjust). Layer this on once there's real ride data to tune it.

### Distribution (long-term)
- **Amadeus GDS** integration; **public-sector** transport contracts.
