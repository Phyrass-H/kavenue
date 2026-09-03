import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const TAG = "S66RECLAIM";

if (process.argv.includes("--undo")) {
  const { data } = await db.from("mission").select("id").eq("reference", TAG);
  for (const m of data ?? []) {
    await db.from("mission_event").delete().eq("mission_id", m.id);
    await db.from("status_event").delete().eq("mission_id", m.id);
  }
  const r = await db.from("mission").delete().eq("reference", TAG).select("id");
  console.log("removed", r.data?.length ?? 0, "trips", r.error?.message ?? "");
  process.exit(0);
}

// the demo Business the dev server signs in as
// ⚑ ONE lookup for both fixtures. This file called `listUsers` twice and bound
// the result to `users` both times — legal in a script nobody typechecked, and a
// redeclaration error the moment one did. The second call asked for 500, so 500
// is what both searches now use: a strictly wider page, never a narrower one.
const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
const demoB = users?.users.find((u)=>u.email==="demo.business@pickup.local");
const { data: disp } = await db.from("dispatcher").select("business_id").eq("auth_user_id", demoB?.id ?? "").single();
const businessId = disp?.business_id;
// ⚑ RESOLVED, NEVER HARDCODED ([[d97]] / S69). This held a literal driver id
// and the 2026-08-26 bleach deleted that Driver, so the file was dead on its
// next run. The bleach removes every account a probe depends on — look them up.
const demoD = users?.users.find((u) => u.email === "demo.driver@pickup.local");
if (!demoD) throw new Error("demo.driver@pickup.local is missing — run .local/seed/seed-probe-accounts.mts");
const { data: drvRow } = await db.from("driver").select("id").eq("auth_user_id", demoD.id).single();
if (!drvRow) throw new Error(`no driver row for demo.driver@pickup.local (auth user ${demoD.id}) — run .local/seed/seed-probe-accounts.mts`);
const driverId = drvRow.id;

// copy the column set from a real trip so nothing NOT NULL is missed
const { data: tmpl } = await db.from("mission").select("*").eq("business_id", businessId).eq("category","business").limit(1).single();

const now = Date.now();
const rows = [2.5, 1.5, 0.5].map((h, i) => {
  // ⚑ `accepted_fare` is stripped, never inherited ([[d97]]). `tmpl` is a REAL
  // mission and since the S68 reseed real missions carry a frozen price that
  // belongs to a different trip.
  const m: any = { ...tmpl, accepted_fare: null };
  delete m.id; delete m.created_at;
  return { ...m,
    business_id: businessId, reference: TAG,
    pickup_at: new Date(now + h * 3.6e6).toISOString(),
    status: "confirmed", driver_id: driverId,
    accepted_at: new Date(now - 3.6e6).toISOString(),
    confirmed_at: new Date(now - 3.6e6).toISOString(),
    checked_in_at: null, no_show: false, close_answer: null,
    stops_reached: 0, cancelled_at: null, cancelled_by: null,
    waiting_from: null, waiting_to: null, waiting_minutes: null,
    pickup_address: ["1055 Chemin De Rabiac-Estagnol, 06600 Antibes, France",
                     "19 Rue Costes et Bellonte, 06200 Nice, France",
                     "58 Bd de la Croisette, 06400 Cannes, France"][i],
    dropoff_address: "La Riviera, 06000 Nice, France",
  };
});
const r = await db.from("mission").insert(rows).select("id,pickup_at,status");
if (r.error) { console.log("ERR", r.error.message); process.exit(1); }
for (const m of r.data ?? []) {
  const h = (Date.parse(m.pickup_at) - now)/3.6e6;
  console.log(`seeded T-${h.toFixed(1)}h  ${m.status}  ${m.id}`);
}
