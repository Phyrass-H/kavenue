-- S83 — EVERYTHING a browser session can reach, one row per object. READ-ONLY: catalogs and
-- has_*_privilege only; it writes nothing, locks nothing, and is safe on the live database.
-- Paste into the Supabase SQL editor → Run → "Download CSV" (or copy the grid) and hand it back.
--
-- result = FAIL  → the database is not in the reviewed state (a hole, or something new nobody reviewed)
--          info  → a fact, recorded so the next session can compare; nothing to judge
--          pass  → matches the reviewed state
-- FAILs sort first. The lists at the top ARE the reviewed state: when the app legitimately needs a
-- new table, column grant, policy or function, the migration that adds it adds its line here too,
-- in the same commit. A new object with no line reads FAIL "(not reviewed)" — on purpose: that is
-- how the next hole of the D144/D145 shape gets caught by a paste instead of by luck.
--
-- Letters in the privilege strings, in this order: S I U D T (select insert update delete truncate).
--   upper case = table-wide · lower case = on some columns only · '-' = none.
-- ⚑ run.sh runs this same file on the throw-away Postgres: BEFORE the S83 migration it must show
--   FAILs (the holes), AFTER it must show none.

with
-- ══ REVIEWED STATE 1 · tables and views in public: what anon / authenticated may hold ══════════
-- ⚑ reads (S) are listed but decided by RLS; writes (I U D T) are the point. anon writes nothing.
rel_expected(rel, anon, auth) as (values
  ('access_request',        '-----', 'S----'),
  ('booking_voucher',       '-----', 'S----'),
  ('business',              '-----', 'S----'),
  ('business_event',        '-----', 'S----'),
  ('commission_rate',       '-----', 's----'),
  ('dispatcher',            '-----', 'S----'),
  ('document',              '-----', 'S----'),
  ('driver',                '-----', 'S----'),
  ('driver_event',          '-----', 'S----'),
  ('ledger_transaction',    '-----', 'S----'),
  ('mission',               '-----', 'siu--'),
  ('mission_amendment',     '-----', 'Siu--'),
  ('mission_cancellation',  '-----', 'S----'),
  ('mission_event',         '-----', 'S----'),
  ('mission_event_backfill','-----', '-----'),
  ('mission_event_type',    '-----', 'S----'),
  ('mission_guest_contact', '-----', 'SIUD-'),
  ('mission_hold',          '-----', 'S----'),
  ('mission_info_change',   '-----', 'Si---'),
  ('mission_release',       '-----', 'S----'),
  ('payment',               '-----', 'S----'),
  ('payout',                '-----', 'S----'),
  ('profile',               '-----', 'S----'),
  ('rate_card',             '-----', 'S----'),
  ('status_event',          '-----', 'S----'),
  ('vehicle',               '-----', 'S----'),
  ('vehicle_event',         '-----', 'S----'),
  ('mission_read',          '-----', 'S----'),
  ('mission_accept_quote',  '-----', '-----')),
