// § VAT — what rate does THIS LINE carry?
//
// ⚑ WHY THIS FILE EXISTS. Until 2026-09-02 the answer lived in one nullable
// number on the mission, `transport_vat_rate`, and that number answered two
// different questions at once:
//
//     "is this Driver VAT-registered?"        ← what it actually stored
//     "what rate does this kind of supply carry?"   ← what it was read as
//
// A trip whose transfer is 10 % and whose at-disposal hours are 20 % cannot be
// expressed by one number per mission at all. So the rate moves to the LINE.
//
// ⚑ AND THE TRAP THAT MADE THIS URGENT: "0 %" IS NOT A THING IN FRANCE.
// The rates are 20 · 10 · 5,5 · 2,1. Zero is not among them. A line carrying no
// VAT is in one of three OTHER states, and they are legally distinct — an
// e-invoice carries a category code per line, machine-read by the tax office
// since 1 September 2026, so picking the wrong one is a validation error rather
// than a cosmetic one:
//
//   franchise     the Driver is under *franchise en base*. In scope, no VAT
//                 charged, and the invoice MUST say so in those exact words.
//   out_of_scope  not a supply at all — a genuine indemnity. No VAT line, no
//                 rate, no column. It belongs on its own document.
//   exempt        in scope but relieved, and the invoice must cite the
//                 provision granting it. Declared here, unreachable in V1.
//
// So `rate` lives INSIDE the `taxable` variant and nowhere else. There is no
// way to spell a zero rate in this module; the compiler is the enforcement.
//
// ⚑ THE LIVE DATA, MEASURED 2026-09-02: 370 missions — 297 at `0`, 73 NULL,
// and NOT ONE at 0,10. Every 0 is a franchise Driver, because all 13 Drivers
// have an empty `vat_number` and the trigger stamps 0 when it finds one. So the
// whole database is the state this file exists to stop calling "0 %".
import type { MissionRow } from "@/lib/database.types";

/**
 * The four legally distinct states a supply can be in — plus one state the
 * DATA can be in, which is not a legal state at all and must never be rendered
 * as one.
 *
 * ⚑ `undetermined` is the honest answer, not a fifth rate. "We don't know"
 * rendered as "you charge none" is a statement about someone's tax affairs that
 * nobody made. The old code already refused to conflate NULL with 0 (a
 * hand-written `vatKnown` guard in one component); this makes that refusal
 * structural, so the next renderer cannot forget it.
 */
export type TaxTreatment =
  | { kind: "taxable"; rate: number }
  | { kind: "franchise" }
  | { kind: "out_of_scope" }
  | { kind: "exempt" }
  | { kind: "undetermined"; why: "no_driver_yet" | "position_open" };

/**
 * The mandatory wording on a franchise line — CGI art. 293 E. Not a label we
 * chose; the exact phrase the invoice has to carry.
 *
 * ⚑ NO RENDERER IN V1, on purpose. It belongs on an invoice document, and there
 * is no invoice document yet. It lives here so the day one is built it is not
 * retyped from memory.
 */
export const FRANCHISE_MENTION = "TVA non applicable, article 293 B du CGI";

/**
 * What a bill line IS — the discriminant that replaces a free-text label.
 *
 * ⚑ THE TWO SIDES USED TO DISAGREE about what a line was: the Driver's screen
 * calls a no-show "No-show — full fare" while the Business's bill calls the
 * same money "Trip". The label is per-audience and stays that way; the KIND is
 * the shared truth underneath, and it is what an invoice has to state.
 */
export type BillLineKind =
  /** The ride. A destination agreed in advance is what earns the 10 %. */
  | "transfer"
  /**
   * *Mise à disposition* — the car and Driver by the hour, no agreed
   * destination. **20 %**, not 10 %: buying a driver's time is closer to a hire
   * than to transport, and the Conseil d'État upheld exactly that on
   * 13 May 2025 (n° 499031, Sté Chabé) against the trade's largest operator.
   *
   * ⚑ UNREACHABLE TODAY and deliberately so. `mission_type` is `transfer` on
   * 370 of 370 live rows and nothing writes the column. This case is the
   * founder's decision (2026-09-02) given a home and a test before the product
   * that needs it exists — see the note on `taxOf` about where the rate comes
   * from, which is the one thing that must change when it does.
   */
  | "disposal"
  /** Accessory to the ride. Follows it — never rated on its own. */
  | "waiting"
  /** The ride WAS supplied; the Guest was absent. A taxable line, not damages. */
  | "no_show"
  /** ⚑ CONTESTED — never resolved to a rate here. See `taxOf`. */
  | "cancellation_business"
  /** The Driver's penalty for dropping an accepted trip. An indemnity. */
  | "cancellation_driver"
  /** Kavenue's own supply of intermediation. Its own rate, always. */
  | "commission";

/**
 * The only columns this module may read. Narrow on purpose: every one is
 * already inside `mission_read`'s explicit column list and its grant, so
 * resolving a treatment never needs a walled column or a new migration.
 */
export type TaxFacts = Pick<MissionRow, "mission_type"> & {
  transport_vat_rate?: number | string | null;
  commission_vat_rate?: number | string | null;
  driver_id?: string | null;
};

