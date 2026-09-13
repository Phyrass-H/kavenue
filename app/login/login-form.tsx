"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RoleSub } from "@/lib/hosts";
import {
  ADMIN_CHECK_FAILED,
  ADMIN_SIGNIN,
  NOT_ADMIN,
  adminSigninCookie,
  isNoSuchAccount,
} from "@/lib/admin-signin";

// ⚑ KEYED ON `RoleSub`, NOT A HAND-WRITTEN UNION. When "admin" joined RoleSub the
// compiler stopped the build here rather than letting an admin see "Kavenue
// Driver" — which is the only reason this line got written at all. Keep it tied
// to the type: a new subdomain must be a build error, not a wrong heading.
const COPY: Record<RoleSub | "generic", { title: string; subtitle: string }> = {
  driver: { title: "Kavenue Driver", subtitle: "Sign in to see available missions." },
  dispatch: { title: "Kavenue Dispatch", subtitle: "Sign in to manage your bookings." },
  admin: { title: "Kavenue Admin", subtitle: "Sign in to continue." },
  generic: { title: "Kavenue", subtitle: "Sign in to continue." },
};

export function LoginForm({
  initialError,
  devEnabled = false,
  side = null,
}: {
  initialError: string | null;
  devEnabled?: boolean;
  side?: RoleSub | null;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const copy = COPY[side ?? "generic"];
  // ⚑ S80 — THE ADMIN DOOR ([[d141]], lib/admin-signin.ts). It never creates an account, it answers
  // every email with the same sentence, and it marks the link so /auth/callback can refuse a
  // non-admin plainly instead of offering them "Driver or Business?" at the admin address.
  const adminDoor = side === "admin";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    // Set on the admin door, cleared on every other one — see adminSigninCookie.
    document.cookie = adminSigninCookie(adminDoor, window.location.protocol === "https:");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: !adminDoor,
      },
    });

    // ⚑ On the admin door "no such account" is not an error to show: saying it would tell anyone
    //   which addresses are admins. A rate limit or a network failure is still shown.
    if (error && !(adminDoor && isNoSuchAccount(error.code))) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="center-screen">
      <div className="auth-card">
        <div className="auth-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="auth-logo" src="/logo.png" alt="" aria-hidden="true" />
          <h1>{copy.title}</h1>
        </div>
        <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
          {copy.subtitle}
        </p>

        {status === "sent" ? (
          <div className="notice success">
            {adminDoor ? (
              ADMIN_SIGNIN.sent
            ) : (
              <>
                Check your email — we sent a sign-in link to{" "}
                <strong>{email}</strong>. Open it on this device to continue.
              </>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            {/* An error from the magic-link callback: a non-admin at the admin door, or an
                expired/invalid link. */}
            {initialError && status === "idle" && (
              <div className="notice error">
                {initialError === NOT_ADMIN
                  ? ADMIN_SIGNIN.notAdmin
                  : initialError === ADMIN_CHECK_FAILED
                    ? ADMIN_SIGNIN.checkFailed
                    : "Your sign-in link was invalid or has expired — request a new one below."}
              </div>
            )}
            {status === "error" && <div className="notice error">{message}</div>}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              className="btn"
              type="submit"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
            <p className="muted small" style={{ marginTop: 12 }}>
              No password needed. We email you a secure one-time link.
            </p>
            {/* /dev-login signs in as a Driver or a Business — never as admin — so the admin door
                does not offer it. */}
            {devEnabled && !adminDoor && (
              <p className="small" style={{ marginTop: 8 }}>
                <a href="/dev-login" style={{ color: "var(--accent)" }}>
                  Local testing? Use one-click dev sign-in →
                </a>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
