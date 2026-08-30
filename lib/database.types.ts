// =====================================================================
// Kavenue — database.types.ts
// HAND-WRITTEN from docs/kavenue_schema.sql (Decision D3). The schema is ALREADY
// APPLIED to the live Supabase DB — never recreate or migrate it. This file
// only mirrors it so our TypeScript is type-safe. If the Supabase CLI gets
// wired up later, regenerate with `supabase gen types` to confirm parity.
// Glossary (Doc 00): Business · Dispatcher · Driver · Guest · Pool · PDP ·
// Ceiling · SPEED WIN. Never "client" / "principal".
//
// NOTE: each table carries `Relationships: []` and the schema carries
// `CompositeTypes` so this satisfies supabase-js's GenericSchema constraint
// (otherwise the typed client collapses every row to `never`). We don't model
// FK relationships for typed joins in V1 — `[]` is intentional.
// =====================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------- ENUMS ----------
export type UserRole = "driver" | "dispatcher" | "admin";
// vehicle_category is the SERVICE TIER. 'van' is legacy (migrated to
// business+body=van on 2026-06-19); tiers offered now: eco/business/luxury.
export type VehicleCategory = "eco" | "business" | "van" | "luxury";
export type BodyType = "sedan" | "van";
export type MissionType = "transfer" | "hourly";
export type MissionStatus =
  | "draft"
  | "pooled"
  | "accepted"
  | "confirmed"
  | "en_route"
  | "arrived"
  | "on_board"
  | "completed"
  | "cancelled"
  | "expired";
export type CancellationParty = "driver" | "business" | "system";
// mission_cancellation.kind is a text CHECK — docs/migrations/2026-07-22_waiting_fee.sql:78.
// 'business_no_show' is what business_declare_no_show writes (the Business stops
// the wait itself rather than the Driver reporting it).
export type CancellationKind =
  | "driver_cancel"
  | "business_cancel"
  | "no_show"
  | "business_no_show"
  // Renamed from `t60_reclaim` on 2026-08-24 (D86) — it fires at T−2h now, and
  // the table held 0 rows, so the old name could be corrected for free.
  | "reclaim"
  | "agreed_release";
export type DocumentType =
  | "drivers_licence"
  | "vtc_card"
  | "revtc"
  | "insurance"
  | "rc_pro"
  | "vehicle_registration"
  | "company_registration"
  // Added 2026-07-28 (S48): a Driver is a company, and Kavenue is the donneur d'ordre.
  | "kbis"
  | "urssaf_vigilance"
  | "medical_certificate";
export type DocumentStatus = "pending" | "verified" | "rejected";
// Two-sided papers (licence, VTC card) file one row per side; everything else is null.
export type DocumentSide = "front" | "back";
export type PaymentStatus = "requires_capture" | "captured" | "refunded" | "failed";

// mission_amendment.status is a text CHECK (Phase-2 edit / consent flow, D39):
// proposed → accepted | declined, or superseded when the Business replaces it.
export type AmendmentStatus = "proposed" | "accepted" | "declined" | "superseded";

// mission_release.status mirrors the amendment lifecycle (O7 agreed release, D45):
// proposed → accepted | declined, or superseded when replaced/pre-empted by a cancel.
export type ReleaseStatus = "proposed" | "accepted" | "declined" | "superseded";

// status_event.status is a text CHECK, not the mission_status enum. Full set per
// docs/migrations/2026-07-31_expired_missions.sql:44 — the four steps a Driver
// taps, plus four written only by SECURITY DEFINER RPCs and the § P sweep.
export type StatusEventStatus =
  | "en_route"
  | "arrived"
  | "on_board"
  | "completed"
  | "cancelled"
  | "no_show"
  | "repooled"
  | "expired";

/**
 * The subset a DRIVER can advance to by tapping — the linear execution flow.
 * Kept separate from StatusEventStatus so `advanceStatus` still refuses
 * "cancelled" at compile time while the status_event Row can tell the truth.
 */
export type MissionStep = Extract<
  StatusEventStatus,
  "en_route" | "arrived" | "on_board" | "completed"
>;
export type PreferredGps = "waze" | "google" | "apple";
/**
 * § Q — the Driver's answer to "what happened to this trip?", asked once it is
 * past its expected end and still open. `driven` also moves the trip to
 * `completed`; `not_driven` settles nothing and hands the question to the
 * Business. Mirrors the CHECK in 2026-08-10_mission_close_answer.sql.
 */
export type CloseAnswer = "driven" | "not_driven";

// A single waypoint (mission.waypoints jsonb). Shape is app-defined.
export interface Waypoint {
  address: string;
  lat?: number | null;
  lng?: number | null;
}

/** One row of a breakdown returned by admin_business_overview(). Counts only —
 *  the percentage is rendered by lib/admin-businesses, never computed in SQL, so
 *  a thin sample cannot claim a rate. */
