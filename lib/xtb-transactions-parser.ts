/**
 * XTB xStation 5 — historie účtu (xlsx) → investment_transactions.
 *
 * Nový export (2025+): listy Cash Operations, Closed Positions, Open Positions.
 * Starší export (CASH OPERATION HISTORY / OPEN POSITION …) zůstává v lib/xtb-parser.ts
 * (positions / Portfolio path).
 */
import * as XLSX from 'xlsx';
import { INVESTMENT_TX_INTEREST_TAX_ENABLED } from '@/constants/feature-flags';
import { encodeBrokerPositionNote } from '@/lib/broker-position-id';
import {
  type InvestmentTransactionType,
  type ParsedEtoroTransaction,
} from '@/lib/etoro-transactions-parser';
import {
  parseTradeFromComment,
  parseXtbAmount,
  XTB_BALANCE_TOLERANCE,
} from '@/lib/xtb-parser';
import { readXlsxWorkbook } from '@/lib/xlsx-read';

const UNITS_EPS = 1e-8;

export type XtbParsedTransaction = ParsedEtoroTransaction & {
  position_id?: string | null;
  raw_type: string;
};

export type XtbOpenHolding = {
  ticker: string;
  units: number;
  positionId: string | null;
};

export type XtbTransactionParseResult = {
  transactions: XtbParsedTransaction[];
  skipped: number;
  warnings: string[];
  accountCurrency: string;
  /** Amount z řádku Total (Cash Operations) — aktuální hotovost. */
  cashBalance: number | null;
  /** Σ Profit/Loss z Closed Positions (bez řádku Profit/loss). */
  realizedPl: number;
  openHoldings: XtbOpenHolding[];
  summary: Record<InvestmentTransactionType, { count: number; amountSum: number }>;
};

const EMPTY_SUMMARY = (): XtbTransactionParseResult['summary'] => ({
  buy: { count: 0, amountSum: 0 },
  sell: { count: 0, amountSum: 0 },
  dividend: { count: 0, amountSum: 0 },
  deposit: { count: 0, amountSum: 0 },
  withdrawal: { count: 0, amountSum: 0 },
  fee: { count: 0, amountSum: 0 },
  promo: { count: 0, amountSum: 0 },
  transfer_out: { count: 0, amountSum: 0 },
  gift: { count: 0, amountSum: 0 },
  interest: { count: 0, amountSum: 0 },
  tax: { count: 0, amountSum: 0 },
});

function normHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function sheetRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0 || idx >= row.length) return '';
  return String(row[idx] ?? '').trim();
}

function findSheet(workbook: XLSX.WorkBook, ...matchers: RegExp[]): XLSX.WorkSheet | null {
  for (const re of matchers) {
    const name = workbook.SheetNames.find((n) => re.test(n.trim()));
    if (name) return workbook.Sheets[name] ?? null;
  }
  return null;
}

function findCashOperationsSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  return findSheet(
    workbook,
    /^cash\s*operations$/i,
    /cash\s*operation\s*history/i,
  );
}

function findClosedPositionsSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  return findSheet(workbook, /^closed\s+positions$/i, /closed\s+position/i);
}

function findOpenPositionsSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  return findSheet(workbook, /^open\s+positions$/i, /^open\s+position\b/i);
}

function parseXtbTime(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S)));
    return new Date(Math.round((raw - 25569) * 86400 * 1000));
  }
  const s = String(raw).trim();
  if (!s) return null;
  const dmy = s.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (dmy) {
    return new Date(
      Date.UTC(
        Number(dmy[3]),
        Number(dmy[2]) - 1,
        Number(dmy[1]),
        Number(dmy[4] ?? 0),
        Number(dmy[5] ?? 0),
        Number(dmy[6] ?? 0),
      ),
    );
  }
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? new Date(iso) : null;
}

function toDateYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inferAccountCurrency(rows: unknown[][], headerIdx: number, workbook: XLSX.WorkBook): string {
  for (let i = 0; i < headerIdx; i++) {
    const joined = (rows[i] ?? []).map((c) => String(c ?? '')).join(' ');
    const m =
      joined.match(/account\s*currency[:\s]+(EUR|USD|GBP|PLN|CZK)/i) ||
      joined.match(/měna\s*účtu[:\s]+(EUR|USD|GBP|PLN|CZK)/i);
    if (m) return m[1]!.toUpperCase();
  }
  for (const name of workbook.SheetNames) {
    const m = name.match(/\b(EUR|USD|GBP|PLN|CZK)\b/i);
    if (m) return m[1]!.toUpperCase();
  }
  // Název souboru často EUR_… — workbook names nemusí mít měnu
  return 'EUR';
}

/** Povolené typy Cash Operations (EN). Neznámý = chyba. */
const CASH_TYPE_MAP: Record<string, InvestmentTransactionType> = {
  deposit: 'deposit',
  withdrawal: 'withdrawal',
  'stock purchase': 'buy',
  'stock sell': 'sell',
  'stock sale': 'sell',
  dividend: 'dividend',
  divident: 'dividend',
  'withholding tax': 'tax',
  'free funds interest': 'interest',
  'free-funds interest': 'interest',
  'free funds interest tax': 'tax',
  'free-funds interest tax': 'tax',
};

function mapCashType(raw: string): InvestmentTransactionType {
  const key = normHeader(raw);
  const mapped = CASH_TYPE_MAP[key];
  if (!mapped) {
    throw new Error(`XTB Cash Operations: neznámý typ „${raw.trim()}“ — import přerušen.`);
  }
  return mapped;
}

function isTotalRow(type: string): boolean {
  return normHeader(type) === 'total';
}

function isProfitLossRow(firstCell: string): boolean {
  const t = normHeader(firstCell);
  return t === 'profit/loss' || t === 'profit / loss' || t === 'zisk/ztráta' || t === 'zisk/ztrata';
}

type CashColMap = {
  type: number;
  ticker: number;
  time: number;
  amount: number;
  id: number;
  comment: number;
  positionId: number;
};

function findCashHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] ?? []).map((c) => normHeader(String(c ?? '')));
    const hasType = cells.includes('type') || cells.includes('typ');
    const hasAmount = cells.includes('amount') || cells.includes('částka') || cells.includes('castka');
    const hasId = cells.includes('id');
    if (hasType && hasAmount && hasId) return i;
  }
  return -1;
}

