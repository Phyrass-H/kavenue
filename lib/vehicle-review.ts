"use server";

// § S78 — approving a car, which is the second of the three approvals.
//
// ⚑ WHY IT IS ITS OWN ACT. The person is approved once ([[d132]]: `driver.verified`, a
// judgement about someone, never computed from their papers). The CAR changes — a Driver
// sells one, re-plates one, moves up a class — and each time a person has to look again. The
// founder, 2026-09-12: *"a driver with a pending car validation just cannot work, period"*,
// and the reason they gave: *"imagine a car accident with a non approved car?"*
//
// ⚑ THE AUTHORISATION SHAPE IS S75's, VERBATIM, AND FOR THE SAME REASON. Establish who is
// asking on the USER's session, then write with the SERVICE ROLE. The obvious alternative — an
// RLS policy letting an admin UPDATE `vehicle` — would be a hole: it would let anyone holding
// an admin session PATCH the row through PostgREST and skip every rule below, including "you
// may not approve a car whose papers you have not seen". `vehicle` has had NO browser write
// door since 2026-09-11b, and this file must not open one.
import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkReviewNote } from "@/lib/review-note";
import { driverDocTypes, documentLabel } from "@/lib/account";

export type ReviewResult = { ok: true } | { ok: false; message: string };

async function requireAdmin(): Promise<{ uid: string } | null> {
  const ctx = await getAppContext();
  if (!ctx.user || ctx.profile?.role !== "admin") return null;
  return { uid: ctx.user.id };
}

function pathsFor(driverId: string): string[] {
  // The reviewer's page, the fleet list, and Activity — which now carries a row per Driver
  // whose car is waiting, so an approval must clear it from there too.
  return [`/admin/drivers/${driverId}`, "/admin/drivers", "/admin"];
}

/** The car this Driver has on file, whatever state it is in. ⚑ Retired rows are excluded here
 *  rather than at each caller: approving a car that was already replaced would put two live
 *  cars on one Driver, which the unique index refuses — an error the reviewer cannot act on. */
async function liveCarId(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
): Promise<{ id: string; status: string } | null> {
  const { data } = await admin
    .from("vehicle")
    .select("id, approval_status, retired_at")
    .eq("driver_id", driverId)
    .is("retired_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, status: data.approval_status } : null;
}

/**
 * Say this car may work.
 *
 * ⚑ IT REFUSES A CAR WHOSE PAPERS ARE NOT VERIFIED — the same rule as [[d135]]'s "you cannot
 * approve a paper you cannot see", one level up. Approving a car on the strength of a carte
 * grise nobody opened is the exact failure the whole approval exists to prevent, and it is the
 * kind of thing a reviewer does at 19:00 with twelve rows left.
 */
export async function approveVehicle(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Only an admin can approve a car." };

  const driverId = String(form.get("driverId") ?? "");
  const vehicleId = String(form.get("vehicleId") ?? "");
  if (!driverId || !vehicleId) return { ok: false, message: "Which car?" };

  const admin = createAdminClient();
  const live = await liveCarId(admin, driverId);
  if (!live) return { ok: false, message: "This Driver has no car on file." };
  if (live.id !== vehicleId) {
    // The page was open while the Driver filed a different car. Approving the id the browser
    // remembers would approve a row that is no longer theirs.
    return { ok: false, message: "That car has been replaced since this page loaded. Reload it." };
  }

  // ⚑ The list comes from lib/account.ts, not from two literals here: a car paper added there
  //   (a Monaco vignette, an airport authorisation — docs/05 § Access badges) must not slip
  //   past this check because someone forgot to add it in a second place.
  const carPapers = driverDocTypes("vehicle");

  // ⚑⚑ THE PAPERS OF *THIS CAR*, NOT OF THE DRIVER. Filed by owner alone, the retired car's
  //   verified carte grise satisfied this check for a car nobody had ever seen papers for —
  //   and uploading the new car's real ones did not help either, because every upload INSERTs
  //   and the old verified row still answered. `document.vehicle_id` exists precisely for this
  //   (M2 § 1 backfills it); reading it is what makes the check mean anything.
  //   Found by a review agent, reproduced end to end before this file was ever used in anger.
  const { data: papers } = await admin
    .from("document")
    .select("type, status, uploaded_at")
    .eq("owner_type", "driver")
    .eq("owner_id", driverId)
    .eq("vehicle_id", vehicleId)
    .in("type", [...carPapers])
    .order("uploaded_at", { ascending: false });
  // Newest per type: a Driver who re-uploads after a rejection has two rows, and the one that
  // counts is the one they just filed.
  const newest = new Map<string, string | null>();
  for (const row of papers ?? []) if (!newest.has(row.type)) newest.set(row.type, row.status);
  const missing = carPapers.filter((t) => newest.get(t) !== "verified");
  if (missing.length > 0) {
    return {
      ok: false,
      message:
        `Check ${missing.map((t) => documentLabel(t).toLowerCase()).join(" and ")} for THIS car first — ` +
        "not verified yet. A replacement car needs its own papers.",
    };
  }

  const { error } = await admin
    .from("vehicle")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: who.uid,
      rejected_at: null,
      rejection_note: null,
      last_written_by: who.uid,
      last_written_via: "admin",
    })
    .eq("id", vehicleId);
  if (error) return { ok: false, message: `Could not save that: ${error.message}` };

  await restampUpcoming(admin, driverId, vehicleId);

  for (const p of pathsFor(driverId)) revalidatePath(p, "layout");
  return { ok: true };
}

