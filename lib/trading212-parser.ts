/**
 * Trading 212 History CSV → transakce (+ volitelně otevřené pozice z net buy/sell).
 *
 * T212 nemá list „OPEN POSITION“. Export History je plochý CSV.
 * Import ukládá VŠECHNY transakce (buy/sell/dividend/deposit/withdrawal/fee)
 * přes upsert na external_id — pozice se dopočítají z celé DB historie.
 */

import { textLooksLikeFailedBrokerPayment } from '@/lib/broker-failed-payment';
import { textLooksLikePromoBrokerDeposit } from '@/lib/broker-promo-deposit';
import {
  dedupeInvestmentTransactionsByExternalId,
  type InvestmentTransactionType,
  type ParsedEtoroTransaction,
} from '@/lib/etoro-transactions-parser';

export type ParsedTrading212Transaction = ParsedEtoroTransaction;

export type Trading212TransactionParseResult = {
  transactions: ParsedTrading212Transaction[];
  skipped: number;
  warnings: string[];
  summary: Record<InvestmentTransactionType, { count: number; amountSum: number }>;
  /** V tomto souboru je víc prodejů než nákupů u některé pozice (doimportuj starší období). */
  hasOrphanSells: boolean;
};

export interface Position {
  ticker: string;
  name: string;
  isin: string;
  shares: number;
  avgBuyPrice: number;
  totalInvested: number;
  currency: string;
}

export interface Portfolio {
  positions: Position[];
  totalInvested: number;
  dividends: number;
  deposits: number;
  withdrawals: number;
}

function emptyPortfolio(): Portfolio {
  return {
    positions: [],
    totalInvested: 0,
    dividends: 0,
    deposits: 0,
    withdrawals: 0,
  };
}

function emptySummary(): Trading212TransactionParseResult['summary'] {
  return {
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
  };
}

/** Přečte text souboru z URI (např. po DocumentPicker). */
export async function readCSVFromUri(uri: string): Promise<string> {
  const { readAsStringAsync } = await import('expo-file-system/legacy');
  return readAsStringAsync(uri);
}

function parseAmount(raw: string): number {
  if (!raw || !String(raw).trim()) return 0;
  let t = String(raw).trim().replace(/\s/g, '').replace(/'/g, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  let normalized = t;
  if (lastComma > lastDot && lastComma !== -1) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = t.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseShares(raw: string): number {
  const n = parseAmount(raw);
  return Number.isFinite(n) ? n : 0;
}

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ''));
}

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

