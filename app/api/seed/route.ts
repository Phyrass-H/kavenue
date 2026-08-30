// DEV-ONLY seeding. Creates a Business + Dispatcher and a spread of POOLED
// missions so the Driver Pool has something to show. Uses the service-role
// client (bypasses RLS). NOT a migration — it never touches the schema, only
// inserts rows. Blocked in production.
//
// Run it by visiting:  http://localhost:3000/api/seed
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

const SEED_EMAIL = "seed.dispatcher@pickup.local";
const SEED_BUSINESS = "Carlton Cannes (seed)";
const SEED_PHONE = "+33 6 12 34 56 78";

type MissionInsert = Database["public"]["Tables"]["mission"]["Insert"];

export async function GET() {
  // This route wields the RLS-bypassing service role and mass-deletes seed
  // missions, so block it on ANY hosted environment — not just NODE_ENV. It is
  // meant to be run from `next dev` on a developer's machine only.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return NextResponse.json(
      { error: "Seeding is disabled outside local development." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  // 1) Business + Dispatcher (idempotent on the dispatcher's seed email).
  const { data: existingDispatcher } = await admin
    .from("dispatcher")
    .select("id, business_id, auth_user_id")
    .eq("email", SEED_EMAIL)
    .maybeSingle();

  let businessId: string;
  let dispatcherId: string;
  let dispatcherAuthId: string;

  if (existingDispatcher) {
    dispatcherId = existingDispatcher.id;
    businessId = existingDispatcher.business_id;
    dispatcherAuthId = existingDispatcher.auth_user_id;
  } else {
    const authUserId = await ensureAuthUser(admin, SEED_EMAIL);
    dispatcherAuthId = authUserId;

    const { data: business, error: bizErr } = await admin
      .from("business")
      // ⚑ `business_type`, not the old free-typed `field_of_activity`. A seed
      // that writes the superseded column manufactures exactly the population
      // the S71 gate exists to catch — a Business with no category — and it
      // would be the only one nobody could explain.
      .insert({ name: SEED_BUSINESS, business_type: "hotel", reception_phone: "+33 4 93 00 00 00" })
      .select("id")
      .single();
    if (bizErr || !business)
      return NextResponse.json({ error: bizErr?.message }, { status: 500 });
    businessId = business.id;

    const { data: dispatcher, error: dispErr } = await admin
      .from("dispatcher")
      .insert({
        business_id: businessId,
        auth_user_id: authUserId,
        name: "Concierge Desk",
        email: SEED_EMAIL,
        phone: SEED_PHONE,
      })
      .select("id")
      .single();
    if (dispErr || !dispatcher)
      return NextResponse.json({ error: dispErr?.message }, { status: 500 });
    dispatcherId = dispatcher.id;
  }

  // 1b) Ensure a profile row (role=dispatcher) so signing in as the seed
  // dispatcher routes straight to /dispatch with these missions. Dev-only.
  await admin
    .from("profile")
    .upsert({ auth_user_id: dispatcherAuthId, role: "dispatcher" }, { onConflict: "auth_user_id" });

  // 2) Clear previous seed missions for this business (keep it idempotent).
  await admin.from("mission").delete().eq("business_id", businessId);

  // 3) Insert a spread of pooled missions.
  const now = Date.now();
  const inHours = (h: number) => new Date(now + h * 3_600_000).toISOString();

  // Include speed_win on EVERY row: with a heterogeneous bulk insert, PostgREST
  // uses the union of keys and writes NULL for rows that omit one — which would
  // violate mission.speed_win NOT NULL. Set it here; mission #5 overrides true.
  const base: Pick<
    MissionInsert,
    "business_id" | "dispatcher_id" | "status" | "speed_win"
  > = {
    business_id: businessId,
    dispatcher_id: dispatcherId,
    status: "pooled",
    speed_win: false,
  };

  const missions: MissionInsert[] = [
    {
      ...base,
      category: "business",
      zone: "Nice",
      pickup_address: "Hôtel Negresco, 37 Prom. des Anglais, Nice",
      pickup_lat: 43.6948,
      pickup_lng: 7.2585,
      dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 2",
      dropoff_lat: 43.6584,
      dropoff_lng: 7.2159,
      pickup_at: inHours(5),
      flight_number: "AF1234",
      passenger_name: "M. Laurent",
      pax_count: 2,
      luggage_count: 2,
      reference: "Chambre 412",
      driver_message: "Vol international, prévoir aide bagages.",
      base_fare: 70,
      ceiling: 90,
      pdp_start: 50,
      pdp_step: null,
      pdp_interval: null,
    },
    {
      ...base,
      category: "business",
      zone: "Cannes",
      pickup_address: "Carlton Cannes, 58 Bd de la Croisette, Cannes",
      pickup_lat: 43.5505,
      pickup_lng: 7.022,
      dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 1",
      dropoff_lat: 43.6653,
      dropoff_lng: 7.215,
      pickup_at: inHours(26),
      passenger_name: "Mrs. Hughes",
      pax_count: 3,
      luggage_count: 3,
      base_fare: 95,
      ceiling: 120,
      pdp_start: 70,
      pdp_step: null,
      pdp_interval: null,
    },
    {
      ...base,
      category: "eco",
      zone: "Cannes",
      pickup_address: "Gare de Cannes, Rue Jean Jaurès, Cannes",
      pickup_lat: 43.5535,
      pickup_lng: 7.0203,
      dropoff_address: "Palais des Festivals, Cannes",
      dropoff_lat: 43.551,
      dropoff_lng: 7.0177,
      pickup_at: inHours(4),
      passenger_name: "M. Bernard",
      pax_count: 1,
      luggage_count: 0,
      base_fare: 25,
      ceiling: 35,
      pdp_start: 18,
      pdp_step: null,
      pdp_interval: null,
    },
    {
      ...base,
      category: "business",
      required_body_type: "van",
      zone: "Nice",
      pickup_address: "Port de Nice, Quai Lunel, Nice",
      pickup_lat: 43.6952,
      pickup_lng: 7.286,
      dropoff_address: "Place du Casino, Monaco",
      dropoff_lat: 43.7395,
      dropoff_lng: 7.4279,
      pickup_at: inHours(8),
      passenger_name: "Famille Rossi",
      pax_count: 6,
      luggage_count: 6,
      base_fare: 130,
      ceiling: 160,
      pdp_start: 90,
      pdp_step: null,
      pdp_interval: null,
    },
    {
      ...base,
      category: "luxury",
      zone: "Antibes",
      pickup_address: "Hôtel du Cap-Eden-Roc, Bd J.F. Kennedy, Antibes",
      pickup_lat: 43.55,
      pickup_lng: 7.123,
      dropoff_address: "Aéroport Nice Côte d'Azur, Terminal 1",
      dropoff_lat: 43.6653,
      dropoff_lng: 7.215,
      pickup_at: inHours(2),
      passenger_name: "Mr. Adler",
      pax_count: 2,
      luggage_count: 2,
      reference: "Suite 5",
      driver_message: "Passager VIP — eau à bord.",
      base_fare: 180,
      ceiling: 200,
      // SPEED WIN curve per D21: start at 70% of ceiling, climb +5%/5 min.
      pdp_start: 140,
      pdp_step: null,
      pdp_interval: null,
      speed_win: true,
    },
    {
      ...base,
      category: "business",
      zone: "Nice",
      pickup_address: "Aéroport Nice Côte d'Azur, Terminal 1",
      pickup_lat: 43.6653,
      pickup_lng: 7.215,
      dropoff_address: "Bd de la Croisette, Cannes",
      dropoff_lat: 43.5505,
      dropoff_lng: 7.02,
      pickup_at: inHours(30),
      flight_number: "BA2602",
      passenger_name: "Mr. Clarke",
      pax_count: 2,
      luggage_count: 2,
      base_fare: 85,
      ceiling: 110,
      pdp_start: 60,
      pdp_step: null,
      pdp_interval: null,
    },
  ];

  const { data: inserted, error: missionErr } = await admin
    .from("mission")
    .insert(missions)
    .select("id, zone, category");

  if (missionErr)
    return NextResponse.json({ error: missionErr.message }, { status: 500 });

  const byCategory: Record<string, number> = {};
  for (const m of inserted ?? []) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    business: SEED_BUSINESS,
    dispatcher: "Concierge Desk",
    missionsInserted: inserted?.length ?? 0,
    byCategory,
    note: "Set a Riviera base (e.g. Cannes/Nice) + a radius ≥ ~50 km and a matching vehicle category in onboarding to see these in the Pool.",
  });
}

async function ensureAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string> {
  const { data: created } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created?.user) return created.user.id;

  // Already exists from a prior run → find it.
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email);
  if (found) return found.id;

  throw new Error("Could not create or find the seed dispatcher auth user.");
}
