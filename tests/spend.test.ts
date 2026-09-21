// lib/spend.ts — what a Business paid. The hero total, the breakdowns and the
// chart all read the same rows, so the tests here are mostly about which rows
// are allowed to contribute to which number.
import { describe, expect, it } from "vitest";
import {
  autoBucket,
  avoidable,
  breakdown,
  minutesToAccept,
  rowCost,
  series,
  spendTotals,
  wasteLines,
} from "@/lib/spend";
import { completed, mission, row, standardCurve } from "./fixtures";

const desks = new Map([["d-1", "Front desk"]]);

describe("rowCost — one trip's line on the bill", () => {
  it("is the settled fare plus the waiting it ran up", () => {
    expect(rowCost(row(completed({ waiting_fee: 12 })))).toBe(72);
  });

  it("coerces PostgREST's numeric-as-STRING instead of concatenating it", () => {
    // waiting_fee arrives as text; `60 + "12"` is the string "6012".
    const r = row(completed({ waiting_fee: "12" as unknown as number }));
    expect(rowCost(r)).toBe(72);
    expect(typeof rowCost(r)).toBe("number");
  });

  it("is zero for a trip nobody settled — § Q, agreed but not owed", () => {
    // A past trip left `confirmed`: the fare is agreed, nothing has settled, and
    // counting it would inflate a Business's spend with trips that may not have run.
    const r = row(mission({ status: "confirmed", ...standardCurve(), accepted_at: "2026-07-15T10:00:00+02:00" }));
    expect(r.counted).toBe(false);
    expect(r.fare).toBe(60);
    expect(rowCost(r)).toBe(0);
  });

  it("is zero for a mission nobody ever took", () => {
    expect(rowCost(row(mission({ status: "expired" })))).toBe(0);
  });

  it("is the fee, not the fare, on a cancelled trip", () => {
    expect(rowCost(row(mission({ status: "cancelled", cancellation_fee: 45, waiting_fee: 10 })))).toBe(55);
  });
});

describe("minutesToAccept", () => {
  it("measures from entering the Pool to the accept", () => {
    expect(minutesToAccept(completed({ accepted_at: "2026-07-15T10:20:00+02:00" }))).toBe(20);
  });

  it("measures from pooled_at on a re-pooled mission", () => {
    const m = completed({
      created_at: "2026-07-15T08:00:00+02:00",
      pooled_at: "2026-07-15T10:00:00+02:00",
      accepted_at: "2026-07-15T10:20:00+02:00",
    });
    expect(minutesToAccept(m)).toBe(20);
  });

  it("is null when nobody ever took it", () => {
    expect(minutesToAccept(mission({ accepted_at: null }))).toBeNull();
  });

  it("is null rather than negative when the timestamps disagree", () => {
    const m = completed({
      created_at: "2026-07-15T10:00:00+02:00",
      accepted_at: "2026-07-15T09:00:00+02:00",
    });
    expect(minutesToAccept(m)).toBeNull();
  });
});

