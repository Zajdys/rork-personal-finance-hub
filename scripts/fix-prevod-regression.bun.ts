/**
 * Oprava regrese: false Převod (účet-only), ATM vklady jako Výběr, Původní částka.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/fix-prevod-regression.bun.ts
 */
import { createClient } from '@supabase/supabase-js';
import { normalizeAccount } from '../utils/normalizeAccount.ts';
import { normalizeMerchantKey } from '../lib/normalize-merchant-key.ts';
import {
  buildCounterpartyNameByAccount,
  classifyImportRow,
  withBackfilledCounterpartyName,
  type ClassifyImportInput,
} from '../lib/classify-import-category.ts';
import { isLoanPaymentText, LOAN_PAYMENT_CATEGORY } from '../lib/loan-payment-detect.ts';

const USER_ID = '7ce943bd-eb89-4c95-9022-39a08901320a';
const url = process.env.SUPABASE_URL || 'https://jcwbkydaeeqcbdcxgnad.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Vlastní účty: legitimní spořák/mezi-účty mínus účty, které user označil jako cizí
 * (363468155/0300, 4059123003/0800, …). Převod smí jen při shodě s tímto setem.
 */
const OWNER = new Set(
  ['767628004/5500', '767628012/5500', '110125955/0100', '283199805/0600']
    .map((a) => normalizeAccount(a))
    .filter((a): a is string => !!a),
);

type TxRow = {
  id: string;
  type: 'income' | 'expense';
  category: string | null;
  description: string | null;
  amount: number;
  date: string | null;
  booking_date: string | null;
  counterparty_account: string | null;
  counterparty_name: string | null;
  is_refund: boolean | null;
  source: string | null;
};

