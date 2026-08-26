// "Why can't this Driver take this trip?" — the answer, pinned.
//
// ⚑ WHAT THESE ACTUALLY GUARD. lib/eligibility.ts is a MIRROR of two authorities
// it cannot import: `accept_mission` (SQL) and the Pool query (a server
// component). A mirror that drifts is worse than no mirror — it answers an
// admin's question confidently and wrongly. So these tests pin the two things
// drift would break first:
//
//   1. Every rule that REFUSES is one accept_mission really raises on, and every
//      rule that only HIDES is one the Pool really filters on. Swapping a rule
//      between the two groups changes the answer from "they were turned down" to
//      "they never saw it", which are different problems with different fixes.
//   2. A failure names what failed, in the reader's words, and the first failure
//      a person would meet is the one reported.
//
// The live half — that the SQL still raises where this says "refuse" — belongs
// to a probe, not to vitest, which has no database.
import { describe, expect, it } from "vitest";
import {
  explainEligibility,
  becauseOf,
  RULES,
  type EligibilityInput,
  type EligibilityRuleId,
} from "@/lib/eligibility";
import { mission } from "./fixtures";

const NOW = new Date("2026-07-15T09:00:00+02:00"); // 3h before the fixture pickup

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    // The fixture requires a sedan; keep that satisfied unless a case is about it.
    mission: mission({ required_body_type: null }),
    driver: {
      first_name: "Marc",
      last_name: "Fontaine",
      accepts_luggage_runs: false,
      base_lat: 43.7,
      base_lng: 7.26,
      base_label: "Nice",
      service_radius_km: 50,
      verified: true,
      operational_zones: ["Nice", "Cannes"],
    },
    vehicle: { category: "business", body_type: "sedan", make: "Mercedes", model: "Classe E" },
    otherPickupsAt: [],
    now: NOW,
    ...over,
  };
}

const idsOfKind = (kind: "refuse" | "hide") =>
  (Object.keys(RULES) as EligibilityRuleId[]).filter((id) => RULES[id].kind === kind);

describe("the two groups are the two authorities", () => {
  // If a rule moves between these lists, the console starts telling an admin the
  // wrong KIND of problem — the one thing this split exists to prevent.
  it("refusals are exactly what accept_mission raises on", () => {
    expect(idsOfKind("refuse").sort()).toEqual(
      ["luggage_opt_in", "not_past_due", "slot_free", "still_pooled", "vehicle_body", "vehicle_class"],
    );
  });

  it("the hiding rules are exactly what the Pool query filters on", () => {
    expect(idsOfKind("hide").sort()).toEqual(["has_base", "specific_car", "within_radius"]);
  });

  it("every rule id has a description — the map is keyed on the type", () => {
    const e = explainEligibility(input());
    expect(e.rules.map((r) => r.id).sort()).toEqual(Object.keys(RULES).sort());
  });
});

describe("a Driver who can take it", () => {
  it("says yes, and has no blocker", () => {
    const e = explainEligibility(input());
    expect(e.verdict).toBe("can_take");
    expect(e.blocker).toBeNull();
    expect(e.answer).toBe("Yes — Marc Fontaine can take this trip.");
    expect(e.rules.every((r) => r.ok)).toBe(true);
  });
});

describe("refused — the accept would bounce", () => {
  it("wrong class names both classes, in the words the app shows", () => {
    const e = explainEligibility(
      input({ vehicle: { category: "eco", body_type: "sedan", make: "Peugeot", model: "508" } }),
    );
    expect(e.verdict).toBe("refused");
    expect(e.blocker?.id).toBe("vehicle_class");
    expect(e.blocker?.says).toBe("their car is Eco, and this trip asks for Business");
    expect(becauseOf(e)).toContain("Kavenue would turn the acceptance down");
  });

  it("no car on file is a refusal, because accept_mission's `not exists` finds none", () => {
    const e = explainEligibility(input({ vehicle: null }));
    expect(e.blocker?.id).toBe("vehicle_class");
    expect(e.blocker?.says).toBe("they have no car on file");
  });

  it("a required body type the car doesn't have", () => {
    const e = explainEligibility({
      ...input(),
      mission: mission({ required_body_type: "van" }),
    });
    expect(e.blocker?.id).toBe("vehicle_body");
    expect(e.blocker?.says).toBe("this trip needs a van, and their car is a sedan");
  });

  it("a luggage-only run the Driver never opted into", () => {
    const e = explainEligibility({
      ...input(),
      mission: mission({ required_body_type: null, luggage_only: true }),
    });
    expect(e.blocker?.id).toBe("luggage_opt_in");
  });

  it("opting in clears it", () => {
    const base = input();
    const e = explainEligibility({
      ...base,
      driver: { ...base.driver, accepts_luggage_runs: true },
      mission: mission({ required_body_type: null, luggage_only: true }),
    });
    expect(e.verdict).toBe("can_take");
  });

  it("a trip that has left the Pool", () => {
    const e = explainEligibility({
      ...input(),
      mission: mission({ required_body_type: null, status: "confirmed" }),
    });
    expect(e.blocker?.id).toBe("still_pooled");
    expect(e.blocker?.says).toBe("the trip is no longer in the Pool — it is confirmed");
  });

  it("a past-due trip — § P, a dead booking never becomes a live obligation", () => {
    const e = explainEligibility(input({ now: new Date("2026-07-15T13:00:00+02:00") }));
    expect(e.blocker?.id).toBe("not_past_due");
  });

  // ±90 minutes, the window accept_mission blocks on. Both sides, and the edge.
  it.each([
    ["89 minutes before", "2026-07-15T10:31:00+02:00", true],
    ["89 minutes after", "2026-07-15T13:29:00+02:00", true],
    ["91 minutes before", "2026-07-15T10:29:00+02:00", false],
    ["91 minutes after", "2026-07-15T13:31:00+02:00", false],
  ])("another trip %s the pickup clashes: %s", (_label, at, clashes) => {
    const e = explainEligibility(input({ otherPickupsAt: [at] }));
    expect(e.rules.find((r) => r.id === "slot_free")!.ok).toBe(!clashes);
  });
});

