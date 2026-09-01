// § 4 — the Waybill, off the network.
//
// THE PROBLEM THIS SOLVES, IN ONE SENTENCE. A roadside control happens in the CDG
// parking levels, and every step between opening the app and reaching the Waybill needs
// the network — so the failure is not at the Waybill button, it is at the front door.
//
// ⚑ THE SAVED COPY IS A PHOTOCOPY, AND SAYS SO. `mission.pickup_at` and
// `pickup_address` can be amended, and a trip can change hands, so a copy taken at
// 21 h 02 is a claim about 21 h 02 and nothing later. It is stamped with that time —
// by the service worker, at the moment it serves it, so the stamp cannot go missing on
// a cached document (see `public/sw.js`).
//
// ⚑ WE STILL SHOW AN OLD COPY (founder, 2026-09-01). A dated snapshot beats an empty
// screen at the roadside, and it re-saves itself on every app open with signal, so in
// practice it is minutes old. There is deliberately NO expiry.
//
// ⚑ THIS MODULE IS SHARED WITH A FILE THAT CANNOT IMPORT IT. `public/sw.js` is served
// raw to the browser, so it re-declares these constants by hand.
// `tests/offline-waybill.test.ts` reads that file and fails if the two ever disagree —
// that test is the only thing keeping them in step.
import type { MissionStatus } from "@/lib/database.types";

export const WAYBILL_CACHE = "kavenue-waybill-v1";

/** Never a real route. The service worker keeps its index at this key inside the cache. */
export const WAYBILL_INDEX_URL = "/__kavenue/waybill-index";

/** The one page that opens with no signal. Short, because it is also the fallback. */
export const WAYBILLS_PATH = "/waybills";

export const SW_PATH = "/sw.js";

export const MSG_CACHE = "kavenue:cache-waybills";
export const MSG_CLEAR = "kavenue:clear";

/**
 * The trips whose Waybill is worth having on the phone: the ones the Driver holds.
 * ⚑ Imported by `app/(app)/rides/page.tsx` as its own Upcoming list — one definition, so
 * "what My Rides shows" and "what works offline" cannot drift apart.
 */
export const HELD_STATUSES: MissionStatus[] = [
  "accepted",
  "confirmed",
  "en_route",
  "arrived",
  "on_board",
];

export interface SavedWaybill {
  id: string;
  /** The Business as the Driver knows it — the trading name, not the legal one. */
  business: string;
  pickupAt: string;
  pickupAddress: string;
  /** ISO, stamped by the service worker when it took the copy. */
  savedAt?: string;
}

export interface WaybillIndex {
  savedAt: string;
  trips: SavedWaybill[];
}

export function waybillPath(id: string): string {
  return `/missions/${id}/waybill`;
}

/** `/missions/<uuid>/waybill` → `<uuid>`. Null for anything else. */
export function waybillIdFromPath(pathname: string): string | null {
  const m = /^\/missions\/([^/]+)\/waybill\/?$/.exec(pathname);
  return m ? m[1] : null;
}

const timeOnly = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const dayMonth = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});

const parisDay = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Paris",
});

/**
 * The list's own line: how old this Driver's copy is. App chrome, so English words
 * around French clock and date shapes — the same mix every other Driver screen uses.
 *
 * ⚑ "Just now" is not cosmetic. It is the Driver's answer to "am I covered?" before
 * they drive down a ramp, so it has to be true rather than reassuring: anything older
 * than a minute and a half prints the actual time instead.
 */
export function savedLabel(savedAt: string | null | undefined, now: Date): string {
  if (!savedAt) return "Not saved yet";
  const then = new Date(savedAt);
  if (Number.isNaN(then.getTime())) return "Not saved yet";
  if (now.getTime() - then.getTime() < 90_000) return "Saved just now";
  const time = timeOnly.format(then);
  if (parisDay.format(then) === parisDay.format(now)) return `Saved at ${time}`;
  return `Saved ${dayMonth.format(then)} at ${time}`;
}

/**
 * The row's own line: when this trip picks up. "25 août · 21:35".
 * ⚑ French date shapes with English chrome around them — `lib/format.ts` already sets
 * that mix for every Driver screen, and a lone English month here would read as a bug.
 */
export function waybillWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${dayMonth.format(d)} · ${timeOnly.format(d)}`;
}

/**
 * Can we reach Kavenue right now?
 *
 * ⚑ NOT `navigator.onLine`, WHICH LIES. It reports whether the device has *a* network,
 * and says true on hotel wifi behind a captive portal, on a train, and — the case that
 * caught this in testing — on a laptop whose own server is simply not running. The saved
 * list said "up to date, your 2 trips will open without signal" while nothing was
 * reachable at all. The only honest answer comes from actually asking.
 *
 * `/api/waybills` is neither a navigation nor a static asset, so the service worker lets
 * it through to the network: it either arrives or it doesn't.
 */
export async function reachable(): Promise<boolean> {
  try {
    const res = await fetch("/api/waybills", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
