-- Permisos explícitos para la API (PostgREST).
-- Los proyectos nuevos de Supabase ya no exponen automáticamente las tablas
-- creadas por SQL. La seguridad fina la sigue dando RLS: estos GRANT solo
-- habilitan que el rol `authenticated` llegue a las tablas; RLS decide qué filas.
-- `anon` (sin sesión) no recibe acceso a datos.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  profiles,
  groups,
  group_members,
  group_invites,
  categories,
  expenses,
  expense_payers,
  expense_shares,
  share_category_overrides,
  settlements
to authenticated;

-- Historial: solo lectura (lo escriben los triggers).
grant select on activity_log to authenticated;

-- Vistas (security_invoker: aplican RLS de las tablas de abajo).
grant select on my_ledger, group_balances to authenticated;

-- Funciones usadas por políticas RLS y triggers que corren con el rol del usuario.
grant execute on function
  is_group_member(uuid),
  is_group_owner(uuid),
  assert_expense_consistent(uuid)
to authenticated;
