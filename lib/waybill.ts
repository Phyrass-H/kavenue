// § 4 — the Waybill: the *justificatif de réservation préalable* a Driver shows at a
// roadside check.
//
// THE LAW, IN ONE PLACE. Art. R. 3120-2 du code des transports lets a Driver prove the
// prior booking "au moyen d'un document écrit sur un support papier ou électronique", and
// says the CONDUCTEUR must present it on demand. The **arrêté du 6 août 2025** (JORF
// n° 0200, texte n° 17; in force 29 October 2025) enumerates what must be on it. Seven
// mentions, in the law's own numbering — which this module preserves in COMMENTS and in
// section order, but no longer prints. ⚑ The 1°–7° marks were on the document until
// 2026-09-01 and the founder took them off: the arrêté requires the seven pieces of
// INFORMATION, never its own numbering, and the section headings already say which is
// which. Nothing mandatory left with them. The numbering stays here because this is where
// the law is written down:
//
//   1°  the exploitant VTC's name / dénomination sociale + coordonnées
//   2°  its number in the register of art. L. 3122-3 (REVTC)
//   3°  its unique identification number (SIREN, art. D. 123-235 c. com.)
//   4°  the name + telephone of the client who ordered the trip
//   5°  the date + time the client made the booking
//   6°  the date + time of pickup the client asked for
//   7°  the pickup location the client indicated
//
// ⚑ THE EXPLOITANT IS THE DRIVER'S COMPANY, NEVER KAVENUE (CLAUDE.md hard rule 2,
//   docs/01:11). Kavenue is an agent. Putting Kavenue in 1°–3° would assert on paper, to a
//   police officer, that Kavenue operates the transport. The document says whose behalf it
//   is produced on, and `WAYBILL_ISSUER_NOTE` is that sentence.
//
// ⚑ WHAT IS *NOT* ON THE LEGAL LIST, though every template on the internet shows it: the
//   destination, the price, the Driver's own name, the plate, the passenger. The Driver's
//   capacity is proven by the carte professionnelle on the windscreen (art. R. 3120-6), not
//   here. They are on our document because the founder asked for them (S72) and because
//   they are what a controller cross-checks — but they are extras, and if one is missing
//   the document is still valid. Only `waybillGaps()` blocks.
//
// ⚑ AND NOT THE CEILING, NOT THE BUSINESS'S ALL-IN, NOT THE DRIVER'S NET. See
//   `WAYBILL_PRICE` below — the choice of number is a real decision, not a formatting one.
import type { Database } from "@/lib/database.types";

