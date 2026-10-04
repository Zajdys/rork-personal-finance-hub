import * as XLSX from 'xlsx';
import { textLooksLikeFailedBrokerPayment } from './broker-failed-payment';
import { textLooksLikePromoBrokerDeposit } from './broker-promo-deposit';
import type { Portfolio } from './trading212-parser';
import { readXlsxWorkbook } from './xlsx-read';

export const XTB_CASH_SHEET_NAME = 'CASH OPERATION HISTORY';

/** Tolerance při kontrole Σ(Amount) ≈ Total / Σ(Purchase value) ≈ Total. */
export const XTB_BALANCE_TOLERANCE = 0.02;

export type XtbCashOperation = {
  id: string;
  type: string;
  time: Date;
  symbol: string;
  comment: string;
  amount: number;
  currency: string;
};

export type XtbOpenPosition = {
  positionId: string;
  ticker: string;
  type: string;
  volume: number;
  purchaseValue: number;
  openTime: Date | null;
};

export type XtbParseResult = Portfolio & {
  /** Součet všech transakčních Amount (bez řádku Total). */
  cashSum: number;
  /** Amount z řádku Total = aktuální zůstatek účtu; null pokud chybí. */
  totalBalance: number | null;
  /** true pokud Total chybí, nebo |cashSum − totalBalance| ≤ tolerance. */
  balanceOk: boolean;
  /** true pokud OPEN POSITION Total chybí, nebo Σ(Purchase value) sedí. */
  openPositionsOk: boolean;
  /** Zdroj pozic: list OPEN POSITION, nebo fallback z cash historie. */
  positionsSource: 'open_position' | 'cash_history' | 'none';
  interest: number;
  realizedPl: number;
};

type MutablePos = {
  ticker: string;
  name: string;
  isin: string;
  shares: number;
  totalInvested: number;
  currency: string;
};

type Cashflow = {
  dividends: number;
  deposits: number;
  withdrawals: number;
  interest: number;
  realizedPl: number;
};

function emptyCashflow(): Cashflow {
  return { dividends: 0, deposits: 0, withdrawals: 0, interest: 0, realizedPl: 0 };
}

function emptyResult(): XtbParseResult {
  return {
    positions: [],
    totalInvested: 0,
    dividends: 0,
    deposits: 0,
    withdrawals: 0,
    cashSum: 0,
    totalBalance: null,
    balanceOk: true,
    openPositionsOk: true,
    positionsSource: 'none',
    interest: 0,
    realizedPl: 0,
  };
}

function normHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** České i anglické exporty: čárka/tečka jako desetinná, mezery tisíců. */
export function parseXtbAmount(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  let t = String(raw).trim().replace(/\s/g, '').replace(/'/g, '');
  if (!t) return 0;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot && lastComma !== -1) {
    // EU: 1.234,56 nebo 1505,00
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    // Mixed rare: 1,234.56 → drop thousands commas
    t = t.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma: 1505,00
    t = t.replace(',', '.');
  }
  // Only dots / integers: leave as-is (EN 1505.00 or 1,505.00 already handled)
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseXtbTime(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S));
    return new Date(Math.round((raw - 25569) * 86400 * 1000));
  }
  const s = String(raw).trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    return new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4] ?? 0),
      Number(dmy[5] ?? 0),
      Number(dmy[6] ?? 0),
    );
  }
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? new Date(iso) : null;
}

function findCashOperationSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  const exact = workbook.SheetNames.find((n) => normHeader(n) === normHeader(XTB_CASH_SHEET_NAME));
  if (exact) return workbook.Sheets[exact] ?? null;
  const cashOps = workbook.SheetNames.find((n) => /^cash\s*operations$/i.test(n.trim()));
  if (cashOps) return workbook.Sheets[cashOps] ?? null;
  const fuzzy = workbook.SheetNames.find((n) => /cash\s*operation/i.test(n));
  return fuzzy ? (workbook.Sheets[fuzzy] ?? null) : null;
}

/** List „OPEN POSITION 02072026“ — prefix, ne přesná shoda (datum v názvu). */
function findOpenPositionSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  const name = workbook.SheetNames.find((n) => /^open\s+position/i.test(n.trim()));
  return name ? (workbook.Sheets[name] ?? null) : null;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const cells = (rows[i] ?? []).map((c) => String(c ?? '').trim().toUpperCase());
    if (cells.includes('ID') && cells.includes('TYPE') && cells.includes('AMOUNT')) {
      return i;
    }
  }
  return -1;
}

