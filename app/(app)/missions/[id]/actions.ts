"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { courseForAccept } from "@/lib/pool-fares";
import { recordMissionEvent } from "@/lib/mission-events-server";
import { getDriverContext } from "@/lib/driver";

export type AcceptResult = { ok: true } | { ok: false; message: string };

// Accept a mission. ALL the hard logic — atomic first-wins, slot-conflict, the
// immediate confirm (D55), and the § P expiry check — lives in the DB function
// accept_mission (Doc spine). We just call it AS THE DRIVER (user-session client,
// so auth.uid() resolves) and translate any error into something human-readable.
export async function acceptMission(missionId: string): Promise<AcceptResult> {
  const supabase = await createClient();

  // ⚑ THE FARE IS COMPUTED HERE, ON THE SERVER, AND FROZEN BY THE RPC.
  // docs/06 §9: "the fare freezes at acceptance… that frozen figure is the
  // contract price." Postgres cannot evaluate the §6 curve — lib/pdp.ts is the
  // only place it exists — so the number has to be computed in TypeScript and
  // handed over. It is safe to hand over because THIS IS A SERVER ACTION: the
  // Driver's browser sends a mission id and nothing else, so there is no number
  // to forge. `accept_mission` clamps it into [floor, ceiling] regardless.
  //
  // A failed read is not a reason to refuse the accept — the column is nullable
  // and every reader still falls back to recomputing the curve, which is what
  // the whole archive does. Losing the trip to another Driver over a slow select
  // would be the worse outcome.
  // ⚑ READ WITH THE SERVICE ROLE, because the Ceiling this needs is exactly what
  // `mission_read` withholds from a Driver browsing the Pool. Handing a
  // browser-supplied id to the service role is safe HERE and only here: the
  // number never goes back to the browser, and `accept_mission` re-clamps it
  // into [floor, ceiling] and enforces every eligibility rule itself.
  const course = await courseForAccept(missionId);

  const { error } = await supabase.rpc("accept_mission_call", {
    p_mission_id: missionId,
    p_fare: course,
  });

  if (error) {
    // § AG — ⚑ THIS MUST BE WRITTEN HERE, OUTSIDE THE RPC, AND NOWHERE ELSE.
    // accept_mission refuses by RAISE, and a raise rolls the whole transaction
    // back — a log row written inside it would vanish with the error it exists to
    // record. So the only place this fact survives is out here, after the call
    // returned.
    //
    // Worth having: a Driver who TRIED is not browsing, they wanted the work and
    // Kavenue's own rules said no. If one reason dominates, the rule is wrong.
    // The raw message is kept, not the Driver-facing wording — the point is which
    // guard fired.
    const { driver } = await getDriverContext();
    await recordMissionEvent({
      missionId,
      type: "accept_rejected",
      actorKind: driver ? "driver" : "unknown",
      actorId: driver?.id ?? null,
      // ⚑ The Driver who was REFUSED — deliberately not the mission's driver_id,
      // which on a lost race is the Driver who won it.
      driverId: driver?.id ?? null,
      payload: { reason: error.message ?? null },
    });
    return { ok: false, message: friendlyAcceptError(error.message) };
  }

  // The mission left the Pool and entered My Rides — refresh both.
  revalidatePath("/pool");
  revalidatePath("/rides");
  return { ok: true };
}

function friendlyAcceptError(raw: string): string {
  const m = raw.toLowerCase();
  // § P — checked before "no longer available" so the Driver gets the real
  // reason: this one isn't a race they lost, it's a trip that died unfilled.
  if (m.includes("expired"))
    return "Too late — this mission’s pickup time has passed.";
  if (m.includes("no longer available"))
    return "Sorry — this mission was just taken by another Driver.";
  if (m.includes("slot conflict"))
    return "This overlaps with another mission you’ve already accepted.";
  // § B — the DB now enforces the Pool's tier / body / luggage rules, so an accept
  // can fail for a reason this page's own gate didn't catch (a deep link, a stale
  // tab, the dev ?all=1 view, or a hand-rolled call).
  if (m.includes("not eligible"))
    return "This mission doesn’t match your vehicle — check your vehicle and luggage settings.";
  if (m.includes("not a driver"))
    return "Your Driver profile isn’t set up yet.";
  return "Couldn’t accept this mission. Please try again.";
}
