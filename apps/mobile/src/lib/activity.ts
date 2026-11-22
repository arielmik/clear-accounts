import type { ExpenseRow, SettlementRow } from './types';

export type ActivityItem =
  | { kind: 'expense'; date: string; created: string; e: ExpenseRow }
  | { kind: 'payment'; date: string; created: string; p: SettlementRow };

/**
 * Gastos y pagos intercalados, del más nuevo al más viejo:
 * primero por fecha (del gasto o del pago) y, dentro del mismo día, por momento de carga.
 */
export function groupActivity(expenses: readonly ExpenseRow[], payments: readonly SettlementRow[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...expenses.map((e) => ({ kind: 'expense' as const, date: e.spent_at, created: e.created_at, e })),
    ...payments.map((p) => ({ kind: 'payment' as const, date: p.paid_at, created: p.created_at, p })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.created) - Date.parse(a.created));
}
