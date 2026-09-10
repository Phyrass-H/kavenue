// The rules that turn a Google place into Kavenue's own vocabulary.
//
// ⚑ MONACO IS THE POINT OF THIS FILE. It is a large, real part of this market, and
// the digits rule that serves French postcodes turns 98000 into département "980" —
// a code that does not exist. Every test below that names Monaco is guarding a
// number the founder will one day read on a screen.
import { describe, it, expect } from "vitest";
import { resolveArea, areaFromComponents, encodeArea, decodeArea, areaLabel, EMPTY_AREA } from "../lib/place-area";
import { regionCodeFromName, regionKeyLabel, placeKey } from "../lib/france-geo";

describe("regionCodeFromName", () => {
  it("finds the INSEE code for a région Google names", () => {
    expect(regionCodeFromName("Provence-Alpes-Côte d'Azur")).toBe("93");
    expect(regionCodeFromName("Île-de-France")).toBe("11");
  });

  it("survives accents, hyphens and spacing", () => {
    expect(regionCodeFromName("ile de france")).toBe("11");
    expect(regionCodeFromName("PROVENCE ALPES COTE D AZUR")).toBe("93");
    expect(regionCodeFromName("Provence Alpes Côte d’Azur")).toBe("93");
  });

  it("returns null for anything that is not one of the eighteen", () => {
    expect(regionCodeFromName("Liguria")).toBeNull();
    expect(regionCodeFromName("")).toBeNull();
    expect(regionCodeFromName(null)).toBeNull();
    expect(regionCodeFromName(undefined)).toBeNull();
  });
});

describe("resolveArea — France", () => {
  it("derives the département from the postcode and the région from the name", () => {
    expect(
      resolveArea({ city: "Cannes", postcode: "06400", regionName: "Provence-Alpes-Côte d'Azur", country: "FR" }),
    ).toEqual({ city: "Cannes", postcode: "06400", departement: "06", region: "93", country: "FR" });
  });

  it("keeps Corsica out of the département that does not exist", () => {
    expect(resolveArea({ postcode: "20000", country: "FR" }).departement).toBe("2A");
    expect(resolveArea({ postcode: "20200", country: "FR" }).departement).toBe("2B");
  });

  it("keeps the overseas départements three digits", () => {
    expect(resolveArea({ postcode: "97400", country: "FR" }).departement).toBe("974");
  });
});

describe("resolveArea — outside France", () => {
  // ⚑ THE ONE THAT MATTERS. Without the country gate this reads "980".
  it("gives Monaco a city and a postcode, and NO French codes", () => {
    const monaco = resolveArea({
      city: "Monaco",
      postcode: "98000",
      regionName: "Monaco",
      country: "MC",
    });
    expect(monaco.city).toBe("Monaco");
    expect(monaco.postcode).toBe("98000");
    expect(monaco.departement).toBeNull();
    expect(monaco.region).toBeNull();
    expect(monaco.country).toBe("MC");
  });

  // ⚑ THE FOUNDER'S RULE, 2026-09-10: "if it's outside of France then you name the
  // country, period". A Monaco row groups under "C:MC" and reads "Monaco".
  it("names the country rather than saying Outside France", () => {
    const a = resolveArea({ city: "Monaco", country: "MC" });
    expect(regionKeyLabel(placeKey(a.region, a.country))).toBe("Monaco");
  });

  it("keeps 'nobody established it' separate from 'abroad'", () => {
    // A row with neither a région nor a country has not been looked up. Calling that
    // abroad would be an invention.
    expect(placeKey(null, null)).toBeNull();
    expect(regionKeyLabel(null)).toBe("Location not established");
  });

  it("does the same for Italy, the other side of the same market", () => {
    const it_ = resolveArea({ city: "Ventimiglia", postcode: "18039", regionName: "Liguria", country: "IT" });
    expect(it_.departement).toBeNull();
    expect(it_.region).toBeNull();
    expect(it_.city).toBe("Ventimiglia");
  });

  it("is case-insensitive about the country code", () => {
    expect(resolveArea({ postcode: "06400", regionName: "Provence-Alpes-Côte d'Azur", country: "fr" }).departement)
      .toBe("06");
  });
});

describe("resolveArea — nothing, and near-nothing", () => {
  it("returns the empty area for null and undefined", () => {
    expect(resolveArea(null)).toEqual(EMPTY_AREA);
    expect(resolveArea(undefined)).toEqual(EMPTY_AREA);
  });

  it("treats blank strings as absent", () => {
    expect(resolveArea({ city: "   ", postcode: "", regionName: " ", country: "" })).toEqual(EMPTY_AREA);
  });

  it("without a country, claims no French codes", () => {
    // A place with no country component is not evidence of France.
    const a = resolveArea({ city: "Nowhere", postcode: "06400" });
    expect(a.departement).toBeNull();
    expect(a.region).toBeNull();
  });
});

