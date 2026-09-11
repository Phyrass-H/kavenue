// What a Driver's car must say. Every case below is a real way a car used to get
// through blank, or a real plate a real Driver could hold.
import { describe, it, expect } from "vitest";
import {
  vehicleProblem, plateFitsCountry, normalisePlate, ageLimitApplies,
  colourLabel, isColour, isEnergy, COLOURS, ENERGIES, parisToday, vehicleProblemSays, type VehicleInput,
} from "../lib/vehicle-rules";

const TODAY = new Date("2026-09-11T12:00:00Z");
const GOOD: VehicleInput = {
  make: "Mercedes-Benz", model: "Classe E", colour: "noir", plate: "AB-123-CD",
  seats: "4", energy: "hybride", firstRegistered: "2021-03-14",
};

describe("vehicleProblem — a complete car passes", () => {
  it("accepts a complete French car", () => {
    expect(vehicleProblem(GOOD, "FR", TODAY)).toBeNull();
  });
});

describe("vehicleProblem — every field is required, named one at a time", () => {
  // ⚑ THE BUG THIS CLOSES: a blank make and model fell through categorize() into Eco.
  it.each([
    ["make", { make: "" }],
    ["model", { model: "  " }],
    ["first_registered", { firstRegistered: "" }],
    ["energy", { energy: "" }],
    ["colour", { colour: "" }],
    ["plate", { plate: "" }],
    ["seats", { seats: "" }],
  ] as const)("%s", (problem, patch) => {
    expect(vehicleProblem({ ...GOOD, ...patch }, "FR", TODAY)).toBe(problem);
  });

  it("names them in the order the form asks", () => {
    // Everything wrong at once → the first one, not a list of eight.
    const blank = { make: "", model: "", colour: "", plate: "", seats: "", energy: "", firstRegistered: "" };
    expect(vehicleProblem(blank, "FR", TODAY)).toBe("make");
  });
});

describe("vehicleProblem — values from the lists only", () => {
  it("refuses a colour typed rather than chosen", () => {
    expect(vehicleProblem({ ...GOOD, colour: "Noir" }, "FR", TODAY)).toBe("colour");
    expect(vehicleProblem({ ...GOOD, colour: "black" }, "FR", TODAY)).toBe("colour");
  });
  it("refuses an energy that is not on the list", () => {
    expect(vehicleProblem({ ...GOOD, energy: "petrol" }, "FR", TODAY)).toBe("energy");
  });
});

describe("vehicleProblem — first registration", () => {
  it("refuses a date in the future", () => {
    expect(vehicleProblem({ ...GOOD, firstRegistered: "2027-01-01" }, "FR", TODAY)).toBe("first_registered_future");
  });
  it("refuses a date that is not a date", () => {
    expect(vehicleProblem({ ...GOOD, firstRegistered: "not-a-date" }, "FR", TODAY)).toBe("first_registered");
  });
  // ⚑ COLLECTION CARS ARE EXEMPT FROM THE AGE LIMIT (art. 1), so an old date is a
  // legitimate answer and must never be refused.
  it("accepts a 1960s collection car", () => {
    expect(vehicleProblem({ ...GOOD, firstRegistered: "1964-06-01" }, "FR", TODAY)).toBeNull();
  });
  it("refuses a date before 1900", () => {
    expect(vehicleProblem({ ...GOOD, firstRegistered: "1850-01-01" }, "FR", TODAY)).toBe("first_registered");
  });
});

describe("vehicleProblem — seats", () => {
  it.each(["0", "10", "4.5", "four", "-1"])("refuses %s", (s) => {
    expect(vehicleProblem({ ...GOOD, seats: s }, "FR", TODAY)).toBe("seats");
  });
  it.each(["1", "4", "7", "9"])("accepts %s", (s) => {
    expect(vehicleProblem({ ...GOOD, seats: s }, "FR", TODAY)).toBeNull();
  });
});

describe("plateFitsCountry — France", () => {
  it.each(["AB-123-CD", "ab-123-cd", "AB123CD", "AB 123 CD"])("accepts the SIV plate %s", (p) => {
    expect(plateFitsCountry(p, "FR")).toBe(true);
  });
  // ⚑ THE OLD SYSTEM IS STILL LEGAL. A pre-2009 car keeps its number, and a hybrid is
  // exempt from the age limit — so one can turn up on a VTC.
  it.each(["5723 HB 62", "448 NRC 75", "182 ABE 974", "1234 AB 2A"])("accepts the FNI plate %s", (p) => {
    expect(plateFitsCountry(p, "FR")).toBe(true);
  });
  it.each(["1234", "ABCD", "A-1-B", "AB-12-CD"])("refuses %s", (p) => {
    expect(plateFitsCountry(p, "FR")).toBe(false);
  });
});

describe("plateFitsCountry — Monaco", () => {
  // Arrêté ministériel n° 78-5, art. 6.
  it.each(["1234", "1", "B123", "Y9", "123B", "12Y"])("accepts the Monaco plate %s", (p) => {
    expect(plateFitsCountry(p, "MC")).toBe(true);
  });
  it.each(["AB-123-CD", "12345", "A123", "O12", "123M"])("refuses %s", (p) => {
    // A is not a Monaco letter; O is not either; M is not allowed AFTER the digits.
    expect(plateFitsCountry(p, "MC")).toBe(false);
  });
});

