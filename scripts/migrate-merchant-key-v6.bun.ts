/**
 * Migrace merchant_key v6:
 * 1) renormalizace user_category_rules + sloučení duplicit
 * 2) backfill transactions.merchant_key (ořez Air Bank adres)
 * 3) aplikace user rules + bump categories_version na 6
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/migrate-merchant-key-v6.bun.ts
 */
import { createClient } from '@supabase/supabase-js';
import { normalizeMerchantKey } from '../lib/normalize-merchant-key.ts';

/** Musí odpovídat lib/categorization.ts CATEGORIZATION_VERSION */
const CATEGORIZATION_VERSION = 6;

const TARGET_USER = '7ce943bd-eb89-4c95-9022-39a08901320a';
const url = process.env.SUPABASE_URL || 'https://jcwbkydaeeqcbdcxgnad.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type RuleRow = {
  id: string;
  user_id: string;
  merchant_key: string;
  category: string;
  updated_at?: string | null;
};

/** Token-prefix: „RADKA“ je prefix „RADKA STEFLOVA“. */
function isTokenPrefix(shorter: string, longer: string): boolean {
  if (!shorter || !longer || shorter === longer) return false;
  return longer.startsWith(`${shorter} `);
}

async function migrateRules(): Promise<{ before: number; after: number; targetBefore: number; targetAfter: number }> {
  const { data: rules, error } = await supabase
    .from('user_category_rules')
    .select('id,user_id,merchant_key,category,updated_at');
  if (error) throw error;
  const all = (rules ?? []) as RuleRow[];
  const before = all.length;
  const targetBefore = all.filter((r) => r.user_id === TARGET_USER).length;

  const byUser = new Map<string, RuleRow[]>();
  for (const r of all) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  let after = 0;

  for (const [userId, userRules] of byUser) {
    type Cand = { key: string; category: string; ids: string[]; updated: string };
    const cands = new Map<string, Cand>();

    for (const r of userRules) {
      const key = normalizeMerchantKey(r.merchant_key);
      if (!key) {
        await supabase.from('user_category_rules').delete().eq('id', r.id);
        continue;
      }
      const updated = r.updated_at || '';
      const existing = cands.get(key);
      if (!existing) {
        cands.set(key, { key, category: r.category, ids: [r.id], updated });
      } else {
        existing.ids.push(r.id);
        if (updated > existing.updated) {
          existing.category = r.category;
          existing.updated = updated;
        }
      }
    }

    // Slouč token-prefix duplicity (RADKA ⊂ RADKA STEFLOVA) → nech delší
    const keys = [...cands.keys()].sort((a, b) => b.length - a.length);
    const drop = new Set<string>();
    for (let i = 0; i < keys.length; i++) {
      const longer = keys[i]!;
      if (drop.has(longer)) continue;
      for (let j = i + 1; j < keys.length; j++) {
        const shorter = keys[j]!;
        if (drop.has(shorter)) continue;
        if (isTokenPrefix(shorter, longer)) {
          drop.add(shorter);
          const shortCand = cands.get(shorter)!;
          const longCand = cands.get(longer)!;
          longCand.ids.push(...shortCand.ids);
          if (shortCand.updated > longCand.updated) {
            longCand.category = shortCand.category;
            longCand.updated = shortCand.updated;
          }
        }
      }
    }

    for (const key of drop) cands.delete(key);

    const allIds = userRules.map((r) => r.id);
    if (allIds.length) {
      const { error: delErr } = await supabase
        .from('user_category_rules')
        .delete()
        .eq('user_id', userId)
        .in('id', allIds);
      if (delErr) throw delErr;
    }

    for (const cand of cands.values()) {
      const { error: upErr } = await supabase.from('user_category_rules').upsert(
        {
          user_id: userId,
          merchant_key: cand.key,
          category: cand.category,
        },
        { onConflict: 'user_id,merchant_key' },
      );
      if (upErr) throw upErr;
      after += 1;

      void supabase.from('user_merchant_categories').upsert(
        {
          user_id: userId,
          merchant_key: cand.key,
          category_id: cand.category,
        },
        { onConflict: 'user_id,merchant_key' },
      );
    }
  }

  const { count: targetAfterCount } = await supabase
    .from('user_category_rules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER);

  return {
    before,
    after,
    targetBefore,
    targetAfter: targetAfterCount ?? 0,
  };
}

async function backfillMerchantKeys(): Promise<number> {
  let updated = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,description,counterparty_name,merchant_key')
      .range(from, from + 999);
    if (error) throw error;
    const chunk = data ?? [];
    if (!chunk.length) break;

    await Promise.all(
      chunk.map(async (row) => {
        const fromDesc = normalizeMerchantKey(row.description || row.counterparty_name || '');
        const fromKey = normalizeMerchantKey(row.merchant_key || '');
        const next = fromDesc || fromKey || null;
        if ((row.merchant_key || null) === next) return;
        const { error: uErr } = await supabase
          .from('transactions')
          .update({ merchant_key: next })
          .eq('id', row.id);
        if (!uErr) updated += 1;
      }),
    );

    if (chunk.length < 1000) break;
    from += 1000;
  }
  return updated;
}

