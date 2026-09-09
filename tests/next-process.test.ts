// The dev guard decides what to kill. This is the half of that decision that can be
// tested without processes — see .local/seed/next-process.mts for why it exists.
//
// ⚑ EVERY "must NOT match" CASE HERE IS A COMMAND THE FIRST VERSION KILLED. The
// original inline regex was /next-server|next dev|[/ ]next\b/ and it SIGTERMed
// ordinary work — a grep, an open editor — because it ran from the project directory.
import { describe, it, expect } from "vitest";
import { isNextDevCommand } from "../.local/seed/next-process.mts";

describe("isNextDevCommand", () => {
  it("matches a running Next dev server", () => {
    expect(isNextDevCommand("next-server (v15.5.19)")).toBe(true);
  });

  it("matches the command that starts one", () => {
    expect(isNextDevCommand("node /p/node_modules/.bin/next dev -p 3000")).toBe(true);
    expect(isNextDevCommand("next dev")).toBe(true);
    expect(isNextDevCommand("next dev -H 0.0.0.0 -p 3000")).toBe(true);
  });

  // ── the ones that cost a wrong kill ──────────────────────────────────────────
  it.each([
    ["a grep for the word", "grep -rn next lib/"],
    ["an editor with a next-* file open", "vim components/next-steps.tsx"],
    ["a script whose name starts with next-", "python3 -c pass next-thing.ts"],
    ["a path containing next", "node /p/node_modules/next/dist/bin/x --help"],
    ["the config file", "node esbuild --outfile=next.config.mjs"],
    ["a production server", "next start -p 3000"],
    ["a build", "next build"],
  ])("does not match %s", (_why, cmd) => {
    expect(isNextDevCommand(cmd)).toBe(false);
  });

  it("does not match the word alone, anywhere", () => {
    expect(isNextDevCommand("echo next")).toBe(false);
    expect(isNextDevCommand("nextcloud-sync")).toBe(false);
  });
});
