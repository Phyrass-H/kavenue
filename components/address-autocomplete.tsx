"use client";

import { useEffect, useId, useRef, useState } from "react";

// ⚑ GOOGLE FOR THE ADDRESS BOX, MAPBOX FOR ROUTING (founder, 2026-08-24, [[d89]]).
// This file is the ONLY thing that moved. `lib/directions.ts` still calls Mapbox
// `driving-traffic` with `depart_at`, which returns a duration predicted for the
// SCHEDULED pickup time — that duration feeds the ETA and the ±90min slot band,
// and nothing on the Google side replaces it. Do not "finish the migration".
//
// Why the box moved: Mapbox Search Box needs the exact registered name. Measured
// on the live keys, 2026-08-25 — typing what a receptionist actually types:
//   "Terminal 2 Nice" → Mapbox: a pharmacy, then Terminal ONE, twice. Google: Terminal 2.
//   "Hôtel Negresco"  → Mapbox: three Airbnb flats "near the Negresco". Google: the hotel.
//   "Eden Roc"        → Mapbox: a vinyl café, a villa, a Nice building. Google: the hotel (2nd).
//   "Hôtel du Cap Eden Roc" (full formal name) → both correct, first hit.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

// Country allowlist for suggestions (ISO 3166-1 alpha-2). The beta is a Côte
// d'Azur VTC, so we keep France + only the neighbours it realistically DRIVES to:
// Monaco, Italy (Ventimiglia / Sanremo / Genova / Milano), Switzerland (Genève /
// Alps transfers). The old broad EU list let Barcelona / Lisbon / Berlin junk in
// for vague queries. `locationBias` biases ranking; `includedRegionCodes` filters;
// and rivieraRank (below) floats local hits to the top.
const DEFAULT_COUNTRIES = "fr,mc,it,ch";

// The bias circle Google needs around `proximity`. Mapbox took a bare point; the
// Places API takes a point AND a radius. 50 km from Nice reaches Menton, Monaco,
// Cannes and Saint-Tropez's approach — the whole beta patch.
// ⚑ A BIAS, NOT A LIMIT. Geneva / Milano / Paris still resolve, just lower down;
// verified — a Riviera-biased "Hôtel Negresco" still returns Barcelona and Palma.
const BIAS_RADIUS_M = 50_000;

// Côte d'Azur markers in a suggestion's formatted address (postcodes 06 Alpes-
// Maritimes / 83 Var / 98000 Monaco, or the towns we actually serve). Used to
// re-rank local suggestions first without hiding legitimate far destinations.
// ⚑ Google's autocomplete line carries the TOWN but not the postcode, so it is the
// town half of this pattern doing the work now. Both are kept: the postcodes still
// match anything built from a stored full address.
const RIVIERA_RE =
  /\b(?:06\d{3}|83\d{3}|980\d{2})\b|\b(?:nice|cannes|antibes|monaco|monte-?carlo|menton|grasse|mougins|valbonne|mandelieu|cagnes|villefranche|beaulieu|cap[\s-]?d['’]?ail|juan-les-pins|saint-jean-cap-ferrat|èze|eze|sophia)\b/i;

function isRiviera(address: string): boolean {
  return RIVIERA_RE.test(address);
}

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

// A default may carry only a label (e.g. a resumed draft's stop saved before we
// captured coords) — coords are optional, and we only treat it as "picked" when
// they're present.
export interface DefaultPlace {
  label: string;
  lat?: number | null;
  lng?: number | null;
}

interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

function newSession(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  }
}

function asPlace(d: DefaultPlace | null | undefined): Place | null {
  if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
    return { label: d.label, lat: d.lat as number, lng: d.lng as number };
  }
  return null;
}

// Google Place Details (New) — the bits we use for the glance label.
interface PlaceDetails {
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  displayName?: { text?: string };
  addressComponents?: { longText?: string; types?: string[] }[];
}

