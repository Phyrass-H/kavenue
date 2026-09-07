// The first drive — the one trip per Driver worth a phone call.
//
// ⚑ THE PROPERTY THAT MATTERS MOST IS WHICH TRIP GETS CALLED "FIRST". Two live
// Drivers (Inès Lefranc, Amine Belkacem) have a CANCELLED trip earlier than the
// one they actually drove. Counting it would name the wrong date, the wrong
// route and the wrong hotel — and the founder would ring a hotel about a trip
// that never happened.
import { describe, expect, it } from "vitest";
import {
  firstTrips,
  routeOf,
  atLabel,
  DROVE,
  DROVE_STATUSES,
  RECENT_DAYS,
  type FirstTripDriver,
  type FirstTripMission,
  type FirstTripBusiness,
} from "@/lib/first-trips";
import type { MissionStatus } from "@/lib/database.types";

const NOW = new Date("2026-09-07T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const driver = (over: Partial<FirstTripDriver> = {}): FirstTripDriver => ({
  id: "dr-1",
  first_name: "Marc",
  last_name: "Fontaine",
  phone: "+33 6 43 53 98 83",
  created_at: days(-120),
  verified: true,
  ...over,
});

const mission = (over: Partial<FirstTripMission> = {}): FirstTripMission => ({
  id: "m-1",
  driver_id: "dr-1",
  status: "completed",
  pickup_at: days(-1),
  pickup_label: "Hôtel Majestic, Cannes",
  dropoff_label: "Nice Airport, T2",
  pickup_address: null,
  dropoff_address: null,
  business_id: "biz-1",
  ...over,
});

const business = (over: Partial<FirstTripBusiness> = {}): FirstTripBusiness => ({
  id: "biz-1",
  name: "Hôtel Majestic Cannes",
  reception_phone: "+33 4 92 98 77 00",
  ...over,
});

describe("which trip counts as the first", () => {
  it("skips a cancelled trip and names the one they actually drove", () => {
    const f = firstTrips(
      [driver()],
      [
        mission({ id: "cancelled-one", status: "cancelled", pickup_at: days(-3) }),
        mission({ id: "the-real-one", status: "completed", pickup_at: days(-1) }),
      ],
      [business()],
      NOW,
    );
    expect(f.trips.map((t) => t.tripId)).toEqual(["the-real-one"]);
  });

  it("takes the earliest, whatever order the rows arrive in", () => {
    const f = firstTrips(
      [driver()],
      [
        mission({ id: "later", pickup_at: days(-1) }),
        mission({ id: "earliest", pickup_at: days(-5) }),
        mission({ id: "middle", pickup_at: days(-3) }),
      ],
      [business()],
      NOW,
    );
    expect(f.trips[0].tripId).toBe("earliest");
  });

  it("counts a trip that has not happened yet — accepted is a first drive too", () => {
    const f = firstTrips([driver()], [mission({ status: "accepted", pickup_at: days(2) })], [business()], NOW);
    expect(f.trips[0].when).toBe("upcoming");
    expect(f.trips[0].whenLabel).toBe("in 2 days");
  });

  it("a Driver whose ONLY trip was cancelled has never driven", () => {
    const f = firstTrips([driver()], [mission({ status: "cancelled" })], [business()], NOW);
    expect(f.trips).toEqual([]);
    expect(f.neverDriven.map((d) => d.driverId)).toEqual(["dr-1"]);
  });
});

describe("the window", () => {
  // ⚑ THIS TEST EXISTS BECAUSE THE OTHERS IN HERE CANNOT CATCH A CHANGED WINDOW.
  // They are written as `RECENT_DAYS ± 1`, so they pass for ANY value of the
  // constant — they prove the comparison works, not that the number is right.
  // Widening 7 to 200 left every one of them green. The seven days is a decision
  // taken with the founder on 2026-09-06 (a two-day window loses a Friday trip
  // over the weekend), so it is pinned in absolute days, here, on purpose.
  it("is seven days — the number agreed with the founder, not two and not a month", () => {
    expect(RECENT_DAYS).toBe(7);
    const out = (n: number) =>
      firstTrips([driver()], [mission({ pickup_at: days(-n) })], [business()], NOW).trips.length;
    expect(out(6)).toBe(1);
    expect(out(8)).toBe(0);
  });

  it("drops a first trip older than the window, and counts it as settled", () => {
    const f = firstTrips([driver()], [mission({ pickup_at: days(-(RECENT_DAYS + 1)) })], [business()], NOW);
    expect(f.trips).toEqual([]);
    expect(f.neverDriven).toEqual([]);
    expect(f.settled).toBe(1);
  });

  it("keeps one inside the window", () => {
    const f = firstTrips([driver()], [mission({ pickup_at: days(-(RECENT_DAYS - 1)) })], [business()], NOW);
    expect(f.trips).toHaveLength(1);
    expect(f.settled).toBe(0);
  });

  it("never drops an upcoming trip, however far out", () => {
    const f = firstTrips([driver()], [mission({ status: "confirmed", pickup_at: days(90) })], [business()], NOW);
    expect(f.trips).toHaveLength(1);
  });
});

