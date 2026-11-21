-- Clear Accounts — esquema inicial
-- Convenciones:
--   * Montos en unidades mínimas (bigint, centavos). Nunca numeric/float para plata.
--   * IDs uuid generables en el cliente (preparado para modo offline).
--   * updated_at + version en entidades editables (sincronización futura / concurrencia optimista).
--   * Borrado lógico con deleted_at en lo que comparten varias personas.


-- ─────────────────────────────── Tipos ───────────────────────────────

create type group_kind as enum ('personal', 'home', 'trip', 'couple', 'other');
create type member_role as enum ('owner', 'member');
create type split_type as enum ('equal', 'exact', 'percent', 'shares');

-- ─────────────────────────────── Utilidades ───────────────────────────────

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

-- ─────────────────────────────── Perfiles ───────────────────────────────

create table profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text not null check (length(display_name) between 1 and 80),
  avatar_url       text,
  default_currency char(3) not null default 'ARS',
  locale           text not null default 'es-AR',
  timezone         text not null default 'America/Argentina/Buenos_Aires',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  version          integer not null default 1
);
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();

-- ─────────────────────────────── Grupos ───────────────────────────────

create table groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(name) between 1 and 80),
  kind           group_kind not null default 'other',
  currency       char(3) not null,
  simplify_debts boolean not null default true,
  created_by     uuid not null references profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  deleted_at     timestamptz
);
-- Cada usuario tiene exactamente un grupo "personal" (su libro de gastos privado).
create unique index groups_one_personal_per_user on groups (created_by) where kind = 'personal';
create trigger groups_touch before update on groups for each row execute function touch_updated_at();

create table group_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups (id) on delete cascade,
  user_id       uuid references profiles (id) on delete set null, -- null = invitado sin cuenta
  display_name  text not null check (length(display_name) between 1 and 80),
  invite_email  text,
  role          member_role not null default 'member',
  joined_at     timestamptz not null default now(),
  left_at       timestamptz
);
create unique index group_members_user_once on group_members (group_id, user_id) where user_id is not null;
create index group_members_by_user on group_members (user_id);

create table group_invites (
  token       text primary key default replace(gen_random_uuid()::text, '-', ''), -- 122 bits aleatorios
  group_id    uuid not null references groups (id) on delete cascade,
  created_by  uuid not null references profiles (id),
  -- Si se informa, el invitado "reclama" ese miembro (ej. alguien cargado sin cuenta).
  member_id   uuid references group_members (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '14 days',
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────── Categorías ───────────────────────────────

create table categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles (id) on delete cascade, -- null = categoría del sistema
  parent_id   uuid references categories (id) on delete set null,
  system_key  text unique, -- clave de traducción para categorías del sistema (i18n)
  name        text not null check (length(name) between 1 and 60),
  icon        text,
  color       text,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  check ((owner_id is null) = (system_key is not null))
);
create index categories_by_owner on categories (owner_id);

-- ─────────────────────────────── Gastos ───────────────────────────────

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  description  text not null check (length(description) between 1 and 140),
  amount_minor bigint not null check (amount_minor > 0),
  currency     char(3) not null,
  spent_at     date not null default current_date,
  category_id  uuid references categories (id) on delete set null,
  split_type   split_type not null default 'equal',
  notes        text,
  created_by   uuid not null references profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  deleted_at   timestamptz
);
create index expenses_by_group_date on expenses (group_id, spent_at desc) where deleted_at is null;
create trigger expenses_touch before update on expenses for each row execute function touch_updated_at();

create table expense_payers (
  expense_id   uuid not null references expenses (id) on delete cascade,
  member_id    uuid not null references group_members (id),
  amount_minor bigint not null check (amount_minor > 0),
  primary key (expense_id, member_id)
);
create index expense_payers_by_member on expense_payers (member_id);

create table expense_shares (
  expense_id   uuid not null references expenses (id) on delete cascade,
  member_id    uuid not null references group_members (id),
  amount_minor bigint not null check (amount_minor >= 0),
  -- Dato de entrada del reparto para poder re-editarlo: bps (percent) o unidades (shares).
  split_value  bigint,
  primary key (expense_id, member_id)
);
create index expense_shares_by_member on expense_shares (member_id);