describe("areaFromComponents", () => {
  const components = [
    { types: ["locality", "political"], longText: "Cannes", shortText: "Cannes" },
    { types: ["postal_code"], longText: "06400", shortText: "06400" },
    { types: ["administrative_area_level_1", "political"], longText: "Provence-Alpes-Côte d'Azur", shortText: "PACA" },
    { types: ["administrative_area_level_2", "political"], longText: "Alpes-Maritimes", shortText: "Alpes-Maritimes" },
    { types: ["country", "political"], longText: "France", shortText: "FR" },
  ];

  it("reads the four fields we keep", () => {
    expect(areaFromComponents(components)).toEqual({
      city: "Cannes",
      postcode: "06400",
      regionName: "Provence-Alpes-Côte d'Azur",
      departementName: "Alpes-Maritimes",
      country: "FR",
    });
  });

  // ⚑ SHORT name for the country: "FR", not "France" — a code to compare, not a word.
  it("takes the country's short text, so it is an ISO code", () => {
    expect(areaFromComponents(components).country).toBe("FR");
  });

  it("falls back to postal_town where Google uses that instead of locality", () => {
    expect(areaFromComponents([{ types: ["postal_town"], longText: "Ashford" }]).city).toBe("Ashford");
  });

  it("never throws on a shape Google did not promise", () => {
    const nothing = { city: null, postcode: null, regionName: null, departementName: null, country: null };
    expect(areaFromComponents(undefined)).toEqual(nothing);
    expect(areaFromComponents([])).toEqual(nothing);
    expect(areaFromComponents([{}])).toEqual(nothing);
  });
});

describe("encode / decode across the form field", () => {
  const raw = { city: "Cannes", postcode: "06400", regionName: "Provence-Alpes-Côte d'Azur", departementName: "Alpes-Maritimes", country: "FR" };

  it("round-trips", () => {
    expect(decodeArea(encodeArea(raw))).toEqual(raw);
  });

  it("carries nothing when there is nothing to carry", () => {
    expect(encodeArea({ city: null, postcode: null, regionName: null, departementName: null, country: null })).toBe("");
    expect(encodeArea(null)).toBe("");
  });

  // ⚑ A hidden field is user-editable. Bad input is no area, never a crash.
  it("never throws on rubbish", () => {
    expect(decodeArea("not json")).toBeNull();
    expect(decodeArea("")).toBeNull();
    expect(decodeArea(null)).toBeNull();
    expect(decodeArea("[1,2,3]")).toEqual({ city: null, postcode: null, regionName: null, departementName: null, country: null });
    expect(decodeArea("null")).toBeNull();
  });

  it("survives the whole round trip into stored values", () => {
    expect(resolveArea(decodeArea(encodeArea(raw)))).toEqual({
      city: "Cannes",
      postcode: "06400",
      departement: "06",
      region: "93",
      country: "FR",
    });
  });
});

describe("areaLabel — the phrase a screen shows", () => {
  it("names the département inside France", () => {
    expect(areaLabel({ departement: "06", country: "FR" })).toBe("Alpes-Maritimes");
    expect(areaLabel({ departement: "13", country: "FR" })).toBe("Bouches-du-Rhône");
    expect(areaLabel({ departement: "2A", country: "FR" })).toBe("Corse-du-Sud");
  });

  // ⚑ THE FOUNDER'S CALL: "Monaco is a country so it should be treated that way".
  it("names the country outside France, rather than 'Outside France'", () => {
    expect(areaLabel({ departement: null, country: "MC" })).toBe("Monaco");
    expect(areaLabel({ departement: null, country: "IT" })).toBe("Italy");
  });

  it("falls through to the raw ISO code for a country nobody named", () => {
    expect(areaLabel({ departement: null, country: "JP" })).toBe("JP");
  });

  it("says so plainly when there is nothing at all", () => {
    expect(areaLabel({ departement: null, country: null })).toBe("No location on file");
  });

  it("reads a Monaco base end to end", () => {
    const a = resolveArea({ city: "Monaco", postcode: "98000", regionName: "Monaco", country: "MC" });
    expect(areaLabel(a)).toBe("Monaco");
  });
});

describe("département without a postcode — the town-level case", () => {
  // ⚑ 7 OF 14 LIVE DRIVERS HIT THIS on 2026-09-10. A base resolved at town level
  // ("Antibes") carries no postal_code at all, and the postcode rule alone stored null.
  it("falls back to the département's NAME when there is no postcode", () => {
    const a = resolveArea({
      city: "Antibes",
      postcode: null,
      departementName: "Alpes-Maritimes",
      regionName: "Provence-Alpes-Côte d'Azur",
      country: "FR",
    });
    expect(a.departement).toBe("06");
    expect(a.region).toBe("93");
    expect(areaLabel(a)).toBe("Alpes-Maritimes");
  });

  it("still prefers the postcode when both are there", () => {
    // A postcode is unambiguous; a name can be mistyped or translated.
    expect(resolveArea({ postcode: "13001", departementName: "Alpes-Maritimes", country: "FR" }).departement)
      .toBe("13");
  });

  it("does not use the name outside France", () => {
    expect(resolveArea({ departementName: "Alpes-Maritimes", country: "MC" }).departement).toBeNull();
  });

  it("is null for a name that is not a département", () => {
    expect(resolveArea({ departementName: "Liguria", country: "FR" }).departement).toBeNull();
  });
});
