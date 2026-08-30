// The Businesses screen's shaping rules.
//
// ⚑ WHAT THESE DEFEND IS THE HONESTY, not the layout. Every one of them is a
// rule a later session would be tempted to "simplify" into something that looks
// tidier and says something false: a rate on four trips, a région invented for
// Monaco, a one-row table pretending to be a breakdown, or a city quietly
// dropped because its région was null.
import { describe, expect, it } from "vitest";
import { MIN_FOR_RATE } from "@/lib/admin-numbers";
import {
  cityKeyLabel,
  fillRate,
  medianNote,
  medianValue,
  nestCities,
  regionKeyLabel,
  typeKeyLabel,
  typeKeyShort,
  worthBreakingDown,
  type RollupRow,
} from "@/lib/admin-businesses";

const row = (over: Partial<RollupRow> = {}): RollupRow => ({
  key: "93",
  parent: null,
  businesses: 3,
  trips: 300,
  settled: 280,
  filled: 240,
  ...over,
});

describe("fillRate", () => {
  it("uses the home band's threshold, imported rather than repeated", () => {
    expect(MIN_FOR_RATE).toBe(20);
    expect(fillRate({ settled: MIN_FOR_RATE - 1, filled: 0 })).toBeNull();
    expect(fillRate({ settled: MIN_FOR_RATE, filled: 10 })).toBe(50);
  });

  it("refuses a percentage on a thin sample rather than rounding it to zero", () => {
    // ⚑ The whole small-N rule in one case: one unfilled trip is not "0 % filled".
    expect(fillRate({ settled: 1, filled: 0 })).toBeNull();
  });

  it("gives a real rate once the sample earns one", () => {
    expect(Math.round(fillRate(row())!)).toBe(86);
  });
});

describe("worthBreakingDown", () => {
  it("hides a breakdown with nothing to break down", () => {
    // Today: all four Businesses are hotels. A "by type" table would be a
    // heading, a header row and one line saying 4.
    expect(worthBreakingDown([row()])).toBe(false);
    expect(worthBreakingDown([])).toBe(false);
  });

  it("shows it the moment a second kind exists", () => {
    expect(worthBreakingDown([row(), row({ key: "11" })])).toBe(true);
  });
});

describe("labels", () => {
  it("names a business type in the words the rest of the app uses", () => {
    expect(typeKeyLabel("vtc_company")).toBe("VTC or taxi company");
  });

  it("names the missing ones instead of dropping them", () => {
    // ⚑ The founder's rule: a dashboard says "3 of 9 located", it never quietly
    // counts only what it can find.
    expect(typeKeyLabel(null)).toBe("No type on file");
    expect(cityKeyLabel(null)).toBe("No city on file");
  });

  it("shows an unrecognised stored value as itself, never as 'other'", () => {
    expect(typeKeyLabel("chateau")).toBe("chateau");
    expect(regionKeyLabel("99")).toBe("Région 99");
  });

  it("turns INSEE codes into words", () => {
    expect(regionKeyLabel("93")).toBe("Provence-Alpes-Côte d'Azur");
    expect(regionKeyLabel("11")).toBe("Île-de-France");
  });

  it("calls a null région 'Outside France', because that is what it is", () => {
    // ⚑ Monaco. Not missing data — a real slice of this market. Calling it
    // "unknown" is what would tempt someone to "fix" it by filing it under 06.
    expect(regionKeyLabel(null)).toBe("Outside France");
  });

  it("un-shouts the register's upper-case towns", () => {
    expect(cityKeyLabel("CANNES")).toBe("Cannes");
    expect(cityKeyLabel("MONACO")).toBe("Monaco");
  });
});

describe("nestCities", () => {
  const paca = row({ key: "93", trips: 300 });
  const idf = row({ key: "11", trips: 500, businesses: 9 });

  it("puts each city under its own région, busiest first", () => {
    const groups = nestCities(
      [paca, idf],
      [
        row({ key: "CANNES", parent: "93", trips: 120 }),
        row({ key: "NICE", parent: "93", trips: 180 }),
        row({ key: "PARIS", parent: "11", trips: 500 }),
      ],
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Île-de-France",
      "Provence-Alpes-Côte d'Azur",
    ]);
    expect(groups[1].cities.map((c) => c.label)).toEqual(["Nice", "Cannes"]);
  });

  it("never loses a city whose région is null", () => {
    // ⚑ THE ONE THAT MATTERS. Monaco has a city and no région. A nesting that
    // keyed only off the région list would drop it, and the town would vanish
    // from a screen whose whole job is "where do they book from".
    const groups = nestCities(
      [paca],
      [row({ key: "MONACO", parent: null, trips: 46, businesses: 1 })],
    );
    const outside = groups.find((g) => g.label === "Outside France");
    expect(outside).toBeDefined();
    expect(outside!.cities.map((c) => c.label)).toEqual(["Monaco"]);
  });

  it("keeps a région that has no cities yet", () => {
    const groups = nestCities([paca], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].cities).toEqual([]);
  });

  it("gives a city naming an unlisted région its own group rather than dropping it", () => {
    const groups = nestCities([], [row({ key: "LYON", parent: "84" })]);
    expect(groups.map((g) => g.label)).toEqual(["Auvergne-Rhône-Alpes"]);
  });
});

describe("the typical Business", () => {
  it("counts only the ones that have posted, and says so", () => {
    // ⚑ Including the silent Businesses would drag the typical figure toward
    // zero and describe nobody. They have their own number two cards along.
    expect(medianValue({ median_trips: 4.5, posting_businesses: 12 })).toBe("5");
    expect(medianNote({ median_trips: 4.5, posting_businesses: 12 })).toBe(
      "the typical one of the 12 that post",
    );
  });

  it("refuses rather than printing a zero nobody can interpret", () => {
    expect(medianValue({ median_trips: null, posting_businesses: 0 })).toBe("—");
    expect(medianNote({ median_trips: null, posting_businesses: 0 })).toBeNull();
  });
});

describe("typeKeyShort", () => {
  it("fits a table cell without wrapping the row taller than its neighbours", () => {
    // ⚑ The defect this closes: "Hotel & accommodation" wrapped to two lines in
    // a 118px column on the live render — invisible in a mockup, obvious the
    // moment real rows sat next to each other.
    expect(typeKeyShort("hotel")).toBe("Hotel");
    expect(typeKeyShort("vtc_company")).toBe("VTC");
    expect(typeKeyShort(null)).toBe("No type");
  });

  it("shortens by naming, never by truncating", () => {
    // Splitting on " & " would turn "Concierge & private services" into a
    // different job and "Travel agency & tour operator" into a narrower one.
    expect(typeKeyShort("concierge")).toBe("Concierge");
    expect(typeKeyShort("travel_agency")).toBe("Travel agency");
  });

  it("still shows an unrecognised stored value as itself", () => {
    expect(typeKeyShort("chateau")).toBe("chateau");
  });
});

describe("a row with no settled trips in the period", () => {
  it("has no fill rate to suppress, only an absence", () => {
    // ⚑ Since breakdown rows are no longer dropped for being quiet, an inactive
    // région in a chosen month is the NORMAL case, not an edge one. The screen
    // renders "—"; this pins that fillRate still refuses rather than dividing.
    expect(fillRate({ settled: 0, filled: 0 })).toBeNull();
  });
});
