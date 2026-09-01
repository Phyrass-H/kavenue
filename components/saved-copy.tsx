"use client";

// § 4 — the two marks that say a Waybill is a SAVED COPY.
//
// ⚑ WHY THIS IS A COMPONENT AND NOT A STRING THE SERVICE WORKER INJECTS. It was the
// latter first, and the reasoning was good: the thing that hands over a copy is the only
// thing that knows it is one, so the stamp could never go missing. It does not survive
// contact with React. A cached page is hydrated on load, React reconciles the DOM against
// its own tree, and any node the worker added is simply deleted — silently, and only once
// the stylesheet and JS have loaded, so the first offline test PASSED (unstyled, with the
// stamp) and the second FAILED (styled, without it). Same code both times.
//
// So the marks are rendered by React, from a probe that runs after mount.
//
// ⚑ THE PROBE ASKS "CAN WE REACH KAVENUE", NOT "IS THE PHONE ONLINE". `navigator.onLine`
// is true on airport wifi that goes nowhere, and this document must not claim to be live
// when it came out of the cache. One request, memoised, shared by both marks.
import { useEffect, useState } from "react";
import {
  WAYBILL_INDEX_URL,
  reachable,
  waybillPath,
  type WaybillIndex,
} from "@/lib/offline-waybill";
import { frDateTime } from "@/lib/waybill";

let probe: Promise<string | null> | null = null;

/** Resolves to the ISO time this copy was saved, or null when the page is live. */
function savedCopyAt(missionId: string): Promise<string | null> {
  if (!probe) {
    probe = (async () => {
      if (await reachable()) return null;
      try {
        const res = await fetch(WAYBILL_INDEX_URL, { cache: "no-store" });
        const index = (await res.json()) as WaybillIndex | null;
        const trip = index?.trips?.find((t) => waybillPath(t.id) === waybillPath(missionId));
        // ⚑ An empty string, not null: this IS a copy even when we cannot date it, and
        // "we couldn't reach Kavenue" is the part that must not be lost.
        return trip?.savedAt ?? "";
      } catch {
        return "";
      }
    })();
  }
  return probe;
}

function useSavedCopy(missionId: string): string | null {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void savedCopyAt(missionId).then((v) => {
      if (alive) setSavedAt(v);
    });
    return () => {
      alive = false;
    };
  }, [missionId]);
  return savedAt;
}

/** App chrome, above the document. Tells the Driver what they are holding. Never prints. */
export function SavedCopyNotice({ missionId }: { missionId: string }) {
  const savedAt = useSavedCopy(missionId);
  if (savedAt === null) return null;
  return (
    <div className="wb-saved">
      Saved copy — Kavenue couldn’t reach the network. It won’t print.
    </div>
  );
}

/**
 * On the document, and it DOES print. French, like the six dates above it, because the
 * person reading it is a French control officer.
 *
 * ⚑ Grey, not amber (founder, 2026-09-01): on a document handed to a police officer a
 * coloured line reads as a warning about the document. This is a fact about the copy.
 */
export function SavedCopyStamp({ missionId }: { missionId: string }) {
  const savedAt = useSavedCopy(missionId);
  if (savedAt === null) return null;
  return (
    <p className="wb-stamp">
      {savedAt
        ? `Copie enregistrée le ${frDateTime(savedAt)}.`
        : "Copie enregistrée sur cet appareil."}
    </p>
  );
}
