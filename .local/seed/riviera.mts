// S68 — the world the seed builds: places, routes, people. Data only.
//
// Distances and durations are the real road numbers for the Riviera, not
// straight-line guesses — the fare comes off `distance_km`, so a wrong number
// here produces wrong money everywhere downstream.
export interface Place { label: string; address: string; lat: number; lng: number; zone: string; airport?: boolean }

export const PLACES: Record<string, Place> = {
  majestic:   { label: "Hôtel Majestic, Cannes", address: "10 Bd de la Croisette, 06400 Cannes, France", lat: 43.5507, lng: 7.0166, zone: "cannes" },
  negresco:   { label: "Hôtel Negresco, Nice", address: "37 Prom. des Anglais, 06000 Nice, France", lat: 43.6950, lng: 7.2586, zone: "nice" },
  bellesrives:{ label: "Belles-Rives, Juan-les-Pins", address: "33 Bd Édouard Baudoin, 06160 Antibes, France", lat: 43.5642, lng: 7.1093, zone: "antibes" },
  metropole:  { label: "Métropole, Monte-Carlo", address: "4 Av. de la Madone, 98000 Monaco", lat: 43.7396, lng: 7.4278, zone: "monaco" },
  nceT1:      { label: "Nice Airport, T1", address: "Aéroport Nice Côte d'Azur, Terminal 1, 06206 Nice, France", lat: 43.6607, lng: 7.2049, zone: "nice", airport: true },
  nceT2:      { label: "Nice Airport, T2", address: "Aéroport Nice Côte d'Azur, Terminal 2, 06206 Nice, France", lat: 43.6656, lng: 7.2145, zone: "nice", airport: true },
  garenice:   { label: "Gare de Nice-Ville", address: "Av. Thiers, 06000 Nice, France", lat: 43.7045, lng: 7.2620, zone: "nice" },
  garecannes: { label: "Gare de Cannes", address: "1 Rue Jean Jaurès, 06400 Cannes, France", lat: 43.5539, lng: 7.0197, zone: "cannes" },
  monacoport: { label: "Port Hercule, Monaco", address: "Quai Antoine 1er, 98000 Monaco", lat: 43.7350, lng: 7.4256, zone: "monaco" },
  capferrat:  { label: "Saint-Jean-Cap-Ferrat", address: "71 Bd Général de Gaulle, 06230 Saint-Jean-Cap-Ferrat, France", lat: 43.6866, lng: 7.3320, zone: "cap-ferrat" },
  eze:        { label: "Èze Village", address: "Rue du Barri, 06360 Èze, France", lat: 43.7278, lng: 7.3617, zone: "eze" },
  mougins:    { label: "Mougins Village", address: "Pl. du Commandant Lamy, 06250 Mougins, France", lat: 43.6003, lng: 7.0060, zone: "mougins" },
  sttropez:   { label: "Saint-Tropez", address: "Pl. des Lices, 83990 Saint-Tropez, France", lat: 43.2694, lng: 6.6389, zone: "saint-tropez" },
  menton:     { label: "Menton", address: "Prom. du Soleil, 06500 Menton, France", lat: 43.7747, lng: 7.4969, zone: "menton" },
  portvauban: { label: "Port Vauban, Antibes", address: "Av. de Verdun, 06600 Antibes, France", lat: 43.5865, lng: 7.1279, zone: "antibes" },
  mrsAirport: { label: "Marseille Airport", address: "Aéroport Marseille Provence, 13700 Marignane, France", lat: 43.4393, lng: 5.2214, zone: "marseille", airport: true },
  valberg:    { label: "Valberg", address: "Valberg, 06470 Péone, France", lat: 44.0958, lng: 6.9297, zone: "haut-var" },
};

