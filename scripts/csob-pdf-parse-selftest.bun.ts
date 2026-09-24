/**
 * Self-test: produkční Edge ČSOB new-format parser (parseCsobNewFormat)
 * proti reálným pdfjs raw fixtures (scripts/fixtures/bank-pdf-raw/*_MCZB.txt).
 *
 * Run: bun scripts/csob-pdf-parse-selftest.bun.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  csobPlainTextToLines,
  extractCsobStatementMeta,
  isCsobNewFormat,
  parseCsobLinesToImportRows,
  parseCsobNewFormat,
  parseCsobPdfPlainText,
  validateCsobParse,
} from '../supabase/functions/parse-bank-pdf-v2/csob-pdf-parse.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

const rawDir = join(import.meta.dir, 'fixtures/bank-pdf-raw');
const OWNERS = ['767628004/5500', '363468155/0300', '110125955/0100', '3672144019/3030'];

console.log('=== Edge ČSOB parseCsobNewFormat self-test (real fixtures) ===');

const mczbFiles = readdirSync(rawDir)
  .filter((n) => n.startsWith('363468155_') && n.endsWith('.txt'))
  .sort();
assert(mczbFiles.length >= 9, `need >=9 MCZB fixtures, got ${mczbFiles.length}`);

let totalN = 0;
let totalInc = 0;
let totalExp = 0;

for (const f of mczbFiles) {
  const text = readFileSync(join(rawDir, f), 'utf8');
  assert(/Československá obchodní banka/i.test(text), `${f} bank header`);
  assert(/363468155/.test(text), `${f} account`);

  const lines = csobPlainTextToLines(text);
  assert(isCsobNewFormat(lines), `${f} must detect new-format (DD.MM. lines)`);

  const rows = parseCsobNewFormat(lines, undefined, OWNERS);
  const meta = extractCsobStatementMeta(lines);
  const check = validateCsobParse(rows, meta);
  console.log(
    `  ${f}: ${rows.length} txs (expected ${meta.expectedTotal}) ok=${check.ok}`,
  );
  assert(check.ok, `${f} statement validation failed ${JSON.stringify(check)}`);
  assert(
    rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.amount > 0),
    `${f} row shape`,
  );
  const viaRouter = parseCsobPdfPlainText(text, undefined, OWNERS);
  assert(viaRouter.length === rows.length, `${f} parseCsobPdfPlainText length mismatch`);

  totalN += rows.length;
  totalInc += rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  totalExp += rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
}

assert(totalN === 127, `all months expected 127 txs, got ${totalN}`);
assert(approx(totalInc, 22464.38), `total income ${totalInc}`);
assert(approx(totalExp, 22464.38), `total expense ${totalExp}`);

/** Květen 2026 */
console.log('--- May 2026 concrete txs ---');
const mayText = readFileSync(join(rawDir, '363468155_20260531_5_MCZB.txt'), 'utf8');
const may = parseCsobNewFormat(csobPlainTextToLines(mayText), undefined, OWNERS);
assert(may.length === 18, `May expected 18 txs, got ${may.length}`);

const out40 = may.find((r) => r.date === '2026-05-04' && approx(r.rawAmount, -40));
assert(!!out40, 'May 04.05. Odchozí -40');

const in1000 = may.find((r) => r.date === '2026-05-16' && approx(r.rawAmount, 1000));
assert(!!in1000 && in1000.type === 'income', 'May 16.05. Příchozí +1000');
assert(in1000!.category === 'Převod', 'May +1000 own account → Převod');

const albert36 = may.find(
  (r) =>
    r.date === '2026-05-18' &&
    approx(Math.abs(r.rawAmount), 36.8) &&
    /ALBERT/i.test(r.description),
);
assert(!!albert36 && albert36.rawAmount < 0, 'May Albert -36.80 via Místo');

/** Leden 2026 — dříve 0 txs při skipu vlastních příjmů */
console.log('--- Jan 2026 ---');
const jan = parseCsobNewFormat(
  csobPlainTextToLines(readFileSync(join(rawDir, '363468155_20260131_1_MCZB.txt'), 'utf8')),
  undefined,
  OWNERS,
);
assert(jan.length === 14, `Jan expected 14, got ${jan.length}`);
assert(
  jan.some((r) => /Odměna za platby kartou/i.test(r.description) && approx(r.amount, 500)),
  'Jan Odměna 500',
);

/** Únor — vratka notino */
console.log('--- Feb 2026 refund ---');
const feb = parseCsobNewFormat(
  csobPlainTextToLines(readFileSync(join(rawDir, '363468155_20260228_2_MCZB.txt'), 'utf8')),
  undefined,
  OWNERS,
);
const notinoRefund = feb.find(
  (r) => r.isRefund && approx(r.amount, 2498) && /notino/i.test(r.description),
);
assert(!!notinoRefund, 'Feb notino refund is_refund');

/** Prosinec — záporný úrok + one-line amount regression */
console.log('--- Dec 2026 interest + one-line amount ---');
const dec = parseCsobNewFormat(
  csobPlainTextToLines(readFileSync(join(rawDir, '363468155_20251231_2_MCZB.txt'), 'utf8')),
  undefined,
  OWNERS,
);
const fee = dec.find((r) => r.category === 'Bankovní poplatky' && approx(r.amount, 0.01));
assert(!!fee, 'Dec negative interest → Bankovní poplatky');
assert(
  !dec.some((r) => /Změna úrokové/i.test(r.description)),
  'Dec rate-change must not create tx',
);

const oneLine = parseCsobLinesToImportRows(
  csobPlainTextToLines(`
VÝPIS 2025
07.12. Příchozí úhrada okamžitá   Jan Hájek   42   1 115,00   1 115,50
767628004/5500
20.12. Nezpoplatněný převod  60  500,00  1 615,50
900016347
Odměna za platby kartou
`),
  OWNERS,
);
const in1115 = oneLine.find((r) => approx(r.amount, 1115));
assert(!!in1115, 'one-line Příchozí 1115 parsed (not skipped)');
const reward500 = oneLine.find(
  (r) => approx(r.amount, 500) && /Odměna/i.test(r.description),
);
assert(!!reward500, 'one-line Odměna 500 (not 60500)');
assert(!oneLine.some((r) => approx(r.amount, 60500)), 'txn-id must not glue into amount');

console.log('=== ALL EDGE CSOB NEW-FORMAT SELF-TEST PASSED ===');
