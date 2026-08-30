// The French company register, as Kavenue reads it.
//
// `recherche-entreprises.api.gouv.fr` is the state's own open search over the
// SIRENE base: no key, no account, no billing, no quota to babysit. Given a
// company name it returns the establishment's SIRET, legal name, address, city,
// département, région and `activite_principale` — the official NAF/APE code.
//
// ⚑ WHY THIS IS NOT THE "API PHASE" THE FOUNDER DEFERRED. What is deferred is
// notifications, payments, real auth, flight tracking and analytics — services
// with accounts, keys, bills and failure modes that reach the customer. This is
// a public read with no credential, and nothing depends on it: every field it
// fills can be typed by hand, and in Monaco always is.
//
// ⚑ IT READS THE ESTABLISHMENT, NOT THE LEGAL UNIT — and that distinction is the
// difference between a useful answer and a wrong one. Measured against the live
// register on 2026-08-30, searching the GROUP returns the head office's own
// activity code: Accor, Groupe Barrière and GL Events all come back 70.10Z,
// "activités des sièges sociaux". Kavenue's customer is a building — one hotel,
// one restaurant — so `matching_etablissements` wins over `siege` wherever the
// register offers both.
import { typeFromNaf, type BusinessType } from "@/lib/business-type";

const ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";

export interface RegisterHit {
  siret: string;
  legalName: string;
  /** The name over the door, where the register knows one — "HOTEL CARLTON CANNES". */
  tradeName: string | null;
  address: string;
  city: string | null;
  departement: string | null;
  region: string | null;
  nafCode: string | null;
  /** What that code suggests — null means "ask them", never "corporate". */
  suggestedType: BusinessType | null;
}

/**
 * ⚑ THREE OUTCOMES, NOT TWO. "The register is down" and "the register has never
 * heard of you" lead to the same box on screen and must not lead to the same
 * sentence: one says try again, the other says fill it in yourself. Collapsing
 * them is how a Monaco hotel gets told to retry forever.
 */
export type RegisterResult =
  | { ok: true; hits: RegisterHit[] }
  | { ok: false; reason: "unreachable" };

interface RawEstablishment {
  siret?: string;
  adresse?: string;
  code_postal?: string;
  libelle_commune?: string;
  departement?: string;
  region?: string;
  activite_principale?: string;
  nom_commercial?: string | null;
  etat_administratif?: string;
}

/**
 * The département, derived from the postcode when the register does not send it.
 *
 * ⚑ THIS EXISTS BECAUSE OF A SILENT NULL, caught by signing up as a real hotel
 * rather than by reading the response. `siege` carries a `departement` field and
 * `matching_etablissements` does NOT — and since Kavenue deliberately reads the
 * establishment (see above), every single sign-up was storing `region: "93"`
 * beside `departement: null`. Nothing errored. The Businesses screen would
 * simply have had a column that was empty for everyone, forever.
 *
 * The postcode is always there, and the rule is the first two digits — with the
 * two exceptions that would otherwise file real French addresses under a
 * département that does not exist:
 *   • Corsica is 2A and 2B, never "20";
 *   • the overseas départements are three digits (971 Guadeloupe … 976 Mayotte).
 */
export function departementFromPostcode(postcode: string | null | undefined): string | null {
  const p = (postcode ?? "").replace(/\D/g, "");
  if (p.length < 5) return null;
  if (p.startsWith("97") || p.startsWith("98")) return p.slice(0, 3);
  if (p.startsWith("20")) {
    // Ajaccio's arrondissement runs to 20190, Bastia's from 20200 up.
    const n = Number(p.slice(0, 5));
    return n < 20200 ? "2A" : "2B";
  }
  return p.slice(0, 2);
}

interface RawResult {
  nom_complet?: string;
  siege?: RawEstablishment;
  matching_etablissements?: RawEstablishment[];
}

/** The site the search actually matched, falling back to the head office. */
function establishmentOf(r: RawResult): RawEstablishment | null {
  const matched = r.matching_etablissements?.[0];
  return matched ?? r.siege ?? null;
}

export function toHit(r: RawResult): RegisterHit | null {
  const e = establishmentOf(r);
  // No SIRET is no establishment, and half a record is worse than none: it would
  // fill the form with an address belonging to nothing anyone can look up.
  if (!e?.siret) return null;
  return {
    siret: e.siret,
    legalName: r.nom_complet ?? "",
    tradeName: e.nom_commercial ?? null,
    address: e.adresse ?? "",
    city: e.libelle_commune ?? null,
    // The register's own value where it sends one, the postcode where it does
    // not — which is every establishment result. See departementFromPostcode.
    departement: e.departement ?? departementFromPostcode(e.code_postal),
    region: e.region ?? null,
    nafCode: e.activite_principale ?? null,
    suggestedType: typeFromNaf(e.activite_principale),
  };
}

/**
 * Search the register by company name.
 *
 * ⚑ CLOSED ESTABLISHMENTS ARE DROPPED. `etat_administratif` "F" is fermé — a
 * hotel that shut in 2019 is still in the base, and offering it as a match would
 * put a dead SIRET on a live invoice.
 */
export async function searchCompanies(query: string, limit = 5): Promise<RegisterResult> {
  const q = query.trim();
  if (q.length < 3) return { ok: true, hits: [] };

  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&per_page=${limit}`;
  try {
    // The register is a courtesy, not a dependency — it must never be the reason
    // a sign-up form hangs. Six seconds, then the manual path.
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { ok: false, reason: "unreachable" };
    const body: { results?: RawResult[] } = await res.json();
    const hits = (body.results ?? [])
      .filter((r) => establishmentOf(r)?.etat_administratif !== "F")
      .map(toHit)
      .filter((h): h is RegisterHit => h !== null);
    return { ok: true, hits };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
