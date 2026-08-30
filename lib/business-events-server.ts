// Things that happen to a Business ACCOUNT rather than to a trip. Server-only.
//
// `lib/mission-events-server.ts` is the model this follows, including the two
// rules that matter most about it:
//
// ⚑ EVERY ROW HERE IS BEST EFFORT, AND SAYS SO. `source='app'` is the honest
//   label — nothing in the database can observe a refusal, so a crash between
//   the refusal and this call loses the event in silence. It may prove something
//   DID happen; it must never be read as proof that something did NOT.
//
// ⚑ AND IT MUST NEVER BREAK THE THING IT RECORDS. A log write that threw would
//   turn "you were stopped, and we failed to note it" into a 500. Errors are
//   swallowed to the server console. The log is a witness, never a participant.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

/**
 * ⚑ ONE VALUE, AND ADDING A SECOND IS A DECISION. `trip_posted` is deliberately
 * NOT here: the success side of the funnel is already recorded, guaranteed, by
 * the `mission_event` trigger as `pooled`. A copy in this table would be a second
 * source of truth for one fact, and the two would disagree the first time either
 * missed a write.
 */
export const BUSINESS_EVENTS = ["post_blocked"] as const;
export type BusinessEvent = (typeof BUSINESS_EVENTS)[number];

export interface RecordBusinessEventOpts {
  businessId: string;
  type: BusinessEvent;
  dispatcherId?: string | null;
  actorAuthUserId?: string | null;
  /** Must be JSON — it goes into a jsonb column, not into memory. */
  payload?: Record<string, Json>;
}

export async function recordBusinessEvent(opts: RecordBusinessEventOpts): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("business_event").insert({
      business_id: opts.businessId,
      dispatcher_id: opts.dispatcherId ?? null,
      event_type: opts.type,
      actor_auth_user_id: opts.actorAuthUserId ?? null,
      source: "app",
      payload: opts.payload ?? {},
    });
    if (error) {
      // Reported, never raised — see the header. A missing log entry is a gap in
      // the record; a thrown one is a broken screen.
      console.error("[business_event] insert failed", opts.type, error.message);
    }
  } catch (err) {
    console.error("[business_event] insert threw", opts.type, err);
  }
}
