/**
 * Smaže Fio import a nahraje oba výpisy 2503536930 znovu (opravený parser).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/reimport-fio-2-statements.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const { parseFioPdf } = await import('../supabase/functions/parse-bank-pdf-v2/fio-pdf-parse.ts');
const { classifyCsob } = await import('../lib/csob-pdf-parse.ts');
const { bucketToStoreCategory } = await import('../lib/bank-statement-parser.ts');
const { normalizeMerchantKey } = await import('../lib/normalize-merchant-key.ts');
const { lookupMerchantDictionary } = await import('../lib/merchant-dictionary.ts');
const { buildTransactionUniqueKey } = await import('../lib/bank-import-unique-key.ts');

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

const OWNERS = ['767628004/5500', '363468155/0300', '110125955/0100', '3672144019/3030', '2503536930/2010'];
const RAW_DIR = join(import.meta.dir, 'fixtures/bank-pdf-raw');
const FILES = [
  'Statement_account-2503536930_20260625-20260630-1.txt',
  'Statement_account-2503536930_20260701-20260731-2.txt',
];

async function main() {
  const { count: before } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER)
    .eq('source', 'fio');
  console.log('fio before delete:', before);

  const { error: delErr } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', TARGET_USER)
    .eq('source', 'fio');
  if (delErr) throw delErr;
  console.log('deleted');

  const deps = { classifyCsob, bucketToStoreCategory };
  const allRows: ReturnType<typeof parseFioPdf> = [];
  for (const f of FILES) {
    const text = readFileSync(join(RAW_DIR, f), 'utf8');
    const rows = parseFioPdf(text, OWNERS, deps);
    console.log(f, rows.length, 'txids', rows.map((r) => r.bankTransactionId).join(','));
    allRows.push(...rows);
  }

  // Aplikuj slovník (jako enrich na edge)
  for (const r of allRows) {
    if (r.category === 'Převod') continue;
    const mk = normalizeMerchantKey(r.description);
    const dict = mk ? lookupMerchantDictionary(mk) : null;
    if (dict) r.category = dict;
  }

  const batchId = randomUUID();
  const usedKeys = new Set<string>();
  const insertRows = allRows.map((r, idx) => {
    const description = (r.description || '').slice(0, 200);
    const merchantKey = normalizeMerchantKey(description) || null;
    let uniqueKey = buildTransactionUniqueKey({
      userId: TARGET_USER,
      bank: 'fio',
      date: r.date,
      amount: r.amount,
      description,
      bankTransactionId: r.bankTransactionId,
    });
    if (usedKeys.has(uniqueKey)) uniqueKey = `${uniqueKey}|${idx}`;
    usedKeys.add(uniqueKey);
    return {
      user_id: TARGET_USER,
      date: r.date,
      amount: r.amount,
      type: r.type,
      category: r.category,
      description,
      source: 'fio',
      import_batch_id: batchId,
      is_refund: false,
      counterparty_account: r.counterpartyAccount ?? null,
      counterparty_name: r.counterpartyName ?? null,
      merchant_key: merchantKey,
      category_source: r.category === 'Převod' ? 'transfer' : 'import',
      unique_key: uniqueKey,
    };
  });

  console.log('unique keys:', insertRows.length, 'distinct', usedKeys.size);

  const { error: insErr } = await supabase.from('transactions').insert(insertRows);
  if (insErr) throw insErr;

  const { data: verify } = await supabase
    .from('transactions')
    .select('amount,type,date,description,category,merchant_key,counterparty_account,unique_key')
    .eq('user_id', TARGET_USER)
    .eq('source', 'fio')
    .order('date');

  let inc = 0;
  let exp = 0;
  for (const t of verify ?? []) {
    if (t.type === 'income') inc += Number(t.amount);
    else exp += Number(t.amount);
  }
  console.log('verify count:', verify?.length, 'income:', inc.toFixed(2), 'expense:', exp.toFixed(2));
  console.log(
    'expected: 9 / 550.00 / 532.10 →',
    verify?.length === 9 && Math.abs(inc - 550) < 0.02 && Math.abs(exp - 532.1) < 0.02
      ? 'OK'
      : 'MISMATCH',
  );
  for (const t of verify ?? []) {
    console.log(
      `  ${t.date} ${t.type} ${t.amount} [${t.category}] cp=${t.counterparty_account ?? '-'} mk=${t.merchant_key} | ${String(t.description).slice(0, 45)}`,
    );
  }

  // Dry reimport dedup check
  const { data: again, error: againErr } = await supabase
    .from('transactions')
    .upsert(insertRows, { onConflict: 'user_id,unique_key', ignoreDuplicates: true })
    .select('id');
  if (againErr) console.warn('dedup upsert warn', againErr.message);
  const { count: afterDup } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER)
    .eq('source', 'fio');
  console.log('after re-upsert count (should stay 9):', afterDup);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
