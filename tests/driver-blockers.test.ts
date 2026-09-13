// "To be approved" on /admin/drivers, and the three tiles on a Driver's admin page (S79, step 4).
//
// ⚑ THE SECTION IS mayTakeWork, AND EVERY ADMIN WORD COMES FROM adminPiles. The founder chose "all
// three approvals" over "person only" on a preview built from the live fleet, then renamed the
// section and the pills on a second one (2026-09-13): "To be approved", "to approve" instead of
// "with us", the company shown "the same way" as the person and the car — and "yes change the
// detail page too". These pin who is listed, what each row and tile says, and that the Driver's
// own screens keep their own words.
import { describe, expect, it } from "vitest";
import { DRIVER_DOC_TYPES, driverDocTypes } from "@/lib/account";
import { adminPiles, approvalPiles, blockersOf, mayTakeWork, type DocFacts } from "@/lib/driver-approvals";
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

// ⚑ S80 — "documents needed", the founder's words from the support desk's side (was "papers to send").
const needed = (n: number) => `${n} document${n > 1 ? "s" : ""} needed`;
const says = (driver: { verified: boolean }, liveCar: ReturnType<typeof car> | null, docs: DocFacts[]) =>
  blockersOf(driver, liveCar, docs, NOW).map((b) => b.says);

/** Every combination the tests below walk. */
const CARS = [null, car("pending"), car("approved"), car("rejected"), car("approved", "2026-09-01T00:00:00Z")];
const FILES = [filed("verified"), filed("pending"), filed(null), withGroup(filed("pending"), "company", null)];

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
      { pile: "person", says: `Person · ${needed(n)}`, owed: "them" },
      { pile: "company", says: "Company · to approve", owed: "us" },
    ]);
  });

  it("company papers owed are the Driver's move, on the company's own pill", () => {
    const m = driverDocTypes("company").length;
    const docs = withGroup(filed("pending"), "company", null);
    expect(says({ verified: false }, car("pending"), docs)).toEqual([
      "Person · to approve",
      `Company · ${needed(m)}`,
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
    for (const verified of [true, false]) {
      for (const liveCar of CARS) {
        for (const docs of FILES) {
          const listed = blockersOf({ verified }, liveCar, docs, NOW).length > 0;
          expect(listed, JSON.stringify({ verified, liveCar, first: docs[0]!.status })).toBe(
            !mayTakeWork({ verified }, liveCar),
          );
        }
      }
    }
  });
});

describe("adminPiles — the three tiles on a Driver's admin page, in the list's words", () => {
  const tiles = (driver: { verified: boolean }, liveCar: ReturnType<typeof car> | null, docs: DocFacts[]) =>
    adminPiles(driver, liveCar, docs, NOW).map((p) => [p.pile, p.state, p.says]);

  it("a Driver who can work: all three done", () => {
    expect(tiles({ verified: true }, car("approved"), filed("verified"))).toEqual([
      ["person", "done", "approved"],
      ["company", "done", "valid"],
      ["vehicle", "done", "approved"],
    ]);
  });

  it("a file under review: to approve, three times", () => {
    expect(tiles({ verified: false }, car("pending"), filed("pending"))).toEqual([
      ["person", "waiting", "to approve"],
      ["company", "waiting", "to approve"],
      ["vehicle", "waiting", "to approve"],
    ]);
  });

  it("what the Driver owes: papers to send, a refused car, no car at all", () => {
    const n = driverDocTypes("personal").length;
    const m = driverDocTypes("company").length;
    expect(tiles({ verified: false }, car("rejected"), filed(null))).toEqual([
      ["person", "todo", needed(n)],
      ["company", "todo", needed(m)],
      ["vehicle", "todo", "refused"],
    ]);
    expect(tiles({ verified: true }, null, filed("verified"))[2]).toEqual(["vehicle", "todo", "none yet"]);
  });

  it("⚑ the list's pills are the tiles' words — one spelling for both admin screens", () => {
    for (const verified of [true, false]) {
      for (const liveCar of CARS) {
        for (const docs of FILES) {
          const words = new Set(adminPiles({ verified }, liveCar, docs, NOW).map((p) => p.says));
          for (const b of blockersOf({ verified }, liveCar, docs, NOW)) {
            expect(words).toContain(b.says.split(" · ").slice(1).join(" · "));
          }
        }
      }
    }
  });

  it("⚑ changes the words, never the state — and never says 'with us'", () => {
    for (const verified of [true, false]) {
      for (const liveCar of CARS) {
        for (const docs of FILES) {
          const admin = adminPiles({ verified }, liveCar, docs, NOW);
          const driverSide = approvalPiles({ verified }, liveCar, docs, NOW);
          expect(admin.map((p) => p.state)).toEqual(driverSide.map((p) => p.state));
          for (const p of admin) expect(p.says).not.toMatch(/with us/);
        }
      }
    }
  });

  it("the Driver's own screens keep their words", () => {
    expect(approvalPiles({ verified: false }, car("pending"), filed("pending"), NOW).map((p) => p.says)).toEqual([
      "your file is with us",
      `${driverDocTypes("company").length} with us`,
      "with us",
    ]);
  });
});

