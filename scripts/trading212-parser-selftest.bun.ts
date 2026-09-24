/**
 * Self-test: Trading 212 History CSV → transactions + open positions.
 * Run: bun scripts/trading212-parser-selftest.bun.ts
 */
import { readFileSync, existsSync } from 'fs';
import {
  parseTrade212CSV,
  mergePortfolios,
  parseTrading212TransactionsCsv,
  parseTrading212TransactionsCsvFiles,
} from '../lib/trading212-parser.ts';
import { toYahooSymbol } from '../lib/yahoo-ticker.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 1e-4) {
  return Math.abs(a - b) <= eps;
}

console.log('=== Trading 212 parser self-test ===');

const header =
  'Action,Time (UTC),ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Currency conversion fee,Withholding tax';

// Synthetic: Limit buy + Market sell partial → open remainder
const synthetic = [
  header,
  'Limit buy,2026-01-10 10:00:00+00:00,US70450Y1038,PYPL,PayPal,,id1,2.0000000000,50.0000000000,USD,1.00000000,,,100.00,EUR,0.50,',
  'Market buy,2026-01-11 10:00:00+00:00,DE000PAG9113,P911,Porsche,,id2,1.0000000000,40.0000000000,EUR,1.00000000,,,40.00,EUR,,',
  'Market sell,2026-02-01 10:00:00+00:00,US70450Y1038,PYPL,PayPal,,id3,0.5000000000,60.0000000000,USD,1.00000000,,,30.00,EUR,,',
  'Deposit,2026-01-01 10:00:00+00:00,,,,,id4,,,,,,,50.00,EUR,,',
  'Dividend (Dividend),2026-03-01 10:00:00+00:00,US70450Y1038,PYPL,PayPal,,id5,1.5000000000,0.100000,USD,1.00000000,,,0.15,EUR,,0.02',
  'Currency conversion fee,2026-01-10 10:00:01+00:00,,,,,id6,,,,,,,1.20,EUR,,',
].join('\n');

const syn = parseTrade212CSV(synthetic);
assert(syn.positions.length === 2, `synthetic open count ${syn.positions.length}`);
const pypl = syn.positions.find((p) => p.ticker === 'PYPL');
const p911 = syn.positions.find((p) => p.ticker === 'P911');
assert(!!pypl && approx(pypl.shares, 1.5), `PYPL shares ${pypl?.shares}`);
assert(!!pypl && approx(pypl.avgBuyPrice, 50), `PYPL avg ${pypl?.avgBuyPrice}`);
assert(!!pypl && approx(pypl.totalInvested, 75), `PYPL invested ${pypl?.totalInvested}`);
assert(!!p911 && approx(p911.shares, 1), `P911 shares ${p911?.shares}`);
assert(approx(syn.deposits, 50), `deposits ${syn.deposits}`);
assert(approx(syn.dividends, 0.15), `dividends ${syn.dividends}`);

assert(toYahooSymbol('P911', 'DE000PAG9113') === 'P911.DE', 'yahoo P911');
assert(toYahooSymbol('PYPL', 'US70450Y1038') === 'PYPL', 'yahoo PYPL');
assert(toYahooSymbol('SU', 'FR0000121972') === 'SU.PA', 'yahoo SU');

// Transaction import: must accept sell-only file (no open positions)
const sellOnly = [
  header,
  'Market sell,2026-02-01 10:00:00+00:00,US70450Y1038,PYPL,PayPal,,sell1,2.0000000000,60.0000000000,USD,1.00000000,,,120.00,EUR,,',
  'Dividend (Dividend),2026-03-01 10:00:00+00:00,US70450Y1038,PYPL,PayPal,,div1,,,USD,,,,0.40,EUR,,0.05',
  'Withdrawal,2026-04-01 10:00:00+00:00,,,,,wd1,,,,,,,95.00,EUR,,',
].join('\n');

const sellOnlyTx = parseTrading212TransactionsCsv(sellOnly);
assert(sellOnlyTx.transactions.length >= 3, `sell-only tx count ${sellOnlyTx.transactions.length}`);
assert(sellOnlyTx.summary.sell.count === 1, 'sell-only has sell');
assert(sellOnlyTx.summary.dividend.count === 1, 'sell-only has dividend');
assert(sellOnlyTx.summary.withdrawal.count === 1, 'sell-only has withdrawal');
assert(sellOnlyTx.hasOrphanSells === true, 'sell-only should flag orphan sells');
assert(
  sellOnlyTx.transactions.some((t) => t.external_id === 't212:sell1'),
  'external_id from ID column',
);

