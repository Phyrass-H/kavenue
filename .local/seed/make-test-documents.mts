// Synthetic papers for testing the document reviewer. READ THE HEADER.
//
//   npx tsx .local/seed/make-test-documents.mts
//
// ⚑⚑ THESE ARE DELIBERATELY NOT REALISTIC, AND THAT IS NOT LAZINESS. A convincing
// fake permis de conduire or carte professionnelle VTC is a forged government
// document, whatever it is labelled for. Every file this writes carries a large
// diagonal "SPECIMEN — NOT A REAL DOCUMENT" stamp and obviously fake data
// (JEAN SPÉCIMEN, 0000 0000 0000), and it is stamped in a way that cannot be
// cropped out because it crosses the whole page.
//
// ⚑ AND THEY TEST MORE THAN REAL PAPERS WOULD. What the reviewer has to survive
// is not "a licence" — it is the SHAPES and the FAILURE MODES a real enrolment
// throws at it:
//
//   fine print          → is the zoom good enough to read a licence number
//   a sideways scan     → someone photographed it in landscape; needs rotate
//   a PDF              → insurance certificates and Kbis almost always are
//   a dark / blurry one → the one you REJECT; exercises the note path
//   A4 portrait         → a different aspect ratio to a card
//   a large file        → near the 10 MB ceiling
//   front but no back   → the "only one side is on file" state
//   NO FILE AT ALL      → the case the founder hit on 2026-09-08: the screen
//                         offered Approve on a paper nobody could open
//
// Idempotent: re-running replaces the files and the rows for the same Driver.
// ⚑ Writes to the LIVE bucket and the LIVE document table, for FIXTURE Drivers
// only — it refuses to touch a Driver it was not given by name.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const OUT = process.env.TMPDIR ? path.join(process.env.TMPDIR, "kavenue-specimens") : "/tmp/kavenue-specimens";
fs.mkdirSync(OUT, { recursive: true });

