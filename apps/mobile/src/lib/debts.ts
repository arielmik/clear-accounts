import { simplifyDebts } from '@clear-accounts/core';
import type { BalanceRow, Group } from './types';

export interface DebtItem {
  groupId: string;
  groupName: string;
  /** El otro miembro: quien te debe o a quien le debés. */
  memberId: string;
  name: string;
  amountMinor: number;
  currency: string;
}

/**
 * Deudas del usuario con cada persona, grupo por grupo, usando las mismas
 * transferencias simplificadas que muestra "Cómo saldar" en el grupo.
 * La suma de `owed` coincide con lo que te deben y la de `owe` con lo que debés.
 */
export function myDebts(groups: readonly Group[], balances: readonly BalanceRow[], userId: string) {
  const owed: DebtItem[] = [];
  const owe: DebtItem[] = [];
  for (const g of groups) {
    if (g.kind === 'personal') continue;
    const me = g.group_members.find((m) => m.user_id === userId);
    if (!me) continue;
    const nameOf = (id: string) => g.group_members.find((m) => m.id === id)?.display_name ?? '?';

    const byCurrency: Record<string, Record<string, number>> = {};
    for (const b of balances) {
      if (b.group_id !== g.id) continue;
      (byCurrency[b.currency] ??= {})[b.member_id] = b.balance_minor;
    }
    for (const [currency, map] of Object.entries(byCurrency)) {
      for (const tr of simplifyDebts(map)) {
        if (tr.toMemberId === me.id) {
          owed.push({ groupId: g.id, groupName: g.name, memberId: tr.fromMemberId, name: nameOf(tr.fromMemberId), amountMinor: tr.amountMinor, currency });
        } else if (tr.fromMemberId === me.id) {
          owe.push({ groupId: g.id, groupName: g.name, memberId: tr.toMemberId, name: nameOf(tr.toMemberId), amountMinor: tr.amountMinor, currency });
        }
      }
    }
  }
  const byAmount = (a: DebtItem, b: DebtItem) => b.amountMinor - a.amountMinor;
  return { owed: owed.sort(byAmount), owe: owe.sort(byAmount) };
}

/** Totales por moneda de una lista de deudas. */
export function totalsByCurrency(items: readonly DebtItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.currency] = (out[i.currency] ?? 0) + i.amountMinor;
  return out;
}
