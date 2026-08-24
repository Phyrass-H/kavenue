// Status "tone" for the Dispatch schedule — the at-a-glance colour a hotel
// scans. Derived from mission.status + time-to-pickup + the D61 check-in.
import type { CloseAnswer, MissionRow } from "@/lib/database.types";

export type Tone = "neutral" | "info" | "success" | "warn" | "danger";

export interface MissionTone {
  tone: Tone;
  label: string; // short status pill text
  hint?: string; // extra line in the detail / why it needs attention
  needsAttention: boolean; // surfaces the "!" marker beside the pill
  /**
   * Tint the WHOLE row in `tone`, not just the pill — the founder's ask for
   * check-in (D61): a trip nobody has confirmed should be impossible to scroll
   * past. Explicit rather than derived from `tone`, because "No-show" and
   * "Unfilled" are also warn/danger and deliberately do NOT wash.
   */
  wash?: boolean;
}

/** Check-in opens 3h before pickup, and the row escalates to red at 1h. */
export const CHECK_IN_OPENS_MS = 3 * 3_600_000;
/**
 * How long after the pickup time check-in still applies. A Driver five minutes
 * late genuinely hasn't checked in; a trip left `confirmed` for three weeks is
 * stale data, not a check-in problem, and shouldn't sit red on the schedule.
 */
export const CHECK_IN_GRACE_MS = 1 * 3_600_000;
const HOURS_3 = CHECK_IN_OPENS_MS;
const HOURS_1 = 1 * 3_600_000;

/**
 * Is the check-in button live for this trip? (Driver side.)
 *
 * A trip accepted less than 3h out opens immediately — there is no window to
 * wait for. Anything past `confirmed` means they've already started, which is a
 * stronger signal than the button, so it stops applying.
 */
export function checkInOpen(
  m: Pick<MissionRow, "status" | "pickup_at" | "checked_in_at">,
  now: Date = new Date(),
): boolean {
  if (m.status !== "confirmed" || m.checked_in_at) return false;
  const pickup = new Date(m.pickup_at).getTime();
  return (
    pickup <= now.getTime() + CHECK_IN_OPENS_MS &&
    pickup >= now.getTime() - CHECK_IN_GRACE_MS
  );
}

/**
 * How long before pickup the Business may take a trip back from a Driver who is
 * holding it but has never checked in (founder, 2026-08-24, D86).
 *
 * Check-in opens at T−3h, so the Driver keeps a full hour of grace before the
 * trip can be taken off them, and a replacement gets two. The old window was
 * T−60min, which left the replacement less time than the drive itself — the
 * default 50 km radius implies 45–75 min on the Riviera.
 */
export const RECLAIM_OPENS_MS = 2 * 3_600_000;

/**
 * Is the reclaim button live for this trip? (Business side.)
 *
 * ⚑ The gate is `confirmed AND never checked in` — NOT `accepted`. Since
 * Option A / D55 `accept_mission` confirms immediately, so `accepted` has never
 * happened: 0 of 280 missions and 0 of 715 status transitions, measured on the
 * live DB 2026-08-24. The old gate is why this button never rendered for anyone.
 *
 * Deliberately a narrowing of `checkInOpen` rather than its own window: the card
 * appears the moment check-in opens with its button locked, so the Dispatcher
 * can see it coming and call first, and the button unlocks an hour later. One
 * predicate can't drift from the other if one is defined in terms of the other.
 *
 * ⚑ Mirrored by `reclaim_mission` (docs/migrations/2026-08-24_reclaim_at_t2h.sql),
 * which is the real guard and re-checks. This only decides what to OFFER, so it
 * must stay a SUBSET of the SQL — never the other way round.
 */
export function reclaimOpen(
  m: Pick<MissionRow, "status" | "pickup_at" | "checked_in_at">,
  now: Date = new Date(),
): boolean {
  if (!checkInOpen(m, now)) return false;
  return new Date(m.pickup_at).getTime() <= now.getTime() + RECLAIM_OPENS_MS;
}

