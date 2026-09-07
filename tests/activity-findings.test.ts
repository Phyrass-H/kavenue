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
  FEATURES,
  splitByUse,
  type ActivitySnapshot,
  type FindingId,
} from "@/lib/activity-findings";

function snapshot(over: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
  return {
    pooled: [],
    drivers: [],
    documentsWaiting: [],
    cancelledWithoutRecord: [],
    passedAround: [],
    neverUsed: [],
    uncountable: [],
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
  phone: "+33 6 00 00 00 00" as string | null,
  created_at: "2026-05-26T09:00:00Z",
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

describe("grouping is a decision each check makes", () => {
  // ⚑ The first live render collapsed two dead features into "2 shipped features
  // have never been used" over the raw table names `mission_release` and
  // `document`. Their sentences say completely different things; only checks
  // whose sentences are variations on one template may be grouped.
  it("the two absence checks never group", () => {
    expect(CHECKS.feature_never_used.groups).toBe(false);
    expect(CHECKS.orphaned_events.groups).toBe(false);
    expect(CHECKS.cancelled_without_record.groups).toBe(false);
  });

  it("the per-subject checks do", () => {
    expect(CHECKS.driver_without_base.groups).toBe(true);
    expect(CHECKS.driver_unverified.groups).toBe(true);
    expect(CHECKS.trip_nobody_can_take.groups).toBe(true);
    expect(CHECKS.trip_passed_around.groups).toBe(true);
  });

  it("a feature's subject is its name, never its table", () => {
    const f = findings(snapshot({ neverUsed: ["release_request", "driver_documents"] }));
    expect(f.map((x) => x.subject)).toEqual(["The release request", "Driver documents"]);
    expect(f.map((x) => x.subject).join()).not.toContain("_");
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

  // ⚑ THIS TEST USED TO ASSERT THE OPPOSITE, and the inversion is the change.
  // Until 2026-09-07 the sentence ended "and can accept work anyway", because the
  // flag decided nothing. It is now the door: accept_mission and place_hold both
  // refuse an unverified Driver, so the finding reports someone who cannot earn.
  it("an unverified Driver is reported, and the sentence says what it costs them", () => {
    const f = findings(snapshot({ drivers: [driver({ verified: false })] }));
    expect(f[0].id).toBe("driver_unverified");
    expect(f[0].sentence).toBe("Marc Fontaine isn’t verified, so they can’t take any work.");
  });

  it("and it interrupts — it stopped being a footnote when it started refusing work", () => {
    expect(CHECKS.driver_unverified.tone).toBe("attention");
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
    // Every finding that can be proved must say where the proof is.
    expect(f[0].href).toBe("/admin/trips?flag=no-cancellation-record");
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

describe("a feature nobody has ever used", () => {
  // ⚑ The founder's own example of a check worth having. It says something no
  // status count can: the feature is shipped and dead.
  it("names the feature in words, not the table", () => {
    const f = findings(snapshot({ neverUsed: ["release_request"] }));
    expect(f).toHaveLength(1);
    expect(f[0].id).toBe("feature_never_used");
    expect(f[0].sentence).toBe(
      "No Driver has ever asked a Business to let them out of a trip — the release request has never been used once.",
    );
  });

  it("has nowhere to click, because the proof is an absence", () => {
    expect(findings(snapshot({ neverUsed: ["driver_documents"] }))[0].href).toBeNull();
  });

  it("is silent once a feature has been used", () => {
    expect(findings(snapshot({ neverUsed: [] }))).toEqual([]);
  });

  it("every tracked feature reads as a sentence, and names its own table", () => {
    for (const id of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
      expect(FEATURES[id].sentence).toMatch(/^[A-Z].*\.$/);
      expect(FEATURES[id].table).not.toContain(" ");
    }
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
        neverUsed: ["release_request"],
        orphanedEvents: 5,
      }),
    );
    expect(f.map((x) => x.tone)).toEqual([
      // ⚑ THREE attentions now, not two: driver_unverified was promoted from
      // `watch` on 2026-09-07 when the flag began refusing work.
      "attention",
      "attention",
      "attention",
      "watch",
      "quiet",
    ]);
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

describe("documents waiting on you", () => {
  // The live case this was built for: Amine Belkacem filed a licence and a VTC
  // card on 29 July 2026 and nobody looked at either for 40 days, because the
  // review screen existed and nothing on the console pointed at it.
  const NOW = new Date("2026-09-07T12:00:00Z");
  const filed = (daysAgo: number) =>
    new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

  const waiting = (over: Partial<ActivitySnapshot["documentsWaiting"][number]> = {}) => ({
    driverId: "dr-1",
    count: 2,
    oldestUploadedAt: filed(40),
    ...over,
  });

  it("names the Driver and how long they have been waiting", () => {
    const [f] = findings(
      snapshot({ drivers: [driver({ id: "dr-1", first_name: "Amine", last_name: "Belkacem" })], documentsWaiting: [waiting()] }),
      NOW,
    );
    expect(f.id).toBe("documents_waiting");
    expect(f.subject).toBe("Amine Belkacem");
    expect(f.sentence).toBe(
      "Amine Belkacem has 2 documents waiting for you — the oldest filed 40 days ago.",
    );
    expect(f.href).toBe("/admin/drivers/dr-1");
  });

  // ⚑ "the oldest" is a claim about more than one thing. With a single document
  // it would be a small lie, and this screen's whole worth is that its sentences
  // are exactly true.
  it("drops “the oldest” when there is only one document", () => {
    const [f] = findings(
      snapshot({ drivers: [driver({ id: "dr-1" })], documentsWaiting: [waiting({ count: 1 })] }),
      NOW,
    );
    expect(f.sentence).toBe("Marc Fontaine has a document waiting for you — filed 40 days ago.");
  });

  it("says hours, not “0 days”, for something filed this morning", () => {
    const [f] = findings(
      snapshot({ drivers: [driver({ id: "dr-1" })], documentsWaiting: [waiting({ count: 1, oldestUploadedAt: filed(0.25) })] }),
      NOW,
    );
    expect(f.sentence).toContain("filed 6 hours ago");
  });

  it("is silent when nothing is pending", () => {
    expect(findings(snapshot({ drivers: [driver()] }), NOW)).toEqual([]);
  });

  it("groups, so three Drivers read as one line with three names", () => {
    expect(CHECKS.documents_waiting.groups).toBe(true);
    expect(CHECKS.documents_waiting.tone).toBe("attention");
  });

  // Defensive: the read already drops documents whose Driver is gone, because
  // document.owner_id has no foreign key. The sentence must still be a sentence
  // if one ever slips through.
  it("does not render a blank subject for a Driver it cannot name", () => {
    const [f] = findings(snapshot({ documentsWaiting: [waiting({ driverId: "ghost" })] }), NOW);
    expect(f.subject).toBe("A Driver");
    expect(f.sentence).not.toContain("undefined");
  });
});

describe("a count that never came back is not a count of zero", () => {
  // ⚑ THE BUG THIS GUARDS, MEASURED NOT IMAGINED. PostgREST returns `count:
  // null` for "the table is empty" AND for "you may not ask" — and the refusal
  // carries an EMPTY error message, so it does not look like a failure at all.
  // On 2026-09-07 a `select=*` HEAD on `mission` came back 403/null for a
  // signed-in admin (S72 revoked `select (ceiling)` from `authenticated`). The
  // old code read `.then((r) => r.count ?? 0)`, which would have published
  // "nobody has ever filed a document" over 47 live documents.
  const ids = ["release_request", "driver_documents"] as const;

  it("an empty table is never used", () => {
    expect(splitByUse(ids, [{ count: 0, error: null }, { count: 3, error: null }])).toEqual({
      neverUsed: ["release_request"],
      uncountable: [],
    });
  });

  it("a REFUSED count is uncountable, not unused", () => {
    // The exact live shape: null count, 403, and an error whose message is "".
    expect(
      splitByUse(ids, [{ count: null, error: { message: "" } }, { count: 3, error: null }]),
    ).toEqual({ neverUsed: [], uncountable: ["release_request"] });
  });

  it("a null count with NO error is still not zero", () => {
    // ⚑ Belt and braces: `?? 0` did not need an error to do its damage. Any
    // absent number must fail closed, however innocent it looks.
    expect(splitByUse(ids, [{ count: null, error: null }, { count: 3, error: null }])).toEqual({
      neverUsed: [],
      uncountable: ["release_request"],
    });
  });

  it("a missing reply cannot silently become zero either", () => {
    expect(splitByUse(ids, [{ count: 1, error: null }])).toEqual({
      neverUsed: [],
      uncountable: ["driver_documents"],
    });
  });

  it("a used feature is neither", () => {
    expect(splitByUse(ids, [{ count: 47, error: null }, { count: 3, error: null }])).toEqual({
      neverUsed: [],
      uncountable: [],
    });
  });
});

describe("a check that could not run says so", () => {
  it("renders its own quiet finding, not a “never used” one", () => {
    const f = findings(snapshot({ uncountable: ["driver_documents"] }));
    expect(f.map((x) => x.id)).toEqual(["feature_uncountable"]);
    expect(f[0].tone).toBe("quiet");
    expect(f[0].subject).toBe("Driver documents");
    expect(f[0].sentence).toBe(
      "Driver documents couldn’t be counted, so the “never used” check didn’t run for it.",
    );
  });

  // ⚑⚑ THE SECOND LIE, AND THE ONE THAT IS EASY TO MISS. Silencing the
  // "never used" finding is only half the job: the footer then ASSERTS the
  // opposite — "every shipped feature has been used at least once" — off the
  // very same missing number. A refusal must withhold both claims, not swap one
  // for the other.
  it("stops the footer claiming every feature HAS been used", () => {
    const s = snapshot({ drivers: [driver()], uncountable: ["driver_documents"] });
    expect(quietChecks(s, findings(s))).not.toContain(
      "every shipped feature has been used at least once",
    );
  });

  it("and the footer still says it when every count really did come back", () => {
    const s = snapshot({ drivers: [driver()] });
    expect(quietChecks(s, findings(s))).toContain(
      "every shipped feature has been used at least once",
    );
  });

  it("is silent when every count came back", () => {
    expect(findings(snapshot({ uncountable: [] }))).toEqual([]);
  });
});

describe("the quiet footer", () => {
  it("only names checks that actually ran and found nothing", () => {
    const s = snapshot({ drivers: [driver()], pooled: [pooledTrip()] });
    expect(quietChecks(s, findings(s))).toEqual([
      "no trip has been taken and given back twice",
      "every Driver is verified and can work",
      "no Driver is waiting on you to look at a document",
      "every shipped feature has been used at least once",
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
