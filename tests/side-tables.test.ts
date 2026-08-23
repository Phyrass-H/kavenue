import { describe, it, expect } from "vitest";
import { groupDriverWalks, latestPerMission } from "@/lib/side-tables";

// § R rule 1 — the side-table reads changed from
//   .in("mission_id", <every mission id of this Business>)   ← ERRORS at 398 ids
// to
//   .eq("business_id", <this Business>)                      ← constant-size request
//
// ⚑ WHY THESE TESTS EXIST, AND WHY THEY ARE SHAPED LIKE THIS.
// `mission_cancellation` is EMPTY in the live database (0 rows, checked 2026-08-23),
// so the change could not be validated by running it — "the query succeeded" would
// have proved only that it parses, not that it returns the same rows. The risk being
// covered is therefore NOT "does it error" but "does it silently return DIFFERENT
// data", which is strictly worse than the bug being fixed.
//
// The claim decomposes into two halves:
//   A. the two filters select the same rows for the missions actually on screen
//   B. the extra rows the new filter also returns cannot change what is rendered
// Both are pure set/grouping properties, so both are provable here without a DB.
//
// (The third link — that side.business_id never disagrees with mission.business_id —
// is a database invariant, not a code property. It holds because every writer is a
// SECURITY DEFINER RPC that inserts v_mission.business_id verbatim, and no client
// INSERT/UPDATE policy exists on these tables. It cannot be asserted from here.)

type Side = { mission_id: string; business_id: string; created_at: string };

const BIZ = "biz-a";
const OTHER = "biz-b";

// Missions on screen (the archive) vs the ones only the NEW filter also sweeps in.
const RENDERED = ["m1", "m2", "m3"];
const OFF_SCREEN = ["m-future", "m-draft"]; // same Business, not in the archive

const CORPUS: Side[] = [
  { mission_id: "m1", business_id: BIZ, created_at: "2026-08-03T10:00:00Z" },
  { mission_id: "m1", business_id: BIZ, created_at: "2026-08-02T10:00:00Z" },
  { mission_id: "m2", business_id: BIZ, created_at: "2026-08-01T10:00:00Z" },
  { mission_id: "m-future", business_id: BIZ, created_at: "2026-08-04T10:00:00Z" },
  { mission_id: "m-draft", business_id: BIZ, created_at: "2026-08-05T10:00:00Z" },
  { mission_id: "m-other", business_id: OTHER, created_at: "2026-08-06T10:00:00Z" },
];

// The two filters, as pure predicates — the old one and the new one.
const oldFilter = (rows: Side[], ids: string[]) => rows.filter((r) => ids.includes(r.mission_id));
const newFilter = (rows: Side[], biz: string) => rows.filter((r) => r.business_id === biz);

describe("§ R rule 1 — business-scoped side reads select the same rows", () => {
  it("never LOSES a row the old filter would have returned", () => {
    const before = oldFilter(CORPUS, RENDERED);
    const after = newFilter(CORPUS, BIZ);
    for (const row of before) expect(after).toContainEqual(row);
  });

  it("is set-EQUAL to the old filter, restricted to the missions on screen", () => {
    const before = oldFilter(CORPUS, RENDERED);
    const after = newFilter(CORPUS, BIZ).filter((r) => RENDERED.includes(r.mission_id));
    expect(after).toEqual(before);
  });

  it("adds ONLY rows belonging to this Business's off-screen missions", () => {
    const extra = newFilter(CORPUS, BIZ).filter((r) => !oldFilter(CORPUS, RENDERED).includes(r));
    expect(extra.every((r) => OFF_SCREEN.includes(r.mission_id))).toBe(true);
    expect(extra.every((r) => r.business_id === BIZ)).toBe(true);
  });

  it("never leaks another Business's rows — the thing RLS and this filter both owe", () => {
    const after = newFilter(CORPUS, BIZ);
    expect(after.some((r) => r.business_id === OTHER)).toBe(false);
    expect(after.some((r) => r.mission_id === "m-other")).toBe(false);
  });

  // ⚑ NEGATIVE CONTROL. A test that cannot fail proves nothing. If the denormalised
  // business_id ever disagreed with the mission's, the equality above MUST break —
  // this asserts the test is actually sensitive to that, rather than passing by luck.
  it("DETECTS a denormalised business_id that disagrees with its mission", () => {
    const poisoned = CORPUS.map((r) => (r.mission_id === "m2" ? { ...r, business_id: OTHER } : r));
    const before = oldFilter(poisoned, RENDERED);
    const after = newFilter(poisoned, BIZ).filter((r) => RENDERED.includes(r.mission_id));
    expect(after).not.toEqual(before);
  });
});

