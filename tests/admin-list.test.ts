// The console's list mechanics.
//
// ⚑ THE REAL COORDINATES ARE USED THROUGHOUT. `farLeg` decides what forty rows
// of a hotel's page say, and it decides it on distance — so a test with made-up
// lat/lngs would prove nothing about the only dataset it has to work on. These
// are the values in the live `business` and `mission` rows.
import { describe, expect, it } from "vitest";
import {
  farLeg,
  byDay,
  bandKey,
  pageWindow,
  pageNote,
  tallyActivity,
  activitySays,
  SAME_PLACE_KM,
  type HeldMission,
} from "@/lib/admin-list";

const BELLES_RIVES = { lat: 43.5642, lng: 7.1093 };
const NCE_T2 = { label: "Nice Airport, T2", lat: 43.6656, lng: 7.2145 };
const NCE_T1 = { label: "Nice Airport, T1", lat: 43.6607, lng: 7.2049 };
const HOTEL = { label: "Belles-Rives, Juan-les-Pins", ...BELLES_RIVES };
const MAJESTIC = { label: "Hôtel Majestic, Cannes", lat: 43.5507, lng: 7.0166 };

describe("farLeg — which end of the journey a hotel's own page shows", () => {
  it("shows only the destination when the trip leaves the hotel", () => {
    const leg = farLeg(HOTEL, NCE_T2, BELLES_RIVES, "Belles-Rives, Juan-les-Pins → Nice Airport, T2");
    expect(leg).toEqual({ at: "start", label: "Nice Airport, T2" });
  });

  it("shows only the origin when the trip comes back to the hotel", () => {
    const leg = farLeg(NCE_T1, HOTEL, BELLES_RIVES, "Nice Airport, T1 → Belles-Rives, Juan-les-Pins");
    expect(leg).toEqual({ at: "end", label: "Nice Airport, T1" });
  });

  it("shows the whole route when the hotel is at neither end", () => {
    const whole = "Hôtel Majestic, Cannes → Nice Airport, T2";
    expect(farLeg(MAJESTIC, NCE_T2, BELLES_RIVES, whole)).toEqual({ at: "neither", label: whole });
  });

  // ⚑ A bare "→ Belles-Rives" on a round trip would read as an ordinary
  // departure to a different place that happens to share the name.
  it("shows the whole route when BOTH ends are the hotel", () => {
    const whole = "Belles-Rives, Juan-les-Pins → Belles-Rives, Juan-les-Pins";
    expect(farLeg(HOTEL, HOTEL, BELLES_RIVES, whole)).toEqual({ at: "neither", label: whole });
  });

  // ⚑ The fallback that keeps this honest: with no anchor there is no claim to
  // make, so it must not guess from the label.
  it("shows the whole route when the hotel has no address on file", () => {
    const whole = "Belles-Rives, Juan-les-Pins → Nice Airport, T2";
    expect(farLeg(HOTEL, NCE_T2, null, whole)).toEqual({ at: "neither", label: whole });
    expect(farLeg(HOTEL, NCE_T2, { lat: null, lng: null }, whole)).toEqual({
      at: "neither",
      label: whole,
    });
  });

  it("shows the whole route when the trip's own end has no coordinates", () => {
    const whole = "Somewhere → Nice Airport, T2";
    const noCoords = { label: "Somewhere", lat: null, lng: null };
    expect(farLeg(noCoords, NCE_T2, BELLES_RIVES, whole)).toEqual({ at: "neither", label: whole });
  });

  // A service entrance and a lobby are two Google places for one building.
  it("treats a point a hundred metres away as the same place", () => {
    const sideDoor = { label: "Belles-Rives (service)", lat: 43.5651, lng: 7.1093 };
    expect(farLeg(sideDoor, NCE_T2, BELLES_RIVES, "x").at).toBe("start");
  });

  it("does not swallow the next place along", () => {
    // Port Vauban, 2.9 km up the coast — a different address entirely.
    const vauban = { label: "Port Vauban, Antibes", lat: 43.5865, lng: 7.1279 };
    expect(farLeg(vauban, NCE_T2, BELLES_RIVES, "x").at).toBe("neither");
    expect(SAME_PLACE_KM).toBeLessThan(1);
  });
});

describe("byDay", () => {
  const rows = [
    { id: "a", at: "2026-08-29T08:21:00+00:00" },
    { id: "b", at: "2026-08-25T18:45:00+00:00" },
    { id: "c", at: "2026-08-25T06:05:00+00:00" },
    { id: "d", at: "2026-08-23T18:30:00+00:00" },
  ];

  it("bands an ordered list by Paris day", () => {
    const groups = byDay(rows, (r) => r.at);
    expect(groups.map((g) => g.key)).toEqual(["2026-08-29", "2026-08-25", "2026-08-23"]);
    expect(groups[1].rows.map((r) => r.id)).toEqual(["b", "c"]);
  });

  // ⚑ 22:30 UTC on the 24th is 00:30 on the 25th in Paris. A day band keyed on
  // the viewer's own timezone would put it under the wrong heading, and the row
  // would then contradict the time printed beside it.
  it("bands on the Paris calendar date, not UTC", () => {
    const groups = byDay([{ id: "x", at: "2026-08-24T22:30:00+00:00" }], (r) => r.at);
    expect(groups[0].key).toBe("2026-08-25");
  });

  it("keeps the caller's order, repeating a band rather than reuniting rows", () => {
    const scrambled = [rows[0], rows[3], rows[1]];
    const groups = byDay(scrambled, (r) => r.at);
    expect(groups.map((g) => g.key)).toEqual(["2026-08-29", "2026-08-23", "2026-08-25"]);
  });

  it("has nothing to say about an empty list", () => {
    expect(byDay([], (r: { at: string }) => r.at)).toEqual([]);
  });

  // ⚑ THE LIVE PAGE IS WHAT FORCED THIS. A hotel posts about one trip a day, so
  // day bands over its own 42 trips rendered forty-two one-row bands — worse
  // than the flat list they replaced. The whole marketplace on one page runs
  // ~3 trips a day, where a day band groups properly.
  it("bands by month when a day would hold one row", () => {
    const groups = byDay(rows, (r) => r.at, "month");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-08");
    expect(groups[0].rows).toHaveLength(4);
  });

  it("keys a month on the Paris calendar too", () => {
    // 23:30 UTC on 31 July is 01:30 on 1 August in Paris — a different month.
    expect(bandKey("2026-07-31T23:30:00+00:00", "month")).toBe("2026-08");
    expect(bandKey("2026-07-31T12:00:00+00:00", "month")).toBe("2026-07");
  });
});

