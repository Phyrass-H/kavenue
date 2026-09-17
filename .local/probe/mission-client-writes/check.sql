-- S82 — is the mission write lock in place? READ-ONLY: only has_*_privilege and the catalogs.
-- Paste into the Supabase SQL editor after 2026-09-17_mission_client_writes.sql.
-- Every row must say `pass`. run.sh runs this same file on the throw-away Postgres, where
-- BEFORE the migration it must show FAILs (the hole) and AFTER it must be all pass.
--
-- What "expected" means:
--   denied   → a browser session cannot write this column at all (engine-enforced)
--   guarded  → it can, because the app writes it on a draft; the trigger decides the value
--   granted  → it can, and must, or an app write breaks

with
upd(col) as (select unnest(array[
  'business_id','dispatcher_id','status','category','zone',
  'pickup_address','pickup_lat','pickup_lng','dropoff_address','dropoff_lat','dropoff_lng',
  'waypoints','pickup_at','passenger_name','passenger_names','pax_count','luggage_count',
  'luggage_only','flight_number','reference','ceiling','speed_win','required_body_type',
  'required_make','required_model','required_languages','dress_code','driver_flags',
  'board_name','driver_message','distance_km','duration_min','board_file_path',
  'pickup_label','dropoff_label','created_at','info_edited_at'])),
ins(col) as (select unnest(array[
  'business_id','dispatcher_id','status','category','zone',
  'pickup_address','pickup_lat','pickup_lng','dropoff_address','dropoff_lat','dropoff_lng',
  'waypoints','pickup_at','passenger_name','passenger_names','pax_count','luggage_count',
  'luggage_only','flight_number','reference','ceiling','speed_win','required_body_type',
  'required_make','required_model','required_languages','dress_code','driver_flags',
  'board_name','driver_message','distance_km','duration_min','board_file_path',
  'pickup_label','dropoff_label',
  'rate_card_id','night_applied','commission_business_rate','commission_driver_rate',
  'commission_vat_rate','standard_vat_rate','pdp_start','pdp_step','pdp_interval'])),
-- the money: what is paid, what is kept, and what moves the price
money(col, n) as (select c, o from unnest(array[
  'accepted_fare','ceiling','base_fare','pdp_start','pdp_step','pdp_interval','speed_win',
  'created_at','pooled_at','status',
  'commission_business_rate','commission_driver_rate','commission_vat_rate',
  'transport_vat_rate','standard_vat_rate','rate_card_id','night_applied',
  'cancellation_fee','waiting_from','waiting_to','waiting_minutes','waiting_rate','waiting_fee',
  'no_show','no_show_at','no_show_by','driver_id','vehicle_id','accepted_at','confirmed_at',
  'cancelled_at','cancelled_by','guest_ready_at']) with ordinality as t(c, o)),
-- what the trigger decides: on UPDATE it freezes these once a trip is posted (and sets created_at
-- when a draft is posted); on INSERT it limits status and writes the live rates
guarded(priv, col) as (
  select 'UPDATE', unnest(array['status','ceiling','created_at','speed_win'])
  union all
  select 'INSERT', unnest(array['status','commission_business_rate','commission_driver_rate',
                                'commission_vat_rate','standard_vat_rate'])),
cols(col) as (
  select a.attname::text from pg_attribute a
   where a.attrelid = 'public.mission'::regclass and a.attnum > 0 and not a.attisdropped),
