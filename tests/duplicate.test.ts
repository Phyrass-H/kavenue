// S78 — "never twice", and the contract between a migration and a sentence.
//
// ⚑ WHY THIS FILE EXISTS AT ALL. A unique violation arrives as Postgres code 23505 carrying
// the INDEX NAME and nothing else reliable. So the name is the only join between the database
// and the words a person reads — and a renamed index turns every duplicate back into
// "Something went wrong", silently, with no test failing anywhere. These assertions are that
// missing test.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  DUPLICATE_CONSTRAINTS,
  DUPLICATE_SAYS,
  duplicateSays,
  duplicateWhy,
} from "@/lib/duplicate";

const migrations = [
  "docs/migrations/2026-09-13b_never_twice.sql",
  "docs/migrations/2026-09-13_vehicle_approval_gate.sql", // the plate lives with the car's life
]
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");

describe("every index this maps has a migration that creates it", () => {
  for (const name of Object.keys(DUPLICATE_CONSTRAINTS)) {
    it(`${name} is created by a migration`, () => {
      // ⚑ Asserts the CREATE, not a mention: the file's own comments name several of these,
      // and a grep for the bare word would pass on a file that only talks about them.
      expect(migrations).toMatch(new RegExp(`create unique index if not exists\\s+${name}\\b`));
    });
  }
});

describe("reading a violation", () => {
  it("recognises a plate that is already on another account", () => {
    const err = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "vehicle_plate_live_uq"',
    };
    expect(duplicateWhy(err)).toBe("plate_taken");
    expect(duplicateSays("plate_taken")).toContain("already on another account");
  });

  it("⚑ reads the constraint NAME, not the words — a message that merely says 'plate' is not a match", () => {
    expect(duplicateWhy({ code: "23505", message: "plate is wrong somehow" })).toBeNull();
  });

  it("ignores an error that is not a duplicate", () => {
    expect(duplicateWhy({ code: "42501", message: "vehicle_plate_live_uq" })).toBeNull();
    expect(duplicateWhy(null)).toBeNull();
  });

  it("⚑ a query string is user input — a crafted `why` gets no sentence", () => {
    expect(duplicateSays("__proto__")).toBeNull();
    expect(duplicateSays("constructor")).toBeNull();
    expect(duplicateSays(undefined)).toBeNull();
  });

  it("every code has a sentence, and no sentence names anyone", () => {
    for (const why of Object.values(DUPLICATE_CONSTRAINTS)) {
      const says = DUPLICATE_SAYS[why];
      expect(says.length).toBeGreaterThan(20);
      // Naming the holder would hand one person's data to whoever guessed their plate.
      expect(says.toLowerCase()).not.toMatch(/belongs to |held by |registered to /);
    }
  });
});
