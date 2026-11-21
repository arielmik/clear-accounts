import { DomainError } from './errors';
import { assertMinorUnits, sum } from './money';
import type { Expense } from './types';

/** Invariantes de todo gasto: Σ pagadores = monto = Σ partes. */
export function validateExpense(expense: Expense): void {
  assertMinorUnits(expense.amountMinor);
  if (expense.amountMinor <= 0) throw new DomainError('NON_POSITIVE_AMOUNT', 'El monto debe ser mayor a cero');
  if (expense.payers.length === 0) throw new DomainError('NO_PAYER', 'El gasto necesita al menos un pagador');
  if (expense.shares.length === 0) throw new DomainError('EMPTY_SPLIT', 'No hay participantes');

  for (const p of [...expense.payers, ...expense.shares]) {
    assertMinorUnits(p.amountMinor);
    if (p.amountMinor < 0) throw new DomainError('NEGATIVE_AMOUNT', 'Los montos no pueden ser negativos');
  }
  const paid = sum(expense.payers.map((p) => p.amountMinor));
  if (paid !== expense.amountMinor) {
    throw new DomainError('PAYERS_MISMATCH', `Los pagos suman ${paid} y el gasto es ${expense.amountMinor}`);
  }
  const owed = sum(expense.shares.map((s) => s.amountMinor));
  if (owed !== expense.amountMinor) {
    throw new DomainError('SPLIT_MISMATCH', `Las partes suman ${owed} y el gasto es ${expense.amountMinor}`);
  }
}
