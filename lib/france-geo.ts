// INSEE's régions — the codes, the words, and the way back from a name.
//
// ⚑ WHY IT MOVED HERE. This map lived inside `lib/admin-businesses.ts`, where only
// the Businesses screen could reach it. Drivers now record a région too, and the
// whole point of storing one is that the two screens can be compared — "Drivers in
// PACA" and "Businesses in PACA" have to mean the same thing or neither number is
// worth reading. One map, one vocabulary.
//
// ⚑ THE COLUMN STORES THE CODE, NOT THE WORD. The code is the fact; the words are
// free to change (they have, twice, since 2016) without touching a row.

/** INSEE région code → its name. */
export const REGIONS: Record<string, string> = {
  "01": "Guadeloupe",
  "02": "Martinique",
  "03": "Guyane",
  "04": "La Réunion",
  "06": "Mayotte",
  "11": "Île-de-France",
  "24": "Centre-Val de Loire",
  "27": "Bourgogne-Franche-Comté",
  "28": "Normandie",
  "32": "Hauts-de-France",
  "44": "Grand Est",
  "52": "Pays de la Loire",
  "53": "Bretagne",
  "75": "Nouvelle-Aquitaine",
  "76": "Occitanie",
  "84": "Auvergne-Rhône-Alpes",
  "93": "Provence-Alpes-Côte d'Azur",
  "94": "Corse",
};

/**
 * ⚑ A NULL RÉGION IS "OUTSIDE FRANCE", NOT "UNKNOWN" — and it is not an error.
 * The Métropole Monte-Carlo has a city and no région because INSEE codes do not
 * exist for Monaco, and Monaco is a real part of this market rather than a gap
 * to be cleaned up. Naming it honestly is what stops a future session "fixing"
 * it by filing Monaco under 06.
 */
export function regionKeyLabel(key: string | null): string {
  if (key === null) return "Outside France";
  return REGIONS[key] ?? `Région ${key}`;
}

/** Accents off, punctuation off, lower case — so "Ile de France" finds "Île-de-France". */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(REGIONS).map(([code, name]) => [norm(name), code]),
);

/**
 * The INSEE code for a région NAME, or null when it is not one of the eighteen.
 *
 * ⚑ THIS EXISTS BECAUSE GOOGLE SPEAKS NAMES AND THE DATABASE SPEAKS CODES. Places
 * returns `administrative_area_level_1` as "Provence-Alpes-Côte d'Azur"; the
 * Business rows carry "93", straight from the SIRET register. Without this the two
 * halves of the same question could never be counted together.
 *
 * ⚑ NULL IS AN ANSWER. A base in Monaco or Ventimiglia has an
 * administrative_area_level_1 that is not a French région, and it must come back
 * null rather than be forced into the nearest French one.
 */
export function regionCodeFromName(name: string | null | undefined): string | null {
  const n = norm(name ?? "");
  if (!n) return null;
  return BY_NAME[n] ?? null;
}

