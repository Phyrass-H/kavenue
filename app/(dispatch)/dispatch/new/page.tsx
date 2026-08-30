import Link from "next/link";
import { MissionForm } from "./mission-form";
import { createClient } from "@/lib/supabase/server";
import { getAppContext } from "@/lib/app-context";
import { businessReadiness } from "@/lib/business-readiness";
import { parseGuestContacts, type GuestContact } from "@/lib/passengers";
import { RATE_CARD_COLS, type RateCardRow } from "@/lib/rate-card";
import {
  COMMISSION_RATE_BUSINESS_COLS,
  businessRatesFromRow,
  type CommissionRateRow,
  type Rates,
} from "@/lib/commission";
import type { MissionRow } from "@/lib/database.types";
import type { Place } from "@/components/address-autocomplete";

export const dynamic = "force-dynamic";

export default async function NewMissionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; date?: string; draft?: string }>;
}) {
  const { error, date, draft } = await searchParams;
  const ctx = await getAppContext();

  // The Business's saved address, auto-filled into the pickup on a NEW mission when
  // "pre-fill my address as the pickup" is on (a hotel) — and not when it's off (a
  // concierge whose address is never an endpoint). The form ignores it for drafts.
  const business = ctx.business;
  const pickupPrefill: Place | null =
    business?.prefill_pickup &&
    business.business_address_lat != null &&
    business.business_address_lng != null
      ? {
          label: business.business_address ?? "",
          lat: business.business_address_lat,
          lng: business.business_address_lng,
        }
      : null;

  // The rate card (docs/06 §4) — five small rows, read once here and handed to
  // the form so it can re-price on every keystroke without a round trip. The
  // server re-derives the price from its OWN road distance when the form is
  // submitted; this copy only pre-fills and guides.
  const rateCard: RateCardRow[] = await (async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("rate_card").select(RATE_CARD_COLS);
    return (data ?? []) as RateCardRow[];
  })();

  // The commission rates in force (docs/06 §1), handed down for the same reason:
  // the Ceiling field is the Business's ALL-IN maximum, so the form needs them to
  // show what is inside it while they type. The server reads them again when the
  // mission is written and snapshots them onto the row — this copy only displays.
  //
  // ⚑ A FAILED READ IS NOT "NO COMMISSION" — and this is the one read where the
  // difference costs money. Both come back as `null` from businessRatesFromRow, and they
  // mean opposite things: no generation in force is a real state (the whole
  // pre-2026-08-17 archive), where the Course IS the all-in and nothing converts;
  // a query that fell over means we simply do not know the rate. Guess the second
  // as the first and resuming a saved draft seeds this ALL-IN field with a raw
  // Course, labelled "everything in" — then createMission, whose own read
  // succeeded, converts it a SECOND time. The stored fare falls ~13% per
  // open-and-save cycle, silently, taking the Driver's pay down with it.
  let commissionRatesUnavailable = false;
  const commissionRates: Rates | null = await (async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("commission_rate")
      .select(COMMISSION_RATE_BUSINESS_COLS)
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      commissionRatesUnavailable = true;
      return null;
    }
    // ⚑ BUSINESS-SIDE ONLY. `driver_rate_ht` is not readable by a Dispatcher
    // session any more, and asking for it would turn this into the failed read
    // the comment above spends twenty lines warning about.
    return businessRatesFromRow(data as Omit<CommissionRateRow, "driver_rate_ht"> | null);
  })();

  // Resume a saved draft (gated to this Business by RLS). Only draft rows.
  let draftMission: MissionRow | null = null;
  let draftContacts: GuestContact[] = [];
  if (draft && business) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("mission_read")
      .select("*")
      .eq("id", draft)
      .eq("status", "draft")
      .maybeSingle();
    draftMission = data ?? null;
    // Guest phones live in a side table; load them so resuming re-fills them.
    if (draftMission) {
      const { data: gc } = await supabase
        .from("mission_guest_contact")
        .select("contacts")
        .eq("mission_id", draftMission.id)
        .maybeSingle();
      draftContacts = parseGuestContacts(gc?.contacts ?? []);
    }
  }

  // ⚑ THE GATE, SAID BEFORE THEY START RATHER THAN AFTER THEY FINISH. The block
  // is enforced in createMission (a form post need not have seen this); what
  // this does is stop someone filling a whole trip in and being turned away at
  // the end. One line per missing thing, each saying why it matters and linking
  // to where it is fixed — never a count, and never "profile incomplete".
  const readiness = business ? businessReadiness(business) : null;

  return (
    <div>
      {readiness && !readiness.canPost && (
        <div className="notice warn" style={{ marginBottom: 16, maxWidth: 620 }}>
          <strong>{readiness.headline}.</strong> You can build the trip and save
          it as a draft now — posting it live needs these:
          <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
            {readiness.blockers.map((gap) => (
              <li key={gap.href} style={{ marginTop: 6 }}>
                <Link href={gap.href}>{gap.label}</Link>
                <span className="muted"> — {gap.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted" style={{ marginTop: 0, marginBottom: 16, maxWidth: 620 }}>
        Review it before it goes live. Posts into the matching Driver Pool —
        Kavenue prices the trip and you can change the ceiling.
      </p>
      <MissionForm
        error={error}
        prefillDate={date}
        draft={draftMission}
        draftContacts={draftContacts}
        pickupPrefill={pickupPrefill}
        rateCard={rateCard}
        commissionRates={commissionRates}
        commissionRatesUnavailable={commissionRatesUnavailable}
      />
    </div>
  );
}
