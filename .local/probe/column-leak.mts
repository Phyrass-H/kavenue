// S72 — THE COLUMN LEAK. Does either side read the other's money through
// PostgREST with its own session token?
//
// docs/06 §3 says "The Business never sees driver_net or the Driver-side rate".
// That sentence is enforced today only by which columns the UI chooses to
// render. RLS is row-level; nothing stops a token asking for the columns.
//
// This file is the BEFORE and the AFTER. Each check prints `LEAK OPEN` or
// `closed`, so the same run, before and after the migration, is the evidence.
// A policy change nobody watched fail is not evidence ([[d97]], S71 meta-lesson).
//
//   npx tsx .local/probe/column-leak.mts
//
// Creates ONE tagged mission + ONE ledger row, reads them from three sessions,
// and deletes both by recorded id. Asserts the mission count returns to baseline.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// ⚑ NOT A LITERAL ANY MORE. This password was written in plain text in
// app/api/dev-login/route.ts, which is a TRACKED file in a PUBLIC repo — so it
// has been readable on GitHub since commit 98a89ff, and it opened 6 real
// accounts on the live Supabase project including admin@kavenue.fr. It comes
// from .env.local now, which is git-ignored. Set DEV_PASSWORD there.
const DEV_PASSWORD = env.DEV_PASSWORD;
if (!DEV_PASSWORD) throw new Error("DEV_PASSWORD is not in .env.local — the probe accounts cannot be signed in to");
const TAG = "CLEAK";

let open = 0, closed = 0, broken = 0;

/** A column that must NOT be reachable. */
function leak(name: string, value: unknown, error: { message: string } | null) {
  if (error) { closed++; console.log(`closed     ${name}   (${error.message.slice(0, 60)})`); return; }
  if (value == null) { closed++; console.log(`closed     ${name}   (null / no row)`); return; }
  open++; console.log(`LEAK OPEN  ${name}   = ${JSON.stringify(value)}`);
}

/** A read the app itself depends on. Must keep working. */
function legit(name: string, ok: boolean, detail = "") {
  if (ok) { console.log(`ok         ${name}${detail ? "   " + detail : ""}`); }
  else { broken++; console.log(`BROKEN     ${name}${detail ? "   " + detail : ""}`); }
}

// ── the cast ────────────────────────────────────────────────────────────────
const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
if (!users) throw new Error("auth.admin.listUsers returned no data — is SUPABASE_SERVICE_ROLE_KEY the service role key?");
const bizAuth = users.users.find((u) => u.email === "demo.business@pickup.local");
const drvAuth = users.users.find((u) => u.email === "demo.driver@pickup.local");
if (!bizAuth || !drvAuth) throw new Error("probe accounts missing — run .local/seed/seed-probe-accounts.mts");

const { data: disp } = await db.from("dispatcher").select("id,business_id").eq("auth_user_id", bizAuth.id).limit(1);
const dispatcher = disp?.[0];
if (!dispatcher) throw new Error(`no dispatcher row for demo.business@pickup.local (auth_user_id ${bizAuth.id}) — run .local/seed/seed-probe-accounts.mts`);
const { data: dRows } = await db.from("driver").select("id").eq("auth_user_id", drvAuth.id).limit(1);
const driver = dRows?.[0];
if (!driver) throw new Error(`no driver row for demo.driver@pickup.local (auth_user_id ${drvAuth.id}) — run .local/seed/seed-probe-accounts.mts`);
const { data: vRows } = await db.from("vehicle").select("category").eq("driver_id", driver.id).limit(1);
const car = vRows?.[0];
if (!car) throw new Error(`driver ${driver.id} has no vehicle — this probe copies the category off one to build a matching trip`);
const { data: tmplRows } = await db.from("mission").select("*").eq("business_id", dispatcher.business_id).limit(1);
const tmpl = tmplRows?.[0];
if (!tmpl) throw new Error(`business ${dispatcher.business_id} has no mission to copy as the template row — seed one with GET /api/seed`);

