// Commission — docs/06 §1, §3, §9. The TypeScript half of the split.
//
// ⚑ THIS MIRRORS SQL. `commission_split()` / `transport_vat()` / `commission_for()`
// live in docs/migrations/2026-08-17_commission.sql, and `tests/commission.test.ts`
// pins both copies against the same figures. Two copies exist for the same reason
// the rate card has two: the mission form must re-price on every keystroke without
// a round trip, and the server must never trust a number the browser sent. If you
// change one, change the other.
//
// ── THE ONE SENTENCE THAT EXPLAINS EVERY NUMBER BELOW ───────────────────────
// The COURSE is the fare — what the PDP curve climbs, what `mission.ceiling`
// stores, and the basis for everything. Neither party is shown it:
//
//   the Business is shown  course × 1,15   — its all-in cost, fee inside
//   the Driver   is shown  course × 0,88   — what lands in their bank
//
// Founder's call, 2026-08-17: the Ceiling Kavenue pre-fills is the Business's
// ALL-IN maximum. The rate card was calibrated against retail — an all-in
// consumer price — so that is the only reading that keeps docs/06 §4's
// "70-94 % of retail" honest. And docs/06 §1's Driver ruling: the number in the
// Pool IS what the Driver banks, so no gross/net language exists anywhere.
//
// ── ROUNDING: THE VAT LINE ABSORBS THE CENT ─────────────────────────────────
// Each side's total and HT fee are computed independently, then the VAT line is
// taken as the REMAINDER. It can sit a cent off 20 % of the fee; it can never
// fail to reconcile, and an invoice whose lines don't add up to its total is
// wrong however defensible the arithmetic. Same convention in SQL.
//
// ── NULL RATES ARE NOT ZERO RATES, THEY ARE "NO COMMISSION" ─────────────────
// Every mission created before this shipped was billed no fee at all. Those rows
// carry NULL rates and `charged: false`, and the app renders them as one amount
// with no breakdown. Reading NULL as 0 would be the same arithmetic by accident;
// reading it as 0,125 would retroactively invent 15 % of charges on the 6 live rows
// that still carry them (measured 2026-09-02; an earlier comment here said 271).

// ⚑ TYPE-ONLY, so it is erased at build time and there is no import cycle:
// lib/vat.ts classifies, this file counts, and only this direction is real.
import type { BillLineKind, TaxLine, TaxTreatment } from "@/lib/vat";

/** A generation of the rates. One row is live at a time — docs/06 §0. */
export type CommissionRateRow = {
  id: string;
  effective_from: string;
  business_rate_ht: number;
  driver_rate_ht: number;
  fee_vat_rate: number;
  transport_vat_rate: number;
  /**
   * The French STANDARD rate (CGI art. 278), for a supply that is not passenger
   * transport — an at-disposal hour.
   *
   * ⚑ NOT `fee_vat_rate`, and the distinction is the whole point of the column.
   * Both read 0,20 today for two unrelated reasons: a platform fee is a
   * standard-rated service, and buying a driver's time is a hire rather than a
   * journey. Until 2026-09-04 `taxOf("disposal")` borrowed the fee's rate, which
   * would have made a legal rate follow a commercial one.
   */
  standard_vat_rate: number;
};

/** The columns a split needs. Keep in step with CommissionRateRow. */
export const COMMISSION_RATE_COLS =
  "id,effective_from,business_rate_ht,driver_rate_ht,fee_vat_rate,transport_vat_rate,standard_vat_rate";

/**
 * The same card WITHOUT the Driver-side rate — the only shape a browser session
 * may ask for since 2026-08-30. `driver_rate_ht` is revoked from `authenticated`
 * (money_column_walls part 2): a Dispatcher pricing a trip needs its own rate
 * and the fee VAT, and nothing else. `createMission` snapshots the Driver's rate
 * onto the mission using the service role.
 */
export const COMMISSION_RATE_BUSINESS_COLS =
  "id,effective_from,business_rate_ht,fee_vat_rate,transport_vat_rate";
