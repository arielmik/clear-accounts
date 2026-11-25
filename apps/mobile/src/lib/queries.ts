import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { SaveExpensePayload } from './types';

export const keys = {
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
  categories: ['categories'] as const,
  expenses: (groupId: string) => ['expenses', groupId] as const,
  balances: (groupId?: string) => ['balances', groupId ?? 'all'] as const,
  ledger: (from: string, to: string) => ['ledger', from, to] as const,
  expense: (id: string) => ['expense', id] as const,
  profile: (userId: string) => ['profile', userId] as const,
  avatars: ['avatars'] as const,
  settlements: (groupId: string) => ['settlements', groupId] as const,
  override: (expenseId: string) => ['override', expenseId] as const,
};

export const useGroups = () => useQuery({ queryKey: keys.groups, queryFn: api.fetchGroups });
export const useGroup = (id: string) => useQuery({ queryKey: keys.group(id), queryFn: () => api.fetchGroup(id) });
export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: api.fetchCategories, staleTime: 60 * 60 * 1000 });
export const useGroupExpenses = (groupId: string) =>
  useQuery({ queryKey: keys.expenses(groupId), queryFn: () => api.fetchGroupExpenses(groupId) });
export const useBalances = (groupId?: string) =>
  useQuery({ queryKey: keys.balances(groupId), queryFn: () => api.fetchBalances(groupId) });
export const useLedger = (from: string, to: string) =>
  useQuery({ queryKey: keys.ledger(from, to), queryFn: () => api.fetchLedger(from, to) });

export const useExpense = (id: string) => useQuery({ queryKey: keys.expense(id), queryFn: () => api.fetchExpense(id) });
export const useMyCategoryOverride = (expenseId: string, userId: string) =>
  useQuery({ queryKey: keys.override(expenseId), queryFn: () => api.fetchMyCategoryOverride(expenseId, userId) });

/** Tras cambiar categorías: refrescar categorías, registro personal y recategorizaciones. */
export function useInvalidateCategories() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.categories }),
      qc.invalidateQueries({ queryKey: ['ledger'] }),
      qc.invalidateQueries({ queryKey: ['override'] }),
    ]);
}

export const useSettlements = (groupId: string) =>
  useQuery({ queryKey: keys.settlements(groupId), queryFn: () => api.fetchSettlements(groupId) });
export const useAvatars = () => useQuery({ queryKey: keys.avatars, queryFn: api.fetchAvatars, staleTime: 5 * 60 * 1000 });
export const useProfile = (userId: string) =>
  useQuery({ queryKey: keys.profile(userId), queryFn: () => api.fetchProfile(userId) });

/** Tras cualquier cambio de gastos o pagos, refrescamos todo lo que depende de ellos. */
function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['expenses'] }),
      qc.invalidateQueries({ queryKey: ['balances'] }),
      qc.invalidateQueries({ queryKey: ['ledger'] }),
      qc.invalidateQueries({ queryKey: ['expense'] }),
      qc.invalidateQueries({ queryKey: ['settlements'] }),
    ]);
}

export function useSaveExpense() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (p: SaveExpensePayload) => api.saveExpense(p), onSuccess: invalidate });
}

export function useDeleteExpense() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.deleteExpense, onSuccess: invalidate });
}

export function useCreateSettlement() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.createSettlement, onSuccess: invalidate });
}

export function useDeleteSettlement() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.deleteSettlement, onSuccess: invalidate });
}

export function useInvalidateGroups() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.groups });
}

/** Refresca todo (pull-to-refresh). */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
