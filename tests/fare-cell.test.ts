// § the Fare column on the Dispatch schedule.
//
// ⚑ WHAT THIS FILE IS REALLY GUARDING. Before 2026-09-01 the schedule showed no money at
// all, so there was nothing here to be wrong. The risk arrives WITH the column: a trip has
// four prices over its life, they differ on 67% of live rows by a median of 50 €, and the
// cheapest possible bug is a cell that prints the right number under the wrong word.
//
// So every test below asserts the LABEL and the AMOUNT together. Either alone is half a
// row, and half a row is what a Dispatcher would act on.
import { describe, expect, it } from "vitest";
import { mission, standardCurve } from "./fixtures";
import { fareCell } from "@/lib/fare-cell";
import { businessSplitFor } from "@/lib/commission";
import { currentFare, settledFare } from "@/lib/pdp";
import type { MissionStatus } from "@/lib/database.types";

// Rates in force, so every amount below is the Business all-in rather than the Course.
const RATED = { commission_business_rate: 0.15, commission_vat_rate: 0.2 } as const;
const NOW = new Date("2026-07-15T10:00:00+02:00"); // two hours before the fixture pickup

describe("which money a schedule row is showing", () => {
  it("calls a pooled trip an Auction, at the live climbing price", () => {
    const m = mission({ ...standardCurve(100), ...RATED });
    const c = fareCell(m, NOW);
    expect(c.label).toBe("Auction");
    expect(c.amount).toBeCloseTo(businessSplitFor(m, currentFare(m, NOW)).businessTotal, 2);
    expect(c.reached).toBe(false);
  });

  it("calls a held trip Closed at, at the fare frozen when the Driver took it", () => {
    const m = mission({
      ...standardCurve(100), ...RATED,
      status: "confirmed", driver_id: "dr-1",
      accepted_at: "2026-07-15T09:00:00+02:00", accepted_fare: 74,
    });
    const c = fareCell(m, NOW);
    expect(c.label).toBe("Closed at");
    expect(c.amount).toBeCloseTo(businessSplitFor(m, 74).businessTotal, 2);
    // ⚑ NOT the live curve. Once a Driver holds it the price is settled, and a cell
    // still ticking upward would be inventing money nobody owes.
    expect(c.amount).not.toBeCloseTo(businessSplitFor(m, currentFare(m, NOW)).businessTotal, 2);
  });

  it("says Not taken when the auction ran the whole way and nobody was on it", () => {
    const m = mission({ ...standardCurve(100), ...RATED, status: "expired" });
    const c = fareCell(m, NOW);
    expect(c.label).toBe("Not taken");
    expect(c.reached).toBe(true);
    // The amount IS the Ceiling here, so the second line explains instead of repeating it.
    expect(c.amount).toBeCloseTo(businessSplitFor(m, 100).businessTotal, 2);
    expect(c.ceiling).toBeNull();
  });

  // ⚑ A `pooled` row whose pickup has passed is dead whether or not the sweep has run.
  // Reading `status` alone would print a climbing Auction price for a trip that is over.
  it("says Not taken for a pooled trip whose pickup is in the past, before any sweep", () => {
    const m = mission({ ...standardCurve(100), ...RATED, status: "pooled" });
    const after = new Date("2026-07-15T13:00:00+02:00");
    expect(fareCell(m, after).label).toBe("Not taken");
    expect(fareCell(m, NOW).label).toBe("Auction");
  });

  it("shows the cancellation fee, not the ceiling nobody ever owed", () => {
    const m = mission({ ...standardCurve(525.2), ...RATED, status: "cancelled", cancellation_fee: 91.17 });
    const c = fareCell(m, NOW);
    expect(c.label).toBe("Fee");
    expect(c.amount).toBeCloseTo(businessSplitFor(m, 91.17).businessTotal, 2);
    expect(c.ceiling).toBeCloseTo(businessSplitFor(m, 525.2).businessTotal, 2);
  });

  it("says No fee rather than printing 0,00 €", () => {
    for (const fee of [0, null]) {
      const c = fareCell(mission({ ...RATED, status: "cancelled", cancellation_fee: fee }), NOW);
      expect(c.label).toBe("No fee");
      expect(c.amount).toBeNull();
    }
  });
});

