// What kind of business this is — the one field every Business is stamped with,
// and the axis the Activity Console breaks 25 000 of them down by.
//
// ⚑ KAVENUE IS OPEN TO EVERY KIND OF BUSINESS, NOT JUST HOTELS (founder, S71).
// Hotels are the first vertical, not the shape of the market. `vtc_company` is
// in the list on purpose: a VTC operator with more trips than cars is a Business
// here, posting its overflow, and it is a different customer from a hotel — it
// knows the trade and it knows the prices. Worth seeing as its own segment from
// the first row.
//
// ⚑ TWO COLUMNS USED TO SPLIT THIS AND NEITHER WON. Sign-up wrote a free-typed
// `field_of_activity`; Settings wrote a picked `business_type`, from a list that
// existed only inside app/(dispatch)/dispatch/settings/page.tsx. A Business that
// signed up and never opened Settings had a string and no category, so no
// breakdown was possible for anyone who actually enrolled. `business_type` wins;
// `field_of_activity` is no longer written and stays only to be read from.
//
// ⚑ THE VALUES ARE THE OLD ONES PLUS NEW ONES, NEVER RENAMED. `event_venue`
// reads worse than `events` and stays anyway: renaming a stored value strands
// every row carrying it, for a label the UI supplies. Labels are free to change,
// values are not.
import type { Database } from "@/lib/database.types";

export const BUSINESS_TYPES = [
  "hotel",
  "restaurant",
  "event_venue",
  "travel_agency",
  "concierge",
  "vtc_company",
  "health",
  "corporate",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

/**
 * ⚑ A TYPE-KEYED MAP, NOT A SWITCH WITH A DEFAULT. Adding a value to
 * BUSINESS_TYPES fails to compile until it has a label here — the same guard
 * that made `close_answered` impossible to forget in lib/mission-story.ts.
 */
const LABELS: Record<BusinessType, string> = {
  hotel: "Hotel & accommodation",
  restaurant: "Restaurant & bar",
  event_venue: "Events & venues",
  travel_agency: "Travel agency & tour operator",
  concierge: "Concierge & private services",
  vtc_company: "VTC or taxi company",
  health: "Health & clinics",
  corporate: "Corporate",
  other: "Other",
};

export function businessTypeLabel(type: BusinessType): string {
  return LABELS[type];
}

/** The column is a bare `text`, so every read narrows rather than trusting. */
export function isBusinessType(value: string | null | undefined): value is BusinessType {
  return !!value && (BUSINESS_TYPES as readonly string[]).includes(value);
}

/** For a `<select>`: the value and the words, in the order they should appear. */
export function businessTypeOptions(): { value: BusinessType; label: string }[] {
  return BUSINESS_TYPES.map((value) => ({ value, label: LABELS[value] }));
}

// ── the official French nomenclature ──────────────────────────────────────────
//
// Every registered French business carries exactly one NAF/APE code, and
// `recherche-entreprises.api.gouv.fr` hands it over free, with no key, given a
// company name. That is what fills this field at sign-up instead of asking.
//
// ⚑ A SUGGESTION, NEVER A SILENT CLASSIFICATION. Two things make a wrong guess
// harmless, and both are load-bearing:
//   • the raw code is stored alongside the answer, so a mapping fixed in a year
//     is a re-map, not a re-survey of every Business on the platform;
//   • the picker is always shown, pre-filled — a person confirms it.
// So an unrecognised code returns null and the human answers. NEVER guess.
//
// ⚑ AND THE CODE ON A GROUP'S HEAD OFFICE DESCRIBES THE HEAD OFFICE. Measured
// against the live register on 2026-08-30: Accor, Groupe Barrière and GL Events
// all return 70.10Z, "activités des sièges sociaux". Kavenue's customer is the
// establishment — one hotel, one restaurant — which is why the lookup reads
// `matching_etablissements`, not `siege`. On establishments the codes are right:
// Carlton Cannes and the Negresco 55.10Z, Buffalo Grill 56.10A, Voyageurs du
// Monde 79.11Z, VTC Marcel 49.32Z, Clinique Saint-George 86.10Z, Majordome
// Services 96.09Z.

/** Four-digit classes, checked first — they contradict their own division. */
const NAF_CLASS: Record<string, BusinessType> = {
  // Section H, division 49 is freight and rail as well; only these two carry
  // passengers in a car, and 49.32Z is the code a French VTC actually files.
  "49.32": "vtc_company",
  "49.39": "vtc_company",
  // Division 82 is office support at large; only this class is the events trade.
  "82.30": "event_venue",
  // Division 96 is hairdressers and funeral directors too; this is the catch-all
  // "other personal services" class a concierge files under.
  "96.09": "concierge",
};

/** Two-digit divisions, where the whole division means one thing to Kavenue. */
const NAF_DIVISION: Record<string, BusinessType> = {
  "55": "hotel", // Hébergement
  "56": "restaurant", // Restauration
  "79": "travel_agency", // Agences de voyage, voyagistes
  "86": "health", // Activités pour la santé humaine
  "90": "event_venue", // Activités créatives, artistiques et de spectacle
  "93": "event_venue", // Sport, amusement et loisirs
};

/**
 * The Kavenue type an official activity code suggests — or null, which means
 * "ask the person", not "corporate".
 *
 * ⚑ NULL IS AN ANSWER. Defaulting an unknown code to `corporate` or `other`
 * would fill the breakdown with confident nonsense, and nobody would ever know
 * which rows were guessed. [[d88]] — a missing value is a refusal, not a skip.
 */
export function typeFromNaf(naf: string | null | undefined): BusinessType | null {
  if (!naf) return null;
  // The register writes "55.10Z"; tolerate "5510Z" and stray spacing.
  const clean = naf.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (clean.length < 4) return null;
  const klass = `${clean.slice(0, 2)}.${clean.slice(2, 4)}`;
  return NAF_CLASS[klass] ?? NAF_DIVISION[clean.slice(0, 2)] ?? null;
}

// ── reading what is already stored ────────────────────────────────────────────

type BusinessRow = Database["public"]["Tables"]["business"]["Row"];

/**
 * The type of a Business as it stands — narrowed, never trusted.
 *
 * ⚑ FALLS BACK TO THE OLD FREE-TEXT COLUMN, READ-ONLY. Businesses enrolled
 * before S71 have a typed `field_of_activity` and no `business_type`. Where that
 * string happens to be one of the values, it counts; where it is "Boutique hotel
 * on the Croisette", it does not, and the Business is asked once.
 */
export function typeOf(business: Pick<BusinessRow, "business_type" | "field_of_activity">): BusinessType | null {
  if (isBusinessType(business.business_type)) return business.business_type;
  const legacy = business.field_of_activity?.trim().toLowerCase().replace(/\s+/g, "_");
  return isBusinessType(legacy) ? legacy : null;
}
