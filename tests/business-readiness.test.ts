// The gate: may this Business put a trip in the Pool?
//
// ⚑ THIS IS THE FIRST READINESS CHECK IN THE CODEBASE THAT ACTUALLY REFUSES
// SOMETHING, so what these tests defend is the refusal itself — that it cannot
// quietly widen back out into a warning, and that a draft is never caught by it.
import { describe, expect, it } from "vitest";
import {
  businessReadiness,
  PAYMENT_GATE_ON,
  type GatedBusiness,
} from "@/lib/business-readiness";

const complete: GatedBusiness = {
  business_type: "hotel",
  field_of_activity: null,
  reception_phone: "+33 4 93 00 00 00",
  billing_email: "compta@negresco.test",
};

describe("businessReadiness", () => {
  it("lets a complete file post", () => {
    const r = businessReadiness(complete);
    expect(r.canPost).toBe(true);
    expect(r.gaps).toEqual([]);
    expect(r.headline).toBe("Your file is complete");
  });

  it("refuses on a missing type — the founder's rule, S71", () => {
    const r = businessReadiness({ ...complete, business_type: null });
    expect(r.canPost).toBe(false);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0].href).toBe("/dispatch/settings?s=company");
  });

  it("refuses on a missing reception phone", () => {
    // The operational reason, and the test for adding any requirement here: the
    // Driver is handed this number on acceptance and cannot reach them without it.
    const r = businessReadiness({ ...complete, reception_phone: null });
    expect(r.canPost).toBe(false);
    expect(r.blockers[0].href).toBe("/dispatch/settings?s=contact");
  });

  it("refuses on a missing billing email", () => {
    const r = businessReadiness({ ...complete, billing_email: null });
    expect(r.canPost).toBe(false);
    expect(r.blockers[0].href).toBe("/dispatch/settings?s=billing");
  });

  it("treats whitespace as missing", () => {
    // A space in the box is not a phone number, and " " is truthy.
    expect(businessReadiness({ ...complete, reception_phone: "   " }).canPost).toBe(false);
    expect(businessReadiness({ ...complete, billing_email: "  " }).canPost).toBe(false);
  });

  it("accepts a pre-S71 Business whose legacy free text IS a known type", () => {
    const r = businessReadiness({
      ...complete,
      business_type: null,
      field_of_activity: "concierge",
    });
    expect(r.canPost).toBe(true);
  });

  it("still asks the one whose legacy free text is a sentence", () => {
    const r = businessReadiness({
      ...complete,
      business_type: null,
      field_of_activity: "Palace hotel, 5 stars",
    });
    expect(r.canPost).toBe(false);
  });

  it("names every missing thing, never a count", () => {
    // ⚑ The founder has rejected roll-up summaries twice. An empty Business gets
    // three sentences it can act on, not "3 fields missing".
    const r = businessReadiness({
      business_type: null,
      field_of_activity: null,
      reception_phone: null,
      billing_email: null,
    });
    expect(r.blockers).toHaveLength(3);
    for (const gap of r.blockers) {
      expect(gap.label.length).toBeGreaterThan(0);
      expect(gap.why.length).toBeGreaterThan(0);
      expect(gap.href.startsWith("/dispatch/settings")).toBe(true);
    }
    expect(r.headline).toBe("3 things left before you can post a trip");
  });

  it("says 'one thing' rather than '1 things'", () => {
    expect(businessReadiness({ ...complete, billing_email: null }).headline).toBe(
      "One thing left before you can post a trip",
    );
  });

  it("counts the steps done out of the steps that are switched on", () => {
    const r = businessReadiness({ ...complete, billing_email: null });
    expect(r.total).toBe(PAYMENT_GATE_ON ? 4 : 3);
    expect(r.done).toBe(r.total - 1);
  });

  it("has the payment requirement switched OFF, and that is deliberate", () => {
    // ⚑ The founder asked for bank details in this gate. Stripe is not wired —
    // their own standing rule defers payments — so there is no form behind the
    // field, and shipping it on would stop every Business posting. If this ever
    // flips to true, a `stripe_customer_id` check has to land in the same commit.
    expect(PAYMENT_GATE_ON).toBe(false);
    expect(businessReadiness(complete).canPost).toBe(true);
  });
});