// ⚑ `standard_vat_rate` is deliberately absent above. It is not walled — it is
// published law — but the browser prices a TRANSFER, and a rate nobody on that
// path reads is a column nobody on that path should fetch.

/** The columns snapshot onto `mission`. Select these anywhere money is shown. */
export const COMMISSION_COLS =
  "commission_business_rate,commission_driver_rate,commission_vat_rate,transport_vat_rate,standard_vat_rate";

/**
 * The snapshot as it comes back from PostgREST — `numeric` arrives as a STRING,
 * which is why every read goes through `num()` rather than being trusted.
 */
export type CommissionSnapshot = {
  commission_business_rate?: number | string | null;
  commission_driver_rate?: number | string | null;
  commission_vat_rate?: number | string | null;
  transport_vat_rate?: number | string | null;
  standard_vat_rate?: number | string | null;
};

export type Rates = {
  businessHt: number;
  driverHt: number;
  feeVat: number;
};

export type Split = {
  /** The fare itself. Shown to nobody. */
  course: number;
  /** What the Business pays, all in — the number the Ceiling and the row show. */
  businessTotal: number;
  businessFeeHt: number;
  businessFeeVat: number;
  /** What the Driver banks — the number the Pool shows. */
  driverNet: number;
  driverFeeHt: number;
  driverFeeVat: number;
  /**
   * False for a mission priced before commission existed. Both totals then equal
   * the course and every fee is 0 — render the amount alone, with no breakdown.
   */
  charged: boolean;
};

/** A `Split` with the Driver's half removed. What a Dispatcher session gets. */
export type BusinessSplit = Pick<
  Split,
  "course" | "businessTotal" | "businessFeeHt" | "businessFeeVat" | "charged"
>;

/** A `Split` with the Business's half removed. What a Driver session gets. */
export type DriverSplit = Pick<
  Split,
  "course" | "driverNet" | "driverFeeHt" | "driverFeeVat" | "charged"
>;

// ── EXACT DECIMAL — why the arithmetic below is BigInt and not float ────────
// Postgres computes `course × (1 + b × (1 + v))` in exact decimal and rounds
// half AWAY FROM ZERO. JavaScript computes it in binary float, where
// 556.9 × 1.15 is 640.4349999999999 rather than 640.435 — so a naive round to
// the cent gives 640,43 on screen where the database bills 640,44.
//
// That is not hypothetical: the first run of .local/probe/commission-parity.ts
// found 14 divergences in 1 900 checks, every one of them an exact .5 tie the
// float had already destroyed before rounding. A cent of daylight between what
// a Business is shown and what it is invoiced is a bug, so all of it happens in
// integer cents and integer rate units, and the parity probe holds the pair.

const RATE_SCALE = 100000n; // rates are numeric(6,5) — five decimals
const RATE_SCALE_SQ = RATE_SCALE * RATE_SCALE;

/** A money amount as whole cents. Inputs are already 2 dp — see docs/06 §9. */
function cents(n: number): bigint {
  const v = Number(n);
  return BigInt(Math.round((Number.isFinite(v) ? v : 0) * 100));
}

/** A rate as whole hundred-thousandths: 0,125 → 12500. */
function rateUnits(n: number): bigint {
  const v = Number(n);
  return BigInt(Math.round((Number.isFinite(v) ? v : 0) * 100000));
}

/** Half away from zero, exactly like Postgres `round(numeric, 2)`. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const q = numerator / denominator;
  const r = numerator % denominator;
  return r * 2n >= denominator ? q + 1n : q;
}

function euros(c: bigint): number {
  return Number(c) / 100;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The rates that priced this mission, or null if it predates commission.
 *
 * All three must be present. A row with some set and some NULL is not a state
 * the writer can produce (they are written in one statement), so it is treated
 * as no commission rather than half-charged — the direction that can only ever
 * under-bill, never invent a charge.
 *
 * ⚑ ONLY ADMIN SESSIONS CAN STILL SATISFY THIS. Since the money-column walls
 * (2026-08-30), `mission_read` masks each side's rate from the other, so a
 * Dispatcher's row carries NULL in `commission_driver_rate` and a Driver's
 * carries NULL in `commission_business_rate`. On a browser session use
 * `businessRatesOf` / `driverRatesOf` below; this one is for admin and for the
 * service role, where both are present.
 */
