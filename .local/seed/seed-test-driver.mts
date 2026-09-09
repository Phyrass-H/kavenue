// A Driver to test the document reviewer on, end to end.
//
//   npx tsx .local/seed/seed-test-driver.mts
//
// ⚑ RE-RUNNABLE, AND THAT IS THE POINT. Reviewing is destructive — once you have
// approved a paper you cannot approve it again, and testing a queue you have
// already cleared tells you nothing. Running this a second time puts every
// document back to `pending`, clears the notes and un-verifies the Driver, so
// the whole pass can be done again from the top.
//
// ⚑ IT SETS NO PASSWORD YOU HAVE TO TYPE. The account is created confirmed with
// the same DEV_PASSWORD every other fixture uses (from .env.local), and the way
// in is /api/dev-login?email=… — one click, nothing typed, nothing to leak.
//
// ⚑ THE PAPERS ARE THE SPECIMENS FROM make-test-documents.mts — stamped
// "SPECIMEN · NOT A REAL DOCUMENT", at the real French formats. Run that first if
// the files are not in the temp directory yet; this calls it for you.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY, PW = env.DEV_PASSWORD;
if (!URL_ || !SRK || !PW) throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or DEV_PASSWORD is missing from .env.local");
const db = createClient(URL_, SRK, { auth: { persistSession: false } });

// ⚑ A .test address, so it can never collide with a real Driver and is obvious
// in the fleet list. Change EMAIL to make a second one.
const EMAIL = "test.driver@kavenue.test";
const FIRST = "Théo", LAST = "Essai";

const SPECIMENS = path.join(process.env.TMPDIR ?? "/tmp", "kavenue-specimens");
if (!fs.existsSync(path.join(SPECIMENS, "licence-front.jpg"))) {
  console.log("specimens not found — generating them first…\n");
  execFileSync("npx", ["tsx", ".local/seed/make-test-documents.mts"], { stdio: "inherit" });
}

