import { redirect } from "next/navigation";
import { isUnderReview, UNDER_REVIEW } from "@/lib/driver-review";
import Link from "next/link";
import {
  Bell,
  BadgeCheck,
  Building2,
  Car,
  ChevronRight,
  Clock,
  FileText,
  HelpCircle,
  MapPin,
  Navigation,
  User,
  Wallet,
} from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { getLatestDocuments } from "@/lib/documents";
import { DRIVER_DOC_TYPES, docState } from "@/lib/account";
import { driverReadiness } from "@/lib/driver-readiness";
import { serviceClassLabel } from "@/lib/format";
import { DriverSignOut } from "@/components/driver-signout";

export const dynamic = "force-dynamic";

const GPS_LABEL: Record<string, string> = {
  waze: "Waze",
  google: "Google Maps",
  apple: "Apple Maps",
};

function Row({
  href,
  icon,
  title,
  value,
  badge,
}: {
  href?: string;
  icon: React.ReactNode;
  title: string;
  value: string;
  badge?: number;
}) {
  const inner = (
    <>
      <span className="drow__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="drow__t">
        <b>{title}</b>
        <span>{value}</span>
      </span>
      {badge ? <span className="dpill dpill--warn dpill--sm">{badge}</span> : null}
      {href && <ChevronRight size={16} strokeWidth={2} className="drow__ch" aria-hidden="true" />}
    </>
  );
  return href ? (
    <Link href={href} className="drow">
      {inner}
    </Link>
  ) : (
    <div className="drow drow--flat">{inner}</div>
  );
}

