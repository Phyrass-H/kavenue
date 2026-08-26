// The named checks behind Activity's "Worth a look".
//
// ⚑ THE TWO PROPERTIES THAT MATTER MOST ARE ABOUT WHAT IS *NOT* SAID.
//   1. Silence. A snapshot with nothing wrong produces an empty list — no "0
//      problems" row, no green ticks. A findings screen that always has content
//      is a screen nobody reads.
//   2. Every finding names its subject. The founder rejected roll-up counts
//      twice; a finding whose `subject` is blank, or whose sentence is a bare
//      number, is the thing being guarded against.
import { describe, expect, it } from "vitest";
import {
  findings,
  quietChecks,
  tripLabel,
  CHECKS,
  type ActivitySnapshot,
  type FindingId,
} from "@/lib/activity-findings";

function snapshot(over: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
  return {
    pooled: [],
    drivers: [],
    cancelledWithoutRecord: [],
    passedAround: [],
    orphanedEvents: 0,
    ...over,
  };
}

const driver = (over: Partial<ActivitySnapshot["drivers"][number]> = {}) => ({
  id: "dr-1",
  first_name: "Marc",
  last_name: "Fontaine",
  base_lat: 43.7 as number | null,
  base_lng: 7.26 as number | null,
  verified: true,
  ...over,
});

const pooledTrip = (over: Partial<ActivitySnapshot["pooled"][number]> = {}) => ({
  mission: {
    id: "m-1",
    pickup_at: "2026-08-27T18:54:00+02:00",
    pickup_label: "Cannes",
    dropoff_label: "Antibes",
    category: "eco" as const,
  },
  takers: 3,
  reason: null,
  ...over,
});

describe("silent by default", () => {
  it("a healthy fleet produces nothing at all", () => {
    expect(findings(snapshot({ drivers: [driver()], pooled: [pooledTrip()] }))).toEqual([]);
  });

  it("no check invents a subject or a count when it has nothing to report", () => {
    expect(findings(snapshot())).toHaveLength(0);
  });
});

describe("every check is described where it is declared", () => {
  it("has a plain-English `looksFor` for every id", () => {
    for (const id of Object.keys(CHECKS) as FindingId[]) {
      expect(CHECKS[id].looksFor.length).toBeGreaterThan(20);
      expect(CHECKS[id].looksFor.endsWith(".")).toBe(true);
    }
  });
});

