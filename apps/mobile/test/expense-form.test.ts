import { describe, expect, it } from 'vitest';
import { buildExpensePayload, fillRemaining, initialFormState, splitPreview } from '../src/lib/expense-form';
import type { Group } from '../src/lib/types';

const member = (id: string, user_id: string | null = null) => ({
  id,
  user_id,
  display_name: id,
  role: 'member' as const,
  left_at: null,
});

const trip: Group = {
  id: 'g1',
  name: 'Viaje',
  kind: 'trip',
  currency: 'ARS',
  simplify_debts: true,
  image_path: null,
  color: null,
  group_members: [member('ana', 'u-ana'), member('beto', 'u-beto'), member('vos', 'u-vos')],
};

const personal: Group = { ...trip, id: 'p1', name: 'Personal', kind: 'personal', group_members: [member('yo', 'u-vos')] };

describe('buildExpensePayload', () => {
  it('partes iguales entre todos por defecto, paga quien carga', () => {
    const state = { ...initialFormState(trip, 'vos', '2026-11-21'), amountText: '30.000', description: 'Cena' };
    const r = buildExpensePayload(state, trip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.amount_minor).toBe(3000000);
    expect(r.payload.payers).toEqual([{ member_id: 'vos', amount_minor: 3000000 }]);
    expect(r.payload.shares.map((s) => s.amount_minor)).toEqual([1000000, 1000000, 1000000]);
  });

  it('excluye participantes destildados', () => {
    const state = {
      ...initialFormState(trip, 'vos', '2026-11-21'),
      amountText: '100',
      description: 'Taxi',
      participants: ['ana', 'vos'],
    };
    const r = buildExpensePayload(state, trip);
    expect(r.ok && r.payload.shares.map((s) => s.member_id)).toEqual(['ana', 'vos']);
  });

  it('porcentajes guardan los puntos básicos para re-editar', () => {
    const state = {
      ...initialFormState(trip, 'ana', '2026-11-21'),
      amountText: '1000',
      description: 'Alquiler',
      splitType: 'percent' as const,
      values: { ana: '60', beto: '40' },
    };
    const r = buildExpensePayload(state, trip);
    expect(r.ok && r.payload.shares).toEqual([
      { member_id: 'ana', amount_minor: 60000, split_value: 6000 },
      { member_id: 'beto', amount_minor: 40000, split_value: 4000 },
    ]);
  });

  it('montos exactos que no cierran devuelven un error legible', () => {
    const state = {
      ...initialFormState(trip, 'ana', '2026-11-21'),
      amountText: '1000',
      description: 'Super',
      splitType: 'exact' as const,
      values: { ana: '600', beto: '300' },
    };
    const r = buildExpensePayload(state, trip);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/suman/);
  });

  it('gasto personal: una sola parte, la tuya', () => {
    const state = { ...initialFormState(personal, 'yo', '2026-11-21'), amountText: '3500', description: 'Café' };
    const r = buildExpensePayload(state, personal);
    expect(r.ok && r.payload.shares).toEqual([{ member_id: 'yo', amount_minor: 350000, split_value: null }]);
  });

  it('valida monto y descripción', () => {
    const base = initialFormState(trip, 'vos', '2026-11-21');
    expect(buildExpensePayload({ ...base, amountText: 'abc', description: 'x' }, trip).ok).toBe(false);
    expect(buildExpensePayload({ ...base, amountText: '10', description: '  ' }, trip).ok).toBe(false);
  });
});

import { formStateFromExpense } from '../src/lib/expense-form';
import type { ExpenseRow } from '../src/lib/types';

describe('formStateFromExpense', () => {
  const base = { group_id: 'g1', currency: 'ARS', spent_at: '2026-11-20', category_id: 'c1', created_by: 'u-ana' };

  it.each([
    ['equal', [{ member_id: 'ana', amount_minor: 50000, split_value: null }, { member_id: 'vos', amount_minor: 50000, split_value: null }]],
    ['exact', [{ member_id: 'ana', amount_minor: 70050, split_value: null }, { member_id: 'beto', amount_minor: 29950, split_value: null }]],
    ['percent', [{ member_id: 'ana', amount_minor: 33330, split_value: 3333 }, { member_id: 'beto', amount_minor: 66670, split_value: 6667 }]],
    ['shares', [{ member_id: 'ana', amount_minor: 66667, split_value: 2 }, { member_id: 'beto', amount_minor: 33333, split_value: 1 }]],
  ] as const)('editar sin cambios reproduce el mismo gasto (%s)', (splitType, shares) => {
    const expense: ExpenseRow = {
      ...base,
      id: 'e1',
      description: 'Algo',
      amount_minor: 100000,
      split_type: splitType,
      created_at: '2026-11-20T12:00:00Z',
      expense_payers: [{ member_id: 'ana', amount_minor: 100000 }],
      expense_shares: shares.map((s) => ({ ...s })),
    };
    const r = buildExpensePayload(formStateFromExpense(expense, trip), trip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.id).toBe('e1');
    expect(r.payload.split_type).toBe(splitType);
    expect(r.payload.shares.map((s) => [s.member_id, s.amount_minor])).toEqual(shares.map((s) => [s.member_id, s.amount_minor]));
  });
});

describe('splitPreview / fillRemaining', () => {
  const base = initialFormState(trip, 'vos', '2026-11-25');

  it('iguales: divide entre los participantes', () => {
    const p = splitPreview({ ...base, participants: ['ana', 'vos'] }, trip, 10000);
    expect(p.perMember).toEqual({ ana: 5000, vos: 5000 });
    expect(p.assignedRatio).toBeNull();
  });

  it('porcentaje: monto por persona y lo que falta', () => {
    const s = { ...base, splitType: 'percent' as const, values: { ana: '40', beto: '30', vos: '20' } };
    const p = splitPreview(s, trip, 4800000);
    expect(p.perMember).toEqual({ ana: 1920000, beto: 1440000, vos: 960000 });
    expect(p.remaining).toBe(1000); // 10 %
    expect(p.assignedRatio).toBeCloseTo(0.9);
    expect(fillRemaining(s, trip, 4800000, 'vos').vos).toBe('30');
  });

  it('montos: completa lo que falta sobre lo que ya tenía', () => {
    const s = { ...base, splitType: 'exact' as const, values: { ana: '60', vos: '' } };
    expect(splitPreview(s, trip, 10000).remaining).toBe(4000);
    const values = fillRemaining(s, trip, 10000, 'vos');
    expect(buildExpensePayload({ ...s, description: 'x', amountText: '100', values }, trip).ok).toBe(true);
  });

  it('partes: proporcional a las unidades', () => {
    const p = splitPreview({ ...base, splitType: 'shares', values: { ana: '2', vos: '1' } }, trip, 9000);
    expect(p.perMember).toEqual({ ana: 6000, vos: 3000 });
  });
});
