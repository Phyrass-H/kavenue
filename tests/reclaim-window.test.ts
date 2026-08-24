// D86 — when may the Business take a trip back from a Driver who is holding it
// and has never checked in?
//
// ⚑ WHY THIS FILE EXISTS. Until 2026-08-24 both the button and `reclaim_mission`
// were gated on `status = 'accepted'`, a status that has not existed since
// Option A/D55. Measured on the live DB that day: 0 of 280 missions and 0 of 715
// status transitions had ever been in it, and `mission_cancellation` held 0 rows
// — the RPC had never once run. The feature was not late, it was unreachable,
// and nothing in the test suite noticed for three months.
//
// So what these pin is the shape of the gate itself, not just its arithmetic:
// a `confirmed` trip qualifies and an `accepted` one does not, which is the
// exact inversion that was wrong.
//
// The other half of the rule is in SQL (docs/migrations/2026-08-24_reclaim_at_t2h.sql).
// `reclaimOpen` must stay a SUBSET of that guard — the UI decides what to offer,
// the RPC decides what is allowed — so every case below that expects `true` must
// also satisfy `status='confirmed' AND checked_in_at IS NULL AND now >= pickup−2h`.
import { describe, expect, it } from "vitest";
import {
  CHECK_IN_OPENS_MS,
  RECLAIM_OPENS_MS,
  checkInOpen,
  reclaimOpen,
  reclaimUnlocksAt,
} from "@/lib/dispatch-status";
import { mission } from "./fixtures";

// The fixture's pickup is 2026-07-15T12:00+02:00.
const PICKUP = new Date("2026-07-15T12:00:00+02:00").getTime();
const at = (msBeforePickup: number) => new Date(PICKUP - msBeforePickup);
const H = 3_600_000;

const held = mission({ status: "confirmed", checked_in_at: null });

describe("reclaimOpen — the window", () => {
  it("is shut before T−2h, even though check-in is already open", () => {
    const t = at(2.5 * H);
    expect(checkInOpen(held, t)).toBe(true); // the card is showing…
    expect(reclaimOpen(held, t)).toBe(false); // …with its button locked
  });

  it("opens exactly at T−2h", () => {
    expect(reclaimOpen(held, at(RECLAIM_OPENS_MS))).toBe(true);
    expect(reclaimOpen(held, at(RECLAIM_OPENS_MS + 1))).toBe(false);
  });

  it("stays open through the last hour", () => {
    expect(reclaimOpen(held, at(1 * H))).toBe(true);
    expect(reclaimOpen(held, at(0))).toBe(true);
  });

  // Inherited from checkInOpen: a trip left `confirmed` for weeks is stale data,
  // not a reclaim. Without this the card would sit on ancient rows forever.
  it("shuts an hour past the pickup, so it can't haunt a stale trip", () => {
    expect(reclaimOpen(held, at(-59 * 60_000))).toBe(true);
    expect(reclaimOpen(held, at(-2 * H))).toBe(false);
  });

  it("leaves the Driver a full hour of grace after check-in opens", () => {
    expect(CHECK_IN_OPENS_MS - RECLAIM_OPENS_MS).toBe(1 * H);
  });
});

describe("reclaimOpen — the gate", () => {
  // ⚑ THE REGRESSION THIS FILE IS REALLY FOR. If `accepted` ever comes back as
  // the condition, this fails.
  it("does NOT fire on `accepted` — the status that made this dead code", () => {
    expect(reclaimOpen(mission({ status: "accepted", checked_in_at: null }), at(1 * H))).toBe(false);
  });

  it("fires on `confirmed`, which is what accept_mission actually writes", () => {
    expect(reclaimOpen(mission({ status: "confirmed", checked_in_at: null }), at(1 * H))).toBe(true);
  });

  it("stops the moment the Driver checks in — that is the whole signal", () => {
    const checkedIn = mission({ status: "confirmed", checked_in_at: "2026-07-15T10:30:00+02:00" });
    expect(reclaimOpen(checkedIn, at(1 * H))).toBe(false);
  });

  it("never fires once the Driver is executing or the trip is over", () => {
    for (const status of ["en_route", "arrived", "on_board", "completed", "cancelled", "pooled"] as const) {
      expect(reclaimOpen(mission({ status, checked_in_at: null }), at(1 * H))).toBe(false);
    }
  });

  // The card is offered from T−3h with the button locked, so the Dispatcher can
  // see it coming and ring the Driver first. That only holds if the live window
  // is strictly inside the visible one.
  it("is a strict subset of checkInOpen, so the card is never live-but-hidden", () => {
    for (const h of [3, 2.5, 2, 1.5, 1, 0.5, 0]) {
      if (reclaimOpen(held, at(h * H))) expect(checkInOpen(held, at(h * H))).toBe(true);
    }
  });
});

describe("reclaimUnlocksAt", () => {
  it("names T−2h while the button is locked", () => {
    expect(reclaimUnlocksAt(held, at(3 * H))).toBe(new Date(PICKUP - RECLAIM_OPENS_MS).toISOString());
  });

  it("is null once the button is live, so the caller shows the real action", () => {
    expect(reclaimUnlocksAt(held, at(1 * H))).toBeNull();
  });
});