// A short, scannable place label from the structured details — the POI name
// (hotel / airport / venue) or street, plus its town, with the postcode &
// country left off. This is what the dense schedule line shows; the exact address
// stays in pickup_address. Falls back to "" when the shape is unexpected, so the
// schedule can derive a label from the address string instead (shortPlaceLabel).
function glanceLabelFromDetails(d: PlaceDetails | undefined): string {
  if (!d) return "";
  const rawName = (d.displayName?.text ?? "").trim();
  // `locality` is the town on French results; `postal_town` covers the few places
  // Google uses it instead. Same role Mapbox's context.place/locality played.
  const town = (
    d.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ||
    d.addressComponents?.find((c) => c.types?.includes("postal_town"))?.longText ||
    ""
  ).trim();
  // Drop a leading house number for a tidy label ("58 Bd …" → "Bd …").
  const name = rawName.replace(/^\d+\s*(?:bis|ter)?\s+/i, "").trim() || rawName;
  if (!name) return town;
  // Skip the town when the name already carries it ("Aéroport Nice …" + "Nice").
  if (town && !name.toLowerCase().includes(town.toLowerCase())) return `${name}, ${town}`;
  return name;
}

// Google-backed address field. Uses the **Places API (New)** pair — `places:auto
// complete` then `places/{id}` — NOT the Geocoding API: autocomplete includes
// points of interest (hotels, airports, venues), which a VTC booking form is full
// of, while plain geocoding only knows addresses and returns junk for POI queries.
// The visible input is for typing; when name props are given, three HIDDEN inputs
// (label/lat/lng) are what the form submits, and only carry a value once the user
// PICKS a suggestion (a details call fills the coords). `onChange` lets a parent
// mirror the chosen place (used to compute the live route ETA). Riviera bias + a
// drive-to country allowlist by default; "Geneva"/"Milano"/"Berlin" still resolve.
// The dropdown is a keyboard combobox: ↑/↓ move the highlight, Enter picks it,
// Esc closes.
//
// ⚑ THE ONE SESSION TOKEN MATTERS FOR THE BILL. Google prices autocomplete +
// details as ONE session when both carry the same token; without it they are two
// billed calls per address. It is minted per search and rotated after each pick.
export function AddressAutocomplete({
  labelName,
  latName,
  lngName,
  placeLabelName,
  defaultValue,
  placeholder,
  proximity = [7.2619, 43.7102], // Nice
  countries = DEFAULT_COUNTRIES,
  compact = false,
  onChange,
}: {
  labelName?: string;
  latName?: string;
  lngName?: string;
  placeLabelName?: string; // hidden input carrying the short glance label (phase 2)
  defaultValue?: DefaultPlace | null;
  placeholder?: string;
  proximity?: [number, number];
  countries?: string;
  compact?: boolean;
  onChange?: (state: { text: string; place: Place | null }) => void;
}) {
  const [px, py] = proximity;
  const [query, setQuery] = useState(defaultValue?.label ?? "");
  const [picked, setPicked] = useState<Place | null>(asPlace(defaultValue));
  // Short glance label captured on pick (empty until a fresh pick, so a resumed
  // draft that isn't re-picked submits "" and the server keeps the stored label).
  const [placeLabel, setPlaceLabel] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1); // keyboard-highlighted suggestion
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef<string>(newSession());
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    if (!KEY) return;
    if (picked && query === picked.label) return;
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY },
          signal: controller.signal,
          body: JSON.stringify({
            input: query,
            languageCode: "fr",
            // Comma string in, array out — the prop's shape is unchanged for the
            // six call sites, only the wire format differs.
            includedRegionCodes: countries.split(",").map((c) => c.trim()).filter(Boolean),
            locationBias: {
              circle: { center: { latitude: py, longitude: px }, radius: BIAS_RADIUS_M },
            },
            sessionToken: session.current,
          }),
        });
        const data = (await res.json()) as {
          suggestions?: {
            placePrediction?: {
              placeId?: string;
              structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
              text?: { text?: string };
            };
          }[];
        };
        const mapped: Suggestion[] = (data.suggestions ?? [])
          // Keep only placePrediction. The other kind Google returns is a
          // `queryPrediction` — a SEARCH TERM ("hotels in Nice"), not a place you
          // can be picked up from. Same reason the Mapbox version dropped
          // 'brand'/'category': it wastes the top slot and resolves to nothing.
          .map((s) => s.placePrediction)
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({
            placeId: p.placeId ?? "",
            name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
            address: p.structuredFormat?.secondaryText?.text ?? "",
          }))
          .filter((s) => s.placeId && s.name);
        // Riviera-first: float local hits to the top, stable within each group, so a
        // vague query ("aéroport t2") surfaces the Nice result instead of a Roissy /
        // Barcelona lookalike. Far destinations still show, just below the local ones.
        const list = mapped
          .map((s, i) => ({ s, i, local: isRiviera(s.address) }))
          .sort((a, b) => (a.local === b.local ? a.i - b.i : a.local ? -1 : 1))
          .map((x) => x.s)
          .slice(0, 8);
        setSuggestions(list);
        setActive(-1); // fresh results → no stale highlight
        setOpen(true);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setSuggestions([]);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      controller.abort();
    };
  }, [query, picked, px, py, countries]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Keep the keyboard-highlighted option scrolled into view (the list scrolls).
  useEffect(() => {
    if (active < 0) return;
    const li = listRef.current?.children[active] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Resolve a chosen suggestion to coordinates (Place Details step).
  async function pick(s: Suggestion) {
    if (!KEY) return;
    setOpen(false);
    setActive(-1);
    setBusy(true);
    try {
      const url =
        `https://places.googleapis.com/v1/places/${encodeURIComponent(s.placeId)}` +
        `?languageCode=fr&sessionToken=${session.current}`;
      const res = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": KEY,
          // ⚑ The field mask is REQUIRED on details and is also the bill: asking for
          // fewer fields buys a cheaper SKU. These four are exactly what we use.
          "X-Goog-FieldMask": "location,formattedAddress,displayName,addressComponents",
        },
      });
      const d = (await res.json()) as PlaceDetails;
      const lat = d.location?.latitude;
      const lng = d.location?.longitude;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const label = d.formattedAddress || d.displayName?.text || s.address || s.name;
        const place: Place = { label, lng: lng as number, lat: lat as number };
        setPicked(place);
        setQuery(label);
        setPlaceLabel(glanceLabelFromDetails(d)); // short label for the schedule
        onChange?.({ text: label, place });
      }
      session.current = newSession(); // fresh session for the next search
    } catch {
      // leave unpicked; the form guards on coords
    } finally {
      setBusy(false);
      setSuggestions([]);
    }
  }

  function onInput(v: string) {
    setQuery(v);
    setActive(-1);
    // Editing the text after a pick invalidates the chosen coords + glance label.
    const next = picked && v === picked.label ? picked : null;
    if (next !== picked) setPicked(next);
    if (!next) setPlaceLabel("");
    onChange?.({ text: v, place: next });
  }

  // Keyboard combobox: ↑/↓ move the highlight, Enter picks it, Esc closes.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
      } else {
        setActive((i) => (i + 1) % suggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(suggestions.length - 1);
      } else {
        setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      }
    } else if (e.key === "Enter") {
      // Only swallow Enter when it's selecting a highlighted suggestion, so a
      // plain Enter elsewhere still hits the form's own guard.
      if (open && active >= 0 && suggestions[active]) {
        e.preventDefault();
        pick(suggestions[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  const listOpen = open && suggestions.length > 0;

  return (
    <div className="ac" ref={boxRef}>
      <input
        type="text"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={listOpen && active >= 0 ? optionId(active) : undefined}
      />
      {labelName && <input type="hidden" name={labelName} value={picked?.label ?? ""} />}
      {latName && <input type="hidden" name={latName} value={picked?.lat ?? ""} />}
      {lngName && <input type="hidden" name={lngName} value={picked?.lng ?? ""} />}
      {placeLabelName && <input type="hidden" name={placeLabelName} value={placeLabel} />}

      {listOpen && (
        <ul className="ac-list" id={listId} role="listbox" ref={listRef}>
          {suggestions.map((s, i) => (
            <li key={s.placeId} role="presentation">
              <button
                type="button"
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={`ac-item${i === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
              >
                <span style={{ fontWeight: 500 }}>{s.name}</span>
                {s.address && (
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>
                    {s.address}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy && (
        <p className="small muted" style={{ margin: "4px 0 0" }} role="status" aria-live="polite">
          Locating…
        </p>
      )}
      {!compact && query.trim().length >= 3 && !picked && !busy && (
        <p className="small muted" style={{ margin: "4px 0 0" }} role="status" aria-live="polite">
          Pick an address from the list so we can place it on the map.
        </p>
      )}
      {!KEY && (
        <p className="small" style={{ color: "var(--danger)", margin: "4px 0 0" }}>
          Address search is unavailable (Google Maps key missing).
        </p>
      )}
    </div>
  );
}
