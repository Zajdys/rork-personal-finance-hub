/**
 * Self-test: Czech plural helpers.
 * Run: bun scripts/plural-cs-selftest.bun.ts
 */
import {
  formatInvestImportSummary,
  pluralPozice,
  pluralPrevod,
  pluralSoubor,
  pluralTransakce,
} from '../lib/plural-cs';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

console.log('=== plural-cs self-test ===');

assert(pluralSoubor(1) === 'soubor', '1 soubor');
assert(pluralSoubor(2) === 'soubory', '2 soubory');
assert(pluralSoubor(5) === 'souborů', '5 souborů');
assert(pluralSoubor(12) === 'souborů', '12 souborů');

assert(pluralTransakce(1) === 'transakce', '1 transakce');
assert(pluralTransakce(3) === 'transakce', '3 transakce');
assert(pluralTransakce(5) === 'transakcí', '5 transakcí');

assert(pluralPozice(1) === 'pozice', '1 pozice');
assert(pluralPozice(5) === 'pozic', '5 pozic');

assert(pluralPrevod(1) === 'převod', '1 převod');
assert(pluralPrevod(2) === 'převody', '2 převody');
assert(pluralPrevod(5) === 'převodů', '5 převodů');

const zero = formatInvestImportSummary({ files: 1, newTx: 0, positions: 2 });
assert(zero.includes('Nic nového'), `zero new: ${zero}`);

const ok = formatInvestImportSummary({ files: 2, newTx: 3, positions: 1 });
assert(ok.includes('2 soubory'), ok);
assert(ok.includes('3 nové transakce'), ok);
assert(ok.includes('1 pozice'), ok);

console.log('OK');
