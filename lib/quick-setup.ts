import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { randomUUID } from '@/lib/random-uuid';
import { parseMoneyInput } from '@/lib/parse-money-input';
import type { LoanItem, LoanType } from '@/store/finance-store';

/** Jen „už jsme jednou nabídli po tour“ — done/dismissed jsou v user_profiles. */
const AUTO_SHOWN_KEY = (userId: string) => `quick_setup_auto_shown:${userId}`;

export type EmploymentChip = 'employee' | 'osvc' | 'student' | 'other' | null;

/** Hodnoty ukládané do user_profiles.employment_type */
export type EmploymentTypeDb = 'employee' | 'osvc' | 'student' | 'other';

export type QuickSetupCommitmentKey =
  | 'mortgage'
  | 'rent'
  | 'energy'
  | 'phone'
  | 'leasing';

export type QuickSetupCommitmentDraft = {
  key: QuickSetupCommitmentKey;
  enabled: boolean;
  amount: string;
  dueDay: string;
  extras?: { amount: string; dueDay: string }[];
};

export type QuickSetupBudgetDraft = {
  food: string;
  transportation: string;
  shopping: string;
  entertainment: string;
};

export type QuickSetupProfile = {
  completedAt: string | null;
  dismissedAt: string | null;
  expectedMonthlyIncome: number | null;
  payday: number | null;
  employmentType: EmploymentChip;
};

export type QuickSetupStatus = {
  completed: boolean;
  completedAt: string | null;
  dismissed: boolean;
  autoShown: boolean;
  bannerDismissed: boolean;
  expectedMonthlyIncome: number;
  payday: number | null;
  employmentType: EmploymentTypeDb | null;
};

/** Formátuje celé Kč s mezerami: 35000 → "35 000". */
export function formatKčGrouped(raw: string): string {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function employmentChipToDb(chip: EmploymentChip): EmploymentTypeDb | null {
  if (!chip) return null;
  return chip;
}

export function employmentDbToChip(raw: string | null | undefined): EmploymentChip {
  const v = String(raw ?? '').trim();
  if (v === 'employee' || v === 'osvc' || v === 'student' || v === 'other') return v;
  // legacy české labely
  if (v === 'Zaměstnanec') return 'employee';
  if (v === 'OSVČ') return 'osvc';
  if (v === 'Student') return 'student';
  if (v === 'Jiné') return 'other';
  return null;
}

async function upsertUserProfile(
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ error: Error | null }> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();
  if (!error && data) return { error: null };
  if (error && error.code !== 'PGRST116') {
    // zkus upsert
  }
  const { error: upErr } = await supabase.from('user_profiles').upsert({
    id: userId,
    user_id: userId,
    ...patch,
  });
  return { error: upErr ? new Error(upErr.message) : null };
}

export async function fetchQuickSetupProfile(userId: string): Promise<QuickSetupProfile> {
  const empty: QuickSetupProfile = {
    completedAt: null,
    dismissedAt: null,
    expectedMonthlyIncome: null,
    payday: null,
    employmentType: null,
  };
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(
        'quick_setup_completed_at, quick_setup_dismissed_at, expected_monthly_income, payday, employment_type',
      )
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return empty;
    const incomeRaw = data.expected_monthly_income;
    const incomeNum =
      incomeRaw == null || incomeRaw === ''
        ? null
        : typeof incomeRaw === 'number'
          ? incomeRaw
          : parseMoneyInput(String(incomeRaw));
    const paydayRaw = data.payday;
    const paydayNum =
      paydayRaw == null || paydayRaw === ''
        ? null
        : Math.min(31, Math.max(1, Number(paydayRaw) || 0)) || null;
    return {
      completedAt: data.quick_setup_completed_at
        ? String(data.quick_setup_completed_at)
        : null,
      dismissedAt: data.quick_setup_dismissed_at
        ? String(data.quick_setup_dismissed_at)
        : null,
      expectedMonthlyIncome:
        incomeNum != null && Number.isFinite(incomeNum) && incomeNum > 0 ? incomeNum : null,
      payday: paydayNum,
      employmentType: employmentDbToChip(
        typeof data.employment_type === 'string' ? data.employment_type : null,
      ),
    };
  } catch (e) {
    console.warn('[quick-setup] profile fetch', e);
    return empty;
  }
}

