/**
 * Sdílený lookup ceny pro LIVE i backfill snapshoty.
 * Nikdy nevrací 0 jako „platnou“ cenu při výpadku Yahoo.
 */

import {
  calendarDaysBetween,
  fetchYahooDailySeries,
  mapPool,
} from '@/lib/yahoo-historical';
import { toYahooSymbol, type YahooNativeQuote } from '@/lib/yahoo-ticker';

export const PRICE_FORWARD_FILL_MAX_DAYS = 7;

export type PriceForDateOk = {
  ok: true;
  price: number;
  source: 'direct' | 'forward_fill';
  asOfDate: string;
};

export type PriceForDateMissing = { ok: false };

export type PriceForDateResult = PriceForDateOk | PriceForDateMissing;

/** Sparse Yahoo closes: YYYY-MM-DD → close (>0). */
export type SparseCloseMap = Map<string, number>;

/**
 * Cena k datu: přímý close, jinak forward-fill max `maxStaleDays` kalendářních dnů.
 * Chybí-li obojí → ok:false (nikdy 0).
 */
export function getPriceForDate(
  sparseCloses: SparseCloseMap,
  date: string,
  options?: { maxStaleDays?: number },
): PriceForDateResult {
  const maxStale = options?.maxStaleDays ?? PRICE_FORWARD_FILL_MAX_DAYS;
  const day = date.slice(0, 10);

  const direct = sparseCloses.get(day);
  if (direct != null && Number.isFinite(direct) && direct > 0) {
    return { ok: true, price: direct, source: 'direct', asOfDate: day };
  }

  let lastPrice: number | null = null;
  let lastDate: string | null = null;
  const dates = [...sparseCloses.keys()].sort((a, b) => a.localeCompare(b));
  for (const d of dates) {
    if (d > day) break;
    const px = sparseCloses.get(d);
    if (px != null && Number.isFinite(px) && px > 0) {
      lastPrice = px;
      lastDate = d;
    }
  }

  if (lastPrice == null || lastDate == null) return { ok: false };
  if (calendarDaysBetween(lastDate, day) > maxStale) return { ok: false };
  return { ok: true, price: lastPrice, source: 'forward_fill', asOfDate: lastDate };
}

/**
 * Poslední známá cena ≤ date bez limitu stáří (jen pro UI hlavičku, ne pro zápis snapshotu).
 */
export function getLastKnownPriceOnOrBefore(
  sparseCloses: SparseCloseMap,
  date: string,
): PriceForDateResult {
  return getPriceForDate(sparseCloses, date, { maxStaleDays: 3650 });
}

export type PriceDiagStats = {
  missingDays: number;
  fallbackUses: number;
};

/** Agregace diagnostiky chybějících Yahoo cen. */
export class PriceDiagnostics {
  private missingDays = new Map<string, number>();
  private fallbackUses = new Map<string, number>();

  recordMissing(ticker: string): void {
    const k = ticker.trim().toUpperCase();
    this.missingDays.set(k, (this.missingDays.get(k) ?? 0) + 1);
  }

  recordFallback(ticker: string): void {
    const k = ticker.trim().toUpperCase();
    this.fallbackUses.set(k, (this.fallbackUses.get(k) ?? 0) + 1);
  }

  merge(other: PriceDiagnostics): void {
    for (const [k, v] of other.missingDays) {
      this.missingDays.set(k, (this.missingDays.get(k) ?? 0) + v);
    }
    for (const [k, v] of other.fallbackUses) {
      this.fallbackUses.set(k, (this.fallbackUses.get(k) ?? 0) + v);
    }
  }

  /** Log: [prices] chybí Yahoo cena opakovaně: TICKER (X dní), fallback použit Y× */
  logSummary(context?: string): void {
    const tickers = new Set([...this.missingDays.keys(), ...this.fallbackUses.keys()]);
    if (tickers.size === 0) {
      if (context) console.log(`[prices] ${context}: OK, žádné chybějící Yahoo ceny`);
      return;
    }
    const ranked = [...tickers]
      .map((t) => ({
        ticker: t,
        missing: this.missingDays.get(t) ?? 0,
        fallback: this.fallbackUses.get(t) ?? 0,
      }))
      .sort((a, b) => b.missing + b.fallback - (a.missing + a.fallback));

    for (const row of ranked.slice(0, 12)) {
      console.log(
        `[prices] chybí Yahoo cena opakovaně: ${row.ticker} (${row.missing} dní), fallback použit ${row.fallback}×` +
          (context ? ` [${context}]` : ''),
      );
    }
  }
}