-- ══ REVIEWED STATE 2 · column-level grants to authenticated (only where the table-wide one is off) ══
col_expected(rel, priv, cols) as (values
  ('mission', 'INSERT', 'board_file_path,board_name,business_id,category,ceiling,commission_business_rate,commission_driver_rate,commission_vat_rate,dispatcher_id,distance_km,dress_code,driver_flags,driver_message,dropoff_address,dropoff_label,dropoff_lat,dropoff_lng,duration_min,flight_number,luggage_count,luggage_only,night_applied,passenger_name,passenger_names,pax_count,pdp_interval,pdp_start,pdp_step,pickup_address,pickup_at,pickup_label,pickup_lat,pickup_lng,rate_card_id,reference,required_body_type,required_languages,required_make,required_model,speed_win,standard_vat_rate,status,waypoints,zone'),
  ('mission', 'UPDATE', 'board_file_path,board_name,business_id,category,ceiling,created_at,dispatcher_id,distance_km,dress_code,driver_flags,driver_message,dropoff_address,dropoff_label,dropoff_lat,dropoff_lng,duration_min,flight_number,info_edited_at,luggage_count,luggage_only,passenger_name,passenger_names,pax_count,pickup_address,pickup_at,pickup_label,pickup_lat,pickup_lng,reference,required_body_type,required_languages,required_make,required_model,speed_win,status,waypoints,zone'),
  ('mission', 'SELECT (walled)', 'base_fare,ceiling,commission_business_rate,commission_driver_rate,hold_expires_at,pdp_start,pdp_step_count,vehicle_body_type,vehicle_colour,vehicle_energy,vehicle_first_registration_date,vehicle_make,vehicle_model,vehicle_plate,vehicle_seats'),
  ('commission_rate', 'SELECT (walled)', 'driver_rate_ht,standard_vat_rate'),
  -- S83: a change request is inserted whole, then only ever withdrawn
  ('mission_amendment', 'INSERT', 'business_id,from_snapshot,mission_id,new_distance_km,new_dropoff_address,new_dropoff_label,new_dropoff_lat,new_dropoff_lng,new_duration_min,new_fare,new_pickup_address,new_pickup_label,new_pickup_lat,new_pickup_lng,new_waypoints,note,proposed_by,status'),
  ('mission_amendment', 'UPDATE', 'status'),
  ('mission_info_change', 'INSERT', 'business_id,edited_by,items,mission_id')),
-- ══ REVIEWED STATE 3 · every RLS policy, by name. A policy with no line here reads FAIL. ══════════
-- ⚑ `using_only_ok` = an UPDATE/ALL policy allowed to have no WITH CHECK, and why. Postgres then
--   reuses USING as the check, so every column USING does NOT look at is free (BACKLOG § 381).
pol_expected(tbl, pol, using_only_ok) as (values
  ('booking_voucher','p_voucher_read',null), ('business','p_business_read',null),
  ('business_event','p_business_event_admin_read',null), ('business_event','p_business_event_own_read',null),
  ('commission_rate','p_commission_rate_read',null), ('dispatcher','p_dispatcher_read',null),
  ('document','p_document_owner',null), ('driver','p_driver_self_read',null),
  ('driver_event','p_driver_event_admin_read',null), ('driver_event','p_driver_event_own_read',null),
  ('ledger_transaction','p_ledger_read',null),
  ('mission','p_mission_business_insert',null), ('mission','p_mission_business_read',null),
  ('mission','p_mission_business_update',null),
  ('mission','p_mission_driver_read',null),
  ('mission_amendment','p_amendment_business_insert',null), ('mission_amendment','p_amendment_business_update',null),
  ('mission_amendment','p_amendment_business_read',null), ('mission_amendment','p_amendment_driver_read',null),
  ('mission_cancellation','p_cancellation_business_read',null), ('mission_cancellation','p_cancellation_driver_read',null),
  ('mission_event','p_mission_event_admin_read',null), ('mission_event','p_mission_event_business_read',null),
  ('mission_event','p_mission_event_driver_read',null), ('mission_event_type','p_mission_event_type_read',null),
  ('mission_guest_contact','p_guestcontact_business_all',null), ('mission_hold','p_hold_self_read',null),
  ('mission_info_change','p_info_change_business_insert',null), ('mission_info_change','p_info_change_business_read',null),
  ('mission_release','p_release_business_read',null), ('mission_release','p_release_driver_read',null),
  ('payment','p_payment_read',null), ('payout','p_payout_read',null), ('profile','p_profile_self',null),
  ('rate_card','p_rate_card_read',null),
  ('status_event','p_statusevent_read',null), ('vehicle','p_vehicle_read',null),
  ('vehicle_event','p_vehicle_event_admin_read',null), ('vehicle_event','p_vehicle_event_own_read',null)),
