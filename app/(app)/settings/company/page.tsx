import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, ShieldCheck } from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { SettingsHeader, SaveNotice } from "@/components/settings-header";
import { updateCompany } from "../actions";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  siret: "A SIRET is 14 digits. Check the number on your Kbis.",
  db: "Something went wrong saving your changes. Please try again.",
};

export default async function CompanySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await getAppContext();
  if (!ctx.driver) redirect("/onboarding");
  const driver = ctx.driver;
  const { ok, error } = await searchParams;

  return (
    <>
      <SettingsHeader
        title="Your company"
        sub="You drive as a company, and you invoice as one. This is who we pay — and what your Waybill shows at a check."
      />
      <SaveNotice ok={ok} error={error} messages={NOTICE} />

      <form action={updateCompany}>
        <div className="dcard">
          <label className="field">
            <span>Company name</span>
            <input
              type="text"
              name="company_name"
              defaultValue={driver.company_name ?? ""}
              placeholder="Moreau Transport"
            />
          </label>
          <label className="field">
            <span>SIRET</span>
            <input
              type="text"
              inputMode="numeric"
              name="siret"
              defaultValue={driver.siret ?? ""}
              placeholder="812 456 789 00014"
            />
            <span className="dhint">14 digits, from your Kbis or SIRENE notice.</span>
          </label>
          <label className="field">
            <span>Registered address</span>
            <input
              type="text"
              name="registered_address"
              defaultValue={driver.registered_address ?? ""}
              placeholder="12 rue Barla, 06300 Nice"
            />
            <span className="dhint">The address on your Kbis — not where you wait for work.</span>
          </label>
          <label className="field">
            <span>REVTC number</span>
            <input
              type="text"
              name="revtc_number"
              defaultValue={driver.revtc_number ?? ""}
              placeholder="EVTC 006 210 045"
            />
            <span className="dhint">
              The number on your registration certificate — the number itself, not the scan.
            </span>
          </label>
          <label className="field">
            <span>Professional card number</span>
            <input
              type="text"
              name="pro_card_number"
              defaultValue={driver.pro_card_number ?? ""}
              placeholder="06 24 01 8837"
            />
            <span className="dhint">The number on the card in your windscreen.</span>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>VAT number</span>
            <input
              type="text"
              name="vat_number"
              defaultValue={driver.vat_number ?? ""}
              placeholder="FR12345678901"
            />
            <span className="dhint">
              Leave it empty if you’re on franchise en base — no VAT on your invoices.
            </span>
          </label>
        </div>

        <button className="btn" type="submit">
          Save changes
        </button>
      </form>

      <div className="dlock dlock--foot">
        <ShieldCheck size={15} strokeWidth={1.9} aria-hidden="true" />
        <span>
          Kavenue never holds your bank details. When payouts go live they’re collected
          by Stripe, and we only ever see that you’re connected.
        </span>
      </div>

      <Link href="/settings/documents" className="dcard drow drow--solo">
        <span className="drow__ic" aria-hidden="true">
          <FileText size={19} strokeWidth={1.7} />
        </span>
        <span className="drow__t">
          <b>Company papers</b>
          <span>Kbis, URSSAF attestation and RC Pro live in Documents</span>
        </span>
      </Link>
    </>
  );
}
