// The admin door's sign-in rules — admin.kavenue.fr, and /login?side=admin on a shared host (S80).
//
// ⚑ WHY. The founder signed in on the admin page with an email that is not an admin: the link
// worked, created an account, and landed on "Driver or Business?" — at the admin address. The
// founder: *"if an address email isn't registered as admin the feedback should say so"*.
// Three rules, [[d141]]:
//   1. The admin door never CREATES an account (`shouldCreateUser: false`).
//   2. Before the link it says one neutral sentence, whatever the email — a page that answered
//      "not an admin" would let anyone test addresses to find the ones that are.
//   3. After the link — the person has proven the mailbox is theirs — a non-admin is signed out of
//      that one session and told plainly.
// ⚑ PURE, NO SERVER IMPORTS: the sign-in form (a client component) and the callback route share it.
import type { RoleSub } from "@/lib/hosts";

/** Set by the admin form when it asks for a link; read, then cleared, by /auth/callback.
 *  ⚑ A COOKIE, NOT A QUERY STRING ON THE LINK. Supabase only honours a return address that matches
 *  its allowlist, and the entries are the bare `…/auth/callback` (.env.example) — a link carrying
 *  `?next=/admin` risks falling back to the Site URL, which is a sign-in that silently fails. */
export const ADMIN_SIGNIN_COOKIE = "kv_admin_signin";

/** The `?error=` values the callback sends back to the admin sign-in. */
export const NOT_ADMIN = "not_admin";
/** ⚑ The profile could not be read — which is NOT "no access" (S79: a failed read never draws a
 *  confident fact). Saying "no admin access" to the real admin on a database hiccup would be false. */
export const ADMIN_CHECK_FAILED = "admin_check";

export const ADMIN_SIGNIN = {
  sent: "If this address has admin access, a sign-in link is on its way. Open it on this device.",
  notAdmin: "This email doesn’t have admin access.",
  checkFailed: "We couldn’t check admin access just now. Request a new link.",
} as const;

/** The marker, as a `document.cookie` string: an hour, the whole site, Lax so the link from the
 *  mailbox still carries it. Any OTHER sign-in form clears it, so a later Driver or Business link on
 *  the same host is never mistaken for an admin one. */
export function adminSigninCookie(on: boolean, https: boolean): string {
  return on
    ? `${ADMIN_SIGNIN_COOKIE}=1; Path=/; Max-Age=3600; SameSite=Lax${https ? "; Secure" : ""}`
    : `${ADMIN_SIGNIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Supabase's answers that mean "no such account may sign in here". On the admin door they read
 *  exactly like a link sent — anything else (a rate limit, the network) is still shown. */
const NO_SUCH_ACCOUNT = new Set(["otp_disabled", "signup_disabled", "user_not_found"]);

export function isNoSuchAccount(code: string | null | undefined): boolean {
  return code != null && NO_SUCH_ACCOUNT.has(code);
}

/** Did this finished sign-in start at the admin door? The admin host always counts; on a shared
 *  host (localhost, *.vercel.app) only the marker the admin form set does. */
export function cameThroughAdminDoor(sub: RoleSub | null, marker: string | undefined): boolean {
  return sub === "admin" || marker === "1";
}