function normHeader(h: string): string {
  return h
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function compactHeader(h: string): string {
  return normHeader(h).replace(/\s/g, '');
}

type ColMap = {
  action: number;
  isin: number;
  ticker: number;
  name: number;
  notes: number;
  shares: number;
  price: number;
  exchangeRate: number;
  total: number;
  currencyTotal: number;
  currencyPrice: number;
  time: number;
  id: number;
  conversionFee: number;
  withholdingTax: number;
};

function resolveColumns(headers: string[]): ColMap | null {
  const h = headers.map(normHeader);
  const c = headers.map(compactHeader);
  const find = (pred: (s: string) => boolean) => h.findIndex(pred);

  const action = find((s) => s === 'action');
  const isin = find((s) => s === 'isin');
  const ticker = find((s) => s === 'ticker');
  const name = find((s) => s === 'name');
  const notes = find((s) => s === 'notes' || s === 'note' || s === 'poznámka' || s === 'poznamka');
  const shares = find(
    (s) =>
      s.includes('no. of shares') ||
      s.includes('number of shares') ||
      s === 'quantity' ||
      s === 'shares',
  );
  const price = find(
    (s) =>
      s === 'price / share' ||
      s === 'price/share' ||
      s.startsWith('price / share') ||
      (s.includes('price') && s.includes('share') && !s.includes('currency')),
  );
  const exchangeRateIdx = c.findIndex((s) => s === 'exchangerate');
  const currencyTotal = c.findIndex((s) => s === 'currency(total)');
  const currencyPrice = c.findIndex((s) => s.startsWith('currency(price'));
  const totalIdx = h.findIndex(
    (s) => (s === 'total' || s.startsWith('total')) && !s.includes('currency'),
  );
  const timeIdx = find((s) => s === 'time' || s.startsWith('time ('));
  const idIdx = find((s) => s === 'id');
  const conversionFeeIdx = find(
    (s) => s.includes('currency conversion fee') || s === 'conversion fee',
  );
  const withholdingIdx = find(
    (s) => s.includes('withholding tax') || s.includes('withholding'),
  );

  if (action < 0) return null;
  if (isin < 0 && ticker < 0 && shares < 0 && totalIdx < 0) return null;

  const isinIdx = isin >= 0 ? isin : ticker >= 0 ? ticker : -1;
  const tickerIdx = ticker >= 0 ? ticker : isin >= 0 ? isin : -1;
  const nameIdx = name >= 0 ? name : tickerIdx;

  return {
    action,
    isin: isinIdx,
    ticker: tickerIdx,
    name: nameIdx,
    notes: notes >= 0 ? notes : -1,
    shares: shares >= 0 ? shares : -1,
    price: price >= 0 ? price : -1,
    exchangeRate: exchangeRateIdx >= 0 ? exchangeRateIdx : -1,
    total: totalIdx >= 0 ? totalIdx : -1,
    currencyTotal: currencyTotal >= 0 ? currencyTotal : -1,
    currencyPrice: currencyPrice >= 0 ? currencyPrice : -1,
    time: timeIdx >= 0 ? timeIdx : -1,
    id: idIdx >= 0 ? idIdx : -1,
    conversionFee: conversionFeeIdx >= 0 ? conversionFeeIdx : -1,
    withholdingTax: withholdingIdx >= 0 ? withholdingIdx : -1,
  };
}

type MutablePos = {
  ticker: string;
  name: string;
  isin: string;
  buyShares: number;
  sellShares: number;
  buyInvested: number;
  currency: string;
};

function isInterestAction(action: string): boolean {
  return action.trim().toLowerCase().includes('interest on cash');
}

/** Market buy / Limit buy / Stop buy / … — ne sell. */
function isBuyAction(action: string): boolean {
  const a = action.trim().toLowerCase();
  if (!a.includes('buy')) return false;
  if (a.includes('sell')) return false;
  return true;
}

/** Market sell / Limit sell / … */
function isSellAction(action: string): boolean {
  const a = action.trim().toLowerCase();
  return a.includes('sell');
}

function isDividend(action: string): boolean {
  const a = action.trim();
  if (/tax|withholding|srážkov/i.test(a) && !/dividend/i.test(a)) return false;
  return a === 'Dividend (Dividend)' || (a.startsWith('Dividend') && a.includes('('));
}

function isDeposit(action: string): boolean {
  return action.trim().toLowerCase() === 'deposit';
}

function isWithdrawal(action: string): boolean {
  return action.trim().toLowerCase() === 'withdrawal';
}

function isFeeAction(action: string): boolean {
  const a = action.trim().toLowerCase();
  if (!a) return false;
  if (a.includes('trading fee')) return true;
  if (a.includes('currency conversion')) return true;
  if (a.includes('stamp duty')) return true;
  if (a.includes('deposit fee')) return true;
  if (a.includes('withdrawal fee')) return true;
  if (a.includes('custody fee')) return true;
  if (a.includes('management fee')) return true;
  if (a.endsWith('fee')) return true;
  return false;
}

function mapActionType(action: string): InvestmentTransactionType | 'skip' | null {
  if (!action.trim()) return null;
  if (isInterestAction(action)) return 'skip';
  if (isBuyAction(action)) return 'buy';
  if (isSellAction(action)) return 'sell';
  if (isDividend(action)) return 'dividend';
  if (isDeposit(action)) return 'deposit';
  if (isWithdrawal(action)) return 'withdrawal';
  if (isFeeAction(action)) return 'fee';
  return null;
}

function posKey(isin: string, ticker: string): string {
  const i = isin.trim().toUpperCase();
  if (i) return `isin:${i}`;
  return `tk:${ticker.trim().toUpperCase()}`;
}

function cell(cells: string[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return '';
  return cells[idx] ?? '';
}

function buyCostInAccountCurrency(
  shares: number,
  price: number,
  exchangeRate: number,
  total: number,
): number {
  if (Math.abs(total) > 1e-12) return Math.abs(total);
  const sh = Math.abs(shares);
  const px = Math.abs(price);
  if (sh <= 0 || px <= 0) return 0;
  const fx = exchangeRate > 0 ? exchangeRate : 1;
  return (sh * px) / fx;
}

function rowTimeMs(cells: string[], col: ColMap): number {
  if (col.time < 0) return NaN;
  const raw = cell(cells, col.time);
  if (!raw) return NaN;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : NaN;
}

function rowDateOnly(cells: string[], col: ColMap): string | null {
  if (col.time < 0) return null;
  const raw = cell(cells, col.time).trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1] ?? null;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

function ensurePos(
  byKey: Map<string, MutablePos>,
  isin: string,
  ticker: string,
  name: string,
  currency: string,
): MutablePos {
  const key = posKey(isin, ticker);
  let prev = byKey.get(key);
  if (!prev) {
    prev = {
      ticker: ticker.trim() || key,
      name: name.trim() || ticker.trim(),
      isin: isin.trim(),
      buyShares: 0,
      sellShares: 0,
      buyInvested: 0,
      currency: currency || 'EUR',
    };
    byKey.set(key, prev);
  }
  if (name.trim()) prev.name = name.trim();
  if (ticker.trim()) prev.ticker = ticker.trim();
  if (isin.trim()) prev.isin = isin.trim();
  if (currency) prev.currency = currency;
  return prev;
}

function buildExternalId(
  cells: string[],
  col: ColMap,
  action: string,
  date: string,
  ticker: string,
  total: number,
  currency: string,
  occurrence: number,
): string {
  const idRaw = col.id >= 0 ? cell(cells, col.id).trim() : '';
  if (idRaw) return `t212:${idRaw}`;

  // Deposit/dividend/fee často nemají ID — klíč musí být unikátní per řádek
  // (stejná částka 2× by se jinak sloučila). Preferuj plný timestamp, ne jen datum.
  const timeRaw = col.time >= 0 ? cell(cells, col.time).trim() : '';
  const timeKey = timeRaw || date || 'nodate';
  const compact = [
    action.trim().toLowerCase(),
    timeKey,
    ticker.trim().toUpperCase() || '-',
    total.toFixed(6),
    (currency || 'EUR').trim().toUpperCase(),
    String(occurrence),
  ].join('|');
  return `t212:${compact}`;
}

function summarizeTransactions(
  transactions: ParsedTrading212Transaction[],
): Trading212TransactionParseResult['summary'] {
  const summary = emptySummary();
  for (const tx of transactions) {
    summary[tx.type].count += 1;
    summary[tx.type].amountSum += tx.amount;
  }
  return summary;
}

function logDepositDebug(
  phase: string,
  transactions: ParsedTrading212Transaction[],
  extra?: Record<string, unknown>,
): void {
  const deps = transactions.filter((t) => t.type === 'deposit');
  const byCurrency = new Map<string, { count: number; sum: number }>();
  for (const d of deps) {
    const c = (d.original_currency || '?').toUpperCase();
    const prev = byCurrency.get(c) ?? { count: 0, sum: 0 };
    prev.count += 1;
    prev.sum += d.amount;
    byCurrency.set(c, prev);
  }
  const sum = deps.reduce((s, d) => s + d.amount, 0);
  if (!__DEV__) return;
  console.log(`[T212 deposits] ${phase}`, {
    count: deps.length,
    sum: Math.round(sum * 100) / 100,
    byCurrency: Object.fromEntries(byCurrency),
    externalIds: deps.map((d) => d.external_id),
    ...extra,
  });
}

function applyTransactionRow(
  cells: string[],
  col: ColMap,
  byKey: Map<string, MutablePos>,
  cashflow: { dividends: number; deposits: number; withdrawals: number },
): void {
  if (cells.length <= col.action) return;

  const action = cell(cells, col.action);
  const mapped = mapActionType(action);
  if (mapped == null || mapped === 'skip' || mapped === 'fee') return;

  const isin = cell(cells, col.isin);
  const ticker = cell(cells, col.ticker);
  const name = cell(cells, col.name) || ticker;
  const sharesDelta = col.shares >= 0 ? Math.abs(parseShares(cell(cells, col.shares))) : 0;
  const price = col.price >= 0 ? parseAmount(cell(cells, col.price)) : 0;
  const exchangeRate = col.exchangeRate >= 0 ? parseAmount(cell(cells, col.exchangeRate)) : 0;
  const total = col.total >= 0 ? parseAmount(cell(cells, col.total)) : 0;
  const curCell =
    col.currencyTotal >= 0 && cell(cells, col.currencyTotal)
      ? cell(cells, col.currencyTotal).trim()
      : 'EUR';

  if (mapped === 'buy') {
    if ((!isin.trim() && !ticker.trim()) || sharesDelta <= 0) return;
    const prev = ensurePos(byKey, isin, ticker, name, curCell);
    prev.buyShares += sharesDelta;
    prev.buyInvested += buyCostInAccountCurrency(sharesDelta, price, exchangeRate, total);
  } else if (mapped === 'sell') {
    if ((!isin.trim() && !ticker.trim()) || sharesDelta <= 0) return;
    const prev = ensurePos(byKey, isin, ticker, name, curCell);
    prev.sellShares += sharesDelta;
  } else if (mapped === 'dividend') {
    cashflow.dividends += Math.abs(total);
  } else if (mapped === 'deposit') {
    if (textLooksLikeFailedBrokerPayment(cells.join(' '))) return;
    const notes = col.notes >= 0 ? cell(cells, col.notes) : '';
    // Promo free shares → nepočítat do „Vloženo“ (Portfolio.deposits).
    if (textLooksLikePromoBrokerDeposit([notes, action, cells.join(' ')].join(' '))) return;
    cashflow.deposits += Math.abs(total);
  } else if (mapped === 'withdrawal') {
    if (textLooksLikeFailedBrokerPayment(cells.join(' '))) return;
    cashflow.withdrawals += Math.abs(total);
  }
}

function finalizePortfolioFromMap(
  byKey: Map<string, MutablePos>,
  cashflow: { dividends: number; deposits: number; withdrawals: number },
): Portfolio {
  const positions: Position[] = [];
  for (const p of byKey.values()) {
    const netUnits = p.buyShares - p.sellShares;
    if (netUnits <= 1e-9) continue;
    const avgBuyPrice = p.buyShares > 0 ? p.buyInvested / p.buyShares : 0;
    const totalInvested = avgBuyPrice * netUnits;
    positions.push({
      ticker: p.ticker,
      name: p.name,
      isin: p.isin,
      shares: netUnits,
      avgBuyPrice,
      totalInvested,
      currency: p.currency || 'EUR',
    });
  }

  positions.sort((a, b) => b.totalInvested - a.totalInvested);

  const totalInvested = positions.reduce((s, p) => s + p.totalInvested, 0);

  return {
    positions,
    totalInvested,
    dividends: cashflow.dividends,
    deposits: cashflow.deposits,
    withdrawals: cashflow.withdrawals,
  };
}

function buildPortfolioFromCellRows(rows: string[][], col: ColMap): Portfolio {
  const byKey = new Map<string, MutablePos>();
  const cashflow = { dividends: 0, deposits: 0, withdrawals: 0 };
  for (const cells of rows) {
    applyTransactionRow(cells, col, byKey, cashflow);
  }
  return finalizePortfolioFromMap(byKey, cashflow);
}

function detectOrphanSells(transactions: ParsedTrading212Transaction[]): boolean {
  const byKey = new Map<string, { buy: number; sell: number }>();
  for (const tx of transactions) {
    if (tx.type !== 'buy' && tx.type !== 'sell') continue;
    const key = posKey(tx.isin ?? '', tx.ticker ?? '');
    if (key === 'tk:') continue;
    let row = byKey.get(key);
    if (!row) {
      row = { buy: 0, sell: 0 };
      byKey.set(key, row);
    }
    const units = Math.abs(tx.units ?? 0);
    if (tx.type === 'buy') row.buy += units;
    else row.sell += units;
  }
  for (const row of byKey.values()) {
    if (row.sell > row.buy + 1e-9) return true;
  }
  return false;
}

function parseTransactionsFromCellRows(
  rows: string[][],
  col: ColMap,
  warnings: string[],
): {
  transactions: ParsedTrading212Transaction[];
  skipped: number;
  summary: Trading212TransactionParseResult['summary'];
} {
  const transactions: ParsedTrading212Transaction[] = [];
  let skipped = 0;
  /** Počet výskytů stejného content-klíče (pro řádky bez ID). */
  const occurrenceByKey = new Map<string, number>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex]!;
    if (cells.length <= col.action) {
      skipped += 1;
      continue;
    }

    const action = cell(cells, col.action);
    const mapped = mapActionType(action);
    if (mapped === 'skip') {
      skipped += 1;
      continue;
    }
    if (mapped == null) {
      if (action.trim()) warnings.push(`Neznámý typ „${action}“ — řádek přeskočen.`);
      skipped += 1;
      continue;
    }

    const date = rowDateOnly(cells, col);
    if (!date) {
      warnings.push(`Nepodařilo se parsovat datum u „${action}“.`);
      skipped += 1;
      continue;
    }

    if (mapped === 'deposit' || mapped === 'withdrawal') {
      const hay = cells.join(' ');
      if (textLooksLikeFailedBrokerPayment(hay)) {
        const totalHint = col.total >= 0 ? cell(cells, col.total) : '';
        console.log(
          `[T212-import] přeskočen neúspěšný vklad ${date} ${totalHint} ${action}`,
        );
        skipped += 1;
        continue;
      }
    }

    const notes = col.notes >= 0 ? cell(cells, col.notes) : '';
    let effectiveType: InvestmentTransactionType = mapped;
    if (mapped === 'deposit') {
      const promoHay = [notes, action, cells.join(' ')].filter(Boolean).join(' ');
      if (textLooksLikePromoBrokerDeposit(promoHay)) {
        effectiveType = 'promo';
        const totalHint = col.total >= 0 ? cell(cells, col.total) : '';
        if (__DEV__) {
          console.log(`[T212-import] promo vklad ${date} ${totalHint} → type=promo (${notes || action})`);
        }
      }
    }

    const isinRaw = cell(cells, col.isin).trim();
    const tickerRaw = cell(cells, col.ticker).trim();
    const isin = isinRaw || null;
    const ticker = tickerRaw || null;
    const unitsRaw = col.shares >= 0 ? parseShares(cell(cells, col.shares)) : 0;
    const units = unitsRaw > 0 ? Math.round(unitsRaw * 1_000_000) / 1_000_000 : null;
    const priceRaw = col.price >= 0 ? parseAmount(cell(cells, col.price)) : 0;
    const price_per_unit = priceRaw > 0 ? priceRaw : null;
    const total = col.total >= 0 ? parseAmount(cell(cells, col.total)) : 0;
    const conversionFee =
      col.conversionFee >= 0 ? Math.abs(parseAmount(cell(cells, col.conversionFee))) : 0;
    const withholdingTax =
      col.withholdingTax >= 0 ? Math.abs(parseAmount(cell(cells, col.withholdingTax))) : 0;
    const currency = (
      (col.currencyTotal >= 0 && cell(cells, col.currencyTotal).trim()) ||
      (col.currencyPrice >= 0 && cell(cells, col.currencyPrice).trim()) ||
      'EUR'
    ).toUpperCase();

    if (effectiveType === 'buy' || effectiveType === 'sell') {
      if ((!isin && !ticker) || !(units && units > 0)) {
        skipped += 1;
        continue;
      }
    }

    const amount = Math.abs(total);
    if (effectiveType === 'fee' && amount <= 0 && conversionFee <= 0) {
      skipped += 1;
      continue;
    }

    let fee = 0;
    if (effectiveType === 'buy' || effectiveType === 'sell') {
      fee = conversionFee;
    } else if (effectiveType === 'dividend') {
      // Dividenda je netto (Total); srážková daň evidujeme ve fee.
      fee = withholdingTax;
    }

    const feeAmount = effectiveType === 'fee' ? (amount > 0 ? amount : conversionFee) : amount;
    const amountForId = effectiveType === 'fee' ? feeAmount : amount;
    const timeRaw = col.time >= 0 ? cell(cells, col.time).trim() : '';
    const contentKey = [
      action.trim().toLowerCase(),
      timeRaw || date,
      (ticker ?? isin ?? '').trim().toUpperCase() || '-',
      amountForId.toFixed(6),
      currency,
    ].join('|');
    const occurrence = (occurrenceByKey.get(contentKey) ?? 0) + 1;
    occurrenceByKey.set(contentKey, occurrence);

    const external_id = buildExternalId(
      cells,
      col,
      action,
      date,
      ticker ?? isin ?? '',
      amountForId,
      currency,
      occurrence,
    );

    const tx: ParsedTrading212Transaction = {
      type: effectiveType,
      ticker,
      isin,
      units:
        effectiveType === 'buy' || effectiveType === 'sell'
          ? units
          : effectiveType === 'dividend'
            ? units
            : null,
      price_per_unit: effectiveType === 'buy' || effectiveType === 'sell' ? price_per_unit : null,
      amount: effectiveType === 'fee' ? feeAmount : amount,
      fee,
      original_currency: currency,
      date,
      external_id,
    };

    transactions.push(tx);
  }

  const beforeDedupe = transactions.length;
  const deduped = dedupeInvestmentTransactionsByExternalId(transactions);
  if (deduped.length !== beforeDedupe) {
    console.log(
      `[T212 tx parser] Dedupe within file: ${beforeDedupe} → ${deduped.length} (dropped ${beforeDedupe - deduped.length})`,
    );
  }
  logDepositDebug('parsed (after intra-file dedupe)', deduped);

  return {
    transactions: deduped,
    skipped,
    summary: summarizeTransactions(deduped),
  };
}

