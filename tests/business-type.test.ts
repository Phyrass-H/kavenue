// The business type list and the official-code mapping behind it.
//
// ⚑ WHAT THESE PIN IS THE HONESTY, NOT THE ARITHMETIC. The mapping is a
// suggestion a human confirms, so a wrong guess is cheap — but a SILENT guess is
// not, because nobody would ever know which rows were invented. The tests that
// matter here are the ones asserting that an unknown code returns null.
//
// The codes were read off the live register (recherche-entreprises.api.gouv.fr)
// on 2026-08-30, not remembered: Carlton Cannes and the Negresco 55.10Z, Buffalo
// Grill 56.10A, Voyageurs du Monde 79.11Z, VTC Marcel and Dadudrive 49.32Z,
// Clinique Saint-George and Hôpital Arnault Tzanck 86.10Z, Majordome Services
// 96.09Z, and Accor / Groupe Barrière / GL Events all 70.10Z.
import { describe, expect, it } from "vitest";
import {
  BUSINESS_TYPES,
  businessTypeLabel,
  businessTypeOptions,
  isBusinessType,
  typeFromNaf,
  typeOf,
} from "@/lib/business-type";

describe("the list itself", () => {
  it("carries the VTC operator, because that is a customer and not a Driver", () => {
    // The founder's addition, S71: an operator with more trips than cars posts
    // its overflow here. If this value ever disappears, that segment becomes
    // invisible inside "other".
    expect(BUSINESS_TYPES).toContain("vtc_company");
  });

  it("keeps every value the database already stores", () => {
    // ⚑ Renaming a stored value strands every row carrying it. These five were
    // the old Settings list; they may gain neighbours and must never be edited.
    for (const legacy of ["hotel", "concierge", "travel_agency", "event_venue", "other"]) {
      expect(BUSINESS_TYPES).toContain(legacy);
    }
  });

  it("gives every value a label, and the options in list order", () => {
    const options = businessTypeOptions();
    expect(options).toHaveLength(BUSINESS_TYPES.length);
    for (const o of options) expect(o.label.length).toBeGreaterThan(0);
    expect(options.map((o) => o.value)).toEqual([...BUSINESS_TYPES]);
  });

  it("labels are words a person would say, not the stored value", () => {
    expect(businessTypeLabel("vtc_company")).toBe("VTC or taxi company");
    expect(businessTypeLabel("event_venue")).toBe("Events & venues");
  });
});

describe("isBusinessType", () => {
  it("accepts a stored value and refuses everything else", () => {
    expect(isBusinessType("hotel")).toBe(true);
    expect(isBusinessType("Hotel")).toBe(false);
    expect(isBusinessType("boutique hotel")).toBe(false);
    expect(isBusinessType(null)).toBe(false);
    expect(isBusinessType("")).toBe(false);
  });
});

describe("typeFromNaf", () => {
  it("maps the codes measured against the live register", () => {
    expect(typeFromNaf("55.10Z")).toBe("hotel");
    expect(typeFromNaf("56.10A")).toBe("restaurant");
    expect(typeFromNaf("79.11Z")).toBe("travel_agency");
    expect(typeFromNaf("49.32Z")).toBe("vtc_company");
    expect(typeFromNaf("86.10Z")).toBe("health");
    expect(typeFromNaf("96.09Z")).toBe("concierge");
  });

  it("lets a four-digit class beat its own division", () => {
    // Division 49 is freight and rail as well; only 49.32/49.39 carry passengers.
    expect(typeFromNaf("49.32Z")).toBe("vtc_company");
    expect(typeFromNaf("49.41A")).toBeNull(); // road freight — not a customer type
    // Division 96 is hairdressers and funeral directors too.
    expect(typeFromNaf("96.09Z")).toBe("concierge");
    expect(typeFromNaf("96.02A")).toBeNull(); // hairdressing
  });

  it("refuses to guess, and null is the answer", () => {
    // ⚑ THE ONE THAT MATTERS. A head office's code describes the head office:
    // Accor, Groupe Barrière and GL Events all file 70.10Z. Mapping that to
    // `corporate` would quietly file three hotel groups under the wrong trade
    // and nobody would ever see it. The person is asked instead.
    expect(typeFromNaf("70.10Z")).toBeNull();
    expect(typeFromNaf("64.20Z")).toBeNull(); // holding companies
    expect(typeFromNaf("00.97")).toBeNull(); // the register's own placeholder
    expect(typeFromNaf(null)).toBeNull();
    expect(typeFromNaf("")).toBeNull();
    expect(typeFromNaf("55")).toBeNull(); // too short to be a class
  });

  it("tolerates the spellings the register and a human produce", () => {
    expect(typeFromNaf("5510Z")).toBe("hotel");
    expect(typeFromNaf(" 55.10 Z ")).toBe("hotel");
    expect(typeFromNaf("55.10z")).toBe("hotel");
  });
});

describe("typeOf", () => {
  it("prefers the picked column over the old typed one", () => {
    expect(
      typeOf({ business_type: "restaurant", field_of_activity: "hotel" }),
    ).toBe("restaurant");
  });

  it("falls back to the legacy free text only when it IS one of the values", () => {
    expect(typeOf({ business_type: null, field_of_activity: "Hotel" })).toBe("hotel");
    expect(typeOf({ business_type: null, field_of_activity: "travel agency" })).toBe(
      "travel_agency",
    );
  });

  it("returns null for the free text nobody can classify", () => {
    // This is the pre-S71 population, and the reason the gate exists: they are
    // asked once, the next time they try to post.
    expect(
      typeOf({ business_type: null, field_of_activity: "Boutique hotel on the Croisette" }),
    ).toBeNull();
    expect(typeOf({ business_type: null, field_of_activity: null })).toBeNull();
  });

  it("does not accept a junk value that reached the column", () => {
    // No CHECK constraint guards this column by design, so the read narrows.
    expect(typeOf({ business_type: "chateau", field_of_activity: null })).toBeNull();
  });
});