describe("never seen it — the Pool never showed it", () => {
  it("no base is the emptiest Pool there is", () => {
    const base = input();
    const e = explainEligibility({
      ...base,
      driver: { ...base.driver, base_lat: null, base_lng: null, base_label: null },
    });
    expect(e.verdict).toBe("never_seen");
    expect(e.blocker?.id).toBe("has_base");
    expect(e.blocker?.says).toBe("they have never set a base, so their Pool is empty");
    expect(becauseOf(e)).toContain("Nothing refuses them");
  });

  it("out of radius quotes the distance and the radius", () => {
    const base = input();
    const e = explainEligibility({
      ...base,
      driver: { ...base.driver, base_lat: 48.8566, base_lng: 2.3522, base_label: "Paris", service_radius_km: 15 },
    });
    expect(e.blocker?.id).toBe("within_radius");
    expect(e.blocker?.says).toMatch(/^it is \d+ km from their base, and they drive up to 15 km$/);
  });

  it("the dropoff being in range is enough — the Pool accepts either end", () => {
    const base = input();
    const e = explainEligibility({
      ...base,
      // 5 km radius around the DROPOFF; the pickup is ~1.5 km further out.
      driver: { ...base.driver, base_lat: 43.69, base_lng: 7.25, service_radius_km: 5 },
    });
    expect(e.verdict).toBe("can_take");
  });

  it("a specific car the Driver doesn't have", () => {
    const e = explainEligibility({
      ...input(),
      mission: mission({ required_body_type: null, required_make: "Tesla", required_model: "Model S" }),
    });
    expect(e.blocker?.id).toBe("specific_car");
    expect(e.blocker?.says).toBe("this trip asks for a Tesla Model S");
  });
});

describe("a refusal outranks a hidden trip", () => {
  // Both wrong at once: the Driver needs to hear the harder problem first.
  it("reports the refusal, not the radius", () => {
    const base = input();
    const e = explainEligibility({
      ...base,
      vehicle: { category: "eco", body_type: "sedan", make: "Peugeot", model: "508" },
      driver: { ...base.driver, base_lat: 48.8566, base_lng: 2.3522, service_radius_km: 15 },
    });
    expect(e.verdict).toBe("refused");
    expect(e.blocker?.id).toBe("vehicle_class");
  });
});

describe("recorded, but decides nothing", () => {
  // ⚑ These two are reported, never omitted. A console that quietly left them out
  // would let a reader assume they matter — and one of them is `verified`.
  it("names the towns and the verified flag, on a Driver who can take the trip", () => {
    const e = explainEligibility(input());
    expect(e.decidesNothing.map((d) => d.says)).toEqual([
      "Towns they say they work",
      "Verified by you",
    ]);
    expect(e.decidesNothing[0].detail).toBe("Nice, Cannes");
  });

  it("an unverified Driver is still allowed to take the trip", () => {
    const base = input();
    const e = explainEligibility({ ...base, driver: { ...base.driver, verified: false } });
    expect(e.verdict).toBe("can_take");
    expect(e.decidesNothing[1].says).toBe("Not verified by you");
    // ⚑ Null, not "never consulted": the row template already says that, and
    // repeating it printed the phrase twice on one line.
    expect(e.decidesNothing[1].detail).toBeNull();
  });
});
