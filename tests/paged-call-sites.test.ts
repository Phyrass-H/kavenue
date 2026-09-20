// Every Business-side read that can outgrow one page must ask for pages, and every
// paged read must have a TOTAL order.
//
// ⚑ WHY THIS IS A TEST AND NOT A CODE REVIEW. Both faults are invisible while the
// data is small. An unbounded `.select()` stops at 1 000 rows and reports no error,
// and a paged read whose ORDER BY is not unique quietly loses one row and repeats
// another between two pages — neither shows up in a screenshot, a type check, or a
// unit test of the helper. What went wrong could only ever be found by reading the
// call site, so this reads the call sites: a grep with an opinion, in the idiom of
// tests/event-wiring.test.ts.
//
// ⚑ If you add a paged read, add it here. The lists are explicit rather than
// globbed so that MOVING or DELETING a call site breaks this test instead of
// silently shrinking what it checks.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const SCHEDULE = "app/(dispatch)/dispatch/page.tsx";
const HISTORY = "app/(dispatch)/dispatch/history/page.tsx";
const SPEND = "app/(dispatch)/dispatch/spend/page.tsx";
const HISTORY_CSV = "app/(dispatch)/dispatch/history/export/route.ts";
const SPEND_CSV = "app/(dispatch)/dispatch/spend/export/route.ts";
const SIDE_TABLES = "lib/side-tables.ts";

/**
 * Each paged read on the Schedule, and the unique column its ORDER BY must end on.
 *
 * `mission_guest_contact`'s primary key IS `mission_id` (2026-06-27 migration); the
 * other four tables carry their own `id`. `mission_read` is a view over `mission`,
 * whose `id` is the primary key.
 */
const PAGED_READS: Array<{ file: string; table: string; tieBreak: string }> = [
  { file: SCHEDULE, table: "mission_read", tieBreak: '.order("id"' },
  { file: SCHEDULE, table: "mission_guest_contact", tieBreak: '.order("mission_id"' },
  { file: SCHEDULE, table: "mission_amendment", tieBreak: '.order("id"' },
  { file: SCHEDULE, table: "mission_release", tieBreak: '.order("id"' },
  { file: SCHEDULE, table: "mission_info_change", tieBreak: '.order("id"' },
  { file: SIDE_TABLES, table: "mission_cancellation", tieBreak: '.order("id"' },
  // The two money screens and the two files they download. Every figure on them
  // is summed or counted from these reads, so a silent cut is a wrong number.
  { file: HISTORY, table: "mission_read", tieBreak: '.order("id"' },
  { file: SPEND, table: "mission_read", tieBreak: '.order("id"' },
  { file: HISTORY_CSV, table: "mission_read", tieBreak: '.order("id"' },
  { file: SPEND_CSV, table: "mission_read", tieBreak: '.order("id"' },
];

/**
 * Every OTHER place the Business side reads `mission_read`, and why it is allowed
 * to ask for one request.
 *
 * ⚑ This list is the point of the test below: a NEW unbounded read of the archive
 * is exactly the fault this session fixed, and it is invisible until a Business
 * passes 1 000 trips. Adding a read here is a decision someone has to write down.
 */
const NOT_PAGED: Array<{ file: string; why: string }> = [
  { file: "app/(dispatch)/dispatch/[id]/amend/actions.ts", why: "one trip, by id" },
  { file: "app/(dispatch)/dispatch/[id]/amend/page.tsx", why: "one trip, by id" },
  { file: "app/(dispatch)/dispatch/[id]/edit/page.tsx", why: "one trip, by id" },
  { file: "app/(dispatch)/dispatch/actions.ts", why: "one trip, by id (five actions)" },
  { file: "app/(dispatch)/dispatch/new/page.tsx", why: "one trip, by id — the duplicate source" },
  {
    file: "app/(dispatch)/dispatch/calendar/page.tsx",
    why: "bounded to one month ±1 day; needs 1 000 trips in a single month to bite",
  },
  {
    file: "app/(dispatch)/dispatch/drafts/page.tsx",
    why: "TO DO — drafts only, and the sidebar badge is an exact count, so the two would disagree out loud past 1 000 drafts",
  },
];

/**
 * The text of ONE `.from("<table>")` call chain.
 *
 * ⚑ It cuts at the chain's own `.range(from, to)`, not at a closing bracket: the
 * bracket that ends a chain is indented differently in a page, a route and inside
 * a Promise.all, and a window that overshoots reaches into the NEXT read — where
 * it would happily find someone else's `.range()` and pass.
 */
