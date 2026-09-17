// A resumed draft may only write, on the Dispatcher's own session, columns that
// session is GRANTED to update — and a new post may only insert columns it is
// granted to insert.
//
// ⚑ THE BUG THIS PINS (S82, 2026-09-17). 2026-09-04 put `standard_vat_rate` on the
// row the draft action writes, and — on purpose — not in the `mission` UPDATE grant.
// A new post INSERTs, so it worked; a resumed draft UPDATEs, so it came back 42501
// every time, and the Business read "Something went wrong. Please try again." No
// test could see it: the grant lives in SQL, the column list in TypeScript, and
// nothing compared the two.
//
// This compares them. It replays every file in docs/migrations/ in order — the grant
// is whatever the LAST relevant statement left, not whatever 2026-08-31f said — so a
// later migration that narrows the grant turns this red before it reaches the live
// draft page. (S82's parallel "Dispatcher write hole" session is narrowing both the
// UPDATE and the INSERT grant; this is the net it asked for.)
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DRAFT_RESUME_SESSION_COLUMNS,
  DRAFT_RESUME_STAMPED_COLUMNS,
  splitDraftResume,
} from "@/lib/draft-resume";

type ColumnGrant = "all" | Set<string>;

/**
 * The UPDATE (or INSERT) privilege `authenticated` holds on `mission` after these statements.
 *
 * Postgres semantics, the ones this repo learned the hard way:
 *  • Supabase ships a TABLE-WIDE grant, so the start is "all".
 *  • A column-level revoke against a table-wide grant does NOTHING (2026-08-31e/f).
 *  • A table-level revoke also removes every column-level grant.
 *  • A column-level grant adds columns; against "all" it changes nothing.
 */
function replayGrant(sqlFiles: string[], privilege: "update" | "insert" = "update"): ColumnGrant {
  let grant: ColumnGrant = "all";
  const statement =
    /\b(grant|revoke)\s+([^;]*?)\s+on\s+(?:table\s+)?(?:public\.)?mission\s+(?:to|from)\s+([^;]*);/gi;
  for (const raw of sqlFiles) {
    const sql = raw.replace(/--[^\n]*/g, "");
    for (const [, verb, privileges, roles] of sql.matchAll(statement)) {
      if (!/\bauthenticated\b/i.test(roles!)) continue;
      // `select (a), update (b, c)` or `insert, update, delete` or `all`
      for (const [, priv, cols] of privileges!.matchAll(/(\w+)\s*(?:\(([^)]*)\))?/g)) {
        const p = priv!.toLowerCase();
        if (p !== privilege && p !== "all" && p !== "privileges") continue;
        const columns = cols?.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
        if (verb!.toLowerCase() === "grant") {
          if (!columns) grant = "all";
          else if (grant !== "all") for (const c of columns) grant.add(c);
        } else {
          if (!columns) grant = new Set();
          else if (grant !== "all") for (const c of columns) grant.delete(c);
        }
      }
    }
  }
  return grant;
}

const migrationDir = "docs/migrations";
const migrations = readdirSync(migrationDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`${migrationDir}/${f}`, "utf8"));

describe("the replay itself", () => {
  it("a column revoke against the shipped table-wide grant is a no-op", () => {
    expect(replayGrant(["revoke update (guest_ready_at) on mission from anon, authenticated;"])).toBe("all");
  });
  it("a table-wide revoke clears, then a column grant is exactly that list", () => {
    const g = replayGrant([
      "revoke update on public.mission from authenticated;",
      "grant update (\n  id, -- a comment ; with a semicolon\n  status\n) on public.mission to authenticated;",
    ]);
    expect(g).toEqual(new Set(["id", "status"]));
  });
  it("reads the privilege it is asked for, and `all` counts for both", () => {
    const sql = [
      "revoke insert, update, delete on public.mission from authenticated;",
      "grant select, insert (a, b), update (c) on public.mission to authenticated;",
    ];
    expect(replayGrant(sql, "insert")).toEqual(new Set(["a", "b"]));
    expect(replayGrant(sql, "update")).toEqual(new Set(["c"]));
    expect(replayGrant([...sql, "revoke all on mission from authenticated;"], "insert")).toEqual(new Set());
  });
  it("ignores other tables and other roles", () => {
    const g = replayGrant([
      "revoke update on public.mission from authenticated;",
      "grant update (x) on public.mission_read to authenticated;",
      "grant update (y) on public.mission to service_role;",
      "grant update on driver to authenticated;",
    ]);
    expect(g).toEqual(new Set());
  });
});

