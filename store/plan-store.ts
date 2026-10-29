import { create } from 'zustand';
import {
  archiveSavingsGoal,
  deleteUserBudget,
  fetchContributionsForGoals,
  fetchSavingsGoals,
  fetchUserBudgets,
  insertGoalContribution,
  migrateLocalPlanDataToSupabase,
  sumContributions,
  upsertSavingsGoal,
  upsertUserBudget,
  type PlanContribution,
  type PlanSavingsGoal,
  type UserBudget,
} from '@/lib/supabase-plan';

type PlanState = {
  budgets: UserBudget[];
  goals: PlanSavingsGoal[];
  /** goalId → contributions */
  contributionsByGoal: Record<string, PlanContribution[]>;
  isLoaded: boolean;
  isLoading: boolean;
  lastUserId: string | null;
  loadPlan: (userId: string) => Promise<void>;
  refreshPlan: () => Promise<void>;
  goalCurrentAmount: (goalId: string) => number;
  upsertBudget: (params: {
    userId: string;
    id?: string;
    category: string;
    subcategory?: string | null;
    amount: number;
    label?: string | null;
    emoji?: string | null;
  }) => Promise<{ error: Error | null }>;
  removeBudget: (userId: string, budgetId: string) => Promise<{ error: Error | null }>;
  createGoal: (params: {
    userId: string;
    name: string;
    emoji: string;
    color: string;
    targetAmount: number;
    deadline?: string | null;
  }) => Promise<{ error: Error | null }>;
  updateGoal: (params: {
    userId: string;
    id: string;
    name: string;
    emoji: string;
    color: string;
    targetAmount: number;
    deadline?: string | null;
  }) => Promise<{ error: Error | null }>;
  archiveGoal: (userId: string, goalId: string) => Promise<{ error: Error | null }>;
  addContribution: (params: {
    userId: string;
    goalId: string;
    amount: number;
    note?: string | null;
  }) => Promise<{ error: Error | null }>;
  clear: () => void;
};

export const usePlanStore = create<PlanState>((set, get) => ({
  budgets: [],
  goals: [],
  contributionsByGoal: {},
  isLoaded: false,
  isLoading: false,
  lastUserId: null,

  clear: () =>
    set({
      budgets: [],
      goals: [],
      contributionsByGoal: {},
      isLoaded: false,
      isLoading: false,
      lastUserId: null,
    }),

  loadPlan: async (userId) => {
    if (!userId) return;
    set({ isLoading: true, lastUserId: userId });
    try {
      await migrateLocalPlanDataToSupabase(userId);
      const budgets = await fetchUserBudgets(userId);
      const goals = await fetchSavingsGoals(userId);
      const contribs = await fetchContributionsForGoals(
        userId,
        goals.map((g) => g.id),
      );
      const contributionsByGoal: Record<string, PlanContribution[]> = {};
      for (const c of contribs) {
        if (!contributionsByGoal[c.goalId]) contributionsByGoal[c.goalId] = [];
        contributionsByGoal[c.goalId].push(c);
      }
      set({ budgets, goals, contributionsByGoal, isLoaded: true, isLoading: false });
    } catch (e) {
      console.warn('[plan-store] load', e);
      set({ isLoading: false, isLoaded: true });
    }
  },

  refreshPlan: async () => {
    const uid = get().lastUserId;
    if (uid) await get().loadPlan(uid);
  },

  goalCurrentAmount: (goalId) =>
    sumContributions(get().contributionsByGoal[goalId] ?? []),

  upsertBudget: async (params) => {
    const { budget, error } = await upsertUserBudget(params);
    if (!error && budget) {
      set((s) => {
        const rest = s.budgets.filter((b) => b.id !== budget.id);
        // také odstraň duplicitní category match
        const deduped = rest.filter(
          (b) =>
            !(
              b.category === budget.category &&
              (b.subcategory ?? null) === (budget.subcategory ?? null)
            ),
        );
        return { budgets: [...deduped, budget].sort((a, b) => a.category.localeCompare(b.category, 'cs')) };
      });
    }
    return { error };
  },

  removeBudget: async (userId, budgetId) => {
    const { error } = await deleteUserBudget(userId, budgetId);
    if (!error) set((s) => ({ budgets: s.budgets.filter((b) => b.id !== budgetId) }));
    return { error };
  },

  createGoal: async (params) => {
    const { goal, error } = await upsertSavingsGoal({ ...params, kind: 'goal' });
    if (!error && goal) {
      set((s) => ({
        goals: [...s.goals, goal],
        contributionsByGoal: { ...s.contributionsByGoal, [goal.id]: [] },
      }));
    }
    return { error };
  },

  updateGoal: async (params) => {
    const existing = get().goals.find((g) => g.id === params.id);
    const { goal, error } = await upsertSavingsGoal({
      ...params,
      kind: existing?.kind ?? 'goal',
    });
    if (!error && goal) {
      set((s) => ({
        goals: s.goals.map((g) => (g.id === goal.id ? goal : g)),
      }));
    }
    return { error };
  },

  archiveGoal: async (userId, goalId) => {
    const { error } = await archiveSavingsGoal(userId, goalId);
    if (!error) {
      set((s) => {
        const { [goalId]: _, ...rest } = s.contributionsByGoal;
        return {
          goals: s.goals.filter((g) => g.id !== goalId),
          contributionsByGoal: rest,
        };
      });
    }
    return { error };
  },

  addContribution: async (params) => {
    const { contribution, error } = await insertGoalContribution(params);
    if (!error && contribution) {
      set((s) => ({
        contributionsByGoal: {
          ...s.contributionsByGoal,
          [params.goalId]: [contribution, ...(s.contributionsByGoal[params.goalId] ?? [])],
        },
      }));
    }
    return { error };
  },
}));