// ── the generator, in Python because PIL is already on this Mac ─────────────
const PY = String.raw`
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT = sys.argv[1]

def font(sz, bold=False):
    for p in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
              "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()

def stamp(img, text="SPECIMEN · NOT A REAL DOCUMENT"):
    """Diagonal, edge to edge, so it cannot be cropped away."""
    lay = Image.new("RGBA", img.size, (0,0,0,0))
    d = ImageDraw.Draw(lay)
    f = font(max(18, img.width // 30), bold=True)
    # ⚑ Step by the MEASURED width plus a gap. Stepping by a fraction of the page
    # overlapped every repeat into an unreadable smear — a stamp nobody can read
    # is not a stamp.
    tw = int(d.textlength(text, font=f)); th = f.size
    for row in range(-1, img.height // max(1, th * 3) + 2):
        y = row * th * 3
        for x in range(-tw, img.width + tw, tw + max(40, tw // 6)):
            d.text((x, y), text, font=f, fill=(200, 30, 30, 62))
    lay = lay.rotate(24, expand=False)
    img.alpha_composite(lay) if img.mode == "RGBA" else img.paste(Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB"), (0,0))
    return img

# ── REAL FRENCH FORMATS, verified 2026-09-09 ───────────────────────────────
# ⚑ THE SHAPES ARE THE POINT. A reviewer's viewer has to cope with a wide card,
# a tall A4 and the carte grise's odd long strip — and the first version of this
# file drew the carte grise as a credit card, which is wrong by a factor of two
# in aspect ratio and would have hidden a real layout bug.
#
#   permis de conduire     85,6 x 54 mm   ID-1 / ISO-IEC 7810, since 2013
#                          ants.gouv.fr — "format carte bancaire"
#   carte grise            125 x 254 mm   folded in three along the width;
#                          NOT A4 (carte-grise.org / caroom.fr)
#   carte VTC              a secure Imprimerie nationale card. ⚑ The arrêté du
#                          7 septembre 2017 (JORFTEXT000035600968) fixes what is
#                          ON it — recto: photo, 2D-DOC barcode, expiry, number;
#                          verso: nom, prénom, date et lieu de naissance,
#                          signature — but puts the DIMENSIONS in an image annexe,
#                          not in the text. ID-1 is the closest standard and what
#                          the Imprimerie nationale uses; treat as unconfirmed.
#   A4                     210 x 297 mm   assurance, Kbis, URSSAF, médical
PX_PER_MM = 12          # ~300 dpi
def mm(w_mm, h_mm, dpmm=PX_PER_MM):
    return int(w_mm * dpmm), int(h_mm * dpmm)
ID1      = mm(85.6, 54)          # a card, landscape
CARTE_GRISE = mm(254, 125, 8)    # the long strip, landscape
A4       = mm(210, 297, 6)       # portrait

def card(w, h, title, lines, bg=(238,242,248), tiny=False):
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    d.rectangle([8, 8, w-8, h-8], outline=(120, 135, 160), width=3)
    d.text((26, 22), title, font=font(max(15, w//26), bold=True), fill=(28, 40, 62))
    d.rectangle([26, 70, 26 + w//5, 70 + h//2], outline=(150,160,180), width=2, fill=(214,222,234))
    d.text((34, 70 + h//4), "PHOTO", font=font(max(10, w//48)), fill=(110,120,140))
    y = 74
    fs = max(9, w//72) if tiny else max(11, w//48)
    for ln in lines:
        d.text((26 + w//5 + 24, y), ln, font=font(fs), fill=(40, 52, 72)); y += int(fs * 1.85)
    d.text((26, h-40), "0000 0000 0000 0000   ·   DÉLIVRÉ PAR SPÉCIMEN", font=font(max(9, w//64)), fill=(90,100,120))
    return stamp(img)

P = ["Nom: SPÉCIMEN", "Prénom: JEAN", "Né le: 01/01/1990", "à: VILLE-SPÉCIMEN (00)",
     "Catégories: B", "Délivré le: 21/03/2017", "Expire le: 21/03/2027"]

# 1 · licence front — fine print, a card. Tests the zoom.
card(*ID1, "PERMIS DE CONDUIRE — SPECIMEN", P, tiny=True).save(f"{OUT}/licence-front.jpg", quality=88)
# 2 · licence back — dense small text
card(*ID1, "PERMIS — VERSO — SPECIMEN",
     ["Restrictions: aucune", "Code 00: spécimen", "Autorité: SPÉCIMEN", "Ref: 0000-0000-0000",
      "Ce document est un SPÉCIMEN de test", "Il ne prouve rien", "Kavenue — fichier de test"], tiny=True
     ).save(f"{OUT}/licence-back.jpg", quality=88)
# 3 · VTC card front — portrait
card(*ID1, "CARTE VTC — SPECIMEN",
     ["Nom: SPÉCIMEN", "Prénom: JEAN", "N° carte: 0000 0000", "Valide jusqu'au: 30/06/2028",
      "Émise par: SPÉCIMEN"]).save(f"{OUT}/vtc-front.png")
# 4 · sideways scan — someone shot it in landscape. Tests ROTATE.
card(*A4, "ATTESTATION RC PRO — SPECIMEN",
     ["Assuré: JEAN SPÉCIMEN", "Police n°: 0000-0000", "Garantie: RC professionnelle",
      "Période: 01/01/2026 – 31/12/2026"]).rotate(90, expand=True).save(f"{OUT}/rcpro-sideways.jpg", quality=90)
# 5 · dark AND blurry — the one you reject. Tests the note path.
bad = card(*CARTE_GRISE, "CARTE GRISE — SPECIMEN",
     ["Immatriculation: AA-000-AA", "Titulaire: JEAN SPÉCIMEN", "D1.1: SPÉCIMEN", "Puissance: 0"])
bad = bad.filter(ImageFilter.GaussianBlur(3.2)).point(lambda v: int(v * 0.42))
bad.save(f"{OUT}/cartegrise-dark-blurry.jpg", quality=70)
# 6 · A4 portrait PDF — what an insurer actually sends
a4 = Image.new("RGB", A4, (252,252,250)); d = ImageDraw.Draw(a4)
d.text((90, 90), "ATTESTATION D'ASSURANCE — SPECIMEN", font=font(40, bold=True), fill=(28,40,62))
yy = 200
for ln in ["Assureur: SPÉCIMEN ASSURANCES", "Assuré: JEAN SPÉCIMEN", "Véhicule: AA-000-AA",
           "Usage déclaré: transport de personnes (VTC)", "Police: 0000 0000 0000",
           "Validité: 01/01/2026 au 31/12/2026", "", "Ce document est un SPÉCIMEN.",
           "Il est produit pour tester un écran de vérification.", "Il n'a aucune valeur."]:
    d.text((90, yy), ln, font=font(30), fill=(45,55,75)); yy += 62
stamp(a4).save(f"{OUT}/insurance.pdf", "PDF", resolution=150)
# 7 · A4 portrait PDF, second type
k = Image.new("RGB", A4, (255,255,255)); d = ImageDraw.Draw(k)
d.text((90, 90), "EXTRAIT KBIS — SPECIMEN", font=font(40, bold=True), fill=(28,40,62))
yy = 200
for ln in ["Dénomination: SPÉCIMEN VTC", "SIREN: 000 000 000", "Forme: SASU",
           "Siège: 1 rue Spécimen, 06000", "Activité: 49.32Z", "Immatriculation: 01/01/2024"]:
    d.text((90, yy), ln, font=font(30), fill=(45,55,75)); yy += 62
stamp(k).save(f"{OUT}/kbis.pdf", "PDF", resolution=150)
# 8 · a LARGE file, near the 10 MB ceiling — tests the viewer's patience
big = Image.new("RGB", (4200, 5900), (250,250,248)); d = ImageDraw.Draw(big)
d.text((200, 200), "CERTIFICAT MÉDICAL — SPECIMEN", font=font(120, bold=True), fill=(28,40,62))
yy = 520
for ln in ["Patient: JEAN SPÉCIMEN", "Aptitude: apte à la conduite (SPÉCIMEN)",
           "Date: 01/02/2026", "Valable jusqu'au: 01/02/2031", "Médecin: Dr SPÉCIMEN"]:
    d.text((200, yy), ln, font=font(84), fill=(45,55,75)); yy += 170
import random
random.seed(7)
px = big.load()
for _ in range(900000):  # noise, purely to make the file genuinely big
    x = random.randrange(4200); y = random.randrange(5900)
    px[x, y] = (px[x, y][0]-3, px[x, y][1]-3, px[x, y][2]-3)
stamp(big).save(f"{OUT}/medical-large.png", optimize=False)
print("generated:", ", ".join(sorted(os.listdir(OUT))))
`;