describe("spendTotals — the hero number", () => {
  it("holds the identity: total = fares + no-shows + waiting + cancellation fees", () => {
    const t = spendTotals([
      row(completed({ id: "a" })),
      row(completed({ id: "b", no_show: true })),
      row(completed({ id: "c", waiting_fee: 12, waiting_minutes: 12 })),
      row(mission({ id: "d", status: "cancelled", cancellation_fee: 45 })),
    ]);
    expect(t.total).toBe(t.fares + t.noShow + t.waiting + t.cancelFees);
    expect(t.total).toBe(60 + 60 + 60 + 12 + 45);
  });

  it("counts a no-show as a trip that ran — the Guest was still billed", () => {
    const t = spendTotals([row(completed({ no_show: true }))]);
    expect(t.noShow).toBe(60);
    expect(t.noShowCount).toBe(1);
    expect(t.fares).toBe(0);
    expect(t.trips).toBe(1);
  });

  it("shows an unsettled trip on its own line and keeps it out of the total", () => {
    const unclosed = mission({
      status: "on_board",
      ...standardCurve(),
      accepted_at: "2026-07-15T10:00:00+02:00",
    });
    const t = spendTotals([row(completed()), row(unclosed)]);
    expect(t.unsettled).toBe(60);
    expect(t.unsettledCount).toBe(1);
    expect(t.total).toBe(60);
    expect(t.ordered).toBe(2);
  });

  // § Q — waiting settles at BOARDING (board_guest), so an unclosed trip can
  // carry a real, already-owed waiting fee. Summing only the fare dropped that
  // money out of every figure on the page — including the "not settled" line
  // that exists precisely so nothing is hidden. Pinned while it is still 0 rows
  // live: the first late Guest whose Driver forgets to close makes it visible.
  it("keeps a settled waiting fee visible on an unclosed trip", () => {
    const unclosed = mission({
      status: "on_board",
      ...standardCurve(),
      accepted_at: "2026-07-15T10:00:00+02:00",
      waiting_fee: 25,
      waiting_minutes: 25,
    });
    const t = spendTotals([row(unclosed)]);
    expect(t.unsettled).toBe(85); // 60 agreed + 25 already owed for waiting
    expect(t.unsettledCount).toBe(1);
    // Still out of every settled total — it is surfaced, not counted.
    expect(t.total).toBe(0);
    expect(t.waiting).toBe(0);
  });

  it("counts an unfilled mission as ordered, costing nothing, with its Ceiling noted", () => {
    const t = spendTotals([row(mission({ status: "expired", ceiling: 120 }))]);
    expect(t.unfilledCount).toBe(1);
    expect(t.unfilledCeiling).toBe(120);
    expect(t.total).toBe(0);
    expect(t.ordered).toBe(1);
    expect(t.trips).toBe(0);
  });

  it("treats a still-pooled trip whose pickup has passed as unfilled", () => {
    // The sweep hasn't reached it; the money must not wait for the sweep.
    const t = spendTotals([row(mission({ status: "pooled", pickup_at: "2020-01-01T12:00:00+01:00" }))]);
    expect(t.unfilledCount).toBe(1);
  });

  it("keeps waiting settled on a CANCELLED trip out of cost-per-trip", () => {
    // ⚑ The defect this pins: t.waiting also holds waiting settled onto a
    // cancelled mission, and dividing that by a completed-trip count charged the
    // trips that happened for time spent on one that didn't.
    const t = spendTotals([
      row(completed({ id: "a" })),
      row(mission({ id: "b", status: "cancelled", cancellation_fee: 45, waiting_fee: 30, waiting_minutes: 30 })),
    ]);
    expect(t.waiting).toBe(30);
    expect(t.tripWaiting).toBe(0);
    expect(t.trips).toBe(1);
    expect(t.costPerTrip).toBe(60);
    // The waiting is still in the bill, just not in the per-trip average.
    expect(t.total).toBe(60 + 30 + 45);
  });

  it("includes waiting on a trip that DID run in cost-per-trip", () => {
    const t = spendTotals([row(completed({ waiting_fee: 20, waiting_minutes: 20 }))]);
    expect(t.tripWaiting).toBe(20);
    expect(t.costPerTrip).toBe(80);
  });

  it("leaves cost-per-trip null rather than dividing by zero", () => {
    expect(spendTotals([]).costPerTrip).toBeNull();
    expect(spendTotals([row(mission({ status: "expired" }))]).costPerTrip).toBeNull();
  });

  it("counts a cancelled trip whose fee was zero — it still ended cancelled", () => {
    // A free cancellation (>5h out) has a fee of 0, not null; the COUNT is what
    // the waste panel reports, so it must survive a zero amount.
    const t = spendTotals([row(mission({ status: "cancelled", cancellation_fee: 0 }))]);
    expect(t.cancelCount).toBe(1);
    expect(t.cancelFees).toBe(0);
  });

  it("reports the fill rate over everything ordered", () => {
    const t = spendTotals([
      row(completed({ id: "a" })),
      row(completed({ id: "b" })),
      row(mission({ id: "c", status: "expired" })),
      row(mission({ id: "d", status: "expired" })),
    ]);
    expect(t.ordered).toBe(4);
    expect(t.filledCount).toBe(2);
    expect(t.fillRate).toBe(50);
  });

  it("leaves the fill rate null on an empty period", () => {
    expect(spendTotals([]).fillRate).toBeNull();
  });

  it("takes the median time-to-accept, not the mean", () => {
    // An odd count takes the middle value; one slow trip must not drag it.
    const t = spendTotals([
      row(completed({ id: "a", accepted_at: "2026-07-15T10:05:00+02:00" })), // 5
      row(completed({ id: "b", accepted_at: "2026-07-15T10:20:00+02:00" })), // 20
      row(completed({ id: "c", accepted_at: "2026-07-15T14:00:00+02:00" })), // 240
    ]);
    expect(t.medianToAccept).toBe(20);
  });

  it("averages the two middles on an even count", () => {
    const t = spendTotals([
      row(completed({ id: "a", accepted_at: "2026-07-15T10:05:00+02:00" })), // 5
      row(completed({ id: "b", accepted_at: "2026-07-15T10:15:00+02:00" })), // 15
      row(completed({ id: "c", accepted_at: "2026-07-15T10:25:00+02:00" })), // 25
      row(completed({ id: "d", accepted_at: "2026-07-15T10:45:00+02:00" })), // 45
    ]);
    expect(t.medianToAccept).toBe(20);
  });

  it("leaves the median null when nothing filled", () => {
    expect(spendTotals([row(mission({ status: "expired" }))]).medianToAccept).toBeNull();
  });

  it("does not leak state between calls", () => {
    spendTotals([row(completed())]);
    expect(spendTotals([]).total).toBe(0);
  });
});

