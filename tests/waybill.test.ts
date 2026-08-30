// The Waybill — the *justificatif de réservation préalable* (arrêté du 6 août 2025).
//
// ⚑ THE POINT OF THIS FILE IS THE REFUSAL, NOT THE RENDER. A document that prints
// blanks where the law wants the exploitant's identity is not "a document missing a
// field" — it is a dated, written admission handed to a police officer, produced by us.
// So the tests that matter most are the ones asserting that a Driver short of a field
// gets NO document at all.
//
// ⚑ AND THE PRICE. Three of the four money numbers on a trip are forbidden here for
// three different reasons; the last test pins the one that is allowed, because the
// tempting substitution ("show them what they're paid") is exactly the one that hands
// the Business the Driver-side rate.
import { describe, expect, it } from "vitest";
import {
  buildWaybill,
  formatSiren,
  sirenFromSiret,
  waybillGaps,
  WAYBILL_PRICE,
} from "@/lib/waybill";
import type { Database } from "@/lib/database.types";

type DriverRow = Database["public"]["Tables"]["driver"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicle"]["Row"];

function driver(over: Partial<DriverRow> = {}): DriverRow {
  return {
    id: "dr-1",
    auth_user_id: "au-1",
    first_name: "Marc",
    last_name: "Fontaine",
    phone: "+33 6 43 53 98 83",
    email: null,
    profile_photo_url: null,
    languages: [],
    operational_zones: [],
    base_label: "Nice",
    base_lat: 43.7,
    base_lng: 7.26,
    service_radius_km: 40,
    accepts_luggage_runs: false,
    preferred_gps: null,
    stripe_account_id: null,
    verified: false,
    reliability_marks: 0,
    gender: null,
    company_name: "Fontaine Transports SARL",
    siret: "46054856325499",
    vat_number: null,
    revtc_number: "EVTC 006 210 045",
    registered_address: "12 rue Barla, 06300 Nice",
    pro_card_number: "06 24 01 8837",
    created_at: "2026-06-01T09:00:00+02:00",
    ...over,
  };
}

function vehicle(over: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: "v-1",
    driver_id: "dr-1",
    category: "business",
    body_type: "sedan",
    make: "Mercedes",
    model: "Classe E",
    colour: "Noir",
    plate: "AB-123-CD",
    seats: 4,
    is_active: true,
    created_at: "2026-06-01T09:00:00+02:00",
    ...over,
  } as VehicleRow;
}

const trip = {
  accepted_fare: 62,
  created_at: "2026-08-25T17:50:28.995+00:00",
  pickup_at: "2026-08-25T19:35:00+00:00",
  pickup_address: "37 Prom. des Anglais, 06000 Nice, France",
};

const negresco = {
  name: "Hôtel Negresco",
  legal_name: "SA LE NEGRESCO",
  reception_phone: "+33 4 93 16 64 00",
};

describe("3° — the SIREN", () => {
  it("is the first nine digits of the SIRET, which is the only place it lives", () => {
    expect(sirenFromSiret("46054856325499")).toBe("460548563");
    expect(formatSiren(sirenFromSiret("46054856325499"))).toBe("460 548 563");
  });

  it("survives the spaces people type off their Kbis", () => {
    expect(sirenFromSiret("460 548 563 25499")).toBe("460548563");
  });

  it("returns null rather than a truncated lie when the SIRET is short", () => {
    // ⚑ A 9-digit input is a SIREN already, and slicing it would look right. But the
    // column is documented as a SIRET, so a short value means someone typed the wrong
    // thing — printing it as a verified SIREN on a legal document is the failure.
    expect(sirenFromSiret("460548563")).toBeNull();
    expect(sirenFromSiret("")).toBeNull();
    expect(sirenFromSiret(null)).toBeNull();
  });
});