/** Aplikuj user rules rovností merchant_key (vč. přepisu dictionary/keyword). */
async function applyUserRules(userId: string): Promise<number> {
  const { data: rules, error: rErr } = await supabase
    .from('user_category_rules')
    .select('merchant_key,category')
    .eq('user_id', userId);
  if (rErr) throw rErr;
  const ruleMap = new Map<string, string>();
  for (const r of rules ?? []) {
    if (r.merchant_key && r.category) ruleMap.set(String(r.merchant_key), String(r.category));
  }
  if (!ruleMap.size) return 0;

  let updated = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,description,counterparty_name,merchant_key,category,category_source,type')
      .eq('user_id', userId)
      .range(from, from + 999);
    if (error) throw error;
    const chunk = data ?? [];
    if (!chunk.length) break;

    const patches: Array<{ id: string; category: string; merchant_key: string }> = [];
    for (const row of chunk) {
      if (row.category === 'Převod') continue;
      if (row.type !== 'expense') continue;
      const mk =
        (row.merchant_key && String(row.merchant_key).trim()) ||
        normalizeMerchantKey(row.description || row.counterparty_name || '') ||
        '';
      if (!mk || !ruleMap.has(mk)) continue;
      const cat = ruleMap.get(mk)!;
      if (row.category === cat && row.category_source === 'user' && row.merchant_key === mk) {
        continue;
      }
      patches.push({ id: row.id, category: cat, merchant_key: mk });
    }

    for (let i = 0; i < patches.length; i += 50) {
      const batch = patches.slice(i, i + 50);
      await Promise.all(
        batch.map(async (p) => {
          const { error: uErr } = await supabase
            .from('transactions')
            .update({
              category: p.category,
              category_source: 'user',
              merchant_key: p.merchant_key,
            })
            .eq('id', p.id)
            .eq('user_id', userId);
          if (!uErr) updated += 1;
        }),
      );
    }

    if (chunk.length < 1000) break;
    from += 1000;
  }
  return updated;
}

async function main() {
  console.log('CATEGORIZATION_VERSION in code:', CATEGORIZATION_VERSION);

  console.log('norm BOLT spaced →', normalizeMerchantKey('BOLT O 2510021428'));
  console.log('norm BOLT glued →', normalizeMerchantKey('BOLT.EUO2509121122'));
  console.log('norm BOLT FOOD →', normalizeMerchantKey('BOLT FOOD'));
  console.log('norm UBER →', normalizeMerchantKey('UBER TRIP 123456789'));

  const { before, after, targetBefore, targetAfter } = await migrateRules();
  console.log('rules ALL before:', before, 'after:', after);
  console.log('rules TARGET before:', targetBefore, 'after:', targetAfter);

  const mkUpdated = await backfillMerchantKeys();
  console.log('merchant_key backfilled rows:', mkUpdated);

  const { data: ruleUsers } = await supabase.from('user_category_rules').select('user_id');
  const userIds = [...new Set((ruleUsers ?? []).map((r) => r.user_id as string))];
  if (!userIds.includes(TARGET_USER)) userIds.push(TARGET_USER);

  for (const uid of userIds) {
    const n = await applyUserRules(uid);
    console.log('applyUserRules', uid.slice(0, 8), n);

    await supabase.from('user_profiles').upsert(
      {
        id: uid,
        user_id: uid,
        categories_version: CATEGORIZATION_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  }

  const { data: bolt } = await supabase
    .from('transactions')
    .select('description,category,category_source,merchant_key,source')
    .eq('user_id', TARGET_USER)
    .or('merchant_key.ilike.%BOLT%,description.ilike.%BOLT%');

  const boltKeys = [...new Set((bolt ?? []).map((h) => h.merchant_key).filter(Boolean))];
  console.log('BOLT merchant_keys:', boltKeys);
  console.log(
    'BOLT sample:',
    (bolt ?? []).slice(0, 12).map((h) => ({
      mk: h.merchant_key,
      c: h.category,
      d: (h.description || '').slice(0, 45),
    })),
  );

  const { data: ver } = await supabase
    .from('user_profiles')
    .select('categories_version')
    .eq('user_id', TARGET_USER)
    .maybeSingle();
  console.log('categories_version:', ver?.categories_version);
  console.log('SUMMARY', {
    rulesBefore: before,
    rulesAfter: after,
    mkUpdated,
    boltRows: bolt?.length ?? 0,
    boltDistinctKeys: boltKeys,
    boltAllUnified: boltKeys.length <= 1 && (boltKeys[0] === 'BOLT' || boltKeys.length === 0),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
