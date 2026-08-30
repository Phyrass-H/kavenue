// The period the Activity Console is looking at.
//
// ⚑ THE RULE THESE DEFEND, in the founder's words (S71): *"the database has to
// give 100 % of all time infos … the analyses are not only in the last few months
// but from day one."* So a period NARROWS an answer that is complete by default.
// Every test here is about that default surviving — a screen that quietly opens
// on "this month" answers a smaller question than it looks like it is asking, and
// the wrong number is a plausible one.
import { describe, expect, it } from "vitest";
import {
  ADMIN_PERIODS,
  inPeriod,
  parseAdminPeriod,
  periodHref,
  periodTabLabel,
} from "@/lib/admin-period";

// A fixed "now" so month names never depend on the day the suite runs.
const NOW = new Date("2026-08-30T12:00:00+02:00");

describe("the default is all time", () => {
  it("opens on all time with no params at all", () => {
    const p = parseAdminPeriod({}, NOW);
    expect(p.period).toBeNull();
    expect(p.fromIso).toBeNull();
    expect(p.toIso).toBeNull();
    expect(p.label).toBe("All time");
  });

  it("treats an explicit 'all' the same way", () => {
    expect(parseAdminPeriod({ period: "all" }, NOW).period).toBeNull();
  });

  it("⚑ falls back to all time on a junk value, never to a narrower period", () => {
    // A typo'd link must not silently answer a smaller question. Defaulting to
    // "month" here would show a plausible number for the wrong span.
    for (const junk of ["quarter", "last30", "MONTH", "", "  "]) {
      expect(parseAdminPeriod({ period: junk }, NOW).period).toBeNull();
    }
  });

  it("puts All time first in the tabs, because it is home", () => {
    expect(ADMIN_PERIODS[0]).toBeNull();
    expect(periodTabLabel(null)).toBe("All time");
  });
});

describe("a chosen period", () => {
  it("resolves a month to a half-open span", () => {
    const p = parseAdminPeriod({ period: "month", anchor: "2026-07-15" }, NOW);
    expect(p.period).toBe("month");
    expect(p.label).toBe("July 2026");
    // ⚑ Half-open: July starts at the 1st and ends where August begins, so a trip
    // at 23:59:59 on the 31st is in July and one at 00:00:00 on the 1st is in
    // August — never both. `<=` here would double-count midnight.
    expect(p.fromIso!.slice(0, 10)).toBe("2026-06-30"); // 1 July, Paris = 30 June 22:00 UTC
    expect(p.toIso!.slice(0, 10)).toBe("2026-07-31");
  });

  it("offers a step backwards, and forwards only when there is a past to step to", () => {
    const july = parseAdminPeriod({ period: "month", anchor: "2026-07-15" }, NOW);
    expect(july.prev).toBeTruthy();
    expect(july.next).toBeTruthy();
    expect(july.isCurrent).toBe(false);

    // ⚑ The month we are inside contains today, so there is nothing after it.
    // The bar hides the › rather than disabling it — a dead arrow invites the
    // click that proves it is dead.
    const august = parseAdminPeriod({ period: "month", anchor: "2026-08-15" }, NOW);
    expect(august.isCurrent).toBe(true);
  });

  it("gives a hand-picked range no neighbours to step to", () => {
    const r = parseAdminPeriod(
      { period: "range", from: "2026-06-16", to: "2026-07-31" },
      NOW,
    );
    expect(r.period).toBe("range");
    expect(r.prev).toBeNull();
    expect(r.next).toBeNull();
  });
});

describe("inPeriod", () => {
  it("says 'all time' in words rather than staying silent", () => {
    // ⚑ A figure with no qualifier invites the reader to supply their own, and
    // the one they supply is usually "recently".
    expect(inPeriod(parseAdminPeriod({}, NOW))).toBe("all time");
  });

  it("names the period it is in", () => {
    expect(inPeriod(parseAdminPeriod({ period: "month", anchor: "2026-07-15" }, NOW))).toBe(
      "in July 2026",
    );
  });
});

describe("periodHref", () => {
  it("keeps the screen's filters when the period changes", () => {
    // ⚑ Stepping from July to June must not drop "Businesses in Nice" — a screen
    // that forgets what you asked is how someone trusts a number for the wrong set.
    const href = periodHref(
      "/admin/businesses",
      { period: "month", anchor: "2026-06-15" },
      { city: "NICE", type: undefined },
    );
    expect(href).toContain("city=NICE");
    expect(href).toContain("period=month");
    expect(href).toContain("anchor=2026-06-15");
    expect(href).not.toContain("type=");
  });

  it("writes a clean URL for all time, with no period param at all", () => {
    expect(periodHref("/admin/drivers", { period: null }, {})).toBe("/admin/drivers");
    expect(periodHref("/admin/drivers", { period: null }, { make: "Mercedes" })).toBe(
      "/admin/drivers?make=Mercedes",
    );
  });
});
