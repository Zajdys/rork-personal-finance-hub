import { supabase } from '@/lib/supabase';

export async function fetchMySplitGroupIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('split_group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (error) {
    console.warn('[split-groups-realtime] fetch group ids failed', error.message);
    return [];
  }

  return [...new Set((data ?? []).map((row) => String(row.group_id)))];
}
