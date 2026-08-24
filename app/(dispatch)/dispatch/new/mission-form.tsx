"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Car, MapPin, CalendarClock, ClipboardList, Route, Wallet, AlertTriangle, UserRound, Luggage } from "lucide-react";
import { createMission } from "./actions";
import { DateTimePicker } from "@/components/date-time-picker";
import { RouteStops, type RouteSummary } from "@/components/route-stops";
import type { Place } from "@/components/address-autocomplete";
import { ServiceClassFields } from "@/components/service-class-fields";
import { DriverServiceFields } from "@/components/driver-service-fields";
import { PassengerList } from "@/components/passenger-list";
import { ReferenceField } from "@/components/reference-field";
import { SERVICE_TIERS, type ServiceTier } from "@/lib/vehicle-catalog";
import {
  priceFor,
  isNightPickup,
  isMarketRate,
  isBelowFloor,
  type RateCardRow,
} from "@/lib/rate-card";
import {
  commissionSplit,
  courseFromBusinessTotal,
  type Rates,
} from "@/lib/commission";
import {
  parseLanguages,
  parseDriverFlags,
  activeFlagLabels,
  dressCodeLabel,
} from "@/lib/driver-service";
import { parseWaypoints, parseWaypointsField, unlocatedStops } from "@/lib/waypoints";
import {
  parsePassengers,
  primaryPassengerName,
  mergeContacts,
  splitFullName,
  VAN_SEATS,
  type Passenger,
  type GuestContact,
} from "@/lib/passengers";
import {
  parisLocalToUtc,
  prettyParisLocal,
  utcToParisLocalInput,
} from "@/lib/time";
import { tripDistanceKm, isValidLatLng } from "@/lib/geo";
import {
  formatMoney,
  formatRate,
  formatTripMeta,
  serviceClassLabel,
} from "@/lib/format";
import type { MissionRow, VehicleCategory, BodyType } from "@/lib/database.types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// "a, b, and c" — for naming exactly the fields that are still missing.
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Submit button wired to the form's pending state. While the createMission
// server action is in flight EVERY submit button is disabled, so a slow
// post/save can't be fired twice (repeated clicks were creating duplicate
// missions). Only the button that actually submitted shows its pending label.
// Must live in a child of the <form> for useFormStatus to see it.
function SubmitButton({
  intent,
  className,
  pendingLabel,
  blocked,
  children,
}: {
  intent: "pooled" | "draft";
  className: string;
  pendingLabel: string;
  blocked?: boolean;
  children: React.ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const isThis = pending && data?.get("intent") === intent;
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      className={className}
      disabled={pending || blocked}
      aria-busy={isThis}
    >
      {isThis ? pendingLabel : children}
    </button>
  );
}

// Cancel inside the confirm-post modal. Reads the form's pending state so it
// disables once Post is in flight — otherwise a Cancel click would close the
// modal while the (already-submitted) post completes in the background.
function ConfirmCancelButton({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      className="btn secondary"
      onClick={onCancel}
      disabled={pending}
      autoFocus
    >
      Cancel
    </button>
  );
}

