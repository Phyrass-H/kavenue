#!/usr/bin/env bash
# S83 — every guard in 18c/18d must be load-bearing: break each one in a copy, and run.sh must
# turn RED. A mutant that stays green is a guard nothing tests. ⚑ THROW-AWAY POSTGRES ONLY (run.sh).
#   bash .local/probe/pooled-trip-changes/mutants.sh        # from the repo root
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
C="$ROOT/docs/migrations/2026-09-18c_pooled_trip_changes.sql"
D="$ROOT/docs/migrations/2026-09-18d_mission_read_step_count.sql"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# name | file (c|d) | node expression turning the text `s` into the broken copy (first match only)
mutants=(
  "no hold check on a raise|c|s.replace(\"h.outcome = 'open' and h.expires_at > now()) then\", \"false) then\")"
  "hold read from outcome alone, not the clock|c|s.replace(\"h.outcome = 'open' and h.expires_at > now()\", \"h.outcome = 'open'\")"
  "the freeze ignores the 14-day opening|c|s.replace(\"and now() > v_mission.pickup_at - interval '14 days' then\", \"then\")"
  "a second raise overwrites the frozen count|c|s.replace('pdp_step_count = coalesce(pdp_step_count, v_n)', 'pdp_step_count = v_n')"
  "a raise to the same Ceiling is allowed|c|s.replace('v_new <= v_mission.ceiling', 'v_new < v_mission.ceiling')"
  "another Business's trip can be raised|c|s.replace('or v_mission.business_id is distinct from v_business', '')"
  "a car change ignores the floor|c|s.replace('if v_new < v_floor then', 'if false then')"
  "a Ceiling rides along on a same-price car change|c|s.replace('if p_ceiling is not null and v_new is distinct from v_mission.ceiling then', 'if false then')"
  "a luggage run can change car|c|s.replace('if v_mission.luggage_only then', 'if false then')"
  "a Sedan takes six Guests|c|s.replace(\"if p_body = 'sedan' and coalesce(v_mission.pax_count, 0) > 4 then\", 'if false then')"
  "the trigger logs a column merely mentioned|c|s.replace('then\n    return null;\n  end if;\n\n  -- WHO', 'then\n    null;\n  end if;\n\n  -- WHO')"
  "the trigger fires outside the Pool|c|s.replace(\"  when (old.status = 'pooled' and new.status = 'pooled')\n\", '')"
  "anon may call raise_ceiling|c|s.replace('commit;', 'grant execute on function public.raise_ceiling(uuid, numeric) to anon;\ncommit;')"
  "the helpers are callable from a browser|c|s.replace('commit;', 'grant execute on function public.pdp_ladder_steps(numeric, numeric, boolean) to authenticated;\ncommit;')"
  "the view shows the frozen count to a Driver|d|s.replace('then null else m.pdp_step_count end', 'then m.pdp_step_count else m.pdp_step_count end')"
)

red=0; green=0; i=0
for m in "${mutants[@]}"; do
  i=$((i + 1))
  name="${m%%|*}"; rest="${m#*|}"; which="${rest%%|*}"; expr="${rest#*|}"
  src=$([ "$which" = c ] && echo "$C" || echo "$D")
  out="$tmp/m$i.sql"
  node -e "const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');const t=($expr);if(t===s){console.error('mutant did not change the file');process.exit(3)}fs.writeFileSync(process.argv[2],t)" "$src" "$out" \
    || { echo "✗ could not build mutant: $name"; green=$((green + 1)); continue; }
  if [ "$which" = c ]; then migs="$out $D"; else migs="$C $out"; fi
  if MIGRATIONS="$migs" PARITY=0 bash "$HERE/run.sh" >"$tmp/log$i" 2>&1; then
    echo "✗ STAYED GREEN: $name"; green=$((green + 1))
  else
    echo "✓ red: $name — $(tail -1 "$tmp/log$i")"; red=$((red + 1))
  fi
done
echo "mutants: $red red, $green green (every one must be red)"
[ "$green" = 0 ]
