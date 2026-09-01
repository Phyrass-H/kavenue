"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Timer } from "lucide-react";
import { holdMission, releaseMissionHold, acceptMission } from "./actions";
import { HOLD_SECONDS, formatCountdown, secondsLeft } from "@/lib/hold";
import { formatMoney } from "@/lib/format";

type Props = {
  missionId: string;
  /** ISO instant this Driver's own live hold ends, or null. Server-computed. */
  myHoldExpiresAt: string | null;
  /** ISO instant SOMEONE ELSE's live hold ends, or null. Identity never crosses. */
  othersHoldExpiresAt: string | null;
  /** This Driver has already spent their one hold on this trip. */
  holdSpent: boolean;
  /** The fare they are being shown, so Confirm can name it. */
  netFare: number | null;
};

/**
 * § 7 — the hold, on the trip the Driver is looking at.
 *
 * ⚑ EVERY TIME DECISION IS MADE ON THE SERVER AND PASSED IN as an absolute instant. This is
 * a client component, so computing "now" during render would be a hydration mismatch — the
 * rule components/dispatch-cancel.tsx states outright and cancel-noshow.tsx implements. The
 * clock starts at null and the first frame shows no number at all, because a countdown that
 * flashes a wrong value for 200 ms is worse than one that appears a beat late.
 */
export function HoldControls({
  missionId,
  myHoldExpiresAt,
  othersHoldExpiresAt,
  holdSpent,
  netFare,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const mine = myHoldExpiresAt ? secondsLeft(myHoldExpiresAt, new Date(now ?? 0)) : 0;
  const theirs = othersHoldExpiresAt ? secondsLeft(othersHoldExpiresAt, new Date(now ?? 0)) : 0;
  const holding = now !== null && mine > 0;
  const blocked = now !== null && theirs > 0;

  // ⚑ WHEN A CLOCK HITS ZERO, ASK THE SERVER — do not just re-render. At 0:00 the truth
  // changes for BOTH Drivers at once (the trip returns to the Pool, the watcher's Accept
  // comes back), and only the server knows whether the holder confirmed in the last
  // half-second. One refresh, on the transition, on the detail page only — the Pool LIST
  // deliberately never polls.
  const [wasCounting, setWasCounting] = useState(false);
  useEffect(() => {
    const counting = holding || blocked;
    if (counting) setWasCounting(true);
    else if (wasCounting) {
      setWasCounting(false);
      router.refresh();
    }
  }, [holding, blocked, wasCounting, router]);

  // ⚑ LEAVING THE CARD RELEASES THE HOLD. Founder, S72: "if you leave the card you lose the
  // hold, period." This cleanup fires on any navigation away from the trip page.
  // ⚑ DELIBERATELY NOT on visibilitychange. On a phone a notification banner or a two-second
  // glance at the map counts as "hidden", and a Driver checking their route to decide has
  // not left the card — they are doing the exact thinking the hold exists for. The 15-second
  // clock covers that case anyway.
  useEffect(() => {
    if (!myHoldExpiresAt) return;
    return () => {
      if (Date.parse(myHoldExpiresAt) > Date.now()) void releaseMissionHold(missionId);
    };
  }, [missionId, myHoldExpiresAt]);

  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) (onOk ?? (() => router.refresh()))();
      else setError(res.message);
    });
  }

  if (blocked) {
    return (
      <div className="stack">
        <div className="hold-watch">
          <Timer size={14} strokeWidth={1.9} aria-hidden="true" />
          {/* The countdown is deliberate (docs/06:424): another Driver needs to know
              whether to wait or move on, and a bare "reserved" tells them nothing. */}
          Being reviewed{now !== null && ` · ${formatCountdown(theirs)}`}
        </div>
      </div>
    );
  }

  if (holding) {
    return (
      <div className="stack">
        {error && <div className="notice error">{error}</div>}
        <button
          className="dcta"
          disabled={pending}
          onClick={() =>
            run(
              () => acceptMission(missionId),
              () => {
                router.push("/rides");
                router.refresh();
              },
            )
          }
        >
          {pending
            ? "Confirming…"
            : netFare != null
              ? `Confirm at ${formatMoney(netFare)}`
              : "Confirm"}
        </button>
        <p className="hold-mine">
          <Lock size={13} strokeWidth={1.9} aria-hidden="true" />
          Held for you for {mine} second{mine === 1 ? "" : "s"}.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="notice error">{error}</div>}
      <button
        className="dcta"
        disabled={pending}
        onClick={() =>
          run(
            () => acceptMission(missionId),
            () => {
              router.push("/rides");
              router.refresh();
            },
          )
        }
      >
        {pending ? "Accepting…" : "Accept"}
      </button>

      {holdSpent ? (
        // ⚑ SAY IT, do not just remove the button. A control that vanishes reads as a bug,
        // and the fact is reassuring rather than punitive: the hold is spent, the trip is not.
        <p className="hold-spent">Hold used · you can still accept</p>
      ) : (
        <button
          className="dcta dcta--ghost"
          disabled={pending}
          onClick={() => run(() => holdMission(missionId))}
        >
          {pending ? "Holding…" : `Hold it ${HOLD_SECONDS} seconds`}
        </button>
      )}
    </div>
  );
}