type ColMap = {
  id: number;
  type: number;
  time: number;
  symbol: number;
  comment: number;
  amount: number;
  currency: number;
};

function mapColumns(headerRow: unknown[]): ColMap | null {
  const norm = headerRow.map((c) => normHeader(String(c ?? '')));
  const find = (...names: string[]) => {
    for (const name of names) {
      const idx = norm.findIndex((h) => h === name || h.includes(name));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const id = find('id');
  const type = find('type', 'typ');
  const time = find('time', 'čas', 'cas', 'datum', 'date');
  const symbol = find('symbol', 'symbol instrumentu');
  const comment = find('comment', 'komentář', 'komentar', 'popis');
  const amount = find('amount', 'částka', 'castka');
  const currency = find('currency', 'měna', 'mena', 'account currency');
  if (type < 0 || time < 0 || amount < 0) return null;
  return {
    id: id >= 0 ? id : 0,
    type,
    time,
    symbol: symbol >= 0 ? symbol : -1,
    comment: comment >= 0 ? comment : -1,
    amount,
    currency: currency >= 0 ? currency : -1,
  };
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0 || idx >= row.length) return '';
  return String(row[idx] ?? '').trim();
}

function isStockPurchase(type: string): boolean {
  const t = type.trim().toLowerCase();
  return (
    t === 'stock purchase' ||
    t.includes('stock purchase') ||
    t.includes('stocks/etf purchase') ||
    t.includes('nákup akci') ||
    (t.includes('nákup') && !t.includes('úrok')) ||
    (t.includes('nakup') && !t.includes('urok'))
  );
}

function isStockSale(type: string): boolean {
  const t = type.trim().toLowerCase();
  // „close trade“ je P/L, ne prodej jistoty — nepatří sem
  return (
    t === 'stock sale' ||
    t.includes('stock sale') ||
    t.includes('stocks/etf sale') ||
    t.includes('prodej')
  );
}

/** Realizovaný zisk/ztráta při zavření (doprovází Stock sale). */
function isCloseTrade(type: string): boolean {
  return type.trim().toLowerCase() === 'close trade';
}

function isDividend(type: string): boolean {
  const t = type.trim().toLowerCase();
  if (t.includes('withholding')) return false;
  return t.includes('dividend') || t === 'divident';
}

function isDividendTax(type: string): boolean {
  return /withholding\s*tax/i.test(type);
}

function isFreeFundsInterest(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t.includes('free-funds interest') && !t.includes('tax');
}

function isFreeFundsInterestTax(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t.includes('free-funds interest') && t.includes('tax');
}

function isDeposit(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t === 'deposit' || t.startsWith('deposit ') || t.includes('vklad');
}

function isWithdrawal(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t.startsWith('withdrawal') || t.includes('výběr') || t.includes('vyber');
}

function isTotalRow(type: string): boolean {
  return type.trim().toLowerCase() === 'total';
}

function shouldIgnoreType(type: string): boolean {
  const t = type.trim().toLowerCase();
  if (!t || isTotalRow(type)) return true;
  if (t.includes('commission') || t.includes('poplatek')) return true;
  if (t.includes('subaccount transfer')) return true;
  return false;
}

/**
 * XTB komentáře (EN + CZ):
 * - OPEN BUY 10 @ 150.50
 * - CLOSE BUY 5/10 @ 160.00
 * - BUY 10/10 @ 150,50  (legacy)
 */
export function parseTradeFromComment(comment: string): { shares: number; price: number } | null {
  const m = comment.match(
    /(?:OPEN|CLOSE)?\s*(?:BUY|SELL|NÁKUP|NAKUP|PRODEJ)\s+([0-9]+(?:[.,][0-9]+)?)(?:\/[0-9]+(?:[.,][0-9]+)?)?\s+@\s+([0-9]+(?:[.,][0-9]+)?)/i,
  );
  if (!m) return null;
  return {
    shares: parseXtbAmount(m[1]),
    price: parseXtbAmount(m[2]),
  };
}

function posKey(symbol: string): string {
  return symbol.trim().toUpperCase() || 'UNKNOWN';
}

/**
 * Cashflow z CASH OPERATION HISTORY (dividendy, vklady, výběry, P/L, úroky).
 * Stock purchase/sale sem NEPATŘÍ — cost basis otevřených pozic jde z OPEN POSITION.
 */
function applyCashflowRow(op: XtbCashOperation, cashflow: Cashflow): void {
  const type = op.type;
  if (shouldIgnoreType(type)) return;
  if (isStockPurchase(type) || isStockSale(type)) return;

  if (isCloseTrade(type)) {
    cashflow.realizedPl += op.amount;
    return;
  }
  if (isFreeFundsInterest(type) || isFreeFundsInterestTax(type)) {
    cashflow.interest += op.amount;
    return;
  }
  if (isDividend(type) || isDividendTax(type)) {
    cashflow.dividends += op.amount;
    return;
  }
  if (isDeposit(type)) {
    if (textLooksLikeFailedBrokerPayment(`${type} ${op.comment}`)) return;
    // Promo free shares → ne do „Vloženo“ (Portfolio.deposits); XTB positions path
    // nemá oddělený cash ledger — bonus se projeví v hodnotě pozic / Total.
    if (textLooksLikePromoBrokerDeposit(`${type} ${op.comment}`)) return;
    cashflow.deposits += Math.abs(op.amount);
    return;
  }
  if (isWithdrawal(type)) {
    if (textLooksLikeFailedBrokerPayment(`${type} ${op.comment}`)) return;
    cashflow.withdrawals += Math.abs(op.amount);
  }
}

/** Fallback: rekonstrukce pozic z cash historie, jen když OPEN POSITION list chybí. */
function applyPositionFromCashRow(op: XtbCashOperation, byKey: Map<string, MutablePos>): void {
  const type = op.type;
  if (shouldIgnoreType(type)) return;

  const symbol = op.symbol.trim().toUpperCase();
  const currency = op.currency || 'EUR';

  if (isStockPurchase(type)) {
    if (!symbol || symbol === 'CASH') return;
    const trade = parseTradeFromComment(op.comment);
    const shares = trade?.shares ?? 0;
    const invested = Math.abs(op.amount);
    const key = posKey(symbol);
    const prev = byKey.get(key) ?? {
      ticker: symbol,
      name: symbol,
      isin: '',
      shares: 0,
      totalInvested: 0,
      currency,
    };
    prev.shares += shares > 0 ? shares : invested > 0 && trade?.price ? invested / trade.price : 0;
    prev.totalInvested += invested;
    prev.currency = currency || prev.currency;
    byKey.set(key, prev);
    return;
  }

  if (isStockSale(type)) {
    if (!symbol || symbol === 'CASH') return;
    const trade = parseTradeFromComment(op.comment);
    const sold = trade?.shares ?? 0;
    const key = posKey(symbol);
    const prev = byKey.get(key);
    if (!prev || prev.shares <= 0) return;
    const qty = sold > 0 ? Math.min(sold, prev.shares) : prev.shares;
    const ratio = qty / prev.shares;
    prev.totalInvested *= 1 - ratio;
    prev.shares -= qty;
    if (prev.shares <= 1e-9) byKey.delete(key);
    else byKey.set(key, prev);
  }
}

function finalizePortfolio(
  positions: MutablePos[],
  cashflow: Cashflow,
): Portfolio {
  const out = positions
    .filter((p) => p.shares > 1e-12)
    .map((p) => ({
      ticker: p.ticker,
      name: p.name,
      isin: p.isin,
      shares: p.shares,
      avgBuyPrice: p.shares > 0 ? p.totalInvested / p.shares : 0,
      totalInvested: p.totalInvested,
      currency: p.currency || 'EUR',
    }))
    .sort((a, b) => b.totalInvested - a.totalInvested);

  return {
    positions: out,
    totalInvested: out.reduce((s, p) => s + p.totalInvested, 0),
    dividends: cashflow.dividends,
    deposits: cashflow.deposits,
    withdrawals: cashflow.withdrawals,
  };
}

type ParsedSheet = {
  ops: XtbCashOperation[];
  totalBalance: number | null;
  defaultCurrency: string;
};

function extractTotalBalance(rows: unknown[][], col: ColMap): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] ?? [];
    const type = cell(row, col.type);
    if (!isTotalRow(type)) continue;
    // Amount může být ve sloupci Amount; někdy Total nemá Type ve stejném sloupci
    const amt = parseXtbAmount(row[col.amount]);
    return amt;
  }
  // Fallback: poslední řádek začíná „Total“ v libovolné buňce
  for (let i = rows.length - 1; i >= Math.max(0, rows.length - 5); i--) {
    const row = rows[i] ?? [];
    const joined = row.map((c) => String(c ?? '').trim().toLowerCase()).join(' ');
    if (!joined.includes('total')) continue;
    return parseXtbAmount(row[col.amount]);
  }
  return null;
}

