// Wipe trips + their children + the log, keeping the people. For re-running the
// trip seed without paying the auth-user cost again.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
for (const t of ["mission_event","status_event","mission_cancellation","mission_amendment","mission_release","mission_info_change","booking_voucher","mission"]) {
  const { error } = await db.from(t).delete().not("id","is",null);
  const { count } = await db.from(t).select("*", { count:"exact", head:true });
  console.log(`${error ? "FAIL "+error.message : "ok  "} ${t.padEnd(22)} → ${count}`);
}
