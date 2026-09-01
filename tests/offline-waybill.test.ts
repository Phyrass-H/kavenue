// § 4 — the Waybill, off the network.
//
// ⚑ THE POINT OF THIS FILE IS THE SEAM. `public/sw.js` is served raw to the browser, so
// it cannot import a single line from `lib/`: it re-declares the cache name, the index
// URL, the message types and the French date shape BY HAND. Nothing in TypeScript can
// notice when the two drift — a renamed constant on one side and the saved copies simply
// stop being found, silently, on a Driver's phone in a car park.
//
// So most of what follows reads `public/sw.js` as text and asserts it still agrees with
// the module. The unit tests underneath cover the two things a Driver actually reads: how
// old their copy is, and when it picks up.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  HELD_STATUSES,
  MSG_CACHE,
  MSG_CLEAR,
  WAYBILL_CACHE,
  WAYBILL_INDEX_URL,
  WAYBILLS_PATH,
  savedLabel,
  waybillIdFromPath,
  waybillPath,
  waybillWhen,
} from "@/lib/offline-waybill";
import { frDateTime } from "@/lib/waybill";

const SW = readFileSync("public/sw.js", "utf8");
const DOC_PAGE = readFileSync("app/(app)/missions/[id]/waybill/page.tsx", "utf8");

describe("the service worker still agrees with the module it cannot import", () => {
  it("re-declares the same four constants", () => {
    expect(SW).toContain(`const CACHE = "${WAYBILL_CACHE}";`);
    expect(SW).toContain(`const INDEX_URL = "${WAYBILL_INDEX_URL}";`);
    expect(SW).toContain(`const WAYBILLS_PATH = "${WAYBILLS_PATH}";`);
    expect(SW).toContain(`const MSG_CACHE = "${MSG_CACHE}";`);
    expect(SW).toContain(`const MSG_CLEAR = "${MSG_CLEAR}";`);
  });

  it("builds the Waybill URL the same way", () => {
    expect(waybillPath("abc")).toBe("/missions/abc/waybill");
    expect(SW).toContain('return "/missions/" + id + "/waybill";');
  });

  it("refuses to keep a redirect — a login page is a 200 by the time fetch resolves it", () => {
    expect(SW).toContain("!res.redirected");
  });
});

// ⚑ THE TRAP THIS BLOCK EXISTS FOR. The stamp used to be a string `public/sw.js` spliced
// into the cached HTML, and it worked — right up until the stylesheet loaded. A cached
// page HYDRATES: React reconciles the real DOM against its own component tree and deletes
// anything the worker put there. The offline test passed unstyled (no JS, no hydration,
// stamp present) and failed styled (stamp gone), from the same code. So: the worker hands
// back the page untouched, and the marks are components.
describe("the worker hands the saved page back untouched", () => {
  it("has no opinion about markup at all", () => {
    for (const gone of ["stampCopy", "data-kv", "innerHTML", ".replace(/<"]) {
      expect(SW, `public/sw.js is rewriting HTML again (${gone})`).not.toContain(gone);
    }
  });

  it("still formats the document's dates in one place", () => {
    // The seam is gone with the injection: only lib/waybill.ts builds this string now,
    // and both the document and the stamp on the copy read it from there.
    expect(frDateTime("2026-08-25T19:02:00Z")).toBe("25 août 2026 à 21 h 02");
  });
});

describe("the two marks a saved copy carries", () => {
  const MARKS = readFileSync("components/saved-copy.tsx", "utf8");
  // These files DISCUSS navigator.onLine at length — the assertions below are about the
  // code, so strip the comments or they test their own explanation.
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const CODE = strip(MARKS);

  it("are both on the document page", () => {
    expect(DOC_PAGE).toContain("<SavedCopyNotice missionId={id} />");
    expect(DOC_PAGE).toContain("<SavedCopyStamp missionId={id} />");
  });

  // ⚑ THE SECOND TRAP, and it shipped green once. `navigator.onLine` reports whether the
  // device has *a* network — it is true behind a hotel captive portal, and it was true in
  // testing with the server switched off, so the saved list cheerfully said "up to date,
  // your 2 trips will open without signal" while nothing was reachable at all. Both
  // screens ask `reachable()`, which makes a real request.
  it.each([
    ["components/saved-copy.tsx", MARKS],
    ["components/offline-waybills.tsx", readFileSync("components/offline-waybills.tsx", "utf8")],
  ])("%s decides from a request, never from navigator.onLine", (_name, src) => {
    const code = strip(src);
    expect(code).not.toContain("navigator.onLine");
    expect(code).toContain("reachable()");
  });

  it("render nothing at all while the page is live", () => {
    expect(CODE).toContain("if (savedAt === null) return null;");
  });
});

describe("how old is my copy", () => {
  const now = new Date("2026-08-25T19:30:00Z"); // 21 h 30 in Paris

  it("says 'just now' only while that is true", () => {
    expect(savedLabel("2026-08-25T19:29:30Z", now)).toBe("Saved just now");
    // ⚑ 91 seconds is not "just now". This is the Driver's answer to "am I covered?"
    // before they drive down a ramp, so it prints the time instead of reassuring them.
    expect(savedLabel("2026-08-25T19:28:29Z", now)).toBe("Saved at 21:28");
  });

  it("carries the day once the copy is from another one", () => {
    expect(savedLabel("2026-08-24T19:02:00Z", now)).toBe("Saved 24 août at 21:02");
  });

  it("never claims a copy that isn't there", () => {
    expect(savedLabel(undefined, now)).toBe("Not saved yet");
    expect(savedLabel(null, now)).toBe("Not saved yet");
    expect(savedLabel("not a date", now)).toBe("Not saved yet");
  });
});

describe("the row's own line", () => {
  it("reads as a pickup, in Paris time", () => {
    expect(waybillWhen("2026-08-25T19:35:00Z")).toBe("25 août · 21:35");
  });
  it("never prints Invalid Date at a roadside", () => {
    expect(waybillWhen(null)).toBe("—");
    expect(waybillWhen("nope")).toBe("—");
  });
});

describe("which trips are worth having on the phone", () => {
  it("is the held set, and My Rides shares the definition rather than repeating it", () => {
    expect(HELD_STATUSES).toEqual([
      "accepted",
      "confirmed",
      "en_route",
      "arrived",
      "on_board",
    ]);
    const rides = readFileSync("app/(app)/rides/page.tsx", "utf8");
    expect(rides).toContain("const ACTIVE_STATUSES: MissionStatus[] = HELD_STATUSES;");
  });

  it("reads an id back out of a Waybill URL, and nothing else", () => {
    expect(waybillIdFromPath("/missions/abc-123/waybill")).toBe("abc-123");
    expect(waybillIdFromPath("/missions/abc-123")).toBeNull();
    expect(waybillIdFromPath("/waybills")).toBeNull();
    expect(waybillIdFromPath("/missions/abc/waybill/extra")).toBeNull();
  });
});
