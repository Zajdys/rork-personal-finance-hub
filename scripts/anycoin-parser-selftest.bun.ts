/**
 * Self-test: Anycoin CSV parser.
 * Run: bun scripts/anycoin-parser-selftest.bun.ts
 */
import { logAnycoinParseSummary, parseAnycoinCsv, isAnycoinCsv } from '../lib/anycoin-parser.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 1e-8) {
  return Math.abs(a - b) <= eps;
}

console.log('=== Anycoin parser self-test ===');

const header =
  'Date,Type,Amount,Currency,Order ID,anycoin TX ID,Description,Funding ID,Trade ID';

// Syntetika sestavená tak, aby seděla na ověřovací součla z reálného exportu.
const csv = [
  header,
  '2024-01-10,deposit,20000,CZK,,dep1,Bank deposit,,',
  '2024-02-01,deposit,29842,CZK,,dep2,Bank deposit,,',
  '2024-03-01,trade payment,-15000,CZK,ord1,pay1,Buy BTC,,tr1',
  '2024-03-01,trade fill,0.01000000,BTC,ord1,fill1,Buy BTC,,tr1',
  '2024-04-01,trade payment,-20000,CZK,ord2,pay2,Buy BTC,,tr2',
  '2024-04-01,trade fill,0.01000000,BTC,ord2,fill2,Buy BTC,,tr2',
  '2024-05-01,trade payment,-14842,CZK,ord3,pay3,Buy BTC,,tr3',
  '2024-05-01,trade fill,0.00562144,BTC,ord3,fill3,Buy BTC,,tr3',
  '2024-06-01,trade refund,200,CZK,,ref1,Refund,,',
  '2024-07-01,withdrawal_block,-0.01,BTC,,blk1,Block,fund1,',
  '2024-07-01,withdrawal,-0.01000000,BTC,,wd1,To Trezor,fund1,',
  '2024-07-01,withdrawal_unblock,0.01,BTC,,unblk1,Unblock,fund1,',
  '2024-08-01,withdrawal,-0.01550075,BTC,,wd2,To Trezor,fund2,',
].join('\n');

assert(isAnycoinCsv(csv), 'detect anycoin csv');

const result = parseAnycoinCsv(csv);
logAnycoinParseSummary(result);

assert(result.summary.deposit.count === 2, `deposits ${result.summary.deposit.count}`);
assert(approx(result.summary.deposit.amountSum, 49842, 0.01), `deposit sum ${result.summary.deposit.amountSum}`);
assert(result.summary.withdrawal.count === 1, `refunds as withdrawal ${result.summary.withdrawal.count}`);
assert(approx(Math.abs(result.summary.withdrawal.amountSum), 200, 0.01), `refund 200`);
assert(result.summary.buy.count === 3, `buys ${result.summary.buy.count}`);
assert(
  approx(result.summary.buy.unitsSum, 0.02562144, 1e-8),
  `held BTC ${result.summary.buy.unitsSum}`,
);
assert(result.summary.transfer_out.count === 2, `transfer_out ${result.summary.transfer_out.count}`);
assert(
  approx(result.summary.transfer_out.unitsSum, 0.02550075, 1e-8),
  `trezor out ${result.summary.transfer_out.unitsSum}`,
);

const vlozeno = result.summary.deposit.amountSum - Math.abs(result.summary.withdrawal.amountSum);
assert(approx(vlozeno, 49642, 0.01), `Vloženo ${vlozeno}`);

// block/unblock must be skipped (not in txs)
assert(
  !result.transactions.some((t) => t.external_id.includes('blk') || t.external_id.includes('unblk')),
  'block/unblock not imported',
);

const buy = result.transactions.find((t) => t.type === 'buy' && t.external_id.includes('fill1'));
assert(!!buy && buy.original_currency === 'CZK', 'buy currency CZK');
assert(!!buy && approx(buy.units!, 0.01), 'buy units');
assert(!!buy && approx(buy.amount, 15000, 0.01), 'buy amount CZK');
assert(!!buy && buy.ticker === 'BTC', 'buy ticker BTC');

const transfer = result.transactions.find((t) => t.type === 'transfer_out');
assert(!!transfer && transfer.ticker === 'BTC', 'transfer_out ticker');

const ids = new Set(result.transactions.map((t) => t.external_id));
assert(ids.size === result.transactions.length, 'unique external_id');

console.log('=== ALL ANYCOIN PARSER SELF-TEST PASSED ===');
console.log(`Vloženo=${vlozeno} CZK, held BTC=${result.summary.buy.unitsSum}`);
