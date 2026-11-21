import { DomainError } from './errors';
import type { CurrencyCode, Expense, MemberId, MinorUnits, Settlement, Transfer } from './types';
import { validateExpense } from './validation';

/**
 * Balance neto por moneda y miembro.
 * Positivo = le deben; negativo = debe.
 */
export type Balances = Record<CurrencyCode, Record<MemberId, MinorUnits>>;

function add(b: Balances, currency: CurrencyCode, memberId: MemberId, delta: MinorUnits): void {
  const byMember = (b[currency] ??= {});
  byMember[memberId] = (byMember[memberId] ?? 0) + delta;
}

export function computeBalances(expenses: readonly Expense[], settlements: readonly Settlement[] = []): Balances {
  const balances: Balances = {};
  for (const e of expenses) {
    validateExpense(e);
    for (const p of e.payers) add(balances, e.currency, p.memberId, p.amountMinor);
    for (const s of e.shares) add(balances, e.currency, s.memberId, -s.amountMinor);
  }
  for (const s of settlements) {
    if (s.fromMemberId === s.toMemberId) {
      throw new DomainError('SELF_SETTLEMENT', 'Una liquidación no puede ser a uno mismo');
    }
    if (s.amountMinor <= 0) throw new DomainError('NON_POSITIVE_AMOUNT', 'La liquidación debe ser mayor a cero');
    // Quien paga achica su deuda; quien cobra achica su crédito.
    add(balances, s.currency, s.fromMemberId, s.amountMinor);
    add(balances, s.currency, s.toMemberId, -s.amountMinor);
  }
  return balances;
}

/**
 * Deudas simplificadas: empareja al mayor deudor con el mayor acreedor
 * hasta saldar. Con n miembros con saldo genera como máximo n-1 transferencias.
 * Determinístico: empates se resuelven por id de miembro.
 */
export function simplifyDebts(balances: Record<MemberId, MinorUnits>): Transfer[] {
  const entries = Object.entries(balances);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  if (total !== 0) throw new DomainError('UNBALANCED', `Los balances no suman cero (${total})`);

  const byAmount = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const creditors = entries.filter(([, v]) => v > 0).sort(byAmount);
  const debtors = entries
    .filter(([, v]) => v < 0)
    .map(([id, v]) => [id, -v] as [string, number])
    .sort(byAmount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const amount = Math.min(debtor[1], creditor[1]);
    transfers.push({ fromMemberId: debtor[0], toMemberId: creditor[0], amountMinor: amount });
    debtor[1] -= amount;
    creditor[1] -= amount;
    if (debtor[1] === 0) i++;
    if (creditor[1] === 0) j++;
  }
  return transfers;
}
