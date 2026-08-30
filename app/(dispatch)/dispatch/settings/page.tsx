import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  User,
  Image as ImageIcon,
  SlidersHorizontal,
  CreditCard,
  Bell,
  LifeBuoy,
} from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { getLatestDocuments } from "@/lib/documents";
import { BUSINESS_DOC_TYPES } from "@/lib/account";
import { businessTypeOptions } from "@/lib/business-type";
import { DocumentSection } from "@/components/document-section";
import { AvatarEditor } from "@/components/avatar-editor";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { HelpLegalCard } from "@/components/help-legal-card";
import { SettingsTabs, type SettingsSection } from "@/components/settings-tabs";
import {
  updateCompany,
  updateContact,
  updateBookingDefaults,
  updateBillingEmail,
} from "./actions";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  missing: "Please fill in the required field before saving.",
  db: "Something went wrong saving your changes. Please try again.",
  upload: "Your logo couldn’t be uploaded. Please try another file.",
  filesize: "That logo is too large (max 10 MB).",
  filetype: "Please use a PNG, JPG or WebP image.",
};

function SectionHead({
  title,
  desc,
}: {
  title: string;
  desc?: string;
}) {
  return (
    <div className="set-head">
      <h2 className="set-head__title">{title}</h2>
      {desc && <p className="set-head__desc">{desc}</p>}
    </div>
  );
}