describe("breakdown — where the money went", () => {
  it("splits by type and shares out to 100 %", () => {
    const rows = [
      row(completed({ id: "a" })),
      row(completed({ id: "b", luggage_only: true, category: "van", required_body_type: "van" })),
    ];
    const b = breakdown(rows, "type", desks);
    expect(b.map((x) => x.label).sort()).toEqual(["Luggage run", "Transfer"]);
    expect(b.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100, 6);
  });

  it("excludes the unfilled and the unsettled — the euro column must match the trip count", () => {
    // ⚑ Counting them produced "9 trips · 0,00 €" beside a euro figure they
    // contributed nothing to.
    const rows = [
      row(completed({ id: "a" })),
      row(mission({ id: "b", status: "expired" })),
      row(mission({ id: "c", status: "confirmed", ...standardCurve(), accepted_at: "2026-07-15T10:20:00+02:00" })),
    ];
    const b = breakdown(rows, "type", desks);
    expect(b).toHaveLength(1);
    expect(b[0].trips).toBe(1);
    expect(b[0].amount).toBe(60);
  });

  it("skips rows with nobody to attribute them to", () => {
    const noDriver = row(mission({ status: "cancelled", cancellation_fee: 45, driver_id: null }));
    expect(breakdown([noDriver], "driver", desks)).toEqual([]);
    expect(breakdown([row(completed({ dispatcher_id: null as unknown as string }))], "desk", desks)).toEqual([]);
  });

  it("names a desk from the map and falls back rather than showing a UUID", () => {
    expect(breakdown([row(completed())], "desk", desks)[0].label).toBe("Front desk");
    expect(breakdown([row(completed())], "desk", new Map())[0].label).toBe("Your desk");
  });

  it("carries the Driver id so the row can filter the page", () => {
    const b = breakdown([row(completed())], "driver", desks);
    expect(b[0].driverId).toBe("drv-1");
    expect(b[0].label).toBe("Marc Dubois");
  });

  it("groups a route in one direction and shortens both ends", () => {
    const b = breakdown([row(completed({ id: "a" })), row(completed({ id: "b" }))], "route", desks);
    expect(b).toHaveLength(1);
    expect(b[0].trips).toBe(2);
    expect(b[0].label).toBe("Boulevard des Moulins, Nice → Promenade des Anglais, Nice");
  });

  it("rolls everything past the top N into one quiet 'Other'", () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      row(
        completed({
          id: `m-${i}`,
          // Descending amounts so the rollup is deterministic.
          pdp_start: 100 - i * 5,
          pdp_step: 0,
          pdp_interval: 0,
          ceiling: 200,
          pickup_address: `Street ${i}, 06000 Nice, France`,
        }),
      ),
    );
    const b = breakdown(rows, "route", desks);
    expect(b).toHaveLength(9); // 8 named + Other
    const other = b[b.length - 1];
    expect(other.other).toBe(true);
    expect(other.label).toBe("Other (3)");
    expect(other.trips).toBe(3);
    // Nothing is lost in the rollup.
    expect(b.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(
      rows.reduce((s, r) => s + rowCost(r), 0),
      6,
    );
    expect(b.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100, 6);
  });

  it("sorts biggest spend first", () => {
    const rows = [
      row(completed({ id: "a", pdp_start: 30, pdp_step: 0, pdp_interval: 0, pickup_address: "Small, Nice, France" })),
      row(completed({ id: "b", pdp_start: 90, pdp_step: 0, pdp_interval: 0, pickup_address: "Big, Nice, France" })),
    ];
    const b = breakdown(rows, "route", desks);
    expect(b[0].amount).toBe(90);
    expect(b[1].amount).toBe(30);
  });

  it("returns an empty list, not a divide-by-zero, when nothing qualifies", () => {
    expect(breakdown([], "type", desks)).toEqual([]);
    expect(breakdown([row(mission({ status: "expired" }))], "type", desks)).toEqual([]);
  });
});

