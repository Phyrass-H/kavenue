// § The first drive — the one trip per Driver that is worth a phone call.
//
// The founder's brief (2026-09-04): *"make a way to list first drive of each
// driver so I have an easy access to them and then I can call either the driver
// or the business."* Two calls, not one, and they happen at different moments —
// the Driver BEFORE (are you ready, do you know where the door is) and the
// Business AFTER (how was he). So the window has to reach in both directions,
// and every row carries both numbers.
//
// ⚑ THIS IS NOT A FINDING, AND THE DIFFERENCE IS DELIBERATE. A finding
// interrupts you and is silent when it has nothing (lib/activity-findings.ts).
// This is a working list you go TO, with phone numbers on it. It says so when it
// is empty, because an empty tool that renders nothing looks broken rather than
// quiet.
import { formatAgo, shortPlaceLabel } from "@/lib/format";
import type { MissionStatus } from "@/lib/database.types";

/**
 * How long a finished first trip stays worth calling about.
 *
 * ⚑ SEVEN, NOT THE TWO THE FOUNDER FIRST SAID — agreed with them 2026-09-06.
 * The call you want after a first trip is to the hotel, and at two days a Friday
 * trip is gone before Monday. Nothing is hidden by the wider window: every row
 * says how long ago it ran, in words.
 */
export const RECENT_DAYS = 7;

/**
 * Did the Driver drive it, or are they going to?
 *
 * ⚑ TYPE-KEYED SO A NEW STATUS CANNOT SLIP THROUGH EITHER WAY. An allow-list
 * would silently DROP a status added later; a deny-list (`!== "cancelled"`)
 * would silently INCLUDE it. This map is a compile error until someone says
 * which a new status is. `draft`/`pooled`/`expired` never carry a driver_id, and
 * are false for the same reason `cancelled` is: nobody drove.
 */
export const DROVE: Record<MissionStatus, boolean> = {
  draft: false,
  pooled: false,
  accepted: true,
  confirmed: true,
  en_route: true,
  arrived: true,
  on_board: true,
  completed: true,
  // ⚑ A cancelled trip is not a first drive. Two live Drivers (Inès Lefranc,
  // Amine Belkacem) had a cancelled trip BEFORE the one they actually drove — so
  // counting it would name the wrong trip, the wrong date and the wrong hotel.
  cancelled: false,
  expired: false,
};

/** The statuses the read should ask for. Derived, so it can never drift from the map. */
export const DROVE_STATUSES = (Object.keys(DROVE) as MissionStatus[]).filter((s) => DROVE[s]);

export interface FirstTripDriver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  verified: boolean;
}

export interface FirstTripMission {
  id: string;
  driver_id: string | null;
  status: MissionStatus;
  pickup_at: string;
  pickup_label: string | null;
  dropoff_label: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  business_id: string | null;
}

export interface FirstTripBusiness {
  id: string;
  name: string;
  reception_phone: string | null;
}

export interface FirstTrip {
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  tripId: string;
  pickupAt: string;
  /** "Tue 1 Sep, 19:20" — the moment itself, beside the relative one. */
  at: string;
  /** "Hôtel Negresco → Nice Airport, T2" */
  route: string;
  businessId: string | null;
  businessName: string | null;
  businessPhone: string | null;
  /** Which side of now it falls on. */
  when: "upcoming" | "ran";
  /** "in 2 days" · "ran 5 days ago" */
  whenLabel: string;
}

export interface NeverDriven {
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  signedUpAt: string;
  /** "30 days" */
  waited: string;
  verified: boolean;
}

export interface FirstTrips {
  /** In the window: upcoming soonest-first, then the ones that just ran, newest-first. */
  trips: FirstTrip[];
  /** Signed up, never drove. Longest wait first. */
  neverDriven: NeverDriven[];
  /** How many Drivers are past all this — their first trip is old news. */
  settled: number;
}

/**
 * "Tue 1 Sep, 19:20".
 *
 * ⚑ en-GB AND Europe/Paris, like everything else on this console. The weekday is
 * carried because an upcoming first trip is a thing the founder plans a call
 * around, and "Sat" changes who is on the hotel desk. The money and the trip
 * dates elsewhere in the app are fr-FR; the console's own headings are English
 * (lib/format.ts:31 says why the two differ).
 */
