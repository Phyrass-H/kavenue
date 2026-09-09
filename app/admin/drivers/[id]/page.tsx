// One Driver: who they are, whether trips reach them, and their trips.
//
// ⚑ THE "REACHABLE" BLOCK IS THE POINT OF THIS PAGE. Six of the nine Drivers on
// the live fleet have never set a base, so their Pool is empty and always has
// been — they have never been offered a single trip and nothing in the app tells
// anyone that. Everything here is read straight from the rules the Pool applies
// (lib/eligibility.ts), so it can't drift into flattery.
//
// ⚑ AND THAT IS THE WHOLE OF ITS JOB (2026-09-09). The block answers ONE question
// — will a trip ever appear on this Driver's screen — and therefore carries only
// the Pool's own filter: base + radius, the car's class, and the luggage opt-in.
// `verified` was in here and is not any more: it decides whether they may ACCEPT,
// not whether they are shown anything, and the founder's 2026-09-07 rule keeps the
// Pool visible to a Driver still in review. It belongs to the papers below.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminTripList } from "@/components/admin-trip-list";
import { pageWindow, pageNote } from "@/lib/admin-list";
import { serviceClassLabel, categoryLabel } from "@/lib/format";
import { genderSays } from "@/lib/gender";
import { getLatestDocuments } from "@/lib/documents";
import { DRIVER_DOC_TYPES } from "@/lib/account";
import { AdminDocumentReview } from "@/components/admin-document-review";

const PER_PAGE = 40;

export const dynamic = "force-dynamic";

