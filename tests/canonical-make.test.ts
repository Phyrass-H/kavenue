// One spelling per brand, decided on the way in.
//
// ⚑ THE BUG THIS PREVENTS. The live fleet stores "Mercedes"; the catalog's canonical
// brand is "Mercedes-Benz". A brands breakdown grouped on the raw column would show
// one marque as two rows — measured on the real data, 2026-09-09.
import { describe, it, expect } from "vitest";
import { canonicalMake } from "../lib/vehicle-catalog";

describe("canonicalMake — known brands collapse to one spelling", () => {
  it.each(["Mercedes", "Merc", "MB", "Benz", "Mercedes Benz", "mercedes-benz", "MERCEDES"])(
    "%s → Mercedes-Benz",
    (typed) => expect(canonicalMake(typed)).toBe("Mercedes-Benz"),
  );

  it("collapses the other checked brands too", () => {
    expect(canonicalMake("vw")).toBe("Volkswagen");
    expect(canonicalMake("Range Rover")).toBe("Land Rover");
    expect(canonicalMake("b.m.w")).toBe("BMW");
  });

  it("tolerates a model accidentally typed into the make field", () => {
    expect(canonicalMake("Mercedes-Benz Classe E")).toBe("Mercedes-Benz");
  });
});

describe("canonicalMake — unknown brands are kept, only tidied", () => {
  // ⚑ NEVER BLANKED. Losing what a Driver typed is worse than an untidy row.
  it("tidies the case so one marque stops being several", () => {
    expect(canonicalMake("peugeot")).toBe("Peugeot");
    expect(canonicalMake("PEUGEOT")).toBe("Peugeot");
    expect(canonicalMake("Peugeot")).toBe("Peugeot");
  });

  it("keeps a short all-caps marque in capitals", () => {
    // ⚑ "MG" not "DS" — DS IS a checked brand, and this test asserted otherwise until
    // the suite corrected it. Its canonical is "DS Automobiles"; see the case below.
    expect(canonicalMake("MG")).toBe("MG");
  });

  it("still collapses a short brand that IS checked", () => {
    expect(canonicalMake("DS")).toBe("DS Automobiles");
  });

  it("collapses runs of whitespace", () => {
    expect(canonicalMake("  alfa   romeo ")).toBe("Alfa Romeo");
  });

  it("keeps an unrecognised name rather than dropping it", () => {
    expect(canonicalMake("Changan")).toBe("Changan");
  });
});

describe("canonicalMake — nothing", () => {
  it("is null for empty, blank, null and undefined", () => {
    expect(canonicalMake("")).toBeNull();
    expect(canonicalMake("   ")).toBeNull();
    expect(canonicalMake(null)).toBeNull();
    expect(canonicalMake(undefined)).toBeNull();
  });
});

describe("canonicalMake is idempotent", () => {
  // Running it over already-stored values (the backfill) must not keep changing them.
  it.each(["Mercedes-Benz", "Peugeot", "DS Automobiles", "Alfa Romeo", "BMW", "Land Rover"])(
    "%s is unchanged the second time",
    (v) => expect(canonicalMake(canonicalMake(v))).toBe(v),
  );
});
