// lib/spend-filter.ts — the applied period and the span it is compared against.
//
// This pair produced the worst defect of Session 54: the default landing view
// measured 8 days of August against all 31 of July and painted the −77 % gap
// GREEN. Every Business, every month. The maths downstream was right; the two
// spans were not comparable.
import { describe, expect, it } from "vitest";
import {
  comparisonSpan,
  currentSpan,
  isRunningDay,
  parseSpendQuery,
  queryForSpan,
  spendHref,
  type SpendQuery,
} from "@/lib/spend-filter";

const AUG_8 = new Date("2026-08-08T12:00:00+02:00");
const q = (sp: Record<string, string> = {}, now = AUG_8) => parseSpendQuery(sp, now);

describe("parseSpendQuery", () => {
  it("defaults to this month — a spend total with no period is meaningless", () => {
    const parsed = q();
    expect(parsed.period).toBe("month");
    expect(parsed.anchor).toBe("2026-08-01");
    expect(parsed.from).toBe("2026-08-01");
    expect(parsed.to).toBe("2026-08-31");
  });

  it("honours a period the URL genuinely asks for", () => {
    expect(q({ p: "week", d: "2026-07-15" })).toMatchObject({
      period: "week",
      from: "2026-07-13",
      to: "2026-07-19",
    });
  });

  it("falls back to this month when 'range' carries no dates", () => {
    expect(q({ p: "range" })).toMatchObject({ period: "month", from: "2026-08-01" });
  });

  it("defaults the comparison, the breakdown and the lens", () => {
    expect(q()).toMatchObject({ cmp: "prev", dim: "type", lens: null });
  });

  it("ignores an unknown comparison, breakdown or lens", () => {
    expect(q({ cmp: "banana", dim: "banana", lens: "banana" })).toMatchObject({
      cmp: "prev",
      dim: "type",
      lens: null,
    });
  });

  it("keeps History's whole filter vocabulary", () => {
    // Built ON TOP of parseHistoryQuery so the two screens can't drift.
    expect(q({ q: "aeroport", filter: "cancelled", sort: "high", driver: "drv-1" })).toMatchObject({
      q: "aeroport",
      outcome: "cancelled",
      sort: "high",
      driverId: "drv-1",
    });
  });
});

describe("currentSpan — clamped to today", () => {
  it("ends the period TODAY when the period is still running", () => {
    // The mission query only ever returns past trips, so "this month" holds the
    // days that have actually happened.
    const s = currentSpan(q(), AUG_8);
    expect(s.fromDay).toBe("2026-08-01");
    expect(s.toDay).toBe("2026-08-08");
    expect(s.partial).toBe(true);
    expect(s.days).toBe(8);
  });

  it("uses the whole period once it is over", () => {
    const s = currentSpan(q({ p: "month", d: "2026-07-01" }), AUG_8);
    expect(s.toDay).toBe("2026-07-31");
    expect(s.partial).toBe(false);
    expect(s.days).toBe(31);
  });

  it("is a single day on the first day of a month", () => {
    const s = currentSpan(q({}, new Date("2026-08-01T09:00:00+02:00")), new Date("2026-08-01T09:00:00+02:00"));
    expect(s.fromDay).toBe("2026-08-01");
    expect(s.toDay).toBe("2026-08-01");
    expect(s.days).toBe(1);
  });

  it("reads today from the Paris calendar, not the machine's", () => {
    // 22:30 UTC on 8 August is already the 9th in Paris.
    const late = new Date("2026-08-08T22:30:00Z");
    expect(currentSpan(q({}, late), late).toDay).toBe("2026-08-09");
  });

  it("clamps a running week and a running year the same way", () => {
    expect(currentSpan(q({ p: "week", d: "2026-08-08" }), AUG_8)).toMatchObject({
      fromDay: "2026-08-03",
      toDay: "2026-08-08",
      days: 6,
    });
    expect(currentSpan(q({ p: "year", d: "2026-08-08" }), AUG_8)).toMatchObject({
      fromDay: "2026-01-01",
      toDay: "2026-08-08",
      partial: true,
    });
  });

  it("carries the period's own label", () => {
    expect(currentSpan(q(), AUG_8).label).toBe("August 2026");
  });
});