const AT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function atLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "undated" : AT.format(d);
}

const nameOf = (d: Pick<FirstTripDriver, "first_name" | "last_name">) =>
  `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "A Driver";

/**
 * "Hôtel Negresco → Nice Airport, T2", falling back to the ADDRESS.
 *
 * ⚑ NOT `tripLabel` FROM lib/activity-findings. That one falls back to the
 * moment ("the 1 Sep, 19:20 trip") because a finding has nowhere else to put a
 * date. Here the row already prints the date beside the route, so repeating it
 * would say nothing — and the seeded trips that carry no labels DO carry
 * addresses, which is the useful thing to show.
 */
export function routeOf(m: FirstTripMission): string {
  const place = (label: string | null, address: string | null) =>
    label?.trim() || shortPlaceLabel(address) || "";
  const from = place(m.pickup_label, m.pickup_address);
  const to = place(m.dropoff_label, m.dropoff_address);
  if (from && to) return `${from} → ${to}`;
  return from || to || "no route on file";
}

/**
 * The first drive of every Driver, split by where it falls around `now`.
 *
 * ⚑ `missions` MUST ALREADY BE FILTERED TO `DROVE_STATUSES` — the caller does it
 * in the query so the read is not dragging cancelled trips across the wire. It
 * need not be sorted; this finds the earliest itself rather than trusting an
 * order it did not set.
 */
export function firstTrips(
  drivers: FirstTripDriver[],
  missions: FirstTripMission[],
  businesses: FirstTripBusiness[],
  now = new Date(),
): FirstTrips {
  const earliest = new Map<string, FirstTripMission>();
  for (const m of missions) {
    if (!m.driver_id || !DROVE[m.status]) continue;
    const held = earliest.get(m.driver_id);
    if (!held || m.pickup_at < held.pickup_at) earliest.set(m.driver_id, m);
  }
  const biz = new Map(businesses.map((b) => [b.id, b]));

  const t = now.getTime();
  const floor = t - RECENT_DAYS * 86_400_000;

  const trips: FirstTrip[] = [];
  const neverDriven: NeverDriven[] = [];
  let settled = 0;

  for (const d of drivers) {
    const m = earliest.get(d.id);
    if (!m) {
      neverDriven.push({
        driverId: d.id,
        driverName: nameOf(d),
        driverPhone: d.phone,
        signedUpAt: d.created_at,
        waited: formatAgo(Math.max(0, t - new Date(d.created_at).getTime())),
        verified: d.verified,
      });
      continue;
    }
    const at = new Date(m.pickup_at).getTime();
    if (at < floor) {
      settled++;
      continue;
    }
    const b = m.business_id ? biz.get(m.business_id) : undefined;
    trips.push({
      driverId: d.id,
      driverName: nameOf(d),
      driverPhone: d.phone,
      tripId: m.id,
      pickupAt: m.pickup_at,
      at: atLabel(m.pickup_at),
      route: routeOf(m),
      businessId: m.business_id,
      businessName: b?.name ?? null,
      businessPhone: b?.reception_phone ?? null,
      when: at >= t ? "upcoming" : "ran",
      whenLabel: at >= t ? `in ${formatAgo(at - t)}` : `ran ${formatAgo(t - at)} ago`,
    });
  }

  // Upcoming soonest-first (the call you can still make in time), then the ones
  // that just ran, newest-first (the hotel call, while it is fresh).
  trips.sort((a, b2) => {
    if (a.when !== b2.when) return a.when === "upcoming" ? -1 : 1;
    return a.when === "upcoming"
      ? a.pickupAt.localeCompare(b2.pickupAt)
      : b2.pickupAt.localeCompare(a.pickupAt);
  });
  // Longest wait first — the Driver who signed up in July and never drove is the
  // one to ring, not the one who joined on Tuesday.
  neverDriven.sort((a, b2) => a.signedUpAt.localeCompare(b2.signedUpAt));

  return { trips, neverDriven, settled };
}
