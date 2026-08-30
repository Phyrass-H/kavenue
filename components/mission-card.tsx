import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Zap,
  Route,
  Car,
  Baby,
  PawPrint,
  Luggage,
  Signature,
  UserRound,
  Shirt,
  Languages,
  VolumeX,
  Plane,
  Moon,
  type LucideIcon,
} from "lucide-react";
import type { PoolMissionRow } from "@/lib/database.types";
import { tripDistanceKm } from "@/lib/geo";
import { parseWaypoints } from "@/lib/waypoints";
import {
  formatMoney,
  formatTripMeta,
  formatPoolWhen,
  serviceClassLabel,
  addressLine,
} from "@/lib/format";
import { parseDriverFlags, parseLanguages } from "@/lib/driver-service";

// Pool card. Everything a Driver weighs at a glance, one uniform shape:
//   price + when → mission type / SPEED WIN → route (rail) → trip facts + requests.
// Deeper detail lives on tap (/missions/[id]). Service requests are capped at 3
// (highest-priority first) with a "+N"; the drop-off is absent for an at-disposal
// (hourly) mission, which shows a duration instead of a route on the facts line.
export function MissionCard({
  mission,
  fare,
}: {
  mission: PoolMissionRow;
  /**
   * ⚑ NET, AND COMPUTED ON THE SERVER. What the Driver banks — docs/06 §1 and
   * the founder's ruling that the Pool price IS the Driver's price. It arrives
   * as a prop rather than being worked out here because `currentFare()` needs
   * the Ceiling, and `mission_read` masks the Ceiling from a Driver on a trip
   * they do not hold. `lib/pool-fares.ts` does the arithmetic where the
   * Business's maximum cannot reach a Driver's token.
   *
   * null = the price could not be read. Rendered as "—", never as 0, which
   * would read as a real and terrible offer.
   */
  fare: number | null;
}) {
  const when = formatPoolWhen(mission.pickup_at);
  const isHourly = mission.mission_type === "hourly";

  const straightKm = tripDistanceKm(
    mission.pickup_lat,
    mission.pickup_lng,
    mission.dropoff_lat,
    mission.dropoff_lng,
  );
  const tripMeta = formatTripMeta(mission.distance_km, mission.duration_min, straightKm);
  const stops = parseWaypoints(mission.waypoints).length;
  const vehicle = serviceClassLabel(mission.category, mission.required_body_type);

  // Service requests, highest-priority first: things that make a Driver decline or
  // need something physical rank first (child seat → pets → luggage), then prep,
  // then nice-to-know. Card shows the top 3; the rest surface on tap.
  const flags = parseDriverFlags(mission.driver_flags);
  const hasLuggage = (mission.luggage_count ?? 0) > 0 || !!flags.luggage_help;
  const hasDress = !!mission.dress_code && mission.dress_code !== "driver_choice";
  const hasLang = parseLanguages(mission.required_languages).length > 0;
  const services: { key: string; Icon: LucideIcon; label: string }[] = (
    [
      flags.child_seat && { key: "child", Icon: Baby, label: "Child seat" },
      flags.pets && { key: "pets", Icon: PawPrint, label: "Pets" },
      hasLuggage && { key: "luggage", Icon: Luggage, label: "Luggage" },
      flags.meet_greet && { key: "meet", Icon: Signature, label: "Meet & greet" },
      flags.greeter && { key: "greeter", Icon: UserRound, label: "Greeter" },
      hasDress && { key: "dress", Icon: Shirt, label: "Dress code" },
      hasLang && { key: "lang", Icon: Languages, label: "Language" },
      flags.quiet_ride && { key: "quiet", Icon: VolumeX, label: "Quiet ride" },
      mission.flight_number && { key: "flight", Icon: Plane, label: "Flight" },
    ].filter(Boolean) as { key: string; Icon: LucideIcon; label: string }[]
  );
  const shownServices = services.slice(0, 3);
  const moreServices = services.length - shownServices.length;

  // Route rail legs: pickup → [+N stops] → drop-off. An at-disposal trip has no
  // fixed drop-off, so it's the pickup alone.
  type Leg = { kind: "from" | "stop" | "to"; text: string };
  const legs: Leg[] = [{ kind: "from", text: addressLine(mission.pickup_address) }];
  if (stops > 0) legs.push({ kind: "stop", text: `+${stops}` });
  if (!isHourly && mission.dropoff_address) {
    legs.push({ kind: "to", text: addressLine(mission.dropoff_address) });
  }

  return (
    <Link href={`/missions/${mission.id}`} className="pcard">
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
          {/* docs/06 §4 — a 22:00-06:00 pickup is priced at the card's night
              multiplier. The Driver was never told either, so the better fare
              on a late run read as luck. Named, not numbered: the multiplier
              lives on the rate card, not on the mission. */}
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
                    `proute__addr proute__addr--${leg.kind}` + (last ? "" : " proute__addr--pad")
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
        {shownServices.length > 0 && (
          <span className="pcard__reqs">
            {shownServices.map(({ key, Icon, label }) => (
              <Icon key={key} size={16} strokeWidth={1.75} role="img" aria-label={label} />
            ))}
            {moreServices > 0 && (
              <span
                className="pcard__more"
                aria-label={`${moreServices} more request${moreServices === 1 ? "" : "s"}`}
              >
                +{moreServices}
              </span>
            )}
          </span>
        )}
      </div>
    </Link>
  );
}
