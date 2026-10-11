import type { SupabaseClient } from '@supabase/supabase-js';
import { TERMS_VERSION } from '@/constants/legal-urls';
import { supabase } from '@/lib/supabase';

export async function fetchTermsAccepted(
  userId: string,
  client: SupabaseClient = supabase,
): Promise<boolean> {
  const { data, error } = await client
    .from('user_profiles')
    .select('terms_accepted_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[terms] fetch failed', error.message);
    return false;
  }
  return Boolean(data?.terms_accepted_at);
}

/** Upsert souhlasu 18+ a Podmínek/Zásad do user_profiles. */
export async function upsertTermsConsent(
  userId: string,
  client: SupabaseClient = supabase,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const now = new Date().toISOString();
  const { error } = await client.from('user_profiles').upsert(
    {
      user_id: userId,
      terms_accepted_at: now,
      age_confirmed_at: now,
      terms_version: TERMS_VERSION,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
