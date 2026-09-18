import { notFound } from "next/navigation";
import type { MissionRow } from "@/lib/database.types";
import { DispatchShell } from "@/components/dispatch-shell";
import { TripRow } from "@/components/trip-row";
import type { CeilingRaiseBrief } from "@/lib/ceiling-raise";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceFor, RATE_CARD_COLS, type RateCardRow } from "@/lib/rate-card";
import { commissionSplit, courseFromBusinessTotal } from "@/lib/commission";
import type { ServiceTier, BodyType } from "@/lib/vehicle-catalog";
import { OpenAll } from "./open-all";

// S83 PREVIEW — the "At your Ceiling" message and the raise control, rendered by the REAL
// schedule row (components/trip-row.tsx) with the real CSS, on made-up trips. Nothing here
// reads or writes the database; confirming a raise saves nothing and says so.
// ⚑ DEV ONLY: a hosted build answers 404, exactly like /dev-login without its key.

export const dynamic = "force-dynamic";

const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

// docs/06 §1 — 12,5 % HT + 20 % VAT on the fee: a €100 Course is €115 to the Business.
const RATES = { commission_business_rate: 0.125, commission_driver_rate: 0.1, commission_vat_rate: 0.2 };

function trip(o: Partial<MissionRow> & Pick<MissionRow, "id" | "pickup_at" | "created_at">): MissionRow {
  return {
    business_id: "preview",
    dispatcher_id: "preview",
    driver_id: null,
    status: "pooled",
    mission_type: "transfer",
    group_id: null,
    category: "business",
    zone: null,
    pickup_lat: null,
    pickup_lng: null,
    dropoff_lat: null,
    dropoff_lng: null,
    pickup_label: null,
    dropoff_label: null,
    waypoints: null,
    stops_reached: 0,
    flight_number: null,
    flight_eta: null,
    guest_ready_at: null,
    passenger_names: null,
    pax_count: 2,
    luggage_count: 2,
    luggage_only: false,
    comment: null,
    reference: null,
    base_fare: null,
    ceiling: 100,
    pdp_start: 60,
    pdp_step: null,
    pdp_interval: null,
    speed_win: false,
    required_body_type: "sedan",
    required_make: null,
    required_model: null,
    required_languages: null,
    dress_code: null,
    driver_flags: null,
    board_name: null,
    board_file_path: null,
    driver_message: null,
    distance_km: 24.6,
    duration_min: 32,
    rate_card_id: null,
    night_applied: false,
    ...RATES,
    transport_vat_rate: null,
    standard_vat_rate: 0.2,
    cancelled_by: null,
    cancelled_at: null,
    accepted_at: null,
    accepted_fare: null,
    confirmed_at: null,
    checked_in_at: null,
    close_answer: null,
    close_answered_at: null,
    info_edited_at: null,
    cancellation_fee: null,
    cancellation_reason: null,
    pooled_at: null,
    no_show: false,
    no_show_at: null,
    no_show_by: null,
    waiting_from: null,
    waiting_to: null,
    waiting_minutes: null,
    waiting_rate: null,
    waiting_fee: null,
    ...o,
  } as MissionRow;
}

// The trips' own saved rates, as the Business sees them (12,5 % HT + 20 % VAT on the fee).
const R = { businessHt: 0.125, driverHt: 0.1, feeVat: 0.2 };
const allIn = (course: number) => commissionSplit(course, R).businessTotal;