const baseline = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;

// ── one pooled trip, priced, that the Driver has NOT accepted ───────────────
const id = crypto.randomUUID();
const { error: insErr } = await db.from("mission").insert({
  ...tmpl, id,
  business_id: dispatcher.business_id, dispatcher_id: dispatcher.id,
  driver_id: null, status: "pooled", reference: TAG,
  category: car.category, required_body_type: null, required_make: null, required_model: null,
  luggage_only: false,
  pickup_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
  pooled_at: new Date(Date.now() - 3_600_000).toISOString(),
  accepted_at: null, confirmed_at: null, checked_in_at: null,
  ceiling: 100, base_fare: null, pdp_start: 30, pdp_step: 0, pdp_interval: 0, speed_win: false,
  accepted_fare: null,
  // the four snapshots — the whole point of the probe
  commission_business_rate: 0.125, commission_driver_rate: 0.10,
  commission_vat_rate: 0.20, transport_vat_rate: 0.10,
  cancelled_by: null, cancelled_at: null, cancellation_fee: null, cancellation_reason: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, stops_reached: 0, passenger_name: `${TAG} probe`, passenger_names: null,
});
if (insErr) throw new Error("insert mission: " + insErr.message);

// ⚑ A SECOND TRIP, because § 5 spends the first one. The leak tests ACCEPT and
// then CANCEL trip A to make the RPCs actually return a row; the "does the
// wrapper still work" test then needs a trip that is still pooled.
const idB = crypto.randomUUID();
const { error: insErrB } = await db.from("mission").insert({
  ...tmpl, id: idB,
  business_id: dispatcher.business_id, dispatcher_id: dispatcher.id,
  driver_id: null, status: "pooled", reference: TAG,
  category: car.category, required_body_type: null, required_make: null, required_model: null,
  luggage_only: false,
  pickup_at: new Date(Date.now() + 26 * 3_600_000).toISOString(),
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
  pooled_at: new Date(Date.now() - 3_600_000).toISOString(),
  accepted_at: null, confirmed_at: null, checked_in_at: null,
  ceiling: 100, base_fare: null, pdp_start: 30, pdp_step: 0, pdp_interval: 0, speed_win: false,
  accepted_fare: null,
  commission_business_rate: 0.125, commission_driver_rate: 0.10,
  commission_vat_rate: 0.20, transport_vat_rate: 0.10,
  cancelled_by: null, cancelled_at: null, cancellation_fee: null, cancellation_reason: null,
  no_show: false, no_show_at: null, no_show_by: null,
  waiting_from: null, waiting_to: null, waiting_minutes: null, waiting_rate: null, waiting_fee: null,
  info_edited_at: null, stops_reached: 0, passenger_name: `${TAG} probe B`, passenger_names: null,
});
if (insErrB) throw new Error("insert mission B: " + insErrB.message);

// ── and the ledger row that table has never had ─────────────────────────────
// ⚑ ledger_transaction is empty and has no writer. "No rows" is not proof a
// policy is shut ([[d108]]); the row is planted so the read can be watched, and
// deleted below.
const { data: led, error: ledErr } = await db.from("ledger_transaction").insert({
  mission_id: id, gross_fare: 100, commission_pct: 10, commission_amount: 12, driver_net: 88,
}).select("id").single();
if (ledErr) throw new Error("insert ledger: " + ledErr.message);
if (!led) throw new Error(`the ledger insert for mission ${id} reported no error and returned no row — there is nothing planted to read`);

