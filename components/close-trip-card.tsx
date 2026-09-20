"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClockAlert } from "lucide-react";
import { answerClose } from "@/app/(app)/rides/actions";
import { formatMoney } from "@/lib/format";

// § Q slice 2 — the Driver answers "what happened to this trip?".
//
// Shown only on a trip past its expected end that is still open. Built on the
// D61 check-in card's shape (amber block, one filled button) because it is the
// same kind of thing: a prompt with exactly one obvious action.
//
// TWO GROUPS, TWO CARDS, because we know two different things:
//   boarded → the Guest was in the car, so it happened. One button. A reminder.
//   never started → nothing was ever tapped. Two answers. A question.
//
// The fare is stated BEFORE the tap. It is the fare the Driver accepted, frozen
// at that moment (settledFare), and closing late does not change it by a cent —
// but a Driver closing a trip from three weeks ago deserves to see the number
// they are agreeing to rather than take it on trust.
//
// ⚑ The waiting sentence is not boilerplate. Waiting is only ever measured from
// an Arrived tap; on a trip that was never run in the app there is nothing to
// measure, and settling it retrospectively would invent the ceiling every time.
// Saying so plainly beats a Driver discovering a missing 40 € later.
export function CloseTripCard({
  missionId,
  boarded,
  fare,
  line,
  businessName,
}: {
  missionId: string;
  /** The Guest was on board — the trip ran, so the only question is closing it. */
  boarded: boolean;
  fare: number;
  /** "Should have finished 35 minutes ago." — computed on the server. */
  line: string;
  /**
   * The Business's own name. This is the one tap on the screen that can't be
   * undone, so the confirm names who it goes to rather than saying "them" —
   * and never "the hotel", which is one of nine types (glossary rule 1).
   */
  businessName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function answer(a: "driven" | "not_driven") {
    setError(null);
    startTransition(async () => {
      const res = await answerClose(missionId, a);
      if (res.ok) router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div className="dcheck">
      <p className="dcheck__t">
        <ClockAlert size={16} strokeWidth={1.75} aria-hidden="true" /> {line}
      </p>

      {error && (
        <div className="notice error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {boarded ? (
        <>
          <p className="dcheck__s">
            Closing it settles {formatMoney(fare)} — the fare you accepted. Waiting isn’t included:
            it’s only counted from an Arrived tap.
          </p>
          <button
            type="button"
            className="dcheck__btn"
            onClick={() => answer("driven")}
            disabled={pending}
          >
            {pending ? "Closing…" : "Yes, I dropped the Guest"}
          </button>
        </>
      ) : confirming ? (
        <>
          {/* The second tap exists because this one can't be undone from the app:
              it tells the Business their trip never happened, and they act on it. */}
          <p className="dcheck__s">
            This tells {businessName ?? "the Business"} the trip never took place. Nothing is
            charged either way, and they’ll call you to agree what happened.
          </p>
          <button
            type="button"
            className="dcheck__btn"
            onClick={() => answer("not_driven")}
            disabled={pending}
          >
            {pending ? "Sending…" : "Confirm — it didn’t happen"}
          </button>
          <button
            type="button"
            className="dquiet"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            Back
          </button>
        </>
      ) : (
        <>
          <p className="dcheck__s">
            If you drove it, closing settles {formatMoney(fare)} — the fare you accepted. Waiting
            isn’t included: it’s only counted from an Arrived tap.
          </p>
          <button
            type="button"
            className="dcheck__btn"
            onClick={() => answer("driven")}
            disabled={pending}
          >
            {pending ? "Closing…" : "Yes, I drove it"}
          </button>
          <button
            type="button"
            className="dquiet"
            onClick={() => setConfirming(true)}
            disabled={pending}
          >
            It didn’t happen
          </button>
        </>
      )}
    </div>
  );
}
