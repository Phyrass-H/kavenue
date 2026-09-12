"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveCarOf } from "@/lib/vehicle-approval";
import {
  ensureBucket,
  uploadFile,
  fileExt,
  DOCS_BUCKET,
  MAX_UPLOAD_BYTES,
} from "@/lib/supabase/storage";
import { DRIVER_DOC_TYPES, BUSINESS_DOC_TYPES, documentMeta } from "@/lib/account";
import type { DocumentType, DocumentSide } from "@/lib/database.types";

export type UploadResult = { ok: true } | { ok: false; message: string };

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

// An expiry date the Driver types is only useful if it's real and still ahead —
// filing an already-lapsed paper just fails review later, so say so now.
function parseExpiry(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, message: "That date doesn’t look right." };
  if (d.getTime() < Date.now()) {
    return { ok: false, message: "That date has already passed — check the document." };
  }
  return { ok: true, value: d.toISOString() };
}

// Upload a proof to the private documents bucket and record a `document` row.
// One action serves both sides: it resolves the caller's role → owner_type +
// owner_id, so a Driver can only file Driver docs against their own id and a
// Business only its own. The row's status stays 'pending' (👤 verified by a
// human in beta). Writes go through the service role (no INSERT RLS on document).
export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  const typeRaw = String(formData.get("doc_type") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Please choose a file." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "File is too large (max 10 MB)." };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, message: "Use a PDF, JPG, PNG or WebP file." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You’re not signed in." };

  const { data: profile } = await supabase
    .from("profile")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let ownerType: "driver" | "business";
  let ownerId: string;
  let allowed: readonly DocumentType[];
  let revalidate: string;
  let driverId: string | null = null;

  if (profile?.role === "driver") {
    const { data: driver } = await supabase
      .from("driver")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!driver) return { ok: false, message: "Driver profile not found." };
    ownerType = "driver";
    ownerId = driver.id;
    driverId = driver.id;
    allowed = DRIVER_DOC_TYPES;
    revalidate = "/settings";
  } else if (profile?.role === "dispatcher") {
    const { data: dispatcher } = await supabase
      .from("dispatcher")
      .select("business_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!dispatcher) return { ok: false, message: "Business profile not found." };
    ownerType = "business";
    ownerId = dispatcher.business_id;
    allowed = BUSINESS_DOC_TYPES;
    revalidate = "/dispatch/settings";
  } else {
    return { ok: false, message: "Unknown account type." };
  }

  if (!allowed.includes(typeRaw as DocumentType)) {
    return { ok: false, message: "Unknown document type." };
  }
  const docType = typeRaw as DocumentType;
  const meta = documentMeta(docType);

  // Front/back: only two-sided papers carry a side, and it has to be one of the two.
  const sideRaw = String(formData.get("side") ?? "");
  const side: DocumentSide | null = meta.twoSided
    ? sideRaw === "back"
      ? "back"
      : "front"
    : null;

  // Expiry. Asked for on the paper that has one; the back of a two-sided document
  // reuses the front's date rather than asking twice.
  let expiresAt: string | null = null;
  if (meta.expiry === "required" && side !== "back") {
    const raw = String(formData.get("expires_at") ?? "").trim();
    if (!raw) return { ok: false, message: "Add the expiry date shown on the document." };
    const parsed = parseExpiry(raw);
    if (!parsed.ok) return parsed;
    expiresAt = parsed.value;
  }

  // A carte grise / insurance belongs to a car, not to the Driver.
  //
  // ⚑ S78 — THE LIVE CAR, NEVER THE OLDEST ROW. A retired car keeps its papers (that is why
  //   the column cascades), so "the oldest row" files the new car's carte grise against the
  //   car the Driver sold — and the approval screen, which now checks the papers OF THE CAR
  //   IN FRONT OF IT, would never see them.
  let vehicleId: string | null = null;
  if (meta.group === "vehicle" && driverId) {
    const { data: cars } = await supabase
      .from("vehicle")
      .select("id, retired_at, created_at")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: true });
    vehicleId = liveCarOf(cars ?? [])?.id ?? null;
  }

  try {
    await ensureBucket(DOCS_BUCKET, false);
    const suffix = side ? `-${side}` : "";
    const path = `${ownerType}/${ownerId}/${docType}${suffix}-${Date.now()}.${fileExt(file)}`;
    await uploadFile(DOCS_BUCKET, path, file);

    const admin = createAdminClient();
    const { error } = await admin.from("document").insert({
      owner_type: ownerType,
      owner_id: ownerId,
      type: docType,
      file_url: path,
      side,
      expires_at: expiresAt,
      vehicle_id: vehicleId,
    });
    if (error) return { ok: false, message: "Couldn’t save the document record." };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Upload failed.",
    };
  }

  // "layout" so the hub, the documents list and the per-document page all refresh
  // (the readiness strip on the hub is computed from exactly this data).
  revalidatePath(revalidate, "layout");
  return { ok: true };
}
