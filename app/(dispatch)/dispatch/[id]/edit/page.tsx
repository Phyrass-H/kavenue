import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/app-context";
import {
  parseGuestContacts,
  parsePassengers,
  mergeContacts,
  splitFullName,
  VAN_SEATS,
  type Passenger,
} from "@/lib/passengers";
import { parseLanguages, parseDriverFlags } from "@/lib/driver-service";
import { parseWaypoints } from "@/lib/waypoints";
import { SERVICE_TIERS, type ServiceTier } from "@/lib/vehicle-catalog";
import { canEditInfo, isExpired, missionTone, TONE_BG, TONE_COLOR } from "@/lib/dispatch-status";
import { settledFare } from "@/lib/pdp";
import { commissionSplit, businessRatesOf } from "@/lib/commission";
import { addressLine, formatDateTime, formatMoney, serviceClassLabel } from "@/lib/format";
import { EditMissionForm } from "./edit-form";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  locked:
    "This trip can no longer be edited — a Driver may have started it, its pickup time may have passed, or it was cancelled.",
  db: "Couldn’t save your changes. Please try again.",
  missing: "Something went wrong. Please try again.",
};

export default async function EditMissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await getAppContext();
  if (!ctx.business) return null;

  const supabase = await createClient();
  // RLS scopes reads to this Business; the extra .eq is defence-in-depth.
  const { data: mission } = await supabase
    .from("mission_read")
    .select("*")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .neq("status", "draft") // drafts are edited via the new-mission resume flow
    .maybeSingle();
  if (!mission) notFound();

  // Guest phones (Driver-unreadable side table) — load so the edit form re-fills them.
  const { data: gc } = await supabase
    .from("mission_guest_contact")
    .select("contacts")
    .eq("mission_id", mission.id)
    .maybeSingle();
  const contacts = parseGuestContacts(gc?.contacts ?? []);

  const t = missionTone(mission);
  const editable = canEditInfo(mission);
  const waypoints = parseWaypoints(mission.waypoints);

  // Seed passenger rows exactly as the new-mission form does on draft resume:
  // structured names merged with side-table phones, else a legacy single name,
  // padded to the stored headcount, bounded to the largest vehicle.
  const merged = mergeContacts(parsePassengers(mission.passenger_names), contacts);
  const base: Passenger[] =
    merged.length > 0
      ? merged
      : mission.passenger_name
        ? [splitFullName(mission.passenger_name)]
        : [];
  const target = Math.min(Math.max(base.length, Number(mission.pax_count) || 0), VAN_SEATS);
  const seedPassengers: Passenger[] | undefined =
    target > 0
      ? Array.from({ length: target }, (_, i) => base[i] ?? { first: "", last: "", phone: "" })
      : undefined;

  const tier: ServiceTier = (SERVICE_TIERS as string[]).includes(mission.category)
    ? (mission.category as ServiceTier)
    : "business";

  return (
    <div className="ex-wrap">
      <div className="ex-head">
        <h1 style={{ margin: 0 }}>Edit trip details</h1>
        <Link href="/dispatch" className="ex-back">
          ← Back to schedule
        </Link>
      </div>
      <p className="muted" style={{ margin: "4px 0 16px" }}>
        Update the info a Driver sees. This never changes the price, route or time.
      </p>

      {error && ERROR_COPY[error] && (
        <div className="notice error" style={{ marginBottom: 14 }}>
          {ERROR_COPY[error]}
        </div>
      )}

      {/* Read-only trip context — the trip as agreed. Not editable here. */}
      <div className="card ex-lock">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div className="route" style={{ flex: 1, minWidth: 0 }}>
            <div className="leg">
              <span className="dot" />
              <span>{addressLine(mission.pickup_address)}</span>
            </div>
            {waypoints.map((w, i) => (
              <div className="leg leg--stop" key={i}>
                <span className="dot mid" />
                <span className="leg-addr muted">{addressLine(w.address)}</span>
              </div>
            ))}
            <div className="leg">
              <span className="dot end" />
              <span>{mission.dropoff_address ? addressLine(mission.dropoff_address) : "—"}</span>
            </div>
          </div>
          <span
            className="status-pill"
            style={{ background: TONE_BG[t.tone], color: TONE_COLOR[t.tone] }}
          >
            <span className="dot" style={{ background: TONE_COLOR[t.tone] }} />
            {t.label}
          </span>
        </div>
        <div className="ex-meta">
          <span>{formatDateTime(mission.pickup_at)}</span>
          {/* ALL IN, both of them — the stored fare and Ceiling are Course-basis
              and this header sits beside figures that already convert. */}
          <span>
            Fare <b>{formatMoney(commissionSplit(settledFare(mission), businessRatesOf(mission)).businessTotal)}</b> ·
            ceiling {formatMoney(commissionSplit(Number(mission.ceiling), businessRatesOf(mission)).businessTotal)}
          </span>
          <span>
            {serviceClassLabel(mission.category, mission.required_body_type)}
            {mission.luggage_only ? " · Luggage run" : ""}
          </span>
        </div>
        <div className="ex-locknote">
          <span aria-hidden>🔒</span>
          <span>
            <strong>Route, time and price stay as agreed.</strong> To change the destination or add a
            stop, the assigned Driver has to approve it — that’s a separate flow (coming soon), not this
            screen.
          </span>
        </div>
      </div>

      {editable ? (
        <EditMissionForm
          missionId={mission.id}
          luggageOnly={!!mission.luggage_only}
          tier={tier}
          body={mission.required_body_type ?? ""}
          seedPassengers={seedPassengers}
          initialPrimaryName={mission.passenger_name ?? ""}
          flightNumber={mission.flight_number}
          luggageCount={mission.luggage_count}
          reference={mission.reference}
          serviceDefaults={{
            languages: parseLanguages(mission.required_languages),
            dressCode: mission.dress_code,
            flags: parseDriverFlags(mission.driver_flags),
            boardName: mission.board_name,
            driverMessage: mission.driver_message,
            hasBoardFile: !!mission.board_file_path,
          }}
        />
      ) : (
        <div className="notice info">
          {isExpired(mission) ? (
            <>
              This trip can’t be edited anymore — its pickup time passed with no Driver, so it’s
              unfilled. Post a new trip if the Guest still needs a car.
            </>
          ) : (
            <>
              This trip can’t be edited anymore — it’s already {t.label.toLowerCase()}. Trip details
              are frozen once a Driver starts the run or the trip is finished.
            </>
          )}
        </div>
      )}
    </div>
  );
}
