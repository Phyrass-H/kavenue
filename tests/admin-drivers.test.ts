// The Drivers screen's shaping rules — the Businesses screen's twin ([[d100]]).
//
// ⚑ TWO OF THESE DEFEND FINDINGS THAT ALREADY EXISTED AND COULD HAVE BEEN LOST
// IN THE REWRITE: the fleet list's THIRD state ("held 8, none finished", S69),
// and the rule that a gender breakdown must carry its own denominator because
// most of the fleet has never been asked.
import { describe, expect, it } from "vitest";
import { fillRate, worthBreakingDown } from "@/lib/admin-rollup";
import { MIN_FOR_RATE } from "@/lib/admin-numbers";
import {
  classKeyLabel,
  finishRate,
  genderAnsweredNote,
  genderKeyLabel,
  makeKeyLabel,
  medianNote,
  medianValue,
  workedSays,
} from "@/lib/admin-drivers";

describe("the shared rollup rules reach this screen too", () => {
  it("uses the very same fillRate, not a copy", () => {
    // ⚑ If someone re-implements this in admin-drivers, the two screens can
    // disagree about when a percentage is honest, in front of the same person.
    expect(fillRate({ settled: MIN_FOR_RATE - 1, filled: 0 })).toBeNull();
    expect(fillRate({ settled: 40, filled: 30 })).toBe(75);
  });

  it("⚑ measures taken/finished, because filled would be 100 % on every row", () => {
    // Every trip a Driver holds was accepted by that same Driver. Reusing the
    // Businesses pair verbatim would put "100 %" beside all of them forever and
    // answer nothing. This is the whole reason finishRate exists.
    expect(finishRate({ taken: 40, finished: 30 })).toBe(75);
    expect(finishRate({ taken: 40, finished: 40 })).toBe(100);
  });

  it("still suppresses the rate on a thin sample, through the shared threshold", () => {
    expect(finishRate({ taken: MIN_FOR_RATE - 1, finished: 0 })).toBeNull();
  });

  it("still refuses a one-row breakdown", () => {
    expect(worthBreakingDown([1])).toBe(false);
    expect(worthBreakingDown([1, 2])).toBe(true);
  });
});

describe("classKeyLabel", () => {
  it("names a car the way the rest of the app names it", () => {
    expect(classKeyLabel("business", "sedan")).toBe("Business · Sedan");
    expect(classKeyLabel("luxury", "van")).toBe("First · Van");
    expect(classKeyLabel("eco", null)).toBe("Eco");
  });

  it("says so when there is no car, rather than leaving a blank cell", () => {
    // A Driver with no vehicle row is a real and important state — they cannot
    // be matched to anything. An empty cell would read as a rendering bug.
    expect(classKeyLabel(null, null)).toBe("No car on file");
    expect(makeKeyLabel(null)).toBe("No car on file");
  });

  it("shows an unrecognised stored category as itself", () => {
    expect(classKeyLabel("hovercraft", "sedan")).toBe("hovercraft · sedan");
  });
});

describe("genderKeyLabel", () => {
  it("keeps 'not asked' as its own row", () => {
    // ⚑ On the day this shipped every Driver was null. Dropping the row would
    // have shown an empty table and claimed the fleet had no genders.
    expect(genderKeyLabel(null)).toBe("Not asked");
  });

  it("distinguishes declining from never being asked", () => {
    expect(genderKeyLabel("undisclosed")).toBe("Rather not say");
    expect(genderKeyLabel(null)).toBe("Not asked");
  });

  it("shows junk as itself rather than folding it into a real category", () => {
    expect(genderKeyLabel("chevalier")).toBe("chevalier");
  });
});

describe("genderAnsweredNote", () => {
  it("says how many answered while anyone has not", () => {
    expect(genderAnsweredNote({ gender_answered: 9, drivers: 13 })).toBe("9 of 13 answered");
  });

  it("goes quiet only when everyone has", () => {
    expect(genderAnsweredNote({ gender_answered: 13, drivers: 13 })).toBeNull();
  });

  it("says 0 of 13 rather than nothing when nobody has been asked", () => {
    // The state on the day the field shipped. Silence here would let the empty
    // table look like a finished answer.
    expect(genderAnsweredNote({ gender_answered: 0, drivers: 13 })).toBe("0 of 13 answered");
  });

  it("survives an empty fleet without dividing by it", () => {
    expect(genderAnsweredNote({ gender_answered: 0, drivers: 0 })).toBeNull();
  });
});

describe("workedSays — three states, not two", () => {
  it("names the Driver who has never taken a trip", () => {
    expect(workedSays({ trips: 0, held_unfinished: 0, last_took: null })).toEqual({
      text: "never taken a trip",
      idle: true,
    });
  });

  it("⚑ keeps the third state: held some, finished none", () => {
    // The S69 finding. Nobody was in this state when it was built, and a
    // two-state version would render "8 trips" — hiding exactly the person
    // worth phoning.
    expect(workedSays({ trips: 8, held_unfinished: 8, last_took: "2026-08-20" })).toEqual({
      text: "held 8, none finished",
      idle: true,
    });
  });

  it("counts a working Driver as working", () => {
    expect(workedSays({ trips: 83, held_unfinished: 2, last_took: "2026-08-25" })).toEqual({
      text: "83 trips",
      idle: false,
    });
  });

  it("says 'trip' for one", () => {
    expect(workedSays({ trips: 1, held_unfinished: 0, last_took: "2026-08-25" }).text).toBe(
      "1 trip",
    );
  });
});

describe("the typical Driver", () => {
  it("counts only those who work, and names the denominator", () => {
    expect(medianValue({ median_trips: 22.5, working_drivers: 11 })).toBe("23");
    expect(medianNote({ median_trips: 22.5, working_drivers: 11 })).toBe(
      "the typical one of the 11 who work",
    );
  });

  it("refuses rather than printing a zero nobody can read", () => {
    expect(medianValue({ median_trips: null, working_drivers: 0 })).toBe("—");
    expect(medianNote({ median_trips: null, working_drivers: 0 })).toBeNull();
  });
});

describe("a row with no trips at all", () => {
  it("has no finish rate to suppress, only an absence", () => {
    // ⚑ "0 of 0" is literally true and tells a reader nothing. The screen shows
    // "—"; this pins that finishRate itself still refuses rather than dividing.
    expect(finishRate({ taken: 0, finished: 0 })).toBeNull();
  });
});