export default async function DriverAccountPage() {
  const ctx = await getAppContext();
  if (!ctx.driver) redirect("/onboarding");
  const { driver, liveCar } = ctx;

  const docs = await getLatestDocuments("driver", driver.id, DRIVER_DOC_TYPES);
  const ready = driverReadiness(driver, liveCar, docs);
  const docsToDo = docs.filter((d) => {
    const s = docState(d);
    return s !== "valid" && s !== "pending";
  }).length;
  const docsValid = docs.filter((d) => docState(d) === "valid").length;

  const carLine = liveCar?.make
    ? [liveCar.make, liveCar.model].filter(Boolean).join(" ") +
      (liveCar.plate ? ` · ${liveCar.plate}` : "")
    : "No car on file yet";

  return (
    <>
      <h1 className="dset__h1">Account</h1>
      <p className="dset__sub">Your profile, your car, your papers.</p>

      <div className="dcard dident">
        {driver.profile_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar dident__av" src={driver.profile_photo_url} alt="" />
        ) : (
          <span className="avatar avatar-empty dident__av">{driver.first_name?.[0] ?? "?"}</span>
        )}
        <div className="dident__t">
          <div className="dident__nm">
            {driver.first_name} {driver.last_name}
          </div>
          <div className="dident__sub">{carLine}</div>
          <div style={{ marginTop: 9 }}>
            {driver.verified ? (
              <span className="dpill dpill--go">
                <BadgeCheck size={13} strokeWidth={2} aria-hidden="true" />
                Verified Driver
              </span>
            ) : (
              <span className="dpill dpill--warn">
                <Clock size={13} strokeWidth={2} aria-hidden="true" />
                Verification in progress
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ⚑ THE HOLE THIS FILLS IS A SILENCE, NOT A LIE. The readiness card renders
          only when there are gaps — so a Driver who has filed everything and is
          waiting on a human saw NOTHING here, on the one screen that exists to
          answer "what's left before I can work?". Once `verified` refuses work
          (2026-09-07), that silence is the difference between a professional
          waiting calmly and a professional ringing the founder. */}
      {ready.gaps.length === 0 && isUnderReview(driver) && (
        <div className="dready">
          <div className="dready__h">{UNDER_REVIEW.title}</div>
          <p className="dready__say">{UNDER_REVIEW.body}</p>
        </div>
      )}

      {/* ⚑ WHAT A PERSON OWES THEM, not what they owe us. A Driver whose file is complete and
          whose car is with us matched neither branch: the hub sat silent under a green
          "Verified" pill while their Pool was shut. A pending car is deliberately NOT a gap
          (it would make "Your file is with us" unreachable) — so it needs its own line. */}
      {ready.waiting.length > 0 && (
        <div className="dready">
          <div className="dready__h">
            {ready.waiting.length === 1 ? ready.waiting[0]!.label : "With us right now"}
          </div>
          <ul className="dready__list">
            {ready.waiting.map((w) => (
              <li key={w.label} className="dready__item">
                <Link href={w.href}>{w.label}</Link>
              </li>
            ))}
          </ul>
          <p className="dready__say">We check every car by hand. Nothing for you to do.</p>
        </div>
      )}

      {ready.gaps.length > 0 && (
        <div className={`dready${ready.blockers > 0 ? " dready--block" : ""}`}>
          <div className="dready__h">{ready.headline}</div>
          <div className="dready__bar" aria-hidden="true">
            {Array.from({ length: ready.total }, (_, i) => (
              <span key={i} className={`dready__seg${i < ready.done ? " is-on" : ""}`} />
            ))}
          </div>
          <ul className="dready__list">
            {ready.gaps.slice(0, 3).map((g) => (
              <li key={g.label}>
                <Link href={g.href}>{g.label}</Link>
              </li>
            ))}
          </ul>
          {ready.gaps.length > 3 && (
            <p className="dready__more">and {ready.gaps.length - 3} more below</p>
          )}
        </div>
      )}

      <div className="dcard">
        <p className="dcard__label">You</p>
        <Row
          href="/settings/profile"
          icon={<User size={19} strokeWidth={1.7} />}
          title="Profile"
          value="Name, phone, languages"
        />
        <Row
          href="/settings/area"
          icon={<MapPin size={19} strokeWidth={1.7} />}
          title="Where you work"
          value={
            driver.base_label
              ? `${driver.base_label.split(",")[0]} · up to ${driver.service_radius_km} km`
              : "Not set yet"
          }
        />
        <Row
          href="/settings/vehicle"
          icon={<Car size={19} strokeWidth={1.7} />}
          title="Your vehicle"
          value={
            liveCar
              ? `${serviceClassLabel(liveCar.category, liveCar.body_type)} · ${liveCar.seats ?? "?"} seats`
              : "Add your car"
          }
        />
        <Row
          href="/settings/company"
          icon={<Building2 size={19} strokeWidth={1.7} />}
          title="Your company"
          value={driver.company_name ?? driver.siret ?? "SIRET, VAT — so we can pay you"}
        />
        <Row
          href="/settings/documents"
          icon={<FileText size={19} strokeWidth={1.7} />}
          title="Documents"
          value={`${docsValid} of ${docs.length} valid`}
          badge={docsToDo || undefined}
        />
      </div>

      <div className="dcard">
        <p className="dcard__label">App</p>
        <Row
          href="/settings/navigation"
          icon={<Navigation size={19} strokeWidth={1.7} />}
          title="Navigation"
          value={GPS_LABEL[driver.preferred_gps ?? "google"]}
        />
        <Row
          icon={<Bell size={19} strokeWidth={1.7} />}
          title="Notifications"
          value="Coming soon"
        />
        <Row
          href="/settings/payouts"
          icon={<Wallet size={19} strokeWidth={1.7} />}
          title="Payouts"
          value={driver.stripe_account_id ? "Connected" : "Not set up yet"}
        />
        <Row
          href="/settings/help"
          icon={<HelpCircle size={19} strokeWidth={1.7} />}
          title="Help and legal"
          value="Terms, privacy, support"
        />
      </div>

      <DriverSignOut />

      <p className="dset__ver">Kavenue · beta</p>
    </>
  );
}
