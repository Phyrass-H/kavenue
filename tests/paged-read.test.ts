import { describe, it, expect } from "vitest";
import {
  readAllPages,
  readAllPagesSoft,
  readByIds,
  readErrorMessage,
  PAGE_ROWS,
  MAX_PAGES,
} from "@/lib/paged-read";

// ⚑ WHAT THESE TESTS ARE DEFENDING, in one line: a read that did not finish must
// never look like a read that did. The bug being fixed is silent — PostgREST hands
// back 1 000 rows and no error — so every assertion here is about the FAILURE
// shapes, not the happy path. A pager that returns a short list on a failed page
// would pass a naive "does it page?" test and still ship the original fault.

/** A fake table of `n` rows, served in pages, optionally failing on one page. */
function table(n: number, opts: { failOnPage?: number; short?: boolean } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}` }));
  const calls: Array<[number, number]> = [];
  const run = (from: number, to: number) => {
    calls.push([from, to]);
    const page = Math.floor(from / PAGE_ROWS);
    if (opts.failOnPage === page) {
      return Promise.resolve({ data: null, error: { message: "connection reset" } });
    }
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { rows, run, calls };
}

describe("readAllPages", () => {
  it("returns everything past the 1 000-row cap, in order, asking for one page at a time", async () => {
    const t = table(2503);
    const got = await readAllPages("Your schedule", t.run);
    expect(got).toHaveLength(2503);
    expect(got[0].id).toBe("r00000");
    expect(got[2502].id).toBe("r02502");
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops on a short page — it does not spend a request proving the end", async () => {
    const t = table(1400);
    await readAllPages("Your schedule", t.run);
    expect(t.calls).toHaveLength(2);
  });

  it("asks once when the table is empty", async () => {
    const t = table(0);
    expect(await readAllPages("Your schedule", t.run)).toEqual([]);
    expect(t.calls).toHaveLength(1);
  });

  it("⚑ asks a SECOND time when the first page is exactly full — a full page is not proof of the end", async () => {
    const t = table(PAGE_ROWS);
    const got = await readAllPages("Your schedule", t.run);
    expect(got).toHaveLength(PAGE_ROWS);
    expect(t.calls).toHaveLength(2);
  });

  it("⚑⚑ THROWS on a failed page — it never returns the rows it already had", async () => {
    const t = table(2503, { failOnPage: 1 });
    await expect(readAllPages("Your schedule", t.run)).rejects.toThrow(
      /Your schedule couldn’t be read in full: connection reset/,
    );
    // And it stopped there: no page 3 was requested after the failure.
    expect(t.calls).toHaveLength(2);
  });

  it("⚑ throws when the FIRST page fails, rather than reading as an empty schedule", async () => {
    const t = table(10, { failOnPage: 0 });
    await expect(readAllPages("Your schedule", t.run)).rejects.toThrow(/couldn’t be read in full/);
  });

  it("⚑ throws rather than looping for ever when every page comes back full", async () => {
    let calls = 0;
    const always = () => {
      calls++;
      return Promise.resolve({
        data: Array.from({ length: PAGE_ROWS }, (_, i) => ({ id: `x${i}` })),
        error: null,
      });
    };
    await expect(readAllPages("Your schedule", always)).rejects.toThrow(/bigger than this screen can read/);
    expect(calls).toBe(MAX_PAGES);
  });
});

describe("readAllPagesSoft", () => {
  it("pages the whole table and reports no failure", async () => {
    const t = table(1201);
    expect(await readAllPagesSoft("this list", t.run)).toEqual({ rows: t.rows, failed: false });
  });

  it("⚑ returns NOTHING plus failed:true — never the pages that did arrive", async () => {
    const t = table(2503, { failOnPage: 1 });
    const got = await readAllPagesSoft("this list", t.run);
    expect(got.failed).toBe(true);
    expect(got.rows).toEqual([]);
  });

  it("an empty table is not a failure", async () => {
    expect(await readAllPagesSoft("this list", table(0).run)).toEqual({ rows: [], failed: false });
  });
});

describe("readByIds", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`);

  it("sends one request while the list is small", async () => {
    const batches: string[][] = [];
    const got = await readByIds("The Driver names", ids(14), (b: string[]) => {
      batches.push(b);
      return Promise.resolve({ data: b.map((id: string) => ({ id })), error: null });
    });
    expect(batches).toHaveLength(1);
    expect(got.rows).toHaveLength(14);
    expect(got.failed).toBe(false);
  });

  it("⚑ splits past the measured wall — 397 ids work, 398 throw a fetch error", async () => {
    const batches: string[][] = [];
    const got = await readByIds("The Driver names", ids(500), (b: string[]) => {
      batches.push(b);
      return Promise.resolve({ data: b.map((id: string) => ({ id })), error: null });
    });
    expect(batches.map((b) => b.length)).toEqual([200, 200, 100]);
    expect(got.rows).toHaveLength(500);
  });

  it("de-duplicates before batching — the same Driver on 400 trips is one id", async () => {
    const batches: string[][] = [];
    await readByIds("The Driver names", Array(400).fill("same-driver"), (b: string[]) => {
      batches.push(b);
      return Promise.resolve({ data: [], error: null });
    });
    expect(batches).toEqual([["same-driver"]]);
  });

  it("asks nothing when there are no ids", async () => {
    let called = false;
    const got = await readByIds("The Driver names", [], () => {
      called = true;
      return Promise.resolve({ data: [], error: null });
    });
    expect(called).toBe(false);
    expect(got).toEqual({ rows: [], failed: false });
  });

  it("⚑⚑ one failed batch fails the whole lookup — a half-filled Driver map names some rows and silently blanks others", async () => {
    let n = 0;
    const got = await readByIds("The Driver names", ids(500), (b: string[]) => {
      n++;
      return n === 2
        ? Promise.resolve({ data: null, error: { message: "fetch failed" } })
        : Promise.resolve({ data: b.map((id: string) => ({ id })), error: null });
    });
    expect(got).toEqual({ rows: [], failed: true });
  });
});

describe("readErrorMessage", () => {
  it("unwraps an Error, a string, and anything else", () => {
    expect(readErrorMessage(new Error("boom"))).toBe("boom");
    expect(readErrorMessage("boom")).toBe("boom");
    expect(readErrorMessage({ weird: true })).toBe("the read failed");
  });
});
