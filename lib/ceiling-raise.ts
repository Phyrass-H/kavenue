/**
 * S83 — a Business raises its own Ceiling on a trip still in the Pool.
 *
 * The founder's five rules (2026-09-18):
 *   1. raise only, never lower
 *   2. only while the trip is in the Pool — once a Driver holds it, a price change
 *      is an amendment the Driver must agree to ([[d39]])
 *   3. the price follows the new Ceiling for the time left: the SAME point on the
 *      climb, on a taller one. The clock is untouched — the trip still tops out
 *      when it would have (lib/pdp.ts topLeadFor), and on a normal trip the opening
 *      price is still the rate card's floor. Under SPEED WIN the curve opens at 70%
 *      of the Ceiling (lib/pdp.ts openingPrice), so a raise lifts the opening too —
 *      the founder's call, 2026-09-18 ("ok").
 *   4. every raise is recorded — who, from, to, when
 *   5. as many raises as the Business wants (founder: Drivers do not wait for a
 *      raise, it is an auction — someone else takes it first)
 *
 * ⚑ THE PRICE NEVER DIPS ON A RAISE. lib/pdp.ts redraws its step ladder when the gap
 * changes, and a raise used to show up to ~€0.95 LESS (measured S83 on the real code,
 * ~1 raise in 8). The first change now FREEZES the step count (`pdp_step_count`,
 * 2026-09-18c), and with the steps fixed the price at every instant is
 * (1−s)·opening + s·Ceiling for the same s — which a higher Ceiling can only raise.
 * `withNewOffer` is what the SQL writes, so the panel previews exactly what will be stored.
 */
import { ceilingReachedAt, frozenStepCount, type PdpInputs } from "@/lib/pdp";
import type { MissionStatus } from "@/lib/database.types";
import { PRICE_EVENTS } from "@/lib/mission-events";

type RaiseInputs = PdpInputs & {
  status: MissionStatus;
  driver_id: string | null;
  /** § 7 — a Driver's 15-second hold. Masked to NULL once past. */
  hold_expires_at?: string | null;
};

/**
 * Rule 2 — the trip is nobody's yet, and its pickup is still ahead.
 *
 * ⚑ And no Driver is in the middle of a hold on it. For those 15 seconds the row's
 * pill says "A Driver is reviewing this", and a card beside it saying "No Driver
 * has taken it yet — raise your price" would contradict it (and move the price
 * under the Driver who is deciding). The door comes back when the hold lapses.
 */
export function canRaiseCeiling(m: RaiseInputs, now: Date = new Date()): boolean {
  const held = !!m.hold_expires_at && new Date(m.hold_expires_at).getTime() > now.getTime();
  return (
    m.status === "pooled" &&
    !m.driver_id &&
    !held &&
    new Date(m.pickup_at).getTime() > now.getTime()
  );
}

/**
 * The founder's trigger: the price has reached the Ceiling and nobody has taken
 * the trip. From here the price never moves again on its own.
 */
export function atCeilingUntaken(m: RaiseInputs, now: Date = new Date()): boolean {
  return canRaiseCeiling(m, now) && now.getTime() >= ceilingReachedAt(m).getTime();
}

/**
 * The trip as it will be stored after a raise or a price-moving car change: the new terms,
 * and the step count frozen exactly as raise_ceiling / change_trip_car freeze it (the count
 * in force before the change; none before the climb opens or with no gap). Feed the result
 * to `currentFare` to preview the price.
 */
export function withNewOffer(
  m: PdpInputs,
  change: { ceiling: number; pdp_start?: number | null },
  now: Date = new Date(),
): PdpInputs {
  return {
    ...m,
    ceiling: change.ceiling,
    pdp_start: change.pdp_start === undefined ? m.pdp_start : change.pdp_start,
    pdp_step_count: frozenStepCount(m, now),
  };
}

/**
 * One change to a pooled trip's price terms, as the schedule row shows it (rule 4: who, from,
 * to, when). Built from the `mission_event` rows the 2026-09-18c trigger writes — the record,
 * not the row, so every change is shown, not just the last.
 */
export interface PriceChangeBrief {
  at: string;
  kind: "raise" | "car" | "other";
  /** The Business's all-in Ceiling before and after. Equal when only the car changed. */
  from: number | null;
  to: number | null;
  /** "Business · Sedan" → "First · Sedan · BMW Série 7", for a car change. */
  carFrom: string | null;
  carTo: string | null;
  /** Who: the Dispatcher's name, or "Kavenue" for an admin or system change. */
  by: string;
}

type Terms = { category?: string | null; required_body_type?: string | null; required_make?: string | null; required_model?: string | null };

function carWords(t: Terms | undefined, label: (c: string, b: string | null) => string): string | null {
  if (!t?.category) return null;
  const base = label(t.category, t.required_body_type ?? null);
  return t.required_make && t.required_model ? `${base} · ${t.required_make} ${t.required_model}` : base;
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** mission_event rows (ceiling_raised / trip_car_changed / price_terms_changed) → briefs, newest first. */
export function priceChangesFrom(
  events: { occurred_at: string; event_type: string; actor_kind: string; actor_id: string | null; payload: unknown }[],
  dispatcherNames: Map<string, string>,
  classLabel: (category: string, body: string | null) => string,
): PriceChangeBrief[] {
  return [...events]
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
    .map((e) => {
      const p = (e.payload ?? {}) as { from?: Terms; to?: Terms; all_in_from?: unknown; all_in_to?: unknown };
      const kind: PriceChangeBrief["kind"] =
        e.event_type === "ceiling_raised" ? "raise" : e.event_type === "trip_car_changed" ? "car" : "other";
      return {
        at: e.occurred_at,
        kind,
        from: num(p.all_in_from),
        to: num(p.all_in_to),
        carFrom: kind === "car" ? carWords(p.from, classLabel) : null,
        carTo: kind === "car" ? carWords(p.to, classLabel) : null,
        by:
          e.actor_kind === "dispatcher" && e.actor_id
            ? (dispatcherNames.get(e.actor_id) ?? "your team")
            : "Kavenue",
      };
    });
}

/** The event types a schedule row reads its change history from — the vocabulary's own list. */
export const PRICE_CHANGE_EVENTS = PRICE_EVENTS;
