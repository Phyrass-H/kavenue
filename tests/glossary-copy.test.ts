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
const read = (p: string) => readFileSync(join(root, p), "utf8").normalize("NFC");
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
const ALLOWED: { file: string; needle: string; kind: string; why: string }[] = [
  {
    file: "app/welcome/page.tsx",
    needle: "(hotel, agency, concierge)",
    kind: "the-type",
    why: "Under the heading 'I'm a Business' — these are example TYPES of business, which is the rule stated correctly, not broken.",
  },
  {
    file: "app/legal/terms/page.tsx",
    needle: "hôtels en premier lieu",
    kind: "the-vertical",
    why: "'les « Businesses », hôtels en premier lieu' — hotels named as the first vertical, exactly the distinction the rule draws.",
  },
  {
    file: "app/legal/terms/page.tsx",
    needle: "hotels first",
    kind: "the-vertical",
    why: "The English half of the same sentence.",
  },
  {
    file: "app/(dispatch)/dispatch/settings/page.tsx",
    needle: "Oetker Hôtel Management Company",
    kind: "proper-noun",
    why: "A real company's registered name, the placeholder for 'raison sociale' — a proper noun illustrating that the legal name differs from the name on the door. Part of one coherent worked example (the address and phone on this screen are the same company's).",
  },
  {
    file: "app/api/seed/route.ts",
    needle: 'business_type: "hotel"',
    kind: "the-type",
    why: "Dev seed data: the seeded Business's actual type.",
  },
  {
    file: "app/api/seed/route.ts",
    needle: "Hôtel Negresco, 37 Prom. des Anglais, Nice",
    kind: "proper-noun",
    why: "A real Nice address — a place name, not a word for a Business.",
  },
  {
    file: "app/api/seed/route.ts",
    needle: "Hôtel du Cap-Eden-Roc, Bd J.F. Kennedy, Antibes",
    kind: "proper-noun",
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

/**
 * Does a `/` here open a regex, or is it a division?
 *
 * ⚑ THIS MUST LOOK AT THE LAST TOKEN, NOT THE LAST CHARACTER. The first version read one
 * character back, so `return /["\n\r;]/` in the two export routes saw `n` — an identifier
 * character — called it a division, and let the `"` inside the character class open a phantom
 * string. 23 comment lines in dispatch/history/export/route.ts became invisible to the comment
 * scan, and because the stray quotes happened to balance by the end of the file, `endsBalanced`
 * still said CLEAN. A scanner going silent is the dangerous direction: silence reads as "no
 * violations". `noCommentLinesLost` below is the assertion that actually catches it.
 */
const REGEX_OK_AFTER = new Set([
  "return", "typeof", "case", "in", "of", "delete", "void", "yield", "await",
  "do", "else", "new", "throw", "instanceof",
]);

function regexCanFollow(prev: string, prevWord: string): boolean {
  if (prev === "") return true;
  if (REGEX_OK_AFTER.has(prevWord)) return true;
  // `<` is JSX here, never a comparison that a regex could follow.
  if (prev === "<") return false;
  return !/[\w$)\]]/.test(prev);
}

