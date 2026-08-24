// § AG — is every event type the app claims to write actually wired to a caller?
//
// ⚑ WHY THIS IS A TEST AND NOT A CODE REVIEW. When the log shipped on 2026-08-24
// it defined 23 event types and a trigger that writes 12 of them. The other 11
// were declared in APP_EVENTS, listed in the DB registry as captured_by='app',
// and written by NOTHING — `log_mission_event()` was called from nowhere in the
// codebase and no server action inserted a row. Nothing failed, nothing warned:
// a declared-but-unwritten event type is invisible until someone goes looking for
// the rows and finds none.
//
// So this reads the source and asserts the wiring exists. It is a grep with an
// opinion, deliberately: the thing that went wrong was not a broken call, it was
// the ABSENCE of a call, and only counting call sites catches that.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_EVENTS, TRIGGER_EVENTS, audienceFor } from "@/lib/mission-events";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// Every file that calls recordMissionEvent(). Listed explicitly rather than
// globbed so that DELETING a call site breaks this test instead of silently
// shrinking the search space.
const CALL_SITES = [
  "app/(app)/rides/actions.ts",
  "app/(app)/missions/[id]/actions.ts",
  "app/(app)/missions/[id]/page.tsx",
  "app/(dispatch)/dispatch/actions.ts",
  "app/(dispatch)/dispatch/[id]/amend/actions.ts",
  "app/(dispatch)/dispatch/[id]/edit/actions.ts",
];

const sources = CALL_SITES.map(read).join("\n");

/**
 * The two the founder decided NOT to record (2026-08-24). Both are a Driver
 * browsing — scrolling the Pool, or opening a trip that is not theirs — and at
 * nine Drivers a phone call answers better than a log.
 *
 * ⚑ Listed here so the test below can tell "deliberately absent" from "someone
 * forgot". If either is ever wired, this list is the thing to update first.
 */
const DELIBERATELY_UNWIRED = ["pool_impression", "mission_viewed"] as const;

describe("every app event has a writer", () => {
  const shouldBeWired = APP_EVENTS.filter(
    (e) => !DELIBERATELY_UNWIRED.includes(e as (typeof DELIBERATELY_UNWIRED)[number]),
  );

  it("covers the nine types that are meant to be wired", () => {
    expect(shouldBeWired).toHaveLength(9);
  });

  it.each(shouldBeWired)("%s is written from at least one call site", (type) => {
    expect(sources).toContain(`type: "${type}"`);
  });

  it.each(DELIBERATELY_UNWIRED)("%s is NOT written — a founder decision, not a gap", (type) => {
    expect(sources).not.toContain(`type: "${type}"`);
  });
});

describe("the two rules a writer must not break", () => {
  // A log write that throws turns "your check-in worked but we didn't note it"
  // into "your check-in failed". The helper swallows everything; this pins that
  // it still does, because removing the try/catch would be an easy tidy-up.
  it("recordMissionEvent swallows its own errors", () => {
    const helper = read("lib/mission-events-server.ts");
    expect(helper).toContain("try {");
    expect(helper).toContain("catch");
    expect(helper).toMatch(/console\.error/);
    // No rethrow: the catch must end the failure, not forward it.
    expect(helper).not.toMatch(/catch\s*\([^)]*\)\s*\{[^}]*throw/s);
  });

  // ⚑ accept_mission refuses by RAISE, and a raise rolls back the transaction —
  // so a row written INSIDE the RPC would disappear with the error it records.
  // The only place the fact survives is the app, after the call returned.
  it("accept_rejected is written from the app, never from inside the RPC", () => {
    const action = read("app/(app)/missions/[id]/actions.ts");
    const rejectedAt = action.indexOf('type: "accept_rejected"');
    const rpcAt = action.indexOf('rpc("accept_mission"');
    expect(rejectedAt).toBeGreaterThan(-1);
    expect(rejectedAt).toBeGreaterThan(rpcAt); // after the call, out of band
  });
});

describe("the honesty rules hold", () => {
  it("app writers never claim to be the trigger", () => {
    const helper = read("lib/mission-events-server.ts");
    expect(helper).toContain('source: "app"');
    expect(helper).not.toContain('source: "db_trigger"');
  });

  it("a Driver's own conduct stays out of the Business's view", () => {
    // accept_rejected is a Driver being refused by Kavenue's rules. The Business
    // has no business seeing which Drivers tried and failed to take their trip.
    expect(audienceFor("accept_rejected")).toEqual(["admin"]);
    expect(audienceFor("contact_revealed")).toEqual(["admin"]);
  });

  it("the trigger's own events are never in the app's vocabulary", () => {
    // Both lists are exported and both are used to reason about completeness —
    // an overlap would make `isObserved` ambiguous for that type.
    const overlap = APP_EVENTS.filter((e) => (TRIGGER_EVENTS as readonly string[]).includes(e));
    expect(overlap).toEqual([]);
  });
});
