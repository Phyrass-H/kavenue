#!/usr/bin/env bash
# S83 — prove the browser-surface holes on a rebuild of the live schema, then prove the S83
# migration closes them and breaks none of the app's own writes.
# ⚑ THROW-AWAY POSTGRES ONLY — 127.0.0.1 is hard-coded; never point it at Supabase. See replay.sh
#   for how to start one. From the repo root:   bash .local/probe/rls-audit/run.sh
#
#   1. replay.sh      stand-in + docs/kavenue_schema.sql + all 89 migrations, in apply order
#   2. fixtures.sql   two Businesses, two Drivers (one approved, one only signed up), six trips
#   3. cases.sql      every case BEFORE the migration (the holes must show)
#   4. the migration, TWICE (it must be idempotent), then every case AFTER
#   5. check.sql      BEFORE must show FAILs; AFTER must show none
# Exit 0 only if every case matches both its before and after expectation.
set -euo pipefail
export LC_ALL=C
PORT="${PORT:-55477}"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
DB=kv_rls_audit
# the S83 files, in paste order; MIGRATIONS="…" points it at broken copies to prove it turns red
MIGS="${MIGRATIONS:-$ROOT/docs/migrations/2026-09-18a_browser_surface_locked.sql $ROOT/docs/migrations/2026-09-18b_money_from_the_row.sql}"
q() { "$PSQL" -h 127.0.0.1 -p "$PORT" -U postgres -X -v ON_ERROR_STOP=1 -q "$@"; }
strip() { sed 's/;[[:space:]]*$//' "$HERE/check.sql"; }

bash "$HERE/replay.sh" "$DB" >/dev/null 2>&1 || { bash "$HERE/replay.sh" "$DB"; exit 2; }
q -d "$DB" -f "$HERE/fixtures.sql"
q -d "$DB" -f "$HERE/cases.sql"

echo "════ BEFORE — the live state as the migration files leave it"
q -d "$DB" -c "select kv.kv_run('before')"
check_before=$(q -d "$DB" -At -c "select count(*) from ($(strip)) x where result = 'FAIL'")

for pass in 1 2; do   # twice: every file must be idempotent
  for m in $MIGS; do
    [ -f "$m" ] || { echo "run.sh: missing $m"; exit 2; }
    echo "════ APPLY $(basename "$m") (pass $pass)"
    out=$(q -d "$DB" -f "$m" 2>&1) || { echo "$out"; echo "run.sh: $(basename "$m") FAILED to apply"; exit 1; }
  done
done

echo "════ AFTER"
q -d "$DB" -c "select kv.kv_run('after')"

q -d "$DB" -P pager=off -c "
  select n, case when bool_and(pass) then 'ok  ' else 'MISS' end as m, label,
         max(case when phase = 'before' then got end) as before,
         max(case when phase = 'after'  then got end) as after
    from kv.kv_result group by n, label order by n"

q -d "$DB" -P pager=off -c "select result, area, object, \"check\", expected, actual from ($(strip)) x where result = 'FAIL'"

fails=$(q -d "$DB" -At -c "select count(*) from kv.kv_result where not pass")
holes=$(q -d "$DB" -At -c "select count(*) from kv.kv_result where phase = 'before' and label like 'HOLE%' and got like 'ok%'")
check_after=$(q -d "$DB" -At -c "select count(*) from ($(strip)) x where result = 'FAIL'")
total=$(q -d "$DB" -At -c "select count(*) from kv.kv_result")
echo "cases: $((total - fails))/$total match · holes open before: $holes · check.sql FAILs before: $check_before, after: $check_after"
[ "$fails" = 0 ] && [ "$check_after" = 0 ] && [ "$holes" -gt 0 ] && [ "$check_before" -gt 0 ]