function rowsToOperations(rows: unknown[][], col: ColMap, defaultCurrency: string): XtbCashOperation[] {
  const ops: XtbCashOperation[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const type = cell(row, col.type);
    if (!type || normHeader(type) === 'type') continue;
    if (isTotalRow(type)) continue;
    const time = parseXtbTime(row[col.time]);
    if (!time) continue;
    const amount = parseXtbAmount(row[col.amount]);
    const symbol = col.symbol >= 0 ? cell(row, col.symbol) : '';
    const comment = col.comment >= 0 ? cell(row, col.comment) : '';
    const currency =
      (col.currency >= 0 ? cell(row, col.currency) : '') || defaultCurrency || 'EUR';
    ops.push({
      id: col.id >= 0 ? cell(row, col.id) : String(i),
      type,
      time,
      symbol,
      comment,
      amount,
      currency: currency.toUpperCase(),
    });
  }
  ops.sort((a, b) => a.time.getTime() - b.time.getTime());
  return ops;
}

/** Měna účtu z hlavičky listu (bez Currency sloupce): „Account currency: EUR“ apod. */
function inferCurrencyFromPreamble(rows: unknown[][], headerIdx: number): string | null {
  for (let i = 0; i < headerIdx; i++) {
    const joined = (rows[i] ?? []).map((c) => String(c ?? '')).join(' ');
    const m =
      joined.match(/account\s*currency[:\s]+(EUR|USD|GBP|PLN|CZK)/i) ||
      joined.match(/měna\s*účtu[:\s]+(EUR|USD|GBP|PLN|CZK)/i) ||
      joined.match(/\b(EUR|USD|GBP|PLN|CZK)\b/);
    if (m) return m[1]!.toUpperCase();
  }
  return null;
}

