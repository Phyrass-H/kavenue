// Reading the French company register.
//
// ⚑ THE DEPARTEMENT TESTS ARE THE POINT OF THIS FILE. Every field here was
// "working" in the first live sign-up except one, which came back null and
// raised nothing: `siege` carries `departement`, `matching_etablissements` does
// not, and Kavenue reads the establishment on purpose. The result was a column
// that would have been empty for every Business ever enrolled, with no error
// anywhere. These pin the derivation that closed it.
import { describe, expect, it } from "vitest";
import { departementFromPostcode, toHit } from "@/lib/company-register";

describe("departementFromPostcode", () => {
  it("takes the first two digits of an ordinary postcode", () => {
    expect(departementFromPostcode("06400")).toBe("06"); // Cannes
    expect(departementFromPostcode("75008")).toBe("75"); // Paris
    expect(departementFromPostcode("83990")).toBe("83"); // Saint-Tropez
  });

  it("gives Corsica its real départements, never '20'", () => {
    // "20" has not been a département since 1976; storing it would put every
    // Corsican Business in a place that does not exist.
    expect(departementFromPostcode("20000")).toBe("2A"); // Ajaccio
    expect(departementFromPostcode("20190")).toBe("2A");
    expect(departementFromPostcode("20200")).toBe("2B"); // Bastia
    expect(departementFromPostcode("20600")).toBe("2B");
  });

  it("keeps three digits overseas", () => {
    expect(departementFromPostcode("97400")).toBe("974"); // La Réunion
    expect(departementFromPostcode("97110")).toBe("971"); // Guadeloupe
  });

  it("refuses anything that is not a French postcode", () => {
    expect(departementFromPostcode(null)).toBeNull();
    expect(departementFromPostcode("")).toBeNull();
    expect(departementFromPostcode("MC 98000".slice(0, 3))).toBeNull(); // too short
    expect(departementFromPostcode("ABC")).toBeNull();
  });
});

describe("toHit", () => {
  // Trimmed from the real response for "hotel carlton cannes", 2026-08-30.
  const carlton = {
    nom_complet: "SNC CARLTON DANUBE CANNES (HOTEL CARLTON CANNES)",
    siege: { siret: "33275987700019", departement: "06", adresse: "58 BOULEVARD DE LA CROISETTE 06400 CANNES" },
    matching_etablissements: [
      {
        siret: "33275987700019",
        nom_commercial: "HOTEL CARLTON CANNES",
        adresse: "58 BOULEVARD DE LA CROISETTE 06400 CANNES",
        code_postal: "06400",
        libelle_commune: "CANNES",
        region: "93",
        activite_principale: "55.10Z",
        etat_administratif: "A",
      },
    ],
  };

  it("reads the establishment, not the head office", () => {
    const hit = toHit(carlton)!;
    expect(hit.tradeName).toBe("HOTEL CARLTON CANNES");
    expect(hit.nafCode).toBe("55.10Z");
    expect(hit.suggestedType).toBe("hotel");
  });

  it("fills the département the establishment does not send", () => {
    // The regression this file exists for.
    expect(toHit(carlton)!.departement).toBe("06");
  });

  it("falls back to the head office when nothing matched", () => {
    const hit = toHit({ nom_complet: "X", siege: { siret: "111", code_postal: "13001" } })!;
    expect(hit.siret).toBe("111");
    expect(hit.departement).toBe("13");
  });

  it("drops a result with no SIRET rather than half-filling the form", () => {
    expect(toHit({ nom_complet: "X" })).toBeNull();
    expect(toHit({ nom_complet: "X", matching_etablissements: [{ adresse: "somewhere" }] })).toBeNull();
  });

  it("never guesses a type from a head-office code", () => {
    // Accor, Groupe Barrière and GL Events all file 70.10Z.
    const hit = toHit({ nom_complet: "ACCOR", siege: { siret: "222", activite_principale: "70.10Z" } })!;
    expect(hit.nafCode).toBe("70.10Z");
    expect(hit.suggestedType).toBeNull();
  });
});
