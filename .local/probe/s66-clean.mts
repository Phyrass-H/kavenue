import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
for (const tag of ["S66EVENT","S66RACE","S66VERIFY","S66RECLAIM"]) {
  const { data: ms } = await db.from("mission").select("id").eq("reference", tag);
  for (const m of ms ?? []) {
    await db.from("mission_event").delete().eq("mission_id", m.id);
    await db.from("status_event").delete().eq("mission_id", m.id);
    await db.from("mission_cancellation").delete().eq("mission_id", m.id);
    await db.from("mission_guest_contact").delete().eq("mission_id", m.id);
  }
  const r = await db.from("mission").delete().eq("reference", tag).select("id");
  if (r.error) throw new Error(`deleting the ${tag} missions: ${r.error.message}`);
  if ((r.data?.length ?? 0) > 0) console.log(tag, "removed", r.data.length);
}
await db.from("driver").update({ reliability_marks: 0 }).neq("reliability_marks", 0);
const c = await db.from("mission").select("id", { count:"exact", head:true });
const e = await db.from("mission_event").select("id", { count:"exact", head:true });
console.log("mission:", c.count, "(baseline 280) · mission_event:", e.count);
