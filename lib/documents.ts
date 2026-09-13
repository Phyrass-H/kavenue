// Server-only read helper for the documents surface. Gated by (owner_type,
// owner_id) which the caller resolves from auth — mirrors the contact-unlock
// pattern (D7): the service role reads, but only for the caller's own owner id.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrl } from "@/lib/supabase/storage";
import { latestSlots } from "@/lib/document-views";
import type { DocumentType, DocumentStatus, DocumentSide } from "@/lib/database.types";
// Re-exported so callers that already import from here keep working; the
// implementation lives outside this server-only module so the client can use it.
export { fileKind, type FileKind } from "@/lib/document-kind";

export interface DocFile {
  /** The row's own id — what the reviewer's actions act on (S75). Each SIDE is a
   *  separate row and is approved or rejected on its own. */
  id: string;
  side: DocumentSide | null;
  status: DocumentStatus;
  uploadedAt: string;
  viewUrl: string | null;
  /**
   * ⚑ A PDF CANNOT BE ZOOMED WITH A CSS TRANSFORM — scaling an <iframe> blurs it
   * rather than magnifying it. The reviewer's viewer needs to know which kind of
   * thing it is holding so it can hand a PDF to the browser's own reader instead
   * of offering zoom buttons that would make the page worse.
   */
  isPdf: boolean;
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

/** Extension of the stored path, not of a user-supplied name. */
const isPdfPath = (p: string) => p.toLowerCase().endsWith(".pdf");

// Latest document per requested type, each with a fresh short-lived view URL.
// Two-sided papers (licence, VTC card) keep the newest row *per side*, so
// uploading a back doesn't bury the front.
// ⚑ WHICH ROW IS ON FILE is decided by `latestSlots` (lib/document-views.ts) and only there —
//   the admin Drivers list asks the same question for sixty Drivers at once, without URLs (S79).
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

  return Promise.all(
    latestSlots((data ?? []) as Row[], types).map(async ({ type, front, back, status, expiresAt, incomplete }) => {
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
      const newest = rows.reduce((a, b) => (a.uploaded_at >= b.uploaded_at ? a : b));

      return {
        type,
        status,
        uploadedAt: newest.uploaded_at,
        expiresAt,
        reviewNote: rows.find((r) => r.review_note)?.review_note ?? null,
        viewUrl: front ? await signedDocUrl(front.file_url) : null,
        front: front
          ? {
              id: front.id,
              side: "front" as const,
              status: front.status,
              uploadedAt: front.uploaded_at,
              viewUrl: await signedDocUrl(front.file_url),
              isPdf: isPdfPath(front.file_url),
            }
          : null,
        back: back
          ? {
              id: back.id,
              side: "back" as const,
              status: back.status,
              uploadedAt: back.uploaded_at,
              viewUrl: await signedDocUrl(back.file_url),
              isPdf: isPdfPath(back.file_url),
            }
          : null,
        incomplete,
      };
    }),
  );
}