// ── three sessions ──────────────────────────────────────────────────────────
const asBusiness = createClient(URL, ANON, { auth: { persistSession: false } });
const b1 = await asBusiness.auth.signInWithPassword({ email: "demo.business@pickup.local", password: DEV_PASSWORD });
if (b1.error) throw new Error("business sign-in: " + b1.error.message);
const asDriver = createClient(URL, ANON, { auth: { persistSession: false } });
const d1 = await asDriver.auth.signInWithPassword({ email: "demo.driver@pickup.local", password: DEV_PASSWORD });
if (d1.error) throw new Error("driver sign-in: " + d1.error.message);

console.log(`\n── 1 · the Business reading the Driver's side (docs/06 §3) ──`);
{
  const r = await asBusiness.from("mission").select("commission_driver_rate").eq("id", id).maybeSingle();
  leak("business → mission.commission_driver_rate", r.data?.commission_driver_rate, r.error);
}
{
  const r = await asBusiness.from("mission").select("*").eq("id", id).maybeSingle();
  leak("business → mission.select('*') carries the driver rate", (r.data as never as Record<string, unknown>)?.commission_driver_rate, r.error);
}
{
  const r = await asBusiness.from("ledger_transaction").select("driver_net,commission_pct").eq("mission_id", id).maybeSingle();
  leak("business → ledger_transaction.driver_net", r.data?.driver_net, r.error);
}
{
  const r = await asBusiness.from("commission_rate").select("driver_rate_ht").limit(1).maybeSingle();
  leak("business → commission_rate.driver_rate_ht (the live card)", r.data?.driver_rate_ht, r.error);
}

console.log(`\n── 2 · the Driver reading the Business's side, on a trip they have NOT taken ──`);
{
  const r = await asDriver.from("mission").select("ceiling").eq("id", id).maybeSingle();
  leak("driver → mission.ceiling on a POOLED trip", r.data?.ceiling, r.error);
}
{
  const r = await asDriver.from("mission").select("commission_business_rate").eq("id", id).maybeSingle();
  leak("driver → mission.commission_business_rate on a POOLED trip", r.data?.commission_business_rate, r.error);
}
{
  const r = await asDriver.from("mission").select("*").eq("id", id).maybeSingle();
  const row = r.data as never as Record<string, unknown> | null;
  leak("driver → mission.select('*') carries the ceiling", row?.ceiling, r.error);
  leak("driver → mission.select('*') carries the business rate", row?.commission_business_rate, r.error);
}
{
  const r = await asDriver.from("commission_rate").select("business_rate_ht").limit(1).maybeSingle();
  leak("driver → commission_rate.business_rate_ht (the live card)", r.data?.business_rate_ht, r.error);
}
{
  // ⚑ THE CEILING'S BACK DOOR. Masking mission.ceiling is decoration while a
  // Driver can read the price card and recompute it — docs/06 §4 has the
  // Business posting at Kavenue's recommended Ceiling most of the time.
  const r = await asDriver.from("rate_card").select("ceiling_base,ceiling_per_km").limit(1).maybeSingle();
  leak("driver → rate_card.ceiling_base (recompute the Ceiling)", r.data?.ceiling_base, r.error);
}
{
  // ...and the same number through the function, which is SECURITY INVOKER and
  // therefore shuts with the table. `returns table` → an empty array, not null.
  const r = await asDriver.rpc("mission_price", {
    p_tier: "business", p_body: "sedan", p_km: 30, p_night: false,
  });
  const row = Array.isArray(r.data) ? r.data[0] : null;
  leak("driver → mission_price() ceiling_price", row?.ceiling_price, r.error);
}

