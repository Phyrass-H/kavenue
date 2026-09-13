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
import { carBlockOf, statusOf } from "@/lib/vehicle-approval";

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

/** ⚑ S79 — ONLY WHAT THE RULE READS. The Driver's own file passes whole DocViews; the admin
 *  list passes one slot per paper from lib/document-views.ts, without the signed URLs. */
export type DocFacts = Pick<DocView, "type" | "status" | "expiresAt">;

type LiveCar = Pick<VehicleRow, "approval_status" | "retired_at"> | null;

const NEEDS_THEM: readonly DocState[] = ["missing", "rejected", "expired"];

/** The papers of one pile. */
function docsIn(docs: readonly DocFacts[], group: "personal" | "company" | "vehicle"): DocFacts[] {
  const types = new Set<string>(driverDocTypes(group));
  return docs.filter((d) => types.has(d.type));
}

/** How many of these papers the Driver still has to send: missing, refused or lapsed. */
function owedIn(docs: readonly DocFacts[], now: Date): number {
  return docs.filter((d) => NEEDS_THEM.includes(docState(d, now))).length;
}

function papersState(docs: readonly DocFacts[], now: Date): { state: PileState; says: string } {
  if (docs.length === 0) return { state: "todo", says: "no papers yet" };
  const states = docs.map((d) => docState(d, now));
  const owed = owedIn(docs, now);
  if (owed > 0) return { state: "todo", says: `${owed} paper${owed > 1 ? "s" : ""} to add` };
  // ⚑ FROM THE REVIEW STATUS, NOT docState. docState ranks expiry above review, so a pending RC Pro
  //   expiring within 30 days read "expiring" — the pile said "valid" with nobody having looked at
  //   it, and the Company pill vanished from the admin list (S79 final review). Expired papers are
  //   already counted as owed above, so every pending paper left here is one a person must look at.
  const waiting = docs.filter((d) => d.status === "pending").length;
  if (waiting > 0) return { state: "waiting", says: `${waiting} with us` };
  const expiring = states.filter((s) => s === "expiring").length;
  if (expiring > 0) return { state: "done", says: `valid · ${expiring} expiring soon` };
  return { state: "done", says: "valid" };
}

/** ⚑ Kept as a plain function of rows so both screens and the tests read the same rule. The
 *  date formatting is the caller's job — this module returns facts, not sentences with
 *  timezones in them. */
