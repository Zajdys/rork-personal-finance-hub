/**
 * Přepočet kategorií existujících importovaných transakcí (bez AI).
 *
 * 1) user_category_rules — vždy aplikuj (category_source → user)
 * 2) Ostatní / dictionary / keyword / crowd / import — classifyImportRow
 * NESMÍ: Převod, Splátky úvěrů
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapClassifySourceToCategorySource } from '@/lib/categorization';
import { supabase as defaultSupabase } from '@/lib/supabase';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import { lookupMerchantDictionary } from '@/lib/merchant-dictionary';
import {
  buildCounterpartyNameByAccount,
  classifyImportRow,
  withBackfilledCounterpartyName,
  type ClassifyImportInput,
} from '@/lib/classify-import-category';
import { fetchUserCategoryRules } from '@/lib/user-category-rules';
import { fetchMerchantCategoriesMap } from '@/lib/merchant-categories';
import { LOAN_PAYMENT_CATEGORY } from '@/lib/loan-payment-detect';
import { isSubscriptionFeeLabel } from '@/lib/subscription-detect';

export type ReclassifyResult = {
  scanned: number;
  updated: number;
  /** Počet řádků, kde se změnila právě `category` (ne jen source/merchant_key). */
  categoryChanged: number;
  nameBackfilled: number;
  predplatneBefore: number;
  predplatneAfter: number;
  /** Lokální store: aplikuj přes updateTransaction */
  localPatches: Array<{
    id: string;
    category: string;
    title?: string;
    description?: string;
    counterpartyName?: string;
    categorySource?: string;
  }>;
};

type TxRow = {
  id: string;
  type: 'income' | 'expense';
  category: string | null;
  category_source: string | null;
  merchant_key: string | null;
  description: string | null;
  amount: number;
  date?: string | null;
  booking_date?: string | null;
  counterparty_account: string | null;
  counterparty_name: string | null;
  is_refund?: boolean | null;
};

const RECLASSIFIABLE_SOURCES = new Set([
  'dictionary',
  'keyword',
  'crowd',
  'import',
]);

function mayReclassify(r: TxRow): boolean {
  if (r.category === 'Převod') return false;
  if (r.category === LOAN_PAYMENT_CATEGORY) return false;
  if (r.category === 'Bankovní poplatky') return false;
  if (r.category_source === 'user') return false;
  if (r.category_source === 'transfer') return false;
  const label = (r.description || r.counterparty_name || '').trim();
  if (isSubscriptionFeeLabel(label)) return false;
  if (r.category === 'Ostatní' || !r.category) return true;
  if (r.category_source && RECLASSIFIABLE_SOURCES.has(r.category_source)) return true;
  // Legacy bez category_source: jen Ostatní (už pokryto) nebo dict shoda níže
  return false;
}

