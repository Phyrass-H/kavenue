"use client";

import { useEffect, useRef, useState } from "react";
import {
  BODY_TYPES,
  BODY_LABEL,
  TIER_LABEL,
  categorize,
  suggestedBody,
  type BodyType,
} from "@/lib/vehicle-catalog";
import {
  COLOURS, COLOUR_LABEL, ENERGIES, ENERGY_LABEL, VEHICLE_PROBLEM_SAYS, vehicleProblem,
  type VehicleProblem,
} from "@/lib/vehicle-rules";
import { resolveArea, decodeArea } from "@/lib/place-area";

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
  country,
}: {
  /** The Driver's country, which the plate must come from. Omitted at enrollment, where
   *  the base is picked in the same form — it is read from that form's base_area. */
  country?: string | null;
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

  // ⚑ THE SERVER'S RULE, RUN FIRST IN THE BROWSER (adversarial review, 2026-09-11).
  // Both save paths answer a bad car with a redirect, and a redirect throws the form
  // away — at enrollment that is the Driver's name, phone, base, radius AND car, all to
  // be retyped because of one plate typo. The fields were optional until today, so that
  // redirect almost never fired; now it would fire all the time. Checking here with the
  // very same `vehicleProblem` means a normal Driver is never sent through it. The
  // server still checks: this only spares the Driver, it guards nothing.
  const wrap = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<VehicleProblem | null>(null);
  useEffect(() => {
    const form = wrap.current?.closest("form");
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => {
      const f = new FormData(form);
      const g = (k: string) => String(f.get(k) ?? "");
      const c = country !== undefined ? country : resolveArea(decodeArea(g("base_area"))).country;
      const p = vehicleProblem(
        {
          make: g("make"), model: g("model"), colour: g("colour"), plate: g("plate"),
          seats: g("seats"), energy: g("energy"), firstRegistered: g("first_registration_date"),
        },
        c,
        new Date(),
      );
      setProblem(p);
      if (p) {
        e.preventDefault();
        wrap.current?.querySelector<HTMLElement>(`[data-field="${p}"]`)?.focus();
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [country]);

  const tier = categorize(make, model);
  // Pre-fill body from a recognised model until the Driver overrides it.
  const sugg = suggestedBody(make, model);
  const effectiveBody: BodyType = bodyTouched ? body : sugg ?? body;

  return (
    <div ref={wrap}>
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
            data-field="make"
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
            data-field="model"
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
            data-field="first_registered"
            required
            // ⚑ A STATIC `min`, unlike `max`: it cannot drift between server and browser.
            // Without it a two-digit year ("0023") passed the browser and was refused by
            // the server with "Add the date" — to someone who had.
            min="1900-01-01"
            defaultValue={defaults?.first_registration_date ?? ""}
          />
          <span className="muted small">On your carte grise, box B</span>
        </label>
        <label className="field">
          <span>Energy</span>
          <select name="energy" data-field="energy" required defaultValue={defaults?.energy ?? ""}>
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
          <select name="colour" data-field="colour" required defaultValue={(defaults?.colour ?? "").toLowerCase()}>
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
          <input type="text" name="plate" data-field="plate" required defaultValue={defaults?.plate ?? ""} placeholder="AB-123-CD" autoCapitalize="characters" />
        </label>
        <label className="field">
          {/* ⚑ PASSENGERS, not the carte grise's seat count, which includes the driver —
              a Classe E is stored 4, a Classe V 7. One definition, or the same car is
              recorded two ways. */}
          <span>Passengers</span>
          <input
            type="text"
            inputMode="numeric"
            name="seats"
            data-field="seats"
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
      {problem && (
        <p className="notice error" role="alert" style={{ marginTop: 12 }}>
          {VEHICLE_PROBLEM_SAYS[problem]}
        </p>
      )}
    </div>
  );
}
