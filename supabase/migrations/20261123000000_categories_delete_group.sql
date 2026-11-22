-- Categorías propias (validaciones), recategorización privada y eliminación de grupos saldados.

-- ─────────────── Saldo pendiente de un grupo ───────────────
-- true si algún miembro (activo o no) tiene saldo distinto de cero en alguna moneda.
create function group_has_pending_balance(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from (
      select p.member_id, e.currency, p.amount_minor as delta
        from expense_payers p join expenses e on e.id = p.expense_id
        where e.group_id = p_group_id and e.deleted_at is null
      union all
      select s.member_id, e.currency, -s.amount_minor
        from expense_shares s join expenses e on e.id = s.expense_id
        where e.group_id = p_group_id and e.deleted_at is null
      union all
      select from_member_id, currency, amount_minor from settlements where group_id = p_group_id and deleted_at is null
      union all
      select to_member_id, currency, -amount_minor from settlements where group_id = p_group_id and deleted_at is null
    ) t
    group by member_id, currency
    having sum(delta) <> 0
  );
$$;

-- ─────────────── Eliminar grupo ───────────────
-- Baja lógica: el grupo desaparece de las listas, pero sus gastos siguen en el
-- registro personal de cada miembro (fueron consumo real).
create function delete_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_kind group_kind;
begin
  if not is_group_member(p_group_id) then raise exception 'NOT_A_MEMBER'; end if;
  select kind into v_kind from groups where id = p_group_id and deleted_at is null;
  if not found then raise exception 'GROUP_DELETED'; end if;
  if v_kind = 'personal' then raise exception 'CANNOT_DELETE_PERSONAL'; end if;
  if group_has_pending_balance(p_group_id) then
    raise exception 'GROUP_NOT_SETTLED: hay saldos pendientes en el grupo' using errcode = 'check_violation';
  end if;
  update groups set deleted_at = now() where id = p_group_id;
end $$;

-- En un grupo eliminado no se cargan gastos ni pagos nuevos.
create or replace function check_settlement() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from groups where id = new.group_id and deleted_at is not null) then
    raise exception 'GROUP_DELETED' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from group_members
    where id in (new.from_member_id, new.to_member_id) and group_id <> new.group_id
  ) then
    raise exception 'FOREIGN_MEMBER: la liquidación involucra miembros de otro grupo' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create function check_expense_group_active() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from groups where id = new.group_id and deleted_at is not null)
     and (tg_op = 'INSERT' or new.deleted_at is null) then
    raise exception 'GROUP_DELETED' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger expenses_group_active before insert or update on expenses
  for each row execute function check_expense_group_active();

grant execute on function delete_group(uuid), group_has_pending_balance(uuid) to authenticated;

-- ─────────────── Categorías propias ───────────────
-- La categoría padre tiene que ser del sistema o propia (nunca de otro usuario),
-- y solo se permiten dos niveles.
create function category_parent_allowed(p_parent uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_parent is null or exists (
    select 1 from categories p
    where p.id = p_parent and p.parent_id is null
      and (p.owner_id is null or p.owner_id = auth.uid())
  );
$$;
grant execute on function category_parent_allowed(uuid) to authenticated;

drop policy categories_insert on categories;
create policy categories_insert on categories for insert
  with check (owner_id = (select auth.uid()) and category_parent_allowed(parent_id));
drop policy categories_update on categories;
create policy categories_update on categories for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and category_parent_allowed(parent_id));

-- Recategorización privada: solo con categorías del sistema o propias.
drop policy overrides_own on share_category_overrides;
create policy overrides_own on share_category_overrides for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id))
    and exists (select 1 from categories c where c.id = category_id and (c.owner_id is null or c.owner_id = (select auth.uid())))
  );
