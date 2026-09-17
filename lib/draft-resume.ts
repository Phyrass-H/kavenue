// Resuming a saved draft — which columns the Dispatcher's own session may write,
// and which the server stamps.
//
// ⚑ WHY THIS FILE EXISTS (S82, 2026-09-17). `app/(dispatch)/dispatch/new/actions.ts`
// resumed a draft with ONE update on the user session, carrying every column of the
// form row. Since 2026-08-31f the `mission` UPDATE grant is an explicit column list,
// and 2026-09-04 added `standard_vat_rate` to the row WITHOUT adding it to that list —
// on purpose: *"Nothing in a browser session may write a tax rate."* Postgres checks
// UPDATE privilege on every column in the SET list before it reads a single row, so
// every draft resume — "Save as draft" or "Post" — came back 42501 and the Business
// read "Something went wrong. Please try again." A retry could never work. New posts
// were fine: they INSERT, and INSERT is not column-granted.
//
// ⚑ THE FIX IS NOT A WIDER GRANT. The snapshot columns below are numbers the SERVER
// derives (docs/06 §9) — the rate card, the commission rates, the statutory VAT rate,
// the auction's opening. A Dispatcher never types them, so the Dispatcher's session
// has no business being the thing that writes them. They go through the service role,
// scoped to this Business's own draft, BEFORE the session update.
//
// ⚑ AND NOT A WHOLE SERVICE-ROLE WRITE EITHER. `status` must stay on the user session:
// the mission event log (2026-08-24) records who posted a trip from `auth.uid()`, and
// the service role has none — a posted trip would read "posted by unknown".
//
// ⚑ `tests/draft-resume-grant.test.ts` replays every `docs/migrations/` file and fails
// when a column below is not in the effective UPDATE grant. A migration that narrows
// the grant turns that test red, not the live draft page.
import type { Database } from "@/lib/database.types";

type MissionUpdate = Database["public"]["Tables"]["mission"]["Update"];
type MissionColumn = keyof MissionUpdate;

/** Written on the Dispatcher's own session — what the form says, plus the post-time
 *  `status` and `created_at` (the PDP climb origin, reset on post). */
export const DRAFT_RESUME_SESSION_COLUMNS = [
  "business_id",
  "dispatcher_id",
  "status",
  "category",
  "zone",
  "pickup_address",
  "pickup_lat",
  "pickup_lng",
  "dropoff_address",
  "dropoff_lat",
  "dropoff_lng",
  "waypoints",
  "pickup_at",
  "passenger_name",
  "passenger_names",
  "pax_count",
  "luggage_count",
  "luggage_only",
  "flight_number",
  "reference",
  "ceiling",
  "speed_win",
  "required_body_type",
  "required_make",
  "required_model",
  "required_languages",
  "dress_code",
  "driver_flags",
  "board_name",
  "driver_message",
  "distance_km",
  "duration_min",
  "board_file_path",
  "pickup_label",
  "dropoff_label",
  "created_at",
] as const satisfies readonly MissionColumn[];

/** docs/06 §9 snapshot — stamped server-side through the service role. */
export const DRAFT_RESUME_STAMPED_COLUMNS = [
  "rate_card_id",
  "night_applied",
  "commission_business_rate",
  "commission_driver_rate",
  "commission_vat_rate",
  "standard_vat_rate",
  "pdp_start",
  "pdp_step",
  "pdp_interval",
] as const satisfies readonly MissionColumn[];

export type DraftResumeSessionColumn = (typeof DRAFT_RESUME_SESSION_COLUMNS)[number];
export type DraftResumeStampedColumn = (typeof DRAFT_RESUME_STAMPED_COLUMNS)[number];
type DraftResumeColumn = DraftResumeSessionColumn | DraftResumeStampedColumn;

const SESSION = new Set<string>(DRAFT_RESUME_SESSION_COLUMNS);
const STAMPED = new Set<string>(DRAFT_RESUME_STAMPED_COLUMNS);

/**
 * Split a draft-resume row into the two writes. Only keys PRESENT on the row are
 * carried, so the conditional spreads in the action (`eta`, `opening`, a board file,
 * labels) keep meaning "absent, not overwritten".
 *
 * ⚑ A column in NEITHER list is a compile error (a new key on the action's `row`) and,
 * failing that, a throw — never a silent drop. A dropped column would be written on a
 * new post and quietly lost on every resumed draft.
 */
export function splitDraftResume<T extends Partial<Record<DraftResumeColumn, unknown>>>(
  row: T & Record<Exclude<keyof T, DraftResumeColumn>, never>,
): {
  session: Pick<MissionUpdate, DraftResumeSessionColumn>;
  stamped: Pick<MissionUpdate, DraftResumeStampedColumn>;
} {
  const session: Record<string, unknown> = {};
  const stamped: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (SESSION.has(column)) session[column] = value;
    else if (STAMPED.has(column)) stamped[column] = value;
    else throw new Error(`draft resume: "${column}" is in neither column list in lib/draft-resume.ts`);
  }
  return { session, stamped };
}
