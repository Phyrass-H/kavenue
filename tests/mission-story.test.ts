// One trip's story, in order, in plain words.
//
// ⚑ THE FIRST TEST HERE IS THE IMPORTANT ONE. The live log genuinely holds a
// trip whose `en_route` row sits at a LOWER `seq` than its `created` row, six
// weeks earlier — the backfill inserted one table at a time. Anything that
// renders the log in insertion order tells the founder a trip was driven before
// it was booked. That is not a hypothetical: it is what a naive read of the
// current database produces.
import { describe, expect, it } from "vitest";
import { missionStory, approxCount, PHRASES } from "@/lib/mission-story";
import { TRIGGER_EVENTS, APP_EVENTS, type MissionEventRow } from "@/lib/mission-events";

function ev(over: Partial<MissionEventRow> = {}): MissionEventRow {
  return {
    id: "e-1",
    seq: 1,
    mission_id: "m-1",
    business_id: "b-1",
    driver_id: null,
    event_type: "created",
    occurred_at: "2026-08-25T10:00:00+02:00",
    actor_kind: "dispatcher",
    actor_id: null,
    audience: ["business", "admin"],
    source: "db_trigger",
    payload: {},
    ...over,
  };
}

describe("order", () => {
  it("is by when it happened, not by when it was written", () => {
    // Exactly the shape in the live DB: the status backfill ran first (low seq),
    // the mission-row backfill second (high seq), describing an earlier moment.
    const story = missionStory([
      ev({ id: "a", seq: 1, event_type: "en_route", occurred_at: "2026-07-31T16:16:37+02:00" }),
      ev({ id: "b", seq: 5, event_type: "created", occurred_at: "2026-06-16T22:41:00+02:00" }),
      ev({ id: "c", seq: 6, event_type: "confirmed", occurred_at: "2026-07-25T18:53:00+02:00" }),
    ]);
    expect(story.map((s) => s.says)).toEqual(["Booked", "Confirmed", "On the way"]);
  });

  it("falls back to seq for events sharing one transaction", () => {
    const at = "2026-08-25T10:00:00+02:00";
    const story = missionStory([
      ev({ id: "b", seq: 2, event_type: "pooled", occurred_at: at }),
      ev({ id: "a", seq: 1, event_type: "created", occurred_at: at }),
    ]);
    expect(story.map((s) => s.says)).toEqual(["Booked", "Posted to the Pool"]);
  });
});

describe("every event in the vocabulary has a sentence", () => {
  // The compiler already enforces this via Record<MissionEventType, …>; this
  // asserts the sentences are for humans, not enum names in disguise.
  it.each([...TRIGGER_EVENTS, ...APP_EVENTS])("%s reads as English", (type) => {
    const phrase = PHRASES[type];
    expect(phrase.says).toBeTruthy();
    expect(phrase.says).not.toContain("_");
    expect(phrase.says[0]).toBe(phrase.says[0].toUpperCase());
  });
});

describe("a reconstructed time is never shown as an observed one", () => {
  it("carries the row's own caveat through, verbatim", () => {
    const [entry] = missionStory([
      ev({
        source: "mission_row_backfill",
        payload: { caveat: "created_at is RESET when a draft is posted" },
      }),
    ]);
    expect(entry.approxBecause).toBe("created_at is RESET when a draft is posted");
  });

  it("says the honest general thing when the row carries no caveat", () => {
    const [entry] = missionStory([ev({ source: "status_event_backfill", payload: {} })]);
    expect(entry.approxBecause).toContain("Reconstructed when the log was switched on");
  });

  it("leaves an observed row unmarked", () => {
    const [entry] = missionStory([ev({ source: "db_trigger" })]);
    expect(entry.approxBecause).toBeNull();
  });

  it("counts them for the footer", () => {
    const story = missionStory([
      ev({ id: "a", source: "mission_row_backfill", occurred_at: "2026-06-01T10:00:00+02:00" }),
      ev({ id: "b", source: "db_trigger", occurred_at: "2026-08-25T10:00:00+02:00" }),
      ev({ id: "c", source: "status_event_backfill", occurred_at: "2026-07-01T10:00:00+02:00" }),
    ]);
    expect(approxCount(story)).toBe(2);
  });
});

describe("an unknown event type is shown, never dropped", () => {
  it("prints itself and is flagged", () => {
    const [entry] = missionStory([ev({ event_type: "teleported" })]);
    expect(entry.says).toBe("teleported");
    expect(entry.unknown).toBe(true);
  });

  it("known types are not flagged", () => {
    expect(missionStory([ev()])[0].unknown).toBe(false);
  });
});

describe("the aside", () => {
  it("says which way the Driver answered", () => {
    expect(
      missionStory([ev({ event_type: "close_answered", payload: { answer: "driven" } })])[0].detail,
    ).toBe("the Driver says it happened");
    expect(
      missionStory([ev({ event_type: "close_answered", payload: { answer: "not_driven" } })])[0]
        .detail,
    ).toBe("the Driver says it didn’t happen");
  });

  it("names who cancelled, and what it cost", () => {
    const [entry] = missionStory([
      ev({ event_type: "cancelled", payload: { cancelled_by: "business", fee: 34.5 } }),
    ]);
    expect(entry.detail).toBe("by the hotel · 34,50 € charged");
  });

  it("a free cancellation says who, and nothing about money", () => {
    const [entry] = missionStory([
      ev({ event_type: "cancelled", payload: { cancelled_by: "driver", fee: 0 } }),
    ]);
    expect(entry.detail).toBe("by the Driver");
  });

  it("names the Driver who walked away from a re-post", () => {
    const [entry] = missionStory([
      ev({ event_type: "repooled", payload: { previous_driver_name: "Marc Dubois" } }),
    ]);
    expect(entry.detail).toBe("Marc Dubois walked away");
  });

  it("stays silent when the payload adds nothing", () => {
    expect(missionStory([ev({ event_type: "arrived" })])[0].detail).toBeNull();
    expect(missionStory([ev({ event_type: "cancelled", payload: {} })])[0].detail).toBeNull();
  });
});
