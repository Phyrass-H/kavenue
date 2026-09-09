// What is actually behind a document row — the one question, asked in the one
// order that is correct.
//
// ⚑ A MODULE OF ITS OWN, AND NOT BECAUSE IT IS BIG. `lib/documents.ts` opens with
// `import "server-only"` (it mints signed URLs with the service role), so the
// reviewer's CLIENT components cannot import a single function from it — the
// build fails with "This module cannot be imported from a Client Component".
// Both the thumbnail and the viewer run on the client and both need this answer,
// so it lives where both can reach it.
//
// ⚑ AND WHY IT IS A FUNCTION RATHER THAN TWO IFS AT EACH CALL SITE: `isPdf` is
// only the stored path's EXTENSION, and a row whose upload never happened still
// has a path — every `seed://…/drivers_licence.pdf` row in the live database
// ends in .pdf. Ask "is it a PDF?" before "is there a file?" and a document that
// does not exist reports itself as a PDF. That shipped twice in one afternoon
// (2026-09-09) — in the thumbnail, and in the viewer's toolbar, which told a
// reviewer staring at nothing to "use the PDF reader's own zoom". The day
// before, the same root cause let the founder approve a driving licence that had
// no file behind it at all.
//
// MISSING OUTRANKS KIND, ALWAYS. A caller switching on this cannot get the order
// wrong, because the order is no longer theirs to get wrong.

export type FileKind = "missing" | "pdf" | "image";

export function fileKind(
  file: { viewUrl: string | null; isPdf: boolean } | null | undefined,
): FileKind {
  if (!file?.viewUrl) return "missing";
  return file.isPdf ? "pdf" : "image";
}
