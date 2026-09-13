// Which paper is on file — the rule, kept pure.
//
// ⚑ ONE ANSWER, TWO CALLERS. lib/documents.ts builds the reviewer's view on top of it (signed
// URLs, per-side ids). The admin Drivers list asks the same question for sixty Drivers at once
// and needs only the state, so it cannot pay for sixty sets of URLs — and a second copy of the
// "newest row per side, rejected beats pending" rule is exactly how the two screens would drift.
import { documentMeta } from "@/lib/account";
import type { DocumentSide, DocumentStatus, DocumentType } from "@/lib/database.types";

export interface DocRowLike {
  type: DocumentType;
  side: DocumentSide | null;
  status: DocumentStatus;
  uploaded_at: string;
  expires_at: string | null;
}

export interface DocSlot<R extends DocRowLike> {
  type: DocumentType;
  /** The front (or the only file). */
  front: R | null;
  /** Two-sided papers only. */
  back: R | null;
  /** Roll-up across the sides on file: rejected beats pending beats verified. */
  status: DocumentStatus | null;
  expiresAt: string | null;
  /** True while a two-sided document is missing one of its sides. */
  incomplete: boolean;
}

/** Worst-first, so one rejected side makes the whole document rejected. */
export function rollUp(a: DocumentStatus, b: DocumentStatus): DocumentStatus {
  if (a === "rejected" || b === "rejected") return "rejected";
  if (a === "pending" || b === "pending") return "pending";
  return "verified";
}

/**
 * The latest document per requested type, one slot per type in the order asked.
 *
 * Two-sided papers (licence, VTC card) keep the newest row *per side*, so uploading a back
 * doesn't bury the front. A two-sided document may have been filed before sides existed (side
 * null), so the sideless row stands in for the front.
 *
 * ⚑ SORTED HERE, not assumed. The first row seen for a slot is the one on file, so the order is
 * the rule; a caller that forgot `order by uploaded_at desc` would otherwise get an old paper.
 */
export function latestSlots<R extends DocRowLike>(
  rows: readonly R[],
  types: readonly DocumentType[],
): DocSlot<R>[] {
  const newestFirst = [...rows].sort((a, b) =>
    a.uploaded_at < b.uploaded_at ? 1 : a.uploaded_at > b.uploaded_at ? -1 : 0,
  );
  const latest = new Map<string, R>();
  for (const d of newestFirst) {
    const key = `${d.type}|${d.side ?? ""}`;
    if (!latest.has(key)) latest.set(key, d);
  }

  return types.map((type) => {
    const meta = documentMeta(type);
    const front = latest.get(`${type}|front`) ?? latest.get(`${type}|`) ?? null;
    const back = meta.twoSided ? (latest.get(`${type}|back`) ?? null) : null;
    const onFile = [front, back].filter((r): r is R => r !== null);
    return {
      type,
      front,
      back,
      status: onFile.length > 0 ? onFile.map((r) => r.status).reduce(rollUp) : null,
      expiresAt: front?.expires_at ?? back?.expires_at ?? null,
      incomplete: onFile.length > 0 && !!meta.twoSided && (!front || !back),
    };
  });
}
