// Which addresses the hosted one-click sign-in will open.
//
// ⚑ THE POINT OF THIS FILE IS admin@kavenue.fr. `/api/dev-login` does not merely
// sign an account in — `ensureUser` OVERWRITES its password with DEV_PASSWORD
// (S75 trap #1). So on the live site, one URL pointed at a real account would
// both open it AND silently change the founder's admin password. This repo has
// already lost six real accounts to a published dev credential.
//
// ⚑ RESERVED DOMAINS, NOT A LIST OF ADDRESSES. `.local` and `.test` are
// unroutable by RFC 6761 / RFC 2606 — nobody can register them, so nobody can
// receive mail at one, so no such account can belong to a real person. A
// hand-written allowlist would need editing every time a fixture is added, and
// the edit that gets forgotten either breaks testing or re-opens the door.
import { describe, expect, it } from "vitest";
import { isFixtureEmail } from "@/lib/fixture-email";

describe("real accounts are refused on the live site", () => {
  it("the founder's admin account, above all", () => {
    expect(isFixtureEmail("admin@kavenue.fr")).toBe(false);
  });

  it("any ordinary address a Driver or hotel could actually own", () => {
    for (const e of [
      "phyrass.h@gmail.com",
      "reception@carlton-cannes.com",
      "marc.fontaine@orange.fr",
      "someone@kavenue.fr",
    ]) {
      expect(isFixtureEmail(e), e).toBe(false);
    }
  });

  // ⚑ A domain that merely CONTAINS the word is not a reserved domain.
  // "local.example.com" is registrable; "…@evil-test.com" is registrable.
  it("is not fooled by a lookalike domain", () => {
    for (const e of ["x@local.example.com", "x@evil-test.com", "x@test.example.com", "x@notlocal.fr"]) {
      expect(isFixtureEmail(e), e).toBe(false);
    }
  });

  it("refuses something that is not an address at all", () => {
    expect(isFixtureEmail("no-at-sign")).toBe(false);
    expect(isFixtureEmail("")).toBe(false);
  });
});

describe("the fixtures the founder actually clicks still work", () => {
  it("the two demo accounts the buttons point at", () => {
    expect(isFixtureEmail("demo.driver@pickup.local")).toBe(true);
    expect(isFixtureEmail("demo.business@pickup.local")).toBe(true);
  });

  it("the seeded fleet and the test Driver", () => {
    expect(isFixtureEmail("s46.driver@pickup.local")).toBe(true);
    expect(isFixtureEmail("test.driver@kavenue.test")).toBe(true);
  });

  it("case does not matter — an address is not case-sensitive in its domain", () => {
    expect(isFixtureEmail("Demo.Driver@PickUp.Local")).toBe(true);
  });
});
