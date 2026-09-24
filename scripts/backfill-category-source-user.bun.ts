/**
 * Opravný backfill: category_source = 'user' pro transakce shodné s user_category_rules.
 * Spustit PŘED přepočtem na CATEGORIZATION_VERSION 3.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/backfill-category-source-user.bun.ts
 */
import { createClient } from '@supabase/supabase-js';
import { normalizeMerchantKey } from '../lib/normalize-merchant-key.ts';

const url = process.env.SUPABASE_URL || 'https://jcwbkydaeeqcbdcxgnad.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shoda popisu transakce s merchant_key pravidla (vč. legacy ne-normalizovaných klíčů). */
export function matchesRule(description: string | null, merchantKey: string): boolean {
  const desc = (description || '').trim();
  if (!desc || !merchantKey) return false;

  const descNorm = normalizeMerchantKey(desc);
  const ruleNorm = normalizeMerchantKey(merchantKey);
  if (descNorm && ruleNorm && descNorm === ruleNorm) return true;

  const d = fold(desc);
  const r = fold(merchantKey);
  if (!r) return false;
  if (d === r) return true;
  if (d.startsWith(`${r} `) || d.startsWith(`${r};`) || d.startsWith(`${r},`)) return true;

  if (r.length >= 4) {
    const tokens = d.split(/[^a-z0-9.]+/).filter(Boolean);
    const ruleTokens = r.split(/[^a-z0-9.]+/).filter(Boolean);
    if (ruleTokens.length === 1) {
      return tokens.some((t) => t === ruleTokens[0]);
    }
    // Multi-word legacy klíč — popis obsahuje celý klíč
    if (d.includes(r)) return true;
  }
  return false;
}

type Rule = { user_id: string; merchant_key: string; category: string };
type Tx = {
  id: string;
  description: string | null;
  category: string;
  category_source: string | null;
};

async function fetchAllRules(): Promise<Rule[]> {
  const all: Rule[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('user_category_rules')
      .select('user_id,merchant_key,category')
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as Rule[]));
    if ((data ?? []).length < 1000) break;
    from += 1000;
  }
  return all;
}

async function fetchUserTx(userId: string): Promise<Tx[]> {
  const all: Tx[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,description,category,category_source')
      .eq('user_id', userId)
      .neq('category', 'Převod')
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as Tx[]));
    if ((data ?? []).length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const rules = await fetchAllRules();
  console.log('rules', rules.length);

  const byUser = new Map<string, Rule[]>();
  for (const r of rules) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  let totalUpdated = 0;
  const perUser: Array<{ userId: string; n: number; samples: string[] }> = [];

  for (const [userId, userRules] of byUser) {
    const txs = await fetchUserTx(userId);
    const ids: string[] = [];
    const samples: string[] = [];

    for (const tx of txs) {
      if (tx.category_source === 'user') continue;
      for (const rule of userRules) {
        if (tx.category !== rule.category) continue;
        if (!matchesRule(tx.description, rule.merchant_key)) continue;
        ids.push(tx.id);
        if (samples.length < 10) {
          samples.push(
            `${(tx.description || '').slice(0, 50)} | rule=${rule.merchant_key} | ${rule.category}`,
          );
        }
        break;
      }
    }

    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const { error } = await supabase
        .from('transactions')
        .update({ category_source: 'user' })
        .in('id', chunk)
        .eq('user_id', userId);
      if (error) throw error;
    }

    totalUpdated += unique.length;
    perUser.push({ userId, n: unique.length, samples });
  }

  console.log(JSON.stringify({ totalUpdated, perUser }, null, 2));

  const TARGET = '7ce943bd-eb89-4c95-9022-39a08901320a';
  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', TARGET)
    .eq('category_source', 'user');
  const { data: ver } = await supabase
    .from('user_profiles')
    .select('categories_version')
    .eq('user_id', TARGET)
    .maybeSingle();
  console.log({
    targetUserSourceCount: count,
    categories_version: ver?.categories_version,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
