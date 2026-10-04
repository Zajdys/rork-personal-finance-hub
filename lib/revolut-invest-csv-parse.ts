/**
 * Revolut Invest — Account statement CSV → investment_transactions.
 *
 * Formát:
 * Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate
 * 2026-09-09T08:45:50.943448Z,,CASH TOP-UP,,,EUR 3,EUR,0.0414
 * 2026-09-09T08:45:51.829Z,RHM,BUY - MARKET,0.00295043,EUR 1016.80,EUR 3,EUR,0.0414
 *
 * FX Rate z CSV se NEPOUŽÍVÁ pro přepočet (nesedí s bankou) — CZK přes ČNB
 * při sync/calc v investment-portfolio-calc / cnb-exchange-rates.
 */
import { parseDecimalInput } from '@/lib/parse-money-input';
import {
  dedupeInvestmentTransactionsByExternalId,
  type InvestmentTransactionType,
  type ParsedEtoroTransaction,
} from '@/lib/etoro-transactions-parser';

export type ParsedRevolutInvestTransaction = ParsedEtoroTransaction;

export type RevolutInvestParseSuccess = {
  ok: true;
  transactions: ParsedRevolutInvestTransaction[];
  warnings: string[];
  summary: Record<InvestmentTransactionType, { count: number; amountSum: number }>;
};

export type RevolutInvestParseFailure = {
  ok: false;
  unknownTypes: string[];
  error: string;
  /** Známé řádky pro náhled (import se stejně nepovolí). */
  transactions: ParsedRevolutInvestTransaction[];
  warnings: string[];
  summary: Record<InvestmentTransactionType, { count: number; amountSum: number }>;
};

export type RevolutInvestParseResult = RevolutInvestParseSuccess | RevolutInvestParseFailure;

const TYPE_MAP: Record<string, InvestmentTransactionType> = {
  'CASH TOP-UP': 'deposit',
  'BUY - MARKET': 'buy',
  'BUY - LIMIT': 'buy',
  'SELL - MARKET': 'sell',
  'SELL - LIMIT': 'sell',
};

function emptySummary(): RevolutInvestParseSuccess['summary'] {
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

function splitCsvLine(line: string): string[] {
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
    } else if (c === ',' && !inQuotes) {
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
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * "EUR 1016.80" / "USD 1.91" / "3" → měna + číslo.
 * Měna z prefixu; jinak fallback z Currency sloupce.
 */
export function parseRevolutInvestMoney(
  raw: string,
  fallbackCurrency?: string | null,
): { amount: number; currency: string } | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;

  const withCcy = t.match(/^([A-Za-z]{3})\s+(.+)$/);
  if (withCcy) {
    const currency = withCcy[1]!.toUpperCase();
    const amount = parseDecimalInput(withCcy[2]!, 8);
    if (amount == null || !Number.isFinite(amount)) return null;
    return { amount: Math.abs(amount), currency };
  }

  const amount = parseDecimalInput(t, 8);
  if (amount == null || !Number.isFinite(amount)) return null;
  const currency = String(fallbackCurrency ?? 'EUR')
    .trim()
    .toUpperCase()
    .slice(0, 3) || 'EUR';
  return { amount: Math.abs(amount), currency };
}

/** Units: až 8 desetinných míst (parseDecimalInput), beze ztráty na 2 dp. */
export function parseRevolutInvestUnits(raw: string): number | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  return parseDecimalInput(t, 8);
}

function dateOnlyFromIso(raw: string): string {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10) || '1970-01-01';
}

function mapType(raw: string): InvestmentTransactionType | null {
  const key = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  // Preserve original casing lookup via upper map keys
  for (const [k, v] of Object.entries(TYPE_MAP)) {
    if (k.toUpperCase() === key) return v;
  }
  return null;
}

function buildExternalId(params: {
  dateRaw: string;
  typeRaw: string;
  ticker: string;
  totalRaw: string;
  lineNumber: number;
}): string {
  return `revolut-invest:${params.dateRaw}|${params.typeRaw}|${params.ticker}|${params.totalRaw}|#${params.lineNumber}`;
}

/**
 * Parsuje Revolut Invest Account statement CSV.
 * Neznámý Type → ok:false + unknownTypes (žádné tiché přeskočení).
 * Záporná průběžná hotovost import neshodí.
 */
