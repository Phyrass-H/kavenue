"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { getDriverContext } from "@/lib/driver";
import { signedDocUrl } from "@/lib/supabase/storage";

// Mint a short-lived signed URL for a mission's meet & greet board file, on
// demand (so schedule/ride lists never eagerly mint a URL per row). Authorized
// in code: the Dispatcher of the mission's Business, OR the assigned Driver.
// The board file lives in the private "documents" bucket (storage.ts).
export async function getMissionBoardUrl(missionId: string): Promise<string | null> {
  const id = String(missionId ?? "").trim();
  if (!id) return null;

  const admin = createAdminClient();
  const { data: mission } = await admin
    .from("mission")
    .select("business_id, driver_id, board_file_path")
    .eq("id", id)
    .maybeSingle();
  if (!mission?.board_file_path) return null;

  let allowed = false;
  const ctx = await getAppContext().catch(() => null);
  if (ctx?.business && ctx.business.id === mission.business_id) {
    allowed = true;
  }
  if (!allowed) {
    const { driver } = await getDriverContext().catch(() => ({ driver: null }));
    if (driver && driver.id === mission.driver_id) allowed = true;
  }
  if (!allowed) return null;

  // ⚑ S83 — the path must be THIS Business's own board file, never any other object in the
  // private "documents" bucket (where Driver papers also live). `board_file_path` is a column
  // the Business writes, so a hand-built request could once have pointed it at a Driver's
  // licence and had the server sign it. The database trigger trg_mission_guard_board_file
  // (docs/migrations/2026-09-18a) refuses any such write now; this is the same rule on the
  // read side, so a row written before that trigger cannot be used as an oracle either.
  const prefix = `mission/${mission.business_id}/board-`;
  if (!mission.board_file_path.startsWith(prefix)) return null;

  return signedDocUrl(mission.board_file_path);
}
