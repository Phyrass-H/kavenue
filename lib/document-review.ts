"use server";

// § The reviewer's side of a Driver's papers.
//
// ⚑ WHY THIS FILE EXISTS. `document` has carried a `status` and a `review_note`
// since 2026-07-28, the Driver's screens have rendered every state of them since
// the same day — and NOTHING HAS EVER WRITTEN EITHER. Verification was a MANUAL
// item done by editing rows in the Supabase table editor, on the one check that
// carries a €300,000 fine (docs/01:24). This is the missing half.
//
// ⚑ THE AUTHORISATION SHAPE, AND IT IS DELIBERATE. Every action here does two
// things in order:
//
//     1. establish WHO is asking, on the USER's session  → getAppContext()
//     2. do the write with the SERVICE ROLE              → createAdminClient()
//
// Step 2 bypasses RLS, so step 1 is the only thing standing between a Driver and
// their own approval. It is a server action, so it cannot be skipped from a
// browser — and `document` has no UPDATE policy at all, so there is no second
// door through PostgREST. This mirrors `lib/document-actions.ts:50,140`, which
// is how the Driver's own upload already works.
import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { checkReviewNote } from "@/lib/review-note";

export type ReviewResult = { ok: true } | { ok: false; message: string };


/** The one gate. Everything below calls it first, and refuses without it. */
async function requireAdmin(): Promise<{ uid: string } | null> {
  const ctx = await getAppContext();
  if (!ctx.user || ctx.profile?.role !== "admin") return null;
  return { uid: ctx.user.id };
}

/**
 * A date the reviewer corrects off the paper in front of them.
 *
 * ⚑ LOOSER THAN THE DRIVER'S OWN PARSER ON PURPOSE. `lib/document-actions.ts`
 * refuses a past date, because a Driver filing an already-lapsed paper is a
 * mistake worth catching at the door. The reviewer is doing the opposite job:
 * they are recording what the document ACTUALLY says, and a document that
 * expired last month is exactly the case they need to be able to enter. Refusing
 * it here would force them to leave a wrong date in place.
 */
function parseExpiry(raw: string | null): { ok: true; value: string | null } | { ok: false; message: string } {
  if (raw == null || raw.trim() === "") return { ok: true, value: null };
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, message: "That date doesn’t look right." };
  return { ok: true, value: d.toISOString() };
}

function pathsFor(driverId: string): string[] {
  // The reviewer's page, the fleet list (it counts unverified Drivers), and the
  // Activity console (its findings include documents waiting).
  return [`/admin/drivers/${driverId}`, "/admin/drivers", "/admin"];
}

/**
 * Approve one document — one SIDE of one document, where it has two.
 *
 * ⚑ IT CLEARS `review_note`, AND THAT IS A BUG FIX, NOT TIDINESS. The Driver's
 * page picks the note as `rows.find(r => r.review_note)?.review_note` across
 * [front, back] (`lib/documents.ts:97,106`), so a stale note left on an approved
 * FRONT outranks the real reason a BACK was rejected — the Driver would read
 * "the bottom edge is cut off" under a document whose bottom edge was fine.
 */
export async function approveDocument(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Only an admin can review documents." };

  const id = String(form.get("documentId") ?? "");
  const driverId = String(form.get("driverId") ?? "");
  if (!id || !driverId) return { ok: false, message: "Which document?" };

  const expiry = parseExpiry(form.get("expiresAt") as string | null);
  if (!expiry.ok) return { ok: false, message: expiry.message };

  const admin = createAdminClient();
  const patch: Database["public"]["Tables"]["document"]["Update"] = {
    status: "verified",
    review_note: null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: who.uid,
  };
  // ⚑ Only touch the expiry when the form actually carried one. A document type
  //   with `expiry: "none"` renders no field, and writing null over a date that
  //   a Driver typed would be a silent edit nobody asked for.
  if (form.has("expiresAt")) patch.expires_at = expiry.value;

  const { error } = await admin.from("document").update(patch).eq("id", id);
  if (error) return { ok: false, message: `Could not save that: ${error.message}` };

  for (const p of pathsFor(driverId)) revalidatePath(p, "layout");
  return { ok: true };
}

/**
 * Reject one document, WITH a reason.
 *
 * ⚑ THE NOTE IS THE BUTTON, NOT A FIELD BESIDE IT. Rejecting without one leaves
 * the Driver looking at "Needs a new photo" and literally nothing else: the note
 * is the only explanation any of their four surfaces can show, and it renders
 * only when it exists (`app/(app)/settings/documents/[type]/page.tsx:85-87`).
 * The migration that added the column said this out loud — *"Without it
 * 'Rejected' is a dead end"* — and then nothing enforced it for five weeks.
 */
export async function rejectDocument(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Only an admin can review documents." };

  const id = String(form.get("documentId") ?? "");
  const driverId = String(form.get("driverId") ?? "");
  if (!id || !driverId) return { ok: false, message: "Which document?" };

  const note = String(form.get("reviewNote") ?? "").trim();
  const sayable = checkReviewNote(note);
  if (!sayable.ok) return sayable;

  const admin = createAdminClient();
  const { error } = await admin
    .from("document")
    .update({
      status: "rejected",
      review_note: note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: who.uid,
    })
    .eq("id", id);
  if (error) return { ok: false, message: `Could not save that: ${error.message}` };

  for (const p of pathsFor(driverId)) revalidatePath(p, "layout");
  return { ok: true };
}

/**
 * Say this Driver may work — or take it back.
 *
 * ⚑ A SEPARATE ACT, BY THE FOUNDER'S DECISION (2026-09-04). It is not computed
 * from the documents. "Every paper is valid" and "I would put this person in
 * front of a hotel's Guest" are different questions, and the second one is the
 * video interview's only artefact (docs/02:40).
 *
 * ⚑ AND IT STILL GATES NOTHING. `lib/eligibility.ts:25-27` says so plainly: an
 * unverified Driver can accept work today. Making this flag a refuse rule needs
 * a change inside `accept_mission`, and a date from the founder for when it
 * starts biting. Until then this records a judgement; it does not enforce one.
 */
export async function setDriverVerified(_prev: ReviewResult | null, form: FormData): Promise<ReviewResult> {
  const who = await requireAdmin();
  if (!who) return { ok: false, message: "Only an admin can verify a Driver." };

  const driverId = String(form.get("driverId") ?? "");
  const next = String(form.get("verified") ?? "") === "true";
  if (!driverId) return { ok: false, message: "Which Driver?" };

  const admin = createAdminClient();
  const { error } = await admin.from("driver").update({ verified: next }).eq("id", driverId);
  if (error) return { ok: false, message: `Could not save that: ${error.message}` };

  for (const p of pathsFor(driverId)) revalidatePath(p, "layout");
  return { ok: true };
}
