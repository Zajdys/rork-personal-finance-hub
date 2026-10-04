import { create } from 'zustand';
import {
  addSplitExpenseRemote,
  addSplitGroupMemberRemote,
  addSplitSettlementRemote,
  computeMemberBalances,
  createSplitGroupRemote,
  deleteSplitExpenseRemote,
  fetchSplitExpensesForGroupRemote,
  fetchSplitGroupsRemote,
  joinSplitGroupByCodeRemote,
  simplifyDebts as simplifyDebtsAlgo,
  updateSplitExpenseRemote,
  updateSplitGroupArchiveRemote,
  type AddExpenseShareInput,
  type SplitExpense,
  type SplitExpenseCategoryId,
  type SplitExpenseSplitType,
  type SplitGroup,
  type SplitGroupMember,
  type SplitMemberBalance,
  type SplitSettlement,
  type SplitSimplifiedDebt,
} from '@/lib/split-groups';
import { supabaseUrl } from '@/lib/supabase';

export { computeMemberBalances, simplifyDebts } from '@/lib/split-groups';

export type {
  AddExpenseShareInput,
  SplitExpense,
  SplitExpenseCategoryId,
  SplitExpenseSplitType,
  SplitGroup,
  SplitGroupMember,
  SplitMemberBalance,
  SplitSettlement,
  SplitSimplifiedDebt,
};

interface SplitGroupsStore {
  groups: SplitGroup[];
  members: SplitGroupMember[];
  expensesByGroupId: Record<string, SplitExpense[]>;
  settlementsByGroupId: Record<string, SplitSettlement[]>;
  isLoading: boolean;
  error: string | null;

  fetchGroups: () => Promise<void>;
  createGroup: (params: {
    userId: string;
    name: string;
    currency?: string;
    icon?: string | null;
    creatorDisplayName: string;
  }) => Promise<{ group: SplitGroup | null; error: string | null }>;
  joinGroupByCode: (params: {
    code: string;
    memberDisplayName: string;
  }) => Promise<{ group: SplitGroup | null; error: string | null }>;
  setGroupArchived: (
    groupId: string,
    archived: boolean,
  ) => Promise<{ group: SplitGroup | null; error: string | null }>;
  addMember: (params: {
    groupId: string;
    displayName: string;
    userId?: string | null;
  }) => Promise<{ member: SplitGroupMember | null; error: string | null }>;
  addExpense: (params: {
    groupId: string;
    paidBy: string;
    amount: number;
    description: string;
    date?: string;
    splitType: SplitExpenseSplitType;
    category?: SplitExpenseCategoryId | string;
    shares: AddExpenseShareInput[];
  }) => Promise<{ expense: SplitExpense | null; error: string | null }>;
  updateExpense: (params: {
    expenseId: string;
    groupId: string;
    paidBy: string;
    amount: number;
    description: string;
    date?: string;
    splitType: SplitExpenseSplitType;
    category?: SplitExpenseCategoryId | string;
    shares: AddExpenseShareInput[];
  }) => Promise<{ expense: SplitExpense | null; error: string | null }>;
  deleteExpense: (params: {
    expenseId: string;
    groupId: string;
  }) => Promise<{ error: string | null }>;
  setExpenseReceiptUrl: (params: {
    groupId: string;
    expenseId: string;
    receiptUrl: string | null;
  }) => void;
  fetchExpensesForGroup: (groupId: string) => Promise<void>;
  /** Načte výdaje a settlementy pro více skupin (bez globálního loading stavu). */
  fetchExpensesForGroups: (groupIds: string[]) => Promise<void>;
  addSettlement: (params: {
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amount: number;
  }) => Promise<{ error: string | null }>;
  /** Net balance každého člena (kladné = mají dostat). */
  computeBalances: (groupId: string) => SplitMemberBalance[];
  /** Greedy min cash flow — kdo komu kolik poslat. */
  simplifyDebts: (balances: SplitMemberBalance[]) => SplitSimplifiedDebt[];
  membersForGroup: (groupId: string) => SplitGroupMember[];
}

