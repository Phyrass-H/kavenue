// § AG — the app's half of the Event Log. Server-only.
//
// The DATABASE writes every committed `mission.status` transition by itself
// (trigger `mission_event_log`), and those rows carry source='db_trigger' —
// guaranteed, unbypassable. This module writes the events the database CANNOT
// see, because they change no row the trigger watches:
//
//   a Driver checks in            — sets a timestamp, not a status
//   a Driver answers "not driven" — sets a column, not a status
//   a change is proposed/answered — lives in a side table
//   an accept is REFUSED          — nothing is written at all (see below)
//   a Guest's phone is revealed   — nothing is written at all
//
// ⚑ EVERY ROW THIS MODULE WRITES IS BEST EFFORT, AND SAYS SO. source='app' is
//   the honest label: a crash between the action and this call loses the event
//   silently. That is exactly why it must never be read as proof that something
//   did NOT happen — `isObserved()` in lib/mission-events.ts is the gate for
//   that, and it only admits db_trigger rows.
//
// ⚑ AND IT MUST NEVER BREAK THE THING IT RECORDS. A log write that throws would
//   turn "your check-in worked but we failed to note it" into "your check-in
//   failed". Every call here swallows its own errors to the server console. The
//   log is a witness, never a participant.
//
// `lib/mission-events.ts` stays pure (vocabulary, audience, ordering) so vitest
// can import it without a Supabase client. This file is the side-effecting half.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { audienceFor, type AppEvent } from "@/lib/mission-events";
import type { Json } from "@/lib/database.types";

export interface RecordEventOpts {
  missionId: string;
  type: AppEvent;
  /** Who did it. 'unknown' is a real answer and never guessed — see the table comment. */
  actorKind: "dispatcher" | "driver" | "admin" | "system" | "unknown";
  actorId?: string | null;
  actorAuthUserId?: string | null;
  /**
   * ⚑ The Driver the event is ABOUT, not the one currently assigned — the same
   * rule the trigger follows. Usually the mission's own Driver, which is the
   * default. Pass it explicitly when they differ: on `accept_rejected` the
   * Driver who tried is precisely the one who did NOT get the trip.
   */
  driverId?: string | null;
  /** Must be JSON — it goes into a jsonb column, not into memory. */
  payload?: Record<string, Json>;
  /**
   * Optional idempotency key. When set, a second call with the same key is a
   * silent no-op — enforced by `mission_event_dedupe_idx`, so two concurrent
   * requests cannot both win.
   *
   * ⚑ Use it for events driven by a RENDER rather than by an action, where the
   * same fact would otherwise be recorded once per page refresh. `contact_revealed`
   * is the case in hand: what matters is that this Driver was given this Guest's
   * number, not how many times they reloaded the screen afterwards.
   *
   * The column was introduced for the backfill's own re-run safety; live rows
   * leave it NULL and the unique index permits unlimited NULLs, so borrowing it
   * here costs nothing and adds no index.
   */
  dedupeKey?: string;
}

/**
 * Append one best-effort event. Never throws, never rejects, never blocks the
 * caller's own result.
 *
 * Deliberately `await`-ed at the call sites rather than fired and forgotten: a
 * Next.js server action can be torn down the moment it returns, so a dangling
 * promise is a lost row. The insert is one indexed write against a table with no
 * foreign keys to check — the cost is noise next to the action it follows.
 */
export async function recordMissionEvent(opts: RecordEventOpts): Promise<void> {
  try {
    const admin = createAdminClient();

    // business_id and driver_id are denormalised onto every row because RLS reads
    // them — the trigger does the same lookup. One row, primary key.
    const { data: mission } = await admin
      .from("mission")
      .select("business_id, driver_id")
      .eq("id", opts.missionId)
      .maybeSingle();
    if (!mission) return; // nothing to attach to; not worth an error

    const row = {
      mission_id: opts.missionId,
      business_id: mission.business_id,
      driver_id: opts.driverId !== undefined ? opts.driverId : mission.driver_id,
      event_type: opts.type,
      actor_kind: opts.actorKind,
      actor_id: opts.actorId ?? null,
      actor_auth_user_id: opts.actorAuthUserId ?? null,
      // ⚑ One definition of who may read what. If this ever disagrees with the
      // RLS policies the SQL wins and this is the bug (see audienceFor's note).
      audience: audienceFor(opts.type),
      source: "app",
      payload: opts.payload ?? {},
      ...(opts.dedupeKey ? { dedupe_key: opts.dedupeKey } : {}),
    };

    // ⚑ An append-only log is never UPDATEd. `ignoreDuplicates` makes this an
    // INSERT … ON CONFLICT DO NOTHING, so a repeat is dropped rather than
    // rewriting the row that already tells the truth.
    const { error } = opts.dedupeKey
      ? await admin
          .from("mission_event")
          .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true })
      : await admin.from("mission_event").insert(row);
    if (error) {
      console.error(`[§AG] ${opts.type} not logged for ${opts.missionId}:`, error.message);
    }
  } catch (e) {
    console.error(`[§AG] ${opts.type} not logged for ${opts.missionId}:`, e);
  }
}
