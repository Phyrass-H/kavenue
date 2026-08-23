import type { createClient } from "@/lib/supabase/server";

// § R rule 1 — the shared reads for the per-mission SIDE TABLES (cancellation,
// amendment, release, info-change, guest contact).
//
// ⚑ WHY THIS FILE EXISTS. Every one of those reads used to be scoped by
// `.in("mission_id", <every mission id of this Business>)`. That list grows ~37
// bytes per trip and it does NOT degrade gracefully — it ERRORS. Measured
// 2026-08-23 against the live DB by binary search: 397 ids work, 398 throw
// "TypeError: fetch failed" at ~14,8 KB of URL. The busiest Business was at 271.
//
// The fix is to scope by the Business instead of by a list of ids, so the request
// is a constant ~200 bytes however big the archive gets. Four of the five side
// tables carry a denormalised, NOT NULL, indexed `business_id` added for exactly
// this ("denormalised for RLS", docs/migrations/2026-07-13_o7_cancellation.sql:61).
// `mission_guest_contact` is the one exception — it has no business_id, so that
// single call site filters through the relationship instead.
//
// ⚑ THE ONE SEMANTIC CHANGE, AND WHY IT IS SAFE. Scoping by Business also returns
// rows for missions that are NOT on screen (future trips, drafts). Those become
// EXTRA KEYS in the returned Map. Every consumer reads these maps one mission at a
// time — `map.get(m.id)` — and never iterates them, never reads `.size`, never
// spreads them. Audited 2026-08-23 across dispatch/page.tsx, history/page.tsx,
// components/trip-row.tsx and both CSV export routes: no iteration anywhere. So
// the extra keys are unreachable.
//
// ⚑ IF YOU EVER ITERATE ONE OF THESE MAPS, OR READ ITS `.size`, YOU MUST NARROW IT
// TO THE MISSIONS ON SCREEN FIRST. That is the invariant this whole change rests
// on, and it is the one way to break it silently.

/** One Driver walk-away, as every screen and both CSVs render it. */
export interface DriverWalk {
  at: string; // created_at — when they cancelled
  hoursBefore: number | null; // lead time at that moment
  reason: string | null;
}

type WalkRow = {
  mission_id: string;
  created_at: string;
  reason?: string | null;
  hours_before_pickup: number | string | null;
};

/**
 * Walk rows → one list per mission, IN THE ORDER GIVEN.
 *
 * ⚑ ORDER IS LOAD-BEARING. Consumers render `walks[0]` as THE walk — its lead time,
 * its reason, its timestamp (components/trip-row.tsx:853-861) — and `walks.length`
 * as the count. Nothing re-sorts client-side, so the caller MUST pass rows already
 * newest-first.
 *
 * ⚑ NEVER de-duplicated, unlike the amendment / release / info-change reads. A
 * driver cancellation RE-POOLS the trip rather than ending it, so the same mission
 * can be walked again by the next Driver, and "latest wins" would hide every walk
 * but one.
 */
export function groupDriverWalks(rows: WalkRow[]): Map<string, DriverWalk[]> {
  const out = new Map<string, DriverWalk[]>();
  for (const w of rows) {
    const list = out.get(w.mission_id) ?? [];
    list.push({
      at: w.created_at,
      // PostgREST returns `numeric` as a string — coerce, but keep null as null.
      hoursBefore: w.hours_before_pickup == null ? null : Number(w.hours_before_pickup),
      reason: w.reason ?? null,
    });
    out.set(w.mission_id, list);
  }
  return out;
}

/**
 * Every trip a Driver accepted and then walked away from, for one Business.
 *
 * The re-pool leaves NO trace on the mission itself — driver_id, accepted_at and
 * confirmed_at are all cleared and the status goes back to 'pooled' — so this side
 * table is the only record that a car was ever arranged and lost.
 *
 * Degrades to an empty Map if the O7 migration is absent.
 */
export async function loadDriverWalks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
): Promise<Map<string, DriverWalk[]>> {
  const { data } = await supabase
    .from("mission_cancellation")
    .select("mission_id, created_at, reason, hours_before_pickup")
    .eq("business_id", businessId)
    .eq("kind", "driver_cancel")
    .order("created_at", { ascending: false });
  return groupDriverWalks(data ?? []);
}

/**
 * First row per mission_id, input order preserved — the "latest wins" de-dup that
 * the amendment / release / info-change blocks each run over a created_at-desc read.
 *
 * ⚑ Rule 1 made those reads Business-scoped, so they can now include rows for
 * missions that are not on screen. That is safe here for a specific reason: the
 * de-dup is keyed PER mission_id, so an unrendered mission's row can only ever
 * suppress another row for that SAME unrendered mission. It can never shadow a row
 * belonging to a mission on screen.
 */
export function latestPerMission<T extends { mission_id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.mission_id)) continue;
    seen.add(r.mission_id);
    out.push(r);
  }
  return out;
}
