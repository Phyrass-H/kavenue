-- S83 — READ-ONLY. Paste into the Supabase SQL editor AFTER 2026-09-18c and 18d. Every row must
-- read `pass`. Nothing here writes: it only reads the catalogue (pg_proc, pg_trigger,
-- information_schema) and the privilege functions.
select case when ok then 'pass' else 'FAIL' end as result, item, detail
from (values
  -- the two actions: definer, pinned search_path, callable by a signed-in session only
  ((select bool_and(prosecdef) from pg_proc where proname in ('raise_ceiling', 'change_trip_car') and pronamespace = 'public'::regnamespace),
   'raise_ceiling / change_trip_car are SECURITY DEFINER', 'prosecdef'),
  ((select bool_and(exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) from pg_proc
     where proname in ('raise_ceiling', 'change_trip_car', 'pdp_ladder_steps', 'course_from_business_total', 'trg_mission_price_terms_log')
       and pronamespace = 'public'::regnamespace),
   'every new function pins its search_path', 'proconfig'),
  ((select count(*) = 2 from pg_proc where proname in ('raise_ceiling', 'change_trip_car') and pronamespace = 'public'::regnamespace),
   'exactly one raise_ceiling and one change_trip_car', 'no stale overload left behind'),
  (has_function_privilege('authenticated', 'public.raise_ceiling(uuid, numeric)', 'execute')
     and not has_function_privilege('anon', 'public.raise_ceiling(uuid, numeric)', 'execute'),
   'raise_ceiling: signed-in yes, anon no', 'has_function_privilege'),
  (has_function_privilege('authenticated', 'public.change_trip_car(uuid, vehicle_category, body_type, text, text, numeric)', 'execute')
     and not has_function_privilege('anon', 'public.change_trip_car(uuid, vehicle_category, body_type, text, text, numeric)', 'execute'),
   'change_trip_car: signed-in yes, anon no', 'has_function_privilege'),
  ((select not bool_or(a.grantee = 0) from pg_proc p cross join lateral aclexplode(p.proacl) a
     where p.proname in ('raise_ceiling', 'change_trip_car', 'pdp_ladder_steps', 'course_from_business_total', 'trg_mission_price_terms_log')
       and p.pronamespace = 'public'::regnamespace),
   'no new function is executable by PUBLIC', 'aclexplode grantee 0'),
  -- the helpers: never from a browser
  (not has_function_privilege('authenticated', 'public.pdp_ladder_steps(numeric, numeric, boolean)', 'execute')
     and not has_function_privilege('anon', 'public.pdp_ladder_steps(numeric, numeric, boolean)', 'execute'),
   'pdp_ladder_steps: not callable by anon / authenticated', 'has_function_privilege'),
  (not has_function_privilege('authenticated', 'public.course_from_business_total(numeric, numeric, numeric)', 'execute')
     and not has_function_privilege('anon', 'public.course_from_business_total(numeric, numeric, numeric)', 'execute'),
   'course_from_business_total: not callable by anon / authenticated', 'has_function_privilege'),
  -- the record
  ((select count(*) = 1 from pg_trigger where tgname = 'mission_price_terms_log' and tgrelid = 'public.mission'::regclass and tgenabled = 'O'),
   'the price-terms trigger exists and is enabled', 'pg_trigger'),
  ((select prosecdef from pg_proc where proname = 'trg_mission_price_terms_log' and pronamespace = 'public'::regnamespace),
   'its function is SECURITY DEFINER (it must write mission_event)', 'prosecdef'),
  ((select pg_get_triggerdef(oid) like '%WHEN %old.status = ''pooled''::mission_status% AND %new.status = ''pooled''::mission_status%'
      from pg_trigger where tgname = 'mission_price_terms_log'),
   'it fires only on a trip that stays in the Pool', 'WHEN clause'),
  ((select count(*) = 3 from mission_event_type
     where event_type in ('ceiling_raised', 'trip_car_changed', 'price_terms_changed') and captured_by = 'db_trigger' and guaranteed),
   'the three event types are registered as guaranteed', 'mission_event_type'),
  -- the column
  ((select data_type = 'smallint' from information_schema.columns
     where table_schema = 'public' and table_name = 'mission' and column_name = 'pdp_step_count'),
   'mission.pdp_step_count exists (smallint)', 'information_schema'),
  ((select count(*) = 1 from pg_constraint where conname = 'mission_pdp_step_count_range' and conrelid = 'public.mission'::regclass),
   'its 8..60 range check exists', 'pg_constraint'),
  (not has_column_privilege('authenticated', 'public.mission', 'pdp_step_count', 'update')
     and not has_column_privilege('authenticated', 'public.mission', 'pdp_step_count', 'insert')
     and not has_column_privilege('anon', 'public.mission', 'pdp_step_count', 'update')
     and not has_column_privilege('anon', 'public.mission', 'pdp_step_count', 'insert'),
   'no browser role can write pdp_step_count', 'has_column_privilege'),
  -- the view
  ((select count(*) = 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mission_read' and column_name = 'pdp_step_count'),
   'mission_read carries pdp_step_count', 'information_schema'),
  ((select pg_get_viewdef('public.mission_read'::regclass) ~ 'THEN NULL::smallint\s+ELSE (m\.)?pdp_step_count'),
   'mission_read masks it for a Driver who does not hold the trip', 'pg_get_viewdef'),
  ((select pg_get_viewdef('public.mission_read'::regclass) like '%v.approval_status = ''approved''%'),
   'mission_read is still 18a''s view (the approved-car Pool test is in it)', 'pg_get_viewdef'),
  ((select coalesce(not ('security_invoker=true' = any(reloptions)), true) from pg_class where oid = 'public.mission_read'::regclass),
   'mission_read still reads as its owner (security_invoker off, D145)', 'reloptions'),
  (has_table_privilege('authenticated', 'public.mission_read', 'select')
     and not has_table_privilege('authenticated', 'public.mission_read', 'insert')
     and not has_table_privilege('authenticated', 'public.mission_read', 'update')
     and not has_table_privilege('authenticated', 'public.mission_read', 'delete')
     and not has_table_privilege('anon', 'public.mission_read', 'select'),
   'mission_read: signed-in may only read it, anon nothing', 'has_table_privilege')
) as c(ok, item, detail);
