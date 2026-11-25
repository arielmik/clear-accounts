-- Arreglo de notificaciones push: claim_expense_push ya no hace UPDATE sobre expenses.
--
-- Ese UPDATE disparaba los triggers de expenses: el control de consistencia diferido
-- (que corre al COMMIT con el rol de quien llama, service_role, sin permiso sobre
-- assert_expense_consistent → se revertía todo) y el historial (dejaba una "edición" falsa).
-- La marca de "ya se avisó" pasa a una tabla propia.

create table expense_push_sent (
  expense_id  uuid primary key references expenses (id) on delete cascade,
  sent_at     timestamptz not null default now()
);
alter table expense_push_sent enable row level security;
revoke all on expense_push_sent from public, anon, authenticated;

alter table expenses drop column push_sent_at;

create or replace function claim_expense_push(p_expense_id uuid, p_actor uuid)
returns table (token text, actor_name text, group_id uuid, group_name text,
               description text, amount_minor bigint, currency char(3))
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from expenses e join groups g on g.id = e.group_id
    where e.id = p_expense_id and e.created_by = p_actor and e.deleted_at is null
      and e.created_at > now() - interval '10 minutes'
      and g.kind <> 'personal' and g.deleted_at is null
  ) then return; end if;

  -- Una sola vez por gasto, aunque lleguen dos llamadas a la vez.
  insert into expense_push_sent (expense_id) values (p_expense_id) on conflict do nothing;
  if not found then return; end if;

  return query
    select t.token, p.display_name, g.id, g.name, e.description, e.amount_minor, e.currency
    from expenses e
    join groups g on g.id = e.group_id
    join profiles p on p.id = p_actor
    join group_members m on m.group_id = g.id and m.left_at is null and m.user_id is not null and m.user_id <> p_actor
    join push_tokens t on t.user_id = m.user_id
    where e.id = p_expense_id;
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on function claim_expense_push(uuid, uuid) from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function claim_expense_push(uuid, uuid) to service_role;
  end if;
end $$;
