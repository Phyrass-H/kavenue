#!/usr/bin/env bash
# S83 — prove 2026-09-18c/d (raise the Ceiling, change the car) on a rebuild of the LIVE schema.
# ⚑ THROW-AWAY POSTGRES ONLY — 127.0.0.1 is hard-coded; never point it at Supabase. Start one first:
#
#   B=/opt/homebrew/opt/postgresql@17/bin; D=$TMPDIR/kvtrip; export LC_ALL=C
#   $B/initdb -D $D --locale=C -U postgres -A trust
#   $B/pg_ctl -D $D -o "-p 55488 -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -l $D.log start
#   bash .local/probe/pooled-trip-changes/run.sh          # from the repo root
#
#   1. replay.sh     Supabase stand-in + kavenue_schema.sql + every migration in apply order,
#                    the S83 security sweep's 18a/18b included (read from commit e1b78ac)
#   2. 18c, 18d      TWICE — each must be idempotent
#   3. fixtures.sql, cases.sql, then every case (each rolled back)
#   4. check.sql     the read-only file the founder pastes live: every row must read `pass`
#   5. the view      18d's mission_read must be 18a's, plus exactly the one new column
#   6. parity        pdp_ladder_steps vs lib/pdp.ts ladderSteps, course_from_business_total vs
#                    lib/commission.ts courseFromBusinessTotal — the SQL copies must never drift
# MIGRATIONS="a.sql b.sql" points step 2 at broken copies (mutants.sh) — the run must turn red.
# Exit 0 only if every case matches, check.sql has no FAIL, the view diff is empty and parity holds.
set -euo pipefail
export LC_ALL=C
PORT="${PORT:-55488}"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
M="$ROOT/docs/migrations"
DB="${DB:-kv_trip}"
MIGS="${MIGRATIONS:-$M/2026-09-18c_pooled_trip_changes.sql $M/2026-09-18d_mission_read_step_count.sql}"
q() { "$PSQL" -h 127.0.0.1 -p "$PORT" -U postgres -X -v ON_ERROR_STOP=1 -q "$@"; }
strip() { sed 's/;[[:space:]]*$//' "$HERE/check.sql"; }
bad=0

PORT="$PORT" bash "$HERE/replay.sh" "$DB" >/dev/null 2>&1 || { PORT="$PORT" bash "$HERE/replay.sh" "$DB"; exit 2; }

for pass in 1 2; do
  for m in $MIGS; do
    [ -f "$m" ] || { echo "run.sh: missing $m"; exit 2; }
    out=$(q -d "$DB" -f "$m" 2>&1) || { echo "$out"; echo "run.sh: $(basename "$m") FAILED to apply (pass $pass)"; exit 1; }
  done
done

q -d "$DB" -f "$HERE/fixtures.sql" >/dev/null
q -d "$DB" -f "$HERE/cases.sql" >/dev/null
q -d "$DB" -c "select kv.kv_run()" >/dev/null

q -d "$DB" -P pager=off -c "
  select n, case when pass then 'ok  ' else 'MISS' end as m, label, got
    from kv.kv_result order by n"
q -d "$DB" -P pager=off -c "select n, want, got from kv.kv_result where not pass order by n"
fails=$(q -d "$DB" -At -c "select count(*) from kv.kv_result where not pass")
total=$(q -d "$DB" -At -c "select count(*) from kv.kv_result")
[ "$fails" = 0 ] || bad=1

q -d "$DB" -P pager=off -f "$HERE/check.sql"
check_fails=$(q -d "$DB" -At -c "select count(*) from ($(strip)) x where result = 'FAIL'")
[ "$check_fails" = 0 ] || bad=1

# ── 5 · the view: 18a's body (commit e1b78ac) must equal 18d's minus the one appended column ──────
view_of() { awk '/^create or replace view public.mission_read/{f=1} f{print} f&&/^grant select on public.mission_read to authenticated;/{exit}'; }
a=$(git -C "$ROOT" show e1b78ac:docs/migrations/2026-09-18a_browser_surface_locked.sql | view_of)
d=$(view_of < "$M/2026-09-18d_mission_read_step_count.sql" \
    | sed -e 's/as hold_expires_at,$/as hold_expires_at/' \
    | awk '/-- ── S83 · the frozen step count/{skip=4; next} skip>0{skip--; next} {print}' \
    | awk 'BEGIN{prev=""} {if (NR>1) print prev; prev=$0} END{print prev}')
# drop the blank line the insertion leaves behind, then compare
view_diff=$(diff <(printf '%s\n' "$a" | grep -v '^$') <(printf '%s\n' "$d" | grep -v '^$') || true)
if [ -n "$view_diff" ]; then echo "VIEW DIFF (18d vs 18a):"; echo "$view_diff"; bad=1; fi

# ── 6 · parity with the TypeScript (skipped for mutants: PARITY=0) ──────────────────────────────
parity="skipped"
if [ "${PARITY:-1}" = 1 ]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  # the replayed rate card, so the TypeScript floor is computed from the very rows SQL prices with
  q -d "$DB" -c "\\copy (select id, market, tier::text, body::text, effective_from, floor_base, floor_per_km, ceiling_base, ceiling_per_km, ceiling_per_km_long, long_threshold_km, night_multiplier from rate_card) to '$tmp/cards.csv' csv"
  (cd "$ROOT" && npx --offline tsx "$HERE/parity.mts" "$tmp") >/dev/null
  q -d "$DB" -c "create temp table pl (c numeric, s numeric, w boolean, n int)" \
             -c "\\copy pl from '$tmp/ladder.csv' csv" \
             -c "create table kv.parity_ladder as select count(*) filter (where public.pdp_ladder_steps(c, s, w) is distinct from n) as bad, count(*) as total from pl"
  q -d "$DB" -c "create temp table pc (t numeric, b numeric, v numeric, c numeric)" \
             -c "\\copy pc from '$tmp/course.csv' csv" \
             -c "create table kv.parity_course as select count(*) filter (where public.course_from_business_total(t, b, v) is distinct from c) as bad, count(*) as total from pc"
  q -d "$DB" -c "create temp table pf (tier text, body text, km numeric, night boolean, f numeric)" \
             -c "\\copy pf from '$tmp/floor.csv' csv" \
             -c "create table kv.parity_floor as select count(*) filter (where round((select p.floor_price from public.mission_price(tier::vehicle_category, nullif(body, '')::body_type, km, night) p), 2) is distinct from f) as bad, count(*) as total from pf"
  lb=$(q -d "$DB" -At -c "select bad || '/' || total from kv.parity_ladder")
  fb=$(q -d "$DB" -At -c "select bad || '/' || total from kv.parity_floor")
  cb=$(q -d "$DB" -At -c "select bad || '/' || total from kv.parity_course")
  parity="ladder mismatches $lb · course mismatches $cb · floor mismatches $fb"
  case "$lb" in 0/*) ;; *) bad=1 ;; esac
  case "$cb" in 0/*) ;; *) bad=1 ;; esac
  case "$fb" in 0/*) ;; *) bad=1 ;; esac
fi

echo "cases: $((total - fails))/$total match · check.sql FAILs: $check_fails · view diff: $([ -z "$view_diff" ] && echo none || echo YES) · parity: $parity"
[ "$bad" = 0 ]