export function ratesOf(m: CommissionSnapshot | null | undefined): Rates | null {
  if (!m) return null;
  const businessHt = num(m.commission_business_rate);
  const driverHt = num(m.commission_driver_rate);
  const feeVat = num(m.commission_vat_rate);
  if (businessHt == null || driverHt == null || feeVat == null) return null;
  return { businessHt, driverHt, feeVat };
}

// ── ONE SIDE AT A TIME — docs/06 §3, "the Business never sees the Driver-side
// rate" ─────────────────────────────────────────────────────────────────────
// Before the walls, `ratesOf` demanded all three rates for the good reason that
// the writer always writes all three. That is still true of the TABLE; it is no
// longer true of what a session is allowed to READ. Left as it was, a masked
// counterpart would make `ratesOf` return null, `charged` go false, and the
// Business's three-line invoice quietly collapse into one amount equal to the
// Course — a wrong number, arrived at silently. So each side asks for its own.
//
// ⚑ THE ABSENT SIDE IS SUBSTITUTED WITH 0, WHICH MAKES THE OTHER HALF OF THE
//   SPLIT MEANINGLESS — `driverNet` out of a business split would read as the
//   whole Course. That is why these return the NARROWED `BusinessSplit` /
//   `DriverSplit` and not a `Split`: the halves you may not read are not
//   reachable, and the compiler says so rather than a comment.

/** What a Dispatcher session may know: its own rate and the fee VAT. */
export function businessRatesOf(m: CommissionSnapshot | null | undefined): Rates | null {
  if (!m) return null;
  const businessHt = num(m.commission_business_rate);
  const feeVat = num(m.commission_vat_rate);
  if (businessHt == null || feeVat == null) return null;
  return { businessHt, driverHt: 0, feeVat };
}

/** What a Driver session may know: its own rate and the fee VAT. */
export function driverRatesOf(m: CommissionSnapshot | null | undefined): Rates | null {
  if (!m) return null;
  const driverHt = num(m.commission_driver_rate);
  const feeVat = num(m.commission_vat_rate);
  if (driverHt == null || feeVat == null) return null;
  return { businessHt: 0, driverHt, feeVat };
}

/**
 * A rate card row as the BUSINESS half of a split — its own rate and the fee
 * VAT, with the Driver's substituted as 0. Feed it only to `businessTotal` /
 * `courseFromBusinessTotal` / `.businessTotal`; see the note on
 * `businessRatesOf` for why the other half is not a number you may read.
 */
export function businessRatesFromRow(
  // ⚑ TWO omissions, for two different reasons. `driver_rate_ht` is REVOKED from a
  // browser session (money_column_walls part 2). `standard_vat_rate` is readable
  // but simply not selected on this path — see COMMISSION_RATE_BUSINESS_COLS.
  row: Omit<CommissionRateRow, "driver_rate_ht" | "standard_vat_rate"> | null | undefined,
): Rates | null {
  if (!row) return null;
  const businessHt = num(row.business_rate_ht);
  const feeVat = num(row.fee_vat_rate);
  if (businessHt == null || feeVat == null) return null;
  return { businessHt, driverHt: 0, feeVat };
}

/** A rate row as the rates a split needs. Null in, null out. */
export function ratesFromRow(row: CommissionRateRow | null | undefined): Rates | null {
  if (!row) return null;
  const businessHt = num(row.business_rate_ht);
  const driverHt = num(row.driver_rate_ht);
  const feeVat = num(row.fee_vat_rate);
  if (businessHt == null || driverHt == null || feeVat == null) return null;
  return { businessHt, driverHt, feeVat };
}

