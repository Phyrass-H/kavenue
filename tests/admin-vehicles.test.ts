// /admin/vehicles — the grid, its words, and the car rows (S81, [[d142]]).
//
// ⚑ THE GRID IS A CENSUS, SO WHAT IT MUST NEVER DO IS LOSE A ROW. The nine classes always draw, in
// SERVICE_TIERS order rather than the enum's, and a key nobody expected (the legacy `van` category)
// is kept after them — [[d103]], "a null key is a row".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_FOR_RATE } from "@/lib/admin-numbers";
import { formatShortDay } from "@/lib/format";
import {
  ANY_BODY,
  canWorkIdle,
  carListHref,
  carModelOf,
  carRowKindOf,
  carsMatchSays,
  filledSays,
  gridLabel,
  gridRowHref,
  nobodyTookOf,
  replacedSays,
  rpcMissing,
  vehicleFilter,
  vehicleGridRows,
  type AdminVehicleDemand,
  type AdminVehicleSupply,
  personNotApprovedSays,
} from "@/lib/admin-vehicles";

const supply = (category: string, body_type: string, s: Partial<AdminVehicleSupply> = {}): AdminVehicleSupply => ({
  category,
  body_type,
  live_cars: 0,
  can_work: 0,
  to_approve: 0,
  refused: 0,
  person_not_approved: 0,
  ...s,
});
const demand = (category: string, body: string, d: Partial<AdminVehicleDemand> = {}): AdminVehicleDemand => ({
  category,
  body,
  trips: 0,
  settled: 0,
  filled: 0,
  nobody_took: 0,
  ...d,
});
const ALL_TIME = { period: null, anchor: null };

describe("vehicleGridRows — the order", () => {
  it("draws the nine classes on an empty database, eco → business → First, each Sedan · Van · Any body", () => {
    const rows = vehicleGridRows({ supply: [], demand: [] });
    expect(rows.map((r) => r.key)).toEqual([
      "eco|sedan", "eco|van", "eco|any",
      "business|sedan", "business|van", "business|any",
      "luxury|sedan", "luxury|van", "luxury|any",
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "Eco · Sedan", "Eco · Van", "Eco · Any body",
      "Business · Sedan", "Business · Van", "Business · Any body",
      "First · Sedan", "First · Van", "First · Any body",
    ]);
  });

  it("⚑ still draws them when the function returned null arrays (json_agg over nothing)", () => {
    expect(vehicleGridRows({ supply: null, demand: null })).toHaveLength(9);
    expect(vehicleGridRows(null)).toHaveLength(9);
  });

  it("opens each class after the first with a gap, and only there", () => {
    const gaps = vehicleGridRows({ supply: [], demand: [] }).filter((r) => r.gapBefore).map((r) => r.key);
    expect(gaps).toEqual(["business|sedan", "luxury|sedan"]);
  });

  it("⚑ keeps a key nobody expected, after the nine, as its own row", () => {
    const rows = vehicleGridRows({
      supply: [supply("van", "van", { can_work: 1 }), supply("eco", "sedan", { can_work: 2 })],
      demand: [demand("van", ANY_BODY, { trips: 3 })],
    });
    expect(rows.map((r) => r.key).slice(9)).toEqual(["van|van", "van|any"]);
    expect(rows[9]!.gapBefore).toBe(true);
    expect(rows[10]!.gapBefore).toBe(false);
    expect(rows[10]!.label).toBe("Van · Any body");
    expect(rows[10]!.trips).toBe(3);
    // Nothing counted twice, nothing lost: the census adds up to what SQL sent.
    expect(rows.reduce((n, r) => n + (r.body === ANY_BODY ? 0 : r.canWork), 0)).toBe(3);
  });

  it("writes out a body it does not know rather than dropping it", () => {
    expect(gridLabel("eco", "coupe")).toBe("Eco · coupe");
    expect(gridLabel("eco", "sedan")).toBe("Eco · Sedan");
  });
});

