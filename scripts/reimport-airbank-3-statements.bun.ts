/**
 * Smaže stávající Air Bank import a nahraje 3 výpisy znovu (opravený parser).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/reimport-airbank-3-statements.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const {
  parseAirBank,
  airBankTransactionsToImportRows,
  extractAirBankStatementMeta,
  validateAirBankParse,
  isAirBankEmptyStatement,
} = await import('../lib/airbank-pdf-parse.ts');
const { normalizeMerchantKey } = await import('../lib/normalize-merchant-key.ts');
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

const OWNERS = ['767628004/5500', '363468155/0300', '110125955/0100', '3672144019/3030'];
const RAW_DIR = join(import.meta.dir, 'fixtures/bank-pdf-raw');

const FILES = [
  'airbank-PDF-document-3.txt', // 6/2026 partial — 6 txs
  'airbank-PDF-document-2.txt', // 7/2026 — 10 txs
  'airbank-PDF-document.txt', // 8/2026 — empty
];

async function main() {
  const { count: before } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER)
    .eq('source', 'airbank');
  console.log('airbank before delete:', before);

  const { error: delErr } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', TARGET_USER)
    .eq('source', 'airbank');
  if (delErr) throw delErr;
  console.log('deleted');

  const allRows: ReturnType<typeof airBankTransactionsToImportRows> = [];
  for (const f of FILES) {
    const text = readFileSync(join(RAW_DIR, f), 'utf8');
    const txs = parseAirBank(text);
    const rows = airBankTransactionsToImportRows(txs, OWNERS);
    if (isAirBankEmptyStatement(text, rows.length)) {
      console.log(f, 'empty statement OK');
      continue;
    }
    const meta = extractAirBankStatementMeta(text);
    const check = validateAirBankParse(rows, meta);
    console.log(f, rows.length, 'ok=', check.ok, meta);
    if (!check.ok) {
      throw new Error(`Validation failed for ${f}: ${JSON.stringify(check)}`);
    }
    allRows.push(...rows);
  }

  console.log('total rows to insert:', allRows.length);
  const batchId = randomUUID();
  const usedKeys = new Set<string>();
  const insertRows = allRows.map((r, idx) => {
    const description = (r.description || '').slice(0, 200);
    const detailPart = description.includes('·')
      ? description.split('·').slice(1).join('·').trim()
      : description;
    const merchantKey = normalizeMerchantKey(detailPart) || normalizeMerchantKey(description) || null;
    let uniqueKey = buildTransactionUniqueKey({
      userId: TARGET_USER,
      bank: 'airbank',
      date: r.date,
      amount: r.amount,
      description,
      bankTransactionId: r.bankTransactionId,
    });
    if (usedKeys.has(uniqueKey)) {
      uniqueKey = `${uniqueKey}|${idx}`;
    }
    usedKeys.add(uniqueKey);
    return {
      user_id: TARGET_USER,
      date: r.date,
      booking_date: r.bookingDate ?? null,
      amount: r.amount,
      type: r.type,
      category: r.category,
      description,
      source: 'airbank',
      import_batch_id: batchId,
      is_refund: false,
      counterparty_account: r.counterpartyAccount ?? null,
      counterparty_name: r.counterpartyName ?? null,
      merchant_key: merchantKey,
      category_source: r.category === 'Převod' ? 'transfer' : 'import',
      unique_key: uniqueKey,
    };
  });

  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += 50) {
    const chunk = insertRows.slice(i, i + 50);
    const { error } = await supabase.from('transactions').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  const { data: verify } = await supabase
    .from('transactions')
    .select('amount,type,date,description,category,merchant_key')
    .eq('user_id', TARGET_USER)
    .eq('source', 'airbank');

  let inc = 0;
  let exp = 0;
  for (const t of verify ?? []) {
    if (t.type === 'income') inc += Number(t.amount);
    else exp += Number(t.amount);
  }
  console.log('inserted:', inserted);
  console.log('verify count:', verify?.length, 'income:', inc.toFixed(2), 'expense:', exp.toFixed(2));
  console.log(
    'expected: 16 txs, income 2500.00, expense 2497.90 →',
    verify?.length === 16 && Math.abs(inc - 2500) < 0.02 && Math.abs(exp - 2497.9) < 0.02
      ? 'OK'
      : 'MISMATCH',
  );
  for (const t of (verify ?? []).sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    console.log(
      `  ${t.date} ${t.type} ${t.amount} [${t.category}] ${t.merchant_key ?? '-'} | ${String(t.description).slice(0, 60)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
