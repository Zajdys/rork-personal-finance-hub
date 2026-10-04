import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'save_savings_goals_v1';

export type SavingsContribution = {
  id: string;
  amount: number;
  createdAt: string;
};

export type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: number;
  deadline: string;
  emoji: string;
  color: string;
  contributions: SavingsContribution[];
};

export function getGoalCurrentAmount(goal: SavingsGoal): number {
  return goal.contributions.reduce((s, c) => s + c.amount, 0);
}

function normalizeGoal(raw: unknown): SavingsGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  return {
    id: String(g.id ?? ''),
    name: String(g.name ?? 'Cíl'),
    targetAmount: Number(g.targetAmount) || 0,
    deadline: typeof g.deadline === 'string' ? g.deadline : new Date().toISOString(),
    emoji: String(g.emoji ?? '💰'),
    color: typeof g.color === 'string' && g.color.startsWith('#') ? g.color : '#10B981',
    contributions: Array.isArray(g.contributions)
      ? g.contributions
          .map((c: unknown) => {
            if (!c || typeof c !== 'object') return null;
            const x = c as Record<string, unknown>;
            return {
              id: String(x.id ?? ''),
              amount: Number(x.amount) || 0,
              createdAt: typeof x.createdAt === 'string' ? x.createdAt : new Date().toISOString(),
            };
          })
          .filter(Boolean) as SavingsContribution[]
      : [],
  };
}

async function persist(goals: SavingsGoal[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch (e) {
    console.warn('[savings-goals] persist', e);
  }
}

interface SavingsGoalsState {
  goals: SavingsGoal[];
  isLoaded: boolean;
  loadGoals: () => Promise<void>;
  addGoal: (goal: Omit<SavingsGoal, 'id' | 'contributions'> & { contributions?: SavingsContribution[] }) => void;
  deleteGoal: (id: string) => void;
  addContribution: (goalId: string, amount: number) => void;
}

export const useSavingsGoalsStore = create<SavingsGoalsState>((set, get) => ({
  goals: [],
  isLoaded: false,

  loadGoals: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const goals = parsed.map(normalizeGoal).filter(Boolean) as SavingsGoal[];
          set({ goals, isLoaded: true });
          return;
        }
      }
      set({ goals: [], isLoaded: true });
    } catch (e) {
      console.warn('[savings-goals] load', e);
      set({ goals: [], isLoaded: true });
    }
  },

  addGoal: (input) => {
    const id = `sg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const goal: SavingsGoal = {
      id,
      name: input.name.trim(),
      targetAmount: Math.max(0, input.targetAmount),
      deadline: input.deadline,
      emoji: input.emoji || '💰',
      color: input.color || '#10B981',
      contributions: input.contributions ?? [],
    };
    set((s) => {
      const next = [...s.goals, goal];
      void persist(next);
      return { goals: next };
    });
  },

  deleteGoal: (id) => {
    set((s) => {
      const next = s.goals.filter((g) => g.id !== id);
      void persist(next);
      return { goals: next };
    });
  },

  addContribution: (goalId, amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const contribution: SavingsContribution = {
      id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      amount: Math.round(amount * 100) / 100,
      createdAt: new Date().toISOString(),
    };
    set((s) => {
      const next = s.goals.map((g) =>
        g.id === goalId ? { ...g, contributions: [contribution, ...g.contributions] } : g,
      );
      void persist(next);
      return { goals: next };
    });
  },
}));
