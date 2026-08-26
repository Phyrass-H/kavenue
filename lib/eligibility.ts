// "Why can't this Driver take this trip?" — the rules, re-run and named.
//
// ⚑ THIS MODULE ANSWERS A QUESTION; IT DOES NOT DECIDE ANYTHING. Nothing in the
// app or the Pool imports it to gate work. It exists so an admin can ask why a
// Driver never saw a trip, or why their accept bounced, and get the actual rule
// back instead of a shrug. The authorities it mirrors are:
//
//   • REFUSALS — `accept_mission` (docs/migrations/2026-08-22_accepted_fare.sql:67).
//     SECURITY DEFINER SQL. A Driver can see the trip, tap Accept, and be turned
//     down. These raise.
//   • LISTING — the Pool query (app/(app)/pool/page.tsx). App-side. These do not
//     refuse anything; they decide whether the trip is ever SHOWN. A Driver
//     blocked only here never knew the trip existed.
//
// The two are deliberately not the same set, and the difference is the whole
// point of splitting them: § B made the SQL a strict superset of the listing, so
// drift can only ever hide a trip, never refuse one the Pool offered. An admin
// reading "refused" and an admin reading "never seen it" are looking at two
// different problems, and a single "not eligible" would hide that.
//
// ⚑ AND TWO THINGS KAVENUE RECORDS ABOUT EVERY DRIVER DECIDE NOTHING (2026-08-26).
//    `driver.operational_zones` — the towns a Driver says they work — is read by
//    no code path in the app or the schema; the Pool matches on base + radius
//    (lib/geo.ts), which is the spine's rule ("matching is by location, not a
//    town list"). `driver.verified` is rendered once, on the Driver's own
//    settings page, and gates nothing: an unverified Driver can accept work
//    today. Both are reported as `decides-nothing` rather than omitted, because
//    a console that silently left them out would let a reader assume they matter.
import { haversineKm, withinRadius } from "@/lib/geo";
import { carMatches } from "@/lib/vehicle-catalog";
import type { DriverRow, VehicleRow, MissionRow } from "@/lib/database.types";

/** Every rule that can stand between a Driver and a trip. */
export type EligibilityRuleId =
  // enforced in accept_mission — these REFUSE
  | "still_pooled"
  | "not_past_due"
  | "vehicle_class"
  | "vehicle_body"
  | "luggage_opt_in"
  | "slot_free"
  // enforced by the Pool query — these HIDE
  | "has_base"
  | "within_radius"
  | "specific_car";

/**
 * What a failure means. Not cosmetic: "refuse" is SQL turning an accept down,
 * "hide" is the trip never appearing. Never collapse them into one word.
 */
export type RuleKind = "refuse" | "hide";

/**
 * ⚑ TYPE-KEYED, SO A NEW RULE CANNOT BE ADDED WITHOUT DESCRIBING IT.
 * `Record<EligibilityRuleId, …>` makes the compiler demand a row for every id;
 * a hand-written array would let one be forgotten, which is exactly how a rule
 * that fires becomes a rule nobody can see (D86, D87, D90).
 */
export const RULES: Record<EligibilityRuleId, { kind: RuleKind; passed: string }> = {
  still_pooled: { kind: "refuse", passed: "The trip is still in the Pool" },
  not_past_due: { kind: "refuse", passed: "Its pickup time hasn’t passed" },
  vehicle_class: { kind: "refuse", passed: "Their car is the class asked for" },
  vehicle_body: { kind: "refuse", passed: "No particular body type is required" },
  luggage_opt_in: { kind: "refuse", passed: "Not a luggage-only run" },
  slot_free: { kind: "refuse", passed: "Nothing else booked within 90 minutes" },
  has_base: { kind: "hide", passed: "They have a base set" },
  within_radius: { kind: "hide", passed: "Inside the distance they’ll drive" },
  specific_car: { kind: "hide", passed: "No specific car was asked for" },
};

export interface RuleResult {
  id: EligibilityRuleId;
  kind: RuleKind;
  ok: boolean;
  /** One sentence. When it failed, it says what failed — not the rule's name. */
  says: string;
  /** The value behind it, for the reader who wants the number. */
  detail: string | null;
}

