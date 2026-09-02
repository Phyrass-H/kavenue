// docs/06 §4 — the price Kavenue proposes.
//
// The same arithmetic exists in SQL (`mission_price()`), so these expected
// figures are the ones the live database returned when the founder applied
// 2026-08-16_rate_card.sql. If TypeScript and SQL ever disagree, this file is
// where it shows up.

import { describe, it, expect } from "vitest";
import { asParisLocal, utcToParisLocal } from "@/lib/time";
import {
  priceFor,
  rateCardFor,
  isNightPickup,
  isMarketRate,
  isBelowFloor,
  type RateCardRow,
} from "@/lib/rate-card";

const at = "2026-08-16T00:00:00+00:00";
const row = (
  tier: string,
  body: string | null,
  fb: number,
  fk: number,
  cb: number,
  ck: number,
  ckl: number,
): RateCardRow => ({
  id: `${tier}-${body ?? "any"}`,
  market: "riviera",
  tier,
  body,
  effective_from: at,
  floor_base: fb,
  floor_per_km: fk,
  ceiling_base: cb,
  ceiling_per_km: ck,
  ceiling_per_km_long: ckl,
  long_threshold_km: 150,
  night_multiplier: 1.2,
});

// The five seeded rows, verbatim.
const CARD: RateCardRow[] = [
  row("eco", null, 12, 0.65, 20, 1.85, 1.3),
  row("business", "sedan", 13, 0.75, 48, 2.0, 1.4),
  row("business", "van", 17, 0.9, 52, 2.25, 1.58),
  row("luxury", "sedan", 20, 1.1, 86, 3.6, 2.52),
  row("luxury", "van", 20, 1.1, 82, 3.42, 2.39),
];

const p = (tier: any, body: any, km: number, night = false) =>
  priceFor(CARD, tier, body, km, { night });
const r2 = (n: number) => Math.round(n * 100) / 100;

describe("first band — Nice Airport → Hôtel de Paris Monaco, 32.5 km", () => {
  const cases: [string, string | null, number, number][] = [
    ["eco", null, 33.125, 80.125],
    ["business", "sedan", 37.375, 113.0],
    ["business", "van", 46.25, 125.125],
    ["luxury", "sedan", 55.75, 203.0],
    ["luxury", "van", 55.75, 193.15],
  ];
  for (const [tier, body, floor, ceiling] of cases) {
    it(`${tier}/${body ?? "any"} → ${floor} / ${ceiling}`, () => {
      const q = p(tier, body, 32.5)!;
      expect(r2(q.floor)).toBe(r2(floor));
      expect(r2(q.ceiling)).toBe(r2(ceiling));
    });
  }
});

describe("second band — the long-distance rate past 150 km", () => {
  it("Courchevel 595.4 km, Business sedan → 459.55 / 971.56", () => {
    const q = p("business", "sedan", 595.4)!;
    expect(r2(q.floor)).toBe(459.55);
    expect(r2(q.ceiling)).toBe(971.56);
  });

  it("Courchevel 595.4 km, First sedan → 674.94 / 1748.41", () => {
    const q = p("luxury", "sedan", 595.4)!;
    expect(r2(q.floor)).toBe(674.94);
    expect(r2(q.ceiling)).toBe(1748.41);
  });

  it("is continuous at the threshold — no jump at 150 km", () => {
    const below = p("business", "sedan", 149.999)!.ceiling;
    const at150 = p("business", "sedan", 150)!.ceiling;
    const above = p("business", "sedan", 150.001)!.ceiling;
    expect(at150 - below).toBeLessThan(0.01);
    expect(above - at150).toBeLessThan(0.01);
    expect(above).toBeGreaterThan(at150); // still rising, just slower
  });

  it("charges less per km beyond the threshold than before it", () => {
    const marginalNear = p("business", "sedan", 100)!.ceiling - p("business", "sedan", 99)!.ceiling;
    const marginalFar = p("business", "sedan", 400)!.ceiling - p("business", "sedan", 399)!.ceiling;
    expect(r2(marginalNear)).toBe(2.0);
    expect(r2(marginalFar)).toBe(1.4);
  });

  it("keeps the floor below the ceiling at any distance", () => {
    for (const km of [1, 12, 32.5, 150, 400, 619, 5000]) {
      const q = p("business", "sedan", km)!;
      expect(q.floor).toBeLessThan(q.ceiling);
    }
  });
});

describe("the van must never undercut the sedan (the bug the 45→52 base fixed)", () => {
  for (const km of [1, 2, 5.9, 12, 32.5, 110.6, 327.4, 595.4]) {
    it(`${km} km`, () => {
      expect(p("business", "van", km)!.ceiling).toBeGreaterThan(
        p("business", "sedan", km)!.ceiling,
      );
    });
  }
});

describe("First sits above Business, and its van 5% under its sedan", () => {
  for (const km of [5.9, 32.5, 110.6, 595.4]) {
    it(`${km} km`, () => {
      const first = p("luxury", "sedan", km)!.ceiling;
      const firstVan = p("luxury", "van", km)!.ceiling;
      expect(first).toBeGreaterThan(p("business", "sedan", km)!.ceiling);
      expect(firstVan).toBeLessThan(first);
      expect(firstVan / first).toBeGreaterThan(0.94);
      expect(firstVan / first).toBeLessThan(0.96);
    });
  }
});