describe("comparisonSpan — the same number of days on both sides", () => {
  it("truncates the previous period to match a part-finished one", () => {
    // ⚑ THE DEFECT. Without this, August's 8 days were compared against July's
    // 31 and the drop was painted as good news.
    const query = q();
    const here = currentSpan(query, AUG_8);
    const back = comparisonSpan(query, AUG_8)!;

    expect(here.days).toBe(8);
    expect(back.fromDay).toBe("2026-07-01");
    expect(back.toDay).toBe("2026-07-08");
    expect(back.days).toBe(8);
    expect(back.label).toBe("1 July – 8 July");
  });

  it("compares whole calendar periods when the current one is over", () => {
    // A finished July against a whole June: the day counts differ (31 vs 30) and
    // that is correct — two complete months ARE the comparison a Business means.
    const query = q({ p: "month", d: "2026-07-01" });
    const back = comparisonSpan(query, AUG_8)!;
    expect(back.fromDay).toBe("2026-06-01");
    expect(back.toDay).toBe("2026-06-30");
    expect(currentSpan(query, AUG_8).partial).toBe(false);
  });

  it("matches day counts for every running granularity that HAS days to match", () => {
    // The property, not the example: while a period is still running, the two
    // sides must be the same length whatever the granularity.
    for (const p of ["week", "month", "year"]) {
      const query = q({ p, d: "2026-08-08" });
      const here = currentSpan(query, AUG_8);
      const back = comparisonSpan(query, AUG_8)!;
      expect(here.partial, p).toBe(true);
      expect(back.days, p).toBe(here.days);
    }
  });

  it("compares TODAY against a whole previous day — there is nothing to truncate", () => {
    // `partial` is a day-granularity test (`today < toDay`), and today's own
    // period ends on today, so no truncation happens and none is possible: a day
    // has no smaller unit here. The comparison stays — yesterday's total is a
    // useful target — and `isRunningDay` is what tells the page to show it as
    // one instead of scoring it.
    const query = q({ p: "day", d: "2026-08-08" });
    const here = currentSpan(query, AUG_8);
    const back = comparisonSpan(query, AUG_8)!;
    expect(here.days).toBe(1);
    expect(back.fromDay).toBe("2026-08-07");
    expect(back.days).toBe(1);
  });
});

describe("isRunningDay — the one comparison that must not be scored", () => {
  it("is true for today, and only for today", () => {
    expect(isRunningDay(currentSpan(q({ p: "day", d: "2026-08-08" }), AUG_8), AUG_8)).toBe(true);
    expect(isRunningDay(currentSpan(q({ p: "day", d: "2026-08-07" }), AUG_8), AUG_8)).toBe(false);
    expect(isRunningDay(currentSpan(q({ p: "day", d: "2026-08-09" }), AUG_8), AUG_8)).toBe(false);
  });

  it("is false for a running month, whose comparison IS like-for-like", () => {
    // August-so-far is measured against the same 8 days of July, so the green
    // and red there are earned. Only the single day is unscoreable.
    expect(isRunningDay(currentSpan(q(), AUG_8), AUG_8)).toBe(false);
    expect(isRunningDay(currentSpan(q({ p: "week", d: "2026-08-08" }), AUG_8), AUG_8)).toBe(false);
    expect(isRunningDay(currentSpan(q({ p: "year", d: "2026-08-08" }), AUG_8), AUG_8)).toBe(false);
  });

  it("catches a hand-picked range that happens to be today", () => {
    // The same hours-so-far problem arrives by another door.
    const span = currentSpan(q({ p: "range", from: "2026-08-08", to: "2026-08-08" }), AUG_8);
    expect(span.days).toBe(1);
    expect(isRunningDay(span, AUG_8)).toBe(true);
  });

  it("is false for a single day in the past, which is complete", () => {
    const span = currentSpan(q({ p: "range", from: "2026-07-15", to: "2026-07-15" }), AUG_8);
    expect(span.days).toBe(1);
    expect(isRunningDay(span, AUG_8)).toBe(false);
  });

  it("reads today from the Paris calendar", () => {
    // 22:30 UTC on 8 August is already the 9th in Paris, so the 9th is the
    // running day and the 8th has closed.
    const late = new Date("2026-08-08T22:30:00Z");
    expect(isRunningDay(currentSpan(q({ p: "day", d: "2026-08-09" }, late), late), late)).toBe(true);
    expect(isRunningDay(currentSpan(q({ p: "day", d: "2026-08-08" }, late), late), late)).toBe(false);
  });

  it("compares against the same period last year on request", () => {
    const query = q({ cmp: "year" });
    const back = comparisonSpan(query, AUG_8)!;
    expect(back.fromDay).toBe("2025-08-01");
    expect(back.toDay).toBe("2025-08-08"); // truncated to August's 8 days
    expect(back.days).toBe(currentSpan(query, AUG_8).days);
  });

  it("is null when the comparison is switched off", () => {
    expect(comparisonSpan(q({ cmp: "none" }), AUG_8)).toBeNull();
  });

  it("compares a custom range with the same length ending the day before", () => {
    const query = q({ p: "range", from: "2026-06-16", to: "2026-07-31" });
    const here = currentSpan(query, AUG_8);
    const back = comparisonSpan(query, AUG_8)!;
    expect(here.days).toBe(46);
    expect(back.fromDay).toBe("2026-05-01");
    expect(back.toDay).toBe("2026-06-15");
    expect(back.days).toBe(46);
  });

  it("compares a custom range with the same dates a year earlier", () => {
    const query = q({ p: "range", from: "2026-06-16", to: "2026-07-31", cmp: "year" });
    const back = comparisonSpan(query, AUG_8)!;
    expect(back.fromDay).toBe("2025-06-16");
    expect(back.toDay).toBe("2025-07-31");
  });

  it("truncates a custom range that is still running", () => {
    // A range whose end is in the future still only holds days that happened.
    const query = q({ p: "range", from: "2026-08-01", to: "2026-08-31" });
    const here = currentSpan(query, AUG_8);
    const back = comparisonSpan(query, AUG_8)!;
    expect(here.toDay).toBe("2026-08-08");
    expect(back.days).toBe(here.days);
  });

  it("never returns a backwards span", () => {
    for (const sp of [{}, { p: "week" }, { p: "year" }, { cmp: "year" }, { p: "range", from: "2026-08-01", to: "2026-08-31" }]) {
      const back = comparisonSpan(q(sp as Record<string, string>), AUG_8);
      if (back) expect(back.fromDay <= back.toDay, JSON.stringify(sp)).toBe(true);
    }
  });

  it("does not overlap the current span", () => {
    // Double-counting the same days on both sides of a "vs" would be worse than
    // no comparison at all.
    for (const sp of [{}, { p: "week", d: "2026-08-08" }, { p: "month", d: "2026-07-01" }]) {
      const query = q(sp as Record<string, string>);
      const here = currentSpan(query, AUG_8);
      const back = comparisonSpan(query, AUG_8)!;
      expect(back.toDay < here.fromDay, JSON.stringify(sp)).toBe(true);
    }
  });
});