export default async function AdminDriverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;
  const win = pageWindow(page, PER_PAGE);
  const db = await createClient();

  const { data: driver } = await db.from("driver").select("*").eq("id", id).maybeSingle();
  if (!driver) notFound();

  const [{ data: vehicles }, { data: trips, count }, docs] = await Promise.all([
    // ⚑ ORDERED, AND THE ORDER IS NOT COSMETIC. getDriverContext picks the Driver's
    //   car as the OLDEST by created_at and ignores is_active (lib/driver.ts:29-35),
    //   and that is the car the Pool matches trips against. This query had no order
    //   at all, so `vehicles[0]` was whatever Postgres returned — and the block below
    //   claims to state the Pool's own rule.
    db.from("vehicle").select("*").eq("driver_id", id).order("created_at", { ascending: true }),
    db
      .from("mission_read")
      .select("*", { count: "exact" })
      .eq("driver_id", id)
      .order("pickup_at", { ascending: false })
      .range(win.from, win.to),
    // ⚑ READ WITH THE SERVICE ROLE, deliberately, and it is the one read on this
    //   page that does. `getLatestDocuments` signs a short-lived URL per file so
    //   the reviewer can actually LOOK at the paper — the bucket is private and a
    //   signed URL cannot be minted from a user session. The admin's right to be
    //   here is already settled by app/admin/layout.tsx.
    getLatestDocuments("driver", id, DRIVER_DOC_TYPES),
  ]);
  // ⚑ THE POOL'S CAR, NOT THE ACTIVE ONE. This used to prefer `is_active`, which
  //   disagrees with getDriverContext the moment a Driver's oldest car is paused —
  //   the screen would name one car while the Pool matched on another. Same rule,
  //   same answer, by construction.
  const fleet = vehicles ?? [];
  const car = fleet[0] ?? null;
  const based = driver.base_lat != null && driver.base_lng != null;

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          <h1>
            {driver.first_name} {driver.last_name}
          </h1>
          <p className="adm-head__meta">
            {car ? serviceClassLabel(car.category, car.body_type) : "No car on file"}
            {car?.make && ` · ${car.make} ${car.model ?? ""}`}
            {driver.phone && ` · ${driver.phone}`}
            {/* ⚑ SHOWN, INCLUDING WHEN IT IS EMPTY. "not asked" is a fact about
                Kavenue, not about the Driver — printing nothing would make an
                optional question look like one nobody answers. It decides
                nothing, which is why it sits in the identity line and not in
                "Will trips reach them?". */}
            {` · ${genderSays(driver.gender)}`}
          </p>
        </div>
        <div className="adm-head__side">
          <span className={`adm-pill${driver.verified ? " adm-pill--ok" : " adm-pill--warn"}`}>
            {driver.verified ? "Verified" : "Not verified"}
          </span>
        </div>
      </header>

      {/* ⚑ ONE QUESTION, AND ONLY THE THINGS THAT ANSWER IT (2026-09-09, founder).
          This was headed "Can the Pool reach them?" and carried a `verified` row
          reading "they cannot take or hold any trip". Both were wrong here:

          · THE POOL DOES REACH AN UNVERIFIED DRIVER. The Pool query does not filter
            on `verified` — the founder chose that on 2026-09-07 so a Driver in
            review still sees the work, with a notice above it, because an empty
            screen reads as broken (lib/eligibility.ts:34). `verified` decides
            whether they may ACCEPT, which is a different question.
          · AND IT PRE-JUDGED THE PAPERS. The row sat ABOVE the document review, so
            the screen delivered a verdict before the reviewer had looked at the
            evidence — and it was the third place on one page to say the same thing.

          ⚑⚑ EVERY ROW BELOW IS ONE RULE FROM app/(app)/pool/page.tsx:117-151, IN ITS
          ORDER, AND SAYS NO MORE THAN THE RULE DOES. The first version of this block
          shipped on 2026-09-09 and overstated two of them within the hour:
            · it read "their car is Business · Van — only trips asking for that reach
              them", fusing tier and body. The Pool filters TIER exactly (:117) and
              body ONLY when the trip demands one (:143). "Any" is the dispatch form's
              default, so most Business trips reach a Business van — the screen said
              they could not.
            · the lede said "up to N km for a pickup". The Pool matches the pickup OR
              the drop-off (:133-135), and the Driver's own screen already says so
              (app/(app)/settings/area/page.tsx:69). The admin was told the narrower
              rule; a Marseille → Nice trip is in a Nice Driver's Pool today.
          A row here is a claim about what the Pool does. If it cannot be traced to a
          line in that filter, it does not belong. */}
      <section className="adm-sect">
        <h2 className="adm-sect__h">Will trips reach them?</h2>
        {!car ? (
          <p className="adm-lede adm-lede--bad">
            No — there is no car on file, and the Pool matches on the car. Nothing can reach them.
          </p>
        ) : !based ? (
          <p className="adm-lede adm-lede--bad">
            No — they have never set a base, so their Pool is empty and always has been. They have
            never been offered a trip.
          </p>
        ) : (
          <p className="adm-lede">
            Yes — based in {driver.base_label ?? "a set location"}. A trip reaches them when its
            pickup <strong>or</strong> its drop-off is within {driver.service_radius_km ?? 50} km.
          </p>
        )}

        {car && (
          <>
            {/* ⚑ TIER ONLY. `query.eq("category", vehicle.category)` — the one hard
                class filter, applied in SQL before anything else. */}
            <div className="adm-check">
              <span className="adm-check__ic" aria-hidden="true">✓</span>
              <span>Only {categoryLabel(car.category)} trips reach them</span>
              <span className="adm-check__d">
                {[car.make, car.model].filter(Boolean).join(" ") ||
                  serviceClassLabel(car.category, car.body_type)}
              </span>
            </div>

            {/* ⚑ CONDITIONAL, NOT A GATE. Body is checked only when the trip names
                one; a trip that asks for no particular body reaches both. Saying it
                the other way round is what the first version got wrong. */}
            <div className="adm-check adm-check--dead">
              <span className="adm-check__ic" aria-hidden="true">–</span>
              <span>
                Of those, one that asks specifically for a{" "}
                {car.body_type === "van" ? "Sedan" : "Van"} is hidden — theirs is a{" "}
                {car.body_type === "van" ? "Van" : "Sedan"}. Trips that ask for no particular body
                still reach them.
              </span>
            </div>

            {/* ⚑ THE THIRD HIDE RULE (pool/page.tsx:146-150), and it was missing while
                the comment above claimed this block was the whole filter. It fires
                only when a Dispatcher names a car; `carMatches` is tolerant because
                the Driver types their make free-text. */}
            <div className="adm-check adm-check--dead">
              <span className="adm-check__ic" aria-hidden="true">–</span>
              <span>And one that names a specific car reaches them only if theirs matches</span>
            </div>
          </>
        )}

        {/* ⚑ THE OTHER CARS ARE INVISIBLE TO THE POOL, so they are named here rather
            than left to look like they count. getDriverContext takes one car and only
            one; a Driver who added a second is matched on their first. */}
        {fleet.length > 1 && (
          <div className="adm-check adm-check--dead">
            <span className="adm-check__ic" aria-hidden="true">–</span>
            <span>
              {fleet.length - 1} other car{fleet.length > 2 ? "s" : ""} on file — the Pool never
              looks at {fleet.length > 2 ? "them" : "it"}
            </span>
            <span className="adm-check__d">
              {fleet.slice(1).map((v) => serviceClassLabel(v.category, v.body_type)).join(", ")}
            </span>
          </div>
        )}

        {/* ⚑ A REAL FILTER THAT WAS HIDING AS A FOOTNOTE — until 2026-09-09 this was
            the trailing detail string on the `verified` row, beside a fact it has
            nothing to do with. The Pool drops a luggage-only run for a Driver who has
            not opted in (app/(app)/pool/page.tsx:141).
            ⚑ ONLY FOR A VAN, because only a van Driver is offered the choice
            (app/onboarding/actions.ts:47).
            ⚑ AND THE TIER STILL APPLIES ON TOP. pool/page.tsx:139 claims luggage runs
            are "category=business"; the live data says otherwise — 7 luggage runs,
            categories business AND luxury, required_body_type null on every one
            (measured 2026-09-09). So the honest sentence names no tier, and that
            stale comment in the Pool is worth correcting separately. */}
        {car?.body_type === "van" && (
          <div className={`adm-check${driver.accepts_luggage_runs ? "" : " adm-check--dead"}`}>
            <span className="adm-check__ic" aria-hidden="true">
              {driver.accepts_luggage_runs ? "✓" : "–"}
            </span>
            <span>
              {driver.accepts_luggage_runs
                ? `Luggage-only runs reach them too, when they are ${categoryLabel(car.category)}`
                : "Hasn’t opted into luggage-only runs — those never reach them"}
            </span>
          </div>
        )}

        {/* ⚑ Named, not hidden. Collected, shown to the Driver, and never consulted
            when Kavenue decides who sees a trip. */}
        <div className="adm-check adm-check--dead">
          <span className="adm-check__ic" aria-hidden="true">–</span>
          <span>Towns they say they work — never consulted</span>
          <span className="adm-check__d">{(driver.operational_zones ?? []).join(", ") || "none set"}</span>
        </div>
      </section>

      <AdminDocumentReview
        driverId={id}
        driverName={`${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || "This Driver"}
        verified={driver.verified}
        docs={docs}
      />

      <section className="adm-sect">
        {/* ⚑ NO ROLL-UP HERE. This used to read "· 83 of 90 completed" over rows
            that each already carry their own ending. The fleet list is where
            "is this Driver working" belongs, and it says so per Driver. */}
        <h2 className="adm-sect__h">Their trips</h2>
        <AdminTripList
          rows={trips ?? []}
          note={pageNote(count ?? 0, win, PER_PAGE)}
          pageHref={(p) => (p === 0 ? `/admin/drivers/${id}` : `/admin/drivers/${id}?page=${p}`)}
          empty="They have never held a trip."
          band="month"
        />
      </section>
    </main>
  );
}
