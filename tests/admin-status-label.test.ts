// § the admin console's status word.
//
// ⚑ WHAT THIS FILE IS REALLY GUARDING. A console row prints two things about one
// trip: what its money did (`fareCell`) and what the trip is (the status word).
// Until 2026-09-02 they were derived from different places — the fare cell asked
// `isExpired`, the status word read the raw column — so a pooled trip whose
// pickup had passed said "Not taken" and "Pooled" in the same row, ten pixels
// apart. `expire_stale_missions` only runs on Pool and Dispatch reads; the
// console never sweeps, so on that screen the raw column is stale by design.
//
// The first test is the invariant, not an example: for ANY row and ONE clock, the
// two halves must agree. It is the test that would have caught the original bug,
// and it is what stops the next screen re-deriving the rule a third time.
import { describe, expect, it } from "vitest";
import { mission } from "./fixtures";
import { missionStatusLabelAt, missionTone, isExpired } from "@/lib/dispatch-status";
import { fareCell } from "@/lib/fare-cell";
import { missionStatusLabel } from "@/lib/format";
import type { MissionStatus } from "@/lib/database.types";

const PICKUP = "2026-07-15T12:00:00+02:00";
/** `ms` relative to the fixture pickup: at(-1) is one millisecond before it. */
const at = (ms: number) => new Date(Date.parse(PICKUP) + ms);

const BEFORE = at(-60 * 60 * 1000); // an hour before pickup
const AFTER = at(60 * 60 * 1000); // an hour after

describe("the row cannot disagree with itself", () => {
  const CASES: { status: MissionStatus; now: Date; what: string }[] = [
    { status: "pooled", now: BEFORE, what: "still in the Pool, pickup ahead" },
    { status: "pooled", now: AFTER, what: "still pooled, pickup gone — the sweep hasn't reached it" },
    { status: "expired", now: AFTER, what: "already swept" },
    { status: "confirmed", now: AFTER, what: "a Driver holds it, pickup passed" },
    { status: "completed", now: AFTER, what: "run and settled" },
    { status: "cancelled", now: AFTER, what: "called off" },
    { status: "draft", now: BEFORE, what: "never posted" },
  ];

  it.each(CASES)("$what: the word says Unfilled exactly when the money says Not taken", ({ status, now }) => {
    const m = mission({ status, ceiling: 100 });
    const saysNotTaken = fareCell(m, now, "course").label === "Not taken";
    const saysUnfilled = missionStatusLabelAt(m, now) === "Unfilled";
    expect(saysUnfilled).toBe(saysNotTaken);
  });
});

describe("the console's own vocabulary", () => {
  it("still prints Pooled for a trip whose pickup is ahead", () => {
    expect(missionStatusLabelAt(mission({ status: "pooled" }), BEFORE)).toBe("Pooled");
  });

  it("prints Unfilled for a still-pooled trip whose pickup has passed", () => {
    // The whole bug, in one line: the column says `pooled`, the trip is over.
    expect(missionStatusLabelAt(mission({ status: "pooled" }), AFTER)).toBe("Unfilled");
  });

  it("leaves every other status exactly as the column says", () => {
    for (const s of ["confirmed", "en_route", "arrived", "on_board", "completed", "cancelled", "draft", "accepted"] as MissionStatus[]) {
      expect(missionStatusLabelAt(mission({ status: s }), AFTER)).toBe(missionStatusLabel(s));
    }
  });

  it("does not borrow the Dispatcher's words", () => {
    // ⚑ `missionTone` would say "No Driver yet" / "A Driver is reviewing this" —
    // instructions to a hotel, on the founder's audit screen. The console keeps
    // its flat register; this pins that choice so a future refactor to
    // `missionTone` is a red test rather than a silent tone change.
    const soon = mission({ status: "pooled" });
    expect(missionTone(soon, at(-30 * 60 * 1000)).label).toBe("No Driver yet");
    expect(missionStatusLabelAt(soon, at(-30 * 60 * 1000))).toBe("Pooled");
  });
});

describe("the boundary", () => {
  it("is already Unfilled AT the pickup instant, not a millisecond later", () => {
    // `isExpired` is non-strict (`<=`); the fare cell pins the same edge.
    expect(missionStatusLabelAt(mission({ status: "pooled" }), at(0))).toBe("Unfilled");
    expect(missionStatusLabelAt(mission({ status: "pooled" }), at(-1))).toBe("Pooled");
    expect(isExpired(mission({ status: "pooled" }), at(0))).toBe(true);
  });
});
