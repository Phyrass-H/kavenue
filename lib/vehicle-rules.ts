// What a Driver's car must say, and in which words — one rule for every door.
//
// ⚑ WHY THIS EXISTS. Until 2026-09-11 every car field was optional ("optional at
// signup, editable later in Settings", app/onboarding/actions.ts) and both save paths
// wrote whatever arrived. A blank make and model fell through `categorize()` into Eco,
// so the Eco bucket also held every car we could not identify — the founder asked for
// distributions by class, category and region, and a class chart built on that would
// have been wrong in a way nobody could see. Founder, 2026-09-11: *"In order to have
// proper distribution in classes and regions and categories and so on those infos has
// to be mandatories."*
//
// ⚑ ONE MODULE, TWO DOORS. Enrollment (app/onboarding/actions.ts) and the Settings page
// (app/(app)/settings/actions.ts) both call `validateVehicle`. Two copies of "what is
// required" is how one of them ends up letting a blank car through.
//
// ⚑ PURE. No database, no browser — so it has tests, and the form's `required`
// attributes are a courtesy on top of it rather than the only thing standing guard.

// ── colours ──────────────────────────────────────────────────────────────────
// ⚑ A LIST, NOT FREE TEXT. The same reason brands split: "noir", "Noir" and "black"
// would be three colours on the founder's chart. Ten plus Autre, founder-approved.
// Sourced 2026-09-11 — BASF Color Report 2024 EMEA, Axalta 2025, and French
// registration counts (project/research/2026-09-11_plate_lookup_and_car_data.md).
// Argent is kept apart from Gris: the paint makers split them, and a Guest looking for
// the car can tell a light silver from a dark grey. Noir is first because Uber's own
// rule for Berline/Van says "le noir est apprécié de la clientèle premium".
export const COLOURS = [
  "noir", "gris", "argent", "blanc", "bleu",
  "rouge", "vert", "beige", "marron", "jaune", "autre",
] as const;
export type Colour = (typeof COLOURS)[number];

export const COLOUR_LABEL: Record<Colour, string> = {
  noir: "Noir", gris: "Gris", argent: "Argent", blanc: "Blanc", bleu: "Bleu",
  rouge: "Rouge", vert: "Vert", beige: "Beige", marron: "Marron", jaune: "Jaune",
  autre: "Autre",
};

export function isColour(v: unknown): v is Colour {
  return typeof v === "string" && (COLOURS as readonly string[]).includes(v);
}

/** A stored colour's label, tolerant of the pre-2026-09-11 capitalised words. */
export function colourLabel(v: string | null | undefined): string {
  const k = (v ?? "").trim().toLowerCase();
  return isColour(k) ? COLOUR_LABEL[k] : v ? v : "—";
}

// ── energy ───────────────────────────────────────────────────────────────────
// ⚑ FOUNDER, 2026-09-11: "Yes for energy type good idea and it's important!" It is
// important for a legal reason as much as an analytic one: the VTC age limit does NOT
// apply to hybrid and electric cars (arrêté du 26 mars 2015, art. 2 — fetched from
// Légifrance 2026-09-11), so without knowing the energy nobody can tell whether a car's
// age matters at all. Box P.3 on the carte grise.
export const ENERGIES = [
  "essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl", "autre",
] as const;
export type Energy = (typeof ENERGIES)[number];

export const ENERGY_LABEL: Record<Energy, string> = {
  essence: "Essence",
  diesel: "Diesel",
  hybride: "Hybride",
  hybride_rechargeable: "Hybride rechargeable",
  electrique: "Électrique",
  gpl: "GPL",
  autre: "Autre",
};

export function isEnergy(v: unknown): v is Energy {
  return typeof v === "string" && (ENERGIES as readonly string[]).includes(v);
}

/**
 * Whether the VTC seven-year age limit applies to a car of this energy.
 *
 * ⚑ INFORMATION, NOT A GATE. Legal is the founder's to own; nothing in the app refuses
 * a car on age. This exists so a screen can say which cars the rule even concerns.
 * "Moins de sept ans", except collection vehicles (art. 1) and hybrid and electric
 * vehicles (art. 2). A plug-in hybrid is a hybrid.
 */
export function ageLimitApplies(energy: Energy | null | undefined): boolean {
  return !(energy === "hybride" || energy === "hybride_rechargeable" || energy === "electrique");
}

