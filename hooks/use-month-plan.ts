import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/store/auth-store';
import { useFinanceStore, type Transaction } from '@/store/finance-store';
import { usePlanStore } from '@/store/plan-store';
import { fetchPersonalRecurringRules, type PersonalRecurringRule } from '@/lib/personal-recurring';
import { loadPlanPaymentLinks } from '@/lib/plan-payment-match';
import { computeMonthPlan, type MonthPlan } from '@/lib/month-plan';

/**
 * Měsíční plán pro Přehled i Plán ze stejných vstupů (úvěry, pravidelné platby, rozpočty, cíle).
 * `recurringRules` lze předat zvenku (Plán je už načítá), jinak se načtou zde.
 */
export function useMonthPlan(params: {
  transactions: Transaction[];
  year: number;
  /** 1–12 */
  month: number;
  expectedIncome: number;
  recurringRules?: PersonalRecurringRule[];
  /** Změna hodnoty vynutí znovunačtení pravidel a párování. */
  refreshKey?: number;
}): { plan: MonthPlan; reloadInputs: () => Promise<void> } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const loans = useFinanceStore((s) => s.loans);
  const budgets = usePlanStore((s) => s.budgets);
  const goals = usePlanStore((s) => s.goals);
  const goalCurrentAmount = usePlanStore((s) => s.goalCurrentAmount);
  // contributions mění goalCurrentAmount — přepočítat i při jejich změně
  const contributions = usePlanStore((s) => s.contributionsByGoal);

  const [ownRules, setOwnRules] = useState<PersonalRecurringRule[]>([]);
  const [linkedTxIds, setLinkedTxIds] = useState<ReadonlySet<string>>(new Set());

  const reloadInputs = useCallback(async () => {
    if (!userId) return;
    const [{ rules }, links] = await Promise.all([
      params.recurringRules ? Promise.resolve({ rules: null }) : fetchPersonalRecurringRules(userId),
      loadPlanPaymentLinks(userId),
    ]);
    if (rules) setOwnRules(rules.filter((r) => r.active && r.type === 'expense'));
    setLinkedTxIds(new Set(Object.keys(links.byTransaction)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, !!params.recurringRules]);

  useEffect(() => {
    void reloadInputs();
  }, [reloadInputs, params.refreshKey]);

  const rules = params.recurringRules ?? ownRules;

  const plan = useMemo(
    () =>
      computeMonthPlan({
        transactions: params.transactions,
        year: params.year,
        month: params.month,
        expectedIncome: params.expectedIncome,
        loans: loans ?? [],
        recurringRules: rules,
        budgets,
        goals,
        goalCurrentAmount,
        linkedTxIds,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      params.transactions,
      params.year,
      params.month,
      params.expectedIncome,
      loans,
      rules,
      budgets,
      goals,
      goalCurrentAmount,
      contributions,
      linkedTxIds,
    ],
  );

  return { plan, reloadInputs };
}