export interface AdminBusinessRollupRow {
  key: string | null;
  /** For a city: the region it sits in, or null outside France. */
  parent: string | null;
  businesses: number;
  trips: number;
  settled: number;
  filled: number;
}

export interface AdminBusinessOverview {
  /** ⚑ NOT period-scoped: how many exist today. Looking at May must not make
   *  Businesses that have since signed up disappear from the count. */
  businesses: number;
  /** Trips posted inside the chosen period — all time when none is chosen. */
  trips: number;
  /** ⚑ NOT period-scoped either: never posted EVER. Inside July it would mean
   *  "did not post in July", which jumps around as you step through months. */
  never_posted: number;
  /** Median trips among Businesses that have posted at all; null when none have. */
  median_trips: number | null;
  posting_businesses: number;
  by_type: AdminBusinessRollupRow[];
  by_region: AdminBusinessRollupRow[];
  by_city: AdminBusinessRollupRow[];
}

/** ⚑ `count(*)` and `max()` come back from PostgREST as numbers, but bigint is
 *  serialised as a JS number only up to 2^53 — fine for a marketplace, and the
 *  page still coerces with Number() so a string would not silently render NaN. */
export interface AdminBusinessPageRow {
  id: string;
  name: string;
  business_type: string | null;
  city: string | null;
  region: string | null;
  trips: number;
  unfilled: number;
  last_posted: string | null;
  /** The unpaged total, riding along so the page note can never lie. */
  total_count: number;
}

export interface AdminDriverRollupRow {
  key: string | null;
  /** For a class row: the body type, so "Business · Sedan" is one line. */
  parent: string | null;
  drivers: number;
  /** ⚑ taken/finished, not settled/filled — every trip a Driver holds was
   *  accepted by that same Driver, so the Businesses pair would be ~100 %
   *  on every row. The Driver-side question is whether the work gets done. */
  taken: number;
  finished: number;
}

export interface AdminDriverOverview {
  /** ⚑ NOT period-scoped: how many Drivers exist today. */
  drivers: number;
  /** Trips taken inside the chosen period — all time when none is chosen. */
  taken: number;
  /** ⚑ NOT period-scoped: never took one EVER. */
  never_took: number;
  without_base: number;
  median_trips: number | null;
  working_drivers: number;
  /** ⚑ The honest denominator: a NULL gender is "never asked", not an answer. */
  gender_answered: number;
  by_class: AdminDriverRollupRow[];
  by_make: AdminDriverRollupRow[];
  by_gender: AdminDriverRollupRow[];
}

export interface AdminDriverPageRow {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  verified: boolean;
  base_label: string | null;
  service_radius_km: number | null;
  category: string | null;
  body_type: string | null;
  make: string | null;
  model: string | null;
  trips: number;
  /** Accepted but not completed — the fleet list's third state (S69). */
  held_unfinished: number;
  last_took: string | null;
  total_count: number;
}