function mapCashColumns(headerRow: unknown[]): CashColMap | null {
  const norm = headerRow.map((c) => normHeader(String(c ?? '')));
  const find = (...names: string[]) => {
    for (const name of names) {
      const idx = norm.findIndex((h) => h === name);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const type = find('type', 'typ');
  const amount = find('amount', 'částka', 'castka');
  const id = find('id');
  const time = find('time', 'čas', 'cas', 'date', 'datum');
  if (type < 0 || amount < 0 || id < 0 || time < 0) return null;
  return {
    type,
    ticker: find('ticker', 'symbol', 'symbol instrumentu'),
    time,
    amount,
    id,
    comment: find('comment', 'komentář', 'komentar', 'popis'),
    positionId: find('position id', 'position', 'pozice'),
  };
}

/**
 * Dokud není SQL interest/tax na DB, import s těmito typy zablokuj.
 * Parsování a selftest běží normálně.
 */
export function assertXtbInterestTaxImportAllowed(
  transactions: { type: string }[],
): void {
  if (INVESTMENT_TX_INTEREST_TAX_ENABLED) return;
  const n = transactions.filter((t) => t.type === 'interest' || t.type === 'tax').length;
  if (n <= 0) return;
  throw new Error(
    `XTB import: ${n} úroků/daní vyžaduje migraci typů interest+tax ` +
      `(investment_transactions_type_check). Aplikuj SQL, nastav ` +
      `INVESTMENT_TX_INTEREST_TAX_ENABLED=true a zkus znovu.`,
  );
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseClosedVolumesAndPl(sheet: XLSX.WorkSheet | null): {
  volumeByTicker: Map<string, number>;
  realizedPl: number;
} {
  const volumeByTicker = new Map<string, number>();
  let realizedPl = 0;
  if (!sheet) return { volumeByTicker, realizedPl };

  const rows = sheetRows(sheet);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] ?? []).map((c) => normHeader(String(c ?? '')));
    if (cells.includes('ticker') && cells.some((c) => c.includes('volume') || c === 'objem')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { volumeByTicker, realizedPl };

  const norm = (rows[headerIdx] ?? []).map((c) => normHeader(String(c ?? '')));
  const tickerCol = norm.findIndex((h) => h === 'ticker');
  const volumeCol = norm.findIndex((h) => h === 'volume' || h === 'objem');
  const plCol = norm.findIndex(
    (h) => h === 'profit/loss' || h === 'profit/loss' || (h.includes('profit') && h.includes('loss')),
  );
  const plColAlt = plCol >= 0 ? plCol : norm.findIndex((h) => h === 'gross profit');

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const first = cell(row, 0);
    if (isProfitLossRow(first)) {
      // Řádek Profit/loss NEIMPORTOVAT — jen součet / kontrola
      if (plColAlt >= 0) realizedPl = parseXtbAmount(row[plColAlt]);
      continue;
    }
    const ticker = tickerCol >= 0 ? cell(row, tickerCol).toUpperCase() : '';
    if (!ticker) continue;
    const vol = volumeCol >= 0 ? parseXtbAmount(row[volumeCol]) : 0;
    if (vol > 0) volumeByTicker.set(ticker, (volumeByTicker.get(ticker) ?? 0) + vol);
    if (plColAlt >= 0) realizedPl += parseXtbAmount(row[plColAlt]);
  }

  return { volumeByTicker, realizedPl: round2(realizedPl) };
}

function parseOpenHoldings(sheet: XLSX.WorkSheet | null): XtbOpenHolding[] {
  if (!sheet) return [];
  const rows = sheetRows(sheet);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] ?? []).map((c) => normHeader(String(c ?? '')));
    if (cells.includes('ticker') && cells.includes('volume')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const norm = (rows[headerIdx] ?? []).map((c) => normHeader(String(c ?? '')));
  const tickerCol = norm.findIndex((h) => h === 'ticker');
  const volumeCol = norm.findIndex((h) => h === 'volume');
  const typeCol = norm.findIndex((h) => h === 'type' || h === 'typ');
  const instrumentCol = norm.findIndex(
    (h) => h.includes('instrument') || h.includes('position'),
  );

  const out: XtbOpenHolding[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const ticker = tickerCol >= 0 ? cell(row, tickerCol).toUpperCase() : '';
    if (!ticker) continue;
    const type = typeCol >= 0 ? cell(row, typeCol).toUpperCase() : '';
    // Nový Open Positions: instrument summary (Category=ETF, Type prázdný) + detail (Type=BUY, Instrument=position id)
    if (type && type !== 'BUY' && type !== 'SELL') continue;
    if (!type) {
      // summary řádek — přeskoč, bereme jen BUY detail
      continue;
    }
    if (type !== 'BUY') continue;
    const units = volumeCol >= 0 ? parseXtbAmount(row[volumeCol]) : 0;
    if (units <= UNITS_EPS) continue;
    const positionId =
      instrumentCol >= 0 && /^\d+$/.test(cell(row, instrumentCol))
        ? cell(row, instrumentCol)
        : null;
    out.push({ ticker, units: round8(units), positionId });
  }
  return out;
}

/**
 * Parsuje XTB xStation 5 Account history (Cash Operations + Closed/Open Positions)
 * do ledgeru investment_transactions.
 */