-- ══ REVIEWED STATE 4 · every function in public (extensions' own excluded): EXECUTE anon/auth ══
-- ⚑ A trigger function cannot be called over the API, so for those only DEFINER + path is checked.
-- ⚑ phone_key / fold_text: index-expression helpers — NEVER revoke (D138 rule 5).
fn_expected(fn, exec) as (values
  ('accept_mission(uuid, numeric)','-/-'), ('accept_mission_call(uuid, numeric)','-/X'),
  ('app_role()','X/X'), ('board_guest(uuid)','-/-'), ('board_guest_call(uuid)','-/X'),
  ('business_cancel_mission(uuid, text, numeric)','-/-'), ('business_cancel_mission_call(uuid, text, numeric)','-/X'),
  ('business_declare_no_show(uuid, numeric)','-/-'), ('business_declare_no_show_call(uuid, numeric)','-/X'),
  ('close_release(uuid)','-/X'), ('current_business_id()','X/X'), ('current_driver_id()','X/X'),
  ('driver_cancel_mission(uuid, text, numeric)','-/-'), ('driver_cancel_mission_call(uuid, text, numeric)','-/X'),
  ('expire_stale_missions()','-/X'), ('log_mission_event(uuid, text, jsonb)','-/X'),
  ('mark_no_show(uuid, numeric)','-/-'), ('mark_no_show_call(uuid, numeric)','-/X'),
  ('mission_client_rates()','-/X'), ('place_hold(uuid, numeric)','-/X'),
  ('propose_release(uuid, text, numeric, uuid)','-/X'),
  ('reclaim_mission(uuid)','-/-'), ('reclaim_mission_call(uuid)','-/X'), ('release_hold(uuid)','-/X'),
  ('replace_vehicle(uuid, jsonb)','-/-'),
  ('respond_to_amendment(uuid, boolean, text)','-/-'), ('respond_to_amendment_call(uuid, boolean, text)','-/X'),
  ('respond_to_release(uuid, boolean, text)','-/-'), ('respond_to_release_call(uuid, boolean, text)','-/X'),
  ('sweep_lapsed_holds()','-/X'), ('working_car(uuid)','-/-'),
  ('admin_business_overview(timestamp with time zone, timestamp with time zone)','-/X'),
  ('admin_business_page(text, text, text, integer, integer, timestamp with time zone, timestamp with time zone)','-/X'),
  ('admin_driver_find(text, boolean, integer, integer)','-/X'),
  ('admin_driver_overview(timestamp with time zone, timestamp with time zone)','-/X'),
  ('admin_driver_page(text, text, text, text, integer, integer, timestamp with time zone, timestamp with time zone)','-/X'),
  ('admin_vehicle_find(text, text, text, boolean, integer, integer)','-/X'),
  ('admin_vehicle_overview(timestamp with time zone, timestamp with time zone)','-/X'),
  ('commission_for(timestamp with time zone)','X/X'), ('commission_split(numeric, numeric, numeric, numeric)','X/X'),
  ('fold_text(text)','X/X'), ('jsonb_changes(jsonb, jsonb, text[])','X/X'),
  ('mission_is_airport(mission)','X/X'), ('mission_opening_price(mission)','X/X'),
  ('mission_price(vehicle_category, body_type, numeric, boolean, text, timestamp with time zone)','X/X'),
  ('mission_waiting(mission, timestamp with time zone)','X/X'), ('phone_key(text)','X/X'),
  ('rate_card_for(vehicle_category, body_type, text, timestamp with time zone)','X/X'),
  ('transport_vat(numeric, numeric)','X/X'),
  -- trigger functions: EXECUTE not checked
  ('amendment_replaces_release()','trigger'), ('driver_event_write()','trigger'),
  ('hold_requires_approved_car()','trigger'), ('mission_hold_apply()','trigger'),
  ('mission_requires_approved_car()','trigger'), ('mission_stamp_vehicle()','trigger'),
  ('trg_mission_event_log()','trigger'), ('vehicle_event_write()','trigger'),
  ('vehicle_identity_frozen()','trigger'), ('mission_guard_client_write()','trigger'),
  ('mission_guard_guest_ready_at()','trigger'), ('mission_guard_pickup_at()','trigger'),
  ('trg_snapshot_transport_vat()','trigger'), ('mission_guard_board_file()','trigger'),
  ('mission_accept_quote_guard()','trigger'),
  ('mission_accept_quote_invalidate()','trigger'),
  -- S83 · 18c/18d (D147): raise the Ceiling / change the car on a pooled trip
  ('raise_ceiling(uuid, numeric)','-/X'),
  ('change_trip_car(uuid, vehicle_category, body_type, text, text, numeric)','-/X'),
  ('pdp_ladder_steps(numeric, numeric, boolean)','-/-'),
  ('course_from_business_total(numeric, numeric, numeric)','-/-'),
  ('trg_mission_price_terms_log()','trigger')),
-- ⚑ a guard that compares current_user must run as the caller: a DEFINER guard never fires (2026-07-22)
must_be_invoker(fn) as (values ('mission_guard_client_write()'), ('mission_guard_guest_ready_at()'), ('mission_guard_pickup_at()')),
-- ══ REVIEWED STATE 5 · triggers on public tables (all must be enabled) ══════════════════════════
trg_expected(tbl, trg) as (values
  ('driver','driver_event_write'), ('mission','mission_event_log'), ('mission','mission_requires_approved_car'),
  ('mission','mission_snapshot_transport_vat'), ('mission','mission_stamp_vehicle'),
  ('mission','trg_mission_guard_client_write'), ('mission','trg_mission_guard_guest_ready_at'),
  ('mission','trg_mission_guard_pickup_at'), ('mission','trg_mission_guard_board_file'),
  ('mission','mission_price_terms_log'),
  ('mission_accept_quote','trg_mission_accept_quote_guard'),
  ('mission','trg_mission_accept_quote_invalidate'),
  ('mission_amendment','trg_amendment_replaces_release'),
  ('mission_hold','hold_requires_approved_car'), ('mission_hold','mission_hold_apply'),
  ('vehicle','vehicle_event_write'), ('vehicle','vehicle_identity_frozen')),
-- ══ REVIEWED STATE 6 · storage buckets (created by the app, lib/supabase/storage.ts) ═══════════
bucket_expected(id, pub) as (values ('documents', 'private'), ('avatars', 'public')),
-- ══ REVIEWED STATE 7 · views that read as their OWNER (past the table's RLS and column walls) ══
owner_views(v) as (values ('mission_read')),

-- ─────────────────────────────────────────────────────────────────────────────────────────────
rels as (
  select c.oid, c.relname::text as rel, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')),
privstr as (
  select r.oid, rl.role,
         string_agg(case when has_table_privilege(rl.role, r.oid, p.priv) then upper(left(p.priv, 1))
                         when p.priv in ('SELECT', 'INSERT', 'UPDATE') and exists (
                                select 1 from pg_attribute a
                                 where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
                                   and has_column_privilege(rl.role, r.oid, a.attnum, p.priv))
                              then lower(left(p.priv, 1))
                         else '-' end, '' order by p.o) as s
    from rels r
   cross join (values ('anon'), ('authenticated')) rl(role)
   cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) with ordinality p(priv, o)
   group by r.oid, rl.role),
fns as (
  select p.oid, p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as fn, p.prosecdef,
         p.prorettype = 'trigger'::regtype as is_trigger,
         exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as path_pinned,
         case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'X' else '-' end || '/' ||
         case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'X' else '-' end as exec,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0) as public_exec
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'event_trigger'::regtype
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
checks(area, obj, chk, expected, actual) as (
  -- ── 0 · the platform facts everything else depends on (info) ──────────────────────────────
  select '0 platform', 'default privileges', coalesce(d.defaclrole::regrole::text, '?') || ' in ' ||
         coalesce(d.defaclnamespace::regnamespace::text, 'ALL SCHEMAS') || ' on ' ||
         case d.defaclobjtype when 'r' then 'TABLES+VIEWS' when 'f' then 'FUNCTIONS' when 'S' then 'SEQUENCES'
                              when 'T' then 'TYPES' when 'n' then 'SCHEMAS' else d.defaclobjtype::text end,
         null, array_to_string(d.defaclacl, ' ')
    from pg_default_acl d
  union all
  -- ⚑ THE ROOT CAUSE (S83): a NEW object must not reach a browser role by itself
  select '0 platform', 'default privileges', 'a NEW ' || o.label || ' in public goes to anon / authenticated by itself', 'no',
         case when exists (select 1 from pg_default_acl d cross join aclexplode(d.defaclacl) x
                            where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
                              and d.defaclnamespace in (0, 'public'::regnamespace) and d.defaclobjtype = o.t
                              and x.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
              then 'YES' else 'no' end
    from (values ('r', 'table or view'), ('f', 'function'), ('S', 'sequence')) o(t, label)
  union all
  -- a new function's EXECUTE for PUBLIC is built in; only a GLOBAL default entry without PUBLIC removes it
  select '0 platform', 'default privileges', 'a NEW function is callable by PUBLIC (every role)', 'no',
         case when exists (select 1 from pg_default_acl d
                            where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
                              and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
                              and not exists (select 1 from aclexplode(d.defaclacl) x where x.grantee = 0))
              then 'no' else 'YES' end
  union all
  select '0 platform', 'schema ' || n.nspname, 'USAGE anon / authenticated', null,
         has_schema_privilege('anon', n.oid, 'USAGE')::text || ' / ' || has_schema_privilege('authenticated', n.oid, 'USAGE')::text
    from pg_namespace n
   where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
     and (has_schema_privilege('anon', n.oid, 'USAGE') or has_schema_privilege('authenticated', n.oid, 'USAGE'))
  union all
  select '0 platform', 'roles', 'anon / authenticated bypass RLS or superuser', 'false / false',
         (select bool_or(rolbypassrls or rolsuper) from pg_roles where rolname = 'anon')::text || ' / ' ||
         (select bool_or(rolbypassrls or rolsuper) from pg_roles where rolname = 'authenticated')::text
  union all
  select '0 platform', 'server', 'Postgres version', null, current_setting('server_version')
  union all
  -- event triggers are not API-callable, but they run on every DDL as their owner — surfaced so a
  -- new one (a Supabase hook, or anything added in the dashboard) is never invisible. rls_auto_enable
  -- is Supabase's "enable RLS on each new table" helper; confirmed benign on live 2026-09-18 (S83).
  select '0 platform', 'event trigger ' || t.evtname, t.evtevent || ' -> ' || p.proname ||
         '() [' || case when p.prosecdef then 'definer' else 'invoker' end || ']', null,
         case t.evtenabled when 'O' then 'enabled' when 'D' then 'disabled' else t.evtenabled::text end
    from pg_event_trigger t join pg_proc p on p.oid = t.evtfoid
  union all
  select '0 platform', 'extensions', 'installed', null,
         (select string_agg(e.extname || '@' || e.extnamespace::regnamespace, ', ' order by e.extname) from pg_extension e)

  -- ── 1 · every table and view in public: who may hold what ─────────────────────────────────
  union all
  select '1 relation', r.rel || case r.relkind when 'v' then ' (view)' when 'm' then ' (MATVIEW)' when 'f' then ' (foreign)' else '' end,
         'privileges anon | authenticated',
         coalesce((select e.anon || ' | ' || e.auth from rel_expected e where e.rel = r.rel), '(not reviewed)'),
         (select s from privstr p where p.oid = r.oid and p.role = 'anon') || ' | ' ||
         (select s from privstr p where p.oid = r.oid and p.role = 'authenticated')
    from rels r
  union all
  select '1 relation', r.rel, 'row level security', 'on',
         case when r.relrowsecurity then 'on' else 'OFF' end || case when r.relforcerowsecurity then ' (forced)' else '' end
    from rels r where r.relkind in ('r', 'p')
  union all
  select '1 relation', r.rel, 'policies (RLS on, none = browsers see and write nothing)', null,
         (select count(*) from pg_policy p where p.polrelid = r.oid)::text
    from rels r where r.relkind in ('r', 'p')
  union all
  -- a matview has no RLS at all: any browser SELECT on one reads every row
  select '1 relation', r.rel || ' (MATVIEW)', 'browser can read a matview (no RLS exists on one)', 'false',
         (has_table_privilege('anon', r.oid, 'SELECT') or has_table_privilege('authenticated', r.oid, 'SELECT'))::text
    from rels r where r.relkind = 'm'
  union all
  -- ⚑ D145: a view is written AS ITS OWNER unless security_invoker is on
  select '1 relation', r.rel || ' (view)', 'reads as',
         case when r.rel in (select v from owner_views) then 'owner' else 'invoker' end,
         case when coalesce(array_to_string(r.reloptions, ','), '') like '%security_invoker=true%' then 'invoker' else 'owner' end
    from rels r where r.relkind = 'v'
  union all
  select '1 relation', r.rel || ' (view)', 'auto-updatable (a write privilege on it would reach the table)', null,
         case when pg_relation_is_updatable(r.oid, false) > 0 then 'yes' else 'no' end
    from rels r where r.relkind = 'v'

  -- ── 2 · column-level grants (the D144 lists), and the money walls ─────────────────────────
  union all
  select '2 column', e.rel, 'authenticated ' || e.priv || ' columns', e.cols,
         coalesce((select string_agg(a.attname, ',' order by a.attname)
                     from pg_attribute a
                    where a.attrelid = to_regclass('public.' || e.rel) and a.attnum > 0 and not a.attisdropped
                      and case when e.priv = 'SELECT (walled)'
                               then not has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
                               else has_column_privilege('authenticated', a.attrelid, a.attnum, split_part(e.priv, ' ', 1)) end), '(none)')
    from col_expected e
  union all
  -- every OTHER table: a column grant the lists above do not name is a new hole
  select '2 column', r.rel, 'authenticated column-only ' || p.priv || ' on a table with no reviewed list', '(none)',
         string_agg(a.attname, ',' order by a.attname)
    from rels r
    join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
   cross join (values ('INSERT'), ('UPDATE')) p(priv)
   where not has_table_privilege('authenticated', r.oid, p.priv)
     and has_column_privilege('authenticated', r.oid, a.attnum, p.priv)
     and not exists (select 1 from col_expected e where e.rel = r.rel and e.priv = p.priv)
   group by r.rel, p.priv

  -- ── 3 · every policy: known, and not a free pass ──────────────────────────────────────────
  union all
  select '3 policy', p.tablename || '.' || p.policyname,
         p.cmd || ' to ' || array_to_string(p.roles, ',') ||
         case when p.qual is not null then ' · USING' else '' end ||
         case when p.with_check is not null then ' · WITH CHECK' else '' end,
         case when e.pol is null then '(not reviewed)'
              when p.cmd in ('UPDATE', 'ALL') and p.with_check is null and e.using_only_ok is null then 'has WITH CHECK'
              when p.cmd <> 'SELECT' and (p.qual = 'true' or p.with_check = 'true') then 'no blanket true'
              else 'reviewed' end,
         case when p.cmd in ('UPDATE', 'ALL') and p.with_check is null and e.using_only_ok is null then 'USING only'
              when p.cmd <> 'SELECT' and (p.qual = 'true' or p.with_check = 'true') then 'true'
              when e.pol is null then 'new'
              else 'reviewed' end
    from pg_policies p
    left join pol_expected e on e.tbl = p.tablename and e.pol = p.policyname
   where p.schemaname = 'public'
  union all
  select '3 policy', e.tbl || '.' || e.pol, 'still exists', 'yes', 'MISSING'
    from pol_expected e
   where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = e.tbl and p.policyname = e.pol)

  -- ── 4 · every function: who can call it, and how it runs ──────────────────────────────────
  union all
  select '4 function', f.fn,
         case when f.prosecdef then 'DEFINER' else 'invoker' end || case when f.is_trigger then ' trigger' else '' end ||
         ' · EXECUTE anon/auth' || case when f.public_exec then ' · PUBLIC has EXECUTE' else '' end,
         coalesce((select case when e.exec = 'trigger' then 'trigger' else e.exec end from fn_expected e where e.fn = f.fn), '(not reviewed)'),
         case when f.is_trigger and exists (select 1 from fn_expected e where e.fn = f.fn and e.exec = 'trigger') then 'trigger' else f.exec end
    from fns f
  union all
  -- the body's fingerprint: equal to the throw-away rebuild's = the files ARE what is live
  select '4 function', f.fn, 'body fingerprint (md5 of the source)', null,
         (select left(md5(p.prosrc || coalesce(array_to_string(p.proconfig, ','), '')), 12) from pg_proc p where p.oid = f.oid)
    from fns f
  union all
  select '4 function', f.fn, 'SECURITY DEFINER with search_path pinned', 'pinned',
         case when f.path_pinned then 'pinned' else 'UNPINNED' end
    from fns f where f.prosecdef
  union all
  select '4 function', m.fn, 'must run as the caller (a DEFINER guard never fires)', 'invoker',
         coalesce((select case when f.prosecdef then 'DEFINER' else 'invoker' end from fns f where f.fn = m.fn), 'MISSING')
    from must_be_invoker m
  union all
  select '4 function', e.fn, 'still exists', 'yes', 'MISSING'
    from fn_expected e where not exists (select 1 from fns f where f.fn = e.fn)

  -- ── 5 · triggers ──────────────────────────────────────────────────────────────────────────
  union all
  select '5 trigger', c.relname || '.' || t.tgname, 'enabled',
         case when exists (select 1 from trg_expected e where e.tbl = c.relname and e.trg = t.tgname) then 'enabled' else '(not reviewed)' end,
         case t.tgenabled when 'O' then 'enabled' when 'D' then 'DISABLED' when 'R' then 'replica only' when 'A' then 'always' end
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and not t.tgisinternal
  union all
  select '5 trigger', e.tbl || '.' || e.trg, 'still exists', 'yes', 'MISSING'
    from trg_expected e
   where not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                      where c.relname = e.tbl and t.tgname = e.trg and not t.tgisinternal)

  -- ── 6 · storage: buckets and every policy on storage.objects / buckets ────────────────────
  union all
  select '6 storage', 'bucket ' || b.id, 'public?',
         coalesce((select e.pub from bucket_expected e where e.id = b.id), '(not reviewed)'),
         case when b.public then 'public' else 'private' end
    from storage.buckets b
  union all
  -- ⚑ the app reads and writes files ONLY through the service role, so NO storage policy should
  --   exist for a browser. Any row here is a door a signed-in session can use on the files directly.
  select '6 storage', 'policy ' || p.tablename || '.' || p.policyname,
         p.cmd || ' to ' || array_to_string(p.roles, ','), '(none expected)',
         coalesce(p.qual, '') || case when p.with_check is not null then ' CHECK ' || p.with_check else '' end
    from pg_policies p where p.schemaname = 'storage'
  union all
  select '6 storage', 'storage.objects', 'row level security', 'on',
         (select case when c.relrowsecurity then 'on' else 'OFF' end from pg_class c where c.oid = 'storage.objects'::regclass)
  union all
  select '6 storage', 'storage.objects', 'policies in total', '0',
         (select count(*) from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects')::text

  union all
  select '6 storage', 'mission.board_file_path', 'rows whose sign file is not the Business''s own board file', null,
         (select count(*) from public.mission m
           where m.board_file_path is not null
             and m.board_file_path not like 'mission/' || m.business_id::text || '/board-%')::text

  -- ── 7 · realtime: what a browser can subscribe to ─────────────────────────────────────────
  union all
  select '7 realtime', 'publication ' || p.pubname, 'tables published', '(none)',
         coalesce((select string_agg(t.schemaname || '.' || t.tablename, ', ' order by t.tablename)
                     from pg_publication_tables t where t.pubname = p.pubname), '(none)')
    from pg_publication p
  union all
  select '7 realtime', 'publication ' || p.pubname, 'publishes ALL TABLES', 'false', p.puballtables::text
    from pg_publication p
)
select case when expected is null then 'info'
            when expected = actual then 'pass'
            else 'FAIL' end as result,
       area, obj as object, chk as check, expected, actual
  from checks
 order by case when expected is null then 1 when expected = actual then 2 else 0 end, area, obj, chk;