console.log(`\n── 3 · what each side is SUPPOSED to read — must keep working ──`);
// ⚑ THESE ASK `mission_read`, NOT `mission`. Until part 3 they asked the base
// table, which is what the app itself did — and after part 3 they reported four
// BROKEN lines for a database behaving exactly as designed. A permanently-red
// check is one a future session learns to ignore ([[d108]]), so they were moved
// to the door the app actually uses, and the base table got its own assertion
// below: it must now REFUSE.
{
  const r = await asBusiness.from("mission_read" as never)
    .select("id,ceiling,accepted_fare,commission_business_rate,commission_vat_rate,transport_vat_rate")
    .eq("id", id).maybeSingle();
  const row = r.data as never as Record<string, unknown> | null;
  legit("business → its own Ceiling + business rate", !r.error && row?.commission_business_rate != null,
        r.error?.message ?? `ceiling=${row?.ceiling} rate=${row?.commission_business_rate}`);
}
{
  const r = await asDriver.from("mission_read" as never)
    .select("id,accepted_fare,commission_driver_rate,commission_vat_rate,transport_vat_rate")
    .eq("id", id).maybeSingle();
  const row = r.data as never as Record<string, unknown> | null;
  legit("driver → its own driver rate on a pooled trip", !r.error && row?.commission_driver_rate != null,
        r.error?.message ?? `rate=${row?.commission_driver_rate}`);
}
{
  // The Pool page itself: select("*") over pooled rows, now through the view.
  const r = await asDriver.from("mission_read" as never).select("*").eq("status", "pooled").eq("id", id);
  legit("driver → the Pool read (select '*', status=pooled) still lists it", !r.error && (r.data?.length ?? 0) === 1,
        r.error?.message ?? `${r.data?.length ?? 0} row(s)`);
}
{
  // ⚑ AND THE BASE TABLE MUST NOW REFUSE. This is the assertion part 3 exists
  // for: a column-level revoke against a table-wide grant is a NO-OP that
  // returns success, so "the migration ran" proves nothing. Only this does.
  const b = await asBusiness.from("mission").select("commission_driver_rate").eq("id", id).maybeSingle();
  const d = await asDriver.from("mission").select("ceiling").eq("id", id).maybeSingle();
  legit("the base table refuses both sides outright (part 3 actually landed)",
        /permission denied/i.test(b.error?.message ?? "") && /permission denied/i.test(d.error?.message ?? ""),
        `business: ${b.error?.message ?? "ALLOWED — part 3 is a no-op"} · driver: ${d.error?.message ?? "ALLOWED — part 3 is a no-op"}`);
}
{
  // The Business still prices a trip; only the Driver-side rate is withheld.
  const ok_ = await asBusiness.from("commission_rate").select("business_rate_ht,fee_vat_rate").limit(1).maybeSingle();
  legit("business → the rate card still prices a trip", !ok_.error && ok_.data?.business_rate_ht != null,
        ok_.error?.message ?? `business_rate_ht=${ok_.data?.business_rate_ht}`);
}
{
  // ⚑ `revoke update (guest_ready_at)` (2026-07-19_no_show_airport_label.sql) is
  // the same shape as the revoke that did nothing — and is the ONE column ACL
  // this repo already believed in. Checked, not assumed, either way.
  //
  // ⚑ AND "NO ERROR" IS NOT A WRITE. PostgREST returns SUCCESS WITH ZERO ROWS
  //   when RLS matches nothing, so the absence of an error proves nothing at all
  //   — the S71 lesson in its exact original form. The row is read back with the
  //   service role, and only a CHANGED value counts as the revoke being inert.
  //
  // ⚑ AND AS THE BUSINESS, NOT THE DRIVER. The 2026-07-19 header says what that
  //   revoke is for in so many words: "a Business could PATCH it forward via
  //   PostgREST and hold the no-show gate shut indefinitely". The Business is the
  //   party with an UPDATE policy (`p_mission_business_update`) — tried as a
  //   Driver it is refused by RLS long before any column ACL is consulted, which
  //   is a pass that proves nothing.
  const stamp = "2031-01-02T03:04:05.000Z";
  const before = await db.from("mission").select("guest_ready_at").eq("id", id).maybeSingle();
  const r = await asBusiness.from("mission").update({ guest_ready_at: stamp }).eq("id", id);
  const after = await db.from("mission").select("guest_ready_at").eq("id", id).maybeSingle();
  const landed = after.data?.guest_ready_at != null &&
                 after.data?.guest_ready_at !== before.data?.guest_ready_at;
  legit("the guest_ready_at guard still refuses a Business PATCH (revoke or trigger — it holds)",
        !landed,
        landed
          ? `⚑ THE WRITE LANDED (${before.data?.guest_ready_at ?? "null"} → ${after.data?.guest_ready_at}) — that revoke is inert too`
          : `refused (${r.error?.message ?? "0 rows, RLS"}); column unchanged at ${after.data?.guest_ready_at ?? "null"}`);
}

