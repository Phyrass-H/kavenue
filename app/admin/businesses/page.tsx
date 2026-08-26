// The hotels. One row each, with the number that actually stings: how many of
// their trips nobody took.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminBusinessesPage() {
  const db = await createClient();
  const [{ data: businesses }, { data: trips }] = await Promise.all([
    db.from("business").select("id, name, business_address_label").order("name"),
    db.from("mission").select("business_id, status"),
  ]);

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>Hotels</h1>
          <p className="adm-head__meta">Who books, and how often Kavenue found them a Driver.</p>
        </div>
      </header>

      <section className="adm-sect">
        {(businesses ?? []).map((b) => {
          const theirs = (trips ?? []).filter((t) => t.business_id === b.id);
          const unfilled = theirs.filter((t) => t.status === "expired").length;
          return (
            <Link key={b.id} href={`/admin/businesses/${b.id}`} className="adm-row adm-row--3">
              <span className="adm-row__name">{b.name}</span>
              <span className="adm-row__side">
                {theirs.length} trip{theirs.length === 1 ? "" : "s"}
              </span>
              <span className={unfilled ? "adm-row__kind adm-row__kind--bad" : "adm-row__kind"}>
                {unfilled ? `${unfilled} nobody took` : "all filled"}
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
