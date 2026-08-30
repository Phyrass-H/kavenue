// "What's left before I can work?" — one honest answer, computed from the same
// rows the account screens render. Deliberately NOT a completion percentage: a
// Driver needs to know which paper is missing, not that they're 80% of a person.
//
// Beta note: this SHOWS gaps, it does not gate the Pool. No beta Driver has filed
// anything yet, so enforcing would empty every Pool overnight. Flip `blocksWork`
// into the Pool query when real Drivers onboard (BACKLOG).
import { docState, docStateLabel, documentLabel, blocksWork } from "@/lib/account";
import type { DocView } from "@/lib/documents";
import type { Database } from "@/lib/database.types";

type DriverRow = Database["public"]["Tables"]["driver"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicle"]["Row"];

export interface Gap {
  label: string;
  href: string;
  /** A blocker stops work; a warning is a deadline coming at you. */
  tone: "block" | "warn";
}

export interface Readiness {
  gaps: Gap[];
  blockers: number;
  warnings: number;
  /** Steps satisfied / total — drives the segment bar, not a percentage. */
  done: number;
  total: number;
  headline: string;
}

export function driverReadiness(
  driver: DriverRow,
  vehicle: VehicleRow | null,
  docs: DocView[],
  now: Date = new Date(),
): Readiness {
  const gaps: Gap[] = [];

  if (!driver.profile_photo_url) {
    gaps.push({ label: "Add a profile photo", href: "/settings/profile", tone: "warn" });
  }
  if (!driver.phone) {
    gaps.push({ label: "Add your phone number", href: "/settings/profile", tone: "block" });
  }
  if (driver.base_lat == null || driver.base_lng == null) {
    gaps.push({ label: "Set where you work", href: "/settings/area", tone: "block" });
  }
  if (!vehicle?.make || !vehicle?.model || !vehicle?.plate) {
    gaps.push({ label: "Finish your vehicle details", href: "/settings/vehicle", tone: "block" });
  }
  // S72 — the exploitant mentions of the arrêté du 6 août 2025. Without them Kavenue
  // cannot issue the Waybill (lib/waybill.ts), so a Driver stopped at a check has nothing
  // to show. That is a blocker in substance even though this module still only SHOWS.
  // ⚑ SIRET was a warning until S72; it carries mention 3° (the SIREN is its first nine
  //   digits), so it is now a blocker for the same reason as the other two.
  if (!driver.siret) {
    gaps.push({ label: "Add your SIRET", href: "/settings/company", tone: "block" });
  }
  if (!driver.registered_address) {
    gaps.push({
      label: "Add your registered address",
      href: "/settings/company",
      tone: "block",
    });
  }
  if (!driver.revtc_number) {
    gaps.push({ label: "Add your REVTC number", href: "/settings/company", tone: "block" });
  }
  // Not one of the seven — the card itself is on the windscreen. It prints on the Waybill
  // because a controller cross-checks it, so its absence is a deadline, not a wall.
  if (!driver.pro_card_number) {
    gaps.push({
      label: "Add your professional card number",
      href: "/settings/company",
      tone: "warn",
    });
  }

  for (const doc of docs) {
    const state = docState(doc, now);
    if (state === "valid" || state === "pending") continue;
    gaps.push({
      // Labels stay verbatim: lower-casing turns "VTC card" into "vtc card".
      label:
        state === "missing"
          ? `Add your ${documentLabel(doc.type)}`
          : `${documentLabel(doc.type)} — ${docStateLabel(state, doc, now)}`,
      href: `/settings/documents/${doc.type}`,
      tone: blocksWork(state) ? "block" : "warn",
    });
  }

  // Blockers first — the hub only shows the first few, and "add a photo" must not
  // push "your licence is missing" out of sight.
  gaps.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "block" ? -1 : 1));

  // Every check above is one step; the bar fills as they're cleared.
  const total = 8 + docs.length;
  const done = total - gaps.length;
  const blockers = gaps.filter((g) => g.tone === "block").length;
  const warnings = gaps.length - blockers;

  const headline =
    gaps.length === 0
      ? "Your file is complete"
      : blockers > 0
        ? `${blockers} thing${blockers > 1 ? "s" : ""} left before you can drive`
        : `${warnings} thing${warnings > 1 ? "s" : ""} to keep an eye on`;

  return { gaps, blockers, warnings, done, total, headline };
}
