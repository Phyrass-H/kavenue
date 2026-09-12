// S78 — the three approvals: person, company, car.
//
// ⚑ The founder, 2026-09-12: *"Absolutely and even the company has to be approved! none can
// work if all together are not approved!"* These tests pin the two things that sentence means:
// all three are always reported, and "waiting on us" is never confused with "waiting on them".
import { describe, expect, it } from "vitest";
import { approvalPiles, mayTakeWork } from "@/lib/driver-approvals";
import type { DocView } from "@/lib/documents";
import type { DriverRow, VehicleRow } from "@/lib/database.types";

const driver = (over: Partial<DriverRow> = {}): DriverRow =>
  ({ id: "dr-1", verified: true, ...over }) as DriverRow;

const car = (over: Partial<VehicleRow> = {}): VehicleRow =>
  ({
    id: "v-1",
    driver_id: "dr-1",
    category: "business",
    body_type: "sedan",
    approval_status: "approved",
    retired_at: null,
    created_at: "2026-06-01T09:00:00+02:00",
    ...over,
  }) as VehicleRow;

const doc = (type: string, status: string | null, expiresAt: string | null = null): DocView =>
  ({ type, status, expiresAt, front: null, back: null, reviewNote: null }) as unknown as DocView;

/** Every paper in place, so a test can change exactly one thing. */
const allGood = (): DocView[] => [
  doc("drivers_licence", "verified"),
  doc("vtc_card", "verified"),
  doc("revtc", "verified"),
  doc("kbis", "verified"),
  doc("rc_pro", "verified"),
  doc("vehicle_registration", "verified"),
  doc("insurance", "verified"),
];

const now = new Date("2026-09-12T10:00:00Z");

describe("the three piles", () => {
  it("always reports all three, even the ones that are fine", () => {
    const piles = approvalPiles(driver(), car(), allGood(), now);
    expect(piles.map((p) => p.pile)).toEqual(["person", "company", "vehicle"]);
    expect(piles.every((p) => p.state === "done")).toBe(true);
  });

  it("⚑ an unverified Driver whose papers are all in is waiting on US, not the other way round", () => {
    // The distinction is the whole point of the tile: "todo" sends a reviewer to chase the
    // Driver for something they have already sent.
    const piles = approvalPiles(driver({ verified: false }), car(), allGood(), now);
    expect(piles[0]).toMatchObject({ pile: "person", state: "waiting" });
    expect(piles[0]!.says).toBe("your file is with us");
  });

  it("…and one whose licence was rejected is waiting on THEM", () => {
    const docs = allGood().map((d) => (d.type === "drivers_licence" ? doc("drivers_licence", "rejected") : d));
    const piles = approvalPiles(driver({ verified: false }), car(), docs, now);
    expect(piles[0]).toMatchObject({ state: "todo", says: "1 paper to add" });
  });

  it("a pending car is waiting, a rejected one is theirs to fix, no car is theirs to file", () => {
    expect(approvalPiles(driver(), car({ approval_status: "pending" }), allGood(), now)[2])
      .toMatchObject({ state: "waiting", says: "with us" });
    expect(approvalPiles(driver(), car({ approval_status: "rejected" }), allGood(), now)[2])
      .toMatchObject({ state: "todo", says: "needs correcting" });
    expect(approvalPiles(driver(), null, allGood(), now)[2])
      .toMatchObject({ state: "todo", says: "no car on file" });
  });

  it("⚑ a RETIRED car is not a car — the Driver has nothing on file until they replace it", () => {
    const piles = approvalPiles(driver(), car({ retired_at: "2026-09-10T08:00:00Z" }), allGood(), now);
    expect(piles[2]).toMatchObject({ state: "todo", says: "no car on file" });
  });

  it("an expiring paper is still done, and says so", () => {
    const docs = allGood().map((d) =>
      d.type === "insurance" ? doc("insurance", "verified", "2026-09-20T00:00:00Z") : d,
    );
    const piles = approvalPiles(driver(), car(), docs, now);
    expect(piles[2].state).toBe("done");
    expect(piles.find((p) => p.pile === "company")!.state).toBe("done");
  });
});

describe("may they take work at all", () => {
  it("needs the person AND the car", () => {
    expect(mayTakeWork(driver(), car())).toBe(true);
    expect(mayTakeWork(driver({ verified: false }), car())).toBe(false);
    expect(mayTakeWork(driver(), car({ approval_status: "pending" }))).toBe(false);
    expect(mayTakeWork(driver(), car({ retired_at: "2026-09-10T08:00:00Z" }))).toBe(false);
    expect(mayTakeWork(driver(), null)).toBe(false);
  });
});
