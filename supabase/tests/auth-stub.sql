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

-- Peor caso: nada es accesible salvo lo que las migraciones otorgan explícitamente
-- (así se comportan los proyectos nuevos de Supabase con las tablas, y lo extendemos a funciones).
alter default privileges in schema public revoke execute on functions from public;
