// TEMPORARY Driver-side display fixture for the 2026-08-20 sweep. Three states
// the test data does not contain: a settled waiting spell with a STAMPED rate, a
// Business cancellation that also settled waiting (GAP A), and the Driver's own
// cancellation (GAP B). Manifest first; --undo restores the recorded prior values.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const M = ".local/probe/_s63-driver-manifest.json";
const DRIVER = "c3758a83-2e9b-4384-a32a-f335d80b490f"; // Marc Dubois = the dev-login Driver
const RATED   = "fd7aa388-9a90-4c94-bc71-1675bf32669c"; // completed, business, 17 min, rate NULL
const CANCEL  = "b91fabe8-e1e4-4a76-8ba5-7a5b0c0a4c07"; // placeholder, resolved below
const WALKON  = "2cf0a780-30d3-4930-8dfc-d6e9a5d66614"; // expired, no driver

const cols = "id,business_id,ceiling,waiting_minutes,waiting_rate,waiting_fee";
if (process.argv.includes("--undo")) {
  const m = JSON.parse(readFileSync(M, "utf8"));
  for (const p of m.prior) {
    const { error } = await db.from("mission").update({
      waiting_minutes: p.waiting_minutes, waiting_rate: p.waiting_rate, waiting_fee: p.waiting_fee,
    }).eq("id", p.id);
    console.log("restored", p.id.slice(0,8), error?.message ?? "ok");
  }
  if (m.cancellationId) {
    const { error } = await db.from("mission_cancellation").delete().eq("id", m.cancellationId);
    console.log("deleted cancellation", m.cancellationId.slice(0,8), error?.message ?? "ok");
  }
  const { count } = await db.from("mission").select("id",{count:"exact",head:true});
  console.log("missions baseline:", count, "(expected", m.baseline + ")");
  process.exit(0);
}

const { count: baseline } = await db.from("mission").select("id",{count:"exact",head:true});
// The Driver's own cancelled-on-them trip, whatever its id.
const { data: canc } = await db.from("mission").select(cols)
  .eq("driver_id", DRIVER).eq("status","cancelled").limit(1);
const cancelId = canc?.[0]?.id ?? CANCEL;
const { data: prior } = await db.from("mission").select(cols).in("id", [RATED, cancelId]);
const { data: walk } = await db.from("mission").select("id,business_id,ceiling").eq("id", WALKON).single();

writeFileSync(M, JSON.stringify({ baseline, prior, cancellationId: null }, null, 1));

// 1. A stamped rate on a settled wait — business class, 17 × 0,75 = 12,75.
await db.from("mission").update({ waiting_rate: 0.75, waiting_fee: 12.75 }).eq("id", RATED);
// 2. GAP A — waiting settled onto a trip the Business then cancelled (business_cancel
//    reads mission_waiting() from 'arrived', so this is a real shape).
await db.from("mission").update({ waiting_minutes: 13, waiting_rate: 0.75, waiting_fee: 9.75 }).eq("id", cancelId);
// 3. GAP B — the Driver's own cancellation.
const { data: ins, error } = await db.from("mission_cancellation").insert({
  mission_id: walk.id, business_id: walk.business_id, party: "driver", actor_driver_id: DRIVER,
  kind: "driver_cancel", reason: "Vehicle broke down", fee_pct: 100,
  fee_amount: walk.ceiling, fare_snapshot: walk.ceiling, hours_before_pickup: 2, resulted_in: "repooled",
}).select("id").single();
if (error) console.log("insert failed:", error.message);
writeFileSync(M, JSON.stringify({ baseline, prior, cancellationId: ins?.id ?? null }, null, 1));
console.log("rated:", RATED.slice(0,8), "| gapA:", cancelId.slice(0,8), "| gapB cancellation:", ins?.id?.slice(0,8), "on", walk.id.slice(0,8), "@", walk.ceiling);
console.log("prior values recorded:", JSON.stringify(prior));