describe("resuming a draft stays inside the session's UPDATE grant", () => {
  const grant = replayGrant(migrations);

  it("the live grant is a column list, and the replay found it", () => {
    // If this is "all", the parser missed 2026-08-31f's revoke — every check below
    // would pass for the wrong reason. ⚑ Not `id`: the write-hole migration drops it.
    expect(grant).not.toBe("all");
    const cols = grant as Set<string>;
    expect(cols.has("status")).toBe(true); // posting a draft IS a status write
    expect(cols.has("guest_ready_at")).toBe(false); // 2026-08-31f's whole point
  });

  it("every column the session writes is granted", () => {
    const cols = grant as Set<string>;
    const missing = DRAFT_RESUME_SESSION_COLUMNS.filter((c) => !cols.has(c));
    expect(missing).toEqual([]);
  });

  it("a tax rate is stamped, never written by the session — and stays ungranted", () => {
    expect(DRAFT_RESUME_STAMPED_COLUMNS).toContain("standard_vat_rate");
    expect(DRAFT_RESUME_SESSION_COLUMNS).not.toContain("standard_vat_rate");
    expect((grant as Set<string>).has("standard_vat_rate")).toBe(false);
  });

  it("no column is in both lists", () => {
    const both = DRAFT_RESUME_SESSION_COLUMNS.filter((c) =>
      (DRAFT_RESUME_STAMPED_COLUMNS as readonly string[]).includes(c),
    );
    expect(both).toEqual([]);
  });
});

describe("a new post stays inside the session's INSERT grant", () => {
  // A new post inserts `{ ...row, ...eta, ...opening, ...boardUpload, ...labels }` —
  // the draft-resume row without `created_at`, and `splitDraftResume` refuses at
  // COMPILE time any key of that row outside the two lists (asserted below). So the
  // two lists minus `created_at` over-approximate the insert. It is NOT split: a
  // pooled trip must never exist, even for a moment, without its snapshot.
  // ⚑ "all" today — INSERT has never been column-granted — so this is a no-op until
  // the write-hole migration adds its `grant insert (…)`.
  const insertGrant = replayGrant(migrations, "insert");
  it("every column a new post inserts is granted", () => {
    const inserted = [...DRAFT_RESUME_SESSION_COLUMNS, ...DRAFT_RESUME_STAMPED_COLUMNS].filter(
      (c) => c !== "created_at",
    );
    const missing = insertGrant === "all" ? [] : inserted.filter((c) => !insertGrant.has(c));
    expect(missing).toEqual([]);
  });
});

describe("splitDraftResume", () => {
  it("keeps only the keys present, so a conditional spread still means 'not overwritten'", () => {
    const { session, stamped } = splitDraftResume({
      status: "pooled",
      ceiling: 120,
      standard_vat_rate: 0.2,
      commission_vat_rate: 0.2,
    });
    expect(session).toEqual({ status: "pooled", ceiling: 120 });
    expect(stamped).toEqual({ standard_vat_rate: 0.2, commission_vat_rate: 0.2 });
    expect("pdp_start" in stamped).toBe(false);
  });

  it("throws on a column in neither list rather than dropping it", () => {
    const smuggled = { status: "draft", guest_ready_at: "2026-09-17T10:00:00Z" } as Record<string, unknown>;
    expect(() => splitDraftResume(smuggled as never)).toThrow(/guest_ready_at/);
  });
});

describe("the action uses the split", () => {
  // Comment lines stripped: the notes in the action name the old single update.
  const action = readFileSync("app/(dispatch)/dispatch/new/actions.ts", "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("the session update sends `session`, the service role sends `stamped`, stamp first", () => {
    const stampAt = action.indexOf(".update(stamped)");
    const sessionAt = action.indexOf(".update(session)");
    expect(stampAt).toBeGreaterThan(-1);
    expect(sessionAt).toBeGreaterThan(stampAt);
    expect(action.slice(action.lastIndexOf("createAdminClient()", stampAt), stampAt)).toMatch(
      /^createAdminClient\(\)\s*\.from\("mission"\)\s*$/,
    );
    expect(action).not.toContain(".update(updateRow)");
  });

  it("the insert and the split resume are built from the same spreads", () => {
    const spreads = "...row, ...eta, ...opening, ...boardUpload, ...labels";
    expect(action).toContain(`.insert({ ${spreads} })`);
    expect(action).toContain(`? { ${spreads} }`);
    expect(action).toContain(`: { ${spreads}, created_at: new Date().toISOString() }`);
    expect(action).toContain("splitDraftResume(updateRow)");
  });
});
