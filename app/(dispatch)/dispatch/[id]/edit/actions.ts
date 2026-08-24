"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/app-context";
import { recordMissionEvent } from "@/lib/mission-events-server";
import {
  parsePassengers,
  passengerName as guestFullName,
  primaryPassengerName,
  passengerRowData,
  guestContacts,
} from "@/lib/passengers";
import {
  parseLanguages,
  parseDriverFlags,
  activeFlagKeys,
  DRESS_CODES,
} from "@/lib/driver-service";
import { diffMissionInfo, type InfoSnapshot } from "@/lib/info-changes";
import {
  DOCS_BUCKET,
  ensureBucket,
  uploadFile,
  fileExt,
  MAX_UPLOAD_BYTES,
} from "@/lib/supabase/storage";
import type { MissionStatus } from "@/lib/database.types";

const BOARD_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

// Info edits are allowed only while the trip is still pre-departure. Once a
// Driver is executing (en_route+) or the trip is terminal, its details are frozen.
// A material change after acceptance (route / price / time) is a separate,
// consented "amendment" flow — NOT this action (see IDEAS.md, Phase 2).
const EDITABLE_STATUSES: MissionStatus[] = ["pooled", "accepted", "confirmed"];

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Update ONLY the info a Driver sees on a posted mission — no price, no route,
// no timing. The fare (PDP curve), Pool matching and status are untouched, so the
// deal a Driver accepted can't move underneath them. Written via the USER session
// so RLS (p_mission_business_update) authorises it; the app additionally whitelists
// the columns (there is no column-level RLS) and guards the status atomically.
export async function updateMissionInfo(missionId: string, formData: FormData) {
  const ctx = await getAppContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.dispatcher || !ctx.business) redirect("/onboarding-business");

  const id = String(missionId ?? "").trim();
  if (!id) redirect("/dispatch");
  const backTo = (err: string) => `/dispatch/${id}/edit?error=${err}`;

  // Read-only context passed from the form (mirrors createMission's gating): a
  // luggage-only run carries no passengers, so its passenger fields stay null.
  // Never WRITTEN — only read to decide how to null the passenger columns.
  const luggageOnly = formData.get("luggage_only") === "1";

  const passengers = parsePassengers(formData.get("passenger_names"));
  const hasGuestData = passengers.some((p) => p.first || p.last || p.phone);
  const passengerName = primaryPassengerName(passengers);
  const paxCount = passengers.length > 0 ? passengers.length : null;

  const flightNumber = String(formData.get("flight_number") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 20);
  const luggageCount = num(formData.get("luggage_count"));
  const requiredLanguages = parseLanguages(formData.get("required_languages"));
  const dressRaw = String(formData.get("dress_code") ?? "").trim();
  const dressCode = (DRESS_CODES as readonly string[]).includes(dressRaw) ? dressRaw : null;
  const driverFlags = parseDriverFlags(formData.get("driver_flags"));
  const boardName = String(formData.get("board_name") ?? "").trim();
  const driverMessage = String(formData.get("driver_message") ?? "").trim();

  // Meet & greet board file → private "documents" bucket. Same as createMission:
  // only WRITE board_file_path when a new file was uploaded (conditional spread),
  // so saving without a new file/clear leaves the existing board untouched. A
  // failed upload is non-fatal.
  let boardUpload: { board_file_path: string | null } | Record<string, never> = {};
  const boardFile = formData.get("board_file");
  if (
    boardFile instanceof File &&
    boardFile.size > 0 &&
    boardFile.size <= MAX_UPLOAD_BYTES &&
    BOARD_MIME.includes(boardFile.type)
  ) {
    try {
      await ensureBucket(DOCS_BUCKET, false);
      const path = `mission/${ctx.business.id}/board-${crypto.randomUUID()}.${fileExt(boardFile)}`;
      await uploadFile(DOCS_BUCKET, path, boardFile);
      boardUpload = { board_file_path: path };
    } catch {
      boardUpload = {};
    }
  }
  if (Object.keys(boardUpload).length === 0 && formData.get("board_file_clear") === "1") {
    boardUpload = { board_file_path: null };
  }

  // INFO-ONLY whitelist. Deliberately EXCLUDES everything price/route/matching:
  // base_fare, ceiling, pdp_*, speed_win, created_at, category, pickup*/dropoff*,
  // waypoints, distance_km, duration_min, zone, status, luggage_only, required_*.
  const infoRow = {
    passenger_name: luggageOnly ? null : passengerName || null,
    passenger_names: luggageOnly ? null : hasGuestData ? passengerRowData(passengers) : null,
    pax_count: luggageOnly ? null : paxCount,
    luggage_count: luggageCount,
    flight_number: flightNumber || null,
    reference: reference || null,
    required_languages: requiredLanguages.length > 0 ? requiredLanguages : null,
    dress_code: dressCode,
    driver_flags: Object.keys(driverFlags).length > 0 ? driverFlags : null,
    board_name: boardName || null,
    driver_message: driverMessage || null,
    // Stamp the info-edit time — shown as "Edited · <time>" in the trip detail.
    // Set ONLY here (an info edit), never by a price/route/status change.
    info_edited_at: new Date().toISOString(),
  };

  const supabase = await createClient();

  // Snapshot the info BEFORE the write, so we can log WHAT changed (the "what
  // changed" trail in the schedule detail). RLS scopes this read to the Business.
  const { data: before } = await supabase
    .from("mission")
    .select(
      "passenger_names, flight_number, luggage_count, reference, required_languages, dress_code, driver_flags, board_name, board_file_path, driver_message",
    )
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .maybeSingle();

  // Atomic guard: the .in(status) both enforces "still editable" AND avoids a
  // TOCTOU race with an accept/status change landing mid-edit. 0 rows → wrong
  // owner (RLS), or the trip is now locked/gone.
  const { data: updated, error } = await supabase
    .from("mission")
    .update({ ...infoRow, ...boardUpload })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .in("status", EDITABLE_STATUSES)
    // § P — the SQL half of canEditInfo(): NOT (pooled AND past due). A trip
    // whose pickup passed with nobody on it is dead whether or not the sweep has
    // reached it, and it must not stay editable through a deep link. A blanket
    // pickup_at floor would be WRONG — a `confirmed` trip ten minutes past its
    // pickup is exactly when a Dispatcher needs to fix a Guest's phone number.
    .or(`status.neq.pooled,pickup_at.gt.${new Date().toISOString()}`)
    .select("id");
  if (error) redirect(backTo("db"));
  if (!updated || updated.length === 0) redirect(backTo("locked"));

  // Change-log (D40 follow-up): record the human-readable diff for the schedule's
  // "what changed" trail. Business-private (mission_info_change, deny-by-default
  // RLS). Non-fatal + degrades gracefully if the table isn't applied yet.
  const boardChanged = "board_file_path" in boardUpload;
  const hadBoardFile = (before?.board_file_path ?? null) != null;
  const beforeSnap: InfoSnapshot = {
    guests: parsePassengers(before?.passenger_names).map(guestFullName).filter(Boolean),
    flight: before?.flight_number ?? null,
    luggage: before?.luggage_count ?? null,
    reference: before?.reference ?? null,
    languages: parseLanguages(before?.required_languages),
    dress: before?.dress_code ?? null,
    flags: activeFlagKeys(parseDriverFlags(before?.driver_flags)),
    boardName: before?.board_name ?? null,
    message: before?.driver_message ?? null,
    hasBoardFile: hadBoardFile,
  };
  const afterSnap: InfoSnapshot = {
    guests: luggageOnly ? [] : passengers.map(guestFullName).filter(Boolean),
    flight: flightNumber || null,
    luggage: luggageCount,
    reference: reference || null,
    languages: requiredLanguages,
    dress: dressCode,
    flags: activeFlagKeys(driverFlags),
    boardName: boardName || null,
    message: driverMessage || null,
    hasBoardFile: boardChanged
      ? (boardUpload as { board_file_path: string | null }).board_file_path != null
      : hadBoardFile,
  };
  const changeItems = diffMissionInfo(beforeSnap, afterSnap);
  if (changeItems.length > 0) {
    const { error: logErr } = await supabase.from("mission_info_change").insert({
      mission_id: id,
      business_id: ctx.business.id,
      edited_by: ctx.dispatcher.id,
      items: changeItems,
    });
    if (logErr) console.error("mission_info_change write failed:", logErr.message);

    // § AG — an info edit applies immediately and needs no consent, so it moves
    // no status and the trigger stays silent. mission_info_change remains the
    // domain record (it holds WHAT changed, and it is Business-private); this
    // mirrors the fact into the one timeline that carries everything else.
    await recordMissionEvent({
      missionId: id,
      type: "info_changed",
      actorKind: "dispatcher",
      actorId: ctx.dispatcher.id,
      payload: { fields: changeItems.length },
    });
  }

  // Guest phones (Driver-unreadable side table), aligned by index — same
  // upsert-else-delete as createMission. Only after the mission update matched a
  // row, so a rejected edit never leaves an orphan contacts row.
  const contacts = guestContacts(passengers);
  const { error: contactErr } = contacts.some((c) => c.phone)
    ? await supabase.from("mission_guest_contact").upsert({
        mission_id: id,
        contacts,
        updated_at: new Date().toISOString(),
      })
    : await supabase.from("mission_guest_contact").delete().eq("mission_id", id);
  if (contactErr) {
    console.error("mission_guest_contact write failed:", contactErr.message);
  }

  // Refresh every Dispatch surface that shows mission info, then land back on the
  // schedule with the edited trip expanded (reuses the ?open= deep link).
  revalidatePath("/dispatch", "layout");
  revalidatePath("/dispatch/calendar");
  revalidatePath("/dispatch/history");
  redirect(`/dispatch?open=${id}`);
}
