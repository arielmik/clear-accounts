-- Edición de perfil y de miembros, y orden estable del registro personal.

-- ─────────────── Miembros: qué se puede editar ───────────────
-- Solo nombre y baja (left_at). user_id y role no son editables desde la API.
revoke update on group_members from authenticated;
grant update (display_name, left_at) on group_members to authenticated;

create function guard_member_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind group_kind;
begin
  select kind into v_kind from groups where id = old.group_id;

  -- El nombre de un usuario registrado sale de su perfil: solo lo cambia él.
  if new.display_name is distinct from old.display_name
     and old.user_id is not null and old.user_id is distinct from auth.uid() then
    raise exception 'CANNOT_RENAME_REGISTERED: el nombre lo cambia cada usuario desde su perfil'
      using errcode = 'check_violation';
  end if;

  -- Baja de un miembro: solo con las cuentas saldadas en ese grupo.
  if old.left_at is null and new.left_at is not null then
    if v_kind = 'personal' then
      raise exception 'CANNOT_LEAVE_PERSONAL' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from (
        select e.currency, p.amount_minor as delta
          from expense_payers p join expenses e on e.id = p.expense_id
          where p.member_id = old.id and e.deleted_at is null
        union all
        select e.currency, -s.amount_minor
          from expense_shares s join expenses e on e.id = s.expense_id
          where s.member_id = old.id and e.deleted_at is null
        union all
        select currency, amount_minor from settlements where from_member_id = old.id and deleted_at is null
        union all
        select currency, -amount_minor from settlements where to_member_id = old.id and deleted_at is null
      ) t
      group by currency
      having sum(delta) <> 0
    ) then
      raise exception 'MEMBER_HAS_BALANCE: el miembro tiene cuentas pendientes en este grupo'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Reincorporar a un usuario registrado: solo él mismo (vía invitación).
  if old.left_at is not null and new.left_at is null
     and old.user_id is not null and old.user_id is distinct from auth.uid() then
    raise exception 'CANNOT_REJOIN_OTHER' using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger group_members_guard before update on group_members
  for each row execute function guard_member_update();

-- ─────────────── Perfil ───────────────
-- Cambia el nombre en el perfil y en todos los grupos del usuario.
create function update_my_profile(p_display_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(p_display_name);
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if length(v_name) not between 1 and 80 then raise exception 'INVALID_NAME'; end if;
  update profiles set display_name = v_name where id = v_uid;
  update group_members set display_name = v_name where user_id = v_uid;
end $$;

revoke execute on function update_my_profile(text) from public;
grant execute on function update_my_profile(text) to authenticated;

-- ─────────────── Invitaciones: reincorporar a quien se fue ───────────────
create or replace function accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  inv group_invites%rowtype;
  existing group_members%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into inv from group_invites where token = p_token and expires_at > now();
  if not found then raise exception 'INVITE_INVALID'; end if;

  select * into existing from group_members where group_id = inv.group_id and user_id = v_uid;
  if found then
    if existing.left_at is not null then
      update group_members set left_at = null where id = existing.id;
    end if;
    return inv.group_id;
  end if;

  if inv.member_id is not null then
    update group_members set user_id = v_uid where id = inv.member_id and user_id is null;
    if not found then raise exception 'INVITE_ALREADY_CLAIMED'; end if;
    delete from group_invites where token = p_token;
  else
    insert into group_members (group_id, user_id, display_name)
      select inv.group_id, v_uid, display_name from profiles where id = v_uid;
  end if;
  return inv.group_id;
end $$;

-- ─────────────── Registro personal: orden estable ───────────────
-- Se agrega created_at (al final) para ordenar por fecha y, dentro del día, por carga.
create or replace view my_ledger with (security_invoker = true) as
select
  e.id                                     as expense_id,
  e.group_id,
  g.name                                   as group_name,
  g.kind = 'personal'                      as is_personal,
  e.description,
  e.spent_at,
  e.currency,
  s.amount_minor                           as consumed_minor,
  coalesce(p.amount_minor, 0)              as paid_minor,
  coalesce(o.category_id, e.category_id)   as category_id,
  e.created_at
from expense_shares s
join group_members m on m.id = s.member_id and m.user_id = auth.uid()
join expenses e      on e.id = s.expense_id and e.deleted_at is null
join groups g        on g.id = e.group_id
left join expense_payers p on p.expense_id = e.id and p.member_id = m.id
left join share_category_overrides o on o.expense_id = e.id and o.user_id = auth.uid();
