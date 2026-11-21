import { describe, expect, it } from 'vitest';
import { cashflowSummary, computeShares, personalLedger, totalsByCategory, type Expense } from '../src';

const cena: Expense = {
  id: 'cena',
  groupId: 'viaje',
  description: 'Cena',
  amountMinor: 3000000,
  currency: 'ARS',
  spentAt: '2026-11-20',
  categoryId: 'restaurants',
  payers: [{ memberId: 'ana@viaje', amountMinor: 3000000 }],
  shares: computeShares(3000000, { type: 'equal', memberIds: ['ana@viaje', 'beto@viaje', 'vos@viaje'] }),
};

const super_: Expense = {
  id: 'super',
  groupId: 'casa',
  description: 'Supermercado',
  amountMinor: 500000,
  currency: 'ARS',
  spentAt: '2026-11-18',
  categoryId: 'groceries',
  payers: [{ memberId: 'vos@casa', amountMinor: 500000 }],
  shares: computeShares(500000, { type: 'equal', memberIds: ['vos@casa', 'pareja@casa'] }),
};

const cafe: Expense = {
  id: 'cafe',
  groupId: 'personal-vos',
  description: 'Café',
  amountMinor: 350000,
  currency: 'ARS',
  spentAt: '2026-11-21',
  categoryId: 'restaurants',
  payers: [{ memberId: 'vos@personal', amountMinor: 350000 }],
  shares: [{ memberId: 'vos@personal', amountMinor: 350000 }],
};

const me = new Set(['vos@viaje', 'vos@casa', 'vos@personal']);

describe('personalLedger', () => {
  it('registra tu parte de los gastos de grupo junto a los personales', () => {
    const entries = personalLedger({ expenses: [cena, super_, cafe], userMemberIds: me });
    expect(entries.map((e) => [e.expenseId, e.consumedMinor, e.paidMinor])).toEqual([
      ['cafe', 350000, 350000],
      ['cena', 1000000, 0],
      ['super', 250000, 500000],
    ]);
  });

  it('omite gastos donde no participás', () => {
    expect(personalLedger({ expenses: [cena], userMemberIds: new Set(['otro']) })).toEqual([]);
  });

  it('aplica la recategorización privada', () => {
    const entries = personalLedger({
      expenses: [super_],
      userMemberIds: me,
      categoryOverrides: new Map([['super', 'home']]),
    });
    expect(entries[0]!.categoryId).toBe('home');
  });

  it('totales por categoría y flujo de caja', () => {
    const entries = personalLedger({ expenses: [cena, super_, cafe], userMemberIds: me });
    expect(totalsByCategory(entries)).toEqual({ ARS: { restaurants: 1350000, groceries: 250000 } });
    expect(cashflowSummary(entries)).toEqual({ ARS: { consumedMinor: 1600000, paidMinor: 850000 } });
  });
});
