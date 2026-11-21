import { describe, expect, it } from 'vitest';
import { buildExpensePayload, initialFormState } from '../src/lib/expense-form';
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
