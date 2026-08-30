import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Clock,
  Zap,
  Route,
  Car,
  Luggage,
  Users,
  Plane,
  Lock,
  Moon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverContext } from "@/lib/driver";
import { recordMissionEvent } from "@/lib/mission-events-server";
import { poolFareNet } from "@/lib/pool-fares";
import { tripDistanceKm } from "@/lib/geo";
import { parseWaypoints } from "@/lib/waypoints";
import {
  formatMoney,
  formatTripMeta,
  formatPoolWhen,
  serviceClassLabel,
  addressLine,
} from "@/lib/format";
import { parseLanguages, dressCodeLabel, activeFlagLabels } from "@/lib/driver-service";
import {
  parsePassengers,
  parseGuestContacts,
  zipGuestContacts,
  type GuestPhone,
} from "@/lib/passengers";
import { buildAmendmentData, buildReleaseData } from "@/lib/mission-cards";
import { isExpired } from "@/lib/dispatch-status";
import type { MissionStatus } from "@/lib/database.types";
import { MissionRunView } from "@/components/mission-run-view";
import { AcceptButton } from "./accept-button";

export const dynamic = "force-dynamic";

// The statuses that mean "this trip is live in My Rides" (as opposed to archived in
// History). An owned mission outside this set is terminal — its detail is read-only.
const ACTIVE_STATUSES: MissionStatus[] = [
  "accepted",
  "confirmed",
  "en_route",
  "arrived",
  "on_board",
];