// ── 1 · the account ─────────────────────────────────────────────────────────
const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
let user = existing.users.find((u) => u.email === EMAIL);
if (!user) {
  const { data, error } = await db.auth.admin.createUser({
    email: EMAIL, password: PW, email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  user = data.user!;
  console.log(`created auth user   ${EMAIL}`);
} else {
  console.log(`auth user exists    ${EMAIL}`);
}
await db.from("profile").upsert({ auth_user_id: user.id, role: "driver" }, { onConflict: "auth_user_id" });

// ── 2 · the Driver and their car ────────────────────────────────────────────
// Based in Cannes with a 40 km radius, so the Pool actually reaches them —
// otherwise the "can they see work?" half of the test answers itself for the
// wrong reason (lib/geo.ts matches on base + radius, never on a town list).
const driverFields = {
  auth_user_id: user.id, email: EMAIL, first_name: FIRST, last_name: LAST,
  phone: "+33 6 00 00 00 01", base_label: "Cannes", base_lat: 43.5528, base_lng: 7.0174,
  service_radius_km: 40, preferred_gps: "waze", languages: ["fr", "en"],
  accepts_luggage_runs: false,
  company_name: "ESSAI VTC (test)", siret: "00000000000000",
  // ⚑⚑ EVERY ONE OF THESE IS HERE TO CLOSE A GAP, AND THAT IS THE WHOLE TRICK.
  // `driverReadiness` counts eight profile checks plus one per unfiled document,
  // and the "Your file is with us" notice renders only when the count is ZERO —
  // because until then the ball is in the Driver's court and telling them to
  // wait on Kavenue would be a lie. Leave any of these blank (even the profile
  // photo, which is only a warning) and the founder can never see the message
  // they chose. Found by signing in as this Driver, not by reading the code.
  registered_address: "1 rue de l’Essai, 06400 Cannes",
  revtc_number: "EVTC000000000000",
  pro_card_number: "0000000000",
  profile_photo_url: "https://ui-avatars.com/api/?name=Theo+Essai&background=25344C&color=fff",
  // ⚑ NOT verified — the whole point. They must arrive refused, so the founder
  // can watch the gate open when they approve the papers and flip the switch.
  verified: false,
};
const { data: had } = await db.from("driver").select("id").eq("auth_user_id", user.id).maybeSingle();
let driverId = had?.id;
if (driverId) {
  await db.from("driver").update(driverFields).eq("id", driverId);
} else {
  const { data, error } = await db.from("driver").insert(driverFields).select("id").single();
  if (error) throw new Error(`driver insert: ${error.message}`);
  driverId = data.id;
}
const { data: veh } = await db.from("vehicle").select("id").eq("driver_id", driverId!).maybeSingle();
const vehicleFields = {
  category: "business" as const, body_type: "sedan" as const,
  make: "Mercedes", model: "Classe E", colour: "Noir", plate: "TE-000-ST", seats: 4, is_active: true,
};
if (veh) await db.from("vehicle").update(vehicleFields).eq("id", veh.id);
else await db.from("vehicle").insert({ driver_id: driverId!, ...vehicleFields });

// ── 3 · the papers ──────────────────────────────────────────────────────────
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
const ext = (f: string) => f.slice(f.lastIndexOf(".") + 1);
async function put(type: string, side: string | null, file: string) {
  const bytes = fs.readFileSync(path.join(SPECIMENS, file));
  const key = `driver/${driverId}/${type}${side ? `-${side}` : ""}-specimen.${ext(file)}`;
  const up = await db.storage.from("documents").upload(key, bytes, { upsert: true, contentType: MIME[ext(file)] });
  if (up.error) throw new Error(`upload ${key}: ${up.error.message}`);
  const q = db.from("document").delete().eq("owner_id", driverId!).eq("owner_type", "driver").eq("type", type);
  await (side ? q.eq("side", side) : q.is("side", null));
  const { error } = await db.from("document").insert({
    owner_type: "driver", owner_id: driverId!, type, side, file_url: key, status: "pending",
  });
  if (error) throw new Error(`insert ${type}: ${error.message}`);
}

// ⚑ A REALISTIC HALF-FINISHED FILE, not a tidy one. A Driver uploads over days,
// so some papers are missing and one two-sided card has only its front — those
// are states the reviewer has to render, and a full set would never show them.
await put("drivers_licence", "front", "licence-front.jpg");
await put("drivers_licence", "back", "licence-back.jpg");
await put("vtc_card", "front", "vtc-front.png");        // ⚑ no back — on purpose
await put("rc_pro", null, "rcpro-sideways.jpg");        // needs rotating to read
await put("vehicle_registration", null, "cartegrise-dark-blurry.jpg"); // reject this one
await put("insurance", null, "insurance.pdf");
await put("kbis", null, "kbis.pdf");
await put("medical_certificate", null, "medical-large.png");
// ⚑ FILED, NOT OMITTED — and that is a deliberate reversal. These two were left
// out at first to show the "Not added yet" state, and it cost the thing that
// matters more: an unfiled document is a GAP, a gap makes the readiness count
// non-zero, and a non-zero count hides "Your file is with us" for ever. A
// PENDING document is not a gap (lib/driver-readiness.ts:82), so filing them
// keeps the file complete AND leaves them in the review queue.
// ⚑ The "Not added yet" state is still reachable — Clara Vidal has it.
await put("revtc", null, "kbis.pdf");
await put("urssaf_vigilance", null, "insurance.pdf");

console.log(`
Driver            ${FIRST} ${LAST}  ·  not verified  ·  Business / Sedan, based in Cannes
Papers            10 filed and pending · VTC card has no back (still not a gap)
File              COMPLETE — nothing left for the Driver, so their Account hub
                  reads "Your file is with us", the message signed off 2026-09-07

  review them     /admin/drivers/${driverId}
  be the Driver   /api/dev-login?email=${EMAIL}   (one click, nothing to type)

⚑ Re-run this script to put every paper back to pending and start the test again.`);
