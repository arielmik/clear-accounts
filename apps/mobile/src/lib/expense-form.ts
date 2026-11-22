import { computeShares, DomainError, FULL_PERCENT_BPS, type SplitInput } from '@clear-accounts/core';
import { t } from '../i18n';
import { minorToInput, parseAmount } from './money';
import type { ExpenseRow, Group, SaveExpensePayload, SplitType } from './types';

export interface ExpenseFormState {
  /** Presente al editar un gasto existente. */
  id?: string;
  amountText: string;
  description: string;
  categoryId: string | null;
  spentAt: string;
  payerMemberId: string;
  splitType: SplitType;
  /** Participantes incluidos (para reparto en partes iguales). */
  participants: string[];
  /** Valor por miembro para exact (monto), percent (%) y shares (unidades). */
  values: Record<string, string>;
}

export function initialFormState(group: Group, myMemberId: string, today: string): ExpenseFormState {
  return {
    amountText: '',
    description: '',
    categoryId: null,
    spentAt: today,
    payerMemberId: myMemberId,
    splitType: 'equal',
    participants: activeMembers(group).map((m) => m.id),
    values: {},
  };
}

/** Estado del formulario a partir de un gasto guardado (para editarlo). */
export function formStateFromExpense(expense: ExpenseRow, group: Group): ExpenseFormState {
  const values: Record<string, string> = {};
  for (const s of expense.expense_shares) {
    if (expense.split_type === 'exact') values[s.member_id] = minorToInput(s.amount_minor, expense.currency);
    if (expense.split_type === 'percent' && s.split_value !== null) values[s.member_id] = String(s.split_value / 100).replace('.', ',');
    if (expense.split_type === 'shares' && s.split_value !== null) values[s.member_id] = String(s.split_value);
  }
  return {
    id: expense.id,
    amountText: minorToInput(expense.amount_minor, expense.currency),
    description: expense.description,
    categoryId: expense.category_id,
    spentAt: expense.spent_at,
    payerMemberId: expense.expense_payers[0]?.member_id ?? '',
    splitType: group.kind === 'personal' ? 'equal' : expense.split_type,
    participants: expense.expense_shares.map((s) => s.member_id),
    values,
  };
}

export function activeMembers(group: Group) {
  return group.group_members.filter((m) => m.left_at === null);
}

function parsePercentToBps(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseUnits(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export type BuildResult = { ok: true; payload: SaveExpensePayload } | { ok: false; error: string };

/** Valida el formulario y arma el payload para la RPC `save_expense`. */
export function buildExpensePayload(state: ExpenseFormState, group: Group): BuildResult {
  const amount = parseAmount(state.amountText, group.currency);
  if (amount === null || amount <= 0) return { ok: false, error: t.expense.invalidAmount };
  const description = state.description.trim();
  if (!description) return { ok: false, error: t.expense.missingDescription };

  const members = activeMembers(group).map((m) => m.id);
  let split: SplitInput;
  const splitValue: Record<string, number | null> = {};

  if (group.kind === 'personal') {
    split = { type: 'exact', entries: [{ memberId: state.payerMemberId, amountMinor: amount }] };
  } else {
    switch (state.splitType) {
      case 'equal':
        split = { type: 'equal', memberIds: members.filter((id) => state.participants.includes(id)) };
        break;
      case 'exact': {
        const entries = [];
        for (const id of members) {
          const text = state.values[id]?.trim();
          if (!text) continue;
          const v = parseAmount(text, group.currency);
          if (v === null) return { ok: false, error: t.expense.invalidAmount };
          if (v > 0) entries.push({ memberId: id, amountMinor: v });
        }
        split = { type: 'exact', entries };
        break;
      }
      case 'percent': {
        const entries = [];
        for (const id of members) {
          const text = state.values[id]?.trim();
          if (!text) continue;
          const bps = parsePercentToBps(text);
          if (bps === null) return { ok: false, error: t.expense.invalidAmount };
          if (bps > 0) entries.push({ memberId: id, basisPoints: bps });
          splitValue[id] = bps;
        }
        split = { type: 'percent', entries };
        break;
      }
      case 'shares': {
        const entries = [];
        for (const id of members) {
          const text = state.values[id]?.trim();
          if (!text) continue;
          const units = parseUnits(text);
          if (units === null) return { ok: false, error: t.expense.invalidAmount };
          if (units > 0) entries.push({ memberId: id, units });
          splitValue[id] = units;
        }
        split = { type: 'shares', entries };
        break;
      }
    }
  }

  try {
    const shares = computeShares(amount, split);
    return {
      ok: true,
      payload: {
        ...(state.id ? { id: state.id } : {}),
        group_id: group.id,
        description,
        amount_minor: amount,
        currency: group.currency,
        spent_at: state.spentAt,
        category_id: state.categoryId,
        split_type: group.kind === 'personal' ? 'exact' : state.splitType,
        payers: [{ member_id: state.payerMemberId, amount_minor: amount }],
        shares: shares
          .filter((s) => s.amountMinor > 0)
          .map((s) => ({ member_id: s.memberId, amount_minor: s.amountMinor, split_value: splitValue[s.memberId] ?? null })),
      },
    };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

export { FULL_PERCENT_BPS };