/**
 * When the reclaim button unlocks, for the locked state's label. Null once it
 * already has — the caller shows the live button instead.
 */
export function reclaimUnlocksAt(
  m: Pick<MissionRow, "status" | "pickup_at" | "checked_in_at">,
  now: Date = new Date(),
): string | null {
  if (reclaimOpen(m, now)) return null;
  return new Date(new Date(m.pickup_at).getTime() - RECLAIM_OPENS_MS).toISOString();
}

/**
 * § P — is this trip dead? Either already swept to `expired`, or still `pooled`
 * with its pickup time behind us, which is the same thing a moment earlier.
 *
 * The sweep (`expire_stale_missions`) runs on the Pool and Dispatch schedule
 * reads, so those two pages see the real status — but the calendar, the history
 * and any deep link don't sweep, and none of them should treat a dead trip as
 * live. One predicate so that judgement can't drift between screens.
 */
export function isExpired(
  m: Pick<MissionRow, "status" | "pickup_at">,
  now: Date = new Date(),
): boolean {
  return (
    m.status === "expired" ||
    (m.status === "pooled" && new Date(m.pickup_at).getTime() <= now.getTime())
  );
}

/**
 * § P — can the Business still edit the Driver-facing INFO on this trip?
 *
 * Pre-departure statuses only, and never on a dead one: a still-`pooled` row
 * whose pickup has passed is expired whether or not the sweep has reached it.
 * The schedule row and the edit page both call this. The server action keeps its
 * own SQL half of the same rule (it has to — the guard must be part of the one
 * atomic UPDATE), so this is two writings of it down from three, not one.
 */
export function canEditInfo(
  m: Pick<MissionRow, "status" | "pickup_at">,
  now: Date = new Date(),
): boolean {
  if (isExpired(m, now)) return false;
  return m.status === "pooled" || m.status === "accepted" || m.status === "confirmed";
}

/**
 * Can a pending amendment or agreed release still be ANSWERED on this trip?
 *
 * Mirrors the guard inside `respond_to_amendment` / `respond_to_release`
 * (`status not in ('accepted','confirmed') → raise`). The Business's schedule
 * used to promise "Waiting for <Driver> to accept" on trips where the RPC would
 * refuse — a Driver already en route can't answer anything.
 */
export function negotiationAnswerable(status: MissionRow["status"]): boolean {
  return status === "accepted" || status === "confirmed";
}

// ---------------------------------------------------------------------------
// § Q — a trip the Driver never closed. Founder's rule (2026-08-10): ask
// 30 minutes after the Driver reached the destination.
//
// The anchor is ARRIVAL AT THE DESTINATION. Today that arrival is estimated
// from the booked route; with a native app it becomes observed (a geofence at
// the drop-off). One term changes and nothing else does — which is the whole
// reason this is safe to build now. See project/NEEDS_CLOSING_BRIEF.md.
// ---------------------------------------------------------------------------

/** Founder, 2026-08-10 — 30 minutes after arrival. */
export const CLOSE_BUFFER_MS = 30 * 60_000;
/**
 * A trip that never started has no arrival to be 30 minutes after, so it can't
 * use the rule above. § Q's original 3h applies instead — and it has to, because
 * a single 30-minute buffer would fire at pickup+57min on a median trip, i.e.
 * INSIDE the check-in window, replacing the schedule's red "Not checked in —
 * call them" with an amber clerical note at the only moment it's still fixable.
 */
export const NEVER_STARTED_MS = 3 * 3_600_000;
/**
 * `duration_min` is a best-effort Mapbox estimate taken at booking and is NULL
 * on seeded rows and whenever routing failed. Deliberately generous — the live
 * p90 is 55 minutes — because firing late costs a reminder and firing early
 * nags a Driver who still has the Guest in the car.
 */