function inferDefaultCurrency(workbook: XLSX.WorkBook, preambleCurrency: string | null): string {
  if (preambleCurrency) return preambleCurrency;
  for (const name of workbook.SheetNames) {
    const m = name.match(/\b(EUR|USD|GBP|PLN|CZK)\b/i);
    if (m) return m[1]!.toUpperCase();
  }
  return 'EUR';
}

function parseCashSheet(workbook: XLSX.WorkBook): ParsedSheet | null {
  const sheet = findCashOperationSheet(workbook);
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) return null;
  const col = mapColumns(rows[headerIdx] ?? []);
  if (!col) return null;
  const dataRows = rows.slice(headerIdx + 1);
  const preambleCurrency = inferCurrencyFromPreamble(rows, headerIdx);
  const defaultCurrency = inferDefaultCurrency(workbook, preambleCurrency);
  const totalBalance = extractTotalBalance(dataRows, col);
  const ops = rowsToOperations(dataRows, col, defaultCurrency);
  return { ops, totalBalance, defaultCurrency };
}

type OpenPosColMap = {
  position: number;
  symbol: number;
  type: number;
  volume: number;
  openTime: number;
  purchaseValue: number;
};

function findOpenPositionHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] ?? []).map((c) => normHeader(String(c ?? '')));
    const hasSymbol = cells.some((c) => c === 'symbol');
    const hasVolume = cells.some((c) => c === 'volume');
    const hasPurchase = cells.some((c) => c.includes('purchase') && c.includes('value'));
    if (hasSymbol && hasVolume && hasPurchase) return i;
  }
  return -1;
}