export default async function BusinessSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; s?: string }>;
}) {
  const ctx = await getAppContext();
  if (!ctx.business || !ctx.dispatcher) redirect("/onboarding-business");
  const business = ctx.business;
  const dispatcher = ctx.dispatcher;

  const { ok, error, s } = await searchParams;
  const docs = await getLatestDocuments("business", business.id, BUSINESS_DOC_TYPES);

  const addressDefault =
    business.business_address_lat != null && business.business_address_lng != null
      ? {
          label: business.business_address ?? "",
          lat: business.business_address_lat,
          lng: business.business_address_lng,
        }
      : business.business_address
        ? { label: business.business_address }
        : undefined;

  const sections: SettingsSection[] = [
    {
      key: "company",
      title: "Company",
      icon: <Building2 size={18} />,
      content: (
        <>
          <form action={updateCompany} className="card">
            <SectionHead
              title="Company identity"
              desc="Who the business legally is — used on bookings and on Kavenue’s invoices to you."
            />
            <div className="grid-2">
              <label className="field">
                <span>Business name</span>
                <input type="text" name="business_name" defaultValue={business.name} required />
              </label>
              <label className="field">
                <span>Business type</span>
                <select name="business_type" defaultValue={business.business_type ?? ""}>
                  <option value="">Select…</option>
                  {businessTypeOptions().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Legal entity name (raison sociale)</span>
              <input
                type="text"
                name="legal_name"
                defaultValue={business.legal_name ?? ""}
                placeholder="Oetker Hôtel Management Company"
              />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>SIRET</span>
                <input
                  type="text"
                  name="siret"
                  defaultValue={business.siret ?? ""}
                  placeholder="552 116 329 00012"
                />
              </label>
              <label className="field">
                <span>VAT number (TVA)</span>
                <input
                  type="text"
                  name="vat_number"
                  defaultValue={business.vat_number ?? ""}
                  placeholder="FR 76 552116329"
                />
              </label>
            </div>
            <label className="field">
              <span>Registered address</span>
              <input
                type="text"
                name="registered_address"
                defaultValue={business.registered_address ?? ""}
                placeholder="112 Rue du Faubourg Saint-Honoré, 75008 Paris"
              />
            </label>
            <button className="btn" type="submit">
              Save company details
            </button>
          </form>

          <DocumentSection docs={docs} />
        </>
      ),
    },
    {
      key: "contact",
      title: "Contact",
      icon: <User size={18} />,
      content: (
        <form action={updateContact} className="card">
          <SectionHead
            title="Contact"
            desc="The Dispatcher seat — how the Driver and Kavenue reach the business."
          />
          <label className="field">
            <span>Contact name (the Dispatcher)</span>
            <input type="text" name="contact_name" defaultValue={dispatcher.name} required />
          </label>
          <label className="field">
            <span>Account email</span>
            <input type="email" defaultValue={dispatcher.email ?? ""} disabled />
            <small className="set-note">
              The email tied to your sign-in. Contact support to change it.
            </small>
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Mobile phone</span>
              <input
                type="tel"
                name="phone"
                defaultValue={dispatcher.phone ?? ""}
                placeholder="+33 6 12 34 56 78"
              />
              <small className="set-note">Revealed to the Driver on acceptance.</small>
            </label>
            <label className="field">
              <span>Reception / switchboard</span>
              <input
                type="tel"
                name="reception_phone"
                defaultValue={business.reception_phone ?? ""}
                placeholder="+33 1 53 43 43 00"
              />
              <small className="set-note">Your reception / front-desk line (optional).</small>
            </label>
          </div>
          <button className="btn" type="submit">
            Save contact
          </button>
        </form>
      ),
    },
    {
      key: "branding",
      title: "Branding",
      icon: <ImageIcon size={18} />,
      content: (
        <div className="card">
          <SectionHead
            title="Branding"
            desc="Your logo — the face shown to Drivers and on vouchers."
          />
          <AvatarEditor kind="business" currentUrl={business.logo_url} fallback={business.name} />
        </div>
      ),
    },
    {
      key: "booking",
      title: "Booking defaults",
      icon: <SlidersHorizontal size={18} />,
      content: (
        <form action={updateBookingDefaults} className="card">
          <SectionHead
            title="Booking defaults"
            desc="Your address and defaults that pre-fill the new-mission form."
          />
          <label className="field">
            <span>Your address</span>
            <AddressAutocomplete
              labelName="business_address"
              latName="business_address_lat"
              lngName="business_address_lng"
              placeLabelName="business_address_label"
              defaultValue={addressDefault}
              placeholder="Your address — pick it from the suggestions"
            />
            <small className="set-note">
              Used to pre-fill bookings. Pick it from the dropdown so it has a location.
            </small>
          </label>
          <label className="set-toggle">
            <input
              type="checkbox"
              name="prefill_pickup"
              defaultChecked={business.prefill_pickup ?? true}
            />
            <span className="set-toggle__text">
              <strong>Pre-fill my address as the pickup</strong>
              <small className="set-note">
                On a new mission, start the pickup with your address (swap it to the drop-off for
                an arrival). Turn this off if your address is never an endpoint.
              </small>
            </span>
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Default vehicle class</span>
              <select
                name="default_vehicle_category"
                defaultValue={business.default_vehicle_category ?? ""}
              >
                <option value="">No default</option>
                <option value="eco">Eco</option>
                <option value="business">Business</option>
                <option value="luxury">First</option>
              </select>
            </label>
          </div>
          <button className="btn" type="submit">
            Save booking defaults
          </button>
        </form>
      ),
    },
    {
      key: "billing",
      title: "Billing",
      icon: <CreditCard size={18} />,
      soon: true,
      content: (
        <>
          <form action={updateBillingEmail} className="card">
            <SectionHead
              title="Billing"
              desc="Where Kavenue’s invoices go. Card payments go live later."
            />
            <label className="field">
              <span>Billing email</span>
              <input
                type="email"
                name="billing_email"
                defaultValue={business.billing_email ?? ""}
                placeholder="accounts@hotel.com"
              />
              <small className="set-note">Where we’ll send Kavenue invoices.</small>
            </label>
            <button className="btn" type="submit">
              Save billing email
            </button>
          </form>

          <div className="card">
            <div className="set-stub">
              <div className="set-stub__row">
                <strong>Payment method</strong>
                <span className="set-soon">Coming soon</span>
              </div>
              <p className="muted small">
                When billing goes live you’ll add a card here. Stripe collects it securely — Kavenue
                never stores your card number. The trip fare is collected on the Driver’s behalf;
                Kavenue’s service fee (with 20% VAT on the fee only) shows as a separate line.
              </p>
              <button className="btn secondary" type="button" disabled>
                Add a payment method
              </button>
            </div>
          </div>

          <div className="card">
            <div className="set-stub">
              <div className="set-stub__row">
                <strong>Invoices &amp; statements</strong>
                <span className="set-soon">Coming soon</span>
              </div>
              <p className="muted small">
                Your Kavenue invoices will appear here once billing is live.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      key: "notifications",
      title: "Notifications",
      icon: <Bell size={18} />,
      soon: true,
      content: (
        <div className="card">
          <SectionHead
            title="Notifications"
            desc="How you’ll hear about mission updates."
          />
          <div className="set-stub">
            <div className="set-stub__row">
              <strong>Mission alerts</strong>
              <span className="set-soon">Coming soon</span>
            </div>
            <p className="muted small">
              Soon you’ll choose which mission events notify you — accepted, Driver en route,
              completed — and how (email or SMS). For now, updates appear when you refresh the
              schedule.
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "help",
      title: "Help & legal",
      icon: <LifeBuoy size={18} />,
      content: (
        <>
          <HelpLegalCard />
          <div className="card">
            <SectionHead title="Your account" />
            <p className="muted small" style={{ marginTop: -4 }}>
              To export your data or close the business account, email{" "}
              <a href="mailto:support@kavenue.fr" className="dx-tel">
                support@kavenue.fr
              </a>
              .
            </p>
            <p className="small" style={{ marginTop: 10 }}>
              <Link
                href="/dispatch/history"
                className="muted"
                style={{ textDecoration: "underline" }}
              >
                View mission history →
              </Link>
            </p>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="dx-settings">
      <div className="set-top">
        <h1 className="set-title">Business settings</h1>
        <p className="set-sub">
          {business.name} · your account, identity, and booking defaults
        </p>
      </div>

      {ok && <div className="notice success">Your changes were saved.</div>}
      {error && NOTICE[error] && <div className="notice error">{NOTICE[error]}</div>}

      <SettingsTabs sections={sections} initial={s} />
    </div>
  );
}