export async function reclassifyExistingImportTransactions(
  userId: string,
  client: SupabaseClient = defaultSupabase,
): Promise<ReclassifyResult> {
  const empty: ReclassifyResult = {
    scanned: 0,
    updated: 0,
    categoryChanged: 0,
    nameBackfilled: 0,
    predplatneBefore: 0,
    predplatneAfter: 0,
    localPatches: [],
  };
  if (!userId) return empty;

  const rows: TxRow[] = [];
  {
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await client
        .from('transactions')
        .select(
          'id, type, category, category_source, merchant_key, description, amount, date, booking_date, counterparty_account, counterparty_name, is_refund',
        )
        .eq('user_id', userId)
        .range(from, from + page - 1);
      if (error) {
        console.warn('[reclassify] fetch failed', error.message);
        return empty;
      }
      const chunk = (data ?? []) as TxRow[];
      rows.push(...chunk);
      if (chunk.length < page) break;
      from += page;
    }
  }

  if (!rows.length) {
    return empty;
  }
  const predplatneBefore = rows.filter((r) => r.category === 'Předplatné').length;

  const [userRules, globalCache] = await Promise.all([
    fetchUserCategoryRules(userId, client),
    fetchMerchantCategoriesMap(client),
  ]);

  const namesByAccount = buildCounterpartyNameByAccount(
    rows.map((r) => ({
      counterpartyAccount: r.counterparty_account,
      counterpartyName: r.counterparty_name,
    })),
  );

  const classified = new Map<
    string,
    {
      category: string;
      category_source: string;
      merchant_key?: string | null;
      title?: string;
      description?: string;
      counterparty_name?: string | null;
    }
  >();
  let nameBackfilled = 0;

  for (const r of rows) {
    if (r.category === 'Převod') continue;
    if (r.category === LOAN_PAYMENT_CATEGORY) continue;
    if (r.type !== 'expense' && !r.is_refund) continue;

    const label = (r.description || r.counterparty_name || '').trim();
    const merchantKey =
      (r.merchant_key && r.merchant_key.trim()) || normalizeMerchantKey(label) || null;

    // 1) User rules — vždy aplikuj (i když category_source byl dictionary)
    if (merchantKey && userRules.has(merchantKey)) {
      const ruled = userRules.get(merchantKey)!;
      if (
        r.category !== ruled ||
        r.category_source !== 'user' ||
        r.merchant_key !== merchantKey
      ) {
        classified.set(r.id, {
          category: ruled,
          category_source: 'user',
          merchant_key: merchantKey,
          title: (r.description || '').slice(0, 200),
          description: r.description || '',
        });
      }
      continue;
    }

    if (!mayReclassify(r)) continue;

    const dictCat = merchantKey ? lookupMerchantDictionary(merchantKey) : null;
    const isOstatni = !r.category || r.category === 'Ostatní';
    const isFromDictionary =
      r.category_source === 'dictionary' ||
      (!!dictCat && r.category === dictCat);
    const isFromKeywordOrCrowdOrImport =
      r.category_source === 'keyword' ||
      r.category_source === 'crowd' ||
      r.category_source === 'import';

    if (!isOstatni && !isFromDictionary && !isFromKeywordOrCrowdOrImport) {
      continue;
    }

    let input: ClassifyImportInput = {
      type: r.type,
      category: r.category === 'Předplatné' ? 'Ostatní' : r.category,
      description: r.description,
      title: r.description,
      amount: r.amount,
      counterpartyAccount: r.counterparty_account,
      counterpartyName: r.counterparty_name,
      merchantRaw: r.description,
      isRefund: !!r.is_refund,
    };
    const beforeName = input.counterpartyName;
    input = withBackfilledCounterpartyName(input, namesByAccount);
    if (!beforeName && input.counterpartyName) nameBackfilled += 1;

    const result = classifyImportRow(input, { userRules, globalCache });
    if (result.category === 'Převod') continue;

    const nextKey = result.merchantKey || merchantKey;
    classified.set(r.id, {
      category: result.category,
      category_source: mapClassifySourceToCategorySource(result.source),
      merchant_key: nextKey,
      title: (result.description || r.description || '').slice(0, 200),
      description: result.description || r.description || '',
      ...(result.counterpartyName || input.counterpartyName
        ? { counterparty_name: result.counterpartyName ?? input.counterpartyName }
        : {}),
    });
  }

  const updates: Array<{
    id: string;
    category: string;
    category_source: string;
    categoryChanged: boolean;
    merchant_key?: string | null;
    title?: string;
    description?: string;
    counterparty_name?: string | null;
  }> = [];

  for (const [id, next] of classified) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    const categoryChanged = next.category !== r.category;
    const changed =
      categoryChanged ||
      next.category_source !== r.category_source ||
      (next.merchant_key != null && next.merchant_key !== r.merchant_key) ||
      (next.counterparty_name != null && next.counterparty_name !== r.counterparty_name) ||
      (next.description != null && next.description !== r.description);
    if (!changed) continue;
    updates.push({
      id,
      category: next.category,
      category_source: next.category_source,
      categoryChanged,
      ...(next.merchant_key !== undefined ? { merchant_key: next.merchant_key } : {}),
      ...(next.title != null ? { title: next.title } : {}),
      ...(next.description != null ? { description: next.description } : {}),
      ...(next.counterparty_name != null ? { counterparty_name: next.counterparty_name } : {}),
    });
  }

  let updated = 0;
  let categoryChanged = 0;
  const localPatches: ReclassifyResult['localPatches'] = [];
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    await Promise.all(
      chunk.map(async (u) => {
        const { error: updErr } = await client
          .from('transactions')
          .update({
            category: u.category,
            category_source: u.category_source,
            ...(u.merchant_key !== undefined ? { merchant_key: u.merchant_key } : {}),
            ...(u.description != null ? { description: u.description } : {}),
            ...(u.counterparty_name != null ? { counterparty_name: u.counterparty_name } : {}),
          })
          .eq('id', u.id)
          .eq('user_id', userId);
        if (!updErr) {
          updated += 1;
          if (u.categoryChanged) categoryChanged += 1;
          localPatches.push({
            id: u.id,
            category: u.category,
            categorySource: u.category_source,
            ...(u.title != null ? { title: u.title } : {}),
            ...(u.description != null ? { description: u.description } : {}),
            ...(u.counterparty_name != null ? { counterpartyName: u.counterparty_name } : {}),
          });
        } else console.warn('[reclassify] update failed', u.id, updErr.message);
      }),
    );
  }

  let predplatneAfter = 0;
  for (const r of rows) {
    const patch = localPatches.find((p) => p.id === r.id);
    const cat = patch?.category ?? r.category;
    if (cat === 'Předplatné') predplatneAfter += 1;
  }

  console.log('[reclassify] done', {
    scanned: rows.length,
    updated,
    categoryChanged,
    nameBackfilled,
    predplatneBefore,
    predplatneAfter,
  });
  return {
    scanned: rows.length,
    updated,
    categoryChanged,
    nameBackfilled,
    predplatneBefore,
    predplatneAfter,
    localPatches,
  };
}
