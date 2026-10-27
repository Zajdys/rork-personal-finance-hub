import { supabase } from '@/lib/supabase';

/**
 * Má uživatel (nebo člen jeho domácnosti) aktivní Premium?
 * Používá SECURITY DEFINER RPC `household_has_premium()` — nečte premium_until z clientside.
 */
export async function fetchHouseholdHasPremium(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('household_has_premium');
    if (error) {
      console.warn('[household-premium] rpc failed', error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn('[household-premium] unexpected', e);
    return false;
  }
}
