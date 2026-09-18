"use client";

// S83 — a Business changes the car on its own trip while it is still in the Pool.
// Founder, 2026-09-18: *"they can change at any time for any reasons before Driver takes it
// and update the price based on the new selection."*
//
// The picker is the booking form's own (ServiceClassFields). The price follows the rate
// card for the new class and body: a new floor, and the new market Ceiling pre-filled — the
// Business may change it, never below the floor. Make and model never move the price (the
// card has no row for them), and "Any" body prices as Sedan, so many changes leave the price
// exactly where it is — the panel says so and asks for no number.
//
// Everything typed and shown is the Business ALL-IN; the Course is converted with the
// trip's OWN saved rates (docs/06 §3, the same rule as the raise).
//
// With no `onChange` (the dev-only preview page) confirming saves nothing and says so.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/(dispatch)/dispatch/actions";
import { Car } from "lucide-react";
import { ServiceClassFields } from "@/components/service-class-fields";
import { commissionSplit, courseFromBusinessTotal, type Rates } from "@/lib/commission";
import { currentFare, type PdpInputs } from "@/lib/pdp";
import { withNewOffer } from "@/lib/ceiling-raise";
import { exactFloorAllIn, isMarketRate, priceFor, rateCardFor, type RateCardRow } from "@/lib/rate-card";
import type { ServiceTier, BodyType } from "@/lib/vehicle-catalog";
import { seatCap, SEDAN_SEATS } from "@/lib/passengers";
import { deadlineWords } from "@/lib/dispatch-status";
import { formatMoney, serviceClassLabel } from "@/lib/format";

export type CarChoice = { tier: ServiceTier; body: BodyType | null; make: string; model: string };

type Props = {
  pdp: PdpInputs;
  rates: Rates | null;
  rateCard: RateCardRow[];
  current: CarChoice;
  distanceKm: number | null;
  night: boolean;
  paxCount: number | null;
  topsOutAt: string;
  /** The server action, bound to this trip. `ceilingAllIn` is null when the price does not move. */
  onChange?: (car: CarChoice, ceilingAllIn: number | null) => Promise<ActionResult>;
};

