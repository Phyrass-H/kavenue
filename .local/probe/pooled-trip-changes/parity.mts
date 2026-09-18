// S83 — the TypeScript side of run.sh's parity step. Writes two CSVs the SQL copies are checked
// against, row by row: the step count (lib/pdp.ts ladderSteps ⇄ pdp_ladder_steps) and the all-in
// → Course search (lib/commission.ts courseFromBusinessTotal ⇄ course_from_business_total).
// Pure computation — no database, no network.
import { readFileSync, writeFileSync } from "node:fs";
import { ladderSteps } from "../../../lib/pdp.ts";
import { courseFromBusinessTotal } from "../../../lib/commission.ts";
import { exactFloorAllIn, type RateCardRow } from "../../../lib/rate-card.ts";

const out = process.argv[2];
const r2 = (n: number) => Math.round(n * 100) / 100;

// Ceilings 5,00 → 600,00 with odd cents, every opening shape: no floor (the 50 % fallback), floors
// at several fractions of the Ceiling (under and over SPEED WIN's 70 %), and a floor above it.
const ladder: string[] = [];
for (let c = 5; c <= 600; c += 0.37) {
  const ceiling = r2(c);
  const starts: (number | null)[] = [null, r2(ceiling * 0.3), r2(ceiling * 0.5), r2(ceiling * 0.69),
    r2(ceiling * 0.7), r2(ceiling * 0.71), r2(ceiling * 0.99), ceiling, r2(ceiling * 1.1), r2(ceiling - 16.99)];
  for (const s of starts) {
    for (const w of [false, true]) {
      const n = ladderSteps({ id: "x", ceiling, pdp_start: s, speed_win: w, pickup_at: "", created_at: "", pdp_step_count: null });
      ladder.push(`${ceiling},${s ?? ""},${w},${n ?? ""}`);
    }
  }
}
writeFileSync(`${out}/ladder.csv`, ladder.join("\n") + "\n");

// Every cent from 10,00 to 2 000,00 at today's rates, a sparser sweep at two other rate sets,
// and the no-rates case.
const course: string[] = [];
const push = (t: number, b: number | null, v: number | null) =>
  course.push(`${t.toFixed(2)},${b ?? ""},${v ?? ""},${courseFromBusinessTotal(t, b == null || v == null ? null : { businessHt: b, driverHt: 0, feeVat: v }).toFixed(2)}`);
for (let c = 1000; c <= 200000; c++) push(c / 100, 0.125, 0.2);
for (let c = 1000; c <= 200000; c += 7) { push(c / 100, 0.15, 0.2); push(c / 100, 0.05, 0.2); push(c / 100, null, null); }
writeFileSync(`${out}/course.csv`, course.join("\n") + "\n");

// The floor to the cent (lib/rate-card exactFloorAllIn ⇄ round(mission_price().floor_price, 2)), on the
// replayed rate card: every class × body × day/night × km from 0,1 to 600,0 in tenths — floors land on
// half cents here, which is exactly where a float and Postgres round apart.
const cards: RateCardRow[] = readFileSync(`${out}/cards.csv`, "utf8").trim().split("\n").map((l) => {
  const [id, market, tier, body, effective_from, ...n] = l.split(",");
  const [floor_base, floor_per_km, ceiling_base, ceiling_per_km, ceiling_per_km_long, long_threshold_km, night_multiplier] = n.map(Number);
  return { id, market, tier, body: body || null, effective_from: new Date(effective_from.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString(),
           floor_base, floor_per_km, ceiling_base, ceiling_per_km, ceiling_per_km_long, long_threshold_km, night_multiplier };
});
const floors: string[] = [];
for (const tier of ["eco", "business", "luxury"] as const)
  for (const body of [null, "sedan", "van"] as const)
    for (const night of [false, true])
      for (let k = 1; k <= 6000; k++) {
        const km = k / 10;
        const f = exactFloorAllIn(cards, tier, body, km, { night });
        if (f != null) floors.push(`${tier},${body ?? ""},${km.toFixed(1)},${night},${f.toFixed(2)}`);
      }
writeFileSync(`${out}/floor.csv`, floors.join("\n") + "\n");