describe("the order the founder reads them in", () => {
  it("upcoming soonest-first, then the ones that just ran, newest-first", () => {
    const f = firstTrips(
      [
        driver({ id: "a" }),
        driver({ id: "b" }),
        driver({ id: "c" }),
        driver({ id: "d" }),
      ],
      [
        mission({ id: "ran-old", driver_id: "a", pickup_at: days(-5) }),
        mission({ id: "soon", driver_id: "b", status: "confirmed", pickup_at: days(1) }),
        mission({ id: "ran-new", driver_id: "c", pickup_at: days(-1) }),
        mission({ id: "later", driver_id: "d", status: "confirmed", pickup_at: days(6) }),
      ],
      [business()],
      NOW,
    );
    expect(f.trips.map((t) => t.tripId)).toEqual(["soon", "later", "ran-new", "ran-old"]);
  });

  it("the longest-waiting Driver who has never driven comes first", () => {
    const f = firstTrips(
      [
        driver({ id: "new", created_at: days(-2) }),
        driver({ id: "old", created_at: days(-40) }),
      ],
      [],
      [],
      NOW,
    );
    expect(f.neverDriven.map((d) => d.driverId)).toEqual(["old", "new"]);
    expect(f.neverDriven[0].waited).toBe("40 days");
  });
});

describe("both numbers reach the row", () => {
  it("carries the Driver's and the Business's phone", () => {
    const [t] = firstTrips([driver()], [mission()], [business()], NOW).trips;
    expect(t.driverPhone).toBe("+33 6 43 53 98 83");
    expect(t.businessPhone).toBe("+33 4 92 98 77 00");
    expect(t.businessName).toBe("Hôtel Majestic Cannes");
  });

  it("survives a Business that is not in the list rather than dropping the row", () => {
    const [t] = firstTrips([driver()], [mission({ business_id: "gone" })], [business()], NOW).trips;
    expect(t.businessName).toBeNull();
    expect(t.businessPhone).toBeNull();
    expect(t.driverPhone).toBe("+33 6 43 53 98 83");
  });
});

describe("the route", () => {
  it("uses the labels when there are labels", () => {
    expect(routeOf(mission())).toBe("Hôtel Majestic, Cannes → Nice Airport, T2");
  });

  // ⚑ The live seeded trips carry NO labels and DO carry addresses — the first
  // trip of Demo Driver is one. Falling back to the moment (what tripLabel does)
  // would print a date the row already shows, twice.
  it("falls back to the address when the labels are missing", () => {
    expect(
      routeOf(
        mission({
          pickup_label: null,
          dropoff_label: null,
          pickup_address: "Hôtel Negresco, 37 Prom. des Anglais, 06000 Nice, France",
          dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 2, 06206 Nice, France",
        }),
      ),
      // ⚑ No trailing ", Nice" on the airport: shortPlaceLabel drops a town the
      //   name already carries, which is why both halves read cleanly here.
    ).toBe("Hôtel Negresco, Nice → Aéroport Nice Côte d'Azur");
  });

  it("says so rather than rendering an empty arrow", () => {
    expect(
      routeOf(mission({ pickup_label: "  ", dropoff_label: null, pickup_address: null, dropoff_address: null })),
    ).toBe("no route on file");
  });
});

describe("what counts as having driven", () => {
  // ⚑ The map is the guard: adding a MissionStatus without saying which side it
  // falls on is a compile error. This asserts the two that must never flip.
  it("cancelled and expired are not drives; completed and accepted are", () => {
    expect(DROVE.cancelled).toBe(false);
    expect(DROVE.expired).toBe(false);
    expect(DROVE.completed).toBe(true);
    expect(DROVE.accepted).toBe(true);
  });

  it("the read's status list is derived from the map, so it cannot drift", () => {
    const expected = (Object.keys(DROVE) as MissionStatus[]).filter((s) => DROVE[s]);
    expect(DROVE_STATUSES).toEqual(expected);
    expect(DROVE_STATUSES).not.toContain("cancelled");
  });
});

describe("the moment itself", () => {
  it("reads in English, in Paris time", () => {
    // ⚑ 17:20 UTC is 19:20 in Paris, and en-GB abbreviates September to "Sept"
    // — the same spelling the rest of the console already prints.
    expect(atLabel("2026-09-01T17:20:00Z")).toBe("Tue 1 Sept, 19:20");
  });

  it("does not crash on a date that isn't one", () => {
    expect(atLabel("not-a-date")).toBe("undated");
  });
});
