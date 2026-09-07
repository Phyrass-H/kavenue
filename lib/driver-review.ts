// § What a Driver is told while a person is reading their papers.
//
// ⚑ ONE MODULE BECAUSE THERE ARE FOUR SURFACES AND THEY MUST NOT DRIFT. A Driver
// who is not yet approved meets this rule in four places: the Pool they browse,
// the trip page's button, a refused accept, and a refused hold. The two refusals
// travel through SEPARATE hand-written translators
// (`friendlyAcceptError` and `holdMessage`, app/(app)/missions/[id]/actions.ts),
// which already disagree with each other about capitalisation — so the wording
// lives here once and every surface imports it.
//
// ⚑ THE REGISTER IS THE FOUNDER'S, CHOSEN 2026-09-07 FROM TWO OPTIONS. "High end"
// here means restraint, not adjectives: the sentence that carries it is *"approved
// by a person, not a form"*, and everything else gets out of its way. Matches the
// design brief's "professional, trustworthy, calm" and the shipped Driver voice —
// sentence case, no exclamation marks, curly apostrophes, second person.
//
// ⚑ THREE THINGS IT DELIBERATELY DOES NOT SAY:
//   • NO TIMEFRAME. A licence sat unread for 40 days this summer. A promise the
//     queue can break is worse than no promise.
//   • NO "we'll email you". Notifications are not built (the founder's own
//     sequencing: features before integrations). The only promise the app can
//     keep is that the screen changes, so that is the one it makes.
//   • NOTHING THAT SAYS KAVENUE VETS OR ENDORSES THE DRIVER. Kavenue is an agent
//     and intermediary, never the transport operator (CLAUDE.md hard rule #2,
//     docs/01). "Approved to work through Kavenue" is about access to the
//     marketplace. "We vet our Drivers" would be a claim about the person that a
//     Business could later lean on, and it is not Kavenue's to make.

/**
 * The exception text `accept_mission` and `place_hold` raise when
 * `driver.verified` is false — see
 * docs/migrations/2026-09-07_verified_gates_accept.sql.
 *
 * ⚑ MATCHED AS A SUBSTRING BY TWO TRANSLATORS WITH DIFFERENT CASING RULES:
 * `friendlyAcceptError` lowercases the raw message first, `holdMessage` does NOT.
 * This constant is all-lowercase and appears verbatim in the raise, so the same
 * needle works in both. Changing the SQL text without changing this makes both
 * translators fall through to their generic line — the Driver would read
 * "Couldn't accept this mission. Please try again." and learn nothing.
 */
export const NOT_APPROVED_RAISE = "not yet approved";

/** Does this rule apply to them right now? */
export function isUnderReview(driver: { verified: boolean } | null | undefined): boolean {
  return !!driver && !driver.verified;
}

export const UNDER_REVIEW = {
  /** The account hub — the one surface that explains, so it carries the reason. */
  title: "Your file is with us",
  body:
    "Every Driver on Kavenue is approved by a person, not a form. You’ll see it here the moment yours is signed off.",
  /**
   * The Pool. ⚑ The founder chose to keep the trips VISIBLE (2026-09-07) — a
   * professional who can see the work knows what they are waiting for.
   */
  pool: "Your file is with us. You can look around the Pool, and you’ll be able to take trips once it’s approved.",
  /** The trip page, in place of the button — said BEFORE they tap, not after. */
  beforeTap:
    "Your file is with us. You’ll be able to take this trip as soon as it’s approved.",
  /**
   * A refused accept or hold. ⚑ Reached only by a Driver who got past the screen
   * — a stale tab, a deep link, a second device. It is the wall behind the wall,
   * so it repeats the same sentence rather than inventing a second explanation.
   */
  refused: "Your file is still with us. You’ll be able to take trips as soon as it’s approved.",
} as const;