const posFromSellOnly = parseTrade212CSV(sellOnly);
assert(posFromSellOnly.positions.length === 0, 'sell-only file has 0 open positions (expected)');

const fullTx = parseTrading212TransactionsCsv(synthetic);
assert(fullTx.transactions.length >= 5, `full tx count ${fullTx.transactions.length}`);
assert(fullTx.summary.buy.count === 2, `buys ${fullTx.summary.buy.count}`);
assert(fullTx.summary.fee.count === 1, `fees ${fullTx.summary.fee.count}`);
assert(fullTx.hasOrphanSells === false, 'full synthetic should not orphan');
const buyPypl = fullTx.transactions.find((t) => t.external_id === 't212:id1');
assert(!!buyPypl && approx(buyPypl.fee, 0.5), `buy conversion fee ${buyPypl?.fee}`);
const div = fullTx.transactions.find((t) => t.type === 'dividend');
assert(!!div && approx(div.fee, 0.02), `dividend withholding ${div?.fee}`);

// Free Shares Promotion → type promo (ne deposit)
const promoCsv = [
  header,
  'Deposit,2025-01-10 10:00:00+00:00,,,,Free Shares Promotion,promo1,,,,,,,10.81,EUR,,',
  'Market buy,2025-01-10 10:00:01+00:00,US0378331005,AAPL,Apple,,buy1,0.0500000000,216.2000000000,USD,1.00000000,,,10.81,EUR,,',
  'Deposit,2025-02-01 10:00:00+00:00,,,,,real1,,,,,,,40.00,EUR,,',
].join('\n');
const promoTx = parseTrading212TransactionsCsv(promoCsv);
assert(promoTx.summary.promo.count === 1, `promo count ${promoTx.summary.promo.count}`);
assert(approx(promoTx.summary.promo.amountSum, 10.81), `promo sum ${promoTx.summary.promo.amountSum}`);
assert(promoTx.summary.deposit.count === 1, `real deposits ${promoTx.summary.deposit.count}`);
assert(approx(promoTx.summary.deposit.amountSum, 40), `real deposit sum ${promoTx.summary.deposit.amountSum}`);
assert(
  promoTx.transactions.find((t) => t.external_id === 't212:promo1')?.type === 'promo',
  'promo external_id keeps id, type=promo',
);
const promoPortfolio = parseTrade212CSV(promoCsv);
assert(approx(promoPortfolio.deposits, 40), `portfolio.deposits excludes promo, got ${promoPortfolio.deposits}`);

// Multi-file: older buys + newer sells → no orphan after merge, upsertable external ids
const olderBuys = [
  header,
  'Market buy,2024-06-01 10:00:00+00:00,US70450Y1038,PYPL,PayPal,,old1,2.0000000000,40.0000000000,USD,1.00000000,,,80.00,EUR,,',
].join('\n');
const mergedTx = parseTrading212TransactionsCsvFiles([sellOnly, olderBuys]);
assert(mergedTx.transactions.length >= 4, `merged tx ${mergedTx.transactions.length}`);
assert(mergedTx.hasOrphanSells === false, 'merged older buys + sells should clear orphan');

// Deposits without ID: same amount twice must keep both (occurrence in external_id)
const noIdDeposits = [
  header,
  'Deposit,2024-07-11 10:00:00+00:00,,,,,,,,,,,,400.00,EUR,,',
  'Deposit,2024-08-07 10:00:00+00:00,,,,,,,,,,,,200.00,EUR,,',
  'Deposit,2025-08-01 10:00:00+00:00,,,,,,,,,,,,155.00,EUR,,',
  'Deposit,2025-08-02 10:00:00+00:00,,,,,,,,,,,,200.00,EUR,,',
  'Deposit,2024-07-12 10:00:00+00:00,,,,,,,,,,,,10.00,EUR,,',
  'Deposit,2024-11-04 10:00:00+00:00,,,,,,,,,,,,100.00,EUR,,',
].join('\n');
const noIdParsed = parseTrading212TransactionsCsv(noIdDeposits);
assert(noIdParsed.summary.deposit.count === 6, `no-id deposits count ${noIdParsed.summary.deposit.count}`);
assert(approx(noIdParsed.summary.deposit.amountSum, 1065), `no-id sum ${noIdParsed.summary.deposit.amountSum}`);
const noIdExt = new Set(noIdParsed.transactions.filter((t) => t.type === 'deposit').map((t) => t.external_id));
assert(noIdExt.size === 6, `no-id external_ids must be unique, got ${noIdExt.size}`);
assert(
  [...noIdExt].every((id) => id.includes('EUR')),
  'fallback external_id must include currency',
);