describe("plateFitsCountry — anywhere we have no rule for", () => {
  // ⚑ Refusing a plate because we never wrote that country's format would be the app
  // inventing a restriction the founder did not make.
  it("accepts any non-empty plate", () => {
    expect(plateFitsCountry("GE 123456", "CH")).toBe(true);
    expect(plateFitsCountry("anything", null)).toBe(true);
  });
  it("still refuses an empty one", () => {
    expect(plateFitsCountry("  ", "IT")).toBe(false);
  });
});

describe("normalisePlate", () => {
  it("stores an SIV plate as AA-123-AA whatever the Driver typed", () => {
    expect(normalisePlate("ab 123 cd")).toBe("AB-123-CD");
    expect(normalisePlate("AB123CD")).toBe("AB-123-CD");
  });
  it("only upper-cases and de-spaces anything else", () => {
    expect(normalisePlate("5723 hb 62")).toBe("5723HB62");
    expect(normalisePlate("b123")).toBe("B123");
  });
});

describe("ageLimitApplies — arrêté du 26 mars 2015, art. 2", () => {
  it.each(["hybride", "hybride_rechargeable", "electrique"] as const)("does not apply to %s", (e) => {
    expect(ageLimitApplies(e)).toBe(false);
  });
  it.each(["essence", "diesel", "gpl", "autre"] as const)("applies to %s", (e) => {
    expect(ageLimitApplies(e)).toBe(true);
  });
});

describe("the lists", () => {
  it("has ten colours plus Autre, as approved", () => {
    expect(COLOURS).toHaveLength(11);
    expect(COLOURS[COLOURS.length - 1]).toBe("autre");
  });
  it("knows every energy it offers", () => {
    for (const e of ENERGIES) expect(isEnergy(e)).toBe(true);
  });
  // ⚑ The fleet was stored as "Noir", "Gris" … before the list existed.
  it("labels a colour stored in the old capitalised form", () => {
    expect(colourLabel("Noir")).toBe("Noir");
    expect(colourLabel("gris")).toBe("Gris");
    expect(isColour("Noir")).toBe(false);
  });
});

// ── the adversarial review, 2026-09-11 — every case below is a defect it found ──

describe("review · the checked plate IS the stored plate", () => {
  it.each(["AB--123-CD", "A-B123CD", "AB-1-23-CD", "-AB123CD-", "ab - 123 - cd"])(
    "%s is both accepted AND stored as AB-123-CD",
    (typed) => {
      expect(plateFitsCountry(typed, "FR")).toBe(true);
      expect(normalisePlate(typed)).toBe("AB-123-CD");
    },
  );
  it("gives one FNI plate one spelling however it is typed", () => {
    expect(normalisePlate("5723-HB-62")).toBe(normalisePlate("5723 HB 62"));
  });
});

describe("review · Monaco issues Z (arrêté 78-5 art. 6, reserved to certain individuals)", () => {
  it.each(["Z123", "Z1", "123Z"])("accepts %s", (p) => expect(plateFitsCountry(p, "MC")).toBe(true));
  it("still refuses M after the digits, which the text excludes", () => {
    expect(plateFitsCountry("123M", "MC")).toBe(false);
  });
});

describe("review · a real calendar date, not just a parseable one", () => {
  // new Date("2023-02-30") rolls over to 2 March; Postgres's date column then refused it.
  it.each(["2023-02-30", "2023-13-01", "2023-04-31", "2023-2-3"])("refuses %s", (d) => {
    expect(vehicleProblem({ ...GOOD, firstRegistered: d }, "FR", TODAY)).toBe("first_registered");
  });
  it("accepts a real leap day", () => {
    expect(vehicleProblem({ ...GOOD, firstRegistered: "2024-02-29" }, "FR", TODAY)).toBeNull();
  });
});

describe("review · 'today' is Paris's today", () => {
  // 23:30 UTC on 10 Sept is 01:30 on 11 Sept in Paris. The first version compared to
  // the UTC clock and refused the Driver's own today as "in the future".
  const lateUtc = new Date("2026-09-10T23:30:00Z");
  it("accepts the Paris date at 01:30 Paris, while UTC is still yesterday", () => {
    expect(parisToday(lateUtc)).toBe("2026-09-11");
    expect(vehicleProblem({ ...GOOD, firstRegistered: "2026-09-11" }, "FR", lateUtc)).toBeNull();
  });
  it("still refuses tomorrow in Paris", () => {
    expect(vehicleProblem({ ...GOOD, firstRegistered: "2026-09-12" }, "FR", lateUtc)).toBe("first_registered_future");
  });
});

describe("review · a URL cannot crash the page", () => {
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "", "nonsense"])(
    "vehicleProblemSays(%j) is null, not an object",
    (why) => expect(vehicleProblemSays(why)).toBeNull(),
  );
  it("still returns the words for a real problem", () => {
    expect(vehicleProblemSays("plate")).toBe("Add your plate to continue");
  });
});
