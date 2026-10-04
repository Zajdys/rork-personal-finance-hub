/**
 * Self-test: investment_transactions → portfolio calc (Monery-style).
 * Run: bun scripts/portfolio-calc-selftest.bun.ts
 *
 * Potřebuje síť (Yahoo Finance ceny + FX).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseEtoroTransactionsXlsx } from '../lib/etoro-transactions-parser.ts';
import { calculatePortfolioFromTransactions } from '../lib/investment-portfolio-calc.ts';
import { fetchYahooPriceInCurrency } from '../lib/yahoo-ticker.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.05) {
  return Math.abs(a - b) <= eps;
}

console.log('=== Portfolio calc self-test (eToro fixture) ===');

const fixturePath = join(import.meta.dir, 'fixtures/etoro/account-statement-2026-01-to-06.xlsx');
assert(existsSync(fixturePath), 'missing fixture scripts/fixtures/etoro/account-statement-2026-01-to-06.xlsx');

const buf = readFileSync(fixturePath);
const parsed = parseEtoroTransactionsXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const result = await calculatePortfolioFromTransactions(parsed.transactions, {
  displayCurrency: 'USD',
  accountCurrency: 'USD',
  forceAmountCurrency: 'USD',
});

const { summary, positions } = result;

console.log(`\nOpen positions: ${positions.length}`);
console.log(`total_deposits: ${summary.total_deposits.toFixed(2)} ${summary.display_currency}`);
console.log(`total_dividends: ${summary.total_dividends.toFixed(2)} ${summary.display_currency}`);
console.log(`cash_balance: ${summary.cash_balance.toFixed(2)} ${summary.display_currency}`);
console.log(`market_value_positions: ${summary.market_value_positions.toFixed(2)} ${summary.display_currency}`);
console.log(`net_worth (total_current_value): ${summary.total_current_value.toFixed(2)} ${summary.display_currency}`);
console.log(`total_invested (open): ${summary.total_invested.toFixed(2)} ${summary.display_currency}`);
console.log(`total_realized_pnl: ${summary.total_realized_pnl.toFixed(2)} ${summary.display_currency}`);
console.log(`total_unrealized_pnl: ${summary.total_unrealized_pnl.toFixed(2)} ${summary.display_currency}`);
console.log(
  `total_return: ${summary.total_return.toFixed(2)} (${summary.total_return_pct?.toFixed(2) ?? 'n/a'}%)`,
);

const missingPrices = positions.filter((p) => p.held_units > 0 && p.current_price == null);
console.log(`\nMissing live prices: ${missingPrices.length} / ${positions.filter((p) => p.held_units > 0).length}`);
if (missingPrices.length > 0) {
  for (const p of missingPrices) {
    console.log(`  - ${p.ticker} (isin=${p.isin ?? 'n/a'})`);
  }
}

console.log('\nTop 5 positions (by current_value):');
for (const p of positions.slice(0, 5)) {
  console.log(
    `  ${p.ticker}: units=${p.held_units}, invested=${p.invested.toFixed(2)}, current_value=${p.current_value?.toFixed(2) ?? 'n/a'}, unrealized=${p.unrealized_pnl?.toFixed(2) ?? 'n/a'}`,
  );
}

assert(positions.length > 0, 'expected at least one open position');
assert(
  approx(summary.total_deposits, 429),
  `total_deposits expected 429 (net = gross − wd; fixture wd=0), got ${summary.total_deposits}`,
);
assert(
  approx(summary.net_contributed, 428.97),
  `net_contributed expected 428.97 (429 − 0.03 fee), got ${summary.net_contributed}`,
);
assert(approx(summary.total_dividends, 5.75), `total_dividends expected 5.75, got ${summary.total_dividends}`);
// Return: NW − netDeposits (= NW + wd − gross). total_deposits v summary = net.
assert(
  approx(summary.total_return, summary.total_current_value - summary.total_deposits),
  `total_return must be net_worth − netDeposits, got ${summary.total_return}`,
);
assert(summary.total_return_pct != null && summary.total_deposits > 0, 'total_return_pct required');
assert(
  approx(
    summary.total_return_pct!,
    (summary.total_return / summary.total_deposits) * 100,
  ),
  `total_return_pct must be vs net deposits, got ${summary.total_return_pct}`,
);
const smsnPrice = await fetchYahooPriceInCurrency('SMSN.L', 'USD');
assert(smsnPrice != null && smsnPrice > 4000, `SMSN.L→SMSN.IL price expected ~4658 USD (IOB), got ${smsnPrice}`);
const ETORO_SMSN_UNITS = 0.0346;
const smsnRefValue = (smsnPrice ?? 0) * ETORO_SMSN_UNITS;
console.log(
  `\nSMSN.L: price=${smsnPrice!.toFixed(2)} USD (SMSN.IL), units=${ETORO_SMSN_UNITS} → value=${smsnRefValue.toFixed(2)} USD (eToro target ~160.87)`,
);
assert(smsnRefValue > 150 && smsnRefValue < 175, `SMSN.L value expected ~160.87, got ${smsnRefValue.toFixed(2)}`);

const fixtureSmsn = positions.find((p) => p.ticker === 'SMSN.L');
if (fixtureSmsn) {
  console.log(
    `SMSN.L fixture: units=${fixtureSmsn.held_units}, price=${fixtureSmsn.current_price?.toFixed(2)}, value=${fixtureSmsn.current_value?.toFixed(2)}`,
  );
}

console.log('\n=== ALL PORTFOLIO CALC SELF-TEST PASSED ===');
