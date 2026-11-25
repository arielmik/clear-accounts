import { describe, expect, it } from 'vitest';
import { freeGroupColor, fallbackGroupColor, groupColorKey, GROUP_COLORS } from '../src/lib/group-colors';
import { monthSummary, myGroupBalances } from '../src/lib/home';
import type { Category, Group, LedgerRow } from '../src/lib/types';

const cat = (id: string, parent_id: string | null = null): Category => ({
  id, parent_id, owner_id: null, system_key: id, name: id, icon: null, sort_order: 0, archived_at: null,
});
const byId = new Map([cat('food'), cat('food.out', 'food'), cat('home'), cat('transport'), cat('health')].map((c) => [c.id, c]));

const row = (spent_at: string, consumed_minor: number, category_id: string | null, currency = 'ARS'): LedgerRow => ({
  expense_id: Math.random().toString(), group_id: 'g', group_name: 'G', is_personal: true, description: 'x',
  spent_at, currency, consumed_minor, paid_minor: consumed_minor, category_id, created_at: spent_at,
});

describe('monthSummary', () => {
  it('suma el mes, agrupa por categoría raíz y compara con el mes anterior al mismo día', () => {
    const current = [row('2026-11-02', 6000, 'food.out'), row('2026-11-10', 4000, 'home')];
    const previous = [row('2026-10-05', 5000, 'food'), row('2026-10-28', 99999, 'food')];
    const [s] = monthSummary(current, previous, 25, byId);
    expect(s!.totalMinor).toBe(10000);
    expect(s!.changePct).toBe(100); // 10.000 vs 5.000 (el gasto del 28 queda afuera)
    expect(s!.slices).toEqual([
      { key: 'food', amountMinor: 6000, pct: 60 },
      { key: 'home', amountMinor: 4000, pct: 40 },
    ]);
  });

  it('junta el resto en "other" cuando hay más categorías que tramos', () => {
    const current = [row('2026-11-01', 50, 'food'), row('2026-11-01', 30, 'home'), row('2026-11-01', 10, 'transport'), row('2026-11-01', 6, 'health'), row('2026-11-01', 4, null)];
    const [s] = monthSummary(current, [], 25, byId, 3);
    expect(s!.slices.map((x) => x.key)).toEqual(['food', 'home', 'transport', 'other']);
    expect(s!.slices.at(-1)!.amountMinor).toBe(10);
    expect(s!.changePct).toBeNull();
  });

  it('separa monedas y pone primero la de mayor consumo', () => {
    const out = monthSummary([row('2026-11-01', 100, null, 'USD'), row('2026-11-01', 5000, null)], [], 25, byId);
    expect(out.map((s) => s.currency)).toEqual(['ARS', 'USD']);
  });
});

describe('myGroupBalances', () => {
  it('toma el saldo del usuario en la moneda del grupo e ignora el personal', () => {
    const groups = [
      { id: 'a', kind: 'home', currency: 'ARS', group_members: [{ id: 'm1', user_id: 'u' }] },
      { id: 'p', kind: 'personal', currency: 'ARS', group_members: [{ id: 'm2', user_id: 'u' }] },
    ] as unknown as Group[];
    const balances = [
      { group_id: 'a', member_id: 'm1', currency: 'ARS', balance_minor: 300 },
      { group_id: 'a', member_id: 'm1', currency: 'USD', balance_minor: 7 },
      { group_id: 'a', member_id: 'otro', currency: 'ARS', balance_minor: -300 },
    ];
    expect([...myGroupBalances(groups, balances, 'u')]).toEqual([['a', 300]]);
  });
});

describe('colores de grupo', () => {
  it('usa el color guardado, uno estable si no hay, y uno fijo para Personal', () => {
    expect(groupColorKey({ id: 'x', kind: 'trip', color: 'lilac' })).toBe('lilac');
    expect(groupColorKey({ id: 'x', kind: 'trip', color: null })).toBe(fallbackGroupColor('x'));
    expect(groupColorKey({ id: 'x', kind: 'trip', color: 'violeta' })).toBe(fallbackGroupColor('x'));
    expect(groupColorKey({ id: 'x', kind: 'personal', color: 'sun' })).toBe('personal');
  });

  it('propone el primer color que el usuario no usa', () => {
    expect(freeGroupColor([])).toBe('coral');
    expect(freeGroupColor(['coral', null, 'sky'])).toBe('sun');
    expect(GROUP_COLORS).toContain(freeGroupColor([...GROUP_COLORS]));
  });
});
