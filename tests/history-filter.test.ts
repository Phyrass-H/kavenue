// lib/history-filter.ts — what a past trip costs, and the search/filter/sort
// the archive and its CSV export both run. "Export CSV" promises exactly what
// is on screen, and that promise is only as good as this one function.
import { describe, expect, it } from "vitest";
import {
  applyHistoryQuery,
  bucketOf,
  fold,
  highlightSegments,
  historyFare,
  historyHref,
  isFiltered,
  matchRow,
  parseHistoryQuery,
  periodView,
  searchFields,
} from "@/lib/history-filter";
import { rowCost } from "@/lib/spend";
import { carAsDriven } from "@/lib/waybill";
import { completed, mission, row, standardCurve } from "./fixtures";

const q = (sp: Record<string, string>) => parseHistoryQuery(sp);

describe("historyFare — the four endings", () => {
  it("costs nothing when nobody ever took it", () => {
    expect(historyFare(mission({ status: "expired" }))).toEqual({ fare: null, counted: true });
  });

  it("treats a past still-pooled trip the same as an already-swept one", () => {
    const m = mission({ status: "pooled", pickup_at: "2020-01-01T12:00:00+01:00" });
    expect(historyFare(m)).toEqual({ fare: null, counted: true });
  });

  it("is the fee, not the fare, on a cancelled trip", () => {
    expect(historyFare(mission({ status: "cancelled", cancellation_fee: 58.17 }))).toEqual({
      fare: 58.17,
      counted: true,
    });
  });

  it("shows nothing rather than a wrong number on a legacy cancelled row", () => {
    expect(historyFare(mission({ status: "cancelled", cancellation_fee: null }))).toEqual({
      fare: null,
      counted: true,
    });
  });

  it("refuses a fee that is not a finite number", () => {
    const m = mission({ status: "cancelled", cancellation_fee: "abc" as unknown as number });
    expect(historyFare(m)).toEqual({ fare: null, counted: true });
  });

  it("is the settled fare on a completed trip", () => {
    expect(historyFare(completed())).toEqual({ fare: 60, counted: true });
  });

  it("shows an unclosed past trip but does not count it — § Q", () => {
    const m = mission({ status: "on_board", ...standardCurve(), accepted_at: "2026-07-15T10:00:00+02:00" });
    expect(historyFare(m)).toEqual({ fare: 60, counted: false });
  });
});

describe("bucketOf — which chip a trip belongs under", () => {
  it("sorts the three endings and leaves a live trip out", () => {
    expect(bucketOf(mission({ status: "expired" }))).toBe("unfilled");
    expect(bucketOf(mission({ status: "completed" }))).toBe("completed");
    expect(bucketOf(mission({ status: "cancelled" }))).toBe("cancelled");
    expect(bucketOf(mission({ status: "confirmed", pickup_at: "2099-01-01T12:00:00+01:00" }))).toBeNull();
  });

  it("puts a past unfilled trip under Unfilled even before the sweep runs", () => {
    expect(bucketOf(mission({ status: "pooled", pickup_at: "2020-01-01T12:00:00+01:00" }))).toBe("unfilled");
  });
});

describe("fold — accents are never incidental here", () => {
  it("makes 'aeroport' find 'Aéroport'", () => {
    expect(fold("Aéroport Nice Côte d'Azur")).toBe("aeroport nice cote d'azur");
  });

  it("folds both Unicode normalisations to the same string", () => {
    expect(fold("Hôtel".normalize("NFC"))).toBe(fold("Hôtel".normalize("NFD")));
  });

  it("survives null and undefined", () => {
    expect(fold(null)).toBe("");
    expect(fold(undefined)).toBe("");
  });
});

