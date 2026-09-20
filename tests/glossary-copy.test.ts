// CLAUDE.md hard rule 1, made mechanical: no screen may say "hotel" when it means
// "a Business".
//
// ⚑ WHY THIS IS A TEST AND NOT A CODE REVIEW. The founder settled this in S71 —
// *"the vocabulary is Businesses and then categories by type of business"* ([[d99]])
// — and by 2026-09-20 the Driver's app had drifted back to "the hotel" in five
// rendered strings across four files, including a section HEADING on My Rides. None
// of them failed anything: wrong copy compiles, renders and passes every test, so it
// survives until a human happens to read that screen. Two review sweeps found these;
// a third sweep next quarter is not a plan.
//
// So this reads the source and greps it with an opinion. It scans app/, components/
// and lib/ for the word outside a comment, and every legitimate use is listed below
// by file AND by the exact words — so a NEW "hotel" string in an already-listed file
// still turns this red, and an allowance that stops matching does too.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];

/**
 * The business-type module is the ONE place `hotel` is a type and not a synonym:
 * the enum value, its NAF mapping and the labels an admin picks from.
 */
const TYPE_MODULE = "lib/business-type.ts";

/**
 * Uses that genuinely mean a hotel-type Business, or a proper noun. Each entry must
 * match at least one surviving line — a stale allowance fails the last test here,
 * which is how a fixed string gets its exemption taken away again.
 */
const ALLOWED: { file: string; needle: string; why: string }[] = [
  {
    file: "app/welcome/page.tsx",
    needle: "(hotel, agency, concierge)",
    why: "Under the heading 'I'm a Business' — these are example TYPES of business, which is the rule stated correctly, not broken.",
  },
  {
    file: "app/legal/terms/page.tsx",
    needle: "hôtels en premier lieu",
    why: "'les « Businesses », hôtels en premier lieu' — hotels named as the first vertical, exactly the distinction the rule draws.",
  },
  {
    file: "app/legal/terms/page.tsx",
    needle: "hotels first",
    why: "The English half of the same sentence.",
  },
  {
    file: "app/(dispatch)/dispatch/settings/page.tsx",
    needle: "Oetker Hôtel Management Company",
    why: "A real company's registered name, the placeholder for 'raison sociale' — a proper noun illustrating that the legal name differs from the name on the door. Part of one coherent worked example (the address and phone on this screen are the same company's).",
  },
  {
    file: "app/api/seed/route.ts",
    needle: 'business_type: "hotel"',
    why: "Dev seed data: the seeded Business's actual type.",
  },
  {
    file: "app/api/seed/route.ts",
    needle: "Hôtel Negresco, 37 Prom. des Anglais, Nice",
    why: "A real Nice address — a place name, not a word for a Business.",
  },
  {
    file: "app/api/seed/route.ts",
    needle: "Hôtel du Cap-Eden-Roc, Bd J.F. Kennedy, Antibes",
    why: "A real Antibes address — a place name.",
  },
];

/**
 * The file with every comment blanked out, so a line's position is preserved and a
 * hit can still be reported as file:line.
 *
 * ⚑ It has to understand strings, not just `//`: the repo's copy lives in JSX text
 * and template literals, and `{/* … *\/}` is the normal way a component explains
 * itself right above the words it renders. A scanner that only stripped `//` would
 * have missed close-trip-card.tsx, where the comment and the copy said the same
 * wrong thing one line apart.
 *
 * ⚑ AND IT HAS TO KNOW A REGEX FROM A DIVISION. The first draft did not, and
 * `/["\n\r;]/` in the history export (line 40) opened a double-quoted string that
 * never closed — from there every comment in the file read as code and a plain
 * `//` comment 178 lines later was reported as rendered copy. `endsBalanced` below
 * is the net: a scanner that loses its place fails loudly instead of quietly
 * reporting the wrong lines — in either direction.
 */
type Mode = "code" | "line" | "block" | "regex" | "'" | '"' | "`";

/** A `/` here opens a regex, not a division: nothing that can END an expression precedes it. */
function regexCanFollow(prev: string): boolean {
  return prev === "" || !/[\w$)\]]/.test(prev);
}

function scan(src: string): { out: string; mode: Mode } {
  let out = "";
  let i = 0;
  let mode: Mode = "code";
  let prev = "";
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (mode === "code") {
      if (c === "/" && next === "/") { mode = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && next === "*") { mode = "block"; out += "  "; i += 2; continue; }
      if (c === "/" && regexCanFollow(prev)) mode = "regex";
      else if (c === "'" || c === '"' || c === "`") mode = c;
      if (!/\s/.test(c)) prev = c;
      out += c; i++; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; i++; continue; }
      out += " "; i++; continue;
    }
    if (mode === "block") {
      if (c === "*" && next === "/") { mode = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? c : " "; i++; continue;
    }
    // inside a regex or a string: a backslash escapes the next character, including
    // the closing delimiter. A newline ends an unterminated regex rather than
    // letting one runaway `/` eat the rest of the file.
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (mode === "regex" && c === "\n") { mode = "code"; out += c; i++; continue; }
    if (c === mode || (mode === "regex" && c === "/")) { mode = "code"; prev = c; }
    out += c; i++;
  }
  return { out, mode };
}

