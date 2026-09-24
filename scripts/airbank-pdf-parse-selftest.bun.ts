/**
 * Self-test: Air Bank PDF plain-text parser (reálné fixture z Downloads/Airbank1).
 * Run: bun scripts/airbank-pdf-parse-selftest.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

const {
  isAirBankPdfText,
  parseAirBank,
  airBankTransactionsToImportRows,
  extractAirBankStatementMeta,
  validateAirBankParse,
  isAirBankEmptyStatement,
} = await import('../lib/airbank-pdf-parse.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

const RAW = join(import.meta.dir, 'fixtures/bank-pdf-raw');
const june = readFileSync(join(RAW, 'airbank-PDF-document-3.txt'), 'utf8');
const july = readFileSync(join(RAW, 'airbank-PDF-document-2.txt'), 'utf8');
const august = readFileSync(join(RAW, 'airbank-PDF-document.txt'), 'utf8');

console.log('=== Air Bank PDF parser self-test ===');

assert(isAirBankPdfText(june), 'detect june');
assert(isAirBankPdfText(july), 'detect july');
assert(isAirBankPdfText(august), 'detect august');

// --- výpis 1 (25.–30. 6.): 6 tx, příjmy 2500, výdaje 1414 ---
const juneTx = parseAirBank(june);
const juneRows = airBankTransactionsToImportRows(juneTx, ['110125955/0100', '3672144019/3030']);
console.log('June:', juneTx.length);
for (const t of juneTx) console.log(`  ${t.date} ${t.type} ${t.amount} | ${t.merchant}`);
assert(juneTx.length === 6, `june expected 6, got ${juneTx.length}`);
assert(
  juneTx.some((t) => /přidání peněz kartou/i.test(t.txType) && t.amount === 1000),
  'card top-up 1000',
);
assert(
  juneRows.some((r) => /přidání peněz kartou/i.test(r.description) && r.category === 'Převod'),
  'top-up → Převod',
);
assert(
  juneTx.some((t) => /odměna/i.test(t.txType) && t.amount === 500),
  'odměna 500',
);
assert(
  juneRows.some((r) => /odměna/i.test(r.description) && r.category === 'Ostatní' && r.type === 'income'),
  'odměna → Ostatní',
);
assert(
  juneTx.some((t) => /RADKA STEFLOVA/i.test(t.merchant) && t.amount === 115),
  'card merchant from Detaily',
);
assert(
  !juneTx.some((t) => /platba kartou/i.test(t.txType) && /^Jan Hájek$/i.test(t.merchant)),
  'holder never merchant',
);
const juneMeta = extractAirBankStatementMeta(june);
assert(approx(juneMeta.credited ?? -1, 2500), `credited ${juneMeta.credited}`);
assert(approx(juneMeta.debited ?? -1, 1414), `debited ${juneMeta.debited}`);
assert(validateAirBankParse(juneRows, juneMeta).ok, 'june balance ok');

// --- výpis 2 (7/2026): 10 tx napříč 2 stránkami, výdaje 1083.90 ---
const julyTx = parseAirBank(july);
const julyRows = airBankTransactionsToImportRows(julyTx);
console.log('July:', julyTx.length);
for (const t of julyTx) console.log(`  ${t.date} ${t.type} ${t.amount} | ${t.merchant}`);
assert(julyTx.length === 10, `july expected 10, got ${julyTx.length}`);
assert(
  julyTx.some((t) => t.date === '2026-07-14' && t.amount === 14),
  'page 2 AUTOBUSY',
);
assert(
  julyTx.filter((t) => /platba kartou/i.test(t.txType)).every((t) => !/^Jan Hájek$/i.test(t.merchant)),
  'no holder as merchant in july',
);
assert(
  julyTx.some((t) => /POTRAVINY LANHUNG/i.test(t.merchant)),
  'LANHUNG from details L1',
);
assert(
  julyTx.some((t) => /RADKA STEFLOVA/i.test(t.merchant) && t.amount === 24),
  'multiline details still finds amount',
);
const julyMeta = extractAirBankStatementMeta(july);
assert(approx(julyMeta.openingBalance ?? -1, 1086), 'july opening');
assert(approx(julyMeta.closingBalance ?? -1, 2.1), 'july closing');
assert(approx(julyMeta.debited ?? -1, 1083.9), 'july debited');
const julyCheck = validateAirBankParse(julyRows, julyMeta);
assert(julyCheck.ok, `july balance ok ${JSON.stringify(julyCheck)}`);

// Simulace starého bugu: jen 200 Kč → kontrola musí selhat
const incomplete = validateAirBankParse(
  julyRows.filter((r) => r.amount === 200).slice(0, 1),
  julyMeta,
);
assert(!incomplete.ok, 'incomplete 200 Kč must fail balance check');

// --- výpis 3 (8/2026): prázdný ---
const augTx = parseAirBank(august);
assert(augTx.length === 0, 'august 0 txs');
assert(isAirBankEmptyStatement(august, 0), 'august empty ok');
const augMeta = extractAirBankStatementMeta(august);
assert(approx(augMeta.openingBalance ?? -1, 2.1), 'aug opening');
assert(approx(augMeta.closingBalance ?? -1, 2.1), 'aug closing');

console.log('=== ALL AIR BANK PDF SELF-TEST PASSED ===');
