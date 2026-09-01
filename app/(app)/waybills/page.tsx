// § 4 — the one page that opens with no signal.
//
// ⚑ WHY THIS SCREEN EXISTS AT ALL, given the Waybill already has a button on the trip.
// Reaching that button costs four steps — open the app, My Rides, the trip, Waybill —
// and every one of them asks the server for a screen. With no signal the failure is at
// step one: the app opens to nothing and the button is behind three doors that will not
// open. This is the door that does, and the service worker serves it from the cache.
//
// The list itself is rendered by the client from what is ACTUALLY saved on the device
// (`components/offline-waybills.tsx`), not from a server query — offline, a server-
// rendered list would be describing trips whose documents might not be there.
import Link from "next/link";
import { SavedWaybills } from "@/components/offline-waybills";

export const dynamic = "force-dynamic";

export default function WaybillsPage() {
  return (
    <>
      <p className="small wb-back">
        <Link href="/rides" className="muted">
          ← My Rides
        </Link>
      </p>
      <SavedWaybills />
    </>
  );
}
