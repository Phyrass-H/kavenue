// S78 — the three approvals, computed once and rendered on two sides.
//
// ⚑ THE FOUNDER'S RULE, 2026-09-12: *"Absolutely and even the company has to be approved!
// none can work if all together are not approved!"* The Driver's file already had exactly
// these three piles — personal, company, vehicle (lib/account.ts:12) — so this module names
// their state rather than inventing a fourth thing to keep in step.
//
// ⚑ WHICH OF THE THREE IS A DOOR, AND WHICH IS A READING. Two doors exist in the database:
// `driver.verified` ([[d132]], made a door in S76) and the car's approval (S78,
// docs/migrations/2026-09-13_vehicle_approval_gate.sql). The COMPANY pile has no door of its
// own: a person reads the Kbis and the RC pro before they flip `verified`, so a second switch
// beside it would be one more thing to forget, always flipped together with the first. What
// this module does is make the company pile VISIBLE at the moment of that judgement, on both
// screens, so "all three are in order" is something a reviewer can see rather than remember.
// ⚑ If the founder later wants the company to be its own act, it is one column and one button
// — the shape here already has a place for it.
import { docState, driverDocTypes, type DocState } from "@/lib/account";
import type { DocView } from "@/lib/documents";
import type { DriverRow, VehicleRow } from "@/lib/database.types";
import { statusOf } from "@/lib/vehicle-approval";

export type ApprovalPile = "person" | "company" | "vehicle";

/** done = nothing left · waiting = a person owes them an answer · todo = the Driver owes us
 *  something. ⚑ The order matters on screen: "todo" is the only one they can act on. */
export type PileState = "done" | "waiting" | "todo";

export interface Pile {
  pile: ApprovalPile;
  /** What the Driver calls it on their own screen. */
  label: string;
  state: PileState;
  /** The state in words, e.g. "approved", "with us", "2 papers to add". */
  says: string;
}

export const PILE_LABEL: Record<ApprovalPile, string> = {
  person: "You",
  company: "Your company",
  vehicle: "Your car",
};

/** The admin says the same three things about someone else. */
export const PILE_LABEL_ADMIN: Record<ApprovalPile, string> = {
  person: "Person",
  company: "Company",
  vehicle: "Vehicle",
};

const NEEDS_THEM: readonly DocState[] = ["missing", "rejected", "expired"];

function papersState(docs: DocView[], now: Date): { state: PileState; says: string } {
  if (docs.length === 0) return { state: "todo", says: "no papers yet" };
  const states = docs.map((d) => docState(d, now));
  const owed = states.filter((s) => NEEDS_THEM.includes(s)).length;
  if (owed > 0) return { state: "todo", says: `${owed} paper${owed > 1 ? "s" : ""} to add` };
  const waiting = states.filter((s) => s === "pending").length;
  if (waiting > 0) return { state: "waiting", says: `${waiting} with us` };
  const expiring = states.filter((s) => s === "expiring").length;
  if (expiring > 0) return { state: "done", says: `valid · ${expiring} expiring soon` };
  return { state: "done", says: "valid" };
}

/** ⚑ Kept as a plain function of rows so both screens and the tests read the same rule. The
 *  date formatting is the caller's job — this module returns facts, not sentences with
 *  timezones in them. */
export function approvalPiles(
  driver: DriverRow,
  liveCar: VehicleRow | null,
  docs: DocView[],
  now: Date = new Date(),
): Pile[] {
  const byGroup = (group: "personal" | "company" | "vehicle") => {
    const types = new Set<string>(driverDocTypes(group));
    return docs.filter((d) => types.has(d.type));
  };

  // The person: `verified` is the act. The papers under it explain what a reviewer is
  // waiting for, but they never decide — [[d132]]: the flag is a separate judgement.
  const personPapers = papersState(byGroup("personal"), now);
  const person: Pile = driver.verified
    ? { pile: "person", label: PILE_LABEL.person, state: "done", says: "approved" }
    : {
        pile: "person",
        label: PILE_LABEL.person,
        // Their papers are in and nobody has ruled yet → they are waiting on us, not we on them.
        state: personPapers.state === "todo" ? "todo" : "waiting",
        says: personPapers.state === "todo" ? personPapers.says : "your file is with us",
      };

  const companyPapers = papersState(byGroup("company"), now);
  const company: Pile = { pile: "company", label: PILE_LABEL.company, ...companyPapers };

  let vehicle: Pile;
  if (!liveCar || liveCar.retired_at) {
    vehicle = { pile: "vehicle", label: PILE_LABEL.vehicle, state: "todo", says: "no car on file" };
  } else {
    const status = statusOf(liveCar);
    vehicle =
      status === "approved"
        ? { pile: "vehicle", label: PILE_LABEL.vehicle, state: "done", says: "approved" }
        : status === "rejected"
          ? { pile: "vehicle", label: PILE_LABEL.vehicle, state: "todo", says: "needs correcting" }
          : { pile: "vehicle", label: PILE_LABEL.vehicle, state: "waiting", says: "with us" };
  }

  return [person, company, vehicle];
}

/** May this Driver take work at all? ⚑ The app's reading of it — the database enforces its own
 *  half (driver.verified in accept_mission/place_hold, the car in the S78 trigger), and this
 *  must never be the only test. A screen that decides who may work is a screen someone can
 *  skip with a stale tab. */
export function mayTakeWork(driver: DriverRow, liveCar: VehicleRow | null): boolean {
  return Boolean(driver.verified) && Boolean(liveCar) && !liveCar!.retired_at
    && statusOf(liveCar) === "approved";
}