/**
 * Where the Drivers live. A SEPARATE map from PLACES, and that is the point.
 *
 * ⚑ THE FIRST VERSION OF THIS SEED USED PLACES FOR DRIVER BASES, because it was
 * the coordinate list that already existed — so the console read "Élodie
 * Marchand · Hôtel Negresco · 35 km", a Driver apparently living in a hotel. The
 * founder spotted it on sight. The app has always asked the Driver for their own
 * address ("Your base — start typing a town or address", app/(app)/settings/area):
 * only the test data was wrong. Keeping the two maps apart is what stops it
 * happening again — a hotel is somewhere a trip starts, not somewhere a Driver
 * sleeps.
 *
 * ⚑ EACH TOWN IS WITHIN ~10 km OF THE HOTEL IT REPLACED, deliberately. The three
 * months of history were generated from the old bases, so a bigger move would
 * have stranded trips outside the range of the Driver who actually drove them —
 * and the past-tense matcher would then say the holder could never have taken
 * it. Verified before the move: 0 of 294 held trips fall out of range.
 *
 * ⚑ Karim Nasri is 60,4 km from Valberg on a 60 km radius (he was 60,8 from
 * Belles-Rives). That 400 m is load-bearing: he owns the fleet's only First-class
 * van, so his range is the whole reason "nobody can take Valberg → Marseille
 * Airport" is true. Moving him further in would delete a finding the console
 * exists to make.
 */
export const BASES: Record<string, { label: string; lat: number; lng: number }> = {
  nice:        { label: "Nice",                 lat: 43.7009, lng: 7.2683 },
  stlaurent:   { label: "Saint-Laurent-du-Var", lat: 43.6680, lng: 7.1858 },
  cagnes:      { label: "Cagnes-sur-Mer",       lat: 43.6637, lng: 7.1489 },
  antibes:     { label: "Antibes",              lat: 43.5808, lng: 7.1251 },
  juanlespins: { label: "Juan-les-Pins",        lat: 43.5678, lng: 7.1076 },
  vallauris:   { label: "Vallauris",            lat: 43.5805, lng: 7.0546 },
  lecannet:    { label: "Le Cannet",            lat: 43.5766, lng: 7.0192 },
  cannes:      { label: "Cannes",               lat: 43.5528, lng: 7.0174 },
  mougins:     { label: "Mougins",              lat: 43.6003, lng: 7.0060 },
  monaco:      { label: "Monaco",               lat: 43.7384, lng: 7.4246 },
  beausoleil:  { label: "Beausoleil",           lat: 43.7433, lng: 7.4213 },
};

/** [from, to, road km, minutes]. Both directions are generated from each pair. */
export const LEGS: [keyof typeof PLACES, keyof typeof PLACES, number, number][] = [
  ["majestic", "nceT2", 27, 35],
  ["majestic", "nceT1", 26, 34],
  ["majestic", "monacoport", 51, 62],
  ["majestic", "sttropez", 89, 105],
  ["majestic", "mougins", 8, 15],
  ["majestic", "portvauban", 12, 21],
  ["majestic", "garenice", 33, 45],
  ["negresco", "nceT2", 7, 16],
  ["negresco", "nceT1", 6, 14],
  ["negresco", "monacoport", 22, 35],
  ["negresco", "capferrat", 15, 26],
  ["negresco", "eze", 14, 24],
  ["negresco", "menton", 31, 42],
  ["negresco", "sttropez", 116, 132],
  ["negresco", "garenice", 3, 9],
  ["bellesrives", "nceT2", 20, 28],
  ["bellesrives", "majestic", 13, 22],
  ["bellesrives", "monacoport", 43, 55],
  ["bellesrives", "garecannes", 12, 20],
  ["metropole", "nceT2", 30, 41],
  ["metropole", "nceT1", 29, 40],
  ["metropole", "menton", 12, 20],
  ["metropole", "eze", 9, 17],
  ["metropole", "majestic", 51, 62],
  ["negresco", "mrsAirport", 199, 137],
  ["majestic", "valberg", 122, 128],
];

export interface DriverSpec {
  first: string; last: string; email: string;
  category: "eco" | "business" | "luxury";
  body: "sedan" | "van";
  make: string; model: string; colour: string; plate: string; seats: number;
  base: keyof typeof BASES; radius: number;
  verified: boolean; luggage: boolean;
  /** Days after the window opens that they signed up — the growth curve. */
  joinDay: number;
  languages: string[];
  /** How eagerly they take work, 0–1. Drives who ends up with which trip. */
  appetite: number;
}

