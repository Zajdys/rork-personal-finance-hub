/**
 * Self-test: bank-statement-parser CSV auto-detection (Fio/ČSOB/ČS/KB/RB/Moneta/mBank).
 * Fixtures: scripts/fixtures/bank-csv/*.csv (hlavičky dle reálných exportů + vzorky transakcí).
 * Run: bun scripts/bank-statement-parser-selftest.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const {
  BANK_FORMATS,
  detectBankFormat,
  parseBankStatementCsv,
  parseAmount,
  parseTransactionDate,
} = await import('../lib/bank-statement-parser.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

console.log('=== bank-statement-parser CSV self-test ===');

assert(BANK_FORMATS.map((b) => b.id).join(',') === 'fio,csob,cs,kb,rb,moneta,mbank,revolut', 'format ids');

assert(parseAmount('1 234,56') === 1234.56, 'parseAmount cz');
assert(parseAmount('-36,80') === -36.8, 'parseAmount neg');
assert(parseTransactionDate('01.02.2026')?.getFullYear() === 2026, 'parseDate dmy');

const expected: Record<string, string> = {
  fio: 'fio',
  csob: 'csob',
  cs: 'cs',
  kb: 'kb',
  rb: 'rb',
  moneta: 'moneta',
  mbank: 'mbank',
  revolut: 'revolut',
};

const dir = join(import.meta.dir, 'fixtures/bank-csv');
const files = readdirSync(dir)
  .filter((n) => n.endsWith('.csv') && !n.includes('-cp1250'))
  .sort();
assert(files.length === 8, `expected 8 csv fixtures, got ${files.length}: ${files.join(',')}`);

for (const [fileId, bankId] of Object.entries(expected)) {
  const text = readFileSync(join(dir, `${fileId}.csv`), 'utf8');

  if (bankId === 'mbank') {
    // mBank CZ: detekce z celého textu (hlavička ≠ 1. řádek tabulky)
    const parsed = parseBankStatementCsv(text, ['767628004/5500']);
    assert(!('error' in parsed), `mbank parse error: ${'error' in parsed ? parsed.error : ''}`);
    if ('error' in parsed) continue;
    assert(parsed.bank.id === 'mbank', 'mbank bank id');
    assert(parsed.rows.length === 9, `mbank rows ${parsed.rows.length}`);
    assert(
      parsed.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.amount > 0),
      'mbank row shape',
    );
    assert(
      parsed.rows.some((r) => r.type === 'expense') && parsed.rows.some((r) => r.type === 'income'),
      'mbank expense+income',
    );
    console.log(`  ${bankId}: ${parsed.rows.length} rows OK`);
    continue;
  }

  if (bankId === 'revolut') {
    const parsed = parseBankStatementCsv(text);
    assert(!('error' in parsed), `revolut parse error: ${'error' in parsed ? parsed.error : ''}`);
    if ('error' in parsed) continue;
    assert(parsed.bank.id === 'revolut', 'revolut bank id');
    assert(parsed.rows.length >= 1, `revolut rows ${parsed.rows.length}`);
    assert(
      parsed.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.amount > 0),
      'revolut row shape',
    );
    console.log(`  ${bankId}: ${parsed.rows.length} rows OK`);
    continue;
  }

  const header = text.split(/\r?\n/)[0]!.split(/[,;]/);
  const detected = detectBankFormat(header);
  assert(detected?.id === bankId, `${fileId} detect got ${detected?.id}`);

  const parsed = parseBankStatementCsv(text);
  assert(!('error' in parsed), `${fileId} parse error: ${'error' in parsed ? parsed.error : ''}`);
  if ('error' in parsed) continue;
  assert(parsed.bank.id === bankId, `${fileId} bank id`);
  assert(parsed.rows.length >= 2, `${fileId} rows ${parsed.rows.length}`);
  assert(
    parsed.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.amount > 0),
    `${fileId} row shape`,
  );
  assert(
    parsed.rows.some((r) => r.type === 'expense') && parsed.rows.some((r) => r.type === 'income'),
    `${fileId} expense+income`,
  );
  console.log(`  ${bankId}: ${parsed.rows.length} rows OK`);
}

// Cross-check: wrong headers → null / error
assert(detectBankFormat(['Foo', 'Bar', 'Baz']) === null, 'unknown headers');
const bad = parseBankStatementCsv('Foo,Bar\n1,2\n');
assert('error' in bad, 'unknown csv should error');

// Fio Albert → Jídlo bucket
const fio = parseBankStatementCsv(readFileSync(join(dir, 'fio.csv'), 'utf8'));
if (!('error' in fio)) {
  const albert = fio.rows.find((r) => /Albert/i.test(r.description));
  assert(albert?.bucket === 'Jídlo', `fio Albert bucket ${albert?.bucket}`);
  assert(albert?.type === 'expense', 'fio Albert expense');
}

// KB ORION from real May statement sample
const kb = parseBankStatementCsv(readFileSync(join(dir, 'kb.csv'), 'utf8'));
if (!('error' in kb)) {
  assert(kb.rows.some((r) => /ORION/i.test(r.description)), 'kb ORION');
}

// ČS telefon / mzda
const cs = parseBankStatementCsv(readFileSync(join(dir, 'cs.csv'), 'utf8'));
if (!('error' in cs)) {
  assert(cs.rows.some((r) => /Telefon/i.test(r.description) && r.type === 'expense'), 'cs telefon');
  assert(cs.rows.some((r) => /Mzda/i.test(r.description) && r.type === 'income'), 'cs mzda');
}

console.log('=== ALL BANK-STATEMENT CSV SELF-TEST PASSED ===');