checks(n, name, expected, actual) as (
  -- 1 · every money column, both ways, for a signed-in browser session
  select 100 + m.n * 2, 'UPDATE ' || m.col,
         case when m.col in (select col from upd)
              then (case when m.col in (select col from guarded where priv = 'UPDATE') then 'guarded' else 'granted' end)
              else 'denied' end,
         case when has_column_privilege('authenticated', 'public.mission', m.col, 'UPDATE')
              then (case when m.col in (select col from guarded where priv = 'UPDATE') then 'guarded' else 'granted' end)
              else 'denied' end
    from money m
  union all
  select 101 + m.n * 2, 'INSERT ' || m.col,
         case when m.col in (select col from ins)
              then (case when m.col in (select col from guarded where priv = 'INSERT') then 'guarded' else 'granted' end)
              else 'denied' end,
         case when has_column_privilege('authenticated', 'public.mission', m.col, 'INSERT')
              then (case when m.col in (select col from guarded where priv = 'INSERT') then 'guarded' else 'granted' end)
              else 'denied' end
    from money m
  union all
  -- 2 · the sweep: EVERY column of mission, not just the money. A column the app writes that is
  --     not granted breaks the app; a column granted beyond the list is a new hole.
  select 10, 'authenticated UPDATE — columns off the list (extra / missing)', '0 / 0',
         (select count(*) from cols c where has_column_privilege('authenticated','public.mission',c.col,'UPDATE')
                                        and c.col not in (select col from upd))::text || ' / ' ||
         (select count(*) from upd u where not has_column_privilege('authenticated','public.mission',u.col,'UPDATE'))::text
  union all
  select 11, 'authenticated INSERT — columns off the list (extra / missing)', '0 / 0',
         (select count(*) from cols c where has_column_privilege('authenticated','public.mission',c.col,'INSERT')
                                        and c.col not in (select col from ins))::text || ' / ' ||
         (select count(*) from ins i where not has_column_privilege('authenticated','public.mission',i.col,'INSERT'))::text
  union all
  select 12, 'anon — columns it can INSERT or UPDATE', '0',
         (select count(*) from cols c where has_column_privilege('anon','public.mission',c.col,'UPDATE')
                                         or has_column_privilege('anon','public.mission',c.col,'INSERT'))::text
  union all
  -- 3 · whole-table privileges
  select 20, 'authenticated DELETE on mission', 'false', has_table_privilege('authenticated','public.mission','DELETE')::text
  union all
  select 21, 'authenticated TRUNCATE on mission', 'false', has_table_privilege('authenticated','public.mission','TRUNCATE')::text
  union all
  select 22, 'anon DELETE or TRUNCATE on mission', 'false',
         (has_table_privilege('anon','public.mission','DELETE') or has_table_privilege('anon','public.mission','TRUNCATE'))::text
  union all
  select 23, 'authenticated writes through the mission_read view', 'false',
         coalesce((select has_table_privilege('authenticated', c.oid, 'INSERT')
                       or has_table_privilege('authenticated', c.oid, 'UPDATE')
                       or has_table_privilege('authenticated', c.oid, 'DELETE')
                     from pg_class c join pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and c.relname = 'mission_read'), false)::text
  union all
  -- ⚑ EVERY view in public, not just this one. Supabase's default privileges grant ALL on each new
  --   view to anon and authenticated, and a view that reads as its owner is a way past the table's
  --   policies and column grants (2026-09-17b). A new view is writable until someone revokes it.
  select 24, 'views in public a browser session can write through', '(none)',
         coalesce((select string_agg(distinct c.relname, ', ' order by c.relname)
                     from pg_class c join pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and c.relkind in ('v', 'm')
                      and (has_table_privilege('authenticated', c.oid, 'INSERT')
                        or has_table_privilege('authenticated', c.oid, 'UPDATE')
                        or has_table_privilege('authenticated', c.oid, 'DELETE')
                        or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
                        or has_table_privilege('anon', c.oid, 'INSERT')
                        or has_table_privilege('anon', c.oid, 'UPDATE')
                        or has_table_privilege('anon', c.oid, 'DELETE')
                        or has_table_privilege('anon', c.oid, 'TRUNCATE'))), '(none)')
  union all
  select 25, 'a Business and a Driver can still READ through mission_read', 'true',
         coalesce((select has_table_privilege('authenticated', c.oid, 'SELECT')
                     from pg_class c join pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and c.relname = 'mission_read'), false)::text
  union all
  -- ⚑ It MUST keep reading as its owner: that is how a Driver sees a pooled trip's price at all
  --   (the money-column walls leave authenticated no SELECT on ceiling on the table).
  select 26, 'mission_read still reads as its owner', 'owner',
         coalesce((select case when coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%'
                               then 'INVOKER' else 'owner' end
                     from pg_class c join pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and c.relname = 'mission_read'), 'missing')
  union all
  -- 4 · the guard is installed, enabled, and INVOKER (a DEFINER guard never fires: 2026-07-22)
  select 30, 'trigger trg_mission_guard_client_write on mission, enabled', 'true',
         exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.mission'::regclass
                    and t.tgname = 'trg_mission_guard_client_write'
                    and t.tgenabled = 'O' and not t.tgisinternal)::text
  union all
  select 31, 'mission_guard_client_write is SECURITY INVOKER', 'invoker',
         coalesce((select case when p.prosecdef then 'DEFINER' else 'invoker' end
                     from pg_proc p where p.oid = to_regprocedure('public.mission_guard_client_write()')), 'missing')
  union all
  select 32, 'mission_client_rates is SECURITY DEFINER', 'definer',
         coalesce((select case when p.prosecdef then 'definer' else 'INVOKER' end
                     from pg_proc p where p.oid = to_regprocedure('public.mission_client_rates()')), 'missing')
  union all
  select 33, 'mission_client_rates EXECUTE — anon / authenticated', 'false / true',
         coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE')::text || ' / ' ||
                          has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                     from pg_proc p where p.oid = to_regprocedure('public.mission_client_rates()')), 'missing')
)
select name as check, expected, actual,
       case when expected = actual then 'pass' else 'FAIL' end as result
  from checks
 order by (expected = actual), n;
