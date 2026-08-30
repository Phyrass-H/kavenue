// A Driver's self-declared gender — optional, asked once on their own profile,
// and consulted by nothing that decides anything.
//
// ⚑ FOUR VALUES, AND THE DISTINCTIONS BETWEEN THEM ARE THE WHOLE POINT.
//   • `other`       — an answer about who they are.
//   • `undisclosed` — a decision not to answer. Not the same thing, and a Driver
//                     who picks it has been asked and has replied.
//   • `null`        — nobody ever asked. True of every Driver the day this ships.
// Collapsing any two of these makes "people are declining this question"
// indistinguishable from "we only added it yesterday", and those call for
// opposite responses. [[d88]] — a missing value is a refusal, not a skip.
//
// ⚑ THE FOUNDER ASKED FOR "OTHER … FOR THOSE WHO ARE INDECISIVE". The value is
// theirs; the WORD is not, and this is the one place it matters. Someone
// choosing it is not undecided — they are non-binary, or they would rather the
// question were not asked at all. `undisclosed` exists so the second group has
// somewhere to go that is not a shrug.

export const GENDERS = ["woman", "man", "other", "undisclosed"] as const;

export type Gender = (typeof GENDERS)[number];

/**
 * ⚑ A TYPE-KEYED MAP, so a fifth value cannot ship without a label. Same guard
 * as `PHRASES` in lib/mission-story.ts and `LABELS` in lib/business-type.ts.
 */
const LABELS: Record<Gender, string> = {
  woman: "Woman",
  man: "Man",
  other: "Other",
  undisclosed: "Rather not say",
};

export function genderLabel(value: Gender): string {
  return LABELS[value];
}

/** The column is a bare `text`, so every read narrows rather than trusting. */
export function isGender(value: string | null | undefined): value is Gender {
  return !!value && (GENDERS as readonly string[]).includes(value);
}

/** For the segmented control, in the order they should appear. */
export function genderOptions(): { value: Gender; label: string }[] {
  return GENDERS.map((value) => ({ value, label: LABELS[value] }));
}

/**
 * What one Driver's row says about it, including the two ways of not knowing.
 *
 * ⚑ "Not asked" AND "Rather not say" BOTH RENDER, and differently. A screen that
 * printed nothing for either would be claiming the question does not exist.
 */
export function genderSays(value: string | null | undefined): string {
  if (!value) return "not asked";
  return isGender(value) ? LABELS[value] : value;
}

export interface GenderTally {
  /** One entry per value that anyone actually picked, in GENDERS order. */
  counts: { value: Gender; label: string; n: number }[];
  /** Drivers who have answered at all — the denominator of any percentage. */
  answered: number;
  /** Drivers nobody has asked yet. Named, never subtracted quietly. */
  notAsked: number;
  total: number;
  /**
   * The sentence a breakdown carries above it, e.g. "9 of 13 answered".
   * ⚑ NEVER OMITTED WHILE ANYONE IS UNANSWERED. The founder's rule, given about
   * Driver geography: a dashboard must say "3 of 9 located", never quietly count
   * only what it can find.
   */
  note: string | null;
}

/** Tally a fleet's answers, keeping every way of not knowing visible. */
export function tallyGender(rows: readonly { gender: string | null }[]): GenderTally {
  const n = new Map<Gender, number>();
  let notAsked = 0;
  for (const row of rows) {
    if (isGender(row.gender)) n.set(row.gender, (n.get(row.gender) ?? 0) + 1);
    else notAsked++;
  }
  const counts = GENDERS.filter((g) => (n.get(g) ?? 0) > 0).map((value) => ({
    value,
    label: LABELS[value],
    n: n.get(value) ?? 0,
  }));
  const answered = rows.length - notAsked;
  return {
    counts,
    answered,
    notAsked,
    total: rows.length,
    note: notAsked === 0 ? null : `${answered} of ${rows.length} answered`,
  };
}
