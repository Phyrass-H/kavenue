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
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const SCHEDULE = "app/(dispatch)/dispatch/page.tsx";
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
];

/** The text of one `.from("<table>")` call chain, up to the end of its statement. */
function chain(source: string, table: string): string {
  const at = source.indexOf(`.from("${table}")`);
  expect(at, `${table} is no longer read here`).toBeGreaterThan(-1);
  const end = source.indexOf("\n    );", at);
  return source.slice(at, end === -1 ? at + 900 : end);
}

describe("the Schedule's reads are paged", () => {
  for (const { file, table, tieBreak } of PAGED_READS) {
    const source = read(file);
    const c = chain(source, table);

    it(`${table} asks for a page, not everything`, () => {
      expect(c, `${table} must end in .range(from, to)`).toContain(".range(from, to)");
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
