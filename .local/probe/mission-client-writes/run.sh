#!/usr/bin/env bash
# S82 — prove the mission write hole, then prove 2026-09-17_mission_client_writes.sql closes it.
# ⚑ THROW-AWAY POSTGRES ONLY. It drops and recreates a database, so it only ever talks to
#   127.0.0.1 (hard-coded in q). Never point it at Supabase. Start one first (NEXT_SESSION traps: initdb --locale=C,
#   LC_ALL=C; macOS caps a unix-socket path at 103 bytes, so use TCP):
#
#   B=/opt/homebrew/opt/postgresql@17/bin; D=$TMPDIR/kvpg; export LC_ALL=C
#   $B/initdb -D $D --locale=C -U postgres -A trust
#   $B/pg_ctl -D $D -o "-p 55432 -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -l $D.log start
#   bash .local/probe/mission-client-writes/run.sh          # from the repo root
#
# The mission policies and every grant/guard that decides a client write are read from docs/ at
# run time, never retyped. Exit 0 only if every case matches its before AND after expectation,
# and check.sql reads all `pass` after (and not all pass before).
set -euo pipefail
export LC_ALL=C
PORT="${PORT:-55432}"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
M="$ROOT/docs/migrations"
DB=kv_mission_client_writes
MIG="${MIGRATION:-$M/2026-09-17_mission_client_writes.sql}"   # run.sh can be pointed at a broken copy, to prove it turns red
MIGB="${MIGRATION_B:-$M/2026-09-17b_mission_read_is_read_only.sql}"   # part (b): the view, revoked from the two browser roles
q() { "$PSQL" -h 127.0.0.1 -p "$PORT" -U postgres -X -v ON_ERROR_STOP=1 -q "$@"; }

q -d postgres -c "drop database if exists $DB" -c "create database $DB encoding 'UTF8' template template0"

build="$(mktemp)"; trap 'rm -f "$build"' EXIT
{
  cat "$HERE/standin.sql"
  echo "-- ── REAL: commission_for() (2026-08-17_commission.sql)"
  awk '/^create or replace function commission_for\(/{f=1} f{print} f&&/^\$\$;/{exit}' "$M/2026-08-17_commission.sql"
  echo "-- ── REAL: the mission policies (docs/kavenue_schema.sql)"
  awk '/^create policy p_mission_/{f=1} f{print} f&&/\);$/{f=0}' "$ROOT/docs/kavenue_schema.sql"
  echo "-- ── REAL: 2026-08-31d, 31e, 31f"
  cat "$M/2026-08-31d_money_column_walls_3_the_revoke_that_did_nothing.sql"
  cat "$M/2026-08-31e_money_column_walls_4_the_same_no_op_again.sql"
  cat "$M/2026-08-31f_guest_ready_at_the_revoke_made_real.sql"
  echo "-- ── REAL: 2026-09-04's SELECT grant"
  grep -E '^grant select \(standard_vat_rate\) on public\.mission to authenticated;$' "$M/2026-09-04_standard_vat_rate.sql"
  echo "-- ── REAL: the mission_read view, its newest full rebuild (2026-09-12a) with its own revoke/grant"
  sed -n "/^drop view if exists public.mission_read;/,/^grant select on public.mission_read to authenticated;/p" "$M/2026-09-12a_mission_read_carries_the_car.sql"
  echo "-- ── REAL: the guest_ready_at guard (2026-07-22 fix) and the pickup_at guard (2026-07-22_waiting_fee § 8)"
  cat "$M/2026-07-22_guest_ready_at_guard_fix.sql"
  awk '/^create or replace function mission_guard_pickup_at\(\)/{f=1} f{print} f&&/execute function mission_guard_pickup_at\(\);/{exit}' "$M/2026-07-22_waiting_fee.sql"
} > "$build"

# every REAL piece must actually have been found, or the proof is of nothing
for want in "function commission_for" "p_mission_business_update" "p_mission_business_insert" \
            "grant update (" "grant select (standard_vat_rate)" "trg_mission_guard_pickup_at" \
            "trg_mission_guard_guest_ready_at" \
            "create view public.mission_read" "grant select on public.mission_read to authenticated"; do
  grep -qF "$want" "$build" || { echo "run.sh: could not extract '$want' from docs/ — stopping"; exit 2; }
done

q -d "$DB" -f "$build"
q -d "$DB" -f "$HERE/cases.sql"

echo "════ BEFORE — 31f's grants (the live state before this migration)"
q -d "$DB" -c "select kv_run('before')"
q -d "$DB" -P pager=off -c "select count(*) filter (where result = 'FAIL') as check_sql_fails_before from ($(sed 's/;[[:space:]]*$//' "$HERE/check.sql")) x"

echo "════ APPLY the migration — twice (it must be idempotent)"
q -d "$DB" -f "$MIG"
q -d "$DB" -f "$MIGB"
q -d "$DB" -f "$MIG"
q -d "$DB" -f "$MIGB"

echo "════ AFTER"
q -d "$DB" -c "select kv_run('after')"

q -d "$DB" -P pager=off -c "
  select phase, n, case when pass then 'ok  ' else 'MISS' end as m, label, got
    from kv_result order by n, phase desc"

q -d "$DB" -P pager=off -f "$HERE/check.sql"

fails=$(q -d "$DB" -At -c "select count(*) from kv_result where not pass")
check_after=$(q -d "$DB" -At -c "select count(*) from ($(sed 's/;[[:space:]]*$//' "$HERE/check.sql")) x where result = 'FAIL'")
holes_before=$(q -d "$DB" -At -c "select count(*) from kv_result where phase = 'before' and label like 'HOLE%' and got like 'ok rows=1%'")
total=$(q -d "$DB" -At -c "select count(*) from kv_result")
echo "cases: $((total - fails))/$total match · holes open before: $holes_before · check.sql FAILs after: $check_after"
[ "$fails" = 0 ] && [ "$check_after" = 0 ] && [ "$holes_before" -gt 0 ]
