"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { DateCal, shiftIso, type CalPreset } from "@/components/date-cal";
import { useDismiss } from "@/lib/use-dismiss";
import { parseAnchor, periodRange, PERIODS, type Period } from "@/lib/earnings";
import {
  historyHref,
  isFiltered,
  SORTS,
  SORT_LABEL,
  type HistoryQuery,
  type PeriodView,
  type Sort,
} from "@/lib/history-filter";
import type { VehicleCategory } from "@/lib/database.types";

const PERIOD_LABEL: Record<Period, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
  range: "Range",
};

/**
 * The History toolbar: one search box, the date filter, a class, a sort and the
 * export. Every control writes to the URL and nothing else — so a filtered
 * archive is a link you can send to your accountant, Back works, and the CSV is
 * the very same query re-run on the server.
 *
 * ⚑ The date filter is the Driver's Earnings control, whole (`Day · Week · Month
 * · Year · Range` + the shared calendar in components/date-cal.tsx). The first
 * S52 version offered only a two-tap span, and the founder's complaint was exact:
 * *"I can't select a specific week or month, can you use the same as the driver
 * app."* The granularity segmented control lives INSIDE the popover so the
 * toolbar stays one button wide; the ‹ › steps sit around the label, as they do
 * on the Driver's screen.
 *
 * ⚑ There is deliberately NO Driver dropdown. Founder: *"can you imagine there is
 * 300, how it would look like?"* — a native select over every Driver who ever
 * drove for a Business is unusable at real scale, and typing a name in the search
 * box already does the job (with the match highlighted).
 */