console.log(`\n── 4 · the view itself ──`);
{
  // ⚑ THE DRIFT GUARD. `mission_read` lists its 75 columns explicitly, so a
  // column added to `mission` later does NOT appear and a screen reading it
  // through the view silently gets `undefined`. Compared against the TABLE as
  // the service role sees it, which is the only copy that cannot be stale.
  //
  // ⚑ READ AS THE BUSINESS, NOT THE SERVICE ROLE. `mission_read`'s WHERE is
  //   written in terms of app_role() / current_business_id() / current_driver_id(),
  //   all of which are NULL for the service role — so the service role sees ZERO
  //   rows through the view and this check would have compared against nothing
  //   and passed. (The service role has no business reading the view; it reads
  //   the table.) A masked column still comes back as a KEY with a null value,
  //   so the column SET is intact from any session that can see the row.
  const { data: tRow } = await db.from("mission").select("*").eq("id", id).maybeSingle();
  const { data: vRow, error: vErr } = await asBusiness.from("mission_read" as never).select("*").eq("id", id).maybeSingle();
  if (vErr) {
    broken++;
    console.log(`BROKEN     mission_read is not there yet   (${vErr.message.slice(0, 70)})`);
    console.log(`           → run docs/migrations/2026-08-30_money_column_walls_1_view.sql`);
  } else {
    // ⚑ The column lists come from a SAMPLE ROW, so no row means no columns —
    // and `Object.keys(null as object)` throws at run time anyway. With both
    // empty the comparison below would report "0 missing, 0 extra" and read as
    // a clean bill of health for a check that never ran.
    if (!tRow || !vRow) throw new Error(
      "cannot compare the columns: " +
      `${!tRow ? "mission" : "mission_read"} returned no sample row`);
    const tc = Object.keys(tRow).sort();
    const vc = Object.keys(vRow).sort();
    const missing = tc.filter((c) => !vc.includes(c));
    const extra = vc.filter((c) => !tc.includes(c));
    legit("mission_read carries every mission column",
          missing.length === 0 && extra.length === 0,
          missing.length || extra.length
            ? `missing: [${missing.join(", ")}]  extra: [${extra.join(", ")}]`
            : `${vc.length} columns`);
  }
}
{
  // The masks, read through the view by each session.
  const b = await asBusiness.from("mission_read" as never).select("*").eq("id", id).maybeSingle();
  const bRow = b.data as never as Record<string, unknown> | null;
  if (b.error) { broken++; console.log(`BROKEN     business → mission_read   (${b.error.message.slice(0, 60)})`); }
  else {
    leak("business → mission_read.commission_driver_rate", bRow?.commission_driver_rate, null);
    legit("business → mission_read keeps its OWN rate + Ceiling",
          bRow?.commission_business_rate != null && bRow?.ceiling != null,
          `ceiling=${bRow?.ceiling} rate=${bRow?.commission_business_rate}`);
  }

  const d = await asDriver.from("mission_read" as never).select("*").eq("id", id).maybeSingle();
  const dRow = d.data as never as Record<string, unknown> | null;
  if (d.error) { broken++; console.log(`BROKEN     driver → mission_read   (${d.error.message.slice(0, 60)})`); }
  else {
    leak("driver → mission_read.ceiling on a POOLED trip", dRow?.ceiling, null);
    leak("driver → mission_read.pdp_start on a POOLED trip", dRow?.pdp_start, null);
    leak("driver → mission_read.commission_business_rate", dRow?.commission_business_rate, null);
    legit("driver → mission_read keeps its OWN rate",
          dRow?.commission_driver_rate != null, `rate=${dRow?.commission_driver_rate}`);
    legit("driver → mission_read still lists the pooled trip", dRow != null);
  }
}

