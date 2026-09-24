import { supabase } from '@/lib/supabase';
import { fetchPrimaryHouseholdId } from '@/lib/household-id';
import { useHouseholdActiveStore } from '@/store/household-active-store';
import type { CategoryBudget } from '@/types/household';

export type HouseholdCategoryBudgetRow = {
  household_id: string;
  category: string;
  monthly_limit: number;
  currency: string | null;
  notify_at_percentage: number | null;
};

/** Household id pro rozpočty: aktivní domácnost → primary membership → vybrané id (ne mock). */
export async function resolveHouseholdIdForBudgets(
  fallbackSelectedId: string | null | undefined,
): Promise<string | null> {
  const active = useHouseholdActiveStore.getState().activeHouseholdId;
  if (active) return active;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) {
    const primary = await fetchPrimaryHouseholdId(user.id);
    if (primary) return primary;
  }

  if (fallbackSelectedId && !fallbackSelectedId.startsWith('test_')) {
    return fallbackSelectedId;
  }
  return null;
}

function clampNotifyPercent(value: number | null | undefined): number | undefined {
  if (value == null || Number.isNaN(Number(value))) return undefined;
  const n = Number(value);
  if (n <= 0) return undefined;
  return Math.min(100, Math.max(0, n));
}

function rowToBudget(row: HouseholdCategoryBudgetRow): CategoryBudget {
  const notifyAtPercentage = clampNotifyPercent(row.notify_at_percentage);
  return {
    categoryId: row.category,
    monthlyLimit: Number(row.monthly_limit) || 0,
    currency: (row.currency && String(row.currency).trim()) || 'CZK',
    enabled: true,
    ...(notifyAtPercentage != null ? { notifyAtPercentage } : {}),
  };
}

export async function fetchCategoryBudgetsRemote(
  householdId: string,
): Promise<{ budgets: Record<string, CategoryBudget>; error: Error | null }> {
  const { data, error } = await supabase
    .from('household_category_budgets')
    .select('household_id, category, monthly_limit, currency, notify_at_percentage')
    .eq('household_id', householdId);

  if (error) {
    return { budgets: {}, error: new Error(error.message) };
  }

  const budgets: Record<string, CategoryBudget> = {};
  for (const row of (data ?? []) as HouseholdCategoryBudgetRow[]) {
    if (!row?.category) continue;
    budgets[row.category] = rowToBudget(row);
  }
  return { budgets, error: null };
}

export async function upsertCategoryBudgetRemote(
  householdId: string,
  category: string,
  monthlyLimit: number,
  opts?: {
    currency?: string | null;
    notifyAtPercentage?: number | null;
  },
): Promise<{ error: Error | null }> {
  const notify = clampNotifyPercent(opts?.notifyAtPercentage ?? null);
  const currency =
    opts?.currency != null && String(opts.currency).trim()
      ? String(opts.currency).trim()
      : null;

  const { error } = await supabase.from('household_category_budgets').upsert(
    {
      household_id: householdId,
      category,
      monthly_limit: monthlyLimit,
      currency,
      notify_at_percentage: notify ?? null,
    },
    { onConflict: 'household_id,category' },
  );
  return { error: error ? new Error(error.message) : null };
}

export async function deleteCategoryBudgetRemote(
  householdId: string,
  category: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('household_category_budgets')
    .delete()
    .eq('household_id', householdId)
    .eq('category', category);
  return { error: error ? new Error(error.message) : null };
}