export async function loadQuickSetupStatus(userId: string): Promise<QuickSetupStatus> {
  const profile = await fetchQuickSetupProfile(userId);
  let autoShown = false;
  try {
    autoShown = (await AsyncStorage.getItem(AUTO_SHOWN_KEY(userId))) === '1';
  } catch {
    /* ignore */
  }
  const completed = Boolean(profile.completedAt);
  const dismissed = Boolean(profile.dismissedAt);
  return {
    completed,
    completedAt: profile.completedAt,
    dismissed,
    autoShown,
    bannerDismissed: dismissed,
    expectedMonthlyIncome: profile.expectedMonthlyIncome ?? 0,
    payday: profile.payday,
    employmentType: profile.employmentType,
  };
}

export async function markQuickSetupAutoShown(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTO_SHOWN_KEY(userId), '1');
  } catch {
    /* ignore */
  }
}

export async function markQuickSetupBannerDismissed(
  userId: string,
): Promise<{ error: Error | null }> {
  const iso = new Date().toISOString();
  try {
    await AsyncStorage.setItem(AUTO_SHOWN_KEY(userId), '1');
  } catch {
    /* ignore */
  }
  return upsertUserProfile(userId, { quick_setup_dismissed_at: iso });
}

export async function markQuickSetupCompleted(
  userId: string,
): Promise<{ error: Error | null }> {
  const iso = new Date().toISOString();
  try {
    await AsyncStorage.setItem(AUTO_SHOWN_KEY(userId), '1');
  } catch {
    /* ignore */
  }
  return upsertUserProfile(userId, {
    quick_setup_completed_at: iso,
    // po dokončení banner netřeba
    quick_setup_dismissed_at: iso,
  });
}

export async function saveQuickSetupProfileFields(
  userId: string,
  fields: {
    expectedMonthlyIncome: number | null;
    payday: number | null;
    employmentType: EmploymentTypeDb | null;
  },
): Promise<{ error: Error | null }> {
  return upsertUserProfile(userId, {
    expected_monthly_income: fields.expectedMonthlyIncome,
    payday: fields.payday,
    employment_type: fields.employmentType,
  });
}

/** Po tour/paywall: jednou nabídnout quick-setup. */
export async function resolvePostTourHref(
  userId: string | null | undefined,
): Promise<'/quick-setup' | '/(tabs)'> {
  if (!userId) return '/(tabs)';
  const s = await loadQuickSetupStatus(userId);
  if (s.completed || s.dismissed || s.autoShown) return '/(tabs)';
  return '/quick-setup';
}

export function shouldShowQuickSetupBanner(status: QuickSetupStatus): boolean {
  return !status.completed && !status.bannerDismissed && status.autoShown;
}

const COMMITMENT_META: Record<
  QuickSetupCommitmentKey,
  { name: string; emoji: string; color: string; loanType: LoanType; categoryTag: string }
> = {
  mortgage: {
    name: 'Hypotéka',
    emoji: '🏦',
    color: '#10B981',
    loanType: 'mortgage',
    categoryTag: 'Úvěry › Hypotéka',
  },
  rent: {
    name: 'Nájem',
    emoji: '🏠',
    color: '#6366F1',
    loanType: 'other',
    categoryTag: 'Bydlení › Nájem',
  },
  energy: {
    name: 'Energie',
    emoji: '⚡',
    color: '#F59E0B',
    loanType: 'other',
    categoryTag: 'Bydlení › Energie',
  },
  phone: {
    name: 'Telefon a internet',
    emoji: '📱',
    color: '#3B82F6',
    loanType: 'other',
    categoryTag: 'Bydlení › Internet a telefon',
  },
  leasing: {
    name: 'Leasing / půjčka',
    emoji: '🚗',
    color: '#8B5CF6',
    loanType: 'car',
    categoryTag: 'Úvěry › Leasing',
  },
};