/** The live generation at `at` — mirrors `commission_for()`. */
export function commissionFor(
  rows: CommissionRateRow[],
  at: Date = new Date(),
): CommissionRateRow | null {
  const iso = at.toISOString();
  const live = rows
    .filter((r) => r.effective_from <= iso)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0));
  return live[0] ?? null;
}

/**
 * Both sides of one Course, to the cent. Mirrors `commission_split()`.
 *
 * `rates` null → the legacy shape: both parties see the course, nothing is
 * charged, and `charged` is false so callers can suppress the breakdown.
 */
export function commissionSplit(course: number, rates: Rates | null): Split {
  const raw = Number(course);
  const c = cents(Number.isFinite(raw) ? Math.max(raw, 0) : 0);

  if (!rates) {
    return {
      course: euros(c),
      businessTotal: euros(c),
      businessFeeHt: 0,
      businessFeeVat: 0,
      driverNet: euros(c),
      driverFeeHt: 0,
      driverFeeVat: 0,
      charged: false,
    };
  }

  const b = rateUnits(rates.businessHt);
  const d = rateUnits(rates.driverHt);
  const onePlusVat = RATE_SCALE + rateUnits(rates.feeVat);

  const total = divRound(c * (RATE_SCALE_SQ + b * onePlusVat), RATE_SCALE_SQ);
  const net = divRound(c * (RATE_SCALE_SQ - d * onePlusVat), RATE_SCALE_SQ);
  const businessFeeHt = divRound(c * b, RATE_SCALE);
  const driverFeeHt = divRound(c * d, RATE_SCALE);

  return {
    course: euros(c),
    businessTotal: euros(total),
    businessFeeHt: euros(businessFeeHt),
    // The remainders — see the header. These two lines are what make the
    // rendered invoice add up exactly, at every course.
    businessFeeVat: euros(total - c - businessFeeHt),
    driverNet: euros(net),
    driverFeeHt: euros(driverFeeHt),
    driverFeeVat: euros(c - driverFeeHt - net),
    charged: true,
  };
}

/**
 * The whole split for a mission, given the course a caller already computed.
 *
 * ⚑ BOTH SIDES. Only an admin session or the service role can read both rates —
 * everywhere else, use `businessSplitFor` / `driverSplitFor`.
 */
export function splitFor(m: CommissionSnapshot | null | undefined, course: number): Split {
  return commissionSplit(course, ratesOf(m));
}

/** The Business's half of the split. Its Driver half is not computed. */
export function businessSplitFor(
  m: CommissionSnapshot | null | undefined,
  course: number,
): BusinessSplit {
  const { course: c, businessTotal, businessFeeHt, businessFeeVat, charged } =
    commissionSplit(course, businessRatesOf(m));
  return { course: c, businessTotal, businessFeeHt, businessFeeVat, charged };
}

/** The Driver's half of the split. Its Business half is not computed. */
export function driverSplitFor(
  m: CommissionSnapshot | null | undefined,
  course: number,
): DriverSplit {
  const { course: c, driverNet, driverFeeHt, driverFeeVat, charged } =
    commissionSplit(course, driverRatesOf(m));
  return { course: c, driverNet, driverFeeHt, driverFeeVat, charged };
}

/** What the Business pays, all in. The only fare number a Business ever sees. */
export function businessTotal(m: CommissionSnapshot | null | undefined, course: number): number {
  return businessSplitFor(m, course).businessTotal;
}

/**
 * Does money on this mission carry commission?
 *
 * docs/06 §1 states it as a rule rather than a list, because a rule cannot
 * drift: *money moving from the Business to the Driver carries commission,
 * always.* The fare, waiting, extra stops, a no-show and a Business
 * cancellation compensation all do. The one exception that reaches a total is a
 * DRIVER's cancellation penalty — it runs Driver → Business, so it is an
 * indemnity, not payment for transport. An agreed release moves no money at all
 * and never reaches these helpers.
 */
export function carriesCommission(m: {
  status: string;
  cancelled_by: string | null;
}): boolean {
  return !(m.status === "cancelled" && m.cancelled_by === "driver");
}

