import { parseOnboardingMonthlyIncome } from '@/lib/onboarding-completion';
import { supabase } from '@/lib/supabase';

export type UserProfileRow = {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

/** Číslo z `public.users.monthly_income` (text); neplatné / prázdné → 0. */
export async function fetchUserMonthlyIncomeFromSupabase(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('monthly_income')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return 0;
  return parseOnboardingMonthlyIncome(data.monthly_income);
}

export async function fetchUserProfileFromSupabase(userId: string): Promise<UserProfileRow | null> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[user_profiles] fetch', error.message);
      return null;
    }
    return data as UserProfileRow | null;
  } catch (e) {
    console.warn('[user_profiles] fetch threw', e);
    return null;
  }
}

export async function updateUserProfileFields(
  userId: string,
  fields: {
    first_name: string | null;
    last_name: string | null;
    avatar_url?: string | null;
  },
): Promise<{ error: Error | null }> {
  const payload: Record<string, unknown> = {
    first_name: fields.first_name,
    last_name: fields.last_name,
  };
  if (fields.avatar_url !== undefined) {
    payload.avatar_url = fields.avatar_url;
  }

  const { error } = await supabase.from('user_profiles').update(payload).eq('user_id', userId);
  return { error: error ? new Error(error.message) : null };
}

/** `public.users.monthly_income` je typu text; prázdný vstup → null. */
export async function updateUserMonthlyIncome(
  userId: string,
  monthlyIncome: string | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('users').update({ monthly_income: monthlyIncome }).eq('id', userId);
  return { error: error ? new Error(error.message) : null };
}

function parseNumericGoal(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function fetchUserInvestmentGoal(userId: string): Promise<number | null> {
  const { data, error } = await supabase.from('users').select('investment_goal').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return parseNumericGoal(data.investment_goal);
}

export async function fetchUserReserveGoal(userId: string): Promise<number | null> {
  const { data, error } = await supabase.from('users').select('reserve_goal').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return parseNumericGoal(data.reserve_goal);
}

export async function updateUserInvestmentGoal(
  userId: string,
  goal: number | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('users').update({ investment_goal: goal }).eq('id', userId);
  return { error: error ? new Error(error.message) : null };
}

export async function updateUserReserveGoal(userId: string, goal: number | null): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('users').update({ reserve_goal: goal }).eq('id', userId);
  return { error: error ? new Error(error.message) : null };
}
