// Magic-link landing: exchange the one-time code for a session cookie, then
// send the Driver into the app. The root page (/) routes them on to /pool or
// /onboarding depending on whether their Driver profile exists yet.
//
// ⚑ S80 — THE ADMIN DOOR ([[d141]], lib/admin-signin.ts). A link asked for at the
// admin sign-in lands here too, and until S80 a non-admin went on to "/" → "Driver
// or Business?" at the admin address (the founder hit it). Now a sign-in that
// started at the admin door either reaches /admin, or ends that ONE session and
// goes back to the admin sign-in with a plain sentence.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { roleSubOf } from "@/lib/hosts";
import {
  ADMIN_CHECK_FAILED,
  ADMIN_SIGNIN_COOKIE,
  NOT_ADMIN,
  cameThroughAdminDoor,
} from "@/lib/admin-signin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Supabase sends error/error_code on expired or already-used links (no code).
  const linkError = searchParams.get("error_code") ?? searchParams.get("error");

  // SECURITY: only honour `next` when it's a host-local absolute path, so a
  // crafted `?next=@evil.com` / `//evil.com` can't turn the post-login redirect
  // into an open redirect. Anything else falls back to "/".
  const rawNext = searchParams.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/\\")
      ? rawNext
      : "/";

  // Did this link start at the admin door? The marker is one-shot: spent whichever way this goes.
  const jar = await cookies();
  const adminDoor = cameThroughAdminDoor(
    roleSubOf(request.headers.get("host")),
    jar.get(ADMIN_SIGNIN_COOKIE)?.value,
  );
  if (jar.has(ADMIN_SIGNIN_COOKIE)) jar.delete(ADMIN_SIGNIN_COOKIE);
  // Every way back to the sign-in keeps the admin door's own page, even on a shared host.
  const signIn = (error: string) =>
    NextResponse.redirect(
      new URL(`/login?${adminDoor ? "side=admin&" : ""}error=${encodeURIComponent(error)}`, origin),
    );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return signIn("exchange");

    if (adminDoor) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile, error: readError } = user
        ? await supabase.from("profile").select("role").eq("auth_user_id", user.id).maybeSingle()
        : { data: null, error: null };
      if (profile?.role === "admin") return NextResponse.redirect(new URL("/admin", origin));

      // ⚑ scope "local": only the session this link just opened. The default, "global", would
      //   also sign a Driver out of the app on their phone.
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      // ⚑ IF THE SIGN-OUT CALL ITSELF FAILS (a network blip, a 5xx), auth-js keeps the session, and the
      //   cookies the exchange just wrote would ride out on this redirect: /login would see a user and
      //   send them to "Driver or Business?" at the admin address — the very bug this door fixes (S80
      //   review). So the session cookies are dropped by hand; the unused server session just expires.
      if (signOutError) {
        for (const c of jar.getAll()) {
          if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) jar.delete(c.name);
        }
      }
      // ⚑ A FAILED READ IS NOT "NO ACCESS" (S79 lesson). Saying "this email doesn't have admin
      //   access" to the real admin because the profile read failed would be a confident false
      //   sentence — so a failed read says exactly that it could not check.
      return signIn(readError || !user ? ADMIN_CHECK_FAILED : NOT_ADMIN);
    }

    return NextResponse.redirect(new URL(next, origin));
  }

  return signIn(linkError ?? "auth");
}