// Mission detail = "the mission, opened". For a Driver's OWN trip it's the run view
// (state, route, unlocked contacts, and every action — advance / waiting meter /
// no-show / cancel) with a back link to My Rides. For a pooled trip it's the
// pre-accept view ("the Pool card, opened") ending in Accept. The two never share a
// screen, so the header can lead with state on one and price on the other.
export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { driver, vehicle: myVehicle } = await getDriverContext();
  const supabase = await createClient();

  const { data: mission } = await supabase
    .from("mission_read")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!mission) notFound();

  const isMine = !!driver && mission.driver_id === driver.id;

  // ---- The Driver's own trip: the dedicated run page ----------------------
  if (isMine && driver) {
    const isActive = ACTIVE_STATUSES.includes(mission.status);
    const backHref = isActive ? "/rides" : "/rides/history";
    const backLabel = isActive ? "← My Rides" : "← Past rides";

    // Reveal the contact + shared Guest phones via the service role (a Driver can't
    // read the Dispatcher / mission_guest_contact rows under RLS) — gated to THIS
    // mission, which the RLS query above already proved is the Driver's.
    //
    // A CLOSED trip gets no Guest data at all: the numbers are never fetched, so
    // the removal is a server fact, not a hidden div. The Business side is
    // untouched — Dispatch keeps the full record. The Business + its Dispatcher
    // stay here (a business counterparty, and the Driver's only route to a
    // dispute), only the Guest goes.
    const admin = createAdminClient();
    const [{ data: disp }, { data: biz }, { data: gc }] = await Promise.all([
      admin.from("dispatcher").select("name, phone").eq("id", mission.dispatcher_id).maybeSingle(),
      admin.from("business").select("name").eq("id", mission.business_id).maybeSingle(),
      isActive
        ? admin
            .from("mission_guest_contact")
            .select("contacts")
            .eq("mission_id", mission.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const guestPhones: GuestPhone[] = isActive
      ? zipGuestContacts(
          parsePassengers(mission.passenger_names),
          parseGuestContacts(gc?.contacts),
        ).filter((g) => g.shared)
      : [];

    // § AG — a Guest's personal phone number has just crossed from Kavenue to a
    // Driver's device. Nothing in the database changes when that happens, so
    // without this call there is no answer to "who was given this Guest's number,
    // and when" — which is a GDPR question and a dispute question, not analytics.
    //
    // ⚑ Recorded HERE, at the disclosure, not on the tap: the number leaves the
    // server whether or not they ever press call. A `tel:` link cannot be
    // observed anyway.
    //
    // ⚑ Deduped per Driver per trip, forever. This is a page render — a Driver
    // reloading their trip twenty times is one disclosure, not twenty, and the
    // first one is the fact that matters. The DB enforces it, so two concurrent
    // renders cannot both write.
    if (guestPhones.length > 0) {
      await recordMissionEvent({
        missionId: mission.id,
        type: "contact_revealed",
        actorKind: "driver",
        actorId: driver.id,
        driverId: driver.id,
        dedupeKey: `contact_revealed:${mission.id}:${driver.id}`,
        payload: { phones: guestPhones.length },
      });
    }

    // Arrival attestation: the latest 'arrived' status_event is the precondition to
    // report a no-show (and the basis of the 5-min on-site floor). NOT the clock
    // origin — the courtesy wait runs from when the Guest was due.
    let arrivedAtIso: string | null = null;
    let arrivedErr: string | null = null;
    if (mission.status === "arrived") {
      const { data: evs, error: evErr } = await supabase
        .from("status_event")
        .select("created_at")
        .eq("status", "arrived")
        .eq("mission_id", mission.id)
        .order("created_at", { ascending: false })
        .limit(1);
      // Don't swallow this: a failed read leaves arrivedAtIso null, which hides the
      // whole (money-bearing) no-show control with no explanation. Surface it instead.
      if (evErr) arrivedErr = evErr.message;
      arrivedAtIso = evs?.[0]?.created_at ?? null;
    }

    // Pending "respond to a change" cards. One proposed of each per mission (the
    // Business supersedes on re-send). Both are answerable ONLY while accepted/confirmed
    // — respond_to_amendment / respond_to_release reject any later status, and nothing
    // supersedes a stale 'proposed' row on the ordinary drive-to-complete path, so an
    // ungated card would keep offering a live Accept/Decline (that errors on tap) right
    // through to a completed trip opened read-only from History.
    const [{ data: amd }, { data: rel }, { data: myMissions }] = await Promise.all([
      supabase
        .from("mission_amendment")
        .select("*")
        .eq("mission_id", mission.id)
        .eq("status", "proposed")
        .maybeSingle(),
      supabase
        .from("mission_release")
        .select("*")
        .eq("mission_id", mission.id)
        .eq("status", "proposed")
        .maybeSingle(),
      // The Driver's other live trips — used only for the amendment slot heads-up.
      supabase
        .from("mission_read")
        .select("*")
        .eq("driver_id", driver.id)
        .in("status", ACTIVE_STATUSES)
        .order("pickup_at", { ascending: true }),
    ]);

    const answerable = mission.status === "accepted" || mission.status === "confirmed";
    const amendment =
      amd && answerable
        ? buildAmendmentData(amd, mission, myMissions ?? [], biz?.name ?? null)
        : null;
    const release =
      rel && answerable ? buildReleaseData(rel, mission, biz?.name ?? null) : null;

    return (
      <>
        <p className="small">
          <Link href={backHref} className="muted">
            {backLabel}
          </Link>
        </p>

        {arrivedErr && (
          <div className="notice error">
            Couldn’t load your arrival time: {arrivedErr}. The no-show report may be
            unavailable — reload, or call the Business.
          </div>
        )}

        <MissionRunView
          mission={mission}
          businessName={biz?.name ?? null}
          dispatcherName={disp?.name ?? null}
          dispatcherPhone={disp?.phone ?? null}
          guestPhones={guestPhones}
          arrivedAtIso={arrivedAtIso}
          amendment={amendment}
          release={release}
          preferredGps={driver.preferred_gps}
          archived={!isActive}
        />
      </>
    );
  }

  // ---- Pooled (or no longer available): the pre-accept view ---------------
  // § P — a past-due trip is dead even if the sweep hasn't reached it yet (a deep
  // link can land here without either sweeping page being opened). Requiring a
  // future pickup here means the Accept button is never offered for something
  // `accept_mission` would refuse.
  // Already swept, or on its way there — either way the Driver deserves the real
  // reason rather than the generic "someone else took it".
  const expired = isExpired(mission);
  const isPooled = mission.status === "pooled" && !expired;
  // § B (2026-08-11) — accept_mission now enforces tier / required body / luggage
  // consent in SQL, and RLS lets a Driver READ any pooled mission, so this page is
  // reachable for a trip the Pool never listed. Same three tests as the Pool query;
  // the radius and required_make are deliberately NOT repeated, because the DB
  // doesn't enforce those either and repeating them here would hide a trip the
  // Driver could legitimately take.
  const eligible =
    !!myVehicle &&
    mission.category === myVehicle.category &&
    (!mission.required_body_type || mission.required_body_type === myVehicle.body_type) &&
    (!mission.luggage_only || !!driver?.accepts_luggage_runs);
  const isHourly = mission.mission_type === "hourly";
  // NET, like the Pool card it opens from — what the Driver banks (docs/06 §1),
  // and computed SERVER-SIDE for the same reason as the card: below this line
  // the trip is one the Driver does NOT hold, so `mission_read` has masked its
  // Ceiling and `currentFare()` has nothing to climb to. The id came from the
  // RLS read at the top of this function. "—" when the price cannot be read; a
  // 0 would look like a real offer.
  const fare = await poolFareNet(mission.id);
  const when = formatPoolWhen(mission.pickup_at);
  const waypoints = parseWaypoints(mission.waypoints);
  const distanceKm = tripDistanceKm(
    mission.pickup_lat,
    mission.pickup_lng,
    mission.dropoff_lat,
    mission.dropoff_lng,
  );
  const tripMeta = formatTripMeta(mission.distance_km, mission.duration_min, distanceKm);
  const vehicle = serviceClassLabel(mission.category, mission.required_body_type);
  const languages = parseLanguages(mission.required_languages);
  const dressLabel = dressCodeLabel(mission.dress_code);
  const flagLabels = activeFlagLabels(mission.driver_flags);
  const hasChips = languages.length > 0 || !!dressLabel || flagLabels.length > 0;

  // Same rail as the Pool card, uncollapsed: pickup → every stop → drop-off. An
  // at-disposal (hourly) trip has no fixed drop-off, so it ends at the pickup.
  type Leg = { kind: "from" | "stop" | "to"; text: string };
  const legs: Leg[] = [{ kind: "from", text: addressLine(mission.pickup_address) }];
  for (const w of waypoints) legs.push({ kind: "stop", text: addressLine(w.address) });
  if (!isHourly && mission.dropoff_address) {
    legs.push({ kind: "to", text: addressLine(mission.dropoff_address) });
  }

  return (
    <>
      <p className="small">
        <Link href="/pool" className="muted">
          ← Back to Pool
        </Link>
      </p>

      <div className="dcard">
        <div className="pcard__head">
          <span className="pcard__fare">{fare == null ? "—" : formatMoney(fare)}</span>
          <span className="pcard__when">
            <span className={when.today ? "pcard__day pcard__day--today" : "pcard__day"}>
              {when.day}
            </span>
            <span className="pcard__time">{when.time}</span>
          </span>
        </div>

        <div className="pcard__body">
          <div className="pcard__badges">
            <span className="pbadge pbadge--type">
              {isHourly ? (
                <Clock size={13} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
              )}
              {isHourly ? "At disposal" : "Transfer"}
            </span>
            {mission.speed_win && (
              <span className="pbadge pbadge--speed">
                <Zap size={11} strokeWidth={2} aria-hidden="true" />
                SPEED WIN
              </span>
            )}
            {mission.luggage_only && (
              <span className="pbadge pbadge--run">
                <Luggage size={12} strokeWidth={1.9} aria-hidden="true" />
                Luggage run
              </span>
            )}
            {/* Mirrors the Pool card badge — the two blocks must not drift. */}
            {mission.night_applied && (
              <span className="pbadge pbadge--run">
                <Moon size={12} strokeWidth={1.9} aria-hidden="true" />
                Night rate
              </span>
            )}
          </div>

          <div className="proute">
            {legs.map((leg, i) => {
              const last = i === legs.length - 1;
              return (
                <div key={i} className={last ? "proute__leg proute__leg--last" : "proute__leg"}>
                  <span className="proute__rail">
                    {!last && <span className="proute__line" />}
                    <span className={`proute__dot proute__dot--${leg.kind}`} />
                  </span>
                  <span
                    className={
                      `proute__addr proute__addr--${leg.kind}` +
                      (last ? "" : " proute__addr--pad")
                    }
                  >
                    {leg.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pcard__foot">
          <span className="pcard__facts">
            {isHourly ? (
              <Clock size={13} aria-hidden="true" />
            ) : (
              <Route size={13} aria-hidden="true" />
            )}
            {isHourly ? "Flexible route" : tripMeta || "—"}
            <span className="pcard__veh">
              <Car size={13} aria-hidden="true" />
              {vehicle}
            </span>
          </span>
        </div>
      </div>

      <div className="dcard">
        <p className="dcard__label">Service</p>

        <div className="dfact">
          <span className="dfact__l">
            <Users size={16} strokeWidth={1.75} aria-hidden="true" />
            Passengers
          </span>
          <span className="dfact__v">
            {mission.luggage_only ? "None (luggage run)" : (mission.pax_count ?? "—")}
          </span>
        </div>

        <div className="dfact">
          <span className="dfact__l">
            <Luggage size={16} strokeWidth={1.75} aria-hidden="true" />
            Luggage
          </span>
          <span className="dfact__v">{mission.luggage_count ?? "—"}</span>
        </div>

        {mission.flight_number && (
          <div className="dfact">
            <span className="dfact__l">
              <Plane size={16} strokeWidth={1.75} aria-hidden="true" />
              Flight
            </span>
            <span className="dfact__v">{mission.flight_number}</span>
          </div>
        )}

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
      </div>

      {isPooled && (
        <p className="dlock">
          <Lock size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>Private details unlock once you accept.</span>
        </p>
      )}

      {isPooled && eligible ? (
        <AcceptButton missionId={mission.id} />
      ) : isPooled ? (
        <div className="notice warn">
          This trip doesn’t match your vehicle. If that’s wrong, update it in Settings.
        </div>
      ) : expired ? (
        <div className="notice warn">
          Too late — this mission’s pickup time has passed and no Driver took it.
        </div>
      ) : (
        <div className="notice warn">
          This mission is no longer available in the Pool.
        </div>
      )}
    </>
  );
}
