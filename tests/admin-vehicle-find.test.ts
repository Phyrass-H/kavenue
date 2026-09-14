// /admin/vehicles step 5 — the contract between the page, its types and its SQL (S81).
//
// ⚑ WHY TEXT ASSERTIONS ON A MIGRATION. The page calls admin_vehicle_overview and admin_vehicle_find
// by NAMED arguments, and PostgREST finds a function by those names: rename one parameter and every
// call fails, which the page can only report as "couldn't be read". tests/admin-driver-find.test.ts
// holds the same kind of line for 13d. The behaviour itself was proven on a throw-away Postgres 17
// before the file was pasted; these lines keep the shape from drifting after it.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = fs.readFileSync("docs/migrations/2026-09-14_admin_vehicles.sql", "utf8");
const PAGE = fs.readFileSync("app/admin/vehicles/page.tsx", "utf8");
const TYPES = fs.readFileSync("lib/database.types.ts", "utf8");

// Comments stripped: the header QUOTES the things the bodies must never do (is_active, like, the
// money columns, SECURITY DEFINER) in order to explain them.
const CODE = SQL.replace(/--.*$/gm, "");

const argsOf = (name: string) => {
  const header = CODE.match(new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)\\)\\s*returns`))?.[1] ?? "";
  return new Set(header.match(/p_[a-z_]+/g) ?? []);
};

describe("the page and the two functions agree", () => {
  const overviewArgs = argsOf("admin_vehicle_overview");
  const findArgs = argsOf("admin_vehicle_find");

  it("the migration declares both functions and their arguments", () => {
    expect([...overviewArgs].sort()).toEqual(["p_from", "p_to"]);
    expect([...findArgs].sort()).toEqual(
      ["p_body", "p_category", "p_include_replaced", "p_limit", "p_offset", "p_q"]);
  });

  // ⚑ The argument object is captured up to its closing `})`, not the first `)`: the call on the
  //   page carries a comment with parentheses in it, and a capture that stopped there would check
  //   three arguments of seven and pass.
  it.each([
    ["admin_vehicle_overview", overviewArgs],
    ["admin_vehicle_find", findArgs],
  ] as const)("every %s call on the page passes only arguments the function declares", (name, declared) => {
    const calls = [...PAGE.matchAll(new RegExp(`rpc\\(\\s*"${name}",\\s*\\{([\\s\\S]*?)\\}\\s*\\)`, "g"))];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) {
      const keys = args!.replace(/\/\/.*$/gm, "").match(/\bp_[a-z_]+(?=\s*:)/g) ?? [];
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect(declared).toContain(key);
    }
  });

  it("⚑ AdminVehicleFindRow names exactly the columns the function returns, in order", () => {
    const table = CODE.match(/create or replace function admin_vehicle_find[\s\S]*?returns table \(([\s\S]*?)\)\s*language/)?.[1] ?? "";
    const sqlCols = [...table.matchAll(/^\s*([a-z_]+)\s+[a-z]/gm)].map((m) => m[1]);
    const iface = TYPES.match(/export interface AdminVehicleFindRow \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const tsCols = [...iface.replace(/\/\*\*[\s\S]*?\*\//g, "").matchAll(/^\s*([a-z_]+)\??:/gm)].map((m) => m[1]);
    expect(sqlCols.length).toBe(18);
    expect(tsCols).toEqual(sqlCols);
  });
});

describe("what the bodies must never do", () => {
  it("⚑ invoker rights: neither function is SECURITY DEFINER", () => {
    expect(CODE).not.toMatch(/security\s+definer/i);
    expect((CODE.match(/language sql\s+stable\s+as \$\$/g) ?? []).length).toBe(2);
  });

  it("⚑ a term is matched with strpos, never like — % and _ are things people type", () => {
    expect(CODE).not.toMatch(/\b(i?like|similar\s+to)\b/i);
    expect(CODE).toMatch(/strpos\(/);
  });

  it("⚑ no money column — they are revoked from `authenticated`, and an invoker body naming one fails for the admin", () => {
    expect(CODE).not.toMatch(/\b(base_fare|ceiling|pdp_start|commission_[a-z_]+|accepted_fare)\b/);
  });

  it("⚑ a car is live when retired_at is null — never is_active", () => {
    expect(CODE).not.toMatch(/is_active/);
    expect(CODE).toMatch(/v\.retired_at is null/);
  });

  it("⚑ enums leave as text, so a legacy value is a string the page can keep", () => {
    expect(CODE).toMatch(/v\.category::text/);
    expect(CODE).toMatch(/v\.body_type::text/);
    expect(CODE).toMatch(/coalesce\(m\.required_body_type::text, 'any'\)/);
  });

  it("⚑ the tiers are ranked by name, never by the enum (which puts the legacy 'van' before luxury)", () => {
    expect(CODE).toMatch(/when 'eco' then 1 when 'business' then 2 when 'luxury' then 3 else 4/);
  });
});

describe("the rules the numbers rest on", () => {
  it("names its dependency: fold_text comes from 13d", () => {
    expect(SQL.slice(0, SQL.indexOf("create or replace function"))).toMatch(/2026-09-13d_admin_driver_find\.sql/);
    expect(CODE).toMatch(/fold_text\(/);
    expect(CODE).not.toMatch(/create or replace function fold_text/);
  });

  it("⚑ one bucket per car, mayTakeWork's arm first: the person AND the car", () => {
    const firstArm = CODE.match(/case\s+when ([^\n]*?) then 'can_work'/)?.[1] ?? "";
    expect(firstArm).toMatch(/d\.verified is true and v\.approval_status = 'approved'/);
  });

  it("⚑ the period is on pickup_at, half-open", () => {
    expect(CODE).toMatch(/m\.pickup_at >= p_from/);
    expect(CODE).toMatch(/m\.pickup_at <\s+p_to/);
    expect(CODE).not.toMatch(/m\.created_at\s*[<>]/);
  });

  it("⚑ a stale pooled trip is nobody's — isExpired's twin, in nobody_took and in settled", () => {
    expect((CODE.match(/m\.status = 'pooled' and m\.pickup_at <= now\(\)/g) ?? []).length).toBe(2);
  });

  it("⚑ every needle has its floor: 2 for a plate, 4 digits for a SIRET, and a number only when the term is one", () => {
    expect(CODE).toMatch(/length\(t\.compact\) >= 2/);
    expect(CODE).toMatch(/length\(t\.digits\)\s+>= 4/);
    expect(CODE).toMatch(/~ '\^\[0-9\+\(\)\.\/ -\]\+\$'/);
  });
});
