import { DomainError } from './errors';
import { allocate, assertMinorUnits, sum } from './money';
import type { MemberId, MinorUnits, Share } from './types';

/** 100% expresado en puntos básicos (1 bp = 0,01%). */
export const FULL_PERCENT_BPS = 10_000;

export type SplitInput =
  | { type: 'equal'; memberIds: MemberId[] }
  | { type: 'exact'; entries: { memberId: MemberId; amountMinor: MinorUnits }[] }
  | { type: 'percent'; entries: { memberId: MemberId; basisPoints: number }[] }
  | { type: 'shares'; entries: { memberId: MemberId; units: number }[] };

export type SplitType = SplitInput['type'];

function assertUniqueMembers(ids: readonly MemberId[]): void {
  if (ids.length === 0) throw new DomainError('EMPTY_SPLIT', 'No hay participantes');
  if (new Set(ids).size !== ids.length) {
    throw new DomainError('DUPLICATE_MEMBER', 'Un participante aparece más de una vez');
  }
}

/** Convierte un reparto en partes concretas cuya suma es exactamente `amountMinor`. */
export function computeShares(amountMinor: MinorUnits, split: SplitInput): Share[] {
  assertMinorUnits(amountMinor);
  if (amountMinor <= 0) throw new DomainError('NON_POSITIVE_AMOUNT', 'El monto debe ser mayor a cero');

  switch (split.type) {
    case 'equal': {
      assertUniqueMembers(split.memberIds);
      const parts = allocate(amountMinor, split.memberIds.map(() => 1));
      return split.memberIds.map((memberId, i) => ({ memberId, amountMinor: parts[i]! }));
    }
    case 'exact': {
      assertUniqueMembers(split.entries.map((e) => e.memberId));
      split.entries.forEach((e) => {
        assertMinorUnits(e.amountMinor);
        if (e.amountMinor < 0) throw new DomainError('NEGATIVE_AMOUNT', 'Una parte no puede ser negativa');
      });
      const total = sum(split.entries.map((e) => e.amountMinor));
      if (total !== amountMinor) {
        throw new DomainError('SPLIT_MISMATCH', `Las partes suman ${total} y el gasto es ${amountMinor}`);
      }
      return split.entries.map((e) => ({ memberId: e.memberId, amountMinor: e.amountMinor }));
    }
    case 'percent': {
      assertUniqueMembers(split.entries.map((e) => e.memberId));
      const totalBps = sum(split.entries.map((e) => e.basisPoints));
      if (totalBps !== FULL_PERCENT_BPS) {
        throw new DomainError('PERCENT_MISMATCH', `Los porcentajes suman ${totalBps / 100}% en vez de 100%`);
      }
      const parts = allocate(amountMinor, split.entries.map((e) => e.basisPoints));
      return split.entries.map((e, i) => ({ memberId: e.memberId, amountMinor: parts[i]! }));
    }
    case 'shares': {
      assertUniqueMembers(split.entries.map((e) => e.memberId));
      const parts = allocate(amountMinor, split.entries.map((e) => e.units));
      return split.entries.map((e, i) => ({ memberId: e.memberId, amountMinor: parts[i]! }));
    }
  }
}
