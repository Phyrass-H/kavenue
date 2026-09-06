// § What a reviewer must say when they reject a document.
//
// ⚑ ITS OWN MODULE, WITH NO SERVER IMPORTS, ON PURPOSE. This rule is the reason
// the review screen is safe to hand to someone: `document.review_note` is the
// ONLY explanation any of the Driver's four surfaces can render, and it renders
// only when it exists (`app/(app)/settings/documents/[type]/page.tsx:85-87`).
// Reject without one and the Driver reads "Needs a new photo" and nothing else.
//
// It lived inside the server action first, and could not be tested there — a
// `"use server"` module drags the Supabase client and its env in behind it, and
// may only export async functions. A rule nobody can call from a test is a rule
// that quietly relaxes, so it moved here.

export type NoteCheck = { ok: true } | { ok: false; message: string };

/** The shortest thing that could actually help someone fix their paper. */
export const MIN_NOTE = 4;
/** Long enough to be specific, short enough to read on a phone at a rank. */
export const MAX_NOTE = 400;

export function checkReviewNote(raw: string): NoteCheck {
  const note = raw.trim();
  if (note.length < MIN_NOTE) {
    return { ok: false, message: "Say what is wrong with it — the Driver reads this word for word." };
  }
  if (note.length > MAX_NOTE) {
    return { ok: false, message: "Keep it short enough to act on — under 400 characters." };
  }
  return { ok: true };
}
