import { DomainError } from './errors';
import type { MinorUnits } from './types';

export function assertMinorUnits(value: number, field = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError('INVALID_AMOUNT', `${field} debe ser un entero en unidades mínimas`);
  }
}

/**
 * Reparte `total` en partes proporcionales a `weights` usando el método del
 * resto mayor: cada parte recibe el piso de su cuota exacta y los centavos
 * sobrantes van a las de mayor fracción (empate: la de menor índice).
 * Garantiza que la suma de las partes sea exactamente `total`.
 */
export function allocate(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  assertMinorUnits(total, 'total');
  if (total < 0) throw new DomainError('NEGATIVE_AMOUNT', 'El total no puede ser negativo');
  if (weights.length === 0) throw new DomainError('EMPTY_SPLIT', 'No hay participantes');
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new DomainError('INVALID_WEIGHT', 'Los pesos deben ser enteros no negativos');
    }
  }
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  if (sumWeights === 0) throw new DomainError('ZERO_WEIGHTS', 'La suma de los pesos es cero');

  // BigInt para que total * peso no desborde con montos grandes.
  const T = BigInt(total);
  const W = BigInt(sumWeights);
  const parts = weights.map((w, index) => {
    const exact = T * BigInt(w);
    return { index, base: exact / W, remainder: exact % W };
  });

  let leftover = total - parts.reduce((acc, p) => acc + Number(p.base), 0);
  const order = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const result = parts.map((p) => Number(p.base));
  for (const p of order) {
    if (leftover === 0) break;
    if (weights[p.index] === 0) continue;
    result[p.index] = (result[p.index] ?? 0) + 1;
    leftover--;
  }
  return result;
}

export function sum(values: readonly MinorUnits[]): MinorUnits {
  return values.reduce((a, b) => a + b, 0);
}
