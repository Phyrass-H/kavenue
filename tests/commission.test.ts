// docs/06 §1, §3 — what Kavenue takes, and how it renders.
//
// The same arithmetic exists in SQL (`commission_split()` / `transport_vat()`),
// so the expected figures here are the ones the live database returns for
// 2026-08-17_commission.sql. If TypeScript and SQL ever disagree, this file is
// where it shows up.
//
// The invariants at the bottom are the ones that matter more than any single
// figure: an invoice must reconcile, and a mission with no rates must not be
// charged a fee that was never billed.

import { describe, it, expect } from "vitest";
import {
  commissionSplit,
  commissionFor,
  courseFromBusinessTotal,
  driverKeeps,
  driverNet,
  businessTotal,
  ratesOf,
  businessRatesOf,
  driverRatesOf,
  businessRatesFromRow,
  businessSplitFor,
  billGroups,
  driverSplitFor,
  splitFor,
  taxLineFor,
  type CommissionRateRow,
  type Rates,
} from "@/lib/commission";

const TAXABLE_10 = { kind: "taxable", rate: 0.1 } as const;

const RATES: Rates = { businessHt: 0.125, driverHt: 0.1, feeVat: 0.2 };

const snapshot = {
  commission_business_rate: 0.125,
  commission_driver_rate: 0.1,
  commission_vat_rate: 0.2,
  transport_vat_rate: 0.1,
};

describe("the rates themselves — docs/06 §1", () => {
  it("is 15 % TTC to the Business and 12 % TTC to the Driver", () => {
    // The two forms of the same rates: 12,5 × 1,2 = 15 and 10 × 1,2 = 12.
    const s = commissionSplit(100, RATES);
    expect(s.businessTotal).toBe(115);
    expect(s.driverNet).toBe(88);
  });

  it("banks 22,5 % of the course and hands 4,5 % to the state", () => {
    const s = commissionSplit(100, RATES);
    expect(s.businessFeeHt + s.driverFeeHt).toBe(22.5);
    expect(s.businessFeeVat + s.driverFeeVat).toBe(4.5);
    // And never 27 % — the collected total, VAT included, is what moves.
    expect(s.businessTotal - s.driverNet).toBe(27);
  });
});

describe("the figures the founder signed off, 2026-08-17", () => {
  it("prices Cannes → Monaco at the pre-filled ceiling", () => {
    // Course 138,61 is the rate card's all-in 159,40 divided back out.
    const s = commissionSplit(138.61, RATES);
    expect(s.businessTotal).toBe(159.4);
    expect(s.businessFeeHt).toBe(17.33);
    expect(s.businessFeeVat).toBe(3.46);
    expect(s.driverNet).toBe(121.98);
    expect(s.driverFeeHt).toBe(13.86);
    expect(s.driverFeeVat).toBe(2.77);
  });

  it("prices the same trip taken at 87,00", () => {
    const s = commissionSplit(98.86, RATES);
    expect(s.businessTotal).toBe(113.69);
    expect(s.businessFeeHt).toBe(12.36);
    expect(s.businessFeeVat).toBe(2.47);
    expect(s.driverNet).toBe(87);
    expect(s.driverFeeHt).toBe(9.89);
    expect(s.driverFeeVat).toBe(1.97);
  });
});

describe("an invoice always reconciles — the rounding convention", () => {
  // The VAT line is a remainder precisely so these two never fail. A cent of
  // drift here is a wrong invoice, not a rounding nicety.
  const courses = [
    0.01, 0.03, 1, 7.77, 12.01, 33.13, 47.63, 54.78, 87, 98.86, 100, 111, 138.61, 159.4, 250.55,
    459.55, 674.94, 971.56, 1748.41,
  ];

  it.each(courses)("course %s: the Business's three lines add to the total", (course) => {
    const s = commissionSplit(course, RATES);
    expect(s.course + s.businessFeeHt + s.businessFeeVat).toBeCloseTo(s.businessTotal, 10);
  });

  it.each(courses)("course %s: the Driver's deductions add back to the fare", (course) => {
    const s = commissionSplit(course, RATES);
    expect(s.driverNet + s.driverFeeHt + s.driverFeeVat).toBeCloseTo(s.course, 10);
  });

  it("reconciles across a thousand consecutive cents", () => {
    for (let cents = 1; cents <= 1000; cents++) {
      const s = commissionSplit(cents / 100, RATES);
      expect(s.course + s.businessFeeHt + s.businessFeeVat).toBeCloseTo(s.businessTotal, 10);
      expect(s.driverNet + s.driverFeeHt + s.driverFeeVat).toBeCloseTo(s.course, 10);
    }
  });

  it("never lets the VAT line drift more than a cent from 20 % of the fee", () => {
    // Rounded before comparing: the drift is exactly one cent at its worst, and
    // in float the subtraction alone reads 0.010000000000000002.
    const cents2 = (n: number) => Math.round(n * 100) / 100;
    for (let cents = 1; cents <= 5000; cents++) {
      const s = commissionSplit(cents / 100, RATES);
      expect(cents2(Math.abs(s.businessFeeVat - s.businessFeeHt * 0.2))).toBeLessThanOrEqual(0.01);
      expect(cents2(Math.abs(s.driverFeeVat - s.driverFeeHt * 0.2))).toBeLessThanOrEqual(0.01);
    }
  });
});

