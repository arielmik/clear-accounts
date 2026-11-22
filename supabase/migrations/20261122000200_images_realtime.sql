-- Imágenes de grupos y perfiles (Storage privado) + actualización en tiempo real.

-- ─────────────── Columnas ───────────────
alter table groups   add column image_path  text;
alter table profiles add column avatar_path text;

-- ─────────────── Reglas de acceso a imágenes ───────────────
-- Rutas dentro del bucket `images`:
--   groups/<group_id>/<archivo>  → la ven y la cambian los miembros del grupo
--   users/<user_id>/<archivo>    → la cambia su dueño; la ven él y quienes comparten un grupo con él

create function image_path_owner(p_name text, p_kind text) returns uuid
language plpgsql immutable as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 3 or parts[1] <> p_kind then return null; end if;
  return parts[2]::uuid;
exception when invalid_text_representation then
  return null;
end $$;

create function can_write_image(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    is_group_member(image_path_owner(p_name, 'groups'))
    or image_path_owner(p_name, 'users') = auth.uid(),
    false);
$$;

create function can_read_image(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    can_write_image(p_name)
    or exists (
      select 1 from group_members mine
      join group_members theirs on theirs.group_id = mine.group_id and theirs.left_at is null
      where mine.user_id = auth.uid() and mine.left_at is null
        and theirs.user_id = image_path_owner(p_name, 'users')
    ),
    false);
$$;

grant execute on function image_path_owner(text, text), can_write_image(text), can_read_image(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy images_select on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.can_read_image(name));
create policy images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.can_write_image(name));
create policy images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.can_write_image(name));

-- ─────────────── RPCs para asignar imágenes ───────────────
-- Cualquier miembro puede cambiar la imagen del grupo (pero no el nombre ni la moneda).
create function set_group_image(p_group_id uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(p_group_id) then raise exception 'NOT_A_MEMBER'; end if;
  if p_path is not null and image_path_owner(p_path, 'groups') is distinct from p_group_id then
    raise exception 'INVALID_IMAGE_PATH';
  end if;
  update groups set image_path = p_path where id = p_group_id;
end $$;

create function set_my_avatar(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_path is not null and image_path_owner(p_path, 'users') is distinct from auth.uid() then
    raise exception 'INVALID_IMAGE_PATH';
  end if;
  update profiles set avatar_path = p_path where id = auth.uid();
end $$;

revoke execute on function set_group_image(uuid, text), set_my_avatar(text) from public;
grant execute on function set_group_image(uuid, text), set_my_avatar(text) to authenticated;

-- ─────────────── Tiempo real ───────────────
-- Supabase Realtime envía los cambios de estas tablas a los clientes suscriptos,
-- respetando RLS: cada usuario solo recibe eventos de filas que puede ver.
do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'settlements', 'group_members', 'groups', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