describe("the money is the Business's, never the Driver's", () => {
  // docs/06 §3 — a Business is only ever shown what it pays, fee included. A cell that
  // reached for the Course would quietly under-report every row by the service fee.
  it("puts every amount through the commission before it reaches the screen", () => {
    const held = mission({
      ...standardCurve(100), ...RATED, status: "confirmed",
      accepted_at: "2026-07-15T09:00:00+02:00", accepted_fare: 74,
    });
    const c = fareCell(held, NOW);
    expect(c.amount!).toBeGreaterThan(settledFare(held));
    expect(c.ceiling!).toBeGreaterThan(100);
  });

  it("renders unchanged on a trip from before commission shipped", () => {
    const bare = mission({
      ...standardCurve(100), status: "confirmed",
      accepted_at: "2026-07-15T09:00:00+02:00", accepted_fare: 74,
      commission_business_rate: null, commission_vat_rate: null,
    });
    expect(fareCell(bare, NOW).amount).toBeCloseTo(74, 2);
    expect(fareCell(bare, NOW).ceiling).toBeCloseTo(100, 2);
  });
});

// ⚑ NO STATUS MAY FALL THROUGH TO A BLANK CELL. Six times in a month a never-firing
// branch has looked like an unused feature in this repo; here it would look like a trip
// that cost nothing. Every status a schedule can hold gets asserted, not sampled.
describe("every status a row can carry says something", () => {
  const ALL: MissionStatus[] = [
    "draft", "pooled", "accepted", "confirmed", "en_route",
    "arrived", "on_board", "completed", "cancelled", "expired",
  ];
  it.each(ALL)("%s", (status) => {
    const held = status !== "draft" && status !== "pooled" && status !== "expired";
    const c = fareCell(mission({
      ...standardCurve(100), ...RATED, status,
      accepted_at: held ? "2026-07-15T09:00:00+02:00" : null,
      accepted_fare: held ? 74 : null,
      cancellation_fee: status === "cancelled" ? 30 : null,
    }), NOW);
    expect(c.label, `${status} produced no label`).toBeTruthy();
    // Only a cancellation with no fee is allowed to show no amount at all.
    if (c.amount == null) expect(c.label).toBe("No fee");
  });
});

// ⚑ The admin console reads BOTH sides of the marketplace, so it is not a counterparty
// screen: it shows the Course, and `/admin/trips/[id]` already heads with the Course
// ceiling. A list on a different basis from the detail page it links to would print two
// different numbers for one trip.
describe("the admin console's basis", () => {
  const RATED2 = { commission_business_rate: 0.15, commission_vat_rate: 0.2 } as const;
  const NOW2 = new Date("2026-07-15T10:00:00+02:00");

  it("shows the Course, not the Business all-in", () => {
    const m = mission({
      ...standardCurve(100), ...RATED2, status: "completed",
      accepted_at: "2026-07-15T09:00:00+02:00", accepted_fare: 74,
    });
    const admin = fareCell(m, NOW2, "course");
    const dispatch = fareCell(m, NOW2, "business");
    expect(admin.amount).toBeCloseTo(74, 2);
    expect(admin.ceiling).toBeCloseTo(100, 2);
    // Same trip, same words, two bases — and the difference is exactly the service fee.
    expect(admin.label).toBe(dispatch.label);
    expect(dispatch.amount!).toBeGreaterThan(admin.amount!);
  });

  it("defaults to the Business all-in when no basis is named", () => {
    const m = mission({ ...standardCurve(100), ...RATED2, status: "expired" });
    expect(fareCell(m, NOW2).ceiling).toBeNull();
    expect(fareCell(m, NOW2).amount).toBeGreaterThan(100);
    expect(fareCell(m, NOW2, "course").amount).toBeCloseTo(100, 2);
  });
});
