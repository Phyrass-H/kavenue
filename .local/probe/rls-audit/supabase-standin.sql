-- S83 — what Supabase ships BEFORE our schema: roles, auth, storage, the realtime publication and
-- the default privileges. ⚑ THROW-AWAY POSTGRES ONLY (replay.sh refuses any host but 127.0.0.1).
-- Only the parts that decide who may read or write are stood in; everything else is left out.
-- The one fact that shapes the whole audit is the DEFAULT PRIVILEGES block at the end: check.sql
-- reads the live pg_default_acl, so a wrong guess here shows up as a FAIL, not as a silent pass.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator nologin noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

-- Supabase installs extensions into their own schema, not public
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ── auth ────────────────────────────────────────────────────────────────────
create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  phone              text,
  raw_user_meta_data jsonb,
  raw_app_meta_data  jsonb,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
create function auth.email() returns text language sql stable as $$
  select (auth.jwt() ->> 'email')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ── storage (the two tables a policy can sit on) ────────────────────────────
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
-- the app creates its buckets through the Storage API (lib/supabase/storage.ts)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('avatars',   'avatars',   true,  10485760, array['image/png','image/jpeg','image/webp']);

-- ── realtime: Supabase creates the publication empty ───────────────────────
create publication supabase_realtime;

-- ── Supabase's "auto-enable RLS on every new table" event trigger (S83) ─────
-- Confirmed on live 2026-09-18: an EVENT TRIGGER function (owner postgres, SECURITY DEFINER,
-- search_path=pg_catalog), fired by `ensure_rls` on ddl_command_end. It has EXECUTE for PUBLIC
-- (create function's default), but Postgres refuses to CALL an event-trigger function directly, so
-- that grant is moot — check.sql lists it as info, not a hole. Stood in here so the replay carries
-- the same object the live sweep sees. ⚑ NO-OP body: a working body would enable RLS on the tables
-- kavenue_schema.sql creates next and change the replay; the catalog SHAPE is all check.sql reads.
create function rls_auto_enable() returns event_trigger
  language plpgsql security definer set search_path = pg_catalog as $$ begin return; end $$;
create event trigger ensure_rls on ddl_command_end execute function rls_auto_enable();

-- ── public: Supabase's grants and DEFAULT PRIVILEGES ────────────────────────
-- ⚑ This is the whole class of bug: every table, VIEW, function and sequence the SQL editor
--   creates is granted to anon + authenticated IN THEIR OWN RIGHT, so a revoke from PUBLIC
--   removes nothing from them (CLAUDE.md rule 6, D145).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