describe("a trip nobody can take", () => {
  it("names the trip and carries the reason through", () => {
    const f = findings(
      snapshot({
        pooled: [
          pooledTrip({ takers: 0, reason: "your only Eco Driver has never set a base" }),
        ],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].id).toBe("trip_nobody_can_take");
    expect(f[0].tone).toBe("attention");
    expect(f[0].sentence).toBe(
      "Nobody in the fleet can take Cannes → Antibes — your only Eco Driver has never set a base.",
    );
    expect(f[0].href).toBe("/admin/trips/m-1");
  });

  it("stays silent for a trip that has takers", () => {
    expect(findings(snapshot({ pooled: [pooledTrip({ takers: 1 })] }))).toEqual([]);
  });

  it("still says something useful when the reason is unknown", () => {
    const f = findings(snapshot({ pooled: [pooledTrip({ takers: 0 })] }));
    expect(f[0].sentence).toBe("Nobody in the fleet can take Cannes → Antibes.");
  });

  // ⚑ Two of the three trips in the live Pool were seeded and carry no route
  // labels at all. Both findings read "A pooled trip" and identified neither.
  it("names the moment when the trip has no route to name", () => {
    const f = findings(
      snapshot({
        pooled: [
          pooledTrip({
            takers: 0,
            mission: {
              id: "m-2",
              pickup_at: "2026-08-27T18:54:00+02:00",
              pickup_label: null,
              dropoff_label: null,
              category: "eco",
            },
          }),
        ],
      }),
    );
    expect(f[0].sentence).toBe("Nobody in the fleet can take the 27 Aug, 18:54 trip.");
  });
});

describe("Drivers", () => {
  it("emits one finding per Driver with no base — never one counting them", () => {
    const f = findings(
      snapshot({
        drivers: [
          driver({ id: "a", first_name: "Marc", base_lat: null, base_lng: null }),
          driver({ id: "b", first_name: "Sofia", base_lat: null, base_lng: null }),
          driver({ id: "c", first_name: "Demo" }),
        ],
      }),
    );
    expect(f).toHaveLength(2);
    expect(f.map((x) => x.subject)).toEqual(["Marc Fontaine", "Sofia Fontaine"]);
    expect(f[0].sentence).toBe(
      "Marc Fontaine has never set a base, so their Pool has always been empty.",
    );
  });

  it("an unverified Driver is reported, and the sentence says it changes nothing", () => {
    const f = findings(snapshot({ drivers: [driver({ verified: false })] }));
    expect(f[0].id).toBe("driver_unverified");
    expect(f[0].sentence).toBe("Marc Fontaine isn’t verified, and can accept work anyway.");
  });
});

describe("trips", () => {
  // ⚑ ONE SENTENCE, NOT ONE ROW PER TRIP — and this is the one check where that
  // is right. The first live run printed 23 named rows, which read as a wall of
  // work; every one of them pre-dates the recording and can never be filled in,
  // so there is nothing to do trip by trip. Naming them would dress up closed
  // history as a to-do list. Contrast the Drivers above, where each name IS an
  // action someone can take.
  it("collapses the unfillable history into one quiet sentence", () => {
    const f = findings(
      snapshot({
        cancelledWithoutRecord: [
          { id: "m-9", pickup_label: "Nice", dropoff_label: "Monaco", cancelled_at: null },
          { id: "m-8", pickup_label: "Nice", dropoff_label: "Cannes", cancelled_at: null },
        ],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].tone).toBe("quiet");
    expect(f[0].sentence).toBe(
      "2 cancelled trips don’t say who cancelled them, or why — they pre-date the recording and can’t be filled in.",
    );
  });

  it("reads correctly when only one is left — the number only ever shrinks", () => {
    const f = findings(
      snapshot({
        cancelledWithoutRecord: [
          { id: "m-9", pickup_label: "Nice", dropoff_label: "Monaco", cancelled_at: null },
        ],
      }),
    );
    expect(f[0].sentence).toBe(
      "1 cancelled trip doesn’t say who cancelled it, or why — they pre-date the recording and can’t be filled in.",
    );
  });

  it("a passed-around trip says how many times", () => {
    const f = findings(
      snapshot({ passedAround: [{ id: "m-3", label: "Nice → Cannes", times: 3 }] }),
    );
    expect(f[0].sentence).toBe("Nice → Cannes has been taken and given back 3 times.");
  });
});

describe("the orphaned log entries", () => {
  // The one check with no named subject, because the subject was deleted.
  it("reads quietly and has nowhere to click", () => {
    const f = findings(snapshot({ orphanedEvents: 431 }));
    expect(f[0].tone).toBe("quiet");
    expect(f[0].href).toBeNull();
    expect(f[0].sentence).toContain("431");
  });

  it("says nothing when the log is clean", () => {
    expect(findings(snapshot({ orphanedEvents: 0 }))).toEqual([]);
  });
});

describe("ordering — what is broken now comes first", () => {
  it("puts attention above watch above quiet", () => {
    const f = findings(
      snapshot({
        pooled: [pooledTrip({ takers: 0 })],
        drivers: [driver({ verified: false, base_lat: null, base_lng: null })],
        orphanedEvents: 5,
      }),
    );
    expect(f.map((x) => x.tone)).toEqual(["attention", "attention", "watch", "quiet"]);
  });
});

describe("every finding is uniquely identified", () => {
  // ⚑ THE LIVE DATA HAS FOUR TRIPS CALLED "Le Grand Hôtel → Monaco". Keying a
  // list on the subject made React warn that rows "may be duplicated and/or
  // omitted" — a findings screen that silently drops a finding is the one
  // failure it cannot have.
  it("gives colliding subjects distinct keys", () => {
    const same = { pickup_label: "Le Grand Hôtel", dropoff_label: "Monaco" };
    const f = findings(
      snapshot({
        passedAround: [
          { id: "m-1", label: "Le Grand Hôtel → Monaco", times: 2 },
          { id: "m-2", label: "Le Grand Hôtel → Monaco", times: 3 },
        ],
        pooled: [
          pooledTrip({ takers: 0, mission: { ...pooledTrip().mission, id: "p-1", ...same } }),
          pooledTrip({ takers: 0, mission: { ...pooledTrip().mission, id: "p-2", ...same } }),
        ],
      }),
    );
    const keys = f.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(f.filter((x) => x.subject === "Le Grand Hôtel → Monaco")).toHaveLength(4);
  });

  it("keys are namespaced by check, so two checks on one subject never collide", () => {
    const f = findings(
      snapshot({ drivers: [driver({ id: "dr-9", verified: false, base_lat: null, base_lng: null })] }),
    );
    expect(f.map((x) => x.key)).toEqual([
      "driver_without_base:dr-9",
      "driver_unverified:dr-9",
    ]);
  });
});

describe("the quiet footer", () => {
  it("only names checks that actually ran and found nothing", () => {
    const s = snapshot({ drivers: [driver()], pooled: [pooledTrip()] });
    expect(quietChecks(s, findings(s))).toEqual([
      "no trip has been taken and given back twice",
      "every Driver is verified",
      "every trip in the Pool has someone who could take it",
    ]);
  });

  it("drops a line the moment its check fires", () => {
    const s = snapshot({ drivers: [driver({ verified: false })] });
    expect(quietChecks(s, findings(s))).not.toContain("every Driver is verified");
  });

  it("never claims the Pool is healthy when the Pool is empty", () => {
    const s = snapshot({ drivers: [driver()] });
    expect(quietChecks(s, findings(s))).not.toContain(
      "every trip in the Pool has someone who could take it",
    );
  });
});

describe("tripLabel", () => {
  it("uses both ends when it has them", () => {
    expect(tripLabel({ pickup_label: "Nice", dropoff_label: "Cannes" })).toBe("Nice → Cannes");
  });

  it("falls back to whichever end it has", () => {
    expect(tripLabel({ pickup_label: "Nice", dropoff_label: null })).toBe("Nice");
    expect(tripLabel({ pickup_label: null, dropoff_label: "Cannes" })).toBe("Cannes");
  });

  // ⚑ The three trips in the live Pool have NO labels at all — they were seeded.
  it("never renders an empty string", () => {
    expect(tripLabel({ pickup_label: null, dropoff_label: null })).toBe("this trip");
    expect(tripLabel({ pickup_label: "  ", dropoff_label: null }, "A pooled trip")).toBe(
      "A pooled trip",
    );
  });
});
