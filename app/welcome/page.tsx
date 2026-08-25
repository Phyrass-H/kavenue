import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppContext, routeFor } from "@/lib/app-context";

// First screen after a brand-new sign-in: pick which side of Kavenue you are.
export default async function WelcomePage() {
  const ctx = await getAppContext();
  if (!ctx.user) redirect("/login");
  // Already has a role → send them to their area.
  // ⚑ NEVER FOLLOW A SELF-REFERENTIAL ANSWER. routeFor() returning "/welcome" for
  // a user who HAS a profile means this page redirects to itself, forever — which
  // is what `role='admin'` did from the day the enum was written. A role this
  // build does not know about must land here and STOP, showing the picker, not
  // spin. The missing case is a dead end, never a loop.
  if (ctx.profile) {
    const to = routeFor(ctx);
    if (to !== "/welcome") redirect(to);
  }

  return (
    <main className="container" style={{ paddingTop: 28 }}>
      <h1>Welcome to Kavenue</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        How will you use Kavenue? Signed in as <strong>{ctx.user.email}</strong>.
      </p>

      <div className="card">
        <h2>I’m a Driver</h2>
        <p className="muted small">Browse the Pool, accept and run VTC missions.</p>
        <Link className="btn" href="/onboarding">
          Continue as Driver
        </Link>
      </div>

      <div className="card">
        <h2>I’m a Business</h2>
        <p className="muted small">
          Post missions and manage bookings (hotel, agency, concierge).
        </p>
        <Link className="btn secondary" href="/onboarding-business">
          Continue as Business
        </Link>
      </div>
    </main>
  );
}