describe("money only ever moves one way", () => {
  it("charges the Business more than the course and pays the Driver less", () => {
    for (const course of [0.01, 5, 87, 138.61, 971.56]) {
      const s = commissionSplit(course, RATES);
      expect(s.businessTotal).toBeGreaterThanOrEqual(s.course);
      expect(s.driverNet).toBeLessThanOrEqual(s.course);
      expect(s.driverNet).toBeGreaterThan(0);
    }
  });

  it("treats a missing or negative course as nothing, never as a credit", () => {
    expect(commissionSplit(0, RATES).businessTotal).toBe(0);
    expect(commissionSplit(-50, RATES).businessTotal).toBe(0);
    expect(commissionSplit(Number.NaN, RATES).driverNet).toBe(0);
  });
});

describe("a mission priced before commission existed", () => {
  // 271 live rows are in this state. Reading NULL as 0,125 would invent 15 %
  // of charges that were never billed.
  const legacy = {
    commission_business_rate: null,
    commission_driver_rate: null,
    commission_vat_rate: null,
    transport_vat_rate: null,
  };

  it("has no rates", () => {
    expect(ratesOf(legacy)).toBeNull();
    expect(ratesOf(null)).toBeNull();
    expect(ratesOf(undefined)).toBeNull();
  });

  it("shows both parties the same single amount, with nothing charged", () => {
    const s = splitFor(legacy, 120);
    expect(s.charged).toBe(false);
    expect(s.businessTotal).toBe(120);
    expect(s.driverNet).toBe(120);
    expect(s.businessFeeHt + s.businessFeeVat + s.driverFeeHt + s.driverFeeVat).toBe(0);
  });

  it("treats a half-written snapshot as no commission, never as half a fee", () => {
    expect(ratesOf({ ...snapshot, commission_vat_rate: null })).toBeNull();
    expect(splitFor({ ...snapshot, commission_driver_rate: null }, 100).charged).toBe(false);
  });
});

describe("a snapshot with the OTHER side masked — the money-column walls", () => {
  // 2026-08-30: `mission_read` shows a Dispatcher its own rate and NULL where the
  // Driver's is, and the mirror for a Driver. Nothing about the money may change
  // because of it — the whole risk of the walls was a silent one, since `ratesOf`
  // demanded all three and would have quietly reported "no commission charged".
  const asBusinessSees = { ...snapshot, commission_driver_rate: null };
  const asDriverSees = { ...snapshot, commission_business_rate: null };

  it("still bills the Business exactly what an unmasked row does", () => {
    expect(businessTotal(asBusinessSees, 190)).toBe(businessTotal(snapshot, 190));
    expect(businessTotal(asBusinessSees, 190)).toBe(218.5); // docs/06 §3's own example
    const s = businessSplitFor(asBusinessSees, 190);
    expect(s.charged).toBe(true);
    expect(s.businessFeeHt).toBe(23.75);
    expect(s.businessFeeVat).toBe(4.75);
    expect(s.course + s.businessFeeHt + s.businessFeeVat).toBe(s.businessTotal);
  });

  it("still pays the Driver exactly what an unmasked row does", () => {
    expect(driverNet(asDriverSees, 190)).toBe(driverNet(snapshot, 190));
    const s = driverSplitFor(asDriverSees, 190);
    expect(s.charged).toBe(true);
    expect(s.driverNet + s.driverFeeHt + s.driverFeeVat).toBe(s.course);
  });

  it("⚑ is the case the OLD ratesOf would have got wrong", () => {
    // The regression this whole describe exists to hold: left on `ratesOf`, a
    // masked row reads as a trip that was never charged a fee, and the Business
    // is shown the Course as its total — 190,00 where it owes 218,50.
    expect(ratesOf(asBusinessSees)).toBeNull();
    expect(splitFor(asBusinessSees, 190).businessTotal).toBe(190);
    expect(businessTotal(asBusinessSees, 190)).toBe(218.5);
  });

  it("still reports NO commission when the side that IS visible is null", () => {
    // Masking is not the same as a pre-commission trip, and the per-side readers
    // must not turn one into the other.
    expect(businessRatesOf({ ...snapshot, commission_business_rate: null })).toBeNull();
    expect(driverRatesOf({ ...snapshot, commission_driver_rate: null })).toBeNull();
    expect(businessRatesOf({ ...snapshot, commission_vat_rate: null })).toBeNull();
    expect(driverRatesOf({ ...snapshot, commission_vat_rate: null })).toBeNull();
    expect(businessSplitFor({ ...snapshot, commission_business_rate: null }, 190).charged).toBe(false);
  });

  it("does not let one side's helper answer for the other", () => {
    // businessRatesOf substitutes 0 for the Driver's rate, which would read as a
    // Driver banking the whole Course. The narrowed return types are what stop
    // that number ever being rendered; this pins the substitution itself.
    expect(businessRatesOf(snapshot)).toEqual({ businessHt: 0.125, driverHt: 0, feeVat: 0.2 });
    expect(driverRatesOf(snapshot)).toEqual({ businessHt: 0, driverHt: 0.1, feeVat: 0.2 });
  });

  it("reads a rate card with driver_rate_ht revoked", () => {
    // The mission form's own read since the walls — the column is not selectable
    // by a Dispatcher session at all, so the row simply arrives without it.
    const card = {
      id: "x", effective_from: "2026-08-17T00:00:00Z",
      business_rate_ht: 0.125, fee_vat_rate: 0.2, transport_vat_rate: 0.1,
    };
    expect(businessRatesFromRow(card)).toEqual({ businessHt: 0.125, driverHt: 0, feeVat: 0.2 });
    expect(commissionSplit(190, businessRatesFromRow(card)).businessTotal).toBe(218.5);
    expect(businessRatesFromRow(null)).toBeNull();
  });
});

