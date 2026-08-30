// The Driver gender field.
//
// ⚑ EVERY TEST HERE IS ABOUT A DISTINCTION SOMEONE WILL WANT TO COLLAPSE.
// `other`, `undisclosed` and `null` are three different facts, and merging any
// two of them makes "Drivers are declining this question" indistinguishable from
// "we only shipped it yesterday" — which call for opposite responses.
import { describe, expect, it } from "vitest";
import { GENDERS, genderLabel, genderOptions, genderSays, isGender, tallyGender } from "@/lib/gender";

describe("the values", () => {
  it("keeps 'other' and 'rather not say' as separate answers", () => {
    // The founder asked for "other … for those who are indecisive". The value is
    // theirs; someone picking it is not undecided, and someone who would rather
    // not answer needs somewhere else to go.
    expect(GENDERS).toContain("other");
    expect(GENDERS).toContain("undisclosed");
    expect(genderLabel("other")).toBe("Other");
    expect(genderLabel("undisclosed")).toBe("Rather not say");
  });

  it("offers all four, in order, with a label each", () => {
    const options = genderOptions();
    expect(options.map((o) => o.value)).toEqual([...GENDERS]);
    for (const o of options) expect(o.label.length).toBeGreaterThan(0);
  });
});

describe("isGender", () => {
  it("narrows a bare text column and refuses everything else", () => {
    expect(isGender("woman")).toBe(true);
    expect(isGender("Woman")).toBe(false);
    expect(isGender("female")).toBe(false);
    expect(isGender(null)).toBe(false);
    expect(isGender("")).toBe(false);
  });
});

describe("genderSays", () => {
  it("says 'not asked' rather than nothing", () => {
    // ⚑ Printing an empty cell would make an optional question look like one
    // nobody answers. Null is a fact about Kavenue, not about the Driver.
    expect(genderSays(null)).toBe("not asked");
    expect(genderSays(undefined)).toBe("not asked");
  });

  it("distinguishes declining from not being asked", () => {
    expect(genderSays("undisclosed")).toBe("Rather not say");
    expect(genderSays(null)).toBe("not asked");
  });

  it("shows a junk value as itself rather than hiding it", () => {
    expect(genderSays("chevalier")).toBe("chevalier");
  });
});

describe("tallyGender", () => {
  const fleet = [
    { gender: "woman" },
    { gender: "woman" },
    { gender: "man" },
    { gender: "man" },
    { gender: "man" },
    { gender: "other" },
    { gender: "undisclosed" },
    { gender: null },
    { gender: null },
  ];

  it("counts only real answers and names the rest", () => {
    const t = tallyGender(fleet);
    expect(t.total).toBe(9);
    expect(t.answered).toBe(7);
    expect(t.notAsked).toBe(2);
    expect(t.counts.map((c) => [c.value, c.n])).toEqual([
      ["woman", 2],
      ["man", 3],
      ["other", 1],
      ["undisclosed", 1],
    ]);
  });

  it("always says how many answered while anyone has not", () => {
    // ⚑ THE ONE THAT MATTERS. The founder's standing rule, given about Driver
    // geography: a dashboard says "3 of 9 located", it never quietly counts only
    // what it can find.
    expect(tallyGender(fleet).note).toBe("7 of 9 answered");
  });

  it("goes quiet only when there is nothing left unanswered", () => {
    expect(tallyGender([{ gender: "woman" }, { gender: "man" }]).note).toBeNull();
  });

  it("counts a junk value as unanswered rather than inventing a category", () => {
    const t = tallyGender([{ gender: "chevalier" }, { gender: "man" }]);
    expect(t.answered).toBe(1);
    expect(t.notAsked).toBe(1);
    expect(t.counts.map((c) => c.value)).toEqual(["man"]);
  });

  it("drops a value nobody picked instead of drawing a zero row", () => {
    const t = tallyGender([{ gender: "man" }]);
    expect(t.counts.map((c) => c.value)).toEqual(["man"]);
  });

  it("survives an empty fleet without dividing by it", () => {
    const t = tallyGender([]);
    expect(t).toMatchObject({ total: 0, answered: 0, notAsked: 0, counts: [], note: null });
  });
});