describe("S80 — the To be approved table: one cell per pile, and what a done pile still owes", () => {
  const cells = (driver: { verified: boolean }, liveCar: ReturnType<typeof car> | null, docs: DocFacts[]) =>
    adminPiles(driver, liveCar, docs, NOW).map((p) => [p.pile, p.state, p.says, p.detail]);

  it("⚑ an approved person who owes papers reads 'approved', with how many under it", () => {
    // The founder, 2026-09-13: "Approved · 2 documents needed". 9 live Drivers are exactly this.
    const n = driverDocTypes("personal").length;
    const docs = withGroup(filed("verified"), "personal", null);
    expect(cells({ verified: true }, car("pending"), docs)[0]).toEqual(["person", "done", "approved", needed(n)]);
  });

  it("nothing owed and nothing expiring: no pile carries a detail", () => {
    expect(adminPiles({ verified: true }, car("approved"), filed("verified"), NOW).map((p) => p.detail)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("a pile that is not done never carries a detail — its own words already say it", () => {
    for (const verified of [true, false]) {
      for (const liveCar of CARS) {
        for (const docs of FILES) {
          for (const p of adminPiles({ verified }, liveCar, docs, NOW)) {
            if (p.state !== "done") expect(p.detail, JSON.stringify(p)).toBeNull();
          }
        }
      }
    }
  });

  it("⚑ the company's 'valid · 1 expiring soon' is split for a 142px cell; the Driver's own screen keeps one string", () => {
    const soon = new Date(NOW.getTime() + 10 * 86_400_000).toISOString();
    const first = driverDocTypes("company")[0];
    const docs = filed("verified").map((d) => (d.type === first ? { ...d, expiresAt: soon } : d));
    const company = adminPiles({ verified: true }, car("approved"), docs, NOW)[1]!;
    expect([company.state, company.says, company.detail]).toEqual(["done", "valid", "1 expiring soon"]);
    expect(approvalPiles({ verified: true }, car("approved"), docs, NOW)[1]!.says).toBe("valid · 1 expiring soon");
  });

  it("⚑ an admin never reads 'papers' or 'to send' — the founder's word is documents", () => {
    for (const verified of [true, false]) {
      for (const liveCar of CARS) {
        for (const docs of FILES) {
          const words = [
            ...adminPiles({ verified }, liveCar, docs, NOW).flatMap((p) => [p.says, p.detail ?? ""]),
            ...blockersOf({ verified }, liveCar, docs, NOW).map((b) => b.says),
          ];
          for (const w of words) expect(w).not.toMatch(/paper|to send/);
        }
      }
    }
  });
});