export function HistoryFilters({
  query,
  view,
  categories,
  today,
  firstDay,
  resultCount,
}: {
  query: HistoryQuery;
  /** The applied period's label + step anchors. Null = "Any date". */
  view: PeriodView | null;
  categories: { key: VehicleCategory; label: string }[];
  today: string;
  /** Earliest trip this Business has, for "All time". Null when brand new. */
  firstDay: string | null;
  resultCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ⚑ The last query this component ASKED for, which is not the same thing as the
  // last one the server sent back. `query` is a server prop and router.replace
  // runs in a transition, so it lags every click by a round trip. Merging a new
  // patch onto that lagging prop silently drops whatever was pushed in between:
  // click ‹ twice quickly and the second computes from the first's stale anchor,
  // so you step once; change the class while a search is still debouncing and the
  // search fires with the old class and undoes it. Patches merge onto this ref
  // instead, and a newly committed prop always overwrites it.
  const live = useRef(query);
  // The href of the navigation we are still waiting on, if any. Without it, a
  // slower EARLIER response landing after a newer one would overwrite the newer
  // intent — so the prop is adopted only once it IS what we last asked for.
  const inflight = useRef<string | null>(null);
  useEffect(() => {
    const href = historyHref(query);
    if (inflight.current === null || inflight.current === href) {
      live.current = query;
      inflight.current = null;
    }
  }, [query]);

  const push = useCallback(
    (patch: Partial<HistoryQuery>) => {
      const next = { ...live.current, ...patch };
      live.current = next;
      const href = historyHref(next);
      inflight.current = href;
      startTransition(() => router.replace(`/dispatch/history${href}`, { scroll: false }));
    },
    [router],
  );

  // ---- search --------------------------------------------------------------
  // ⚑ Local state is the ONLY source of truth for this box. It is never synced
  // back from `query.q`, and that is the whole fix for the bug the founder hit:
  // *"it removes what I wrote to search then the writing comes back."*
  //
  // The first version mirrored the URL into the input so "Clear filters" could
  // empty it. But `router.replace` runs in a transition, so between "we pushed
  // q=croisette" and "the navigation committed" there is at least one render
  // where the prop still holds the OLD q. The sync effect read that as an
  // external change, wrote the stale value into the box (text vanishes), then
  // wrote the new one when the navigation landed (text returns) — once per
  // keystroke. Clearing is now done by the buttons that clear, which is the only
  // moment the box's value legitimately comes from outside.
  const [text, setText] = useState(query.q);
  const [focused, setFocused] = useState(false);
  // A ref, not state: a pending timer must be cancellable from anywhere without
  // re-rendering, and must not outlive the component — leaving this screen inside
  // the debounce window used to fire a navigation back to it.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const search = useCallback(
    (next: string) => {
      setText(next);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => push({ q: next }), 350);
    },
    [push],
  );

  const clearAll = () => {
    if (debounce.current) clearTimeout(debounce.current);
    setText("");
    push({
      outcome: "all",
      q: "",
      period: null,
      anchor: null,
      from: null,
      to: null,
      driverId: null,
      category: null,
      sort: "recent",
    });
  };

  // ---- date ----------------------------------------------------------------
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const popRef = useDismiss<HTMLDivElement>(open, close);

  const period = query.period;
  const isRange = period === "range";
  // ⚑ What the calendar is actually RENDERING when no filter is applied. `period`
  // is null under "Any date", and DateCal was already falling back to "month" —
  // but pickDay pushed the raw null, so historyHref wrote no `p` at all and
  // tapping a month from "Any date" did nothing whatsoever. Both sides read this.
  const calPeriod: Period = period ?? "month";

  const presets = useMemo<CalPreset[]>(
    () => [
      { key: "7d", label: "Last 7 days", from: shiftIso(today, -6), to: today },
      { key: "30d", label: "Last 30 days", from: shiftIso(today, -29), to: today },
      // Hidden for a Business with no history — "All time" over nothing is a lie.
      ...(firstDay ? [{ key: "all", label: "All time", from: firstDay, to: today }] : []),
    ],
    [today, firstDay],
  );

  function pickPeriod(p: Period) {
    if (p === "range") {
      // Seed the span from whatever is on screen, so switching to Range shows the
      // same rows instead of resetting to nothing.
      push({ period: "range", anchor: null, from: view?.fromDay ?? today, to: view?.toDay ?? today });
    } else {
      // Anchor on the day already chosen, not on the period's first day: going
      // from "July 2026" to Day meant 1 July rather than the day you were on.
      push({ period: p, anchor: query.anchor ?? query.from ?? today, from: null, to: null });
    }
  }

  // The granularity decides what a tapped day MEANS — tapping the 13th under
  // Month selects July. Derived server-side; the anchor is all that travels.
  // The two-tap span is DateCal's own business now (it holds the half-built
  // state and paints the completed one optimistically), so this only sees a
  // finished pair.
  function pickDay(iso: string) {
    push({ period: calPeriod, anchor: iso, from: null, to: null });
    close();
  }

  // Computed from the LIVE anchor, so holding ‹ steps once per click instead of
  // recomputing from a prop that hasn't caught up yet. periodRange is pure and
  // already the server's own source of truth for these anchors.
  function step(dir: -1 | 1) {
    const cur = live.current;
    if (!cur.period || cur.period === "range") return;
    const r = periodRange(cur.period, parseAnchor(cur.anchor ?? undefined));
    // Nothing has happened in the future; the › stops at the present rather than
    // walking into empty months.
    if (dir > 0 && r.isCurrent) return;
    push({ period: cur.period, anchor: dir < 0 ? r.prev : r.next, from: null, to: null });
  }

  const filtered = isFiltered(query);
  const exportHref = `/dispatch/history/export${historyHref(query)}`;

  return (
    <div className="dxh-tools">
      {/* type="text", NOT type="search": a search input renders the browser's own
          clear ✕ on top of the app's one — the "cross on top of the other cross"
          the founder saw. Matches the calendar's search box, which was already
          plain text. */}
      <div className="dx-search dxh-search">
        <Search aria-hidden="true" />
        <input
          type="text"
          value={text}
          placeholder="Search trips…"
          aria-label="Search past trips"
          aria-describedby="dxh-scope"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => search(e.target.value)}
        />
        {text && (
          <button
            type="button"
            className="dx-search__clear"
            aria-label="Clear search"
            onClick={() => search("")}
          >
            <X aria-hidden="true" />
          </button>
        )}
        {/* What the one box covers. Held out of the placeholder, where the list
            was being truncated mid-word; it appears under the field on focus. */}
        <p id="dxh-scope" className={`dxh-scope${focused ? " is-on" : ""}`}>
          Guest · Driver · reference · address · flight · car
        </p>
      </div>

      <div className="dxh-pop" ref={popRef}>
        <div className={`dxh-date${view ? " is-on" : ""}`}>
          {/* Stepping an arbitrary span has no meaning, so the arrows go away
              entirely rather than sitting there disabled. */}
          {view && !isRange && (
            <button
              type="button"
              className="dxh-date__arw"
              aria-label={`Earlier ${period}`}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="dxh-date__lab"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <Calendar size={15} strokeWidth={1.8} aria-hidden="true" />
            {view ? view.label : "Any date"}
          </button>
          {view && !isRange && (
            <button
              type="button"
              className="dxh-date__arw"
              aria-label={`Later ${period}`}
              onClick={() => step(1)}
              disabled={view.isCurrent}
            >
              <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>

        {open && (
          <div className="dxh-cal">
            <div className="seg seg--full seg--5" role="group" aria-label="Period">
              {PERIODS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`seg-btn${period === p ? " is-on" : ""}`}
                  aria-pressed={period === p}
                  onClick={() => pickPeriod(p)}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>

            {/* History's default is "everything", which the Earnings screen has no
                equivalent for — so there has to be an explicit way back to it. */}
            {view && (
              <button
                type="button"
                className="dxh-anydate"
                onClick={() => {
                  push({ period: null, anchor: null, from: null, to: null });
                  close();
                }}
              >
                Any date — show every trip
              </button>
            )}

            <DateCal
              period={calPeriod}
              fromDay={view?.fromDay ?? ""}
              toDay={view?.toDay ?? ""}
              anchorDay={view?.fromDay ?? today}
              today={today}
              presets={isRange ? presets : null}
              onPickDay={pickDay}
              onPickRange={(f, t) => push({ period: "range", anchor: null, from: f, to: t })}
              onPickPreset={(f, t) => {
                push({ period: "range", anchor: null, from: f, to: t });
                close();
              }}
              onDone={close}
            />
          </div>
        )}
      </div>

      {/* Native selects on purpose: keyboard- and screen-reader-correct for free,
          and they render as the platform's own picker on a phone. Both lists are
          short and fixed — unlike the Driver list, which is why that one is gone. */}
      <label className="dxh-sel">
        <span className="sr-only">Service class</span>
        <select
          value={query.category ?? ""}
          onChange={(e) => push({ category: (e.target.value || null) as VehicleCategory | null })}
          className={query.category ? "is-on" : undefined}
        >
          <option value="">Any class</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="dxh-sel">
        <span className="sr-only">Sort</span>
        <select value={query.sort} onChange={(e) => push({ sort: e.target.value as Sort })}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {filtered && (
        <button type="button" className="dxh-btn dxh-btn--ghost" onClick={clearAll}>
          Clear filters
        </button>
      )}

      <span className="dxh-spacer" />

      {/* A plain link, not an action: the export is the same query re-run on the
          server, so it downloads exactly the rows on screen. */}
      <a
        className={`dxh-btn${pending ? " is-busy" : ""}`}
        href={exportHref}
        aria-disabled={resultCount === 0 ? "true" : undefined}
      >
        <Download size={15} strokeWidth={1.8} aria-hidden="true" />
        Export CSV
      </a>
    </div>
  );
}
