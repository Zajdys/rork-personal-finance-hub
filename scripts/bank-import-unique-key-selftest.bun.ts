/**
 * Self-test: bank import unique_key fingerprint.
 * Run: bun scripts/bank-import-unique-key-selftest.bun.ts
 */
import {
  buildBankExternalId,
  buildTransactionUniqueKey,
  normalizeImportDescription,
} from '../lib/bank-import-unique-key.ts';
import { parseRaiffeisenPdfPlainText } from '../supabase/functions/parse-bank-pdf-v2/raiffeisen-pdf-parse.ts';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const userId = '11111111-1111-1111-1111-111111111111';

const composite = buildTransactionUniqueKey({
  userId,
  bank: 'raiffeisenbank',
  date: '2026-03-26',
  amount: 79,
  description: '  Apple  ',
});
assert(
  composite === `${userId}|raiffeisenbank|2026-03-26|79.00|apple`,
  `composite key: ${composite}`,
);

const withTx = buildTransactionUniqueKey({
  userId,
  bank: 'raiffeisenbank',
  date: '2026-03-26',
  amount: 79,
  description: 'Apple',
  bankTransactionId: '8766206825',
});
assert(
  withTx === `${userId}|raiffeisenbank|txid:8766206825`,
  `txid key: ${withTx}`,
);

assert(
  buildBankExternalId('raiffeisenbank', '8766206825') === 'raiffeisenbank:8766206825',
  'external_id prefix',
);
assert(normalizeImportDescription('  YouTube   Premium ') === 'youtube premium', 'normalize');

// Same fingerprint across two calls (stability)
assert(
  buildTransactionUniqueKey({
    userId,
    bank: 'csob',
    date: '2026-01-15',
    amount: 100.5,
    description: 'Albert',
  }) ===
    buildTransactionUniqueKey({
      userId,
      bank: 'csob',
      date: '2026-01-15',
      amount: 100.5,
      description: 'Albert',
    }),
  'stable',
);

const rawDir = join(import.meta.dir, 'fixtures/bank-pdf-raw');
const rbFiles = readdirSync(rawDir).filter(
  (n) => n.startsWith('Vypis_0767628004') && n.endsWith('.txt'),
);
assert(rbFiles.length >= 1, 'RB fixtures present');

let withCode = 0;
for (const f of rbFiles) {
  const rows = parseRaiffeisenPdfPlainText(readFileSync(join(rawDir, f), 'utf8'));
  for (const r of rows) {
    if (r.bankTransactionId) {
      withCode++;
      assert(/^\d{8,12}$/.test(r.bankTransactionId), `RB code shape ${r.bankTransactionId}`);
    }
  }
}
assert(withCode > 0, `RB parser should expose bankTransactionId (got ${withCode})`);

console.log('OK bank-import-unique-key-selftest');
