/**
 * Přepočet kategorií pro uživatele 7ce943bd… (KB + Raiffeisen).
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/reclassify-user-categories.bun.ts
 */
import { createClient } from '@supabase/supabase-js';
import { normalizeAccount } from '../utils/normalizeAccount.ts';
import { normalizeMerchantKey } from '../lib/normalize-merchant-key.ts';
import { lookupMerchantDictionary } from '../lib/merchant-dictionary.ts';
import {
  buildCounterpartyNameByAccount,
  classifyImportRow,
  looksLikePersonCounterparty,
  withBackfilledCounterpartyName,
  type ClassifyImportInput,
} from '../lib/classify-import-category.ts';
import { isLoanPaymentText, LOAN_PAYMENT_CATEGORY } from '../lib/loan-payment-detect.ts';

const USER_ID = '7ce943bd-eb89-4c95-9022-39a08901320a';
const MORTGAGE_ACCOUNT = '110116442/0100';

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

async function fetchAllTx(userId: string): Promise<TxRow[]> {
  const all: TxRow[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, type, category, description, amount, date, booking_date, counterparty_account, counterparty_name, is_refund, source',
      )
      .eq('user_id', userId)
      .range(from, from + page - 1);
    if (error) throw error;
    const chunk = (data ?? []) as TxRow[];
    all.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }
  return all;
}

function detectSalaryIds(rows: TxRow[]): Set<string> {
  /** Příchozí ≥15k od stejného protiúčtu, ≥2× s odstupem ~28–35 dní */
  const income = rows.filter(
    (r) =>
      r.type === 'income' &&
      !r.is_refund &&
      r.category !== 'Převod' &&
      r.category !== 'Vklad hotovosti' &&
      Math.abs(r.amount) >= 15000 &&
      normalizeAccount(r.counterparty_account),
  );
  const byAcc = new Map<string, TxRow[]>();
  for (const r of income) {
    const acc = normalizeAccount(r.counterparty_account)!;
    const list = byAcc.get(acc) ?? [];
    list.push(r);
    byAcc.set(acc, list);
  }
  const ids = new Set<string>();
  for (const list of byAcc.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    // alespoň jeden pár s gapem 25–40 dní a podobnou částkou (±15 %)
    let ok = false;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      const d1 = new Date(a.date || 0).getTime();
      const d2 = new Date(b.date || 0).getTime();
      const days = Math.round(Math.abs(d2 - d1) / 86400000);
      const avg = (Math.abs(a.amount) + Math.abs(b.amount)) / 2;
      const amtOk = avg > 0 && Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) / avg <= 0.15;
      if (days >= 25 && days <= 40 && amtOk) {
        ok = true;
        break;
      }
    }
    if (ok) {
      for (const r of sorted) ids.add(r.id);
    }
  }
  return ids;
}

