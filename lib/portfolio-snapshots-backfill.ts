/**
 * Backfill chybějících / unlocked portfolio_snapshots.
 * Kompletní historické dny → locked=true (hybrid + zámek historie).
 * Ceny přes sdílený getPriceForDate (max 7 dní forward-fill).
 */

import type { InvestmentTransactionForCalc } from '@/lib/investment-portfolio-calc';
import {
  fetchExistingSnapshotMeta,
  findWritableSnapshotDates,
  upsertPortfolioSnapshotsBulk,
  type SnapshotUpsertRow,
} from '@/lib/portfolio-snapshots';
import {
  getPriceForDate,
  PriceDiagnostics,
  PRICE_FORWARD_FILL_MAX_DAYS,
  type SparseCloseMap,
} from '@/lib/portfolio-price-lookup';
import { fetchCoingeckoDailySeriesRange, isCryptoTicker } from '@/lib/coingecko-prices';
import {
  eachCalendarDate,
  fetchHistoricalFxToUsd,
  fetchYahooDailySeries,
  fxRateOnDay,
  mapPool,
} from '@/lib/yahoo-historical';
import { toYahooSymbol, normalizeTransactionMoney } from '@/lib/yahoo-ticker';

export type BackfillPortfolioInput = {
  portfolioId: string;
  broker: string;
  transactions: InvestmentTransactionForCalc[];
};

