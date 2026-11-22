import { isoDate } from './dates';
import { supabase } from './supabase';
import type {
  BalanceRow,
  Category,
  ExpenseRow,
  Group,
  GroupKind,
  LedgerRow,
  Profile,
  SaveExpensePayload,
  SettlementRow,
} from './types';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const GROUP_FIELDS =
  'id, name, kind, currency, simplify_debts, image_path, group_members(id, user_id, display_name, role, left_at)';

export async function fetchGroups(): Promise<Group[]> {
  return unwrap(
    await supabase.from('groups').select(GROUP_FIELDS).is('deleted_at', null).order('created_at', { ascending: true }),
  ) as Group[];
}

export async function fetchGroup(id: string): Promise<Group> {
  return unwrap(await supabase.from('groups').select(GROUP_FIELDS).eq('id', id).single()) as Group;
}

export async function fetchCategories(): Promise<Category[]> {
  return unwrap(
    await supabase
      .from('categories')
      // Incluye archivadas: los gastos viejos las siguen mostrando (el selector las oculta).
      .select('id, parent_id, owner_id, system_key, name, icon, sort_order, archived_at')
      .order('sort_order')
      .order('name'),
  ) as Category[];
}

const EXPENSE_FIELDS =
  'id, group_id, description, amount_minor, currency, spent_at, category_id, split_type, created_by, created_at, expense_payers(member_id, amount_minor), expense_shares(member_id, amount_minor, split_value)';

/** PostgREST devuelve bigint como string: normalizamos a number. */
function normalizeExpense(e: ExpenseRow): ExpenseRow {
  return {
    ...e,
    amount_minor: Number(e.amount_minor),
    expense_payers: e.expense_payers.map((p) => ({ ...p, amount_minor: Number(p.amount_minor) })),
    expense_shares: e.expense_shares.map((x) => ({
      ...x,
      amount_minor: Number(x.amount_minor),
      split_value: x.split_value === null ? null : Number(x.split_value),
    })),
  };
}

export async function fetchExpense(id: string): Promise<ExpenseRow> {
  const row = unwrap(
    await supabase.from('expenses').select(EXPENSE_FIELDS).eq('id', id).is('deleted_at', null).single(),
  ) as ExpenseRow;
  return normalizeExpense(row);
}

export async function deleteExpense(id: string): Promise<void> {
  unwrap(await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id));
}

export async function fetchGroupExpenses(groupId: string): Promise<ExpenseRow[]> {
  const rows = unwrap(
    await supabase
      .from('expenses')
      .select(EXPENSE_FIELDS)
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as ExpenseRow[];
  return rows.map(normalizeExpense);
}

export async function fetchBalances(groupId?: string): Promise<BalanceRow[]> {
  let q = supabase.from('group_balances').select('group_id, member_id, currency, balance_minor');
  if (groupId) q = q.eq('group_id', groupId);
  const rows = unwrap(await q) as BalanceRow[];
  // bigint llega como string desde PostgREST.
  return rows.map((r) => ({ ...r, balance_minor: Number(r.balance_minor) }));
}

export async function fetchLedger(from: string, to: string): Promise<LedgerRow[]> {
  const rows = unwrap(
    await supabase
      .from('my_ledger')
      .select('*')
      .gte('spent_at', from)
      .lte('spent_at', to)
      // Más nuevo arriba: por fecha del gasto y, dentro del mismo día, por momento de carga.
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as LedgerRow[];
  return rows.map((r) => ({ ...r, consumed_minor: Number(r.consumed_minor), paid_minor: Number(r.paid_minor) }));
}

export async function saveExpense(payload: SaveExpensePayload): Promise<string> {
  return unwrap(await supabase.rpc('save_expense', { payload })) as string;
}

export async function createGroup(name: string, kind: Exclude<GroupKind, 'personal'>, currency: string): Promise<string> {
  return unwrap(await supabase.rpc('create_group', { p_name: name, p_kind: kind, p_currency: currency })) as string;
}

export async function addGuestMember(groupId: string, displayName: string): Promise<void> {
  unwrap(await supabase.from('group_members').insert({ group_id: groupId, display_name: displayName, role: 'member' }));
}

export async function createInvite(groupId: string, userId: string): Promise<string> {
  const row = unwrap(
    await supabase.from('group_invites').insert({ group_id: groupId, created_by: userId }).select('token').single(),
  ) as { token: string };
  return row.token;
}

export async function acceptInvite(token: string): Promise<string> {
  return unwrap(await supabase.rpc('accept_invite', { p_token: token })) as string;
}

export async function createSettlement(input: {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
  userId: string;
}): Promise<void> {
  unwrap(
    await supabase.from('settlements').insert({
      group_id: input.groupId,
      from_member_id: input.fromMemberId,
      to_member_id: input.toMemberId,
      amount_minor: input.amountMinor,
      currency: input.currency,
      // Fecha local del dispositivo (el servidor está en UTC: de noche sería "mañana").
      paid_at: isoDate(),
      created_by: input.userId,
    }),
  );
}

export async function renameMember(memberId: string, displayName: string): Promise<void> {
  unwrap(await supabase.from('group_members').update({ display_name: displayName }).eq('id', memberId));
}

/** Baja lógica. La base rechaza la baja si el miembro tiene saldo pendiente. */
export async function removeMember(memberId: string): Promise<void> {
  unwrap(await supabase.from('group_members').update({ left_at: new Date().toISOString() }).eq('id', memberId));
}

export async function fetchProfile(userId: string): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').select('id, display_name, default_currency, avatar_path').eq('id', userId).single(),
  ) as Profile;
}

