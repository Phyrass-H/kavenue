"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import {
  SERVICE_TIERS,
  BODY_TYPES,
  TIER_LABEL,
  BODY_LABEL,
  carsFor,
  type ServiceTier,
  type BodyType,
} from "@/lib/vehicle-catalog";

type BodyChoice = "" | BodyType; // "" = any body (reaches sedan AND van drivers)

// Short, illustrative examples per tier (presentational only — the Pool match is
// driven by the Driver's auto-classified tier, not this copy).
const TIER_EG: Record<ServiceTier, string> = {
  eco: "Standard comfort",
  business: "Mercedes E, BMW 5, Audi A6",
  luxury: "S-Class, 7 Series, Maybach",
};

// Dispatcher's service-class picker (O5): pick a TIER (Eco/Business/First) as a
// tile, a BODY (Any/Sedan/Van) as a segmented control — together they route the
// mission to the matching Pool — and, only if the Guest insists, a SPECIFIC car
// from the catalog (a dropdown; hidden for Eco, which has no catalog models).
// Emits the form fields category / required_body_type / required_make / required_model.
export function ServiceClassFields({
  defaults,
  onBodyChange,
  onTierChange,
  onCarChange,
  compact = false,
}: {
  defaults?: { category?: string | null; body?: string | null; make?: string | null; model?: string | null };
  onBodyChange?: (body: BodyChoice) => void;
  onTierChange?: (tier: ServiceTier) => void;
  /** S83 — the specific car ("" / "" = any), for a panel that is not a form. */
  onCarChange?: (make: string, model: string) => void;
  /** S83 — the schedule row's "Change the car" panel: a shorter first label. */
  compact?: boolean;
}) {
  const initTier: ServiceTier = (SERVICE_TIERS as string[]).includes(defaults?.category ?? "")
    ? (defaults!.category as ServiceTier)
    : "business";
  const initBody: BodyChoice =
    defaults?.body === "van" ? "van" : defaults?.body === "sedan" ? "sedan" : "";

  const [tier, setTier] = useState<ServiceTier>(initTier);
  const [body, setBody] = useState<BodyChoice>(initBody);
  const [specific, setSpecific] = useState(
    defaults?.make && defaults?.model ? `${defaults.make}|${defaults.model}` : "",
  );

  // The catalog list depends on tier+body; reset the specific car when they change.
  function changeTier(t: ServiceTier) {
    setTier(t);
    setSpecific("");
    onTierChange?.(t);
    onCarChange?.("", "");
  }
  function changeBody(b: BodyChoice) {
    setBody(b);
    setSpecific("");
    onBodyChange?.(b);
    onCarChange?.("", "");
  }
  function changeSpecific(v: string) {
    setSpecific(v);
    const [mk, md] = v ? v.split("|") : ["", ""];
    onCarChange?.(mk, md);
  }

  const cars = body ? carsFor(tier, body) : [];
  const [reqMake, reqModel] = specific ? specific.split("|") : ["", ""];
  // Keep a resumed specific car selectable even if it's not in the current slice.
  const specificMissing = !!specific && !cars.some((c) => `${c.make}|${c.model}` === specific);

  const bodyChoices: { value: BodyChoice; label: string }[] = [
    { value: "", label: "Any" },
    ...BODY_TYPES.map((b) => ({ value: b, label: BODY_LABEL[b] })),
  ];

  // The specific-car picker only makes sense when a body is chosen AND the tier
  // has catalog models for it (Eco has none) — or a resumed draft already names one.
  const showCarPicker = !!body && (cars.length > 0 || !!specific);
  const showEcoNote = !!body && !showCarPicker;

  return (
    <div className="field">
      <span className="scf-label">{compact ? "Class" : "Service class (routes to the matching Pool)"}</span>
      <div className="tier-tiles" role="group" aria-label="Service class">
        {SERVICE_TIERS.map((t) => (
          <button
            type="button"
            key={t}
            className={`tier-tile${tier === t ? " is-on" : ""}`}
            aria-pressed={tier === t}
            onClick={() => changeTier(t)}
          >
            <span className="tier-tile__name">{TIER_LABEL[t]}</span>
            <span className="tier-tile__eg">{TIER_EG[t]}</span>
          </button>
        ))}
      </div>
      <input type="hidden" name="category" value={tier} />

      <span className="scf-label scf-label--mt">Body type</span>
      <div className="seg seg--full" role="group" aria-label="Body type">
        {bodyChoices.map((c) => (
          <button
            type="button"
            key={c.value || "any"}
            className={`seg-btn${body === c.value ? " is-on" : ""}`}
            aria-pressed={body === c.value}
            onClick={() => changeBody(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input type="hidden" name="required_body_type" value={body} />

      {showCarPicker && (
        <>
          <span className="scf-label scf-label--mt">Specific car (optional)</span>
          <select
            className="car-select"
            value={specific}
            onChange={(e) => changeSpecific(e.target.value)}
            aria-label="Specific car"
          >
            <option value="">
              Any {TIER_LABEL[tier]} {BODY_LABEL[body as BodyType].toLowerCase()} (recommended)
            </option>
            {specificMissing && (
              <option value={specific}>
                {reqMake} {reqModel}
              </option>
            )}
            {cars.map((c) => (
              <option key={`${c.make}|${c.model}`} value={`${c.make}|${c.model}`}>
                {c.make} {c.model}
              </option>
            ))}
          </select>
          <p className="muted small" style={{ marginTop: 6 }}>
            {specific
              ? "Only Drivers with this exact car will see the mission — expect fewer matches."
              : "Pick an exact model only if the Guest insists — it narrows the Pool."}
          </p>
        </>
      )}

      {showEcoNote && (
        <>
          <span className="scf-label scf-label--mt">Specific car</span>
          <div className="tier-empty">
            <Info size={14} aria-hidden />
            {TIER_LABEL[tier]} matches any standard car — no specific models to choose.
          </div>
        </>
      )}

      <input type="hidden" name="required_make" value={reqMake} />
      <input type="hidden" name="required_model" value={reqModel} />
    </div>
  );
}