export const ASSUMED_TRIP_MS = 60 * 60_000;
/** Per waypoint: the route time covers the detour, not the time spent AT a stop. */
export const STOP_DWELL_MS = 12 * 60_000;

/**
 * When the Driver should have reached the destination.
 *
 * Origin: the boarding instant where we have it, else the booked pickup. We
 * don't join `status_event` for it — `waiting_to` is written by `board_guest`
 * at the moment the Guest boards, and is NULL precisely when the Guest was on
 * time (so the booked pickup is already the right answer). That covers the case
 * that matters — a late Guest means the trip genuinely ends later — with a
 * column every caller already selects, and no second query to drift out of sync.
 */
export function expectedArrival(
  m: Pick<MissionRow, "pickup_at" | "duration_min" | "waiting_to" | "waypoints">,
  waypointCount?: number,
): number {
  const boarded = m.waiting_to ? new Date(m.waiting_to).getTime() : null;
  const origin = boarded ?? new Date(m.pickup_at).getTime();
  const stops = waypointCount ?? (Array.isArray(m.waypoints) ? m.waypoints.length : 0);
  const trip = m.duration_min != null ? m.duration_min * 60_000 : ASSUMED_TRIP_MS;
  return origin + trip + stops * STOP_DWELL_MS;
}

/**
 * § Q — the trip is past its expected end and nobody has closed it. Someone has
 * to say what happened; nothing here changes a status by itself.
 *
 * Read-time derived, like `isExpired`/`checkInOpen`: no column, no sweep, so the
 * Driver's list, the schedule, the calendar and History cannot disagree.
 */
export function needsClosing(
  m: Pick<
    MissionRow,
    | "status"
    | "pickup_at"
    | "duration_min"
    | "waiting_to"
    | "waypoints"
    | "stops_reached"
    | "mission_type"
  > & { close_answer?: CloseAnswer | null },
  now: Date = new Date(),
): boolean {
  // Slice 2 — answered is answered, whichever way. A Driver who told us the trip
  // never happened has done the thing we asked; nagging them after that is how a
  // prompt turns into noise people learn to ignore. The Business's row keeps the
  // answer visible (see `missionTone`), because for them it is now a phone call,
  // not a wait.
  if (m.close_answer) return false;
  // `accepted` is vestigial (D55) but still in the Driver's ACTIVE_STATUSES, so
  // treat it as `confirmed` rather than let one list quietly disagree with this.
  const started =
    m.status === "en_route" || m.status === "arrived" || m.status === "on_board";
  const waiting = m.status === "confirmed" || m.status === "accepted";
  if (!started && !waiting) return false;

  // At disposal has no drop-off, so there is no arrival to estimate. Nothing
  // writes `hourly` today; the guard is here so a V2 booking can't be nagged
  // through its own hire.
  if (m.mission_type && m.mission_type !== "transfer") return false;

  // Stops being ticked off is free proof the trip is being run RIGHT NOW.
  const stops = Array.isArray(m.waypoints) ? m.waypoints.length : 0;
  const reached = m.stops_reached ?? 0;
  if (stops > 0 && reached > 0 && reached < stops) return false;

  const t = now.getTime();
  const pickup = new Date(m.pickup_at).getTime();
  const due = started
    ? expectedArrival(m, stops) + CLOSE_BUFFER_MS
    : pickup + NEVER_STARTED_MS;

  // Never inside the check-in window: that hour belongs to "the Driver hasn't
  // confirmed they'll be there", which is a rescue, not a clerical note.
  return t >= Math.max(due, pickup + CHECK_IN_GRACE_MS);
}

/**
 * § Q — the Business's side of an unclosed trip. Fact, then the verb, matching
 * the check-in hint it sits beside. It says *call them*, never offers a close:
 * a Business marking a Driver's work done is a Business deciding a Driver gets
 * paid.
 */
