/**
 * Self-test: Komerční banka PDF parser.
 * Uses real pdfjs fixtures from scripts/fixtures/bank-pdf-raw/.
 * Run: bun scripts/kb-pdf-parse-selftest.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const { parseKbPdfPlainText, isKbPdfText } = await import('../lib/kb-pdf-parse.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const FIXTURE_KB_SYN = `
Komerční banka, a. s., se sídlem: Praha 1, Na Příkopě 33 čp. 969, PSČ 114 07
Code: VYPIS1_NDB
Datum výpisu 21. 6. 2026

Transakce

4. 5. 2026
ORION PLZEN
483053******8161
- 198,00 Kč

Datum provedení
Kód transakce
Typ transakce
Variabilní symbol
Specifický symbol
Konstantní symbol

3. 5. 2026
5164265507
Mobilní platba
-
-
-

5. 5. 2026
Temu.com
483053******8161
- 165,00 Kč

Datum provedení
Kód transakce
Typ transakce

4. 5. 2026
5164265508
Nákup na internetu
-
-
-

5. 5. 2026
Jan Hájek
767628004/5500
100,00 Kč

Datum provedení
Kód transakce
Typ transakce

5. 5. 2026
5164265509
Příchozí úhrada
-
-
-
`.trim();

console.log('=== KB PDF parser self-test ===');

assert(isKbPdfText(FIXTURE_KB_SYN), 'isKbPdfText synthetic');
assert(!isKbPdfText('Raiffeisenbank a.s. RZBCCZPP'), 'no FP on RB');

const syn = parseKbPdfPlainText(FIXTURE_KB_SYN);
console.log('Parsed synthetic:', syn.length);
for (const r of syn) console.log(`  ${r.date} ${r.rawAmount} | ${r.description}`);
assert(syn.length >= 2, `synthetic rows ${syn.length}`);
assert(syn.some((r) => /ORION/i.test(r.description) && r.rawAmount === -198), 'ORION -198');
assert(syn.some((r) => /Temu/i.test(r.description)), 'Temu');
assert(syn.some((r) => r.rawAmount === 100 && r.type === 'income'), 'income 100');

const realPath = join(import.meta.dir, 'fixtures/bank-pdf-raw/Vypis_110125955_20260501_20260531.txt');
assert(existsSync(realPath), 'KB May 2026 fixture missing');

const text = readFileSync(realPath, 'utf8');
assert(isKbPdfText(text), 'isKbPdfText real');
const rows = parseKbPdfPlainText(text);
console.log('Parsed real May 2026:', rows.length);
assert(rows.length >= 20, `real expected many txs, got ${rows.length}`);
assert(rows.some((r) => /ORION/i.test(r.description)), 'ORION present');
assert(rows.some((r) => /Temu/i.test(r.description)), 'Temu present');
assert(
  rows.some((r) => r.type === 'income' && r.rawAmount > 0),
  'has income',
);
assert(
  rows.some((r) => r.type === 'expense' && r.rawAmount < 0),
  'has expense',
);
assert(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)), 'dates iso');

console.log('=== ALL KB PDF SELF-TEST PASSED ===');
