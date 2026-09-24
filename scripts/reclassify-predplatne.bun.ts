/**
 * One-shot: přepočet category='Předplatné' pro všechny uživatele (service role).
 * Run: bun scripts/reclassify-predplatne.bun.ts
 */
import { createClient } from '@supabase/supabase-js';
import { normalizeAccount } from '../utils/normalizeAccount.ts';
import { normalizeMerchantKey } from '../lib/normalize-merchant-key.ts';
import { lookupMerchantDictionary } from '../lib/merchant-dictionary.ts';
import {
  buildCounterpartyNameByAccount,
  classifyImportRow,
  withBackfilledCounterpartyName,
  type ClassifyImportInput,
} from '../lib/classify-import-category.ts';
import { collectSubscriptionClusterTxIds, type DetectableTx } from '../lib/subscription-detect.ts';
import { lookupMerchantKeywords } from '../lib/merchant-keywords.ts';

const url = process.env.SUPABASE_URL || 'https://jcwbkydaeeqcbdcxgnad.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TxRow = {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  category: string | null;
  description: string | null;
  amount: number;
  date: string | null;
  booking_date: string | null;
  counterparty_account: string | null;
  counterparty_name: string | null;
  is_refund: boolean | null;
};

async function fetchUserRules(userId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('user_category_rules')
    .select('merchant_key, category')
    .eq('user_id', userId)
    .limit(5000);
  const m = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.merchant_key && r.category) m.set(String(r.merchant_key), String(r.category));
  }
  return m;
}

async function fetchCrowd(): Promise<Map<string, string>> {
  const { data } = await supabase.from('merchant_categories').select('merchant_key, category').limit(8000);
  const m = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.merchant_key && r.category) m.set(String(r.merchant_key), String(r.category));
  }
  return m;
}

function looksLikePerson(name: string): boolean {
  const n = name.trim();
  if (n.length < 3) return false;
  if (/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?)\b/i.test(n)) return false;
  return /[A-Za-zÁ-ž]/.test(n);
}

