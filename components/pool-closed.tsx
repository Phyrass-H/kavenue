// S78 — what a Driver sees where the trips would be, when their car is not approved.
//
// ⚑ WHY A PANEL AND NOT A REDIRECT. A Driver who taps Pool and lands somewhere else assumes
// the app is broken; one who lands on an empty Pool assumes there is no work. Both send them
// to support for something the screen could have said. So the Pool stays where it is and
// tells them which of the three things is missing, and where to go.
//
// ⚑ AND IT NAMES ALL THREE, not just the one that is blocking. The founder, 2026-09-12:
// *"even the company has to be approved! none can work if all together are not approved!"* —
// a Driver whose car is waiting should see that their file and their company are already
// done, or they will re-upload papers nobody asked for.
import Link from "next/link";
import { Lock } from "lucide-react";
import { CAR_REVIEW } from "@/lib/vehicle-approval";

export type CheckState = "done" | "waiting" | "todo";

export interface PoolCheck {
  label: string;
  /** The state in the Driver's own words — "approved 8 September", "with us since today". */
  says: string;
  state: CheckState;
}

export function PoolClosed({ checks, href }: { checks: PoolCheck[]; href: string }) {
  return (
    <div className="pempty">
      <div className="pempty__ic">
        <Lock size={26} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="pempty__t">{CAR_REVIEW.poolTitle}</p>
      <p className="pempty__s">{CAR_REVIEW.poolBody}</p>
      <ul className="poolclosed">
        {checks.map((c) => (
          <li key={c.label} className={`poolclosed__row poolclosed__row--${c.state}`}>
            <span className="poolclosed__label">{c.label}</span>
            <span className="poolclosed__says">{c.says}</span>
          </li>
        ))}
      </ul>
      <Link href={href} className="pempty__cta">
        See your car
      </Link>
    </div>
  );
}
