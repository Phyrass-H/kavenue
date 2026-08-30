// The period bar every Activity Console screen opens with.
//
// ⚑ ALL TIME IS FIRST AND IS THE DEFAULT (founder, S71): *"the analyses are not
// only in the last few months but from day one."* A period narrows an answer that
// is already complete; it never stands in for one, and getting back to everything
// is always one click.
//
// ⚑ PLAIN LINKS, NOT A CLIENT COMPONENT. The console is server-rendered and every
// figure on the page comes from SQL for the chosen period, so the period has to
// be in the URL anyway — which means it is shareable, bookmarkable, and survives
// a reload. A stateful picker would have to push it into the URL to work at all.
//
// ⚑ AND SWITCHING PERIOD KEEPS THE FILTERS. `keep` carries whatever the screen
// was already narrowed to, so stepping from July to June does not silently drop
// "Businesses in Nice" — a screen that forgets what you asked is how someone ends
// up trusting a number for the wrong set.
import Link from "next/link";
import { ADMIN_PERIODS, periodHref, periodTabLabel, type AdminPeriod } from "@/lib/admin-period";
import { AdminRangeTab } from "@/components/admin-range-tab";

export function AdminPeriodBar({
  now,
  base,
  keep,
}: {
  now: AdminPeriod;
  /** The screen's own path, e.g. "/admin/businesses". */
  base: string;
  /** Filters to carry across a period change. Undefined values are dropped. */
  keep: Record<string, string | undefined>;
}) {
  return (
    <div className="adm-per">
      <div className="adm-per__tabs">
        {/* Five plain links. The sixth is a client island, because a
            hand-picked span has to be chosen before there is a URL to link to. */}
        {ADMIN_PERIODS.filter((p) => p !== "range").map((p) => (
          <Link
            key={p ?? "all"}
            href={periodHref(base, { period: p, anchor: now.anchor }, keep)}
            className={`adm-per__t${now.period === p ? " is-on" : ""}`}
          >
            {periodTabLabel(p)}
          </Link>
        ))}
        <AdminRangeTab
          base={base}
          isOn={now.period === "range"}
          fromDay={now.fromDay}
          toDay={now.toDay}
          today={now.today}
          keep={keep}
        />
      </div>

      <div className="adm-per__now">
        {now.period === null ? (
          // ⚑ "All time" says so in words rather than leaving the space empty.
          // A bar with nothing in it reads as a control that has not loaded.
          <span className="adm-per__label">Everything, from day one</span>
        ) : (
          <>
            {now.prev && (
              <Link
                href={periodHref(base, { period: now.period, anchor: now.prev }, keep)}
                className="adm-per__step"
                aria-label="Previous period"
              >
                ‹
              </Link>
            )}
            <span className="adm-per__label">{now.label}</span>
            {/* ⚑ The › is HIDDEN, not disabled, once the period contains today —
                there is nothing after now, and a dead arrow invites the click
                that proves it. Same rule as the Earnings screen. */}
            {now.next && !now.isCurrent && (
              <Link
                href={periodHref(base, { period: now.period, anchor: now.next }, keep)}
                className="adm-per__step"
                aria-label="Next period"
              >
                ›
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
