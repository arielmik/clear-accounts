-- Reemplazo mínimo de lo que Supabase provee (schema auth y rol authenticated)
-- para poder probar las migraciones en PGlite, sin Docker.
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
grant usage on schema auth to authenticated;

-- Peor caso: nada es accesible salvo lo que las migraciones otorgan explícitamente
-- (así se comportan los proyectos nuevos de Supabase con las tablas, y lo extendemos a funciones).
alter default privileges in schema public revoke execute on functions from public;

-- Storage y Realtime de Supabase, en su forma mínima.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid()
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
create publication supabase_realtime;

-- Como en Supabase: las funciones nuevas nacen ejecutables por anon (y por todos).
alter default privileges in schema public grant execute on functions to anon;
