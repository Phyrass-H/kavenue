// S83 ([[d147]]) — raise the Ceiling / change the car on a trip still in the Pool.
//
// What must hold, whatever the jitter: a raise never lowers the price at any instant after it;
// the price keeps its place on the climb; the top of the climb never moves; a freeze happens
// exactly when the SQL (2026-09-18c) does it; and the "No car match" answer only ever reads the
// car and the reach. The SQL side is proven on a throw-away Postgres
// (.local/probe/pooled-trip-changes/run.sh, parity with ladderSteps included).
import { describe, expect, it } from "vitest";
import { ceilingReachedAt, currentFare, frozenStepCount, ladderSteps, type PdpInputs } from "@/lib/pdp";
import { canRaiseCeiling, priceChangesFrom, withNewOffer } from "@/lib/ceiling-raise";
import { nobodyFits, CAR_AND_REACH, type Fleet } from "@/lib/fleet-fit";
import { carKey } from "@/lib/trip-terms";
import { RULES } from "@/lib/eligibility";
import { mission } from "./fixtures";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PICKUP = Date.parse("2026-10-01T10:00:00Z");

function trip(over: Partial<PdpInputs> = {}): PdpInputs {
  return {
    id: "00000000-0000-4000-8000-000000000007",
    ceiling: 84.52,
    pdp_start: 27.35,
    speed_win: false,
    pickup_at: new Date(PICKUP).toISOString(),
    created_at: new Date(PICKUP - 72 * HOUR).toISOString(),
    pdp_step_count: null,
    ...over,
  };
}
const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("a raise never lowers the price", () => {
  it("at every instant after the raise, for many trips, gaps and raise sizes", () => {
    let checked = 0;
    for (const id of ids) {
      for (const raise of [0.01, 1, 2.5, 20, 60]) {
        for (const raisedAtH of [60, 30, 12, 6]) {
          const before = trip({ id });
          const at = new Date(PICKUP - raisedAtH * HOUR);
          const after = withNewOffer(before, { ceiling: before.ceiling + raise }, at);
          for (let h = raisedAtH; h >= 0.25; h -= 0.25) {
            const t = new Date(PICKUP - h * HOUR);
            expect(currentFare(after, t)).toBeGreaterThanOrEqual(currentFare(before, t));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(40_000);
  });

  it("…and WITHOUT the frozen step count it dips — the measured case the column exists for", () => {
    // Measured S83 on the real curve (2,5 M cases, ~1 raise in 8 dipped, worst €0,95): this one.
    const before = trip({ id: "00000000-0000-4000-8000-000000000355", ceiling: 130, pdp_start: 40 });
    const t = new Date(PICKUP - 5.5 * HOUR);
    expect(currentFare(before, t)).toBe(126.78);
    expect(currentFare({ ...before, ceiling: 131 }, t)).toBe(125.83); // the old redraw: DOWN
    const fixed = withNewOffer(before, { ceiling: 131 }, new Date(PICKUP - 6 * HOUR));
    expect(currentFare(fixed, t)).toBeGreaterThanOrEqual(126.78); // frozen steps: never down
  });

  it("two raises in a row keep the FIRST frozen count, so the second never dips either", () => {
    for (const id of ids) {
      const a = trip({ id });
      const b = withNewOffer(a, { ceiling: 100 }, new Date(PICKUP - 40 * HOUR));
      const c = withNewOffer(b, { ceiling: 131.33 }, new Date(PICKUP - 20 * HOUR));
      expect(c.pdp_step_count).toBe(b.pdp_step_count);
      for (let h = 20; h >= 0.5; h -= 0.5) {
        const t = new Date(PICKUP - h * HOUR);
        expect(currentFare(c, t)).toBeGreaterThanOrEqual(currentFare(b, t));
      }
    }
  });

  it("under SPEED WIN too (the opening rises with the Ceiling — founder, S83)", () => {
    for (const id of ids) {
      const before = trip({ id, speed_win: true });
      const at = new Date(PICKUP - 30 * HOUR);
      const after = withNewOffer(before, { ceiling: 120 }, at);
      for (let h = 30; h >= 0.5; h -= 0.5) {
        const t = new Date(PICKUP - h * HOUR);
        expect(currentFare(after, t)).toBeGreaterThanOrEqual(currentFare(before, t));
      }
    }
  });
});

describe("rule 3 — the same point on a taller climb", () => {
  it("keeps the fraction of the climb, to the cent", () => {
    for (const id of ids) {
      const before = trip({ id });
      const t = new Date(PICKUP - 24 * HOUR);
      const after = withNewOffer(before, { ceiling: 120 }, t);
      const s1 = (currentFare(before, t) - 27.35) / (84.52 - 27.35);
      const s2 = (currentFare(after, t) - 27.35) / (120 - 27.35);
      expect(Math.abs(s1 - s2)).toBeLessThan(0.01 / (84.52 - 27.35) + 1e-9);
    }
  });

  it("never moves the top of the climb", () => {
    const before = trip();
    const after = withNewOffer(before, { ceiling: 150 }, new Date(PICKUP - 20 * HOUR));
    expect(ceilingReachedAt(after)).toEqual(ceilingReachedAt(before));
    expect(currentFare(after, new Date(PICKUP - 5 * HOUR))).toBe(150);
  });

  it("does not move the opening on a normal trip", () => {
    const after = withNewOffer(trip(), { ceiling: 150 }, new Date(PICKUP - 70 * HOUR));
    expect(currentFare(after, new Date(PICKUP - 72 * HOUR))).toBe(27.35);
  });
});

describe("the freeze — exactly when the SQL does it", () => {
  it("freezes the count in force before the change", () => {
    expect(ladderSteps(trip())).toBe(29); // (84,52 − 27,35) / 2 → 28,585 → 29
    expect(frozenStepCount(trip(), new Date(PICKUP - 10 * HOUR))).toBe(29);
  });
  it("does not freeze before the climb opens (T−14 days)", () => {
    expect(frozenStepCount(trip(), new Date(PICKUP - 15 * DAY))).toBeNull();
  });
  it("does not freeze with no gap to protect", () => {
    expect(frozenStepCount(trip({ ceiling: 27.35 }), new Date(PICKUP - 10 * HOUR))).toBeNull();
  });
  it("keeps a count already frozen", () => {
    expect(frozenStepCount(trip({ pdp_step_count: 12 }), new Date(PICKUP - 10 * HOUR))).toBe(12);
  });
  it("leaves every never-changed trip's price exactly as it was (NULL = derived, as before)", () => {
    for (const id of ids) {
      const m = trip({ id });
      const same = { ...m, pdp_step_count: ladderSteps(m) };
      for (let h = 72; h >= 0; h -= 1.5) {
        const t = new Date(PICKUP - h * HOUR);
        expect(currentFare(same, t)).toBe(currentFare(m, t));
      }
    }
  });
});

describe("rule 2 — only while the trip is nobody's", () => {
  const m = { ...trip(), status: "pooled" as const, driver_id: null };
  const now = new Date(PICKUP - 10 * HOUR);
  it("a pooled trip ahead of its pickup can change", () => expect(canRaiseCeiling(m, now)).toBe(true));
  it("not once a Driver holds it", () =>
    expect(canRaiseCeiling({ ...m, status: "confirmed", driver_id: "d" }, now)).toBe(false));
  it("not during a Driver's live 15-second hold", () =>
    expect(canRaiseCeiling({ ...m, hold_expires_at: new Date(now.getTime() + 10_000).toISOString() }, now)).toBe(false));
  it("…but again once the hold's clock has run out", () =>
    expect(canRaiseCeiling({ ...m, hold_expires_at: new Date(now.getTime() - 1_000).toISOString() }, now)).toBe(true));
  it("not after the pickup time", () => expect(canRaiseCeiling(m, new Date(PICKUP + 1))).toBe(false));
});

describe("the history line (rule 4: who, from, to, when)", () => {
  const names = new Map([["disp-1", "Camille Martin"]]);
  const label = (c: string, b: string | null) => `${c === "luxury" ? "First" : c === "eco" ? "Eco" : "Business"} · ${b === "van" ? "Van" : b === "sedan" ? "Sedan" : "Any body"}`;
  const briefs = priceChangesFrom(
    [
      { occurred_at: "2026-09-18T10:00:00Z", event_type: "ceiling_raised", actor_kind: "dispatcher", actor_id: "disp-1",
        payload: { all_in_from: 97.2, all_in_to: 115 } },
      { occurred_at: "2026-09-18T11:00:00Z", event_type: "trip_car_changed", actor_kind: "dispatcher", actor_id: "disp-1",
        payload: { all_in_from: 115, all_in_to: 172.5,
                   from: { category: "business", required_body_type: "sedan" },
                   to: { category: "luxury", required_body_type: "sedan", required_make: "BMW", required_model: "Série 7" } } },
      { occurred_at: "2026-09-18T12:00:00Z", event_type: "price_terms_changed", actor_kind: "unknown", actor_id: null,
        payload: { all_in_from: 172.5, all_in_to: 172.5 } },
    ],
    names,
    label,
  );
  it("newest first", () => expect(briefs.map((b) => b.kind)).toEqual(["other", "car", "raise"]));
  it("names the Dispatcher, and says Kavenue for an admin or system change", () =>
    expect(briefs.map((b) => b.by)).toEqual(["Kavenue", "Camille Martin", "Camille Martin"]));
  it("carries the Business's all-in amounts", () => expect([briefs[2].from, briefs[2].to]).toEqual([97.2, 115]));
  it("says which car it was and which it is", () => {
    expect(briefs[1].carFrom).toBe("Business · Sedan");
    expect(briefs[1].carTo).toBe("First · Sedan · BMW Série 7");
  });
});

describe("No car match — the car and the reach, never the hour", () => {
  const NOW = new Date("2026-07-15T09:00:00+02:00");
  const m = mission({ required_body_type: null }); // the eligibility fixture's trip, Nice
  const driver = {
    first_name: "Marc", last_name: "Fontaine", accepts_luggage_runs: false,
    base_lat: 43.7, base_lng: 7.26, base_label: "Nice", service_radius_km: 50, verified: true,
    operational_zones: ["Nice"],
  };
  const fits = (over: Partial<Fleet[number]> = {}): Fleet => [
    { driver, vehicle: { category: "business", body_type: "sedan", make: "Mercedes", model: "Classe E" }, liveCar: null, ...over },
  ];
  it("a Driver whose car and reach fit → a match", () => expect(nobodyFits(m, fits(), NOW)).toBe(false));
  it("the wrong class → no match", () =>
    expect(nobodyFits(m, fits({ vehicle: { category: "eco", body_type: "sedan", make: "Toyota", model: "Prius" } }), NOW)).toBe(true));
  it("no approved car → no match", () => expect(nobodyFits(m, fits({ vehicle: null }), NOW)).toBe(true));
  it("a Driver nobody has approved → no match", () =>
    expect(nobodyFits(m, fits({ driver: { ...driver, verified: false } }), NOW)).toBe(true));
  it("too far away → no match", () =>
    expect(nobodyFits(m, fits({ driver: { ...driver, base_lat: 48.85, base_lng: 2.35 } }), NOW)).toBe(true));
  it("a specific car nobody drives → no match", () =>
    expect(nobodyFits(mission({ required_body_type: "sedan", required_make: "Rolls-Royce", required_model: "Ghost" }), fits(), NOW)).toBe(true));
  it("an empty fleet → no match", () => expect(nobodyFits(m, [], NOW)).toBe(true));
  it("classifies EVERY eligibility rule, so a new one cannot slip in unexamined", () =>
    expect(Object.keys(CAR_AND_REACH).sort()).toEqual(Object.keys(RULES).sort()));
  it("leaves out the busy slot and the luggage opt-in — those are price questions", () => {
    expect(CAR_AND_REACH.slot_free).toBe(false);
    expect(CAR_AND_REACH.luggage_opt_in).toBe(false);
  });
});

describe("the car a Driver saw", () => {
  it("is one comparable string, and any difference shows", () => {
    const a = carKey({ category: "business", required_body_type: "sedan", required_make: null, required_model: null });
    expect(a).toBe("business|sedan||");
    expect(carKey({ category: "business", required_body_type: null, required_make: null, required_model: null })).not.toBe(a);
    expect(carKey({ category: "luxury", required_body_type: "sedan", required_make: null, required_model: null })).not.toBe(a);
  });
});
