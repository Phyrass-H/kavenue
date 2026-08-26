// A list of trips, the way all four console screens show one: banded by day or
// by month, honest about what it isn't showing, and — on a hotel's own page —
// carrying only the far end of each journey.
//
// ⚑ ONE COMPONENT BECAUSE THERE IS ONE LIST. Trips, a hotel's trips and a
// Driver's trips were three near-identical blocks of JSX; the bands and the
// page footer would have been written three times and drifted twice.
//
// Server component on purpose — it renders Links and nothing interactive.
import Link from "next/link";
import { farLeg, byDay, type Band, type PageNote } from "@/lib/admin-list";
import { tripLabel, whenLabel } from "@/lib/activity-findings";
import {
  formatDate,
  formatMonth,
  formatMoney,
  formatShortDay,
  formatTime,
  missionStatusLabel,
  shortPlaceLabel,
} from "@/lib/format";
import type { MissionStatus } from "@/lib/database.types";

export interface AdminTripRow {
  id: string;
  pickup_at: string;
  ceiling: number | null;
  status: MissionStatus;
  pickup_label: string | null;
  dropoff_label: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
}

/** The place a page is written from — a hotel's own address. */
export interface Anchor {
  lat: number | null;
  lng: number | null;
}

export function AdminTripList({
  rows,
  anchor = null,
  note,
  pageHref,
  empty,
  band = "day",
}: {
  rows: readonly AdminTripRow[];
  anchor?: Anchor | null;
  note: PageNote | null;
  pageHref: (page: number) => string;
  empty: string;
  /** See lib/admin-list Band — one trip a day needs months, not days. */
  band?: Band;
}) {
  if (rows.length === 0) return <p className="adm-none">{empty}</p>;

  return (
    <>
      {byDay(rows, (r) => r.pickup_at, band).map((day) => (
        <div key={day.key}>
          <div className="adm-day">
            <h3>{band === "day" ? formatDate(`${day.key}T12:00:00`) : formatMonth(day.key)}</h3>
          </div>
          {day.rows.map((t) => {
            // ⚑ The seeded trips carry no route labels, so the short labels are
            // derived from the stored addresses — otherwise a row names one end
            // of the journey and leaves off the other.
            const from = {
              label: t.pickup_label ?? shortPlaceLabel(t.pickup_address),
              lat: t.pickup_lat,
              lng: t.pickup_lng,
            };
            const to = {
              label: t.dropoff_label ?? shortPlaceLabel(t.dropoff_address),
              lat: t.dropoff_lat,
              lng: t.dropoff_lng,
            };
            const leg = farLeg(
              from,
              to,
              anchor,
              tripLabel(
                { pickup_label: from.label, dropoff_label: to.label },
                whenLabel(t.pickup_at),
              ),
            );
            return (
              <Link key={t.id} href={`/admin/trips/${t.id}`} className="adm-row">
                {/* A day band carries the date, so the row shows the time alone
                    — the page ends up with less text on it, not more. Under a
                    month band the row has to say which day it is, but still
                    drops the weekday the old row carried. */}
                <span className="adm-row__when">
                  {band === "day"
                    ? formatTime(t.pickup_at)
                    : `${formatShortDay(t.pickup_at)} · ${formatTime(t.pickup_at)}`}
                </span>
                <span className="adm-row__name">
                  {leg.at !== "neither" && (
                    <span className="adm-leg" aria-hidden="true">
                      {leg.at === "start" ? "→" : "←"}
                    </span>
                  )}
                  {/* An arrow alone is read out unpredictably; the word is not. */}
                  {leg.at !== "neither" && (
                    <span className="sr-only">{leg.at === "start" ? "to " : "from "}</span>
                  )}
                  {leg.label}
                </span>
                <span className="adm-row__side">{formatMoney(t.ceiling)}</span>
                <span className="adm-row__kind">{missionStatusLabel(t.status)}</span>
              </Link>
            );
          })}
        </div>
      ))}
      {note && (
        <div className="adm-page">
          <span>{note.says}</span>
          <span className="adm-page__go">
            {note.newer !== null && <Link href={pageHref(note.newer)}>← Newer</Link>}
            {note.older !== null && <Link href={pageHref(note.older)}>Older →</Link>}
          </span>
        </div>
      )}
    </>
  );
}
