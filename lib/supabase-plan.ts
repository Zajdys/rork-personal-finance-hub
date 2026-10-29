/**
 * Osobní plán: user_budgets + savings_goals (+ contributions).
 * Jednorázová migrace z AsyncStorage / legacy reserve → Supabase.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { randomUUID } from '@/lib/random-uuid';
import { normalizeCategory } from '@/lib/category-normalize';
import { fetchUserReserveGoal } from '@/lib/user-profile-supabase';
import { fetchReserveRecords } from '@/lib/investment-reserve-records';
import type { RecurringFrequency } from '@/lib/recurring-expense-cycle';

const FINANCE_GOALS_KEY = 'finance_goals';
const SAVINGS_GOALS_KEY = 'save_savings_goals_v1';
const MIGRATION_FLAG = (userId: string) => `plan_data_migrated_v1:${userId}`;

export type UserBudget = {
  id: string;
  userId: string;
  category: string;
  subcategory: string | null;
  amount: number;
  period: 'monthly';
  label: string | null;
  emoji: string | null;
};

export type SavingsGoalKind = 'goal' | 'emergency_fund';

export type PlanSavingsGoal = {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  color: string;
  targetAmount: number;
  deadline: string | null;
  kind: SavingsGoalKind;
  archivedAt: string | null;
  createdAt: string | null;
};

export type PlanContribution = {
  id: string;
  goalId: string;
  userId: string;
  amount: number;
  note: string | null;
  createdAt: string;
};

function mapBudget(row: Record<string, unknown>): UserBudget {
  const n = normalizeCategory(
    String(row.category ?? 'Ostatní'),
    row.subcategory == null ? null : String(row.subcategory),
  );
  const labelRaw = row.label == null ? null : String(row.label).trim();
  const emojiRaw = row.emoji == null ? null : String(row.emoji).trim();
  return {
    id: String(row.id),
    userId: String(row.user_id),
    category: n.category,
    subcategory: n.subcategory,
    amount: Number(row.amount) || 0,
    period: 'monthly',
    label: labelRaw || null,
    emoji: emojiRaw || null,
  };
}

function mapGoal(row: Record<string, unknown>): PlanSavingsGoal {
  const kindRaw = String(row.kind ?? 'goal');
  const kind: SavingsGoalKind = kindRaw === 'emergency_fund' ? 'emergency_fund' : 'goal';
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? 'Cíl'),
    emoji: String(row.emoji ?? '💰'),
    color: typeof row.color === 'string' && row.color.startsWith('#') ? row.color : '#10B981',
    targetAmount: Number(row.target_amount) || 0,
    deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
    kind,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

function mapContribution(row: Record<string, unknown>): PlanContribution {
  return {
    id: String(row.id),
    goalId: String(row.goal_id),
    userId: String(row.user_id),
    amount: Number(row.amount) || 0,
    note: row.note == null ? null : String(row.note),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

// ─── Budgets ───────────────────────────────────────────────────────────────

const BUDGET_SELECT =
  'id, user_id, category, subcategory, amount, period, label, emoji';

export async function fetchUserBudgets(userId: string): Promise<UserBudget[]> {
  const { data, error } = await supabase
    .from('user_budgets')
    .select(BUDGET_SELECT)
    .eq('user_id', userId)
    .order('category', { ascending: true });
  if (error) {
    console.warn('[plan] fetchUserBudgets', error.message);
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => mapBudget(r as Record<string, unknown>));
}

export async function upsertUserBudget(params: {
  userId: string;
  id?: string;
  category: string;
  subcategory?: string | null;
  amount: number;
  label?: string | null;
  emoji?: string | null;
}): Promise<{ budget: UserBudget | null; error: Error | null }> {
  const n = normalizeCategory(params.category, params.subcategory ?? null);
  const id = params.id ?? randomUUID();
  const label =
    params.label === undefined
      ? undefined
      : params.label == null || !String(params.label).trim()
        ? null
        : String(params.label).trim();
  const emoji =
    params.emoji === undefined
      ? undefined
      : params.emoji == null || !String(params.emoji).trim()
        ? null
        : String(params.emoji).trim();
  const row: Record<string, unknown> = {
    id,
    user_id: params.userId,
    category: n.category,
    subcategory: n.subcategory,
    amount: Math.max(0, Math.round(params.amount)),
    period: 'monthly',
  };
  if (label !== undefined) row.label = label;
  if (emoji !== undefined) row.emoji = emoji;
  const { data, error } = await supabase
    .from('user_budgets')
    .upsert(row, { onConflict: 'id' })
    .select(BUDGET_SELECT)
    .maybeSingle();
  if (error) return { budget: null, error: new Error(error.message) };
  return { budget: data ? mapBudget(data as Record<string, unknown>) : null, error: null };
}

/** Upsert podle category (+ subcategory) — pro quick-setup. */
export async function upsertUserBudgetByCategory(params: {
  userId: string;
  category: string;
  subcategory?: string | null;
  amount: number;
}): Promise<{ error: Error | null }> {
  const n = normalizeCategory(params.category, params.subcategory ?? null);
  const existing = await fetchUserBudgets(params.userId);
  const match = existing.find(
    (b) =>
      b.category === n.category &&
      (b.subcategory ?? null) === (n.subcategory ?? null),
  );
  const { error } = await upsertUserBudget({
    userId: params.userId,
    id: match?.id,
    category: n.category,
    subcategory: n.subcategory,
    amount: params.amount,
  });
  return { error };
}