export function parseRevolutInvestCsv(csvText: string): RevolutInvestParseResult {
  const lines = splitLines(csvText);
  if (lines.length < 2) {
    return {
      ok: false,
      unknownTypes: [],
      error: 'Prázdný nebo neplatný Revolut Invest CSV (chybí data).',
      transactions: [],
      warnings: [],
      summary: emptySummary(),
    };
  }

  const headerCells = splitCsvLine(lines[0]!);
  const col: Record<string, number> = {};
  headerCells.forEach((h, i) => {
    col[normHeader(h)] = i;
  });

  const idxDate = col['date'] ?? -1;
  const idxTicker = col['ticker'] ?? -1;
  const idxType = col['type'] ?? -1;
  const idxQty = col['quantity'] ?? -1;
  const idxPrice = col['price per share'] ?? -1;
  const idxTotal = col['total amount'] ?? -1;
  const idxCcy = col['currency'] ?? -1;
  // FX Rate záměrně ignorujeme (nesedí s bankou / ČNB).

  if (idxDate < 0 || idxType < 0 || idxTotal < 0) {
    return {
      ok: false,
      unknownTypes: [],
      error: 'Revolut Invest CSV: chybí povinné sloupce Date / Type / Total Amount.',
      transactions: [],
      warnings: [],
      summary: emptySummary(),
    };
  }

  const unknownTypes = new Set<string>();
  const transactions: ParsedRevolutInvestTransaction[] = [];
  const warnings: string[] = [];
  const summary = emptySummary();
  /** Průběžná hotovost po měnách — jen diagnostika, záporná nevadí. */
  const runningCash = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const dateRaw = (cells[idxDate] ?? '').trim();
    const typeRaw = (cells[idxType] ?? '').trim();
    const ticker = idxTicker >= 0 ? (cells[idxTicker] ?? '').trim() : '';
    const qtyRaw = idxQty >= 0 ? (cells[idxQty] ?? '').trim() : '';
    const priceRaw = idxPrice >= 0 ? (cells[idxPrice] ?? '').trim() : '';
    const totalRaw = (cells[idxTotal] ?? '').trim();
    const ccyCol = idxCcy >= 0 ? (cells[idxCcy] ?? '').trim() : '';

    if (!dateRaw && !typeRaw && !totalRaw) continue;

    const mapped = mapType(typeRaw);
    if (!mapped) {
      if (typeRaw) unknownTypes.add(typeRaw);
      else unknownTypes.add('(empty Type)');
      continue;
    }

    const money = parseRevolutInvestMoney(totalRaw, ccyCol);
    if (!money) {
      warnings.push(`Řádek ${i + 1}: neplatný Total Amount „${totalRaw}“ — přeskočen.`);
      continue;
    }

    const units = mapped === 'buy' || mapped === 'sell' ? parseRevolutInvestUnits(qtyRaw) : null;
    const priceParsed =
      mapped === 'buy' || mapped === 'sell' ? parseRevolutInvestMoney(priceRaw, ccyCol) : null;

    if ((mapped === 'buy' || mapped === 'sell') && (units == null || units <= 0)) {
      warnings.push(`Řádek ${i + 1}: chybí Quantity u ${typeRaw} — přeskočen.`);
      continue;
    }

    // FX Rate ignorován — currency z Total Amount / Currency sloupce.
    const original_currency = money.currency;
    const amount = money.amount;

    const prev = runningCash.get(original_currency) ?? 0;
    if (mapped === 'deposit') runningCash.set(original_currency, prev + amount);
    else if (mapped === 'buy') runningCash.set(original_currency, prev - amount);
    else if (mapped === 'sell') runningCash.set(original_currency, prev + amount);
    else if (mapped === 'withdrawal' || mapped === 'fee') {
      runningCash.set(original_currency, prev - amount);
    }
    // Záporná hotovost nesmí shodit import — jen warning.
    const after = runningCash.get(original_currency) ?? 0;
    if (after < -0.00000001) {
      warnings.push(
        `Řádek ${i + 1}: průběžná hotovost ${original_currency} ${after.toFixed(4)} (záporná — OK).`,
      );
    }

    const lineNumber = i; // 1-based data row index (= CSV line without counting blank skips; header=line0, first data=1)
    const external_id = buildExternalId({
      dateRaw,
      typeRaw,
      ticker,
      totalRaw,
      lineNumber,
    });

    const tx: ParsedRevolutInvestTransaction = {
      type: mapped,
      ticker: ticker || null,
      isin: null,
      units: units,
      price_per_unit: priceParsed?.amount ?? null,
      amount,
      fee: 0,
      original_currency,
      date: dateOnlyFromIso(dateRaw),
      external_id,
      source: 'import',
    };
    transactions.push(tx);
    summary[mapped].count += 1;
    summary[mapped].amountSum += amount;
  }

  const deduped = dedupeInvestmentTransactionsByExternalId(transactions);

  if (unknownTypes.size > 0) {
    const list = [...unknownTypes].sort();
    return {
      ok: false,
      unknownTypes: list,
      error: `Neznámé typy Revolut Invest: ${list.join(', ')}`,
      transactions: deduped,
      warnings,
      summary,
    };
  }

  return {
    ok: true,
    transactions: deduped,
    warnings,
    summary,
  };
}

/** Hotovost po měnách z ledgeru (deposit − buy + sell − withdrawal − fee). */
export function revolutInvestCashByCurrency(
  transactions: ParsedRevolutInvestTransaction[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of transactions) {
    const ccy = (tx.original_currency || 'EUR').toUpperCase();
    const prev = out[ccy] ?? 0;
    if (tx.type === 'deposit' || tx.type === 'promo' || tx.type === 'sell') {
      out[ccy] = prev + tx.amount;
    } else if (tx.type === 'buy' || tx.type === 'withdrawal' || tx.type === 'fee') {
      out[ccy] = prev - tx.amount;
    }
  }
  for (const k of Object.keys(out)) {
    out[k] = Math.round((out[k] ?? 0) * 1e8) / 1e8;
  }
  return out;
}

/** Net holdings po tickeru (buy − sell), až 8 dp. */
export function revolutInvestHoldingsByTicker(
  transactions: ParsedRevolutInvestTransaction[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of transactions) {
    const t = (tx.ticker ?? '').trim().toUpperCase();
    if (!t || tx.units == null) continue;
    const prev = out[t] ?? 0;
    if (tx.type === 'buy' || tx.type === 'gift') out[t] = prev + tx.units;
    else if (tx.type === 'sell') out[t] = prev - tx.units;
  }
  for (const k of Object.keys(out)) {
    out[k] = Math.round((out[k] ?? 0) * 1e8) / 1e8;
  }
  return out;
}