function scan(src: string): { out: string; comments: string; mode: Mode } {
  let out = "";
  let comments = "";
  let i = 0;
  let mode: Mode = "code";
  let prev = "";
  let prevWord = "";
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (mode === "code") {
      if (c === "/" && next === "/") { mode = "line"; out += "  "; comments += "//"; i += 2; continue; }
      if (c === "/" && next === "*") { mode = "block"; out += "  "; comments += "/*"; i += 2; continue; }
      if (c === "/" && regexCanFollow(prev, prevWord)) mode = "regex";
      else if (c === "'" || c === '"' || c === "`") mode = c;
      if (/[\w$]/.test(c)) prevWord += c;
      else if (!/\s/.test(c)) prevWord = "";
      if (!/\s/.test(c)) prev = c;
      if (/\s/.test(c)) prevWord = prevWord && /[\w$]/.test(prev) ? prevWord : "";
      out += c;
      // ⚑ The comment half must keep the line structure, or consecutive one-line doc
      // comments collapse onto one line and a hit reports the wrong line number.
      comments += c === "\n" ? "\n" : " ";
      i++; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; prevWord = ""; out += c; comments += c; i++; continue; }
      out += " "; comments += c; i++; continue;
    }
    if (mode === "block") {
      if (c === "*" && next === "/") { mode = "code"; prevWord = ""; out += "  "; comments += "*/"; i += 2; continue; }
      out += c === "\n" ? c : " "; comments += c; i++; continue;
    }
    // inside a regex or a string: a backslash escapes the next character, including
    // the closing delimiter. A newline ends an unterminated regex rather than
    // letting one runaway `/` eat the rest of the file.
    // ⚑ Keep a newline that is the second half of an escape pair, or the file shifts by a
    // line and every hit after it in that file reports the wrong number.
    if (c === "\\") {
      const pair = src.slice(i, i + 2).replace(/[^\n]/g, " ");
      out += pair; comments += pair; i += 2; continue;
    }
    if (mode === "regex" && c === "\n") { mode = "code"; out += c; comments += c; i++; continue; }
    if (c === mode || (mode === "regex" && c === "/")) { mode = "code"; prev = c; prevWord = ""; }
    out += c; comments += c === "\n" ? "\n" : " "; i++;
  }
  return { out, comments, mode };
}

const stripComments = (src: string) => scan(src).out;

/**
 * Line numbers where the SOURCE plainly has a `//` comment but the scanner's comment half is
 * blank — i.e. the scanner was lost and skipped it.
 *
 * ⚑ THIS IS THE ASSERTION THAT MATTERS, and `endsBalanced` is not a substitute for it. On
 * 2026-09-20 a mis-read regex silently hid 23 comment lines in one file while `endsBalanced`
 * reported CLEAN, because the stray quotes happened to balance again before EOF. A scan that
 * goes quiet reads exactly like a scan that found nothing.
 */
function lostCommentLines(src: string): number[] {
  const source = src.split("\n");
  const seen = scan(src).comments.split("\n");
  const lost: number[] = [];
  source.forEach((raw, i) => {
    const t = raw.trim();
    if (t.startsWith("//") && t.length > 2 && !(seen[i] || "").trim()) lost.push(i + 1);
  });
  return lost;
}
/** The inverse: only the comment text, with code blanked and line positions preserved. */
const commentsOnly = (src: string) => scan(src).comments;
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

/**
 * What is LEFT of a line once every allowance that matches it is cut out.
 *
 * ⚑ AN ALLOWANCE EXEMPTS ITS WORDS, NOT THE WHOLE LINE. The first version asked
 * `text.includes(needle)` and exempted the entire line, so appending a second, real
 * violation to an already-allowed line was invisible — the opposite of what this file's
 * own header promises. Cut each needle out and re-test the remainder.
 */
function residue(text: string, allowances: { file: string; needle: string }[], file: string): string {
  return allowances
    .filter((a) => a.file === file)
    .reduce((t, a) => t.split(a.needle).join(" "), text);
}

