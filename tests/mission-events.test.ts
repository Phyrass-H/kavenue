// § AG — what vitest can honestly pin about the Event Log.
//
// It CANNOT test the trigger; that needs Postgres and lives in
// .local/probe/event-log-e2e.ts. What it CAN pin is everything a reader of the
// log does with the rows once they arrive — and the two places where a mistake
// would silently make the log lie:
//
//   1. treating an IMPORTED row as an observed one ("this happened at 14:02"
//      when all we really know is that a column said so),
//   2. the audience map drifting away from the RLS policies, which is how one
//      Driver ends up reading another Driver's behaviour.
import { describe, expect, it } from "vitest";
import {
  APP_EVENTS,
  CLIENT_LOGGABLE,
  EXPECTED_POST_THEN_EXPIRE,
  EXPECTED_WALK_AND_RETRY,
  TRIGGER_EVENTS,
  audienceFor,
  hasTerminalEvent,
  isImported,
  isObserved,
  observedSequence,
  orderEvents,
  terminalEventFor,
  type MissionEventRow,
} from "@/lib/mission-events";

const row = (o: Partial<MissionEventRow> = {}): MissionEventRow => ({
  id: crypto.randomUUID(),
  seq: 1,
  mission_id: "m1",
  business_id: "b1",
  driver_id: null,
  event_type: "pooled",
  occurred_at: "2026-08-24T10:00:00.000Z",
  actor_kind: "unknown",
  actor_id: null,
  audience: ["business", "admin"],
  source: "db_trigger",
  payload: {},
  ...o,
});

describe("what may be read as fact", () => {
  it("only trigger rows count as observed", () => {
    expect(isObserved(row({ source: "db_trigger" }))).toBe(true);
    for (const s of ["client_rpc", "app", "status_event_backfill", "mission_row_backfill"] as const) {
      expect(isObserved(row({ source: s }))).toBe(false);
    }
  });

  it("backfilled rows are imported, and the two app sources are neither", () => {
    expect(isImported(row({ source: "status_event_backfill" }))).toBe(true);
    expect(isImported(row({ source: "mission_row_backfill" }))).toBe(true);
    // Best-effort live writes are NOT imported — they were observed by the app,
    // just not guaranteed. Three states, not two.
    expect(isImported(row({ source: "app" }))).toBe(false);
    expect(isImported(row({ source: "client_rpc" }))).toBe(false);
  });

  it("observedSequence drops the 715 imported rows and keeps trigger order", () => {
    const rows = [
      row({ seq: 3, event_type: "confirmed", occurred_at: "2026-08-24T10:02:00Z" }),
      row({ seq: 1, event_type: "arrived", occurred_at: "2026-01-01T00:00:00Z", source: "status_event_backfill" }),
      row({ seq: 2, event_type: "pooled", occurred_at: "2026-08-24T10:01:00Z" }),
    ];
    expect(observedSequence(rows)).toEqual(["pooled", "confirmed"]);
  });
});

describe("ordering", () => {
  it("breaks a same-instant tie by seq, so two events in one transaction read right", () => {
    // The trigger emits 'created' then 'pooled' inside ONE insert. clock_timestamp()
    // usually separates them, but must not be relied on to.
    const same = "2026-08-24T10:00:00.000Z";
    const rows = [
      row({ seq: 8, event_type: "pooled", occurred_at: same }),
      row({ seq: 7, event_type: "created", occurred_at: same }),
    ];
    expect(orderEvents(rows).map((r) => r.event_type)).toEqual(["created", "pooled"]);
  });
});

describe("audience — must mirror the RLS policies", () => {
  it("hides Pool behaviour from the Business", () => {
    for (const t of ["pool_impression", "contact_revealed", "accept_rejected", "mission_viewed"]) {
      expect(audienceFor(t)).toEqual(["admin"]);
      expect(audienceFor(t)).not.toContain("business");
      expect(audienceFor(t)).not.toContain("driver");
    }
  });

  it("keeps pool entry and expiry off the Driver's timeline", () => {
    // A Driver must not learn from the log that a mission they never took was
    // posted, sat there and died.
    for (const t of ["created", "pooled", "expired"]) {
      expect(audienceFor(t)).not.toContain("driver");
      expect(audienceFor(t)).toContain("business");
    }
  });

  it("shows the walk to the Driver who walked and to the Business", () => {
    expect(audienceFor("repooled")).toEqual(["business", "driver", "admin"]);
  });

  it("admin is in every audience — there is no event nobody can review", () => {
    for (const t of [...TRIGGER_EVENTS, ...APP_EVENTS]) {
      expect(audienceFor(t)).toContain("admin");
    }
  });
});

describe("the hole detector", () => {
  it("a no-show is a completed mission but must NOT satisfy the completed check", () => {
    // mark_no_show sets status='completed' with no_show=true
    // (2026-07-22_waiting_fee.sql:185-195). Counting it as a plain completion is
    // how a no-show disappears from the numbers.
    expect(terminalEventFor({ status: "completed", no_show: true })).toBe("no_show");
    expect(terminalEventFor({ status: "completed", no_show: false })).toBe("completed");
    expect(
      hasTerminalEvent({ status: "completed", no_show: true }, [{ event_type: "completed" }]),
    ).toBe(false);
    expect(
      hasTerminalEvent({ status: "completed", no_show: true }, [{ event_type: "no_show" }]),
    ).toBe(true);
  });

  it("reproduces the 23-cancelled-0-events hole", () => {
    const missions = Array.from({ length: 23 }, (_, i) => ({ id: `c${i}`, status: "cancelled" }));
    const events: { event_type: string }[] = []; // exactly what live had on 2026-08-24
    const holes = missions.filter((m) => !hasTerminalEvent(m, events)).length;
    expect(holes).toBe(23);
  });

  it("a mission whose end WAS logged is not a hole", () => {
    expect(hasTerminalEvent({ status: "expired" }, [{ event_type: "expired" }])).toBe(true);
  });
});

describe("the vocabulary", () => {
  it("client-loggable is a strict subset of the app events", () => {
    for (const t of CLIENT_LOGGABLE) expect(APP_EVENTS).toContain(t);
  });

  it("no client-loggable type overlaps a trigger type — a browser cannot forge history", () => {
    // If 'completed' ever appeared here, a Driver could POST a finished trip.
    for (const t of CLIENT_LOGGABLE) expect(TRIGGER_EVENTS).not.toContain(t as never);
  });

  it("the two expected sequences omit 'accepted', because the DB never commits it", () => {
    expect(EXPECTED_WALK_AND_RETRY).not.toContain("accepted");
    expect(EXPECTED_WALK_AND_RETRY.filter((e) => e === "confirmed")).toHaveLength(2);
    expect(EXPECTED_WALK_AND_RETRY.filter((e) => e === "repooled")).toHaveLength(1);
    expect(EXPECTED_POST_THEN_EXPIRE).toEqual(["created", "pooled", "expired"]);
  });
});