// Same timestamp + same amount → occurrence suffix keeps both
const twinDeposits = [
  header,
  'Deposit,2025-01-01 12:00:00+00:00,,,,,,,,,,,,200.00,EUR,,',
  'Deposit,2025-01-01 12:00:00+00:00,,,,,,,,,,,,200.00,EUR,,',
].join('\n');
const twin = parseTrading212TransactionsCsv(twinDeposits);
assert(twin.summary.deposit.count === 2, `twin deposits ${twin.summary.deposit.count}`);
assert(approx(twin.summary.deposit.amountSum, 400), `twin sum ${twin.summary.deposit.amountSum}`);

// Multi-file overlap: same deposit ID must not double-count
const fileA = [
  header,
  'Deposit,2024-07-11 20:54:28+00:00,,,,,dep-a,,,,,,,400.00,EUR,,',
  'Deposit,2024-08-07 20:54:17+00:00,,,,,dep-b,,,,,,,200.00,EUR,,',
].join('\n');
const fileB = [
  header,
  'Deposit,2024-08-07 20:54:17+00:00,,,,,dep-b,,,,,,,200.00,EUR,,',
  'Deposit,2025-08-01 13:53:05+00:00,,,,,dep-c,,,,,,,155.00,EUR,,',
].join('\n');
const multiDep = parseTrading212TransactionsCsvFiles([fileA, fileB]);
assert(multiDep.summary.deposit.count === 3, `multi-file deposits ${multiDep.summary.deposit.count}`);
assert(approx(multiDep.summary.deposit.amountSum, 755), `multi-file sum ${multiDep.summary.deposit.amountSum}`);

// Real export jan–aug 2026: all closed in-window → 0 open, but txs must parse
const closedPath =
  '/Users/zajda/Downloads/from_2026-01-01_to_2026-08-23_MTc4NzU1NjgwNTQyMg.csv';
if (existsSync(closedPath)) {
  const closedCsv = readFileSync(closedPath, 'utf8');
  const closed = parseTrade212CSV(closedCsv);
  assert(
    closed.positions.length === 0,
    `aug export should be fully closed, got ${closed.positions.map((p) => p.ticker).join(',')}`,
  );
  const closedTx = parseTrading212TransactionsCsv(closedCsv);
  assert(closedTx.transactions.length > 0, 'aug export must still yield transactions');
  console.log(
    `aug-2026 export: 0 open positions, ${closedTx.transactions.length} txs (orphan=${closedTx.hasOrphanSells})`,
  );
} else {
  console.log('skip aug-2026 file (not found)');
}

// Real export jan–may 2026: PYPL + P911 still open
const openPath =
  '/Users/zajda/Downloads/from_2026-01-01_to_2026-05-11_MTc3ODUxOTYxMTM4NQ.csv';
if (existsSync(openPath)) {
  const open = parseTrade212CSV(readFileSync(openPath, 'utf8'));
  const oPypl = open.positions.find((p) => p.ticker === 'PYPL');
  const oP911 = open.positions.find((p) => p.ticker === 'P911');
  assert(!!oPypl && oPypl.shares > 4, `may PYPL shares ${oPypl?.shares}`);
  assert(!!oP911 && oP911.shares > 0.4, `may P911 shares ${oP911?.shares}`);
  assert(!!oPypl?.isin && oPypl.isin.startsWith('US'), 'PYPL ISIN');
  assert(!!oP911?.isin && oP911.isin.startsWith('DE'), 'P911 ISIN');
  console.log(
    'may-2026 export open:',
    open.positions.map((p) => `${p.ticker}=${p.shares.toFixed(4)}@${p.avgBuyPrice.toFixed(2)}`).join(', '),
  );
} else {
  console.log('skip may-2026 file (not found)');
}

const merged = mergePortfolios([synthetic, synthetic]);
assert(merged.positions.some((p) => p.ticker === 'PYPL' && approx(p.shares, 3)), 'merge doubles buys/sells');

console.log('=== ALL TRADING212 PARSER SELF-TEST PASSED ===');
