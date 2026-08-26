// One trip: its whole story in order, and the answer to "why can't this Driver
// take it?".
//
// ⚑ THE MATCHER IS THE HIGHEST-VALUE THING HERE, and it is why the page exists.
// Until now, answering "why has nobody taken this?" meant querying the database
// by hand. It re-runs the real rules (lib/eligibility.ts) — the same ones
// accept_mission enforces and the Pool filters on — and names the one that
// stopped each Driver.
//
// ⚑ IT SHOWS THE BLOCKER, NOT THE RULEBOOK. The first preview listed all nine
// checks for every Driver and read as a wall. A person asking this question
// wants the reason, so the answer is one sentence and the passing checks fold
// away behind a summary.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readFleet, readCommitments, readMissionEvents, matchFleet } from "@/lib/admin-activity";
import { AdminDriverPicker } from "@/components/admin-driver-picker";
import { becauseOf } from "@/lib/eligibility";
import { missionStory, approxCount, seededCount } from "@/lib/mission-story";
import { tripLabel, whenLabel } from "@/lib/activity-findings";
import {
  formatDateTime,
  formatMoney,
  formatTripMeta,
  missionStatusLabel,
  serviceClassLabel,
  shortPlaceLabel,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const VERDICT_PILL = {
  can_take: { className: "adm-pill adm-pill--ok", text: "Can take it" },
  refused: { className: "adm-pill adm-pill--bad", text: "Refused" },
  never_seen: { className: "adm-pill adm-pill--warn", text: "Never seen it" },
} as const;

const PAST_PILL = {
  can_take: { className: "adm-pill adm-pill--ok", text: "Matched" },
  refused: { className: "adm-pill adm-pill--bad", text: "Wrong car" },
  never_seen: { className: "adm-pill adm-pill--warn", text: "Out of reach" },
} as const;

export default async function AdminTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ driver?: string }>;
}) {
  const { id } = await params;
  const { driver: askedFor } = await searchParams;
  const db = await createClient();

  const { data: mission } = await db.from("mission").select("*").eq("id", id).maybeSingle();
  if (!mission) notFound();

  const [{ data: business }, fleet, commitments, events] = await Promise.all([
    db.from("business").select("id, name").eq("id", mission.business_id).maybeSingle(),
    readFleet(db),
    readCommitments(db),
    readMissionEvents(db, id),
  ]);

  // ⚑ A trip that has left the Pool gets the PAST-TENSE question. Asking "can
  // they take it" about a finished trip answers "no, it is completed" eleven
  // times over and buries the question a person actually has, which is who
  // could have taken it while it was sitting there.
  const settled = mission.status !== "pooled";
  const matched = matchFleet(mission, fleet, commitments, new Date(), settled);
  const takers = matched.filter((m) => m.eligibility.verdict === "can_take");
  const story = missionStory(events);
  const approx = approxCount(story);
  const seeded = seededCount(story);
  const holder = fleet.find((f) => f.driver.id === mission.driver_id);

  // Default the picker to a Driver who CAN'T take it — an answer is more useful
  // than a tick, and on a pooled trip that is the question being asked.
  const selected =
    matched.find((m) => m.fleet.driver.id === askedFor) ??
    matched.find((m) => m.eligibility.verdict !== "can_take") ??
    matched[0];

  return (
    <main className="adm-main">
      <header className="adm-head">
        <div className="adm-head__main">
          {/* ⚑ The seeded trips carry NO route labels, so the short labels have
              to be derived from the stored addresses — otherwise the heading
              names one end of the journey and leaves off the other. */}
          <h1>
            {tripLabel(
              {
                pickup_label: mission.pickup_label ?? shortPlaceLabel(mission.pickup_address),
                dropoff_label: mission.dropoff_label ?? shortPlaceLabel(mission.dropoff_address),
              },
              whenLabel(mission.pickup_at),
            )}
          </h1>
          <p className="adm-head__meta">
            {business ? (
              <Link href={`/admin/businesses/${business.id}`}>{business.name}</Link>
            ) : (
              "An unknown hotel"
            )}
            {" · "}
            {serviceClassLabel(mission.category, mission.required_body_type)}
            {" · "}
            {formatDateTime(mission.pickup_at)}
            {mission.distance_km != null && ` · ${formatTripMeta(mission.distance_km, mission.duration_min, null)}`}
            {" · Ceiling "}
            {formatMoney(mission.ceiling)}
          </p>
        </div>
        <div className="adm-head__side">
          <span className="adm-pill">{missionStatusLabel(mission.status)}</span>
          {holder && (
            <Link href={`/admin/drivers/${holder.driver.id}`} className="adm-pill adm-pill--info">
              {holder.driver.first_name} {holder.driver.last_name}
            </Link>
          )}
        </div>
      </header>

      {settled && (
        <p className="adm-lede">
          {takers.length === 0
            ? "Nobody in the fleet matched this trip."
            : `${takers.length} of ${matched.length} Drivers matched this trip: ${takers
                .map((t) => `${t.fleet.driver.first_name} ${t.fleet.driver.last_name}`)
                .join(", ")}.`}
        </p>
      )}

      {mission.status === "pooled" && (
        <p className="adm-lede">
          {takers.length === 0
            ? "Nobody in the fleet can take this trip."
            : takers.length === 1
              ? `One Driver can take this trip: ${takers[0].fleet.driver.first_name} ${takers[0].fleet.driver.last_name}.`
              : `${takers.length} Drivers can take this trip: ${takers
                  .map((t) => `${t.fleet.driver.first_name} ${t.fleet.driver.last_name}`)
                  .join(", ")}.`}
        </p>
      )}

      <section className="adm-sect">
        <h2 className="adm-sect__h">
          {settled ? "Who could have taken this trip?" : "Why can’t this Driver take it?"}
        </h2>
        <AdminDriverPicker
          drivers={matched.map((m) => ({
            id: m.fleet.driver.id,
            name: `${m.fleet.driver.first_name} ${m.fleet.driver.last_name}`.trim(),
          }))}
          selectedId={selected?.fleet.driver.id ?? null}
          hrefFor={`/admin/trips/${id}`}
        />

        {selected && (
          <div className="adm-verdict">
            <p className="adm-verdict__a">
              {selected.eligibility.answer}{" "}
              {(() => {
                const pill = (settled ? PAST_PILL : VERDICT_PILL)[selected.eligibility.verdict];
                return <span className={pill.className}>{pill.text}</span>;
              })()}
            </p>
            <p className="adm-verdict__b">{becauseOf(selected.eligibility, settled)}</p>

            <details className="adm-checks">
              <summary>
                {selected.eligibility.rules.filter((r) => r.ok).length} other checks passed
              </summary>
              {selected.eligibility.rules
                .filter((r) => r.ok)
                .map((r) => (
                  <div key={r.id} className="adm-check">
                    <span className="adm-check__ic" aria-hidden="true">
                      ✓
                    </span>
                    <span>{r.says}</span>
                    <span className="adm-check__d">{r.detail}</span>
                  </div>
                ))}
              {/* ⚑ Shown, never omitted: a reader who doesn't see these assumes
                  they matter. `verified` in particular stops nothing today. */}
              {selected.eligibility.decidesNothing.map((d) => (
                <div key={d.says} className="adm-check adm-check--dead">
                  <span className="adm-check__ic" aria-hidden="true">
                    –
                  </span>
                  <span>{d.says} — never consulted</span>
                  <span className="adm-check__d">{d.detail}</span>
                </div>
              ))}
            </details>
          </div>
        )}
      </section>

      <section className="adm-sect">
        <h2 className="adm-sect__h">What happened</h2>
        {story.length === 0 ? (
          <p className="adm-none">
            Nothing is recorded for this trip. The log started on 24 August; trips that ended
            before it have no entries.
          </p>
        ) : (
          <ol className="adm-story">
            {story.map((e) => (
              <li key={e.id} className={`adm-ev adm-ev--${e.phase}`}>
                <time className="adm-ev__when" dateTime={e.at}>
                  {formatDateTime(e.at)}
                </time>
                <span className="adm-ev__rail" aria-hidden="true" />
                <span className="adm-ev__body">
                  {e.says}
                  {e.detail && <span className="adm-ev__d"> · {e.detail}</span>}
                  {/* ⚑ Two different claims, never merged. "approx" means it
                      really happened and the time is reconstructed; "test data"
                      means it never happened at all. */}
                  {e.seededLabel && (
                    <abbr className="adm-approx adm-approx--seed" title="Manufactured by the seed. This trip never happened.">
                      {e.seededLabel}
                    </abbr>
                  )}
                  {e.approxBecause && (
                    <abbr className="adm-approx" title={e.approxBecause}>
                      approx
                    </abbr>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {seeded > 0 && (
          <p className="adm-quiet">
            This trip was manufactured by the seed — {seeded} of its {story.length} entries are test
            data, not a record of anything that happened.
          </p>
        )}
        {approx > 0 && (
          <p className="adm-quiet">
            {approx} of these {story.length} times were reconstructed when the log was switched on,
            not observed. Hover one to see what it can’t prove.
          </p>
        )}
      </section>
    </main>
  );
}
