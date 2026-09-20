// lib/cancellation.ts — the O7 fee ramp, the courtesy wait and the waiting
// meter (D45 · D47 · D48). This file MIRRORS SQL: every number here also exists
// in docs/migrations/*.sql, so a test that pins the rule pins both sides.
import { describe, expect, it } from "vitest";
import {
  businessCancelPct,
  cancelCompensation,
  cancelFeeAmount,
  guestDueAt,
  isAirportPickup,
  nextCancelRaise,
  noShowAvailableAt,
  noShowWaitMinutes,
  waitingAt,
  waitingBetween,
  waitingRatePerMin,
  waitingCeilingMinutes,
  WAITING_RATE_PER_MIN,
} from "@/lib/cancellation";
import { mission } from "./fixtures";

const at = (iso: string) => new Date(iso);

describe("isAirportPickup — the S42 accent bug", () => {
  it("matches the exact Mapbox string for Nice airport", () => {
    // "Aéroport Nice Côte d'Azur" is what the autocomplete stores in
    // pickup_label. The old predicate used a bracket expression around a
    // multibyte character, Postgres `~*` didn't reliably match it, and every
    // accented airport pickup silently got a 20-minute city wait instead of 60.
    expect(
      isAirportPickup(
        mission({
          pickup_address: "Rue Costes et Bellonte, 06200 Nice, France",
          pickup_label: "Aéroport Nice Côte d'Azur",
        }),
      ),
    ).toBe(true);
  });

  it("matches whatever the accent, case or Unicode normalisation", () => {
    const forms = [
      "Aéroport Nice", // NFC — single é codepoint
      "Aéroport Nice", // NFD — e + combining acute
      "Aeroport Nice", // no accent at all
      "AÉROPORT NICE",
      "Aeroporto di Genova",
      "London City Airport",
      "airport terminal 2",
    ].map((s, i) => (i === 0 ? s.normalize("NFC") : i === 1 ? s.normalize("NFD") : s));
    // ⚑ The two normalisations are BUILT, not typed: an editor silently
    // normalises a pasted literal, and this case would quietly become vacuous.
    expect(forms[0]).not.toBe(forms[1]);
    for (const label of forms) {
      expect(isAirportPickup(mission({ pickup_label: label }))).toBe(true);
    }
  });

  it("reads the address as well as the label", () => {
    expect(
      isAirportPickup(mission({ pickup_address: "Aéroport de Cannes-Mandelieu", pickup_label: null })),
    ).toBe(true);
  });

  it("is true for a flight number when neither end names an airport — an unlabelled terminal", () => {
    // An arrival's pickup is often "Terminal 2, 06200 Nice" with no airport word in it,
    // which is the whole reason the flight number is still consulted at all.
    expect(isAirportPickup(mission({ flight_number: "AF7701" }))).toBe(true);
    expect(
      isAirportPickup(
        mission({ flight_number: "AF7701", pickup_address: "Terminal 2, 06200 Nice", dropoff_address: "Pl. du Casino, 98000 Monaco" }),
      ),
    ).toBe(true);
  });

  // ⚑ THE 2026-08-20 FIX. A flight number on a DEPARTURE describes the flight the Guest is
  // catching, not one they have landed from — the pickup is a Business's door and deserves the
  // 20-minute city wait. On the live data 52 of 89 flight-number trips were departures, each
  // one handing the Driver 40 extra unpaid minutes and doubling the meter's ceiling.
  it("is FALSE for a Business → airport departure, even with a flight number", () => {
    const departure = mission({
      flight_number: "U26541",
      pickup_address: "5 Prom. des Anglais, 06000 Nice, France",
      pickup_label: "Le Grand Hôtel",
      dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 1, 06200 Nice",
    });
    expect(isAirportPickup(departure)).toBe(false);
    expect(noShowWaitMinutes(isAirportPickup(departure))).toBe(20);
  });

  it("is still TRUE for the arrival that runs the other way", () => {
    const arrival = mission({
      flight_number: "U26541",
      pickup_address: "Aéroport Nice Côte d'Azur, Terminal 1, 06200 Nice",
      dropoff_address: "5 Prom. des Anglais, 06000 Nice, France",
    });
    expect(isAirportPickup(arrival)).toBe(true);
    expect(noShowWaitMinutes(isAirportPickup(arrival))).toBe(60);
  });

  it("reads the PICKUP first — an airport-to-airport transfer is an arrival", () => {
    expect(
      isAirportPickup(
        mission({
          pickup_address: "Aéroport Nice Côte d'Azur, 06200 Nice",
          dropoff_address: "Aéroport Cannes-Mandelieu, 06150 Cannes",
        }),
      ),
    ).toBe(true);
  });

  it("is false for an ordinary city pickup", () => {
    expect(
      isAirportPickup(
        mission({ pickup_address: "37 Promenade des Anglais, 06000 Nice, France", pickup_label: "Hôtel Negresco" }),
      ),
    ).toBe(false);
  });
});

