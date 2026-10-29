import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import { normalizeCategory, type NormalizedCategory } from '@/lib/category-normalize';

export type UserCategoryRulesMap = Map<string, NormalizedCategory>;

export async function fetchUserCategoryRules(
  userId: string,
  client: SupabaseClient = supabase,
): Promise<UserCategoryRulesMap> {
  const map: UserCategoryRulesMap = new Map();
  const { data, error } = await client
    .from('user_category_rules')
    .select('merchant_key, category, subcategory')
    .eq('user_id', userId);

  if (error) {
    // Fallback bez subcategory sloupce / legacy tabulka
    console.warn('[user_category_rules] fetch failed, trying legacy:', error.message);
    const retry = await client
      .from('user_category_rules')
      .select('merchant_key, category')
      .eq('user_id', userId);
    if (!retry.error) {
      for (const row of retry.data ?? []) {
        if (!row.merchant_key || !row.category) continue;
        const key = normalizeMerchantKey(row.merchant_key) || row.merchant_key;
        map.set(key, normalizeCategory(row.category));
      }
      return map;
    }
    const legacy = await client
      .from('user_merchant_categories')
      .select('merchant_key, category_id')
      .eq('user_id', userId);
    if (!legacy.error) {
      for (const row of legacy.data ?? []) {
        if (!row.merchant_key || !row.category_id) continue;
        const key = normalizeMerchantKey(row.merchant_key) || row.merchant_key;
        map.set(key, normalizeCategory(row.category_id));
      }
    }
    return map;
  }

  for (const row of data ?? []) {
    if (!row.merchant_key || !row.category) continue;
    const key = normalizeMerchantKey(row.merchant_key) || row.merchant_key;
    map.set(
      key,
      normalizeCategory(
        row.category,
        typeof row.subcategory === 'string' ? row.subcategory : null,
      ),
    );
  }
  return map;
}

export async function upsertUserCategoryRule(
  userId: string,
  merchantDescriptionOrKey: string,
  category: string,
  subcategory?: string | null,
): Promise<{ merchantKey: string; error: Error | null }> {
  const merchantKey = normalizeMerchantKey(merchantDescriptionOrKey);
  if (!merchantKey || !category.trim()) {
    return { merchantKey: '', error: null };
  }

  const n = normalizeCategory(category, subcategory);
  const payload: Record<string, unknown> = {
    user_id: userId,
    merchant_key: merchantKey,
    category: n.category,
    subcategory: n.subcategory,
  };

  let { error } = await supabase
    .from('user_category_rules')
    .upsert(payload, { onConflict: 'user_id,merchant_key' });

  if (error && /subcategory/i.test(error.message)) {
    // Sloupec ještě nemusí existovat všude
    const retry = await supabase.from('user_category_rules').upsert(
      {
        user_id: userId,
        merchant_key: merchantKey,
        category: n.category,
      },
      { onConflict: 'user_id,merchant_key' },
    );
    error = retry.error;
  }

  // Mirror do legacy tabulky (zpětná kompatibilita)
  void supabase.from('user_merchant_categories').upsert(
    {
      user_id: userId,
      merchant_key: merchantKey,
      category_id: n.category,
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
  }

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
  subcategory?: string | null,
): Promise<{ updatedIds: string[]; error: Error | null }> {
  const n = normalizeCategory(category, subcategory);
  const { data, error } = await supabase
    .from('transactions')
    .select('id, title, description, merchant_key, category, subcategory')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .neq('category', 'Převod')
    .limit(2000);

  if (error) return { updatedIds: [], error: new Error(error.message) };

  const ids: string[] = [];
  for (const row of data ?? []) {
    if (excludeTransactionId && row.id === excludeTransactionId) continue;
    if (row.category === n.category && (row.subcategory ?? null) === n.subcategory) continue;
    const key =
      (row.merchant_key && String(row.merchant_key).trim()) ||
      normalizeMerchantKey([row.title, row.description].filter(Boolean).join(' '));
    if (key === merchantKey) ids.push(row.id);
  }

  if (!ids.length) return { updatedIds: [], error: null };

  let { error: updErr } = await supabase
    .from('transactions')
    .update({
      category: n.category,
      subcategory: n.subcategory,
      category_source: 'user',
      merchant_key: merchantKey,
    })
    .eq('user_id', userId)
    .in('id', ids);

  if (updErr && /subcategory/i.test(updErr.message)) {
    const retry = await supabase
      .from('transactions')
      .update({
        category: n.category,
        category_source: 'user',
        merchant_key: merchantKey,
      })
      .eq('user_id', userId)
      .in('id', ids);
    updErr = retry.error;
  }

  return { updatedIds: ids, error: updErr ? new Error(updErr.message) : null };
}
