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
// e-invoice carries a rate and amount per line (CGI ann. II art. 242 nonies A,
// I, 8°), so picking the wrong one is written down rather than merely displayed.
// ⚑ CORRECTED 2026-09-04: this comment used to say the codes were "machine-read
// by the tax office since 1 September 2026". That date is when every business
// must be able to RECEIVE an e-invoice, and when large companies must EMIT; a
// company this size emits from 1 September 2027. And the platform validates
// presence and arithmetic, not legal correctness — a wrong-but-well-formed
// treatment passes and surfaces in an audit instead:
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
  | { kind: "undetermined"; why: "no_driver_yet" };

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
   * destination. The **standard rate**, not 10 %: buying a driver's time is
   * closer to a hire than to transport, and the Conseil d'État upheld exactly
   * that on 13 mai 2025 (n° 499031, Sté Chabé) against the trade's largest
   * operator.
   *
   * ⚑ THE TEST IS THE AGREEMENT, NOT THE CLOCK (verified 2026-09-04). What
   * defeats the 10 % is the absence of an *accord préalable sur les trajets à
   * effectuer* — the hourly tariff is the EVIDENCE of that absence, not the
   * rule. Chabé bites where the price is *totalement indépendant de la distance
   * parcourue*. So an hourly job WITH an agreed itinerary is arguably still
   * 10 %, and `rideKindOf` keying on `mission_type` alone would not see the
   * difference. ⚑ The ruling says *taux normal*; 20 % is CGI art. 278.
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
  /**
   * The Guest did not appear. A taxable line, not damages.
   *
   * ⚑ NOT BECAUSE THE DRIVER TURNED UP (corrected 2026-09-04 — that was the
   * reason given here and it is not the French test). BOI-TVA-BASE-10-10-50
   * § 260 taxes the retained price *indépendamment* of whether the client
   * cancels ahead or simply fails to appear, and CE 9 oct. 2024 n° 472257 says
   * the counter-value is the client's firm RIGHT to the supply, used or not.
   * The narrow escape is genuine *arrhes* (C. civ. art. 1590).
   */
  | "no_show"
  /**
   * The Business's cancellation fee. Follows whatever was cancelled — see
   * `taxOf`. ⚑ ANSWERED 2026-09-04 (founder); it used to refuse to resolve.
   */
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
      // ⚑ ANSWERED 2026-09-04 by the founder, and this module used to refuse:
      // "it works the same — apply the same rules on what was cancelled, based
      // on whether it was a transfer or at-disposal". So the fee is not rated
      // on its own head; it DELEGATES to the supply that was cancelled, exactly
      // as `waiting` and `no_show` do. A cancelled transfer bills at the
      // transfer's rate, a cancelled at-disposal block at the standard rate.
      //
      // ⚑ AND THE PRIMARY SOURCE AGREES, which is why this was accepted rather
      // than argued: BOI-TVA-BASE-10-10-50 § 260 taxes the retained price
      // "indépendamment" of whether the client renounces the reserved capacity
      // BEFORE the date or simply fails to appear — i.e. it puts a cancellation
      // and a no-show on the same footing, which is precisely this rule. CE
      // 9 oct. 2024 n° 472257 locates the counter-value in the client's firm
      // RIGHT to the supply, used or not.
      //
      // ⚑ THE NO-DRIVER CASE STAYS OUT OF SCOPE, and it is settled by the SQL
      // rather than by anyone's opinion: `business_cancel_mission` sets the fee
      // percentage to 0 while a trip is pooled or Driverless. Nothing was held
      // for anyone, so nothing was supplied — and delegating here would answer
      // `undetermined` (no snapshot exists yet) for money that is always zero.
      if (m.driver_id == null) return { kind: "out_of_scope" };
      return taxOf(rideKindOf(m), m);

    case "waiting":
    case "no_show":
      // ⚑ ACCESSORY — WRITTEN AS A DELEGATION, NOT AS A RATE. Waiting is not
      // something the Business buys for its own sake; it is part of doing the
      // ride, so it disappears into the ride and takes whatever the ride takes.
      // Restating "10 %" here would be a second copy that could drift; calling
      // the ride's own resolver cannot.
      //
      // ⚑ AND THE TEST IS NOT SIZE — corrected 2026-09-04, it used to say
      // "if the waiting charge stops being small next to the fare". The
      // criterion is the absence of a *finalité autonome* for the customer
      // (BOI-TVA-CHAMP-60-20 § 230): waiting follows the ride because nobody
      // buys it for its own sake, not because it is a small number. A charge
      // the Business WOULD buy on its own is a separate supply however small,
      // and the exposure is then the standard rate on the WHOLE job. That is a
      // pricing rule, not a code rule — nothing here can detect it.
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
