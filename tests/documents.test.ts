// What is actually behind a document row.
//
// ⚑ THE ONLY PROPERTY THAT MATTERS HERE IS AN ORDER. `isPdf` is the stored
// path's extension, and a row whose upload never happened still HAS a path —
// every `seed://…/drivers_licence.pdf` row in the live database ends in .pdf. So
// asking "is it a PDF?" before "is there a file?" reports a document that does
// not exist as a PDF. That shipped twice in one afternoon (2026-09-09), in the
// thumbnail and in the viewer's toolbar, and the founder had already been bitten
// by the same root cause the day before: the screen offered Approve on a licence
// nobody could open.
import { describe, expect, it } from "vitest";
import { fileKind } from "@/lib/document-kind";

const file = (over: Partial<{ viewUrl: string | null; isPdf: boolean }> = {}) => ({
  viewUrl: "https://example.test/signed" as string | null,
  isPdf: false,
  ...over,
});

describe("missing outranks kind", () => {
  it("a .pdf path with no file behind it is MISSING, not a PDF", () => {
    expect(fileKind(file({ viewUrl: null, isPdf: true }))).toBe("missing");
  });

  it("an image path with no file behind it is missing too", () => {
    expect(fileKind(file({ viewUrl: null, isPdf: false }))).toBe("missing");
  });

  it("no row at all is missing", () => {
    expect(fileKind(null)).toBe("missing");
    expect(fileKind(undefined)).toBe("missing");
  });
});

describe("once there is a file, the kind decides", () => {
  it("a PDF that exists is a pdf", () => {
    expect(fileKind(file({ isPdf: true }))).toBe("pdf");
  });

  it("anything else that exists is an image", () => {
    expect(fileKind(file())).toBe("image");
  });
});

describe("the three kinds are exhaustive", () => {
  // ⚑ Every caller switches on this. A fourth kind must be a compile error at
  // the call sites, not a silent fall-through to the image branch.
  it("only ever returns one of three", () => {
    const seen = new Set(
      [
        file(),
        file({ isPdf: true }),
        file({ viewUrl: null }),
        file({ viewUrl: null, isPdf: true }),
      ].map(fileKind),
    );
    expect([...seen].sort()).toEqual(["image", "missing", "pdf"]);
  });
});
