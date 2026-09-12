// S78 — a car works when a person has approved it, and not before.
//
// ⚑ WHAT THESE TESTS ARE FOR, AND IT IS NOT THE HAPPY PATH. Every rule here exists because
// something in this codebase used to answer "which car is this Driver's" a different way
// ([[d113]]: four rules, three answers for one trip). So the cases that matter are the ones
// where the two answers differ — a retired car, a pending one, a car nobody has looked at.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  CAR_AWAITING_RAISE,
  CAR_BLOCK_SAYS,
  carBlockOf,
  isCarAwaitingError,
  isWorkingCar,
  liveCarOf,
  statusOf,
  workingCarOf,
} from "@/lib/vehicle-approval";
import { NOT_APPROVED_RAISE } from "@/lib/driver-review";

type Car = {
  id: string;
  approval_status: "pending" | "approved" | "rejected";
  retired_at: string | null;
  created_at: string;
};

const car = (over: Partial<Car> = {}): Car => ({
  id: "v-1",
  approval_status: "approved",
  retired_at: null,
  created_at: "2026-06-01T09:00:00+02:00",
  ...over,
});

describe("which car is this Driver's", () => {
  it("the live car is the one that has not been retired", () => {
    const old = car({ id: "v-old", retired_at: "2026-09-01T10:00:00Z", created_at: "2026-01-01T09:00:00Z" });
    const now = car({ id: "v-new", approval_status: "pending", created_at: "2026-09-01T10:00:00Z" });
    expect(liveCarOf([old, now])?.id).toBe("v-new");
  });

  it("⚑ and a retired car is NEVER the live one, even though it is older", () => {
    // The old picker took the OLDEST row (lib/driver.ts before S78). With a replacement
    // filed, that answer is the car the Driver sold.
    const old = car({ id: "v-old", created_at: "2026-01-01T09:00:00Z", retired_at: "2026-09-01T10:00:00Z" });
    expect(liveCarOf([old])).toBeNull();
  });

  it("the working car is the live one only when it is approved", () => {
    expect(workingCarOf([car()])?.id).toBe("v-1");
    expect(workingCarOf([car({ approval_status: "pending" })])).toBeNull();
    expect(workingCarOf([car({ approval_status: "rejected" })])).toBeNull();
    expect(workingCarOf([car({ retired_at: "2026-09-01T10:00:00Z" })])).toBeNull();
  });

  it("⚑ an approved car that has been retired does not work — both axes, not one", () => {
    // A single enum with a 'retired' value cannot express "rejected, being corrected"; two
    // axes can, and this is the case that proves they are both consulted.
    expect(isWorkingCar(car({ retired_at: "2026-09-02T08:00:00Z" }))).toBe(false);
  });

  it("a missing or unknown status reads as pending, never as fine", () => {
    expect(statusOf(null)).toBe("pending");
    expect(statusOf({ approval_status: "banana" } as never)).toBe("pending");
    expect(isWorkingCar({ approval_status: "banana" as never, retired_at: null })).toBe(false);
  });
});

describe("what a blocked Driver is told", () => {
  it("names which of the three states it is", () => {
    expect(carBlockOf(null)).toBe("no_car");
    expect(carBlockOf(car({ approval_status: "pending" }))).toBe("car_pending");
    expect(carBlockOf(car({ approval_status: "rejected" }))).toBe("car_rejected");
    expect(carBlockOf(car())).toBeNull();
  });

  it("every block has a sentence", () => {
    for (const k of ["no_car", "car_pending", "car_rejected"] as const) {
      expect(CAR_BLOCK_SAYS[k].length).toBeGreaterThan(10);
    }
  });
});

describe("the refusal the database raises", () => {
  // ⚑ THE NEEDLE AND THE RAISE ARE ONE CONTRACT ACROSS TWO LANGUAGES. If the SQL text drifts
  // from this constant, both translators fall through to their generic line and the Driver
  // reads "couldn't accept this mission, please try again" — learning nothing, on the one
  // refusal they can actually act on. Same trap as NOT_APPROVED_RAISE in S76.
  // ⚑ COMMENTS STRIPPED. The file's own header explains that this refusal must NOT contain
  // the person's wording — so a naive grep over the whole file finds that sentence and calls
  // the migration guilty of the thing it is warning against.
  const migration = fs
    .readFileSync("docs/migrations/2026-09-13_vehicle_approval_gate.sql", "utf8")
    .replace(/^\s*--.*$/gm, "");

  it("the migration raises exactly what the app matches on", () => {
    const raises = [...migration.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]!);
    const carRaises = raises.filter((r) => r.toLowerCase().includes("awaiting approval"));
    expect(carRaises.length).toBeGreaterThanOrEqual(2); // the accept door AND the hold door
    for (const r of carRaises) expect(isCarAwaitingError(r)).toBe(true);
  });

  it("⚑ and it is NOT the person's refusal — they go to two different screens", () => {
    expect(CAR_AWAITING_RAISE.includes(NOT_APPROVED_RAISE)).toBe(false);
    expect(isCarAwaitingError("Driver account not yet approved")).toBe(false);
    expect(migration.toLowerCase().includes(NOT_APPROVED_RAISE)).toBe(false);
  });

  it("matches whatever case the two translators hand it", () => {
    // friendlyAcceptError lowercases first; holdMessage does not.
    expect(isCarAwaitingError("Car awaiting approval")).toBe(true);
    expect(isCarAwaitingError("car awaiting approval")).toBe(true);
    expect(isCarAwaitingError(null)).toBe(false);
  });
});
