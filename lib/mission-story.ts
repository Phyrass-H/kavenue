// One trip's whole story, in order, in plain words.
//
// ⚑ THE FOUNDER'S FRAMING, AND IT IS THE RIGHT ONE: nobody ever thinks "let me
// open the event log". They think "why did that trip fail". So this module turns
// `mission_event` rows into sentences, and the screen that renders them is
// called Activity, not Events.
//
// Three things it must never do:
//   1. TRUST `seq`. It is insertion order, and the backfill inserted a whole
//      table at a time — the live data has `en_route` at seq 4 and `created` at
//      seq 5, six weeks apart. Order is `occurred_at`, then `seq` to break ties
//      inside one transaction. `orderEvents()` in lib/mission-events.ts already
//      does exactly that; use it, don't re-sort by hand.
//   2. PRESENT A RECONSTRUCTED TIME AS AN OBSERVED ONE. Everything before
//      2026-08-24 was rebuilt from `mission` columns and the old `status_event`
//      table, and the rows say so in `payload.caveat`. That caveat is carried
//      through to the screen, not swallowed.
//   3. DROP AN EVENT IT DOESN'T RECOGNISE. An unknown type is shown as itself.
//      A log that silently hides a row it wasn't taught about is worse than one
//      that prints something ugly.
import {
  TRIGGER_EVENTS,
  APP_EVENTS,
  isImported,
  isSeeded,
  orderEvents,
  type MissionEventRow,
  type MissionEventType,
} from "@/lib/mission-events";

/** Where in the trip's life this sits — drives nothing but the marker. */
export type StoryPhase = "booking" | "assignment" | "running" | "ending";

/**
 * ⚑ TYPE-KEYED ON THE EVENT VOCABULARY. `Record<MissionEventType, …>` means the
 * day a type is added to lib/mission-events.ts, this file stops compiling until
 * someone writes the sentence for it. That is the whole defence: an event with
 * no phrase would otherwise render as a raw enum in front of the founder, or —
 * worse — be quietly filtered out.
 */
export const PHRASES: Record<MissionEventType, { says: string; phase: StoryPhase }> = {
  created: { says: "Booked", phase: "booking" },
  pooled: { says: "Posted to the Pool", phase: "booking" },
  repooled: { says: "Put back in the Pool", phase: "booking" },
  accepted: { says: "Taken by a Driver", phase: "assignment" },
  confirmed: { says: "Confirmed", phase: "assignment" },
  checked_in: { says: "Checked in", phase: "assignment" },
  info_changed: { says: "Trip details edited", phase: "assignment" },
  amendment_proposed: { says: "Price change proposed", phase: "assignment" },
  amendment_answered: { says: "Price change answered", phase: "assignment" },
  release_proposed: { says: "Driver asked to be let go", phase: "assignment" },
  release_answered: { says: "Release request answered", phase: "assignment" },
  accept_rejected: { says: "A Driver tried to take it and was refused", phase: "assignment" },
  contact_revealed: { says: "Guest’s number shown to the Driver", phase: "assignment" },
  en_route: { says: "On the way", phase: "running" },
  arrived: { says: "Arrived at the pickup", phase: "running" },
  on_board: { says: "Guest aboard", phase: "running" },
  close_answered: { says: "Driver answered whether it happened", phase: "ending" },
  completed: { says: "Finished", phase: "ending" },
  no_show: { says: "Guest never appeared", phase: "ending" },
  cancelled: { says: "Cancelled", phase: "ending" },
  expired: { says: "Expired — nobody took it", phase: "ending" },
  // Recorded in the vocabulary, deliberately never written (founder, S66).
  pool_impression: { says: "Seen in the Pool", phase: "booking" },
  mission_viewed: { says: "Opened by a Driver", phase: "booking" },
  // § 7 — the hold. Admin-only (audienceFor), so these phrases appear on the console's
  // trip story and nowhere a Business or Driver can read them.
  // ⚑ THE WORDING KEEPS THE OUTCOMES APART. "Let it go" and "Ran out of time" describe two
  //   different Drivers, and "Trip withdrawn" is not about the Driver at all — only the last
  //   one is NOT a price signal, and a shared phrase would hide that in plain sight.
  hold_taken: { says: "Held to think", phase: "booking" },
  hold_committed: { says: "Took it after holding", phase: "assignment" },
  hold_lapsed: { says: "Ran out of time deciding", phase: "booking" },
  hold_released: { says: "Let it go before the clock", phase: "booking" },
  hold_void: { says: "Trip withdrawn while held", phase: "booking" },
};

const KNOWN = new Set<string>([...TRIGGER_EVENTS, ...APP_EVENTS]);

export interface StoryEntry {
  id: string;
  at: string;
  says: string;
  phase: StoryPhase;
  /** A short aside — the answer given, the fee charged. Null when there is none. */
  detail: string | null;
  /**
   * Set when the time is reconstructed rather than observed. The string is what
   * the record itself says is uncertain, so the screen can show it verbatim.
   */
  approxBecause: string | null;
  /**
   * Set when the row was manufactured by the seed. ⚑ A DIFFERENT CLAIM FROM
   * `approxBecause`: a reconstructed time really happened and we are unsure
   * when; a seeded one never happened at all. Merging them into one "approx"
   * would let test data pass as history.
   */
  seededLabel: string | null;
  /** True when this row's type isn't in the vocabulary — shown, never dropped. */
  unknown: boolean;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The aside worth reading, per type. Silent when the payload adds nothing. */
function detailOf(e: MissionEventRow): string | null {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case "close_answered":
      return str(p.answer) === "driven"
        ? "the Driver says it happened"
        : str(p.answer) === "not_driven"
          ? "the Driver says it didn’t happen"
          : null;
    case "cancelled": {
      const by = str(p.cancelled_by);
      const fee = p.fee;
      const who = by === "business" ? "by the hotel" : by === "driver" ? "by the Driver" : null;
      const money =
        typeof fee === "number" && fee > 0
          ? `${fee.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € charged`
          : null;
      return [who, money].filter(Boolean).join(" · ") || null;
    }
    case "repooled":
      return str(p.previous_driver_name) ? `${str(p.previous_driver_name)} walked away` : null;
    default:
      return null;
  }
}

/** Everything the log holds about one trip, ready to render. */
export function missionStory(rows: MissionEventRow[]): StoryEntry[] {
  return orderEvents(rows).map((e) => {
    const known = KNOWN.has(e.event_type);
    const phrase = known ? PHRASES[e.event_type as MissionEventType] : null;
    return {
      id: e.id,
      at: e.occurred_at,
      says: phrase?.says ?? e.event_type,
      phase: phrase?.phase ?? "assignment",
      detail: detailOf(e),
      seededLabel: isSeeded(e) ? "test data" : null,
      approxBecause: isImported(e)
        ? // The backfill wrote its own caveat into every row it created; where
          // one is missing, say the honest general thing rather than nothing.
          (str(e.payload?.caveat) ??
          "Reconstructed when the log was switched on, not observed at the time.")
        : null,
      unknown: !known,
    };
  });
}

/** How many of a story's entries are reconstructed — the footer's one number. */
export function approxCount(story: StoryEntry[]): number {
  return story.filter((s) => s.approxBecause !== null).length;
}

/** How many were manufactured. Nothing about a seeded trip is evidence. */
export function seededCount(story: StoryEntry[]): number {
  return story.filter((s) => s.seededLabel !== null).length;
}

/** ⚑ The date the log started observing. Before it, every entry is a reconstruction. */
export const LOG_LIVE_FROM = "2026-08-24";
