/**
 * Montos siempre en unidades mínimas enteras (centavos). Nunca floats.
 * Ej.: $1.234,56 => 123456
 */
export type MinorUnits = number;

/** Código ISO 4217 (ARS, USD, EUR...). */
export type CurrencyCode = string;

export type MemberId = string;

export interface Payer {
  memberId: MemberId;
  amountMinor: MinorUnits;
}

export interface Share {
  memberId: MemberId;
  amountMinor: MinorUnits;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  /** Fecha ISO (YYYY-MM-DD). */
  spentAt: string;
  categoryId: string | null;
  payers: Payer[];
  shares: Share[];
}

export interface Settlement {
  id: string;
  groupId: string;
  fromMemberId: MemberId;
  toMemberId: MemberId;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
}

/** Transferencia sugerida para saldar deudas. */
export interface Transfer {
  fromMemberId: MemberId;
  toMemberId: MemberId;
  amountMinor: MinorUnits;
}
