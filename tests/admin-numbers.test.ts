// The numbers band. What is pinned here is not the arithmetic — it is the
// HONESTY RULES, because those are what a later session would quietly delete to
// make a screen look better: the suppressed percentage, the excluded pooled
// trip, and the month we are still inside.
import { describe, it, expect } from "vitest";
import {
  curveNote,
  homeNumbers,
  monthsNote,
  MIN_FOR_RATE,
  MIN_FOR_MEDIAN,
  type HomeNumbers,
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
    // Taken at exactly its Ceiling by default, so a test that cares about the
    // ratio has to say so — no fixture ever implies a discount by accident.
    ceiling: 100,
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
        { key: "2026-07", trips: 129, partial: false, future: false },
        { key: "2026-08", trips: 145, partial: true, future: false },
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
        { key: "2026-06", trips: 71, partial: false, future: false },
        { key: "2026-07", trips: 129, partial: false, future: false },
      ],
      NOW,
    );
    expect(note).toBe("129 trips last month, up from 71 the month before.");
  });

  it("says nothing at all with a single month — there is no comparison to make", () => {
    expect(monthsNote([{ key: "2026-08", trips: 4, partial: true, future: false }], NOW)).toBeNull();
  });

  // ⚑ THE BUG THIS CLOSES, VERBATIM FROM THE LIVE HOME SCREEN ON 30 AUGUST 2026:
  //   "5 trips last month, down from 147 the month before."
  // September had not happened. The bars are keyed on `pickup_at`, so trips
  // BOOKED for September raised a September bar, and `partial` only ever marked
  // the current month — leaving the future looking like a finished past.
  it("⚑ never describes a month that has not happened as 'last month'", () => {
    const note = monthsNote(
      [
        { key: "2026-07", trips: 129, partial: false, future: false },
        { key: "2026-08", trips: 147, partial: true, future: false },
        { key: "2026-09", trips: 5, partial: false, future: true },
      ],
      NOW,
    );
    expect(note).not.toContain("last month, down from 147");
    expect(note).toContain("147 this month already");
    expect(note).toContain("the whole of last month was 129");
  });

  it("says what is booked ahead instead of pretending it is history", () => {
    const note = monthsNote(
      [
        { key: "2026-07", trips: 129, partial: false, future: false },
        { key: "2026-08", trips: 147, partial: true, future: false },
        { key: "2026-09", trips: 5, partial: false, future: true },
      ],
      NOW,
    );
    expect(note).toContain("5 trips are already booked ahead");
  });

  it("says 'trip is' for a single one booked ahead", () => {
    const note = monthsNote(
      [
        { key: "2026-08", trips: 147, partial: true, future: false },
        { key: "2026-09", trips: 1, partial: false, future: true },
      ],
      NOW,
    );
    expect(note).toContain("1 trip is already booked ahead");
  });

  it("stays silent when the only months are in the future and there is nothing booked", () => {
    expect(monthsNote([{ key: "2026-09", trips: 0, partial: false, future: true }], NOW)).toBeNull();
  });

  it("still speaks when the ONLY thing to say is what is booked ahead", () => {
    // One future month and nothing else: there is no comparison to make, but
    // "3 trips are already booked ahead" is true and worth saying.
    expect(monthsNote([{ key: "2026-09", trips: 3, partial: false, future: true }], NOW)).toBe(
      "3 trips are already booked ahead.",
    );
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

describe("the curve note — what a Driver actually took the trip for", () => {
  const n = (over: Partial<HomeNumbers>): HomeNumbers =>
    ({
      settled: 349, filled: 294, fillRate: 84, completed: 264,
      businessesPaid: 0, driversBanked: 0, kavenueKept: 0, takeRate: null,
      medianHoursToFill: null, months: [],
      takenAtPctOfCeiling: 61, fellThrough: 4, fellThroughRate: 1.4,
      ...over,
    }) as HomeNumbers;

  it("says both halves when both have a sample", () => {
    const note = curveNote(n({}));
    expect(note).toContain("61 % of the Ceiling");
    expect(note).toContain("4 of the 294 a Driver took fell through");
  });

  it("⚑ always names the denominator of the fall-through", () => {
    // Alone, "4 fell through" invites the reader to supply "of all trips". The
    // real denominator is the much smaller set a Driver had already taken.
    expect(curveNote(n({}))).toContain("of the 294 a Driver took");
  });

  it("drops the Ceiling half on a sample too thin for a median", () => {
    const note = curveNote(n({ takenAtPctOfCeiling: null }));
    expect(note).not.toContain("Ceiling");
    expect(note).toContain("fell through");
  });

  it("says nothing about fall-through when none has happened", () => {
    // ⚑ Not "0 fell through" — a marketplace where nothing has gone wrong should
    // be silent about it, not congratulate itself on the home screen.
    const note = curveNote(n({ fellThrough: 0 }));
    expect(note).not.toContain("fell through");
    expect(note).toContain("Ceiling");
  });

  it("goes silent entirely when neither half can be said", () => {
    expect(curveNote(n({ takenAtPctOfCeiling: null, fellThrough: 0 }))).toBeNull();
  });
});

describe("takenAtPctOfCeiling", () => {
  it("ignores a trip with no fare, rather than treating it as 100 %", () => {
    // ⚑ A trip this question cannot be asked about. Counting it would be an
    // invention wearing a median's clothes. [[d88]].
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ accepted_fare: i < 15 ? 60 : null }),
    );
    expect(homeNumbers(rows, NOW).takenAtPctOfCeiling).toBe(60);
  });

  it("never divides by a zero Ceiling", () => {
    // ⚑ `ceiling` is NOT NULL in the schema, so zero is the only unusable value
    // that can actually occur — and 60/0 is Infinity, which would render as a
    // percentage nobody could explain.
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ accepted_fare: 60, ceiling: i < 15 ? 100 : 0 }),
    );
    expect(homeNumbers(rows, NOW).takenAtPctOfCeiling).toBe(60);
  });

  it("refuses a median on a thin sample", () => {
    expect(homeNumbers(many(1, { accepted_fare: 60 }), NOW).takenAtPctOfCeiling).toBeNull();
  });
});