describe("the bill, grouped by what each amount pays for", () => {
  // Founder, 2026-08-31: opened a trip with 21 minutes of waiting, saw the
  // headline say 19,78 € above a table whose first line said 17,20 €, and asked
  // where the difference went. It was nowhere — the flat table pools both fees
  // into one figure, so the headline is not reachable from it by any addition.
  const trip = { kind: "transfer" as const, label: "Trip", gross: 17.2 };
  const wait = { kind: "waiting" as const, label: "Waiting", gross: 6.6 };

  it("puts the row's own headline back in the table that explains it", () => {
    const g = billGroups(snapshot, [trip, wait], 27.37);
    expect(g[0].total).toBe(19.78); // ← the headline, businessTotal(17,20)
    expect(g[1].total).toBe(7.59);
    // ⚑ IN CENTS. `17.2 + 2.15 + 0.43` is 19.779999999999998 in binary float —
    // the same reason every amount in this file is computed in integer cents.
    // The screen never adds these; it prints each one already rounded.
    expect(Math.round((g[0].gross + g[0].feeHt + g[0].feeVat) * 100)).toBe(1978);
    expect(Math.round((g[0].total + g[1].total) * 100)).toBe(2737);
  });

  it("renders as §3's flat table when only one thing was billed", () => {
    const g = billGroups(snapshot, [trip], businessTotal(snapshot, 17.2));
    expect(g).toHaveLength(1);
    expect(g[0].total).toBe(19.78);
  });

  it("⚑ totals EXACTLY the figure it was given, whatever the rounding does", () => {
    // The reason the last group takes the remainder. Splitting the fee per item
    // and rounding each independently disagrees with the pooled total by a cent
    // on 21 of the 106 live trips that have waiting. An invoice whose lines do
    // not add up to its total is wrong however defensible the arithmetic.
    for (let cents = 1; cents <= 4000; cents++) {
      const fare = cents / 100;
      const w = Math.round(fare * 37) / 100; // an unrelated, awkward second item
      const total = businessTotal(snapshot, fare + w);
      const g = billGroups(snapshot, [{ kind: "transfer", label: "Trip", gross: fare }, { kind: "waiting", label: "Waiting", gross: w }], total);
      const summed = g.reduce((n, x) => n + Math.round(x.total * 100), 0);
      expect(summed).toBe(Math.round(total * 100));
      for (const x of g) {
        expect(Math.round((x.gross + x.feeHt + x.feeVat) * 100)).toBe(Math.round(x.total * 100));
      }
    }
  });

  it("charges nothing on a trip priced before commission existed", () => {
    const g = billGroups({ commission_business_rate: null, commission_vat_rate: null }, [trip], 17.2);
    expect(g[0].feeHt).toBe(0);
    expect(g[0].feeVat).toBe(0);
    expect(g[0].total).toBe(17.2);
  });

  it("copes with no items at all", () => {
    expect(billGroups(snapshot, [], 0)).toEqual([]);
  });
});

