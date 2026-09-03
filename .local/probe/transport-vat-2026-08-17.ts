// Does the transport-VAT trigger actually fire, and on both branches?
//
// docs/06 §3: the transport line shows the VAT that ACTUALLY applies — 10 % if
// the assigned Driver is VAT-registered, 0 % if not — frozen at acceptance so a
// Driver who registers in September cannot change the VAT on an August trip.
// 2026-08-17_transport_vat_snapshot.sql does it with a trigger rather than four
// edits to money-critical RPCs, which means the thing worth proving is that the
// trigger fires on the STATE CHANGE, both ways.
//
// ⚑ THIS ONE MUTATES. It borrows a real pooled mission, assigns a Driver, reads
// what the trigger wrote, then puts driver_id back exactly as it found it — the
// clear-on-re-pool branch, which is the second half of the test. Every field it
// touches is asserted back to its original value at the end, and the 271
// baseline is re-checked. Read-only if it dies before the first write.
//
//   node .local/probe/transport-vat-2026-08-17.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let checks = 0;
let bad = 0;
const ok = (label: string, pass: boolean, detail = "") => {
  checks++;
  if (!pass) bad++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

// ── nothing was written to existing rows ───────────────────────────────────
const { count: stamped } = await db
  .from("mission")
  .select("id", { count: "exact", head: true })
  .not("transport_vat_rate", "is", null);
ok("no existing mission was stamped by the migration", stamped === 0, `${stamped} stamped`);

// ── the two kinds of Driver ────────────────────────────────────────────────
const { data: drivers } = await db.from("driver").select("id,first_name,last_name,vat_number").limit(200);
const registered = (drivers ?? []).find((d) => (d.vat_number ?? "").trim() !== "");
const unregistered = (drivers ?? []).find((d) => (d.vat_number ?? "").trim() === "");
ok("a VAT-registered Driver exists to test with", !!registered, [registered?.first_name, registered?.last_name].filter(Boolean).join(" ") || "none found");
ok(
  "an unregistered Driver exists to test with",
  !!unregistered,
  [unregistered?.first_name, unregistered?.last_name].filter(Boolean).join(" ") || "none found",
);

// The rate the trigger should be copying, read not assumed.
const { data: rate } = await db
  .from("commission_rate")
  .select("transport_vat_rate")
  .order("effective_from", { ascending: false })
  .limit(1)
  .maybeSingle();
const expected = Number(rate?.transport_vat_rate);
ok("the live generation carries a transport VAT rate", expected === 0.1, String(expected));

// ── a throwaway pooled mission, so no real row is ever touched ─────────────
// The Pool is legitimately empty (§ P expired all 23), and borrowing a settled
// mission to mutate its driver_id is not worth it when a disposable row costs
// one insert. Modelled on a real mission so every NOT NULL column is satisfied.
const { data: template } = await db
  .from("mission")
  .select("business_id,dispatcher_id,category,zone,pickup_address,pickup_lat,pickup_lng,dropoff_address,dropoff_lat,dropoff_lng")
  .not("dropoff_address", "is", null)
  .limit(1)
  .maybeSingle();

if (!template) {
  console.log("\nNo mission to model a probe row on — nothing mutated.");
  process.exit(1);
}

const { data: subject, error: insErr } = await db
  .from("mission")
  .insert({
    ...template,
    status: "pooled",
    reference: "S61VAT",
    pickup_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    ceiling: 138.61,
    pdp_start: 69.31,
    pdp_step: 6.93,
    pdp_interval: 10,
    commission_business_rate: 0.125,
    commission_driver_rate: 0.1,
    commission_vat_rate: 0.2,
  })
  .select("id,status,driver_id,transport_vat_rate,reference")
  .maybeSingle();

if (insErr || !subject) {
  console.log(`\nCould not create the probe row: ${insErr?.message}`);
  process.exit(1);
}
console.log(`\n  probe mission ${subject.id} (${subject.reference})`);

const restore = async () => {
  await db.from("status_event").delete().eq("mission_id", subject.id);
  await db.from("mission").delete().eq("id", subject.id);
};

try {
  // ── branch 1: a VAT-registered Driver accepts ────────────────────────────
  if (registered) {
    await db.from("mission").update({ driver_id: registered.id }).eq("id", subject.id);
    const { data: after } = await db
      .from("mission")
      .select("transport_vat_rate")
      .eq("id", subject.id)
      .maybeSingle();
    ok(
      "a registered Driver stamps the live rate",
      Number(after?.transport_vat_rate) === expected,
      `got ${after?.transport_vat_rate}`,
    );

    // ── branch 2: it re-pools, and the answer goes back to "not yet" ───────
    await db.from("mission").update({ driver_id: null }).eq("id", subject.id);
    const { data: repooled } = await db
      .from("mission")
      .select("transport_vat_rate")
      .eq("id", subject.id)
      .maybeSingle();
    ok(
      "re-pooling clears it — the next Driver's status is not this one's",
      repooled?.transport_vat_rate == null,
      `got ${repooled?.transport_vat_rate}`,
    );
  }

  // ── branch 3: a Driver under franchise en base charges nothing ───────────
  if (unregistered) {
    await db.from("mission").update({ driver_id: unregistered.id }).eq("id", subject.id);
    const { data: after } = await db
      .from("mission")
      .select("transport_vat_rate")
      .eq("id", subject.id)
      .maybeSingle();
    ok(
      "an unregistered Driver stamps 0, not NULL",
      Number(after?.transport_vat_rate) === 0 && after?.transport_vat_rate != null,
      `got ${after?.transport_vat_rate}`,
    );
  }
} finally {
  await restore();
}

// ── the probe row is gone ──────────────────────────────────────────────────
const { data: final } = await db
  .from("mission")
  .select("id")
  .eq("id", subject.id)
  .maybeSingle();
ok("probe row deleted", final == null, final ? "STILL THERE" : "gone");

const { count: total } = await db.from("mission").select("id", { count: "exact", head: true });
ok("mission baseline intact", total === 271, `${total} missions`);

const { count: stampedAfter } = await db
  .from("mission")
  .select("id", { count: "exact", head: true })
  .not("transport_vat_rate", "is", null);
ok("no row left stamped", stampedAfter === 0, `${stampedAfter} stamped`);

console.log(`\n${checks - bad}/${checks} ${bad === 0 ? "— GREEN" : "— FAILURES"}`);
process.exit(bad === 0 ? 0 : 1);