function mapOpenPositionColumns(headerRow: unknown[]): OpenPosColMap | null {
  const norm = headerRow.map((c) => normHeader(String(c ?? '')));
  const findExact = (...names: string[]) => {
    for (const name of names) {
      const idx = norm.findIndex((h) => h === name);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const findIncl = (...parts: string[]) =>
    norm.findIndex((h) => parts.every((p) => h.includes(p)));

  const symbol = findExact('symbol');
  const volume = findExact('volume', 'objem');
  const purchaseValue = findIncl('purchase', 'value');
  const purchaseCz = purchaseValue < 0 ? findIncl('nákupní', 'hodnota') : purchaseValue;
  const purchase = purchaseCz >= 0 ? purchaseCz : findIncl('purchase');
  if (symbol < 0 || volume < 0 || purchase < 0) return null;

  return {
    position: findExact('position', 'pozice'),
    symbol,
    type: findExact('type', 'typ'),
    volume,
    openTime: findExact('open time', 'open time', 'čas otevření', 'cas otevreni'),
    purchaseValue: purchase,
  };
}

function isOpenPositionTotalRow(row: unknown[]): boolean {
  return row.some((c) => String(c ?? '').trim().toLowerCase() === 'total');
}

type ParsedOpenSheet = {
  positions: XtbOpenPosition[];
  purchaseValueTotal: number | null;
  defaultCurrency: string;
};

function parseOpenPositionSheet(
  workbook: XLSX.WorkBook,
  fallbackCurrency: string,
): ParsedOpenSheet | null {
  const sheet = findOpenPositionSheet(workbook);
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  const headerIdx = findOpenPositionHeaderRow(rows);
  if (headerIdx < 0) return null;
  const col = mapOpenPositionColumns(rows[headerIdx] ?? []);
  if (!col) return null;

  const preambleCurrency = inferCurrencyFromPreamble(rows, headerIdx);
  const defaultCurrency = preambleCurrency || fallbackCurrency || 'EUR';

  const positions: XtbOpenPosition[] = [];
  let purchaseValueTotal: number | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isOpenPositionTotalRow(row)) {
      const tv = parseXtbAmount(row[col.purchaseValue]);
      // Total může mít prázdný Purchase value — ber jen pokud je vyplněný
      if (row[col.purchaseValue] !== '' && row[col.purchaseValue] != null) {
        purchaseValueTotal = tv;
      }
      continue;
    }

    const ticker = cell(row, col.symbol).toUpperCase();
    if (!ticker) continue;
    const volume = parseXtbAmount(row[col.volume]);
    const purchaseValue = parseXtbAmount(row[col.purchaseValue]);
    if (volume <= 0 && purchaseValue <= 0) continue;

    positions.push({
      positionId: col.position >= 0 ? cell(row, col.position) : String(i),
      ticker,
      type: col.type >= 0 ? cell(row, col.type) : '',
      volume,
      purchaseValue,
      openTime: col.openTime >= 0 ? parseXtbTime(row[col.openTime]) : null,
    });
  }

  return { positions, purchaseValueTotal, defaultCurrency };
}

function aggregateOpenPositions(
  open: XtbOpenPosition[],
  currency: string,
): MutablePos[] {
  const byKey = new Map<string, MutablePos>();
  for (const p of open) {
    const key = posKey(p.ticker);
    const prev = byKey.get(key) ?? {
      ticker: p.ticker,
      name: p.ticker,
      isin: '',
      shares: 0,
      totalInvested: 0,
      currency,
    };
    prev.shares += p.volume;
    prev.totalInvested += p.purchaseValue;
    byKey.set(key, prev);
  }
  return [...byKey.values()];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function logOpenPurchaseCheck(
  sumPurchase: number,
  totalPurchase: number | null,
): boolean {
  if (totalPurchase == null) {
    console.log(
      `[XTB parser] OPEN POSITION: Σ(Purchase value)=${round2(sumPurchase)} (Total row empty/missing)`,
    );
    return true;
  }
  const diff = sumPurchase - totalPurchase;
  const ok = Math.abs(diff) <= XTB_BALANCE_TOLERANCE;
  if (!ok) {
    console.warn(
      `[XTB parser] OPEN POSITION Purchase value mismatch: Σ=${round2(sumPurchase)} vs Total=${totalPurchase} (diff=${round2(diff)})`,
    );
  } else {
    console.log(
      `[XTB parser] OPEN POSITION OK: Σ(Purchase value)=${round2(sumPurchase)} = Total ${totalPurchase}`,
    );
  }
  return ok;
}

/** True pokud workbook obsahuje list / hlavičky CASH OPERATION HISTORY. */
export function isXtbWorkbook(workbook: XLSX.WorkBook): boolean {
  if (findCashOperationSheet(workbook)) return true;
  if (findOpenPositionSheet(workbook)) return true;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
    if (findHeaderRowIndex(rows) >= 0) return true;
  }
  return false;
}

export function isXtbXlsx(fileContent: string | ArrayBuffer): boolean {
  try {
    return isXtbWorkbook(readXlsxWorkbook(fileContent));
  } catch {
    return false;
  }
}

/**
 * Ověří Σ(Amount všech transakcí) ≈ Amount řádku Total.
 * Vrací null, pokud Total v souboru chybí.
 */
export function verifyXtbCashBalance(
  cashSum: number,
  totalBalance: number | null,
  tolerance = XTB_BALANCE_TOLERANCE,
): { ok: boolean; cashSum: number; totalBalance: number; diff: number } | null {
  if (totalBalance == null) return null;
  const diff = cashSum - totalBalance;
  return {
    ok: Math.abs(diff) <= tolerance,
    cashSum,
    totalBalance,
    diff,
  };
}