describe("queryForSpan — re-pointing the SAME query at another span", () => {
  it("keeps every other filter so both sides of a 'vs' are like-for-like", () => {
    const query = q({ q: "aeroport", filter: "completed", cat: "luxury", driver: "drv-1" });
    const back = comparisonSpan(query, AUG_8)!;
    const repointed = queryForSpan(query, back);

    expect(repointed.from).toBe(back.fromDay);
    expect(repointed.to).toBe(back.toDay);
    expect(repointed.period).toBe("range");
    expect(repointed.anchor).toBeNull();
    // Everything that narrows the archive is untouched.
    expect(repointed.q).toBe("aeroport");
    expect(repointed.outcome).toBe("completed");
    expect(repointed.category).toBe("luxury");
    expect(repointed.driverId).toBe("drv-1");
  });

  it("leaves the original query alone", () => {
    const query = q();
    const before = { ...query };
    queryForSpan(query, currentSpan(query, AUG_8));
    expect(query).toEqual(before);
  });
});

describe("spendHref", () => {
  it("writes a clean URL for the default view", () => {
    // Default month + prev + type + no lens = nothing worth writing down.
    const query = q();
    expect(spendHref({ ...query, period: null, anchor: null, from: null, to: null })).toBe("");
  });

  it("adds only what differs from the defaults", () => {
    expect(spendHref(q(), { cmp: "year", dim: "driver", lens: "waiting" })).toBe(
      "?p=month&d=2026-08-01&cmp=year&dim=driver&lens=waiting",
    );
  });

  it("survives a round trip through the URL", () => {
    const cases: Record<string, string>[] = [
      { p: "month", d: "2026-07-01", cmp: "year", dim: "class" },
      { p: "range", from: "2026-06-16", to: "2026-07-31", lens: "noshow" },
      { p: "week", d: "2026-07-13", q: "aeroport", filter: "cancelled", dim: "route", cmp: "none" },
    ];
    for (const sp of cases) {
      const original = parseSpendQuery(sp, AUG_8);
      const href = spendHref(original);
      const reparsed = parseSpendQuery(
        Object.fromEntries(new URLSearchParams(href.slice(1))),
        AUG_8,
      );
      expect(reparsed, href).toEqual(original);
    }
  });

  it("keeps a spend link pointing at the same span it was made from", () => {
    // A shared link must not silently re-anchor to the reader's today.
    const original = parseSpendQuery({ p: "month", d: "2026-07-01" }, AUG_8);
    const later = new Date("2026-12-25T12:00:00+01:00");
    const reparsed = parseSpendQuery(
      Object.fromEntries(new URLSearchParams(spendHref(original).slice(1))),
      later,
    );
    expect(currentSpan(reparsed, later)).toMatchObject({ fromDay: "2026-07-01", toDay: "2026-07-31" });
  });
});

describe("a SpendQuery is a HistoryQuery", () => {
  it("can be handed straight to History's own helpers", () => {
    // Structural, not nominal: the point of extending the interface is that one
    // filter vocabulary serves both screens.
    const query: SpendQuery = q({ q: "nice" });
    expect(query.outcome).toBe("all");
    expect(query.sort).toBe("recent");
  });
});