-- Recategorización PRIVADA de mi parte: solo la ve su dueño.
create table share_category_overrides (
  user_id     uuid not null references profiles (id) on delete cascade,
  expense_id  uuid not null references expenses (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  primary key (user_id, expense_id)
);

-- ─────────────────────────────── Liquidaciones ───────────────────────────────

create table settlements (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references groups (id) on delete cascade,
  from_member_id uuid not null references group_members (id),
  to_member_id   uuid not null references group_members (id),
  amount_minor   bigint not null check (amount_minor > 0),
  currency       char(3) not null,
  paid_at        date not null default current_date,
  note           text,
  created_by     uuid not null references profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  deleted_at     timestamptz,
  check (from_member_id <> to_member_id)
);
create index settlements_by_group on settlements (group_id) where deleted_at is null;
create trigger settlements_touch before update on settlements for each row execute function touch_updated_at();

-- ─────────────────────────────── Auditoría ───────────────────────────────

create table activity_log (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references groups (id) on delete cascade,
  actor_id    uuid references profiles (id) on delete set null,
  entity      text not null,  -- 'expense' | 'settlement' | ...
  entity_id   uuid not null,
  action      text not null,  -- 'insert' | 'update' | 'delete'
  snapshot    jsonb,
  created_at  timestamptz not null default now()
);
create index activity_log_by_group on activity_log (group_id, created_at desc);

create function log_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec record;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  insert into activity_log (group_id, actor_id, entity, entity_id, action, snapshot)
  values (rec.group_id, auth.uid(), tg_argv[0], rec.id, lower(tg_op), to_jsonb(rec));
  return null;
end $$;
create trigger expenses_activity after insert or update or delete on expenses
  for each row execute function log_activity('expense');
create trigger settlements_activity after insert or update or delete on settlements
  for each row execute function log_activity('settlement');

-- ─────────────────────────────── Invariantes ───────────────────────────────
-- Se verifican al final de la transacción (constraint triggers diferidos):
-- Σ pagadores = monto = Σ partes, y todos los miembros pertenecen al grupo del gasto.

create function assert_expense_consistent(p_expense_id uuid) returns void language plpgsql as $$
declare
  e expenses%rowtype;
  paid bigint;
  owed bigint;
  foreign_members integer;
begin
  select * into e from expenses where id = p_expense_id;
  if not found then return; end if;

  select coalesce(sum(amount_minor), 0) into paid from expense_payers where expense_id = e.id;
  select coalesce(sum(amount_minor), 0) into owed from expense_shares where expense_id = e.id;
  if paid <> e.amount_minor then
    raise exception 'PAYERS_MISMATCH: pagos % <> monto %', paid, e.amount_minor using errcode = 'check_violation';
  end if;
  if owed <> e.amount_minor then
    raise exception 'SPLIT_MISMATCH: partes % <> monto %', owed, e.amount_minor using errcode = 'check_violation';
  end if;

  select count(*) into foreign_members from (
    select member_id from expense_payers where expense_id = e.id
    union
    select member_id from expense_shares where expense_id = e.id
  ) m join group_members gm on gm.id = m.member_id
  where gm.group_id <> e.group_id;
  if foreign_members > 0 then
    raise exception 'FOREIGN_MEMBER: hay participantes de otro grupo' using errcode = 'check_violation';
  end if;
end $$;

create function check_expense_trigger() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'expenses' then
    perform assert_expense_consistent(coalesce(new.id, old.id));
  else
    perform assert_expense_consistent(coalesce(new.expense_id, old.expense_id));
  end if;
  return null;
end $$;

create constraint trigger expenses_consistent after insert or update on expenses
  deferrable initially deferred for each row execute function check_expense_trigger();
create constraint trigger expense_payers_consistent after insert or update or delete on expense_payers
  deferrable initially deferred for each row execute function check_expense_trigger();
create constraint trigger expense_shares_consistent after insert or update or delete on expense_shares
  deferrable initially deferred for each row execute function check_expense_trigger();

create function check_settlement() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from group_members
    where id in (new.from_member_id, new.to_member_id) and group_id <> new.group_id
  ) then
    raise exception 'FOREIGN_MEMBER: la liquidación involucra miembros de otro grupo' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger settlements_check before insert or update on settlements
  for each row execute function check_settlement();

-- ─────────────────────────────── Seguridad (RLS) ───────────────────────────────

create function is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid() and left_at is null
  );
$$;

create function is_group_owner(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid() and left_at is null and role = 'owner'
  );
$$;

alter table profiles                 enable row level security;
alter table groups                   enable row level security;
alter table group_members            enable row level security;
alter table group_invites            enable row level security;
alter table categories               enable row level security;
alter table expenses                 enable row level security;
alter table expense_payers           enable row level security;
alter table expense_shares           enable row level security;
alter table share_category_overrides enable row level security;
alter table settlements              enable row level security;
alter table activity_log             enable row level security;

-- Perfiles: el propio y los de quienes comparten grupo conmigo.
create policy profiles_select on profiles for select using (
  id = auth.uid() or exists (
    select 1 from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and mine.left_at is null and theirs.user_id = profiles.id
  )
);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Grupos: se crean vía create_group(); se ven si sos miembro; los edita el owner.
create policy groups_select on groups for select using (is_group_member(id));
create policy groups_update on groups for update using (is_group_owner(id) and kind <> 'personal');

-- Miembros: visibles para el grupo; cualquier miembro puede sumar invitados sin cuenta.
create policy members_select on group_members for select using (is_group_member(group_id));
create policy members_insert on group_members for insert with check (
  is_group_member(group_id) and user_id is null and role = 'member'
  and exists (select 1 from groups g where g.id = group_id and g.kind <> 'personal')
);
create policy members_update on group_members for update using (is_group_member(group_id));

