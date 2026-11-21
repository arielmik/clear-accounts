import type { LedgerEntry } from '@clear-accounts/core';
import type { LedgerRow } from './types';

/** Adapta filas de la vista `my_ledger` al tipo del dominio para reutilizar sus cálculos. */
export function toLedgerEntries(rows: readonly LedgerRow[]): LedgerEntry[] {
  return rows.map((r) => ({
    expenseId: r.expense_id,
    groupId: r.group_id,
    description: r.description,
    spentAt: r.spent_at,
    currency: r.currency,
    consumedMinor: r.consumed_minor,
    paidMinor: r.paid_minor,
    categoryId: r.category_id,
  }));
}