/** Recorded about the Driver, consulted by nothing. See the header. */
export interface DecidesNothing {
  says: string;
  /** The stored value, when there is one worth reading. Never restates `says`. */
  detail: string | null;
}

export interface Eligibility {
  rules: RuleResult[];
  decidesNothing: DecidesNothing[];
  /** The first failure, in the order a person would meet it. Null = can take it. */
  blocker: RuleResult | null;
  /** One sentence, answering the question that was asked. */
  answer: string;
  verdict: "can_take" | "refused" | "never_seen";
}

const CLASS_LABEL: Record<string, string> = {
  eco: "Eco",
  business: "Business",
  luxury: "First",
};
const classLabel = (c: string | null | undefined) => (c ? (CLASS_LABEL[c] ?? c) : "—");

/** The ±90 min window accept_mission blocks on, and the statuses it counts. */
export const SLOT_WINDOW_MINUTES = 90;
export const SLOT_BLOCKING_STATUSES = [
  "accepted",
  "confirmed",
  "en_route",
  "arrived",
  "on_board",
] as const;

export interface EligibilityInput {
  mission: Pick<
    MissionRow,
    | "status"
    | "pickup_at"
    | "category"
    | "required_body_type"
    | "required_make"
    | "required_model"
    | "luggage_only"
    | "pickup_lat"
    | "pickup_lng"
    | "dropoff_lat"
    | "dropoff_lng"
  >;
  driver: Pick<
    DriverRow,
    | "first_name"
    | "last_name"
    | "accepts_luggage_runs"
    | "base_lat"
    | "base_lng"
    | "base_label"
    | "service_radius_km"
    | "verified"
    | "operational_zones"
  >;
  vehicle: Pick<VehicleRow, "category" | "body_type" | "make" | "model"> | null;
  /** The Driver's other live trips — pickup times only. Empty = no clash. */
  otherPickupsAt: string[];
  now?: Date;
}

/**
 * Re-run every rule. Order matters: it is the order a person meets them —
 * is the trip takeable at all, is the car right, is the Driver reachable.
 */
