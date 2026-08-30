"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateCal, shiftIso, type CalPreset } from "@/components/date-cal";
import { useDismiss } from "@/lib/use-dismiss";

// The one tab on the console's period bar that cannot be a plain link: a
// hand-picked span has to be chosen before there is a URL to link to.
//
// ⚑ THE APP'S OWN CALENDAR, NOT A THIRD ONE. `DateCal` was extracted in S52 so
// Dispatch History and the Driver's Earnings pick a range with the SAME control
// ([[d64]]–[[d66]]) — the founder's rule then was that it gets built once, and
// this is the third caller honouring it. Why it is not `<input type="date">` is
// documented in that file: the native picker cannot express a range at all.
//
// ⚑ AND IT IS THE ONLY CLIENT COMPONENT ON THE BAR. The other five tabs stay
// server-rendered links, because they are links — the period is in the URL, so
// it is shareable, bookmarkable and survives a reload. Making the whole bar
// interactive to serve one tab would have cost that everywhere.

export function AdminRangeTab({
  base,
  isOn,
  fromDay,
  toDay,
  today,
  keep,
}: {
  base: string;
  isOn: boolean;
  /** The span currently on screen — seeds the calendar so opening Range shows
      the same numbers rather than resetting to nothing. */
  fromDay: string;
  toDay: string;
  today: string;
  /** Filters to carry across, exactly as the link tabs do. */
  keep: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const popRef = useDismiss<HTMLDivElement>(open, close);

  const href = useCallback(
    (from: string, to: string) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
      q.set("period", "range");
      q.set("from", from);
      q.set("to", to);
      return `${base}?${q.toString()}`;
    },
    [base, keep],
  );

  const goRange = useCallback(
    (from: string, to: string) => {
      startTransition(() => router.push(href(from, to), { scroll: false }));
    },
    [href, router],
  );

  // ⚑ NO "ALL TIME" PRESET HERE, unlike the Earnings screen's. All time is its
  // own tab on this bar and is the default — offering it a second time inside
  // the range picker would make it a SPAN with two ends, which is exactly what
  // all time is not.
  const presets = useMemo<readonly CalPreset[]>(
    () => [
      { key: "7d", label: "Last 7 days", from: shiftIso(today, -6), to: today },
      { key: "30d", label: "Last 30 days", from: shiftIso(today, -29), to: today },
      { key: "mtd", label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
      { key: "90d", label: "Last 90 days", from: shiftIso(today, -89), to: today },
    ],
    [today],
  );

  return (
    <div className={`adm-per__range${pending ? " is-busy" : ""}`} ref={popRef}>
      <button
        type="button"
        className={`adm-per__t${isOn ? " is-on" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Range
      </button>

      {open && (
        <div className="adm-per__pop">
          <DateCal
            period="range"
            // Empty on All time, which DateCal reads as "nothing selected" —
            // so the calendar opens on today rather than banding a span the
            // screen is not actually showing.
            fromDay={isOn ? fromDay : ""}
            toDay={isOn ? toDay : ""}
            anchorDay={isOn && fromDay ? fromDay : today}
            today={today}
            presets={presets}
            onPickDay={(iso) => goRange(iso, iso)}
            onPickRange={(from, to) => goRange(from, to)}
            onPickPreset={(from, to) => goRange(from, to)}
            onDone={close}
          />
        </div>
      )}
    </div>
  );
}