export function needsClosingTone(
  m: Pick<MissionRow, "pickup_at" | "duration_min" | "waiting_to" | "waypoints">,
): MissionTone {
  const arrival = new Date(expectedArrival(m));
  const at = arrival.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  return {
    tone: "warn",
    label: "Not closed",
    hint: `The Driver should have arrived at ${at} and hasn’t closed the trip — call them to confirm it happened.`,
    needsAttention: true,
    wash: true,
  };
}

/**
 * § P — a trip nobody accepted before its pickup time. Shared by the `expired`
 * status and by a still-`pooled` row the sweep hasn't reached yet, so the two
 * can never drift apart on screen. Deliberately identical in the history archive:
 * "we never filled this" is worth noticing whenever a Business looks at it.
 */
const expiredTone: MissionTone = {
  tone: "danger",
  label: "Unfilled",
  hint: "No Driver accepted it before the pickup time.",
  needsAttention: true,
  wash: true,
};

/**
 * The columns a tone is derived from. Deliberately a REQUIRED Pick rather than
 * optional fields: a caller whose query forgets `duration_min` would silently
 * never flag an unclosed trip, and this codebase has already paid for that once
 * (`settledFare` needed `accepted_at`, the query omitted it, and the fix did
 * nothing until a live probe caught it). Missing a column is a compile error.
 */
export type ToneInputs = Pick<
  MissionRow,
  | "status"
  | "pickup_at"
  | "checked_in_at"
  | "duration_min"
  | "waiting_to"
  | "waypoints"
  | "stops_reached"
  | "mission_type"
> & { no_show?: boolean | null; close_answer?: CloseAnswer | null };

/**
 * § Q slice 2 — the Driver has answered that the trip never happened. Red, not
 * amber: "we're still waiting on them" has become "they've told us, and it needs
 * sorting out". Nothing has been charged or settled either way — the Business
 * phones, and in beta the founder resolves it by hand.
 */
const notDrivenTone: MissionTone = {
  tone: "danger",
  label: "Driver says it didn’t happen",
  hint: "The Driver says this trip never took place. Nothing has been charged — call them to agree what happened.",
  needsAttention: true,
  wash: true,
};

