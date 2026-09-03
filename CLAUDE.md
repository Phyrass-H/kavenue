# CLAUDE.md — Kavenue (read me first, every session)

Kavenue is a **B2B VTC booking marketplace** — a French *centrale de réservation VTC*.
Professional VTC **Drivers** ↔ **Businesses** (hotels first) that need transport.

## Source of truth (do not contradict)
The spec docs live in **`docs/`** and are canonical. **Read on demand** — open the relevant one when a decision
touches it; don't read them all at startup (see `project/NEXT_SESSION.md` for the lean startup set):
- `docs/00_Overview_and_Index.md` — what Kavenue is + the glossary
- `docs/01_Legal_VAT_Compliance.md` — agent/intermediary positioning, VAT, voucher rules
- `docs/02_Product_Features_MVP.md` — V1 scope: **KEEP / CUT / MANUAL** per feature
- `docs/03_Technical_Stack.md` — stack & architecture
- `docs/04_Business_GTM.md` — market, beta strategy
- `docs/05_Roadmap_Backlog_TODOs.md` — deferred (V2+) features & open decisions
- `docs/Kavenue_Phase0_Data_Spine.md` — entities, enums, state machine
- `docs/kavenue_schema.sql` — the actual DB schema (RPCs + RLS)

## For session continuity, read `project/`
- `project/SESSION_LOG.md` — chronological log of each session (the resume point)
- `project/CHANGELOG.md` — plain-language, founder-facing history of what shipped (the simple read)
- `project/DECISIONS.md` — decision log (what was chosen and why)
- `project/IDEAS.md` — parked ideas / backlog not yet in the spec
> Keep these current. A new session should pick up from the latest `SESSION_LOG.md` entry.

## Hard rules (never break)
1. **Glossary — use these exact terms, always:** Business, Dispatcher, Driver, Guest,
   Pool, PDP, Ceiling, SPEED WIN. **Never** "client" or "principal".
   ⚑ **And never "hotel" as a synonym for Business** (founder, S71 — [[d99]]):
   *"the vocabulary is Businesses and then categories by type of business."* Hotels are
   the first vertical, not the shape of the market; the nine types live in
   `lib/business-type.ts`, and one of them is a VTC operator posting its own overflow.
   Say "hotel" only when you mean a Business whose type IS `hotel`.
2. **Kavenue is an AGENT / intermediary, never the principal.** This is a legal/VAT
   position (Doc 01). Never frame Kavenue as the transport operator or reseller.
3. **Kavenue ≠ PickUp Go.** They are different things; do not conflate.
4. **The schema is ALREADY APPLIED to the live Supabase DB.** Never recreate, migrate,
   drop, or re-run `docs/kavenue_schema.sql`. Generate TypeScript types FROM it.
5. **Build NOTHING marked CUT in `docs/02_Product_Features_MVP.md`.** Build only KEEP.
   MANUAL items are done by a human in beta — don't build UI for them unless told.

## Stack (decided)
- Next.js (App Router, TypeScript) on Vercel · PWA-first.
- Supabase for DB / Auth / Realtime / Storage. `@supabase/supabase-js` + `@supabase/ssr`.
- Service-role key is **server-only** (bypasses RLS). Browser uses the anon/publishable key.

## Environment
- Secrets live in `.env.local` (git-ignored — never commit). Template: `.env.example`.
- Supabase project ref: `luitjivedqiumefhfzkw`.
- **Auth redirect allowlist (dashboard, not code):** magic-link sign-in only works
  if each origin's `/auth/callback` is in Supabase → Authentication → URL
  Configuration → Redirect URLs (+ Site URL). See `.env.example` for the list.
- **Local dev:** `npm run dev`; seed test missions with `GET /api/seed` (dev-only).

## Key data facts (from the spine)
- **Pool** is a query, not a table:
  `mission WHERE status='pooled' AND category = <driver's vehicle category>`, then kept if the
  pickup **or** the dropoff falls inside the Driver's **base + radius** (`lib/geo.ts`).
  ⚑ **NOT `zone ∈ driver.operational_zones`** — that was the original spine rule and it was
  **abandoned on 2026-06-17** (`docs/migrations/2026-06-17_driver_service_area.sql:20`:
  *"kept for now but is no longer used"*; `2026-08-11_accept_mission_eligibility.sql:45`:
  *"NOT ENFORCED · operational_zones"*). The column still exists and still holds values, and
  `lib/eligibility.ts` reports it as **decides-nothing** on purpose so nobody assumes it matters.
  The spine's rule is *"matching is by location, not a town list"*. Corrected 2026-09-03.
- **Accept** = `rpc('accept_mission_call', { p_mission_id, p_fare })`. ⚑ **The `_call` wrapper,
  NEVER the raw `accept_mission`** — 2026-08-31g closed the raw SECURITY DEFINER functions to
  browser sessions (a composite return bypasses column privileges), so the raw name returns
  42501 to a signed-in Driver. That is the wall, not a fault. It already does atomic accept
  (first wins), slot-conflict check, and the Lock-in 3h rule. Don't reimplement it.
- **Current fare (PDP)** is computed on read from base/ceiling/start/step/interval —
  never stored as "the price". SPEED WIN starts at/near the ceiling.

## Working agreement
- Develop on the branch you were assigned for the session. Commit with clear messages.
- Do not open a PR unless explicitly asked.
- When you finish a chunk of work, append to `project/SESSION_LOG.md` (technical detail) **and** add a
  plain-language line per shipped item to `project/CHANGELOG.md` (the founder-facing history). Do this as you
  ship and again at end of session, so `CHANGELOG.md` always reflects the latest.
