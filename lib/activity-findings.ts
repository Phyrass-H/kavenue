// The named checks behind Activity's "Worth a look".
//
// ⚑ NAMED CHECKS, NOT ANOMALY DETECTION — and that is a decision, not a
// shortcut. At nine Drivers and roughly ten trips a day there is no baseline to
// be anomalous against, so "anything unusual" fires on everything and gets
// ignored within a week. Each check below is one specific known-bad shape,
// phrased as a sentence a human can read and act on. If a check cannot be
// written as such a sentence, it does not belong here.
//
// Two rules from the founder, both load-bearing:
//   • SILENT BY DEFAULT. A check that finds nothing emits nothing. There is no
//     "0 problems" row, and no green tick to scan past.
//   • THE NAMED THING, NOT A COUNT. Every finding carries the Driver, hotel or
//     trip it is about, so nothing is ever reported as a bare number. Where a
//     check fires on many subjects the SCREEN may group them into one line —
//     but it groups named findings; it never counts anonymous ones.
import type { DriverRow, MissionRow } from "@/lib/database.types";

export type FindingId =
  | "trip_nobody_can_take"
  | "driver_without_base"
  | "driver_unverified"
  | "cancelled_without_record"
  | "trip_passed_around"
  | "orphaned_events";

/** How loudly it reads. `quiet` is background truth, not a problem to solve. */
export type FindingTone = "attention" | "watch" | "quiet";

/**
 * ⚑ TYPE-KEYED, so a new check cannot be added without saying what it looks for
 * and what a person is supposed to do about it. (D86/D87/D90 were all a branch
 * nobody could see; a hand-written list is exactly how that happens.)
 */
export const CHECKS: Record<FindingId, { looksFor: string; tone: FindingTone }> = {
  trip_nobody_can_take: {
    looksFor: "A pooled trip that not one Driver in the fleet is able to take.",
    tone: "attention",
  },
  driver_without_base: {
    looksFor: "A Driver with no base, whose Pool is therefore always empty.",
    tone: "attention",
  },
  driver_unverified: {
    looksFor: "A Driver you have not verified — which stops nothing today.",
    tone: "watch",
  },
  cancelled_without_record: {
    // ⚑ QUIET, AND DELIBERATELY NOT ONE ROW PER TRIP. All of these pre-date the
    // recording and can never be filled in, so there is nothing to act on trip
    // by trip — naming 23 of them would be a wall of history dressed up as a
    // to-do list. The number only ever shrinks as they age out.
    looksFor: "Cancelled trips from before Kavenue recorded who cancelled them.",
    tone: "quiet",
  },
  trip_passed_around: {
    looksFor: "A trip taken and given back more than once — usually the trip's fault.",
    tone: "watch",
  },
  orphaned_events: {
    looksFor: "Log entries whose trip has since been deleted.",
    tone: "quiet",
  },
};

export interface Finding {
  id: FindingId;
  /**
   * ⚑ UNIQUE PER FINDING, AND NOT THE SUBJECT. Route labels repeat — the live DB
   * has four separate trips all called "Le Grand Hôtel → Monaco" — so keying a
   * list on `subject` made React warn that rows "may be duplicated and/or
   * omitted". A findings screen that silently drops a finding is the one failure
   * it cannot have.
   */
  key: string;
  tone: FindingTone;
  /** The named thing this is about — never blank, never a number. */
  subject: string;
  /** One sentence, complete on its own. */
  sentence: string;
  /** Where the proof lives. */
  href: string | null;
}

export interface ActivitySnapshot {
  /** Pooled, future trips, each with how many Drivers can actually take it. */
  pooled: {
    mission: Pick<MissionRow, "id" | "pickup_at" | "pickup_label" | "dropoff_label" | "category">;
    takers: number;
    /** Why nobody can, when nobody can — one sentence from lib/eligibility. */
    reason: string | null;
  }[];
  drivers: Pick<DriverRow, "id" | "first_name" | "last_name" | "base_lat" | "base_lng" | "verified">[];
  /** Cancelled trips carrying no row in `mission_cancellation`. */
  cancelledWithoutRecord: Pick<MissionRow, "id" | "pickup_label" | "dropoff_label" | "cancelled_at">[];
  /** Trips whose log holds two or more `repooled` entries. */
  passedAround: { id: string; label: string; times: number }[];
  /** Log entries pointing at a mission row that no longer exists. */
  orphanedEvents: number;
}

