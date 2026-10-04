import { supabase } from '@/lib/supabase';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';

export type UserMerchantCategoryMap = Map<string, string>;

export async function fetchUserMerchantCategoryMap(userId: string): Promise<UserMerchantCategoryMap> {
  const map: UserMerchantCategoryMap = new Map();

  const { data, error } = await supabase
    .from('user_merchant_categories')
    .select('merchant_key, category_id')
    .eq('user_id', userId);

  if (error) {
    console.warn('[user_merchant_categories] fetch failed:', error.message);
    return map;
  }

  for (const row of data ?? []) {
    if (row.merchant_key && row.category_id) {
      map.set(row.merchant_key, row.category_id);
    }
  }

  return map;
}

export async function upsertUserMerchantCategory(
  userId: string,
  merchantDescription: string,
  categoryId: string,
): Promise<{ error: Error | null }> {
  const merchantKey = normalizeMerchantKey(merchantDescription);
  if (!merchantKey || !categoryId.trim()) {
    return { error: null };
  }

  const { error } = await supabase.from('user_merchant_categories').upsert(
    {
      user_id: userId,
      merchant_key: merchantKey,
      category_id: categoryId.trim(),
    },
    { onConflict: 'user_id,merchant_key' },
  );

  return { error: error ? new Error(error.message) : null };
}
