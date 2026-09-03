# `.local/seed` — the test dataset

Git-ignored. Writes to the LIVE Supabase database.

## The current dataset (2026-08-26, S68)

Three months of trading, built to be tested against. Run in this order from the
repo root — each step depends on the one before it:

```
npx tsx .local/seed/bleach.mts --confirm      # DESTRUCTIVE. Empties every operational table.
npx tsx .local/seed/seed-3months.mts          # 4 hotels · 6 desks · 11 Drivers, with cars
npx tsx .local/seed/seed-trips.mts            # ~340 trips, WALKED through real transitions (~4 min)
npx tsx .local/seed/restamp.mts               # re-date the log + relabel it source='seed'
npx tsx .local/seed/seed-sidetables.mts       # cancellations · release requests · documents
npx tsx .local/seed/seed-live.mts             # 7 trips live right now — their log stays OBSERVED
npx tsx .local/seed/seed-hard-cases.mts       # the passed-around and the unservable
npx tsx .local/probe/dataset-audit.mts        # 30 checks. Trust this, not the seed's own output.
```

`reset-trips.mts` wipes trips + the log but keeps the people, for re-running the
trip seed without paying the auth-user cost again.

## The three things that matter about it

**1 · Every trip was WALKED, not inserted finished.** One UPDATE per status
change, so the log trigger computes the event types itself — `repooled` vs
`pooled`, `no_show` vs `completed`, the from/to payload. `restamp.mts` refuses
to touch a mission whose event count disagrees with the walk, because a
mismatch means every timestamp after it would be attached to the wrong event.

**2 · The seeded log says `source='seed'`, and that is not cosmetic.**
`mission_event.occurred_at` defaults to `clock_timestamp()`, so walking three
months of history writes a log in which everything happened this afternoon.
Correcting the dates is easy; the trap is leaving the rows labelled
`db_trigger`, which is a promise that the database *watched it happen*.
`isObserved()` admits nothing but `db_trigger`, and the console renders those
entries as fact. Re-dating them under the old label would have manufactured
evidence — the exact shape of D86–D92. Only the trips from `seed-live.mts` are
genuinely observed.

**3 · Every assigned Driver could actually have taken their trip.** Right class,
right body, inside their radius, signed up before they accepted, and no other
trip within ±90 minutes. Otherwise the console's own matcher would open a
finished trip and report that the Driver who drove it was never eligible.

## Superseded — do not run these

`seed-fleet.mjs` · `s64-curve.ts` · `s61-priced.ts` · `recover.mjs` — the old
per-session seeders. Their rows were bleached on 2026-08-26 and their
assumptions (a 271-mission baseline, `S64CURVE` demo trips that aged out every
session) no longer hold. Kept only for the code, not to be run.
