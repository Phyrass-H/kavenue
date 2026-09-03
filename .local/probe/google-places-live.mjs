// Does the new Google key actually work, as the browser will use it?
// ⚑ Prints PASS/FAIL and the place names only. It must NEVER print the key.
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
  .map(l=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const KEY = env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
if (!KEY) { console.log("FAIL  no NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local"); process.exit(1); }
console.log(`key present · ${KEY.length} chars · starts "${KEY.slice(0,4)}…"  (never printed in full)\n`);

// The key is restricted to Websites, so a bare server call is refused by design.
// Sending the Referer localhost:3000 is exactly what the browser will send.
const call = async (input, referer = "http://localhost:3000/") => {
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "Referer": referer },
    body: JSON.stringify({ input, languageCode: "fr", regionCode: "FR",
      locationBias: { circle: { center: { latitude: 43.7102, longitude: 7.2619 }, radius: 50000 } } }),
  });
  return { status: res.status, body: await res.json() };
};

let pass = 0, fail = 0;
const t = (n, ok, note="") => { console.log(`${ok?"ok  ":"FAIL"}  ${n}${note?"   "+note:""}`); ok?pass++:fail++; };

for (const q of ["Hôtel Martinez", "Terminal 2 Nice", "12 Promenade des Anglais"]) {
  const { status, body } = await call(q);
  const hits = body.suggestions ?? [];
  t(`"${q}" → ${hits.length} suggestions`, status === 200 && hits.length > 0,
    status !== 200 ? `HTTP ${status} · ${body.error?.status ?? ""} ${body.error?.message ?? ""}` : "");
  hits.slice(0,3).forEach(h => console.log(`        · ${h.placePrediction?.text?.text ?? "?"}`));
}

console.log("\n── the restrictions actually bite ──");
const bad = await call("Hôtel Martinez", "https://evil-example.com/");
t("a request from an unlisted website is REFUSED", bad.status !== 200,
  bad.status === 200 ? "⚑ ACCEPTED — the website restriction is not applied" : `HTTP ${bad.status} · ${bad.body.error?.status ?? ""}`);

// ⚑ AND THE RESTRICTION MUST NOT BE SO TIGHT IT KILLS PRODUCTION. The key is
// restricted to *.kavenue.fr, and the app is served from FOUR origins. A key that
// works on localhost and nowhere else looks perfect here and is dead for every
// hotel — the exact "silence reads as success" shape this project keeps meeting.
console.log("\n── ...without killing the real origins ──");
for (const origin of ["https://kavenue.fr/", "https://www.kavenue.fr/",
                      "https://dispatch.kavenue.fr/", "https://driver.kavenue.fr/"]) {
  const r = await call("Eden Roc", origin);
  t(`${origin} is allowed`, r.status === 200 && (r.body.suggestions ?? []).length > 0,
    r.status !== 200 ? `HTTP ${r.status} · ${r.body.error?.status ?? ""}` : "");
}
// Not asserted, only reported: the *.vercel.app addresses are NOT on the allowlist,
// so the address box is dead if the app is opened through one of them. Deliberate
// as long as nobody uses them — see BACKLOG § AD for pickup-marketplace.vercel.app.
const vercel = await call("Eden Roc", "https://kavenue-git-main-phyrassh-3792s-projects.vercel.app/");
console.log(`     · vercel.app preview origin: ${vercel.status === 200 ? "allowed" : "refused (not on the allowlist — expected)"}`);

console.log(`\n${pass} passed · ${fail} failed`);
