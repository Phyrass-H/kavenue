// § A rejection must carry a reason.
//
// ⚑ WHAT THIS GUARDS, AND WHY IT IS NOT FUSSY. `document.review_note` is the
// ONLY explanation any of the Driver's four surfaces can render, and it renders
// only when it is there (`app/(app)/settings/documents/[type]/page.tsx:85-87`).
// Reject without one and the Driver reads "Needs a new photo" and nothing else —
// no reason, no idea which side, nothing to act on. The migration that created
// the column said so in 2026-07-28 (*"Without it 'Rejected' is a dead end"*) and
// then nothing enforced it for five weeks, because nothing could write it at all.
//
// The reviewer's screen is the first thing that can, so the rule ships with it.
import { describe, expect, it } from "vitest";
import { checkReviewNote } from "@/lib/review-note";

describe("a rejection carries a reason the Driver can act on", () => {
  it("refuses an empty note", () => {
    expect(checkReviewNote("")).toEqual({
      ok: false,
      message: "Say what is wrong with it — the Driver reads this word for word.",
    });
  });

  it("refuses whitespace, which is an empty note wearing a hat", () => {
    expect(checkReviewNote("    ").ok).toBe(false);
  });

  it("refuses a shrug", () => {
    // ⚑ "no", "bad", "nope" are the notes a tired reviewer actually types at
    // 11pm. Four characters is not a quality bar — it is a floor under the
    // shortest thing that could possibly help.
    for (const shrug of ["no", "bad", "x", "???"]) {
      expect(checkReviewNote(shrug).ok).toBe(false);
    }
  });

  it("accepts the founder's own example, verbatim", () => {
    expect(checkReviewNote("the bottom edge is cut off")).toEqual({ ok: true });
  });

  it("refuses an essay — it has to fit on the Driver's phone", () => {
    expect(checkReviewNote("a".repeat(401)).ok).toBe(false);
    expect(checkReviewNote("a".repeat(400)).ok).toBe(true);
  });

  it("trims before measuring, both ends", () => {
    expect(checkReviewNote("   blurred   ").ok).toBe(true);
    expect(checkReviewNote(`  ${"a".repeat(400)}  `).ok).toBe(true);
  });
});
