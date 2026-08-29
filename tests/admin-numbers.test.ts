// The numbers band. What is pinned here is not the arithmetic — it is the
// HONESTY RULES, because those are what a later session would quietly delete to
// make a screen look better: the suppressed percentage, the excluded pooled
// trip, and the month we are still inside.
import { describe, it, expect } from "vitest";
import {
  homeNumbers,
  monthsNote,
  MIN_FOR_RATE,
  MIN_FOR_MEDIAN,
  type NumbersRow,
} from "@/lib/admin-numbers";

/** A mission row with only what the band reads. Rates match the live card. */
function row(over: Partial<NumbersRow> = {}): NumbersRow {
  return {
    status: "completed",
    created_at: "2026-08-01T08:00:00.000Z",
    pickup_at: "2026-08-02T08:00:00.000Z",
    accepted_at: "2026-08-01T12:00:00.000Z",
    accepted_fare: 100,
    commission_business_rate: 0.125,
    commission_driver_rate: 0.1,
    commission_vat_rate: 0.2,
    transport_vat_rate: 0.1,
    ...over,
  } as NumbersRow;
}

const NOW = new Date("2026-08-27T10:00:00.000Z");
const many = (n: number, over: Partial<NumbersRow> = {}) =>
  Array.from({ length: n }, () => row(over));

describe("the fill rate", () => {
  it("counts a trip nobody took, and one that was taken", () => {
    const n = homeNumbers([...many(15), ...many(5, { status: "expired", accepted_at: null })], NOW);
    expect(n.settled).toBe(20);
    expect(n.filled).toBe(15);
    expect(Math.round(n.fillRate!)).toBe(75);
  });

  it("⚑ leaves a still-pooled future trip OUT of the denominator", () => {
    // It has not failed to find a Driver — it is still looking. Counting it
    // would make every fresh morning look broken.
    const n = homeNumbers([...many(20), ...many(9, { status: "pooled", accepted_at: null })], NOW);
    expect(n.settled).toBe(20);
    expect(Math.round(n.fillRate!)).toBe(100);
  });

  it("⚑ SUPPRESSES the percentage below the threshold, but never the count", () => {
    const n = homeNumbers(many(MIN_FOR_RATE - 1), NOW);
    expect(n.fillRate).toBeNull();
    expect(n.filled).toBe(MIN_FOR_RATE - 1);
    expect(n.settled).toBe(MIN_FOR_RATE - 1);
  });

  it("renders the percentage the moment the sample is big enough", () => {
    expect(homeNumbers(many(MIN_FOR_RATE), NOW).fillRate).not.toBeNull();
  });

  it("⚑ one trip nobody took is never '0 %' — the Haut-Var case", () => {
    const n = homeNumbers(many(1, { status: "expired", accepted_at: null }), NOW);
    expect(n.fillRate).toBeNull();
    expect(n.filled).toBe(0);
    expect(n.settled).toBe(1);
  });
});

describe("the money", () => {
  it("splits a completed trip into what each side sees, and reconciles", () => {
    const n = homeNumbers(many(10), NOW);
    expect(n.completed).toBe(10);
    // The Business pays more than the Driver banks, and the gap IS Kavenue's
    // fee plus the VAT on it. An invoice that does not add up is wrong however
    // defensible the arithmetic.
    expect(n.businessesPaid).toBeGreaterThan(n.driversBanked);
    expect(n.kavenueKept).toBeGreaterThan(0);
    expect(n.kavenueKept).toBeLessThan(n.businessesPaid - n.driversBanked);
  });

  it("⚑ counts money on completed trips only — a cancelled one earned nothing", () => {
    const n = homeNumbers(many(5, { status: "cancelled", accepted_at: null }), NOW);
    expect(n.completed).toBe(0);
    expect(n.businessesPaid).toBe(0);
    expect(n.driversBanked).toBe(0);
    expect(n.kavenueKept).toBe(0);
  });

  it("⚑ NULL rates are 'no commission', not a zero rate", () => {
    // Trips created before commission shipped were billed no fee at all.
    // Reading NULL as 0,125 would retroactively invent charges on live rows.
    const n = homeNumbers(
      many(25, { commission_business_rate: null, commission_driver_rate: null }),
      NOW,
    );
    expect(n.kavenueKept).toBe(0);
    expect(n.businessesPaid).toBe(n.driversBanked);
  });

  it("suppresses the take rate on a thin sample", () => {
    expect(homeNumbers(many(MIN_FOR_RATE - 1), NOW).takeRate).toBeNull();
    expect(homeNumbers(many(MIN_FOR_RATE), NOW).takeRate).not.toBeNull();
  });
});

describe("time to a Driver", () => {
  it("⚑ no median under the threshold — one trip in a costume is not a median", () => {
    expect(homeNumbers(many(MIN_FOR_MEDIAN - 1), NOW).medianHoursToFill).toBeNull();
  });

  it("gives the middle value once there are enough", () => {
    expect(homeNumbers(many(MIN_FOR_MEDIAN), NOW).medianHoursToFill).toBe(4);
  });

  it("ignores a negative interval rather than letting it drag the middle", () => {
    const bad = row({ accepted_at: "2026-07-01T00:00:00.000Z" });
    const n = homeNumbers([...many(MIN_FOR_MEDIAN), bad], NOW);
    expect(n.medianHoursToFill).toBe(4);
  });
});

describe("the months", () => {
  it("tallies by pickup month, oldest first, and flags the one we are inside", () => {
    const n = homeNumbers(
      [
        ...many(3, { pickup_at: "2026-06-10T08:00:00.000Z" }),
        ...many(5, { pickup_at: "2026-07-10T08:00:00.000Z" }),
        ...many(2, { pickup_at: "2026-08-10T08:00:00.000Z" }),
      ],
      NOW,
    );
    expect(n.months.map((m) => [m.key, m.trips, m.partial])).toEqual([
      ["2026-06", 3, false],
      ["2026-07", 5, false],
      ["2026-08", 2, true],
    ]);
  });

  it("⚑ never calls a part-month growth — it names the days still to run", () => {
    const note = monthsNote(
      [
        { key: "2026-07", trips: 129, partial: false },
        { key: "2026-08", trips: 145, partial: true },
      ],
      NOW,
    );
    expect(note).toContain("still to run");
    expect(note).toContain("the whole of last month was 129");
    expect(note).not.toContain("up from");
  });

  it("compares plainly once the month is complete", () => {
    const note = monthsNote(
      [
        { key: "2026-06", trips: 71, partial: false },
        { key: "2026-07", trips: 129, partial: false },
      ],
      NOW,
    );
    expect(note).toBe("129 trips last month, up from 71 the month before.");
  });

  it("says nothing at all with a single month — there is no comparison to make", () => {
    expect(monthsNote([{ key: "2026-08", trips: 4, partial: true }], NOW)).toBeNull();
  });
});

describe("an empty database", () => {
  it("returns zeroes and no rates, so the screen can say it in words", () => {
    const n = homeNumbers([], NOW);
    expect(n.settled).toBe(0);
    expect(n.completed).toBe(0);
    expect(n.fillRate).toBeNull();
    expect(n.takeRate).toBeNull();
    expect(n.medianHoursToFill).toBeNull();
    expect(n.months).toEqual([]);
  });
});
