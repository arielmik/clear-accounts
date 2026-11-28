-- Medios de pago ("Cómo" pagaste un gasto).
--
-- * Como las categorías: hay medios del sistema (owner_id null) y cada usuario puede
--   crear los suyos, que solo ve él.
-- * El medio de pago de un gasto es PRIVADO de cada usuario (tabla propia, como la
--   recategorización): en un gasto de grupo, "con qué tarjeta pagué" no es asunto del
--   resto. Además no toca la fila del gasto (ni el historial ni el control de consistencia).
-- * Es opcional: sin fila = "sin especificar".

create table payment_methods (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles (id) on delete cascade, -- null = del sistema
  system_key  text unique,
  name        text not null check (length(name) between 1 and 60),
  icon        text,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  check ((owner_id is null) = (system_key is not null))
);
create index payment_methods_by_owner on payment_methods (owner_id);

insert into payment_methods (system_key, name, icon, sort_order) values
  ('cash',     'Efectivo',          '💵', 10),
  ('debit',    'Tarjeta de débito', '💳', 20),
  ('credit',   'Tarjeta de crédito','💳', 30),
  ('transfer', 'Transferencia',     '🏦', 40),
  ('wallet',   'Billetera virtual', '📱', 50);

create table expense_payment_methods (
  user_id           uuid not null references profiles (id) on delete cascade,
  expense_id        uuid not null references expenses (id) on delete cascade,
  payment_method_id uuid not null references payment_methods (id) on delete cascade,
  primary key (user_id, expense_id)
);
create index expense_payment_methods_by_expense on expense_payment_methods (expense_id);
create index expense_payment_methods_by_method on expense_payment_methods (payment_method_id);

alter table payment_methods enable row level security;
alter table expense_payment_methods enable row level security;

create policy payment_methods_select on payment_methods for select
  using (owner_id is null or owner_id = (select auth.uid()));
create policy payment_methods_insert on payment_methods for insert
  with check (owner_id = (select auth.uid()));
create policy payment_methods_update on payment_methods for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy payment_methods_delete on payment_methods for delete
  using (owner_id = (select auth.uid()));

-- Solo el propio, en gastos de mis grupos y con medios del sistema o propios.
create policy expense_payment_methods_own on expense_payment_methods for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id))
    and exists (
      select 1 from payment_methods pm
      where pm.id = payment_method_id and (pm.owner_id is null or pm.owner_id = (select auth.uid()))
    )
  );

grant select, insert, update, delete on payment_methods, expense_payment_methods to authenticated;

-- ─────────────── save_expense: acepta el medio de pago ───────────────
-- payload.payment_method_id (opcional): si viene, fija (o quita, con null) MI medio de
-- pago para el gasto, en la misma transacción. Si no viene, no se toca.
create or replace function save_expense(payload jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := coalesce((payload ->> 'id')::uuid, gen_random_uuid());
  v_method uuid := (payload ->> 'payment_method_id')::uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  insert into expenses (id, group_id, description, amount_minor, currency, spent_at, category_id, split_type, notes, created_by)
  values (
    v_id,
    (payload ->> 'group_id')::uuid,
    payload ->> 'description',
    (payload ->> 'amount_minor')::bigint,
    payload ->> 'currency',
    coalesce((payload ->> 'spent_at')::date, current_date),
    (payload ->> 'category_id')::uuid,
    coalesce((payload ->> 'split_type')::split_type, 'equal'),
    payload ->> 'notes',
    auth.uid()
  )
  on conflict (id) do update set
    description  = excluded.description,
    amount_minor = excluded.amount_minor,
    currency     = excluded.currency,
    spent_at     = excluded.spent_at,
    category_id  = excluded.category_id,
    split_type   = excluded.split_type,
    notes        = excluded.notes
  where expenses.group_id = excluded.group_id and expenses.deleted_at is null;

  if not found then raise exception 'EXPENSE_NOT_EDITABLE'; end if;

  delete from expense_payers where expense_id = v_id;
  delete from expense_shares where expense_id = v_id;

  insert into expense_payers (expense_id, member_id, amount_minor)
    select v_id, (p ->> 'member_id')::uuid, (p ->> 'amount_minor')::bigint
    from jsonb_array_elements(payload -> 'payers') p;

  insert into expense_shares (expense_id, member_id, amount_minor, split_value)
    select v_id, (s ->> 'member_id')::uuid, (s ->> 'amount_minor')::bigint, (s ->> 'split_value')::bigint
    from jsonb_array_elements(payload -> 'shares') s;

  if payload ? 'payment_method_id' then
    if v_method is null then
      delete from expense_payment_methods where user_id = auth.uid() and expense_id = v_id;
    else
      insert into expense_payment_methods (user_id, expense_id, payment_method_id)
      values (auth.uid(), v_id, v_method)
      on conflict (user_id, expense_id) do update set payment_method_id = excluded.payment_method_id;
    end if;
  end if;

  return v_id;
end $$;

-- ─────────────── Registro personal: con mi medio de pago ───────────────
-- Se agrega payment_method_id al final (create or replace solo permite sumar columnas al final).
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
  e.created_at,
  pm.payment_method_id
from expense_shares s
join group_members m on m.id = s.member_id and m.user_id = auth.uid()
join expenses e      on e.id = s.expense_id and e.deleted_at is null
join groups g        on g.id = e.group_id
left join expense_payers p on p.expense_id = e.id and p.member_id = m.id
left join share_category_overrides o on o.expense_id = e.id and o.user_id = auth.uid()
left join expense_payment_methods pm on pm.expense_id = e.id and pm.user_id = auth.uid();
