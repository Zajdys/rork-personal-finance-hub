/**
 * Self-test: eToro Account Statement XLSX → open positions.
 * Run: bun scripts/etoro-parser-selftest.bun.ts
 *
 * Fixture: scripts/fixtures/etoro/account-statement-2026-01-to-06.xlsx
 * (reálný export 1.1.–26.6.2026, který appka už zpracovala).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { parseEtoroXlsx, summarizeEtoroPortfolio } from '../lib/etoro-parser.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.05) {
  return Math.abs(a - b) <= eps;
}

/** Minimální „Aktivita na účtu“ sheet (CZ headers) — 2 tickery open. */
function buildSyntheticEtoroXlsx(): ArrayBuffer {
  const rows: unknown[][] = [
    [
      'Datum',
      'Napište',
      'Podrobnosti',
      'Částka',
      'Jednotky',
      'Změna realizovaného kapitálu',
      'Realizovaný kapitál',
      'Zůstatek',
      'ID pozice',
      'Typ aktiva',
      'NWA',
    ],
    ['02/01/2026 10:00:00', 'Otevřená pozice', 'AAPL/USD', 100, 1, 0, 1000, 0, '1', 'Cenné papíry', 0],
    ['03/01/2026 10:00:00', 'Otevřená pozice', 'AAPL/USD', 50, 0.5, 0, 1000, 0, '2', 'Cenné papíry', 0],
    ['05/01/2026 10:00:00', 'Otevřená pozice', 'PYPL/USD', 75, 1.5, 0, 1000, 0, '3', 'Cenné papíry', 0],
    ['10/01/2026 10:00:00', 'Zisk/ztráta z obchodu', 'MSFT/USD', -20, 0, 5, 1005, 0, '4', 'Cenné papíry', 0],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Aktivita na účtu');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

console.log('=== eToro parser self-test ===');

const synBuf = buildSyntheticEtoroXlsx();
const syn = await parseEtoroXlsx(synBuf);
assert(syn.length === 2, `synthetic tickers expected 2, got ${syn.length}`);
const aapl = syn.find((p) => p.ticker === 'AAPL');
const pypl = syn.find((p) => p.ticker === 'PYPL');
assert(!!aapl && approx(aapl.units, 1.5), `AAPL units ${aapl?.units}`);
assert(!!aapl && approx(aapl.investedUsd ?? 0, 150), `AAPL invested ${aapl?.investedUsd}`);
assert(!!pypl && approx(pypl.units, 1.5), `PYPL units ${pypl?.units}`);
assert(!!pypl && approx(pypl.investedUsd ?? 0, 75), `PYPL invested ${pypl?.investedUsd}`);
assert(aapl!.firstBuyDate.getFullYear() === 2026, 'AAPL firstBuy year');

const summary = summarizeEtoroPortfolio(syn);
assert(summary.totalInvested > 0, 'summary invested');

const fixturePath = join(import.meta.dir, 'fixtures/etoro/account-statement-2026-01-to-06.xlsx');
const downloadsPath = join(
  process.env.HOME ?? '',
  'Downloads/etoro-account-statement-1-1-2026-6-26-2026.xlsx',
);
const realPath = existsSync(fixturePath) ? fixturePath : downloadsPath;

if (existsSync(realPath)) {
  const buf = readFileSync(realPath);
  const real = await parseEtoroXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert(real.length >= 20, `real export expected many tickers, got ${real.length}`);
  assert(
    real.some((p) => p.ticker === 'PYPL' && p.units > 0),
    'real export should include open PYPL',
  );
  assert(
    real.every((p) => p.units > 0 && (p.investedUsd ?? 0) > 0),
    'all real positions should have units + invested',
  );
  console.log(
    `real export (${realPath.includes('fixtures') ? 'fixture' : 'Downloads'}):`,
    real.length,
    'tickers, top=',
    real
      .slice(0, 5)
      .map((p) => `${p.ticker}=${p.units.toFixed(4)}`)
      .join(', '),
  );
} else {
  throw new Error('FAIL: missing eToro fixture (scripts/fixtures/etoro/…)');
}

console.log('=== ALL ETORO PARSER SELF-TEST PASSED ===');
