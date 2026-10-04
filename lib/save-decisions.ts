import { supabase } from '@/lib/supabase';

export type SaveDecisionType = 'saved' | 'bought' | 'unsure';

export type SaveDecisionRow = {
  id: string;
  user_id: string;
  household_id: string | null;
  item_name: string;
  price: number;
  decision: SaveDecisionType;
  hourly_wage: number | null;
  hours_of_work: number | null;
  future_value: number | null;
  created_at: string;
};

export type InsertSaveDecisionInput = {
  userId: string;
  householdId: string | null;
  itemName: string;
  price: number;
  decision: SaveDecisionType;
  hourlyWage?: number;
  hoursOfWork?: number;
  futureValue?: number;
};

export async function insertSaveDecision(input: InsertSaveDecisionInput): Promise<{
  data: SaveDecisionRow | null;
  error: { message?: string } | null;
}> {
  const { data, error } = await supabase
    .from('save_decisions')
    .insert({
      user_id: input.userId,
      household_id: input.householdId,
      item_name: input.itemName.trim(),
      price: input.price,
      decision: input.decision,
      hourly_wage: input.hourlyWage ?? null,
      hours_of_work: input.hoursOfWork ?? null,
      future_value: input.futureValue ?? null,
    })
    .select('*')
    .single();

  if (error) return { data: null, error };
  return { data: data as SaveDecisionRow, error: null };
}

export async function fetchSaveDecisions(
  userId: string,
  householdId: string | null,
  limit = 20,
): Promise<SaveDecisionRow[]> {
  let query = supabase
    .from('save_decisions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (householdId) {
    query = query.eq('household_id', householdId);
  } else {
    query = query.eq('user_id', userId).is('household_id', null);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[save-decisions] fetch', error.message);
    return [];
  }
  return (data ?? []) as SaveDecisionRow[];
}

export async function fetchSavedTotalFromDb(
  userId: string,
  householdId: string | null,
): Promise<number> {
  let query = supabase.from('save_decisions').select('price').eq('decision', 'saved');

  if (householdId) {
    query = query.eq('household_id', householdId);
  } else {
    query = query.eq('user_id', userId).is('household_id', null);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[save-decisions] saved total', error.message);
    return 0;
  }
  return (data ?? []).reduce((sum, row) => sum + (Number(row.price) || 0), 0);
}