async function reclassifyUser(
  userId: string,
  rows: TxRow[],
  globalCache: Map<string, string>,
): Promise<{ updated: number; predplatneBefore: number; predplatneAfter: number }> {
  const predplatneBefore = rows.filter((r) => r.category === 'Předplatné').length;
  const userRules = await fetchUserRules(userId);
  const namesByAccount = buildCounterpartyNameByAccount(
    rows.map((r) => ({
      counterpartyAccount: r.counterparty_account,
      counterpartyName: r.counterparty_name,
    })),
  );

  const classified = new Map<
    string,
    { category: string; title?: string; description?: string; counterparty_name?: string | null }
  >();

  for (const r of rows) {
    if (r.category === 'Převod') continue;
    if (r.type !== 'expense' && !r.is_refund) continue;

    const merchantKey = normalizeMerchantKey(r.description || r.counterparty_name || '');

    if (merchantKey && userRules.has(merchantKey) && r.category === userRules.get(merchantKey)) {
      continue;
    }

    const dictCat = merchantKey ? lookupMerchantDictionary(merchantKey) : null;
    const isOstatni = !r.category || r.category === 'Ostatní';
    const isFromDictionary = !!dictCat && r.category === dictCat;
    const isPredplatne = r.category === 'Předplatné';
    const isLegacyApple =
      r.category === 'Elektronika' &&
      (merchantKey === 'APPLE' || merchantKey === 'APPLE.COM' || merchantKey === 'APPLE COM');

    if (!isOstatni && !isFromDictionary && !isLegacyApple && !isPredplatne) {
      const acc = normalizeAccount(r.counterparty_account);
      const filledName = acc && !r.counterparty_name ? namesByAccount.get(acc) : null;
      if (filledName && looksLikePerson(filledName) && r.category !== 'Platby lidem') {
        classified.set(r.id, {
          category: 'Platby lidem',
          title: filledName,
          description: filledName,
          counterparty_name: filledName,
        });
      }
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
    input = withBackfilledCounterpartyName(input, namesByAccount);
    const result = classifyImportRow(input, { userRules, globalCache });
    classified.set(r.id, {
      category: result.category,
      title: (result.description || r.description || '').slice(0, 200),
      description: result.description || r.description || '',
      ...(result.counterpartyName || input.counterpartyName
        ? { counterparty_name: result.counterpartyName ?? input.counterpartyName }
        : {}),
    });
  }

  const detectable: DetectableTx[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    amount: r.amount,
    title: r.description ?? undefined,
    description: r.description ?? undefined,
    category: r.category ?? undefined,
    date: r.date || r.booking_date || '1970-01-01',
    bookingDate: r.booking_date,
    counterpartyAccount: r.counterparty_account,
    counterpartyName: r.counterparty_name,
  }));
  const clusterIds = collectSubscriptionClusterTxIds(detectable);

  for (const id of clusterIds) {
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    const mk = normalizeMerchantKey(row.description || row.counterparty_name || '');
    if (mk && userRules.has(mk) && userRules.get(mk) !== 'Předplatné') continue;
    const prev = classified.get(id);
    classified.set(id, {
      ...(prev ?? {}),
      category: 'Předplatné',
      title: prev?.title ?? (row.description || undefined),
      description: prev?.description ?? (row.description || undefined),
    });
  }

  let updated = 0;
  for (const [id, next] of classified) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    const sameCategory = next.category === r.category;
    const sameName =
      next.counterparty_name == null || next.counterparty_name === r.counterparty_name;
    const sameDesc = next.description == null || next.description === r.description;
    if (sameCategory && sameName && sameDesc) continue;
    const { error } = await supabase
      .from('transactions')
      .update({
        category: next.category,
        ...(next.description != null ? { description: next.description } : {}),
        ...(next.counterparty_name != null ? { counterparty_name: next.counterparty_name } : {}),
      })
      .eq('id', id)
      .eq('user_id', userId);
    if (!error) {
      updated += 1;
      r.category = next.category;
    } else {
      console.warn('update fail', id, error.message);
    }
  }

  const predplatneAfter = rows.filter((r) => r.category === 'Předplatné').length;
  return { updated, predplatneBefore, predplatneAfter };
}

async function main() {
  // Sanity: keywords shouldn't force Apple
  if (lookupMerchantKeywords('APPLE.COM/BILL') === 'Předplatné') {
    throw new Error('keywords still map APPLE to Předplatné');
  }

  const { count: beforeAll, error: cErr } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('category', 'Předplatné');
  if (cErr) throw cErr;
  console.log('Předplatné before (all users):', beforeAll);

  // Page through all expense txs (users with Predplatne first)
  const { data: userRows, error: uErr } = await supabase
    .from('transactions')
    .select('user_id')
    .eq('category', 'Předplatné')
    .limit(8000);
  if (uErr) throw uErr;
  const userIds = [...new Set((userRows ?? []).map((r) => r.user_id).filter(Boolean))];
  console.log('Users with Předplatné:', userIds.length);

  const globalCache = await fetchCrowd();
  let totalUpdated = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const userId of userIds) {
    const all: TxRow[] = [];
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, user_id, type, category, description, amount, date, booking_date, counterparty_account, counterparty_name, is_refund',
        )
        .eq('user_id', userId)
        .range(from, from + page - 1);
      if (error) {
        console.warn('fetch user fail', userId, error.message);
        break;
      }
      const chunk = (data ?? []) as TxRow[];
      all.push(...chunk);
      if (chunk.length < page) break;
      from += page;
    }
    if (!all.length) continue;
    console.log('user txs', userId.slice(0, 8), all.length);
    const result = await reclassifyUser(userId, all, globalCache);
    totalUpdated += result.updated;
    totalBefore += result.predplatneBefore;
    totalAfter += result.predplatneAfter;
    console.log('user', userId.slice(0, 8), result);
  }

  const { count: afterAll } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('category', 'Předplatné');

  console.log('---');
  console.log('Updated rows:', totalUpdated);
  console.log('Předplatné sum before (per-user):', totalBefore);
  console.log('Předplatné sum after (per-user):', totalAfter);
  console.log('Předplatné after (DB count):', afterAll);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
