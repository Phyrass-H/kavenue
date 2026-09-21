"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { checkIn } from "@/app/(app)/rides/actions";
import { formatTime } from "@/lib/format";

// D61 — the Driver's check-in, on the trip's own page.
//
// Two states, and they are deliberately very different in weight. OPEN is a
// prompt worth acting on: an amber block with the one filled button on the
// screen while it's showing. DONE collapses to a single quiet line — the card
// goes back to being about the trip, and the screen returns to having exactly
// one filled button ([[d52]]).
//
// No countdown text. A live "pickup in 2h 47m" would need the client's clock and
// re-render, which is how S33 shipped a hydration mismatch; the pickup time is
// already at the top of this card, so the number would be redundant anyway.
export function CheckInCard({
  missionId,
  open,
  checkedInAt,
  businessName,
}: {
  missionId: string;
  /** Check-in is live: confirmed, not yet checked in, inside the T-180 window. */
  open: boolean;
  checkedInAt: string | null;
  /**
   * The Business's own name, so the prompt says WHO is waiting on the tap.
   * Glossary rule 1: never "the hotel" for a Business — a Business is any of the
   * nine types, and one of them is a VTC operator posting its overflow.
   */
  businessName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (checkedInAt) {
    return (
      <p className="dcheck__done">
        <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
        Checked in at {formatTime(checkedInAt)}
      </p>
    );
  }

  if (!open) return null;

  function go() {
    setError(null);
    startTransition(async () => {
      const res = await checkIn(missionId);
      if (res.ok) router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div className="dcheck">
      <p className="dcheck__t">
        Check in so {businessName ?? "the Business"} knows you’ll be there.
      </p>
      {error && (
        <div className="notice error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}
      <button type="button" className="dcheck__btn" onClick={go} disabled={pending}>
        {pending ? "Checking in…" : "Check in"}
      </button>
    </div>
  );
}