function logBalanceCheck(cashSum: number, totalBalance: number | null): boolean {
  const check = verifyXtbCashBalance(cashSum, totalBalance);
  if (!check) {
    console.warn('[XTB parser] Total row missing — cannot verify cash balance');
    return true;
  }
  if (!check.ok) {
    console.warn(
      `[XTB parser] Cash balance mismatch: Σ(Amount)=${round2(check.cashSum)} vs Total=${check.totalBalance} (diff=${round2(check.diff)})`,
    );
    return false;
  }
  console.log(
    `[XTB parser] Cash balance OK: Σ(Amount)=${round2(check.cashSum)} = Total ${check.totalBalance}`,
  );
  return true;
}

/** Parsuje řádky CASH OPERATION HISTORY do interního formátu (pro debug / testy). */
export function parseXtbCashOperations(fileContent: string | ArrayBuffer): XtbCashOperation[] {
  const parsed = parseCashSheet(readXlsxWorkbook(fileContent));
  return parsed?.ops ?? [];
}

/** Parsuje OPEN POSITION list (Volume + Purchase value). */
export function parseXtbOpenPositions(fileContent: string | ArrayBuffer): XtbOpenPosition[] {
  const workbook = readXlsxWorkbook(fileContent);
  const open = parseOpenPositionSheet(workbook, 'EUR');
  return open?.positions ?? [];
}

/**
 * Parsuje XTB xStation5 Excel export:
 * - OPEN POSITION → otevřené pozice (Volume, Purchase value = Investováno)
 * - CASH OPERATION HISTORY → dividendy, vklady, výběry, close trade, úroky
 */
export function parseXtbXlsxDetailed(fileContent: string | ArrayBuffer): XtbParseResult {
  const workbook = readXlsxWorkbook(fileContent);
  const cash = parseCashSheet(workbook);
  const open = parseOpenPositionSheet(workbook, cash?.defaultCurrency ?? 'EUR');

  const ops = cash?.ops ?? [];
  const cashSum = round2(ops.reduce((s, op) => s + op.amount, 0));
  const balanceOk = ops.length ? logBalanceCheck(cashSum, cash?.totalBalance ?? null) : true;

  const cashflow = emptyCashflow();
  for (const op of ops) {
    applyCashflowRow(op, cashflow);
  }

  let positions: MutablePos[] = [];
  let positionsSource: XtbParseResult['positionsSource'] = 'none';
  let openPositionsOk = true;

  if (open && open.positions.length > 0) {
    positions = aggregateOpenPositions(open.positions, open.defaultCurrency);
    positionsSource = 'open_position';
    const sumPurchase = open.positions.reduce((s, p) => s + p.purchaseValue, 0);
    openPositionsOk = logOpenPurchaseCheck(sumPurchase, open.purchaseValueTotal);
  } else if (ops.length) {
    // Fallback jen když OPEN POSITION chybí (starší / testovací soubory)
    const byKey = new Map<string, MutablePos>();
    for (const op of ops) {
      applyPositionFromCashRow(op, byKey);
    }
    positions = [...byKey.values()];
    positionsSource = positions.length ? 'cash_history' : 'none';
    if (positionsSource === 'cash_history') {
      console.warn('[XTB parser] OPEN POSITION sheet missing — falling back to cash history cost basis');
    }
  }

  if (!ops.length && !positions.length) return emptyResult();

  const portfolio = finalizePortfolio(positions, cashflow);

  return {
    ...portfolio,
    cashSum,
    totalBalance: cash?.totalBalance == null ? null : round2(cash.totalBalance),
    balanceOk,
    openPositionsOk,
    positionsSource,
    interest: round2(cashflow.interest),
    realizedPl: round2(cashflow.realizedPl),
  };
}

/**
 * Parsuje XTB xStation5 Excel export do Portfolio (stejný tvar jako Trading 212).
 * Při nesouladu Total loguje varování (nethrowuje — UI import může pokračovat).
 */
export function parseXtbXlsx(fileContent: string | ArrayBuffer): Portfolio {
  const detailed = parseXtbXlsxDetailed(fileContent);
  return {
    positions: detailed.positions,
    totalInvested: detailed.totalInvested,
    dividends: detailed.dividends,
    deposits: detailed.deposits,
    withdrawals: detailed.withdrawals,
  };
}
