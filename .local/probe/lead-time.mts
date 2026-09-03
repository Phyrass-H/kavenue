import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
  .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const { data: ms } = await db.from("mission").select("status");
const dist: Record<string,number> = {};
for (const m of ms ?? []) dist[m.status] = (dist[m.status] ?? 0) + 1;
console.log("mission.status distribution (n=" + (ms?.length ?? 0) + "):", JSON.stringify(dist));

// has ANY mission ever passed through 'accepted'? the event log + status_event are the history
const { data: ev } = await db.from("mission_event").select("event_type,source");
const evd: Record<string,number> = {};
for (const e of ev ?? []) evd[e.event_type + " · " + e.source] = (evd[e.event_type + " · " + e.source] ?? 0) + 1;
console.log("\nmission_event by type · source:");
for (const k of Object.keys(evd).sort()) console.log("   ", k.padEnd(38), evd[k]);

const { data: se } = await db.from("status_event").select("status");
const sed: Record<string,number> = {};
for (const s of se ?? []) sed[s.status] = (sed[s.status] ?? 0) + 1;
console.log("\nstatus_event.to_status (the full history, n=" + (se?.length ?? 0) + "):", JSON.stringify(sed));

// how much lead time do Businesses actually give? that bounds any Lock-in window
const { data: lead } = await db.from("mission").select("created_at,pickup_at").not("pickup_at","is",null);
const hrs = (lead ?? []).map((m:any)=> (new Date(m.pickup_at).getTime() - new Date(m.created_at).getTime())/3_600_000).filter((h)=>h>0).sort((a,b)=>a-b);
const q = (p:number)=> hrs.length ? hrs[Math.floor((hrs.length-1)*p)].toFixed(1) : "n/a";
console.log("\nlead time posted→pickup, hours (n=" + hrs.length + "): p10=" + q(.1) + " p25=" + q(.25) + " median=" + q(.5) + " p75=" + q(.75) + " p90=" + q(.9));
console.log("   share posted LESS than 3h ahead:", (100*hrs.filter(h=>h<3).length/(hrs.length||1)).toFixed(0) + "%  |  less than 6h:", (100*hrs.filter(h=>h<6).length/(hrs.length||1)).toFixed(0) + "%");
