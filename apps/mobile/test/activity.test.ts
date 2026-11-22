import { describe, expect, it } from 'vitest';
import { groupActivity } from '../src/lib/activity';
import type { ExpenseRow, SettlementRow } from '../src/lib/types';

const expense = (id: string, spent_at: string, created_at: string): ExpenseRow => ({
  id, group_id: 'g', description: id, amount_minor: 100, currency: 'ARS', spent_at, category_id: null,
  split_type: 'equal', created_by: 'u', created_at, expense_payers: [], expense_shares: [],
});
const payment = (id: string, paid_at: string, created_at: string): SettlementRow => ({
  id, group_id: 'g', from_member_id: 'a', to_member_id: 'b', amount_minor: 100, currency: 'ARS', paid_at, created_at,
});
const ids = (items: ReturnType<typeof groupActivity>) => items.map((i) => (i.kind === 'expense' ? i.e.id : i.p.id));

describe('groupActivity', () => {
  it('intercala gastos y pagos del mismo día por momento de carga', () => {
    const items = groupActivity(
      [expense('cena', '2026-11-22', '2026-11-22T22:00:00Z'), expense('super', '2026-11-22', '2026-11-22T12:00:00Z')],
      [payment('pago', '2026-11-22', '2026-11-22T15:00:00Z')],
    );
    expect(ids(items)).toEqual(['cena', 'pago', 'super']);
  });

  it('la fecha manda sobre el momento de carga', () => {
    // Un gasto de ayer cargado hoy queda debajo de un pago de hoy.
    const items = groupActivity(
      [expense('ayer', '2026-11-21', '2026-11-22T23:00:00Z')],
      [payment('hoy', '2026-11-22', '2026-11-22T10:00:00Z')],
    );
    expect(ids(items)).toEqual(['hoy', 'ayer']);
  });

  it('compara instantes, no texto (distintas zonas horarias)', () => {
    const items = groupActivity(
      [expense('gasto', '2026-11-22', '2026-11-22T20:00:00-03:00')], // 23:00 UTC
      [payment('pago', '2026-11-22', '2026-11-22T22:00:00+00:00')],
    );
    expect(ids(items)).toEqual(['gasto', 'pago']);
  });
});