const allowed = (h: Hit) => !/h[oô]tel/i.test(residue(h.text, ALLOWED, h.file));

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

  // ⚑ THE REAL SHAPE, from app/(dispatch)/dispatch/history/export/route.ts:40. The first
  // version of this test used `const q = /…/`, where the preceding token is `=` and the
  // heuristic happens to work — so it passed green while the line it stood in for was still
  // mis-scanned. `return` is the case that actually broke.
  it("reads a regex after `return` as a regex, not as a division", () => {
    const src = [
      "function f(body) {",
      '  return /["\\n\\r;]/.test(body) ? body : "";',
      "}",
      "// a hotel comment after it",
    ].join("\n");
    expect(scan(src).comments).toMatch(/hotel/i);
    expect(lostCommentLines(src)).toEqual([]);
    expect(endsBalanced(src)).toBe(true);
  });

  it("reads a regex after the other keywords that permit one", () => {
    for (const kw of ["typeof", "case", "in", "of", "delete", "void", "throw", "new"]) {
      const src = kw + ' /["x]/;\n// a hotel comment';
      expect(lostCommentLines(src)).toEqual([]);
    }
  });

  it("does not read JSX `<` as opening a regex", () => {
    const src = "const a = <h2>x</h2>;\n// the hotel rings";
    expect(scan(src).comments).toMatch(/hotel/i);
    expect(lostCommentLines(src)).toEqual([]);
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

  // ⚑ The stronger half of the same idea: balanced at EOF does NOT mean nothing was skipped
  // in the middle. This one caught the mis-read `return /…/`.
  it.each(FILES)("%s loses no comment line to the scanner", (file) => {
    expect(lostCommentLines(readFileSync(join(root, file), "utf8"))).toEqual([]);
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

const KINDS = ["states-the-rule", "the-vertical", "the-type", "proper-noun", "place-category", "not-a-business"];

describe("the allowances", () => {
  it.each(ALLOWED)("$file — $kind — still contains $needle", ({ file, needle }) => {
    expect(hits.some((h) => h.file === file && h.text.includes(needle))).toBe(true);
  });

  // The same audit the comment half gets. Both lists, same terms — an exemption
  // nobody can read the reason for is how a rule quietly stops meaning anything.
  it.each(ALLOWED)("$file — $needle — states why", ({ why, kind }) => {
    expect(why.length).toBeGreaterThan(20);
    expect(KINDS).toContain(kind);
  });

  // ⚑ Proves `residue` subtracts the words and does not exempt the line. A second,
  // real violation appended to an allowed line must still fail.
  it("exempts the needle, not the line it sits on", () => {
    const line = 'placeholder="accounts@hotel.com"';
    const a = [{ file: "f.tsx", needle: "accounts@hotel.com" }];
    expect(/h[oô]tel/i.test(residue(line, a, "f.tsx"))).toBe(false);
    expect(/h[oô]tel/i.test(residue(line + " // and the hotel is told", a, "f.tsx"))).toBe(true);
    // An allowance for another file must not apply here.
    expect(/h[oô]tel/i.test(residue(line, a, "other.tsx"))).toBe(true);
  });

  it("catches a decomposed ô, which spells the same word", () => {
    const decomposed = "Ho\u0302tel";
    expect(decomposed).not.toBe("Hôtel");
    expect(/h[oô]tel/i.test(decomposed.normalize("NFC"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — THE SAME RULE, IN THE COMMENTS.
//
// ⚑ WHY THIS HALF EXISTS. On 2026-09-20 the rendered strings above were fixed and
// the COMMENTS were left, on the grounds that nobody sees a comment. 129 of them
// used the word, and 82 of those meant a Business. That is what the next engineer
// — and the next Claude — reads to learn the vocabulary, which is exactly how five
// rendered strings drifted back in the first place. Those 82 were rewritten; the
// ones below are the ones that are genuinely right, each with the reason it survived.
//
// SCOPE: app/, components/, lib/ — the code someone reads to understand the
// product. tests/ and .local/ comments were swept too but are NOT locked: they
// talk about fixtures and real Riviera place names constantly, and an allowlist
// there would fire on honest comments until someone deleted the test.
const COMMENT_ALLOWED: { file: string; needle: string; kind: string; why: string }[] = [
  // ── Quoting the banned word in order to FORBID it. The sentence only works
  //    because the wrong word is in it; this file does the same thing.
  { file: "app/(app)/rides/page.tsx", needle: 'never "the hotel" for a', kind: "states-the-rule", why: "Explains why the line below renders the Business's name." },
  { file: "components/check-in-card.tsx", needle: 'never "the hotel" for a Business', kind: "states-the-rule", why: "Same, on the check-in prompt." },
  { file: "components/close-trip-card.tsx", needle: 'and never "the hotel"', kind: "states-the-rule", why: "Same, on the un-undoable confirm." },
  { file: "components/mission-run-view.tsx", needle: 'Named, not "the hotel"', kind: "states-the-rule", why: "Same, on the trip page." },
  { file: "app/admin/businesses/page.tsx", needle: '"BUSINESSES", NEVER "HOTELS"', kind: "states-the-rule", why: "The founder's S71 ruling, quoted verbatim." },
  { file: "app/admin/page.tsx", needle: 'SAYS "Business", NOT "Hotel"', kind: "states-the-rule", why: "Names the column label that was rejected." },

  // ── Hotels as the first VERTICAL. True, and the rule's own justification.
  { file: "app/admin/businesses/page.tsx", needle: "Hotels are the first vertical", kind: "the-vertical", why: "Closes the founder's quote above it." },
  { file: "app/admin/page.tsx", needle: "hotels are the first vertical", kind: "the-vertical", why: "Cites CLAUDE.md hard rule 1." },
  // ⚑ These four sit on a line that ALREADY has an allowance. Needle-subtraction (see
  //   `residue`) made them visible: they were riding free on their neighbour's exemption.
  { file: "app/admin/page.tsx", needle: "them is a hotel today", kind: "the-type", why: "True of the live data: every Business on the books today is hotel-type. Flattening this is the over-correction that had to be reverted twice on 2026-09-20." },
  { file: "components/address-autocomplete.tsx", needle: "Google: the hotel.", kind: "proper-noun", why: "'the hotel' is Hôtel Negresco, named at the start of the same measured line — Google returned the property, Mapbox returned three Airbnb flats." },
  { file: "components/address-autocomplete.tsx", needle: "Google: the hotel (2nd)", kind: "proper-noun", why: "'the hotel' is Hôtel du Cap-Eden-Roc, named in full on the next line." },
  { file: "lib/history-filter.ts", needle: '"Hôtel Negresco"', kind: "proper-noun", why: "The accented place name on the same line — needles must not OVERLAP, or subtracting one destroys the other's match." },
  { file: "app/admin/drivers/page.tsx", needle: 'hotels" is a fact about the market', kind: "the-vertical", why: "⚑ A sweeper rewrote this to \"the same type\" on 2026-09-20 and a verifier reverted it: \"all four are hotels\" is a true statement about today's data, and flattening it loses the fact." },

  // ── The `hotel` TYPE, applied to Businesses that really are that type.
  { file: "app/admin/businesses/page.tsx", needle: "Businesses today are hotels", kind: "the-type", why: "The noun is already Businesses; hotels is the type they hold. The next sentence is 'until a restaurant signs up'." },
  { file: "lib/admin-businesses.ts", needle: '"Hotel & accommodation"', kind: "the-type", why: "Verbatim LABELS.hotel — the string that wrapped to two lines in a 118px column." },
  { file: "lib/company-register.ts", needle: "a building — one hotel,", kind: "the-type", why: "'one hotel, one restaurant' — two of the nine types, contrasting an establishment with a siège social." },
  { file: "app/(dispatch)/dispatch/new/page.tsx", needle: "is on (a hotel) — and not when it's off", kind: "the-type", why: "A hotel-type vs a concierge-type: the address pre-fill matters for one and not the other. This IS 'categories by type of business'." },

  // ── Proper nouns. Real places, quoted as worked examples or measured results.
  { file: "app/admin/businesses/[id]/page.tsx", needle: '"Hôtel Belles-Rives" the business', kind: "proper-noun", why: "The registered name, contrasted with the saved address label." },
  { file: "lib/admin-list.ts", needle: '"Hôtel Belles-Rives" (the', kind: "proper-noun", why: "Same worked example: matched on coordinates, never on the name." },
  { file: "components/address-autocomplete.tsx", needle: '"Hôtel Negresco"  → Mapbox', kind: "proper-noun", why: "The exact query typed in the 2026-08-25 Mapbox-vs-Google measurement." },
  { file: "components/address-autocomplete.tsx", needle: '"Eden Roc"', kind: "proper-noun", why: "Same measurement; 'the hotel' is Hôtel du Cap-Eden-Roc, named in full on the next line." },
  { file: "components/address-autocomplete.tsx", needle: '"Hôtel du Cap Eden Roc" (full formal name)', kind: "proper-noun", why: "Same measurement, third query." },
  { file: "components/address-autocomplete.tsx", needle: 'a Riviera-biased "Hôtel Negresco"', kind: "proper-noun", why: "The query proving locationBias is a bias, not a hard limit." },
  { file: "lib/activity-findings.ts", needle: '"Le Grand Hôtel → Monaco"', kind: "proper-noun", why: "The literal route label of four real rows — the evidence for keying on id." },
  { file: "lib/amendments.ts", needle: 'formatted address ("Hôtel du Cap-Eden-Roc,', kind: "proper-noun", why: "The input half of the firstPart() example." },
  { file: "lib/amendments.ts", needle: 'Antibes, France" → "Hôtel du Cap-Eden-Roc"', kind: "proper-noun", why: "The output half of the same example." },
  { file: "lib/company-register.ts", needle: '"HOTEL CARLTON CANNES"', kind: "proper-noun", why: "The real trade name SIRENE returns for that establishment." },
  { file: "lib/first-trips.ts", needle: '/** "Hôtel Negresco → Nice Airport, T2" */', kind: "proper-noun", why: "The worked example of the `route` field." },
  { file: "lib/first-trips.ts", needle: '"Hôtel Negresco → Nice Airport, T2", falling back', kind: "proper-noun", why: "routeOf()'s example return value." },
  { file: "lib/history-filter.ts", needle: 'or "hotel" on a French', kind: "proper-noun", why: "The literal unaccented text a French keyboard types in a hurry — fold() must still match it." },
  { file: "app/api/seed/route.ts", needle: "the real hotel's", kind: "proper-noun", why: "The real establishment the fixture borrows its name and address from — not 'a Business'." },

  // ── lib/business-type.ts — the module that DEFINES the nine types. Scanned like the
  //   rest; these six are the uses the file exists to make.
  { file: "lib/business-type.ts", needle: "NOT JUST HOTELS (founder, S71)", kind: "states-the-rule", why: "The founder's S71 ruling ([[d99]]) stated in the file that defines the types — the word appears in order to be rejected." },
  { file: "lib/business-type.ts", needle: "Hotels are the first vertical", kind: "the-vertical", why: "Verbatim the phrasing the rule itself uses as the allowed case." },
  { file: "lib/business-type.ts", needle: "a different customer from a hotel", kind: "the-type", why: "A type-to-type comparison: `vtc_company` against `hotel`, and the contrast is the whole point of that enum value existing." },
  { file: "lib/business-type.ts", needle: '"Hotel & accommodation" WRAPPED TO TWO LINES', kind: "the-type", why: "A verbatim quote of LABELS.hotel — the string that overflowed a 118px column." },
  { file: "lib/business-type.ts", needle: "one hotel, one restaurant", kind: "the-type", why: "Two of the nine types as concrete examples of an establishment, contrasted with a siège social." },
  { file: "lib/business-type.ts", needle: '"Boutique hotel', kind: "the-type", why: "Sample free-typed field_of_activity data — a string that is NOT one of the nine values, which is why the Business is asked." },

  // ── Not a Business at all: a kind of PLACE, or a kind of WIFI.
  { file: "components/address-autocomplete.tsx", needle: "(hotel / airport / venue) or street", kind: "place-category", why: "The real-world kinds of point of interest a Google place name can be, as opposed to a street." },
  { file: "components/address-autocomplete.tsx", needle: "points of interest (hotels, airports, venues)", kind: "place-category", why: "Same list — why Places beats Geocoding for a VTC booking form." },
  { file: "components/address-autocomplete.tsx", needle: 'a SEARCH TERM ("hotels in Nice")', kind: "place-category", why: "Sample Google queryPrediction output — the whole point is that it is NOT a place." },
  { file: "lib/offline-waybill.ts", needle: "says true on hotel wifi behind a captive portal", kind: "not-a-business", why: "⚑ A kind of network, not a kind of Business. navigator.onLine reports a network while a captive portal holds every request." },
]

// ⚑ lib/business-type.ts IS scanned here, unlike in the rendered half. Its `hotel` enum
// value and its "Hotel"/"Hotel & accommodation" LABELS are rendered strings that have to be
// the word — but its PROSE has no such licence, and it is the file most likely to accumulate
// hotel-flavoured commentary. Its six comment uses are named below like everybody else's.
const COMMENT_DIRS = ["app", "components", "lib"]
const COMMENT_FILES = COMMENT_DIRS.flatMap(sourceFiles).map((p) => relative(".", p)).sort();

const commentHits: Hit[] = [];
for (const file of COMMENT_FILES) {
  const lines = commentsOnly(readFileSync(join(root, file), "utf8").normalize("NFC")).split("\n");
  lines.forEach((text, i) => {
    if (/h[oô]tel/i.test(text)) commentHits.push({ file, line: i + 1, text: text.trim() });
  });
}

describe("no COMMENT says 'hotel' when it means a Business", () => {
  it("app/, components/ and lib/ are clean outside the business-type module", () => {
    const bad = commentHits.filter((h) => /h[oô]tel/i.test(residue(h.text, COMMENT_ALLOWED, h.file)));
    // If this fails: rewrite the comment to say Business — or, if it genuinely means a
    // hotel-TYPE Business, a proper noun, a place category or the vertical, add it to
    // COMMENT_ALLOWED with the reason. Never widen the rule; add the one line.
    expect(bad.map((h) => `${h.file}:${h.line}  ${h.text}`)).toEqual([]);
  });

  it("the scanner reads comments and not code", () => {
    expect(commentsOnly('const s = "the hotel"; // a hotel comment')).not.toContain("const");
    expect(commentsOnly('const s = "the hotel"; // a hotel comment')).toContain("a hotel comment");
    // The STRING "the hotel" belongs to the other half, not this one.
    expect(commentsOnly('const s = "the hotel";').trim()).toBe("");
  });
});

describe("the comment allowances", () => {
  it.each(COMMENT_ALLOWED)("$file — $kind — still contains $needle", ({ file, needle }) => {
    expect(commentHits.some((h) => h.file === file && h.text.includes(needle))).toBe(true);
  });

  // Every allowance carries its reason. An entry with no `why` is an exemption
  // nobody can audit later, which is how a rule quietly stops meaning anything.
  it.each(COMMENT_ALLOWED)("$file — $needle — states why", ({ why, kind }) => {
    expect(why.length).toBeGreaterThan(20);
    expect(["states-the-rule", "the-vertical", "the-type", "proper-noun", "place-category", "not-a-business"]).toContain(kind);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — THE OTHER HALF OF HARD RULE 1: "client" and "principal".
//
// The glossary bans these too, and until 2026-09-20 NOBODY HAD EVER SWEPT THEM.
// `lib/account.ts:4` and `lib/database.types.ts:8` had said "No 'client'/'principal'"
// since S48 while `lib/waybill.ts` and `lib/vat.ts` used "the client" ten times.
//
// ⚑ WHY THIS IS NOT A SECOND COPY OF § 2. "hotel" has one meaning; "client" has three,
// and two of them are correct:
//   • a React/Next CLIENT COMPONENT, a Supabase CLIENT, the CLIENT's clock, clientX. 140
//     occurrences of the word in app/, components/ and lib/ — 57 of them `"use client"`
//     directives, 83 the other correct senses — and NONE of them the customer. (Measured,
//     not guessed: `git ls-files app components lib | grep -E '\.tsx?$' | xargs grep -hoE
//     '\bclients?\b' | wc -l`.) An allowlist over those would be pure noise and would get
//     deleted the first time it blocked a legitimate comment.
//   • PRINCIPAL in its legal sense — "Kavenue is an intermediary, never the principal"
//     (CLAUDE.md hard rule 2). That use is REQUIRED, not banned.
//   • and the customer sense, which is the banned one.
//
// So this half locks the two places where the distinction is decidable, and says plainly
// that it does not police the rest:
//   A. RENDERED COPY. A screen has no reason to say "client" — the technical senses never
//      reach it. Verified 2026-09-20: every "client" in the rendered half of app/,
//      components/ and lib/ is a `"use client"` directive or a `supabase/client` import.
//   B. THE LEGAL-QUOTATION CONVENTION in lib/waybill.ts and lib/vat.ts. The arrêté du
//      6 août 2025 really does say « client » (art. 1, 4°-7°, fetched from Légifrance
//      JORFTEXT000052153206), and so do BOFiP BOI-TVA-BASE-10-10-50 § 260 and the BOFiP
//      note on CE 9 oct. 2024 n° 472257 ("les sommes prélevées par un établissement
//      hôtelier sur le compte bancaire de ses clients ne se présentant pas"). Rewording
//      the law would misquote it; leaving it bare reads as if Kavenue said it. So in those
//      two files the word may appear ONLY inside « » or inside a French quotation — and
//      this test is what keeps that true.
const LEGAL_QUOTE_FILES = ["lib/waybill.ts", "lib/vat.ts"];

/**
 * The word, in the inflections French and English actually write. One constant, shared by
 * both checks below — two copies would drift, and the half that drifted would go quiet.
 */
const CLIENT_WORD = /\bclient(?:e|es|s|èle|ele|eles)?\b/i;

/** Framework plumbing, and DOM geometry. Not copy, and not the customer. */
const NOT_COPY_TOKENS = /["']use client["']|supabase\/client|createAdminClient|createClient|client(?:X|Y|Width|Height|Top|Left)\b|client_\w+|CLIENT_\w+/g;

/** Somebody else's words: « … » or a "…" quotation, which may span lines. */
const MARKED_SPANS = /«[^»]*»|"[^"]*"/g;

/**
 * Blank every match of `re` but keep the newlines, so a line number still means something.
 *
 * ⚑ BLANK THE WORDS, NEVER DROP THE LINE. § 1 and § 2 shipped with an allowance that
 * exempted the whole LINE a needle sat on; it was caught the same day and fixed with
 * `residue`. § 3 then shipped the identical defect twice over — a bare customer-sense
 * "client" passed whenever ANY unrelated quotation shared its line, which in two files full
 * of quoted French is the normal case, and `"use client"` on a line exempted the rest of it.
 * Third time for this shape. The rule: exempt what is actually marked, never its neighbours.
 */
function blankKeepingLines(src: string, re: RegExp): string {
  return src.replace(re, (m) => m.replace(/[^\n]/g, " "));
}

describe("no RENDERED string says 'client' for the customer", () => {
  // ⚑ The anchors. Without these both checks below can go green on an empty file list.
  it("is actually scanning the app", () => {
    expect(COMMENT_FILES.length).toBeGreaterThan(100);
    expect(COMMENT_FILES).toContain("app/legal/terms/page.tsx");
    expect(COMMENT_FILES).toContain("lib/vat.ts");
    expect(COMMENT_FILES).toContain("components/check-in-card.tsx");
  });

  // ⚑ The positive control. This is the assertion that would have caught the two escapes
  // above, and § 3 shipped without one.
  it("flags a planted customer-sense string, and only that", () => {
    const flag = (line: string) => CLIENT_WORD.test(blankKeepingLines(line, NOT_COPY_TOKENS));
    expect(flag('<p>Le client attend</p>')).toBe(true);
    expect(flag('<p>Nos clientes</p>')).toBe(true);
    expect(flag('const t = "our clientèle";')).toBe(true);
    expect(flag('const t = "our clientele";')).toBe(true);
    // ⚑ The escape that shipped: a real violation sharing a line with framework plumbing.
    expect(flag('const c = createClient(); const t = "the client is told";')).toBe(true);
    // And the genuine plumbing still passes.
    expect(flag('"use client";')).toBe(false);
    expect(flag('import { createClient } from "@/lib/supabase/client";')).toBe(false);
    expect(flag("const x = e.clientX - r.left;")).toBe(false);
  });

  it.each(COMMENT_FILES)("%s", (file) => {
    const src = readFileSync(join(root, file), "utf8").normalize("NFC");
    const scanned = blankKeepingLines(stripComments(src), NOT_COPY_TOKENS);
    const bad = scanned
      .split("\n")
      .map((text, i) => ({ line: i + 1, text: text.trim() }))
      .filter((h) => CLIENT_WORD.test(h.text));
    expect(bad.map((h) => `${file}:${h.line}  ${h.text}`)).toEqual([]);
  });

  // ⚑ "principal" is the opposite case: hard rule 2 REQUIRES it, in its legal sense.
  // Pinned so a future sweep of rule 1 cannot delete the thing rule 2 depends on.
  it("keeps 'principal' where the legal position needs it", () => {
    expect(read("lib/database.types.ts")).toMatch(/intermediary, never the principal/);
    expect(read("lib/waybill.ts")).toMatch(/nudge toward principal status/);
  });
});

describe("the law's word stays marked as the law's word", () => {
  // The positive control for THIS half — the one whose absence let the marking be
  // deletable without anything going red.
  it("flags the word when IT is not the thing quoted", () => {
    const bare = (src: string) =>
      CLIENT_WORD.test(blankKeepingLines(blankKeepingLines(src, NOT_COPY_TOKENS), MARKED_SPANS));
    // Marked — fine.
    expect(bare("// the arrêté's « client » ordered the trip")).toBe(false);
    expect(bare('// "les moyens de prendre contact avec le client" — the Business')).toBe(false);
    // ⚑ Both of these passed before this rewrite, because of a quote they do not sit in.
    expect(bare('// The client is told the "why" before we charge them.')).toBe(true);
    expect(bare('// "indépendamment" of whether the client renounces the capacity')).toBe(true);
    // A quotation running over two lines is still one quotation.
    expect(bare('// reads "Nom et coordonnées\n// du client sollicitant"')).toBe(false);
  });

  it.each(LEGAL_QUOTE_FILES)("%s uses 'client' only inside « » or a quotation", (file) => {
    const src = readFileSync(join(root, file), "utf8").normalize("NFC");
    const left = blankKeepingLines(blankKeepingLines(src, NOT_COPY_TOKENS), MARKED_SPANS);
    const bare = left
      .split("\n")
      .map((text, i) => ({ line: i + 1, text: text.trim() }))
      .filter((h) => CLIENT_WORD.test(h.text));
    expect(bare.map((h) => `${file}:${h.line}  ${h.text}`)).toEqual([]);
  });

  // The citations these quotes rest on. If someone edits the quoted text, the reference
  // it came from must still be next to it — that is what makes it checkable.
  it("keeps the citation beside each quoted phrase", () => {
    const wb = read("lib/waybill.ts");
    expect(wb).toContain("arrêté du 6 août 2025");
    expect(wb).toMatch(/art\. 1, 4°/);
    expect(wb).toContain("donneur d'ordre");
    const vat = read("lib/vat.ts");
    expect(vat).toContain("BOI-TVA-BASE-10-10-50");
    expect(vat).toContain("CE 9 oct. 2024 n° 472257");
    expect(vat).toContain("sans incidence sur la taxation");
  });
});
