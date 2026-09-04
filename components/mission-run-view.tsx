import {
  Building2,
  Car,
  CircleCheck,
  Clock,
  ClockAlert,
  Lock,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  UserRound,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { settledFare } from "@/lib/pdp";
import { grossToDriver, missionAmount } from "@/lib/earnings";
import {
  formatMoney,
  formatPoolWhen,
  formatRate,
  formatWaitingSpell,
  missionStatusLabel,
} from "@/lib/format";
import {
  driverKeeps,
  driverNet,
  driverRatesOf,
  driverSplitFor,
  taxLineFor,
} from "@/lib/commission";
import { taxOf } from "@/lib/vat";
import type { MissionRow, MissionStatus, PreferredGps } from "@/lib/database.types";
import { isExecutable, progressDone, progressSegments } from "@/lib/mission-flow";
import { parseWaypoints } from "@/lib/waypoints";
import { parseLanguages, dressCodeLabel, activeFlagLabels } from "@/lib/driver-service";
import {
  cancelCompensation,
  guestDueAt,
  isAirportPickup,
  noShowAvailableAt,
  noShowWaitMinutes,
  waitingAt,
} from "@/lib/cancellation";
import { navigateUrl, nextDestination } from "@/lib/nav-links";
import type { GuestPhone } from "@/lib/passengers";
import { closingLine, type AmendmentCardData, type ReleaseCardData } from "@/lib/mission-cards";
import { BoardFileLink } from "@/components/board-file-link";
import { AmendmentCard } from "@/components/amendment-card";
import { ReleaseCard } from "@/components/release-card";
import { StatusControl } from "@/app/(app)/rides/status-control";
import { CheckInCard } from "@/components/check-in-card";
import { CloseTripCard } from "@/components/close-trip-card";
import { checkInOpen, needsClosing } from "@/lib/dispatch-status";
import { DriverCancel, NoShowControl } from "@/app/(app)/rides/cancel-noshow";

// The card leads with STATE, not price. Tone follows the trip's phase: blue while
// it's held but not moving, green once it's under way, grey when done, amber for a
// no-show (which pays the Driver — a warning, never a failure).
// Cancelled gets NO icon: a bare × reads as a dismiss control, not a state
// (founder, S47) — the line under the pill says who cancelled instead.
export function statusPill(m: MissionRow): { tone: string; Icon: LucideIcon | null } {
  if (m.no_show) return { tone: "warn", Icon: UserX };
  switch (m.status) {
    case "en_route":
      return { tone: "go", Icon: Navigation };
    case "arrived":
      return { tone: "go", Icon: MapPin };
    case "on_board":
      return { tone: "go", Icon: Car };
    case "completed":
      return { tone: "neutral", Icon: CircleCheck };
    case "cancelled":
      return { tone: "danger", Icon: null };
    case "confirmed":
      return { tone: "info", Icon: CircleCheck };
    default:
      return { tone: "info", Icon: Clock }; // accepted — awaiting Lock-in
  }
}

// Plain words for where the trip is, read next to the segment bar (which is
// colour-only otherwise). The maths lives in progressSegments/progressDone.
export function progressCaption(
  status: MissionStatus,
  stopsCount: number,
  stopsReached: number,
): string {
  switch (status) {
    case "en_route":
      return "On the way";
    case "arrived":
      return "Waiting for the Guest";
    case "on_board":
      return stopsReached < stopsCount
        ? `On board · ${stopsReached}/${stopsCount} stops`
        : "On board";
    case "completed":
      return "Completed";
    default:
      return "Not started"; // confirmed
  }
}

// The accepted mission, opened: the S43/S45 run card plus every action for the trip
// (status advance, the waiting meter + no-show, cancel). It lives on the dedicated
// /missions/[id] page now, not in the My Rides list — the list just links here.
export function MissionRunView({
  mission: m,
  businessName,
  dispatcherName,
  dispatcherPhone,
  guestPhones,
  arrivedAtIso,
  amendment,
  release,
  preferredGps = null,
  archived = false,
}: {
  mission: MissionRow;
  businessName: string | null;
  dispatcherName: string | null;
  dispatcherPhone: string | null;
  guestPhones: GuestPhone[];
  arrivedAtIso: string | null;
  amendment: AmendmentCardData | null;
  release: ReleaseCardData | null;
  /** Which map app the Driver picked in their account (S48). */
  preferredGps?: PreferredGps | null;
  /** The trip is closed (Past tab): Guest data is gone, the card is a record. */
  archived?: boolean;
}) {
  const stops = parseWaypoints(m.waypoints);
  const stopsReached = m.stops_reached ?? 0;
  const languages = parseLanguages(m.required_languages);
  const dressLabel = dressCodeLabel(m.dress_code);
  const flagLabels = activeFlagLabels(m.driver_flags);
  const hasChips = languages.length > 0 || !!dressLabel || flagLabels.length > 0;
  // The name board carries the Guest's name and the private message can quote
  // them, so both go with the rest of the Guest data once the trip is closed.
  const hasPrep = !archived && (!!m.board_name || !!m.board_file_path || !!m.driver_message);

  const when = formatPoolWhen(m.pickup_at);
  const { tone, Icon: PillIcon } = statusPill(m);
  const showProgress = isExecutable(m.status) || m.status === "completed";
  // § Q slice 2 — the question is being asked right now. While this is true the
  // close card owns the screen and the normal step buttons stand down: the
  // question is "did this happen?", not "what's the next step?".
  const asking = needsClosing(m);
  // …and the outcome stays unsettled after a `not_driven` answer, which is why
  // Cancel has to stay away too: a Driver cancel is a 100% penalty plus a re-pool,
  // and re-pooling a trip whose pickup was seven weeks ago is meaningless (§ P
  // refuses a past pickup). Whatever happened here, it is not a cancellation.
  const unsettled = asking || m.close_answer === "not_driven";
  const segments = progressSegments(stops.length);
  const done = progressDone(m.status, stops.length, stopsReached);
  const caption = progressCaption(m.status, stops.length, stopsReached);
  const phones = guestPhones;
  const comp = cancelCompensation(m);
  const destination = nextDestination(m, stops);
  // Settled waiting, i.e. board_guest (or one of the three failure doors) has written it.
  // Not the live meter — that is NoShowControl's job while the Driver is still on site.
  // NET, like every other figure a Driver reads: the meter accrues 1 €/min
  // between the parties, and this is the Driver's share of it (docs/06 §1).
  const settledWaiting =
    m.status === "arrived" ? 0 : driverNet(m, Number(m.waiting_fee ?? 0));

  // The Driver's own money detail (docs/06 §1, §3) — over the same gross figure
  // the footer shows, so the breakdown and the total can never disagree.
  const payment = driverSplitFor(m, grossToDriver(m));
  // ⚑ `payment.course` is grossToDriver — the fare AND the settled waiting, or on a
  // cancelled trip the compensation. Rendering it under a "Fare" label made the table
  // say something untrue on any trip that waited: a 100 € trip with 15 € of waiting
  // read "Fare 115,00". Split into its parts, which sum to exactly the same total, and
  // name the first line for what the money actually is on this trip.
  const settledWaitingGross = m.status === "cancelled" ? 0 : Number(m.waiting_fee ?? 0);
  const baseGross = payment.course - settledWaitingGross;
  const baseLabel =
    m.status === "cancelled" ? "Cancellation compensation" : m.no_show ? "No-show — full fare" : "Fare";
  // NULL is not zero, and 0 is not a rate. The trigger stamps 0 for a Driver
  // under *franchise en base* and leaves NULL when nobody has been attached yet,
  // when the trip was re-pooled, or when no rate generation was in force
  // (2026-08-17_transport_vat_snapshot). "We don't know" must never render as
  // "you charge none" — that is a statement about someone's tax affairs — and
  // "franchise en base" must never render as "0 %", which is not a rate that
  // exists in France. `lib/vat.ts` holds all three apart; this used to be one
  // hand-written `vatKnown` boolean, in this component only.
  //
  // ⚑ NAMES WHAT THE MONEY IS, INCLUDING ON A CANCELLED TRIP (2026-09-04).
  // This used to ask for the ride's treatment even on a cancellation, because
  // `taxOf("cancellation_business")` refused to answer and wiring it in would
  // have changed a Driver's screen on the strength of an open question. The
  // founder answered it: a cancellation follows whatever was cancelled. So the
  // kind is now stated honestly, and `taxOf` does the delegating.
  //
  // ⚑ AND THIS MOVES NO NUMBER TODAY, which is why it ships as a one-line
  // change rather than a migration: `cancellation_business` delegates through
  // `rideKindOf`, and `mission_type` is `transfer` on every live row — so it
  // resolves to exactly the `"transfer"` this line used to hard-code. It starts
  // to differ only on an at-disposal trip, which cannot yet be booked.
  const supply = taxOf(
    m.status === "cancelled" ? "cancellation_business" : m.no_show ? "no_show" : "transfer",
    m,
  );
  const vat = taxLineFor(payment.course, supply);

  return (
    <>
      <article className="dcard">
        {/* State leads; the fare moved down to the footer. */}
        <div className="pcard__head">
          <span className={`dpill dpill--${tone}`}>
            {PillIcon && <PillIcon size={13} strokeWidth={1.75} aria-hidden="true" />}
            {m.no_show ? "No-show" : missionStatusLabel(m.status)}
          </span>
          <span className="pcard__when">
            <span className={when.today ? "pcard__day pcard__day--today" : "pcard__day"}>
              {when.day}
            </span>
            <span className="pcard__time">{when.time}</span>
          </span>
        </div>

        <div className="pcard__body">
          {/* D61 — check-in leads: it's the only thing to DO on a trip that hasn't
              started, and it disappears the moment it's done or the trip moves. */}
          <CheckInCard
            missionId={m.id}
            open={checkInOpen(m)}
            checkedInAt={m.status === "confirmed" ? m.checked_in_at : null}
          />

          {/* § Q slice 2 — the trip is past its expected end and still open. This
              replaces the normal status control below (see `showStatus`): two
              competing sets of buttons on one screen is how a Driver taps the
              wrong one. */}
          {asking && (
            <CloseTripCard
              missionId={m.id}
              boarded={m.status === "on_board"}
              // NET, like every other figure a Driver reads. The card says
              // "closing settles X - the fare you accepted", and X has to be the
              // number the footer, My Rides and Earnings will show the instant
              // they tap Yes. It was the last gross fare left in their app.
              fare={driverNet(m, settledFare(m))}
              line={closingLine(m)}
            />
          )}

          {/* Answered "it didn't happen": the trip stops asking and says where it
              stands. No further action here — the hotel calls, and in beta the
              settlement is a human conversation. */}
          {m.close_answer === "not_driven" && (
            <p className="dcheck__done">
              <ClockAlert size={16} strokeWidth={1.75} aria-hidden="true" />
              You said this trip didn’t happen. The hotel has been told and will be in touch.
            </p>
          )}

          {/* Trip progress: one bar + plain words (the bar alone is colour-only). */}
          {showProgress && (
            <div>
              <div className="dprog__row">
                <span>Trip progress</span>
                <span className="dprog__now">{caption}</span>
              </div>
              <div className="dprog__bar" role="img" aria-label={`Trip progress: ${caption}`}>
                {segments.map((seg, i) => (
                  <span
                    key={seg.key}
                    className={i < done ? "dprog__seg dprog__seg--on" : "dprog__seg"}
                  />
                ))}
              </div>
            </div>
          )}

          {/* The meter ran, then the Guest got in the car. The Driver watched that money
              accrue for twenty minutes; if it simply vanished at the moment of boarding
              they would have no reason to believe it counted. One line, deliberately —
              the fare in the footer already includes it. */}
          {settledWaiting > 0 && (
            <p className="dwait-kept">
              {formatMoney(settledWaiting)} waiting added
              {m.waiting_minutes
                ? ` · ${formatWaitingSpell(
                    m.waiting_minutes,
                    driverNet(m, Number(m.waiting_rate ?? 0)),
                  )} past the courtesy wait`
                : ""}
            </p>
          )}

          {m.status === "cancelled" && (
            <>
              <p className="dend-note">Cancelled by the Business</p>
              {/* The Business's own words. Shown deliberately (founder, S47): a
                  Driver who just lost a job is owed the why, and the Business is
                  told at the point of writing that the Driver reads it. */}
              {m.cancellation_reason && (
                <div className="dreason">
                  <MessageSquare aria-hidden="true" />
                  <span>“{m.cancellation_reason}”</span>
                </div>
              )}
            </>
          )}

          {amendment && <AmendmentCard {...amendment} />}
          {release && <ReleaseCard {...release} />}

          {/* Route rail, full addresses. Live progress rides the dots: a reached
              stop turns green, the next one is ringed while the Guest is on board. */}
          <div className="proute">
            <div className="proute__leg">
              <span className="proute__rail">
                <span className="proute__line" />
                <span className="proute__dot proute__dot--from" />
              </span>
              <span className="proute__addr proute__addr--from proute__addr--pad">
                {m.pickup_address}
              </span>
            </div>
            {stops.map((w, i) => {
              const reached = i < stopsReached;
              const current = m.status === "on_board" && i === stopsReached;
              const dot = reached ? "done" : current ? "now" : "stop";
              return (
                <div className="proute__leg" key={i}>
                  <span className="proute__rail">
                    <span className="proute__line" />
                    <span className={`proute__dot proute__dot--${dot}`} />
                  </span>
                  <span className="proute__addr proute__addr--stop proute__addr--pad">
                    {w.address}
                    {reached && <span className="dreached">Reached</span>}
                    {current && <span className="dnext">Next stop</span>}
                  </span>
                </div>
              );
            })}
            <div className="proute__leg proute__leg--last">
              <span className="proute__rail">
                <span className="proute__dot proute__dot--to" />
              </span>
              <span className="proute__addr proute__addr--to">{m.dropoff_address ?? "—"}</span>
            </div>
          </div>

          {/* Navigate, in the app the Driver chose in their account. Only while the
              trip is live — a closed trip has nowhere to go. */}
          {!archived && isExecutable(m.status) && destination && (
            <a
              className="dnav"
              href={navigateUrl(preferredGps, destination)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={16} strokeWidth={1.9} aria-hidden="true" />
              Navigate to the {destination.label}
            </a>
          )}

          {/* Unlocked contacts, as tap targets. Only SHARED Guest numbers reach
              here (filtered server-side); a contact without a number is a fact row. */}
          {(phones.length > 0 || dispatcherPhone) && (
            <div className="dcall">
              {phones.map((g) => (
                <a className="dcall__btn" href={`tel:${g.phone}`} key={g.index}>
                  <Phone size={17} strokeWidth={1.75} aria-hidden="true" />
                  <span className="dcall__txt">
                    <span className="dcall__l">Guest</span>
                    <span className="dcall__v">{g.name || "Guest"}</span>
                  </span>
                </a>
              ))}
              {dispatcherPhone && (
                <a className="dcall__btn" href={`tel:${dispatcherPhone}`}>
                  <Phone size={17} strokeWidth={1.75} aria-hidden="true" />
                  <span className="dcall__txt">
                    <span className="dcall__l">Dispatcher</span>
                    <span className="dcall__v">{dispatcherName ?? "Dispatcher"}</span>
                  </span>
                </a>
              )}
            </div>
          )}

          <div>
            {!archived && m.passenger_name && (
              <div className="dfact">
                <span className="dfact__l">
                  <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
                  Guest
                </span>
                <span className="dfact__v">{m.passenger_name}</span>
              </div>
            )}
            {/* The Business itself lives in the card foot — no need to say it twice. */}
            {!dispatcherPhone && (
              <div className="dfact">
                <span className="dfact__l">
                  <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
                  Dispatcher
                </span>
                <span className="dfact__v">{dispatcherName ?? "—"}</span>
              </div>
            )}
          </div>

          {/* What to have ready: the board + the Business's private message (S19). */}
          {hasPrep && (
            <div className="dnote">
              {(m.board_name || m.board_file_path) && (
                <div className="dnote__row">
                  <span className="dnote__l">Name board</span>
                  {m.board_name || "—"}
                  {m.board_file_path && (
                    <>
                      {" · "}
                      <BoardFileLink missionId={m.id} />
                    </>
                  )}
                </div>
              )}
              {m.driver_message && (
                <div className="dnote__row">
                  <span className="dnote__l">Message</span>
                  {m.driver_message}
                </div>
              )}
            </div>
          )}

          {/* Soft requirements — languages, dress code, request flags. */}
          {hasChips && (
            <div className="dchips">
              {languages.map((l) => (
                <span className="dchip" key={l}>
                  {l}
                </span>
              ))}
              {dressLabel && <span className="dchip">{dressLabel}</span>}
              {flagLabels.map((f) => (
                <span className="dchip" key={f}>
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* What you're paid — docs/06 §1, §3.
              The one place a Driver sees the commission at all. Everywhere else
              the figure IS the payment (the founder's ruling), but a Driver has
              to invoice and file: they need the fee to reclaim its VAT, and the
              VAT inside the fare to declare it. Two Drivers can bank the same
              87,00 € and keep different amounts, which no single number can say.
              Absent on a trip priced before commission — nothing was deducted. */}
          {payment.charged && (
            <div className="dnote">
              <div className="dnote__h">What you’re paid for this trip</div>
              <dl className="dfee">
                <dt>{baseLabel}</dt>
                <dd>{formatMoney(baseGross)}</dd>
                {settledWaitingGross > 0 && (
                  <>
                    {/* Course-side here, like the <dd> beside it and the rest of
                        this table — the commission comes off further down, so
                        13 × 0,50 is exactly the 6,50 shown. The kept-money line
                        above quotes the Driver's own 0,44 for the same wait. */}
                    <dt>
                      Waiting
                      {m.waiting_minutes
                        ? ` · ${formatWaitingSpell(m.waiting_minutes, m.waiting_rate)}`
                        : ""}
                    </dt>
                    <dd>{formatMoney(settledWaitingGross)}</dd>
                  </>
                )}
                <dt>Kavenue commission ({formatRate(m.commission_driver_rate)})</dt>
                <dd>−{formatMoney(payment.driverFeeHt)}</dd>
                <dt>VAT on commission</dt>
                <dd>−{formatMoney(payment.driverFeeVat)}</dd>
                <dt className="dfee__tot">Paid to you</dt>
                <dd className="dfee__tot">{formatMoney(payment.driverNet)}</dd>
              </dl>
              {/* ⚑ `undetermined` renders NOTHING — the same silence the old
                  `vatKnown` guard produced, now impossible to forget because the
                  union has no branch for it here. */}
              {vat.kind === "taxable" && (
                <p className="dfee__note">
                  The fare carries {formatMoney(vat.amount)} of VAT you collect and
                  declare, and you reclaim the {formatMoney(payment.driverFeeVat)} above.
                  After settling both you keep {formatMoney(driverKeeps(payment, supply))}.
                </p>
              )}
              {vat.kind === "franchise" && (
                <p className="dfee__note">
                  You charge no VAT, so there is none to declare and none to reclaim.
                </p>
              )}
            </div>
          )}

          {/* Why the Guest is missing from a finished trip — said once, plainly,
              so it reads as a rule rather than as data that failed to load. */}
          {archived && (
            <div className="dlock dlock--foot">
              <Lock aria-hidden="true" />
              Guest details are removed once a trip closes. The Business keeps the
              full record.
            </div>
          )}
        </div>

        <div className="pcard__foot">
          <span className="pcard__facts">
            <Building2 size={13} aria-hidden="true" />
            {businessName ?? "—"}
            {/* On a cancelled trip the trip fare is NOT what the Driver is owed —
                the O7 compensation is (labelled, so it can't be misread as the fare).
                On any other ending it is the fare PLUS any settled waiting: waiting is
                earned money, and showing the fare alone made this card disagree with
                Earnings on the same trip. `missionAmount` is the one definition both use. */}
            <span className="pcard__veh">
              {comp != null
                ? `Compensation ${formatMoney(driverNet(m, comp))}`
                : formatMoney(missionAmount(m))}
            </span>
          </span>
        </div>
      </article>

      {/* Actions live below the card: exactly one filled button, the rest quiet. */}
      <div className="dstack">
        {isExecutable(m.status) && !unsettled && (
          <StatusControl
            missionId={m.id}
            status={m.status}
            stops={stops}
            stopsReached={stopsReached}
          />
        )}

        {/* No-show (O7): once on-site, the amber report flow after the wait window.
            The window runs from when the GUEST was due — the ordered pickup time, or a
            tracked landing instant — never from the Driver's arrival. */}
        {m.status === "arrived" && arrivedAtIso && (
          <NoShowControl
            missionId={m.id}
            fare={settledFare(m)}
            rates={driverRatesOf(m)}
            category={m.category}
            guestDueIso={guestDueAt(m).toISOString()}
            availableAtIso={noShowAvailableAt(m, arrivedAtIso).toISOString()}
            waitMinutes={noShowWaitMinutes(isAirportPickup(m))}
            waitingFromIso={waitingAt(m).from.toISOString()}
            waitingUntilIso={waitingAt(m).until.toISOString()}
            guestPhone={
              phones.find((g) => g.main)?.phone ?? phones[0]?.phone ?? null
            }
          />
        )}

        {/* Cancel (O7): available while the Driver holds the trip, before boarding —
            but never once the trip is past its expected end (§ Q). A Driver cancel
            is a 100% penalty plus a re-pool, and neither means anything on a trip
            that already came and went; the close card above is the honest answer. */}
        {!unsettled &&
          (m.status === "accepted" ||
            m.status === "confirmed" ||
            m.status === "en_route" ||
            m.status === "arrived") && (
          <DriverCancel
            missionId={m.id}
            fare={settledFare(m)}
            businessPhone={dispatcherPhone}
            businessName={businessName}
          />
        )}
      </div>
    </>
  );
}
