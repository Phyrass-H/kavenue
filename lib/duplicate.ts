// S78 — "never twice", turned into a sentence a person can act on.
//
// ⚑ THE FOUNDER'S RULE, 2026-09-12: *"if infos is used twice the system should tell them,
// phone number, plates, email and so on, never twice"* — and the scope, from their next
// answer: *"brand new enrollment should not have same infos from different persons or
// companies"*, with a daughter account for a Business handled by support.
//
// ⚑ WHY A MAP FROM CONSTRAINT NAMES. Postgres answers a unique violation with code 23505 and
// the constraint's name; nothing else in the error is reliable enough to branch on. So the
// name IS the contract between docs/migrations/2026-09-13b_never_twice.sql and this file, and
// the gate asserts that every name below exists in that migration — a renamed index would
// otherwise turn every duplicate back into "Something went wrong", silently.
//
// ⚑ AND WHAT THESE SENTENCES NEVER SAY: whose account already holds the value. "Already used
// by Marc Fontaine" hands one person's data to whoever guessed their plate. The line says the
// value is taken and tells them who can sort it out.

/** The `why` codes these produce. They travel in a query string, so they are read back through
 *  `duplicateSays`, never indexed into directly ( `?why=__proto__` is user input ). */
export type DuplicateWhy =
  | "plate_taken"
  | "phone_taken"
  | "email_taken"
  | "siret_taken"
  | "revtc_taken"
  | "pro_card_taken"
  | "vat_taken";

/** constraint name → what it means. Keep in step with 2026-09-13b_never_twice.sql. */
export const DUPLICATE_CONSTRAINTS: Record<string, DuplicateWhy> = {
  vehicle_plate_live_uq: "plate_taken",
  driver_phone_uq: "phone_taken",
  driver_email_uq: "email_taken",
  driver_siret_uq: "siret_taken",
  driver_revtc_uq: "revtc_taken",
  driver_pro_card_uq: "pro_card_taken",
  driver_vat_uq: "vat_taken",
  business_siret_uq: "siret_taken",
  business_vat_uq: "vat_taken",
  business_phone_uq: "phone_taken",
  dispatcher_email_uq: "email_taken",
};

export const DUPLICATE_SAYS: Record<DuplicateWhy, string> = {
  plate_taken:
    "That plate is already on another account. If the car is yours, contact us and we’ll sort it out.",
  phone_taken:
    "That phone number is already on another account. Use another, or contact us if it’s yours.",
  email_taken: "That email address is already on another account.",
  siret_taken:
    "That SIRET is already on another account. If you need a second account, contact us and we’ll set it up.",
  revtc_taken:
    "That REVTC number is already on another account. Check it against your certificate, or contact us.",
  pro_card_taken:
    "That professional card number is already on another account. Check it, or contact us.",
  vat_taken: "That VAT number is already on another account.",
};

/** The shape every Supabase/PostgREST error arrives in. Typed loosely on purpose: the client
 *  returns `PostgrestError` here and a plain Error there, and this must not care. */
export interface MaybePgError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/** ⚑ Reads the CONSTRAINT NAME, not the message text. A message match would pass on a table
 *  that merely mentions "plate" — the S75 lesson about a regex that matches a substring. */
export function duplicateWhy(err: MaybePgError | null | undefined): DuplicateWhy | null {
  if (!err) return null;
  if (err.code && err.code !== "23505") return null;
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`;
  for (const [name, why] of Object.entries(DUPLICATE_CONSTRAINTS)) {
    if (haystack.includes(name)) return why;
  }
  // A 23505 we do not recognise is still a duplicate, and saying so beats "Something went
  // wrong" — but it must not claim to know WHICH field, so it has no sentence of its own.
  return null;
}

/** The words for a code that arrived in a URL — or null. Same guard as vehicleProblemSays:
 *  a query string is user input and `Object.hasOwn` is what keeps `__proto__` out. */
export function duplicateSays(why: string | null | undefined): string | null {
  return why && Object.hasOwn(DUPLICATE_SAYS, why) ? DUPLICATE_SAYS[why as DuplicateWhy] : null;
}