create policy invites_select on group_invites for select using (is_group_member(group_id));
create policy invites_insert on group_invites for insert with check (
  is_group_member(group_id) and created_by = auth.uid()
  and exists (select 1 from groups g where g.id = group_id and g.kind <> 'personal')
);
create policy invites_delete on group_invites for delete using (is_group_member(group_id));

-- Categorías: las del sistema + las propias.
create policy categories_select on categories for select using (owner_id is null or owner_id = auth.uid());
create policy categories_write on categories for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Gastos y liquidaciones: cualquier miembro del grupo los ve y edita (como en Splitwise).
create policy expenses_all on expenses for all
  using (is_group_member(group_id))
  with check (is_group_member(group_id));
create policy payers_all on expense_payers for all
  using (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)));
create policy shares_all on expense_shares for all
  using (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)));
create policy settlements_all on settlements for all
  using (is_group_member(group_id))
  with check (is_group_member(group_id));

-- Recategorización: estrictamente privada.
create policy overrides_own on share_category_overrides for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)
  ));

create policy activity_select on activity_log for select using (is_group_member(group_id));

-- ─────────────────────────────── Funciones de aplicación (RPC) ───────────────────────────────

-- Alta de usuario: perfil + grupo personal.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Yo');
  v_group uuid;
begin
  insert into profiles (id, display_name) values (new.id, v_name);
  insert into groups (name, kind, currency, simplify_debts, created_by)
    values ('Personal', 'personal', 'ARS', false, new.id) returning id into v_group;
  insert into group_members (group_id, user_id, display_name, role)
    values (v_group, new.id, v_name, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Crear un grupo compartido y quedar como owner.
create function create_group(p_name text, p_kind group_kind, p_currency char(3))
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_kind = 'personal' then raise exception 'INVALID_KIND: el grupo personal se crea automáticamente'; end if;
  insert into groups (name, kind, currency, created_by) values (p_name, p_kind, p_currency, v_uid)
    returning id into v_group;
  insert into group_members (group_id, user_id, display_name, role)
    select v_group, v_uid, display_name, 'owner' from profiles where id = v_uid;
  return v_group;
end $$;

-- Unirse a un grupo con un link de invitación.
create function accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  inv group_invites%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into inv from group_invites where token = p_token and expires_at > now();
  if not found then raise exception 'INVITE_INVALID'; end if;

  if exists (select 1 from group_members where group_id = inv.group_id and user_id = v_uid) then
    return inv.group_id;
  end if;

  if inv.member_id is not null then
    -- Reclama el miembro "sin cuenta" (con todo su historial de gastos).
    update group_members set user_id = v_uid where id = inv.member_id and user_id is null;
    if not found then raise exception 'INVITE_ALREADY_CLAIMED'; end if;
    delete from group_invites where token = p_token;
  else
    insert into group_members (group_id, user_id, display_name)
      select inv.group_id, v_uid, display_name from profiles where id = v_uid;
  end if;
  return inv.group_id;
end $$;

-- Guarda (alta o edición) un gasto completo de forma atómica.
-- payload: { id?, group_id, description, amount_minor, currency, spent_at?, category_id?, split_type, notes?,
--            payers: [{member_id, amount_minor}], shares: [{member_id, amount_minor, split_value?}] }
-- Corre con los permisos del usuario (RLS aplica). Las invariantes se validan al commit.
create function save_expense(payload jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := coalesce((payload ->> 'id')::uuid, gen_random_uuid());
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

  return v_id;
end $$;

-- ─────────────────────────────── Vistas ───────────────────────────────

-- Mi registro personal: mi parte de cada gasto (grupos + personal), con mi categoría privada.
create view my_ledger with (security_invoker = true) as
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
  coalesce(o.category_id, e.category_id)   as category_id
from expense_shares s
join group_members m on m.id = s.member_id and m.user_id = auth.uid()
join expenses e      on e.id = s.expense_id and e.deleted_at is null
join groups g        on g.id = e.group_id
left join expense_payers p on p.expense_id = e.id and p.member_id = m.id
left join share_category_overrides o on o.expense_id = e.id and o.user_id = auth.uid();

-- Balance neto por miembro y moneda (positivo = le deben).
create view group_balances with (security_invoker = true) as
select group_id, member_id, currency, sum(delta)::bigint as balance_minor
from (
  select e.group_id, p.member_id, e.currency, p.amount_minor as delta
    from expense_payers p join expenses e on e.id = p.expense_id where e.deleted_at is null
  union all
  select e.group_id, s.member_id, e.currency, -s.amount_minor
    from expense_shares s join expenses e on e.id = s.expense_id where e.deleted_at is null
  union all
  select group_id, from_member_id, currency, amount_minor from settlements where deleted_at is null
  union all
  select group_id, to_member_id, currency, -amount_minor from settlements where deleted_at is null
) t
group by group_id, member_id, currency;

-- ─────────────────────────────── Permisos ───────────────────────────────

revoke execute on function save_expense(jsonb), create_group(text, group_kind, char), accept_invite(text) from public;
grant execute on function save_expense(jsonb), create_group(text, group_kind, char), accept_invite(text) to authenticated;
