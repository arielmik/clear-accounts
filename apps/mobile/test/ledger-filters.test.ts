import { describe, expect, it } from 'vitest';
import { compareByCategory, compareByPaymentMethod, filterLedger, normalize } from '../src/lib/ledger-filters';
import type { Category, LedgerRow } from '../src/lib/types';

const cat = (id: string, name: string, parent_id: string | null = null): Category => ({
  id, name, parent_id, owner_id: null, system_key: id, icon: null, sort_order: 0, archived_at: null,
});
const categories = [cat('food', 'Comida'), cat('rest', 'Restaurantes', 'food'), cat('home', 'Hogar'), cat('rent', 'Alquiler', 'home')];
const byId = new Map(categories.map((c) => [c.id, c]));

const row = (id: string, description: string, consumed: number, category_id: string | null, is_personal = false, currency = 'ARS'): LedgerRow => ({
  expense_id: id, group_id: is_personal ? 'p' : 'g', group_name: is_personal ? 'Personal' : 'Viaje', is_personal,
  description, spent_at: '2026-11-20', currency, consumed_minor: consumed, paid_minor: 0, category_id, created_at: '2026-11-20T10:00:00Z', payment_method_id: null,
});

const rows = [
  row('1', 'Café con medialunas', 300, 'rest', true),
  row('2', 'Cena en el centro', 1000, 'rest'),
  row('3', 'Alquiler noviembre', 45000, 'rent'),
  row('4', 'Varios', 200, null, true),
];

describe('filterLedger', () => {
  const none = { query: '', kind: 'all' as const, rootCategoryId: null };

  it('busca sin importar tildes ni mayúsculas, en descripción, grupo y categoría', () => {
    expect(filterLedger(rows, { ...none, query: 'CAFE' }, byId).map((r) => r.expense_id)).toEqual(['1']);
    expect(filterLedger(rows, { ...none, query: 'viaje' }, byId).map((r) => r.expense_id)).toEqual(['2', '3']);
    expect(filterLedger(rows, { ...none, query: 'restaurantes centro' }, byId).map((r) => r.expense_id)).toEqual(['2']);
  });

  it('filtra personales y compartidos', () => {
    expect(filterLedger(rows, { ...none, kind: 'personal' }, byId).map((r) => r.expense_id)).toEqual(['1', '4']);
    expect(filterLedger(rows, { ...none, kind: 'shared' }, byId).map((r) => r.expense_id)).toEqual(['2', '3']);
  });

  it('filtra por categoría de primer nivel, incluidas las subcategorías y "sin categoría"', () => {
    expect(filterLedger(rows, { ...none, rootCategoryId: 'food' }, byId).map((r) => r.expense_id)).toEqual(['1', '2']);
    expect(filterLedger(rows, { ...none, rootCategoryId: 'none' }, byId).map((r) => r.expense_id)).toEqual(['4']);
  });

  it('normalize', () => {
    expect(normalize('  Ñandú  ÁRBOL ')).toBe('nandu arbol');
  });
});

describe('compareByCategory', () => {
  it('compara contra el mes anterior por categoría y en total', () => {
    const previous = [row('a', 'x', 1000, 'rest'), row('b', 'y', 40000, 'rent'), row('c', 'usd', 999, 'rest', false, 'USD')];
    const { total, categories: list } = compareByCategory(rows, previous, 'ARS', byId);
    expect(total).toEqual({ key: 'total', current: 46500, previous: 41000, changePct: 13 });
    expect(list.find((c) => c.key === 'food')).toEqual({ key: 'food', current: 1300, previous: 1000, changePct: 30 });
    expect(list.find((c) => c.key === 'none')).toEqual({ key: 'none', current: 200, previous: 0, changePct: null });
  });
});

describe('medios de pago en el registro', () => {
  const withMethod = (r: LedgerRow, payment_method_id: string | null): LedgerRow => ({ ...r, payment_method_id });
  const month = [withMethod(rows[0]!, 'cash'), withMethod(rows[1]!, 'credit'), withMethod(rows[2]!, 'credit'), rows[3]!];

  it('agrupa por medio de pago, con "sin especificar" aparte', () => {
    const { categories: list } = compareByPaymentMethod(month, [withMethod(rows[2]!, 'credit')], 'ARS');
    expect(list.map((c) => [c.key, c.current])).toEqual([['credit', 46000], ['cash', 300], ['none', 200]]);
    expect(list[0]!.changePct).toBe(2);
  });

  it('filtra por medio de pago', () => {
    const none = { query: '', kind: 'all' as const, rootCategoryId: null };
    expect(filterLedger(month, { ...none, paymentMethodId: 'credit' }, byId).map((r) => r.expense_id)).toEqual(['2', '3']);
    expect(filterLedger(month, { ...none, paymentMethodId: 'none' }, byId).map((r) => r.expense_id)).toEqual(['4']);
  });
});
