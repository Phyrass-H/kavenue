// Kavenue vehicle catalog + classification (O5).
//
// Two-step fallback (founder's design): a vehicle's TIER is derived from its
// make+model, not self-selected:
//   1. Brand not in CHECKED_BRANDS        → "eco" (Eco/Standard). Stop.
//   2. Brand checked → model in exceptions → that tier ("business" | "luxury").
//                      model not listed    → "eco" (safe fallback).
// BODY (sedan/van) is a separate axis captured per vehicle. Tier maps to the DB
// `vehicle_category` enum: "eco" = Eco/Standard, "business" = Business,
// "luxury" = First (displayed as "First"). Maintain by editing the two arrays
// below — anything unlisted safely falls back to Eco/Standard.

import type { VehicleCategory } from "@/lib/database.types";

export type ServiceTier = Extract<VehicleCategory, "eco" | "business" | "luxury">;
export type BodyType = "sedan" | "van";

export const SERVICE_TIERS: ServiceTier[] = ["eco", "business", "luxury"];
export const BODY_TYPES: BodyType[] = ["sedan", "van"];

export const TIER_LABEL: Record<ServiceTier, string> = {
  eco: "Eco",
  business: "Business",
  luxury: "First",
};

export const BODY_LABEL: Record<BodyType, string> = { sedan: "Sedan", van: "Van" };

// Brands we bother to check (any brand with ≥1 above-Eco model).
export const CHECKED_BRANDS: { canonical: string; aliases: string[] }[] = [
  { canonical: "Mercedes-Benz", aliases: ["Mercedes", "Merc", "MB", "Benz", "Mercedes Benz", "Mercedes-AMG", "Maybach", "Mercedes-Maybach"] },
  { canonical: "BMW", aliases: ["Bmw", "B.M.W", "BMW i", "BMW M", "Bayerische Motoren Werke"] },
  { canonical: "Audi", aliases: ["Audi AG"] },
  { canonical: "Tesla", aliases: ["Tesla Motors"] },
  { canonical: "Volvo", aliases: ["Volvo Cars"] },
  { canonical: "Volkswagen", aliases: ["VW", "Volks Wagen", "Volkswagen AG"] },
  { canonical: "Land Rover", aliases: ["Range Rover", "Range-Rover", "RangeRover", "Landrover", "Land-Rover"] },
  { canonical: "Lexus", aliases: ["Lexus Europe"] },
  { canonical: "Jaguar", aliases: ["Jag"] },
  { canonical: "Porsche", aliases: ["Porsche AG"] },
  { canonical: "DS Automobiles", aliases: ["DS", "Citroën DS", "Citroen DS", "DS Auto"] },
  { canonical: "Maserati", aliases: ["Mas"] },
  { canonical: "Bentley", aliases: ["Bentley Motors"] },
  { canonical: "Rolls-Royce", aliases: ["Rolls Royce", "Rolls", "Rolls-Royce Motor Cars"] },
];

