// § 7 — the hold.
//
// ⚑ THE TESTS THAT MATTER HERE ARE THE ONES ABOUT TIME AND ABOUT WORDS.
// Time, because nothing runs at T+15 s: `outcome='open'` is a claim about the clock, not a
// state, and every reader that trusts the column instead of the clock is a bug. Words,
// because `lapsed` and `void` look identical in the data and mean opposite things — one is a
// Driver rejecting a price, the other is a trip vanishing underneath them.
import { describe, expect, it } from "vitest";
import {
  BUSINESS_REVIEWING_LABEL,
  HOLD_OUTCOMES,
  HOLD_SECONDS,
  canHold,
  formatCountdown,
  holdFloor,
  holderLabel,
  isLive,
  secondsLeft,
  watcherLabel,
} from "@/lib/hold";
import type { MissionHoldRow } from "@/lib/hold";

const AT = new Date("2026-08-31T12:00:00Z");
const iso = (offsetSeconds: number) => new Date(AT.getTime() + offsetSeconds * 1000).toISOString();

function hold(over: Partial<MissionHoldRow> = {}): MissionHoldRow {
  return {
    id: "h-1",
    mission_id: "m-1",
    driver_id: "dr-1",
    held_fare: 40,
    taken_at: iso(-4),
    expires_at: iso(11),
    hold_seconds: 15,
    outcome: "open",
    settled_at: null,
    ...over,
  };
}

describe("the window", () => {
  it("is fifteen seconds, the founder's number, not the spec's thirty", () => {
    // docs/06 §7 is LOCKED at 30. The founder set it to 15 in S72: "15 seconds there's a
    // lot of time to think". Pinned here so a later session reading the spec does not
    // "correct" it back.
    expect(HOLD_SECONDS).toBe(15);
  });
});

describe("open is a claim about the clock, not a state", () => {
  it("is live only while the clock says so", () => {
    expect(isLive(hold(), AT)).toBe(true);
  });

  it("⚑ is NOT live once the instant has passed, even though nothing swept it", () => {
    // This is the assertion the whole design rests on. Nothing runs at T+15 s, so a row can
    // sit at outcome='open' for hours after it stopped meaning anything. A reader that
    // trusted the column would keep a trip off the market indefinitely.
    expect(isLive(hold({ expires_at: iso(-1) }), AT)).toBe(false);
  });

  it("is not live once it has been settled, whatever the clock says", () => {
    expect(isLive(hold({ outcome: "committed" }), AT)).toBe(false);
    expect(isLive(hold({ outcome: "released" }), AT)).toBe(false);
  });
});

describe("the outcomes stay distinct", () => {
  it("keeps lapsed and void apart", () => {
    // ⚑ `lapsed` is a Driver who looked at a price and walked away — the sharpest signal in
    // the system. `void` is a trip cancelled underneath them, which says nothing about the
    // price at all. They are indistinguishable from timestamps after the fact, which is why
    // the outcome is written rather than derived, and why merging them would be silent.
    expect(HOLD_OUTCOMES).toContain("lapsed");
    expect(HOLD_OUTCOMES).toContain("void");
    expect(HOLD_OUTCOMES).toContain("released");
  });
});

describe("the countdown", () => {
  it("rounds up, so 0:01 is never shown as 0:00 while the hold is alive", () => {
    expect(secondsLeft(iso(0.4), AT)).toBe(1);
    expect(secondsLeft(iso(11), AT)).toBe(11);
  });

  it("floors at zero rather than going negative", () => {
    expect(secondsLeft(iso(-30), AT)).toBe(0);
    expect(secondsLeft(null, AT)).toBe(0);
  });

  it("formats as m:ss", () => {
    expect(formatCountdown(11)).toBe("0:11");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(75)).toBe("1:15");
  });
});

describe("the price rule is a FLOOR", () => {
  it("pays the higher of what they were shown and what the curve now says", () => {
    // ⚑ The deliberate departure from §7's word "frozen". The Driver is PAID this number, so
    // a price that climbed during their 15 seconds is good news; honouring the lower shown
    // price would bill them for thinking.
    expect(holdFloor(40, 55)).toBe(55);
  });

  it("never pays less than they were shown", () => {
    expect(holdFloor(60, 45)).toBe(60);
  });

  it("falls back to the live price when there was no hold", () => {
    expect(holdFloor(null, 45)).toBe(45);
  });
});

describe("the three voices", () => {
  it("tells the holder it is theirs, and the watcher how long to wait", () => {
    // docs/06:424 — showing the countdown to the other Driver is deliberate: they need to
    // know whether to wait or move on, and a bare "reserved" tells them nothing.
    expect(holderLabel(11)).toBe("Yours 0:11");
    expect(watcherLabel(11)).toBe("Being reviewed · 0:11");
  });

  it("gives the Business the fact and no clock", () => {
    // docs/06:427 — "reassuring, not alarming". A ticking countdown on a hotel's screen
    // invites "so will they take it?", and often the answer is no.
    expect(BUSINESS_REVIEWING_LABEL).toBe("A Driver is reviewing this");
    expect(BUSINESS_REVIEWING_LABEL).not.toMatch(/\d/);
  });
});

describe("one per trip, ever — and it never blocks Accept", () => {
  it("offers the freeze only when they have not spent it", () => {
    expect(canHold(null)).toBe(true);
    expect(canHold(hold({ outcome: "lapsed" }))).toBe(false);
    expect(canHold(hold({ outcome: "released" }))).toBe(false);
  });

  it("⚑ a spent hold is about the FREEZE, never about the trip", () => {
    // The founder's rule, S72: a Driver who holds, thinks and walks away must be able to
    // come back — five seconds or five minutes later — and take it at the live price. This
    // module has no function that would refuse an accept, and that absence is the feature.
    // The only thing canHold() gates is the button.
    expect(canHold(hold({ outcome: "lapsed" }))).toBe(false);
    expect(holdFloor(null, 45)).toBe(45);
  });
});
