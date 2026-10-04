/**
 * Self-test: mBank CZ CSV parser (hlavička + CP1250 + středník).
 * Run: bun scripts/mbank-csv-parse-selftest.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

const {
  isMbankCzCsvText,
  parseMbankCzCsv,
  extractMbankStatementMeta,
  validateMbankParse,
  parseMbankMessageField,
  normalizeMbankAccount,
  extractMbankTransactionTable,
} = await import('../lib/mbank-csv-parse.ts');
const { parseBankStatementCsv, parseTransactionDate, decodeCsvBytes } = await import(
  '../lib/bank-statement-parser.ts'
);
const { normalizeMerchantKey } = await import('../lib/normalize-merchant-key.ts');
const { lookupMerchantDictionary } = await import('../lib/merchant-dictionary.ts');
const { classifyImportRow } = await import('../lib/classify-import-category.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
function approx(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

const FIX = join(import.meta.dir, 'fixtures/bank-csv');
const utf8 = readFileSync(join(FIX, 'mbank.csv'), 'utf8');
const cp1250Bytes = readFileSync(join(FIX, 'mbank-cp1250.csv'));

console.log('=== mBank CSV parser self-test ===');

assert(isMbankCzCsvText(utf8), 'detect utf8');
assert(parseTransactionDate('20-07-2026')?.getDate() === 20, 'DD-MM-YYYY dash');

const msg = parseMbankMessageField(
  'Trafika Kaufland   /PLZEN - JI                                        DATUM PROVEDENÍ TRANSAKCE: 2026-07-21',
);
assert(msg.merchant === 'Trafika Kaufland', `merchant ${msg.merchant}`);
assert(msg.bookingFromMessage === '2026-07-21', `booking msg ${msg.bookingFromMessage}`);
assert(normalizeMerchantKey(msg.merchant) === 'TRAFIKA KAUFLAND', 'merchant_key trafika');
assert(lookupMerchantDictionary('TRAFIKA KAUFLAND') === 'Nákupy', 'trafika → Nákupy');

assert(
  normalizeMbankAccount("'000000-0767628004/5500'") === '767628004/5500',
  'account normalize',
);
assert(normalizeMbankAccount("''") == null, 'empty account');

const table = extractMbankTransactionTable(utf8);
assert(!!table && table.startsWith('#Datum zaúčtování'), 'table extract');
assert(!table!.includes('mBank S.A.'), 'header stripped');
assert(!/#Konečný zůstatek/i.test(table!), 'footer stripped');

const OWNERS = ['767628004/5500', '670100-2231759259/6210'];
const parsed = parseMbankCzCsv(utf8, OWNERS);
assert(!('error' in parsed), `parse error: ${'error' in parsed ? parsed.error : ''}`);
if ('error' in parsed) throw new Error(parsed.error);

const { rows } = parsed;
console.log('Rows:', rows.length);
for (const r of rows) {
  console.log(
    `  ${r.date} ${r.type} ${r.amount} | ${r.category} | ${r.description.slice(0, 50)} | cp=${r.counterpartyAccount ?? ''}`,
  );
}

assert(rows.length === 9, `expected 9, got ${rows.length}`);
assert(!rows.some((r) => /z[řr][íi]zen/i.test(r.description)), 'no zřízení');

const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
assert(approx(income, 1000), `income ${income}`);
assert(approx(expense, 635.3), `expense ${expense}`);

const transfers = rows.filter((r) => r.amount === 500 && r.type === 'income');
assert(transfers.length === 2, '2× +500');
assert(
  transfers.every((r) => r.category === 'Převod' && r.counterpartyAccount === '767628004/5500'),
  'transfers → Převod + account',
);

const trafika = rows.find((r) => /trafika/i.test(r.description) && r.amount === 160);
assert(!!trafika, 'trafika');
assert(trafika!.bookingDate === '2026-07-21', `trafika booking ${trafika!.bookingDate}`);

// classify path (modal) → Nákupy / Jídlo
const classified = rows.map((r) =>
  classifyImportRow(
    {
      description: r.description,
      amount: r.rawAmount,
      type: r.type,
      category: r.category,
      counterpartyAccount: r.counterpartyAccount,
      counterpartyName: r.counterpartyName,
    },
    {},
  ),
);
const trafikaCat = classified.find((c) => /TRAFIKA/i.test(c.merchantKey ?? c.description));
assert(trafikaCat?.category === 'Nákupy', `trafika cat ${trafikaCat?.category}`);

const kaufland = classified.find(
  (c) => c.merchantKey === 'KAUFLAND' || /KAUFLAND CZ/i.test(c.description),
);
assert(kaufland?.category === 'Jídlo a nápoje', `kaufland ${kaufland?.category}`);

const lidl = classified.find((c) => c.merchantKey === 'LIDL');
assert(lidl?.category === 'Jídlo a nápoje', `lidl ${lidl?.category}`);

const globus = classified.find((c) => c.merchantKey === 'GLOBUS');
assert(globus?.category === 'Jídlo a nápoje', `globus ${globus?.category}`);

const meta = extractMbankStatementMeta(utf8);
assert(approx(meta.openingBalance ?? -1, 0), `opening ${meta.openingBalance}`);
assert(approx(meta.closingBalance ?? -1, 364.7), `closing ${meta.closingBalance}`);
assert(approx(meta.credited ?? -1, 1000), `credited ${meta.credited}`);
assert(approx(meta.debited ?? -1, 635.3), `debited ${meta.debited}`);
assert(meta.declaredRowCount === 10, `declared count ${meta.declaredRowCount}`);
assert(validateMbankParse(rows, meta).ok, 'validation');

// Via parseBankStatementCsv
const via = parseBankStatementCsv(utf8, OWNERS);
assert(!('error' in via) && via.bank.id === 'mbank' && via.rows.length === 9, 'via main parser');

// CP1250 raw → decodeCsvBytes must pick Windows-1250 (diacritics in header)
const decoded = decodeCsvBytes(new Uint8Array(cp1250Bytes));
assert(/VÝPIS\s+Z\s+ÚČTU/i.test(decoded), 'cp1250 decode diacritics');
assert(/zaúčtování/i.test(decoded), 'cp1250 table header');
const fromCp = parseBankStatementCsv(decoded, OWNERS);
assert(!('error' in fromCp) && fromCp.rows.length === 9, 'parse from cp1250 decode');

console.log('OK');
