-- A Driver may no longer write their own car row from the browser.
--
-- ⚑⚑ MEASURED LIVE, 2026-09-11, AS AN ORDINARY SIGNED-IN DRIVER (s46.driver@pickup.local):
--     UPDATE own vehicle  → ACCEPTED, rows=1
--     INSERT a second car → ACCEPTED, rows=1   (removed again with the service role)
--   The probe wrote each column back to the value it already had, so nothing changed —
--   but it proved the door is open. `p_vehicle_owner` (docs/kavenue_schema.sql:288) is
--   `FOR ALL`, and nothing ever revoked the table grant Supabase gives `authenticated`.
--
-- ⚑ WHAT THAT DOOR LETS A DRIVER DO. `PATCH /rest/v1/vehicle {"category":"luxury"}` on
--   an Eco car puts it in the First Pool: the Pool filters on vehicle.category
--   (app/(app)/pool/page.tsx:117) and accept_mission checks the same column
--   (2026-09-07_verified_gates_accept.sql:113-118), so both let them take the trip —
--   while the record still says it is, say, a Dacia. It also skips every rule the founder
--   made mandatory on 2026-09-11 (lib/vehicle-rules.ts): a plate "x", 99 seats, and an
--   INSERT with an early created_at, which then becomes "the car" because
--   getDriverContext takes the oldest row (lib/driver.ts). Found by the adversarial review
--   of the mandatory-car-fields change, which claimed the rule was "enforced at BOTH
--   doors" — this was the third.
--
-- ⚑ WHY IT WAS PARKED, AND WHY IT IS NOT LOW-VALUE ANY MORE. BACKLOG.md recorded this as
--   an "OPTIONAL companion … needs a founder ruling", on the grounds that it "buys only the
--   two states the app can't produce". The `driver` half was then closed on 2026-09-07,
--   once `verified` became a door. The vehicle half now matters for the same reason:
--   `category` IS a door — it decides which trips, and which fares, a Driver can take.
--
-- ⚑ A TABLE-LEVEL REVOKE, NOT A COLUMN-LEVEL ONE — this repo's own scar (S72: a column
--   revoke "succeeded" three times against a table grant and bit nothing). Same form as
--   § 3 of 2026-09-07_verified_gates_accept.sql.
--
-- ⚑ NOTHING IN THE APP LOSES ANYTHING. Grepped exhaustively on 2026-09-11: every write to
--   `vehicle` already goes through the SERVICE ROLE after a server-side check —
--   app/onboarding/actions.ts (insert + update) and app/(app)/settings/actions.ts
--   updateVehicle — and every seed does too. The user-session client in those files is used
--   only to ask who is signed in. Browser-session code only READS vehicle
--   (lib/driver.ts, lib/app-context.ts, lib/document-actions.ts), and reading is kept.
--
-- Applied by the founder in the Supabase SQL editor.

revoke insert, update, delete, truncate on vehicle from authenticated, anon;

-- ⚑ BELT AND BRACES, DELIBERATELY. With the grant gone a write policy is unreachable —
--   but replacing `FOR ALL` with a read-only policy means that if someone ever re-grants
--   a write by accident, RLS denies by default instead of silently re-opening the door.
--   Two things must now fail, not one.
drop policy if exists p_vehicle_owner on vehicle;
drop policy if exists p_vehicle_read on vehicle;
create policy p_vehicle_read on vehicle for select
  using (driver_id = current_driver_id() or app_role() = 'admin');

comment on table vehicle is
  'A Driver''s car. Written ONLY by the service role after lib/vehicle-rules.ts has checked it '
  '(onboarding + /settings/vehicle). Since 2026-09-11b a Driver cannot write it from the browser: '
  'category decides which trips they may take.';