console.log(`\n── 5 · the OTHER channel: SECURITY DEFINER RPCs returning a whole mission ──`);
{
  // ⚑ A DEFINER FUNCTION'S COMPOSITE RETURN IS NOT SUBJECT TO COLUMN PRIVILEGES,
  // so `returns mission` handed the whole row back THROUGH the walls. Nine of
  // them. Closed in 2026-08-31g by revoking EXECUTE on the inner functions and
  // giving the browser roles `*_call` wrappers that return `void`.
  //
  // ⚑ THE INNER ONE IS TRIED FIRST AND MUST BE REFUSED. Trying only the wrapper
  // would prove nothing: a wrapper returning void is trivially quiet, and the
  // leak lives in the function still sitting there beside it.
  const r = await asBusiness.rpc("business_cancel_mission" as never, {
    p_mission_id: id, p_reason: "CLEAK probe", p_fare_snapshot: 30,
  } as never);
  const row = r.data as never as Record<string, unknown> | null;
  leak("business → business_cancel_mission() returns commission_driver_rate",
       row?.commission_driver_rate, r.error);

  // ⚑ THE DRIVER'S SIDE OF THE SAME DOOR, ON A TRIP THEY ACTUALLY HOLD. The
  // first attempt used `board_guest` on a POOLED trip and came back "Not your
  // mission" — which the probe scored as `closed` while proving nothing at all.
  // `accept_mission` is the honest one: it returns the row it just gave them,
  // Ceiling included, and it is the single most-called RPC in the app.
  const a = await asDriver.rpc("accept_mission" as never, { p_mission_id: idB } as never);
  const arow = a.data as never as Record<string, unknown> | null;
  leak("driver → accept_mission() returns the Ceiling", arow?.ceiling, a.error);
  leak("driver → accept_mission() returns commission_business_rate", arow?.commission_business_rate, a.error);

  // ...and the wrapper must still DO the thing, or nine buttons are dead. Trip A
  // is this probe's own and is deleted below either way.
  const w = await asBusiness.rpc("business_cancel_mission_call" as never, {
    p_mission_id: id, p_reason: "CLEAK probe", p_fare_snapshot: 30,
  } as never);
  const { data: afterCancel } = await db.from("mission").select("status,cancelled_by").eq("id", id).maybeSingle();
  legit("the _call wrapper still cancels the trip (and returns nothing)",
        !w.error && w.data == null && afterCancel?.status === "cancelled",
        w.error?.message ?? `status=${afterCancel?.status} by=${afterCancel?.cancelled_by} returned=${JSON.stringify(w.data)}`);

  // ⚑ AND THE DRIVER MUST STILL BE ABLE TO ACCEPT. Once EXECUTE on the inner
  // `accept_mission` is revoked, the leak test above stops accepting trip B —
  // so the Driver-side cancel below had nothing to cancel and reported "Not
  // your mission", a BROKEN line that was the probe's own sequencing rather
  // than a fault. Accepting through the WRAPPER is both the fix and the single
  // most important assertion in this file: it is the button every Driver taps.
  //
  // ⚑ AND `p_fare` IS PASSED ON PURPOSE. The first version of this check omitted
  // it, `accepted_fare` came back NULL, and that looked like a bug in the
  // wrapper — it was the probe not behaving like the app, which always computes
  // the fare server-side and hands it over (docs/06 §9, the frozen contract
  // price). Passing it is also the only way this asserts what matters: nine
  // wrapper signatures were hand-written, and a DROPPED SECOND PARAMETER would
  // silently stop freezing the fare on every accept in the marketplace.
  const ac = await asDriver.rpc("accept_mission_call" as never, { p_mission_id: idB, p_fare: 55 } as never);
  const { data: afterAccept } = await db.from("mission").select("status,driver_id,accepted_fare").eq("id", idB).maybeSingle();
  legit("the Driver can still ACCEPT through the wrapper, and p_fare still freezes",
        !ac.error && ac.data == null && afterAccept?.driver_id === driver.id &&
          Number(afterAccept?.accepted_fare) === 55,
        ac.error?.message ?? `status=${afterAccept?.status} fare=${afterAccept?.accepted_fare} (want 55) returned=${JSON.stringify(ac.data)}`);

  // The Driver-side cancel wrapper too, on trip B — which they now hold.
  const wd = await asDriver.rpc("driver_cancel_mission_call" as never, {
    p_mission_id: idB, p_reason: "CLEAK probe", p_fare_snapshot: 30,
  } as never);
  const { data: afterB } = await db.from("mission").select("status").eq("id", idB).maybeSingle();
  legit("the Driver's _call wrapper works too, and errors still propagate",
        !wd.error && wd.data == null && afterB?.status !== "accepted",
        wd.error?.message ?? `status=${afterB?.status} returned=${JSON.stringify(wd.data)}`);
}

