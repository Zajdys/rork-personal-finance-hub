import { supabase } from '@/lib/supabase';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';

export type UserCategoryRulesMap = Map<string, string>;

export async function fetchUserCategoryRules(userId: string): Promise<UserCategoryRulesMap> {
  const map: UserCategoryRulesMap = new Map();
  const { data, error } = await supabase
    .from('user_category_rules')
    .select('merchant_key, category')
    .eq('user_id', userId);

  if (error) {
    // Fallback na legacy tabulku, dokud migrace neproběhne všude
    console.warn('[user_category_rules] fetch failed, trying legacy:', error.message);
    const legacy = await supabase
      .from('user_merchant_categories')
      .select('merchant_key, category_id')
      .eq('user_id', userId);
    if (!legacy.error) {
      for (const row of legacy.data ?? []) {
        if (!row.merchant_key || !row.category_id) continue;
        const key = normalizeMerchantKey(row.merchant_key) || row.merchant_key;
        map.set(key, row.category_id);
      }
    }
    return map;
  }

  for (const row of data ?? []) {
    if (!row.merchant_key || !row.category) continue;
    // Defenzivně renormalizuj (legacy klíče před migrací v4)
    const key = normalizeMerchantKey(row.merchant_key) || row.merchant_key;
    map.set(key, row.category);
  }
  return map;
}

export async function upsertUserCategoryRule(
  userId: string,
  merchantDescriptionOrKey: string,
  category: string,
): Promise<{ merchantKey: string; error: Error | null }> {
  const merchantKey = normalizeMerchantKey(merchantDescriptionOrKey);
  if (!merchantKey || !category.trim()) {
    return { merchantKey: '', error: null };
  }

  const { error } = await supabase.from('user_category_rules').upsert(
    {
      user_id: userId,
      merchant_key: merchantKey,
      category: category.trim(),
    },
    { onConflict: 'user_id,merchant_key' },
  );

  // Mirror do legacy tabulky (zpětná kompatibilita)
  void supabase.from('user_merchant_categories').upsert(
    {
      user_id: userId,
      merchant_key: merchantKey,
      category_id: category.trim(),
    },
    { onConflict: 'user_id,merchant_key' },
  );

  return { merchantKey, error: error ? new Error(error.message) : null };
}

/** Počet transakcí uživatele se stejným merchant_key. */
export async function countTransactionsForMerchantKey(
  userId: string,
  merchantKey: string,
  excludeTransactionId?: string,
): Promise<number> {
  if (!merchantKey) return 0;

  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('merchant_key', merchantKey)
    .neq('category', 'Převod');

  if (!error && typeof count === 'number') {
    if (!excludeTransactionId) return count;
    // count includes exclude — fallback na list
  }

  // Fallback: starší data bez merchant_key sloupce / hodnot
  const { data, error: listErr } = await supabase
    .from('transactions')
    .select('id, title, description, merchant_key, category')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .neq('category', 'Převod')
    .limit(2000);

  if (listErr || !data) return 0;
  let n = 0;
  for (const row of data) {
    if (excludeTransactionId && row.id === excludeTransactionId) continue;
    const key =
      (row.merchant_key && String(row.merchant_key).trim()) ||
      normalizeMerchantKey([row.title, row.description].filter(Boolean).join(' '));
    if (key === merchantKey) n += 1;
  }
  return n;
}

/** Přepočítá kategorii u všech expense tx se stejným merchant_key. */
export async function bulkApplyCategoryForMerchantKey(
  userId: string,
  merchantKey: string,
  category: string,
  excludeTransactionId?: string,
): Promise<{ updatedIds: string[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, title, description, merchant_key, category')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .neq('category', 'Převod')
    .limit(2000);

  if (error) return { updatedIds: [], error: new Error(error.message) };

  const ids: string[] = [];
  for (const row of data ?? []) {
    if (excludeTransactionId && row.id === excludeTransactionId) continue;
    if (row.category === category) continue;
    const key =
      (row.merchant_key && String(row.merchant_key).trim()) ||
      normalizeMerchantKey([row.title, row.description].filter(Boolean).join(' '));
    if (key === merchantKey) ids.push(row.id);
  }

  if (!ids.length) return { updatedIds: [], error: null };

  const { error: updErr } = await supabase
    .from('transactions')
    .update({ category, category_source: 'user', merchant_key: merchantKey })
    .eq('user_id', userId)
    .in('id', ids);

  return { updatedIds: ids, error: updErr ? new Error(updErr.message) : null };
}