describe("highlightSegments — painting the ORIGINAL text from FOLDED offsets", () => {
  it("always reconstructs the original text exactly", () => {
    // The invariant that matters: whatever the highlight does, joining the
    // segments must give back the string the user is reading, character for
    // character. A broken offset map shows up here first.
    for (const text of [
      "Aéroport Nice Côte d'Azur",
      "Café́ de Paris", // a lone combining mark
      "Hôtel Negresco",
      "Mercedes Classe E · AB-123-CD",
      "",
    ]) {
      for (const term of ["aeroport", "e n", "cafe", "hotel", "ab-123", ""]) {
        expect(highlightSegments(text, term).map((s) => s.text).join("")).toBe(text);
      }
    }
  });

  it("highlights the accented original when the search was unaccented", () => {
    const segs = highlightSegments("Aéroport Nice", "aeroport");
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["Aéroport"]);
  });

  it("keeps a combining mark inside the run that spans it", () => {
    // ⚑ Folding the whole string at once loses the offset map the moment a
    // character doesn't fold 1:1. Written DECOMPOSED, "Aéroport" is A + e +
    // combining acute + "roport": the mark folds to nothing and shifts every
    // offset after it, so a naive highlight stops one character short and
    // paints "éropor" instead of "éroport".
    const text = "A" + "e\u0301" + "roport";
    const segs = highlightSegments(text, "eroport");
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["e\u0301roport"]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });

  it("merges overlapping hits from different terms into one run", () => {
    const segs = highlightSegments("Nice", "nice nic");
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(["Nice"]);
  });

  it("finds every occurrence of a term, not just the first", () => {
    const segs = highlightSegments("Nice to Nice", "nice");
    expect(segs.filter((s) => s.hit)).toHaveLength(2);
  });

  it("returns the whole text unhighlighted when nothing is searched", () => {
    expect(highlightSegments("Nice", "")).toEqual([{ text: "Nice", hit: false }]);
    expect(highlightSegments("Nice", "   ")).toEqual([{ text: "Nice", hit: false }]);
  });
});

describe("matchRow — every term must hit somewhere", () => {
  const r = row(
    completed({
      reference: "BK-4471",
      flight_number: "AF7701",
      pickup_address: "Aéroport Nice Côte d'Azur, 06200 Nice, France",
      passenger_names: [{ first: "Anna", last: "Schmidt", main: true }],
    }),
    // ⚑ S78 — built through `carAsDriven`, off the TRIP's own frozen columns, because that is
    //   now the only way a car reaches a row: the search matches the car that did the trip,
    //   never the one its Driver happens to own today.
    {
      car: carAsDriven({
        vehicle_make: "Mercedes",
        vehicle_model: "Classe E",
        vehicle_colour: "Black",
        vehicle_plate: "AB-123-CD",
        vehicle_seats: 4,
      }),
    },
  );

  it("ANDs across terms and ORs across fields", () => {
    // "marc negresco" must find the trip Marc drove FROM the Negresco — which is
    // how a person narrows a search out loud.
    expect(matchRow(r, "marc anna")).not.toBeNull();
    expect(matchRow(r, "marc nonexistent")).toBeNull();
  });

  it("finds a trip by any of the things a Business remembers it by", () => {
    for (const term of ["anna", "marc", "bk-4471", "aeroport", "af7701", "ab-123-cd", "mercedes", "business"]) {
      expect(matchRow(r, term), term).not.toBeNull();
    }
  });

  it("reports WHICH field matched, so the row can say why", () => {
    expect(matchRow(r, "ab-123-cd")).toEqual(["car"]);
    expect(matchRow(r, "anna")).toEqual(["guest"]);
    expect(matchRow(r, "bk-4471")).toEqual(["reference"]);
  });

  it("matches nothing — not everything — for a query that folds away", () => {
    // A lone diacritic key. Returning an empty hit list made every row pass with
    // no highlight, so an accent key by itself looked like "no filter applied".
    expect(matchRow(r, "́")).toBeNull();
    expect(matchRow(r, "   ")).toBeNull();
  });

  it("searches the class label even though no column shows it", () => {
    expect(matchRow(r, "sedan")).toEqual(["class"]);
  });

  it("searches every stop on the route, not just the two ends", () => {
    const viaCannes = row(
      completed({ waypoints: [{ address: "Boulevard de la Croisette, Cannes" }] }),
    );
    expect(matchRow(viaCannes, "croisette")).toEqual(["address"]);
  });

  it("copes with a mission whose searchable fields are all empty", () => {
    const bare = row(
      completed({ reference: null, flight_number: null, passenger_names: null, passenger_name: null }),
      { driverName: null, car: null },
    );
    expect(matchRow(bare, "anything")).toBeNull();
    expect(searchFields(bare).map((f) => f.key)).toEqual(["address", "class"]);
  });
});