export async function deleteUserBudget(
  userId: string,
  budgetId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('user_budgets')
    .delete()
    .eq('id', budgetId)
    .eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

// ─── Savings goals ─────────────────────────────────────────────────────────

export async function fetchSavingsGoals(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<PlanSavingsGoal[]> {
  let q = supabase
    .from('savings_goals')
    .select(
      'id, user_id, name, emoji, color, target_amount, deadline, kind, archived_at, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (!opts?.includeArchived) {
    q = q.is('archived_at', null);
  }
  const { data, error } = await q;
  if (error) {
    console.warn('[plan] fetchSavingsGoals', error.message);
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => mapGoal(r as Record<string, unknown>));
}

export async function fetchSavingsGoal(
  userId: string,
  goalId: string,
): Promise<PlanSavingsGoal | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select(
      'id, user_id, name, emoji, color, target_amount, deadline, kind, archived_at, created_at',
    )
    .eq('user_id', userId)
    .eq('id', goalId)
    .maybeSingle();
  if (error || !data) return null;
  return mapGoal(data as Record<string, unknown>);
}

export async function upsertSavingsGoal(params: {
  userId: string;
  id?: string;
  name: string;
  emoji: string;
  color: string;
  targetAmount: number;
  deadline?: string | null;
  kind?: SavingsGoalKind;
}): Promise<{ goal: PlanSavingsGoal | null; error: Error | null }> {
  const id = params.id ?? randomUUID();
  const row = {
    id,
    user_id: params.userId,
    name: params.name.trim() || 'Cíl',
    emoji: params.emoji || '💰',
    color: params.color || '#10B981',
    target_amount: Math.max(0, Math.round(params.targetAmount)),
    deadline: params.deadline ? params.deadline.slice(0, 10) : null,
    kind: params.kind ?? 'goal',
  };
  const { data, error } = await supabase
    .from('savings_goals')
    .upsert(row, { onConflict: 'id' })
    .select(
      'id, user_id, name, emoji, color, target_amount, deadline, kind, archived_at, created_at',
    )
    .maybeSingle();
  if (error) return { goal: null, error: new Error(error.message) };
  return { goal: data ? mapGoal(data as Record<string, unknown>) : null, error: null };
}

export async function archiveSavingsGoal(
  userId: string,
  goalId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('savings_goals')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', goalId)
    .eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

export async function deleteSavingsGoal(
  userId: string,
  goalId: string,
): Promise<{ error: Error | null }> {
  await supabase
    .from('savings_goal_contributions')
    .delete()
    .eq('goal_id', goalId)
    .eq('user_id', userId);
  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

// ─── Contributions ─────────────────────────────────────────────────────────

export async function fetchGoalContributions(
  userId: string,
  goalId: string,
): Promise<PlanContribution[]> {
  const { data, error } = await supabase
    .from('savings_goal_contributions')
    .select('id, goal_id, user_id, amount, note, created_at')
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[plan] fetchGoalContributions', error.message);
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => mapContribution(r as Record<string, unknown>));
}

export async function fetchContributionsForGoals(
  userId: string,
  goalIds: string[],
): Promise<PlanContribution[]> {
  if (goalIds.length === 0) return [];
  const { data, error } = await supabase
    .from('savings_goal_contributions')
    .select('id, goal_id, user_id, amount, note, created_at')
    .eq('user_id', userId)
    .in('goal_id', goalIds)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[plan] fetchContributionsForGoals', error.message);
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => mapContribution(r as Record<string, unknown>));
}

export async function insertGoalContribution(params: {
  userId: string;
  goalId: string;
  amount: number;
  note?: string | null;
}): Promise<{ contribution: PlanContribution | null; error: Error | null }> {
  if (!Number.isFinite(params.amount) || params.amount === 0) {
    return { contribution: null, error: new Error('Neplatná částka') };
  }
  const row = {
    id: randomUUID(),
    goal_id: params.goalId,
    user_id: params.userId,
    amount: Math.round(params.amount * 100) / 100,
    note: params.note?.trim() || null,
  };
  const { data, error } = await supabase
    .from('savings_goal_contributions')
    .insert(row)
    .select('id, goal_id, user_id, amount, note, created_at')
    .maybeSingle();
  if (error) return { contribution: null, error: new Error(error.message) };
  return {
    contribution: data ? mapContribution(data as Record<string, unknown>) : null,
    error: null,
  };
}

export function sumContributions(rows: PlanContribution[]): number {
  return rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
}

/** Měsíční odklad: zbývá / měsíce do deadline (min 1). Bez deadline → null. */
export function monthlySavingsNeed(
  targetAmount: number,
  currentAmount: number,
  deadlineYmd: string | null,
): number | null {
  if (!deadlineYmd) return null;
  const remaining = Math.max(0, targetAmount - currentAmount);
  if (remaining <= 0) return 0;
  const end = new Date(`${deadlineYmd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return remaining; // splatnost teď / minulost → celý zbytek „tento měsíc“
  const monthsLeft = Math.max(1, Math.ceil(ms / (30.44 * 24 * 60 * 60 * 1000)));
  return Math.ceil(remaining / monthsLeft);
}

/** Převod frekvence opakované platby na měsíční ekvivalent. */
export function recurringToMonthly(amount: number, frequency: RecurringFrequency): number {
  const a = Number(amount) || 0;
  switch (frequency) {
    case 'weekly':
      return a * (52 / 12);
    case 'quarterly':
      return a / 3;
    case 'biannual':
      return a / 6;
    case 'yearly':
      return a / 12;
    case 'monthly':
    default:
      return a;
  }
}

// ─── One-shot local → Supabase migration ───────────────────────────────────

type LegacyFinanceGoal = {
  id?: string;
  title?: string;
  targetAmount?: number;
  currentAmount?: number;
  category?: string;
  deadline?: string | Date;
  type?: string;
};

type LegacySavingsGoal = {
  id?: string;
  name?: string;
  targetAmount?: number;
  deadline?: string;
  emoji?: string;
  color?: string;
  contributions?: { id?: string; amount?: number; createdAt?: string }[];
};

/**
 * Pokud má uživatel lokální data a v Supabase pro daný typ nic,
 * nahraje je a smaže lokální klíče. Idempotentní (flag + empty-check).
 */
export async function migrateLocalPlanDataToSupabase(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const done = await AsyncStorage.getItem(MIGRATION_FLAG(userId));
    if (done === '1') {
      // I tak zkus rezervu, pokud emergency_fund ještě chybí (starší běh bez rezervy).
      await migrateReserveIntoEmergencyFund(userId);
      return;
    }

    const [remoteBudgets, remoteGoals] = await Promise.all([
      fetchUserBudgets(userId),
      fetchSavingsGoals(userId, { includeArchived: true }),
    ]);

    // --- finance_goals (spending_limit → budgets, saving → goals) ---
    let financeRaw: string | null = null;
    try {
      financeRaw = await AsyncStorage.getItem(FINANCE_GOALS_KEY);
    } catch {
      /* ignore */
    }
    if (financeRaw) {
      let parsed: LegacyFinanceGoal[] = [];
      try {
        const j = JSON.parse(financeRaw);
        if (Array.isArray(j)) parsed = j;
      } catch {
        parsed = [];
      }

      if (remoteBudgets.length === 0) {
        const limits = parsed.filter((g) => g.type === 'spending_limit');
        for (const g of limits) {
          const amount = Number(g.targetAmount) || 0;
          if (amount <= 0) continue;
          const cat = String(g.category ?? 'Ostatní');
          await upsertUserBudget({
            userId,
            id: typeof g.id === 'string' && g.id.length > 8 ? g.id : undefined,
            category: cat,
            amount,
          });
        }
      }

      if (remoteGoals.filter((g) => g.kind === 'goal').length === 0) {
        const savings = parsed.filter((g) => g.type === 'saving');
        for (const g of savings) {
          const target = Number(g.targetAmount) || 0;
          if (target <= 0) continue;
          const deadline =
            g.deadline instanceof Date
              ? g.deadline.toISOString().slice(0, 10)
              : typeof g.deadline === 'string'
                ? g.deadline.slice(0, 10)
                : null;
          const { goal } = await upsertSavingsGoal({
            userId,
            id: typeof g.id === 'string' && g.id.length > 8 ? g.id : undefined,
            name: String(g.title ?? 'Cíl'),
            emoji: '💰',
            color: '#10B981',
            targetAmount: target,
            deadline,
            kind: 'goal',
          });
          const current = Number(g.currentAmount) || 0;
          if (goal && current > 0) {
            await insertGoalContribution({
              userId,
              goalId: goal.id,
              amount: current,
              note: 'Migrace',
            });
          }
        }
      }

      // Po migraci limity/spoření z lokálu pryč (ponech jen neznámé typy, pokud nějaké)
      const leftover = parsed.filter(
        (g) => g.type !== 'spending_limit' && g.type !== 'saving',
      );
      try {
        if (leftover.length === 0) await AsyncStorage.removeItem(FINANCE_GOALS_KEY);
        else await AsyncStorage.setItem(FINANCE_GOALS_KEY, JSON.stringify(leftover));
      } catch {
        /* ignore */
      }
    }

    // --- save_savings_goals_v1 ---
    let sgRaw: string | null = null;
    try {
      sgRaw = await AsyncStorage.getItem(SAVINGS_GOALS_KEY);
    } catch {
      /* ignore */
    }
    const goalsAfter = await fetchSavingsGoals(userId, { includeArchived: true });
    if (sgRaw && goalsAfter.filter((g) => g.kind === 'goal').length === 0) {
      let parsed: LegacySavingsGoal[] = [];
      try {
        const j = JSON.parse(sgRaw);
        if (Array.isArray(j)) parsed = j;
      } catch {
        parsed = [];
      }
      for (const g of parsed) {
        const target = Number(g.targetAmount) || 0;
        if (target <= 0 && !g.name) continue;
        const { goal } = await upsertSavingsGoal({
          userId,
          id: typeof g.id === 'string' && g.id.length > 8 ? g.id : undefined,
          name: String(g.name ?? 'Cíl'),
          emoji: String(g.emoji ?? '💰'),
          color: typeof g.color === 'string' ? g.color : '#10B981',
          targetAmount: target,
          deadline: typeof g.deadline === 'string' ? g.deadline.slice(0, 10) : null,
          kind: 'goal',
        });
        if (goal && Array.isArray(g.contributions)) {
          for (const c of g.contributions) {
            const amt = Number(c.amount) || 0;
            if (amt === 0) continue;
            await insertGoalContribution({
              userId,
              goalId: goal.id,
              amount: amt,
              note: null,
            });
          }
        }
      }
      try {
        await AsyncStorage.removeItem(SAVINGS_GOALS_KEY);
      } catch {
        /* ignore */
      }
    } else if (sgRaw) {
      // Už jsou remote cíle — lokál smaž, ať se neobjeví na jiném účtu omylem znovu
      try {
        await AsyncStorage.removeItem(SAVINGS_GOALS_KEY);
      } catch {
        /* ignore */
      }
    }

    await migrateReserveIntoEmergencyFund(userId);

    try {
      await AsyncStorage.setItem(MIGRATION_FLAG(userId), '1');
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn('[plan] migrateLocalPlanDataToSupabase', e);
  }
}

async function migrateReserveIntoEmergencyFund(userId: string): Promise<void> {
  const goals = await fetchSavingsGoals(userId, { includeArchived: true });
  if (goals.some((g) => g.kind === 'emergency_fund')) return;

  const [reserveGoal, records] = await Promise.all([
    fetchUserReserveGoal(userId),
    fetchReserveRecords(userId),
  ]);
  const total = records.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if ((reserveGoal == null || reserveGoal <= 0) && total <= 0 && records.length === 0) {
    return;
  }

  const target =
    reserveGoal != null && reserveGoal > 0
      ? reserveGoal
      : Math.max(total, 50_000);

  const { goal } = await upsertSavingsGoal({
    userId,
    name: 'Rezerva',
    emoji: '🛡️',
    color: '#10B981',
    targetAmount: target,
    deadline: null,
    kind: 'emergency_fund',
  });
  if (!goal) return;

  for (const r of records) {
    const amt = Number(r.amount) || 0;
    if (amt === 0) continue;
    await insertGoalContribution({
      userId,
      goalId: goal.id,
      amount: amt,
      note: r.note,
    });
  }
}
