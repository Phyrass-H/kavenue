// Which paper is on file — the rule the reviewer's page and the admin Drivers list share (S79).
//
// ⚑ These pin the behaviour lib/documents.ts had before the rule was lifted out of it, so the
// extraction cannot quietly change what a reviewer sees.
import { describe, expect, it } from "vitest";
import { DRIVER_DOC_TYPES, documentMeta } from "@/lib/account";
import { latestSlots, rollUp, type DocRowLike } from "@/lib/document-views";
import type { DocumentSide, DocumentStatus, DocumentType } from "@/lib/database.types";

const twoSided = DRIVER_DOC_TYPES.find((t) => documentMeta(t).twoSided)!;
const oneSided = DRIVER_DOC_TYPES.find((t) => !documentMeta(t).twoSided)!;

const row = (
  type: DocumentType,
  side: DocumentSide | null,
  status: DocumentStatus,
  uploaded_at: string,
  expires_at: string | null = null,
): DocRowLike => ({ type, side, status, uploaded_at, expires_at });

describe("latestSlots", () => {
  it("has a two-sided and a one-sided paper to test against", () => {
    expect(twoSided).toBeDefined();
    expect(oneSided).toBeDefined();
  });

  it("returns one slot per requested type, in the order asked", () => {
    const slots = latestSlots([], [oneSided, twoSided]);
    expect(slots.map((s) => s.type)).toEqual([oneSided, twoSided]);
  });

  it("a paper never filed is missing, not incomplete", () => {
    const [slot] = latestSlots([], [twoSided]);
    expect(slot).toMatchObject({ status: null, expiresAt: null, front: null, back: null, incomplete: false });
  });

  it("the newest row wins, whatever order the rows arrive in", () => {
    const old = row(oneSided, null, "rejected", "2026-09-01T10:00:00+00:00");
    const recent = row(oneSided, null, "verified", "2026-09-10T10:00:00+00:00");
    expect(latestSlots([old, recent], [oneSided])[0]!.status).toBe("verified");
    expect(latestSlots([recent, old], [oneSided])[0]!.status).toBe("verified");
  });

  it("a sideless row stands in as the front of a two-sided paper", () => {
    const sideless = row(twoSided, null, "verified", "2026-09-01T10:00:00+00:00");
    const [slot] = latestSlots([sideless], [twoSided]);
    expect(slot!.front).toBe(sideless);
    expect(slot!.incomplete).toBe(true);
  });

  it("a one-sided paper never has a back", () => {
    const stray = row(oneSided, "back", "verified", "2026-09-01T10:00:00+00:00");
    const [slot] = latestSlots([stray], [oneSided]);
    expect(slot!.back).toBeNull();
    expect(slot!.status).toBeNull();
  });

  it("a two-sided paper is complete only with both sides", () => {
    const front = row(twoSided, "front", "verified", "2026-09-01T10:00:00+00:00");
    const back = row(twoSided, "back", "verified", "2026-09-02T10:00:00+00:00");
    expect(latestSlots([front], [twoSided])[0]!.incomplete).toBe(true);
    expect(latestSlots([front, back], [twoSided])[0]!.incomplete).toBe(false);
  });

  it("the worst side decides: rejected beats pending beats verified", () => {
    const front = row(twoSided, "front", "verified", "2026-09-01T10:00:00+00:00");
    const back = row(twoSided, "back", "pending", "2026-09-02T10:00:00+00:00");
    expect(latestSlots([front, back], [twoSided])[0]!.status).toBe("pending");
    expect(rollUp("pending", "rejected")).toBe("rejected");
    expect(rollUp("verified", "verified")).toBe("verified");
  });

  it("the expiry comes from the front, else the back", () => {
    const front = row(twoSided, "front", "verified", "2026-09-01T10:00:00+00:00", "2027-01-01");
    const back = row(twoSided, "back", "verified", "2026-09-02T10:00:00+00:00", "2028-01-01");
    expect(latestSlots([front, back], [twoSided])[0]!.expiresAt).toBe("2027-01-01");
    expect(latestSlots([back], [twoSided])[0]!.expiresAt).toBe("2028-01-01");
  });
});