async function main() {
  const rows = await fetchAllTx(USER_ID);
  console.log('Fetched', rows.length, 'txs');

  const mortgageAcc = normalizeAccount(MORTGAGE_ACCOUNT);
  // 1) Hypotéka: Převod → Splátky úvěrů
  let mortgageFixed = 0;
  for (const r of rows) {
    const acc = normalizeAccount(r.counterparty_account);
    const loan =
      isLoanPaymentText(r.description, r.counterparty_name) ||
      (acc && mortgageAcc && acc === mortgageAcc);
    if (loan && r.type === 'expense' && (r.category === 'Převod' || r.category === 'Ostatní')) {
      const { error } = await supabase
        .from('transactions')
        .update({ category: LOAN_PAYMENT_CATEGORY })
        .eq('id', r.id)
        .eq('user_id', USER_ID);
      if (!error) {
        r.category = LOAN_PAYMENT_CATEGORY;
        mortgageFixed += 1;
      }
    }
  }
  console.log('Mortgage/loan fixed:', mortgageFixed);

  // KB refunds: income Ostatní with Hornbach/CISTEDREVO → is_refund + dictionary cat
  let refundsFixed = 0;
  for (const r of rows) {
    if (r.type !== 'income' || r.is_refund) continue;
    const desc = (r.description || '').toUpperCase();
    if (!/HORNBACH|CISTEDREVO|CISTE DREVO|GOPAY/i.test(desc)) continue;
    if (r.category !== 'Ostatní' && r.category !== 'Nákupy') continue;
    // Heuristika: kladná částka z KB u známých obchodů = vratka
    if (r.source !== 'kb' && r.source !== 'komercni' && r.source !== 'kb_pdf') {
      // stále může být vratka
    }
    const mk = normalizeMerchantKey(r.description || '');
    const dict = mk ? lookupMerchantDictionary(mk) : null;
    const cat = dict && dict !== 'Předplatné' ? dict : 'Domácnost a nábytek';
    const { error } = await supabase
      .from('transactions')
      .update({ is_refund: true, category: cat })
      .eq('id', r.id)
      .eq('user_id', USER_ID);
    if (!error) {
      r.is_refund = true;
      r.category = cat;
      refundsFixed += 1;
    }
  }
  console.log('Refunds fixed:', refundsFixed);

  const userRules = await fetchUserRules(USER_ID);
  const globalCache = new Map<string, string>();

  const namesByAccount = buildCounterpartyNameByAccount(
    rows.map((r) => ({
      counterpartyAccount: r.counterparty_account,
      counterpartyName: r.counterparty_name,
    })),
  );

  const salaryIds = detectSalaryIds(rows);
  console.log('Salary candidates:', salaryIds.size);

  let updated = 0;
  for (const r of rows) {
    const merchantSrc = r.description || r.counterparty_name || '';
    const merchantKey = normalizeMerchantKey(merchantSrc);

    // User rules — nepřepisovat
    if (merchantKey && userRules.has(merchantKey) && r.category === userRules.get(merchantKey)) {
      continue;
    }

    // Loan already handled
    if (isLoanPaymentText(r.description, r.counterparty_name) && r.type === 'expense') {
      if (r.category !== LOAN_PAYMENT_CATEGORY) {
        const { error } = await supabase
          .from('transactions')
          .update({ category: LOAN_PAYMENT_CATEGORY })
          .eq('id', r.id)
          .eq('user_id', USER_ID);
        if (!error) {
          r.category = LOAN_PAYMENT_CATEGORY;
          updated += 1;
        }
      }
      continue;
    }

    // Salary
    if (salaryIds.has(r.id) && r.category !== 'Mzda') {
      const { error } = await supabase
        .from('transactions')
        .update({ category: 'Mzda' })
        .eq('id', r.id)
        .eq('user_id', USER_ID);
      if (!error) {
        r.category = 'Mzda';
        updated += 1;
      }
      continue;
    }

    // Převod — nepřepisovat (false Převod řeší scripts/fix-prevod-regression.bun.ts)
    if (r.category === 'Převod') continue;

    // Firma → ne Platby lidem
    if (
      r.category === 'Platby lidem' &&
      r.counterparty_name &&
      !looksLikePersonCounterparty(r.counterparty_name)
    ) {
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
      const result = classifyImportRow(input, { userRules, globalCache });
      const next = result.category === 'Platby lidem' ? 'Bydlení' : result.category;
      if (next !== r.category) {
        const { error } = await supabase
          .from('transactions')
          .update({ category: next })
          .eq('id', r.id)
          .eq('user_id', USER_ID);
        if (!error) {
          r.category = next;
          updated += 1;
        }
      }
      continue;
    }

    const dictCat = merchantKey ? lookupMerchantDictionary(merchantKey) : null;
    const isOstatni = !r.category || r.category === 'Ostatní';
    const isFromDictionary = !!dictCat && r.category === dictCat;
    // Přepočítat i Předplatné u energií (ČEZ) a staré Služby u Vodafone
    const forceEnergy =
      r.category === 'Předplatné' &&
      dictCat === 'Bydlení';
    const forceTel =
      (r.category === 'Služby' || r.category === 'Předplatné') &&
      dictCat === 'Telefon a internet';

    if (!isOstatni && !isFromDictionary && !forceEnergy && !forceTel) continue;
    if (r.type === 'income' && !r.is_refund) {
      // income Ostatní — person name → leave; ATM deposit handled by classify
      let input: ClassifyImportInput = {
        type: 'income',
        category: r.category,
        description: r.description,
        title: r.description,
        amount: r.amount,
        counterpartyAccount: r.counterparty_account,
        counterpartyName: r.counterparty_name,
        merchantRaw: r.description,
      };
      input = withBackfilledCounterpartyName(input, namesByAccount);
      const result = classifyImportRow(input, { userRules, globalCache });
      if (result.category !== r.category && result.category !== 'Ostatní') {
        const { error } = await supabase
          .from('transactions')
          .update({ category: result.category })
          .eq('id', r.id)
          .eq('user_id', USER_ID);
        if (!error) {
          r.category = result.category;
          updated += 1;
        }
      }
      // MEDVEDOVA — income person: leave; if expense-like mis-typed skip
      continue;
    }

    let input: ClassifyImportInput = {
      type: r.type,
      category: forceEnergy || forceTel ? 'Ostatní' : r.category,
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
    if (result.category === r.category) continue;

    const { error } = await supabase
      .from('transactions')
      .update({
        category: result.category,
        ...(result.description && result.description !== r.description
          ? { description: result.description.slice(0, 200) }
          : {}),
      })
      .eq('id', r.id)
      .eq('user_id', USER_ID);
    if (!error) {
      r.category = result.category;
      updated += 1;
    }
  }

  // KB ATM / fees / deposits heuristics on Ostatní
  let kbSpecial = 0;
  for (const r of rows) {
    const d = (r.description || '').toLowerCase();
    let next: string | null = null;
    let desc: string | null = null;
    if (r.category === 'Ostatní' || !r.category) {
      if (/kb\s*atm|mobilní výběr|vyber hotovosti/.test(d) && r.type === 'expense') {
        next = 'Výběr hotovosti';
        desc = 'Výběr hotovosti';
      } else if (/mobilní vklad|vklad hotovosti|vklad přes atm/.test(d)) {
        next = 'Vklad hotovosti';
        desc = 'Vklad hotovosti';
      } else if (/poplatek/.test(d) && Math.abs(r.amount) < 500) {
        next = 'Bankovní poplatky';
        desc = 'Poplatek KB';
      }
    }
    if (next && next !== r.category) {
      const { error } = await supabase
        .from('transactions')
        .update({
          category: next,
          ...(desc ? { description: desc } : {}),
          ...(next === 'Vklad hotovosti' ? { type: 'income' } : {}),
        })
        .eq('id', r.id)
        .eq('user_id', USER_ID);
      if (!error) {
        r.category = next;
        kbSpecial += 1;
        updated += 1;
      }
    }
  }
  console.log('KB special fixed:', kbSpecial);
  console.log('Total category updates:', updated);

  // Stats
  const byCat = new Map<string, { n: number; sum: number }>();
  let expenseSum = 0;
  for (const r of rows) {
    if (r.type !== 'expense' || r.category === 'Převod') continue;
    expenseSum += Math.abs(r.amount);
    const c = r.category || 'Ostatní';
    const e = byCat.get(c) || { n: 0, sum: 0 };
    e.n += 1;
    e.sum += Math.abs(r.amount);
    byCat.set(c, e);
  }
  const ostatni = byCat.get('Ostatní') || { n: 0, sum: 0 };
  console.log('---');
  console.log('Splátky úvěrů:', byCat.get('Splátky úvěrů'));
  console.log('Mzda:', byCat.get('Mzda') || 'check income');
  const mzda = rows.filter((r) => r.category === 'Mzda');
  console.log('Mzda count/sum:', mzda.length, mzda.reduce((s, r) => s + r.amount, 0));
  console.log('Bydlení:', byCat.get('Bydlení'));
  console.log('Telefon a internet:', byCat.get('Telefon a internet'));
  console.log('Ostatní expense %:', expenseSum ? ((ostatni.sum / expenseSum) * 100).toFixed(1) : 0);
  console.log(
    'Platby lidem sample pojist:',
    rows.filter((r) => /pojist/i.test(r.counterparty_name || r.description || '')).map((r) => ({
      cat: r.category,
      d: r.description,
      n: r.counterparty_name,
    })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