describe("reading the snapshot as PostgREST returns it", () => {
  it("copes with numerics arriving as strings", () => {
    const asText = {
      commission_business_rate: "0.12500",
      commission_driver_rate: "0.10000",
      commission_vat_rate: "0.20000",
      transport_vat_rate: "0.10000",
    };
    expect(businessTotal(asText, 138.61)).toBe(159.4);
    expect(driverNet(asText, 138.61)).toBe(121.98);
  });
});

describe("the Ceiling round-trips", () => {
  it("turns the all-in number a Business sees back into the stored course", () => {
    expect(courseFromBusinessTotal(159.4, RATES)).toBe(138.61);
    expect(businessTotal(snapshot, 138.61)).toBe(159.4);
  });

  it("never sets a maximum ABOVE what the Business typed", () => {
    // A ceiling is a promise not to go above a number. Roughly one cent value in
    // eight is unreachable (the stored Course is held to the cent, and a cent
    // times 1,15 skips cents), so the snap must always fall short, never over.
    let short = 0;
    for (let cents = 1000; cents <= 200000; cents += 7) {
      const typed = cents / 100;
      const shown = commissionSplit(courseFromBusinessTotal(typed, RATES), RATES).businessTotal;
      expect(shown).toBeLessThanOrEqual(typed);
      // And never further short than the gap between two reachable all-ins.
      expect(typed - shown).toBeLessThan(0.02);
      if (shown !== typed) short++;
    }
    // Most values land exactly; the rest are a cent under and the form shows it.
    expect(short / 28572).toBeLessThan(0.2);
  });

  it("is exact on the numbers Kavenue itself pre-fills", () => {
    for (const total of [159.4, 113.69, 115, 88, 80.13]) {
      const course = courseFromBusinessTotal(total, RATES);
      expect(commissionSplit(course, RATES).businessTotal).toBeLessThanOrEqual(total);
    }
    expect(courseFromBusinessTotal(159.4, RATES)).toBe(138.61);
  });

  it("passes a total straight through when there is no commission", () => {
    expect(courseFromBusinessTotal(159.4, null)).toBe(159.4);
  });
});

describe("the VAT inside the fare — docs/06 §3", () => {
  // ⚑ THE `it` THAT USED TO LIVE HERE WAS THE BUG, CODIFIED. It read
  // `is nothing for a Driver under franchise en base` and asserted that
  // transportVat(98.86, 0), (…, null) and (…, undefined) all equalled 0 —
  // three legally distinct inputs pinned to one answer, with the suite standing
  // guard over the conflation. Those cases are now assertions about STATES in
  // tests/vat.test.ts, where `franchise` and `undetermined` must never be equal.
  // What stays here is the arithmetic, which did not change.
  it("finds the 10 % a registered Driver collects", () => {
    expect(taxLineFor(98.86, TAXABLE_10)).toEqual({ kind: "taxable", rate: 0.1, amount: 8.99 });
    expect(taxLineFor(138.61, TAXABLE_10)).toEqual({ kind: "taxable", rate: 0.1, amount: 12.6 });
  });

  it("gives a franchise line no amount at all, rather than an amount of zero", () => {
    // Not `amount: 0`. The type has no such field on this branch, so a caller
    // cannot print "0,00 € of VAT" — it has to name the regime instead.
    expect(taxLineFor(98.86, { kind: "franchise" })).toEqual({ kind: "franchise" });
  });

  it("leaves the registered Driver keeping less than the unregistered one", () => {
    // The same 87,00 € on screen, two different amounts kept — the reason the
    // Driver's side breaks VAT out and the Business's side does not.
    // ⚑ The two expected figures must not move: they are the proof the reshape
    // changed the shape and not the arithmetic.
    const s = commissionSplit(98.86, RATES);
    expect(driverKeeps(s, TAXABLE_10)).toBe(79.98);
    expect(driverKeeps(s, { kind: "franchise" })).toBe(87);
  });
});

describe("choosing a generation — docs/06 §9", () => {
  const rows: CommissionRateRow[] = [
    {
      id: "old",
      effective_from: "2026-08-17T00:00:00.000Z",
      business_rate_ht: 0.125,
      driver_rate_ht: 0.1,
      fee_vat_rate: 0.2,
      transport_vat_rate: 0.1,
    },
    {
      id: "new",
      effective_from: "2027-01-01T00:00:00.000Z",
      business_rate_ht: 0.11,
      driver_rate_ht: 0.09,
      fee_vat_rate: 0.2,
      transport_vat_rate: 0.1,
    },
  ];

  it("takes the newest generation already in force", () => {
    expect(commissionFor(rows, new Date("2026-09-01"))?.id).toBe("old");
    expect(commissionFor(rows, new Date("2027-06-01"))?.id).toBe("new");
  });

  it("has nothing before the first generation starts", () => {
    expect(commissionFor(rows, new Date("2026-01-01"))).toBeNull();
    expect(commissionFor([], new Date())).toBeNull();
  });
});