export function getCommitmentMeta(key: QuickSetupCommitmentKey) {
  return COMMITMENT_META[key];
}

function dueDayToStartDate(dueDayRaw: string): Date {
  const day = Math.min(31, Math.max(1, parseInt(dueDayRaw, 10) || 15));
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const d = Math.min(day, last);
  return new Date(y, m, d, 12, 0, 0, 0);
}

/**
 * Závazky (loans) — NE transakce, NE personal_recurring.
 */
export function buildQuickSetupLoans(drafts: QuickSetupCommitmentDraft[]): LoanItem[] {
  const out: LoanItem[] = [];
  for (const draft of drafts) {
    if (!draft.enabled) continue;
    const meta = COMMITMENT_META[draft.key];
    const rows =
      draft.key === 'leasing' && draft.extras?.length
        ? [{ amount: draft.amount, dueDay: draft.dueDay }, ...draft.extras]
        : [{ amount: draft.amount, dueDay: draft.dueDay }];

    rows.forEach((row, idx) => {
      const monthly = parseMoneyInput(row.amount);
      if (monthly == null || monthly <= 0) return;
      const startDate = dueDayToStartDate(row.dueDay);
      const remainingMonths = 120;
      out.push({
        id: randomUUID(),
        loanType: meta.loanType,
        name: idx === 0 ? meta.name : `${meta.name} ${idx + 1}`,
        emoji: meta.emoji,
        color: meta.color,
        loanAmount: monthly * remainingMonths,
        interestRate: 0,
        monthlyPayment: monthly,
        remainingMonths,
        termMonths: remainingMonths,
        startDate,
        currentBalance: monthly * remainingMonths,
      });
    });
  }
  return out;
}

export function sumCommitmentMonthly(drafts: QuickSetupCommitmentDraft[]): number {
  let sum = 0;
  for (const d of drafts) {
    if (!d.enabled) continue;
    const a = parseMoneyInput(d.amount);
    if (a != null && a > 0) sum += a;
    if (d.key === 'leasing') {
      for (const e of d.extras ?? []) {
        const x = parseMoneyInput(e.amount);
        if (x != null && x > 0) sum += x;
      }
    }
  }
  return sum;
}

export function sumBudgetMonthly(budget: QuickSetupBudgetDraft): number {
  let sum = 0;
  for (const key of ['food', 'transportation', 'shopping', 'entertainment'] as const) {
    const n = parseMoneyInput(budget[key]);
    if (n != null && n > 0) sum += n;
  }
  return sum;
}

export const DEFAULT_COMMITMENTS: QuickSetupCommitmentDraft[] = [
  { key: 'mortgage', enabled: false, amount: '', dueDay: '15' },
  { key: 'rent', enabled: false, amount: '', dueDay: '1' },
  { key: 'energy', enabled: false, amount: '', dueDay: '15' },
  { key: 'phone', enabled: false, amount: '', dueDay: '15' },
  { key: 'leasing', enabled: false, amount: '', dueDay: '15', extras: [] },
];

export const EMPTY_BUDGET: QuickSetupBudgetDraft = {
  food: '',
  transportation: '',
  shopping: '',
  entertainment: '',
};

export function employmentLabel(chip: EmploymentChip): string {
  switch (chip) {
    case 'employee':
      return 'Zaměstnanec';
    case 'osvc':
      return 'OSVČ';
    case 'student':
      return 'Student';
    case 'other':
      return 'Jiné';
    default:
      return '';
  }
}