describe("the courtesy wait", () => {
  it("is 60 minutes at an airport and 20 in the city", () => {
    expect(noShowWaitMinutes(true)).toBe(60);
    expect(noShowWaitMinutes(false)).toBe(20);
  });

  it("stops the meter at 120 minutes at an airport and 60 in the city", () => {
    expect(waitingCeilingMinutes(true)).toBe(120);
    expect(waitingCeilingMinutes(false)).toBe(60);
  });
});

describe("guestDueAt — the clock belongs to the Guest, not the Driver", () => {
  it("is the booked pickup time by default", () => {
    const m = mission({ pickup_at: "2026-07-15T12:00:00+02:00" });
    expect(guestDueAt(m).toISOString()).toBe(at("2026-07-15T12:00:00+02:00").toISOString());
  });

  it("is the tracked ready instant once flight tracking sets one", () => {
    const m = mission({
      pickup_at: "2026-07-15T12:00:00+02:00",
      guest_ready_at: "2026-07-15T13:30:00+02:00",
    });
    expect(guestDueAt(m).toISOString()).toBe(at("2026-07-15T13:30:00+02:00").toISOString());
  });
});

describe("waitingAt — the D48 meter", () => {
  // ⚑ The fixture is `category: "business"` = 0,75 €/min since S62 (docs/06 §10). Every
  // euro figure in this block is 40 or 60 minutes at THAT rate, not at the old flat 1,00.
  const city = mission({ pickup_at: "2026-07-15T12:00:00+02:00" });
  const airport = mission({ pickup_at: "2026-07-15T12:00:00+02:00", flight_number: "AF7701" });

  it("charges nothing during the courtesy wait", () => {
    expect(waitingAt(city, at("2026-07-15T12:00:00+02:00")).fee).toBe(0);
    expect(waitingAt(city, at("2026-07-15T12:19:59+02:00")).fee).toBe(0);
    expect(waitingAt(city, at("2026-07-15T12:20:00+02:00")).fee).toBe(0);
  });

  it("charges the first minute the instant the courtesy wait lapses (per minute STARTED)", () => {
    const w = waitingAt(city, at("2026-07-15T12:20:01+02:00"));
    expect(w.minutes).toBe(1);
    expect(w.fee).toBe(0.75);
  });

  it("counts minutes started, not minutes completed", () => {
    expect(waitingAt(city, at("2026-07-15T12:25:00+02:00")).minutes).toBe(5);
    expect(waitingAt(city, at("2026-07-15T12:25:01+02:00")).minutes).toBe(6);
  });

  it("caps the money without ending the trip — 40 paid minutes in the city", () => {
    const capped = waitingAt(city, at("2026-07-15T13:00:00+02:00"));
    expect(capped.minutes).toBe(40);
    expect(capped.fee).toBe(30); // 40 × 0,75
    expect(capped.capped).toBe(true);
    expect(capped.maxFee).toBe(30);

    // An hour later still 30 — the meter is frozen, the Driver is still there.
    const later = waitingAt(city, at("2026-07-15T14:00:00+02:00"));
    expect(later.fee).toBe(30);
    expect(later.capped).toBe(true);
  });

  it("caps at 60 paid minutes at an airport, on the longer courtesy wait", () => {
    expect(waitingAt(airport, at("2026-07-15T12:59:00+02:00")).fee).toBe(0);
    expect(waitingAt(airport, at("2026-07-15T13:30:00+02:00")).fee).toBe(22.5); // 30 × 0,75
    const capped = waitingAt(airport, at("2026-07-15T14:00:00+02:00"));
    expect(capped.fee).toBe(45); // 60 × 0,75
    expect(capped.capped).toBe(true);
    expect(capped.maxFee).toBe(45);
  });

  // ⚑ THE RATE IS PER SERVICE CLASS (docs/06 §10, S62). The cap is defined in MINUTES —
  // 40 city / 60 airport — so the euro ceiling follows the class down, which is the whole
  // point: the founder's objection was that one flat rate punishes a cheap trip.
  it("prices the same 40 minutes by class — Eco, Business, First", () => {
    const capAt = at("2026-07-15T13:00:00+02:00");
    const forClass = (category: "eco" | "business" | "luxury") =>
      waitingAt(mission({ pickup_at: "2026-07-15T12:00:00+02:00", category }), capAt);

    expect(forClass("eco").fee).toBe(20); // 40 × 0,50
    expect(forClass("business").fee).toBe(30); // 40 × 0,75
    expect(forClass("luxury").fee).toBe(40); // 40 × 1,00 — First, unchanged

    // Minutes never vary — only the price of one.
    for (const c of ["eco", "business", "luxury"] as const) {
      expect(forClass(c).minutes).toBe(40);
      expect(forClass(c).maxFee).toBe(forClass(c).fee);
    }
  });

  it("keeps the per-minute rates as clean cents, so no duration drifts", () => {
    // Course-side, numeric(10,2). The Business-facing figure is deliberately NOT the round
    // one — 0,50 all-in would have to be stored as 0,43 and would bill 9,89 € for 20 min.
    expect(waitingRatePerMin("eco")).toBe(0.5);
    expect(waitingRatePerMin("business")).toBe(0.75);
    expect(waitingRatePerMin("luxury")).toBe(1);
    // Never zero, whatever arrives — an unknown class bills at Business, never free.
    expect(waitingRatePerMin(null)).toBe(0.75);
    expect(waitingRatePerMin(undefined)).toBe(0.75);
    // Float-safe at every minute count: 3 × 0,75 must be 2,25 and not 2.2500000000000004.
    for (const m of [1, 3, 7, 13, 17, 23, 40, 60]) {
      const eco = waitingBetween(0, 3_600_000 * 3, m * 60_000, 0.5).fee;
      const biz = waitingBetween(0, 3_600_000 * 3, m * 60_000, 0.75).fee;
      expect(eco).toBe(Math.round(m * 50) / 100);
      expect(biz).toBe(Math.round(m * 75) / 100);
    }
  });

  it("runs its window from the tracked Guest-ready instant when there is one", () => {
    const late = mission({
      pickup_at: "2026-07-15T12:00:00+02:00",
      guest_ready_at: "2026-07-15T13:00:00+02:00",
    });
    // The Guest is due at 13:00, so 13:10 is still inside the courtesy wait even
    // though it is over an hour past the booked pickup time.
    expect(waitingAt(late, at("2026-07-15T13:10:00+02:00")).fee).toBe(0);
    expect(waitingAt(late, at("2026-07-15T13:30:00+02:00")).minutes).toBe(10);
  });

  it("never returns negative minutes before the Guest is even due", () => {
    const w = waitingAt(city, at("2026-07-15T09:00:00+02:00"));
    expect(w.minutes).toBe(0);
    expect(w.fee).toBe(0);
    expect(w.capped).toBe(false);
  });

  it("exposes the meter's own start and stop instants", () => {
    const w = waitingAt(city, at("2026-07-15T12:30:00+02:00"));
    expect(w.from.toISOString()).toBe(at("2026-07-15T12:20:00+02:00").toISOString());
    expect(w.until.toISOString()).toBe(at("2026-07-15T13:00:00+02:00").toISOString());
  });

  it("accepts a millisecond timestamp as well as a Date", () => {
    const asMs = waitingAt(city, at("2026-07-15T12:30:00+02:00").getTime());
    const asDate = waitingAt(city, at("2026-07-15T12:30:00+02:00"));
    expect(asMs.fee).toBe(asDate.fee);
  });
});

