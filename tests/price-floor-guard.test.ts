// §5 — a trip may not be POSTED without a floor price.
//
// ⚑ THE BUG THIS PINS. The guard read:
//
//     if (!asDraft && quote && round2(ceiling!) < round2(quote.floor_price))
//
// which makes a MISSING quote indistinguishable from one that passed. When
// routing fails there is no quote, so the floor check was skipped entirely and
// the trip posted anyway — with `pdp_start` falling back to 50 % of the Ceiling
// in the same breath. **The absence of a price is not evidence that the price is
// fine.** A previous session spotted this while fixing `pdp_start` and wrote it
// down in a comment (`…skipped in exactly the same breath`) without closing it.
//
// These are source assertions rather than behaviour tests: the guard lives inside
// a server action whose failure mode is `redirect()`, which throws, and the thing
// that went wrong was the SHAPE of one boolean. Pinning the shape is what stops
// `&& quote` coming back — a behaviour test would need the whole Next request
// pipeline to catch a two-character regression.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * The same file with `//` comment lines removed.
 *
 * ⚑ Needed because the comments here QUOTE the broken code they describe — the
 * note above the guard says `This guard used to read \`!asDraft && quote && …\``,
 * which is exactly the string the regression test looks for. Asserting against
 * raw source would either fail on its own documentation or force the comment to
 * stop naming the bug, and naming the bug is most of a comment's value.
 */
const code = (src: string) =>
  src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

const post = read("app/(dispatch)/dispatch/new/actions.ts");
const amend = read("app/(dispatch)/dispatch/[id]/amend/actions.ts");
const postForm = read("app/(dispatch)/dispatch/new/mission-form.tsx");
const amendPage = read("app/(dispatch)/dispatch/[id]/amend/page.tsx");

describe("posting refuses when there is no price", () => {
  it("bails out on a missing quote BEFORE comparing anything", () => {
    expect(post).toContain('if (!asDraft && !quote) {');
    expect(post).toContain('redirect(backTo("noprice"));');
  });

  // The regression, stated exactly: truthiness of `quote` must never be part of
  // the floor COMPARISON, because that is what silently disabled it.
  it("the floor comparison no longer depends on the quote existing", () => {
    expect(code(post)).not.toContain("!asDraft && quote &&");
    expect(post).toContain("if (!asDraft && round2(ceiling!) < round2(quote!.floor_price))");
  });

  // Refusing to post because a third party hiccuped would trade a silent money
  // bug for a loud availability one. One retry kills transient blips; a real
  // outage still stops at the guard, which is the right place to stop.
  it("routing is retried once before the refusal", () => {
    expect(post).toContain("routeOnce");
    expect(post).toMatch(/metrics = await routeOnce\(\)/);
  });

  // A draft may be parked without a drop-off (S27), so it may be parked without
  // a price. Only POSTING is gated.
  it("drafts stay lenient", () => {
    const guard = post.slice(post.indexOf("if (!asDraft && !quote)"));
    expect(guard.slice(0, 60)).toContain("!asDraft");
  });
});

describe("every refusal says why", () => {
  // The failure this closes: `amend/page.tsx` renders `error && ERROR_COPY[error]`,
  // so a key with no copy renders NOTHING. The amend action had redirected with
  // `noprice` since it was written, and the Dispatcher was bounced back to the
  // form with no message — a refusal that looks like a broken button.
  it("amend redirects with noprice, and the page has copy for it", () => {
    expect(amend).toContain('backTo("noprice")');
    expect(amendPage).toContain("noprice:");
  });

  it("posting has copy for its new refusal too", () => {
    expect(postForm).toContain('error === "noprice"');
  });

  // Every key the posting action can redirect with must have a banner, or the
  // same silent-bounce bug comes back under a different name.
  it("every error key the posting action uses is rendered", () => {
    const keys = [...post.matchAll(/backTo\("([a-z]+)"\)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(3);
    const unrendered = [...new Set(keys)].filter((k) => !postForm.includes(`error === "${k}"`));
    expect(unrendered).toEqual([]);
  });
});
