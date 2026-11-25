import { rootCategoryOf } from './ledger-filters';
import type { BalanceRow, Category, Group, LedgerRow } from './types';

export interface MonthSlice {
  /** Id de la categoría de primer nivel, 'none' (sin categoría) u 'other' (el resto). */
  key: string;
  amountMinor: number;
  /** Porcentaje del total, redondeado. */
  pct: number;
}

export interface MonthSummary {
  currency: string;
  totalMinor: number;
  /** Variación contra el mes anterior hasta el mismo día; null si no hay con qué comparar. */
  changePct: number | null;
  /** Las categorías más grandes y, si hay más, un último tramo 'other'. */
  slices: MonthSlice[];
}

/**
 * Resumen del mes para Inicio, por moneda (la de mayor consumo primero).
 * La comparación usa el mes anterior cortado en el mismo día, para no comparar
 * medio mes contra un mes entero.
 */
export function monthSummary(
  current: readonly LedgerRow[],
  previous: readonly LedgerRow[],
  dayOfMonth: number,
  byId: ReadonlyMap<string, Category>,
  maxSlices = 3,
): MonthSummary[] {
  const sumBy = (rows: readonly LedgerRow[], currency: string) =>
    rows.filter((r) => r.currency === currency).reduce((a, r) => a + r.consumed_minor, 0);
  const prevSoFar = previous.filter((r) => Number(r.spent_at.slice(8, 10)) <= dayOfMonth);

  const currencies = [...new Set(current.map((r) => r.currency))];
  const out = currencies.map((currency): MonthSummary => {
    const totalMinor = sumBy(current, currency);
    const prevMinor = sumBy(prevSoFar, currency);

    const byCat = new Map<string, number>();
    for (const r of current) {
      if (r.currency !== currency) continue;
      const key = rootCategoryOf(r.category_id, byId);
      byCat.set(key, (byCat.get(key) ?? 0) + r.consumed_minor);
    }
    const sorted = [...byCat.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const top = sorted.length > maxSlices + 1 ? sorted.slice(0, maxSlices) : sorted;
    const rest = sorted.slice(top.length).reduce((a, [, v]) => a + v, 0);
    const pct = (v: number) => (totalMinor > 0 ? Math.round((v / totalMinor) * 100) : 0);
    const slices = top.map(([key, amountMinor]) => ({ key, amountMinor, pct: pct(amountMinor) }));
    if (rest > 0) slices.push({ key: 'other', amountMinor: rest, pct: pct(rest) });

    return {
      currency,
      totalMinor,
      changePct: prevMinor > 0 ? Math.round(((totalMinor - prevMinor) / prevMinor) * 100) : null,
      slices,
    };
  });
  return out.sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Saldo del usuario en cada grupo compartido (en la moneda del grupo). */
export function myGroupBalances(
  groups: readonly Group[],
  balances: readonly BalanceRow[],
  userId: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of groups) {
    if (g.kind === 'personal') continue;
    const me = g.group_members.find((m) => m.user_id === userId);
    const total = balances
      .filter((b) => b.group_id === g.id && b.member_id === me?.id && b.currency === g.currency)
      .reduce((a, b) => a + b.balance_minor, 0);
    out.set(g.id, total);
  }
  return out;
}
