// "What's left before this Business can post a trip?" — one honest answer,
// computed from the same row the settings screens render.
//
// ⚑ THIS ONE ACTUALLY GATES, AND IT IS THE FIRST THAT DOES. lib/driver-readiness
// deliberately only SHOWS a Driver their gaps: enforcing would have emptied every
// Pool overnight in beta. A Business is the other side, and the founder's rule
// (S71) is explicit: *a business cannot post a mission without filling the
// business type, on top of contact infos.* Same `Gap` shape as the Driver hub, so
// the two screens stay readable as one idea; different consequence.
//
// ⚑ THE BLOCK BITES AT "POST", NOT AT SIGN-UP. Sign-up stays thirty seconds —
// a longer enrolment form is how a marketplace loses the enrolment. The
// requirement arrives at the moment the Business has a reason to care about it,
// and a draft is never blocked: they can build the whole trip and save it, and
// only going LIVE needs a complete file.
//
// ⚑ EVERY REQUIREMENT HERE BREAKS SOMETHING OPERATIONAL IF IT IS MISSING. That
// is the test for adding another, and it is why SIRET is not on this list: it is
// a legal question, it is the founder's to own, and no trip fails without it.
import type { Database } from "@/lib/database.types";
import { typeOf } from "@/lib/business-type";

type BusinessRow = Database["public"]["Tables"]["business"]["Row"];

/** Only the columns the gate reads — so a test fixture is three fields, not thirty. */
export type GatedBusiness = Pick<
  BusinessRow,
  "business_type" | "field_of_activity" | "reception_phone" | "billing_email"
>;

export interface BusinessGap {
  label: string;
  /** Why it matters, in the Business's own terms — never "required field". */
  why: string;
  href: string;
  /** A blocker stops posting; a warning is worth doing and stops nothing. */
  tone: "block" | "warn";
}

export interface BusinessReadiness {
  gaps: BusinessGap[];
  blockers: BusinessGap[];
  /** The whole point: may this Business put a trip in the Pool right now? */
  canPost: boolean;
  done: number;
  total: number;
  headline: string;
}

/**
 * ⚑ THE PAYMENT SLOT IS DECLARED AND SWITCHED OFF, ON PURPOSE.
 *
 * The founder asked for bank details in the gate. They are right about the
 * destination and it cannot ship today: Stripe is not wired — their own standing
 * rule defers payments to the integration phase — so there is no form behind the
 * field. Gating on it now would be a locked door with no key, and every Business
 * on the platform would stop posting the moment it shipped.
 *
 * So the requirement exists here, written down, and turning it on is this one
 * line plus a `stripe_customer_id` check. It is not a TODO in a comment; it is
 * the switch, sitting where the switch belongs.
 */
export const PAYMENT_GATE_ON = false;

export function businessReadiness(business: GatedBusiness): BusinessReadiness {
  const gaps: BusinessGap[] = [];

  if (!typeOf(business)) {
    gaps.push({
      label: "Say what kind of business you are",
      why: "It decides nothing about your price — it is how Kavenue knows which trade it is serving.",
      href: "/dispatch/settings?s=company",
      tone: "block",
    });
  }

  if (!business.reception_phone?.trim()) {
    gaps.push({
      label: "Add a reception phone",
      why: "The Driver is given this number when they take one of your trips. Without it they cannot reach you.",
      href: "/dispatch/settings?s=contact",
      tone: "block",
    });
  }

  if (!business.billing_email?.trim()) {
    gaps.push({
      label: "Add a billing email",
      why: "Kavenue's invoice for every trip goes here.",
      href: "/dispatch/settings?s=billing",
      tone: "block",
    });
  }

  // Blockers first: "add a billing email" must never push "the Driver cannot
  // reach you" below the fold. Same sort as the Driver hub, same reason.
  gaps.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "block" ? -1 : 1));

  const blockers = gaps.filter((g) => g.tone === "block");
  const total = 3 + (PAYMENT_GATE_ON ? 1 : 0);
  const done = total - gaps.length;

  return {
    gaps,
    blockers,
    canPost: blockers.length === 0,
    done,
    total,
    headline:
      blockers.length === 0
        ? "Your file is complete"
        : blockers.length === 1
          ? "One thing left before you can post a trip"
          : `${blockers.length} things left before you can post a trip`,
  };
}
