import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { LoanItem, LoanType } from '@/store/finance-store';

export const FINANCE_LOANS_KEY = 'finance_loans';

export type LoanRow = {
  id: string;
  user_id: string;
  loan_type: string;
  loan_amount: number;
  interest_rate: number;
  monthly_payment: number;
  term_months: number | null;
  remaining_months: number;
  start_date: string;
  name: string | null;
  color: string | null;
  emoji: string | null;
  is_fixed: boolean;
  fixed_years: number | null;
  fixed_end_date: string | null;
  fixation_start_date: string | null;
  current_balance: number | null;
  down_payment: number | null;
  payments_made: number | null;
  installment_start_date: string | null;
  created_at?: string;
  updated_at?: string;
};

const LOAN_TYPES: LoanType[] = ['mortgage', 'car', 'personal', 'student', 'other'];

function toDateOnly(d: Date | string | undefined | null): string | null {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function asLoanType(v: unknown): LoanType {
  if (typeof v === 'string' && (LOAN_TYPES as string[]).includes(v)) return v as LoanType;
  return 'other';
}

export function loanToRow(loan: LoanItem, userId: string): LoanRow {
  return {
    id: String(loan.id),
    user_id: userId,
    loan_type: loan.loanType,
    loan_amount: Number(loan.loanAmount) || 0,
    interest_rate: Number(loan.interestRate) || 0,
    monthly_payment: Number(loan.monthlyPayment) || 0,
    term_months: loan.termMonths != null ? Math.floor(loan.termMonths) : null,
    remaining_months: Math.floor(loan.remainingMonths) || 0,
    start_date: toDateOnly(loan.startDate) ?? toDateOnly(new Date())!,
    name: loan.name?.trim() || null,
    color: loan.color ?? null,
    emoji: loan.emoji ?? null,
    is_fixed: Boolean(loan.isFixed) || toDateOnly(loan.fixedEndDate ?? null) != null,
    fixed_years: loan.fixedYears != null ? Math.floor(loan.fixedYears) : null,
    fixed_end_date: toDateOnly(loan.fixedEndDate ?? null),
    fixation_start_date: toDateOnly(loan.fixationStartDate ?? null),
    current_balance: loan.currentBalance != null ? Number(loan.currentBalance) : null,
    down_payment: loan.downPayment != null ? Number(loan.downPayment) : null,
    payments_made: loan.paymentsMade != null ? Math.floor(loan.paymentsMade) : null,
    installment_start_date: toDateOnly(loan.installmentStartDate ?? null),
  };
}

export function rowToLoan(row: LoanRow): LoanItem {
  const start = parseDate(row.start_date) ?? new Date();
  return {
    id: String(row.id),
    loanType: asLoanType(row.loan_type),
    loanAmount: Number(row.loan_amount) || 0,
    interestRate: Number(row.interest_rate) || 0,
    monthlyPayment: Number(row.monthly_payment) || 0,
    termMonths: row.term_months != null ? Number(row.term_months) : undefined,
    remainingMonths: Number(row.remaining_months) || 0,
    startDate: start,
    name: row.name ?? undefined,
    color: row.color ?? undefined,
    emoji: row.emoji ?? undefined,
    isFixed: Boolean(row.is_fixed) || Boolean(row.fixed_end_date),
    fixedYears: row.fixed_years != null ? Number(row.fixed_years) : undefined,
    fixedEndDate: parseDate(row.fixed_end_date),
    fixationStartDate: parseDate(row.fixation_start_date),
    currentBalance: row.current_balance != null ? Number(row.current_balance) : undefined,
    downPayment: row.down_payment != null ? Number(row.down_payment) : undefined,
    paymentsMade: row.payments_made != null ? Number(row.payments_made) : undefined,
    installmentStartDate: parseDate(row.installment_start_date),
  };
}

export function parseLocalLoansJson(raw: string | null): LoanItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((l: Record<string, unknown>) => ({
      ...(l as unknown as LoanItem),
      startDate: new Date(String(l.startDate)),
      fixedEndDate: l.fixedEndDate ? new Date(String(l.fixedEndDate)) : undefined,
      fixationStartDate: l.fixationStartDate ? new Date(String(l.fixationStartDate)) : undefined,
      installmentStartDate: l.installmentStartDate
        ? new Date(String(l.installmentStartDate))
        : undefined,
    }));
  } catch {
    return [];
  }
}

export async function fetchLoansRemote(
  userId: string,
): Promise<{ loans: LoanItem[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return { loans: [], error: new Error(error.message) };
  const loans = ((data ?? []) as LoanRow[]).map(rowToLoan);
  return { loans, error: null };
}

export async function upsertLoansRemote(
  loans: LoanItem[],
  userId: string,
): Promise<{ error: Error | null }> {
  if (!loans.length) return { error: null };
  const rows = loans.map((l) => loanToRow(l, userId));
  const { error } = await supabase.from('loans').upsert(rows, { onConflict: 'user_id,id' });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteLoanRemote(
  id: string,
  userId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('loans').delete().eq('user_id', userId).eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Jednorázová migrace: lokální finance_loans → upsert do DB → smazat klíč.
 * Pak vždy načte loans z DB (zdroj pravdy).
 */
export async function loadLoansWithLocalMigration(
  userId: string,
): Promise<{ loans: LoanItem[]; error: Error | null; migrated: number }> {
  const raw = await AsyncStorage.getItem(FINANCE_LOANS_KEY);
  const local = parseLocalLoansJson(raw);
  let migrated = 0;

  if (local.length > 0) {
    const { error: upErr } = await upsertLoansRemote(local, userId);
    if (upErr) {
      console.warn('[loans] local→supabase migrate failed', upErr.message);
      return { loans: local, error: upErr, migrated: 0 };
    }
    migrated = local.length;
    await AsyncStorage.removeItem(FINANCE_LOANS_KEY);
    console.log('[loans] migrated local → supabase', migrated);
  } else if (raw != null) {
    // prázdné pole / poškozená data — klíč stejně smažeme
    await AsyncStorage.removeItem(FINANCE_LOANS_KEY);
  }

  const { loans, error } = await fetchLoansRemote(userId);
  return { loans, error, migrated };
}
