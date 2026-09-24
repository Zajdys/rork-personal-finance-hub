/**
 * Self-test: eToro Account Statement XLSX → investment_transactions model (parse only).
 * Run: bun scripts/etoro-transactions-parser-selftest.bun.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  isFailedEtoroPaymentRow,
  logEtoroTransactionParseSummary,
  mapEtoroType,
  parseEtoroTransactionsXlsx,
} from '../lib/etoro-transactions-parser.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

console.log('=== eToro transactions parser self-test ===');

assert(mapEtoroType('Žádost o výběr') === 'withdrawal', 'Žádost o výběr → withdrawal');
assert(mapEtoroType('Poplatek za výběr') === 'fee', 'Poplatek za výběr → fee');
assert(
  mapEtoroType('Poplatek za směnu měny při výběru') === 'fee',
  'Poplatek za směnu měny při výběru → fee',
);
assert(mapEtoroType('Začít kopírovat') === 'skip', 'Začít kopírovat → skip');
assert(mapEtoroType('Refund from eToro') === 'withdrawal', 'Refund from eToro → withdrawal');
assert(mapEtoroType('Refund') === 'withdrawal', 'Refund → withdrawal');
assert(
  isFailedEtoroPaymentRow({ Status: 'Insufficient balance' }, 'Deposit'),
  'Insufficient balance → failed',
);
assert(
  !isFailedEtoroPaymentRow({ Status: 'Approved' }, 'Deposit'),
  'Approved → not failed',
);
assert(
  isFailedEtoroPaymentRow({}, 'Deposit Insufficient balance'),
  'details Insufficient balance → failed',
);

const fixturePath = join(import.meta.dir, 'fixtures/etoro/account-statement-2026-01-to-06.xlsx');
assert(existsSync(fixturePath), 'missing fixture scripts/fixtures/etoro/account-statement-2026-01-to-06.xlsx');

const buf = readFileSync(fixturePath);
const result = parseEtoroTransactionsXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

logEtoroTransactionParseSummary(result);

assert(result.skipped === 3, `expected 3 skipped mirror rows, got ${result.skipped}`);
assert(result.summary.deposit.count === 2, `deposits count ${result.summary.deposit.count}`);
assert(approx(result.summary.deposit.amountSum, 429), `deposits sum ${result.summary.deposit.amountSum}`);
assert(approx(result.summary.dividend.amountSum, 5.75), `dividends sum ${result.summary.dividend.amountSum}`);
assert(
  approx(result.sellRealizedCapitalChangeSum, 9.56),
  `sell realized P/L ${result.sellRealizedCapitalChangeSum}`,
);
assert(result.summary.buy.count === 221, `buy count ${result.summary.buy.count}`);
assert(result.summary.sell.count === 194, `sell count ${result.summary.sell.count}`);
assert(result.summary.fee.count === 1, `fee count ${result.summary.fee.count}`);

const buy = result.transactions.find((t) => t.type === 'buy' && t.ticker === 'NIO');
assert(!!buy && buy.original_currency === 'USD', 'NIO buy currency');
assert(!!buy && buy.external_id.includes('3239944233'), 'buy external_id uses position id');

const deposit = result.transactions.find((t) => t.type === 'deposit');
assert(!!deposit && deposit.ticker == null, 'deposit ticker null');
assert(!!deposit && deposit.external_id.startsWith('etoro:deposit:'), 'deposit synthetic external_id');

const uniqueIds = new Set(result.transactions.map((t) => t.external_id));
assert(uniqueIds.size === result.transactions.length, 'external_id must be unique per row');

const withIsin = result.transactions.find((t) => t.isin != null);
assert(!!withIsin, 'expected at least one ISIN from closed/dividends sheets');

console.log('=== ALL ETORO TRANSACTIONS PARSER SELF-TEST PASSED ===');
