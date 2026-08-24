import Link from "next/link";
import { Pencil, GitPullRequestArrow, Lock, Phone, Car, Clock, Star } from "lucide-react";
import type { MissionRow, AmendmentStatus, ReleaseStatus } from "@/lib/database.types";
import { closeAmendment } from "@/app/(dispatch)/dispatch/[id]/amend/actions";
import { closeRelease } from "@/app/(dispatch)/dispatch/actions";
import { settledFare } from "@/lib/pdp";
import { tripDistanceKm } from "@/lib/geo";
import { parseWaypoints } from "@/lib/waypoints";
import { businessCost, carriesCommission, ratesOf, splitFor } from "@/lib/commission";
import {
  addressLine,
  formatDateTime,
  formatLeadTime,
  formatMoney,
  formatRate,
  formatTime,
  formatArchiveDay,
  formatShortDay,
  formatTripMeta,
  formatWaitingSpell,
  serviceClassLabel,
} from "@/lib/format";
import {
  canEditInfo,
  checkInOpen,
  isExpired,
  missionTone,
  needsClosing,
  negotiationAnswerable,
  reclaimOpen,
  reclaimUnlocksAt,
  TONE_BG,
  TONE_COLOR,
} from "@/lib/dispatch-status";
import { highlightSegments, type MatchField } from "@/lib/history-filter";
import { isExecutable } from "@/lib/mission-flow";
import { parseLanguages, dressCodeLabel, activeFlagLabels } from "@/lib/driver-service";
import { StatusSteps } from "@/components/status-steps";
import { BoardFileLink } from "@/components/board-file-link";
import { PhoneShareToggle } from "@/components/phone-share-toggle";
import { BusinessCancel, ReclaimCard } from "@/components/dispatch-cancel";
import { AgreedRelease } from "@/components/dispatch-release";
import { WaitingPanel } from "@/components/dispatch-waiting";
import {
  isAirportPickup,
  noShowWaitMinutes,
  waitingAt,
} from "@/lib/cancellation";
import {
  parsePassengers,
  passengerName,
  type GuestContact,
} from "@/lib/passengers";

// A Driver's car, shown to the Dispatch so it can tell the Guest what to look
// for at pickup (brand, colour, plate). Captured at Driver onboarding/settings.
export interface VehicleBrief {
  make: string | null;
  model: string | null;
  colour: string | null;
  plate: string | null;
}

export interface DriverContact {
  name: string;
  phone: string | null;
  vehicle?: VehicleBrief | null;
}

// A proposed / resolved change to this trip (D39 Phase 2), for the schedule state.
// Precomputed server-side so the row stays presentational.
export interface AmendmentBrief {
  id: string;
  status: AmendmentStatus;
  summary: string; // "Add a stop at X · New destination Y"
  fareOld: number | null;
  fareNew: number;
  declineReason: string | null; // human label, or null
  at: string; // responded_at ?? created_at
}

// A proposed / resolved AGREED RELEASE for this trip (O7, D45), for the schedule
// state. Precomputed server-side; the release itself carries no route/fare change.
export interface ReleaseBrief {
  id: string;
  status: ReleaseStatus;
  at: string; // responded_at ?? created_at
  declineReason: string | null; // human label, or null — why the Driver kept it
}

/**
 * A Driver who accepted this trip and then walked away from it (`kind =
 * 'driver_cancel'` in `mission_cancellation`).
 *
 * ⚑ A LIST, not the latest. Unlike an amendment or a release, a driver
 * cancellation does not end the trip — it re-pools it, so the same mission can
 * be walked again by the next Driver. Keeping only the newest row would hide
 * every walk but the last, on exactly the trips a desk most needs to see.
 *
 * ⚑ NO MONEY ON IT, DELIBERATELY (founder, 2026-08-20). The penalty is real and
 * recorded (`fee_amount`, 100% of the Course), but who ultimately receives it is
 * an open question: the hotel paid nothing and bills its Guest nothing, so 100%
 * of the fare is not compensation for a 100% loss — it is sized to deter the
 * Driver, which is a different job with a different answer. Nothing is collected
 * during the beta either way. The block therefore states only what is certain.
 * BACKLOG § Y.
 */
export interface DriverWalk {
  at: string; // created_at — when they cancelled
  hoursBefore: number | null; // lead time at that moment
  reason: string | null;
}

// The latest detail-edit change-log for this trip (D40 follow-up) — the "what
// changed" trail shown under the edit actions. Business-private (side table).
export interface InfoChangeBrief {
  at: string;
  items: string[]; // human phrases: "Flight BA342 → BA118", "Added guest X"
}

/**
 * Paints the search hit inside a cell. A server component — the archive renders
 * on the server, so the highlight costs no client JS at all.
 */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = highlightSegments(text, q);
  if (parts.length === 1 && !parts[0].hit) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/** How a hit reads when it landed somewhere the table has no column for. */
const MATCH_NOTE: Partial<Record<MatchField, string>> = { car: "Car", class: "Class" };

