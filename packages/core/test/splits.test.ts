import { describe, expect, it } from 'vitest';
import { computeShares } from '../src';

describe('computeShares', () => {
  it('equal', () => {
    expect(computeShares(3000000, { type: 'equal', memberIds: ['ana', 'beto', 'vos'] })).toEqual([
      { memberId: 'ana', amountMinor: 1000000 },
      { memberId: 'beto', amountMinor: 1000000 },
      { memberId: 'vos', amountMinor: 1000000 },
    ]);
  });

  it('exact exige que sume el total', () => {
    expect(() =>
      computeShares(1000, {
        type: 'exact',
        entries: [
          { memberId: 'a', amountMinor: 600 },
          { memberId: 'b', amountMinor: 300 },
        ],
      }),
    ).toThrow(/suman 900/);
  });

  it('percent en puntos básicos', () => {
    const shares = computeShares(10000, {
      type: 'percent',
      entries: [
        { memberId: 'a', basisPoints: 6000 },
        { memberId: 'b', basisPoints: 4000 },
      ],
    });
    expect(shares.map((s) => s.amountMinor)).toEqual([6000, 4000]);
  });

  it('percent rechaza si no suma 100%', () => {
    expect(() =>
      computeShares(100, { type: 'percent', entries: [{ memberId: 'a', basisPoints: 9000 }] }),
    ).toThrow(/90%/);
  });

  it('shares (proporciones 2 a 1)', () => {
    const shares = computeShares(90000, {
      type: 'shares',
      entries: [
        { memberId: 'a', units: 2 },
        { memberId: 'b', units: 1 },
      ],
    });
    expect(shares.map((s) => s.amountMinor)).toEqual([60000, 30000]);
  });

  it('rechaza miembros duplicados y montos no positivos', () => {
    expect(() => computeShares(100, { type: 'equal', memberIds: ['a', 'a'] })).toThrow();
    expect(() => computeShares(0, { type: 'equal', memberIds: ['a'] })).toThrow();
  });
});
