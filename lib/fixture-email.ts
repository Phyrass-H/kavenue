// Which email addresses cannot belong to a real person.
//
// ⚑ ITS OWN MODULE SO IT CAN BE TESTED. It lived inside app/api/dev-login/route.ts
// first, where importing it drags a Next route handler and its env in behind it —
// and a rule nobody can call from a test is a rule that quietly relaxes. This one
// is the only thing standing between a leaked DEV_LOGIN_KEY and the founder's
// admin account, so it does not get to be untested.
//
// ⚑ RESERVED DOMAINS, NOT A LIST OF ADDRESSES. `.local` and `.test` are
// unroutable by RFC 6761 / RFC 2606: nobody can register them, nobody can receive
// mail at one, so no account under them can be a real Driver's or the founder's.
// A hand-written allowlist would need editing every time a fixture is added, and
// the edit that gets forgotten either breaks testing or re-opens the door.
//
// ⚑ AND IT MATCHES THE DOMAIN, NOT A SUBSTRING. `local.example.com` and
// `evil-test.com` are both registrable by anyone; only a trailing label counts.
export function isFixtureEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domain === "pickup.local" || domain.endsWith(".local") || domain.endsWith(".test");
}
