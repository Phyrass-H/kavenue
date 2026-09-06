// Server-only read helper for the documents surface. Gated by (owner_type,
// owner_id) which the caller resolves from auth — mirrors the contact-unlock
// pattern (D7): the service role reads, but only for the caller's own owner id.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrl } from "@/lib/supabase/storage";
import { documentMeta } from "@/lib/account";
import type { DocumentType, DocumentStatus, DocumentSide } from "@/lib/database.types";

export interface DocFile {
  /** The row's own id — what the reviewer's actions act on (S75). Each SIDE is a
   *  separate row and is approved or rejected on its own. */
  id: string;
  side: DocumentSide | null;
  status: DocumentStatus;
  uploadedAt: string;
  viewUrl: string | null;
}

export interface DocView {
  type: DocumentType;
  /** Roll-up across the sides on file: rejected beats pending beats verified. */
  status: DocumentStatus | null;
  uploadedAt: string | null;
  expiresAt: string | null;
  reviewNote: string | null;
  /** The front (or the only file). Kept as `viewUrl` so existing callers work. */
  viewUrl: string | null;
  /** Per-side detail, so a rejected FRONT can send you back to the front. */
  front: DocFile | null;
  /** Two-sided papers only — null when the back hasn't been filed yet. */
  back: DocFile | null;
  /** True while a two-sided document is missing one of its sides. */
  incomplete: boolean;
}

type Row = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  file_url: string;
  uploaded_at: string;
  expires_at: string | null;
  side: DocumentSide | null;
  review_note: string | null;
};

// Worst-first, so one rejected side makes the whole document rejected.
function rollUp(a: DocumentStatus, b: DocumentStatus): DocumentStatus {
  if (a === "rejected" || b === "rejected") return "rejected";
  if (a === "pending" || b === "pending") return "pending";
  return "verified";
}

// Latest document per requested type, each with a fresh short-lived view URL.
// Two-sided papers (licence, VTC card) keep the newest row *per side*, so
// uploading a back doesn't bury the front.
export async function getLatestDocuments(
  ownerType: "driver" | "business",
  ownerId: string,
  types: readonly DocumentType[],
): Promise<DocView[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("document")
    .select("id, type, status, file_url, uploaded_at, expires_at, side, review_note")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("uploaded_at", { ascending: false });

  // key = `${type}|${side ?? ""}` → newest row for that slot.
  const latest = new Map<string, Row>();
  for (const d of (data ?? []) as Row[]) {
    const key = `${d.type}|${d.side ?? ""}`;
    if (!latest.has(key)) latest.set(key, d);
  }

  return Promise.all(
    types.map(async (type) => {
      const meta = documentMeta(type);
      // A two-sided document may have been filed before sides existed (side null),
      // so fall back to the sideless row for the front.
      const front = latest.get(`${type}|front`) ?? latest.get(`${type}|`) ?? null;
      const back = meta.twoSided ? (latest.get(`${type}|back`) ?? null) : null;

      if (!front && !back) {
        return {
          type,
          status: null,
          uploadedAt: null,
          expiresAt: null,
          reviewNote: null,
          viewUrl: null,
          front: null,
          back: null,
          incomplete: false,
        };
      }

      const rows = [front, back].filter(Boolean) as Row[];
      const status = rows.map((r) => r.status).reduce(rollUp);
      const newest = rows.reduce((a, b) => (a.uploaded_at >= b.uploaded_at ? a : b));

      return {
        type,
        status,
        uploadedAt: newest.uploaded_at,
        expiresAt: front?.expires_at ?? back?.expires_at ?? null,
        reviewNote: rows.find((r) => r.review_note)?.review_note ?? null,
        viewUrl: front ? await signedDocUrl(front.file_url) : null,
        front: front
          ? {
              id: front.id,
              side: "front" as const,
              status: front.status,
              uploadedAt: front.uploaded_at,
              viewUrl: await signedDocUrl(front.file_url),
            }
          : null,
        back: back
          ? {
              id: back.id,
              side: "back" as const,
              status: back.status,
              uploadedAt: back.uploaded_at,
              viewUrl: await signedDocUrl(back.file_url),
            }
          : null,
        incomplete: !!meta.twoSided && (!front || !back),
      };
    }),
  );
}
