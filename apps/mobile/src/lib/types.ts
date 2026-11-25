export type GroupKind = 'personal' | 'home' | 'trip' | 'couple' | 'other';
export type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

export interface Member {
  id: string;
  user_id: string | null;
  display_name: string;
  role: 'owner' | 'member';
  left_at: string | null;
}

export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  currency: string;
  simplify_debts: boolean;
  image_path: string | null;
  /** Clave de la paleta (ver lib/group-colors); null = sin elegir. */
  color: string | null;
  group_members: Member[];
}

export interface Category {
  id: string;
  parent_id: string | null;
  owner_id: string | null;
  system_key: string | null;
  name: string;
  icon: string | null;
  sort_order: number;
  archived_at: string | null;
}

export interface ExpenseRow {
  id: string;
  group_id: string;
  description: string;
  amount_minor: number;
  currency: string;
  spent_at: string;
  category_id: string | null;
  split_type: SplitType;
  created_by: string;
  created_at: string;
  expense_payers: { member_id: string; amount_minor: number }[];
  expense_shares: { member_id: string; amount_minor: number; split_value: number | null }[];
}

export interface LedgerRow {
  expense_id: string;
  group_id: string;
  group_name: string;
  is_personal: boolean;
  description: string;
  spent_at: string;
  currency: string;
  consumed_minor: number;
  paid_minor: number;
  category_id: string | null;
  created_at: string;
}

export interface BalanceRow {
  group_id: string;
  member_id: string;
  currency: string;
  balance_minor: number;
}

export interface SaveExpensePayload {
  id?: string;
  group_id: string;
  description: string;
  amount_minor: number;
  currency: string;
  spent_at?: string;
  category_id: string | null;
  split_type: SplitType;
  payers: { member_id: string; amount_minor: number }[];
  shares: { member_id: string; amount_minor: number; split_value: number | null }[];
}

export interface Profile {
  id: string;
  display_name: string;
  default_currency: string;
  avatar_path: string | null;
}

export interface SettlementRow {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_minor: number;
  currency: string;
  paid_at: string;
  created_at: string;
}