export default async function RaiseCeilingPreview() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) notFound();

  // The REAL rate card, read-only, so every price here is one Kavenue would quote. The only
  // read on this page; a failed read hides "Change the car" and nothing else.
  const { data: cardRows } = await createAdminClient().from("rate_card").select(RATE_CARD_COLS);
  const rateCard = (cardRows ?? []) as unknown as RateCardRow[];

  // A fixture priced like a real post: the market Ceiling (times `factor`) and the floor.
  const priced = (tier: ServiceTier, body: BodyType | null, km: number, factor = 1) => {
    const q = priceFor(rateCard, tier, body, km);
    if (!q) return {};
    return {
      ceiling: courseFromBusinessTotal(Math.round(q.ceiling * factor * 100) / 100, R),
      pdp_start: courseFromBusinessTotal(q.floor, R),
    };
  };
  const raisedFrom = priced("business", "sedan", 24.6);
  const raisedTo = priced("business", "sedan", 24.6, 1.2);

  const now = Date.now();
  const rows = [
    {
      note: "Still climbing — “Raise the Ceiling” and “Change the car” are tiles beside “Edit details”, open at any time.",
      mission: trip({
        ...priced("business", "sedan", 24.6),
        id: "preview-climbing-0001",
        pickup_at: iso(now + 9 * H),
        created_at: iso(now - 6 * H),
        pickup_address: "37 Promenade des Anglais, 06000 Nice, France",
        dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 2, 06200 Nice, France",
        passenger_name: "M. Laurent",
        reference: "R-2041",
      }),
    },
    {
      note: "Booked three weeks ahead — the climb hasn’t started, so a raise lifts the top, not today’s price.",
      mission: trip({
        id: "preview-far-ahead-0006",
        ...priced("business", "sedan", 24.6),
        pickup_at: iso(now + 21 * 24 * H),
        created_at: iso(now - 2 * H),
        pickup_address: "8 Avenue de Verdun, 06000 Nice, France",
        dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 1, 06200 Nice, France",
        passenger_name: "Ms Lindqvist",
      }),
    },
    {
      note: "Your trigger — the price reached the Ceiling and nobody has taken it.",
      mission: trip({
        id: "preview-at-ceiling-0002",
        ...priced("business", "sedan", 24.6),
        pickup_at: iso(now + 4.5 * H),
        created_at: iso(now - 18 * H),
        pickup_address: "12 Boulevard de la Croisette, 06400 Cannes, France",
        dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 1, 06200 Nice, France",
        passenger_name: "Mme Keller",
        flight_number: "LX 563",
      }),
    },
    {
      note: "Inside 3 hours — the pill says “No Driver yet” as today; the advice stays.",
      mission: trip({
        id: "preview-within-3h-0003",
        ...priced("business", "sedan", 24.6),
        pickup_at: iso(now + 2 * H),
        created_at: iso(now - 20 * H),
        pickup_address: "Place du Casino, 98000 Monaco",
        dropoff_address: "Gare de Nice-Ville, Avenue Thiers, 06000 Nice, France",
        passenger_name: "Mr Okafor",
      }),
    },
    {
      note: "No Driver in the fleet can take it — a different message, and no raise.",
      nobodyCanTake: true,
      mission: trip({
        id: "preview-no-match-0004",
        pickup_at: iso(now + 6 * H),
        created_at: iso(now - 3 * H),
        category: "luxury",
        required_make: "Mercedes-Benz",
        required_model: "Classe S",
        ...priced("luxury", "sedan", 102),
        pickup_address: "Quai des États-Unis, 06300 Nice, France",
        dropoff_address: "Place des Lices, 83990 Saint-Tropez, France",
        passenger_name: "Mrs Hartley",
        distance_km: 102,
        duration_min: 95,
      }),
    },
    {
      note: "After a raise — the new Ceiling on the row, and who raised it, from what, when.",
      raises: [
        {
          at: iso(now - 40 * 60_000),
          from: allIn(raisedFrom.ceiling ?? 0),
          to: allIn(raisedTo.ceiling ?? 0),
          by: "Camille Martin",
        },
      ] as CeilingRaiseBrief[],
      mission: trip({
        id: "preview-raised-0005",
        pickup_at: iso(now + 7 * H),
        created_at: iso(now - 5 * H),
        ...raisedTo,
        pdp_start: raisedFrom.pdp_start,
        pickup_address: "5 Rue de France, 06000 Nice, France",
        dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 2, 06200 Nice, France",
        passenger_name: "M. Rossi",
      }),
    },
  ];

  return (
    <DispatchShell businessName="Preview Business">
      <OpenAll />
      <div className="notice" style={{ marginBottom: 14 }}>
        <strong>Preview · S83 — raise the Ceiling, change the car.</strong> Made-up trips, rendered
        by the real schedule row, priced with the real rate card. Nothing is saved.
      </div>
      <div className="dx-sched">
        <div className="dx-colhead">
          <span>Time</span>
          <span>Route</span>
          <span>Flight</span>
          <span>Guest</span>
          <span>Ref</span>
          <span>Driver</span>
          <span>Fare</span>
          <span>Status</span>
        </div>
        {rows.map((r, i) => (
          <section key={r.mission.id}>
            {/* Not a .dx-day band: that one title-cases its text for dates. */}
            <p className="muted small" style={{ margin: 0, padding: "14px 16px 6px" }}>
              <strong>{i + 1}.</strong> {r.note}
            </p>
            <TripRow
              mission={r.mission}
              showRaise
              // The fleet check's answer: in the build it is computed server-side; here
              // every row but the no-match one says "a Driver could take this".
              nobodyCanTake={r.nobodyCanTake ?? false}
              ceilingRaises={r.raises ?? null}
              rateCard={rateCard}
              showDate
            />
          </section>
        ))}
      </div>
    </DispatchShell>
  );
}
