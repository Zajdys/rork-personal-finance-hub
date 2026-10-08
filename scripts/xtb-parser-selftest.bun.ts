/**
 * Self-test: XTB parser — legacy fixtures + reálný xStation 5 account history.
 * Run: bun scripts/xtb-parser-selftest.bun.ts
 */
// @ts-nocheck — bun selftest; .ts imports a Buffer typy mimo app tsc rozpočet
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import {
  parseXtbAmount,
  parseXtbXlsx,
  parseXtbXlsxDetailed,
  parseXtbCashOperations,
  parseXtbOpenPositions,
  parseTradeFromComment,
  isXtbXlsx,
  verifyXtbCashBalance,
} from '../lib/xtb-parser.ts';
import {
  assertXtbInterestTaxImportAllowed,
  parseXtbTransactionsXlsx,
  xtbCashByCurrency,
  xtbHoldingsByTicker,
} from '../lib/xtb-transactions-parser.ts';
import { detectBrokerFromXlsxWorkbook } from '../lib/broker-import-detect.ts';
import { INVESTMENT_TX_INTEREST_TAX_ENABLED } from '../constants/feature-flags.ts';
import { parseBrokerPositionIdFromNote } from '../lib/broker-position-id.ts';

// AsyncStorage / Supabase init (yahoo-ticker → supabase) nesmí shodit process
(globalThis as { window?: unknown }).window ??= {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

/** EN cash ops: Total = 0.31 (bez OPEN POSITION → žádné pozice po close). */
function buildXtbEnBalanceFixture(): ArrayBuffer {
  const rows: unknown[][] = [
    ['Account history'],
    ['Account currency: EUR'],
    [],
    ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
    ['1', 'deposit', '15.01.2024 10:00:00', '', '', '1000.00'],
    ['2', 'Stock purchase', '20.01.2024 11:30:00', 'OPEN BUY 10 @ 50.00', 'AAPL.US', '-500.00'],
    ['3', 'Stock sale', '10.02.2024 14:00:00', 'CLOSE BUY 10/10 @ 45.00', 'AAPL.US', '400.00'],
    ['4', 'close trade', '10.02.2024 14:00:00', 'Profit of position #12345', 'AAPL.US', '50.00'],
    ['5', 'Free-funds Interest', '28.02.2024 00:00:00', 'Free-funds Interest 2024-02', '', '0.40'],
    ['6', 'Free-funds Interest Tax', '28.02.2024 00:00:01', 'Free-funds Interest Tax 2024-02', '', '-0.09'],
    ['7', 'withdrawal', '01.03.2024 16:00:00', '', '', '-950.00'],
    ['', 'Total', '', '', '', '0.31'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'CASH OPERATION HISTORY');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/**
 * Reálný scénář: OPEN POSITION (Purchase value) + cash historie.
 * Investováno = 0.01+0.05+0.08 = 0.14 (NE rekonstrukce z cash).
 */
function buildXtbOpenPositionFixture(): ArrayBuffer {
  const cashRows: unknown[][] = [
    ['Account currency: EUR'],
    [],
    ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
    ['1', 'deposit', '01.01.2024 10:00:00', '', '', '100.00'],
    ['2', 'Stock purchase', '02.01.2024 10:00:00', 'OPEN BUY 0.0001 @ 100', 'VWCE.DE', '-0.01'],
    ['3', 'DIVIDENT', '15.01.2024 08:00:00', 'Dividend', 'VWCE.DE', '0.50'],
    ['4', 'close trade', '20.01.2024 12:00:00', 'Profit of position #1', 'OTHER.DE', '1.20'],
    ['5', 'Free-funds Interest', '28.01.2024 00:00:00', '', '', '0.10'],
    ['6', 'withdrawal', '30.01.2024 10:00:00', '', '', '-50.00'],
    ['', 'Total', '', '', '', '51.79'],
  ];

  const openRows: unknown[][] = [
    ['OPEN POSITION REPORT'],
    ['Account currency: EUR'],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [
      'Position',
      'Symbol',
      'Type',
      'Volume',
      'Open time',
      'Open price',
      'Market price',
      'Purchase value',
      'SL',
      'TP',
      'Margin',
      'Commission',
      'Swap',
      'Rollover',
      'Gross P/L',
      'Comment',
    ],
    ['1001', 'VWCE.DE', 'buy', '0.0001', '02.01.2024 10:00:00', '100', '105', '0.01', '', '', '', '', '', '', '', ''],
    ['1002', 'VVSM.DE', 'buy', '0.0009', '03.01.2024 10:00:00', '55', '56', '0.05', '', '', '', '', '', '', '', ''],
    ['1003', 'VUAA.UK', 'buy', '0.0007', '04.01.2024 10:00:00', '114', '115', '0.08', '', '', '', '', '', '', '', ''],
    ['Total', '', '', '', '', '', '', '0.14', '', '', '', '', '', '', '', ''],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cashRows), 'CASH OPERATION HISTORY');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(openRows), 'OPEN POSITION 02072026');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** CZ cash-only fallback (bez OPEN POSITION). */
function buildXtbCzCashOnlyFixture(): ArrayBuffer {
  const rows: unknown[][] = [
    ['XTB export'],
    [],
    ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount', 'Currency'],
    ['1', 'deposit', '15.01.2024 10:00:00', '', 'CASH', '10 000,00', 'EUR'],
    [
      '2',
      'Stock purchase',
      '20.01.2024 11:30:00',
      'OPEN BUY 10 @ 150,50',
      'AAPL.US',
      '-1 505,00',
      'EUR',
    ],
    [
      '3',
      'Stock purchase',
      '25.01.2024 09:15:00',
      'OPEN BUY 5 @ 380,75',
      'MSFT.US',
      '-1 903,75',
      'EUR',
    ],
    ['4', 'DIVIDENT', '01.02.2024 08:00:00', 'Dividend AAPL', 'AAPL.US', '50,00', 'EUR'],
    ['5', 'Withholding Tax', '01.02.2024 08:00:01', 'Tax', 'AAPL.US', '-7,50', 'EUR'],
    [
      '6',
      'Stock sale',
      '10.02.2024 14:00:00',
      'CLOSE BUY 5/10 @ 160,00',
      'AAPL.US',
      '752,50',
      'EUR',
    ],
    ['7', 'close trade', '10.02.2024 14:00:00', 'Profit of position #99', 'AAPL.US', '47,50', 'EUR'],
    ['8', 'withdrawal', '15.02.2024 16:00:00', '', 'CASH', '-500,00', 'EUR'],
    ['', 'Total', '', '', '', '6 933,75', ''],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'CASH OPERATION HISTORY');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function buildEtoroLikeXlsx(): ArrayBuffer {
  const rows = [
    { Datum: '01.01.2024', Napište: 'Otevřená pozice', Podrobnosti: 'AAPL/USD', Jednotky: 1, Částka: -100 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Account Activity');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

console.log('=== XTB parser self-test ===');

assert(parseXtbAmount('-1 505,00') === -1505, 'parseXtbAmount comma decimal');
assert(parseXtbAmount('10 000.00') === 10000, 'parseXtbAmount dot decimal');
assert(parseXtbAmount('1.234,56') === 1234.56, 'parseXtbAmount EU thousands');
assert(parseXtbAmount('0.31') === 0.31, 'parseXtbAmount EN cents');

const openBuy = parseTradeFromComment('OPEN BUY 10 @ 50.00');
assert(!!openBuy && openBuy.shares === 10 && openBuy.price === 50, `OPEN BUY got ${JSON.stringify(openBuy)}`);
const closeBuy = parseTradeFromComment('CLOSE BUY 5/10 @ 160.00');
assert(!!closeBuy && closeBuy.shares === 5 && closeBuy.price === 160, `CLOSE BUY got ${JSON.stringify(closeBuy)}`);
const czOpen = parseTradeFromComment('OPEN BUY 10 @ 150,50');
assert(!!czOpen && czOpen.shares === 10 && czOpen.price === 150.5, `CZ OPEN BUY got ${JSON.stringify(czOpen)}`);

const fracClose = parseTradeFromComment('CLOSE BUY 0.004 @ 258.69');
assert(
  !!fracClose && fracClose.shares === 0.004 && fracClose.price === 258.69,
  `CLOSE BUY frac got ${JSON.stringify(fracClose)}`,
);
const fracOpen = parseTradeFromComment('OPEN BUY 0.0749/0.08 @ 215.05');
assert(
  !!fracOpen && fracOpen.shares === 0.0749 && fracOpen.price === 215.05,
  `OPEN BUY frac/total got ${JSON.stringify(fracOpen)}`,
);

console.log('--- EN cash balance (Total = 0.31) ---');
const enBuf = buildXtbEnBalanceFixture();
assert(isXtbXlsx(enBuf), 'isXtbXlsx EN');
assert(detectBrokerFromXlsxWorkbook(XLSX.read(enBuf, { type: 'array' })) === 'xtb', 'detect xtb');

const enOps = parseXtbCashOperations(enBuf);
assert(enOps.length === 7, `expected 7 ops, got ${enOps.length}`);
assert(enOps.some((o) => o.type === 'close trade'), 'close trade present');

const enDetailed = parseXtbXlsxDetailed(enBuf);
assert(enDetailed.totalBalance === 0.31, `EN totalBalance ${enDetailed.totalBalance}`);
assert(enDetailed.balanceOk, 'EN balanceOk');
const enCheck = verifyXtbCashBalance(enDetailed.cashSum, enDetailed.totalBalance);
assert(!!enCheck && enCheck.ok, 'EN verify cash');

console.log('--- OPEN POSITION Purchase value ---');
const openBuf = buildXtbOpenPositionFixture();
const openRaw = parseXtbOpenPositions(openBuf);
assert(openRaw.length === 3, `open positions ${openRaw.length}`);
const detailed = parseXtbXlsxDetailed(openBuf);
assert(detailed.positionsSource === 'open_position', 'positionsSource open_position');
assert(approx(detailed.totalInvested, 0.14), `Investováno ${detailed.totalInvested}`);
assert(detailed.openPositionsOk, 'openPositionsOk');

const portfolio = parseXtbXlsx(openBuf);
assert(Math.abs(portfolio.totalInvested - 0.14) < 0.001, `parseXtbXlsx Investováno ${portfolio.totalInvested}`);

console.log('--- CZ cash-only fallback ---');
const czBuf = buildXtbCzCashOnlyFixture();
const czDetailed = parseXtbXlsxDetailed(czBuf);
assert(czDetailed.positionsSource === 'cash_history', 'CZ cash_history fallback');
assert(czDetailed.deposits === 10000, `CZ deposits ${czDetailed.deposits}`);

const etoroBuf = buildEtoroLikeXlsx();
assert(detectBrokerFromXlsxWorkbook(XLSX.read(etoroBuf, { type: 'array' })) === 'etoro', 'detect etoro');

console.log('--- Real xStation 5 account history fixture ---');
const fixturePath = join(process.cwd(), 'scripts/fixtures/xtb/EUR_2006-01-01_2026-09-30.xlsx');
const realBuf = readFileSync(fixturePath);
assert(
  detectBrokerFromXlsxWorkbook(XLSX.read(realBuf, { type: 'buffer' })) === 'xtb',
  'detect real xtb',
);

const realAb = realBuf.buffer.slice(
  realBuf.byteOffset,
  realBuf.byteOffset + realBuf.byteLength,
) as ArrayBuffer;
const real = parseXtbTransactionsXlsx(realAb);

assert(real.transactions.length === 395, `txs ${real.transactions.length}`);
assert(real.summary.deposit.count === 37, `deposit count ${real.summary.deposit.count}`);
assert(approx(real.summary.deposit.amountSum, 4207.69), `deposit sum ${real.summary.deposit.amountSum}`);
assert(real.summary.withdrawal.count === 7, `withdrawal count ${real.summary.withdrawal.count}`);
assert(
  approx(real.summary.withdrawal.amountSum, 4953.92),
  `withdrawal sum ${real.summary.withdrawal.amountSum}`,
);
assert(real.summary.buy.count === 126, `buy ${real.summary.buy.count}`);
assert(real.summary.sell.count === 170, `sell ${real.summary.sell.count}`);
assert(real.summary.dividend.count === 33, `div count ${real.summary.dividend.count}`);
assert(approx(real.summary.dividend.amountSum, 0.41), `div sum ${real.summary.dividend.amountSum}`);
assert(real.summary.interest.count === 14, `interest count ${real.summary.interest.count}`);
assert(approx(real.summary.interest.amountSum, 0.4), `interest sum ${real.summary.interest.amountSum}`);
assert(real.summary.tax.count === 8, `tax count ${real.summary.tax.count}`);
assert(approx(real.summary.tax.amountSum, 0.08), `tax sum ${real.summary.tax.amountSum}`);

assert(approx(real.realizedPl, 745.95), `realizedPl ${real.realizedPl}`);
assert(real.cashBalance != null && approx(real.cashBalance, 0.31), `cash ${real.cashBalance}`);

const byTicker = new Map<string, number>();
for (const h of real.openHoldings) {
  byTicker.set(h.ticker, (byTicker.get(h.ticker) ?? 0) + h.units);
}
assert(approx(byTicker.get('VVSM.DE') ?? 0, 0.0009, 1e-8), `VVSM ${byTicker.get('VVSM.DE')}`);
assert(approx(byTicker.get('VUAA.UK') ?? 0, 0.0007, 1e-8), `VUAA ${byTicker.get('VUAA.UK')}`);
assert(approx(byTicker.get('VWCE.DE') ?? 0, 0.0001, 1e-8), `VWCE ${byTicker.get('VWCE.DE')}`);
assert(byTicker.size === 3, `open tickers ${[...byTicker.keys()].join(',')}`);

assert(real.transactions.every((t) => t.external_id.startsWith('xtb:')), 'external_id xtb:');
assert(
  real.transactions.every((t) => t.type !== ('close_trade' as string)),
  'no close_trade type',
);
assert(!real.transactions.some((t) => /profit\/loss/i.test(t.raw_type)), 'no Profit/loss row');
assert(!real.transactions.some((t) => /^total$/i.test(t.raw_type)), 'no Total row');

// Volume verify: warnings should be empty for this fixture
assert(
  real.warnings.filter((w) => w.includes('≠')).length === 0,
  `unit mismatch warnings: ${real.warnings.filter((w) => w.includes('≠')).join('; ')}`,
);

console.log('--- Portfolio calc: cash + realized ---');
assert(approx(real.realizedPl, 745.95), `closed realizedPl ${real.realizedPl}`);
assert(real.cashBalance != null && approx(real.cashBalance, 0.31), `Total cash ${real.cashBalance}`);

const ledgerCash = xtbCashByCurrency(real.transactions);
assert(approx(ledgerCash.EUR ?? 0, 0.31), `ledger cash EUR ${ledgerCash.EUR}`);

const withoutInterestTax = real.transactions.filter(
  (t) => t.type !== 'interest' && t.type !== 'tax',
);
const cashDropped = xtbCashByCurrency(withoutInterestTax);
assert(
  !approx(cashDropped.EUR ?? 0, 0.31),
  `bez interest/tax by hotovost neměla být 0.31 (got ${cashDropped.EUR})`,
);

const holdings = xtbHoldingsByTicker(real.transactions);
assert(approx(holdings['VVSM.DE'] ?? 0, 0.0009, 1e-8), `hold VVSM ${holdings['VVSM.DE']}`);
assert(approx(holdings['VUAA.UK'] ?? 0, 0.0007, 1e-8), `hold VUAA ${holdings['VUAA.UK']}`);
assert(approx(holdings['VWCE.DE'] ?? 0, 0.0001, 1e-8), `hold VWCE ${holdings['VWCE.DE']}`);

assert(INVESTMENT_TX_INTEREST_TAX_ENABLED === true, 'interest/tax flag must be enabled');
assertXtbInterestTaxImportAllowed(real.transactions);

console.log('--- Lot cost basis + UI deposits (computePortfolioCore) ---');
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const { buildPortfolioResult, computePortfolioCore } = await import(
  '../lib/investment-portfolio-calc.ts'
);

const calcTxs = real.transactions.map((t) => {
  const lotId = t.position_id ?? parseBrokerPositionIdFromNote(t.note);
  return {
    type: t.type,
    ticker: t.ticker,
    isin: t.isin,
    units: t.units,
    amount: Math.abs(t.amount),
    fee: t.fee,
    original_currency: t.original_currency,
    date: t.date,
    // Simulace DB: lot_id ze Position ID (upsert plní sloupec)
    lot_id: lotId,
    position_id: lotId,
  };
});

assert(
  calcTxs.filter((t) => t.type === 'buy' && t.lot_id).length === real.summary.buy.count,
  'každý buy musí mít lot_id (Position ID)',
);
assert(
  calcTxs.filter((t) => t.type === 'sell' && t.lot_id).length === real.summary.sell.count,
  'každý sell musí mít lot_id (Position ID)',
);

const identityFx = (amount: number, _from: string, _date: string) => amount;
const core = await computePortfolioCore(calcTxs, 'EUR', {
  convertOverride: identityFx,
});
// Ceny z Open Positions listu (report generation) — VVSM ~+100 % vs lot open 50.06
const openPrices = new Map<string, number>([
  ['VVSM.DE', 100.62],
  ['VUAA.UK', 149.26],
  ['VWCE.DE', 168.84],
]);
const calc = buildPortfolioResult(core, openPrices);

assert(approx(calc.summary.total_realized_pnl, 745.95, 0.05), `realized ${calc.summary.total_realized_pnl}`);
assert(approx(calc.summary.total_deposits_gross, 4207.69, 0.05), `gross dep ${calc.summary.total_deposits_gross}`);
assert(approx(calc.summary.total_withdrawals, 4953.92, 0.05), `wd ${calc.summary.total_withdrawals}`);
assert(calc.summary.total_deposits < 0, `net deposits < 0 (got ${calc.summary.total_deposits})`);
assert(calc.summary.total_return_pct == null, 'return % null při záporném net vkladu');

assert(calc.positions.some((p) => p.ticker === 'VWCE.DE'), 'VWCE.DE v otevřených (eps 1e-9)');
const vvsm = calc.positions.find((p) => p.ticker === 'VVSM.DE');
assert(vvsm != null, 'VVSM.DE open');
const vvsmBuy = vvsm!.invested / vvsm!.held_units;
assert(approx(vvsmBuy, 50.06, 0.15), `VVSM nákup ${vvsmBuy} (lot, ne průměr ~38)`);
assert(
  vvsm!.unrealized_pnl_pct != null && vvsm!.unrealized_pnl_pct >= 70 && vvsm!.unrealized_pnl_pct <= 120,
  `VVSM nerealizovaný ~+80–100 % (got ${vvsm!.unrealized_pnl_pct?.toFixed(1)} %)`,
);

// Bez lot_id by zbývající VVSM měla průměr ~38 → výrazně vyšší %
const avgCore = await computePortfolioCore(
  calcTxs.map((t) => ({ ...t, lot_id: null, position_id: null })),
  'EUR',
  { convertOverride: identityFx },
);
const avgCalc = buildPortfolioResult(avgCore, openPrices);
const vvsmAvg = avgCalc.positions.find((p) => p.ticker === 'VVSM.DE');
assert(vvsmAvg != null, 'VVSM avg path');
const avgBuy = vvsmAvg!.invested / vvsmAvg!.held_units;
assert(avgBuy < 45, `bez lotů průměrná nákupní ${avgBuy} (očekávám ≪ 50)`);
assert(
  (vvsmAvg!.unrealized_pnl_pct ?? 0) > (vvsm!.unrealized_pnl_pct ?? 0) + 30,
  'průměr přes ticker nadhodnocuje nerealizovaný zisk vs lot',
);

const vuaaOpenBuy = real.transactions.find(
  (t) =>
    t.type === 'buy' &&
    t.ticker === 'VUAA.UK' &&
    t.position_id &&
    real.openHoldings.some((h) => h.positionId === t.position_id),
);
assert(vuaaOpenBuy?.price_per_unit != null, 'VUAA open lot price');
assert(
  approx(vuaaOpenBuy!.price_per_unit!, 128.9, 0.5),
  `VUAA open lot price ${vuaaOpenBuy!.price_per_unit}`,
);

console.log('xtb-parser-selftest: OK');
process.exit(0);