// Premium models. Anything from a checked brand NOT listed here → Eco/Standard.
export const MODEL_EXCEPTIONS: {
  brand: string;
  model: string;
  aliases: string[];
  tier: "business" | "luxury";
  body: BodyType;
}[] = [
  // Mercedes-Benz
  { brand: "Mercedes-Benz", model: "Classe C", aliases: ["C-Class", "Class C", "C-Klasse", "C 220", "C220d", "C 200", "C 300", "C 300 e"], tier: "business", body: "sedan" },
  { brand: "Mercedes-Benz", model: "Classe E", aliases: ["E-Class", "Class E", "E-Klasse", "E 220", "E220d", "E 300", "E 300 de", "E 200"], tier: "business", body: "sedan" },
  { brand: "Mercedes-Benz", model: "Classe S", aliases: ["S-Class", "Class S", "S-Klasse", "S 350", "S 400", "S 450", "S 500", "S 580", "Maybach", "Maybach S 580", "S 680"], tier: "luxury", body: "sedan" },
  { brand: "Mercedes-Benz", model: "EQE", aliases: ["EQE 350", "EQE Berline", "EQE Sedan"], tier: "business", body: "sedan" },
  { brand: "Mercedes-Benz", model: "EQS", aliases: ["EQS 450", "EQS 580", "EQS Berline", "Maybach EQS"], tier: "luxury", body: "sedan" },
  { brand: "Mercedes-Benz", model: "GLC", aliases: ["GLC 300", "GLC 220d", "GLC Coupé"], tier: "business", body: "sedan" },
  { brand: "Mercedes-Benz", model: "GLE", aliases: ["GLE 300d", "GLE 350", "GLE Coupé", "GLE 450"], tier: "business", body: "sedan" },
  { brand: "Mercedes-Benz", model: "GLS", aliases: ["GLS 450", "GLS 580", "Maybach GLS", "GLS 400d"], tier: "luxury", body: "sedan" },
  { brand: "Mercedes-Benz", model: "Classe G", aliases: ["G-Class", "G-Klasse", "G 400", "G 500", "G 63", "G 63 AMG", "G-Wagen"], tier: "luxury", body: "sedan" },
  // First, not Business (founder, 2026-08-16). The V-Class is the chauffeured van
  // the premium market sells as its top van tier — Blacklane bills it as a "Business
  // Van" at 1.4-1.9x a sedan, and the aggregators list it as "First Class Van" while
  // the Vito below sits in Standard. It is why docs/06 §4 has a First — van row.
  // ⚑ The Pool matches the tier EXACTLY (app/(app)/pool/page.tsx), so a V-Class
  //   Driver no longer sees Business-van work. BACKLOG § V (opt in to lower-class
  //   trips) is the answer and is timed to ship with the §6 curve.
  { brand: "Mercedes-Benz", model: "Classe V", aliases: ["V-Class", "V-Klasse", "Vclass", "V 250", "V 300", "EQV", "V 220", "VLE"], tier: "luxury", body: "van" },
  { brand: "Mercedes-Benz", model: "Vito", aliases: ["Vito Tourer", "eVito", "eVito Tourer", "Vito 119", "Vito 116"], tier: "business", body: "van" },
  { brand: "Mercedes-Benz", model: "Sprinter", aliases: ["Sprinter Tourer", "eSprinter", "Sprinter 519", "Sprinter VIP"], tier: "business", body: "van" },

  // BMW
  { brand: "BMW", model: "Série 3", aliases: ["3 Series", "3er", "Serie 3", "320d", "320i", "330e", "330i", "318d"], tier: "business", body: "sedan" },
  { brand: "BMW", model: "Série 5", aliases: ["5 Series", "5er", "Serie 5", "520d", "530e", "530i", "i5", "540i"], tier: "business", body: "sedan" },
  { brand: "BMW", model: "Série 7", aliases: ["7 Series", "7er", "Serie 7", "730d", "740i", "740d", "750e", "i7", "760i"], tier: "luxury", body: "sedan" },
  { brand: "BMW", model: "i4", aliases: ["i4 eDrive40", "i4 M50"], tier: "business", body: "sedan" },
  { brand: "BMW", model: "X3", aliases: ["X3 xDrive", "X3 30e", "X3 20d", "iX3"], tier: "business", body: "sedan" },
  { brand: "BMW", model: "X5", aliases: ["X5 xDrive", "X5 40d", "X5 45e", "X5 30d"], tier: "business", body: "sedan" },
  { brand: "BMW", model: "X7", aliases: ["X7 xDrive40", "X7 M60", "X7 40d"], tier: "luxury", body: "sedan" },
  { brand: "BMW", model: "iX", aliases: ["iX xDrive50", "iX M60", "iX xDrive40"], tier: "business", body: "sedan" },

  // Audi
  { brand: "Audi", model: "A4", aliases: ["A4 Avant", "A4 40 TDI", "A4 35 TDI", "A4 45 TFSI"], tier: "business", body: "sedan" },
  { brand: "Audi", model: "A6", aliases: ["A6 Avant", "A6 40 TDI", "A6 50 TDI", "A6 55 TFSI e", "A6 e-tron"], tier: "business", body: "sedan" },
  { brand: "Audi", model: "A7", aliases: ["A7 Sportback", "A7 50 TDI", "A7 55 TFSI"], tier: "business", body: "sedan" },
  { brand: "Audi", model: "A8", aliases: ["A8 L", "A8 50 TDI", "A8 60 TFSI e", "S8"], tier: "luxury", body: "sedan" },
  { brand: "Audi", model: "e-tron GT", aliases: ["RS e-tron GT", "e-tron GT quattro", "etron GT"], tier: "luxury", body: "sedan" },
  { brand: "Audi", model: "Q5", aliases: ["Q5 Sportback", "Q5 40 TDI", "Q5 TFSI e"], tier: "business", body: "sedan" },
  { brand: "Audi", model: "Q7", aliases: ["Q7 50 TDI", "Q7 55 TFSI e", "Q7 45 TDI"], tier: "business", body: "sedan" },
  { brand: "Audi", model: "Q8", aliases: ["Q8 50 TDI", "Q8 55 TFSI", "SQ8", "RS Q8"], tier: "luxury", body: "sedan" },
  { brand: "Audi", model: "Q8 e-tron", aliases: ["e-tron", "Q8 e-tron Sportback", "etron"], tier: "luxury", body: "sedan" },
  { brand: "Audi", model: "Q6 e-tron", aliases: ["Q6 e-tron Sportback", "Q6 etron"], tier: "business", body: "sedan" },

  // Tesla (Model 3 & Model Y intentionally omitted → Eco by fallback)
  { brand: "Tesla", model: "Model S", aliases: ["Model S Plaid", "Model S Long Range"], tier: "luxury", body: "sedan" },
  { brand: "Tesla", model: "Model X", aliases: ["Model X Plaid", "Model X Long Range"], tier: "luxury", body: "sedan" },

  // Volvo
  { brand: "Volvo", model: "S90", aliases: ["S90 Recharge", "S90 B5", "S90 T8"], tier: "business", body: "sedan" },
  { brand: "Volvo", model: "V90", aliases: ["V90 Cross Country", "V90 Recharge"], tier: "business", body: "sedan" },
  { brand: "Volvo", model: "S60", aliases: ["S60 Recharge", "S60 B4"], tier: "business", body: "sedan" },
  { brand: "Volvo", model: "XC60", aliases: ["XC60 Recharge", "XC60 B5", "XC60 T8"], tier: "business", body: "sedan" },
  { brand: "Volvo", model: "XC90", aliases: ["XC90 Recharge", "XC90 B5", "XC90 T8", "XC90 Excellence"], tier: "business", body: "sedan" },
  { brand: "Volvo", model: "EX90", aliases: ["EX90 Twin Motor"], tier: "business", body: "sedan" },

  // Volkswagen
  { brand: "Volkswagen", model: "Multivan", aliases: ["Multivan T7", "Multivan eHybrid", "Multivan T6.1", "VW Bus"], tier: "business", body: "van" },
  { brand: "Volkswagen", model: "Caravelle", aliases: ["Caravelle T6.1", "Caravelle T6"], tier: "business", body: "van" },
  { brand: "Volkswagen", model: "ID. Buzz", aliases: ["ID Buzz", "ID.Buzz", "ID Buzz LWB", "IDBuzz", "Bulli"], tier: "business", body: "van" },
  { brand: "Volkswagen", model: "Touareg", aliases: ["Touareg R", "Touareg eHybrid", "Touareg V6"], tier: "business", body: "sedan" },
  { brand: "Volkswagen", model: "Arteon", aliases: ["Arteon Shooting Brake", "Arteon R-Line"], tier: "business", body: "sedan" },

  // Land Rover
  { brand: "Land Rover", model: "Range Rover", aliases: ["Range Rover Autobiography", "Range Rover SV", "Range Rover Vogue", "RR Vogue"], tier: "luxury", body: "sedan" },
  { brand: "Land Rover", model: "Range Rover Sport", aliases: ["RR Sport", "Range Rover Sport SV"], tier: "luxury", body: "sedan" },
  { brand: "Land Rover", model: "Range Rover Velar", aliases: ["RR Velar", "Velar"], tier: "business", body: "sedan" },
  { brand: "Land Rover", model: "Defender", aliases: ["Defender 110", "Defender 130", "Defender X"], tier: "business", body: "sedan" },
  { brand: "Land Rover", model: "Discovery", aliases: ["Discovery Sport", "Disco", "Discovery HSE"], tier: "business", body: "sedan" },

  // Lexus
  { brand: "Lexus", model: "ES", aliases: ["ES 300h", "ES300h", "ES 350"], tier: "business", body: "sedan" },
  { brand: "Lexus", model: "LS", aliases: ["LS 500", "LS 500h", "LS500h"], tier: "luxury", body: "sedan" },
  { brand: "Lexus", model: "RX", aliases: ["RX 350h", "RX 450h+", "RX 500h"], tier: "business", body: "sedan" },
  { brand: "Lexus", model: "NX", aliases: ["NX 350h", "NX 450h+"], tier: "business", body: "sedan" },
  { brand: "Lexus", model: "LM", aliases: ["LM 350h", "LM350h", "LM 500h", "Lexus LM"], tier: "luxury", body: "van" },

  // Jaguar
  { brand: "Jaguar", model: "XF", aliases: ["XF Sportbrake", "XF P250", "XF D200"], tier: "business", body: "sedan" },
  { brand: "Jaguar", model: "XJ", aliases: ["XJ L", "XJ50"], tier: "luxury", body: "sedan" },
  { brand: "Jaguar", model: "F-Pace", aliases: ["F Pace", "F-Pace SVR", "FPace"], tier: "business", body: "sedan" },
  { brand: "Jaguar", model: "I-Pace", aliases: ["I Pace", "iPace", "I-PACE EV400"], tier: "business", body: "sedan" },

  // Porsche
  { brand: "Porsche", model: "Panamera", aliases: ["Panamera 4", "Panamera Turbo", "Panamera 4S E-Hybrid"], tier: "luxury", body: "sedan" },
  { brand: "Porsche", model: "Taycan", aliases: ["Taycan 4S", "Taycan Turbo", "Taycan Cross Turismo"], tier: "luxury", body: "sedan" },
  { brand: "Porsche", model: "Cayenne", aliases: ["Cayenne S", "Cayenne E-Hybrid", "Cayenne Coupé", "Cayenne Turbo"], tier: "luxury", body: "sedan" },
  { brand: "Porsche", model: "Macan", aliases: ["Macan S", "Macan Electric", "Macan EV", "Macan T"], tier: "business", body: "sedan" },

  // DS Automobiles
  { brand: "DS Automobiles", model: "DS 9", aliases: ["DS9", "DS 9 E-Tense", "DS 9 Crossback"], tier: "business", body: "sedan" },
  { brand: "DS Automobiles", model: "DS 7", aliases: ["DS7", "DS 7 Crossback", "DS 7 E-Tense"], tier: "business", body: "sedan" },

  // Maserati
  { brand: "Maserati", model: "Quattroporte", aliases: ["Quattroporte GT", "Quattroporte Trofeo"], tier: "luxury", body: "sedan" },
  { brand: "Maserati", model: "Ghibli", aliases: ["Ghibli GT", "Ghibli Modena"], tier: "business", body: "sedan" },
  { brand: "Maserati", model: "Levante", aliases: ["Levante GT", "Levante Trofeo"], tier: "luxury", body: "sedan" },
  { brand: "Maserati", model: "Grecale", aliases: ["Grecale GT", "Grecale Folgore"], tier: "business", body: "sedan" },

  // Bentley
  { brand: "Bentley", model: "Flying Spur", aliases: ["Flying Spur V8", "Flying Spur Speed", "Flying Spur Hybrid"], tier: "luxury", body: "sedan" },
  { brand: "Bentley", model: "Bentayga", aliases: ["Bentayga EWB", "Bentayga Hybrid", "Bentayga S"], tier: "luxury", body: "sedan" },

  // Rolls-Royce
  { brand: "Rolls-Royce", model: "Ghost", aliases: ["Ghost EWB", "Ghost Black Badge"], tier: "luxury", body: "sedan" },
  { brand: "Rolls-Royce", model: "Phantom", aliases: ["Phantom EWB", "Phantom Series II"], tier: "luxury", body: "sedan" },
  { brand: "Rolls-Royce", model: "Cullinan", aliases: ["Cullinan Black Badge", "Cullinan Series II"], tier: "luxury", body: "sedan" },
];

