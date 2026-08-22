# Kavenue — "What next?" checklist

> A decision aid you can tick through. **Snapshot: 2026-07-19.** The canonical lists stay
> `project/BACKLOG.md` + `project/IDEAS.md` — this is just a scannable menu to help you pick.
>
> **How to use:** check `[x]` the things you want to do soon; the buckets below tell you what's
> *actually* ready vs. what's waiting on a decision, a domain, or the integration green-light.
>
> Tags — **S** = small (hours) · **M** = medium (a session) · **L** = large (multiple sessions)
> · **schema?** = needs a small additive DB migration you run in Supabase.

---

## 🟢 A. Buildable now — features + polish (no third-party APIs)

These honour "features & polish first." Pick freely.

- [ ] **Driver app redesign** — **L**, no schema. The Driver app got the navy colours but never a
      layout redesign the way Dispatch did (Pool · mission detail · My Rides). Preview first (D25),
      then build to match. *Bundled small fixes:* "Complete ride" button → green; re-export the logo
      to harmonise its sky-blue with navy.
- [ ] **Mission-form guidance — Tier 2** — **M**, mostly no schema. A "?" glossary tooltip for the
      core terms (Ceiling · Pool · SPEED WIN · Lock-in · status pills), a Dispatch status legend
      (reuse the calendar's), Lock-in/T-180 in plain words both sides. Plus **smart "most-used"
      defaults** + wire the saved **default vehicle class** into the form (saved but not read yet).
- [ ] **Saved-addresses address book** — **M**, schema? yes (small). Multiple saved pickup/drop-off
      places per Business + a one-tap picker on both ends of the Route card. The "your address" +
      pre-fill + swap plumbing already exists (S29).
- [ ] **Mission history (archive view)** — **M**, no schema. Dispatch shows only current/active
      trips; add a month → list → detail archived history for Business and Driver.
- [ ] **Midnight-edge date guard** — **S/M**, no schema. Disambiguate 00:00–04:00 pickups
      ("nuit de dimanche à lundi, 00h15") + an inline confirm, so both sides read the same night.
      *(Your 2026-07-05 safety concern.)*

### Quick-polish batch (an hour or two each)
- [ ] Pricing vehicle chip — also show the **specific car model** (shows class·body only now).
- [ ] Amend-form "New agreed fare" — apply the **numeric sanitize** the other forms already have.
- [ ] Detail-edit trail — a **"…and N earlier edits"** expander (data's stored; only latest shows).
- [ ] Calendar day → **click-through** to a day-filtered schedule.
- [ ] Bind the Driver's car to the **catalog picker** (they free-text make/model today).

---

## 🟡 B. Needs a decision from you first (I can't start until you rule)

- [ ] **Pricing engine** — you're building the model. Unblocks the *suggested Ceiling/base-fare
      range* on the form + the auto price-delta on amendments. Rule locked: **no empty-return charge.**
- [ ] **Ultra-luxury "Exception" tier** (Rolls/Bentley above First) — a taxonomy call.
- [ ] **"Business vets the Driver before confirm"** — optional Settings toggle, off by default. Yes/no?

---

## 🟣 C. Parked on the Kavenue domain (name settled — waiting on you registering the domain)

- [ ] **Google Places** swap for address search (the real POI fix — restrict the key once, after DNS).
- [ ] **Domain migration** `pickupbedriven.com` → a Kavenue domain.
- [x] **Code/copy rebrand** PickUp → Kavenue — **done S44** ([[d51]]). Repo **folder** renamed 2026-08-06 → now
      `02_Cactus/Kavenue/Kavenue_project_dev`. **GitHub repo** renamed 2026-08-23 → `Phyrass-H/kavenue` (S65).
      ⚑ Still yours, and it is the bigger trademark exposure: **`pickup-marketplace.vercel.app` is still a live
      production alias** — Vercel never released it when the project was renamed. See `NEXT_SESSION.md` § 1.
- [ ] URL-restrict the **Mapbox token** (do it during the domain move).

---

## 🔵 D. Deferred to the integration phase (your explicit green-light)

- [ ] **Notifications (Resend email + web push)** — the #1 functional gap.
- [ ] **Real email/magic-link auth** (retire dev-login).
- [ ] **Payments / Stripe Connect** — card-per-mission · commission split · ledger · voucher · payouts.
- [ ] **Admin verification workspace** — onboards real drivers/hotels (founder-priority once live).
- [ ] Flight tracking API · analytics/monitoring (Sentry + PostHog).

---

## ⚫ E. O7 leftovers · hardening · V2 (tracked — not now)

**O7 remaining**
- [ ] Copilote community hand-over (needs the community/registration layer).
- [ ] SPEED WIN reachability gate (needs Driver geolocation).
- [ ] Disputes / mediation.
- [ ] § H2 security flags — the Business-UPDATE RLS gate is **HIGH for real prod**, ~nil in beta.

**Engineering hardening (before real production)**
- [ ] Automated tests (money / PDP / `accept_mission` / RLS first) — biggest gap.
- [ ] CI on PRs · generated DB types · error monitoring.

**V2 (track only — CUT in spec)**
- [ ] Vehicle taxonomy expansion (Bus tier · First-van · cargo m³ bands · PRM).
- [ ] Grouped missions (car + luggage van) · smart trajectory Pool · driver skills.
- [ ] At-disposal hourly form · Guest app · business multi-access · full i18n.

---

**My recommendation for "next":** the **Driver app redesign** (A) — the last major in-app surface
still on the old layout, no integrations needed, and it uses the preview-first loop. **Guidance
Tier 2** or the **saved-addresses book** are the strong smaller picks if you'd rather ship something
tighter first.