/**
 * Parsuje Trading 212 History CSV do transakcí (neblokuje při buy−sell ≤ 0).
 */
export function parseTrading212TransactionsCsv(csvText: string): Trading212TransactionParseResult {
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = splitLines(text);
  const warnings: string[] = [];
  if (lines.length < 2) {
    return {
      transactions: [],
      skipped: 0,
      warnings: ['Prázdný CSV soubor.'],
      summary: emptySummary(),
      hasOrphanSells: false,
    };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitCsvLine(lines[0]!, delimiter);
  const col = resolveColumns(headers);
  if (!col) {
    return {
      transactions: [],
      skipped: 0,
      warnings: ['CSV neobsahuje očekávané sloupce Action / Total.'],
      summary: emptySummary(),
      hasOrphanSells: false,
    };
  }

  const rows: string[][] = [];
  for (let r = 1; r < lines.length; r++) {
    rows.push(splitCsvLine(lines[r]!, delimiter));
  }

  const { transactions, skipped, summary } = parseTransactionsFromCellRows(rows, col, warnings);
  return {
    transactions,
    skipped,
    warnings,
    summary,
    hasOrphanSells: detectOrphanSells(transactions),
  };
}

/** Parsuje více CSV a sloučí transakce (dedupe přes external_id). */
export function parseTrading212TransactionsCsvFiles(
  csvTexts: string[],
): Trading212TransactionParseResult {
  const all: ParsedTrading212Transaction[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let depositRowsBeforeMerge = 0;
  let depositSumBeforeMerge = 0;

  for (const text of csvTexts) {
    const part = parseTrading212TransactionsCsv(text);
    all.push(...part.transactions);
    warnings.push(...part.warnings);
    skipped += part.skipped;
    depositRowsBeforeMerge += part.summary.deposit.count;
    depositSumBeforeMerge += part.summary.deposit.amountSum;
  }

  const before = all.length;
  const transactions = dedupeInvestmentTransactionsByExternalId(all);
  if (transactions.length !== before) {
    console.log(
      `[T212 tx parser] Multi-file dedupe: ${before} → ${transactions.length} across ${csvTexts.length} files (dropped ${before - transactions.length})`,
    );
  }

  const summary = summarizeTransactions(transactions);
  logDepositDebug('merged files (after cross-file dedupe)', transactions, {
    files: csvTexts.length,
    depositRowsBeforeMerge,
    depositSumBeforeMerge: Math.round(depositSumBeforeMerge * 100) / 100,
  });

  return {
    transactions,
    skipped,
    warnings,
    summary,
    hasOrphanSells: detectOrphanSells(transactions),
  };
}

export function logTrading212TransactionParseSummary(result: Trading212TransactionParseResult): void {
  if (!__DEV__) return;
  console.log(
    `[T212 tx parser] Parsed ${result.transactions.length} transactions (skipped ${result.skipped}).`,
  );
  for (const type of Object.keys(result.summary) as InvestmentTransactionType[]) {
    const row = result.summary[type];
    if (row.count === 0) continue;
    console.log(`  ${type}: ${row.count} rows, sum amount = ${row.amountSum.toFixed(2)}`);
  }
  const dep = result.summary.deposit;
  const promo = result.summary.promo;
  console.log(
    `[T212 deposits] summary: ${dep.count} deposits, sum = ${dep.amountSum.toFixed(2)} (Currency Total)` +
      (promo.count
        ? `; promo ${promo.count} rows, sum = ${promo.amountSum.toFixed(2)} (mimo Vloženo)`
        : ''),
  );
  if (result.hasOrphanSells) {
    console.log(
      '[T212 tx parser] Orphan sells: some tickers have sell > buy in this file — import older periods for full history.',
    );
  }
  if (result.warnings.length) {
    console.log('[T212 tx parser] Warnings:', result.warnings.slice(0, 5));
  }
}

/**
 * Parsuje export CSV z Trading 212 (Menu → History → export).
 * Žádný „OPEN POSITION“ list — pozice = net buy/sell podle ISIN.
 * Pozn.: import do DB používá parseTrading212TransactionsCsv (neblokuje při 0 otevřených).
 */
export function parseTrade212CSV(csvText: string): Portfolio {
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = splitLines(text);
  if (lines.length < 2) return emptyPortfolio();

  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitCsvLine(lines[0]!, delimiter);
  const col = resolveColumns(headers);
  if (!col) return emptyPortfolio();

  const rows: string[][] = [];
  for (let r = 1; r < lines.length; r++) {
    rows.push(splitCsvLine(lines[r]!, delimiter));
  }
  return buildPortfolioFromCellRows(rows, col);
}

type TimedRow = { sortKey: number; cells: string[] };

/**
 * Parsuje více CSV výpisů a sloučí transakce v časovém pořadí (buy/sell napříč soubory).
 */
export function mergePortfolios(csvTexts: string[]): Portfolio {
  if (!csvTexts.length) return emptyPortfolio();

  const timed: TimedRow[] = [];
  let col: ColMap | null = null;
  let fileOrdinal = 0;

  for (const csvText of csvTexts) {
    const text = csvText.replace(/^\uFEFF/, '');
    const lines = splitLines(text);
    if (lines.length < 2) {
      fileOrdinal += 1;
      continue;
    }
    const delimiter = detectDelimiter(lines[0]!);
    const headers = splitCsvLine(lines[0]!, delimiter);
    const c = resolveColumns(headers);
    if (!c) {
      fileOrdinal += 1;
      continue;
    }
    if (!col) col = c;

    let rowInFile = 0;
    for (let r = 1; r < lines.length; r++) {
      const cells = splitCsvLine(lines[r]!, delimiter);
      const t = rowTimeMs(cells, c);
      const sortKey = Number.isFinite(t) ? t : fileOrdinal * 1e15 + rowInFile;
      if (
        c.action === col.action &&
        c.isin === col.isin &&
        c.shares === col.shares &&
        c.ticker === col.ticker
      ) {
        timed.push({ sortKey, cells });
      } else {
        const normalized = new Array(Math.max(cells.length, 32)).fill('');
        const copy = (fromIdx: number, toIdx: number) => {
          if (fromIdx >= 0 && toIdx >= 0) normalized[toIdx] = cells[fromIdx] ?? '';
        };
        copy(c.action, col.action);
        copy(c.isin, col.isin);
        copy(c.ticker, col.ticker);
        copy(c.name, col.name);
        copy(c.shares, col.shares);
        copy(c.price, col.price);
        copy(c.exchangeRate, col.exchangeRate);
        copy(c.total, col.total);
        copy(c.currencyTotal, col.currencyTotal);
        copy(c.time, col.time);
        copy(c.id, col.id);
        copy(c.conversionFee, col.conversionFee);
        copy(c.withholdingTax, col.withholdingTax);
        timed.push({ sortKey, cells: normalized });
      }
      rowInFile += 1;
    }
    fileOrdinal += 1;
  }

  if (!col || timed.length === 0) return emptyPortfolio();

  timed.sort((a, b) => a.sortKey - b.sortKey);
  return buildPortfolioFromCellRows(
    timed.map((x) => x.cells),
    col,
  );
}
