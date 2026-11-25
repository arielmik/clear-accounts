-- Foto del ticket de un gasto.
-- Tabla propia (y no una columna en expenses) para no tocar la fila del gasto:
-- un UPDATE en expenses dispara el control de consistencia y el historial.
-- El archivo vive en Storage como groups/<group_id>/<archivo>: las reglas de imágenes
-- de grupo ya existentes dejan subirlo y verlo solo a los miembros del grupo.

create table expense_receipts (
  expense_id  uuid primary key references expenses (id) on delete cascade,
  path        text not null,
  created_by  uuid not null references profiles (id),
  created_at  timestamptz not null default now()
);

alter table expense_receipts enable row level security;

create policy expense_receipts_select on expense_receipts for select using (
  exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id))
);

grant select on expense_receipts to authenticated;

-- Asigna (o quita, con null) el ticket. Devuelve la ruta anterior para borrar el archivo.
create function set_expense_receipt(p_expense_id uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_old text;
begin
  select group_id into v_group from expenses where id = p_expense_id and deleted_at is null;
  if v_group is null then raise exception 'EXPENSE_NOT_EDITABLE'; end if;
  if not is_group_member(v_group) then raise exception 'NOT_A_MEMBER'; end if;
  if p_path is not null and image_path_owner(p_path, 'groups') is distinct from v_group then
    raise exception 'INVALID_IMAGE_PATH';
  end if;

  select path into v_old from expense_receipts where expense_id = p_expense_id;
  if p_path is null then
    delete from expense_receipts where expense_id = p_expense_id;
  else
    insert into expense_receipts (expense_id, path, created_by) values (p_expense_id, p_path, auth.uid())
    on conflict (expense_id) do update set path = excluded.path, created_by = excluded.created_by, created_at = now();
  end if;
  return v_old;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function set_expense_receipt(uuid, text) to authenticated;