/**
 * What one amount costs a Business, all in — the single definition both the
 * expanded row and every total on Spend and History go through.
 */
export function businessCost(
  m: CommissionSnapshot & { status: string; cancelled_by: string | null },
  base: number,
): number {
  return carriesCommission(m) ? businessTotal(m, base) : commissionSplit(base, null).businessTotal;
}

/** What the Driver banks. The only fare number a Driver ever sees. */
export function driverNet(m: CommissionSnapshot | null | undefined, course: number): number {
  return driverSplitFor(m, course).driverNet;
}

// ── THE BILL, GROUPED BY WHAT EACH AMOUNT PAYS FOR ─────────────────────────
// docs/06 §3 lists the invoice as three lines — Course, Frais de service, TVA.
// That shape is exactly right while a trip is one charge. The moment a second
// one exists (waiting today; a no-show, a cancellation fee, extra stops later)
// the flat table pools every fee into one figure, and the number the row's own
// headline shows — the trip WITH its fee, `businessTotal(fare)` — appears
// nowhere in it. Founder, 2026-08-31, opening a trip with 21 minutes of
// waiting: the headline said 19,78 € and the first line under it said 17,20 €,
// and nothing on screen connected them.
//
// So the bill is built per ITEM, each carrying its own fee and VAT. One item
// renders exactly as §3 always did; a second makes the grouping visible.
//
// ⚑ THE LAST GROUP ABSORBS THE CENT, and this is not decoration. Splitting the
//   fee per item and rounding each independently disagrees with the pooled
//   total on 21 of the 106 live trips that have waiting — by a cent, every
//   time. An invoice whose lines do not add up to its total is wrong however
//   defensible the arithmetic (the same rule the VAT line already follows), so
//   the total stays exactly what it was and the final group takes the
//   remainder. Verified against all 106 by tests/commission.test.ts.

export type BillGroup = {
  /**
   * What this line IS, for the invoice and for VAT. ⚑ THE DISCRIMINANT — the
   * label below is per-audience wording (the Driver's screen says "No-show —
   * full fare" where the Business's bill says "Trip"); this is the shared truth
   * underneath, and the only thing `taxOf` may be asked about.
   */
  kind: BillLineKind;
  /** What this money paid for, in this audience's words. */
  label: string;
  /** Course-side — the amount before Kavenue's fee. */
  gross: number;
  feeHt: number;
  feeVat: number;
  /** gross + feeHt + feeVat. What this item cost, all in. */
  total: number;
};

/**
 * The Business's bill, one group per thing billed, totalling EXACTLY `total`.
 *
 * `items` are Course-side amounts in the order they should appear. Pass one and
 * you get one group, which renders as the flat §3 table it always was.
 */
export function billGroups(
  m: CommissionSnapshot | null | undefined,
  items: { kind: BillLineKind; label: string; gross: number }[],
  total: number,
): BillGroup[] {
  const groups = items.map((it) => {
    const s = businessSplitFor(m, it.gross);
    return { kind: it.kind, label: it.label, gross: it.gross, feeHt: s.businessFeeHt, feeVat: s.businessFeeVat, total: s.businessTotal };
  });
  if (groups.length === 0) return groups;

  // ⚑ The remainder lands on the LAST group's VAT, mirroring `commissionSplit`,
  // where the VAT line is the remainder for exactly this reason.
  const summed = groups.reduce((n, g) => n + Math.round(g.total * 100), 0);
  const drift = Math.round(total * 100) - summed;
  if (drift !== 0) {
    const last = groups[groups.length - 1];
    last.feeVat = Math.round(last.feeVat * 100 + drift) / 100;
    last.total = Math.round(last.total * 100 + drift) / 100;
  }
  return groups;
}

