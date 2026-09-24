/**
 * Smaže stávající ČSOB import a nahraje všech 9 výpisů znovu (opravený parser).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/reimport-csob-9-statements.bun.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  csobPlainTextToLines,
  extractCsobStatementMeta,
  parseCsobNewFormat,
  validateCsobParse,
  type ParsedImportRow,
} from '../supabase/functions/parse-bank-pdf-v2/csob-pdf-parse.ts';
import { normalizeMerchantKey } from '../lib/normalize-merchant-key.ts';
import { buildTransactionUniqueKey } from '../lib/bank-import-unique-key.ts';

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

async function main() {
  const { count: before } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER)
    .eq('source', 'csob');
  console.log('csob before delete:', before);

  const { error: delErr } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', TARGET_USER)
    .eq('source', 'csob');
  if (delErr) throw delErr;
  console.log('deleted');

  const files = readdirSync(RAW_DIR)
    .filter((n) => n.startsWith('363468155_') && n.endsWith('.txt'))
    .sort();

  const allRows: ParsedImportRow[] = [];
  for (const f of files) {
    const text = readFileSync(join(RAW_DIR, f), 'utf8');
    const lines = csobPlainTextToLines(text);
    const rows = parseCsobNewFormat(lines, undefined, OWNERS);
    const meta = extractCsobStatementMeta(lines);
    const check = validateCsobParse(rows, meta);
    console.log(f, rows.length, 'ok=', check.ok);
    if (!check.ok) {
      throw new Error(`Validation failed for ${f}: ${JSON.stringify(check)}`);
    }
    allRows.push(...rows);
  }

  const batchId = randomUUID();
  const usedKeys = new Set<string>();
  const insertRows = allRows.map((r, idx) => {
    const description = (r.description || '').slice(0, 200);
    const merchantKey = normalizeMerchantKey(description) || null;
    let uniqueKey = buildTransactionUniqueKey({
      userId: TARGET_USER,
      bank: 'csob',
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
      source: 'csob',
      import_batch_id: batchId,
      is_refund: !!r.isRefund,
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
    .select('amount,type,is_refund,date,description,category')
    .eq('user_id', TARGET_USER)
    .eq('source', 'csob');

  let inc = 0;
  let exp = 0;
  const byMonth: Record<string, number> = {};
  for (const r of verify ?? []) {
    const m = String(r.date).slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
    if (r.type === 'income') inc += Number(r.amount);
    else exp += Number(r.amount);
  }

  console.log('SUMMARY', {
    inserted,
    dbCount: verify?.length,
    income: inc.toFixed(2),
    expense: exp.toFixed(2),
    byMonth,
    batchId,
    refunds: (verify ?? []).filter((r) => r.is_refund).length,
    odmena: (verify ?? []).filter((r) => /Odměna/i.test(String(r.description))).length,
    fees: (verify ?? []).filter((r) => r.category === 'Bankovní poplatky').length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