export async function updateMyName(displayName: string): Promise<void> {
  unwrap(await supabase.rpc('update_my_profile', { p_display_name: displayName }));
  // También en los metadatos de la sesión, para que quede consistente.
  const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
  if (error) throw new Error(error.message);
}

/** Supabase envía un email de confirmación; el cambio se aplica al confirmarlo. */
export async function updateMyEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
}

export async function fetchSettlements(groupId: string): Promise<SettlementRow[]> {
  const rows = unwrap(
    await supabase
      .from('settlements')
      .select('id, group_id, from_member_id, to_member_id, amount_minor, currency, paid_at, created_at')
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('paid_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as SettlementRow[];
  return rows.map((r) => ({ ...r, amount_minor: Number(r.amount_minor) }));
}

export async function deleteSettlement(id: string): Promise<void> {
  unwrap(await supabase.from('settlements').update({ deleted_at: new Date().toISOString() }).eq('id', id));
}

export async function setGroupImage(groupId: string, path: string | null): Promise<void> {
  unwrap(await supabase.rpc('set_group_image', { p_group_id: groupId, p_path: path }));
}

export async function setMyAvatar(path: string | null): Promise<void> {
  unwrap(await supabase.rpc('set_my_avatar', { p_path: path }));
}

export async function createCategory(input: { ownerId: string; name: string; icon: string | null; parentId: string | null }) {
  unwrap(
    await supabase.from('categories').insert({
      owner_id: input.ownerId,
      name: input.name,
      icon: input.icon,
      parent_id: input.parentId,
      sort_order: 500,
    }),
  );
}

export async function updateCategory(id: string, patch: { name?: string; icon?: string | null; archived_at?: string | null }) {
  unwrap(await supabase.from('categories').update(patch).eq('id', id));
}

/** Mi categoría privada para mi parte de un gasto compartido (null = la del grupo). */
export async function fetchMyCategoryOverride(expenseId: string, userId: string): Promise<string | null> {
  const rows = unwrap(
    await supabase.from('share_category_overrides').select('category_id').eq('expense_id', expenseId).eq('user_id', userId),
  ) as { category_id: string }[];
  return rows[0]?.category_id ?? null;
}

export async function setMyCategoryOverride(expenseId: string, userId: string, categoryId: string | null): Promise<void> {
  if (categoryId === null) {
    unwrap(await supabase.from('share_category_overrides').delete().eq('expense_id', expenseId).eq('user_id', userId));
  } else {
    unwrap(
      await supabase
        .from('share_category_overrides')
        .upsert({ user_id: userId, expense_id: expenseId, category_id: categoryId }, { onConflict: 'user_id,expense_id' }),
    );
  }
}

/** Baja lógica del grupo; la base la rechaza si hay saldos pendientes. */
export async function deleteGroup(groupId: string): Promise<void> {
  unwrap(await supabase.rpc('delete_group', { p_group_id: groupId }));
}