describe("noShowAvailableAt — the S41 clock-origin exploit", () => {
  it("unlocks one courtesy wait after the GUEST was due", () => {
    const m = mission({ pickup_at: "2026-07-15T12:00:00+02:00" });
    const unlock = noShowAvailableAt(m, "2026-07-15T11:55:00+02:00");
    expect(unlock.toISOString()).toBe(at("2026-07-15T12:20:00+02:00").toISOString());
  });

  it("cannot be brought forward by tapping 'arrived' early", () => {
    // The exploit: `advanceStatus` has no time guard, so a Driver could tap
    // through ~33h early, wait out a 20-minute window anchored on their own tap,
    // and file a no-show — charging the Business a full fare before the trip.
    const m = mission({ pickup_at: "2026-07-15T12:00:00+02:00" });
    const unlock = noShowAvailableAt(m, "2026-07-14T03:00:00+02:00");
    expect(unlock.toISOString()).toBe(at("2026-07-15T12:20:00+02:00").toISOString());
    expect(unlock.getTime()).toBeGreaterThan(at("2026-07-15T12:00:00+02:00").getTime());
  });

  it("holds a late Driver on site for the 5-minute floor", () => {
    // Turning up after the courtesy wait already closed does not mean filing
    // instantly: the floor is 5 minutes of actual presence.
    const m = mission({ pickup_at: "2026-07-15T12:00:00+02:00" });
    const unlock = noShowAvailableAt(m, "2026-07-15T12:40:00+02:00");
    expect(unlock.toISOString()).toBe(at("2026-07-15T12:45:00+02:00").toISOString());
  });

  it("never binds the floor on an on-time Driver", () => {
    const m = mission({ pickup_at: "2026-07-15T12:00:00+02:00", flight_number: "AF7701" });
    // Airport: the window ends at 13:00, well past arrived + 5 min.
    expect(noShowAvailableAt(m, "2026-07-15T11:58:00+02:00").toISOString()).toBe(
      at("2026-07-15T13:00:00+02:00").toISOString(),
    );
  });

  it("uses the tracked Guest-ready instant as the origin when set", () => {
    const m = mission({
      pickup_at: "2026-07-15T12:00:00+02:00",
      guest_ready_at: "2026-07-15T14:00:00+02:00",
    });
    expect(noShowAvailableAt(m, "2026-07-15T11:50:00+02:00").toISOString()).toBe(
      at("2026-07-15T14:20:00+02:00").toISOString(),
    );
  });
});

