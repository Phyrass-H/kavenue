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
q() { "$PSQL" -h 127.0.0.1 -p "$PORT" -U postgres -X -v ON_ERROR_STOP=1 -q "$@"; }
strip() { sed 's/;[[:space:]]*$//' "$HERE/check.sql"; }

# The four S83 migrations, in PASTE ORDER — check.sql describes the state AFTER all four (the live
# database, 2026-09-18). 18a/18b are mine; 18c/18d (D147, the raise-Ceiling / change-car session)
# are on `main` and land in this branch at the merge. Until then, resolve each from the local file
# if present, else from origin/main — so the harness proves check.sql against the real live shape.
# ⚑ MIGRATIONS="…" overrides the list (point it at broken copies to prove the harness turns red).
TMPMIG="$(mktemp -d)"; trap 'rm -rf "$TMPMIG"' EXIT
resolve() {  # <migration filename> -> a path on disk (local, or extracted from origin/main)
  local f="$1"
  if [ -f "$ROOT/docs/migrations/$f" ]; then echo "$ROOT/docs/migrations/$f"; return; fi
  git -C "$ROOT" show "origin/main:docs/migrations/$f" > "$TMPMIG/$f" 2>/dev/null \
    && { echo "$TMPMIG/$f"; return; }
  echo "run.sh: cannot find $f locally or on origin/main" >&2; return 1
}
if [ -n "${MIGRATIONS:-}" ]; then
  MIGS="$MIGRATIONS"
else
  MIGS="$(resolve 2026-09-18a_browser_surface_locked.sql) $(resolve 2026-09-18b_money_from_the_row.sql) $(resolve 2026-09-18c_pooled_trip_changes.sql) $(resolve 2026-09-18d_mission_read_step_count.sql)" || exit 2
fi

bash "$HERE/replay.sh" "$DB" >/dev/null 2>&1 || { bash "$HERE/replay.sh" "$DB"; exit 2; }
q -d "$DB" -f "$HERE/fixtures.sql"
q -d "$DB" -f "$HERE/cases.sql"

echo "════ BEFORE — the live state as the migration files leave it"
q -d "$DB" -c "select kv.kv_run('before')"
check_before=$(q -d "$DB" -At -c "select count(*) from ($(strip)) x where result = 'FAIL'")

# In paste order; each file applied TWICE IN A ROW — the real idempotency test (a re-paste of the
# same file is a no-op). ⚑ Not the whole sequence twice: 18a and 18d both `create or replace` the
# view with different column sets, so re-running 18a after 18d would (rightly) refuse to drop 18d's
# column — a scenario that never happens on live, where each file is pasted once, in order.
for m in $MIGS; do
  [ -f "$m" ] || { echo "run.sh: missing $m"; exit 2; }
  for pass in 1 2; do
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