describe("autoBucket", () => {
  it("switches from days to weeks past a month, and to months past half a year", () => {
    expect(autoBucket("2026-07-01", "2026-07-31")).toBe("day"); // 31
    expect(autoBucket("2026-07-01", "2026-08-01")).toBe("week"); // 32
    expect(autoBucket("2026-01-01", "2026-07-01")).toBe("week"); // 182
    expect(autoBucket("2026-01-01", "2026-07-02")).toBe("month"); // 183
    expect(autoBucket("2026-07-15", "2026-07-15")).toBe("day"); // 1
  });
});

describe("series — the chart", () => {
  it("emits every bucket in the span, including the quiet ones", () => {
    // A chart that skipped empty days would read as a busy month.
    const s = series([row(completed())], "2026-07-13", "2026-07-17", "day");
    expect(s).toHaveLength(5);
    expect(s.map((p) => p.key)).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
    ]);
    expect(s.filter((p) => p.amount > 0)).toHaveLength(1);
  });

  it("puts a trip in its Paris day, not its UTC one", () => {
    // 22:30 UTC on the 15th is 00:30 on the 16th in Paris.
    const late = row(completed({ pickup_at: "2026-07-15T22:30:00Z" }));
    const s = series([late], "2026-07-15", "2026-07-16", "day");
    expect(s.find((p) => p.key === "2026-07-16")!.amount).toBe(60);
    expect(s.find((p) => p.key === "2026-07-15")!.amount).toBe(0);
  });

  it("counts only trips that ran — the same population as the hero", () => {
    // ⚑ `counted` is true for an unfilled and for a cancelled mission (both are
    // correctly-zero contributions to a TOTAL), so counting them here made a
    // tooltip say "2 trips" on a day nobody drove.
    const rows = [
      row(completed({ id: "a" })),
      row(mission({ id: "b", status: "expired" })),
      row(mission({ id: "c", status: "cancelled", cancellation_fee: 45 })),
    ];
    const s = series(rows, "2026-07-15", "2026-07-15", "day");
    expect(s[0].trips).toBe(1);
    // …but the cancellation fee is still money spent that day.
    expect(s[0].amount).toBe(105);
  });

  it("buckets by ISO week, starting Monday", () => {
    const s = series([row(completed())], "2026-07-13", "2026-07-26", "week");
    expect(s.map((p) => p.key)).toEqual(["2026-07-13", "2026-07-20"]);
    expect(s[0].amount).toBe(60);
    expect(s[0].full).toBe("13 July – 19 July");
  });

  it("buckets by month across a year boundary", () => {
    const s = series([], "2026-11-01", "2027-01-31", "month");
    expect(s.map((p) => p.key)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(s.map((p) => p.label)).toEqual(["Nov", "Dec", "Jan"]);
  });

  it("drops a row outside the span rather than mis-filing it", () => {
    const s = series([row(completed())], "2026-08-01", "2026-08-03", "day");
    expect(s.every((p) => p.amount === 0)).toBe(true);
  });

  it("labels a day bucket for both the axis and the tooltip", () => {
    const s = series([], "2026-07-15", "2026-07-15", "day");
    expect(s[0].label).toBe("15");
    expect(s[0].full).toBe("Wednesday 15 July");
  });

  it("refuses to run away on an absurd hand-edited span", () => {
    const s = series([], "2000-01-01", "2099-12-31", "day");
    expect(s.length).toBeLessThanOrEqual(400);
  });
});

describe("wasteLines / avoidable — what went wrong", () => {
  it("adds up only what actually cost money", () => {
    const t = spendTotals([
      row(completed({ id: "a" })),
      row(completed({ id: "b", no_show: true })),
      row(completed({ id: "c", waiting_fee: 12, waiting_minutes: 12 })),
      row(mission({ id: "d", status: "cancelled", cancellation_fee: 45 })),
      row(mission({ id: "e", status: "expired", ceiling: 120 })),
    ]);
    // The unfilled cost nothing — it is a line in the panel, not an amount.
    expect(avoidable(t)).toBe(60 + 12 + 45);
    const unfilled = wasteLines(t).find((l) => l.key === "unfilled")!;
    expect(unfilled.amount).toBeNull();
    expect(unfilled.count).toBe(1);
  });

  it("stays honest on a clean period", () => {
    const lines = wasteLines(spendTotals([row(completed())]));
    expect(lines.every((l) => l.count === 0)).toBe(true);
    expect(lines.every((l) => l.detail === "none this period")).toBe(true);
    expect(avoidable(spendTotals([row(completed())]))).toBe(0);
  });

  it("keeps the panel worst-first and complete", () => {
    const lines = wasteLines(spendTotals([]));
    expect(lines.map((l) => l.key)).toEqual(["cancelled", "noshow", "waiting", "unfilled"]);
  });
});
