"use client";

// S83 — the Business raises its own Ceiling on a trip still in the Pool. The five
// rules live in lib/ceiling-raise.ts. Everything typed and shown here is the
// Business ALL-IN (docs/06 §3); the Course is what the curve runs on, so the typed
// figure goes through the trip's OWN saved rates, never today's.
//
// ⚑ PREVIEW STAGE: with no `action`, confirming saves nothing and says so.

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { commissionSplit, courseFromBusinessTotal, type Rates } from "@/lib/commission";
import { currentFare, type PdpInputs } from "@/lib/pdp";
import { fareAfterRaise } from "@/lib/ceiling-raise";
import { formatMoney } from "@/lib/format";
import { deadlineWords } from "@/lib/dispatch-status";

type Props = {
  pdp: PdpInputs;
  rates: Rates | null;
  /** When the climb tops out — already passed on a trip at its Ceiling. */
  topsOutAt: string;
  atCeiling: boolean;
  action?: (fd: FormData) => void | Promise<void>;
};

const decimalOnly = (s: string) => s.replace(",", ".").replace(/[^\d.]/g, "");

export function RaiseCeilingPanel({ pdp, rates, topsOutAt, atCeiling, action }: Props) {
  const [value, setValue] = useState("");
  const [step, setStep] = useState<"edit" | "confirm" | "done">("edit");

  const allIn = (course: number) => commissionSplit(course, rates).businessTotal;
  const nowCeiling = allIn(Number(pdp.ceiling));
  const typed = Number(value);
  const hasValue = value !== "" && Number.isFinite(typed) && typed > 0;
  const course = hasValue ? courseFromBusinessTotal(typed, rates) : 0;
  const newCeiling = hasValue ? allIn(course) : 0;
  const higher = hasValue && Math.round(newCeiling * 100) > Math.round(nowCeiling * 100);
  // The booking form's own rule (mission-form.tsx `snapped`): ~1 all-in value in 8 is out
  // of reach of a whole cent of Course, and lands a cent UNDER — never over, a maximum is a
  // promise — and the form says so in the same words.
  const snapped = higher && Math.round(newCeiling * 100) !== Math.round(typed * 100);

  // Computed only once something is typed, i.e. on the client — so the server
  // render and the first client render never disagree about the clock.
  const now = new Date();
  const priceNow = hasValue ? allIn(currentFare(pdp, now)) : 0;
  const priceAfter = higher ? allIn(fareAfterRaise(pdp, course, now)) : 0;
  const when = deadlineWords(topsOutAt, now.getTime());

  // ⚑ THE BUSINESS'S OWN NUMBER, named as the row names it ("Auction"). Never "Drivers
  // will see €X": this is the all-in, fee included, and a Driver is shown their own share
  // of the Course — a different, smaller figure.
  // ⚑ AND NEVER "goes up straight away" when it doesn't. Before the climb starts, and on
  // its first step, the price is the opening price, which a raise does not move (lib/pdp.ts
  // currentFare, u ≤ 0 and steps[0] = 0) — so the sentence says what actually happens.
  const effect = atCeiling
    ? `The auction price goes from ${formatMoney(priceNow)} to ${formatMoney(priceAfter)} straight away.`
    : priceAfter > priceNow
      ? `The auction price goes from ${formatMoney(priceNow)} to ${formatMoney(priceAfter)} now, and climbs to ${formatMoney(newCeiling)} by ${when}.`
      : `The auction price stays at ${formatMoney(priceNow)} for now, and climbs to ${formatMoney(newCeiling)} by ${when} instead of ${formatMoney(nowCeiling)}.`;

  if (step === "done") {
    return (
      <p className="rc__done">
        {action
          ? `Ceiling raised to ${formatMoney(newCeiling)}.`
          : "Preview only — nothing was saved."}
      </p>
    );
  }

  if (step === "confirm") {
    return (
      <div className="rc">
        <p className="rc__confirm">
          Raise your Ceiling from <b>{formatMoney(nowCeiling)}</b> to <b>{formatMoney(newCeiling)}</b>?{" "}
          {effect} You can raise it again later, but not lower it.
        </p>
        <form
          className="dx-amend__actions"
          action={action}
          onSubmit={action ? undefined : (e) => { e.preventDefault(); setStep("done"); }}
        >
          <input type="hidden" name="mission_id" value={pdp.id} />
          <input type="hidden" name="ceiling" value={newCeiling.toFixed(2)} />
          <button type="submit" className="dx-amend__btn dx-amend__btn--primary">
            Confirm raise
          </button>
          <button type="button" className="dx-amend__link" onClick={() => setStep("edit")}>
            Back
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rc">
      <label className="field rc__field">
        <span>New Ceiling € — everything in</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={`More than ${formatMoney(nowCeiling)}`}
          aria-invalid={(hasValue && !higher) || undefined}
          onChange={(e) => setValue(decimalOnly(e.target.value))}
        />
      </label>
      <p className={`rc__effect${hasValue && !higher ? " rc__effect--warn" : ""}`}>
        {!hasValue
          ? `Current Ceiling: ${formatMoney(nowCeiling)}.`
          : !higher
            ? `Enter more than ${formatMoney(nowCeiling)} — a Ceiling can be raised, not lowered.`
            : snapped
              ? `${effect} Rounded down from ${formatMoney(typed)} so the three lines bill exactly.`
              : effect}
      </p>
      <div className="dx-amend__actions">
        <button
          type="button"
          className="dx-amend__btn dx-amend__btn--primary"
          disabled={!higher}
          onClick={() => setStep("confirm")}
        >
          {higher ? `Raise to ${formatMoney(newCeiling)}` : "Raise the Ceiling"}
        </button>
      </div>
    </div>
  );
}

/**
 * The always-there door, for a trip still climbing: a tile beside "Edit details"
 * that opens the same panel. The founder's reason for it (2026-09-18): *"in case they
 * made a mistake or they realize the price was too low"* — no need to wait for the top.
 */
export function RaiseCeilingAction(props: Omit<Props, "atCeiling">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="dx-act dx-act--btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dx-act__t">
          <TrendingUp size={14} aria-hidden /> Raise the Ceiling
        </span>
        <span className="dx-act__s">The auction climbs to a higher top · can’t be lowered</span>
      </button>
      {open && (
        <div className="rc-wrap">
          <RaiseCeilingPanel {...props} atCeiling={false} />
        </div>
      )}
    </>
  );
}
