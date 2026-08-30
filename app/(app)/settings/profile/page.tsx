import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { AvatarEditor } from "@/components/avatar-editor";
import { LanguagePicker } from "@/components/language-picker";
import { genderOptions } from "@/lib/gender";
import { SettingsHeader, SaveNotice } from "@/components/settings-header";
import { updateProfile } from "../actions";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  missing: "Please fill in your first and last name.",
  db: "Something went wrong saving your changes. Please try again.",
};

export default async function ProfileSettingsPage({
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
      <SettingsHeader title="Profile" />
      <SaveNotice ok={ok} error={error} messages={NOTICE} />

      <div className="dcard">
        <p className="dcard__label">Photo</p>
        <AvatarEditor
          kind="driver"
          currentUrl={driver.profile_photo_url}
          fallback={driver.first_name}
        />
      </div>

      <form action={updateProfile}>
        <div className="dcard">
          <p className="dcard__label">You</p>
          <div className="grid-2">
            <label className="field">
              <span>First name</span>
              <input type="text" name="first_name" defaultValue={driver.first_name} required />
            </label>
            <label className="field">
              <span>Last name</span>
              <input type="text" name="last_name" defaultValue={driver.last_name} required />
            </label>
          </div>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Phone</span>
            <input
              type="tel"
              name="phone"
              defaultValue={driver.phone ?? ""}
              placeholder="+33 6 12 34 56 78"
            />
            <span className="dhint">
              <Eye size={13} strokeWidth={1.9} aria-hidden="true" />
              Hidden until you accept a mission — then the Business can call you.
            </span>
          </label>
        </div>

        <div className="dcard">
          <p className="dcard__label">Gender</p>
          {/* ⚑ RADIOS, NOT A CLIENT COMPONENT. This page is server-rendered and
              posts a plain form; a segmented control built from buttons would
              need state and a "use client" boundary for one field. Native radios
              styled as segments behave identically and work with JS off. */}
          <fieldset className="seg seg--full seg--radio">
            <legend className="sr-only">Gender</legend>
            {genderOptions().map((g) => (
              <label key={g.value} className="seg-btn">
                <input
                  type="radio"
                  name="gender"
                  value={g.value}
                  defaultChecked={driver.gender === g.value}
                />
                <span>{g.label}</span>
              </label>
            ))}
          </fieldset>
          <p className="dhint dhint--block">
            {/* ⚑ It says what it is NOT used for. A Driver handing over
                something optional deserves to know it cannot cost them work —
                and it genuinely cannot: no Pool query and no rule reads it. */}
            Optional. It never affects which trips you see or who can book you —
            Kavenue uses it to understand the fleet.
          </p>
        </div>

        <div className="dcard">
          <p className="dcard__label">Languages you speak</p>
          <LanguagePicker defaults={driver.languages} />
          <p className="dhint dhint--block">
            Shown on a trip where the Business asked for a language. Never a filter — you
            still see every mission.
          </p>
        </div>

        <button className="btn" type="submit">
          Save changes
        </button>
      </form>
    </>
  );
}