// Eleven Drivers. The spread is deliberate: three classes, two body types,
// eleven towns and radii from 25 to 80 km, so every rule the console can name
// has at least one Driver it genuinely applies to.
export const DRIVERS: DriverSpec[] = [
  { first: "Marc",     last: "Fontaine",  email: "marc.fontaine@kavenue.test",  category: "business", body: "sedan", make: "Mercedes", model: "Classe E", colour: "Noir", plate: "AB-123-CD", seats: 4, base: "nice",    radius: 55, verified: true,  luggage: false, joinDay: 0,  languages: ["fr", "en"],       appetite: 0.9 },
  { first: "Sofia",    last: "Berger",    email: "sofia.berger@kavenue.test",   category: "business", body: "sedan", make: "BMW",      model: "Série 5",  colour: "Gris",  plate: "CE-456-FG", seats: 4, base: "lecannet",    radius: 45, verified: true,  luggage: false, joinDay: 0,  languages: ["fr", "en", "de"], appetite: 0.85 },
  { first: "Karim",    last: "Nasri",     email: "karim.nasri@kavenue.test",    category: "luxury",   body: "van",   make: "Mercedes", model: "Classe V", colour: "Noir",  plate: "GH-789-IJ", seats: 7, base: "juanlespins", radius: 60, verified: true,  luggage: true,  joinDay: 2,  languages: ["fr", "en", "ar"], appetite: 0.7 },
  { first: "Élodie",   last: "Marchand",  email: "elodie.marchand@kavenue.test",category: "eco",      body: "sedan", make: "Peugeot",  model: "508",      colour: "Blanc", plate: "KL-012-MN", seats: 4, base: "stlaurent",    radius: 35, verified: true,  luggage: false, joinDay: 5,  languages: ["fr"],             appetite: 0.95 },
  { first: "Thomas",   last: "Rey",       email: "thomas.rey@kavenue.test",     category: "luxury",   body: "sedan", make: "Mercedes", model: "Classe S", colour: "Noir",  plate: "OP-345-QR", seats: 4, base: "monaco",   radius: 40, verified: true,  luggage: false, joinDay: 9,  languages: ["fr", "en", "it"], appetite: 0.6 },
  { first: "Nadia",    last: "Bouchard",  email: "nadia.bouchard@kavenue.test", category: "business", body: "van",   make: "Volkswagen", model: "Multivan", colour: "Gris", plate: "ST-678-UV", seats: 7, base: "mougins",    radius: 70, verified: true,  luggage: true,  joinDay: 14, languages: ["fr", "en"],       appetite: 0.8 },
  { first: "Julien",   last: "Astier",    email: "julien.astier@kavenue.test",  category: "eco",      body: "sedan", make: "Skoda",    model: "Superb",   colour: "Gris",  plate: "WX-901-YZ", seats: 4, base: "cannes",    radius: 30, verified: true,  luggage: false, joinDay: 21, languages: ["fr", "en"],       appetite: 0.75 },
  { first: "Inès",     last: "Lefranc",   email: "ines.lefranc@kavenue.test",   category: "business", body: "sedan", make: "Audi",     model: "A6",       colour: "Bleu",  plate: "AA-234-BB", seats: 4, base: "cagnes",    radius: 50, verified: true,  luggage: false, joinDay: 33, languages: ["fr", "en", "es"], appetite: 0.7 },
  { first: "Bastien",  last: "Roux",      email: "bastien.roux@kavenue.test",   category: "luxury",   body: "sedan", make: "Bentley",  model: "Flying Spur", colour: "Noir", plate: "CC-567-DD", seats: 4, base: "beausoleil",   radius: 80, verified: true,  luggage: false, joinDay: 47, languages: ["fr", "en", "ru"], appetite: 0.45 },
  { first: "Amine",    last: "Belkacem",  email: "amine.belkacem@kavenue.test", category: "business", body: "sedan", make: "Mercedes", model: "Classe E", colour: "Noir",  plate: "EE-890-FF", seats: 4, base: "antibes", radius: 45, verified: false, luggage: true,  joinDay: 62, languages: ["fr", "en"],       appetite: 0.8 },
  { first: "Clara",    last: "Vidal",     email: "clara.vidal@kavenue.test",    category: "eco",      body: "sedan", make: "Renault",  model: "Talisman", colour: "Gris",  plate: "GG-123-HH", seats: 4, base: "vallauris",    radius: 25, verified: false, luggage: false, joinDay: 74, languages: ["fr"],             appetite: 0.85 },
];