async function fetchAll(): Promise<TxRow[]> {
  const all: TxRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id,type,category,description,amount,date,booking_date,counterparty_account,counterparty_name,is_refund,source',
      )
      .eq('user_id', USER_ID)
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as TxRow[]));
    if ((data ?? []).length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const { data: rulesRaw } = await supabase
    .from('user_category_rules')
    .select('merchant_key,category')
    .eq('user_id', USER_ID)
    .limit(5000);
  const userRules = new Map<string, string>();
  for (const r of rulesRaw ?? []) {
    if (r.merchant_key && r.category) {
      userRules.set(String(r.merchant_key), String(r.category));
    }
  }

  const rows = await fetchAll();
  console.log('fetched', rows.length);

  const namesByAccount = buildCounterpartyNameByAccount(
    rows.map((r) => ({
      counterpartyAccount: r.counterparty_account,
      counterpartyName: r.counterparty_name,
    })),
  );

  let fixedPuvodni = 0;
  let fixedDeposit = 0;
  let fixedPrevod = 0;
  let keptPrevod = 0;

  // 3) Původní částka → null
  for (const r of rows) {
    const badName = /původní\s+částka/i.test(r.counterparty_name || '');
    const badDesc = /původní\s+částka/i.test(r.description || '');
    if (!badName && !badDesc) continue;
    const patch: Record<string, unknown> = {};
    if (badName) patch.counterparty_name = null;
    if (badDesc) {
      patch.description = r.counterparty_account || 'Bez popisu';
    }
    const { error } = await supabase.from('transactions').update(patch).eq('id', r.id);
    if (!error) {
      if (badName) r.counterparty_name = null;
      if (badDesc) r.description = String(patch.description);
      fixedPuvodni += 1;
    }
  }
  console.log('Původní částka fixed', fixedPuvodni);

  // 2) Výběr hotovosti jako income → Vklad hotovosti (byly to vklady z výpisu)
  for (const r of rows) {
    const isVyberCat = r.category === 'Výběr hotovosti';
    const isVyberDesc = /v[yý]b[eě]r\s+hotovosti/i.test(r.description || '');
    if (r.type === 'income' && (isVyberCat || isVyberDesc)) {
      const { error } = await supabase
        .from('transactions')
        .update({
          category: 'Vklad hotovosti',
          description: 'Vklad hotovosti',
          type: 'income',
        })
        .eq('id', r.id);
      if (!error) {
        r.category = 'Vklad hotovosti';
        r.description = 'Vklad hotovosti';
        fixedDeposit += 1;
      }
    }
    if (r.category === 'Výběr hotovosti' && r.type !== 'expense') {
      const { error } = await supabase
        .from('transactions')
        .update({ type: 'expense' })
        .eq('id', r.id);
      if (!error) r.type = 'expense';
    }
    if (r.category === 'Vklad hotovosti' && r.type !== 'income') {
      const { error } = await supabase
        .from('transactions')
        .update({ type: 'income' })
        .eq('id', r.id);
      if (!error) r.type = 'income';
    }
  }
  console.log('ATM deposits fixed', fixedDeposit);

  // 1) False Převod → normální klasifikace
  for (const r of rows) {
    if (r.category !== 'Převod') continue;

    const acc = normalizeAccount(r.counterparty_account);
    if (acc && OWNER.has(acc)) {
      keptPrevod += 1;
      continue;
    }

    if (isLoanPaymentText(r.description, r.counterparty_name) && r.type === 'expense') {
      const { error } = await supabase
        .from('transactions')
        .update({ category: LOAN_PAYMENT_CATEGORY })
        .eq('id', r.id);
      if (!error) {
        r.category = LOAN_PAYMENT_CATEGORY;
        fixedPrevod += 1;
      }
      continue;
    }

    const mk = normalizeMerchantKey(r.description || r.counterparty_name || '');
    if (mk && userRules.has(mk)) {
      const cat = userRules.get(mk)!;
      if (cat !== 'Převod') {
        const { error } = await supabase
          .from('transactions')
          .update({ category: cat })
          .eq('id', r.id);
        if (!error) {
          r.category = cat;
          fixedPrevod += 1;
        }
        continue;
      }
    }

    let input: ClassifyImportInput = {
      type: r.type,
      category: 'Ostatní',
      description: r.description,
      title: r.description,
      amount: r.amount,
      counterpartyAccount: r.counterparty_account,
      counterpartyName: r.counterparty_name,
      merchantRaw: r.description,
      isRefund: !!r.is_refund,
    };
    input = withBackfilledCounterpartyName(input, namesByAccount);
    const result = classifyImportRow(input, { userRules, globalCache: new Map() });
    let next = result.category;
    if (next === 'Převod') next = 'Ostatní';
    const desc =
      result.description && !/původní\s+částka/i.test(result.description)
        ? result.description
        : r.counterparty_account || r.description || 'Bez popisu';

    const { error } = await supabase
      .from('transactions')
      .update({ category: next, description: desc })
      .eq('id', r.id);
    if (!error) {
      r.category = next;
      r.description = desc;
      fixedPrevod += 1;
    }
  }
  console.log('false Převod reclassified', fixedPrevod, 'kept own', keptPrevod);

  // Součty výdajů
  const byCat = new Map<string, { n: number; sum: number }>();
  let expTotal = 0;
  for (const r of rows) {
    if (r.type !== 'expense') continue;
    if (r.category === 'Převod' || r.category === 'Vklad hotovosti') continue;
    const c = r.category || 'Ostatní';
    const cur = byCat.get(c) ?? { n: 0, sum: 0 };
    cur.n += 1;
    cur.sum += r.amount;
    byCat.set(c, cur);
    expTotal += r.amount;
  }
  const sorted = [...byCat.entries()].sort((a, b) => b[1].sum - a[1].sum);
  console.log('\n=== VÝDAJE PODLE KATEGORIÍ (bez Převod / Vklad hotovosti) ===');
  console.log('Celkem:', Math.round(expTotal).toLocaleString('cs-CZ'), 'Kč');
  for (const [c, v] of sorted) {
    const pct = ((v.sum / expTotal) * 100).toFixed(1);
    console.log(
      `${c}\t${v.n}\t${Math.round(v.sum).toLocaleString('cs-CZ')}\t${pct}%`,
    );
  }

  const foreignStill = rows.filter((r) => {
    if (r.category !== 'Převod') return false;
    const a = normalizeAccount(r.counterparty_account);
    return (
      a &&
      [
        '5728356379/0800',
        '131-1671640257/0100',
        '1868389/0800',
        '3201219010/3030',
        '4059123003/0800',
        '363468155/0300',
      ]
        .map((x) => normalizeAccount(x))
        .includes(a)
    );
  });
  console.log('\nlisted foreign still Převod:', foreignStill.length);
  console.log(
    'Výběr as income:',
    rows.filter((r) => r.category === 'Výběr hotovosti' && r.type === 'income').length,
  );
  console.log(
    'Původní částka names:',
    rows.filter((r) => /původní\s+částka/i.test(r.counterparty_name || '')).length,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
