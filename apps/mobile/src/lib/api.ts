import { supabase } from './supabase';
import type { BalanceRow, Category, ExpenseRow, Group, GroupKind, LedgerRow, SaveExpensePayload } from './types';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const GROUP_FIELDS = 'id, name, kind, currency, simplify_debts, group_members(id, user_id, display_name, role, left_at)';

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
      .select('id, parent_id, owner_id, system_key, name, icon, sort_order')
      .is('archived_at', null)
      .order('sort_order'),
  ) as Category[];
}

export async function fetchGroupExpenses(groupId: string): Promise<ExpenseRow[]> {
  return unwrap(
    await supabase
      .from('expenses')
      .select(
        'id, group_id, description, amount_minor, currency, spent_at, category_id, split_type, created_by, expense_payers(member_id, amount_minor), expense_shares(member_id, amount_minor, split_value)',
      )
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as ExpenseRow[];
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
      .order('spent_at', { ascending: false }),
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
      created_by: input.userId,
    }),
  );
}
