// Display helpers. Beta is French Riviera → French locale, Europe/Paris, EUR.
import type { BodyType, MissionStatus, VehicleCategory } from "@/lib/database.types";

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const timeOnly = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const dateOnly = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "Europe/Paris",
});

// Month headings follow the UI language (English), not the locale of the money
// and dates — "Juillet 2026" over "Fri 24 July" rows read as a bug.
const monthLong = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

// "2026-06" → "June 2026". Input is a Paris year-month key (YYYY-MM).
export function formatMonth(monthKey: string): string {
  return monthLong.format(new Date(`${monthKey}-01T12:00:00`));
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return money.format(Number(n));
}

/**
 * A stored rate as the percentage a person reads: 0,125 → "12,5 %". French
 * decimal comma and the space before the sign, to match formatMoney.
 */
export function formatRate(rate: number | string | null | undefined): string {
  const n = Number(rate);
  if (rate == null || !Number.isFinite(n)) return "—";
  const pct = Math.round(n * 10000) / 100;
  return `${String(pct).replace(".", ",")} %`;
}

/**
 * When something happened relative to the pickup: "2 h before pickup",
 * "18 min after pickup", "3 days before pickup". Null when unknown.
 *
 * ⚑ `mission_cancellation.hours_before_pickup` IS SIGNED, and negative is a
 * normal value — not a data error. `driver_cancel_mission` computes it as
 * `(pickup_at - now()) / 3600` and accepts a cancel from `accepted`,
 * `confirmed`, `en_route` AND `arrived`; the last two routinely happen at or
 * after the pickup, and a Driver who sits out a 60-minute airport courtesy wait
 * and then gives up stamps a negative number. BACKLOG records the same on
 * no-show rows. Clamping at zero claims they walked exactly at the pickup
 * moment; printing it raw puts "-18 min before pickup" in a Business's
 * spreadsheet. Both are false — so say which side of the pickup it fell on.
 *
 * ⚑ ONE helper for the screen AND both CSV exports, deliberately: the first
 * version of this was two near-copies that disagreed with each other on the
 * same row (the export promises to be what the screen shows).
 */
export function formatLeadTime(hours: number | string | null | undefined): string | null {
  const h = Number(hours);
  if (hours == null || !Number.isFinite(h)) return null;
  const side = h < 0 ? "after pickup" : "before pickup";
  const a = Math.abs(h);
  // formatDuration alone would read "120 h" on a trip walked five days out.
  const label =
    a < 1
      ? `${Math.round(a * 60)} min`
      : a < 48
        ? formatDuration(Math.round(a * 60))
        : `${Math.round(a / 24)} days`;
  return `${label} ${side}`;
}

/** A per-minute waiting rate: 0,44 → "0,44 €/min". */
export function formatPerMinute(rate: number | string | null | undefined): string {
  const n = Number(rate);
  if (rate == null || !Number.isFinite(n)) return "—";
  return `${formatMoney(n)}/min`;
}

/**
 * How a SETTLED waiting spell is stated on both sides: "13 min at 0,44 €/min".
 * ⚑ The rate must come from the row's own stamped `waiting_rate`, never from
 * `waitingRatePerMin(category)` — that one is the LIVE rate. Rows settled
 * between 2026-07-22 and 2026-08-18 were billed a flat 1,00 whatever their
 * class, so re-deriving a rate from the class would put a false number beside
 * a real amount. Older rows have no rate at all and get the minutes alone.
 * ⚑ The rate must also be on the SAME side as the amount it sits beside. The
 * Driver's net rate (×0,88 → 0,44 · 0,66 · 0,88) multiplies out exactly at
 * every minute count; the Business's all-in one does not (0,575 prints
 * "0,58 €", and 0,58 × 20 ≠ the real 11,50). A Business rate is therefore only
 * ever stated Course-side, inside the invoice table where the fee lines follow
 * and the total still reconciles. docs/06 §10.
 */
export function formatWaitingSpell(
  minutes: number | string | null | undefined,
  ratePerMin: number | string | null | undefined,
): string {
  const m = Number(minutes);
  if (minutes == null || !Number.isFinite(m) || m <= 0) return "—";
  const label = `${Math.round(m)} min`;
  const r = Number(ratePerMin);
  if (ratePerMin == null || !Number.isFinite(r) || r <= 0) return label;
  return `${label} at ${formatPerMinute(r)}`;
}

// Straight-line distance, flagged approximate with "~" (it's not road distance).
// Under 10 km we keep one decimal; above, round to the nearest km.
export function formatDistance(km: number | null | undefined): string {
  if (km == null) return "—";
  if (km < 10) return `~${km.toFixed(1).replace(".", ",")} km`;
  return `~${Math.round(km)} km`;
}

// Cached ROAD distance (no "~" — it's a real routed distance). Postgres
// `numeric` comes back from PostgREST as a STRING, so coerce before maths.
export function formatKm(km: number | string | null | undefined): string {
  if (km == null) return "—";
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  return n < 10 ? `${n.toFixed(1).replace(".", ",")} km` : `${Math.round(n)} km`;
}

