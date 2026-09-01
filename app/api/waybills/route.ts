// § 4 — which Waybills belong on this phone.
//
// The service worker needs a list before it can save anything, and it cannot ask the
// database itself. This is that list: the trips the Driver HOLDS, nothing else. A pooled
// trip has no exploitant yet, and a finished one is not a document anybody will be asked
// for at the roadside.
//
// ⚑ It carries no money and no Guest. The three fields are what the saved list PRINTS —
// a route whose whole purpose is to be readable off the network should not put more than
// that on the device.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverContext } from "@/lib/driver";
import { HELD_STATUSES, type SavedWaybill } from "@/lib/offline-waybill";

export const dynamic = "force-dynamic";

export async function GET() {
  const { driver } = await getDriverContext();
  if (!driver) return NextResponse.json({ trips: [] }, { status: 401 });

  // `mission_read`, not `mission` — the money walls ([[d114]]) took `ceiling` and the
  // commission rates off the base table for browser sessions.
  const supabase = await createClient();
  const { data: missions } = await supabase
    .from("mission_read")
    .select("id, business_id, pickup_at, pickup_address")
    .eq("driver_id", driver.id)
    .in("status", HELD_STATUSES)
    .order("pickup_at", { ascending: true });

  if (!missions || missions.length === 0) return NextResponse.json({ trips: [] });

  // A Driver cannot read `business` under RLS. Same pattern as My Rides: the service
  // role, scoped to the Businesses behind trips RLS already proved are theirs.
  const admin = createAdminClient();
  const { data: businesses } = await admin
    .from("business")
    .select("id, name")
    .in("id", [...new Set(missions.map((m) => m.business_id))]);
  const names = new Map((businesses ?? []).map((b) => [b.id, b.name]));

  const trips: SavedWaybill[] = missions.map((m) => ({
    id: m.id,
    business: names.get(m.business_id) ?? "—",
    pickupAt: m.pickup_at,
    pickupAddress: m.pickup_address,
  }));
  return NextResponse.json({ trips });
}