function rateOf(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  // ⚑ The ONLY place a number becomes a rate, and it refuses anything that is
  // not strictly positive. A `taxable` treatment carrying 0 cannot be built.
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Is this mission's own supply the ride, or an hourly hire? */
function rideKindOf(m: TaxFacts): "transfer" | "disposal" {
  return m.mission_type === "hourly" ? "disposal" : "transfer";
}

/**
 * The one resolver. Every rate decision in the product is one case below,
 * written once.
 *
 * ⚑ THE REGISTRATION AND THE RATE ARE TWO DIFFERENT QUESTIONS, and separating
 * them is the whole reshape:
 *
 *     what the line carries  =  (rate for THIS kind of supply)
 *                            ×  (does this Driver charge VAT at all)
 *
 * The mission's `transport_vat_rate` snapshot answers the SECOND — it is
 * frozen when a Driver accepts, so a Driver who registers in September cannot
 * change the VAT on a trip they drove in August. Its tri-state is what is
 * load-bearing (NULL / 0 / positive), not its magnitude.
 */
export function taxOf(kind: BillLineKind, m: TaxFacts): TaxTreatment {
  switch (kind) {
    case "commission":
      // Kavenue's fee is its own supply of intermediation and does NOT inherit
      // the ride's 10 % — one invoice may lawfully carry a 10 % transport line
      // beside a 20 % commission line. What is forbidden is two rates on one
      // operation. (BOI-TVA-CHAMP-10-10-40-40.)
      //
      // ⚑ NULL IS NOT ZERO HERE EITHER, and this one is live: 6 rows carry no
      // commission rate at all because no fee was ever charged on them. That is
      // the absence of a supply, not a supply at 0 %.
      return taxable(rateOf(m.commission_vat_rate)) ?? { kind: "out_of_scope" };

    case "cancellation_driver":
      // A Driver who accepted and then dropped the trip pays for a loss, and
      // receives nothing in return. Outside the scope: no VAT line at all — NOT
      // a 0 % line, and it belongs on its own document rather than netted off a
      // commission invoice.
      //
      // ⚑ It flips INTO scope the moment the money buys the Driver anything —
      // account kept active, no suspension, priority. Keep it compensatory.
      return { kind: "out_of_scope" };

    case "cancellation_business":
      // ⚑ THE ONE THIS MODULE REFUSES TO ANSWER. Taxable if it pays for
      // capacity actually held; arguably outside the scope if the Business
      // merely used a cancellation right we granted it. Two readings of the
      // same paragraph, and the expert-comptable has not answered yet.
      //
      // ⚑ But half of it IS settled, by the SQL rather than by anyone's
      // opinion: `business_cancel_mission` sets the fee percentage to 0 when
      // the trip is still pooled or has no Driver. So a fee above zero ALWAYS
      // implies a Driver had accepted — and the no-Driver case, where nothing
      // was ever held for anyone, bills nothing and resolves cleanly.
      return m.driver_id == null
        ? { kind: "out_of_scope" }
        : { kind: "undetermined", why: "position_open" };

    case "waiting":
    case "no_show":
      // ⚑ ACCESSORY — WRITTEN AS A DELEGATION, NOT AS A RATE. Waiting is not
      // something the Business buys for its own sake; it is part of doing the
      // ride, so it disappears into the ride and takes whatever the ride takes.
      // Restating "10 %" here would be a second copy that could drift; calling
      // the ride's own resolver cannot.
      //
      // ⚑ The risk runs the other way from the obvious one: if the waiting
      // charge stops being small next to the fare it is no longer accessory,
      // and the exposure is the standard rate on the WHOLE job, not a 20 %
      // waiting line. That is a pricing rule, not a code rule — nothing here
      // can detect it.
      return taxOf(rideKindOf(m), m);

    case "transfer":
    case "disposal": {
      const snapshot = m.transport_vat_rate;
      if (snapshot == null) return { kind: "undetermined", why: "no_driver_yet" };
      // 0 means the Driver is under *franchise en base*. It is NOT a rate, and
      // this is the line that stops it being read as one.
      if (rateOf(snapshot) == null) return { kind: "franchise" };
      // Registered. Now the rate comes from the KIND of supply, not the mission.
      //
      // ⚑ `disposal` borrows `commission_vat_rate` because that column holds the
      // standard French rate, snapshotted per generation — arithmetically right,
      // under a name that says "fee". A deliberate borrow, and the ONE thing to
      // replace the day an at-disposal trip becomes bookable; until then nothing
      // writes `mission_type` and this branch cannot fire in production.
      const rate = kind === "disposal" ? rateOf(m.commission_vat_rate) : rateOf(snapshot);
      return taxable(rate) ?? { kind: "undetermined", why: "no_driver_yet" };
    }

    default: {
      // Make the compiler check: an eighth kind is a build error, not a line
      // that silently renders as nothing.
      const never: never = kind;
      return never;
    }
  }
}

function taxable(rate: number | null): TaxTreatment | null {
  return rate == null ? null : { kind: "taxable", rate };
}

/**
 * The VAT sitting inside a TTC amount, once a treatment is known.
 *
 * ⚑ THERE IS NO `amount: 0` VARIANT. A caller physically cannot print
 * "0,00 € of VAT" — the type makes it render the regime instead, which is the
 * true thing to say.
 *
 * ⚑ The function that BUILDS one lives in `lib/commission.ts`, beside the
 * BigInt money arithmetic it needs. This module classifies; that one counts.
 * Keeping the arithmetic out of here is what lets `commission.ts` import these
 * types (erased at runtime) without a cycle.
 */
export type TaxLine =
  | { kind: "taxable"; rate: number; amount: number }
  | Exclude<TaxTreatment, { kind: "taxable" }>;
