import type { Category, LedgerRow } from './types';

export type LedgerKind = 'all' | 'personal' | 'shared';

export interface LedgerFilter {
  query: string;
  kind: LedgerKind;
  /** Categoría de primer nivel ('none' = sin categoría). */
  rootCategoryId: string | null;
  /** Medio de pago ('none' = sin especificar). Opcional: ausente = todos. */
  paymentMethodId?: string | null;
}

/** Clave del medio de pago de una fila para agrupar ('none' = sin especificar). */
export const paymentMethodKey = (r: LedgerRow): string => r.payment_method_id ?? 'none';

/** Normaliza para buscar sin importar mayúsculas ni tildes ("cafe" encuentra "Café"). */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function rootCategoryOf(categoryId: string | null, byId: ReadonlyMap<string, Category>): string {
  let c = categoryId ? byId.get(categoryId) : undefined;
  while (c?.parent_id) c = byId.get(c.parent_id);
  return c?.id ?? 'none';
}

export function filterLedger(
  rows: readonly LedgerRow[],
  filter: LedgerFilter,
  byId: ReadonlyMap<string, Category>,
): LedgerRow[] {
  const q = normalize(filter.query);
  return rows.filter((r) => {
    if (filter.kind === 'personal' && !r.is_personal) return false;
    if (filter.kind === 'shared' && r.is_personal) return false;
    if (filter.rootCategoryId && rootCategoryOf(r.category_id, byId) !== filter.rootCategoryId) return false;
    if (filter.paymentMethodId && paymentMethodKey(r) !== filter.paymentMethodId) return false;
    if (q) {
      const category = r.category_id ? (byId.get(r.category_id)?.name ?? '') : '';
      const haystack = normalize(`${r.description} ${r.group_name} ${category}`);
      if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

export interface CategoryComparison {
  key: string;
  current: number;
  previous: number;
  /** Variación porcentual respecto del mes anterior; null si el mes anterior fue 0. */
  changePct: number | null;
}

/** Consumo por categoría de primer nivel: este mes vs. el anterior, en una moneda. */
export function compareByCategory(
  current: readonly LedgerRow[],
  previous: readonly LedgerRow[],
  currency: string,
  byId: ReadonlyMap<string, Category>,
): { total: CategoryComparison; categories: CategoryComparison[] } {
  return compareBy(current, previous, currency, (r) => rootCategoryOf(r.category_id, byId));
}

/** Consumo por medio de pago: este mes vs. el anterior, en una moneda. */
export function compareByPaymentMethod(
  current: readonly LedgerRow[],
  previous: readonly LedgerRow[],
  currency: string,
): { total: CategoryComparison; categories: CategoryComparison[] } {
  return compareBy(current, previous, currency, paymentMethodKey);
}

/** Consumo agrupado por una clave cualquiera, ordenado de mayor a menor este mes. */
export function compareBy(
  current: readonly LedgerRow[],
  previous: readonly LedgerRow[],
  currency: string,
  keyOf: (r: LedgerRow) => string,
): { total: CategoryComparison; categories: CategoryComparison[] } {
  const sum = (rows: readonly LedgerRow[]) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.currency !== currency) continue;
      const key = keyOf(r);
      map.set(key, (map.get(key) ?? 0) + r.consumed_minor);
    }
    return map;
  };
  const cur = sum(current);
  const prev = sum(previous);
  const make = (key: string, c: number, p: number): CategoryComparison => ({
    key,
    current: c,
    previous: p,
    changePct: p === 0 ? null : Math.round(((c - p) / p) * 100),
  });
  const keys = [...new Set([...cur.keys(), ...prev.keys()])];
  const categories = keys.map((k) => make(k, cur.get(k) ?? 0, prev.get(k) ?? 0)).sort((a, b) => b.current - a.current);
  const total = make(
    'total',
    categories.reduce((a, c) => a + c.current, 0),
    categories.reduce((a, c) => a + c.previous, 0),
  );
  return { total, categories };
}
