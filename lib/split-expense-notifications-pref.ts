import { supabase } from '@/lib/supabase';

/** Načte `users.notify_split_expenses` (default true). */
export async function fetchNotifySplitExpenses(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('notify_split_expenses')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[split-notif-pref] fetch failed', error.message);
    return true;
  }

  if (data?.notify_split_expenses === false) return false;
  return true;
}

export async function updateNotifySplitExpenses(
  userId: string,
  value: boolean,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('users')
    .update({ notify_split_expenses: value })
    .eq('id', userId);

  if (error) {
    console.warn('[split-notif-pref] update failed', error.message);
    return { error: new Error(error.message) };
  }
  return { error: null };
}
