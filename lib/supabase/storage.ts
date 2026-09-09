// Supabase Storage helpers — SERVER ONLY (uses the service-role client).
// Buckets are created on demand via the Storage API. This is operational setup,
// NOT a DB schema migration (hard-rule #4 is about the SQL schema) — the app
// self-provisions its buckets the first time a file is uploaded.
//
//   • DOCS_BUCKET  — private. Sensitive proofs (licence, insurance, Kbis…).
//     We store the storage PATH in document.file_url and mint short-lived
//     signed URLs on read. No public access.
//   • MEDIA_BUCKET — public. Logos + profile photos. We store the public URL
//     (with a cache-busting ?v=) in business.logo_url / driver.profile_photo_url.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const DOCS_BUCKET = "documents";
export const MEDIA_BUCKET = "avatars";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const DOC_MIME = [...IMAGE_MIME, "application/pdf"];

/** Create the bucket if it doesn't exist yet. Idempotent + race-tolerant. */
export async function ensureBucket(name: string, isPublic: boolean): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(name);
  if (data) return;

  const { error } = await admin.storage.createBucket(name, {
    public: isPublic,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: isPublic ? IMAGE_MIME : DOC_MIME,
  });
  // Two requests can race to create the same bucket — ignore "already exists".
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`Storage bucket "${name}" setup failed: ${error.message}`);
  }
}

/** File extension from name (fallback to mime), lowercased, no dot. */
export function fileExt(file: File): string {
  const fromName = file.name?.split(".").pop();
  if (fromName && fromName.length <= 5 && fromName !== file.name) {
    return fromName.toLowerCase();
  }
  const fromMime = file.type?.split("/").pop();
  return (fromMime || "bin").toLowerCase();
}

/** Upload (upsert) a file and return the storage path it was written to. */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
): Promise<string> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Short-lived signed URL for a private document path. */
export async function signedDocUrl(
  path: string,
  ttlSeconds = 600,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  return data?.signedUrl ?? null;
}

/**
 * Is there actually a file behind this path?
 *
 * ⚑ THE ANSWER IS `createSignedUrl` FAILING, AND THAT IS MEASURED, NOT ASSUMED.
 * Supabase returns `{ data: null, error: "Object not found" }` for a path with no
 * object — checked on 2026-09-09 against both a plausible-but-absent path and the
 * `seed://…` paths the old seed script wrote. So a null signed URL means no file,
 * which is what lets the reviewer refuse to approve a paper nobody can open.
 */
export async function docFileExists(path: string | null | undefined): Promise<boolean> {
  if (!path) return false;
  return (await signedDocUrl(path, 60)) !== null;
}

/** Stable public URL for an avatars-bucket path (+ cache-buster). */
export function publicMediaUrl(path: string, version?: string | number): string {
  const admin = createAdminClient();
  const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}
