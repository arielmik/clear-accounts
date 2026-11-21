import { describe, expect, it } from 'vitest';
import { computeBalances, computeShares, simplifyDebts, type Expense } from '../src';

const cena: Expense = {
  id: 'e1',
  groupId: 'g1',
  description: 'Cena',
  amountMinor: 3000000,
  currency: 'ARS',
  spentAt: '2026-11-20',
  categoryId: 'restaurants',
  payers: [{ memberId: 'ana', amountMinor: 3000000 }],
  shares: computeShares(3000000, { type: 'equal', memberIds: ['ana', 'beto', 'vos'] }),
};

describe('computeBalances', () => {
  it('pagado menos consumido', () => {
    expect(computeBalances([cena])).toEqual({ ARS: { ana: 2000000, beto: -1000000, vos: -1000000 } });
  });

  it('las liquidaciones mueven saldo pero no son gasto', () => {
    const b = computeBalances(
      [cena],
      [{ id: 's1', groupId: 'g1', fromMemberId: 'beto', toMemberId: 'ana', amountMinor: 1000000, currency: 'ARS' }],
    );
    expect(b).toEqual({ ARS: { ana: 1000000, beto: 0, vos: -1000000 } });
  });

  it('separa por moneda', () => {
    const usd: Expense = { ...cena, id: 'e2', currency: 'USD', amountMinor: 300, payers: [{ memberId: 'vos', amountMinor: 300 }], shares: computeShares(300, { type: 'equal', memberIds: ['ana', 'beto', 'vos'] }) };
    const b = computeBalances([cena, usd]);
    expect(b.USD).toEqual({ vos: 200, ana: -100, beto: -100 });
  });

  it('rechaza gastos inconsistentes', () => {
    expect(() => computeBalances([{ ...cena, payers: [{ memberId: 'ana', amountMinor: 1 }] }])).toThrow(/pagos/);
  });
});

describe('simplifyDebts', () => {
  it('cadena A->B->C se resuelve en una transferencia', () => {
    expect(simplifyDebts({ a: -100, b: 0, c: 100 })).toEqual([{ fromMemberId: 'a', toMemberId: 'c', amountMinor: 100 }]);
  });

  it('genera como máximo n-1 transferencias y salda todo', () => {
    for (let t = 0; t < 200; t++) {
      const n = 2 + Math.floor(Math.random() * 8);
      const values = Array.from({ length: n - 1 }, () => Math.floor(Math.random() * 20001) - 10000);
      values.push(-values.reduce((a, b) => a + b, 0));
      const balances = Object.fromEntries(values.map((v, i) => [`m${i}`, v]));
      const transfers = simplifyDebts(balances);
      expect(transfers.length).toBeLessThanOrEqual(n - 1);
      const after = { ...balances };
      for (const tr of transfers) {
        expect(tr.amountMinor).toBeGreaterThan(0);
        after[tr.fromMemberId]! += tr.amountMinor;
        after[tr.toMemberId]! -= tr.amountMinor;
      }
      expect(Object.values(after).every((v) => v === 0)).toBe(true);
    }
  });

  it('rechaza balances que no suman cero', () => {
    expect(() => simplifyDebts({ a: 1 })).toThrow();
  });
});