/** Načte sparse closes pro ticker (posledních ~lookbackDays). */
export async function fetchSparseClosesForTicker(
  ticker: string,
  isin: string | null,
  options?: { lookbackDays?: number; asOfIso?: string },
): Promise<{ sparse: SparseCloseMap; currency: string; yahooSymbol: string } | null> {
  const lookback = options?.lookbackDays ?? 45;
  const asOf = options?.asOfIso ?? new Date().toISOString().slice(0, 10);
  const endMs = Date.parse(`${asOf}T23:59:59.000Z`);
  const startMs = endMs - lookback * 86_400_000;
  const period1 = Math.floor(startMs / 1000);
  const period2 = Math.floor(endMs / 1000) + 86_400;

  const yahoo = toYahooSymbol(ticker, isin);
  const series = await fetchYahooDailySeries(yahoo, period1, period2);
  if (!series || series.byDate.size === 0) return null;
  return {
    sparse: series.byDate,
    currency: series.currency,
    yahooSymbol: yahoo,
  };
}

export type ResolveLivePriceResult = {
  quotes: Map<string, YahooNativeQuote | null>;
  /** Tickery, které stále nemají cenu ani 7denní fill (snapshot skip). */
  incompleteForSnapshot: string[];
  diagnostics: PriceDiagnostics;
};

/**
 * Doplní chybějící LIVE kotace z historie (getPriceForDate).
 * Pro UI použije i starší last-known; pro snapshot zůstávají v incompleteForSnapshot.
 */
export async function resolveLiveQuotesWithHistoryFallback(
  items: { ticker: string; isin: string | null }[],
  liveQuotes: Map<string, YahooNativeQuote | null>,
  asOfIso: string,
): Promise<ResolveLivePriceResult> {
  const diagnostics = new PriceDiagnostics();
  const quotes = new Map(liveQuotes);
  const incompleteForSnapshot: string[] = [];
  const day = asOfIso.slice(0, 10);

  const needingHistory = items.filter((it) => {
    const q = quotes.get(it.ticker);
    return q == null || !(q.price > 0);
  });

  if (needingHistory.length === 0) {
    return { quotes, incompleteForSnapshot, diagnostics };
  }

  const hist = await mapPool(needingHistory, 4, async (it) => {
    const book = await fetchSparseClosesForTicker(it.ticker, it.isin, {
      lookbackDays: 60,
      asOfIso: day,
    });
    return { ticker: it.ticker, book };
  });

  for (const { ticker, book } of hist) {
    if (!book) {
      diagnostics.recordMissing(ticker);
      incompleteForSnapshot.push(ticker);
      continue;
    }

    const within7 = getPriceForDate(book.sparse, day, {
      maxStaleDays: PRICE_FORWARD_FILL_MAX_DAYS,
    });
    if (within7.ok) {
      if (within7.source === 'forward_fill') diagnostics.recordFallback(ticker);
      quotes.set(ticker, {
        price: within7.price,
        currency: book.currency,
      });
      continue;
    }

    // Soft fallback pro hlavičku (starší než 7 dní) — snapshot se stejně přeskočí.
    const soft = getLastKnownPriceOnOrBefore(book.sparse, day);
    if (soft.ok) {
      diagnostics.recordFallback(ticker);
      diagnostics.recordMissing(ticker);
      quotes.set(ticker, {
        price: soft.price,
        currency: book.currency,
      });
      incompleteForSnapshot.push(ticker);
      continue;
    }

    diagnostics.recordMissing(ticker);
    incompleteForSnapshot.push(ticker);
  }

  return { quotes, incompleteForSnapshot, diagnostics };
}