// ---- Matching helpers (free-text tolerant: accents/case/punctuation) ----

function normCar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

// Resolve a typed make to a checked-brand canonical, else null.
function resolveBrand(make: string): string | null {
  const n = normCar(make);
  if (!n) return null;
  for (const b of CHECKED_BRANDS) {
    if (normCar(b.canonical) === n || b.aliases.some((a) => normCar(a) === n)) return b.canonical;
  }
  // tolerate "Mercedes-Benz Classe E" accidentally typed in the make field
  for (const b of CHECKED_BRANDS) {
    const keys = [b.canonical, ...b.aliases].map(normCar).filter((k) => k.length >= 3);
    if (keys.some((k) => n.startsWith(k))) return b.canonical;
  }
  return null;
}

/**
 * The make as it should be STORED — one spelling per brand.
 *
 * ⚑ WHY THIS EXISTS. `vehicle.make` is saved exactly as the Driver typed it
 * (app/(app)/settings/actions.ts) and this table was only ever used to CLASSIFY a car,
 * never to clean it. So the live fleet holds "Mercedes" while the canonical brand here
 * is "Mercedes-Benz", and a brands breakdown — which the founder asked for on
 * 2026-09-09 — would show one marque as two rows. Every alias already lives in
 * CHECKED_BRANDS; this simply applies it on the way in.
 *
 * ⚑ AN UNKNOWN BRAND IS KEPT, NOT BLANKED. Only its shape is tidied: "peugeot" and
 * "PEUGEOT" become "Peugeot" so they stop being two makes, while a short all-caps name
 * (DS, MG, BMW-before-it-is-matched) keeps its capitals, because "Ds" is not a marque.
 * Losing what a Driver typed would be worse than an untidy row.
 */