console.log(`\n── 6 · the guest_ready_at revoke, made real (2026-08-31f) ──`);
{
  // ⚑ THE ORDER OF THE TWO CHECKS IS THE EVIDENCE. Postgres tests column
  // privileges BEFORE any row trigger fires. Before 31f this came back with the
  // TRIGGER's sentence, which proved the privilege check had let it through and
  // the July revoke was inert. It must now say "permission denied" instead.
  const stamp = "2031-01-02T03:04:05.000Z";
  const before = await db.from("mission").select("guest_ready_at").eq("id", id).maybeSingle();
  const r = await asBusiness.from("mission").update({ guest_ready_at: stamp }).eq("id", id);
  const after = await db.from("mission").select("guest_ready_at").eq("id", id).maybeSingle();
  const landed = after.data?.guest_ready_at !== before.data?.guest_ready_at;
  legit("the write is refused BY THE PRIVILEGE, not only by the trigger",
        !landed && /permission denied/i.test(r.error?.message ?? ""),
        landed ? `⚑ THE WRITE LANDED → ${after.data?.guest_ready_at}`
               : (r.error?.message ?? "no error, 0 rows") +
                 (/permission denied/i.test(r.error?.message ?? "") ? "" : "  ⚑ still the trigger, not the grant"));
}
{
  // And the Business must still be able to edit its own trips at all.
  const r = await asBusiness.from("mission").update({ comment: "CLEAK probe" }).eq("id", id).select("id");
  legit("a Business can still edit its own trip", !r.error && (r.data?.length ?? 0) === 1,
        r.error?.message ?? `${r.data?.length ?? 0} row(s) updated`);
}

// ── clean up, by recorded id ────────────────────────────────────────────────
await db.from("ledger_transaction").delete().eq("id", led.id);
await db.from("mission").delete().in("id", [id, idB]);
const after = (await db.from("mission").select("*", { count: "exact", head: true })).count ?? 0;
const { count: ledLeft } = await db.from("ledger_transaction").select("*", { count: "exact", head: true }).eq("mission_id", id);

console.log(`\n${open} LEAK(S) OPEN · ${closed} closed · ${broken} broken`);
console.log(`cleanup: mission ${baseline} → ${after} ${after === baseline ? "✓" : "✗ LEFT A ROW"} · ledger rows left for this mission: ${ledLeft ?? "?"}`);
if (after !== baseline || (ledLeft ?? 0) !== 0) process.exitCode = 1;
