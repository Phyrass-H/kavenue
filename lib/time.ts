// Timezone helpers. Beta is the French Riviera → every wall-clock time the user
// types or reads is Europe/Paris. An <input type="datetime-local"> yields
// "YYYY-MM-DDTHH:mm" with NO timezone; we must interpret that as Paris wall time
// and convert to a UTC instant for storage (Postgres timestamptz). This replaces
// the old `new Date(local)` which silently used the server's local zone.

const PARIS = "Europe/Paris";

// Offset (in minutes) of `timeZone` at a given UTC instant. Positive = ahead of
// UTC (Paris is +60 in winter / +120 in summer).
function tzOffsetMinutes(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUTC - instant.getTime()) / 60_000;
}

// "YYYY-MM-DDTHH:mm" (Paris wall time) → the matching UTC Date. Null if it can't
// be parsed. Refined once so it stays correct across DST boundaries.
export function parisLocalToUtc(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  // First guess: treat the wall time as if it were UTC, then subtract the zone
  // offset at that instant; refine once for the instant we landed on.
  const guessUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Reject out-of-range parts (the regex only checks digit count): Date.UTC
  // silently rolls over (month 13, day 99, hour 99…), which would let a forged
  // POST store a wrong-but-valid instant. If normalisation changed any field,
  // the input was invalid → return null so callers hit the error path.
  const g = new Date(guessUtc);
  if (
    g.getUTCFullYear() !== y ||
    g.getUTCMonth() !== mo - 1 ||
    g.getUTCDate() !== d ||
    g.getUTCHours() !== h ||
    g.getUTCMinutes() !== mi
  ) {
    return null;
  }
  const off1 = tzOffsetMinutes(PARIS, new Date(guessUtc));
  const off2 = tzOffsetMinutes(PARIS, new Date(guessUtc - off1 * 60_000));
  const date = new Date(guessUtc - off2 * 60_000);
  return isNaN(date.getTime()) ? null : date;
}

// UTC ISO instant → "YYYY-MM-DDTHH:mm" Paris wall time, for prefilling a
// datetime-local input (e.g. when resuming a saved draft).
export function utcToParisLocalInput(iso: string): string {
  const off = tzOffsetMinutes(PARIS, new Date(iso));
  const shifted = new Date(new Date(iso).getTime() + off * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}` +
    `T${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`
  );
}

// "YYYY-MM-DDTHH:mm" (Paris wall time) → a friendly French label, e.g.
// "mar. 23 juin · 14:00". Formats from the parts directly so no second zone
// conversion happens.
export function prettyParisLocal(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return "—";
  const asUtc = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])),
  );
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(asUtc);
}

/**
 * A Paris WALL CLOCK — "YYYY-MM-DDTHH:mm", no zone, the thing a human reads off a
 * station board. Deliberately NOT assignable from a plain string.
 *
 * ⚑ WHY THIS IS A BRANDED TYPE AND NOT JUST `string`. `isNightPickup` reads the hour
 * straight out of the text, so it is only correct if the text is local. Two separate seed
 * scripts handed it `d.toISOString()` — UTC — and the night window silently slid by the
 * zone offset: in summer the seeded archive priced nights as 00:00–08:00 instead of
 * 22:00–06:00, on 25 of 370 trips ([[d124]]). Nothing failed. Nothing warned. Both calls
 * read as obviously correct.
 *
 * A brand makes that a compile error instead of a 20% pricing error.
 */
export type ParisLocal = string & { readonly __parisLocal: unique symbol };

/**
 * Validate a wall clock. Null when it isn't one.
 *
 * ⚑ A TRAILING ZONE IS THE TELL, and it is the whole point of the runtime half: every
 * `toISOString()` ends in "Z", and an offset like "+02:00" means someone passed an
 * instant. A wall clock cannot carry a zone — if it does, the caller is holding the
 * wrong kind of value and the honest answer is "this is not a wall clock".
 */
export function asParisLocal(local: string | null | undefined): ParisLocal | null {
  const s = (local ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) return null;
  return s as ParisLocal;
}

/** An instant → the Paris wall clock at that instant. The conversion the seeds skipped. */
export function utcToParisLocal(instant: Date | string): ParisLocal {
  const iso = typeof instant === "string" ? instant : instant.toISOString();
  return utcToParisLocalInput(iso) as ParisLocal;
}