describe("row selection mirrors rate_card_for()", () => {
  it('"any body" resolves to the sedan row', () => {
    expect(p("business", null, 32.5)!.ceiling).toBe(p("business", "sedan", 32.5)!.ceiling);
  });

  it("Eco ignores body — it has only an any-body row", () => {
    expect(p("eco", "van", 32.5)!.ceiling).toBe(p("eco", null, 32.5)!.ceiling);
    expect(p("eco", "sedan", 32.5)!.ceiling).toBe(p("eco", null, 32.5)!.ceiling);
  });

  it("prefers a body-specific row over an any-body row of the same tier", () => {
    const withFallback = [...CARD, row("business", null, 1, 0.01, 2, 0.02, 0.01)];
    expect(rateCardFor(withFallback, "business" as any, "van")!.body).toBe("van");
  });

  it("takes the newest generation effective by now, never a future one", () => {
    const future = { ...row("business", "sedan", 99, 9, 999, 9, 9), effective_from: "2099-01-01T00:00:00+00:00" };
    const older = { ...row("business", "sedan", 1, 0.1, 10, 0.5, 0.4), effective_from: "2020-01-01T00:00:00+00:00" };
    const picked = rateCardFor([older, future, ...CARD], "business" as any, "sedan")!;
    expect(picked.ceiling_base).toBe(48);
  });

  it("returns null rather than guessing when there is no route or no card", () => {
    expect(p("business", "sedan", 0)).toBeNull();
    expect(priceFor(CARD, "business" as any, "sedan", null)).toBeNull();
    expect(priceFor([], "business" as any, "sedan", 32.5)).toBeNull();
  });
});

describe("night pricing — ×1.20 on floor and ceiling alike", () => {
  it("Monaco 32.5 km, Business sedan at night → 44.85 / 135.60", () => {
    const q = p("business", "sedan", 32.5, true)!;
    expect(r2(q.floor)).toBe(44.85);
    expect(r2(q.ceiling)).toBe(135.6);
    expect(q.night).toBe(true);
  });

  it("detects the 22:00–06:00 window on Paris wall-clock, inclusive of 22 and exclusive of 06", () => {
    const wall = (s: string) => asParisLocal(s);
    expect(isNightPickup(wall("2026-08-16T22:00"))).toBe(true);
    expect(isNightPickup(wall("2026-08-16T23:59"))).toBe(true);
    expect(isNightPickup(wall("2026-08-16T00:00"))).toBe(true);
    expect(isNightPickup(wall("2026-08-16T05:59"))).toBe(true);
    expect(isNightPickup(wall("2026-08-16T06:00"))).toBe(false);
    expect(isNightPickup(wall("2026-08-16T21:59"))).toBe(false);
    expect(isNightPickup(wall(""))).toBe(false);
    expect(isNightPickup(null)).toBe(false);
  });

  // ⚑ THE BUG THIS WHOLE GUARD EXISTS FOR ([[d124]]). Two seed scripts passed
  // `d.toISOString()` and nothing complained: the hour was read in UTC, so the window
  // slid by the zone offset and 25 of 370 trips were mispriced by 20%, silently.
  describe("an instant is not a wall clock", () => {
    // 23:42 Paris in summer is 21:42 UTC. Reading the UTC hour says "day"; the rule
    // says night. That single two-hour slide is the entire bug.
    const instant = "2026-08-31T21:42:00.000Z";
    const wall = utcToParisLocal(instant);

    it("converts the instant to the Paris wall clock", () => {
      expect(wall).toBe("2026-08-31T23:42");
      expect(isNightPickup(wall)).toBe(true);
    });

    it("refuses to guess when handed an instant, loudly", () => {
      // The app is protected by the branded type; `.local/` is not typechecked at all
      // (TypeScript skips dot-directories), so the throw is what protects the seeds.
      expect(() => isNightPickup(instant as never)).toThrow(/wall clock/);
      expect(() => isNightPickup("2026-08-31T21:42+02:00" as never)).toThrow(/wall clock/);
    });

    it("rejects an instant rather than branding it", () => {
      expect(asParisLocal(instant)).toBeNull();
      expect(asParisLocal("2026-08-31T23:42")).toBe("2026-08-31T23:42");
    });
  });

  // ⚑ Summer and winter, on purpose. The design is DST-proof BECAUSE it works on the
  // wall clock — the zone database has already done the arithmetic, so 22:00 is 22:00
  // in January and in July and no code here knows the difference.
  describe("the same wall clock either side of the DST change", () => {
    it("reads 23:30 as night in both August and December", () => {
      expect(utcToParisLocal("2026-08-15T21:30:00.000Z")).toBe("2026-08-15T23:30"); // +02
      expect(utcToParisLocal("2026-12-15T22:30:00.000Z")).toBe("2026-12-15T23:30"); // +01
      expect(isNightPickup(utcToParisLocal("2026-08-15T21:30:00.000Z"))).toBe(true);
      expect(isNightPickup(utcToParisLocal("2026-12-15T22:30:00.000Z"))).toBe(true);
    });
  });
});

describe("the two comparisons the form and the server both use", () => {
  const q = p("business", "sedan", 32.5)!; // floor 37.375, ceiling 113.00

  it("recognises the proposed ceiling at 2 dp", () => {
    expect(isMarketRate(113, q)).toBe(true);
    expect(isMarketRate(113.004, q)).toBe(true);
    expect(isMarketRate(112.99, q)).toBe(false);
    expect(isMarketRate(null, q)).toBe(false);
    expect(isMarketRate(113, null)).toBe(false);
  });

  it("refuses below the floor, but never the number we displayed", () => {
    expect(isBelowFloor(30, q)).toBe(true);
    expect(isBelowFloor(37.37, q)).toBe(true);
    // 37.375 renders as "37,38" — a Business typing that back must be accepted.
    expect(isBelowFloor(37.38, q)).toBe(false);
    expect(isBelowFloor(113, q)).toBe(false);
    expect(isBelowFloor(30, null)).toBe(false);
  });
});
