import { supabase } from '@/lib/supabase';

export async function renameHouseholdInSupabase(
  householdId: string,
  newName: string,
): Promise<{ name: string | null; error: { message?: string } | null }> {
  const name = newName.trim();
  if (!name) {
    return { name: null, error: { message: 'empty name' } };
  }

  const { error } = await supabase.from('households').update({ name }).eq('id', householdId);
  return { name, error };
}