export function canonicalMake(make: string | null | undefined): string | null {
  const raw = (make ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const known = resolveBrand(raw);
  if (known) return known;
  return raw
    .split(" ")
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

// Find the exception a typed make+model resolves to (canonical, alias, or trim).
function findException(make: string, model: string) {
  const brand = resolveBrand(make);
  if (!brand) return null;
  const nm = normCar(model);
  if (!nm) return null;
  const candidates = MODEL_EXCEPTIONS.filter((e) => e.brand === brand);
  // 1) exact match on the canonical model or any alias.
  for (const e of candidates) {
    if (normCar(e.model) === nm || e.aliases.some((a) => normCar(a) === nm)) return e;
  }
  // 2) prefix match for trims — but ONLY when the remainder is a number
  //    (e.g. "Classe E 220" → "classee"+"220"). A letter remainder means a
  //    DIFFERENT model ("Classe A" must NOT match the "Class E" alias "classe").
  for (const e of candidates) {
    const keys = [e.model, ...e.aliases].map(normCar).filter((k) => k.length >= 2);
    for (const k of keys) {
      if (nm.startsWith(k) && /^[0-9]/.test(nm.slice(k.length))) return e;
    }
  }
  return null;
}

// Two-step fallback: make+model → service tier.
export function categorize(make: string, model: string): ServiceTier {
  if (!resolveBrand(make)) return "eco";
  const ex = findException(make, model);
  return ex ? ex.tier : "eco";
}

// Body suggested by the recognised model (null if unknown — Driver picks).
export function suggestedBody(make: string, model: string): BodyType | null {
  return findException(make, model)?.body ?? null;
}

// Named premium cars for a tier+body (the Dispatcher's specific-car options).
// Eco has no catalog (it's the fallback) → empty.
export function carsFor(tier: ServiceTier, body: BodyType): { make: string; model: string }[] {
  return MODEL_EXCEPTIONS.filter((e) => e.tier === tier && e.body === body).map((e) => ({
    make: e.brand,
    model: e.model,
  }));
}

export function carRangeHint(tier: ServiceTier, body: BodyType, max = 3): string {
  const names = carsFor(tier, body).map((c) => `${c.make} ${c.model}`);
  if (names.length === 0) return "";
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown}…` : shown;
}

// Does a Driver's free-text car satisfy a Dispatcher's specific-car request?
// Both are resolved to a catalog exception, then compared by canonical identity
// (so "Mercedes E220d" ≈ requested "Mercedes-Benz Classe E").
export function carMatches(
  driverMake: string,
  driverModel: string,
  reqMake: string,
  reqModel: string,
): boolean {
  const reqEx = findException(reqMake, reqModel);
  const driverEx = findException(driverMake, driverModel);
  if (reqEx && driverEx) return reqEx.brand === driverEx.brand && reqEx.model === driverEx.model;
  // Fallback when the requested car isn't in the catalog: tolerant direct compare.
  if (normCar(driverModel) !== normCar(reqModel)) return false;
  const dm = normCar(resolveBrand(driverMake) ?? driverMake);
  const rm = normCar(resolveBrand(reqMake) ?? reqMake);
  return dm === rm || dm.includes(rm) || rm.includes(dm);
}
