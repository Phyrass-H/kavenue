// S78 — a car is approved by a person, or it does not work.
//
// ⚑ THE FOUNDER'S RULE, 2026-09-12: *"a driver with a pending car validation just cannot
// work, period! So a driver with no approved car just cannot access the pool, period this is
// MANDATORY!"* — and the reason they gave, which is the one to remember when this feels
// strict: *"imagine a car accident with a non approved car?"*
//
// ⚑ AND WHY THIS MODULE EXISTS AT ALL. Until today the codebase had FOUR answers to "which
// car is this Driver's" — the oldest row, the active one, whatever PostgREST returned last —
// and [[d113]] found three of them disagreeing about one trip. There are now two, on purpose:
// working_car() in SQL (the gate and the stamp, docs/migrations/2026-09-13_*) and this file in
// TypeScript (every screen). A fifth cannot appear by accident, because the context no longer
// exposes a field called `vehicle` for someone to reach for — see lib/app-context.ts.
import type { ApprovalStatus, VehicleRow } from "@/lib/database.types";

/** What a person decided about this car. Never computed from the papers ([[d132]]'s rule, one
 *  level down): a document is verified by one act, a car is approved by another. Declared
 *  beside the Row type so the two cannot drift; re-exported here so callers have one import. */
export type { ApprovalStatus };

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "rejected"];

export function isApprovalStatus(v: unknown): v is ApprovalStatus {
  return typeof v === "string" && (APPROVAL_STATUSES as readonly string[]).includes(v);
}

/** ⚑ The raise text the database uses when it refuses work for the CAR. It must never contain
 *  NOT_APPROVED_RAISE ("not yet approved", lib/driver-review.ts) — that one means the PERSON is
 *  under review, and the app sends those two refusals to two different screens. The database
 *  side of this string lives in docs/migrations/2026-09-13_vehicle_approval_gate.sql; the test
 *  in tests/vehicle-approval.test.ts pins them together. */
export const CAR_AWAITING_RAISE = "car awaiting approval";

/** Does this Postgres error mean "the car is not approved"? Lower-cased before matching
 *  because the two callers disagree about case and one of them always will. */
export function isCarAwaitingError(message: string | null | undefined): boolean {
  return (message ?? "").toLowerCase().includes(CAR_AWAITING_RAISE);
}

/** A car row as the app reads it. The lifecycle columns are optional in the type only because
 *  the generated Row is regenerated from the live schema; every live row has them (M1 wrote a
 *  default), and `statusOf` treats an absent value as pending rather than as "fine". */
export type CarRow = VehicleRow;

export function statusOf(car: Pick<CarRow, "approval_status"> | null | undefined): ApprovalStatus {
  const raw = car?.approval_status;
  return isApprovalStatus(raw) ? raw : "pending";
}

export function isRetired(car: Pick<CarRow, "retired_at"> | null | undefined): boolean {
  return Boolean(car?.retired_at);
}

/** ⚑ THE ONE PREDICATE. The TypeScript twin of working_car(uuid). A car works when a person
 *  approved it and it has not been replaced — nothing else, and never `is_active` (nothing
 *  writes that column, and "no car pause" is decided). */
export function isWorkingCar(
  car: Pick<CarRow, "approval_status" | "retired_at"> | null | undefined,
): boolean {
  return Boolean(car) && statusOf(car) === "approved" && !isRetired(car);
}

/** The Driver's LIVE car: the one they filed, whatever a person has decided about it yet.
 *  This is what their own settings page shows and what the enrollment guard asks about — a
 *  Driver with a pending car has a car, and must not be sent back to enrollment. */
export function liveCarOf<T extends Pick<CarRow, "retired_at" | "created_at">>(cars: T[]): T | null {
  const live = cars.filter((c) => !isRetired(c));
  if (live.length === 0) return null;
  // The unique index vehicle_one_live_per_driver makes this at most one. Sorting anyway so
  // that a database which has not had M4 pasted yet still answers the same way twice.
  return [...live].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]!;
}

/** The car the Pool, the accept and the Waybill may use. NULL means: this Driver cannot work
 *  right now, and every screen has to say which of the reasons below it is. */
export function workingCarOf<T extends Pick<CarRow, "approval_status" | "retired_at" | "created_at">>(
  cars: T[],
): T | null {
  const live = liveCarOf(cars);
  return live && isWorkingCar(live) ? live : null;
}

/** Why a Driver cannot take work, in the order a person would say it out loud. `null` means
 *  nothing is in the way. ⚑ Exhaustive by construction: a new state has to be added to
 *  `CarBlock` and then to CAR_BLOCK_SAYS, or the compiler refuses the file. */
export type CarBlock = "no_car" | "car_pending" | "car_rejected";

export const CAR_BLOCK_SAYS: Record<CarBlock, string> = {
  no_car: "You have no car on file yet.",
  car_pending: "Your car is with us. We check every car by hand.",
  car_rejected: "Your car was refused. Correct it and we will look again.",
};

export function carBlockOf(
  car: Pick<CarRow, "approval_status" | "retired_at"> | null | undefined,
): CarBlock | null {
  if (!car || isRetired(car)) return "no_car";
  const status = statusOf(car);
  if (status === "approved") return null;
  return status === "rejected" ? "car_rejected" : "car_pending";
}

/** What the Driver's own screens call the state of their car. Short, because it sits in a pill
 *  next to the car's name. */
export const CAR_STATUS_PILL: Record<ApprovalStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Needs correcting",
};

/** ⚑ WHAT A BLOCKED DRIVER READS, in one place, because there are four surfaces again — the
 *  Pool, the trip page before the tap, a refused accept and a refused hold — and they drifted
 *  last time (lib/driver-review.ts was written for exactly this reason, for the PERSON).
 *
 *  ⚑ AND IT IS NOT THE SAME RULE AS THE PERSON'S. The founder kept the Pool VISIBLE to a
 *  Driver whose file is under review (2026-09-07): *"a professional who can see the work knows
 *  what they are waiting for."* For the CAR they ruled the opposite, 2026-09-12: *"a driver
 *  with no approved car just cannot access the pool, period this is MANDATORY"* — the reason
 *  being the car itself, not the paperwork: *"imagine a car accident with a non approved
 *  car?"*. So the person waits with the trips in front of them; the car closes the Pool.
 *
 *  No timeframe is promised here either. The queue has run to 40 days before now. */
export const CAR_REVIEW = {
  /** The Pool, in place of the trips. */
  poolTitle: "The Pool is closed to you right now",
  poolBody: "Your car is with us. Trips come back the moment it’s approved.",
  /** The trip page, in place of the button — said BEFORE they tap, not after. */
  beforeTap: "Your car is with us. You’ll be able to take trips as soon as it’s approved.",
  /** After a refused accept or hold, if one ever gets through a stale page. */
  refused: "Your car isn’t approved yet, so this trip couldn’t be taken.",
  /** The settings page, where the car itself is. */
  checked: "We check every car by hand.",
} as const;

/** Which door wrote a row. Stamped on every write so the change log can say "the admin screen
 *  did this, not the Driver" — and so a seeded row is never mistaken for evidence. */
export type WriteVia = "onboarding" | "settings" | "admin" | "seed";
