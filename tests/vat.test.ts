// § VAT per line — the states, and the one that must not exist.
//
// ⚑ WHAT THIS FILE IS REALLY GUARDING. Until 2026-09-02 a single nullable
// number on the mission answered two questions at once, and the suite stood
// guard over the confusion: `tests/commission.test.ts` had an `it` asserting
// that a 0 rate, a NULL rate and an absent rate all produced the same answer.
// Three legally distinct facts pinned to one number.
//
// The first two describes below are the executable form of the fix. Everything
// else in this file is a decision the founder made on 2026-09-02, written down
// where it will go red if someone changes it by accident.
import { describe, expect, it } from "vitest";
import { mission } from "./fixtures";
import { taxOf, type BillLineKind, type TaxFacts, type TaxTreatment } from "@/lib/vat";
import { taxLineFor, commissionSplit, driverKeeps } from "@/lib/commission";
import type { MissionStatus } from "@/lib/database.types";

const KINDS: BillLineKind[] = [
  "transfer", "disposal", "waiting", "no_show",
  "cancellation_business", "cancellation_driver", "commission",
];

/** Every shape the live columns can actually take, including the string forms
 *  PostgREST returns for `numeric`. */
const TRANSPORT = [null, 0, "0", "0.00000", 0.1, "0.10000"] as const;
const COMMISSION = [null, 0.2, "0.20000"] as const;
// ⚑ NO `null` HERE. `mission_type` is `not null default 'transfer'` in the
// schema, so a null is a state the database forbids. The first draft of this
// matrix included one and the compiler rejected it — which is the type doing
// its job: an impossible input would have made the sweep look broader than the
// reality it is meant to cover.
const TYPES = ["transfer", "hourly"] as const;
const DRIVERS = ["dr-1", null] as const;

function facts(
  transport: (typeof TRANSPORT)[number],
  commission: (typeof COMMISSION)[number],
  mission_type: (typeof TYPES)[number],
  driver_id: (typeof DRIVERS)[number],
): TaxFacts {
  return { transport_vat_rate: transport, commission_vat_rate: commission, mission_type, driver_id };
}

const EVERY_COMBINATION: TaxFacts[] = TRANSPORT.flatMap((t) =>
  COMMISSION.flatMap((c) => TYPES.flatMap((ty) => DRIVERS.map((d) => facts(t, c, ty, d)))),
);

describe("0 % is not expressible", () => {
  // The hard constraint, as a property rather than a list of examples. France
  // has four rates — 20, 10, 5,5 and 2,1 — and zero is not among them. If ANY
  // input in the matrix can produce a taxable line at zero, the model is wrong.
  it("no input anywhere produces a taxable line at a zero rate", () => {
    let checked = 0;
    for (const m of EVERY_COMBINATION) {
      for (const kind of KINDS) {
        const t = taxOf(kind, m);
        expect(t).toBeTruthy();
        if (t.kind === "taxable") expect(t.rate).toBeGreaterThan(0);
        checked++;
      }
    }
    // ⚑ THE DEAD-BATTERY GUARD, and it has already earned its place. A sweep
    // that passes over an empty or shrunken matrix looks identical to one that
    // passes over a full one — the same failure that made a probe print seven
    // greens against zero rows earlier in this session. The floor caught this
    // file's own first draft: removing an impossible `mission_type: null` from
    // the matrix cut it from 756 combinations to 504, and the guard said so
    // instead of quietly covering less.
    //
    // 6 transport shapes × 3 commission shapes × 2 trip types × 2 driver states
    //   = 72 missions, × 7 line kinds = 504 resolutions.
    expect(checked).toBe(EVERY_COMBINATION.length * KINDS.length);
    expect(checked).toBe(504);
  });

  it("never puts an amount of zero on a line — it names the regime instead", () => {
    for (const m of EVERY_COMBINATION) {
      for (const kind of KINDS) {
        const line = taxLineFor(98.86, taxOf(kind, m));
        if (line.kind !== "taxable") expect(line).not.toHaveProperty("amount");
        else expect(line.amount).toBeGreaterThan(0);
      }
    }
  });

  it("never constructs `exempt` — it is declared, and provably unreachable in V1", () => {
    // In the union because the founder named four legal states. This test is
    // what keeps it an honest placeholder rather than a phantom feature.
    for (const m of EVERY_COMBINATION)
      for (const kind of KINDS) expect(taxOf(kind, m).kind).not.toBe("exempt");
  });
});

describe("the three answers that used to be one number", () => {
  const m = (transport: number | string | null) =>
    facts(transport as never, 0.2, "transfer", "dr-1");

  it("tells franchise en base apart from a trip nobody has taken", () => {
    const franchise = taxOf("transfer", m(0));
    const unknown = taxOf("transfer", m(null));
    expect(franchise).toEqual({ kind: "franchise" });
    expect(unknown).toEqual({ kind: "undetermined", why: "no_driver_yet" });
    // ⚑ THE ASSERTION THE OLD TEST GOT BACKWARDS. It required these to be equal.
    expect(franchise).not.toEqual(unknown);
  });

  it("reads a registered Driver's snapshot as the transfer rate", () => {
    expect(taxOf("transfer", m(0.1))).toEqual({ kind: "taxable", rate: 0.1 });
    expect(taxOf("transfer", m("0.10000"))).toEqual({ kind: "taxable", rate: 0.1 });
  });

  it("treats a numeric string zero exactly as a numeric zero", () => {
    // PostgREST hands back `numeric` as a string. A rate check that only
    // compared numbers would read "0.00000" as truthy and invent a rate.
    for (const z of [0, "0", "0.00000"] as const)
      expect(taxOf("transfer", m(z))).toEqual({ kind: "franchise" });
  });
});

