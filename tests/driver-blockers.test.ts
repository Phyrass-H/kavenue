// "Can't work yet" on /admin/drivers — the pills each row carries (S79, step 4).
//
// ⚑ THE SECTION IS mayTakeWork, AND THE PILLS COME FROM approvalPiles. The founder chose "all
// three approvals" over "person only" on a preview built from the live fleet (2026-09-13). These
// pin the two things that could drift from the Driver's own file: who is listed, and what each
// row says about them.
import { describe, expect, it } from "vitest";
import { DRIVER_DOC_TYPES, driverDocTypes } from "@/lib/account";
import { blockersOf, mayTakeWork, type DocFacts } from "@/lib/driver-approvals";
import type { DocumentStatus } from "@/lib/database.types";

const NOW = new Date("2026-09-13T12:00:00Z");

const filed = (status: DocumentStatus | null): DocFacts[] =>
  DRIVER_DOC_TYPES.map((type) => ({ type, status, expiresAt: null }));

/** The same file with one group never filed. */
const without = (docs: DocFacts[], group: "personal" | "company" | "vehicle"): DocFacts[] => {
  const gone = new Set<string>(driverDocTypes(group));
  return docs.map((d) => (gone.has(d.type) ? { ...d, status: null } : d));
};

const car = (approval_status: "pending" | "approved" | "rejected", retired_at: string | null = null) => ({
  approval_status,
  retired_at,
});

const plural = (n: number) => `${n} paper${n > 1 ? "s" : ""} to add`;
const says = (driver: { verified: boolean }, liveCar: ReturnType<typeof car> | null, docs: DocFacts[]) =>
  blockersOf(driver, liveCar, docs, NOW).map((b) => b.says);

describe("blockersOf — what a row on /admin/drivers says", () => {
  it("a Driver who can work carries no pill at all", () => {
    expect(blockersOf({ verified: true }, car("approved"), filed("verified"), NOW)).toEqual([]);
  });

  it("verified, car waiting: one pill, and it is ours to act on", () => {
    const b = blockersOf({ verified: true }, car("pending"), filed("verified"), NOW);
    expect(b).toEqual([{ pile: "vehicle", says: "Car · with us", owed: "us" }]);
  });

  it("a refused car is the Driver's to correct", () => {
    const b = blockersOf({ verified: true }, car("rejected"), filed("verified"), NOW);
    expect(b).toEqual([{ pile: "vehicle", says: "Car · needs correcting", owed: "them" }]);
  });

  it("no live car — and a car that was replaced is not one", () => {
    expect(says({ verified: true }, null, filed("verified"))).toEqual(["No car on file"]);
    expect(says({ verified: true }, car("approved", "2026-09-01T00:00:00Z"), filed("verified"))).toEqual([
      "No car on file",
    ]);
  });

  it("a person under review with a car waiting: two pills, the person first", () => {
    const b = blockersOf({ verified: false }, car("pending"), filed("pending"), NOW);
    expect(b.map((x) => [x.says, x.owed])).toEqual([
      ["Person · with us", "us"],
      ["Car · with us", "us"],
    ]);
  });

  it("a person who has not filed their papers owes them, and the row says how many", () => {
    const n = driverDocTypes("personal").length;
    const b = blockersOf({ verified: false }, car("approved"), without(filed("pending"), "personal"), NOW);
    expect(b).toEqual([{ pile: "person", says: `Person · ${plural(n)}`, owed: "them" }]);
  });

  it("company papers owed get their own pill — only while the person is unapproved", () => {
    const m = driverDocTypes("company").length;
    const noCompany = without(filed("pending"), "company");
    expect(says({ verified: false }, car("pending"), noCompany)).toEqual([
      "Person · with us",
      `Company · ${plural(m)}`,
      "Car · with us",
    ]);
    // Approved person, approved car: a missing Kbis stops nobody working, so nothing is said.
    expect(says({ verified: true }, car("approved"), without(filed("verified"), "company"))).toEqual([]);
  });

  it("an approved car with an unapproved person: the person pill alone", () => {
    expect(says({ verified: false }, car("approved"), filed("pending"))).toEqual(["Person · with us"]);
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