// Travel time: "25 min" or "1 h 05".
export function formatDuration(min: number | string | null | undefined): string {
  if (min == null) return "—";
  const n = Number(min);
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

// Card/detail trip line: prefer cached road distance + ETA; fall back to the
// straight-line estimate when routing wasn't available (older missions).
export function formatTripMeta(
  distanceKm: number | string | null | undefined,
  durationMin: number | string | null | undefined,
  straightKm: number | null | undefined,
): string {
  if (distanceKm != null) {
    return durationMin != null
      ? `${formatKm(distanceKm)} · ${formatDuration(durationMin)}`
      : formatKm(distanceKm);
  }
  return straightKm != null ? formatDistance(straightKm) : "";
}

// Countries we drop from the tail of a geocoded address (beta = Riviera, but be
// generous so cross-border Monaco/Italy trips read cleanly too).
const COUNTRY_RE =
  /^(france|monaco|italia|italy|españa|espagne|spain|deutschland|allemagne|germany|suisse|switzerland|belgique|belgium|united kingdom|royaume-uni|uk)$/i;

// Short, scannable label for the dense schedule line: the place name + its town,
// with the postcode and country stripped. Derived at render time from the stored
// formatted address — "1055 Chemin De Rabiac-Estagnol, 06600 Antibes, France"
// becomes "Chemin De Rabiac-Estagnol, Antibes". The EXACT address still shows in
// the expanded trip detail + the Driver's navigation, so nothing is lost. (Phase 1:
// string-derived; a later additive migration can store Mapbox's structured POI
// fields for the prettier "Nice Airport · T1" form.)
export function shortPlaceLabel(address: string | null | undefined): string {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  // Drop a trailing country segment ("…, Nice, France" → "…, Nice").
  if (parts.length > 1 && COUNTRY_RE.test(parts[parts.length - 1])) parts.pop();
  if (parts.length === 0) return raw;

  // Town = the postcode-bearing segment with its postcode removed ("06600 Antibes"
  // → "Antibes"), scanning from the end; else the last segment, sans any postcode.
  let town = "";
  for (let i = parts.length - 1; i >= 1; i--) {
    const m = parts[i].match(/^\d{4,6}\s+(.+)$/);
    if (m) {
      town = m[1].trim();
      break;
    }
  }
  if (!town && parts.length > 1) {
    town = parts[parts.length - 1].replace(/\b\d{4,6}\b/, "").trim();
  }

  // Name = the first segment without a leading house number ("58 Bd …" → "Bd …").
  const name = parts[0].replace(/^\d+\s*(?:bis|ter)?\s+/i, "").trim() || parts[0];

  // Skip the town when the name already carries it ("Port de Nice" + "Nice").
  if (town && !name.toLowerCase().includes(town.toLowerCase())) return `${name}, ${town}`;
  return name;
}

// The TOWN a Driver's base is in — the Base column of /admin/drivers' "To be approved" table (S80).
// ⚑ Not shortPlaceLabel: that keeps the place name ("Pl. du Casino, Monaco"), and the column names a
// zone, not a street. Same postcode rule. ⚑ Monaco is a country AND the town, so a trailing "Monaco" is
// never dropped as a country the way "France" is.
export function baseTownOf(label: string | null | undefined): string {
  const parts = (label ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  // The postcode-bearing segment names the town ("98000 Monaco" → "Monaco"), scanning from the end.
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^\d{4,6}\s+(.+)$/);
    if (m) return m[1].trim();
  }
  const tail = parts[parts.length - 1];
  if (parts.length > 1 && COUNTRY_RE.test(tail) && !/^monaco$/i.test(tail)) parts.pop();
  return parts[parts.length - 1];
}

// The schedule route line: the full address MINUS the redundant trailing country
// (beta is all France/Monaco, so "…, Nice, France" → "…, Nice"). Keeps the house
// number, street, postcode + city untouched. The exact, full address still shows
// on hover + in the expanded trip detail.
export function addressLine(address: string | null | undefined): string {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && COUNTRY_RE.test(parts[parts.length - 1])) parts.pop();
  return parts.join(", ");
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTime.format(new Date(iso));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return timeOnly.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateOnly.format(new Date(iso));
}

// Pool card "when": a relative day + date ("Today · 24 Jul", "Sun · 26 Jul") and
// the time on its own line. `today` flags the current Paris day so the card can
// accent it. Relative today/tomorrow are decided on the Paris calendar date, so
// they never drift with the viewer's own timezone.
const poolWeekday = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "Europe/Paris",
});
const poolDayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});
const parisCalDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Paris",
});