describe("parseHistoryQuery — the URL is hand-editable", () => {
  it("defaults to the whole archive, newest first", () => {
    expect(q({})).toEqual({
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
  });

  it("derives from/to from the granularity and the anchor", () => {
    // "d=2026-07-13" under Month means July; under Week it means the 13th's week.
    expect(q({ p: "month", d: "2026-07-13" })).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
    expect(q({ p: "week", d: "2026-07-13" })).toMatchObject({ from: "2026-07-13", to: "2026-07-19" });
    expect(q({ p: "day", d: "2026-07-13" })).toMatchObject({ from: "2026-07-13", to: "2026-07-13" });
    expect(q({ p: "year", d: "2026-07-13" })).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("swaps a backwards range instead of matching nothing", () => {
    // Silently matching nothing reads as "you have no history" rather than
    // "these dates are the wrong way round".
    expect(q({ p: "range", from: "2026-07-31", to: "2026-07-01" })).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("completes a half-open range from the end it was given", () => {
    expect(q({ p: "range", from: "2026-07-01" })).toMatchObject({ from: "2026-07-01", to: "2026-07-01" });
    expect(q({ p: "range", to: "2026-07-31" })).toMatchObject({ from: "2026-07-31", to: "2026-07-31" });
  });

  it("falls back to the whole archive for a range with no dates", () => {
    expect(q({ p: "range" })).toMatchObject({ period: null, from: null, to: null });
  });

  it("ignores a day that does not exist rather than rolling it over", () => {
    // ?d=2026-02-31 would otherwise quietly filter to 3 March. With the anchor
    // rejected it falls back to today, which is a visible, correctable state.
    expect(q({ p: "range", from: "2026-02-31" })).toMatchObject({ period: null, from: null });
    expect(q({ p: "day", d: "2026-02-31" }).anchor).not.toBe("2026-02-31");
  });

  it("ignores an unknown period, outcome or sort", () => {
    expect(q({ p: "quarter" }).period).toBeNull();
    expect(q({ filter: "banana" }).outcome).toBe("all");
    expect(q({ sort: "banana" }).sort).toBe("recent");
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseHistoryQuery({ q: ["nice", "cannes"] }).q).toBe("nice");
  });

  it("trims blank params away", () => {
    expect(q({ q: "   ", driver: "  " })).toMatchObject({ q: "", driverId: null });
  });
});

describe("isFiltered / historyHref", () => {
  it("knows when anything narrows the archive", () => {
    expect(isFiltered(q({}))).toBe(false);
    expect(isFiltered(q({ sort: "high" }))).toBe(false); // sorting is not filtering
    expect(isFiltered(q({ q: "nice" }))).toBe(true);
    expect(isFiltered(q({ filter: "cancelled" }))).toBe(true);
    expect(isFiltered(q({ p: "month", d: "2026-07-01" }))).toBe(true);
  });

  it("writes a clean URL for a clean view", () => {
    expect(historyHref(q({}))).toBe("");
  });

  it("survives a round trip through the URL", () => {
    // The property that keeps a filtered archive a shareable link.
    const cases: Record<string, string>[] = [
      { filter: "cancelled", q: "aeroport", sort: "high" },
      { p: "month", d: "2026-07-01" },
      { p: "week", d: "2026-07-13", cat: "luxury" },
      { p: "range", from: "2026-06-16", to: "2026-07-31", driver: "drv-1" },
      { p: "year", d: "2026-03-04", filter: "completed", sort: "low" },
    ];
    for (const sp of cases) {
      const original = parseHistoryQuery(sp);
      const href = historyHref(original);
      const reparsed = parseHistoryQuery(Object.fromEntries(new URLSearchParams(href.slice(1))));
      expect(reparsed, href).toEqual(original);
    }
  });

  it("writes only the SOURCE of a date filter, never the derived days", () => {
    // A link can then never carry a "July" that spans the wrong days.
    const href = historyHref(q({ p: "month", d: "2026-07-01" }));
    expect(href).toBe("?p=month&d=2026-07-01");
    expect(href).not.toContain("from=");
  });

  it("patches one field without disturbing the rest", () => {
    const base = q({ p: "month", d: "2026-07-01", q: "nice" });
    expect(historyHref(base, { outcome: "cancelled" })).toBe("?filter=cancelled&q=nice&p=month&d=2026-07-01");
  });
});

describe("periodView", () => {
  it("is null when no date filter is applied", () => {
    expect(periodView(q({}))).toBeNull();
  });

  it("describes the applied period and where the steps go", () => {
    const v = periodView(q({ p: "month", d: "2026-07-01" }), new Date("2026-07-15T12:00:00+02:00"))!;
    expect(v.label).toBe("July 2026");
    expect(v.fromDay).toBe("2026-07-01");
    expect(v.toDay).toBe("2026-07-31");
    expect(v.prev).toBe("2026-06-01");
    expect(v.isCurrent).toBe(true);
  });

  it("describes a custom range from its own ends", () => {
    const v = periodView(q({ p: "range", from: "2026-06-16", to: "2026-07-31" }))!;
    expect(v.fromDay).toBe("2026-06-16");
    expect(v.toDay).toBe("2026-07-31");
  });
});

describe("applyHistoryQuery", () => {
  const rows = [
    row(completed({ id: "a", pickup_at: "2026-07-15T12:00:00+02:00" })),
    row(completed({ id: "b", pickup_at: "2026-07-20T12:00:00+02:00", pdp_start: 90, pdp_step: 0, pdp_interval: 0 })),
    row(mission({ id: "c", status: "cancelled", pickup_at: "2026-07-18T12:00:00+02:00", cancellation_fee: 45 })),
    row(mission({ id: "d", status: "expired", pickup_at: "2026-07-17T12:00:00+02:00" })),
    row(completed({ id: "e", pickup_at: "2026-08-02T12:00:00+02:00" })),
  ];
  const ids = (r: { mission: { id: string } }[]) => r.map((x) => x.mission.id);

  it("counts the chips over everything EXCEPT the outcome filter", () => {
    // ⚑ Counting the outcome too would make every chip read its own selection
    // (1 of 1); counting nothing would make "Cancelled 2" a lie inside a
    // July-only range. A chip answers "how many of what I'm looking at ended
    // this way".
    const res = applyHistoryQuery(rows, q({ filter: "cancelled" }));
    expect(res.counts).toEqual({ all: 5, completed: 3, unfilled: 1, cancelled: 1 });
    expect(ids(res.rows)).toEqual(["c"]);
  });

  it("narrows to a date range on the Paris day of the pickup", () => {
    const res = applyHistoryQuery(rows, q({ p: "month", d: "2026-07-01" }));
    expect(ids(res.rows).sort()).toEqual(["a", "b", "c", "d"]);
    expect(res.counts.all).toBe(4);
  });

  it("narrows by Driver and by class", () => {
    expect(applyHistoryQuery(rows, q({ driver: "drv-1" })).counts.all).toBe(3);
    expect(applyHistoryQuery(rows, q({ cat: "business" })).counts.all).toBe(5);
    expect(applyHistoryQuery(rows, q({ cat: "luxury" })).counts.all).toBe(0);
  });

  it("records which fields the search hit, per mission", () => {
    const res = applyHistoryQuery(rows, q({ q: "marc" }));
    expect(res.matches.get("a")).toEqual(["driver"]);
    expect(res.matches.has("d")).toBe(false); // never took it, never matched
  });

  it("sorts newest and oldest by pickup time", () => {
    expect(ids(applyHistoryQuery(rows, q({ sort: "recent" })).rows)).toEqual(["e", "b", "c", "d", "a"]);
    expect(ids(applyHistoryQuery(rows, q({ sort: "oldest" })).rows)).toEqual(["a", "d", "c", "b", "e"]);
  });

  it("sorts a fareless trip to the bottom in BOTH directions", () => {
    // An unfilled trip is not €0 — it sorts out of the way rather than pretending.
    const high = ids(applyHistoryQuery(rows, q({ sort: "high" })).rows);
    const low = ids(applyHistoryQuery(rows, q({ sort: "low" })).rows);
    expect(high[high.length - 1]).toBe("d");
    expect(low[low.length - 1]).toBe("d");
    expect(high[0]).toBe("b"); // 90, the dearest
    expect(low[0]).toBe("c"); // the 45 € fee, the cheapest counted row
  });

  it("leaves the caller's array untouched", () => {
    const before = ids(rows);
    applyHistoryQuery(rows, q({ sort: "high" }));
    expect(ids(rows)).toEqual(before);
  });

  it("returns nothing, cleanly, when a filter matches nothing", () => {
    const res = applyHistoryQuery(rows, q({ q: "nonexistent" }));
    expect(res.rows).toEqual([]);
    expect(res.counts).toEqual({ all: 0, completed: 0, unfilled: 0, cancelled: 0 });
    expect(res.matches.size).toBe(0);
  });

  it("carries NO total — a fares-only sum has no business in here", () => {
    // There used to be a `spend` field that summed the fare and forgot the
    // waiting, so it disagreed with what both money screens actually show. It
    // was never read, which is the only reason it was never wrong on screen.
    // Removed in S55; this guards against it coming back, because summing
    // `r.fare` is the obvious-looking thing to reach for.
    const res = applyHistoryQuery([row(completed({ waiting_fee: 12 }))], q({}));
    expect("spend" in res).toBe(false);
    // The total a caller wants is rowCost, which is fare + waiting.
    expect(rowCost(res.rows[0])).toBe(72);
  });
});