describe("the issue gate", () => {
  it("issues nothing at all when the exploitant is incomplete", () => {
    expect(waybillGaps(driver({ revtc_number: null }))).toHaveLength(1);
    expect(waybillGaps(driver({ revtc_number: null }))[0].mention).toBe("2°");
    expect(waybillGaps(driver({ company_name: null }))[0].mention).toBe("1°");
    expect(waybillGaps(driver({ registered_address: null }))[0].mention).toBe("1°");
    expect(waybillGaps(driver({ siret: null }))[0].mention).toBe("3°");
  });

  it("treats whitespace as absent — a space is not a company name", () => {
    expect(waybillGaps(driver({ company_name: "   " }))).toHaveLength(1);
    expect(waybillGaps(driver({ revtc_number: "\t" }))).toHaveLength(1);
  });

  it("blocks on a MALFORMED siret, not just a missing one", () => {
    // 3° is derived, so a SIRET that cannot yield a SIREN is the same failure as none.
    expect(waybillGaps(driver({ siret: "4605485632" }))[0].mention).toBe("3°");
  });

  it("lets a complete exploitant through", () => {
    expect(waybillGaps(driver())).toEqual([]);
  });

  it("does NOT block on the extras — they are not among the seven", () => {
    // The carte professionnelle is displayed on the windscreen under R. 3120-6; the
    // document is valid without its number, and refusing here would strand a Driver
    // over something the law does not ask this document for.
    expect(waybillGaps(driver({ pro_card_number: null }))).toEqual([]);
    expect(waybillGaps(driver({ phone: null }))).toEqual([]);
  });
});

describe("4° — who ordered it", () => {
  it("prefers the legal name, because that is what a register can be checked against", () => {
    const wb = buildWaybill(trip, driver(), negresco, vehicle(), null);
    expect(wb.ordering.name).toBe("SA LE NEGRESCO");
  });

  it("falls back to the trading name when there is no legal one", () => {
    const wb = buildWaybill(trip, driver(), { ...negresco, legal_name: null }, vehicle(), null);
    expect(wb.ordering.name).toBe("Hôtel Negresco");
  });

  it("falls back to the Dispatcher's phone when the Business has no reception number", () => {
    // ⚑ The arrêté's final paragraph allows 4°'s phone to be omitted — but then the
    // Driver must give the controller a way to reach the client "sans délai". Printing
    // nothing puts that burden on a Driver standing at a window, so we print the human
    // who actually booked it.
    const wb = buildWaybill(
      trip,
      driver(),
      { ...negresco, reception_phone: null },
      vehicle(),
      "+33 6 22 33 44 56",
    );
    expect(wb.ordering.phone).toBe("+33 6 22 33 44 56");
  });
});

describe("5° and 6° are two different moments", () => {
  it("keeps the booking time apart from the pickup time", () => {
    // This is the whole point of the document: 5° BEFORE 6° is what makes the
    // reservation *préalable*. Collapsing them would destroy the only thing it proves.
    const wb = buildWaybill(trip, driver(), negresco, vehicle(), null);
    expect(wb.bookedAt).toBe(trip.created_at);
    expect(wb.pickupAt).toBe(trip.pickup_at);
    expect(new Date(wb.bookedAt).getTime()).toBeLessThan(new Date(wb.pickupAt).getTime());
  });
});

describe("the extras the founder asked for", () => {
  it("prints the car it was given, and says nothing when there is none", () => {
    const wb = buildWaybill(trip, driver(), negresco, vehicle(), null);
    expect(wb.vehicle?.label).toBe("Mercedes Classe E Noir");
    expect(wb.vehicle?.plate).toBe("AB-123-CD");
    expect(buildWaybill(trip, driver(), negresco, null, null).vehicle).toBeNull();
  });

  it("names the conducteur, who is not the exploitant", () => {
    // A one-person company, but two legal roles: the exploitant holds the REVTC, the
    // conducteur holds the carte professionnelle. The document carries both.
    const wb = buildWaybill(trip, driver(), negresco, vehicle(), null);
    expect(wb.conducteur.name).toBe("Marc Fontaine");
    expect(wb.exploitant.name).toBe("Fontaine Transports SARL");
  });
});

describe("the price", () => {
  it("is the Course, and the decision is pinned so it cannot be quietly swapped", () => {
    // ⚑ NOT driver_net — on a document the Business can reach, Course minus net yields
    //   the Driver-side rate, which docs/06:190 forbids them ever seeing.
    // ⚑ NOT the Business all-in — it hands the Driver the Business's cost basis.
    // ⚑ NOT the Ceiling — the Driver is shown it nowhere, and printing it after they
    //   accepted tells them what they left on the table.
    expect(WAYBILL_PRICE).toBe("course");
    const wb = buildWaybill(trip, driver(), negresco, vehicle(), null);
    expect(wb.course).toBe(62);
  });

  it("prints no price at all rather than a zero when the fare was never frozen", () => {
    const wb = buildWaybill({ ...trip, accepted_fare: null }, driver(), negresco, vehicle(), null);
    expect(wb.course).toBeNull();
  });
});
