#!/usr/bin/env bash
# S83 — rebuild the live database's SHAPE on a throw-away Postgres: Supabase's stand-in, then
# docs/kavenue_schema.sql, then every file in docs/migrations/ in the order it was APPLIED
# (apply-order.txt: the order git added them, the README's 2026-08-22 order, alphabetical within
# one commit). Rows are not copied — only tables, views, functions, grants, policies, triggers.
# ⚑ THROW-AWAY POSTGRES ONLY. It drops and recreates a database on 127.0.0.1 (hard-coded). Never
#   point it at Supabase. Start one first (NEXT_SESSION traps):
#
#   B=/opt/homebrew/opt/postgresql@17/bin; D=$TMPDIR/kvaudit; export LC_ALL=C
#   $B/initdb -D $D --locale=C -U postgres -A trust
#   $B/pg_ctl -D $D -o "-p 55477 -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -l $D.log start
#   bash .local/probe/rls-audit/replay.sh [dbname]        # from the repo root
set -euo pipefail
export LC_ALL=C
PORT="${PORT:-55477}"
PSQL="${PSQL:-/opt/homebrew/opt/postgresql@17/bin/psql}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
DB="${1:-kv_replay}"
q() { "$PSQL" -h 127.0.0.1 -p "$PORT" -U postgres -X -v ON_ERROR_STOP=1 -q "$@"; }

q -d postgres -c "drop database if exists $DB" -c "create database $DB encoding 'UTF8' template template0"
q -d "$DB" -f "$HERE/supabase-standin.sql"
q -d "$DB" -f "$ROOT/docs/kavenue_schema.sql"

# every migration on disk must be in the order list, and every listed file must exist
missing=$(comm -23 <(ls "$ROOT/docs/migrations" | grep '\.sql$' | sort) <(sed -e 's/^#pending //' -e 's/@.*//' "$HERE/apply-order.txt" | sort))
[ -z "$missing" ] || { echo "replay.sh: not in apply-order.txt: $missing"; exit 2; }

n=0
while read -r f; do
  [ -n "$f" ] || continue
  [[ "$f" == \#* ]] && continue   # `#pending <file>` = written, not yet pasted live: run.sh applies it
  n=$((n + 1))
  # `file@commit` = the file as it was when APPLIED, where it was edited afterwards (see apply-order.txt)
  if [[ "$f" == *@* ]]; then src=$(git -C "$ROOT" show "${f#*@}:docs/migrations/${f%@*}"); else src=$(cat "$ROOT/docs/migrations/$f"); fi
  if ! out=$(printf '%s\n' "$src" | q -d "$DB" -f - 2>&1); then
    echo "✗ $n $f"; echo "$out" | tail -5; exit 1
  fi
done < "$HERE/apply-order.txt"
echo "replayed: stand-in + schema + $n migrations into $DB"
