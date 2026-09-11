"use client";

import { useState } from "react";
import {
  BODY_TYPES,
  BODY_LABEL,
  TIER_LABEL,
  categorize,
  suggestedBody,
  type BodyType,
} from "@/lib/vehicle-catalog";
import { COLOURS, COLOUR_LABEL, ENERGIES, ENERGY_LABEL } from "@/lib/vehicle-rules";

// The Driver's own vehicle. The service TIER is DERIVED from make+model (the
// two-step fallback) and shown read-only — Drivers don't self-classify. BODY
// (Sedan/Van) is captured separately (pre-filled from the recognised model when
// known). Make/colour/plate matter for the legally-required VTC verification.
//
// ⚑ EVERY FIELD IS REQUIRED (founder, 2026-09-11) — "those infos has to be
// mandatories" for class, category and region distributions to mean anything. The
// `required` attributes here are a courtesy; the rule itself is lib/vehicle-rules.ts,
// enforced on the server at both doors, because a browser can always be bypassed.
// ⚑ Colour and energy are LISTS, not free text — see vehicle-rules.ts for why.
export function DriverVehicleFields({
  defaults,
}: {
  defaults?: {
    body_type?: string | null;
    make?: string | null;
    model?: string | null;
    colour?: string | null;
    plate?: string | null;
    seats?: number | null;
    energy?: string | null;
    first_registration_date?: string | null;
    accepts_luggage_runs?: boolean | null;
  };
}) {
  const [make, setMake] = useState(defaults?.make ?? "");
  const [model, setModel] = useState(defaults?.model ?? "");
  const [body, setBody] = useState<BodyType>(defaults?.body_type === "van" ? "van" : "sedan");
  // Whether the Driver has manually set the body (so we stop auto-suggesting).
  const [bodyTouched, setBodyTouched] = useState(!!defaults?.body_type);
  // Opt-in to bags-only Van runs (Sujet B, Phase 1). Off by default.
  const [acceptsLuggage, setAcceptsLuggage] = useState(defaults?.accepts_luggage_runs ?? false);

  const tier = categorize(make, model);
  // Pre-fill body from a recognised model until the Driver overrides it.
  const sugg = suggestedBody(make, model);
  const effectiveBody: BodyType = bodyTouched ? body : sugg ?? body;

  return (
    <>
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Every field is needed — it’s what your carte grise says, and it’s how we match you to
        the right trips.
      </p>
      <div className="grid-2">
        <label className="field">
          <span>Make</span>
          <input
            type="text"
            name="make"
            required
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Mercedes-Benz"
          />
        </label>
        <label className="field">
          <span>Model</span>
          <input
            type="text"
            name="model"
            required
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Classe E"
          />
        </label>
      </div>

      <div className="field">
        <span style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
          Service tier
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge">{TIER_LABEL[tier]}</span>
          <span className="muted small">set automatically from your car</span>
        </div>
      </div>

      <div className="field">
        <span style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
          Body
        </span>
        <div className="seg" role="group" aria-label="Body type">
          {BODY_TYPES.map((b) => (
            <button
              type="button"
              key={b}
              className={`seg-btn${effectiveBody === b ? " is-on" : ""}`}
              aria-pressed={effectiveBody === b}
              onClick={() => {
                setBody(b);
                setBodyTouched(true);
              }}
            >
              {BODY_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      {/* Van Drivers can opt in to bags-only luggage runs (Sujet B, Phase 1). */}
      {effectiveBody === "van" && (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            cursor: "pointer",
            margin: "-4px 0 18px",
          }}
        >
          <input
            type="checkbox"
            name="accepts_luggage_runs"
            checked={acceptsLuggage}
            onChange={(e) => setAcceptsLuggage(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>
            <span style={{ fontWeight: 600, fontSize: 14, display: "block" }}>
              Available for luggage-only runs
            </span>
            <span className="muted small">
              Get bags-only jobs (no passengers) in your Van. Off by default — turn it on if
              you&apos;re happy to carry luggage.
            </span>
          </span>
        </label>
      )}

      {/* ⚑ BOTH FROM THE CARTE GRISE, SO THEY SIT TOGETHER. Box B is the date of first
          registration; box P.3 is the energy. The date is a DATE, not a year: the VTC age
          limit is "moins de sept ans", and at that line a year alone is a year out.
          ⚑ NO `max={today}` on the date, on purpose: this component renders on the server
          (UTC) and hydrates in Paris, which is already tomorrow for two hours every night
          — React would flag the attribute mismatch. The server refuses a future date
          with its own message (vehicle-rules.ts), so nothing is lost. */}
      <div className="grid-2">
        <label className="field">
          <span>First registered</span>
          <input
            type="date"
            name="first_registration_date"
            required
            defaultValue={defaults?.first_registration_date ?? ""}
          />
          <span className="muted small">On your carte grise, box B</span>
        </label>
        <label className="field">
          <span>Energy</span>
          <select name="energy" required defaultValue={defaults?.energy ?? ""}>
            <option value="" disabled>
              Choose…
            </option>
            {ENERGIES.map((e) => (
              <option key={e} value={e}>
                {ENERGY_LABEL[e]}
              </option>
            ))}
          </select>
          <span className="muted small">On your carte grise, box P.3</span>
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>Colour</span>
          {/* ⚑ A LIST, lower-case codes. The fleet was stored "Noir" / "Gris" before the
              list existed; lower-casing the default keeps those rows selected. */}
          <select name="colour" required defaultValue={(defaults?.colour ?? "").toLowerCase()}>
            <option value="" disabled>
              Choose…
            </option>
            {COLOURS.map((c) => (
              <option key={c} value={c}>
                {COLOUR_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Plate</span>
          <input type="text" name="plate" required defaultValue={defaults?.plate ?? ""} placeholder="AB-123-CD" autoCapitalize="characters" />
        </label>
        <label className="field">
          <span>Seats</span>
          <input
            type="text"
            inputMode="numeric"
            name="seats"
            required
            pattern="[1-9]"
            defaultValue={defaults?.seats ?? ""}
            placeholder="4"
          />
        </label>
      </div>

      {/* Derived tier + (possibly auto-suggested) body submit via hidden inputs. */}
      <input type="hidden" name="category" value={tier} />
      <input type="hidden" name="body_type" value={effectiveBody} />
    </>
  );
}
