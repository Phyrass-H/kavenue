// § AG — the Event Log, app side.
//
// The DATABASE guarantees one mission_event per committed mission.status
// transition (trigger `mission_event_log`, docs/migrations/2026-08-24_mission_event_log.sql).
// This module is the other half: the vocabulary app writers must use, and the
// reader-side rules for telling a guaranteed row from a best-effort one.
//
// ⚑ The event_type column has no CHECK, on purpose — a constraint on a log
//    aborts the transaction it is meant to record. The vocabulary is enforced
//    HERE instead, where a rejection costs nothing.

/** Written by the trigger. Guaranteed for every committed status transition. */
export const TRIGGER_EVENTS = [
  "created",
  "pooled",
  "repooled",
  "accepted", // collapsed in practice — accept_mission goes pooled -> confirmed
  "confirmed",
  "en_route",
  "arrived",
  "on_board",
  "completed",
  "no_show",
  "cancelled",
  "expired",
] as const;

/**
 * Written by the app or by log_mission_event(). BEST EFFORT — never complete.
 *
 * ⚑ NINE OF THESE ELEVEN ARE WIRED (S66, 2026-08-24). `pool_impression` and
 * `mission_viewed` are DELIBERATELY NOT, and are not an oversight to correct:
 *
 *   Both record a Driver BROWSING — scrolling the Pool, or opening a trip that
 *   is not theirs. The founder's call: at nine Drivers you can ring them and get
 *   a better answer than a log, and Kavenue is not a shopping site that needs to
 *   model why a basket was abandoned. The one question they would genuinely
 *   answer — "did this trip expire because nobody saw it, or because everyone
 *   refused it?" — is reachable without them, by asking which Drivers MATCHED a
 *   trip's category, zone and radius at the time. That is a query over data
 *   already stored, not a new firehose.
 *
 *   They stay in the vocabulary because the DB registry lists them and
 *   log_mission_event() still accepts them; nothing writes them. Revisit when the
 *   Driver base is too large to phone (§ AF, V2/V3).
 *
 * `accept_rejected` and `contact_revealed` ARE wired and are not browsing: one is
 * Kavenue's own rules refusing a Driver who wanted the work, the other is a
 * Guest's phone number being disclosed — an access trail, not analytics.
 */
export const APP_EVENTS = [
  "pool_impression", // not wired — see above
  "contact_revealed",
  "accept_rejected",
  "mission_viewed", // not wired — see above
  "amendment_proposed",
  "amendment_answered",
  "release_proposed",
  "release_answered",
  "info_changed",
  "checked_in",
  "close_answered",
] as const;

/** The subset log_mission_event() will accept from a browser JWT. */
export const CLIENT_LOGGABLE = [
  "pool_impression",
  "contact_revealed",
  "accept_rejected",
  "mission_viewed",
] as const;

export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];
export type AppEvent = (typeof APP_EVENTS)[number];
export type MissionEventType = TriggerEvent | AppEvent;

export type EventSource =
  | "db_trigger"
  | "client_rpc"
  | "app"
  | "status_event_backfill"
  | "mission_row_backfill";

export type Audience = "business" | "driver" | "admin";

export interface MissionEventRow {
  id: string;
  seq: number;
  mission_id: string;
  business_id: string | null;
  driver_id: string | null;
  event_type: string;
  occurred_at: string;
  actor_kind: "dispatcher" | "driver" | "admin" | "system" | "unknown";
  actor_id: string | null;
  audience: Audience[];
  source: EventSource;
  payload: Record<string, unknown>;
}

/** Only these rows may be read as "this definitely happened, at this moment". */
export function isObserved(e: Pick<MissionEventRow, "source">): boolean {
  return e.source === "db_trigger";
}

/** Imported from a column or an old table. True, but not observed at the time. */
export function isImported(e: Pick<MissionEventRow, "source">): boolean {
  return e.source === "status_event_backfill" || e.source === "mission_row_backfill";
}

/**
 * Who may see it. Mirrors the trigger's mapping and the RLS policies exactly —
 * if these ever disagree, the SQL wins and this is the bug.
 */
export function audienceFor(type: string): Audience[] {
  switch (type) {
    case "created":
    case "pooled":
    case "expired":
      return ["business", "admin"];
    case "pool_impression":
    case "contact_revealed":
    case "accept_rejected":
    case "mission_viewed":
      // ⚑ A Driver's Pool behaviour is not the Business's business.
      return ["admin"];
    default:
      return ["business", "driver", "admin"];
  }
}

/** Total order: occurred_at, then insertion order for events sharing a transaction. */
export function orderEvents<T extends { occurred_at: string; seq: number }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.seq - b.seq,
  );
}

/**
 * THE HOLE DETECTOR. Given a mission's terminal status and its events, say
 * whether the log actually recorded how it ended.
 *
 * This is the 23-cancelled-0-events check, expressed once so the vitest suite,
 * the live probe and handoff-check all mean the same thing by "a hole".
 */
export const TERMINAL_STATUSES = ["completed", "cancelled", "expired"] as const;

export function terminalEventFor(mission: {
  status: string;
  no_show?: boolean | null;
}): string {
  if (mission.status === "completed" && mission.no_show) return "no_show";
  return mission.status;
}

export function hasTerminalEvent(
  mission: { status: string; no_show?: boolean | null },
  events: Pick<MissionEventRow, "event_type">[],
): boolean {
  const want = terminalEventFor(mission);
  return events.some((e) => e.event_type === want);
}

/**
 * The sequence a mission that was posted, accepted, walked, re-pooled, accepted
 * again and driven MUST produce from the trigger alone. The live probe asserts
 * exactly this. Written down here so a future change to the trigger has to break
 * a test rather than a beta.
 *
 * ⚑ 'accepted' is absent on purpose: accept_mission sets status='confirmed' in
 *    one UPDATE (2026-08-22_accepted_fare.sql:124-136), so the intermediate state
 *    never commits and the trigger cannot see it. That is a documented hole, not
 *    a bug in the log.
 */
export const EXPECTED_WALK_AND_RETRY: readonly string[] = [
  "created",
  "pooled",
  "confirmed",
  "repooled",
  "confirmed",
  "en_route",
  "arrived",
  "on_board",
  "completed",
];

export const EXPECTED_POST_THEN_EXPIRE: readonly string[] = [
  "created",
  "pooled",
  "expired",
];

/** Trigger rows only, in order, as bare type names — what the probe compares. */
export function observedSequence(rows: MissionEventRow[]): string[] {
  return orderEvents(rows.filter(isObserved)).map((r) => r.event_type);
}