export interface BusinessSpec {
  name: string; place: keyof typeof PLACES;
  legalName: string; siret: string; vat: string;
  phone: string; email: string;
  defaultCategory: "eco" | "business" | "luxury";
  /** Rough trips per week — what makes one hotel a big account and another small. */
  weekly: number;
  joinDay: number;
  desks: { name: string; email: string; phone: string }[];
}

export const BUSINESSES: BusinessSpec[] = [
  {
    name: "Hôtel Majestic Cannes", place: "majestic",
    legalName: "SAS MAJESTIC CROISETTE", siret: "38412765400027", vat: "FR41384127654",
    phone: "+33 4 92 98 77 00", email: "conciergerie@majestic-cannes.test",
    defaultCategory: "business", weekly: 11, joinDay: 0,
    desks: [
      { name: "Camille Roussel", email: "camille.roussel@majestic-cannes.test", phone: "+33 6 11 22 33 44" },
      { name: "Youssef Amrani",  email: "youssef.amrani@majestic-cannes.test",  phone: "+33 6 11 22 33 45" },
    ],
  },
  {
    name: "Hôtel Negresco", place: "negresco",
    legalName: "SA LE NEGRESCO", siret: "57204118300019", vat: "FR29572041183",
    phone: "+33 4 93 16 64 00", email: "reservations@negresco.test",
    defaultCategory: "business", weekly: 8, joinDay: 0,
    desks: [
      { name: "Hélène Barbier", email: "helene.barbier@negresco.test", phone: "+33 6 22 33 44 55" },
      { name: "Paul Ducasse",   email: "paul.ducasse@negresco.test",   phone: "+33 6 22 33 44 56" },
    ],
  },
  {
    name: "Hôtel Belles-Rives", place: "bellesrives",
    legalName: "SARL BELLES RIVES", siret: "31578944200016", vat: "FR83315789442",
    phone: "+33 4 93 61 02 79", email: "concierge@belles-rives.test",
    defaultCategory: "luxury", weekly: 4, joinDay: 17,
    desks: [{ name: "Marion Estève", email: "marion.esteve@belles-rives.test", phone: "+33 6 33 44 55 66" }],
  },
  {
    name: "Hôtel Métropole Monte-Carlo", place: "metropole",
    legalName: "SAM METROPOLE MONTE-CARLO", siret: "", vat: "",
    phone: "+377 93 15 15 15", email: "conciergerie@metropole.test",
    defaultCategory: "luxury", weekly: 5, joinDay: 41,
    desks: [{ name: "Luca Ferretti", email: "luca.ferretti@metropole.test", phone: "+377 6 40 61 22 33" }],
  },
];

/** Hotel guests. Named, because a trip with a name on it reads like a real trip. */
export const GUESTS = [
  "M. Alexandre Kernel", "Mme Charlotte Weiss", "Mr James Holloway", "Mrs Priya Raman",
  "M. Étienne Brial", "Sig. Marco Pellegrini", "Mme Nour Haddad", "Mr David Okonkwo",
  "Frau Anke Zimmermann", "M. Olivier Sancerre", "Mrs Eleanor Sharpe", "M. Rachid Benali",
  "Ms Yuki Tanaka", "Sr. Diego Alarcón", "Mme Isabelle Fournier", "Mr Thomas Wexley",
  "M. Grégoire Aubert", "Mrs Sandra Lindqvist", "M. Farid Cherif", "Ms Hannah Brightwell",
];

export const AIRLINES = ["AF", "BA", "LH", "EK", "U2", "LX", "AZ", "QR", "TK", "KL"];

export const NOTES = [
  "Guest is travelling with a small dog in a carrier.",
  "Please wait at the concierge desk, not outside.",
  "Guest prefers no conversation during the ride.",
  "Two large suitcases plus a golf bag.",
  "Guest is elderly — please assist with luggage.",
  "Child seat needed for a 3-year-old.",
  "Meeting the guest at arrivals with a name board.",
  "Guest may be 10 minutes late leaving the spa.",
];