/**
 * ⚑ A TRIP THAT HAS NOT HAPPENED YET FOLLOWS THE CURRENT CAR; ONE THAT HAS IS FROZEN FOR EVER.
 *
 * The freeze exists so a document issued in July cannot be rewritten in September. It is not a
 * reason to tell a hotel to look for a car that was sold last week: the desk reads the plate to
 * the Guest standing in the lobby. So when a replacement car is approved, the Driver's
 * NOT-YET-STARTED trips are re-stamped, and everything else is left exactly as it was.
 *
 * ⚑ `accepted` and `confirmed` only — never en_route, arrived, on_board or completed. Once the
 * Driver is moving, the car that turned up IS the car that did the trip, and rewriting it would
 * be the invention this whole change exists to prevent.
 * ⚑ AND ONLY WHERE THE NEW CAR ACTUALLY FITS. A trip whose class or required body it cannot
 * serve keeps the old stamp and is left for a person — the founder ruled that handing a trip
 * back goes through support, and the Driver's file shows the warning before you approve.
 */
async function restampUpcoming(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
  vehicleId: string,
): Promise<void> {
  const { data: car } = await admin.from("vehicle").select("*").eq("id", vehicleId).maybeSingle();
  if (!car) return;

  const { data: held } = await admin
    .from("mission")
    .select("id, category, required_body_type")
    .eq("driver_id", driverId)
    .in("status", ["accepted", "confirmed"])
    .gt("pickup_at", new Date().toISOString());

  const fits = (held ?? []).filter(
    (m) =>
      m.category === car.category &&
      (m.required_body_type == null || m.required_body_type === car.body_type),
  );
  if (fits.length === 0) return;

  await admin
    .from("mission")
    .update({
      vehicle_id: car.id,
      vehicle_plate: car.plate,
      vehicle_make: car.make,
      vehicle_model: car.model,
      vehicle_colour: car.colour,
      vehicle_body_type: car.body_type,
      vehicle_seats: car.seats,
      vehicle_energy: car.energy,
      vehicle_first_registration_date: car.first_registration_date,
    })
    .in("id", fits.map((m) => m.id));
}

/**
 * Refuse it, with a reason.
 *
 * ⚑ THE REASON IS NOT A PREFERENCE. It is the only thing the Driver's own screen can render,
 * and without it a refusal is a Driver staring at a car they cannot work with and no idea what
 * to change. Same rule, same helper, as a rejected document ([[d132]]).
 * ⚑ AND THE ROW IS NOT RETIRED. A rejected car is corrected in place, so the reason has
 * somewhere to live until they fix it — retiring it would mint a retired car that never drove.
 */
export async function rejectVehicle(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Only an admin can refuse a car." };

  const driverId = String(form.get("driverId") ?? "");
  const vehicleId = String(form.get("vehicleId") ?? "");
  if (!driverId || !vehicleId) return { ok: false, message: "Which car?" };

  const note = String(form.get("reviewNote") ?? "").trim();
  const sayable = checkReviewNote(note);
  if (!sayable.ok) return sayable;

  const admin = createAdminClient();
  const live = await liveCarId(admin, driverId);
  if (!live) return { ok: false, message: "This Driver has no car on file." };
  if (live.id !== vehicleId) {
    return { ok: false, message: "That car has been replaced since this page loaded. Reload it." };
  }

  const { error } = await admin
    .from("vehicle")
    .update({
      approval_status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_note: note,
      approved_at: null,
      approved_by: null,
      last_written_by: who.uid,
      last_written_via: "admin",
    })
    .eq("id", vehicleId);
  if (error) return { ok: false, message: `Could not save that: ${error.message}` };

  for (const p of pathsFor(driverId)) revalidatePath(p, "layout");
  return { ok: true };
}
