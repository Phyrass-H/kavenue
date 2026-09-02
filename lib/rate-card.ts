// Kavenue's price for a trip — docs/06 §4. The TypeScript half of the formula.
//
// ⚑ THIS MIRRORS SQL. The same arithmetic lives in `mission_price()` /
// `rate_card_for()` (docs/migrations/2026-08-16_rate_card.sql). Two copies exist
// on purpose: the form must re-price on every keystroke, and a round trip per
// keystroke is not an option — while the server must never trust a number the
// browser sent. If you change one, change the other, and check
// `tests/rate-card.test.ts`, which pins both against the same expected figures.
// (The fee rules already went through this once; S56 was spent proving the two
// copies had not drifted. Same discipline here.)
//
// The rows come from the `rate_card` table, never from constants — docs/06 §9:
// "Numbers live in tables, not in code. Recalibration is an INSERT/UPDATE, never
// a redeploy."

import type { ParisLocal } from "@/lib/time";
import type { BodyType, ServiceTier } from "@/lib/vehicle-catalog";

export type RateCardRow = {
  id: string;
  market: string;
  tier: string;
  body: string | null; // null = this row covers any body
  effective_from: string;
  floor_base: number;
  floor_per_km: number;
  ceiling_base: number;
  ceiling_per_km: number;
  ceiling_per_km_long: number;
  long_threshold_km: number;
  night_multiplier: number;
};

export type Quote = {
  rateCardId: string;
  floor: number; // full precision — round at render (docs/06 §9)
  ceiling: number;
  night: boolean;
};

/** The columns a price needs. Keep in step with RateCardRow. */
export const RATE_CARD_COLS =
  "id,market,tier,body,effective_from,floor_base,floor_per_km,ceiling_base,ceiling_per_km,ceiling_per_km_long,long_threshold_km,night_multiplier";

// Night pricing (docs/06 §4): ×1.20 on ceiling AND floor alike, for a pickup
// between 22:00 and 06:00 Paris wall-clock. The only time modifier in V1 — no
// season, no event calendar, no surge.
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 6;

/**
 * Is this a night pickup? Takes a Paris WALL CLOCK, so the hour is already local — no
 * timezone maths here, and therefore no DST edge case: "22:00" is 22:00 in January and
 * in July, and the zone database has already done the work.
 *
 * ⚑ THE PARAMETER IS BRANDED ON PURPOSE ([[d124]]). It used to be `string`, and two seed
 * scripts passed `d.toISOString()` — UTC — which slid the whole night window by the zone
 * offset and mispriced 25 trips by 20% in silence. Build one with `asParisLocal()` from a
 * form field, or `utcToParisLocal()` from an instant; both are in lib/time.ts.
 */
export function isNightPickup(pickupAtLocal: ParisLocal | null | undefined): boolean {
  const raw = pickupAtLocal ?? "";
  // ⚑ THE LOUD HALF, and it is load-bearing. TypeScript does NOT typecheck `.local/`
  // — its globs skip directories beginning with a dot — which is exactly where the two
  // scripts that got this wrong live. The brand protects everything the app compiles;
  // this protects everything it doesn't. A wall clock never carries a zone, so a "Z" or
  // a "+02:00" means the caller is holding an instant and the hour below would be read
  // in the wrong zone. Throwing is the kind answer: the alternative is a 20% pricing
  // error that no test, no type and no log ever mentions ([[d124]]).
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    throw new TypeError(
      `isNightPickup needs a Paris wall clock, got an instant: ${raw}. ` +
        "Use utcToParisLocal() from lib/time.ts.",
    );
  }
  const hour = /^\d{4}-\d{2}-\d{2}T(\d{2}):/.exec(raw)?.[1];
  if (hour == null) return false;
  const h = Number(hour);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/**
 * The row that applies. Mirrors `rate_card_for()`:
 *   - an exact body match beats the any-body row,
 *   - then the newest generation effective by `at`,
 *   - and "any body" on the mission resolves to the SEDAN row — the Business
 *     asked for the base product and the trip reaches sedan and van Drivers
 *     alike, so it should not pay the van premium for declining to specify.
 */
export function rateCardFor(
  rows: RateCardRow[],
  tier: ServiceTier,
  body: BodyType | null,
  market = "riviera",
  at: Date = new Date(),
): RateCardRow | null {
  const wanted = body ?? "sedan";
  const iso = at.toISOString();
  const candidates = rows.filter(
    (r) =>
      r.market === market &&
      r.tier === tier &&
      (r.body === null || r.body === wanted) &&
      r.effective_from <= iso,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    // body-specific first
    if ((a.body !== null) !== (b.body !== null)) return a.body !== null ? -1 : 1;
    // then newest generation
    return a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0;
  });
  return candidates[0];
}

/**
 * Floor and ceiling for a trip. Two distance bands (docs/06 §4): the full
 * per-km rate up to `long_threshold_km`, a lower one beyond it — because the
 * market charges less per km the further you go, and a single straight line put
 * the card above retail past ~200 km.
 *
 * Returns null when there is no route yet (no distance) or no card for the
 * tier — the caller leaves the Ceiling field alone rather than guessing.
 */
export function priceFor(
  rows: RateCardRow[],
  tier: ServiceTier,
  body: BodyType | null,
  km: number | null | undefined,
  opts: { night?: boolean; market?: string; at?: Date } = {},
): Quote | null {
  if (km == null || !Number.isFinite(km) || km <= 0) return null;
  const card = rateCardFor(rows, tier, body, opts.market ?? "riviera", opts.at ?? new Date());
  if (!card) return null;

  const night = opts.night ?? false;
  const mult = night ? card.night_multiplier : 1;
  const near = Math.min(km, card.long_threshold_km);
  const far = Math.max(km - card.long_threshold_km, 0);

  return {
    rateCardId: card.id,
    floor: (card.floor_base + card.floor_per_km * km) * mult,
    ceiling:
      (card.ceiling_base + card.ceiling_per_km * near + card.ceiling_per_km_long * far) * mult,
    night,
  };
}

/**
 * Is this ceiling the one Kavenue proposed? Compared on the rendered value
 * (2 dp), because that is the number the Business sees in the box — a ceiling
 * of 113.00 is "the market rate" even when the raw quote is 113.0000001.
 */
export function isMarketRate(ceiling: number | null | undefined, quote: Quote | null): boolean {
  if (quote == null || ceiling == null || !Number.isFinite(ceiling)) return false;
  return Math.round(ceiling * 100) === Math.round(quote.ceiling * 100);
}

/**
 * The floor check, in the one place both the form and the server action call it.
 * Compared at 2 dp so a Business typing exactly the number we showed them is
 * never refused by a rounding tail.
 */
export function isBelowFloor(ceiling: number | null | undefined, quote: Quote | null): boolean {
  if (quote == null || ceiling == null || !Number.isFinite(ceiling)) return false;
  return Math.round(ceiling * 100) < Math.round(quote.floor * 100);
}
