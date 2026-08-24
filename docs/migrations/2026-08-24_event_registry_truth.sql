-- 2026-08-24 — § AG: make the event registry tell the truth about what is wired.
--
-- `mission_event_type` is documentation with a primary key: it is the table a
-- future reader joins against to ask "what does this log contain?". It listed
-- eleven types as captured_by='app'. Until today NONE of them were written by
-- anything — log_mission_event() was called from nowhere in the app.
--
-- S66 wired NINE of them. Two are deliberately left unwritten, and the registry
-- must say so rather than implying a writer that does not exist. A log whose own
-- index is wrong is worse than no index: it makes a missing row look like an
-- event that never happened.
--
-- ⚑ DATA ONLY. No schema change, no function change. Safe to re-run.

-- 1. The nine that are now genuinely written from the app (source='app').
--    checked_in · close_answered · info_changed · amendment_proposed ·
--    amendment_answered · release_proposed · release_answered ·
--    accept_rejected · contact_revealed
update mission_event_type
   set captured_by = 'app'
 where event_type in ('checked_in','close_answered','info_changed',
                      'amendment_proposed','amendment_answered',
                      'release_proposed','release_answered',
                      'accept_rejected','contact_revealed');

-- 2. THE TWO THAT ARE NOT WIRED, ON PURPOSE (founder, 2026-08-24).
--
--    Both record a Driver BROWSING — scrolling the Pool, or opening a trip that
--    is not theirs. Founder: *"a driver that looks around the pool it's just
--    browsing and brings no values to us unless we need to understand like in a
--    shopping website"*. At nine Drivers you can phone them and get a better
--    answer than a log would give.
--
--    The one question impressions would genuinely answer — did a trip expire
--    unseen, or seen and refused? — is reachable WITHOUT them, by asking which
--    Drivers matched its category, zone and radius at the time. That is a query
--    over data already stored, not a new firehose (~300k rows/day at 200 Drivers).
--
--    'none' is the registry's existing word for "defined, nothing writes it".
--    log_mission_event() still ACCEPTS both from a browser JWT — the allowlist is
--    unchanged, so switching them on later needs no migration, only a caller.
update mission_event_type
   set captured_by = 'none',
       note = 'Deliberately not recorded (founder, 2026-08-24, S66): this is Driver browsing, '
              'not a fact about a trip. Revisit when the Driver base is too large to phone — '
              'see DECISIONS D87 and BACKLOG AF.'
 where event_type in ('pool_impression','mission_viewed');

-- 3. `guaranteed` is the column that must never drift: only the trigger can
--    promise completeness. Every app-written type is best effort by construction
--    — a crash between the action and the log loses the row silently.
update mission_event_type set guaranteed = false where captured_by in ('app','rpc','none');
update mission_event_type set guaranteed = true  where captured_by = 'db_trigger';