const stripComments = (src: string) => scan(src).out;
/**
 * True when the file parsed cleanly — no string, regex or block comment left open.
 * A `//` comment running to the end of the file is self-terminating, so it counts.
 */
const endsBalanced = (src: string) => {
  const mode = scan(src).mode;
  return mode === "code" || mode === "line";
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) found.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(e.name)) found.push(p);
  }
  return found;
}

const FILES = SCAN_DIRS.flatMap(sourceFiles)
  .map((p) => relative(".", p))
  .filter((p) => p !== TYPE_MODULE)
  .sort();

type Hit = { file: string; line: number; text: string };

const hits: Hit[] = [];
for (const file of FILES) {
  const lines = stripComments(readFileSync(join(root, file), "utf8")).split("\n");
  lines.forEach((text, i) => {
    if (/h[oô]tel/i.test(text)) hits.push({ file, line: i + 1, text: text.trim() });
  });
}

const allowed = (h: Hit) =>
  ALLOWED.some((a) => a.file === h.file && h.text.includes(a.needle));

describe("the scanner itself", () => {
  it("finds the word in JSX copy", () => {
    expect(stripComments('<p>Waiting on the hotel</p>')).toContain("hotel");
  });

  it("ignores a // comment", () => {
    expect(stripComments("// the hotel calls\nconst a = 1;")).not.toMatch(/hotel/i);
  });

  it("ignores a /* */ comment and a JSX {/* */} one", () => {
    expect(stripComments("/* it tells the hotel */")).not.toMatch(/hotel/i);
    expect(stripComments("{/* the hotel calls */}")).not.toMatch(/hotel/i);
  });

  it("ignores a doc block but keeps the copy under it", () => {
    const src = ['/**', ' * the ball is with the hotel', ' */', 'const t = "the Hôtel";'].join("\n");
    expect(stripComments(src).split("\n")[1]).not.toMatch(/hotel/i);
    expect(stripComments(src).split("\n")[3]).toMatch(/Hôtel/);
  });

  it("does not mistake a URL's // for a comment", () => {
    expect(stripComments('const u = "https://hotel.example";')).toContain("hotel");
  });

  // The bug that made the first version of this file report a comment as copy.
  it("reads a regex literal as a regex, not as the start of a string", () => {
    const src = ['const q = /["\\n;]/.test(s);', '// a hotel comment after it'].join("\n");
    expect(stripComments(src)).not.toMatch(/hotel/i);
    expect(endsBalanced(src)).toBe(true);
  });

  it("still reads a division as a division", () => {
    expect(endsBalanced('const r = (a) / b; const s = "x";')).toBe(true);
    expect(endsBalanced('const r = total / 2; // the hotel\n')).toBe(true);
    expect(stripComments('const r = total / 2; // the hotel\n')).not.toMatch(/hotel/i);
  });

  it("notices when it has lost its place", () => {
    expect(endsBalanced('const s = "never closed;')).toBe(false);
  });

  // ⚑ The real net. If ANY scanned file leaves the scanner mid-string, every hit
  // and every miss after that point in that file is meaningless — including the
  // silence this test reads as "clean".
  it.each(FILES)("%s parses cleanly, so its result means something", (file) => {
    expect(endsBalanced(readFileSync(join(root, file), "utf8"))).toBe(true);
  });

  it("scans a real set of files, so an empty result means clean and not broken", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES).toContain("app/(app)/rides/page.tsx");
    expect(FILES).toContain("components/close-trip-card.tsx");
    expect(FILES).not.toContain(TYPE_MODULE);
  });
});

describe("no rendered string says 'hotel' when it means a Business", () => {
  it("app/, components/ and lib/ are clean outside the business-type module", () => {
    const bad = hits.filter((h) => !allowed(h));
    // The message is the whole point: it has to be actionable without this file open.
    expect(bad.map((h) => `${h.file}:${h.line}  ${h.text}`)).toEqual([]);
  });

  // The Driver screens that drifted on 2026-09-20 (S84). Pinned by name because a
  // regression here is a regression in the same five places, and a general rule
  // that has never named a case is easy to weaken by accident.
  it.each([
    "app/(app)/rides/page.tsx",
    "components/check-in-card.tsx",
    "components/close-trip-card.tsx",
    "components/mission-run-view.tsx",
  ])("%s names the Business instead", (file) => {
    const src = readFileSync(join(root, file), "utf8");
    expect(stripComments(src)).not.toMatch(/h[oô]tel/i);
    expect(src).toMatch(/businessName|bizName/);
  });
});

describe("the allowances", () => {
  it.each(ALLOWED)("$file still contains $needle", ({ file, needle }) => {
    expect(hits.some((h) => h.file === file && h.text.includes(needle))).toBe(true);
  });
});
