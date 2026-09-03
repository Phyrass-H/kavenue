import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
const demoB = users?.users.find((u)=>u.email==="demo.business@pickup.local");
const demoD = users?.users.find((u)=>u.email==="demo.driver@pickup.local");
console.log("demo business auth:", demoB?.id, "| demo driver auth:", demoD?.id);

const { data: disp } = await db.from("dispatcher").select("id,business_id,name,email,auth_user_id").eq("auth_user_id", demoB?.id ?? "");
console.log("dispatcher row:", JSON.stringify(disp));
const { data: drv } = await db.from("driver").select("id,name,email,auth_user_id,vehicle_category,verified").eq("auth_user_id", demoD?.id ?? "");
console.log("driver row:", JSON.stringify(drv));

// a real mission of that business, to copy the column set from
const { data: tmpl } = await db.from("mission").select("*").eq("business_id", disp?.[0]?.business_id ?? "").limit(1);
console.log("\ntemplate mission columns:", tmpl?.[0] ? Object.keys(tmpl[0]).join(",") : "NONE");
console.log("\ntemplate row:", JSON.stringify(tmpl?.[0], null, 1));
