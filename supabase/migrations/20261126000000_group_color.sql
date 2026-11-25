-- Color de cada grupo (rediseño "Banda").
-- Se guarda una clave de la paleta, no un código hex: la app la traduce al tono
-- que corresponde en modo claro u oscuro. Es del grupo: todos los miembros lo ven igual.
-- null = todavía sin elegir; la app le asigna uno de forma estable.

alter table groups add column color text
  check (color in ('coral', 'sky', 'sun', 'lilac', 'pink', 'teal', 'lime', 'sand'));

-- Cualquier miembro lo puede cambiar, igual que la imagen del grupo.
create function set_group_color(p_group_id uuid, p_color text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(p_group_id) then raise exception 'NOT_A_MEMBER'; end if;
  update groups set color = p_color where id = p_group_id;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function set_group_color(uuid, text) to authenticated;
