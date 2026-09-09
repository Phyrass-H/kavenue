// DEV-ONLY one-click sign-in. Lets you try the app locally WITHOUT email or any
// Supabase dashboard config: it ensures a confirmed user (with a fixed dev
// password) via the service role, then signs in server-side so the session
// cookie is set. Blocked on any hosted environment.
//
//   /api/dev-login?as=business   → sign in as the demo Business
//   /api/dev-login?as=driver     → sign in as the demo Driver
//   /api/dev-login?email=you@x   → sign in as any email (created if needed)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFixtureEmail } from "@/lib/fixture-email";

// ⚑ THIS LINE PUBLISHED A WORKING PASSWORD. It was a plain-text literal in a
// tracked file in a PUBLIC repo (committed 98a89ff), and the key a browser uses
// to reach Supabase is NEXT_PUBLIC_ by design — so the pair was complete and
// readable by anyone. It opened 6 accounts on the live project, admin@kavenue.fr
// among them. The old value stays in git history forever, which is why the
// accounts had to be rotated rather than the line merely edited.
const DEV_PASSWORD = process.env.DEV_PASSWORD;
const DEMO = {
  business: "demo.business@pickup.local",
  driver: "demo.driver@pickup.local",
} as const;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // Local dev: open. Hosted (Vercel/prod): require a secret key that matches the
  // DEV_LOGIN_KEY env var, so the live URL isn't a free login for anyone but you
  // can still test without email / Supabase redirect-URL config.
  const hosted = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  if (hosted) {
    const key = process.env.DEV_LOGIN_KEY;
    if (!key || searchParams.get("key") !== key) {
      return NextResponse.json(
        { error: "Dev sign-in requires a valid key on this environment." },
        { status: 403 },
      );
    }
  }

  const as = searchParams.get("as");
  const email =
    searchParams.get("email")?.trim() ||
    (as === "business" ? DEMO.business : as === "driver" ? DEMO.driver : null);

  if (!email) {
    return NextResponse.json(
      { error: "Pass ?as=business, ?as=driver, or ?email=…" },
      { status: 400 },
    );
  }

  // ⚑ Refuse rather than fall back to a default. A hard-coded fallback here is
  // exactly what published the last one, and a fallback that ships is a fallback
  // that gets used.
  if (!DEV_PASSWORD) {
    return NextResponse.json(
      { error: "DEV_PASSWORD is not set. Add it to .env.local (and to the Vercel env if you use dev sign-in there)." },
      { status: 500 },
    );
  }

  // ⚑⚑ ON THE LIVE SITE, FIXTURES ONLY — AND THIS IS THE ONE THING STANDING
  // BETWEEN A LEAKED KEY AND admin@kavenue.fr.
  //
  // The founder wants one-click sign-in on the hosted app (2026-09-09), which is
  // what the two buttons on /dev-login do: `?as=business` and `?as=driver`, both
  // fixtures. Nothing about that changes. What is refused is `?email=` pointed at
  // a REAL account.
  //
  // ⚑ WHY IT MATTERS MORE THAN THE KEY DOES. `ensureUser` below does not just
  // sign in — it OVERWRITES the account's password with DEV_PASSWORD (S75 trap
  // #1). So without this guard, one URL would both open `admin@kavenue.fr` AND
  // silently change the founder's real admin password. This repo has already lost
  // six real accounts to a published dev credential; the key now opens nothing
  // that matters even if it leaks.
  //
  // ⚑ LOCAL IS UNTOUCHED. `hosted` is false on localhost, where pointing
  // dev-login at any address is a normal part of testing.
  if (hosted && !isFixtureEmail(email)) {
    return NextResponse.json(
      {
        error:
          "On the live site this only signs in test accounts (@pickup.local, @kavenue.test). " +
          "For a real account, use the normal sign-in — it emails you a link.",
      },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  await ensureUser(admin, email, DEV_PASSWORD);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Land on "/", which routes by role (→ /welcome on first sign-in).
  return NextResponse.redirect(new URL("/", origin));
}

async function ensureUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  // ⚑ Passed in, not closed over: the caller has already proved it is set, so
  // this function cannot create an account against `undefined`.
  password: string,
): Promise<void> {
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) return;

  // Already exists → make sure the password + confirmation are set so sign-in works.
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
    });
  }
}