/**
 * The Course behind an all-in figure the Business typed or Kavenue pre-filled.
 *
 * The inverse of `businessTotal`, and the reason the mission form can put an
 * all-in number in front of a Business while `mission.ceiling` goes on storing
 * the fare.
 *
 * ⚑ WHY THIS IS A SEARCH AND NOT A DIVISION. `mission.ceiling` is
 * `numeric(10,2)`, so the Course is held to the cent — and multiplying a cent by
 * 1,15 skips cents. About one all-in value in eight is therefore not
 * reachable at all: type 170,00 and the nearest Courses give 169,99 or 170,02.
 * A plain division would store a Course whose all-in reads a cent away from the
 * number the Business typed, and the form would show one figure while the
 * Schedule showed another.
 *
 * So this returns the LARGEST Course whose all-in does not exceed `total`, and
 * the form snaps the field to it. A maximum is a promise not to go above a
 * number, so rounding down is the only direction that keeps the promise. The
 * Business sees the adjustment happen in the box rather than discovering it
 * later on an invoice.
 */
export function courseFromBusinessTotal(total: number, rates: Rates | null): number {
  const raw = Number(total);
  const t = cents(Number.isFinite(raw) ? Math.max(raw, 0) : 0);
  if (!rates || t === 0n) return euros(t);

  const factor = RATE_SCALE_SQ + rateUnits(rates.businessHt) * (RATE_SCALE + rateUnits(rates.feeVat));
  const allIn = (course: bigint) => divRound(course * factor, RATE_SCALE_SQ);

  let course = divRound(t * RATE_SCALE_SQ, factor);
  // At most one step either way — reachable all-ins sit ~1,15 cents apart — but
  // loop rather than assume, so a future rate cannot quietly break it.
  while (course > 0n && allIn(course) > t) course -= 1n;
  while (allIn(course + 1n) <= t) course += 1n;

  return euros(course);
}

/**
 * The VAT sitting inside a TTC amount, at a rate already proved positive.
 * Mirrors SQL `transport_vat()`. The arithmetic is byte-for-byte the
 * `transportVat` this replaced — `tests/vat.test.ts` pins it cent by cent.
 *
 * ⚑ NO LONGER EXPORTED, AND THAT IS THE POINT. The old signature took
 * `number | string | null | undefined` and answered 0 for BOTH a 0 rate and a
 * NULL one — a Driver under *franchise en base* and a trip nobody has taken
 * yet, given the same answer. Every render site then had to remember a
 * hand-written guard, and exactly one of them ever did. The only door now is
 * `taxLineFor`, which cannot be called without a resolved treatment.
 */
function vatInside(ttc: number, rate: number): number {
  const r = rateUnits(rate);
  if (r <= 0n) return 0;
  const raw = Number(ttc);
  const c = cents(Number.isFinite(raw) ? Math.max(raw, 0) : 0);
  return euros(c - divRound(c * RATE_SCALE, RATE_SCALE + r));
}

/**
 * A treatment, plus the money it comes to when there is any.
 *
 * ⚑ Read the rate from the mission's `transport_vat_rate` snapshot, never from
 * the Driver's live `vat_number`: a Driver who registers in September must not
 * change the VAT on a trip they drove in August. `lib/vat.ts` holds that rule.
 */
export function taxLineFor(amountTtc: number, t: TaxTreatment): TaxLine {
  return t.kind === "taxable"
    ? { kind: "taxable", rate: t.rate, amount: vatInside(amountTtc, t.rate) }
    : t;
}

/**
 * What a Driver actually keeps once VAT is settled — the fare minus the
 * commission, minus the VAT they collect and remit, plus the VAT they reclaim
 * on the commission. Equal to `driverNet` for a Driver under franchise en base,
 * who neither charges nor reclaims.
 */
export function driverKeeps(split: DriverSplit, tax: TaxTreatment): number {
  // ⚑ Every non-taxable treatment keeps the whole net — but they are NOT the
  // same fact and must not be collapsed upstream: a franchise Driver charges
  // none, and an undetermined one has simply not been established yet.
  if (tax.kind !== "taxable") return split.driverNet;
  const collected = vatInside(split.course, tax.rate);
  if (collected <= 0) return split.driverNet;
  return euros(cents(split.driverNet) - cents(collected) + cents(split.driverFeeVat));
}