export const useSplitGroupsStore = create<SplitGroupsStore>((set, get) => ({
  groups: [],
  members: [],
  expensesByGroupId: {},
  settlementsByGroupId: {},
  isLoading: false,
  error: null,

  fetchGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const { groups, members, error } = await fetchSplitGroupsRemote();
      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }
      set({ groups, members, isLoading: false });
    } catch (e) {
      console.error(
        '[SplitGroups fetchGroups] selhalo',
        `${supabaseUrl}/rest/v1/split_groups`,
        e,
      );
      set({
        error: e instanceof Error ? e.message : 'Nepodařilo se načíst rozdělení',
        isLoading: false,
      });
    }
  },

  createGroup: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { group, member, error } = await createSplitGroupRemote(params);
      if (error || !group) {
        set({ isLoading: false, error: error?.message ?? 'Nepodařilo se vytvořit rozdělení' });
        return { group: null, error: error?.message ?? 'Nepodařilo se vytvořit rozdělení' };
      }
      set((s) => ({
        groups: [group, ...s.groups],
        members: member ? [...s.members, member] : s.members,
        isLoading: false,
      }));
      return { group, error: null };
    } catch (e) {
      console.error(
        '[SplitGroups createGroup] selhalo',
        `${supabaseUrl}/rest/v1/split_groups`,
        e,
      );
      const msg = e instanceof Error ? e.message : 'Nepodařilo se vytvořit rozdělení';
      set({ isLoading: false, error: msg });
      return { group: null, error: msg };
    }
  },

  joinGroupByCode: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { group, error } = await joinSplitGroupByCodeRemote(params);
      if (error || !group) {
        const msg = error?.message ?? 'Nepodařilo se připojit k rozdělení';
        set({ isLoading: false, error: msg });
        return { group: null, error: msg };
      }
      const { groups, members, error: fetchErr } = await fetchSplitGroupsRemote();
      if (fetchErr) {
        set((s) => ({
          groups: s.groups.some((g) => g.id === group.id) ? s.groups : [group, ...s.groups],
          isLoading: false,
        }));
        return { group, error: null };
      }
      set({ groups, members, isLoading: false });
      return { group, error: null };
    } catch (e) {
      console.error(
        '[SplitGroups joinGroupByCode] selhalo',
        `${supabaseUrl}/rest/v1/rpc/join_split_group_by_code`,
        e,
      );
      const msg = e instanceof Error ? e.message : 'Nepodařilo se připojit k rozdělení';
      set({ isLoading: false, error: msg });
      return { group: null, error: msg };
    }
  },

  setGroupArchived: async (groupId, archived) => {
    try {
      const { group, error } = await updateSplitGroupArchiveRemote(groupId, archived);
      if (error || !group) {
        const msg = error?.message ?? 'Nepodařilo se změnit stav archivace';
        return { group: null, error: msg };
      }
      set((s) => ({
        groups: s.groups.map((g) => (g.id === groupId ? group : g)),
      }));
      return { group, error: null };
    } catch (e) {
      console.error(
        '[SplitGroups setGroupArchived] selhalo',
        `${supabaseUrl}/rest/v1/split_groups`,
        e,
      );
      const msg = e instanceof Error ? e.message : 'Nepodařilo se změnit stav archivace';
      return { group: null, error: msg };
    }
  },

  addMember: async (params) => {
    try {
      const { member, error } = await addSplitGroupMemberRemote({
        groupId: params.groupId,
        displayName: params.displayName,
        userId: params.userId ?? null,
      });
      if (error || !member) {
        return { member: null, error: error?.message ?? 'Nepodařilo se přidat člena' };
      }
      set((s) => ({ members: [...s.members, member] }));
      return { member, error: null };
    } catch (e) {
      console.error(
        '[SplitGroups addMember] selhalo',
        `${supabaseUrl}/rest/v1/split_group_members`,
        e,
      );
      return { member: null, error: e instanceof Error ? e.message : 'Nepodařilo se přidat člena' };
    }
  },

  addExpense: async (params) => {
    try {
      const { expense, error } = await addSplitExpenseRemote(params);
      if (error || !expense) {
        return { expense: null, error: error?.message ?? 'Nepodařilo se uložit výdaj' };
      }
      set((s) => ({
        expensesByGroupId: {
          ...s.expensesByGroupId,
          [params.groupId]: [expense, ...(s.expensesByGroupId[params.groupId] ?? [])],
        },
      }));
      return { expense, error: null };
    } catch (e) {
      console.error(
        '[SplitGroups addExpense] selhalo',
        `${supabaseUrl}/rest/v1/split_expenses`,
        e,
      );
      return { expense: null, error: e instanceof Error ? e.message : 'Nepodařilo se uložit výdaj' };
    }
  },

  updateExpense: async (params) => {
    try {
      const { expense, error } = await updateSplitExpenseRemote(params);
      if (error || !expense) {
        return { expense: null, error: error?.message ?? 'Nepodařilo se upravit výdaj' };
      }
      set((s) => ({
        expensesByGroupId: {
          ...s.expensesByGroupId,
          [params.groupId]: (s.expensesByGroupId[params.groupId] ?? []).map((e) =>
            e.id === params.expenseId ? expense : e,
          ),
        },
      }));
      return { expense, error: null };
    } catch (e) {
      console.error(
        '[SplitGroups updateExpense] selhalo',
        `${supabaseUrl}/rest/v1/split_expenses`,
        e,
      );
      return { expense: null, error: e instanceof Error ? e.message : 'Nepodařilo se upravit výdaj' };
    }
  },

  deleteExpense: async ({ expenseId, groupId }) => {
    try {
      const { error } = await deleteSplitExpenseRemote(expenseId);
      if (error) return { error: error.message };
      set((s) => ({
        expensesByGroupId: {
          ...s.expensesByGroupId,
          [groupId]: (s.expensesByGroupId[groupId] ?? []).filter((e) => e.id !== expenseId),
        },
      }));
      return { error: null };
    } catch (e) {
      console.error(
        '[SplitGroups deleteExpense] selhalo',
        `${supabaseUrl}/rest/v1/split_expenses`,
        e,
      );
      return { error: e instanceof Error ? e.message : 'Nepodařilo se smazat výdaj' };
    }
  },

  setExpenseReceiptUrl: ({ groupId, expenseId, receiptUrl }) => {
    set((s) => ({
      expensesByGroupId: {
        ...s.expensesByGroupId,
        [groupId]: (s.expensesByGroupId[groupId] ?? []).map((e) =>
          e.id === expenseId ? { ...e, receipt_url: receiptUrl } : e,
        ),
      },
    }));
  },

  fetchExpensesForGroup: async (groupId) => {
    set({ isLoading: true, error: null });
    try {
      const { expenses, settlements, error } = await fetchSplitExpensesForGroupRemote(groupId);
      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }
      set((s) => ({
        expensesByGroupId: { ...s.expensesByGroupId, [groupId]: expenses },
        settlementsByGroupId: { ...s.settlementsByGroupId, [groupId]: settlements },
        isLoading: false,
      }));
    } catch (e) {
      console.error(
        '[SplitGroups fetchExpensesForGroup] selhalo',
        `${supabaseUrl}/rest/v1/split_expenses`,
        e,
      );
      set({
        error: e instanceof Error ? e.message : 'Nepodařilo se načíst výdaje',
        isLoading: false,
      });
    }
  },

  fetchExpensesForGroups: async (groupIds) => {
    if (!groupIds.length) return;
    try {
      const results = await Promise.all(groupIds.map((id) => fetchSplitExpensesForGroupRemote(id)));
      set((s) => {
        const expensesByGroupId = { ...s.expensesByGroupId };
        const settlementsByGroupId = { ...s.settlementsByGroupId };
        for (let i = 0; i < groupIds.length; i++) {
          const groupId = groupIds[i]!;
          const { expenses, settlements, error } = results[i]!;
          if (error) continue;
          expensesByGroupId[groupId] = expenses;
          settlementsByGroupId[groupId] = settlements;
        }
        return { expensesByGroupId, settlementsByGroupId };
      });
    } catch (e) {
      console.error(
        '[SplitGroups fetchExpensesForGroups] selhalo',
        `${supabaseUrl}/rest/v1/split_expenses`,
        e,
      );
    }
  },

  addSettlement: async (params) => {
    try {
      const { settlement, error } = await addSplitSettlementRemote(params);
      if (error || !settlement) {
        return { error: error?.message ?? 'Nepodařilo se uložit vyrovnání' };
      }
      set((s) => ({
        settlementsByGroupId: {
          ...s.settlementsByGroupId,
          [params.groupId]: [settlement, ...(s.settlementsByGroupId[params.groupId] ?? [])],
        },
      }));
      return { error: null };
    } catch (e) {
      console.error(
        '[SplitGroups addSettlement] selhalo',
        `${supabaseUrl}/rest/v1/split_settlements`,
        e,
      );
      return { error: e instanceof Error ? e.message : 'Nepodařilo se uložit vyrovnání' };
    }
  },

  membersForGroup: (groupId) => get().members.filter((m) => m.group_id === groupId),

  computeBalances: (groupId) => {
    const members = get().membersForGroup(groupId);
    const expenses = get().expensesByGroupId[groupId] ?? [];
    const settlements = get().settlementsByGroupId[groupId] ?? [];
    return computeMemberBalances({ members, expenses, settlements });
  },

  simplifyDebts: (balances) => simplifyDebtsAlgo(balances),
}));
