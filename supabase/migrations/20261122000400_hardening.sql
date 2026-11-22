-- Endurecimiento según el Security & Performance Advisor de Supabase.

-- ─────────────── 1. search_path fijo en todas las funciones ───────────────
alter function touch_updated_at()                set search_path = public;
alter function check_expense_trigger()           set search_path = public;
alter function check_settlement()                set search_path = public;
alter function assert_expense_consistent(uuid)   set search_path = public;
alter function image_path_owner(text, text)      set search_path = public;

-- ─────────────── 2. Funciones: nada ejecutable sin sesión ───────────────
-- Por defecto Supabase deja ejecutar funciones a `anon`. Se revoca todo y se otorga
-- explícitamente a `authenticated` solo lo que la app (o las políticas RLS) usa.
-- Las funciones de trigger no necesitan EXECUTE: los triggers corren igual.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on function
  save_expense(jsonb),
  create_group(text, group_kind, char),
  accept_invite(text),
  update_my_profile(text),
  set_group_image(uuid, text),
  set_my_avatar(text),
  is_group_member(uuid),
  is_group_owner(uuid),
  assert_expense_consistent(uuid),
  image_path_owner(text, text),
  can_write_image(text),
  can_read_image(text)
to authenticated;

-- ─────────────── 3. RLS: auth.uid() evaluado una vez por consulta ───────────────
drop policy profiles_select on profiles;
create policy profiles_select on profiles for select using (
  id = (select auth.uid()) or exists (
    select 1 from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and mine.left_at is null and theirs.user_id = profiles.id
  )
);
drop policy profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy invites_insert on group_invites;
create policy invites_insert on group_invites for insert with check (
  is_group_member(group_id) and created_by = (select auth.uid())
  and exists (select 1 from groups g where g.id = group_id and g.kind <> 'personal')
);

-- Categorías: una política por acción (antes "for all" duplicaba el SELECT).
drop policy categories_select on categories;
drop policy categories_write on categories;
create policy categories_select on categories for select
  using (owner_id is null or owner_id = (select auth.uid()));
create policy categories_insert on categories for insert
  with check (owner_id = (select auth.uid()));
create policy categories_update on categories for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy categories_delete on categories for delete
  using (owner_id = (select auth.uid()));

drop policy overrides_own on share_category_overrides;
create policy overrides_own on share_category_overrides for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)
  ));

-- ─────────────── 4. Índices para claves foráneas usadas en consultas ───────────────
create index if not exists settlements_by_from on settlements (from_member_id);
create index if not exists settlements_by_to on settlements (to_member_id);
create index if not exists group_invites_by_group on group_invites (group_id);
create index if not exists expenses_by_category on expenses (category_id);
create index if not exists categories_by_parent on categories (parent_id);
create index if not exists overrides_by_expense on share_category_overrides (expense_id);
