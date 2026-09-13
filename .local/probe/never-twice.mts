// Does "never twice" hold on the live database — in the spellings the app actually stores?
//
//   npx tsx .local/probe/never-twice.mts
//
// ⚑ RUN THIS AFTER PASTING docs/migrations/2026-09-13b_never_twice.sql. Before that it stops at
// the first check and writes nothing: a probe whose purpose is to fail before a migration must
// be harmless when it fails (car-gate.mts, and S76's lesson behind it).
//
// ⚑ EACH CHECK TRIES TO WRITE A DUPLICATE AND EXPECTS A REFUSAL. If one is ever ACCEPTED — the
// index is missing — the original value is written straight back and the restore is asserted,
// so a red run never leaves two accounts sharing an identity.
//
// ⚑ THE DUPLICATE IS ALWAYS SPELLED DIFFERENTLY FROM THE STORED VALUE. The S78 phone index
// compared digits only, so "+33 6 …" and "06 …" were two phones; a probe that copied the value
// verbatim would have passed on that broken index. S79 found it by reading, not by a probe.
//
// ⚑ AND IT CHECKS THE SENTENCE, NOT JUST THE REFUSAL. A 23505 the app cannot name reads
// "Something went wrong"; each refusal must map to its own code through lib/duplicate.ts.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { duplicateWhy, type DuplicateWhy } from "../../lib/duplicate.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};

// ── the guard: is the migration there at all? ───────────────────────────────────────────
const { data: folded, error: pkErr } = await db.rpc("phone_key", { p: "+33 6 12 34 56 78" });
if (pkErr) {
  console.log("FAIL  phone_key() does not exist — paste docs/migrations/2026-09-13b_never_twice.sql first");
  process.exit(1);
}
t("phone_key() folds +33 onto the national 0", folded === "0612345678", String(folded));
const keyOf = async (p: string) => (await db.rpc("phone_key", { p })).data as string;

/** Write `value` into `table.column` on row `id`, expecting the index to refuse it. */
async function refused(
  name: string, table: string, id: string, column: string,
  value: string, was: string | null, want: DuplicateWhy,
) {
  if (value === was) { t(`${name} (the probe value is not a different spelling)`, false, value); return; }
  const { error } = await db.from(table).update({ [column]: value }).eq("id", id).select("id");
  if (!error) {
    // ACCEPTED — the lock is not there. Put the value back before anything else.
    const back = await db.from(table).update({ [column]: was }).eq("id", id).select(column).single();
    const restored = !back.error && (back.data as unknown as Record<string, unknown>)[column] === was;
    t(`${name} — IT WAS ACCEPTED`, false,
      restored ? "value restored" : `⚑ RESTORE FAILED — set ${table}.${column} back to ${was} on ${id}`);
    return;
  }
  const why = duplicateWhy(error);
  t(name, error.code === "23505" && why === want, `${error.code} → ${why ?? "no sentence"}`);
}

// ── a Driver ─────────────────────────────────────────────────────────────────────────────
console.log("\n── a Driver ──");
const { data: pair } = await db.from("driver").select("id, email, phone, pro_card_number")
  .in("email", ["demo.driver@pickup.local", "s46.driver@pickup.local"]);
const demo = pair?.find((d) => d.email === "demo.driver@pickup.local");
const s46 = pair?.find((d) => d.email === "s46.driver@pickup.local");
if (!demo?.phone || !demo.pro_card_number || !s46) {
  console.log("FAIL  the probe Drivers or their fixtures are missing — run .local/seed/seed-probe-accounts.mts");
  process.exit(1);
}
await refused(`s46 cannot take demo's phone, written ${await keyOf(demo.phone)}`,
  "driver", s46.id, "phone", await keyOf(demo.phone), s46.phone, "phone_taken");
await refused(`s46 cannot take demo's card number, written with spaces`,
  "driver", s46.id, "pro_card_number", demo.pro_card_number.replace(/-/g, " "), s46.pro_card_number, "pro_card_taken");

// ── a Business: the fold again, on the other side ────────────────────────────────────────
console.log("\n── a Business ──");
const { data: parents } = await db.from("business").select("id, name, reception_phone")
  .is("parent_business_id", null).not("reception_phone", "is", null).order("id").limit(2);
if ((parents?.length ?? 0) < 2) {
  t("two parent Businesses with a phone to compare", false, `${parents?.length ?? 0} found`);
} else {
  const [a, b] = parents!;
  await refused(`${b.name} cannot take ${a.name}'s switchboard, spelled another way`,
    "business", b.id, "reception_phone", await keyOf(a.reception_phone), b.reception_phone, "phone_taken");
}

// ── a Dispatcher: the LAST index in the file, so the file ran to the end ─────────────────
console.log("\n── a Dispatcher ──");
const { data: desks } = await db.from("dispatcher").select("id, email").not("email", "is", null).order("id").limit(2);
if ((desks?.length ?? 0) < 2) {
  t("two Dispatchers with an email to compare", false, `${desks?.length ?? 0} found`);
} else {
  const [a, b] = desks!;
  await refused("a Dispatcher cannot take another's email, in capitals",
    "dispatcher", b.id, "email", a.email.toUpperCase(), b.email, "email_taken");
}

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