describe("vehicleGridRows — the any row", () => {
  const rows = vehicleGridRows({
    supply: [
      supply("business", "sedan", { can_work: 2, to_approve: 3, person_not_approved: 2, refused: 1 }),
      supply("business", "van", { can_work: 1, refused: 4 }),
      supply("eco", "sedan", { can_work: 9 }),
    ],
    demand: [demand("business", ANY_BODY, { trips: 200, settled: 198, filled: 158, nobody_took: 40 })],
  });
  const by = (k: string) => rows.find((r) => r.key === k)!;

  it("⚑ counts every car of its class — sedan plus van, never another class", () => {
    expect(by("business|any").canWork).toBe(3);
    expect(by("eco|any").canWork).toBe(9);
    expect(by("luxury|any").canWork).toBe(0);
  });

  it("carries no pills — the waiting cars are already on the body rows", () => {
    expect(by("business|any").waiting).toBe(0);
    expect(by("business|any").refused).toBe(0);
  });

  // ⚑ S81 review: an approved car's unapproved Driver may owe documents — the Driver's move — so it is
  //   never counted in amber.
  it("puts only the car to approve in the amber pill; the person not approved and refused apart", () => {
    expect(by("business|sedan").waiting).toBe(3);
    expect(by("business|sedan").personNotApproved).toBe(2);
    expect(by("business|any").personNotApproved).toBe(0);
    expect(by("business|sedan").refused).toBe(1);
    expect(by("business|van").waiting).toBe(0);
    expect(by("business|van").refused).toBe(4);
  });

  it("takes its trips from its own demand key, not from the body rows", () => {
    expect(by("business|any").trips).toBe(200);
    // ⚑ S81 re-check: each count from its own field — a swap would print "198 of 198 · 100 %".
    expect(by("business|any").settled).toBe(198);
    expect(by("business|any").filled).toBe(158);
    expect(by("business|any").nobodyTook).toBe(40);
    expect(by("business|sedan").trips).toBe(0);
  });
});

describe("the words", () => {
  it("filled: a dash when nothing settled, the count below the threshold, the rate at it", () => {
    expect(filledSays({ settled: 0, filled: 0 })).toBe("—");
    expect(filledSays({ settled: 1, filled: 0 })).toBe("0 of 1");
    expect(filledSays({ settled: MIN_FOR_RATE - 1, filled: MIN_FOR_RATE - 1 })).toBe(
      `${MIN_FOR_RATE - 1} of ${MIN_FOR_RATE - 1}`,
    );
    expect(filledSays({ settled: MIN_FOR_RATE, filled: MIN_FOR_RATE })).toBe(
      `${MIN_FOR_RATE} of ${MIN_FOR_RATE} · 100\u202F%`,
    );
    expect(filledSays({ settled: 32, filled: 24 })).toBe("24 of 32 · 75\u202F%");
  });

  it("⚑ can work goes amber only when the period asked for trips and no car of the class can take one", () => {
    expect(canWorkIdle({ trips: 4, canWork: 0 })).toBe(true);
    expect(canWorkIdle({ trips: 0, canWork: 0 })).toBe(false);
    expect(canWorkIdle({ trips: 4, canWork: 1 })).toBe(false);
  });

  it("nobody took: red when any, 0 when there were trips, a dash when there were none", () => {
    expect(nobodyTookOf({ trips: 5, nobodyTook: 2 })).toEqual({ state: "bad", text: "2" });
    expect(nobodyTookOf({ trips: 5, nobodyTook: 0 })).toEqual({ state: "zero", text: "0" });
    expect(nobodyTookOf({ trips: 0, nobodyTook: 0 })).toEqual({ state: "none", text: "—" });
  });

  it("the search title agrees with its number", () => {
    expect(carsMatchSays(1, "AB-123")).toBe("1 car matches “AB-123”");
    expect(carsMatchSays(7, "mercedes")).toBe("7 cars match “mercedes”");
    expect(carsMatchSays(0, "zz")).toBe("0 cars match “zz”");
  });

  it("names a car by make and model, and a dash when neither was recorded", () => {
    expect(carModelOf({ make: "Mercedes-Benz", model: "Classe E" })).toBe("Mercedes-Benz Classe E");
    expect(carModelOf({ make: "Tesla", model: null })).toBe("Tesla");
    expect(carModelOf({ make: null, model: " " })).toBe("—");
  });
});