execFileSync("python3", ["-c", PY, OUT], { stdio: "inherit" });
for (const f of fs.readdirSync(OUT)) {
  const s = fs.statSync(path.join(OUT, f));
  console.log(`   ${f.padEnd(28)} ${(s.size / 1024).toFixed(0)} kB`);
}

// ── 2 · put them on FIXTURE Drivers, as a real enrolment would look ─────────
//
// ⚑ NAMED FIXTURES ONLY. This writes to the live `document` table, so it refuses
// to act on any Driver it was not asked for by first name. It will not touch a
// Driver who has real papers on file.
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
const ext = (f: string) => f.slice(f.lastIndexOf(".") + 1);

async function put(ownerId: string, type: string, side: string | null, file: string) {
  const bytes = fs.readFileSync(path.join(OUT, file));
  const suffix = side ? `-${side}` : "";
  const key = `driver/${ownerId}/${type}${suffix}-specimen.${ext(file)}`;
  const up = await db.storage.from("documents").upload(key, bytes, {
    upsert: true, contentType: MIME[ext(file)] ?? "application/octet-stream",
  });
  if (up.error) throw new Error(`upload ${key}: ${up.error.message}`);
  // Replace any existing row for this (type, side) rather than piling up copies.
  const q = db.from("document").delete().eq("owner_id", ownerId).eq("owner_type", "driver").eq("type", type);
  await (side ? q.eq("side", side) : q.is("side", null));
  const ins = await db.from("document").insert({
    owner_type: "driver", owner_id: ownerId, type, side, file_url: key, status: "pending",
  });
  if (ins.error) throw new Error(`insert ${type}${suffix}: ${ins.error.message}`);
  console.log(`   ${type}${suffix ? " " + side : ""}`.padEnd(34) + `${(bytes.length / 1024).toFixed(0)} kB  ${file}`);
}

async function driverByFirstName(first: string) {
  const { data } = await db.from("driver").select("id, first_name, last_name, verified").ilike("first_name", first);
  if (!data?.length) throw new Error(`no Driver named ${first}`);
  if (data.length > 1) throw new Error(`${data.length} Drivers named ${first} — refusing to guess`);
  return data[0] as { id: string; first_name: string; last_name: string; verified: boolean };
}

// ⚑ CLARA VIDAL — the full enrolment simulation. Unverified, and until now with
// not one paper on file, which is exactly what a Driver signing up looks like.
const clara = await driverByFirstName("Clara");
console.log(`\nfiling a full set for ${clara.first_name} ${clara.last_name} (verified=${clara.verified}):`);
await put(clara.id, "drivers_licence", "front", "licence-front.jpg");
await put(clara.id, "drivers_licence", "back", "licence-back.jpg");
// ⚑ FRONT ONLY, ON PURPOSE — the "only one side is on file" state.
await put(clara.id, "vtc_card", "front", "vtc-front.png");
await put(clara.id, "rc_pro", null, "rcpro-sideways.jpg");          // needs rotate
await put(clara.id, "vehicle_registration", null, "cartegrise-dark-blurry.jpg"); // reject this one
await put(clara.id, "insurance", null, "insurance.pdf");            // a PDF
await put(clara.id, "kbis", null, "kbis.pdf");                      // a PDF
await put(clara.id, "medical_certificate", null, "medical-large.png"); // a big file
// ⚑ urssaf_vigilance and revtc get NO ROW — "nothing uploaded yet".

// ⚑ AMINE BELKACEM — his two rows already existed but pointed at `seed://…`,
// a path that was never uploaded. That is what let the console offer Approve on
// a paper nobody could open (founder, 2026-09-08). Give them real files.
const amine = await driverByFirstName("Amine");
console.log(`\nrepairing the dead seed:// paths for ${amine.first_name} ${amine.last_name}:`);
await put(amine.id, "drivers_licence", "front", "licence-front.jpg");
await put(amine.id, "vtc_card", "front", "vtc-front.png");

console.log("\ndone — every file is a stamped SPECIMEN, none is a real document.");
