/**
 * Self-test / one-shot: 10 EUR z 15. 9. 2026 → CZK kurzem ČNB.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/test-fx-eur-2026-09-15.bun.ts
 *
 * Očekávání (ověřeno z ČNB denni_kurz.txt?date=15.09.2026):
 *   EUR 1 = 24,290 CZK → 10 EUR = 242,90 Kč
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
function approx(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

async function main() {
  // 1) Fetch rates via edge
  const res = await fetch(`${url}/functions/v1/fetch-exchange-rates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ dates: ['2026-09-15'], currencies: ['EUR'] }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    rates?: Array<{
      requestedDate: string;
      date: string;
      currency: string;
      rate: number;
      amount: number;
      perUnit: number;
    }>;
    missing?: unknown[];
  };
  console.log('Edge status', res.status, JSON.stringify(json, null, 2).slice(0, 800));
  assert(res.ok && json.ok, json.error || `HTTP ${res.status}`);
  const eur = json.rates?.find((r) => r.currency === 'EUR' && r.requestedDate === '2026-09-15');
  assert(!!eur, 'EUR rate for 2026-09-15 missing');
  assert(approx(eur!.perUnit, 24.29), `perUnit ${eur!.perUnit} expected ~24.29`);

  const amountCzk = Math.round(10 * eur!.perUnit * 100) / 100;
  assert(approx(amountCzk, 242.9), `10 EUR → ${amountCzk} CZK`);

  // 2) Insert test transaction
  const id = randomUUID();
  const { error: insErr } = await supabase.from('transactions').insert({
    id,
    user_id: TARGET_USER,
    date: '2026-09-15',
    amount: amountCzk,
    type: 'expense',
    category: 'Ostatní',
    description: 'FX test 10 EUR',
    source: 'manual',
    original_amount: 10,
    original_currency: 'EUR',
    exchange_rate: eur!.perUnit,
    unique_key: `${TARGET_USER}|manual|fx-test-10eur-2026-09-15`,
  });
  if (insErr) throw new Error(insErr.message);

  const { data: row, error: selErr } = await supabase
    .from('transactions')
    .select('id, amount, original_amount, original_currency, exchange_rate')
    .eq('id', id)
    .single();
  if (selErr) throw new Error(selErr.message);

  console.log('Inserted', row);
  assert(approx(Number(row!.amount), 242.9), 'stored amount CZK');
  assert(Number(row!.original_amount) === 10, 'original 10');
  assert(row!.original_currency === 'EUR', 'EUR');
  assert(approx(Number(row!.exchange_rate), 24.29), 'exchange_rate');

  console.log('OK — 10 EUR @ 15.09.2026 = 242,90 Kč (kurz ČNB 24,290)');
}

await main();
