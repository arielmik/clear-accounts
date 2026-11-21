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
grant usage on schema auth to authenticated;
