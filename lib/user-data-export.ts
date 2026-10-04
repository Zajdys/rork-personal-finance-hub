import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';

const TX_PAGE_SIZE = 1000;

async function fetchAllTransactionRowsForExport(
  userId: string,
): Promise<{ data: unknown[]; error: string | null }> {
  const all: unknown[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TX_PAGE_SIZE - 1);
    if (error) return { data: [], error: error.message };
    const page = data ?? [];
    all.push(...page);
    if (page.length < TX_PAGE_SIZE) break;
    from += TX_PAGE_SIZE;
  }
  return { data: all, error: null };
}

export type UserDataExportBundle = {
  exportedAt: string;
  /** Řádek z public.users (včetně monthly_income, financial_goals jsonb, …). */
  users: Record<string, unknown> | null;
  /** Jméno, příjmení, avatar z user_profiles. */
  user_profiles: Record<string, unknown> | null;
  transactions: unknown[];
  /** Hodnota sloupce users.financial_goals (jsonb); samostatná tabulka v projektu není. */
  financial_goals: unknown;
  /** Odpovídá tabulce monthly_subscriptions (předplatné v Supabase). */
  subscriptions: unknown[];
  investment_records: unknown[];
  reserve_records: unknown[];
};

/**
 * Načte exportovatelná data přihlášeného uživatele ze Supabase.
 */
export async function fetchUserDataExportBundle(userId: string): Promise<{
  bundle: UserDataExportBundle;
  errors: string[];
}> {
  const errors: string[] = [];

  const usersRes = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (usersRes.error) errors.push(`users: ${usersRes.error.message}`);

  const profileRes = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (profileRes.error) errors.push(`user_profiles: ${profileRes.error.message}`);

  const txRes = await fetchAllTransactionRowsForExport(userId);
  if (txRes.error) errors.push(`transactions: ${txRes.error}`);

  const subsRes = await supabase.from('monthly_subscriptions').select('*').eq('user_id', userId);
  if (subsRes.error) errors.push(`monthly_subscriptions: ${subsRes.error.message}`);

  const invRes = await supabase.from('investment_records').select('*').eq('user_id', userId);
  if (invRes.error) errors.push(`investment_records: ${invRes.error.message}`);

  const resRes = await supabase.from('reserve_records').select('*').eq('user_id', userId);
  if (resRes.error) errors.push(`reserve_records: ${resRes.error.message}`);

  const userRow = (usersRes.data ?? null) as Record<string, unknown> | null;
  const financialGoals = userRow?.financial_goals ?? [];

  const bundle: UserDataExportBundle = {
    exportedAt: new Date().toISOString(),
    users: userRow,
    user_profiles: (profileRes.data ?? null) as Record<string, unknown> | null,
    transactions: txRes.data ?? [],
    financial_goals: financialGoals,
    subscriptions: subsRes.data ?? [],
    investment_records: invRes.data ?? [],
    reserve_records: resRes.data ?? [],
  };

  return { bundle, errors };
}

export type ShareUserDataExportLabels = {
  webHint: string;
  cacheUnavailable: string;
  sharingUnavailable: string;
  dialogTitle: string;
};

/**
 * GDPR export: stáhne bundle ze Supabase a nabídne JSON ke sdílení (na webu jen hint).
 */
export async function shareUserDataExport(
  userId: string,
  labels: ShareUserDataExportLabels,
): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string; webOnly?: boolean }> {
  const { bundle, errors } = await fetchUserDataExportBundle(userId);
  const json = JSON.stringify(bundle, null, 2);

  if (Platform.OS === 'web') {
    return { ok: false, error: labels.webHint, webOnly: true };
  }

  const base = FileSystem.cacheDirectory;
  if (!base) {
    return { ok: false, error: labels.cacheUnavailable };
  }

  const path = `${base}moneybuddy-export-${userId.slice(0, 8)}-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, json);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    return { ok: false, error: labels.sharingUnavailable };
  }

  await Sharing.shareAsync(path, {
    mimeType: 'application/json',
    dialogTitle: labels.dialogTitle,
    UTI: 'public.json',
  });

  return { ok: true, warnings: errors };
}
