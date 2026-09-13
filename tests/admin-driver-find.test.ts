// /admin/drivers step 4 — the search term, and the contract between the page and its SQL (S79).
//
// ⚑ WHY TEXT ASSERTIONS ON A MIGRATION. The page calls admin_driver_find by NAMED arguments, and
// PostgREST finds a function by those names: rename one parameter and every call fails, which
// the page can only report as "couldn't be read". tests/duplicate.test.ts holds the same kind of
// line for the never-twice index names.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SEARCH_MIN, driverSearchTerm } from "@/lib/admin-drivers";

const SQL = fs.readFileSync("docs/migrations/2026-09-13d_admin_driver_find.sql", "utf8");
const PAGE = fs.readFileSync("app/admin/drivers/page.tsx", "utf8");

describe("driverSearchTerm", () => {
  it("says nothing below the floor", () => {
    expect(SEARCH_MIN).toBe(2);
    expect(driverSearchTerm(undefined)).toBeNull();
    expect(driverSearchTerm("")).toBeNull();
    expect(driverSearchTerm("  a  ")).toBeNull();
  });

  it("trims and collapses spaces, and leaves the accents for the database to fold", () => {
    expect(driverSearchTerm("  Élodie   Marchand ")).toBe("Élodie Marchand");
  });

  it("caps what a person can paste", () => {
    expect(driverSearchTerm("x".repeat(500))!.length).toBe(80);
  });

  it("⚑ a repeated ?q= arrives as an array, and takes the first instead of throwing", () => {
    expect(driverSearchTerm(["Marc", "Fontaine"])).toBe("Marc");
    expect(driverSearchTerm([])).toBeNull();
  });
});

describe("the page and admin_driver_find agree", () => {
  const header = SQL.match(/create or replace function admin_driver_find\(([\s\S]*?)\)\s*returns/)?.[1] ?? "";
  const declared = new Set(header.match(/p_[a-z_]+/g) ?? []);

  it("the migration declares the function and its arguments", () => {
    expect([...declared].sort()).toEqual(["p_blocked", "p_limit", "p_offset", "p_q"]);
  });

  it("every call on the page passes only arguments the function declares", () => {
    const calls = [...PAGE.matchAll(/rpc\(\s*"admin_driver_find",\s*([\s\S]*?)\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) {
      for (const key of args!.match(/p_[a-z_]+/g) ?? []) expect(declared).toContain(key);
    }
  });

  it("⚑ the section is mayTakeWork's twin — the car counts, not only `verified`", () => {
    expect(SQL).toMatch(/not f\.verified or f\.car_status is distinct from 'approved'/);
  });

  it("⚑ fold_text's two alphabets are the same length, or translate() drops letters", () => {
    const m = SQL.match(/translate\(p,\s*'([^']*)',\s*'([^']*)'\)/);
    expect(m).not.toBeNull();
    expect([...m![1]!].length).toBe([...m![2]!].length);
  });

  it("⚑ a term is matched with strpos, never like — % and _ are things people type", () => {
    const body = SQL.slice(SQL.indexOf("create or replace function admin_driver_find"));
    expect(body).not.toMatch(/\blike\b/i);
  });
});
