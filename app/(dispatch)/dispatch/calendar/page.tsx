import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/app-context";
import { serviceClassLabel, formatTime } from "@/lib/format";
import { settledFare } from "@/lib/pdp";
import { commissionSplit, businessRatesOf } from "@/lib/commission";
import { missionTone, parisDayKey } from "@/lib/dispatch-status";
import { parseWaypoints } from "@/lib/waypoints";
import { DispatchCalendar, type CalEntry, type CalendarData } from "@/components/dispatch-calendar";

export const dynamic = "force-dynamic";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function DispatchCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; view?: string; wk?: string }>;
}) {
  const ctx = await getAppContext();
  if (!ctx.business) return null;

  const { month, week, view, wk } = await searchParams;
  const landWeek = week === "last" ? "last" : week === "first" ? "first" : null;
  // View + week index survive a reload (the client keeps them fresh in the URL).
  const initialView = landWeek || view === "week" ? ("week" as const) : ("month" as const);
  const initialWeek = wk != null && /^\d+$/.test(wk) ? Number(wk) : null;
  const todayKey = parisDayKey(new Date());
  const currentYm = todayKey.slice(0, 7);
  const ym = month && /^\d{4}-\d{2}$/.test(month) ? month : currentYm;
  const [year, mon] = ym.split("-").map(Number);

  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 1));
  const qStart = new Date(monthStart.getTime() - 86_400_000).toISOString();
  const qEnd = new Date(monthEnd.getTime() + 86_400_000).toISOString();

  const supabase = await createClient();
  const { data: missions } = await supabase
    .from("mission_read")
    .select("*")
    .eq("business_id", ctx.business.id)
    .neq("status", "draft")
    .gte("pickup_at", qStart)
    .lt("pickup_at", qEnd)
    .order("pickup_at", { ascending: true });

  // Reveal assigned Driver names (service role, gated to this business).
  const driverName = new Map<string, string>();
  const assigned = (missions ?? []).filter((m) => m.driver_id);
  if (assigned.length > 0) {
    const admin = createAdminClient();
    const driverIds = [...new Set(assigned.map((m) => m.driver_id!))];
    const { data: drivers } = await admin
      .from("driver")
      .select("id, first_name, last_name")
      .in("id", driverIds);
    for (const d of drivers ?? []) {
      driverName.set(d.id, `${d.first_name} ${d.last_name}`);
    }
  }

  const entries: CalEntry[] = [];
  for (const m of missions ?? []) {
    const key = parisDayKey(m.pickup_at);
    if (!key.startsWith(`${ym}-`)) continue;
    const t = missionTone(m);
    const flightEta = m.flight_eta ? formatTime(m.flight_eta) : null;
    entries.push({
      id: m.id,
      day: Number(key.slice(8, 10)),
      time: formatTime(m.pickup_at),
      guest: m.passenger_name ?? "—",
      driver: (m.driver_id && driverName.get(m.driver_id)) || null,
      cat: serviceClassLabel(m.category, m.required_body_type),
      catKey: m.category,
      body: m.required_body_type ?? null,
      tone: t.tone,
      label: t.label,
      // ALL IN — converted here, at the one place these two figures are built,
      // so the calendar component never has to know commission exists. Both are
      // Course-basis in the row; a Business is only shown its own side (docs/06 §1).
      fare: commissionSplit(settledFare(m), businessRatesOf(m)).businessTotal,
      ceiling: commissionSplit(Number(m.ceiling ?? 0), businessRatesOf(m)).businessTotal,
      from: m.pickup_address,
      to: m.dropoff_address ?? "—",
      stops: parseWaypoints(m.waypoints).map((w) => w.address),
      flight: m.flight_number ? `${m.flight_number}${flightEta ? ` · ${flightEta}` : ""}` : null,
      ref: m.reference?.trim() || null,
      luggageOnly: !!m.luggage_only,
      bags: m.luggage_count,
      pax: m.pax_count,
    });
  }

  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstDow = (monthStart.getUTCDay() + 6) % 7; // 0 = Monday

  const isCurrentMonth = ym === currentYm;
  const todayDate = isCurrentMonth ? Number(todayKey.slice(8, 10)) : null;

  // Week index (Monday-first grid row) of "today" in the current month — used to
  // land week-view on today's week when the user hits "Today".
  const curMonthStart = new Date(`${currentYm}-01T12:00:00Z`);
  const curFirstDow = (curMonthStart.getUTCDay() + 6) % 7;
  const curToday = Number(todayKey.slice(8, 10));
  const todayWeekIdx = Math.floor((curFirstDow + curToday - 1) / 7);

  const title = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthStart);

  const data: CalendarData = {
    ym,
    title,
    daysInMonth,
    firstDow,
    todayDate,
    todayKey,
    isCurrentMonth,
    prevYm: shiftMonth(ym, -1),
    nextYm: shiftMonth(ym, 1),
    currentYm,
    todayWeekIdx,
    landWeek,
    initialView,
    initialWeek,
    entries,
  };

  return <DispatchCalendar data={data} />;
}
