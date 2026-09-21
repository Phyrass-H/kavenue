import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { readAllPages, readErrorMessage } from "@/lib/paged-read";
import type { MissionRow } from "@/lib/database.types";
import { getAppContext } from "@/lib/app-context";
import { commissionSplit, businessRatesOf } from "@/lib/commission";
import { categoryLabel, formatDateTime, formatMoney } from "@/lib/format";
import { DraftActions } from "@/components/draft-actions";

export const dynamic = "force-dynamic";

export default async function DispatchDrafts() {
  const ctx = await getAppContext();
  if (!ctx.business) return null;

  const supabase = await createClient();

  // ⚑ PAGED. An unbounded `.select()` stops at 1 000 rows and reports no error
  //   (lib/paged-read.ts), and the sidebar badge beside this page is an EXACT
  //   count (app/(dispatch)/layout.tsx) — so past 1 000 drafts the badge and the
  //   page would have disagreed out loud, with the page the one lying.
  // ⚑ `.order("id")` after `created_at` so two pages cannot overlap.
  let list: MissionRow[] = [];
  let error: { message: string } | null = null;
  try {
    list = await readAllPages<MissionRow>("Your drafts", (from, to) =>
      supabase
        .from("mission_read")
        .select("*")
        .eq("business_id", ctx.business!.id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );
  } catch (e) {
    error = { message: readErrorMessage(e) };
  }

  return (
    <div className="dx-narrow">
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Missions you saved but haven&apos;t posted. Continue editing to review and
        send one to the Pool.
      </p>

      {error && <div className="notice error">{error.message}</div>}

      {error ? null : list.length === 0 ? (
        <div className="empty">
          No drafts.
          <br />
          <Link href="/dispatch/new" style={{ textDecoration: "underline" }}>
            Create a mission →
          </Link>
        </div>
      ) : (
        list.map((m) => (
          <div className="card" key={m.id}>
            <div className="card-row">
              <span style={{ fontWeight: 600 }}>{formatDateTime(m.pickup_at)}</span>
              <span className="badge">{categoryLabel(m.category)}</span>
            </div>
            <div className="route" style={{ marginTop: 6 }}>
              <div className="leg">
                <span className="dot" />
                <span>{m.pickup_address}</span>
              </div>
              <div className="leg">
                <span className="dot end" />
                <span>{m.dropoff_address ?? "—"}</span>
              </div>
            </div>
            {/* ALL IN. `mission.ceiling` is the Course; a Business is only ever
                shown its own side of it (docs/06 §1). A draft saved before
                commission has NULL rates and passes through unconverted, which
                is right — it was never going to carry a fee. */}
            <div className="muted small" style={{ marginTop: 6 }}>
              Ceiling {formatMoney(commissionSplit(Number(m.ceiling), businessRatesOf(m)).businessTotal)}
            </div>
            <DraftActions missionId={m.id} editHref={`/dispatch/new?draft=${m.id}`} />
          </div>
        ))
      )}
    </div>
  );
}