export function explainEligibility(input: EligibilityInput): Eligibility {
  const { mission: m, driver: d, vehicle: v } = input;
  const now = input.now ?? new Date();
  const name = `${d.first_name} ${d.last_name}`.trim();
  const rules: RuleResult[] = [];

  const add = (
    id: EligibilityRuleId,
    ok: boolean,
    failSays: string,
    detail: string | null,
  ) =>
    rules.push({
      id,
      kind: RULES[id].kind,
      ok,
      says: ok ? RULES[id].passed : failSays,
      detail,
    });

  add(
    "still_pooled",
    m.status === "pooled",
    m.status === "draft"
      ? "the trip has never been posted"
      : `the trip is no longer in the Pool — it is ${m.status}`,
    m.status,
  );

  const pastDue = Date.parse(m.pickup_at) <= now.getTime();
  add("not_past_due", !pastDue, "its pickup time has already passed", null);

  // accept_mission checks the Driver's vehicle rows; no car on file is a refusal
  // there too (the `not exists` finds nothing), so it is one here.
  const classOk = !!v && v.category === m.category;
  add(
    "vehicle_class",
    classOk,
    v
      ? `their car is ${classLabel(v.category)}, and this trip asks for ${classLabel(m.category)}`
      : "they have no car on file",
    v ? [v.make, v.model].filter(Boolean).join(" ") || classLabel(v.category) : null,
  );

  const bodyOk = !m.required_body_type || (!!v && m.required_body_type === v.body_type);
  add(
    "vehicle_body",
    bodyOk,
    `this trip needs a ${m.required_body_type}, and their car is a ${v?.body_type ?? "—"}`,
    m.required_body_type ?? null,
  );

  const lugOk = !m.luggage_only || !!d.accepts_luggage_runs;
  add(
    "luggage_opt_in",
    lugOk,
    "this is a luggage-only run, and they haven’t opted into those",
    m.luggage_only ? "luggage only" : null,
  );

  const clash = input.otherPickupsAt.find((t) => {
    const gap = Math.abs(Date.parse(t) - Date.parse(m.pickup_at));
    return Number.isFinite(gap) && gap <= SLOT_WINDOW_MINUTES * 60_000;
  });
  add(
    "slot_free",
    !clash,
    "they already have another trip within 90 minutes of this pickup",
    clash ? "clash" : null,
  );

  const based = d.base_lat != null && d.base_lng != null;
  add(
    "has_base",
    based,
    "they have never set a base, so their Pool is empty",
    based ? (d.base_label ?? "base set") : "no base",
  );

  // The Pool accepts a trip whose pickup OR dropoff is in range, so the distance
  // worth quoting is the nearer of the two.
  const radius = d.service_radius_km ?? 50;
  if (based) {
    const inRange =
      withinRadius(d.base_lat!, d.base_lng!, radius, m.pickup_lat, m.pickup_lng) ||
      withinRadius(d.base_lat!, d.base_lng!, radius, m.dropoff_lat, m.dropoff_lng);
    const km = nearestKm(d.base_lat!, d.base_lng!, m);
    add(
      "within_radius",
      inRange,
      km == null
        ? "the trip has no coordinates, so it can’t be matched to anyone"
        : `it is ${Math.round(km)} km from their base, and they drive up to ${radius} km`,
      km == null ? "no coordinates" : `${Math.round(km)} of ${radius} km`,
    );
  } else {
    add("within_radius", false, "distance can’t be measured without a base", null);
  }

  const carOk =
    !m.required_make ||
    !m.required_model ||
    (!!v && carMatches(v.make ?? "", v.model ?? "", m.required_make, m.required_model));
  add(
    "specific_car",
    carOk,
    `this trip asks for a ${m.required_make} ${m.required_model}`,
    m.required_make && m.required_model ? `${m.required_make} ${m.required_model}` : null,
  );

  // Refusals first: a Driver who would be refused has a harder problem than one
  // who merely wasn't shown it, and that is the answer they need.
  const blocker =
    rules.find((r) => !r.ok && r.kind === "refuse") ?? rules.find((r) => !r.ok) ?? null;

  const verdict: Eligibility["verdict"] =
    blocker == null ? "can_take" : blocker.kind === "refuse" ? "refused" : "never_seen";

  const answer =
    verdict === "can_take"
      ? `Yes — ${name} can take this trip.`
      : verdict === "refused"
        ? `No — ${name} would be refused.`
        : `No — ${name} has never been shown it.`;

  return {
    rules,
    blocker,
    verdict,
    answer,
    decidesNothing: [
      {
        says: "Towns they say they work",
        detail: (d.operational_zones ?? []).join(", ") || "none set",
      },
      // No detail: the row already ends "— never consulted", and repeating it
      // read as "Verified by you — never consulted · never consulted".
      { says: d.verified ? "Verified by you" : "Not verified by you", detail: null },
    ],
  };
}

/** Straight-line km from a base to the nearer end of the trip. Null if unlocated. */
export function nearestKm(
  baseLat: number,
  baseLng: number,
  m: Pick<MissionRow, "pickup_lat" | "pickup_lng" | "dropoff_lat" | "dropoff_lng">,
): number | null {
  const ends: number[] = [];
  if (m.pickup_lat != null && m.pickup_lng != null)
    ends.push(haversineKm(baseLat, baseLng, m.pickup_lat, m.pickup_lng));
  if (m.dropoff_lat != null && m.dropoff_lng != null)
    ends.push(haversineKm(baseLat, baseLng, m.dropoff_lat, m.dropoff_lng));
  return ends.length ? Math.min(...ends) : null;
}

/** The sentence under the answer: why, in the reader's words. */
export function becauseOf(e: Eligibility): string {
  if (!e.blocker) return "It is in their Pool right now, and nothing would stop them accepting it.";
  const because = `Because ${e.blocker.says}.`;
  return e.blocker.kind === "refuse"
    ? `${because} Kavenue would turn the acceptance down.`
    : `${because} Nothing refuses them — the trip just never appears in their Pool.`;
}
