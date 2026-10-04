/**
 * Smaže Revolut import a nahraje CZK/EUR/USD výpisy znovu (opravený unique_key s #rowIndex).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/reimport-revolut-3-statements.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const { parseRevolutCsv } = await import('../lib/revolut-csv-parse.ts');
const { buildOwnerNames } = await import('../lib/owner-names.ts');
const { normalizeMerchantKey } = await import('../lib/normalize-merchant-key.ts');
const {
  buildTransactionUniqueKey,
  buildBankExternalId,
} = await import('../lib/bank-import-unique-key.ts');

const TARGET_USER = '7ce943bd-eb89-4c95-9022-39a08901320a';
const url = process.env.SUPABASE_URL || 'https://jcwbkydaeeqcbdcxgnad.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjd2JreWRhZWVxY2JkY3hnbmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMTcxMjMsImV4cCI6MjA4OTY5MzEyM30.Yy7cTgxrJG38XAW_K0aRLt1UooMAh2kARxWROux7MyI';

if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function loadOwnerNamesForUser(userId: string): Promise<string[]> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();
  let authDisplay: string | null = null;
  try {
    const { data: auth } = await supabase.auth.admin.getUserById(userId);
    const meta = auth?.user?.user_metadata as Record<string, unknown> | undefined;
    if (typeof meta?.name === 'string') authDisplay = meta.name;
    else if (typeof meta?.display_name === 'string') authDisplay = meta.display_name;
  } catch (e) {
    console.warn('[reimport] auth.admin.getUserById failed', e);
  }
  const names = buildOwnerNames({
    profileFirstName: profile?.first_name,
    profileLastName: profile?.last_name,
    authDisplayName: authDisplay,
    accountLabels: [],
  });
  console.log('[import] ownerName', names, {
    profile: profile ?? null,
    authDisplay,
  });
  return names;
}

const FIX = join(import.meta.dir, 'fixtures/bank-csv/revolut');
const FILES = [
  { file: 'czk.csv', currency: 'CZK', rows: 513, expense: 439_729.1, fees: 9 },
  { file: 'eur.csv', currency: 'EUR', rows: 454, expense: 22_906.12, fees: 6 },
  { file: 'usd.csv', currency: 'USD', rows: 133, expense: 3_032.38, fees: 13 },
] as const;

function approx(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

function convertToCzk(originalAmount: number, perUnit: number): number {
  const origCents = Math.round(Math.abs(originalAmount) * 100);
  const rateE6 = Math.round(perUnit * 1_000_000);
  return Math.round((origCents * rateE6) / 1_000_000) / 100;
}

type FxRate = {
  requestedDate: string;
  date: string;
  currency: string;
  rate: number;
  amount: number;
  perUnit: number;
};

async function fetchRates(
  pairs: { date: string; currency: string }[],
): Promise<Map<string, FxRate>> {
  const dates = [...new Set(pairs.map((p) => p.date))];
  const currencies = [...new Set(pairs.map((p) => p.currency))];
  if (dates.length === 0) return new Map();

  const res = await fetch(`${url}/functions/v1/fetch-exchange-rates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ dates, currencies }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    rates?: FxRate[];
    missing?: unknown[];
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `FX HTTP ${res.status}`);
  }
  if (json.missing?.length) {
    throw new Error(`FX missing: ${JSON.stringify(json.missing.slice(0, 5))}`);
  }
  const map = new Map<string, FxRate>();
  for (const r of json.rates ?? []) {
    const perUnit = r.perUnit > 0 ? r.perUnit : r.rate / (r.amount || 1);
    map.set(`${r.requestedDate}|${r.currency}`, { ...r, perUnit });
  }
  return map;
}

async function main() {
  const { count: before } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER)
    .eq('source', 'revolut');
  console.log('revolut before delete:', before);

  const { error: delErr } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', TARGET_USER)
    .eq('source', 'revolut');
  if (delErr) throw delErr;
  console.log('deleted');

  const batchId = randomUUID();
  const allInsert: Record<string, unknown>[] = [];
  const usedKeys = new Set<string>();
  const ownerNames = await loadOwnerNamesForUser(TARGET_USER);

  for (const f of FILES) {
    const text = readFileSync(join(FIX, f.file), 'utf8');
    const parsed = parseRevolutCsv(text, [], ownerNames);
    if ('error' in parsed) throw new Error(`${f.file}: ${parsed.error}`);

    const pairs = parsed.rows
      .filter((r) => r.originalCurrency && r.originalCurrency !== 'CZK')
      .map((r) => ({
        date: r.date.slice(0, 10),
        currency: String(r.originalCurrency).toUpperCase(),
      }));
    console.log(f.file, 'parsed', parsed.rows.length, 'fx pairs', pairs.length);
    const rates = await fetchRates(pairs);

    const fxRows = parsed.rows.map((r) => {
      const ccy = r.originalCurrency?.toUpperCase();
      if (!ccy || ccy === 'CZK') {
        return { ...r, originalAmount: null, originalCurrency: null, exchangeRate: null };
      }
      const orig = Math.abs(Number(r.originalAmount ?? r.amount));
      const hit = rates.get(`${r.date.slice(0, 10)}|${ccy}`);
      if (!hit) throw new Error(`No FX ${ccy} @ ${r.date}`);
      const amountCzk = convertToCzk(orig, hit.perUnit);
      return {
        ...r,
        amount: amountCzk,
        originalAmount: Math.round(orig * 100) / 100,
        originalCurrency: ccy,
        exchangeRate: hit.perUnit,
      };
    });

    const feeN = fxRows.filter((r) => String(r.bankTransactionId ?? '').endsWith('|fee')).length;
    let expOrig = 0;
    for (const r of fxRows) {
      if (r.type !== 'expense') continue;
      // Po FX: CZK rows use amount; foreign use originalAmount
      const orig =
        r.originalAmount != null && Number.isFinite(r.originalAmount)
          ? Math.abs(Number(r.originalAmount))
          : Math.abs(r.amount);
      expOrig += orig;
    }
    console.log(f.file, {
      rows: fxRows.length,
      fees: feeN,
      expenseOrig: expOrig.toFixed(2),
    });
    if (fxRows.length !== f.rows) {
      throw new Error(`${f.file}: row count ${fxRows.length} ≠ ${f.rows}`);
    }
    if (feeN !== f.fees) {
      throw new Error(`${f.file}: fee count ${feeN} ≠ ${f.fees}`);
    }
    if (!approx(expOrig, f.expense)) {
      throw new Error(`${f.file}: expense ${expOrig} ≠ ${f.expense}`);
    }

    for (const r of fxRows) {
      const description = (r.description || '').slice(0, 200);
      const merchantKey = normalizeMerchantKey(description) || null;
      let uniqueKey = buildTransactionUniqueKey({
        userId: TARGET_USER,
        bank: 'revolut',
        date: r.date,
        amount: r.amount,
        description,
        bankTransactionId: r.bankTransactionId,
      });
      if (usedKeys.has(uniqueKey)) {
        uniqueKey = `${uniqueKey}|dup`;
      }
      usedKeys.add(uniqueKey);

      allInsert.push({
        user_id: TARGET_USER,
        date: r.date,
        booking_date: r.bookingDate ?? null,
        amount: r.amount,
        type: r.type,
        category: r.category,
        description,
        source: 'revolut',
        import_batch_id: batchId,
        is_refund: !!r.isRefund,
        merchant_key: merchantKey,
        category_source:
          r.categorySource ?? (r.category === 'Převod' ? 'transfer' : 'import'),
        unique_key: uniqueKey,
        external_id: buildBankExternalId('revolut', r.bankTransactionId),
        original_amount: r.originalAmount ?? null,
        original_currency: r.originalCurrency ?? null,
        exchange_rate: r.exchangeRate ?? null,
      });
    }
  }

  console.log('inserting', allInsert.length);
  for (let i = 0; i < allInsert.length; i += 100) {
    const chunk = allInsert.slice(i, i + 100);
    const { error } = await supabase.from('transactions').insert(chunk);
    if (error) throw error;
    console.log('  inserted', Math.min(i + chunk.length, allInsert.length), '/', allInsert.length);
  }

  // paginate verify
  const verify: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'amount,type,original_amount,original_currency,description,unique_key,category,is_refund',
      )
      .eq('user_id', TARGET_USER)
      .eq('source', 'revolut')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    verify.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const byCcy: Record<string, { n: number; exp: number; fees: number }> = {};
  for (const t of verify) {
    const m = String(t.unique_key || '').match(/\|(-?\d+\.\d{2})\|([A-Z]{3})\|/);
    const ccy = m?.[2] || t.original_currency || 'CZK';
    const g = (byCcy[ccy] ??= { n: 0, exp: 0, fees: 0 });
    g.n++;
    if (t.type === 'expense') {
      const orig =
        t.original_amount != null ? Number(t.original_amount) : Number(t.amount);
      g.exp += Math.abs(orig);
      if (/\|fee$/.test(String(t.unique_key)) || /^Poplatek/i.test(String(t.description))) {
        g.fees++;
      }
    }
  }

  console.log('VERIFY', { total: verify.length, byCcy, batchId });
  for (const f of FILES) {
    const g = byCcy[f.currency];
    if (!g || g.n !== f.rows || g.fees !== f.fees || !approx(g.exp, f.expense)) {
      throw new Error(
        `VERIFY FAIL ${f.currency}: got ${JSON.stringify(g)} want rows=${f.rows} fees=${f.fees} exp=${f.expense}`,
      );
    }
  }
  console.log('OK — Revolut reimport matches target table');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
