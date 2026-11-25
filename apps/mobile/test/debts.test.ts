import { describe, expect, it } from 'vitest';
import { myDebts, totalsByCurrency } from '../src/lib/debts';
import type { BalanceRow, Group } from '../src/lib/types';

const m = (id: string, user_id: string | null, display_name: string) => ({
  id,
  user_id,
  display_name,
  role: 'member' as const,
  left_at: null,
});

const groups: Group[] = [
  { id: 'p', name: 'Personal', kind: 'personal', currency: 'ARS', simplify_debts: false, image_path: null, color: null, group_members: [m('mp', 'me', 'Yo')] },
  { id: 'trip', name: 'Viaje', kind: 'trip', currency: 'ARS', simplify_debts: true, image_path: null, color: null, group_members: [m('v', 'me', 'Yo'), m('a', 'u-a', 'Ana'), m('b', null, 'Beto')] },
  { id: 'home', name: 'Casa', kind: 'home', currency: 'ARS', simplify_debts: true, image_path: null, color: null, group_members: [m('v2', 'me', 'Yo'), m('l', 'u-l', 'Lu')] },
];

const balances: BalanceRow[] = [
  { group_id: 'trip', member_id: 'v', currency: 'ARS', balance_minor: 17000 },
  { group_id: 'trip', member_id: 'a', currency: 'ARS', balance_minor: -7000 },
  { group_id: 'trip', member_id: 'b', currency: 'ARS', balance_minor: -10000 },
  { group_id: 'home', member_id: 'v2', currency: 'ARS', balance_minor: -42500 },
  { group_id: 'home', member_id: 'l', currency: 'ARS', balance_minor: 42500 },
];

describe('myDebts', () => {
  it('detalla quién te debe y a quién le debés, por grupo', () => {
    const d = myDebts(groups, balances, 'me');
    expect(d.owed.map((x) => [x.name, x.groupName, x.amountMinor])).toEqual([
      ['Beto', 'Viaje', 10000],
      ['Ana', 'Viaje', 7000],
    ]);
    expect(d.owe.map((x) => [x.name, x.groupName, x.amountMinor])).toEqual([['Lu', 'Casa', 42500]]);
  });

  it('los totales coinciden con tus saldos', () => {
    const d = myDebts(groups, balances, 'me');
    expect(totalsByCurrency(d.owed)).toEqual({ ARS: 17000 });
    expect(totalsByCurrency(d.owe)).toEqual({ ARS: 42500 });
  });

  it('las deudas entre otros no aparecen como tuyas', () => {
    const d = myDebts(groups, balances, 'u-a');
    expect(d.owed).toEqual([]);
    expect(d.owe.map((x) => [x.name, x.amountMinor])).toEqual([['Yo', 7000]]);
  });
});

import { balanceAfterPayment } from '../src/lib/settle';

describe('balanceAfterPayment', () => {
  const balances = { beto: -10000, ana: 10000 };
  it('pago exacto: los dos quedan saldados', () => {
    expect(balanceAfterPayment(balances, 'beto', 'ana', 10000)).toEqual({ from: 0, to: 0 });
  });
  it('pago parcial: sigue la deuda', () => {
    expect(balanceAfterPayment(balances, 'beto', 'ana', 4000)).toEqual({ from: -6000, to: 6000 });
  });
  it('pago de más: ahora Ana le debe a Beto', () => {
    expect(balanceAfterPayment(balances, 'beto', 'ana', 15000)).toEqual({ from: 5000, to: -5000 });
  });
});