/** "27 Aug, 18:54" — the last resort identity for a trip with no route labels. */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "undated"
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      });
}

const nameOf = (d: { first_name: string | null; last_name: string | null }) =>
  `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "A Driver";

/** "Cannes → Antibes", falling back to something a person can still recognise. */
export function tripLabel(
  m: Pick<MissionRow, "pickup_label" | "dropoff_label">,
  fallback = "this trip",
): string {
  // ⚑ `?? fallback` is not enough: "".trim() is a STRING, so it satisfies `??`
  // and renders a blank label. Empty must become undefined before the fallback.
  const from = m.pickup_label?.trim() || undefined;
  const to = m.dropoff_label?.trim() || undefined;
  return from && to ? `${from} → ${to}` : (from ?? to ?? fallback);
}

/**
 * Run every check. Order is the order they are read in: what is broken now,
 * then what will bite later, then background truth.
 */
export function findings(s: ActivitySnapshot): Finding[] {
  const out: Finding[] = [];
  const push = (
    id: FindingId,
    key: string,
    subject: string,
    sentence: string,
    href: string | null,
  ) => out.push({ id, key: `${id}:${key}`, tone: CHECKS[id].tone, subject, sentence, href });

  for (const p of s.pooled) {
    if (p.takers > 0) continue;
    // ⚑ Two of the three trips in the live Pool were seeded and carry NO route
    // labels, so "A pooled trip" appeared twice and identified neither. When
    // there is no route to name, name the moment — every trip has one.
    const label = tripLabel(p.mission, `the ${whenLabel(p.mission.pickup_at)} trip`);
    push(
      "trip_nobody_can_take",
      p.mission.id,
      label,
      // The reason comes from the same module the "why" button uses, so the
      // headline and the detail can never disagree.
      p.reason
        ? `Nobody in the fleet can take ${label} — ${p.reason}.`
        : `Nobody in the fleet can take ${label}.`,
      `/admin/trips/${p.mission.id}`,
    );
  }

  for (const d of s.drivers) {
    if (d.base_lat != null && d.base_lng != null) continue;
    push(
      "driver_without_base",
      d.id,
      nameOf(d),
      `${nameOf(d)} has never set a base, so their Pool has always been empty.`,
      `/admin/drivers/${d.id}`,
    );
  }

  for (const d of s.drivers) {
    if (d.verified) continue;
    push(
      "driver_unverified",
      d.id,
      nameOf(d),
      `${nameOf(d)} isn’t verified, and can accept work anyway.`,
      `/admin/drivers/${d.id}`,
    );
  }

  if (s.cancelledWithoutRecord.length > 0) {
    const n = s.cancelledWithoutRecord.length;
    push(
      "cancelled_without_record",
      "all",
      "Cancelled trips",
      `${n} cancelled ${n === 1 ? "trip doesn’t" : "trips don’t"} say who cancelled ${
        n === 1 ? "it" : "them"
      }, or why — they pre-date the recording and can’t be filled in.`,
      null,
    );
  }

  for (const t of s.passedAround) {
    push(
      "trip_passed_around",
      t.id,
      t.label,
      `${t.label} has been taken and given back ${t.times} times.`,
      `/admin/trips/${t.id}`,
    );
  }

  // ⚑ The one check with no named subject, because its subject was deleted.
  // `mission_event` has no foreign key to `mission` on purpose — the log
  // outlives the trip — so removing a trip strands its history
  // (2026-08-24_mission_event_log.sql:78). Reported quietly: it is a fact about
  // the log, not a problem anyone is meant to fix.
  if (s.orphanedEvents > 0) {
    push(
      "orphaned_events",
      "all",
      "The log",
      `${s.orphanedEvents.toLocaleString("fr-FR")} entries in the log describe a trip that no longer exists.`,
      null,
    );
  }

  return out;
}

/** What the footer says is quiet. Only ever names checks that ran and found nothing. */
export function quietChecks(s: ActivitySnapshot, fired: Finding[]): string[] {
  const firedIds = new Set(fired.map((f) => f.id));
  const quiet: string[] = [];
  if (!firedIds.has("trip_passed_around"))
    quiet.push("no trip has been taken and given back twice");
  if (!firedIds.has("driver_unverified")) quiet.push("every Driver is verified");
  if (!firedIds.has("trip_nobody_can_take") && s.pooled.length > 0)
    quiet.push("every trip in the Pool has someone who could take it");
  return quiet;
}