// ── départements ────────────────────────────────────────────────────────────
// ⚑ ADDED BECAUSE THE FOUNDER ASKED FOR "Bouches-du-Rhône" BY NAME (2026-09-09).
// Storing the code is right — the code is the fact — but a screen that prints "13"
// has not answered the question. Source: the INSEE list of French départements,
// fetched 2026-09-10, not written from memory ([[check-sources-not-reasoning]]).
// ⚑ 975, 977, 978 and the Pacific codes are collectivités, not départements, and are
// deliberately absent: `departementKeyLabel` names them rather than pretending.
export const DEPARTEMENTS: Record<string, string> = {
  "01": "Ain", "02": "Aisne", "03": "Allier", "04": "Alpes-de-Haute-Provence",
  "05": "Hautes-Alpes", "06": "Alpes-Maritimes", "07": "Ardèche", "08": "Ardennes",
  "09": "Ariège", "10": "Aube", "11": "Aude", "12": "Aveyron",
  "13": "Bouches-du-Rhône", "14": "Calvados", "15": "Cantal", "16": "Charente",
  "17": "Charente-Maritime", "18": "Cher", "19": "Corrèze",
  "2A": "Corse-du-Sud", "2B": "Haute-Corse",
  "21": "Côte-d'Or", "22": "Côtes-d'Armor", "23": "Creuse", "24": "Dordogne",
  "25": "Doubs", "26": "Drôme", "27": "Eure", "28": "Eure-et-Loir", "29": "Finistère",
  "30": "Gard", "31": "Haute-Garonne", "32": "Gers", "33": "Gironde", "34": "Hérault",
  "35": "Ille-et-Vilaine", "36": "Indre", "37": "Indre-et-Loire", "38": "Isère",
  "39": "Jura", "40": "Landes", "41": "Loir-et-Cher", "42": "Loire",
  "43": "Haute-Loire", "44": "Loire-Atlantique", "45": "Loiret", "46": "Lot",
  "47": "Lot-et-Garonne", "48": "Lozère", "49": "Maine-et-Loire", "50": "Manche",
  "51": "Marne", "52": "Haute-Marne", "53": "Mayenne", "54": "Meurthe-et-Moselle",
  "55": "Meuse", "56": "Morbihan", "57": "Moselle", "58": "Nièvre", "59": "Nord",
  "60": "Oise", "61": "Orne", "62": "Pas-de-Calais", "63": "Puy-de-Dôme",
  "64": "Pyrénées-Atlantiques", "65": "Hautes-Pyrénées", "66": "Pyrénées-Orientales",
  "67": "Bas-Rhin", "68": "Haut-Rhin", "69": "Rhône", "70": "Haute-Saône",
  "71": "Saône-et-Loire", "72": "Sarthe", "73": "Savoie", "74": "Haute-Savoie",
  "75": "Paris", "76": "Seine-Maritime", "77": "Seine-et-Marne", "78": "Yvelines",
  "79": "Deux-Sèvres", "80": "Somme", "81": "Tarn", "82": "Tarn-et-Garonne",
  "83": "Var", "84": "Vaucluse", "85": "Vendée", "86": "Vienne", "87": "Haute-Vienne",
  "88": "Vosges", "89": "Yonne", "90": "Territoire de Belfort", "91": "Essonne",
  "92": "Hauts-de-Seine", "93": "Seine-Saint-Denis", "94": "Val-de-Marne",
  "95": "Val-d'Oise",
  "971": "Guadeloupe", "972": "Martinique", "973": "Guyane", "974": "La Réunion",
  "976": "Mayotte",
};

/** The département's name. A null code is another country, which is not a gap. */
export function departementKeyLabel(key: string | null): string {
  if (key === null) return "Outside France";
  return DEPARTEMENTS[key] ?? `Département ${key}`;
}

// ── countries ───────────────────────────────────────────────────────────────
// ⚑ MONACO IS A COUNTRY AND IS SHOWN AS ONE (founder, 2026-09-09): *"Monaco is a
// country so it should be treated that way"*. It gets its own row beside France, not
// a shared "Outside France" bucket — it is a large part of the live market, and
// lumping it in with everywhere-else would hide the second-biggest place on the board.
// Only the countries this Riviera market actually touches are named; anything else
// falls through to its own ISO code, which is honest and self-correcting.
export const COUNTRIES: Record<string, string> = {
  FR: "France",
  MC: "Monaco",
  IT: "Italy",
  ES: "Spain",
  CH: "Switzerland",
  BE: "Belgium",
  DE: "Germany",
  GB: "United Kingdom",
  LU: "Luxembourg",
  NL: "Netherlands",
  PT: "Portugal",
  AD: "Andorra",
};

/** The country's name. Null means nobody has recorded one yet — say so plainly. */
export function countryKeyLabel(key: string | null): string {
  if (key === null) return "No country on file";
  return COUNTRIES[key] ?? key;
}

const DEPT_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(DEPARTEMENTS).map(([code, name]) => [norm(name), code]),
);

/**
 * The INSEE code for a département NAME, or null when it is not one of the 101.
 *
 * ⚑ THE POSTCODE IS NOT ALWAYS THERE. The department is normally derived from the
 * postcode, which is the better source because it is unambiguous. But a place resolved
 * at TOWN level — "Antibes" rather than "12 rue X, 06600 Antibes" — comes back from
 * Google with no `postal_code` component at all, and 7 of the 14 live Drivers hit
 * exactly that on 2026-09-10. Google does send `administrative_area_level_2`, which in
 * France IS the département, by name. This turns that into the code, so a base without
 * a postcode still lands in the right column instead of a null.
 */
export function departementCodeFromName(name: string | null | undefined): string | null {
  const n = norm(name ?? "");
  if (!n) return null;
  return DEPT_BY_NAME[n] ?? null;
}