describe("pageWindow", () => {
  it("defaults to the first page", () => {
    expect(pageWindow(undefined, 40)).toEqual({ page: 0, from: 0, to: 39 });
  });

  it("reads a page number into PostgREST range bounds", () => {
    expect(pageWindow("2", 40)).toEqual({ page: 2, from: 80, to: 119 });
  });

  // A URL is user input; every one of these must land on page 0 rather than
  // producing a NaN range that PostgREST answers with nothing.
  it.each(["-1", "abc", "1.9", "", "Infinity"])("clamps %o to a real page", (raw) => {
    const w = pageWindow(raw, 40);
    expect(Number.isInteger(w.from)).toBe(true);
    expect(w.from).toBeGreaterThanOrEqual(0);
    expect(w.to).toBeGreaterThanOrEqual(w.from);
  });
});

describe("pageNote — what a capped list admits about itself", () => {
  it("says nothing when everything fits", () => {
    expect(pageNote(42, pageWindow(undefined, 60), 60)).toBeNull();
    expect(pageNote(0, pageWindow(undefined, 40), 40)).toBeNull();
  });

  it("names what it is not showing on the first page", () => {
    expect(pageNote(42, pageWindow(undefined, 40), 40)).toEqual({
      says: "Newest 40 of 42",
      older: 1,
      newer: null,
    });
  });

  it("counts the window on a later page", () => {
    expect(pageNote(42, pageWindow("1", 40), 40)).toEqual({
      says: "41–42 of 42",
      older: null,
      newer: 0,
    });
  });

  it("offers both directions in the middle of a long list", () => {
    expect(pageNote(348, pageWindow("2", 40), 40)).toEqual({
      says: "81–120 of 348",
      older: 3,
      newer: 1,
    });
  });

  // ⚑ A page past the end must not print "361–360 of 348".
  it("does not run past the total on an over-shot page", () => {
    const note = pageNote(348, pageWindow("9", 40), 40);
    expect(note?.says).toBe("348–348 of 348");
    expect(note?.older).toBeNull();
  });
});

describe("tallyActivity + activitySays — is this Driver working?", () => {
  const m = (over: Partial<HeldMission>): HeldMission => ({
    driver_id: "d1",
    status: "completed",
    pickup_at: "2026-08-01T10:00:00+00:00",
    ...over,
  });

  it("counts held and finished separately, and dates the last finished one", () => {
    const tally = tallyActivity([
      m({ pickup_at: "2026-08-25T10:00:00+00:00" }),
      m({ pickup_at: "2026-08-10T10:00:00+00:00" }),
      m({ status: "cancelled", pickup_at: "2026-08-30T10:00:00+00:00" }),
    ]);
    expect(tally.get("d1")).toEqual({
      held: 3,
      done: 2,
      lastDoneAt: "2026-08-25T10:00:00+00:00",
    });
  });

  // ⚑ A cancelled trip in the future must not become "last worked".
  it("dates the last COMPLETED trip, not the last held one", () => {
    const tally = tallyActivity([
      m({ pickup_at: "2026-07-01T10:00:00+00:00" }),
      m({ status: "expired", pickup_at: "2026-12-01T10:00:00+00:00" }),
    ]);
    expect(tally.get("d1")?.lastDoneAt).toBe("2026-07-01T10:00:00+00:00");
  });

  it("ignores a mission with no Driver", () => {
    expect(tallyActivity([m({ driver_id: null })]).size).toBe(0);
  });

  it("names a Driver who has never held a trip", () => {
    expect(activitySays(undefined)).toEqual({
      text: "never taken a trip",
      on: null,
      idle: true,
    });
  });

  // ⚑ Nobody in the fleet is in this state today. That is exactly why it is
  // written now: "0 trips" would hide the interesting half — they took work.
  it("separates 'took work and finished none' from 'never took any'", () => {
    const tally = tallyActivity([m({ status: "cancelled" }), m({ status: "expired" })]);
    expect(activitySays(tally.get("d1"))).toEqual({
      text: "held 2, none finished",
      on: null,
      idle: true,
    });
  });

  it("reads as a working Driver once one trip is finished", () => {
    const tally = tallyActivity([m({ pickup_at: "2026-08-25T10:00:00+00:00" })]);
    expect(activitySays(tally.get("d1"))).toEqual({
      text: "1 trip · last",
      on: "2026-08-25T10:00:00+00:00",
      idle: false,
    });
  });

  it("pluralises", () => {
    const tally = tallyActivity([m({}), m({ pickup_at: "2026-08-02T10:00:00+00:00" })]);
    expect(activitySays(tally.get("d1")).text).toBe("2 trips · last");
  });
});