describe("groupDriverWalks", () => {
  const rows = [
    { mission_id: "m1", created_at: "2026-08-03T10:00:00Z", reason: "sick", hours_before_pickup: "4.5" },
    { mission_id: "m1", created_at: "2026-08-02T10:00:00Z", reason: null, hours_before_pickup: 12 },
    { mission_id: "m2", created_at: "2026-08-01T10:00:00Z", reason: "car", hours_before_pickup: null },
  ];

  it("keeps EVERY walk — a re-pooled trip can be walked again, so no de-dup", () => {
    expect(groupDriverWalks(rows).get("m1")).toHaveLength(2);
  });

  it("preserves input order, because consumers render walks[0] as THE walk", () => {
    const list = groupDriverWalks(rows).get("m1")!;
    expect(list[0].at).toBe("2026-08-03T10:00:00Z");
    expect(list[0].reason).toBe("sick");
  });

  it("coerces PostgREST's numeric-as-string but keeps null as null", () => {
    const g = groupDriverWalks(rows);
    expect(g.get("m1")![0].hoursBefore).toBe(4.5);
    expect(g.get("m1")![1].hoursBefore).toBe(12);
    expect(g.get("m2")![0].hoursBefore).toBeNull();
  });

  // ⚑ THE INVARIANT THE WHOLE CHANGE RESTS ON. The Business-scoped read returns rows
  // for off-screen missions, which become extra KEYS in this map. Every consumer does
  // map.get(mission.id), so those keys are unreachable — but that must be a proved
  // property, not an assumption, because breaking it is silent.
  it("SUPERSET INVARIANCE — extra off-screen rows cannot change any rendered mission", () => {
    const extras = [
      { mission_id: "m-future", created_at: "2026-08-09T10:00:00Z", reason: "x", hours_before_pickup: 1 },
      { mission_id: "m-draft", created_at: "2026-08-08T10:00:00Z", reason: "y", hours_before_pickup: 2 },
    ];
    const base = groupDriverWalks(rows);
    const superset = groupDriverWalks([...extras, ...rows]);
    for (const id of ["m1", "m2"]) {
      expect(superset.get(id)).toEqual(base.get(id));
    }
    expect(superset.get("m-future")).toHaveLength(1);
  });
});

describe("latestPerMission", () => {
  const rows = [
    { mission_id: "m1", tag: "newest" },
    { mission_id: "m1", tag: "older" },
    { mission_id: "m2", tag: "only" },
  ];

  it("keeps the first row per mission — 'latest wins' over a created_at-desc read", () => {
    expect(latestPerMission(rows)).toEqual([
      { mission_id: "m1", tag: "newest" },
      { mission_id: "m2", tag: "only" },
    ]);
  });

  // ⚑ The de-dup is keyed PER mission, so an off-screen mission's row can only ever
  // suppress another row for that SAME off-screen mission. Prove it cannot shadow a
  // rendered one — even when it sorts first.
  it("SUPERSET INVARIANCE — an off-screen row cannot shadow a rendered mission", () => {
    const withExtras = [{ mission_id: "m-draft", tag: "intruder" }, ...rows];
    const picked = latestPerMission(withExtras);
    expect(picked.find((r) => r.mission_id === "m1")).toEqual({ mission_id: "m1", tag: "newest" });
    expect(picked.find((r) => r.mission_id === "m2")).toEqual({ mission_id: "m2", tag: "only" });
  });
});