export function parseXtbTransactionsXlsx(
  fileContent: string | ArrayBuffer,
): XtbTransactionParseResult {
  const workbook = readXlsxWorkbook(fileContent);
  const cashSheet = findCashOperationsSheet(workbook);
  if (!cashSheet) {
    throw new Error('XTB: chybí list Cash Operations (nebo CASH OPERATION HISTORY).');
  }

  const rows = sheetRows(cashSheet);
  const headerIdx = findCashHeaderRow(rows);
  if (headerIdx < 0) {
    throw new Error('XTB Cash Operations: nenašel jsem hlavičku Type/Amount/ID.');
  }
  const col = mapCashColumns(rows[headerIdx] ?? []);
  if (!col) {
    throw new Error('XTB Cash Operations: nepodařilo se namapovat sloupce.');
  }

  const accountCurrency = inferAccountCurrency(rows, headerIdx, workbook);
  const transactions: XtbParsedTransaction[] = [];
  let cashBalance: number | null = null;
  let skipped = 0;
  const warnings: string[] = [];

  const sellUnitsByTicker = new Map<string, number>();
  const buyUnitsByTicker = new Map<string, number>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rawType = cell(row, col.type);
    if (!rawType) continue;
    if (isTotalRow(rawType)) {
      cashBalance = round2(parseXtbAmount(row[col.amount]));
      continue;
    }

    const id = cell(row, col.id);
    if (!id) {
      skipped += 1;
      warnings.push(`Řádek ${i + 1}: chybí ID — přeskočeno.`);
      continue;
    }

    const time = parseXtbTime(row[col.time]);
    if (!time) {
      throw new Error(`XTB Cash Operations ID ${id}: neplatný čas.`);
    }

    const mapped = mapCashType(rawType);
    const amountRaw = parseXtbAmount(row[col.amount]);
    const amount = Math.abs(amountRaw);
    const tickerRaw = col.ticker >= 0 ? cell(row, col.ticker).toUpperCase() : '';
    const ticker = tickerRaw && tickerRaw !== 'CASH' ? tickerRaw : null;
    const comment = col.comment >= 0 ? cell(row, col.comment) : '';
    const positionId = col.positionId >= 0 ? cell(row, col.positionId) || null : null;

    let units: number | null = null;
    let price_per_unit: number | null = null;

    if (mapped === 'buy' || mapped === 'sell') {
      const trade = parseTradeFromComment(comment);
      if (!trade || !(trade.shares > 0)) {
        throw new Error(
          `XTB ${rawType} ID ${id}: nejde přečíst kusy z komentáře „${comment}“.`,
        );
      }
      units = round8(trade.shares);
      price_per_unit = trade.price > 0 ? trade.price : null;
      if (!ticker) {
        throw new Error(`XTB ${rawType} ID ${id}: chybí ticker.`);
      }
      const map = mapped === 'buy' ? buyUnitsByTicker : sellUnitsByTicker;
      map.set(ticker, (map.get(ticker) ?? 0) + units);
    }

    transactions.push({
      type: mapped,
      ticker,
      isin: null,
      units,
      price_per_unit,
      amount,
      fee: 0,
      original_currency: accountCurrency,
      date: toDateYmd(time),
      external_id: `xtb:${id}`,
      source: 'import',
      note: encodeBrokerPositionNote(comment || null, positionId, 'xtb'),
      position_id: positionId,
      raw_type: rawType,
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.external_id.localeCompare(b.external_id));

  const closedSheet = findClosedPositionsSheet(workbook);
  const { volumeByTicker: closedVol, realizedPl } = parseClosedVolumesAndPl(closedSheet);

  // Ověření: Σ CLOSE kusů z Cash ≈ Volume v Closed Positions (po tickeru)
  for (const [ticker, closedUnits] of closedVol) {
    const sold = sellUnitsByTicker.get(ticker) ?? 0;
    if (Math.abs(sold - closedUnits) > UNITS_EPS * 10) {
      warnings.push(
        `Closed Positions ${ticker}: volume ${round8(closedUnits)} ≠ Σ Stock sell ${round8(sold)}`,
      );
    }
  }
  for (const [ticker, sold] of sellUnitsByTicker) {
    if (!closedVol.has(ticker) && sold > UNITS_EPS) {
      warnings.push(`Stock sell ${ticker}: ${round8(sold)} ks bez řádku v Closed Positions`);
    }
  }

  const openHoldings = parseOpenHoldings(findOpenPositionsSheet(workbook));
  const openByTicker = new Map<string, number>();
  for (const h of openHoldings) {
    openByTicker.set(h.ticker, (openByTicker.get(h.ticker) ?? 0) + h.units);
  }

  // Net units z cash vs Open Positions
  const allTickers = new Set([
    ...buyUnitsByTicker.keys(),
    ...sellUnitsByTicker.keys(),
    ...openByTicker.keys(),
  ]);
  for (const ticker of allTickers) {
    const net = round8((buyUnitsByTicker.get(ticker) ?? 0) - (sellUnitsByTicker.get(ticker) ?? 0));
    const open = round8(openByTicker.get(ticker) ?? 0);
    if (Math.abs(net - open) > UNITS_EPS * 10) {
      warnings.push(
        `Open Positions ${ticker}: ${open} ≠ cash net ${net} (buy−sell)`,
      );
    }
  }

  const summary = EMPTY_SUMMARY();
  for (const tx of transactions) {
    summary[tx.type].count += 1;
    summary[tx.type].amountSum = round2(summary[tx.type].amountSum + tx.amount);
  }

  // Kontrola hotovosti: Σ signed amounts ≈ Total
  if (cashBalance != null) {
    let signed = 0;
    for (const tx of transactions) {
      const sign =
        tx.type === 'deposit' ||
        tx.type === 'sell' ||
        tx.type === 'dividend' ||
        tx.type === 'interest' ||
        tx.type === 'promo'
          ? 1
          : -1;
      signed += sign * tx.amount;
    }
    const diff = round2(signed - cashBalance);
    if (Math.abs(diff) > XTB_BALANCE_TOLERANCE) {
      warnings.push(
        `Cash Total ${cashBalance} ≠ Σ signed ${round2(signed)} (diff ${diff})`,
      );
    }
  }

  return {
    transactions,
    skipped,
    warnings,
    accountCurrency,
    cashBalance,
    realizedPl,
    openHoldings,
    summary,
  };
}

/** Hotovost po měnách z ledgeru (interest +, tax − — stejně jako investment-cash-balances). */
export function xtbCashByCurrency(
  transactions: XtbParsedTransaction[],
): Record<string, number> {
  const bal: Record<string, number> = {};
  for (const tx of transactions) {
    const ccy = String(tx.original_currency ?? 'EUR')
      .trim()
      .toUpperCase() || 'EUR';
    const amt = Math.abs(Number(tx.amount) || 0);
    if (!Number.isFinite(amt)) continue;
    const prev = bal[ccy] ?? 0;
    switch (tx.type) {
      case 'deposit':
      case 'promo':
      case 'sell':
      case 'dividend':
      case 'interest':
        bal[ccy] = prev + amt;
        break;
      case 'buy':
      case 'withdrawal':
      case 'fee':
      case 'tax':
        bal[ccy] = prev - amt;
        break;
      default:
        break;
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(bal)) {
    out[k] = Math.round(v * 1e8) / 1e8;
  }
  return out;
}

/** Net holdings (buy − sell), jen > 0. */
export function xtbHoldingsByTicker(
  transactions: XtbParsedTransaction[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of transactions) {
    const t = (tx.ticker ?? '').trim().toUpperCase();
    if (!t || tx.units == null) continue;
    const prev = out[t] ?? 0;
    if (tx.type === 'buy') out[t] = prev + tx.units;
    else if (tx.type === 'sell') out[t] = prev - tx.units;
  }
  for (const k of Object.keys(out)) {
    const v = Math.round((out[k] ?? 0) * 1e8) / 1e8;
    if (Math.abs(v) <= 1e-8) delete out[k];
    else out[k] = v;
  }
  return out;
}

export function logXtbTransactionParseSummary(result: XtbTransactionParseResult): void {
  if (!__DEV__) return;
  console.log(
    `[XTB tx parser] Parsed ${result.transactions.length} txs, cash=${result.cashBalance}, realizedPl=${result.realizedPl}`,
  );
  for (const type of Object.keys(result.summary) as InvestmentTransactionType[]) {
    const row = result.summary[type];
    if (row.count === 0) continue;
    console.log(`  ${type}: ${row.count} rows, sum=${row.amountSum.toFixed(2)}`);
  }
  if (result.warnings.length) {
    console.log(`[XTB tx parser] Warnings (${result.warnings.length}):`, result.warnings.slice(0, 8));
  }
}

/** Detekce nového XTB account-history formátu (Cash Operations list). */
export function isXtbAccountHistoryWorkbook(workbook: XLSX.WorkBook): boolean {
  return findCashOperationsSheet(workbook) != null;
}