export function formatPoolWhen(iso: string | null | undefined): {
  day: string;
  time: string;
  today: boolean;
} {
  if (!iso) return { day: "—", time: "—", today: false };
  const d = new Date(iso);
  const dCal = parisCalDate.format(d);
  const todayCal = parisCalDate.format(new Date());
  // Tomorrow from the Paris calendar date, not a fixed +24h offset — a Paris day
  // is 23h/25h across a DST boundary, so a millisecond offset lands on the wrong
  // date in those two ~1h windows a year. Noon UTC keeps us mid-afternoon Paris.
  const [ty, tm, td] = todayCal.split("-").map(Number);
  const tomorrowCal = parisCalDate.format(new Date(Date.UTC(ty, tm - 1, td + 1, 12)));

  let prefix: string;
  const today = dCal === todayCal;
  if (today) prefix = "Today";
  else if (dCal === tomorrowCal) prefix = "Tomorrow";
  else prefix = poolWeekday.format(d);

  return { day: `${prefix} · ${poolDayMonth.format(d)}`, time: timeOnly.format(d), today };
}

// My Rides day separator: "Today" / "Tomorrow" / "Friday 31 July" (+ the year when
// it isn't the current one). Same DST-safe Paris calendar arithmetic as
// formatPoolWhen — a Paris day is 23h/25h twice a year, so a fixed +24h offset
// lands on the wrong date in those windows.
const groupWeekday = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});
const groupWeekdayYear = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

export function formatDayGroup(iso: string | null | undefined): {
  label: string;
  today: boolean;
} {
  if (!iso) return { label: "—", today: false };
  const d = new Date(iso);
  const dCal = parisCalDate.format(d);
  const todayCal = parisCalDate.format(new Date());
  const [ty, tm, td] = todayCal.split("-").map(Number);
  const tomorrowCal = parisCalDate.format(new Date(Date.UTC(ty, tm - 1, td + 1, 12)));

  if (dCal === todayCal) return { label: "Today", today: true };
  if (dCal === tomorrowCal) return { label: "Tomorrow", today: false };
  const sameYear = dCal.slice(0, 4) === todayCal.slice(0, 4);
  return { label: (sameYear ? groupWeekday : groupWeekdayYear).format(d), today: false };
}

// Archive row date: "Sat 18 Jul" (+ the year when it isn't the current one).
//
// The history rows are grouped by MONTH but used to print only a time, so a
// July archive read "21:27 / 22:23 / 13:45" with no way to tell the 3rd from the
// 19th without opening the row. English like the month headings above them.
const archiveDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});
const archiveDayYear = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Paris",
});

export function formatArchiveDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameYear =
    parisCalDate.format(d).slice(0, 4) === parisCalDate.format(new Date()).slice(0, 4);
  return (sameYear ? archiveDay : archiveDayYear).format(d);
}

/**
 * § Q — the date for a row shown outside its own day band on the Schedule.
 * No weekday: the schedule's time column is sized for "19:45", and "Thu 30 Jul"
 * overruns it into the route. "30 Jul" fits, and the weekday buys nothing on a
 * trip the reader already knows isn't today.
 */
const shortDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});
const shortDayYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "2-digit",
  timeZone: "Europe/Paris",
});

export function formatShortDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameYear =
    parisCalDate.format(d).slice(0, 4) === parisCalDate.format(new Date()).slice(0, 4);
  return (sameYear ? shortDay : shortDayYear).format(d);
}

/**
 * § Q — how long ago, in the largest unit that still reads naturally: minutes,
 * then hours, then days. The founder's call (2026-08-10): an unclosed trip is
 * normally minutes or hours old, so a date would be the wrong register — but it
 * has to survive the rare one that sits for a week.
 *
 * Days are counted in whole 24h steps rather than calendar days on purpose: this
 * measures elapsed time since a moment, not which date it fell on.
 */
export function formatAgo(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  eco: "Eco",
  business: "Business",
  van: "Van", // legacy enum value (pre-O5)
  luxury: "First",
};

export function categoryLabel(c: VehicleCategory): string {
  return CATEGORY_LABELS[c];
}

const BODY_LABELS: Record<BodyType, string> = { sedan: "Sedan", van: "Van" };

// Service class = tier + body, e.g. "Business · Van". Body optional (older/any).
export function serviceClassLabel(c: VehicleCategory, body?: BodyType | null): string {
  const tier = CATEGORY_LABELS[c] ?? c;
  return body ? `${tier} · ${BODY_LABELS[body]}` : tier;
}

const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  draft: "Draft",
  pooled: "Pooled",
  accepted: "Accepted",
  confirmed: "Confirmed",
  en_route: "En route",
  arrived: "Arrived",
  on_board: "On board",
  completed: "Completed",
  cancelled: "Cancelled",
  // "Unfilled" is the ending; the Schedule's live warning is "No Driver yet".
  // A Driver never owns an expired trip, so this is belt-and-braces.
  expired: "Unfilled",
};

export function missionStatusLabel(s: MissionStatus): string {
  return MISSION_STATUS_LABELS[s];
}
