import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
for (const t of ["mission","mission_cancellation","status_event","mission_release","mission_amendment"]) {
  const { count } = await db.from(t).select("*", { count: "exact", head: true });
  console.log(`${t}: ${count}`);
}
const { data: stragglers } = await db.from("mission").select("id,reference,passenger_name").or("reference.like.H2%,passenger_name.like.H2%");
console.log("tagged stragglers:", stragglers?.length ?? 0, JSON.stringify(stragglers ?? []));