export function missionTone(
  m: ToneInputs,
  now: Date = new Date(),
  opts: { archived?: boolean } = {},
): MissionTone {
  const pickup = new Date(m.pickup_at).getTime();
  // In the history archive every pickup is in the past, so the "pickup is soon —
  // call them" urgency is never meaningful: show the calm variants instead.
  // D61 — the check-in states are a WINDOW, not "any time before pickup": a
  // pickup in the past also satisfies `<= now + 1h`, which turned every stale
  // still-confirmed trip on the schedule red. One hour of grace past the pickup
  // keeps a genuinely late trip flagged (a Driver 5 minutes late still hasn't
  // checked in) and then lets it fall back to the calm "Driver accepted".
  const notLongPast = pickup >= now.getTime() - HOURS_1;
  const within3h = !opts.archived && pickup <= now.getTime() + HOURS_3;
  const within1h = !opts.archived && pickup <= now.getTime() + HOURS_1;
  const checkInWindow = within3h && notLongPast;

  // § Q slice 2 — the Driver has told us it never happened. Outranks everything
  // below: the trip's own `status` is now describing something that didn't occur.
  if (m.close_answer === "not_driven") return notDrivenTone;

  // § Q — a trip past its expected end that nobody closed. Checked before the
  // three calm "in progress" labels below, which have no time awareness at all:
  // a trip boarded 54 days ago rendered an untroubled green "On board".
  // NOT checked before the `confirmed` branch — that one is guarded by the
  // check-in window, and this must never outrank a live rescue signal.
  const stale = needsClosing(m, now);
  if (stale && (m.status === "en_route" || m.status === "arrived" || m.status === "on_board")) {
    return needsClosingTone(m);
  }

  switch (m.status) {
    case "en_route":
      return { tone: "success", label: "En route", needsAttention: false };
    case "arrived":
      return { tone: "success", label: "Arrived", needsAttention: false };
    case "on_board":
      return { tone: "success", label: "On board", needsAttention: false };
    case "completed":
      if (m.no_show)
        return {
          tone: "warn",
          label: "No-show",
          hint: "Guest didn’t show — the trip was charged in full.",
          needsAttention: false,
        };
      return { tone: "neutral", label: "Completed", needsAttention: false };
    // D61 — check-in replaces "Driver accepted" once it opens, then the Driver's own
    // progress (En route → …) takes over above. Beyond 3h nothing is shown: a
    // Driver who hasn't checked in for tomorrow's trip is not news.
    case "confirmed":
      // § Q first: "Checked in" is not time-bounded, so a trip checked in for a
      // pickup five weeks ago kept reading as a calm, current "Checked in" — the
      // Driver said they'd be there and then nothing ever happened. It cannot
      // collide with the check-in states below: `needsClosing` can't be true
      // until pickup + 1h, which is exactly where that window closes.
      if (stale) return needsClosingTone(m);
      if (m.checked_in_at) return { tone: "info", label: "Checked in", needsAttention: false };
      if (within1h && notLongPast)
        return {
          tone: "danger",
          label: "Not checked in",
          hint: "Pickup is within the hour and the Driver hasn’t checked in — call them.",
          needsAttention: true,
          wash: true,
        };
      if (checkInWindow)
        return {
          tone: "warn",
          label: "Not checked in",
          hint: "Check-in is open and the Driver hasn’t confirmed they’ll be there yet.",
          needsAttention: false,
          wash: true,
        };
      return { tone: "info", label: "Driver accepted", needsAttention: false };
    // Vestigial since D55 — `accept_mission` confirms immediately and every old
    // row was backfilled, so nothing reaches this. Kept so an unexpected row
    // renders as something rather than falling through to the raw enum.
    case "accepted":
      return { tone: "info", label: "Accepted", needsAttention: false };
    case "pooled":
      // § P — past its pickup and still nobody took it: that trip is dead, and
      // it reads exactly like an already-swept one. The sweep (expire_stale_missions)
      // writes the real status on the next Pool/Schedule read, but the label must
      // not wait for it — showing "In the Pool" on a trip from last month is the
      // bug the founder reported. Doing it here covers the schedule, the calendar,
      // the history and the expanded row in one place.
      if (pickup <= now.getTime()) return expiredTone;
      // "No Driver yet" (still fixable) vs "Unfilled" (over) — founder's wording.
      // These used to BOTH read "Unfilled", one as a warning and one as an
      // outcome, which is the one pair of labels a Dispatcher must never confuse.
      if (within3h)
        return {
          tone: "warn",
          label: "No Driver yet",
          hint: "Pickup is soon and no Driver has accepted yet.",
          needsAttention: true,
        };
      return { tone: "neutral", label: "In the Pool", needsAttention: false };
    case "cancelled":
      return { tone: "danger", label: "Cancelled", needsAttention: false, wash: true };
    case "expired":
      return expiredTone;
    default:
      return { tone: "neutral", label: m.status, needsAttention: false };
  }
}

// Mirrors --tone-* in app/globals.css — keep the two in sync. The "info"
// (Driver accepted) tone is a desaturated steel, kept distinct from the navy
// action accent so a status pill never reads as a clickable button.
export const TONE_COLOR: Record<Tone, string> = {
  neutral: "#667085",
  info: "#1b5e8a",
  success: "#157347",
  warn: "#b54708",
  danger: "#b42318",
};

export const TONE_BG: Record<Tone, string> = {
  neutral: "#eef2f7",
  info: "#e3ebf2",
  success: "#e6f6ec",
  warn: "#fff6ed",
  danger: "#fef3f2",
};

// 'YYYY-MM-DD' in Europe/Paris — the day-bucket key for grouping/calendar.
const parisDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parisDayKey(iso: string | Date): string {
  return parisDayFmt.format(typeof iso === "string" ? new Date(iso) : iso);
}