// ── plates ───────────────────────────────────────────────────────────────────
// ⚑ THE CAR'S COUNTRY IS THE DRIVER'S — founder, 2026-09-11: *"we know that the car is
// related to the driver's company"*. So the plate is checked against the country of
// the Driver's base, and there is no separate "country of registration" to ask.
// ⚑ FORMATS FROM PRIMARY TEXTS, not memory (research file above):
//   France, SIV  — "2 lettres, suivies de 3 chiffres, suivis de 2 lettres"
//                  (arrêté du 9 février 2009, annexe VII)
//   France, FNI  — the OLD system, and STILL LEGAL: a pre-2009 car keeps its number
//                  until its registration certificate changes (service-public.fr).
//                  1-4 digits, 1-3 letters, then the département. Rare on a VTC —
//                  the age limit — but a hybrid is exempt from it, so it can happen.
//   Monaco       — arrêté ministériel n° 78-5, art. 6: up to 4 digits; or 1 letter +
//                  up to 3 digits; or up to 3 digits + 1 letter (that last form does
//                  not use M). Letters B C D E F G H J K L M N P Q R S T U V X Y.
// ⚑ I, O and U are said to be excluded from SIV by commercial sites only; the primary
// text does not say so, so they are NOT hard-blocked here.
const SIV = /^([A-Z]{2})-?(\d{3})-?([A-Z]{2})$/;
const FNI = /^\d{1,4}[A-Z]{1,3}(\d{2}|2A|2B|\d{3})$/;
const MC_LETTERS = "BCDEFGHJKLMNPQRSTUVXY";
const MC_LETTERS_NO_M = "BCDEFGHJKLNPQRSTUVXY";
const MONACO = new RegExp(`^(\\d{1,4}|[${MC_LETTERS}]\\d{1,3}|\\d{1,3}[${MC_LETTERS_NO_M}])$`);

/** Upper case, no spaces; an SIV plate comes back as AA-123-AA. */
export function normalisePlate(raw: string | null | undefined): string {
  const up = (raw ?? "").toUpperCase().replace(/\s+/g, "").trim();
  const siv = SIV.exec(up);
  return siv ? `${siv[1]}-${siv[2]}-${siv[3]}` : up;
}

/**
 * Whether a plate has the shape of a number from the Driver's country.
 *
 * ⚑ A COUNTRY WE HAVE NO FORMAT FOR ACCEPTS ANY NON-EMPTY PLATE. Refusing an Italian
 * plate because we never wrote Italy's rule would be the app inventing a restriction
 * the founder did not make. Only France and Monaco are checked, because only they are
 * in this market today.
 */
export function plateFitsCountry(plate: string, country: string | null | undefined): boolean {
  const p = normalisePlate(plate).replace(/-/g, "");
  if (!p) return false;
  if (country === "FR") return SIV.test(p) || FNI.test(p);
  if (country === "MC") return MONACO.test(p);
  return true;
}

// ── the whole car ────────────────────────────────────────────────────────────
export interface VehicleInput {
  make: string;
  model: string;
  colour: string;
  plate: string;
  seats: string;
  energy: string;
  firstRegistered: string; // YYYY-MM-DD, as <input type="date"> sends it
}

export type VehicleProblem =
  | "make" | "model" | "colour" | "plate" | "plate_format"
  | "seats" | "energy" | "first_registered" | "first_registered_future";

/**
 * The FIRST thing wrong with a car, in the order the form asks for it — or null.
 *
 * ⚑ ONE AT A TIME, BY NAME. The approved preview shows "Add your plate to continue"
 * beside the button, not a list of eight. The founder rejects roll-ups; a Driver
 * fixing their car fixes one thing and presses again.
 */
export function vehicleProblem(v: VehicleInput, country: string | null | undefined, today: Date): VehicleProblem | null {
  if (!v.make.trim()) return "make";
  if (!v.model.trim()) return "model";
  if (!v.firstRegistered.trim()) return "first_registered";
  const d = new Date(`${v.firstRegistered}T00:00:00Z`);
  // ⚑ 1900, NOT A VTC-SHAPED YEAR. Collection vehicles are exempt from the age limit
  // (art. 1), so a 1960 car is a legitimate answer and must not be refused here.
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900) return "first_registered";
  if (d.getTime() > today.getTime()) return "first_registered_future";
  if (!isEnergy(v.energy)) return "energy";
  if (!isColour(v.colour)) return "colour";
  if (!v.plate.trim()) return "plate";
  if (!plateFitsCountry(v.plate, country)) return "plate_format";
  const seats = Number.parseInt(v.seats, 10);
  if (!Number.isInteger(seats) || seats < 1 || seats > 9 || String(seats) !== v.seats.trim()) return "seats";
  return null;
}

/** What to say, beside the button, for each problem. */
export const VEHICLE_PROBLEM_SAYS: Record<VehicleProblem, string> = {
  make: "Add your car’s make to continue",
  model: "Add your car’s model to continue",
  first_registered: "Add the date your car was first registered — box B on the carte grise",
  first_registered_future: "That first-registration date is in the future — check box B on the carte grise",
  energy: "Choose your car’s energy to continue",
  colour: "Choose your car’s colour to continue",
  plate: "Add your plate to continue",
  plate_format: "That plate doesn’t look like a number from your country — check it against the carte grise",
  seats: "Add how many passenger seats your car has (1 to 9)",
};