type DriverRow = Database["public"]["Tables"]["driver"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicle"]["Row"];

/**
 * The SIREN is the first nine digits of the SIRET. Stored as neither: `driver.siret`
 * is 14 digits (validated in settings), and nothing stores the SIREN separately.
 * Returns null rather than a truncated lie when the SIRET is absent or malformed.
 */
export function sirenFromSiret(siret: string | null | undefined): string | null {
  const digits = (siret ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits.slice(0, 9) : null;
}

/** 460548563 → "460 548 563". The grouping French administrations print. */
export function formatSiren(siren: string | null): string | null {
  return siren ? siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") : null;
}

export interface WaybillGap {
  label: string;
  href: string;
}

/**
 * THE ISSUE GATE. Which of the exploitant mentions this Driver cannot fill.
 *
 * ⚑ WHY THIS REFUSES RATHER THAN PRINTING BLANKS. A justificatif handed over with an empty
 * 2° is not a neutral omission — it is a written, dated admission of non-compliance,
 * produced by us, in the officer's hand. Failing to justify a prior booking is punished
 * under art. L. 3124-12 by three years and €45 000 (raised from one year / €15 000 by the
 * loi du 25 juin 2026, in force 27 June 2026), plus licence suspension and immobilisation
 * of the vehicle. Refusing, and naming what is missing, is the kinder answer and the safer
 * one. The Driver falls back to whatever justificatif they carried before Kavenue.
 *
 * Only the three exploitant mentions can be short: 4°–7° come from the mission and the
 * Business, which the S71 enrollment gate already made complete before a trip can go live.
 */
export function waybillGaps(driver: DriverRow): WaybillGap[] {
  const gaps: WaybillGap[] = [];
  if (!driver.company_name?.trim()) {
    gaps.push({ label: "Your company name", href: "/settings/company" });
  }
  if (!driver.registered_address?.trim()) {
    gaps.push({ label: "Your registered address", href: "/settings/company" });
  }
  if (!driver.revtc_number?.trim()) {
    gaps.push({ label: "Your REVTC number", href: "/settings/company" });
  }
  if (!sirenFromSiret(driver.siret)) {
    gaps.push({ label: "Your SIRET", href: "/settings/company" });
  }
  return gaps;
}

export const WAYBILL_ISSUER_NOTE =
  "Établi par Kavenue pour le compte de l'exploitant. Kavenue n'est pas le transporteur.";

export const WAYBILL_AUTHORITY = "Arrêté du 6 août 2025 · art. R. 3120-2";

export const WAYBILL_TITLE = "Justificatif de réservation préalable";

/**
 * WHICH PRICE MAY BE PRINTED — a decision, recorded here so it is not re-made by whoever
 * next edits the template.
 *
 * The **Course** (`mission.accepted_fare`, the frozen PDP fare) and nothing else.
 *  · It leaks nothing between the two counterparties: the Business already reads the Course
 *    as "Transport" on every expanded trip row, and the Driver already reads it as the
 *    first line of "What you're paid".
 *  · It is the fare of the supply the *exploitant* makes, which is what an agent's document
 *    should carry. Printing the Business's all-in would state a Kavenue-inclusive figure as
 *    the transport price — a nudge toward principal status (docs/01).
 *  · ⚑ NEVER the Business all-in (hands the Driver the Business's cost basis and our full
 *    take), NEVER driver_net (hands the Business the Driver-side rate — docs/06:190
 *    forbids it), NEVER the Ceiling (the Driver is shown it nowhere in the app; printing it
 *    after they accepted tells them what they left on the table).
 *  · ⚑ AND IT SITS LAST. At a check the Guest is standing there, and the Business resold
 *    that ride to them at its own margin (docs/01:47). A price in the header is a price the
 *    Business's own customer reads over the Driver's shoulder.
 */
export const WAYBILL_PRICE = "course" as const;

export interface WaybillData {
  /** 1° 2° 3° — the Driver's operating company. Never Kavenue. */
  exploitant: {
    name: string;
    address: string;
    revtc: string;
    siren: string;
  };
  /** 4° — who ordered the trip. */
  ordering: { name: string; phone: string | null };
  /** 5° — when the booking was made. The proof it was *préalable*. */
  bookedAt: string;
  /** 6° 7° — when and where the client asked to be collected. */
  pickupAt: string;
  pickupAddress: string;
  /** Extras (S72). Not on the legal list; see the header note. */
  conducteur: { name: string; phone: string | null; proCard: string | null };
  vehicle: { label: string; plate: string | null; seats: number | null } | null;
  /** The Course, in euros. Null when the trip has no frozen fare. */
  course: number | null;
}

export interface WaybillMission {
  accepted_fare: number | null;
  created_at: string;
  pickup_at: string;
  pickup_address: string;
}

export interface WaybillBusiness {
  name: string;
  legal_name: string | null;
  reception_phone: string | null;
}

/**
 * Assemble the document. Call only when `waybillGaps()` is empty — the exploitant fields
 * are non-null by then, and the `?? ""` fallbacks below exist to keep this total, not
 * because a blank is ever acceptable on the page.
 *
 * `vehicle` is the car that DID the trip (`mission.vehicle_id`, stamped by accept_mission)
 * where one was stamped, and the Driver's current car otherwise — the caller resolves that,
 * because only the caller can read the row.
 */
export function buildWaybill(
  mission: WaybillMission,
  driver: DriverRow,
  business: WaybillBusiness,
  vehicle: VehicleRow | null,
  dispatcherPhone: string | null,
): WaybillData {
  return {
    exploitant: {
      name: driver.company_name ?? "",
      address: driver.registered_address ?? "",
      revtc: driver.revtc_number ?? "",
      siren: formatSiren(sirenFromSiret(driver.siret)) ?? "",
    },
    ordering: {
      // The legal name is what a controller can check against a register; the trading
      // name is what everyone says. Prefer the first, fall back to the second.
      name: business.legal_name?.trim() || business.name,
      // ⚑ The arrêté's final paragraph lets 4°'s phone be omitted, but then the Driver must
      // give the controller the means to reach the client "sans délai". So we fall back to
      // the Dispatcher who actually booked it rather than printing nothing.
      phone: business.reception_phone?.trim() || dispatcherPhone,
    },
    bookedAt: mission.created_at,
    pickupAt: mission.pickup_at,
    pickupAddress: mission.pickup_address,
    conducteur: {
      name: `${driver.first_name} ${driver.last_name}`.trim(),
      phone: driver.phone,
      proCard: driver.pro_card_number,
    },
    vehicle: vehicle
      ? {
          label: [vehicle.make, vehicle.model, vehicle.colour].filter(Boolean).join(" "),
          plate: vehicle.plate,
          seats: vehicle.seats,
        }
      : null,
    course: mission.accepted_fare,
  };
}

/**
 * The document's date shape: "25 août 2026 à 21 h 35".
 *
 * ⚑ Two substitutions, both deliberate: the comma Intl puts between date and time becomes
 * "à", and the colon becomes "h" — French administrative documents write the hour that
 * way, and this one is read by a French officer.
 *
 * ⚑ `public/sw.js` re-implements this by hand, because a file served raw to the browser
 * cannot import from here. `tests/offline-waybill.test.ts` pins the two together — the
 * saved copy's stamp sits under six dates in this shape and must not arrive in another.
 */
const stamp = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function frDateTime(iso: string): string {
  return stamp
    .format(new Date(iso))
    .replace(", ", " à ")
    .replace(/(\d{2}):(\d{2})/, "$1 h $2");
}