// One dense schedule line. Click to expand full detail. The coloured left edge +
// status pill are the at-a-glance signal a hotel scans (red = needs a call).
// A tone carrying `wash` tints the WHOLE row so it can't be scrolled past: amber
// once check-in opens at T-180 and the Driver hasn't, red inside the last hour
// (D61), plus the pre-existing red on a cancelled/expired trip.
export function TripRow({
  mission,
  driver,
  guestContacts,
  amendment,
  release,
  driverWalks,
  infoChange,
  archived = false,
  showDate = false,
  fare = null,
  farePending = false,
  query = "",
  matchedOn = null,
}: {
  mission: MissionRow;
  driver?: DriverContact | null;
  guestContacts?: GuestContact[] | null;
  amendment?: AmendmentBrief | null;
  release?: ReleaseBrief | null;
  driverWalks?: DriverWalk[] | null;
  infoChange?: InfoChangeBrief | null;
  archived?: boolean;
  /**
   * Schedule only: this row was lifted out of its own past day into today's band
   * (§ Q — an unclosed trip the desk has to chase), so it must carry its date.
   * A time alone would make 3 July and 19 July identical, which is the exact bug
   * § R found in the archive.
   */
  showDate?: boolean;
  /** History only: what this trip cost, already settled (see historyFare). */
  fare?: number | null;
  /** History only: the fare is agreed but nothing settled (a § Q unclosed trip). */
  farePending?: boolean;
  /** History only: the live search text, for the highlight. */
  query?: string;
  /** History only: which fields the search hit, for the "matched on" line. */
  matchedOn?: MatchField[] | null;
}) {
  const t = missionTone(mission, undefined, { archived });
  const reference = mission.reference?.trim() || null;
  // Every named Guest, aligned by index with its phone/share state from the side
  // table (Drivers can't read those numbers). Phone-less guests still list; the
  // Share switch flips reveal to the assigned Driver. Archived/past = read-only.
  const gcs = guestContacts ?? [];
  const guestRows = parsePassengers(mission.passenger_names)
    .map((p, i) => ({
      index: i,
      name: passengerName(p),
      main: Boolean(p.main),
      phone: (gcs[i]?.phone ?? "").trim(),
      shared: Boolean(gcs[i]?.shared),
    }))
    .filter((g) => g.name || g.phone);
  // Sharing is read-only once a trip is finished (and on archived/history rows).
  const expired = isExpired(mission);
  const shareLocked =
    archived ||
    mission.status === "completed" ||
    mission.status === "cancelled" ||
    expired;
  // Info edits allowed only while the trip is pre-departure and not dead (§ P).
  // One shared predicate with the edit page — this rule was written out by hand
  // in three places and had already drifted.
  const editable = !archived && canEditInfo(mission);
  // Can a proposal still be answered by the Driver? Both RPCs refuse outside
  // accepted/confirmed, so this decides what the pending cards are allowed to
  // promise as well as whether a new proposal can be made.
  const answerable = negotiationAnswerable(mission.status);
  // § Q — the trip is past its expected end and its outcome is still unsettled:
  // either nobody has answered, or the Driver answered that it never happened.
  // Both are the same thing for the controls below — there is nothing left to
  // negotiate, and the answer is a phone call. (Once it is answered `driven` the
  // trip is `completed` and none of this applies anyway.)
  const unclosed =
    !archived && (needsClosing(mission) || mission.close_answer === "not_driven");
  // A change can be PROPOSED (route/fare, needs Driver consent) only once a Driver
  // holds the trip but hasn't started it (D39 Phase 2).
  const canAmend = !archived && answerable;
  // An AGREED RELEASE (free, needs Driver consent) can be offered while a committed
  // Driver holds the trip pre-execution (O7, D45). Hidden while one is already pending
  // (the schedule shows that state instead).
  // ⚑ …and not on an unclosed trip either. A release re-pools the trip for
  // another Driver to take — meaningless on one whose pickup was three weeks ago
  // (and `accept_mission` refuses a past pickup since § P, so it would only
  // create a dead pooled row for the sweep to expire). It also needs the answer
  // of the one Driver who isn't answering.
  const canRelease = !archived && !unclosed && !!mission.driver_id && answerable;
  const releasePending = !!release && release.status === "proposed";
  // One live ask per mission (2026-08-11_one_live_ask.sql): proposing either kind
  // retires a pending other. Neither door is hidden — "forget the change, just give
  // it back" is a legitimate one-step intent — so the copy states the cost instead.
  const amendmentPending = !!amendment && amendment.status === "proposed";
  // Business can cancel any live trip (O7). FREE while pooled; a fee applies once a
  // Driver holds it (the modal shows the live %). Not once on_board / completed.
  //
  // ⚑ And never on an unclosed trip. `businessCancelPct` returns 100 for any pickup
  // already in the past, so Cancel was the only control on a row we now actively
  // tell the desk to chase: a Dispatcher who can't reach the Driver would reach for
  // it and be charged the full fare for a trip that most likely already happened.
  // There is nothing left to cancel here — the question is what happened, not whether
  // to call it off.
  const cancellable =
    !archived &&
    !unclosed &&
    (mission.status === "pooled" ||
      mission.status === "accepted" ||
      mission.status === "confirmed" ||
      mission.status === "en_route" ||
      mission.status === "arrived");
  // Reclaim (D86): the Driver is holding this trip and has never checked in.
  //
  // ⚑ This used to read `mission.status === "accepted"`, a status that has not
  // existed since Option A/D55 — so the card below never rendered for anyone.
  // The card appears the moment check-in opens (T−3h) with its button locked,
  // and the button goes live at T−2h, so the Dispatcher can call first.
  // The RPC re-checks; this only decides what to offer.
  const reclaimVisible = !archived && !!driver && checkInOpen(mission);
  const canReclaim = reclaimVisible && reclaimOpen(mission);
  const reclaimUnlock = reclaimVisible ? reclaimUnlocksAt(mission) : null;
  const reclaimUrgent =
    reclaimVisible && new Date(mission.pickup_at).getTime() <= Date.now() + 60 * 60_000;
  // "Edited · time" stamp — when the info was last edited (null = never).
  const editedAt = mission.info_edited_at;
  const languages = parseLanguages(mission.required_languages);
  const dressLabel = dressCodeLabel(mission.dress_code);
  const flagLabels = activeFlagLabels(mission.driver_flags);
  const waypoints = parseWaypoints(mission.waypoints);
  const stopsReached = mission.stops_reached ?? 0;
  // Compact progress on the pill while passing stops, e.g. "On board · 1/2".
  const stopProgress =
    mission.status === "on_board" && waypoints.length > 0
      ? `${stopsReached}/${waypoints.length}`
      : "";
  const wash = t.wash ? (t.tone === "warn" ? " dx-trip--warn" : " dx-trip--alert") : "";
  const flightEta = mission.flight_eta ? formatTime(mission.flight_eta) : null;
  const distanceKm = tripDistanceKm(
    mission.pickup_lat,
    mission.pickup_lng,
    mission.dropoff_lat,
    mission.dropoff_lng,
  );
  const tripMeta = formatTripMeta(mission.distance_km, mission.duration_min, distanceKm);
  const car = driver?.vehicle ?? null;
  const carDesc = car
    ? [[car.make, car.model].filter(Boolean).join(" "), car.colour]
        .filter(Boolean)
        .join(" · ")
    : "";
  const driverInitials = driver
    ? driver.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "";
  const serviceLabel = serviceClassLabel(mission.category, mission.required_body_type);
  const specificCar =
    mission.required_make && mission.required_model
      ? `${mission.required_make} ${mission.required_model}`
      : null;
  const hasService =
    languages.length > 0 ||
    !!dressLabel ||
    flagLabels.length > 0 ||
    !!mission.board_name ||
    !!mission.board_file_path ||
    !!mission.driver_message;
  const paxN = mission.pax_count ?? (guestRows.length || null);
  const bagsN = mission.luggage_count ?? 0;
  const guestsHeader = mission.luggage_only
    ? `Luggage · ${bagsN} ${bagsN === 1 ? "bag" : "bags"}`
    : `Guests · ${paxN ?? "—"} ${paxN === 1 ? "passenger" : "passengers"} · ${bagsN} ${bagsN === 1 ? "bag" : "bags"}`;
  const acceptedFareChanged =
    !!amendment && amendment.fareOld != null && amendment.fareOld !== amendment.fareNew;
  const acceptedRouteChanged = !!amendment && !!amendment.summary && amendment.summary !== "Fare change";

  // ---- archive-only derivations -------------------------------------------
  // What the money line says under the amount. A bare "110 €" on a cancelled
  // trip reads as the fare; it's a fee, and who caused it decides who owes it
  // ([[d45]]). Waiting is called out because it's the one charge a Business
  // didn't book — D48 pays the Driver by the minute and it belongs on the face
  // of the row, not buried in the detail.
  const waitingFee = Number(mission.waiting_fee ?? 0);
  // The amount above this note is rowCost() — fare/fee PLUS waiting — on every
  // settled row. A completed trip said so; a cancellation and a no-show did not,
  // so on the two endings most likely to be queried the waiting was inside the
  // number and named nowhere. Suffix it wherever it is part of the total.
  // Deliberately NOT on a `farePending` row: that one shows the bare agreed fare
  // and is excluded from every total, so there is no waiting folded into it.
  // ALL IN. "incl." is a containment claim about the amount directly above,
  // which is rowCost() - fare AND waiting put through the commission together.
  // Naming the Course here left the note ~15% short of the waiting actually
  // inside that total, on exactly the rows a Dispatcher queries.
  // ⚑ The MINUTES ride along, the rate does not. The amount here is all-in, and
  // the all-in per-minute rate does not multiply out: a Course-side 0,50 shows
  // as "0,58 €" and 0,58 × 20 is 11,60 against a true 11,50. A reader who
  // checked the arithmetic would catch the row lying, so the rate is stated
  // only Course-side, inside the invoice table below, where the fee lines
  // follow it and the total still reconciles.
  const waitingMinutes = mission.waiting_minutes ?? 0;
  const waitingNote =
    waitingFee > 0
      ? `incl. ${formatMoney(businessCost(mission, waitingFee))} waiting${
          waitingMinutes > 0 ? ` · ${waitingMinutes} min` : ""
        }`
      : null;

  // docs/06 §4 — a pickup between 22:00 and 06:00 prices at the card's night
  // multiplier, on the floor and the ceiling alike. `night_applied` has been
  // stamped on every mission since the rate card shipped precisely so "a past
  // price stays explicable", and until now no screen read it: two identical
  // airport runs, one 20% dearer, and nothing on either saying why.
  // ⚑ NAMED, NOT NUMBERED. The multiplier lives on `rate_card.night_multiplier`,
  // reachable only through `mission.rate_card_id` — which is NULL on the whole
  // pre-2026-08-16 archive. Printing "×1,20" here would be a constant in the UI
  // (docs/06 §9 forbids it) and would lie the day the card is re-tuned.
  const nightTag = mission.night_applied ? (
    <span className="dx-night">Night rate</span>
  ) : null;

  // ── What the Business pays (docs/06 §1, §3) ───────────────────────────────
  // `settledFare` and `mission.ceiling` are the COURSE — the Driver's side of
  // the trip. A Business is only ever shown the all-in figure, so every amount
  // on this row goes through the snapshot rates first. A mission with no
  // snapshot renders exactly as it did before commission shipped.
  const fareSplit = splitFor(mission, settledFare(mission));
  const ceilingSplit = splitFor(mission, Number(mission.ceiling));
  // Only once a Driver holds it: while the price is still climbing, "saved" is
  // a claim about a number that is still moving.
  // ⚑ WHAT THE ROW'S OWN AMOUNT IS MADE OF, in Course space — `historyFare`'s
  // rule, so the "What you pay" table can never total something other than the
  // figure at the top of the row. It used to decompose the accepted fare always,
  // which disagreed on two endings:
  //   · a trip with waiting — the headline included it, the table did not;
  //   · a CANCELLED trip — the headline said "177,23 € · Your cancellation fee"
  //     while the table underneath said "What you pay … Total 157,53 €", the
  //     fare of a trip that never ran and was never billed.
  // An expired mission billed nothing at all, so it gets no table.
  // `carriesCommission` mirrors `businessCost`: a Driver-cancelled trip is an
  // indemnity, no fee comes off it, so it stays one plain amount.
  const billedGross = expired
    ? null
    : mission.status === "cancelled"
      ? mission.cancellation_fee == null
        ? null
        : Number(mission.cancellation_fee) + waitingFee
      : settledFare(mission) + waitingFee;
  const paidSplit =
    billedGross == null || !carriesCommission(mission)
      ? null
      : splitFor(mission, billedGross);

  const savedAgainstMax = mission.accepted_at
    ? Math.round((ceilingSplit.businessTotal - fareSplit.businessTotal) * 100) / 100
    : 0;
  const withWaiting = (base: string) => (waitingNote ? `${base} · ${waitingNote}` : base);
  const archiveNote = !archived
    ? null
    : farePending
      ? "Not settled"
      : mission.status === "cancelled"
        ? withWaiting(
            // ⚑ There is deliberately no "Driver cancelled" branch here. A
            // driver cancellation RE-POOLS the trip; it never sets
            // status='cancelled', and `business_cancel_mission` is the only
            // writer of `cancelled_by` — which it hard-codes to 'business'. The
            // branch that used to sit here could not fire, and its presence made
            // the missing case look handled. A Driver who walked is shown by the
            // "Driver cancelled" block in the detail instead.
            mission.cancelled_by === "business" ? "Your cancellation fee" : "Cancellation fee",
          )
        : mission.no_show
          ? withWaiting("Charged in full")
          : waitingNote;

  // Hits that no column shows. Address/guest/driver/reference/flight all paint
  // themselves in place, so naming them again would just be noise.
  const archiveWhy =
    archived && query && matchedOn
      ? matchedOn
          .filter((f): f is "car" | "class" => f === "car" || f === "class")
          .map((key) => ({
            key,
            text:
              key === "car"
                ? [driver?.vehicle?.make, driver?.vehicle?.model, driver?.vehicle?.plate]
                    .filter(Boolean)
                    .join(" · ")
                : serviceClassLabel(mission.category, mission.required_body_type),
          }))
          .filter((w) => w.text)
      : [];

  return (
    <details
      // Anchor for the calendar's "Open in Schedule" deep link (?open=<missionId>).
      id={`trip-${mission.id}`}
      className={`dx-trip${archived ? " dx-trip--arch" : ""}${wash}`}
      style={{ "--edge": TONE_COLOR[t.tone] } as React.CSSProperties}
    >
      <summary>
        {archived ? (
          <span className="dxh-when">
            <b>{formatArchiveDay(mission.pickup_at)}</b>
            <span className="mono">{formatTime(mission.pickup_at)}</span>
            {nightTag}
          </span>
        ) : showDate ? (
          <span className="dxh-when dx-trip__when">
            <b>{formatShortDay(mission.pickup_at)}</b>
            <span className="mono">{formatTime(mission.pickup_at)}</span>
            {nightTag}
          </span>
        ) : (
          // ⚑ `.dxh-when` ONLY — never `.dx-trip__when` as well. That second
          // class is the § Q lifted-row styling, and its `> span` rule would
          // capture the time and shrink it 16px → 13px, on the column a
          // Dispatcher scans first. `.dxh-when` alone makes the cell a column a
          // tag can sit under; `.dx-trip__time` keeps the size and weight the
          // time has always had (see the paired rule in globals.css).
          <span className="dxh-when">
            <span className="dx-trip__time mono">{formatTime(mission.pickup_at)}</span>
            {nightTag}
          </span>
        )}

        {/* Stacked route rail: pickup → stop(s) → drop-off, one address per line so
            long addresses fit without truncation. Each line is the full address
            minus the redundant trailing country; the exact address shows on hover.
            Dots: dark = pickup, grey = a via-stop, hollow = drop-off. */}
        <span className="dx-trip__route">
          <span className="dx-route__node">
            <span className="dx-route__dot dx-route__dot--pk" aria-hidden />
            <span className="dx-route__addr dx-route__addr--pk" title={mission.pickup_address}>
              <Hl text={addressLine(mission.pickup_address)} q={query} />
            </span>
          </span>
          {waypoints.map((w, i) => {
            const reached = i < stopsReached;
            const current = mission.status === "on_board" && i === stopsReached;
            return (
              <span
                className={`dx-route__node${reached ? " dx-route__node--reached" : ""}${current ? " dx-route__node--current" : ""}`}
                key={i}
              >
                <span className="dx-route__dot dx-route__dot--via" aria-hidden />
                <span className="dx-route__addr dx-route__addr--via" title={w.address}>
                  <Hl text={addressLine(w.address)} q={query} />
                </span>
              </span>
            );
          })}
          <span className="dx-route__node">
            <span className="dx-route__dot dx-route__dot--dp" aria-hidden />
            <span
              className="dx-route__addr dx-route__addr--dp"
              title={mission.dropoff_address ?? undefined}
            >
              {mission.dropoff_address ? (
                <Hl text={addressLine(mission.dropoff_address)} q={query} />
              ) : (
                "—"
              )}
            </span>
          </span>
        </span>

        <span className="dx-trip__flight">
          {mission.flight_number ? (
            <span className="dx-flight">
              <Hl text={mission.flight_number} q={query} />
              {flightEta ? ` · ${flightEta}` : ""}
            </span>
          ) : (
            <span className="dx-flight-empty">—</span>
          )}
        </span>

        <span className="dx-trip__guest">
          {mission.luggage_only ? (
            <span className="muted">Luggage</span>
          ) : mission.passenger_name ? (
            <Hl text={mission.passenger_name} q={query} />
          ) : (
            "—"
          )}
        </span>

        <span className="dx-trip__ref">
          {reference ? (
            <span className="ref">
              <Hl text={reference} q={query} />
            </span>
          ) : (
            <span className="dx-flight-empty">—</span>
          )}
        </span>

        <span className="dx-trip__driver">
          {driver ? <Hl text={driver.name} q={query} /> : <span className="muted">—</span>}
        </span>

        {/* Money, history only. An archive with no fare column can't answer the
            one question an accountant opens it with. `fare` is settled upstream
            (historyFare): the frozen accept-time fare for a real trip, the fee
            for a cancellation, nothing at all for a trip nobody took. */}
        {archived && (
          <span
            className={`dxh-fare${fare == null ? " dxh-fare--none" : ""}${
              farePending ? " dxh-fare--pending" : ""
            }`}
          >
            {fare == null ? "—" : <b>{formatMoney(fare)}</b>}
            {archiveNote && <em>{archiveNote}</em>}
          </span>
        )}

        <span
          className="status-pill"
          style={{ background: TONE_BG[t.tone], color: TONE_COLOR[t.tone] }}
        >
          <span className="dot" style={{ background: TONE_COLOR[t.tone] }} />
          {t.needsAttention && <span className="attention">!</span>}
          {t.label}
          {stopProgress && <span className="status-pill__sub">{stopProgress}</span>}
        </span>

        {/* Why this row is here when the hit landed somewhere with no column of
            its own — searching a plate or a make otherwise returns rows with no
            visible reason, which reads as a broken search. */}
        {archiveWhy.length > 0 && (
          <span className="dxh-why">
            {archiveWhy.map((w) => (
              <span key={w.key}>
                {MATCH_NOTE[w.key]} · <Hl text={w.text} q={query} />
              </span>
            ))}
          </span>
        )}
      </summary>

      <div className="dx-trip__detail">
        {reclaimVisible && driver && (
          <ReclaimCard
            missionId={mission.id}
            driverName={driver.name}
            driverPhone={driver.phone}
            canReclaim={canReclaim}
            unlockAt={reclaimUnlock}
            urgent={reclaimUrgent}
          />
        )}
        {/* Top meta line: the private Reference tag (Business-only) + the detail-only
            "Edited · time" stamp. The stamp stays even after the trip is frozen so the
            edit record remains visible. */}
        {(reference || editedAt) && (
          <div className="dx-dt-meta">
            {reference && (
              <span className="dx-dt-ref">
                <Lock size={12} aria-hidden /> {reference}
                <span className="dx-dt-ref__note"> · your team only</span>
              </span>
            )}
            {editedAt && !(infoChange && infoChange.items.length > 0) && (
              <span className="dx-dt-edited">Edited · {formatDateTime(editedAt)}</span>
            )}
          </div>
        )}

        {/* Edit actions — each spells out what it changes + whether the Driver must
            agree, so the two aren't confused. "Edit details" applies immediately;
            "Propose a change" (route/fare) needs the Driver's consent, so it only
            appears once a Driver holds the trip (accepted / confirmed). */}
        {(editable || canAmend) && (
          <div className="dx-acts">
            {editable && (
              <Link href={`/dispatch/${mission.id}/edit`} className="dx-act">
                <span className="dx-act__t">
                  <Pencil size={14} aria-hidden /> Edit details
                </span>
                <span className="dx-act__s">Update guest, flight &amp; service info · applies now</span>
              </Link>
            )}
            {canAmend && (
              <Link href={`/dispatch/${mission.id}/amend`} className="dx-act">
                <span className="dx-act__t">
                  <GitPullRequestArrow size={14} aria-hidden /> Propose a change
                </span>
                <span className="dx-act__s">
                  New route or fare · the Driver must agree
                  {releasePending && " · replaces your pending release request"}
                </span>
              </Link>
            )}
          </div>
        )}

        {/* D48 — the Driver is on site: show the meter, and the door out. Before this the
            Business saw nothing at all while a Driver waited and being charged. */}
        {mission.status === "arrived" && (
          <WaitingPanel
            missionId={mission.id}
            driverName={driver?.name ?? ""}
            fare={settledFare(mission)}
            rates={ratesOf(mission)}
            category={mission.category}
            waitingFromIso={waitingAt(mission).from.toISOString()}
            waitingUntilIso={waitingAt(mission).until.toISOString()}
            courtesyMinutes={noShowWaitMinutes(isAirportPickup(mission))}
          />
        )}

        {(cancellable || (canRelease && !releasePending)) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canRelease && !releasePending && (
                <AgreedRelease
                  missionId={mission.id}
                  driverName={driver?.name ?? ""}
                  amendmentPending={amendmentPending}
                />
              )}
              {cancellable && (
                <BusinessCancel
                  missionId={mission.id}
                  fare={settledFare(mission)}
                  rates={ratesOf(mission)}
                  category={mission.category}
                  pickupAtIso={mission.pickup_at}
                  hasDriver={!!mission.driver_id}
                  /* Gated on 'arrived' — the exact condition business_cancel_mission uses
                     to settle waiting, so the quote can't include a charge the RPC won't
                     make, or omit one it will. `.from`/`.until` are pure functions of the
                     pickup time and the airport predicate, so passing them from the server
                     is safe; the running total is computed client-side against the clock. */
                  waitingFromIso={
                    mission.status === "arrived" ? waitingAt(mission).from.toISOString() : null
                  }
                  waitingUntilIso={
                    mission.status === "arrived" ? waitingAt(mission).until.toISOString() : null
                  }
                />
              )}
            </div>
            {canRelease && !releasePending && (
              <p className="muted small" style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
                Agreed release is free but {driver ? driver.name : "the Driver"} must accept it · Cancel is
                unilateral and may cost a fee this close to pickup.
                {amendmentPending && " Asking for a release replaces your pending change request."}
              </p>
            )}
          </div>
        )}

        {/* What the last detail edit changed (D40) — the "what changed" trail. */}
        {infoChange && infoChange.items.length > 0 && (
          <div className="dx-trail">
            <Clock size={13} aria-hidden />
            <span>
              <strong>{formatDateTime(infoChange.at)}</strong> — {infoChange.items.join(" · ")}
            </span>
          </div>
        )}

        {/* Amendment state (D39 Phase 2): a proposed route/fare change awaiting the
            Driver, a decline (with a calm explanation), or an accepted change. */}
        {amendment && amendment.status === "proposed" && (
          <div className="dx-amend dx-amend--pending">
            <div className="dx-amend__head">
              <span className="dx-amend__tag">Change pending</span>
              {/* Only promise an answer the RPC would actually accept: once the
                  Driver is en route (or the trip is over) respond_to_amendment
                  refuses, so "Waiting for X to accept" was a lie. The card still
                  renders — clearing it is the only way to stop a stranded row
                  masking the accepted amendment behind it on the schedule. */}
              <span className="muted small">
                {answerable
                  ? `Waiting for ${driver ? driver.name : "the Driver"} to accept`
                  : "The trip has moved on — this change can’t be accepted anymore"}
              </span>
            </div>
            <div className="dx-amend__body">
              {amendment.summary}
              {" · fare "}
              {amendment.fareOld != null && <s>{formatMoney(amendment.fareOld)}</s>} → {formatMoney(amendment.fareNew)}
            </div>
            {!archived && (
              <form action={closeAmendment} className="dx-amend__actions">
                <input type="hidden" name="amendment_id" value={amendment.id} />
                <input type="hidden" name="mission_id" value={mission.id} />
                <button type="submit" className="dx-amend__link">
                  {answerable ? "Withdraw request" : "Dismiss"}
                </button>
              </form>
            )}
          </div>
        )}

        {amendment && amendment.status === "declined" && (
          <div className="dx-amend dx-amend--declined">
            <div className="dx-amend__head">
              <span className="dx-amend__tag dx-amend__tag--off">
                {driver ? `${driver.name} couldn’t take this change` : "The Driver couldn’t take this change"}
              </span>
            </div>
            {amendment.declineReason && (
              <div className="dx-amend__reason">
                <span className="muted">Reason:</span> {amendment.declineReason}
              </div>
            )}
            <p className="dx-amend__reassure">
              Declines are normal, especially in busy periods — a Driver already committed to nearby trips may
              not be able to extend this one. It’s not a reflection on you. The trip stays exactly as agreed.
            </p>
            {!archived && (
              <div className="dx-amend__actions">
                {driver?.phone && (
                  <a href={`tel:${driver.phone}`} className="dx-amend__btn">Call {driver.name}</a>
                )}
                <Link href={`/dispatch/${mission.id}/amend`} className="dx-amend__btn dx-amend__btn--primary">
                  Adjust and re-send
                </Link>
                <form action={closeAmendment}>
                  <input type="hidden" name="amendment_id" value={amendment.id} />
                  <input type="hidden" name="mission_id" value={mission.id} />
                  <button type="submit" className="dx-amend__link">Dismiss</button>
                </form>
              </div>
            )}
          </div>
        )}

        {amendment && amendment.status === "accepted" && (
          <div className="dx-amend dx-amend--accepted">
            <div className="dx-amend__head">
              <span className="dx-amend__tag dx-amend__tag--ok">Change accepted</span>
              <span className="muted small">· {formatDateTime(amendment.at)}</span>
            </div>
            {(acceptedFareChanged || acceptedRouteChanged) && (
              <div className="dx-amend__body">
                {acceptedFareChanged && (
                  <>
                    Fare <s>{formatMoney(amendment.fareOld)}</s> → {formatMoney(amendment.fareNew)}
                  </>
                )}
                {acceptedFareChanged && acceptedRouteChanged && " · "}
                {acceptedRouteChanged && amendment.summary}
              </div>
            )}
          </div>
        )}

        {/* Agreed-release state (O7, D45): a free release awaiting the Driver, a
            decline (the Driver kept the trip — their right, framed calmly), or a
            completed release (the trip is back in the Pool). */}
        {release && release.status === "proposed" && (
          <div className="dx-amend dx-amend--pending">
            <div className="dx-amend__head">
              <span className="dx-amend__tag">Release pending</span>
              {/* Same rule as the amendment card above. This used to hide the
                  whole block outside accepted/confirmed, which left a stranded
                  'proposed' row with no way to clear it — and it masks the
                  latest answered release on the schedule. */}
              <span className="muted small">
                {answerable
                  ? `Waiting for ${driver ? driver.name : "the Driver"} to accept · free`
                  : "The trip has moved on — this release can’t be accepted anymore"}
              </span>
            </div>
            {!archived && (
              <form action={closeRelease} className="dx-amend__actions">
                <input type="hidden" name="release_id" value={release.id} />
                <input type="hidden" name="mission_id" value={mission.id} />
                <button type="submit" className="dx-amend__link">
                  {answerable ? "Withdraw request" : "Dismiss"}
                </button>
              </form>
            )}
          </div>
        )}

        {release && release.status === "declined" && (
          <div className="dx-amend dx-amend--neutral">
            <div className="dx-amend__head">
              <span className="dx-amend__tag">Release declined</span>
              <span className="muted small">{driver ? driver.name : "The Driver"} kept the trip</span>
            </div>
            {release.declineReason && (
              <div className="dx-amend__reason">
                <span className="muted">Reason:</span> {release.declineReason}
              </div>
            )}
            <p className="dx-amend__reassure">
              That’s the Driver’s call — a release is only ever their choice. The trip stays exactly as
              agreed. If you still need to end it, you can cancel (a fee may apply this close to pickup).
            </p>
            {!archived && (
              <form action={closeRelease} className="dx-amend__actions">
                <input type="hidden" name="release_id" value={release.id} />
                <input type="hidden" name="mission_id" value={mission.id} />
                <button type="submit" className="dx-amend__link">Dismiss</button>
              </form>
            )}
          </div>
        )}

        {/* A Driver accepted this trip and then walked away from it. Until now
            the Business got NO trace of that at all: driver_cancel_mission
            re-pools the mission and clears driver_id, so the row went back to
            looking exactly like one nobody had ever taken — same status, no
            Driver, nothing to say a car had been arranged and lost. The release
            block below is the same shape for the same event when it is agreed;
            this is the one that isn't. */}
        {driverWalks && driverWalks.length > 0 && (
          <div className="dx-amend dx-amend--declined">
            <div className="dx-amend__head">
              <span className="dx-amend__tag dx-amend__tag--off">
                {driverWalks.length > 1
                  ? `Driver cancelled · ${driverWalks.length}×`
                  : "Driver cancelled"}
              </span>
              <span className="muted small">
                {formatLeadTime(driverWalks[0].hoursBefore)
                  ? `· ${formatLeadTime(driverWalks[0].hoursBefore)} `
                  : ""}
                · back in the Pool · {formatDateTime(driverWalks[0].at)}
              </span>
            </div>
            {driverWalks[0].reason && (
              <div className="dx-amend__reason">
                <span className="muted">Reason:</span> {driverWalks[0].reason}
              </div>
            )}
            <p className="dx-amend__reassure">
              The trip went straight back to the Pool
              {mission.speed_win ? ", with SPEED WIN on so it fills faster" : ""}. A Driver
              who drops an accepted trip owes a penalty under the rules — we settle that
              with them directly.
            </p>
          </div>
        )}

        {release && release.status === "accepted" && mission.status === "pooled" && (
          <div className="dx-amend dx-amend--neutral">
            <div className="dx-amend__head">
              <span className="dx-amend__tag dx-amend__tag--ok">Released by agreement</span>
              <span className="muted small">· back in the Pool · {formatDateTime(release.at)}</span>
            </div>
            {!archived && (
              <form action={closeRelease} className="dx-amend__actions">
                <input type="hidden" name="release_id" value={release.id} />
                <input type="hidden" name="mission_id" value={mission.id} />
                <button type="submit" className="dx-amend__link">Dismiss</button>
              </form>
            )}
          </div>
        )}

        {/* The reclaim card at the top of this panel says the same thing and carries
            the actions, so the tone's own hint would be the second copy of one
            message on one screen. The card supersedes it; every other tone keeps it. */}
        {t.hint && !reclaimVisible && (
          <div className="notice warn" style={{ marginTop: 12 }}>{t.hint}</div>
        )}

        {/* Scan strip — the numbers a Dispatcher acts on. Pickup on the left, fare
            on the right; the Flight tile drops out when there's no flight. */}
        <div className="dx-scan">
          <div className="dx-scan__c">
            <div className="dx-scan__cap">Pickup</div>
            <div className="dx-scan__v">{formatDateTime(mission.pickup_at)}</div>
            <div className="dx-scan__s">
              Paris time{mission.night_applied && " · night rate (22:00–06:00)"}
            </div>
          </div>
          <div className="dx-scan__c">
            <div className="dx-scan__cap">Vehicle</div>
            <div className="dx-scan__v">{serviceLabel}</div>
            <div className="dx-scan__s">
              {specificCar ?? (mission.luggage_only ? "Luggage run" : mission.zone ?? "")}
            </div>
          </div>
          {mission.flight_number && (
            <div className="dx-scan__c">
              <div className="dx-scan__cap">Flight</div>
              <div className="dx-scan__v">{mission.flight_number}</div>
              <div className="dx-scan__s">{flightEta ? `lands ${flightEta}` : ""}</div>
            </div>
          )}
          <div className="dx-scan__c dx-scan__c--fare">
            {/* "now" is only true while the fare is still climbing in the Pool. Once
                a Driver holds it, the price is settled and the label has to say so. */}
            <div className="dx-scan__cap">
              {mission.accepted_at ? "Accepted at" : "Price now"}
            </div>
            <div className="dx-scan__v dx-scan__v--big">{formatMoney(fareSplit.businessTotal)}</div>
            <div className="dx-scan__s">Ceiling {formatMoney(ceilingSplit.businessTotal)}</div>
          </div>
        </div>

        {/* Route — full addresses + trip distance/duration; the rail checks off live
            as the Driver reaches each stop mid-trip. */}
        <div className="dx-panel dx-panel--route">
          <div className="dx-panel__h dx-panel__h--split">
            <span>Route</span>
            {tripMeta && <span className="dx-panel__meta">{tripMeta}</span>}
          </div>
          <div className="dx-rte">
            <div className="dx-rte__leg">
              <span className="dx-rte__dot dx-rte__dot--pk" aria-hidden />
              <span className="dx-rte__addr" title={mission.pickup_address}>
                {mission.pickup_address}
              </span>
            </div>
            {waypoints.map((w, i) => {
              const reached = i < stopsReached;
              const current = mission.status === "on_board" && i === stopsReached;
              return (
                <div
                  className={`dx-rte__leg${reached ? " dx-rte__leg--done" : ""}${current ? " dx-rte__leg--now" : ""}`}
                  key={i}
                >
                  <span className="dx-rte__dot dx-rte__dot--via" aria-hidden />
                  <span className="dx-rte__addr" title={w.address}>{w.address}</span>
                  {reached && <span className="dx-rte__tag dx-rte__tag--done">reached</span>}
                  {current && <span className="dx-rte__tag dx-rte__tag--now">next stop</span>}
                </div>
              );
            })}
            <div className="dx-rte__leg">
              <span className="dx-rte__dot dx-rte__dot--dp" aria-hidden />
              <span className="dx-rte__addr" title={mission.dropoff_address ?? undefined}>
                {mission.dropoff_address ?? "—"}
              </span>
            </div>
          </div>
          {(isExecutable(mission.status) || mission.status === "completed") && (
            <StatusSteps
              status={mission.status}
              stopsCount={waypoints.length}
              stopsReached={stopsReached}
            />
          )}
        </div>

        {/* What the price is made of — docs/06 §3's three lines, never collapsed
            into one "service fee": the Business reclaims the 20% VAT on
            Kavenue's fee but not the VAT on the transport, so the two have to
            stay separable. Absent on a mission priced before commission
            existed — it was billed no fee, and inventing lines for it would be
            a lie about what was charged. */}
        {paidSplit?.charged && (
          <div className="dx-panel">
            <div className="dx-panel__h">What you pay</div>
            <dl className="dx-fee">
              {/* The first line names what the money is FOR, so it has to be the
                  charge alone — waiting gets its own line when there is any.
                  They are exact halves of `paidSplit.course`, so the table still
                  adds up to the total. */}
              <dt>{mission.status === "cancelled" ? "Cancellation fee" : "Transport"}</dt>
              <dd>{formatMoney(paidSplit.course - waitingFee)}</dd>
              {waitingFee > 0 && (
                <>
                  {/* Course-side rate, to match the Course-side amount beside
                      it — 13 × 0,50 is exactly the 6,50 in the <dd>. */}
                  <dt>
                    Waiting
                    {waitingMinutes > 0 &&
                      ` · ${formatWaitingSpell(waitingMinutes, mission.waiting_rate)}`}
                  </dt>
                  <dd>{formatMoney(waitingFee)}</dd>
                </>
              )}
              <dt>Service fee ({formatRate(mission.commission_business_rate)})</dt>
              <dd>{formatMoney(paidSplit.businessFeeHt)}</dd>
              <dt>VAT on service fee</dt>
              <dd>{formatMoney(paidSplit.businessFeeVat)}</dd>
              <dt className="dx-fee__tot">Total</dt>
              <dd className="dx-fee__tot">{formatMoney(paidSplit.businessTotal)}</dd>
            </dl>
            {/* docs/06 §6: "the row shows what they saved against that maximum —
                the argument for the whole auction, made visible on every
                booking."
                ⚑ ONE NUMBER, deliberately (founder, 2026-08-17). This line used
                to carry four — the saving, the maximum, and the fee before and
                after — which buried the only fact that matters. The maximum is
                already in the tile above, and the fee is in the table above
                that; repeating them here made a simple, good piece of news read
                like an accounting note. */}
            {/* Only where it means something: a cancelled trip saved nobody
                anything, and the line sat under a cancellation fee. */}
            {savedAgainstMax > 0 && mission.status !== "cancelled" && (
              <p className="dx-fee__saved">You saved {formatMoney(savedAgainstMax)}</p>
            )}
          </div>
        )}

        {/* Driver — a slim bar (name · phone · car), or a quiet placeholder when the
            trip is still in the Pool. */}
        {driver ? (
          <div className="dx-driverbar">
            <span className="dx-av" aria-hidden>{driverInitials}</span>
            <div className="dx-driverbar__id">
              <div className="dx-driverbar__nm">
                {driver.name} <span>· Driver</span>
              </div>
              {driver.phone && (
                <a href={`tel:${driver.phone}`} className="dx-tel">
                  <Phone size={13} aria-hidden /> {driver.phone}
                </a>
              )}
            </div>
            {(carDesc || car?.plate) && (
              <span className="dx-carinline">
                <Car size={14} aria-hidden /> {carDesc || "Car"}
                {car?.plate && <span className="mono dx-plate">{car.plate}</span>}
              </span>
            )}
          </div>
        ) : (
          <div className="dx-driverbar dx-driverbar--empty">
            <Car size={15} aria-hidden />
            {mission.status === "pooled" ? "No Driver yet · in the Pool" : "No Driver assigned"}
          </div>
        )}

        {/* Service for the Driver + Guests, side by side. */}
        <div className="dx-pgrid">
          {hasService && (
            <div className="dx-panel">
              <div className="dx-panel__h">Service for the Driver</div>
              {languages.length > 0 && (
                <div className="dx-srow">
                  <span className="dx-slbl">Languages</span>
                  <div className="dx-chips">
                    {languages.map((l) => (
                      <span className="dx-chip dx-chip--plain" key={l}>{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {dressLabel && (
                <div className="dx-srow">
                  <span className="dx-slbl">Dress</span>
                  <div className="dx-chips"><span className="dx-chip">{dressLabel}</span></div>
                </div>
              )}
              {flagLabels.length > 0 && (
                <div className="dx-srow">
                  <span className="dx-slbl">Requests</span>
                  <div className="dx-chips">
                    {flagLabels.map((f) => (
                      <span className="dx-chip" key={f}>{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {(mission.board_name || mission.board_file_path) && (
                <div className="dx-srow">
                  <span className="dx-slbl">Name board</span>
                  <div className="dx-sval">
                    {mission.board_name || "—"}
                    {mission.board_file_path && (
                      <>
                        {" "}
                        <BoardFileLink missionId={mission.id} />
                      </>
                    )}
                  </div>
                </div>
              )}
              {mission.driver_message && (
                <div className="dx-srow">
                  <span className="dx-slbl">Message</span>
                  <div className="dx-quote">{mission.driver_message}</div>
                </div>
              )}
            </div>
          )}

          <div className="dx-panel">
            <div className="dx-panel__h">{guestsHeader}</div>
            {mission.luggage_only ? (
              <p className="dx-note">No passengers — luggage only.</p>
            ) : guestRows.length > 0 ? (
              guestRows.map((g) => (
                <div className="dx-guestrow" key={g.index}>
                  <div className="dx-gwho">
                    {g.main && <Star size={13} className="dx-gstar" aria-hidden />}
                    {g.main ? "Main contact" : "Guest"}
                    {g.name ? ` · ${g.name}` : ""}
                  </div>
                  {g.phone && (
                    <div className="dx-grow">
                      <a className="dx-tel" href={`tel:${g.phone}`}>
                        <Phone size={13} aria-hidden /> {g.phone}
                      </a>
                      <PhoneShareToggle
                        missionId={mission.id}
                        index={g.index}
                        shared={g.shared}
                        disabled={shareLocked}
                      />
                    </div>
                  )}
                </div>
              ))
            ) : mission.passenger_name ? (
              <div className="dx-guestrow">
                <div className="dx-gwho">
                  <Star size={13} className="dx-gstar" aria-hidden /> Main contact · {mission.passenger_name}
                </div>
              </div>
            ) : (
              <p className="dx-note">No named guests.</p>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
