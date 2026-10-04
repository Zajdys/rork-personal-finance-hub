/**
 * Self-test: Revolut Invest Account statement CSV.
 * Run: bun scripts/revolut-invest-csv-parse-selftest.bun.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseRevolutInvestCsv,
  parseRevolutInvestMoney,
  parseRevolutInvestUnits,
  revolutInvestCashByCurrency,
  revolutInvestHoldingsByTicker,
} from '../lib/revolut-invest-csv-parse';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 1e-8): boolean {
  return Math.abs(a - b) <= eps;
}

console.log('=== Revolut Invest CSV parser self-test ===');

// Money / units helpers
const m1 = parseRevolutInvestMoney('EUR 1016.80', 'EUR');
assert(m1 && m1.currency === 'EUR' && approx(m1.amount, 1016.8, 1e-6), 'parse EUR 1016.80');
const m2 = parseRevolutInvestMoney('EUR 3', 'USD');
assert(m2 && m2.currency === 'EUR' && approx(m2.amount, 3), 'parse EUR 3 ignores fallback ccy');
const u = parseRevolutInvestUnits('0.00295043');
assert(u != null && approx(u, 0.00295043), `units 8dp ${u}`);

// Unknown type → error, no silent skip
const bad = parseRevolutInvestCsv(
  [
    'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate',
    '2026-01-01T00:00:00Z,,CASH TOP-UP,,,EUR 1,EUR,0.04',
    '2026-01-02T00:00:00Z,AAPL,DIVIDEND,,,EUR 0.5,EUR,0.04',
  ].join('\n'),
);
assert(bad.ok === false, 'unknown type fails');
assert(
  !bad.ok && bad.unknownTypes.includes('DIVIDEND'),
  `unknownTypes ${!bad.ok ? bad.unknownTypes.join(',') : ''}`,
);

// 8-row fixture (relative to repo root when run via bun scripts/…)
const fixturePath = join(
  process.cwd(),
  'scripts/fixtures/revolut-invest/account-statement-8rows.csv',
);
const csv = readFileSync(fixturePath, 'utf8');
const result = parseRevolutInvestCsv(csv);
assert(result.ok === true, `parse ok: ${result.ok ? '' : result.error}`);
assert(result.ok, 'parse must succeed');

assert(result.transactions.length === 8, `tx count ${result.transactions.length}`);
assert(result.summary.deposit.count === 3, `deposits ${result.summary.deposit.count}`);
assert(result.summary.buy.count === 3, `buys ${result.summary.buy.count}`);
assert(result.summary.sell.count === 2, `sells ${result.summary.sell.count}`);

// Amount = Total Amount (not qty×price)
const rhmBuy = result.transactions.find((t) => t.type === 'buy' && t.ticker === 'RHM');
assert(!!rhmBuy && approx(rhmBuy.amount, 3), `RHM buy amount ${rhmBuy?.amount}`);
assert(!!rhmBuy && approx(rhmBuy.units ?? 0, 0.00295043), `RHM buy units ${rhmBuy?.units}`);
assert(!!rhmBuy && approx(rhmBuy.price_per_unit ?? 0, 1016.8, 1e-4), `RHM price ${rhmBuy?.price_per_unit}`);

// external_id shape
assert(
  !!rhmBuy &&
    rhmBuy.external_id.startsWith('revolut-invest:') &&
    rhmBuy.external_id.includes('BUY - MARKET') &&
    rhmBuy.external_id.includes('RHM') &&
    rhmBuy.external_id.includes('#4'),
  `external_id ${rhmBuy?.external_id}`,
);

const holdings = revolutInvestHoldingsByTicker(result.transactions);
assert(approx(holdings.RHM ?? 0, 0.00195043), `RHM ${holdings.RHM}`);
assert(approx(holdings.VUAA ?? 0, 0.00068319), `VUAA ${holdings.VUAA}`);
assert(approx(holdings.TSLA ?? 0, 0.00812709), `TSLA ${holdings.TSLA}`);

const cash = revolutInvestCashByCurrency(result.transactions);
assert(approx(cash.EUR ?? 0, 2.91, 1e-6), `cash EUR ${cash.EUR}`);
assert(approx(cash.USD ?? 0, 0, 1e-6), `cash USD ${cash.USD ?? 0}`);

// Negative running cash must not fail import
const negCash = parseRevolutInvestCsv(
  [
    'Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate',
    '2026-01-01T00:00:00Z,RHM,BUY - MARKET,0.001,EUR 100,EUR 0.1,EUR,0.04',
    '2026-01-02T00:00:00Z,,CASH TOP-UP,,,EUR 1,EUR,0.04',
  ].join('\n'),
);
assert(negCash.ok === true, 'buy-before-deposit still ok');
assert(negCash.ok && negCash.transactions.length === 2, 'neg cash tx count');

console.log('revolut-invest-csv-parse-selftest: OK');
