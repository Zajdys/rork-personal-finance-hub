/**
 * One-shot: oprav 3 Moneta transakce omylem uložené jako source=csob
 * (created_at ≈ 2026-09-24 07:09:19 UTC).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun scripts/fix-moneta-source-csob.bun.ts
 */
import { createClient } from '@supabase/supabase-js';
import {
  buildBankExternalId,
  buildTransactionUniqueKey,
} from '../lib/bank-import-unique-key.ts';

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

function extractTxId(uniqueKey: string | null, externalId: string | null): string | null {
  const uk = String(uniqueKey ?? '');
  const m1 = uk.match(/\|txid:(.+)$/);
  if (m1?.[1]) return m1[1];
  const ex = String(externalId ?? '');
  const m2 = ex.match(/^(?:csob|moneta):(.+)$/i);
  return m2?.[1] ?? null;
}

async function main() {
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('id, source, amount, description, date, unique_key, external_id, created_at, user_id')
    .eq('user_id', TARGET_USER)
    .eq('source', 'csob')
    .gte('created_at', '2026-09-24T07:09:00Z')
    .lte('created_at', '2026-09-24T07:09:30Z')
    .order('created_at', { ascending: true });

  if (error) throw error;
  console.log('Candidates in window:', rows?.length ?? 0);
  for (const r of rows ?? []) {
    console.log(
      `  ${r.id} amt=${r.amount} ${String(r.description).slice(0, 50)} created=${r.created_at}`,
    );
  }

  const toFix = (rows ?? []).filter((r) => {
    const a = Math.abs(Number(r.amount));
    return (
      Math.abs(a - 50) < 0.01 || Math.abs(a - 11.8) < 0.01 || Math.abs(a - 24) < 0.01
    );
  });

  if (toFix.length !== 3) {
    console.error(`Expected 3 rows to fix, got ${toFix.length}`);
    process.exit(1);
  }

  for (const r of toFix) {
    const txId = extractTxId(r.unique_key, r.external_id);
    const newUk = buildTransactionUniqueKey({
      userId: r.user_id,
      bank: 'moneta',
      date: r.date,
      amount: Number(r.amount),
      description: r.description ?? '',
      bankTransactionId: txId,
    });
    const newEx = buildBankExternalId('moneta', txId);
    const { error: upErr } = await supabase
      .from('transactions')
      .update({
        source: 'moneta',
        unique_key: newUk,
        ...(newEx ? { external_id: newEx } : {}),
      })
      .eq('id', r.id);
    if (upErr) throw upErr;
    console.log('OK', r.id, '→ moneta', { txId, newUk, newEx });
  }

  const { count: csobCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER)
    .eq('source', 'csob');
  const { count: monetaCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', TARGET_USER)
    .eq('source', 'moneta');
  console.log({ csobCount, monetaCount });
}

await main();
