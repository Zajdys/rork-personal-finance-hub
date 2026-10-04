/**
 * Self-test: MONETA Money Bank PDF plain-text parser.
 * Run: bun scripts/moneta-pdf-parse-selftest.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

const {
  isMonetaPdfText,
  parseMoneta,
  monetaTransactionsToImportRows,
  extractMonetaStatementMeta,
  validateMonetaParse,
} = await import('../lib/moneta-pdf-parse.ts');
const { normalizeMerchantKey } = await import('../lib/normalize-merchant-key.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

const RAW = join(import.meta.dir, 'fixtures/bank-pdf-raw');
const text = readFileSync(join(RAW, 'moneta-Statement.txt'), 'utf8');

console.log('=== MONETA PDF parser self-test ===');

assert(isMonetaPdfText(text), 'detect moneta');

const txs = parseMoneta(text);
const rows = monetaTransactionsToImportRows(txs);
console.log('Tx count:', txs.length);
for (const t of txs) {
  console.log(
    `  ${t.bookingDate}→${t.date} ${t.type} ${t.amount} | ${t.txType} | ${t.merchant} | id=${t.transactionId}`,
  );
}

assert(txs.length === 3, `expected 3 txs, got ${txs.length}`);

const transfer = txs.find((t) => t.amount === 50 && t.type === 'income');
assert(!!transfer, 'transfer +50');
assert(transfer!.bookingDate === '2026-07-20', `transfer booking ${transfer!.bookingDate}`);
assert(transfer!.date === '2026-07-21', `transfer date ${transfer!.date}`);
assert(
  transfer!.accountNumber.includes('767628004') && transfer!.bankCode === '5500',
  'counterparty account',
);
assert(/Jan Hájek/i.test(transfer!.merchant), 'counterparty name');

const kaufland = txs.find((t) => /KAUFLAND/i.test(t.merchant));
assert(!!kaufland, 'kaufland');
assert(kaufland!.amount === 11.8 && kaufland!.type === 'expense', 'kaufland amount');
assert(kaufland!.bookingDate === '2026-07-21', 'kaufland booking');
assert(kaufland!.date === '2026-07-23', 'kaufland posting');
assert(!/PLATBA KARTOU/i.test(kaufland!.merchant), 'merchant ≠ op type');

const radka = txs.find((t) => /RADKA/i.test(t.merchant));
assert(!!radka, 'radka');
assert(radka!.amount === 24 && radka!.type === 'expense', 'radka amount');
assert(
  normalizeMerchantKey(radka!.merchant) === 'RADKA STEFLOVA',
  `merchant_key ${normalizeMerchantKey(radka!.merchant)}`,
);

// DI: nesmí vytvořit 4. transakci
assert(!txs.some((t) => /^DI:/i.test(t.merchant)), 'no DI txn');

const transferRow = rows.find((r) => r.amount === 50 && r.type === 'income');
assert(transferRow?.category === 'Převod', 'transfer → Převod');
assert(transferRow?.counterpartyAccount === '767628004/5500', 'cp account normalized');
assert(transferRow?.bankTransactionId === '2607206260662771', 'bankTransactionId');

const kauflandRow = rows.find((r) => /KAUFLAND/i.test(r.description));
assert(kauflandRow?.category === 'Jídlo a nápoje', `kaufland cat ${kauflandRow?.category}`);

const meta = extractMonetaStatementMeta(text);
console.log('Meta:', meta);
assert(approx(meta.openingBalance ?? -1, 0), `opening ${meta.openingBalance}`);
assert(approx(meta.closingBalance ?? -1, 14.2), `closing ${meta.closingBalance}`);
assert(approx(meta.credited ?? -1, 50), `credited ${meta.credited}`);
assert(approx(meta.debited ?? -1, 35.8), `debited ${meta.debited}`);
assert(meta.declaredTxnCount === 3, `declared count ${meta.declaredTxnCount}`);

const check = validateMonetaParse(rows, meta);
console.log('Validation:', check);
assert(check.ok, 'balance/count validation');

// CS labels smoke (synthetic)
const csSnippet = `
MONETA Money Bank, a. s.
Výpis z běžného účtu
AGBACZPP
283199805 / 0600
Počáteční zůstatek:
Konečný zůstatek:
0,00
14,20
Obrat kredit:
Obrat debet:
50,00
-35,80
Přehled transakcí
20.07.2026
767628004/5500
2607206260662771
50,00
Jan Hájek
21.07.2026
21.07.2026
Celkový počet transakcí: 1
`;
assert(isMonetaPdfText(csSnippet), 'detect CS labels');
const csMeta = extractMonetaStatementMeta(csSnippet);
assert(approx(csMeta.openingBalance ?? -1, 0), 'CS opening');
assert(approx(csMeta.closingBalance ?? -1, 14.2), 'CS closing');
assert(approx(csMeta.credited ?? -1, 50), 'CS credit');
assert(approx(csMeta.debited ?? -1, 35.8), 'CS debit');
assert(csMeta.declaredTxnCount === 1, 'CS count');
const csTx = parseMoneta(csSnippet);
assert(csTx.length === 1 && csTx[0]!.amount === 50, 'CS parse 1 transfer');

console.log('OK');
