// The admin door (S80, [[d141]]). The founder signed in on the admin page with a non-admin email and
// landed on "Driver or Business?". These pin the three rules: never create an account, one neutral
// sentence before the link, a plain "no admin access" after it.
import { describe, expect, it } from "vitest";
import {
  ADMIN_SIGNIN,
  ADMIN_SIGNIN_COOKIE,
  adminSigninCookie,
  cameThroughAdminDoor,
  isNoSuchAccount,
} from "@/lib/admin-signin";

describe("before the link — the page never says who is an admin", () => {
  it("⚑ Supabase's 'no such account' answers read as a link sent", () => {
    for (const code of ["otp_disabled", "signup_disabled", "user_not_found"]) {
      expect(isNoSuchAccount(code), code).toBe(true);
    }
  });

  it("a real failure is still shown — a rate limit says nothing about who is an admin", () => {
    expect(isNoSuchAccount("over_email_send_rate_limit")).toBe(false);
    expect(isNoSuchAccount(undefined)).toBe(false);
    expect(isNoSuchAccount(null)).toBe(false);
  });

  it("the sentence is the same whatever the email, and names no outcome", () => {
    expect(ADMIN_SIGNIN.sent).toMatch(/^If this address has admin access/);
    expect(ADMIN_SIGNIN.sent).not.toMatch(/not|isn’t|no admin/i);
  });
});

describe("after the link — which sign-ins started at the admin door", () => {
  it("the admin host always counts", () => {
    expect(cameThroughAdminDoor("admin", undefined)).toBe(true);
  });

  it("⚑ on a shared host (localhost) only the admin form's marker counts", () => {
    expect(cameThroughAdminDoor(null, "1")).toBe(true);
    expect(cameThroughAdminDoor(null, undefined)).toBe(false);
    expect(cameThroughAdminDoor(null, "")).toBe(false);
  });

  // A marker cannot exist there: the cookie is host-only, and only the admin door's form sets it.
  it("a Driver or Business host is not the admin door by itself", () => {
    expect(cameThroughAdminDoor("driver", undefined)).toBe(false);
    expect(cameThroughAdminDoor("dispatch", undefined)).toBe(false);
  });
});

describe("after the link — the words", () => {
  it("a non-admin is told plainly", () => {
    expect(ADMIN_SIGNIN.notAdmin).toBe("This email doesn’t have admin access.");
  });

  it("⚑ a role that could not be READ never claims 'no access' — the real admin must not read that", () => {
    expect(ADMIN_SIGNIN.checkFailed).not.toMatch(/doesn’t have|no admin|not an admin/i);
    expect(ADMIN_SIGNIN.checkFailed).toMatch(/couldn’t check/i);
  });
});

describe("the marker", () => {
  it("lives an hour, site-wide, and survives the click from the mailbox (Lax)", () => {
    const on = adminSigninCookie(true, false);
    expect(on).toContain(`${ADMIN_SIGNIN_COOKIE}=1`);
    expect(on).toContain("Path=/");
    expect(on).toContain("Max-Age=3600");
    expect(on).toContain("SameSite=Lax");
    expect(on).not.toContain("Secure");
    expect(adminSigninCookie(true, true)).toContain("Secure");
  });

  it("⚑ any other sign-in form clears it, so a later Driver link is never taken for an admin one", () => {
    expect(adminSigninCookie(false, true)).toContain("Max-Age=0");
  });
});
