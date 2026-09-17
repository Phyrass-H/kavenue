// One approval in its own column — the S80 cell of /admin/drivers "To be approved" ([[d140]]), and since
// S81 the car table of /admin/vehicles too.
//
// ⚑ ONE COMPONENT FOR BOTH PAGES ([[d142]]: "use the same wording as driver and clean rows same as
// driver"). A copy per page would be two spellings of one approval, and they drift — the words come
// from adminPiles, the look from CELL_LOOK, and both live only here.
import { PILL_WORD, type AdminPile } from "@/lib/driver-approvals";

/** How each state looks. Keyed by the state, so a fourth one is a compile error, not an unstyled cell. */
const CELL_LOOK: Record<AdminPile["state"], string> = {
  waiting: "adm-pill adm-pill--warn", // yours to approve
  todo: "adm-pill", //                   the Driver owes it
  done: "adm-apv__done", //              nothing left — a quiet tick
};

const firstUpper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One approval in its own column — and, under a done one, what the Driver still owes. */
export function ApprovalCell({ p }: { p: AdminPile }) {
  return (
    <span className="adm-apv__cell">
      <span className="adm-apv__l">{PILL_WORD[p.pile]}</span>
      <span className={CELL_LOOK[p.state]}>{firstUpper(p.says)}</span>
      {p.detail && <span className="adm-apv__detail">{p.detail}</span>}
    </span>
  );
}
