import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { BIOMETRICS_ENABLED_KEY, clearDeviceSecurity } from '@/lib/biometrics-storage';
import { STORAGE_PENDING, STORAGE_SAVED_TOTAL } from '@/store/save-pending-store';

const AUTH_STATE_KEY = 'auth_state';

const FINANCE_KEYS = [
  'finance_transactions',
  'finance_goals',
  'finance_reports',
  'finance_subscriptions',
  'finance_custom_categories',
  'finance_loans',
] as const;

/**
 * Vymaže lokální úložiště po smazání účtu (aby po odhlášení nezůstala stará data).
 */
export async function clearLocalStorageAfterAccountDeletion(): Promise<void> {
  const empty = '[]';
  const pairs: [string, string][] = FINANCE_KEYS.map((k) => [k, empty]);
  await AsyncStorage.multiSet(pairs);

  // Clear SecureStore keys (biometrics flag + app lock pin)
  if (Platform.OS !== 'web') {
    await clearDeviceSecurity().catch(() => undefined);
  }

  await AsyncStorage.multiRemove([
    AUTH_STATE_KEY,
    BIOMETRICS_ENABLED_KEY,
    'onboarding_completed',
    STORAGE_PENDING,
    STORAGE_SAVED_TOTAL,
    'buddy_level',
    'buddy_points',
    'buddy_completed_lessons',
    'buddy_gaming_stats',
  ]);
}

export type DeleteAccountResult = { ok: true } | { ok: false; message: string };

export type HouseholdDeletionWarning =
  | {
      kind: 'transfer';
      householdId: string;
      householdName: string;
      successorName: string;
    }
  | {
      kind: 'solo_delete';
      householdId: string;
      householdName: string;
    };

/**
 * Domácnosti, kde je uživatel zakladatel — pro varování před smazáním účtu.
 */
export async function fetchHouseholdDeletionWarnings(
  userId: string,
): Promise<{ warnings: HouseholdDeletionWarning[]; error: string | null }> {
  const { data: owned, error: ownedErr } = await supabase
    .from('households')
    .select('id, name')
    .eq('created_by', userId);

  if (ownedErr) {
    return { warnings: [], error: ownedErr.message };
  }

  const warnings: HouseholdDeletionWarning[] = [];

  for (const h of owned ?? []) {
    const householdId = String(h.id);
    const householdName = String(h.name ?? 'Domácnost');

    const { data: members, error: memErr } = await supabase
      .from('household_members')
      .select('user_id, users(display_name, email)')
      .eq('household_id', householdId);

    if (memErr) {
      return { warnings, error: memErr.message };
    }

    const others = (members ?? []).filter((m) => String(m.user_id) !== userId);
    if (others.length === 0) {
      warnings.push({ kind: 'solo_delete', householdId, householdName });
      continue;
    }

    const first = others[0] as {
      user_id: string;
      users?:
        | { display_name?: string | null; email?: string | null }
        | { display_name?: string | null; email?: string | null }[]
        | null;
    };
    const u = Array.isArray(first.users) ? first.users[0] : first.users;
    const successorName =
      (u?.display_name && String(u.display_name).trim()) ||
      (u?.email && String(u.email).trim()) ||
      'jiný člen';

    warnings.push({
      kind: 'transfer',
      householdId,
      householdName,
      successorName,
    });
  }

  return { warnings, error: null };
}

/** Znovu ověří heslo před smazáním (Supabase email/password). */
export async function reauthenticateWithPassword(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, message: 'empty_password' };
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: trimmed,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/**
 * Edge delete-account: storage → prepare_user_account_deletion → auth.admin.deleteUser.
 */
export async function invokeDeleteAccountEdge(): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.functions.invoke<{ error?: string; success?: boolean }>(
    'delete-account',
    { method: 'POST', body: {} },
  );

  if (error) {
    return { ok: false, message: error.message };
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { ok: false, message: String(data.error) };
  }
  return { ok: true };
}