describe("a replaced car", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("⚑ says what took its place and when — the founder's trace", () => {
    const at = "2026-09-12T08:30:00Z";
    expect(replacedSays({ retired_at: at, replaced_by_plate: "AB-123-CD" })).toBe(
      `Replaced by AB-123-CD · ${formatShortDay(at)}`,
    );
  });

  it("still says it was replaced when the successor has no plate", () => {
    const at = "2026-09-12T08:30:00Z";
    expect(replacedSays({ retired_at: at, replaced_by_plate: null })).toBe(`Replaced · ${formatShortDay(at)}`);
  });

  it("says nothing about a live car", () => {
    expect(replacedSays({ retired_at: null, replaced_by_plate: null })).toBeNull();
  });

  it("⚑ a replaced row does not wait on the papers; a live row never guesses from a failed read", () => {
    expect(carRowKindOf({ retired_at: "2026-09-12T08:30:00Z" }, true)).toBe("replaced");
    expect(carRowKindOf({ retired_at: null }, true)).toBe("unread");
    expect(carRowKindOf({ retired_at: null }, false)).toBe("piles");
  });
});

describe("the links", () => {
  it("a grid row opens its class", () => {
    expect(gridRowHref({ category: "business", body: "any" }, ALL_TIME)).toBe(
      "/admin/vehicles?category=business&body=any",
    );
  });

  it("⚑ and carries the period — a range keeps both ends, a month keeps its anchor", () => {
    expect(gridRowHref({ category: "eco", body: "van" }, { period: "range", anchor: null, from: "2026-08-10", to: "2026-08-20" }))
      .toBe("/admin/vehicles?category=eco&body=van&period=range&from=2026-08-10&to=2026-08-20");
    expect(gridRowHref({ category: "eco", body: "sedan" }, { period: "month", anchor: "2026-07-01" }))
      .toBe("/admin/vehicles?category=eco&body=sedan&period=month&anchor=2026-07-01");
  });

  it("a page of cars keeps its search and drops page 0", () => {
    expect(carListHref({ q: "mercedes" }, ALL_TIME, 0)).toBe("/admin/vehicles?q=mercedes");
    expect(carListHref({ category: "eco", body: "any" }, { period: "year", anchor: "2026-01-01" }, 2)).toBe(
      "/admin/vehicles?category=eco&body=any&page=2&period=year&anchor=2026-01-01",
    );
  });

  it("reads the class off the URL — none without a category, any without a body, the first of a repeat", () => {
    expect(vehicleFilter(undefined, "van")).toBeNull();
    expect(vehicleFilter("  ", undefined)).toBeNull();
    expect(vehicleFilter("eco", undefined)).toEqual({ category: "eco", body: "any" });
    expect(vehicleFilter(["luxury", "eco"], ["van", "sedan"])).toEqual({ category: "luxury", body: "van" });
  });
});

describe("rpcMissing", () => {
  it("⚑ only a function that is not there says 'run the migration'", () => {
    expect(rpcMissing({ code: "42883" })).toBe(true);
    expect(rpcMissing({ code: "PGRST202" })).toBe(true);
    expect(rpcMissing({ code: "42501" })).toBe(false);
    expect(rpcMissing(null)).toBe(false);
  });
});

describe("personNotApprovedSays — a count of people", () => {
  it("says person for one, people for more", () => {
    expect(personNotApprovedSays(1)).toBe("1 person not approved");
    expect(personNotApprovedSays(2)).toBe("2 people not approved");
  });
});
