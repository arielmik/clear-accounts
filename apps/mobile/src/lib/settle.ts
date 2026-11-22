/** Saldo que le queda a un miembro después de registrar un pago. */
export function balanceAfterPayment(
  balances: Record<string, number>,
  fromMemberId: string,
  toMemberId: string,
  amountMinor: number,
): { from: number; to: number } {
  return {
    from: (balances[fromMemberId] ?? 0) + amountMinor,
    to: (balances[toMemberId] ?? 0) - amountMinor,
  };
}