// Keep the numeric fields numeric — strip anything that isn't a digit at input
// time, so letters, "e", "+"/"-" and pasted junk can never land in them.
const digitsOnly = (v: string) => v.replace(/[^\d]/g, "");
// Money fields: digits + a single decimal point (a typed comma becomes the point).
const decimalOnly = (v: string) =>
  v.replace(/,/g, ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

interface PreviewData {
  category: string;
  body: string;
  requiredCar: string | null;
  pickup: string;
  dropoff: string;
  stops: string[];
  pickupAtLocal: string;
  pax: string;
  luggage: string;
  guest: string;
  flight: string;
  reference: string;
  languages: string[];
  dressLabel: string | null;
  flagLabels: string[];
  boardName: string;
  driverMessage: string;
  distanceKm: number | null;
  roadKm: number | null;
  roadMin: number | null;
}

// Thresholds for the input-driven guidance nudges (S31) — calm, non-blocking hints
// that only appear when the Dispatcher's own input triggers them. Tunable.
const LUGGAGE_SEDAN_HINT = 4; // bags with a sedan / "Any" body → suggest a Van
const LUGGAGE_VAN_HINT = 8; // bags with a van → suggest a dedicated luggage vehicle

// Client form (Direction B). The fields live in a two-pane layout: section cards
// on the left, a sticky live Summary rail on the right (mini-route, ETA, ceiling,
// live starting fare, SPEED WIN, actions). Everything is inside ONE <form> so the
// createMission server action still gets a single FormData snapshot. "Review"
// snapshots the editable fields into the preview card (O11); from there you Post
// or Save as draft (O15). Editable cards stay mounted (hidden) in preview so they
// still submit; the rail (ceiling / SPEED WIN / actions) stays visible throughout.
export function MissionForm({
  error,
  prefillDate,
  draft,
  draftContacts,
  pickupPrefill,
  rateCard = [],
  commissionRates = null,
  commissionRatesUnavailable = false,
}: {
  error?: string;
  prefillDate?: string;
  draft?: MissionRow | null;
  draftContacts?: GuestContact[];
  pickupPrefill?: Place | null;
  rateCard?: RateCardRow[];
  commissionRates?: Rates | null;
  /** The rate lookup FAILED (≠ no rates in force). Nothing may be posted on a guess. */
  commissionRatesUnavailable?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [clientError, setClientError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  // The "This is final" confirm popup, opened by Post to the Pool (S21).
  const [confirmPost, setConfirmPost] = useState(false);

  // ⚑ THE FIELD IS ALL-IN, THE COLUMN IS THE COURSE (docs/06 §1, founder 2026-08-17).
  // A saved draft stores the fare; the Business set — and must see again — what
  // they will pay, fee inside. createMission converts it back on the way out.
  // ⚑ Seed BLANK when the rate lookup failed. The stored number is a Course and
  // this field is all-in; without the rate there is no honest conversion, and the
  // one thing we must not do is show the Course under an "everything in" label —
  // createMission would convert it a second time. Blank asks; a wrong number lies.
  const [ceiling, setCeiling] = useState(
    draft?.ceiling != null && !commissionRatesUnavailable
      ? commissionSplit(Number(draft.ceiling), commissionRates).businessTotal.toFixed(2)
      : "",
  );
  const [speedWin, setSpeedWin] = useState(draft?.speed_win ?? false);
  // Controlled so the luggage-vs-vehicle nudge (S31) reacts live; still submits via name.
  const [luggage, setLuggage] = useState(
    draft?.luggage_count != null ? String(draft.luggage_count) : "",
  );
  // Luggage-only run (Sujet B, Phase 1): a bags-only trip in a Van, no passengers.
  const [luggageOnly, setLuggageOnly] = useState(draft?.luggage_only ?? false);

  // Body type is chosen in the Vehicle & class card, but the passenger cap lives
  // in the Trip-details PassengerList — lift it so the cap reacts to it.
  const initBody =
    draft?.required_body_type === "van"
      ? "van"
      : draft?.required_body_type === "sedan"
        ? "sedan"
        : "";
  const [body, setBody] = useState<string>(initBody);

  // Service tier (category) lifted from the Vehicle & class card so the Driver
  // card's dress-code default tracks the chosen service class (S19).
  const initTier: ServiceTier = (SERVICE_TIERS as string[]).includes(draft?.category ?? "")
    ? (draft!.category as ServiceTier)
    : "business";
  const [tier, setTier] = useState<ServiceTier>(initTier);

  // First named Guest, lifted from the Trip-details PassengerList so the Driver
  // card pre-fills the meet & greet board with it (corrected on mount by the list).
  const [primaryName, setPrimaryName] = useState<string>(draft?.passenger_name ?? "");

  // Seed passenger rows: a draft's structured passenger_names (names + main flag)
  // merged with its side-table phones, else best-effort from a legacy single
  // passenger_name, else one blank row (the PassengerList default).
  const draftPassengers = mergeContacts(
    parsePassengers(draft?.passenger_names),
    draftContacts ?? [],
  );
  const seedBase =
    draftPassengers.length > 0
      ? draftPassengers
      : draft?.passenger_name
        ? [splitFullName(draft.passenger_name)]
        : [];
  // Preserve the stored headcount on resume: a draft (especially one predating
  // passenger_names) can carry pax_count > the named rows. Pad with blank rows up
  // to pax_count so resuming + re-saving never shrinks the count. Bounded to the
  // largest vehicle so a stray value can't spawn hundreds of rows.
  const seedTarget = Math.min(
    Math.max(seedBase.length, Number(draft?.pax_count) || 0),
    VAN_SEATS,
  );
  const seededPassengers: Passenger[] | undefined =
    seedTarget > 0
      ? Array.from(
          { length: seedTarget },
          (_, i) => seedBase[i] ?? { first: "", last: "", phone: "" },
        )
      : undefined;

  // Calendar prefill (?date=) → that day at 09:00; a resumed draft wins over it.
  const calendarValue =
    prefillDate && /^\d{4}-\d{2}-\d{2}$/.test(prefillDate) ? `${prefillDate}T09:00` : "";
  const [pickupAt, setPickupAt] = useState(
    draft?.pickup_at ? utcToParisLocalInput(draft.pickup_at) : calendarValue,
  );

  const prettyCalendar =
    !draft && calendarValue ? prettyParisLocal(calendarValue) : null;

  const ceilingNum = Number(ceiling);

  // Input-driven guidance nudges (S31) — calm, only-when-relevant hints in the
  // existing soft-warn style. Display-only; they never gate posting.
  const luggageNum = Number(luggage);
  const luggageHint =
    !luggageOnly && Number.isFinite(luggageNum) && luggageNum > 0
      ? body === "van"
        ? luggageNum >= LUGGAGE_VAN_HINT
          ? `${luggageNum} bags is a lot even for a Van — you may want a dedicated luggage vehicle.`
          : null
        : luggageNum >= LUGGAGE_SEDAN_HINT
          ? body === "sedan"
            ? `${luggageNum} bags is a lot for a Sedan's boot — consider a Van so it all fits.`
            : `${luggageNum} bags is a lot — a Van will fit them more comfortably than a Sedan.`
          : null
      : null;

  // Night pickup — 22:00 to 06:00 on the Paris wall-clock (docs/06 §4). It used
  // to raise an amber "consider a higher ceiling" nudge; the card now applies
  // the ×1.20 night rate itself, so that nudge would be asking the Business to
  // do something already done. The helper line under the Ceiling names it instead.
  const night = isNightPickup(pickupAt);

  // Prefill addresses: a resumed draft keeps its own pickup; a NEW mission starts
  // with the Business's saved address (when "pre-fill as pickup" is on) so a
  // departure is one less thing to type. Either way the field stays fully editable.
  const pickupDefault =
    draft && draft.pickup_lat != null && draft.pickup_lng != null
      ? { label: draft.pickup_address, lat: draft.pickup_lat, lng: draft.pickup_lng }
      : draft
        ? null
        : (pickupPrefill ?? null);
  const dropoffDefault =
    draft && draft.dropoff_lat != null && draft.dropoff_lng != null
      ? { label: draft.dropoff_address ?? "", lat: draft.dropoff_lat, lng: draft.dropoff_lng }
      : null;
  const stopsDefault = parseWaypoints(draft?.waypoints).map((w) => ({
    label: w.address,
    lat: w.lat ?? null,
    lng: w.lng ?? null,
  }));

  // A resumed draft's cached road ETA — seeds both the rail snapshot and the
  // RouteStops eta state so the figure shows immediately (no flicker to blank
  // before the live fetch returns).
  const draftEta =
    draft?.distance_km != null && draft?.duration_min != null
      ? { distanceKm: Number(draft.distance_km), durationMin: Number(draft.duration_min) }
      : null;

  // Live route snapshot for the Summary rail (mini-route + ETA). RouteStops keeps
  // it current via onSummaryChange.
  const [routeSummary, setRouteSummary] = useState<RouteSummary>(() => ({
    pickup: pickupDefault,
    dropoff: dropoffDefault,
    stopCount: stopsDefault.filter((s) => s.lat != null && s.lng != null).length,
    eta: draftEta,
    etaLoading: false,
    pickupText: pickupDefault?.label ?? "",
    dropoffText: dropoffDefault?.label ?? "",
    stops: stopsDefault.map((s) => s.label),
    // Seeded empty: a resumed draft's stops may in fact be unlocated, and
    // RouteStops republishes the truth on mount. The refusal reads the hidden
    // `waypoints` field at review time, not this snapshot.
    unlocatedStops: [],
  }));

  // ── Kavenue's price for this trip (docs/06 §4) ────────────────────────────
  // Live off the ROAD distance the route card reports — not the straight line,
  // which runs ~25% short and would under-price every trip. Null until there is
  // a located drop-off: with no route there is no price, and inventing one is
  // worse than leaving the field alone.
  // A luggage-only run is forced to Business + Van server-side, so it prices as
  // one here too rather than on whatever tier the tiles happen to show.
  const priceTier: ServiceTier = luggageOnly ? "business" : tier;
  const priceBody: BodyType | null = luggageOnly ? "van" : ((body || null) as BodyType | null);
  const quote = priceFor(rateCard, priceTier, priceBody, routeSummary.eta?.distanceKm, { night });

  // The Ceiling shows Kavenue's price for the trip AS IT STANDS. An edit lasts
  // until the trip changes — change the class, the body, the route or the pickup
  // hour and the price re-derives over the top of it.
  //
  // ⚑ Founder's call, and it is the safer failure. Letting a typed number outlive
  // a class change leaves, say, 100 € typed for an Eco trip sitting on a First
  // one: above First's floor, so nothing blocks it, wrong by a factor of three,
  // and completely silent. Re-pricing fails visibly instead — the number moves
  // and the "Market rate" chip comes back, which is already the signal that this
  // is Kavenue's figure again.
  //
  // Typing is safe while you type: the deps only move when the PRICE moves, and
  // a keystroke in this field changes neither the route nor the class.
  const quoteCeiling = quote?.ceiling ?? null;
  // Reopening a saved draft is not a change to the trip, so the first quote must
  // not overwrite a ceiling the Business deliberately edited before saving.
  const keepDraftCeiling = useRef(draft?.ceiling != null);
  useEffect(() => {
    if (quoteCeiling == null) return;
    if (keepDraftCeiling.current) {
      keepDraftCeiling.current = false;
      return;
    }
    const next = quoteCeiling.toFixed(2);
    setCeiling((prev) => (prev === next ? prev : next));
  }, [quoteCeiling]);

  const hasCeiling = ceiling !== "" && Number.isFinite(ceilingNum) && ceilingNum > 0;
  const atMarket = hasCeiling && isMarketRate(ceilingNum, quote);
  const belowFloor = hasCeiling && isBelowFloor(ceilingNum, quote);
  const belowMarket =
    hasCeiling && !belowFloor && quote != null && !isMarketRate(ceilingNum, quote)
      ? Math.round(ceilingNum * 100) < Math.round(quote.ceiling * 100)
      : false;
  const aboveMarket =
    hasCeiling && quote != null && Math.round(ceilingNum * 100) > Math.round(quote.ceiling * 100);

  // ── What is inside that maximum (docs/06 §1, §3) ──────────────────────────
  // The field is the all-in figure; the Course behind it is what the curve
  // climbs and the Driver is paid from. Shown as the three invoice lines,
  // because the Business reclaims the 20 % on Kavenue's fee but not the VAT on
  // the transport, so the two can never be collapsed into one "service fee".
  const course = hasCeiling ? courseFromBusinessTotal(ceilingNum, commissionRates) : 0;
  const split = commissionSplit(course, commissionRates);
  // The all-in figure the stored Course actually reproduces. Equal to what they
  // typed except on the ~1 value in 8 that a cent of Course cannot reach, where
  // it lands a cent under — never over, because a maximum is a promise.
  const ceilingAllIn = split.businessTotal;
  const snapped = hasCeiling && Math.round(ceilingAllIn * 100) !== Math.round(ceilingNum * 100);
  // Where the auction opens, in the Business's own terms: the FLOOR (docs/06 §6
  // rule 1), or 70% of the Ceiling under SPEED WIN — never below the floor, since
  // a Ceiling set close to the floor can make 70% of it the smaller number.
  //
  // ⚑ This mirrors `openingPrice()` in lib/pdp.ts and `pdpStart` in
  // dispatch/new/actions.ts. All three compute in Course space and convert once,
  // so the number previewed here is the number that gets stored. Change one,
  // change all three. With no quote (no drop-off yet) there is no floor to open
  // at, and the server falls back to the same 50% this does.
  const openCourse = quote
    ? speedWin
      ? Math.max(courseFromBusinessTotal(quote.floor, commissionRates), round2(course * 0.7))
      : courseFromBusinessTotal(quote.floor, commissionRates)
    : round2(course * (speedWin ? 0.7 : 0.5));
  const startAllIn = commissionSplit(Math.min(openCourse, course), commissionRates).businessTotal;

  function review() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const category = String(fd.get("category") ?? "");
    const pickup = String(fd.get("pickup_address") ?? "").trim();
    const dropoff = String(fd.get("dropoff_address") ?? "").trim();
    const at = String(fd.get("pickup_at") ?? "").trim();
    // toNum (not Number()) — Number("") is 0, a "finite" coordinate that would let a
    // never-located pickup/dropoff pass as valid and yield a bogus (0,0) distance.
    const pickupLat = toNum(fd.get("pickup_lat"));
    const pickupLng = toNum(fd.get("pickup_lng"));
    const dropLat = toNum(fd.get("dropoff_lat"));
    const dropLng = toNum(fd.get("dropoff_lng"));
    const ceilingN = toNum(fd.get("ceiling"));
    const pickupLocated =
      pickupLat != null && pickupLng != null && isValidLatLng(pickupLat, pickupLng);
    const dropoffLocated =
      dropLat != null && dropLng != null && isValidLatLng(dropLat, dropLng);
    // Read the stops from the field that will actually be POSTed, not from the
    // rail's own state, so the check and the write can never disagree.
    const loose = unlocatedStops(parseWaypointsField(fd.get("waypoints")));

    // Name ONLY what's actually missing — not a fixed catch-all sentence. Drop-off
    // is required to POST (a draft can still be saved incomplete from the edit view).
    const missing: string[] = [];
    if (!category) missing.push("a vehicle class");
    if (!pickup) missing.push("a pickup address");
    else if (!pickupLocated) missing.push("a pickup chosen from the address suggestions");
    if (!dropoff) missing.push("a drop-off address");
    else if (!dropoffLocated) missing.push("a drop-off chosen from the address suggestions");
    // An unlocated stop is unpriced and unpaid — see `unlocatedStops`.
    if (loose.length === 1) missing.push("a stop chosen from the address suggestions");
    else if (loose.length > 1)
      missing.push(`${loose.length} stops chosen from the address suggestions`);
    if (!at) missing.push("a pickup time");
    if (ceilingN == null || ceilingN <= 0) missing.push("a ceiling price");

    if (missing.length > 0) {
      setClientError(`Before posting, add ${joinAnd(missing)}.`);
      return;
    }
    // §5 — the floor is a refusal, not advice, so it stops the review too. The
    // server checks again against its own road distance and is the real guard;
    // this only saves the Business a round trip through the preview.
    if (belowFloor) {
      // Deliberately does NOT repeat the floor — the Pricing card is already
      // showing it in red, in context. Saying the number twice is noise.
      setClientError("Raise the ceiling before posting — see Pricing.");
      return;
    }
    const rMake = String(fd.get("required_make") ?? "").trim();
    const rModel = String(fd.get("required_model") ?? "").trim();
    const passengers = parsePassengers(fd.get("passenger_names"));
    setPreview({
      category,
      body: String(fd.get("required_body_type") ?? ""),
      requiredCar: rMake && rModel ? `${rMake} ${rModel}` : null,
      pickup,
      dropoff: String(fd.get("dropoff_address") ?? "").trim(),
      stops: parseWaypointsField(fd.get("waypoints")).map((w) => w.address),
      pickupAtLocal: at,
      pax: passengers.length ? String(passengers.length) : "",
      luggage: String(fd.get("luggage_count") ?? ""),
      guest: primaryPassengerName(passengers),
      flight: String(fd.get("flight_number") ?? "").trim(),
      reference: String(fd.get("reference") ?? "").trim().slice(0, 20),
      languages: parseLanguages(fd.get("required_languages")),
      dressLabel: dressCodeLabel(String(fd.get("dress_code") ?? "")),
      flagLabels: activeFlagLabels(fd.get("driver_flags")),
      boardName: String(fd.get("board_name") ?? "").trim(),
      driverMessage: String(fd.get("driver_message") ?? "").trim(),
      distanceKm: tripDistanceKm(pickupLat, pickupLng, dropLat, dropLng),
      roadKm: toNum(fd.get("route_distance_km")),
      roadMin: toNum(fd.get("route_duration_min")),
    });
    setClientError(null);
    setMode("preview");
  }

  // Enter inside a single-line <input> implicitly submits the form. Submitting
  // is only ever an explicit button action here, and in preview mode a stray
  // implicit submit would fire a LIVE post — so block Enter for inputs in BOTH
  // modes. <textarea> (newlines) and <button> (keyboard activation) are exempt.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
    }
  }

  // Auto-suggest SPEED WIN when the pickup is soon (≤5h) and it's off (O10a).
  const startsSoon = (() => {
    if (!preview) return false;
    const at = parisLocalToUtc(preview.pickupAtLocal);
    if (!at) return false;
    const hours = (at.getTime() - Date.now()) / 3_600_000;
    return hours > 0 && hours <= 5;
  })();

  const showFare = ceiling !== "" && Number.isFinite(ceilingNum) && ceilingNum > 0;

  // Escape closes the confirm-post popup (matches the click-the-backdrop exit).
  useEffect(() => {
    if (!confirmPost) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmPost(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmPost]);

  return (
    <form ref={formRef} action={createMission} onKeyDown={onKeyDown}>
      {draft && <input type="hidden" name="mission_id" value={draft.id} />}

      {draft && mode === "edit" && (
        <div className="notice info">Editing a saved draft.</div>
      )}
      {prettyCalendar && (
        <div className="notice info">
          Pre-filled for <strong>{prettyCalendar}</strong> from the calendar.
        </div>
      )}
      {error === "missing" && (
        <div className="notice error">
          A mission needs at least a vehicle class, a pickup picked from the address
          suggestions, a pickup time, and a ceiling — even to save as a draft.
        </div>
      )}
      {error === "nodrop" && (
        <div className="notice error">
          Add a drop-off and pick it from the address suggestions before posting.
          (You can still save it as a draft without one.)
        </div>
      )}
      {error === "nostop" && (
        <div className="notice error">
          Pick every stop from the address suggestions before posting — a stop we
          can’t place isn’t on the route, so it isn’t in the price either.
        </div>
      )}
      {error === "belowfloor" && (
        <div className="notice error">
          That ceiling is below the lowest this trip can be offered at. Raise it, or
          save it as a draft.
        </div>
      )}
      {/* Routing failed, so Kavenue has no distance and therefore no floor price.
          Posting anyway would skip the floor check entirely, so it doesn't — but
          the Dispatcher must be told it's a hiccup on our side, not their mistake,
          or they'll re-type perfectly good addresses trying to appease it. */}
      {error === "noprice" && (
        <div className="notice error">
          We couldn’t work out the distance for this trip just now, so we can’t price
          it — and we won’t post a trip we haven’t priced. Try again in a moment. If it
          keeps happening, re-pick the addresses from the suggestions, or save it as a
          draft and post it shortly.
        </div>
      )}
      {error === "past" && (
        <div className="notice error">
          That pickup time is in the past. Pick a future time, or save it as a draft.
        </div>
      )}
      {error === "gone" && (
        <div className="notice error">
          That draft was already posted or discarded — check your schedule, it may
          be live already.
        </div>
      )}
      {error === "db" && (
        <div className="notice error">Something went wrong. Please try again.</div>
      )}
      {error === "rates" && (
        <div className="notice error">
          We couldn&rsquo;t read the current service fee, so nothing was saved — your
          Ceiling has to mean the same thing on both sides of that number. Try again.
        </div>
      )}
      {commissionRatesUnavailable && (
        <div className="notice error">
          We can&rsquo;t read the current service fee, so this form can&rsquo;t work out
          what&rsquo;s inside your Ceiling. Posting and saving are off until it comes back
          &mdash; please reload in a moment.
        </div>
      )}

      <div className="mx-form-grid">
        {/* ---------- LEFT: section cards (kept mounted, hidden in preview) ---------- */}
        <div className="mx-left">
          <div className="mx-sections" style={{ display: mode === "preview" ? "none" : undefined }}>
            {/* Vehicle & class */}
            <div className="card">
              <div className="mx-card__head">
                <span className="mx-card__ic" aria-hidden>
                  <Car />
                </span>
                <h3 className="mx-card__title">Vehicle &amp; class</h3>
              </div>

              {/* Trip type — passengers, or a bags-only Van run (Sujet B, Phase 1) */}
              <div
                className="seg seg--full"
                role="group"
                aria-label="Trip type"
                style={{ marginBottom: 14 }}
              >
                <button
                  type="button"
                  className={`seg-btn${!luggageOnly ? " is-on" : ""}`}
                  aria-pressed={!luggageOnly}
                  onClick={() => setLuggageOnly(false)}
                >
                  Passengers
                </button>
                <button
                  type="button"
                  className={`seg-btn${luggageOnly ? " is-on" : ""}`}
                  aria-pressed={luggageOnly}
                  onClick={() => setLuggageOnly(true)}
                >
                  Luggage only
                </button>
              </div>

              {luggageOnly ? (
                <>
                  <div className="tier-empty">
                    <Luggage size={14} aria-hidden />
                    A Van, no passengers — service class Business. Add the number of bags
                    under Trip details.
                  </div>
                  <input type="hidden" name="category" value="business" />
                  <input type="hidden" name="required_body_type" value="van" />
                </>
              ) : (
                <ServiceClassFields
                  defaults={{
                    category: draft?.category,
                    body: draft?.required_body_type,
                    make: draft?.required_make,
                    model: draft?.required_model,
                  }}
                  onBodyChange={setBody}
                  onTierChange={setTier}
                />
              )}
              <input type="hidden" name="luggage_only" value={luggageOnly ? "1" : ""} />
            </div>

            {/* Route */}
            <div className="card">
              <div className="mx-card__head">
                <span className="mx-card__ic" aria-hidden>
                  <MapPin />
                </span>
                <h3 className="mx-card__title">Route</h3>
              </div>
              <RouteStops
                pickupDefault={pickupDefault}
                dropoffDefault={dropoffDefault}
                stopsDefault={stopsDefault}
                pickupAtLocal={pickupAt}
                etaDefault={draftEta}
                onSummaryChange={setRouteSummary}
              />
            </div>

            {/* Schedule */}
            <div className="card">
              <div className="mx-card__head">
                <span className="mx-card__ic" aria-hidden>
                  <CalendarClock />
                </span>
                <h3 className="mx-card__title">Schedule</h3>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <span>Pickup date &amp; time</span>
                <DateTimePicker value={pickupAt} onChange={setPickupAt} />
              </div>
              {pickupAt && (
                <p className="muted small" style={{ margin: "8px 0 0" }}>
                  {prettyParisLocal(pickupAt)} · Europe/Paris
                </p>
              )}
            </div>

            {/* Trip details */}
            <div className="card">
              <div className="mx-card__head">
                <span className="mx-card__ic" aria-hidden>
                  <ClipboardList />
                </span>
                <h3 className="mx-card__title">Trip details</h3>
              </div>
              {luggageOnly ? (
                <p className="muted small" style={{ margin: "0 0 4px" }}>
                  Luggage-only run — no passengers. Enter the number of bags below.
                </p>
              ) : (
                <PassengerList
                  body={body}
                  defaultPassengers={seededPassengers}
                  onPrimaryNameChange={setPrimaryName}
                />
              )}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  marginTop: 16,
                  marginBottom: 14,
                }}
              >
                <label
                  className="field"
                  style={{ flex: 1, minWidth: 140, marginBottom: 0 }}
                >
                  <span>Luggage</span>
                  <input
                    type="text"
                    name="luggage_count"
                    inputMode="numeric"
                    value={luggage}
                    onChange={(e) => setLuggage(digitsOnly(e.target.value))}
                  />
                </label>

                <label
                  className="field"
                  style={{ flex: 1, minWidth: 140, marginBottom: 0 }}
                >
                  <span>Flight number (optional)</span>
                  <input
                    type="text"
                    name="flight_number"
                    placeholder="AF1234"
                    defaultValue={draft?.flight_number ?? ""}
                  />
                </label>
              </div>

              {luggageHint && (
                <div className="notice warn" style={{ margin: "0 0 14px" }}>
                  {luggageHint}
                </div>
              )}

              <ReferenceField defaultValue={draft?.reference} />
            </div>

            {/* Driver & service — language / dress code / requests / message (S19) */}
            <div className="card">
              <div className="mx-card__head">
                <span className="mx-card__ic" aria-hidden>
                  <UserRound />
                </span>
                <h3 className="mx-card__title">Driver &amp; service</h3>
              </div>
              <DriverServiceFields
                tier={tier}
                guestName={primaryName}
                defaults={{
                  languages: parseLanguages(draft?.required_languages),
                  dressCode: draft?.dress_code ?? null,
                  flags: parseDriverFlags(draft?.driver_flags),
                  boardName: draft?.board_name ?? null,
                  driverMessage: draft?.driver_message ?? null,
                  hasBoardFile: !!draft?.board_file_path,
                }}
              />
            </div>

            {/* Pricing — base fare + ceiling + SPEED WIN grouped together */}
            <div className="card">
              <div className="mx-card__head">
                <span className="mx-card__ic" aria-hidden>
                  <Wallet />
                </span>
                <h3 className="mx-card__title">Pricing</h3>
                {/* Reminder of the vehicle you're pricing (live from the class card). */}
                <span className="mx-vehiclechip">
                  <Car size={13} aria-hidden />{" "}
                  {luggageOnly
                    ? "Business · Van"
                    : serviceClassLabel(tier as VehicleCategory, (body || null) as BodyType | null)}
                </span>
              </div>
              <label className="field" style={{ marginBottom: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Ceiling € — everything in
                  {atMarket && (
                    <span className="mx-vehiclechip" style={{ marginLeft: "auto" }}>
                      Market rate
                    </span>
                  )}
                </span>
                <input
                  type="text"
                  name="ceiling"
                  required
                  inputMode="decimal"
                  value={ceiling}
                  aria-invalid={belowFloor || undefined}
                  onChange={(e) => setCeiling(decimalOnly(e.target.value))}
                />
              </label>
              {quote && (
                <p className="muted small" style={{ margin: "8px 0 0" }}>
                  {/* Road km, one decimal — formatDistance() is the straight-line
                      helper and rounds to whole km above 10, which would print a
                      55.7 km trip as "56 km" next to a price computed on 55.7. */}
                  {(routeSummary.eta?.distanceKm ?? 0).toFixed(1).replace(".", ",")} km ·{" "}
                  {serviceClassLabel(priceTier as VehicleCategory, priceBody)}
                  {night && " · night rate"}
                  {/* The nudge to go higher is pointless once they already have —
                      above the market rate it would be asking for nothing. */}
                  {!aboveMarket && " — raise it to find a Driver faster."}
                </p>
              )}
              {belowFloor && quote && (
                <div className="notice error" style={{ margin: "12px 0 0" }}>
                  The lowest this trip can be offered at is{" "}
                  <strong>{formatMoney(round2(quote.floor))}</strong>. Almost no Driver
                  will take it at that price.
                </div>
              )}
              {belowMarket && quote && (
                <div className="notice warn" style={{ margin: "12px 0 0" }}>
                  Below the market rate of {formatMoney(round2(quote.ceiling))}. It will
                  take longer to find a Driver.
                </div>
              )}
              {hasCeiling && split.charged && (
                <div className="mx-fee">
                  <div className="mx-fee__head">What&rsquo;s inside your Ceiling</div>
                  <dl className="mx-fee__lines">
                    <dt>Transport</dt>
                    <dd>{formatMoney(split.course)}</dd>
                    <dt>Service fee ({formatRate(commissionRates?.businessHt)})</dt>
                    <dd>{formatMoney(split.businessFeeHt)}</dd>
                    <dt>VAT on service fee</dt>
                    <dd>{formatMoney(split.businessFeeVat)}</dd>
                    <dt className="mx-fee__tot">Your Ceiling</dt>
                    <dd className="mx-fee__tot">{formatMoney(ceilingAllIn)}</dd>
                  </dl>
                  <p className="muted small" style={{ margin: "8px 0 0" }}>
                    {snapped
                      ? `Rounded down from ${formatMoney(ceilingNum)} so the three lines bill exactly. `
                      : ""}
                    You pay this only if it fills at your Ceiling — it usually fills
                    lower, and the fee follows the fare down.
                  </p>
                </div>
              )}
              <div className="mx-sumdiv" />
              <label className="mx-speed">
                <input
                  type="checkbox"
                  name="speed_win"
                  checked={speedWin}
                  onChange={(e) => setSpeedWin(e.target.checked)}
                />
                <span>
                  {/* ⚑ It no longer climbs FASTER. Under docs/06 §6 SPEED WIN is
                      "the same curve with a higher starting point — nothing more":
                      every trip now reaches the Ceiling at T−5h whether it is on
                      or off. Saying otherwise was true of the old fixed-step
                      ladder and is false of this one. */}
                  <strong>SPEED WIN</strong> — open at 70% of your Ceiling instead of
                  the floor, so a Driver takes it sooner
                </span>
              </label>
            </div>
          </div>

          {/* PREVIEW card */}
          {mode === "preview" && preview && (
            <div>
              <p className="muted small" style={{ marginTop: 0 }}>
                Review before posting — this is how it enters the Pool.
              </p>

              <div className="card" style={{ background: "var(--surface-2, #f8fafc)" }}>
                <div className="card-row">
                  <span className="fare">
                    {formatMoney(startAllIn)}
                  </span>
                  <span style={{ display: "flex", gap: 6 }}>
                    {speedWin && <span className="badge speed">SPEED WIN</span>}
                    <span className="badge">
                      {serviceClassLabel(preview.category as VehicleCategory, preview.body as BodyType)}
                    </span>
                  </span>
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  starting price · climbs up to your Ceiling, {formatMoney(ceilingAllIn)}
                </div>

                <div className="muted small" style={{ marginTop: 8 }}>
                  {prettyParisLocal(preview.pickupAtLocal)}
                  {(() => {
                    const meta = formatTripMeta(preview.roadKm, preview.roadMin, preview.distanceKm);
                    return meta ? ` · ${meta}` : "";
                  })()}
                </div>

                <div className="dx-rte" style={{ marginTop: 8 }}>
                  <div className="dx-rte__leg">
                    <span className="dx-rte__dot dx-rte__dot--pk" aria-hidden />
                    <span className="dx-rte__addr">{preview.pickup}</span>
                  </div>
                  {preview.stops.map((s, i) => (
                    <div className="dx-rte__leg" key={i}>
                      <span className="dx-rte__dot dx-rte__dot--via" aria-hidden />
                      <span className="dx-rte__addr" style={{ color: "var(--text-muted)" }}>{s}</span>
                    </div>
                  ))}
                  <div className="dx-rte__leg">
                    <span className="dx-rte__dot dx-rte__dot--dp" aria-hidden />
                    <span className="dx-rte__addr">{preview.dropoff || "—"}</span>
                  </div>
                </div>

                <div className="mx-sumdiv" />

                <div className="dx-srow">
                  <span className="dx-slbl">Guest</span>
                  <div className="dx-sval">
                    {preview.guest || "—"} · {preview.pax || "—"} pax · {preview.luggage || "—"} bags
                  </div>
                </div>
                {preview.requiredCar && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Specific car</span>
                    <div className="dx-sval">{preview.requiredCar}</div>
                  </div>
                )}
                {preview.flight && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Flight</span>
                    <div className="dx-sval">{preview.flight}</div>
                  </div>
                )}
                {preview.reference && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Reference</span>
                    <div className="dx-sval">
                      {preview.reference}{" "}
                      <span className="muted" style={{ fontSize: 11 }}>· your team only</span>
                    </div>
                  </div>
                )}
                {preview.languages.length > 0 && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Languages</span>
                    <div className="dx-chips">
                      {preview.languages.map((l) => (
                        <span className="dx-chip dx-chip--plain" key={l}>{l}</span>
                      ))}
                    </div>
                  </div>
                )}
                {preview.dressLabel && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Dress</span>
                    <div className="dx-chips"><span className="dx-chip">{preview.dressLabel}</span></div>
                  </div>
                )}
                {preview.flagLabels.length > 0 && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Requests</span>
                    <div className="dx-chips">
                      {preview.flagLabels.map((f) => (
                        <span className="dx-chip" key={f}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {preview.boardName && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Name board</span>
                    <div className="dx-sval">{preview.boardName}</div>
                  </div>
                )}
                {preview.driverMessage && (
                  <div className="dx-srow">
                    <span className="dx-slbl">Message</span>
                    <div className="dx-quote">{preview.driverMessage}</div>
                  </div>
                )}
              </div>

              {startsSoon && !speedWin && (
                <div className="notice warn" style={{ marginTop: 14 }}>
                  This pickup is in under 5 hours. Consider SPEED WIN so a Driver grabs
                  it fast.{" "}
                  <button
                    type="button"
                    className="dx-link"
                    style={{ fontWeight: 600 }}
                    onClick={() => setSpeedWin(true)}
                  >
                    Enable SPEED WIN
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- RIGHT: sticky live Summary rail ---------- */}
        <aside className="mx-summary" aria-labelledby="mx-sum-title">
          <h2 id="mx-sum-title" className="mx-summary__band">Mission summary</h2>
          <div className="mx-summary__body">
            {routeSummary.pickup || routeSummary.dropoff ? (
              <div className="route" style={{ marginTop: 0 }}>
                <div className="leg">
                  <span className="dot" />
                  <span>{routeSummary.pickup?.label || "—"}</span>
                </div>
                {routeSummary.stopCount > 0 && (
                  <div className="leg">
                    <span className="dot" style={{ background: "#98a2b3" }} />
                    <span className="muted">
                      +{routeSummary.stopCount} stop{routeSummary.stopCount === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
                <div className="leg">
                  <span className="dot end" />
                  <span>{routeSummary.dropoff?.label || "—"}</span>
                </div>
              </div>
            ) : (
              <p className="mx-summary__empty">
                Pick a route to see the distance, time and starting fare.
              </p>
            )}

            {routeSummary.eta ? (
              <div style={{ marginTop: 11 }}>
                <span className="mx-eta" role="status" aria-live="polite">
                  <Route size={15} aria-hidden />{" "}
                  {formatTripMeta(routeSummary.eta.distanceKm, routeSummary.eta.durationMin, null)}
                </span>
              </div>
            ) : routeSummary.etaLoading && routeSummary.pickup && routeSummary.dropoff ? (
              <div style={{ marginTop: 11 }}>
                <span className="mx-eta mx-eta--loading" role="status" aria-live="polite">
                  Estimating distance &amp; time…
                </span>
              </div>
            ) : null}

            <div className="mx-sumdiv" />

            {showFare ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                  }}
                >
                  <span className="muted small">Your Ceiling, all in</span>
                  {/* The BILLABLE all-in, not the typed one. On the ~1 value in 8 that
                      snaps, ceilingNum contradicted both the Pricing card's own "Your
                      Ceiling" and the "climbs up to" line directly below this one — and
                      this rail is the last number seen before Post. The typed figure is
                      still named, once, by the "Rounded down from…" note. */}
                  <span style={{ fontSize: 16, fontWeight: 600 }}>
                    {formatMoney(ceilingAllIn)}
                  </span>
                </div>
                <div
                  style={{ marginTop: 14 }}
                  role="status"
                  aria-live="polite"
                  aria-label="Starting fare"
                >
                  <div className="mx-fare">
                    {formatMoney(startAllIn)}
                  </div>
                  <div className="mx-fare-sub">
                    starting price · climbs up to {formatMoney(ceilingAllIn)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 12,
                  }}
                >
                  <span className="muted small">Pricing mode</span>
                  {speedWin ? (
                    <span className="badge speed">SPEED WIN</span>
                  ) : (
                    <span className="muted small">Standard climb</span>
                  )}
                </div>
                {belowMarket && mode === "preview" && (
                  <div
                    className="notice warn"
                    style={{ margin: "12px 0 0", padding: "9px 12px", fontSize: 13 }}
                  >
                    Below the market rate — longer to find a Driver.
                  </div>
                )}
              </>
            ) : (
              <p className="mx-summary__empty">
                Set a ceiling under Pricing to see the starting fare.
              </p>
            )}

            <div className="mx-sumdiv" />
            {/* The "This is final" warning lives in a confirm popup that opens on
                Post to the Pool now (S21) — not here in the review rail, where it
                read as alarming before any post intent. */}
            {/* Distinct keys per mode so React MOUNTS A FRESH button set instead of
                reusing (and re-typing) the same <button> node — without this, the
                edit "Review" button (type=button) is reconciled into the preview
                "Post to the Pool" submit button in place, and the click that opens
                the preview submits the form (a live post). See SESSION_LOG S18. */}
            {mode === "edit" ? (
              <div className="mx-actions" key="actions-edit">
                <button type="button" className="btn" onClick={review}>
                  Review mission →
                </button>
                <SubmitButton intent="draft" className="btn secondary" pendingLabel="Saving…" blocked={commissionRatesUnavailable}>
                  Save as draft
                </SubmitButton>
              </div>
            ) : (
              <div className="mx-actions" key="actions-preview">
                {/* type=button: opens the confirm popup, does NOT submit. The real
                    pooled submit lives in the modal so posting always takes a
                    deliberate second click. */}
                <button type="button" className="btn" onClick={() => setConfirmPost(true)}>
                  {draft ? "Post draft to the Pool" : "Post to the Pool"}
                </button>
                <button type="button" className="btn secondary" onClick={() => setMode("edit")}>
                  ← Edit
                </button>
                <SubmitButton intent="draft" className="btn secondary" pendingLabel="Saving…" blocked={commissionRatesUnavailable}>
                  Save as draft
                </SubmitButton>
              </div>
            )}

            {clientError && (
              <div className="notice error" style={{ margin: "10px 0 0" }}>
                {clientError}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* "This is final" confirm popup (S21). Lives inside the <form> so its
          pooled SubmitButton submits the same FormData and shares the pending
          guard. Click-the-backdrop and Escape both cancel. */}
      {confirmPost && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mx-confirm-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmPost(false);
          }}
        >
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 8,
                  background: "var(--warn-bg)",
                  color: "var(--warn)",
                }}
              >
                <AlertTriangle size={20} />
              </span>
              <h2 id="mx-confirm-title" style={{ margin: 0, fontSize: 19 }}>
                This is final
              </h2>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: 15, lineHeight: 1.55, color: "var(--text-muted)", textWrap: "balance" }}>
              Posting sends this live to the Driver Pool right away — it can’t be
              un-posted.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <ConfirmCancelButton onCancel={() => setConfirmPost(false)} />
              <SubmitButton intent="pooled" className="btn" pendingLabel="Posting…" blocked={commissionRatesUnavailable}>
                {draft ? "Post draft to the Pool" : "Post to the Pool"}
              </SubmitButton>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
