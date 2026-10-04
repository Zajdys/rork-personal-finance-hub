import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { hasSupabaseSession, logSupabaseDataError } from '@/lib/supabase-session';

const ACTIVE_HOUSEHOLD_KEY_PREFIX = 'active_household_id';

/** Aktivní domácnost uživatele (persistovaná volba, jinak první členství). */
export async function fetchPrimaryHouseholdId(userId: string): Promise<string | null> {
  const url = `${supabaseUrl}/rest/v1/household_members`;
  if (!userId || !(await hasSupabaseSession())) return null;
  try {
    const stored = await AsyncStorage.getItem(`${ACTIVE_HOUSEHOLD_KEY_PREFIX}_${userId}`);
    if (stored) {
      const { data: membership, error: membershipError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .eq('household_id', stored)
        .maybeSingle();

      if (membershipError) {
        logSupabaseDataError('[Supabase household] household_members', membershipError);
      } else if (membership?.household_id) {
        return String(membership.household_id);
      }
    }

    const { data, error } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logSupabaseDataError('[Supabase household] household_members', error);
      return null;
    }
    if (!data?.household_id) return null;
    return String(data.household_id);
  } catch (err) {
    logSupabaseDataError('[Supabase household] network household_members', err);
    return null;
  }
}
