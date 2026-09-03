import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const r = await db.from("driver").select("id,name,email,auth_user_id").limit(10);
console.log("error:", r.error?.message ?? "none", "| count:", r.data?.length);
console.log(JSON.stringify(r.data, null, 1));
const c = await db.from("mission").select("driver_id").not("driver_id","is",null).limit(3);
console.log("missions with a driver:", JSON.stringify(c.data));
