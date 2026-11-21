import type { CurrencyCode, Expense, MemberId, MinorUnits } from './types';

/**
 * Una línea del registro personal. El monto es lo que el usuario CONSUMIÓ
 * (su parte), no lo que pagó. Las liquidaciones nunca aparecen acá.
 */
export interface LedgerEntry {
  expenseId: string;
  groupId: string;
  description: string;
  spentAt: string;
  currency: CurrencyCode;
  consumedMinor: MinorUnits;
  paidMinor: MinorUnits;
  categoryId: string | null;
}

export interface PersonalLedgerInput {
  expenses: readonly Expense[];
  /** Los member ids del usuario: uno por grupo, incluido su grupo personal. */
  userMemberIds: ReadonlySet<MemberId>;
  /** Recategorización privada del usuario: expenseId -> categoryId. */
  categoryOverrides?: ReadonlyMap<string, string>;
}

export function personalLedger({ expenses, userMemberIds, categoryOverrides }: PersonalLedgerInput): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const e of expenses) {
    const consumed = e.shares.filter((s) => userMemberIds.has(s.memberId)).reduce((a, s) => a + s.amountMinor, 0);
    const paid = e.payers.filter((p) => userMemberIds.has(p.memberId)).reduce((a, p) => a + p.amountMinor, 0);
    if (consumed === 0 && paid === 0) continue;
    entries.push({
      expenseId: e.id,
      groupId: e.groupId,
      description: e.description,
      spentAt: e.spentAt,
      currency: e.currency,
      consumedMinor: consumed,
      paidMinor: paid,
      categoryId: categoryOverrides?.get(e.id) ?? e.categoryId,
    });
  }
  return entries.sort((a, b) => b.spentAt.localeCompare(a.spentAt));
}

const UNCATEGORIZED = '__uncategorized__';

/** Consumo por moneda y categoría. */
export function totalsByCategory(
  entries: readonly LedgerEntry[],
): Record<CurrencyCode, Record<string, MinorUnits>> {
  const out: Record<CurrencyCode, Record<string, MinorUnits>> = {};
  for (const e of entries) {
    if (e.consumedMinor === 0) continue;
    const byCat = (out[e.currency] ??= {});
    const key = e.categoryId ?? UNCATEGORIZED;
    byCat[key] = (byCat[key] ?? 0) + e.consumedMinor;
  }
  return out;
}

/** Consumido vs. pagado por moneda: la diferencia es lo que financiaste (o te financiaron). */
export function cashflowSummary(
  entries: readonly LedgerEntry[],
): Record<CurrencyCode, { consumedMinor: MinorUnits; paidMinor: MinorUnits }> {
  const out: Record<CurrencyCode, { consumedMinor: MinorUnits; paidMinor: MinorUnits }> = {};
  for (const e of entries) {
    const c = (out[e.currency] ??= { consumedMinor: 0, paidMinor: 0 });
    c.consumedMinor += e.consumedMinor;
    c.paidMinor += e.paidMinor;
  }
  return out;
}
