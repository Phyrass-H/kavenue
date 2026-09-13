// What a Driver approval writes (S80). ⚑ The bug this pins: the approval wrote `verified` alone, so
// the change-log trigger copied the previous writer — the Driver themself — as the actor.
import { describe, expect, it } from "vitest";
import { verifiedPatch } from "@/lib/driver-verified";

const AT = new Date("2026-09-13T15:00:00Z");
const ADMIN = "11111111-1111-1111-1111-111111111111";

describe("verifiedPatch", () => {
  it("⚑ an approval names the admin as the writer, through the admin door", () => {
    const p = verifiedPatch(true, ADMIN, AT);
    expect(p.last_written_by).toBe(ADMIN);
    expect(p.last_written_via).toBe("admin");
  });

  it("an approval records when, and by whom", () => {
    expect(verifiedPatch(true, ADMIN, AT)).toEqual({
      verified: true,
      verified_at: "2026-09-13T15:00:00.000Z",
      verified_by: ADMIN,
      last_written_by: ADMIN,
      last_written_via: "admin",
    });
  });

  it("⚑ taking it back clears the approval in force — and still names the admin who did it", () => {
    expect(verifiedPatch(false, ADMIN, AT)).toEqual({
      verified: false,
      verified_at: null,
      verified_by: null,
      last_written_by: ADMIN,
      last_written_via: "admin",
    });
  });

  it("⚑ every patch sets both stamp columns, whichever way it goes — leaving one out is the bug", () => {
    for (const next of [true, false]) {
      const p = verifiedPatch(next, ADMIN, AT);
      expect(Object.keys(p)).toEqual(
        expect.arrayContaining(["verified", "last_written_by", "last_written_via"]),
      );
      expect(p.last_written_by).not.toBeNull();
    }
  });
});
