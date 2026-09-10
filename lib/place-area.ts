// Where a place IS, in Kavenue's vocabulary — derived from what Google already told us.
//
// ⚑ WHY THIS EXISTS. A Driver's base has been three columns since June: a label, a
// latitude and a longitude. That answers "how far" and nothing else, so the founder's
// question — *"drivers by regions, by city"* — had no data behind it and, worse, no way
// to get any for the past. The Places details call ALREADY asks for `addressComponents`
// (it is in the field mask, so this costs nothing new) and we were throwing the town,
// the postcode, the région and the country away on every single save.
//
// ⚑ THE COMPONENT REPORTS, THIS DECIDES. `address-autocomplete.tsx` hands back the raw
// Google fields and nothing else. Every Kavenue rule — which digits are a département,
// what counts as France, which INSEE code a région name is — lives here, where it is
// pure and has tests. A rule inside a browser component is a rule nobody can check.
//
// ⚑ AND IT IS THE SAME VOCABULARY AS A BUSINESS. `business` stores city / departement /
// region as INSEE values (lib/database.types.ts:291-293); a Driver now stores the same
// shapes, so "who is in PACA" is one question rather than two that cannot be added up.
import { departementFromPostcode } from "@/lib/company-register";
import { regionCodeFromName, departementKeyLabel, countryKeyLabel } from "@/lib/france-geo";

/** Exactly what Google gives us, before any Kavenue rule is applied. */
export interface RawPlaceArea {
  /** `locality`, or `postal_town` where Google uses that instead. */
  city: string | null;
  /** `postal_code`. */
  postcode: string | null;
  /** `administrative_area_level_1` long name, e.g. "Provence-Alpes-Côte d'Azur". */
  regionName: string | null;
  /** `country` SHORT name — the ISO-2 code, e.g. "FR", "MC", "IT". */
  country: string | null;
}

/** What we store. INSEE codes where France has them, honest nulls where it does not. */
export interface PlaceArea {
  city: string | null;
  postcode: string | null;
  /** INSEE département code — "06", "2A", "974". Null outside France. */
  departement: string | null;
  /** INSEE région code — "93". Null outside France, and null for an unknown name. */
  region: string | null;
  /** ISO-2 country code. */
  country: string | null;
}

export const EMPTY_AREA: PlaceArea = {
  city: null,
  postcode: null,
  departement: null,
  region: null,
  country: null,
};

function clean(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Apply Kavenue's rules to what Google said.
 *
 * ⚑⚑ OUTSIDE FRANCE, THE FRENCH CODES ARE NULL — AND MONACO IS WHY. `departement
 * FromPostcode` is a digits rule: it turns Monaco's 98000 into "980", a département
 * that does not exist, and would file the Métropole Monte-Carlo under one. Monaco is
 * a real and large part of this market, not a gap to be cleaned up, so the country
 * gates both French codes. A Monaco base keeps its city and its postcode, and reports
 * no département and no région — which `regionKeyLabel(null)` already renders as
 * "Outside France", the wording the Businesses screen has used since S71.
 */
export function resolveArea(raw: Partial<RawPlaceArea> | null | undefined): PlaceArea {
  if (!raw) return EMPTY_AREA;
  const country = clean(raw.country)?.toUpperCase() ?? null;
  const postcode = clean(raw.postcode);
  const inFrance = country === "FR";
  return {
    city: clean(raw.city),
    postcode,
    departement: inFrance ? departementFromPostcode(postcode) : null,
    region: inFrance ? regionCodeFromName(clean(raw.regionName)) : null,
    country,
  };
}

/**
 * Read the raw fields out of a Places `addressComponents` array.
 *
 * ⚑ RUNS IN THE BROWSER, so it takes the loosest possible shape and never throws — a
 * surprise from Google must cost a null, never a Driver's ability to save their base.
 */
export function areaFromComponents(
  components: { types?: string[]; longText?: string; shortText?: string }[] | undefined,
): RawPlaceArea {
  const pick = (type: string, short = false): string | null => {
    const c = components?.find((x) => x.types?.includes(type));
    return clean(short ? c?.shortText : c?.longText);
  };
  return {
    // `locality` is the town on French results; `postal_town` covers the few places
    // Google uses it instead — the same pair glanceLabelFromDetails already relies on.
    city: pick("locality") ?? pick("postal_town"),
    postcode: pick("postal_code"),
    regionName: pick("administrative_area_level_1"),
    // ⚑ SHORT name: the ISO-2 code. The long name is "France" / "Monaco", which would
    // make the country a word to be matched rather than a code to be compared.
    country: pick("country", true),
  };
}

/** Serialise for a hidden form field; "" when there is nothing worth carrying. */
export function encodeArea(raw: RawPlaceArea | null): string {
  if (!raw || (!raw.city && !raw.postcode && !raw.regionName && !raw.country)) return "";
  return JSON.stringify(raw);
}

/** Parse a hidden form field back. Never throws — bad input is simply no area. */
export function decodeArea(value: string | null | undefined): RawPlaceArea | null {
  if (!value) return null;
  try {
    const o = JSON.parse(value) as Partial<RawPlaceArea>;
    if (!o || typeof o !== "object") return null;
    return {
      city: clean(o.city),
      postcode: clean(o.postcode),
      regionName: clean(o.regionName),
      country: clean(o.country),
    };
  } catch {
    return null;
  }
}

/**
 * Where a base is, in one phrase — the département in France, the COUNTRY outside it.
 *
 * ⚑ MONACO GETS ITS NAME (founder, 2026-09-09): *"Monaco is a country so it should be
 * treated that way"*. `departementKeyLabel(null)` says "Outside France", which is the
 * right words for a missing French code and the wrong words for a place. A Monaco base
 * reads "Monaco", beside Alpes-Maritimes, not lumped in with everywhere-else.
 *
 * ⚑ ONE FUNCTION, SO NO SCREEN RE-DECIDES IT. The moment two screens each write their
 * own version of this, one of them files Monaco under 06.
 */
export function areaLabel(area: Pick<PlaceArea, "departement" | "country">): string {
  if (area.departement) return departementKeyLabel(area.departement);
  if (area.country) return countryKeyLabel(area.country);
  return "No location on file";
}
