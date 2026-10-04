/**
 * Self-test: bank-import-source mapping (žádný tichý fallback na csob).
 * Run: bun scripts/bank-import-source-selftest.bun.ts
 */
import './selftest-mocks.ts';

const {
  resolvePdfImportSource,
  csvBankIdToSource,
  PDF_IMPORT_SOURCES,
  CSV_IMPORT_SOURCES,
} = await import('../lib/bank-import-source.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function throws(fn: () => unknown, msg: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, msg);
}

console.log('=== bank-import-source self-test ===');

for (const s of PDF_IMPORT_SOURCES) {
  assert(resolvePdfImportSource(s) === s, `pdf ${s}`);
}
assert(resolvePdfImportSource('MONETA') === 'moneta', 'case');
throws(() => resolvePdfImportSource('csobx'), 'unknown pdf throws');
throws(() => resolvePdfImportSource(undefined), 'empty pdf throws');
throws(() => resolvePdfImportSource('mbank'), 'mbank is CSV-only for resolvePdf');

assert(csvBankIdToSource('rb') === 'raiffeisenbank', 'rb→raiffeisenbank');
assert(csvBankIdToSource('moneta') === 'moneta', 'csv moneta');
assert(csvBankIdToSource('mbank') === 'mbank', 'csv mbank');
assert(csvBankIdToSource('revolut') === 'revolut', 'csv revolut');
assert(csvBankIdToSource('cs') === 'cs', 'csv cs');
assert(csvBankIdToSource('fio') === 'fio', 'csv fio');
throws(() => csvBankIdToSource('airbank'), 'airbank not in CSV formats throws');
throws(() => csvBankIdToSource('unknown'), 'unknown csv throws');

assert(CSV_IMPORT_SOURCES.includes('mbank'), 'mbank in CSV list');
assert(CSV_IMPORT_SOURCES.includes('revolut'), 'revolut in CSV list');
assert(PDF_IMPORT_SOURCES.includes('moneta'), 'moneta in PDF list');
assert(PDF_IMPORT_SOURCES.includes('airbank'), 'airbank in PDF list');
assert(PDF_IMPORT_SOURCES.includes('cs'), 'cs in PDF list');
assert(!PDF_IMPORT_SOURCES.includes('mbank' as never), 'mbank not in PDF list');

console.log('OK');
