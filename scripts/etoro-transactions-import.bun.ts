/**
 * Import eToro XLSX → investment_transactions (Supabase).
 *
 * Parse + summary only:
 *   bun scripts/etoro-transactions-import.bun.ts scripts/fixtures/etoro/account-statement-2026-01-to-06.xlsx
 *
 * Save to Supabase (personal portfolio, default):
 *   SUPABASE_SERVICE_ROLE_KEY=… OWNER_USER_ID=<uuid> bun scripts/etoro-transactions-import.bun.ts path/to/statement.xlsx --save
 *
 * Shared portfolio in household:
 *   SUPABASE_SERVICE_ROLE_KEY=… OWNER_USER_ID=<uuid> HOUSEHOLD_ID=<uuid> VISIBILITY=shared bun scripts/etoro-transactions-import.bun.ts path.xlsx --save
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  logEtoroTransactionParseSummary,
  parseEtoroTransactionsXlsx,
  dedupeInvestmentTransactionsByExternalId,
} from '../lib/etoro-transactions-parser.ts';
import { randomUUID } from '../lib/random-uuid.ts';

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() ?? 'https://jcwbkydaeeqcbdcxgnad.supabase.co';

const args = process.argv.slice(2);
const save = args.includes('--save');
const fileArg = args.find((a) => !a.startsWith('--'));
const filePath = resolve(fileArg ?? 'scripts/fixtures/etoro/account-statement-2026-01-to-06.xlsx');

if (!existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const buf = readFileSync(filePath);
const fileContent = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const parseResult = parseEtoroTransactionsXlsx(fileContent);
logEtoroTransactionParseSummary(parseResult);

if (!save) {
  console.log('\nDry run only. Add --save with SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID to upsert.');
  process.exit(0);
}

const ownerUserId = process.env.OWNER_USER_ID?.trim();
const householdId = process.env.HOUSEHOLD_ID?.trim() ?? null;
const visibility = (process.env.VISIBILITY?.trim() ?? 'personal') as 'personal' | 'shared';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!ownerUserId || !serviceKey) {
  console.error('Set OWNER_USER_ID and SUPABASE_SERVICE_ROLE_KEY for --save');
  process.exit(1);
}
if (visibility === 'shared' && !householdId) {
  console.error('Set HOUSEHOLD_ID when VISIBILITY=shared');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findOrCreateEtoroPortfolio(): Promise<{ portfolioId: string | null; error: Error | null }> {
  let query = supabase
    .from('investment_portfolios')
    .select('id')
    .eq('broker', 'etoro')
    .order('created_at', { ascending: true })
    .limit(1);

  if (visibility === 'personal') {
    query = query.eq('visibility', 'personal').eq('owner_user_id', ownerUserId!).is('household_id', null);
  } else {
    query = query.eq('visibility', 'shared').eq('household_id', householdId!);
  }

  const { data: existing, error: fetchErr } = await query.maybeSingle();

  if (fetchErr) {
    return { portfolioId: null, error: new Error(fetchErr.message) };
  }
  if (existing?.id) {
    return { portfolioId: String(existing.id), error: null };
  }

  const { data: created, error: createErr } = await supabase
    .from('investment_portfolios')
    .insert({
      owner_user_id: ownerUserId,
      visibility,
      household_id: visibility === 'shared' ? householdId : null,
      name: 'eToro',
      broker: 'etoro',
      currency: 'USD',
    })
    .select('id')
    .single();

  if (createErr || !created?.id) {
    return {
      portfolioId: null,
      error: new Error(createErr?.message ?? 'Nepodařilo se vytvořit eToro portfolio'),
    };
  }
  return { portfolioId: String(created.id), error: null };
}

async function upsertTransactions(portfolioId: string): Promise<{ upserted: number; error: Error | null }> {
  const txs = dedupeInvestmentTransactionsByExternalId(parseResult.transactions);
  if (!txs.length) return { upserted: 0, error: null };

  const importBatchId = randomUUID();
  const rows = txs.map((tx) => ({
    portfolio_id: portfolioId,
    type: tx.type,
    ticker: tx.ticker,
    isin: tx.isin,
    units: tx.units,
    price_per_unit: tx.price_per_unit,
    amount: tx.amount,
    fee: tx.fee,
    original_currency: tx.original_currency,
    date: tx.date,
    external_id: tx.external_id,
    import_batch_id: importBatchId,
  }));

  const { data, error } = await supabase
    .from('investment_transactions')
    .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    return { upserted: 0, error: new Error(error.message) };
  }
  return { upserted: data?.length ?? rows.length, error: null };
}

const { portfolioId, error: portfolioErr } = await findOrCreateEtoroPortfolio();
if (portfolioErr || !portfolioId) {
  console.error('[eToro tx import] portfolio failed:', portfolioErr?.message ?? 'unknown');
  process.exit(1);
}

const { upserted, error: upsertErr } = await upsertTransactions(portfolioId);
if (upsertErr) {
  console.error('[eToro tx import] upsert failed:', upsertErr.message);
  process.exit(1);
}

console.log('[eToro tx import] Saved to investment_transactions:');
for (const type of Object.keys(parseResult.summary) as Array<keyof typeof parseResult.summary>) {
  const row = parseResult.summary[type];
  if (row.count === 0) continue;
  console.log(`  ${type}: ${row.count} rows`);
}

console.log(
  `[eToro tx import] Upserted ${upserted} rows into portfolio ${portfolioId} (visibility=${visibility}, owner=${ownerUserId}).`,
);
console.log(`Done. portfolio=${portfolioId}, upserted=${upserted}`);