export function approvalPiles(
  driver: Pick<DriverRow, "verified">,
  liveCar: LiveCar,
  docs: readonly DocFacts[],
  now: Date = new Date(),
): Pile[] {
  // The person: `verified` is the act. The papers under it explain what a reviewer is
  // waiting for, but they never decide — [[d132]]: the flag is a separate judgement.
  const personPapers = papersState(docsIn(docs, "personal"), now);
  const person: Pile = driver.verified
    ? { pile: "person", label: PILE_LABEL.person, state: "done", says: "approved" }
    : {
        pile: "person",
        label: PILE_LABEL.person,
        // Their papers are in and nobody has ruled yet → they are waiting on us, not we on them.
        state: personPapers.state === "todo" ? "todo" : "waiting",
        says: personPapers.state === "todo" ? personPapers.says : "your file is with us",
      };

  const companyPapers = papersState(docsIn(docs, "company"), now);
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
export function mayTakeWork(driver: Pick<DriverRow, "verified">, liveCar: LiveCar): boolean {
  return Boolean(driver.verified) && Boolean(liveCar) && !liveCar!.retired_at
    && statusOf(liveCar) === "approved";
}

// ── S79 — the same three piles, in the words an ADMIN reads ─────────────────────────────
//
// ⚑ THE FOUNDER, 2026-09-13, on the running page: the section is *"To be approved"*, and *"the
// term '… with us' don't really make sense to me"* — then *"yes change the detail page too"*.
// So everywhere an admin reads a pile — the list's pills and the tiles on a Driver's page — it
// says either what a person at Kavenue has to do ("to approve") or what the Driver has to do
// ("2 documents needed", "refused", "none yet"). "with us" stays on the DRIVER's own screens, where
// the reader is the one waiting and it means exactly that.
// ⚑ ONE SPELLING FOR BOTH ADMIN SCREENS. The pills are built from adminPiles below, so the list
// and the Driver's page cannot drift apart the way four spellings of "this Driver's car" did.

const TO_APPROVE = "to approve";

/** ⚑ S80 — "documents needed", the founder's words from the support desk's side (2026-09-13): "2 papers
 *  to send" read as an instruction to the Driver. "Needed" and NOT "missing", because the count is
 *  owedIn's — a paper never sent, one refused and one expired all count, and only the first is missing. */
export const documentsNeeded = (n: number) =>
  n > 0 ? `${n} document${n > 1 ? "s" : ""} needed` : "documents needed";

/** A pile as an admin reads it. `detail` is the second fact a DONE pile can still carry — S80, the
 *  founder, on the "To be approved" table: an approved person with papers outstanding reads
 *  "Approved · 2 documents needed", not a bare "Approved". Null on every pile that is not done. */
export interface AdminPile extends Pile {
  detail: string | null;
}

/** A pile's state in an admin's words. The STATE never changes — only the sentence. */
function adminSays(p: Pile, liveCar: LiveCar, docs: readonly DocFacts[], now: Date): string {
  switch (p.state) {
    case "done":
      // ⚑ S80 — THE HEADLINE ONLY. The company's "valid · 1 expiring soon" was one string; a table cell
      //   is 142px, so the second fact moved to `detail` and the Driver's page tile joins them back.
      return p.pile === "company" ? "valid" : "approved";
    case "waiting":
      return TO_APPROVE;
    case "todo":
      if (p.pile === "vehicle") return carBlockOf(liveCar) === "car_rejected" ? "refused" : "none yet";
      return documentsNeeded(owedIn(docsIn(docs, p.pile === "person" ? "personal" : "company"), now));
    default: {
      // ⚑ A fourth PileState is a compile error here, not a tile with no words.
      const unreachable: never = p.state;
      return unreachable;
    }
  }
}

/** What a DONE pile still has to say, or null. Only ever something the Driver owes or will soon owe —
 *  a done pile has nothing left for a person at Kavenue to do. */
function adminDetail(p: Pile, docs: readonly DocFacts[], now: Date): string | null {
  // The car pile is the car's approval; its papers have never been part of it (approvalPiles).
  if (p.state !== "done" || p.pile === "vehicle") return null;
  const papers = docsIn(docs, p.pile === "person" ? "personal" : "company");
  // ⚑ THE PERSON IS THE PILE THAT CAN BE DONE WHILE PAPERS ARE OWED: `verified` is a judgement ([[d132]])
  //   and the papers never decide it. On the live fleet, 9 approved Drivers owe the REVTC register and
  //   the medical certificate (measured S80). A done company already means nothing is owed.
  const owed = owedIn(papers, now);
  if (owed > 0) return documentsNeeded(owed);
  const expiring = papers.filter((d) => docState(d, now) === "expiring").length;
  return expiring > 0 ? `${expiring} expiring soon` : null;
}

/** The three tiles on a Driver's admin page, and the three cells of a "To be approved" row:
 *  approvalPiles' states, in the admin's words. */
export function adminPiles(
  driver: Pick<DriverRow, "verified">,
  liveCar: LiveCar,
  docs: readonly DocFacts[],
  now: Date = new Date(),
): AdminPile[] {
  return approvalPiles(driver, liveCar, docs, now).map((p) => ({
    ...p,
    says: adminSays(p, liveCar, docs, now),
    detail: adminDetail(p, docs, now),
  }));
}

/** One pill on an admin row. `owed` is whose move it is: "us" = a person at Kavenue has to
 *  approve something, "them" = the Driver owes something. The page tones the two differently,
 *  because only the first is work waiting for whoever is reading. */
export interface Blocker {
  pile: ApprovalPile;
  says: string;
  owed: "us" | "them";
}

/** The pill's first word. "Car", not PILE_LABEL_ADMIN's "Vehicle": it is what the founder
 *  approved on the preview, and it is the shorter word on a crowded row. */
export const PILL_WORD: Record<ApprovalPile, string> = { person: "Person", company: "Company", vehicle: "Car" };

/**
 * What stands between a Driver and the Pool, as the admin list names it — in the order a
 * reviewer works through it: the person, their company, their car. Empty means they can work.
 *
 * ⚑ EMPTY EXACTLY WHEN mayTakeWork IS TRUE — tests/driver-blockers.test.ts walks every
 * combination. A row that says nothing while the Driver cannot work would be the one lie the
 * "To be approved" list can tell.
 * ⚑ THE COMPANY GETS ITS OWN PILL WHILE THE PERSON IS UNAPPROVED — the founder expected to see
 * it *"the same way"* as the person and the car (2026-09-13). It still has no door ([[d137]]
 * rule 1): approving the person approves their company with them, so once the person is
 * approved the company says nothing, and a lapsed Kbis alone never lists anybody here.
 */
export function blockersOf(
  driver: Pick<DriverRow, "verified">,
  liveCar: LiveCar,
  docs: readonly DocFacts[],
  now: Date = new Date(),
): Blocker[] {
  if (mayTakeWork(driver, liveCar)) return [];
  const [person, company, vehicle] = adminPiles(driver, liveCar, docs, now);
  const pill = (p: Pile): Blocker => ({
    pile: p.pile,
    says: `${PILL_WORD[p.pile]} · ${p.says}`,
    owed: p.state === "waiting" ? "us" : "them",
  });
  const out: Blocker[] = [];
  if (!driver.verified) {
    out.push(pill(person));
    if (company.state !== "done") out.push(pill(company));
  }
  if (vehicle.state !== "done") out.push(pill(vehicle));
  return out;
}
