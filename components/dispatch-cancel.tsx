"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, RefreshCw, AlertTriangle, Phone, Clock, Lock } from "lucide-react";
import { businessCancelMission, reclaimMission } from "@/app/(dispatch)/dispatch/actions";
import {
  businessCancelPct,
  cancelFeeAmount,
  nextCancelRaise,
  waitingBetween,
  waitingRatePerMin,
} from "@/lib/cancellation";
import { commissionSplit, type Rates } from "@/lib/commission";
import type { VehicleCategory } from "@/lib/database.types";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { parisDayKey } from "@/lib/dispatch-status";

// How long until `iso`, in the plainest words that are still precise enough to act on.
// Under a minute we count seconds, because that is exactly when someone is deciding.
//
// FLOOR, never round: this is a deadline with money on the other side of it, so the number
// must never claim more time than there is. Rounding to the nearest minute overstated by up
// to 30 s (at 1 min 30 s left it read "in 2 min"), which is exactly long enough for someone
// to act on it and cross the boundary. Understating is harmless; overstating costs 5 points.
function untilWords(iso: string, now: number): string {
  const secs = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));
  if (secs < 60) return `in ${secs} sec`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

// A deadline shown as a bare "04:00" reads as today. The ramp only bites inside the last
// five hours, but the FREE state's deadline is 5 h before pickup and a trip can be booked
// days out — so "Free until 04:00" could mean a time eleven hours in the past. Show the date
// too whenever the deadline is not today.
function deadlineWords(iso: string, now: number): string {
  return parisDayKey(iso) === parisDayKey(new Date(now)) ? formatTime(iso) : formatDateTime(iso);
}

// The fee ramp, for the reference row in the cancel modal. Free >5h, then 50% at −5h
// climbing +10%/h to 100% at pickup (mirrors businessCancelPct / the SQL).
// ⚑ The real rule steps every HALF hour; these hourly columns are the landmarks on that
// staircase and are each exactly right — the tread boundaries in between are shown by the
// live "next raise" line instead, which is the one a Business actually acts on.
const RAMP = [
  { label: ">5h", pct: 0 },
  { label: "5h", pct: 50 },
  { label: "4h", pct: 60 },
  { label: "3h", pct: 70 },
  { label: "2h", pct: 80 },
  { label: "1h", pct: 90 },
  { label: "0", pct: 100 },
];