export interface Database {
  public: {
    Tables: {
      profile: {
        Row: { auth_user_id: string; role: UserRole; created_at: string };
        Insert: { auth_user_id: string; role: UserRole; created_at?: string };
        Update: { auth_user_id?: string; role?: UserRole; created_at?: string };
        Relationships: [];
      };
      // S71 — things that happen to a Business ACCOUNT rather than to a trip.
      // Best-effort (source='app'): it may prove an event happened, never that
      // one did not. Trip events live in mission_event, trigger-guaranteed.
      business_event: {
        Row: {
          id: string;
          seq: number;
          business_id: string;
          dispatcher_id: string | null;
          event_type: string;
          occurred_at: string;
          actor_auth_user_id: string | null;
          source: string;
          payload: Json;
        };
        Insert: {
          id?: string;
          seq?: number;
          business_id: string;
          dispatcher_id?: string | null;
          event_type: string;
          occurred_at?: string;
          actor_auth_user_id?: string | null;
          source?: string;
          payload?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["business_event"]["Insert"]>;
        Relationships: [];
      };
      business: {
        Row: {
          id: string;
          name: string;
          field_of_activity: string | null; // legacy free-text (superseded by business_type)
          logo_url: string | null;
          stripe_customer_id: string | null;
          // Company identity (2026-06-28 migration) — human-verified off the Kbis.
          business_type: string | null;
          legal_name: string | null;
          siret: string | null;
          vat_number: string | null;
          registered_address: string | null;
          reception_phone: string | null;
          // Booking defaults. business_address = the Business's own address (used on
          // either end); prefill_pickup = auto-fill it into a new mission's pickup.
          business_address: string | null;
          business_address_lat: number | null;
          business_address_lng: number | null;
          business_address_label: string | null;
          prefill_pickup: boolean;
          default_vehicle_category: string | null;
          default_booking_notes: string | null; // legacy (Guest-instructions field removed)
          // Billing (storable now; Stripe deferred).
          billing_email: string | null;
          // The French register (2026-08-30 migration). Filled by the sign-up
          // lookup against recherche-entreprises.api.gouv.fr; ALL nullable and
          // staying that way — Monaco is not in the register, and one of the four
          // Businesses on the platform is the Metropole Monte-Carlo.
          naf_code: string | null; // raw NAF/APE, e.g. 55.10Z — the fact behind business_type
          city: string | null; // INSEE commune label, e.g. NICE
          departement: string | null; // INSEE code, e.g. 06
          region: string | null; // INSEE code, e.g. 93
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          field_of_activity?: string | null;
          logo_url?: string | null;
          stripe_customer_id?: string | null;
          business_type?: string | null;
          legal_name?: string | null;
          siret?: string | null;
          vat_number?: string | null;
          registered_address?: string | null;
          reception_phone?: string | null;
          business_address?: string | null;
          business_address_lat?: number | null;
          business_address_lng?: number | null;
          business_address_label?: string | null;
          prefill_pickup?: boolean;
          default_vehicle_category?: string | null;
          default_booking_notes?: string | null;
          billing_email?: string | null;
          naf_code?: string | null;
          city?: string | null;
          departement?: string | null;
          region?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["business"]["Insert"]>;
        Relationships: [];
      };
      dispatcher: {
        Row: {
          id: string;
          business_id: string;
          auth_user_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          auth_user_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["dispatcher"]["Insert"]>;
        Relationships: [];
      };
      driver: {
        Row: {
          id: string;
          auth_user_id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          profile_photo_url: string | null;
          languages: string[];
          operational_zones: string[];
          base_label: string | null;
          base_lat: number | null;
          base_lng: number | null;
          service_radius_km: number;
          accepts_luggage_runs: boolean; // opted in to bags-only Van runs (Sujet B, Phase 1)
          preferred_gps: PreferredGps | null;
          stripe_account_id: string | null;
          verified: boolean;
          reliability_marks: number; // O7 (D45): running count of cancel / no-confirm marks
          // S71 — optional, self-declared, and consulted by NOTHING that decides
          // anything. woman | man | other | undisclosed. NULL means never asked,
          // which is a different fact from 'undisclosed' (asked, declined).
          gender: string | null;
          // S48 — the Driver's company identity (they invoice as one). Payouts stay Stripe's job.
          company_name: string | null;
          siret: string | null;
          vat_number: string | null;
          // S72 — what the Waybill prints as the EXPLOITANT (2026-08-31a). Fields 1° and 2°
          // of the arrêté du 6 août 2025; SIREN (3°) is left(siret, 9). ⚑ revtc_number is the
          // NUMBER — the document of type 'revtc' is only a scan and cannot be printed.
          revtc_number: string | null;
          registered_address: string | null;
          pro_card_number: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          first_name: string;
          last_name: string;
          phone?: string | null;
          email?: string | null;
          profile_photo_url?: string | null;
          languages?: string[];
          operational_zones?: string[];
          base_label?: string | null;
          base_lat?: number | null;
          base_lng?: number | null;
          service_radius_km?: number;
          accepts_luggage_runs?: boolean;
          preferred_gps?: PreferredGps | null;
          stripe_account_id?: string | null;
          verified?: boolean;
          reliability_marks?: number;
          gender?: string | null;
          company_name?: string | null;
          siret?: string | null;
          vat_number?: string | null;
          revtc_number?: string | null;
          registered_address?: string | null;
          pro_card_number?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["driver"]["Insert"]>;
        Relationships: [];
      };
      vehicle: {
        Row: {
          id: string;
          driver_id: string;
          category: VehicleCategory;
          body_type: BodyType;
          make: string | null;
          model: string | null;
          colour: string | null;
          plate: string | null;
          seats: number | null;
          is_active: boolean; // S48 — a paused car stops pulling trips (one car today)
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          category: VehicleCategory;
          body_type?: BodyType;
          make?: string | null;
          model?: string | null;
          colour?: string | null;
          plate?: string | null;
          seats?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vehicle"]["Insert"]>;
        Relationships: [];
      };
      document: {
        Row: {
          id: string;
          owner_type: "driver" | "business";
          owner_id: string;
          type: DocumentType;
          file_url: string;
          status: DocumentStatus;
          expires_at: string | null;
          side: DocumentSide | null; // S48 — front/back for two-sided papers
          review_note: string | null; // S48 — why a document was rejected
          vehicle_id: string | null; // S48 — carte grise / insurance belong to a car
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          owner_type: "driver" | "business";
          owner_id: string;
          type: DocumentType;
          file_url: string;
          status?: DocumentStatus;
          expires_at?: string | null;
          side?: DocumentSide | null;
          review_note?: string | null;
          vehicle_id?: string | null;
          uploaded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["document"]["Insert"]>;
        Relationships: [];
      };
      mission: {
        Row: {
          id: string;
          business_id: string;
          dispatcher_id: string;
          driver_id: string | null;
          status: MissionStatus;
          mission_type: MissionType;
          group_id: string | null;
          category: VehicleCategory;
          zone: string | null;
          pickup_address: string;
          pickup_lat: number | null;
          pickup_lng: number | null;
          dropoff_address: string | null;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          pickup_label: string | null;
          dropoff_label: string | null;
          waypoints: Json | null;
          stops_reached: number; // count of intermediate stops the Driver has marked reached
          pickup_at: string;
          flight_number: string | null;
          flight_eta: string | null;
          guest_ready_at: string | null; // O7: tracked instant the Guest became available (flight landed); overrides pickup_at as the no-show wait origin. Null until flight tracking lands.
          passenger_name: string | null;
          passenger_names: Json | null;
          pax_count: number | null;
          luggage_count: number | null;
          luggage_only: boolean; // bags-only run, no passengers, carried in a Van (Sujet B, Phase 1)
          comment: string | null;
          reference: string | null;
          base_fare: number | null;
          ceiling: number;
          pdp_start: number | null;
          pdp_step: number | null;
          pdp_interval: number | null;
          speed_win: boolean;
          required_body_type: BodyType | null;
          required_make: string | null;
          required_model: string | null;
          required_languages: string[] | null;
          dress_code: string | null;
          driver_flags: Json | null;
          board_name: string | null;
          board_file_path: string | null;
          driver_message: string | null;
          distance_km: number | null;
          duration_min: number | null;
          // docs/06 §9 snapshot: which rate_card generation produced the pre-filled
          // ceiling, and whether the 22:00-06:00 x1.20 applied. Never re-resolve a
          // past price through the live card. (2026-08-16 migration.)
          rate_card_id: string | null;
          night_applied: boolean;
          // docs/06 §9 snapshot: the commission rates as they stood when this
          // mission was created, and the VAT the assigned Driver actually
          // charges. NULL rates mean created BEFORE commission shipped — no fee
          // was ever billed, so render one amount and no breakdown. NULL
          // transport rate means no Driver has taken it yet. (2026-08-17.)
          commission_business_rate: number | null;
          commission_driver_rate: number | null;
          commission_vat_rate: number | null;
          transport_vat_rate: number | null;
          cancelled_by: CancellationParty | null;
          cancelled_at: string | null;
          created_at: string;
          accepted_at: string | null;
          // docs/06 §9 — the PDP fare FROZEN at acceptance, in Course space.
          // Written by accept_mission from a number the SERVER computed with
          // lib/pdp.ts; cleared on re-pool, after pdp_start has been raised to
          // it so the trip can never re-open below a price a Driver already
          // agreed to. NULL = never accepted, or accepted before the 2026-08-22
          // migration — readers recompute the curve, exactly as they always did.
          accepted_fare: number | null;
          confirmed_at: string | null;
          checked_in_at: string | null; // D61: Driver confirmed they'll be there (opens T-180). 2026-07-30 migration
          close_answer: CloseAnswer | null; // § Q: the Driver's answer to "what happened?". 2026-08-10 migration
          close_answered_at: string | null; // § Q: when they answered — also what clears the flag
          info_edited_at: string | null; // set by updateMissionInfo on an info-only edit (2026-07-05 migration)
          cancellation_fee: number | null; // O7 (D45): euro basis at cancel — MANUAL settle
          cancellation_reason: string | null; // O7
          pooled_at: string | null; // O7: PDP climb origin for a RE-POOLED mission
          no_show: boolean; // O7: Guest didn't show → Driver paid like a completed mission
          no_show_at: string | null; // O7
          no_show_by: "driver" | "business" | "system" | null; // D48: who declared it
          // D48 waiting fee — settled outcome. Business owes it, Driver is paid it (a
          // pass-through, NOT a Kavenue penalty). MANUAL settlement in beta.
          waiting_from: string | null; // meter start = guest due + courtesy wait
          waiting_to: string | null; // meter stop = least(settled, guest due + ceiling)
          waiting_minutes: number | null; // minutes STARTED, clamped by the ceiling
          waiting_rate: number | null; // €/min pinned for this row (rate is PROVISIONAL)
          waiting_fee: number | null; // waiting_minutes * waiting_rate
          // S72 — the car that was actually on this trip, stamped by accept_mission
          // (2026-08-31b/c). NULL = accepted before that migration: readers fall back to
          // the Driver's current car. ⚑ Gate on driver_id — a re-pool leaves this set.
          vehicle_id: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          dispatcher_id: string;
          driver_id?: string | null;
          status?: MissionStatus;
          mission_type?: MissionType;
          group_id?: string | null;
          category: VehicleCategory;
          zone?: string | null;
          pickup_address: string;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          dropoff_address?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          pickup_label?: string | null;
          dropoff_label?: string | null;
          waypoints?: Json | null;
          stops_reached?: number;
          pickup_at: string;
          flight_number?: string | null;
          flight_eta?: string | null;
          guest_ready_at?: string | null; // O7: see Row
          passenger_name?: string | null;
          passenger_names?: Json | null;
          pax_count?: number | null;
          luggage_count?: number | null;
          luggage_only?: boolean;
          comment?: string | null;
          reference?: string | null;
          base_fare?: number | null;
          ceiling: number;
          pdp_start?: number | null;
          pdp_step?: number | null;
          pdp_interval?: number | null;
          speed_win?: boolean;
          required_body_type?: BodyType | null;
          required_make?: string | null;
          required_model?: string | null;
          required_languages?: string[] | null;
          dress_code?: string | null;
          driver_flags?: Json | null;
          board_name?: string | null;
          board_file_path?: string | null;
          driver_message?: string | null;
          distance_km?: number | null;
          duration_min?: number | null;
          rate_card_id?: string | null;
          night_applied?: boolean;
          commission_business_rate?: number | null;
          commission_driver_rate?: number | null;
          commission_vat_rate?: number | null;
          transport_vat_rate?: number | null;
          cancelled_by?: CancellationParty | null;
          cancelled_at?: string | null;
          created_at?: string;
          accepted_at?: string | null;
          accepted_fare?: number | null;
          confirmed_at?: string | null;
          checked_in_at?: string | null;
          close_answer?: CloseAnswer | null;
          close_answered_at?: string | null;
          info_edited_at?: string | null;
          cancellation_fee?: number | null;
          cancellation_reason?: string | null;
          pooled_at?: string | null;
          no_show?: boolean;
          no_show_at?: string | null;
          no_show_by?: "driver" | "business" | "system" | null; // D48
          waiting_from?: string | null; // D48: see Row
          waiting_to?: string | null;
          waiting_minutes?: number | null;
          waiting_rate?: number | null;
          waiting_fee?: number | null;
          vehicle_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["mission"]["Insert"]>;
        Relationships: [];
      };
      mission_cancellation: {
        Row: {
          id: string;
          mission_id: string;
          business_id: string;
          party: CancellationParty;
          actor_driver_id: string | null;
          kind: CancellationKind;
          reason: string | null;
          fee_pct: number | null;
          fee_amount: number | null;
          fare_snapshot: number | null;
          hours_before_pickup: number | null;
          // D48 settlement, written by all three fee doors (2026-07-22_waiting_fee.sql:72).
          waiting_minutes: number | null;
          waiting_rate: number | null;
          waiting_fee: number | null;
          resulted_in: "repooled" | "terminal";
          created_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          business_id: string;
          party: CancellationParty;
          actor_driver_id?: string | null;
          kind: CancellationKind;
          reason?: string | null;
          fee_pct?: number | null;
          fee_amount?: number | null;
          fare_snapshot?: number | null;
          hours_before_pickup?: number | null;
          waiting_minutes?: number | null;
          waiting_rate?: number | null;
          waiting_fee?: number | null;
          resulted_in: "repooled" | "terminal";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["mission_cancellation"]["Insert"]>;
        Relationships: [];
      };
      mission_guest_contact: {
        Row: {
          mission_id: string;
          contacts: Json;
          updated_at: string;
        };
        Insert: {
          mission_id: string;
          contacts?: Json;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["mission_guest_contact"]["Insert"]
        >;
        Relationships: [];
      };
      // Kavenue's recommended price per class (docs/06 §4). Read-only to the app:
      // RLS grants select to `authenticated` and there is NO write policy, so a
      // re-tune is an INSERT in the SQL editor with a later effective_from — never
      // an UPDATE, so a priced mission keeps pointing at the row that priced it.
      // (2026-08-16 migration.)
      rate_card: {
        Row: {
          id: string;
          market: string;
          tier: VehicleCategory;
          body: BodyType | null; // null = covers any body
          effective_from: string;
          floor_base: number;
          floor_per_km: number;
          ceiling_base: number;
          ceiling_per_km: number;
          ceiling_per_km_long: number;
          long_threshold_km: number;
          night_multiplier: number;
          note: string | null;
          created_at: string;
        };
        Insert: never; // deny-by-default: no client write policy exists
        Update: never;
        Relationships: [];
      };
      // What Kavenue takes (docs/06 §1). ONE row: the rates never vary by
      // Business, event, time or zone (§0). Read-only to the app for the same
      // reason as rate_card — re-rating is an INSERT with a later
      // effective_from, and every mission keeps the rates snapshot onto it.
      // (2026-08-17 migration.)
      commission_rate: {
        Row: {
          id: string;
          effective_from: string;
          business_rate_ht: number; // 0.125 — on top of the Course
          driver_rate_ht: number; // 0.10 — deducted from it
          fee_vat_rate: number; // 0.20 — VAT on Kavenue's fee
          transport_vat_rate: number; // 0.10 — what a VAT-registered Driver charges
          note: string | null;
          created_at: string;
        };
        Insert: never; // deny-by-default: no client write policy exists
        Update: never;
        Relationships: [];
      };
      // Phase-2 mission edit (D39): a proposed change to an ACCEPTED mission's
      // route + fare, awaiting the assigned Driver's consent. The audit trail; the
      // atomic apply is the respond_to_amendment RPC. (2026-07-07 migration.)
      mission_amendment: {
        Row: {
          id: string;
          mission_id: string;
          business_id: string;
          proposed_by: string | null;
          status: AmendmentStatus;
          new_pickup_address: string;
          new_pickup_lat: number | null;
          new_pickup_lng: number | null;
          new_pickup_label: string | null;
          new_dropoff_address: string | null;
          new_dropoff_lat: number | null;
          new_dropoff_lng: number | null;
          new_dropoff_label: string | null;
          new_waypoints: Json | null;
          new_distance_km: number | null;
          new_duration_min: number | null;
          new_fare: number;
          from_snapshot: Json;
          note: string | null;
          decline_reason: string | null;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          mission_id: string;
          business_id: string;
          proposed_by?: string | null;
          status?: AmendmentStatus;
          new_pickup_address: string;
          new_pickup_lat?: number | null;
          new_pickup_lng?: number | null;
          new_pickup_label?: string | null;
          new_dropoff_address?: string | null;
          new_dropoff_lat?: number | null;
          new_dropoff_lng?: number | null;
          new_dropoff_label?: string | null;
          new_waypoints?: Json | null;
          new_distance_km?: number | null;
          new_duration_min?: number | null;
          new_fare: number;
          from_snapshot: Json;
          note?: string | null;
          decline_reason?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["mission_amendment"]["Insert"]>;
        Relationships: [];
      };
      // Mutual-consent AGREED RELEASE (O7, D45): the Business proposes a free release
      // of a committed Driver; the Driver must accept (respond_to_release RPC) before
      // the trip re-pools. An append-only evidence trail — declines are retained, a
      // Business only HIDES a resolved request (dismissed_at). ALL writes go through the
      // propose/respond/close SECURITY DEFINER RPCs (no client write policy).
      // (2026-07-19 migration.)
      mission_release: {
        Row: {
          id: string;
          mission_id: string;
          business_id: string;
          driver_id: string | null;
          proposed_by: string | null;
          status: ReleaseStatus;
          note: string | null;
          decline_reason: string | null;
          from_fare: number | null; // computed fare at propose-time (dispute context)
          hours_before_pickup: number | null; // server-computed at propose-time (the "inside the fee window?" signal)
          dismissed_at: string | null; // Business hid a RESOLVED request from its schedule (evidence preserved)
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          mission_id: string;
          business_id: string;
          driver_id?: string | null;
          proposed_by?: string | null;
          status?: ReleaseStatus;
          note?: string | null;
          decline_reason?: string | null;
          from_fare?: number | null;
          hours_before_pickup?: number | null;
          dismissed_at?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["mission_release"]["Insert"]>;
        Relationships: [];
      };
      // Detail-edit change-log (D40 follow-up): one row per "Edit details" save,
      // recording WHAT info changed (human phrases). Business-private side table —
      // Drivers have no RLS policy on it. (2026-07-10 migration.)
      mission_info_change: {
        Row: {
          id: string;
          mission_id: string;
          business_id: string;
          edited_by: string | null;
          items: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          business_id: string;
          edited_by?: string | null;
          items?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["mission_info_change"]["Insert"]
        >;
        Relationships: [];
      };
      // § AG — the Event Log (2026-08-24 migration). Append-only: never UPDATE,
      // never DELETE. `source` is the column that makes it honest — only
      // 'db_trigger' rows are guaranteed complete. `seq` and `occurred_at` are
      // written by the DB and must not be supplied, which is why neither appears
      // in Insert. The vocabulary lives in lib/mission-events.ts, not in a CHECK:
      // a constraint on a log aborts the transaction it exists to record.
      mission_event: {
        Row: {
          id: string;
          seq: number;
          mission_id: string;
          business_id: string | null;
          driver_id: string | null;
          event_type: string;
          occurred_at: string;
          actor_kind: "dispatcher" | "driver" | "admin" | "system" | "unknown";
          actor_auth_user_id: string | null;
          actor_id: string | null;
          audience: string[];
          source:
            | "db_trigger"
            | "client_rpc"
            | "app"
            | "status_event_backfill"
            | "mission_row_backfill";
          payload: Json;
          dedupe_key: string | null;
        };
        Insert: {
          id?: string;
          mission_id: string;
          business_id?: string | null;
          driver_id?: string | null;
          event_type: string;
          actor_kind?: "dispatcher" | "driver" | "admin" | "system" | "unknown";
          actor_auth_user_id?: string | null;
          actor_id?: string | null;
          audience?: string[];
          source: string;
          payload?: Json;
          dedupe_key?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["mission_event"]["Insert"]>;
        Relationships: [];
      };
      // Reference vocabulary for mission_event. A table, not a constraint —
      // documentation and a join target for analysis. Nothing enforces it.
      mission_event_type: {
        Row: {
          event_type: string;
          captured_by: string;
          guaranteed: boolean;
          note: string | null;
        };
        Insert: {
          event_type: string;
          captured_by: string;
          guaranteed?: boolean;
          note?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["mission_event_type"]["Insert"]
        >;
        Relationships: [];
      };
      status_event: {
        Row: {
          id: string;
          mission_id: string;
          status: StatusEventStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          status: StatusEventStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["status_event"]["Insert"]>;
        Relationships: [];
      };
      payment: {
        Row: {
          id: string;
          mission_id: string;
          stripe_payment_intent_id: string | null;
          amount: number | null;
          status: PaymentStatus;
          captured_at: string | null;
        };
        Insert: {
          id?: string;
          mission_id: string;
          stripe_payment_intent_id?: string | null;
          amount?: number | null;
          status?: PaymentStatus;
          captured_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payment"]["Insert"]>;
        Relationships: [];
      };
      ledger_transaction: {
        Row: {
          id: string;
          mission_id: string;
          gross_fare: number;
          commission_pct: number;
          commission_amount: number;
          driver_net: number;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          gross_fare: number;
          commission_pct: number;
          commission_amount: number;
          driver_net: number;
          currency?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ledger_transaction"]["Insert"]>;
        Relationships: [];
      };
      payout: {
        Row: {
          id: string;
          driver_id: string;
          period_start: string;
          period_end: string;
          amount: number;
          status: string;
          stripe_transfer_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          period_start: string;
          period_end: string;
          amount: number;
          status?: string;
          stripe_transfer_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payout"]["Insert"]>;
        Relationships: [];
      };
      booking_voucher: {
        Row: {
          id: string;
          mission_id: string;
          voucher_number: string;
          pdf_url: string | null;
          generated_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          voucher_number: string;
          pdf_url?: string | null;
          generated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["booking_voucher"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // Kavenue's price for a trip (docs/06 §4), from the rate_card table. The
      // authority: the server calls this with its OWN road distance so a browser
      // can never post a price it invented. lib/rate-card.ts is the mirror copy
      // the form uses to pre-fill; tests/rate-card.test.ts pins them together.
      mission_price: {
        Args: {
          p_tier: VehicleCategory;
          p_body?: BodyType | null;
          p_km?: number;
          p_night?: boolean;
          p_market?: string;
        };
        Returns: { rate_card_id: string; floor_price: number; ceiling_price: number }[];
      };
      // Both sides of one Course (docs/06 §1, §3). The VAT lines are remainders
      // so a rendered invoice always adds up. lib/commission.ts is the mirror,
      // and .local/probe/commission-parity.ts holds the pair to the cent.
      commission_split: {
        Args: {
          p_course: number;
          p_business_rate_ht: number;
          p_driver_rate_ht: number;
          p_fee_vat_rate: number;
        };
        Returns: {
          business_total: number;
          business_fee_ht: number;
          business_fee_vat: number;
          driver_net: number;
          driver_fee_ht: number;
          driver_fee_vat: number;
        }[];
      };
      // The VAT inside a TTC Course, at the Driver's own rate — 0 under
      // franchise en base (docs/06 §3).
      transport_vat: {
        Args: { p_course: number; p_rate: number };
        Returns: number;
      };
      // Atomic accept + slot-conflict + Lock-in, server-side (Doc spine).
      // The Driver PWA calls: rpc('accept_mission', { p_mission_id, p_fare }).
      // ⚑ p_fare is computed ON THE SERVER by lib/pdp.ts — the browser sends only a
      // mission id, so there is nothing to forge — and is clamped into
      // [floor, ceiling] in SQL anyway. Optional: omitting it stores NULL and every
      // reader falls back to recomputing the curve (2026-08-22 migration).
      accept_mission: {
        Args: { p_mission_id: string; p_fare?: number | null };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      // Driver's consent to a proposed amendment (Phase-2 edit, D39). Atomic +
      // SECURITY DEFINER, like accept_mission. Accept applies the new route+fare;
      // decline leaves the mission untouched. rpc('respond_to_amendment', {...}).
      respond_to_amendment: {
        Args: { p_amendment_id: string; p_accept: boolean; p_reason?: string | null };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      // O7 cancellation spine (D45). SECURITY DEFINER + atomic, resolving the caller
      // via current_driver_id()/current_business_id(); each returns the mission Row.
      driver_cancel_mission: {
        Args: { p_mission_id: string; p_reason?: string | null; p_fare_snapshot: number };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      business_cancel_mission: {
        Args: { p_mission_id: string; p_reason?: string | null; p_fare_snapshot: number };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      reclaim_mission: {
        Args: { p_mission_id: string };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      mark_no_show: {
        Args: { p_mission_id: string; p_fare_snapshot: number };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      // D48: the Business's "stop waiting, the Guest isn't coming" — the same terminal
      // outcome as mark_no_show, declared from the other side. Gated to status='arrived'
      // and to the courtesy wait having elapsed, so it can't be a cheap early cancel.
      business_declare_no_show: {
        Args: { p_mission_id: string; p_fare_snapshot: number };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      // arrived → on_board, settling the waiting meter on the way (D48; founder
      // 2026-08-09). The FOURTH settlement door and the only one on a trip that
      // actually happens — before it existed, a late Guest who then boarded cost
      // nobody anything and a Driver was better off filing a no-show.
      // 2026-08-09_waiting_settles_on_board.sql
      board_guest: {
        Args: { p_mission_id: string };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      // Mutual-consent agreed release (O7, D45). All SECURITY DEFINER + atomic,
      // mirroring respond_to_amendment / driver_cancel_mission. propose_release
      // (Business) + close_release (Business withdraw/dismiss) return the release Row;
      // respond_to_release (Driver accept/decline) re-pools on accept + returns the mission.
      propose_release: {
        Args: {
          p_mission_id: string;
          p_note?: string | null;
          p_from_fare?: number | null;
          p_proposed_by?: string | null;
        };
        Returns: Database["public"]["Tables"]["mission_release"]["Row"];
      };
      respond_to_release: {
        Args: { p_release_id: string; p_accept: boolean; p_reason?: string | null };
        Returns: Database["public"]["Tables"]["mission"]["Row"];
      };
      close_release: {
        Args: { p_release_id: string };
        Returns: Database["public"]["Tables"]["mission_release"]["Row"];
      };
      // § P — the expiry sweep: pooled + past due -> expired, idempotent, and
      // returns how many it closed. SECURITY DEFINER, so an ordinary session can
      // call it; we do, on the Pool + Dispatch schedule reads, instead of a cron.
      expire_stale_missions: { Args: Record<PropertyKey, never>; Returns: number };
      app_role: { Args: Record<PropertyKey, never>; Returns: UserRole };
      current_driver_id: { Args: Record<PropertyKey, never>; Returns: string };
      current_business_id: { Args: Record<PropertyKey, never>; Returns: string };
      // S71 — the Businesses screen's arithmetic, done in SQL so 25 000 rows
      // never cross the wire. Both SECURITY INVOKER: RLS decides what the caller
      // may count, and only an admin may count everything.
      // docs/migrations/2026-08-30_admin_business_rollup.sql
      // ⚑ NULL period = all time, which is the default every screen opens with.
      admin_business_overview: {
        Args: { p_from?: string | null; p_to?: string | null };
        Returns: AdminBusinessOverview;
      };
      admin_business_page: {
        Args: {
          p_type?: string | null;
          p_region?: string | null;
          p_city?: string | null;
          p_limit?: number;
          p_offset?: number;
          p_from?: string | null;
          p_to?: string | null;
        };
        Returns: AdminBusinessPageRow[];
      };
      // S71 — the Drivers screen's twin. ⚑ admin_driver_overview reads
      // driver.gender, so 2026-08-30_driver_gender.sql must be applied first.
      admin_driver_overview: {
        Args: { p_from?: string | null; p_to?: string | null };
        Returns: AdminDriverOverview;
      };
      admin_driver_page: {
        Args: {
          p_category?: string | null;
          p_body?: string | null;
          p_make?: string | null;
          p_gender?: string | null;
          p_limit?: number;
          p_offset?: number;
          p_from?: string | null;
          p_to?: string | null;
        };
        Returns: AdminDriverPageRow[];
      };
    };
    Enums: {
      user_role: UserRole;
      vehicle_category: VehicleCategory;
      body_type: BodyType;
      mission_type: MissionType;
      mission_status: MissionStatus;
      cancellation_party: CancellationParty;
      document_type: DocumentType;
      document_status: DocumentStatus;
      payment_status: PaymentStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

// ---------- Convenience row aliases ----------
export type MissionRow = Database["public"]["Tables"]["mission"]["Row"];
export type MissionAmendmentRow = Database["public"]["Tables"]["mission_amendment"]["Row"];
export type MissionInfoChangeRow = Database["public"]["Tables"]["mission_info_change"]["Row"];
export type MissionCancellationRow = Database["public"]["Tables"]["mission_cancellation"]["Row"];
export type MissionReleaseRow = Database["public"]["Tables"]["mission_release"]["Row"];
export type DriverRow = Database["public"]["Tables"]["driver"]["Row"];
export type VehicleRow = Database["public"]["Tables"]["vehicle"]["Row"];
export type DispatcherRow = Database["public"]["Tables"]["dispatcher"]["Row"];
export type BusinessRow = Database["public"]["Tables"]["business"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profile"]["Row"];
