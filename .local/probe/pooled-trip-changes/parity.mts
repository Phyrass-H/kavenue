// S83 — the TypeScript side of run.sh's parity step. Writes two CSVs the SQL copies are checked
// against, row by row: the step count (lib/pdp.ts ladderSteps ⇄ pdp_ladder_steps) and the all-in
// → Course search (lib/commission.ts courseFromBusinessTotal ⇄ course_from_business_total).
// Pure computation — no database, no network.
import { writeFileSync } from "node:fs";
import { ladderSteps } from "../../../lib/pdp.ts";
import { courseFromBusinessTotal } from "../../../lib/commission.ts";

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