function chain(source: string, table: string): string {
  const at = source.indexOf(`.from("${table}")`);
  expect(at, `${table} is no longer read here`).toBeGreaterThan(-1);
  const range = source.indexOf(".range(from, to)", at);
  const bracket = source.indexOf("\n    );", at);
  const hardStop = bracket === -1 ? at + 900 : bracket;
  const end = range === -1 ? hardStop : Math.min(range + ".range(from, to)".length, hardStop);
  return source.slice(at, end);
}

describe("the Business side's reads are paged", () => {
  for (const { file, table, tieBreak } of PAGED_READS) {
    const source = read(file);
    const c = chain(source, table);

    it(`${table} asks for a page, not everything`, () => {
      expect(c, `${table} must end in .range(from, to)`).toContain(".range(from, to)");
    });

    it(`⚑ ${table} fixes its boundary before the first page`, () => {
      // A `new Date()` INSIDE the paged callback is re-evaluated per request, so
      // the "past" boundary walks forward between pages: a trip that becomes past
      // in the gap sorts to the top of a DESC result, pushes every offset down,
      // and the rows at the boundary are written twice. Found in review, S84.
      expect(c, `${table} must not build a timestamp inside the paged callback`).not.toContain(
        "new Date()",
      );
    });

    it(`${table} ends its ORDER BY on a unique column`, () => {
      const orders = [...c.matchAll(/\.order\("[a-z_]+"/g)].map((m) => m[0]);
      expect(orders.length, `${table} has no .order() — paging it is unstable`).toBeGreaterThan(0);
      expect(orders[orders.length - 1]).toBe(tieBreak);
    });
  }

  it("the trip read is the fail-CLOSED pager — a failed page must not draw a short schedule", () => {
    const source = read(SCHEDULE);
    const c = chain(source, "mission_read");
    expect(source).toContain("readAllPages<MissionRow>");
    // The soft pager swallows a failure and returns nothing; the trips themselves
    // must not use it, or an unreadable archive would render as "No missions yet."
    expect(c).not.toContain("readAllPagesSoft");
    expect(source).toMatch(/catch \(e\) \{\s*error = \{ message: readErrorMessage\(e\) \}/);
  });

  it("⚑ the Driver lookup is batched — a raw .in(<every driver id>) errors at 398 ids", () => {
    const source = read(SCHEDULE);
    expect(source).toContain('readByIds("The Driver names"');
    expect(source).toContain('.in("id", batch)');
    expect(source, "the whole id list must never travel in one request again").not.toContain(
      '.in("id", driverIds)',
    );
  });

  it("⚑ every other archive read on the Business side is accounted for", () => {
    // A `.from("mission_read")` that is neither paged nor listed above is a new
    // unbounded read of the archive — the fault this file exists to prevent.
    const seen = new Set<string>();
    for (const dir of ["app/(dispatch)"]) {
      const out = execFileSync("grep", ["-rl", '.from("mission_read")', dir], {
        cwd: root,
        encoding: "utf8",
      });
      for (const f of out.trim().split("\n")) seen.add(f);
    }
    const paged = new Set(PAGED_READS.map((r) => r.file));
    const excused = new Set(NOT_PAGED.map((r) => r.file));
    const unaccounted = [...seen].filter((f) => !paged.has(f) && !excused.has(f));
    expect(unaccounted, "page it, or add it to NOT_PAGED with a reason").toEqual([]);
  });

  it("⚑ a CSV has no half state — both downloads refuse rather than write a short file", () => {
    for (const f of [HISTORY_CSV, SPEND_CSV]) {
      const source = read(f);
      expect(source, `${f} must page the archive`).toContain("readAllPages<MissionRow>");
      expect(source, `${f} must refuse a partial read`).toContain("status: 503");
      expect(
        [...source.matchAll(/status: 503/g)].length,
        `${f} must refuse BOTH a short archive and a failed Driver lookup`,
      ).toBe(2);
      expect(source).toContain("Nothing was downloaded");
    }
  });

  it("⚑ a failed Driver read is told on the row, in both places the row states it", () => {
    const source = read(SCHEDULE);
    const row = read("components/trip-row.tsx");
    expect(source).toContain("contactsFailed={contactsFailed}");
    expect(source).toContain("driverUnread={contactsFailed}");
    // The collapsed cell and the open row's Driver bar. Fixing one and not the
    // other says two different things about the same trip on the same screen.
    expect(row).toContain("not loaded");
    expect(row).toContain("their name and phone couldn’t be loaded");
    expect(
      [...row.matchAll(/driverUnread && mission\.driver_id/g)].length,
      "both the Driver column and the Driver bar must carry the unread state",
    ).toBe(2);
  });
});
