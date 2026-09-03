// TEMPORARY display fixture for the 2026-08-20 sweep. Flips `night_applied` on
// one future trip and inserts one `driver_cancel` row, so the two states that do
// not exist in the test data can be SEEN. Writes a manifest first; `--undo`
// removes exactly what it created, by recorded id, and nothing else.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const MANIFEST = ".local/probe/_s63-manifest.json";
const undo = process.argv.includes("--undo");

const baseline = async () => (await db.from("mission").select("id",{count:"exact",head:true})).count;

if (undo) {
  const m = JSON.parse(readFileSync(MANIFEST,"utf8"));
  if (m.nightMissionId) {
    const { error } = await db.from("mission").update({ night_applied: false }).eq("id", m.nightMissionId);
    console.log("night_applied reverted on", m.nightMissionId, error?.message ?? "ok");
  }
  if (m.cancellationId) {
    const { error } = await db.from("mission_cancellation").delete().eq("id", m.cancellationId);
    console.log("cancellation row deleted", m.cancellationId, error?.message ?? "ok");
  }
  console.log("missions baseline:", await baseline(), "(expected", m.baseline + ")");
  process.exit(0);
}

const before = await baseline();
// Every trip in the test data is in the past, so both states are verified on the
// ARCHIVE row — which is the `.dxh-when` variant of the date cell, the one whose
// CSS actually needed proving.
const { data: recent } = await db.from("mission").select("id,reference,pickup_at,status,business_id,ceiling,driver_id")
  .lt("pickup_at", new Date().toISOString()).neq("status","draft").order("pickup_at",{ascending:false}).limit(6);
const target = recent?.[0];
// A trip nobody filled is the honest shape for a walk: after a driver cancel the
// mission is back in the Pool and driver_id is cleared.
const walkTarget = (recent ?? []).find((m) => !m.driver_id && m.id !== target?.id) ?? recent?.[1];
if (!target || !walkTarget) { console.log("no past mission to use"); process.exit(1); }

writeFileSync(MANIFEST, JSON.stringify({ baseline: before, nightMissionId: target.id, walkMissionId: walkTarget.id, cancellationId: null }, null, 1));

await db.from("mission").update({ night_applied: true }).eq("id", target.id);
const { data: ins, error } = await db.from("mission_cancellation").insert({
  mission_id: walkTarget.id,
  business_id: walkTarget.business_id,
  party: "driver",
  kind: "driver_cancel",
  reason: "Vehicle broke down",
  fee_pct: 100,
  fee_amount: walkTarget.ceiling,
  fare_snapshot: walkTarget.ceiling,
  hours_before_pickup: -0.3, // a Driver who walked 18 min AFTER the pickup
  resulted_in: "repooled",
}).select("id").single();
if (error) { console.log("insert failed:", error.message); }
writeFileSync(MANIFEST, JSON.stringify({ baseline: before, nightMissionId: target.id, walkMissionId: walkTarget.id, cancellationId: ins?.id ?? null }, null, 1));
console.log("night on:", target.id, target.pickup_at);
console.log("walk on :", walkTarget.id, "cancellation", ins?.id);
console.log("baseline:", before);
