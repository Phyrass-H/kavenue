import { getAppContext } from "@/lib/app-context";

// The admin landing page. Deliberately almost empty: this ships as STEP ONE of
// the support console — the point of it is that an admin can now get into the app
// at all. The Activity console (search a person / hotel / trip, one trip's whole
// story in order, and the "why can't this Driver take this trip?" answer) lands
// here next, and gets a design preview before it is built.
export default async function AdminPage() {
  const ctx = await getAppContext();

  return (
    <main className="container" style={{ paddingTop: 28, maxWidth: 720 }}>
      <h1 style={{ marginBottom: 4 }}>Admin</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Signed in as <strong>{ctx.user?.email}</strong>.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Activity</h2>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Search a Driver, a Business or a trip and read what happened to it, in order, with
          times. Not built yet — this is the next job.
        </p>
      </div>
    </main>
  );
}
