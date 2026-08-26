// The fleet. One row per Driver, each carrying the one fact that decides
// whether they can work at all.
//
// ⚑ THE STATE IS ON THE ROW, NEVER IN A COUNT AT THE TOP. "6 Drivers can't be
// reached" is a number you read and forget; "Thomas Rey · Monaco, 25 km" beside
// "Élodie Marchand · no base — Pool empty" is a list you can act on. The founder
// has rejected roll-up summaries twice; this is that rule applied to a list.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { readFleet } from "@/lib/admin-activity";
import { serviceClassLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminDriversPage() {
  const db = await createClient();
  const fleet = await readFleet(db);

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Drivers</h1>
          <p className="adm-head__meta">Everyone who can take work, and whether the Pool reaches them.</p>
        </div>
      </header>

      <section className="adm-sect">
        {fleet.map(({ driver: d, vehicle: v }) => {
          const based = d.base_lat != null && d.base_lng != null;
          return (
            <Link key={d.id} href={`/admin/drivers/${d.id}`} className="adm-row adm-row--3">
              <span className="adm-row__name">
                {d.first_name} {d.last_name}
              </span>
              <span className="adm-row__side">
                {v ? serviceClassLabel(v.category, v.body_type) : "No car on file"}
              </span>
              {/* The one fact that decides whether they ever see a trip. */}
              <span className={based ? "adm-row__kind" : "adm-row__kind adm-row__kind--bad"}>
                {based
                  ? `${d.base_label?.split(",")[0] ?? "based"} · ${d.service_radius_km ?? 50} km`
                  : "no base — Pool empty"}
              </span>
              {!d.verified && <span className="adm-pill adm-pill--warn">Not verified</span>}
            </Link>
          );
        })}
      </section>
    </main>
  );
}
