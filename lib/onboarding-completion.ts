import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { FinancialGoal } from '@/store/finance-store';

const PENDING_ONBOARDING_PROFILE_SYNC_KEY = 'pending_onboarding_profile_sync';

export type LoanPersist = {
  loanType: 'mortgage' | 'car' | 'personal' | 'student' | 'other';
  loanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  remainingMonths: number;
};

export type OnboardingUserRowPayload = {
  userId: string;
  email: string;
  displayName: string;
  employmentStatus: string;
  monthlyIncome: string;
  financialGoals: string[];
  experienceLevel: string;
  hasLoans: boolean;
  loanDetails: LoanPersist[] | null;
  monthlyBudget: Record<string, string>;
};

/** True for typical offline / transport failures (no user-facing error; queue and retry). */
export function isLikelyNetworkError(err: Error | null | undefined): boolean {
  if (!err) return false;
  const m = String(err.message ?? '').toLowerCase();
  return (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('internet connection appears') ||
    m.includes('the internet connection') ||
    m.includes('connection refused') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('timed out') ||
    m.includes('offline')
  );
}

export async function savePendingOnboardingProfileSync(payload: OnboardingUserRowPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PENDING_ONBOARDING_PROFILE_SYNC_KEY,
      JSON.stringify({ ...payload, queuedAt: new Date().toISOString() })
    );
  } catch (e) {
    console.warn('[onboarding] save pending profile sync', e);
  }
}

/** Retries Supabase upsert for a profile saved offline; clears queue on success. */
export async function flushPendingOnboardingProfileSync(): Promise<void> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(PENDING_ONBOARDING_PROFILE_SYNC_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(PENDING_ONBOARDING_PROFILE_SYNC_KEY);
    return;
  }

  const obj = parsed as Record<string, unknown>;
  const { queuedAt: _q, ...rest } = obj;
  const payload = rest as OnboardingUserRowPayload;
  if (!payload.userId || !payload.email) {
    await AsyncStorage.removeItem(PENDING_ONBOARDING_PROFILE_SYNC_KEY);
    return;
  }

  const { error } = await persistOnboardingUserRow(payload);
  if (!error) {
    await AsyncStorage.removeItem(PENDING_ONBOARDING_PROFILE_SYNC_KEY);
    console.log('[onboarding] pending profile synced to Supabase');
    return;
  }
  if (isLikelyNetworkError(error)) {
    console.warn('[onboarding] pending profile sync skipped (still offline)', error.message);
  } else {
    console.warn('[onboarding] pending profile sync failed', error.message);
  }
}

export { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';
import { parseMoneyInput } from '@/lib/parse-money-input';

/** Střed rozsahu z onboardingu (`users.monthly_income`) → číslo v Kč. */
export function parseOnboardingMonthlyIncome(raw: string | null | undefined): number {
  const key = String(raw ?? '').trim();
  if (!key) return 0;

  const rangeMidpoints: Record<string, number> = {
    under20k: 15_000,
    '20k-40k': 30_000,
    '40k-60k': 50_000,
    '60k-100k': 80_000,
    over100k: 120_000,
  };

  if (key in rangeMidpoints) return rangeMidpoints[key]!;
  return parseMoneyInput(key) ?? 0;
}

export async function persistOnboardingUserRow(
  params: OnboardingUserRowPayload
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('users').upsert({
    id: params.userId,
    email: params.email,
    display_name: params.displayName,
    employment_status: params.employmentStatus,
    monthly_income: params.monthlyIncome,
    financial_goals: params.financialGoals,
    experience_level: params.experienceLevel,
    has_loans: params.hasLoans,
    loan_details: params.loanDetails,
    monthly_budget: params.monthlyBudget,
    onboarding_completed: true,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function insertLoanRecurringExpenses(params: {
  userId: string;
  loans: {
    loanType: 'mortgage' | 'car' | 'personal' | 'student' | 'other';
    monthlyPayment: string;
    displayName: string;
  }[];
}): Promise<{ error: Error | null }> {
  const { data: membership, error: mErr } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', params.userId)
    .maybeSingle();
  if (mErr || !membership?.household_id) {
    if (mErr) {
      console.warn('[onboarding] household lookup', mErr.message);
      return { error: new Error(mErr.message) };
    }
    return { error: null };
  }

  const hid = membership.household_id;
  type LoanRecurringRow = {
    household_id: string;
    name: string;
    amount: number;
    due_day: number;
    due_month: null;
    frequency: 'monthly';
    category: 'Bydlení' | 'Auto' | 'Energie' | 'Pojištění' | 'Předplatné' | 'Ostatní';
    split_type: 'mine';
    my_share: number;
    added_by: string;
    created_by: string;
  };
  const rows: LoanRecurringRow[] = [];

  for (const loan of params.loans) {
    const amount = parseMoneyInput(loan.monthlyPayment);
    if (amount == null || amount <= 0) continue;
    const cat: LoanRecurringRow['category'] =
      loan.loanType === 'mortgage'
        ? 'Bydlení'
        : loan.loanType === 'car'
          ? 'Auto'
          : 'Ostatní';
    rows.push({
      household_id: hid,
      name: loan.displayName.trim() || 'Splátka úvěru',
      amount,
      due_day: 15,
      due_month: null,
      frequency: 'monthly',
      category: cat,
      split_type: 'mine',
      my_share: 100,
      added_by: params.userId,
      created_by: params.userId,
    });
  }

  if (rows.length === 0) return { error: null };

  const { error } = await supabase.from('recurring_expenses').insert(rows);
  if (error) {
    console.error('[onboarding] recurring_expenses insert', error);
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export function buildBudgetGoalsFromOnboarding(
  userId: string,
  budget: {
    housing: string;
    food: string;
    transportation: string;
    entertainment: string;
    savings: string;
    other: string;
  }
): FinancialGoal[] {
  const specs: {
    key: string;
    title: string;
    category: string;
    type: 'spending_limit' | 'saving';
    raw: string;
  }[] = [
    { key: 'housing', title: 'Limit: bydlení', category: 'Bydlení', type: 'spending_limit', raw: budget.housing },
    { key: 'food', title: 'Limit: jídlo', category: 'Jídlo a nápoje', type: 'spending_limit', raw: budget.food },
    {
      key: 'transportation',
      title: 'Limit: doprava',
      category: 'Doprava',
      type: 'spending_limit',
      raw: budget.transportation,
    },
    {
      key: 'entertainment',
      title: 'Limit: zábava',
      category: 'Zábava',
      type: 'spending_limit',
      raw: budget.entertainment,
    },
    { key: 'savings', title: 'Měsíční cíl spoření', category: 'Spoření', type: 'saving', raw: budget.savings },
    { key: 'other', title: 'Limit: ostatní', category: 'Ostatní', type: 'spending_limit', raw: budget.other },
  ];

  const goals: FinancialGoal[] = [];
  const prefix = userId.slice(0, 8);
  for (const s of specs) {
    const targetAmount = parseMoneyInput(s.raw);
    if (targetAmount == null || targetAmount <= 0) continue;
    goals.push({
      id: `ob-${s.key}-${prefix}`,
      title: s.title,
      targetAmount,
      currentAmount: 0,
      category: s.category,
      type: s.type,
    });
  }
  return goals;
}