describe("the founder's decisions, 2026-09-02", () => {
  const registered = (mission_type: "transfer" | "hourly") =>
    facts(0.1, 0.2, mission_type, "dr-1");

  it("a transfer is 10 % — a destination agreed in advance is what earns it", () => {
    expect(taxOf("transfer", registered("transfer"))).toEqual({ kind: "taxable", rate: 0.1 });
  });

  it("mise à disposition is 20 %, NOT the ride's 10 %", () => {
    // The founder's call, and the one that overturned Claude's own advice:
    // buying a driver's time by the hour with no agreed destination is closer
    // to a hire than to transport. CE 13 mai 2025, n° 499031, Sté Chabé.
    // ⚑ Unreachable in production — nothing writes `mission_type` — so this
    // test is the ONLY place the decision is exercised. Do not delete it as
    // dead: it is the specification waiting for the product.
    expect(taxOf("disposal", registered("hourly"))).toEqual({ kind: "taxable", rate: 0.2 });
  });

  it("waiting and a no-show follow the ride — asserted as equality, not as a rate", () => {
    // ⚑ EQUALITY ON PURPOSE. Restating "10 %" here would be a second copy that
    // could drift; this way they follow the ride wherever it goes, including
    // into franchise and into undetermined.
    for (const transport of [null, 0, 0.1] as const) {
      for (const ty of ["transfer", "hourly"] as const) {
        const m = facts(transport, 0.2, ty, "dr-1");
        const ride = taxOf(ty === "hourly" ? "disposal" : "transfer", m);
        expect(taxOf("waiting", m)).toEqual(ride);
        expect(taxOf("no_show", m)).toEqual(ride);
      }
    }
  });

  it("Kavenue's commission is its own supply at its own rate, on every kind of trip", () => {
    for (const ty of TYPES)
      for (const transport of TRANSPORT)
        expect(taxOf("commission", facts(transport, 0.2, ty, "dr-1")))
          .toEqual({ kind: "taxable", rate: 0.2 });
  });

  it("a missing commission rate is no supply at all, not a supply at 0 %", () => {
    // Live trap: 6 rows carry NULL commission rates because no fee was ever
    // charged on them. A zero-rated commission would be a different, false claim.
    expect(taxOf("commission", facts(0.1, null, "transfer", "dr-1")))
      .toEqual({ kind: "out_of_scope" });
  });

  it("a Driver's drop penalty is outside VAT entirely, whatever else is true", () => {
    for (const m of EVERY_COMBINATION)
      expect(taxOf("cancellation_driver", m)).toEqual({ kind: "out_of_scope" });
  });
});

describe("the cancellation this module refuses to answer", () => {
  it("says `position_open` rather than guessing a rate, once a Driver had accepted", () => {
    expect(taxOf("cancellation_business", facts(0.1, 0.2, "transfer", "dr-1")))
      .toEqual({ kind: "undetermined", why: "position_open" });
  });

  it("resolves cleanly when no Driver ever held it — nothing was supplied", () => {
    // ⚑ Settled by the SQL, not by an opinion: `business_cancel_mission` sets
    // the fee to 0 while a trip is pooled or Driverless, so this branch bills
    // nothing anyway. It is the half of the contested question that IS decided.
    expect(taxOf("cancellation_business", facts(0.1, 0.2, "transfer", null)))
      .toEqual({ kind: "out_of_scope" });
  });
});

describe("not one number on any screen moved", () => {
  // A faithful copy of the arithmetic as it stood BEFORE the reshape, in the
  // same integer cents. If the two disagree on any amount, the change leaked
  // out of the shape and into the money.
  const SCALE = 100000n;
  const before = (ttc: number, rate: number): number => {
    const r = BigInt(Math.round(rate * 100000));
    if (r <= 0n) return 0;
    const c = BigInt(Math.round(ttc * 100));
    const q = (c * SCALE * 2n + (SCALE + r)) / ((SCALE + r) * 2n);
    return Number(c - q) / 100;
  };

  it("agrees with the old transportVat for every cent from 0,01 to 40,00", () => {
    for (let cents = 1; cents <= 4000; cents++) {
      const ttc = cents / 100;
      const line = taxLineFor(ttc, { kind: "taxable", rate: 0.1 });
      expect(line.kind).toBe("taxable");
      if (line.kind === "taxable") expect(line.amount).toBe(before(ttc, 0.1));
    }
  });

  it("keeps the two figures the Driver's screen has always shown", () => {
    const s = commissionSplit(98.86, { businessHt: 0.125, driverHt: 0.1, feeVat: 0.2 });
    expect(driverKeeps(s, { kind: "taxable", rate: 0.1 })).toBe(79.98);
    expect(driverKeeps(s, { kind: "franchise" })).toBe(87);
    // ⚑ And the state the old code could not say at all.
    expect(driverKeeps(s, { kind: "undetermined", why: "no_driver_yet" })).toBe(87);
  });
});

describe("the resolver answers for a real MissionRow, not just a hand-built object", () => {
  it("classifies every status the console can show", () => {
    const statuses: MissionStatus[] = [
      "draft", "pooled", "accepted", "confirmed", "en_route",
      "arrived", "on_board", "completed", "cancelled", "expired",
    ];
    for (const status of statuses) {
      const m = mission({ status, transport_vat_rate: 0, commission_vat_rate: 0.2 });
      const t: TaxTreatment = taxOf("transfer", m);
      expect(t).toEqual({ kind: "franchise" });
    }
  });
});
