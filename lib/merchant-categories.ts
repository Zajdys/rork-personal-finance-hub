import { supabase } from '@/lib/supabase';

export type MerchantCategoriesMap = Map<string, string>;

/** Globální crowd cache merchant_key → category (jen source='crowd'). */
export async function fetchMerchantCategoriesMap(): Promise<MerchantCategoriesMap> {
  const map: MerchantCategoriesMap = new Map();
  const { data, error } = await supabase
    .from('merchant_categories')
    .select('merchant_key, category')
    .eq('source', 'crowd')
    .limit(10000);

  if (error) {
    console.warn('[merchant_categories] fetch failed:', error.message);
    return map;
  }
  for (const row of data ?? []) {
    if (row.merchant_key && row.category) map.set(row.merchant_key, row.category);
  }
  return map;
}
