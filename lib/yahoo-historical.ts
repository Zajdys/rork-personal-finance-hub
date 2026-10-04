/**
 * Historické denní ceny a FX z Yahoo Finance chart API.
 * GBp/GBX → /100 jen podle meta.currency (ne podle .L).
 */

import { normalizeYahooPrice, YAHOO_BATCH_DELAY_MS } from '@/lib/yahoo-ticker';

const YAHOO_FETCH_TIMEOUT_MS = 12_000;
const YAHOO_RETRY_BACKOFF_MS = [500, 1200, 2500] as const;

export type DailySeries = {
  /** YYYY-MM-DD → close (major units; GBp už /100). */
  byDate: Map<string, number>;
  currency: string;
  rawCurrency: string;
  dividedBy100: boolean;
  yahooSymbol: string;
  pointCount: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDateFromUnixSec(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export function eachCalendarDate(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromIso}T12:00:00.000Z`);
  const end = new Date(`${toIso}T12:00:00.000Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Počet kalendářních dnů mezi dvěma ISO daty (to − from). */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T12:00:00.000Z`);
  const b = Date.parse(`${toIso}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Forward-fill trading-day map across calendar days in [from, to].
 * `maxStaleDays`: max stáří poslední známé ceny (kalendářní dny). Nad limit → den bez ceny.
 */
export function forwardFillDailyMap(
  sparse: Map<string, number>,
  fromIso: string,
  toIso: string,
  options?: { maxStaleDays?: number },
): Map<string, number> {
  const maxStale = options?.maxStaleDays;
  const out = new Map<string, number>();
  let last: number | null = null;
  let lastDate: string | null = null;
  for (const d of eachCalendarDate(fromIso, toIso)) {
    const v = sparse.get(d);
    if (v != null && Number.isFinite(v) && v > 0) {
      last = v;
      lastDate = d;
    }
    if (last == null || lastDate == null) continue;
    if (maxStale != null && calendarDaysBetween(lastDate, d) > maxStale) continue;
    out.set(d, last);
  }
  return out;
}

async function fetchChartJson(
  yahooSymbol: string,
  period1: number,
  period2: number,
  attempt = 0,
): Promise<{
  timestamps: number[];
  closes: (number | null)[];
  currency: string | null;
} | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      const canRetry =
        attempt < YAHOO_RETRY_BACKOFF_MS.length && (res.status === 429 || res.status === 400);
      if (canRetry) {
        await sleep(YAHOO_RETRY_BACKOFF_MS[attempt]!);
        return fetchChartJson(yahooSymbol, period1, period2, attempt + 1);
      }
      return null;
    }
    const data = (await res.json()) as {
      chart?: {
        result?: {
          timestamp?: number[];
          meta?: { currency?: string };
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    return {
      timestamps: result.timestamp ?? [],
      closes: result.indicators?.quote?.[0]?.close ?? [],
      currency: result.meta?.currency ?? null,
    };
  } catch {
    if (attempt < YAHOO_RETRY_BACKOFF_MS.length) {
      await sleep(YAHOO_RETRY_BACKOFF_MS[attempt]!);
      return fetchChartJson(yahooSymbol, period1, period2, attempt + 1);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Stáhne denní close ceny pro Yahoo symbol.
 * period1/period2 = unix seconds (UTC).
 */
export async function fetchYahooDailySeries(
  yahooSymbol: string,
  period1: number,
  period2: number,
): Promise<DailySeries | null> {
  const raw = await fetchChartJson(yahooSymbol, period1, period2);
  if (!raw || raw.timestamps.length === 0) return null;

  const sparse = new Map<string, number>();
  let currency = 'USD';
  let rawCurrency = 'USD';
  let dividedBy100 = false;

  for (let i = 0; i < raw.timestamps.length; i++) {
    const ts = raw.timestamps[i]!;
    const close = raw.closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const norm = normalizeYahooPrice(close, raw.currency);
    currency = norm.currency;
    rawCurrency = norm.rawCurrency;
    dividedBy100 = norm.dividedBy100;
    sparse.set(isoDateFromUnixSec(ts), norm.price);
  }

  if (sparse.size === 0) return null;

  return {
    byDate: sparse,
    currency,
    rawCurrency,
    dividedBy100,
    yahooSymbol,
    pointCount: sparse.size,
  };
}

/** Spustí úlohy po `concurrency` paralelně. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
      if (YAHOO_BATCH_DELAY_MS > 0) await sleep(YAHOO_BATCH_DELAY_MS);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

const FX_PAIRS_TO_USD: Record<string, string> = {
  USD: '', // identity
  EUR: 'EURUSD=X',
  GBP: 'GBPUSD=X',
  HKD: 'HKDUSD=X',
  JPY: 'JPYUSD=X',
  DKK: 'DKKUSD=X',
  SEK: 'SEKUSD=X',
  NOK: 'NOKUSD=X',
  CZK: 'CZKUSD=X',
};

const FX_INVERSE_FALLBACK: Record<string, string> = {
  JPY: 'USDJPY=X',
  HKD: 'USDHKD=X',
  DKK: 'USDDKK=X',
  SEK: 'USDSEK=X',
  NOK: 'USDNOK=X',
  CZK: 'USDCZK=X',
};

/**
 * Historie kurzů → USD (1 unit of `fromCurrency` = ? USD).
 * Forward-fill přes kalendářní dny.
 */
export async function fetchHistoricalFxToUsd(
  currencies: string[],
  fromIso: string,
  toIso: string,
): Promise<Map<string, Map<string, number>>> {
  const period1 = Math.floor(new Date(`${fromIso}T00:00:00.000Z`).getTime() / 1000) - 7 * 86400;
  const period2 = Math.floor(new Date(`${toIso}T23:59:59.000Z`).getTime() / 1000) + 86400;

  const uniq = [
    ...new Set(
      currencies
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c && c !== 'USD'),
    ),
  ];

  const result = new Map<string, Map<string, number>>();
  result.set('USD', forwardFillDailyMap(new Map([[fromIso, 1]]), fromIso, toIso));

  const seriesList = await mapPool(uniq, 5, async (ccy) => {
    const pair = FX_PAIRS_TO_USD[ccy];
    if (!pair) {
      if (__DEV__) console.warn(`[backfill] FX ${ccy}→USD: no pair mapping`);
      return { ccy, series: null as DailySeries | null, inverted: false };
    }

    let series = await fetchYahooDailySeries(pair, period1, period2);
    let inverted = false;
    if (!series) {
      const inv = FX_INVERSE_FALLBACK[ccy];
      if (inv) {
        series = await fetchYahooDailySeries(inv, period1, period2);
        inverted = true;
      }
    }
    return { ccy, series, inverted };
  });

  for (const { ccy, series, inverted } of seriesList) {
    if (!series) {
      if (__DEV__) console.log(`[backfill] FX ${ccy} FAIL no data`);
      continue;
    }
    const sparse = new Map<string, number>();
    for (const [d, px] of series.byDate) {
      const rate = inverted ? (px > 0 ? 1 / px : null) : px;
      if (rate != null && rate > 0) sparse.set(d, rate);
    }
    const filled = forwardFillDailyMap(sparse, fromIso, toIso);
    result.set(ccy, filled);
    if (__DEV__) console.log(`[backfill] FX ${ccy}USD pts=${series.pointCount}${inverted ? ' (inverse)' : ''}`);
  }

  return result;
}

export function fxRateOnDay(
  fxByCcy: Map<string, Map<string, number>>,
  currency: string,
  date: string,
): number | null {
  const c = currency.trim().toUpperCase() || 'USD';
  if (c === 'USD') return 1;
  const series = fxByCcy.get(c);
  if (!series) return null;
  return series.get(date) ?? null;
}
