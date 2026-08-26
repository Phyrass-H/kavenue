"use client";

// The fleet, as something you can pick one Driver out of.
//
// ⚑ IT WAS ELEVEN CHIPS ON TWO ROWS, and it grew with the fleet — fine at 11,
// unusable at 50. A find box costs one control and makes the size of the fleet
// stop mattering.
//
// ⚑ ALPHABETICAL, AND DELIBERATELY NOT TINTED BY VERDICT. Who matched is
// already stated in full in the sentence above this control ("5 of 11 Drivers
// matched this trip: …"), so colouring the chips would say the same thing twice
// in a second visual language — and risk disagreeing with the verdict below.
// The chips answer "which name do I want?", which is what alphabetical is for.
import { useState } from "react";
import Link from "next/link";

export interface PickerDriver {
  id: string;
  name: string;
}

/** Below this the fleet fits on one line and a search box is just clutter. */
const NEEDS_FIND = 8;

export function AdminDriverPicker({
  drivers,
  selectedId,
  hrefFor,
}: {
  drivers: readonly PickerDriver[];
  selectedId: string | null;
  /** Built on the server so the picker never has to know the route's shape. */
  hrefFor: string;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term ? drivers.filter((d) => d.name.toLowerCase().includes(term)) : drivers;

  return (
    <>
      {drivers.length >= NEEDS_FIND && (
        <div className="adm-find">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a Driver"
            aria-label="Find a Driver by name"
          />
        </div>
      )}
      <div className="adm-pick">
        {shown.map((d) => {
          const on = d.id === selectedId;
          return (
            <Link
              key={d.id}
              href={`${hrefFor}?driver=${d.id}`}
              scroll={false}
              className={`adm-pick__b${on ? " is-on" : ""}`}
              aria-current={on ? "true" : undefined}
            >
              {d.name}
            </Link>
          );
        })}
        {/* ⚑ A find box that silently shows nothing looks broken. */}
        {shown.length === 0 && <span className="adm-pick__none">No Driver called “{q.trim()}”.</span>}
      </div>
    </>
  );
}