// Business "Cancel trip" (O7, D45): a button that opens a modal showing the LIVE cost by
// time-to-pickup (free while pooled / >5h, then the ramp), then the terminal cancel.
export function BusinessCancel({
  missionId,
  fare,
  rates,
  category,
  pickupAtIso,
  hasDriver,
  waitingFromIso = null,
  waitingUntilIso = null,
}: {
  missionId: string;
  /** COURSE, like everything stored — converted for display by `allIn` below. */
  fare: number;
  /** The mission's commission snapshot. NULL on a trip priced before commission. */
  rates: Rates | null;
  /** The service class — it sets the waiting rate per minute (docs/06 §10). */
  category: VehicleCategory;
  pickupAtIso: string;
  hasDriver: boolean;
  /**
   * D48 — the running meter, passed only while the Driver is on site ('arrived'), which is
   * exactly when business_cancel_mission also settles it. Without these the modal quoted the
   * cancellation fee alone while the RPC billed fee + waiting: measured live at 47,99 €
   * quoted against 64,99 € charged. The button has to name the whole amount it commits to.
   */
  waitingFromIso?: string | null;
  waitingUntilIso?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Clock only while the modal is open (client-only → no hydration concern; the modal
  // is opened by a click).
  //
  // Every SECOND, not every 30 — but note what that is for. The fee itself is a half-hour
  // step, so it does not move between ticks; what moves is the COUNTDOWN to the next raise,
  // and a countdown that jumps 30 seconds at a time is worse than none. The one moment the
  // fee does change, the second-tick makes it change on screen the instant it changes in the
  // database, which is the whole point of dropping the slope.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [open]);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const res = await businessCancelMission(missionId, reason);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  const hours = now != null ? (new Date(pickupAtIso).getTime() - now) / 3_600_000 : 0;
  const pct = businessCancelPct(hours, hasDriver);
  const feeAmount = cancelFeeAmount(fare, pct);

  // What the RPC will ACTUALLY charge: the policy fee plus whatever the meter has run.
  const wait =
    waitingFromIso && waitingUntilIso && now != null
      ? waitingBetween(
          Date.parse(waitingFromIso),
          Date.parse(waitingUntilIso),
          now,
          waitingRatePerMin(category),
        )
      : { minutes: 0, fee: 0 };
  // ALL IN — the only basis a Business is ever shown (docs/06 §1). Both halves of
  // this total carry commission: the cancellation compensation ("a €90 fee becomes
  // €103,50 paid") and the waiting meter. The WaitingPanel behind this modal already
  // converted; this one did not, so the same minute was quoted at 1,00 € here and
  // 1,15 € there. NULL rates (priced before commission) pass straight through.
  //
  // Converted PART BY PART, not once over the sum, so the split under the headline
  // always adds up to the headline — a cent of drift against a future invoice line
  // matters less than a total that does not reconcile on screen.
  const allIn = (gross: number) => commissionSplit(gross, rates).businessTotal;
  const shownFare = allIn(fare);
  const shownFee = allIn(feeAmount);
  const shownWait = allIn(wait.fee);
  // What the RPC charges is `feeAmount + wait.fee` in Course space; this is the
  // same total on the Business's side of the commission.
  const shownTotal = shownFee + shownWait;
  // ⚑ "Free" has to mean free of EVERYTHING, not free of the percentage. The meter runs from
  // the Guest's due moment, and `guest_ready_at` is the tracked landing instant — so an early
  // flight can start the meter while pickup is still hours away and the percentage is 0.
  const free = pct === 0 && wait.fee === 0;
  const activeIdx = !hasDriver || hours > 5 ? 0 : hours <= 0 ? 6 : Math.min(6, 6 - Math.ceil(hours));

  // The deadline, not just the price. A half-hour step is only safe if you can SEE the edge
  // coming — otherwise someone cancels two minutes late and pays five points more with no
  // warning. `null` once there is nothing left to rise to (already 100%, or no Driver).
  const raise = now != null ? nextCancelRaise(hours, hasDriver) : null;
  const raiseAtIso = raise
    ? new Date(new Date(pickupAtIso).getTime() - raise.atHoursToPickup * 3_600_000).toISOString()
    : null;
  const raiseFee = raise ? allIn(cancelFeeAmount(fare, raise.pct)) : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "#fff",
          color: "var(--tone-danger-fg)",
          border: "0.5px solid #fbd9d4",
          borderRadius: 8,
          padding: "9px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Ban size={14} aria-hidden /> Cancel trip
      </button>

      {open && (
        <div
          onClick={() => !pending && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 460, maxWidth: "94vw", background: "#fff", borderRadius: 14, padding: 20, boxSizing: "border-box" }}
          >
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)" }}>Cancel this trip?</div>

            {now == null ? (
              <p className="muted small" style={{ marginTop: 12 }}>Calculating…</p>
            ) : free ? (
              <div style={{ background: "var(--tone-success-bg)", borderRadius: 10, padding: 14, margin: "12px 0" }}>
                <div style={{ color: "var(--tone-success-fg)", fontWeight: 600 }}>Free to cancel</div>
                <div style={{ color: "var(--tone-success-fg)", fontSize: 13, marginTop: 4 }}>
                  {hasDriver
                    ? "More than 5 hours before pickup — no fee."
                    : "No Driver has taken this yet — no fee."}
                </div>
                {raise && raiseAtIso && (
                  <div style={{ color: "var(--tone-success-fg)", fontSize: 12.5, marginTop: 8, opacity: 0.9 }}>
                    Free until <strong style={{ fontWeight: 600 }}>{deadlineWords(raiseAtIso, now)}</strong> — then{" "}
                    {raise.pct}% ({formatMoney(raiseFee)}), {untilWords(raiseAtIso, now)}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ background: "var(--tone-danger-bg)", borderRadius: 10, padding: 14, margin: "12px 0" }}>
                  <div style={{ color: "var(--tone-danger-fg)", fontSize: 13 }}>Cancelling now costs</div>
                  {/* With a meter running the headline is the TOTAL, because that is what
                      the RPC charges. Leading with the percentage would repeat the old lie
                      in bigger type: it quoted 47,99 € on a trip that settled 64,99 €. The
                      split goes underneath so the total is still explainable. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                    {wait.fee > 0 ? (
                      <span style={{ fontSize: 26, fontWeight: 600, color: "var(--tone-danger-fg)" }}>{formatMoney(shownTotal)}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 26, fontWeight: 600, color: "var(--tone-danger-fg)" }}>{Math.round(pct)}%</span>
                        <span style={{ fontSize: 18, fontWeight: 600, color: "var(--tone-danger-fg)" }}>{formatMoney(shownFee)}</span>
                        <span style={{ fontSize: 12, color: "var(--tone-danger-fg)" }}>of {formatMoney(shownFare)}</span>
                      </>
                    )}
                  </div>
                  {wait.fee > 0 && (
                    <div style={{ color: "var(--tone-danger-fg)", fontSize: 12.5, marginTop: 4, opacity: 0.9 }}>
                      {Math.round(pct)}% of {formatMoney(shownFare)} = {formatMoney(shownFee)} · plus{" "}
                      {formatMoney(shownWait)} waiting ({wait.minutes} min)
                    </div>
                  )}
                  {/* The percentage HOLDS until the moment below — that is the deal the step
                      buys. Say when it ends, what it becomes, and how long that is.
                      ⚑ The WAITING does not hold: it is the one part of this total still
                      moving, €1 every minute, so the promise has to be scoped to the
                      percentage whenever a meter is running. Saying "billed on top" here
                      was right while the headline showed the fee alone and became wrong the
                      moment the headline became the total. */}
                  <div style={{ color: "var(--tone-danger-fg)", fontSize: 12.5, marginTop: 8, opacity: 0.9 }}>
                    {raise && raiseAtIso ? (
                      <>
                        {wait.fee > 0 ? "The percentage holds until " : "This price holds until "}
                        <strong style={{ fontWeight: 600 }}>{deadlineWords(raiseAtIso, now)}</strong> — then {raise.pct}% (
                        {formatMoney(raiseFee + shownWait)}), {untilWords(raiseAtIso, now)}
                      </>
                    ) : (
                      "The percentage stops here — it cannot go above 100%."
                    )}
                    {wait.fee > 0 && (
                      <>
                        <br />
                        The waiting keeps running at {formatMoney(allIn(waitingRatePerMin(category)))}/min until you
                        confirm.
                      </>
                    )}
                  </div>
                </div>
                <div className="muted small" style={{ marginBottom: 6 }}>How the percentage grows as pickup nears</div>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {RAMP.map((b, i) => {
                    const on = i === activeIdx;
                    return (
                      <div
                        key={b.label}
                        style={{
                          flex: b.pct === 0 ? 1.4 : 1,
                          textAlign: "center",
                          padding: "7px 2px",
                          borderRadius: 8,
                          background: on
                            ? "var(--tone-danger-fg)"
                            : b.pct === 0
                              ? "var(--tone-success-bg)"
                              : "var(--tone-danger-bg)",
                        }}
                      >
                        <div style={{ fontSize: 11, color: on ? "#fde8e5" : b.pct === 0 ? "var(--tone-success-fg)" : "var(--tone-danger-fg)" }}>
                          {on ? "now" : b.label}
                        </div>
                        {/* The highlighted cell prints the LIVE pct, not the column's.
                            activeIdx buckets by whole hours, so at T−4h18 it lit the "5h"
                            column and printed 50% while the headline said 55% — two prices
                            24 € apart on one card, for half of every hour of the ramp. The
                            column values are all correct as landmarks; only the cell that
                            claims to be "now" has to agree with the number above it. */}
                        <div style={{ fontSize: 13, fontWeight: 600, color: on ? "#fff" : b.pct === 0 ? "var(--tone-success-fg)" : "var(--tone-danger-fg)" }}>
                          {on ? (pct === 0 ? "Free" : `${pct}%`) : b.pct === 0 ? "Free" : `${b.pct}%`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* The Driver reads this in their history, so say so HERE — writing it
                under one expectation and showing it under another isn't ours to do. */}
            <label
              htmlFor="cancel-reason"
              style={{
                display: "block",
                marginTop: 12,
                marginBottom: 6,
                fontSize: 11.5,
                color: "var(--text-muted)",
              }}
            >
              Reason (optional) — your Driver will see this
            </label>
            <input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Guest’s flight was cancelled…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "9px 10px",
                border: "0.5px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: 13,
              }}
            />

            {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                style={{ flex: 1, background: "#fff", color: "var(--text-muted)", border: "0.5px solid var(--border-strong)", borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={pending || now == null}
                style={{ flex: 1.4, background: "var(--tone-danger-fg)", color: "#fff", border: "none", borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                {/* `hours` falls back to 0 before the clock initialises, which reads as
                    "pickup is now" → 100 %. The body says "Calculating…" but the button was
                    already painting the full fare, so the first frame of a FREE cancel could
                    flash "Cancel — accept 480,00 €". Say nothing until the clock is real. */}
                {pending
                  ? "…"
                  : now == null
                    ? "Cancel trip"
                    : free
                      ? "Cancel trip"
                      : `Cancel — accept ${formatMoney(shownTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// The reclaim card (O7, D45; re-gated 2026-08-24, D86): the Business takes a trip
// back from a Driver who is holding it and has never checked in.
//
// ⚑ IT RENDERED FOR NOBODY UNTIL 2026-08-24. Both this card and reclaim_mission
// were gated on `status = 'accepted'`, which has not existed since Option A/D55 —
// 0 of 280 missions and 0 of 715 status transitions on the live DB. The gate is
// now `confirmed AND never checked in`, and the window T−2h rather than T−60min.
//
// Three states. ⚑ Every time decision is made on the SERVER and passed in: this
// is a client component, so computing `now` here would be a hydration mismatch.
//   • locked — check-in is open, reclaim is not yet. The button names its unlock
//     time so the Dispatcher sees it coming and rings the Driver first.
//   • live   — amber, matching the row's own "Not checked in" tone at T−3h…T−1h.
//   • urgent — red inside T−1h, where the row escalates too. Calling becomes the
//     primary button; re-pooling stays available, it just stops being the default.
export function ReclaimCard({
  missionId,
  driverName,
  driverPhone,
  canReclaim,
  unlockAt,
  urgent,
}: {
  missionId: string;
  driverName: string;
  driverPhone: string | null;
  canReclaim: boolean;
  unlockAt: string | null;
  urgent: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reclaim() {
    setError(null);
    startTransition(async () => {
      const res = await reclaimMission(missionId);
      if (res.ok) router.refresh();
      else setError(res.message);
    });
  }

  // "Marc Dubois" → "Marc". The card is about a person the Dispatcher rings up,
  // not about a record.
  const firstName = driverName.split(" ")[0] || driverName;
  const fg = urgent ? "var(--tone-danger-fg)" : "var(--tone-warn-fg)";
  const bg = urgent ? "var(--tone-danger-bg)" : "var(--tone-warn-bg)";
  const edge = urgent ? "#f3c3bd" : "#f0c9a4";
  const btn = {
    borderRadius: 8,
    padding: "8px 13px",
    fontSize: 13,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } as const;

  return (
    <div style={{ background: bg, borderLeft: `3px solid ${fg}`, borderRadius: 0, padding: "13px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {urgent ? (
          <AlertTriangle size={18} style={{ color: fg, marginTop: 1, flexShrink: 0 }} aria-hidden />
        ) : (
          <Clock size={18} style={{ color: fg, marginTop: 1, flexShrink: 0 }} aria-hidden />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: fg, fontSize: 14 }}>
            {urgent
              ? `Pickup is within the hour and ${firstName} hasn’t checked in`
              : `${firstName} hasn’t checked in`}
          </div>
          {/* One line, and none at all on the red state — the heading already says it.
              ⚑ Do NOT reintroduce a claim about how empty the Pool is this late: the
              founder works this market and the Riviera is densely covered by Drivers
              (2026-08-24). ⚑ And do not tell the Dispatcher when they MAY act — an
              inexperienced one reads that as a process they must follow. The unlock
              time belongs on the button, where it reads as the control's own state. */}
          {canReclaim && !urgent && (
            <div style={{ color: fg, fontSize: 13, margin: "4px 0 11px" }}>
              Call {firstName} first — they may be driving. If you can’t reach them, take the trip back. No
              penalty to you.
            </div>
          )}
          {error && <div className="notice error" style={{ margin: "8px 0 10px" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: canReclaim && !urgent ? 0 : 11 }}>
            {driverPhone && (
              <a
                href={`tel:${driverPhone}`}
                style={{
                  ...btn,
                  textDecoration: "none",
                  background: urgent ? fg : "#fff",
                  color: urgent ? "#fff" : "var(--accent)",
                  border: urgent ? "none" : "0.5px solid var(--border-strong)",
                }}
              >
                <Phone size={14} aria-hidden /> Call {firstName}
              </a>
            )}
            {canReclaim ? (
              <button
                type="button"
                onClick={reclaim}
                disabled={pending}
                style={{ ...btn, background: "#fff", color: fg, border: `0.5px solid ${edge}`, cursor: "pointer" }}
              >
                <RefreshCw size={14} aria-hidden /> {pending ? "…" : "Take it back and re-pool"}
              </button>
            ) : (
              <button
                type="button"
                disabled
                style={{ ...btn, background: "var(--bg)", color: "var(--text-faint)", border: "0.5px solid var(--border)", cursor: "not-allowed" }}
              >
                <Lock size={14} aria-hidden /> Take it back · from {formatTime(unlockAt)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
