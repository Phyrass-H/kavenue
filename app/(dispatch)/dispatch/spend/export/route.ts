import { NextResponse, type NextRequest } from "next/server";
import { loadDriverWalks } from "@/lib/side-tables";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { isExpired, parisDayKey } from "@/lib/dispatch-status";
import { formatLeadTime, serviceClassLabel } from "@/lib/format";
import { parsePassengers, passengerName } from "@/lib/passengers";
import {
  applyHistoryQuery,
  bucketOf,
  historyFare,
  type HistoryRow,
} from "@/lib/history-filter";
import { minutesToAccept, rowCost } from "@/lib/spend";
import { businessCost, businessSplitFor } from "@/lib/commission";
import { currentSpan, LENS_LABEL, parseSpendQuery, type Lens } from "@/lib/spend-filter";
import type { MissionRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * ⚑ `;`, not `,` — the reader is a French hotel's accountant on Excel FR, where a
 * comma is the DECIMAL separator and a comma-delimited file lands entirely in
 * column A. Amounts are written French-style (58,17) to match. Copied wholesale
 * from the History export so the two files open identically.
 */
const SEP = ";";

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  const risky = /^[=+\-@]/.test(s);
  const body = risky ? `'${s}` : s;
  return /["\n\r;]/.test(body) ? `"${body.replace(/"/g, '""')}"` : body;
}

const euro = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));

const HEADERS = [
  "Date",
  "Time",
  "Pickup",
  "Drop-off",
  "Type",
  "Class",
  "Flight",
  "Guest",
  "Reference",
  "Driver",
  "Desk",
  "Outcome",
  "Cost to you (EUR)",
  // ⚑ docs/06 §3 — the invoice is three lines that separate. A Business reclaims the
  // 20 % VAT on Kavenue's fee and NOTHING on the transport, so a file with one all-in
  // figure is unusable to the person who opens it: the reclaimable number was not in it.
  "Of which service fee (EUR)",
  "Of which VAT on the fee (EUR)",
  "Of which waiting (EUR)",
  "Agreed, not settled (EUR)",
  "Ceiling (EUR)",
  "Minutes to find a Driver",
  "Note",
  // ⚑ MINUTES, NOT A RATE. Every euro column in this file is all-in, and an
  // all-in per-minute waiting rate does not multiply out (a Course-side 0,50
  // shows as 0,58, and 0,58 x 20 is 11,60 against a true 11,50) — a reader
  // checking the arithmetic would catch the file lying. The rate is stated only
  // Course-side, inside the row's own invoice table on screen. docs/06 §10.
  "Waiting (min)",
  // docs/06 §4 — a 22:00-06:00 pickup prices at the card's night multiplier.
  // Named, not numbered: the multiplier lives on the rate card, not the mission.
  "Night rate",
  // The trip was arranged and lost. No money column: who ultimately receives the
  // Driver's penalty is open (founder, 2026-08-20) — BACKLOG § Y.
  "Driver cancelled",
];

// Walk counts per mission — a Driver accepted the trip and then dropped it. The
// re-pool leaves nothing on the mission row, so `mission_cancellation` is the
// only record. Same read, same filter, same wording as the Schedule and the
// archive; RLS scopes it to this Business. All rows, never de-duplicated: a
// re-pooled trip can be walked again.
// ⚑ § R rule 1 — the local copy of this loader was deleted; it lives in
// lib/side-tables.ts now, Business-scoped, shared with the Schedule and archive.

// "1 · 2 h before pickup" — the fact and its lead time, in words, like every
// other categorical column in this file. Empty when no Driver ever walked.
//
// ⛑ `formatLeadTime` is the SAME helper the row uses on screen. This started
// as a near-copy and the two disagreed on real rows: the copy printed "-18 min
// before pickup" where the row clamped to "0 min before pickup" — on a file
// whose whole promise is to be what the screen shows. It also rounded HOURS
// where the row rounded minutes, so 2,5 h read "3 h" here and "2 h 30" there.
function walkCell(walks: { at: string; hoursBefore: number | null }[] | undefined): string {
  if (!walks || walks.length === 0) return "";
  const lead = formatLeadTime(walks[0].hoursBefore);
  const count = walks.length > 1 ? `${walks.length} times` : "1";
  return lead ? `${count} · ${lead}` : count;
}

const OUTCOME_TEXT: Record<string, string> = {
  completed: "Completed",
  unfilled: "Unfilled",
  cancelled: "Cancelled",
};

export async function GET(req: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx.business) return new NextResponse("Not found", { status: 404 });

  const query = parseSpendQuery(Object.fromEntries(req.nextUrl.searchParams));
  const span = currentSpan(query);

  const supabase = await createClient();
  const [{ data }, { data: desks }] = await Promise.all([
    supabase
      .from("mission_read")
      .select("*")
      .eq("business_id", ctx.business.id)
      .neq("status", "draft")
      .lt("pickup_at", new Date().toISOString())
      .order("pickup_at", { ascending: false }),
    supabase.from("dispatcher").select("id, name").eq("business_id", ctx.business.id),
  ]);

  const missions: MissionRow[] = data ?? [];
  const deskName = new Map((desks ?? []).map((d) => [d.id, d.name]));

  const driverName = new Map<string, string>();
  const driverId = new Map<string, string>();
  const cars = new Map<
    string,
    { make: string | null; model: string | null; colour: string | null; plate: string | null }
  >();
  const assigned = missions.filter((m) => m.driver_id);
  if (assigned.length > 0) {
    const admin = createAdminClient();
    const ids = [...new Set(assigned.map((m) => m.driver_id!))];
    const [{ data: drivers }, { data: vehicles }] = await Promise.all([
      admin.from("driver").select("id, first_name, last_name").in("id", ids),
      admin.from("vehicle").select("driver_id, make, model, colour, plate").in("driver_id", ids),
    ]);
    const byId = new Map((drivers ?? []).map((d) => [d.id, d]));
    const vehByDriver = new Map((vehicles ?? []).map((v) => [v.driver_id, v]));
    for (const m of assigned) {
      const d = byId.get(m.driver_id!);
      if (!d) continue;
      driverName.set(m.id, `${d.first_name} ${d.last_name}`);
      driverId.set(m.id, d.id);
      const v = vehByDriver.get(d.id);
      if (v) cars.set(m.id, v);
    }
  }

  const rows: HistoryRow[] = missions.map((m) => ({
    mission: m,
    driverId: driverId.get(m.id) ?? null,
    driverName: driverName.get(m.id) ?? null,
    car: cars.get(m.id) ?? null,
    ...historyFare(m),
  }));

  // The SAME functions the page runs, including the lens. "Export CSV" promises
  // exactly what's on screen, and this is the only way that promise survives the
  // next filter anyone adds.
  const { rows: shown } = applyHistoryQuery(rows, query);
  const lensOf: Record<Lens, (r: HistoryRow) => boolean> = {
    waiting: (r) => Number(r.mission.waiting_fee ?? 0) > 0,
    noshow: (r) => r.mission.status === "completed" && r.mission.no_show,
    cancelled: (r) => r.mission.status === "cancelled",
    unsettled: (r) => !r.counted,
    unfilled: (r) => isExpired(r.mission),
  };
  const listed = query.lens ? shown.filter(lensOf[query.lens]) : shown;

  const driverWalks = await loadDriverWalks(supabase, ctx.business.id);

  const lines = [HEADERS.join(SEP)];
  let total = 0;
  for (const r of listed) {
    const m = r.mission;
    const waiting = Number(m.waiting_fee ?? 0);
    const bucket = bucketOf(m);
    const cost = rowCost(r);
    // The same triple the row and Spend show, so the file decomposes exactly the way
    // the screen does (docs/06 §3). businessSplitFor, not commissionSplit, so a Driver-cancelled
    // trip carries no fee — the same rule businessCost encodes.
    const split = businessSplitFor(m, (r.fare ?? 0) + waiting);
    total += cost;
    const took = minutesToAccept(m);
    const note = m.no_show
      ? "Guest no-show — charged in full"
      : m.status === "cancelled"
        ? // ⚑ Always the Business — see the same note in the History export. A
          // Driver who walked is reported by the "Driver cancelled" column.
          `Cancelled by you${m.cancellation_fee == null ? " — fee not set" : ""}`
        : bucket === null
          ? "Not closed by the Driver — excluded from the total"
          : "";

    lines.push(
      [
        parisDayKey(m.pickup_at),
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        }).format(new Date(m.pickup_at)),
        m.pickup_address,
        m.dropoff_address ?? "",
        m.luggage_only ? "Luggage run" : "Transfer",
        serviceClassLabel(m.category, m.required_body_type),
        m.flight_number ?? "",
        m.luggage_only
          ? "Luggage run"
          : parsePassengers(m.passenger_names).map(passengerName).filter(Boolean).join(" | ") ||
            m.passenger_name ||
            "",
        m.reference ?? "",
        driverName.get(m.id) ?? "",
        deskName.get(m.dispatcher_id) ?? "",
        bucket ? OUTCOME_TEXT[bucket] : "Not closed",
        // ⚑ Blank, never "0,00", when nothing was charged. An unfilled mission
        // and a legacy cancellation with no fee recorded both reach here as
        // counted rows with a null fare; writing 0,00 asserts the trip cost
        // nothing, where the screen honestly shows "—".
        r.counted && (r.fare != null || waiting > 0) ? euro(cost) : "",
        r.counted && (r.fare != null || waiting > 0) ? euro(split.businessFeeHt) : "",
        r.counted && (r.fare != null || waiting > 0) ? euro(split.businessFeeVat) : "",
        // ⚑ The waiting column is honest on an unclosed row too. Waiting settles
        // at boarding, so it is real money whether or not the trip was ever
        // closed — and the "not settled" column beside it now carries the same
        // fare+waiting the page's own unsettled tile shows, so the CSV and the
        // screen can't report two different numbers for one filter.
        // ⚑ ALL IN, like every column beside it. These three were still writing
        // the Course after commission shipped on 2026-08-17, so a spreadsheet
        // could not reconcile: "Of which waiting" claims to be part of "Cost to
        // you", and "Agreed, not settled" claims to mirror the page's own tile.
        waiting > 0 ? euro(businessCost(m, waiting)) : "",
        r.counted ? "" : euro(businessCost(m, Number(r.fare ?? 0) + waiting)),
        euro(businessCost(m, Number(m.ceiling))),
        took == null ? "" : String(Math.round(took)),
        note,
        m.waiting_minutes && waiting > 0 ? String(m.waiting_minutes) : "",
        m.night_applied ? "Night rate" : "",
        walkCell(driverWalks.get(m.id)),
      ]
        .map(cell)
        .join(SEP),
    );
  }

  // A total row, because the first thing anyone does with this file is sum a
  // column — and doing it by hand would include the unsettled trips the page
  // deliberately excludes.
  //
  // ⚑ It names what was actually summed. Every filter in the URL narrows these
  // rows, so a lens subtotal labelled "Total 1 July → 31 July" claimed to be the
  // period total while disagreeing with the page's own headline by design.
  const narrowedBy = [
    query.lens ? LENS_LABEL[query.lens] : null,
    query.q ? `search “${query.q}”` : null,
    query.category ? `class ${query.category}` : null,
    query.driverId ? "one Driver" : null,
    query.outcome !== "all" ? query.outcome : null,
  ].filter(Boolean);
  const label = narrowedBy.length
    ? `Total shown (${narrowedBy.join(", ")}) ${span.fromDay} → ${span.toDay}`
    : `Total ${span.fromDay} → ${span.toDay}`;
  lines.push("");
  lines.push([label, "", "", "", "", "", "", "", "", "", "", "", euro(total)].map(cell).join(SEP));

  // ﻿: without the BOM, Excel reads the file as Latin-1 and every French address
  // comes out as "AÃ©roport". Sheets and Numbers ignore it.
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kavenue-spend-${span.fromDay}_${span.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