export type BackfillProgress = {
  status: 'idle' | 'running' | 'done' | 'error';
  message?: string;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function firstTxDate(txs: InvestmentTransactionForCalc[]): string | null {
  let min: string | null = null;
  for (const tx of txs) {
    const d = tx.date?.slice(0, 10);
    if (!d) continue;
    if (!min || d < min) min = d;
  }
  return min;
}

type HoldingKey = string;

function holdingKey(ticker: string | null | undefined, isin: string | null | undefined): HoldingKey | null {
  const t = (ticker ?? '').trim().toUpperCase();
  if (!t) return null;
  return t;
}

type TxEvent = {
  date: string;
  type: InvestmentTransactionForCalc['type'];
  ticker: string | null;
  isin: string | null;
  units: number;
  amount: number;
  fee: number;
  currency: string;
};

function toEvents(txs: InvestmentTransactionForCalc[]): TxEvent[] {
  return txs
    .map((tx) => {
      const { amount, currency } = normalizeTransactionMoney(tx.amount, tx.original_currency);
      const feeNorm = normalizeTransactionMoney(Math.abs(tx.fee ?? 0), tx.original_currency);
      return {
        date: tx.date.slice(0, 10),
        type: tx.type,
        ticker: tx.ticker,
        isin: tx.isin,
        units: Math.abs(tx.units ?? 0),
        amount: Math.abs(amount),
        fee: Math.abs(feeNorm.amount),
        currency,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function applyTxToCashAndHoldings(
  ev: TxEvent,
  holdings: Map<HoldingKey, { units: number; isin: string | null }>,
  cashUsd: number,
  fxToUsd: number | null,
): number {
  // Holdings vždy aktualizuj — i když FX chybí (jinak BTC držení zůstane 0 a snapshot = 0).
  if (ev.type === 'buy' || ev.type === 'gift') {
    const key = holdingKey(ev.ticker, ev.isin);
    if (key && ev.units > 0) {
      const prev = holdings.get(key) ?? { units: 0, isin: ev.isin };
      prev.units += ev.units;
      if (ev.isin) prev.isin = ev.isin;
      holdings.set(key, prev);
    }
  } else if (ev.type === 'sell') {
    const key = holdingKey(ev.ticker, ev.isin);
    if (key && ev.units > 0) {
      const prev = holdings.get(key);
      if (prev) {
        prev.units = Math.max(0, prev.units - ev.units);
        if (prev.units <= 1e-12) holdings.delete(key);
        else holdings.set(key, prev);
      }
    }
  }
  // transfer_out / promo: holdings neměnit

  if (fxToUsd == null || !(fxToUsd > 0)) return cashUsd;
  const amtUsd = ev.amount * fxToUsd;
  const feeUsd = ev.fee * fxToUsd;

  switch (ev.type) {
    case 'deposit':
    case 'promo':
      return cashUsd + amtUsd;
    case 'withdrawal':
      return cashUsd - amtUsd;
    case 'fee':
      return cashUsd - amtUsd;
    case 'dividend':
      return cashUsd + amtUsd - feeUsd;
    case 'buy':
      return cashUsd - amtUsd - feeUsd;
    case 'sell':
      return cashUsd + amtUsd - feeUsd;
    case 'transfer_out':
    case 'gift':
      return cashUsd;
    default:
      return cashUsd;
  }
}

type PriceBook = {
  /** Sparse Yahoo closes (NE forward-filled) — lookup přes getPriceForDate. */
  sparse: SparseCloseMap;
  currency: string;
  yahooSymbol: string;
};

async function loadPriceBooks(
  tickers: { ticker: string; isin: string | null }[],
  fromIso: string,
  toIso: string,
): Promise<Map<string, PriceBook | null>> {
  const period1 = Math.floor(new Date(`${fromIso}T00:00:00.000Z`).getTime() / 1000) - 14 * 86400;
  const period2 = Math.floor(new Date(`${toIso}T23:59:59.000Z`).getTime() / 1000) + 86400;

  const unique = new Map<string, { ticker: string; isin: string | null }>();
  for (const t of tickers) {
    const k = t.ticker.trim().toUpperCase();
    if (!k) continue;
    if (!unique.has(k)) unique.set(k, t);
  }

  const entries = [...unique.entries()];
  const results = await mapPool(entries, 5, async ([brokerTicker, meta]) => {
    if (isCryptoTicker(brokerTicker)) {
      // Snapshoty jsou v USD — historie BTC rovnou v USD (bez FX).
      const series = await fetchCoingeckoDailySeriesRange(brokerTicker, 'usd', fromIso, toIso);
      if (!series) {
        console.log(`[backfill] crypto ${brokerTicker} FAIL no CoinGecko USD history`);
        return [brokerTicker, null] as const;
      }
      return [
        brokerTicker,
        {
          sparse: series.sparse,
          currency: 'USD',
          yahooSymbol: `coingecko:${brokerTicker}`,
        } satisfies PriceBook,
      ] as const;
    }

    const yahoo = toYahooSymbol(meta.ticker, meta.isin);
    const series = await fetchYahooDailySeries(yahoo, period1, period2);
    if (!series) {
      console.log(
        `[backfill] ticker ${brokerTicker}→${yahoo} FAIL no data (isin=${meta.isin ?? 'n/a'})`,
      );
      return [brokerTicker, null] as const;
    }
    console.log(
      `[backfill] ticker ${brokerTicker}→${yahoo} ccy=${series.currency} div100=${series.dividedBy100} pts=${series.pointCount}`,
    );
    return [
      brokerTicker,
      {
        sparse: series.byDate,
        currency: series.currency,
        yahooSymbol: yahoo,
      } satisfies PriceBook,
    ] as const;
  });

  return new Map(results);
}

/**
 * Dopočítá chybějící / unlocked dny. Kompletní historické → locked=true.
 */
export async function backfillPortfolioSnapshots(
  input: BackfillPortfolioInput,
): Promise<{ written: number; missing: number; error: Error | null }> {
  const { portfolioId, broker, transactions } = input;
  if (transactions.length === 0) {
    return { written: 0, missing: 0, error: null };
  }

  const start = firstTxDate(transactions);
  if (!start) return { written: 0, missing: 0, error: null };
  const end = todayUtc();

  const { byDate: existing, error: existErr } = await fetchExistingSnapshotMeta(
    portfolioId,
    start,
    end,
  );
  if (existErr) return { written: 0, missing: 0, error: existErr };

  const writable = findWritableSnapshotDates(start, end, existing);
  if (writable.length === 0) {
    console.log(
      `[backfill] start portfolio=${broker} od ${start} writable 0 dnů (vše locked/kompletní)`,
    );
    return { written: 0, missing: 0, error: null };
  }

  console.log(
    `[backfill] start portfolio=${broker} od ${start} writable ${writable.length} dnů (locked přeskočeny)`,
  );

  const events = toEvents(transactions);
  const writableSet = new Set(writable);

  const tickersNeeded: { ticker: string; isin: string | null }[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.type !== 'buy' && ev.type !== 'sell' && ev.type !== 'gift') continue;
    const k = holdingKey(ev.ticker, ev.isin);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    tickersNeeded.push({ ticker: k, isin: ev.isin });
  }

  const currencies = new Set<string>(['USD']);
  for (const ev of events) currencies.add(ev.currency);

  const fxByCcy = await fetchHistoricalFxToUsd([...currencies], start, end);
  const priceBooks = await loadPriceBooks(tickersNeeded, start, end);

  const quoteCcys = new Set<string>();
  for (const book of priceBooks.values()) {
    if (book) quoteCcys.add(book.currency);
  }
  const missingQuoteFx = [...quoteCcys].filter((c) => c !== 'USD' && !fxByCcy.has(c));
  if (missingQuoteFx.length > 0) {
    const extra = await fetchHistoricalFxToUsd(missingQuoteFx, start, end);
    for (const [k, v] of extra) fxByCcy.set(k, v);
  }

  const holdings = new Map<HoldingKey, { units: number; isin: string | null }>();
  let cashUsd = 0;
  let evIdx = 0;
  const toWrite: SnapshotUpsertRow[] = [];
  let dayLogCounter = 0;
  const diagnostics = new PriceDiagnostics();

  for (const day of eachCalendarDate(start, end)) {
    while (evIdx < events.length && events[evIdx]!.date === day) {
      const ev = events[evIdx]!;
      const rate = fxRateOnDay(fxByCcy, ev.currency, day);
      cashUsd = applyTxToCashAndHoldings(ev, holdings, cashUsd, rate);
      evIdx += 1;
    }

    if (!writableSet.has(day)) continue;

    let positionsUsd = 0;
    const missingTickers: string[] = [];
    let btcUnits = 0;
    let btcPriceUsd: number | null = null;
    for (const [ticker, hold] of holdings) {
      if (hold.units <= 1e-12) continue;

      const book = priceBooks.get(ticker);
      if (!book) {
        missingTickers.push(ticker);
        diagnostics.recordMissing(ticker);
        continue;
      }

      const looked = getPriceForDate(book.sparse, day, {
        maxStaleDays: PRICE_FORWARD_FILL_MAX_DAYS,
      });
      if (!looked.ok) {
        missingTickers.push(ticker);
        diagnostics.recordMissing(ticker);
        continue;
      }
      if (looked.source === 'forward_fill') diagnostics.recordFallback(ticker);

      const fx = fxRateOnDay(fxByCcy, book.currency, day);
      if (fx == null || !(fx > 0)) {
        missingTickers.push(ticker);
        diagnostics.recordMissing(ticker);
        continue;
      }
      const valueUsd = hold.units * looked.price * fx;
      // Nikdy neukládej 0, když máme kladnou cenu a jednotky (ochrana proti FX/parse chybám).
      if (!(valueUsd > 0) && hold.units > 0 && looked.price > 0) {
        missingTickers.push(ticker);
        diagnostics.recordMissing(ticker);
        continue;
      }
      positionsUsd += valueUsd;
      if (ticker === 'BTC' || isCryptoTicker(ticker)) {
        btcUnits = hold.units;
        btcPriceUsd = looked.price * fx;
      }
    }

    if (missingTickers.length > 0) {
      const first = missingTickers[0]!;
      const others = missingTickers.length - 1;
      console.log(
        `[backfill] SKIP den ${day}: chybí cena pro ${first}` +
          (others > 0 ? ` (a ${others} dalších)` : ''),
      );
      continue;
    }

    const total = round2(positionsUsd + cashUsd);
    // Historický kompletní den zamkni; dnešek zůstává unlocked (může se opravit).
    const locked = day < end;
    toWrite.push({ portfolioId, date: day, totalValueUsd: total, locked });

    dayLogCounter += 1;
    if (dayLogCounter === 1 || dayLogCounter % 30 === 0 || day === end) {
      if (broker === 'anycoin' || btcUnits > 0) {
        console.log(
          `[backfill-anycoin] den ${day} btc_drzeno=${btcUnits.toFixed(8)} cena_usd=${btcPriceUsd?.toFixed(2) ?? 'n/a'} hodnota_usd=${total}`,
        );
      } else {
        console.log(`[backfill] den ${day} value_usd=${total} locked=${locked}`);
      }
    }
  }

  diagnostics.logSummary(broker);

  const { upserted, error } = await upsertPortfolioSnapshotsBulk(toWrite);
  console.log(
    `[backfill] hotovo portfolio=${broker} zapsáno ${upserted}/${writable.length} writable (locked historie zmrazená)`,
  );
  return { written: upserted, missing: writable.length, error };
}

/**
 * Backfill všech portfolií seřazeně (šetří Yahoo rate limit).
 */
export async function backfillAllPortfolioSnapshots(
  portfolios: BackfillPortfolioInput[],
  onProgress?: (p: BackfillProgress) => void,
): Promise<{ totalWritten: number; error: Error | null }> {
  onProgress?.({ status: 'running', message: 'loading_history' });
  let totalWritten = 0;
  for (const pf of portfolios) {
    try {
      const res = await backfillPortfolioSnapshots(pf);
      totalWritten += res.written;
      if (res.error) {
        onProgress?.({ status: 'error', message: res.error.message });
        return { totalWritten, error: res.error };
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn('[backfill] portfolio failed', pf.broker, err.message);
      onProgress?.({ status: 'error', message: err.message });
      return { totalWritten, error: err };
    }
  }
  onProgress?.({ status: 'done' });
  return { totalWritten, error: null };
}
