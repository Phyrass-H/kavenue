// "To be approved" on /admin/drivers — the pills each row carries (S79, step 4).
//
// ⚑ THE SECTION IS mayTakeWork, AND THE PILLS COME FROM approvalPiles. The founder chose "all
// three approvals" over "person only" on a preview built from the live fleet, then renamed the
// section and the pills on a second one (2026-09-13): "To be approved", "to approve" instead of
// "with us", and the company shown "the same way" as the person and the car. These pin who is
// listed, and what each row says about them.
import { describe, expect, it } from "vitest";
import { DRIVER_DOC_TYPES, driverDocTypes } from "@/lib/account";
import { blockersOf, mayTakeWork, type DocFacts } from "@/lib/driver-approvals";
import type { DocumentStatus } from "@/lib/database.types";

const NOW = new Date("2026-09-13T12:00:00Z");

const filed = (status: DocumentStatus | null): DocFacts[] =>
  DRIVER_DOC_TYPES.map((type) => ({ type, status, expiresAt: null }));

/** The same file with one group set to another status (null = never filed). */
const withGroup = (docs: DocFacts[], group: "personal" | "company" | "vehicle", status: DocumentStatus | null) => {
  const inGroup = new Set<string>(driverDocTypes(group));
  return docs.map((d) => (inGroup.has(d.type) ? { ...d, status } : d));
};

const car = (approval_status: "pending" | "approved" | "rejected", retired_at: string | null = null) => ({
  approval_status,
  retired_at,
});

const toSend = (n: number) => `${n} paper${n > 1 ? "s" : ""} to send`;
const says = (driver: { verified: boolean }, liveCar: ReturnType<typeof car> | null, docs: DocFacts[]) =>
  blockersOf(driver, liveCar, docs, NOW).map((b) => b.says);

describe("blockersOf — what a row in To be approved says", () => {
  it("a Driver who can work carries no pill at all", () => {
    expect(blockersOf({ verified: true }, car("approved"), filed("verified"), NOW)).toEqual([]);
  });

  it("verified, car waiting: one pill, and it is ours to approve", () => {
    const b = blockersOf({ verified: true }, car("pending"), filed("verified"), NOW);
    expect(b).toEqual([{ pile: "vehicle", says: "Car · to approve", owed: "us" }]);
  });

  it("a refused car is the Driver's to correct", () => {
    const b = blockersOf({ verified: true }, car("rejected"), filed("verified"), NOW);
    expect(b).toEqual([{ pile: "vehicle", says: "Car · refused", owed: "them" }]);
  });

  it("no live car — and a car that was replaced is not one", () => {
    expect(says({ verified: true }, null, filed("verified"))).toEqual(["Car · none yet"]);
    expect(says({ verified: true }, car("approved", "2026-09-01T00:00:00Z"), filed("verified"))).toEqual([
      "Car · none yet",
    ]);
  });

  it("⚑ a person under review: person, company and car, in that order, all ours", () => {
    const b = blockersOf({ verified: false }, car("pending"), filed("pending"), NOW);
    expect(b.map((x) => [x.says, x.owed])).toEqual([
      ["Person · to approve", "us"],
      ["Company · to approve", "us"],
      ["Car · to approve", "us"],
    ]);
  });

  it("a person who has not filed their papers owes them, and the row says how many", () => {
    const n = driverDocTypes("personal").length;
    const docs = withGroup(filed("pending"), "personal", null);
    expect(blockersOf({ verified: false }, car("approved"), docs, NOW)).toEqual([
      { pile: "person", says: `Person · ${toSend(n)}`, owed: "them" },
      { pile: "company", says: "Company · to approve", owed: "us" },
    ]);
  });

  it("company papers owed are the Driver's move, on the company's own pill", () => {
    const m = driverDocTypes("company").length;
    const docs = withGroup(filed("pending"), "company", null);
    expect(says({ verified: false }, car("pending"), docs)).toEqual([
      "Person · to approve",
      `Company · ${toSend(m)}`,
      "Car · to approve",
    ]);
  });

  it("company papers already approved: no company pill, even while the person waits", () => {
    const docs = withGroup(filed("pending"), "company", "verified");
    expect(says({ verified: false }, car("approved"), docs)).toEqual(["Person · to approve"]);
  });

  it("⚑ once the person is approved the company says nothing — a lapsed Kbis alone lists nobody", () => {
    expect(says({ verified: true }, car("approved"), withGroup(filed("verified"), "company", null))).toEqual([]);
    expect(says({ verified: true }, car("pending"), withGroup(filed("verified"), "company", null))).toEqual([
      "Car · to approve",
    ]);
  });

  it("⚑ is empty exactly when mayTakeWork is true, in every combination", () => {
    const cars = [null, car("pending"), car("approved"), car("rejected"), car("approved", "2026-09-01T00:00:00Z")];
    const files = [filed("verified"), filed("pending"), filed(null)];
    for (const verified of [true, false]) {
      for (const liveCar of cars) {
        for (const docs of files) {
          const listed = blockersOf({ verified }, liveCar, docs, NOW).length > 0;
          expect(listed, JSON.stringify({ verified, liveCar, first: docs[0]!.status })).toBe(
            !mayTakeWork({ verified }, liveCar),
          );
        }
      }
    }
  });
});