const decimalOnly = (s: string) => s.replace(",", ".").replace(/[^\d.]/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The car in the same words as the row and the history line ("Business", "First · Sedan · Audi A8"). */
export function carLabel(c: CarChoice): string {
  const base = serviceClassLabel(c.tier, c.body);
  return c.make && c.model ? `${base} · ${c.make} ${c.model}` : base;
}

export function ChangeCarPanel(p: Props) {
  const [choice, setChoice] = useState<CarChoice>(p.current);
  const [ceiling, setCeiling] = useState("");
  const [step, setStep] = useState<"edit" | "confirm" | "done">("edit");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allIn = (course: number) => commissionSplit(course, p.rates).businessTotal;
  const nowCeiling = allIn(Number(p.pdp.ceiling));

  const changed =
    choice.tier !== p.current.tier ||
    choice.body !== p.current.body ||
    choice.make !== p.current.make ||
    choice.model !== p.current.model;

  // Does the price move? Only when the rate-card ROW differs (class, or a body the card
  // prices apart). The row, not the words: "Any" and "Sedan" are one row.
  const oldRow = rateCardFor(p.rateCard, p.current.tier, p.current.body);
  const newRow = rateCardFor(p.rateCard, choice.tier, choice.body);
  const priceMoves = !!newRow && oldRow?.id !== newRow.id;
  const quote = priceMoves ? priceFor(p.rateCard, choice.tier, choice.body, p.distanceKm, { night: p.night }) : null;
  // ⚑ The floor to the cent as change_trip_car computes it (lib/rate-card exactFloorAllIn), never
  //   the float — at a half cent the two can round apart and the panel would pass a Ceiling the
  //   database refuses (review, S83).
  const floorOf = (c: CarChoice) =>
    exactFloorAllIn(p.rateCard, c.tier, c.body, p.distanceKm, { night: p.night });
  const floor = priceMoves ? floorOf(choice) : null;

  // Re-price when the class or body changes — the booking form's own rule — and never when the
  // panel merely opens. ⚑ To a DEARER car (its floor at or above the old one's) the default is
  // never below the Ceiling the Business already has: a raised trip must not quietly lose its
  // raise by picking a better car. To a cheaper car, the new market Ceiling — the price follows.
  function pick(next: CarChoice) {
    const rowNext = rateCardFor(p.rateCard, next.tier, next.body);
    const q = rowNext && rowNext.id !== oldRow?.id
      ? priceFor(p.rateCard, next.tier, next.body, p.distanceKm, { night: p.night })
      : null;
    if (next.tier !== choice.tier || next.body !== choice.body) {
      const oldFloor = floorOf(p.current);
      const newFloor = floorOf(next);
      const dearer = oldFloor != null && newFloor != null && newFloor >= oldFloor;
      const market = q ? round2(q.ceiling) : null;
      setCeiling(market == null ? "" : (dearer ? Math.max(market, nowCeiling) : market).toFixed(2));
    }
    setChoice(next);
  }

  const typed = Number(ceiling);
  const hasCeiling = ceiling !== "" && Number.isFinite(typed) && typed > 0;
  const belowFloor = priceMoves && hasCeiling && floor != null && Math.round(typed * 100) < Math.round(floor * 100);
  const atMarket = priceMoves && hasCeiling && isMarketRate(typed, quote);
  const belowMarket = priceMoves && hasCeiling && !belowFloor && quote != null && !atMarket && typed < quote.ceiling;
  const tooManyGuests = choice.body === "sedan" && (p.paxCount ?? 0) > seatCap("sedan");
  const noPrice = priceMoves && quote == null;

  const newCourse = priceMoves && hasCeiling ? courseFromBusinessTotal(typed, p.rates) : Number(p.pdp.ceiling);
  const newStart = priceMoves && floor != null ? courseFromBusinessTotal(floor, p.rates) : p.pdp.pdp_start;
  const now = new Date();
  // Exactly what change_trip_car stores: the new terms, the step count frozen as the SQL
  // freezes it. With the steps fixed, a dearer car (floor and Ceiling both up) can never
  // read cheaper at any instant; a cheaper car can, and should.
  const offer: PdpInputs = priceMoves
    ? withNewOffer(p.pdp, { ceiling: newCourse, pdp_start: newStart }, now)
    : p.pdp;
  const priceNow = allIn(currentFare(p.pdp, now));
  const priceAfter = allIn(currentFare(offer, now));
  const newCeilingAllIn = allIn(newCourse);
  const when = deadlineWords(p.topsOutAt, now.getTime());
  // Past the top of the climb there is no "Top … at <time>" to promise: the price is already there.
  const topped = now.getTime() >= Date.parse(p.topsOutAt);

  const ready = changed && !tooManyGuests && !noPrice && (!priceMoves || (hasCeiling && !belowFloor));

  if (step === "done") {
    return <p className="rc__done">{p.onChange ? "Car changed." : "Preview only — nothing was saved."}</p>;
  }

  if (step === "confirm") {
    return (
      <div className="rc">
        <p className="rc__confirm">
          Change to <b>{carLabel(choice)}</b>?
          {priceMoves && (
            <>
              <br />
              Price now: {formatMoney(priceNow)} → {formatMoney(priceAfter)}
              <br />
              Ceiling: {formatMoney(nowCeiling)} → {formatMoney(newCeilingAllIn)}
            </>
          )}
        </p>
        {error && <div className="notice error" style={{ margin: "10px 0 0" }}>{error}</div>}
        <div className="dx-amend__actions">
          <button
            type="button"
            className="dx-amend__btn dx-amend__btn--primary"
            disabled={pending}
            onClick={() => {
              if (!p.onChange) return setStep("done");
              const onChange = p.onChange;
              setError(null);
              startTransition(async () => {
                const res = await onChange(choice, priceMoves ? newCeilingAllIn : null);
                if (res.ok) {
                  setStep("done");
                  router.refresh();
                } else setError(res.message);
              });
            }}
          >
            {pending ? "Changing…" : "Confirm change"}
          </button>
          <button type="button" className="dx-amend__link" disabled={pending} onClick={() => setStep("edit")}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rc cc">
      <ServiceClassFields
        compact
        defaults={{ category: p.current.tier, body: p.current.body, make: p.current.make, model: p.current.model }}
        onTierChange={(tier) => pick({ ...choice, tier, make: "", model: "" })}
        onBodyChange={(b) => pick({ ...choice, body: b || null, make: "", model: "" })}
        onCarChange={(make, model) => setChoice((c) => ({ ...c, make, model }))}
      />

      {tooManyGuests && (
        <div className="notice error" style={{ margin: "10px 0 0" }}>
          A Sedan seats {SEDAN_SEATS} — this trip has {p.paxCount} Guests.
        </div>
      )}

      {changed && !tooManyGuests && !priceMoves && (
        <p className="rc__effect">Same price — your Ceiling stays {formatMoney(nowCeiling)}.</p>
      )}

      {changed && priceMoves && noPrice && (
        <div className="notice error" style={{ margin: "10px 0 0" }}>
          This trip has no distance on record, so the new price can’t be worked out.
        </div>
      )}

      {changed && priceMoves && quote && (
        <>
          <label className="field rc__field" style={{ marginTop: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              New Ceiling €
              {atMarket && <span className="mx-vehiclechip" style={{ marginLeft: "auto" }}>Market rate</span>}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={ceiling}
              aria-invalid={belowFloor || undefined}
              onChange={(e) => setCeiling(decimalOnly(e.target.value))}
            />
          </label>
          {belowFloor && floor != null && (
            <div className="notice error" style={{ margin: "10px 0 0" }}>
              The lowest this trip can be offered at is <strong>{formatMoney(floor)}</strong>.
            </div>
          )}
          {belowMarket && (
            <div className="notice warn" style={{ margin: "10px 0 0" }}>
              Below the market rate of {formatMoney(round2(quote.ceiling))}. It will take longer to find a Driver.
            </div>
          )}
          {hasCeiling && !belowFloor && (
            <p className="rc__effect">
              Price now: {formatMoney(priceNow)} → {formatMoney(priceAfter)}
              {!topped && (
                <>
                  <br />
                  Top: {formatMoney(newCeilingAllIn)} at {when}
                </>
              )}
            </p>
          )}
        </>
      )}

      <div className="dx-amend__actions">
        <button
          type="button"
          className="dx-amend__btn dx-amend__btn--primary"
          disabled={!ready}
          onClick={() => setStep("confirm")}
        >
          Change the car
        </button>
      </div>
    </div>
  );
}

/** The door: a tile beside "Edit details", or a plain button inside the "No car match" card. */
export function ChangeCarAction({ variant = "tile", ...props }: Props & { variant?: "tile" | "button" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "tile" ? (
        <button type="button" className="dx-act dx-act--btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="dx-act__t">
            <Car size={14} aria-hidden /> Change the car
          </span>
          <span className="dx-act__s">Class, body or model</span>
        </button>
      ) : (
        <div className="dx-amend__actions">
          <button type="button" className="dx-amend__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Change the car
          </button>
        </div>
      )}
      {open && (
        <div className={variant === "tile" ? "rc-wrap" : "rc-inline"}>
          <ChangeCarPanel {...props} />
        </div>
      )}
    </>
  );
}
