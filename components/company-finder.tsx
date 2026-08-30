"use client";

import { useEffect, useId, useRef, useState } from "react";
import { businessTypeLabel, businessTypeOptions } from "@/lib/business-type";
import type { RegisterHit, RegisterResult } from "@/lib/company-register";

// "Who are you?" as one block: the name, what kind of business it is, and — when
// the French register knows the company — the SIRET, the address and the town,
// filled in without anyone typing them.
//
// ⚑ THE TYPE PICKER LIVES IN HERE RATHER THAN BESIDE IT, because the lookup has
// to be able to set it. Two sibling fields where one silently moves the other is
// the sort of thing that works until someone reorders the form.
//
// ⚑ THE LOOKUP NEVER DECIDES ANYTHING ON ITS OWN. It pre-fills a picker that is
// on screen, filled in, and editable — and the raw official code goes into the
// database beside whatever the person finally chose. A wrong guess is one click
// to fix and leaves a trail; a silent one would be neither.
//
// ⚑ AND IT IS NEVER REQUIRED. The register is France only: Monaco is not in it,
// and one of the four Businesses on Kavenue today is in Monte-Carlo. Typing the
// name and picking the type is the normal path, not the fallback.

interface Props {
  /** Pre-selected type, when the form comes back with an error to fix. */
  defaultType?: string;
  defaultName?: string;
}

export function CompanyFinder({ defaultType = "", defaultName = "" }: Props) {
  const listId = useId();
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState(defaultType);
  const [hits, setHits] = useState<RegisterHit[]>([]);
  const [picked, setPicked] = useState<RegisterHit | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [open, setOpen] = useState(false);
  // Guards against a slow early request landing after a fast later one and
  // repopulating the list with results for a name that is no longer in the box.
  const seq = useRef(0);

  useEffect(() => {
    const q = name.trim();
    // Picked already? Stop searching — the box now holds the register's own
    // spelling, which would otherwise search for itself on every render.
    if (picked && picked !== null && q === (picked.tradeName ?? picked.legalName)) return;
    if (q.length < 3) {
      setHits([]);
      setUnreachable(false);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`);
        const body: RegisterResult = await res.json();
        if (mine !== seq.current) return;
        if (body.ok) {
          setHits(body.hits);
          setUnreachable(false);
          setOpen(body.hits.length > 0);
        } else {
          setHits([]);
          setUnreachable(true);
        }
      } catch {
        if (mine === seq.current) setUnreachable(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [name, picked]);

  function choose(hit: RegisterHit) {
    setPicked(hit);
    setName(hit.tradeName ?? hit.legalName);
    // ⚑ Only fills an EMPTY picker. If they have already said what they are,
    // an official code does not get to overrule them.
    if (!type && hit.suggestedType) setType(hit.suggestedType);
    setOpen(false);
    setHits([]);
  }

  function clearPick() {
    setPicked(null);
    setUnreachable(false);
  }

  return (
    <>
      <label className="field">
        <span>Business name</span>
        <input
          type="text"
          name="business_name"
          required
          autoComplete="off"
          placeholder="Start typing — we'll look you up"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (picked) clearPick();
          }}
          onFocus={() => setOpen(hits.length > 0)}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
      </label>

      {open && hits.length > 0 && (
        <ul id={listId} role="listbox" className="cf-list">
          {hits.map((hit) => (
            <li key={hit.siret} role="option" aria-selected="false">
              <button type="button" onClick={() => choose(hit)} className="cf-hit">
                <span className="cf-hit__name">{hit.tradeName ?? hit.legalName}</span>
                <span className="cf-hit__where">{hit.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked && (
        <p className="cf-note">
          Found in the French company register — SIRET {picked.siret}
          {picked.city && `, ${picked.city}`}
          {picked.suggestedType &&
            `. Its registered activity is ${businessTypeLabel(picked.suggestedType).toLowerCase()}`}
          . Not you? Keep typing.
        </p>
      )}

      {unreachable && !picked && (
        <p className="cf-note">
          The company register isn&rsquo;t answering right now — no matter, fill it
          in yourself below.
        </p>
      )}

      <label className="field">
        <span>What kind of business are you?</span>
        <select
          name="business_type"
          required
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="" disabled>
            Choose one…
          </option>
          {businessTypeOptions().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* What the register told us, carried through the post so the raw official
          code lands in the database beside the answer. Absent when nobody was
          matched, which is exactly what null means in those columns. */}
      <input type="hidden" name="siret" value={picked?.siret ?? ""} />
      <input type="hidden" name="legal_name" value={picked?.legalName ?? ""} />
      <input type="hidden" name="naf_code" value={picked?.nafCode ?? ""} />
      <input type="hidden" name="city" value={picked?.city ?? ""} />
      <input type="hidden" name="departement" value={picked?.departement ?? ""} />
      <input type="hidden" name="region" value={picked?.region ?? ""} />
    </>
  );
}
