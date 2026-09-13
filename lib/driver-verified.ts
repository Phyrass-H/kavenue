// What a Driver approval writes to the `driver` row — who, when, and through which door.
//
// ⚑ S80 — THE APPROVAL WAS LOGGED AS THE DRIVER'S OWN ACT. `setDriverVerified` wrote `verified` and
// nothing else. The change-log trigger (docs/migrations/2026-09-12c_vehicle_and_driver_event.sql § 4)
// copies `last_written_by` / `last_written_via` into `driver_event`, and an UPDATE that does not set
// them keeps the previous writer's values — the Driver's own id through 'onboarding' or 'settings',
// or NULL for a row not written since those columns arrived. So from 2026-09-12 an approval or a
// suspension would have been filed as the Driver's own act, or as nobody's. (None had happened
// yet — 0 events, measured S80.) The founder, on hearing it: *"fix the approval log now"*.
// ⚑ A PLAIN MODULE, NOT THE SERVER ACTION'S FILE: a "use server" file may export only async
// functions, and this is the part worth testing.

/** The columns one approval (or its withdrawal) writes, in the same UPDATE as the flag itself. */
export interface VerifiedPatch {
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  last_written_by: string;
  last_written_via: "admin";
}

/**
 * ⚑ `verified_at` / `verified_by` describe the approval that is IN FORCE, so taking it back clears
 * them — the same shape as a refused car clearing `approved_at` / `approved_by`
 * (lib/vehicle-review.ts). The withdrawal itself is not lost: the trigger files a `suspended`
 * event, dated, with the admin as its actor.
 */
export function verifiedPatch(next: boolean, adminUid: string, at: Date): VerifiedPatch {
  return {
    verified: next,
    verified_at: next ? at.toISOString() : null,
    verified_by: next ? adminUid : null,
    last_written_by: adminUid,
    last_written_via: "admin",
  };
}
