// Remove the orphans left by the failed run: anything attached to a
// seed.*@kavenue.test auth user. The real Business, its real Dispatcher and the
// demo Driver use different emails, so this can't reach them.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/Users/phyrasshaidar/Documents/02_Cactus/Kavenue/Kavenue_project_dev/.env.local","utf8")
  .split("\n").filter(l=>l.trim()&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
const seeded = users.users.filter(u => (u.email ?? "").endsWith("@kavenue.test"));
console.log(`seeded auth users: ${seeded.length}`);
const ids = seeded.map(u => u.id);
if (!ids.length) { console.log("nothing to recover"); process.exit(0); }

const { data: desks } = await db.from("dispatcher").select("id, name").in("auth_user_id", ids);
const { data: drvs }  = await db.from("driver").select("id, first_name").in("auth_user_id", ids);
console.log(`dispatchers: ${desks?.length ?? 0}  drivers: ${drvs?.length ?? 0}`);

if (desks?.length) {
  const { count } = await db.from("mission").select("id",{count:"exact",head:true}).in("dispatcher_id", desks.map(d=>d.id));
  console.log(`missions on seeded desks: ${count}`);
  const { error } = await db.from("mission").delete().in("dispatcher_id", desks.map(d=>d.id));
  if (error) throw error;
}
if (drvs?.length) {
  // any mission that got a seeded driver but a real desk (shouldn't exist, but be sure)
  const { count } = await db.from("mission").select("id",{count:"exact",head:true}).in("driver_id", drvs.map(d=>d.id));
  if (count) { console.log(`missions still pointing at seeded drivers: ${count}`); await db.from("mission").delete().in("driver_id", drvs.map(d=>d.id)); }
  await db.from("vehicle").delete().in("driver_id", drvs.map(d=>d.id));
  await db.from("driver").delete().in("id", drvs.map(d=>d.id));
}
if (desks?.length) await db.from("dispatcher").delete().in("id", desks.map(d=>d.id));
for (const id of ids) await db.auth.admin.deleteUser(id).catch(()=>{});

const { data: bs } = await db.from("business").select("id,name");
for (const b of bs) {
  const { count } = await db.from("mission").select("id",{count:"exact",head:true}).eq("business_id", b.id);
  console.log(`  ${b.name}: ${count} missions`);
}