describe("businessCancelPct — the D45 ramp", () => {
  it("is free while nobody holds the mission, however close to pickup", () => {
    expect(businessCancelPct(0.25, false)).toBe(0);
    expect(businessCancelPct(-3, false)).toBe(0);
  });

  it("is free more than 5 hours out even with a Driver on it", () => {
    expect(businessCancelPct(24, true)).toBe(0);
    expect(businessCancelPct(5.01, true)).toBe(0);
  });

  it("steps to 50 % at exactly 5 hours", () => {
    expect(businessCancelPct(5, true)).toBe(50);
  });

  it("climbs 10 % an hour — 5 % every half hour — from there", () => {
    expect(businessCancelPct(4, true)).toBe(60);
    expect(businessCancelPct(4.5, true)).toBe(55);
    expect(businessCancelPct(2.5, true)).toBe(75);
    expect(businessCancelPct(1, true)).toBe(90);
  });

  // ── the half-hour STEP (2026-08-09) ────────────────────────────────────────
  // The ramp used to be a slope, so the fee a Business was quoted was never quite the fee
  // it was charged (measured live: +0,41 € on a 480 € trip over a 30-second dwell). These
  // pin the step so it cannot quietly go back to sliding.
  it("HOLDS FLAT inside a half-hour tread — the property the whole change exists for", () => {
    // Anywhere in (4h30, 5h] the answer is 50 %, so quote == charge.
    for (const h of [5, 4.99, 4.75, 4.6, 4.51, 4.5001]) {
      expect(businessCancelPct(h, true)).toBe(50);
    }
    // …and anywhere in (0h30, 1h] it is 90 %.
    for (const h of [1, 0.9, 0.75, 0.6, 0.5001]) {
      expect(businessCancelPct(h, true)).toBe(90);
    }
  });

  it("steps by exactly 5 points, and only on a half-hour boundary", () => {
    expect(businessCancelPct(4.5001, true)).toBe(50);
    expect(businessCancelPct(4.5, true)).toBe(55); // the boundary belongs to the dearer band
    expect(businessCancelPct(4.0001, true)).toBe(55);
    expect(businessCancelPct(4, true)).toBe(60);
  });

  it("rounds in the BUSINESS's favour — the cheaper rate holds to the boundary", () => {
    // On the old slope, 4h36 out cost 54 %. It now costs 50 % until T−4h30.
    expect(businessCancelPct(4.6, true)).toBe(50);
    expect(businessCancelPct(2.9, true)).toBe(70);
    expect(businessCancelPct(0.4, true)).toBe(95);
  });

  it("only ever takes multiples of 5, across the whole ramp", () => {
    for (let h = 0; h <= 5; h += 1 / 60) {
      expect(businessCancelPct(h, true) % 5).toBe(0);
    }
  });

  it("keeps every landmark the old slope had, so nothing on an hour moved", () => {
    const landmarks: Array<[number, number]> = [
      [5, 50], [4.5, 55], [4, 60], [3.5, 65], [3, 70], [2.5, 75],
      [2, 80], [1.5, 85], [1, 90], [0.5, 95], [0, 100],
    ];
    for (const [h, pct] of landmarks) expect(businessCancelPct(h, true)).toBe(pct);
  });

  it("reaches 100 % at the pickup time and stays there afterwards", () => {
    expect(businessCancelPct(0, true)).toBe(100);
    expect(businessCancelPct(-0.5, true)).toBe(100);
    expect(businessCancelPct(-48, true)).toBe(100);
  });

  it("stays inside 0–100 across the whole range", () => {
    for (let h = -10; h <= 10; h += 0.25) {
      const pct = businessCancelPct(h, true);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("never decreases as the pickup gets closer", () => {
    // Monotonicity is the property that makes the ramp a deterrent: waiting must
    // never become cheaper than cancelling now.
    let prev = 0;
    for (let h = 10; h >= -2; h -= 0.25) {
      const pct = businessCancelPct(h, true);
      expect(pct).toBeGreaterThanOrEqual(prev);
      prev = pct;
    }
  });
});

describe("waitingBetween — one meter, three screens", () => {
  // Local fixture: the `city` mission above is scoped to its own describe block.
  const cityTrip = mission({ pickup_at: "2026-07-15T12:00:00+02:00" });
  const FROM = Date.parse("2026-07-15T12:20:00+02:00"); // due 12:00 + 20 min courtesy
  const UNTIL = Date.parse("2026-07-15T13:00:00+02:00"); // ceiling: due + 60 min

  // The rate is a REQUIRED argument since S62 — a screen that forgets it fails to compile
  // rather than quietly billing the wrong class.
  const RATE = waitingRatePerMin(cityTrip.category); // business → 0,75

  it("owes nothing until the courtesy wait actually lapses", () => {
    expect(waitingBetween(FROM, UNTIL, FROM, RATE).fee).toBe(0);
    expect(waitingBetween(FROM, UNTIL, FROM - 60_000, RATE).fee).toBe(0);
  });

  it("charges the minute the instant it starts — per minute STARTED", () => {
    expect(waitingBetween(FROM, UNTIL, FROM + 1, RATE).minutes).toBe(1);
  });

  it("freezes at the ceiling and never grows past it", () => {
    expect(waitingBetween(FROM, UNTIL, UNTIL, RATE).fee).toBe(30); // 40 × 0,75
    expect(waitingBetween(FROM, UNTIL, UNTIL + 3_600_000, RATE).fee).toBe(30);
  });

  it("is the same number waitingAt reports, so no screen can drift from the server", () => {
    for (const iso of ["2026-07-15T12:19:00+02:00", "2026-07-15T12:37:30+02:00", "2026-07-15T14:00:00+02:00"]) {
      const at = Date.parse(iso);
      const w = waitingAt(cityTrip, at);
      expect(waitingBetween(w.from.getTime(), w.until.getTime(), at, RATE)).toEqual({
        minutes: w.minutes,
        fee: w.fee,
      });
    }
  });
});

describe("cancelFeeAmount — the modal's euro figure must equal the cent Postgres stores", () => {
  // Exact decimal, halves away from zero — what Postgres `round(numeric, 2)` does. Pure
  // integer arithmetic (fare cents × pct never exceeds 10^7, well inside a safe integer),
  // so the reference contains no float and cannot drift the same way the subject did.
  const pgRoundCents = (fareCents: number, pct: number): number => {
    const total = fareCents * pct; // = fee in cents × 100
    return Math.floor(total / 100) + (total % 100 >= 50 ? 1 : 0);
  };

  it("rounds the exact half-cent UP, as the database does", () => {
    // The live failure, 2026-08-09: 85,50 € at 95 % is exactly 81,225 €. SQL stored 81,23;
    // the old float formula produced 81,22 and would have under-quoted every such trip.
    expect(85.5 * 0.95).toBeCloseTo(81.225, 10);
    expect(cancelFeeAmount(85.5, 95)).toBe(81.23);
    expect(Math.round((85.5 * 95) / 100 * 100) / 100).toBe(81.22); // the bug, pinned
  });

  it("agrees with exact decimal on every fare cent at every step of the ramp", () => {
    // The step made pct a multiple of 5, which is exactly what makes ties common: at 95 %
    // one fare in twenty lands on a half-cent. Sweep them all rather than sampling — but
    // compare with plain arithmetic and assert ONCE, or a million expect() calls take
    // longer than the whole rest of the suite.
    const pcts = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
    const bad: string[] = [];
    let ties = 0;
    for (const pct of pcts) {
      for (let cents = 1; cents <= 100_000; cents++) {
        if ((cents * pct) % 100 === 50) ties++;
        const want = pgRoundCents(cents, pct) / 100;
        const got = cancelFeeAmount(cents / 100, pct);
        if (got !== want && bad.length < 5) bad.push(`${cents / 100} € × ${pct}% → ${got}, want ${want}`);
      }
    }
    expect(bad).toEqual([]);
    expect(ties).toBeGreaterThan(0); // the sweep genuinely exercised the tie case
  });

  it("is zero when the cancellation is free", () => {
    expect(cancelFeeAmount(123.45, 0)).toBe(0);
  });
});

describe("nextCancelRaise — the deadline the modal counts down to", () => {
  it("is nothing at all when no Driver holds the trip", () => {
    expect(nextCancelRaise(2, false)).toBeNull();
  });

  it("while still free, points at the moment the ramp switches on", () => {
    expect(nextCancelRaise(9, true)).toEqual({ atHoursToPickup: 5, pct: 50 });
    expect(nextCancelRaise(5.01, true)).toEqual({ atHoursToPickup: 5, pct: 50 });
  });

  it("points at the next half-hour boundary, and the price on the far side", () => {
    expect(nextCancelRaise(4.6, true)).toEqual({ atHoursToPickup: 4.5, pct: 55 });
    expect(nextCancelRaise(4.5, true)).toEqual({ atHoursToPickup: 4, pct: 60 });
    expect(nextCancelRaise(0.6, true)).toEqual({ atHoursToPickup: 0.5, pct: 95 });
  });

  it("names pickup itself as the last raise, to 100 %", () => {
    expect(nextCancelRaise(0.3, true)).toEqual({ atHoursToPickup: 0, pct: 100 });
  });

  it("is null once there is nothing left to rise to", () => {
    expect(nextCancelRaise(0, true)).toBeNull();
    expect(nextCancelRaise(-2, true)).toBeNull();
  });

  it("always names a raise that is genuinely dearer than now — never a fake deadline", () => {
    for (let h = 0; h <= 6; h += 1 / 60) {
      const now = businessCancelPct(h, true);
      const next = nextCancelRaise(h, true);
      if (next) {
        expect(next.pct).toBeGreaterThan(now);
        expect(next.atHoursToPickup).toBeLessThan(h);
      } else {
        expect(now).toBe(100);
      }
    }
  });
});

describe("cancelCompensation — what the Driver is owed on a cancelled trip", () => {
  it("is the policy fee plus any waiting already accrued", () => {
    const m = mission({ status: "cancelled", cancellation_fee: 58.17, waiting_fee: 12 });
    expect(cancelCompensation(m)).toBe(70.17);
  });

  it("is the fee alone when no waiting ran", () => {
    const m = mission({ status: "cancelled", cancellation_fee: 45, waiting_fee: null });
    expect(cancelCompensation(m)).toBe(45);
  });

  it("is null on a trip that did not end cancelled", () => {
    expect(cancelCompensation(mission({ status: "completed", cancellation_fee: 45 }))).toBeNull();
  });

  it("is null on a legacy row stamped before the fee column existed", () => {
    // Show nothing rather than a wrong number.
    expect(cancelCompensation(mission({ status: "cancelled", cancellation_fee: null }))).toBeNull();
  });

  it("coerces the PostgREST numeric-as-STRING instead of concatenating it", () => {
    // Postgres `numeric` arrives over PostgREST as text. Summed raw, 58.17 and
    // 12 would produce the string "58.1712".
    const m = mission({
      status: "cancelled",
      cancellation_fee: "58.17" as unknown as number,
      waiting_fee: "12" as unknown as number,
    });
    expect(cancelCompensation(m)).toBe(70.17);
  });
});
