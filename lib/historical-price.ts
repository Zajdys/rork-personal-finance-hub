/**
 * Historická denní close cena pro ruční zadání investiční transakce.
 * Yahoo chart API (stejný stack jako lib/yahoo-historical.ts) + toYahooSymbol / FX.
 */
import { fetchYahooDailySeries } from '@/lib/yahoo-historical';
import { convertAmountBetweenCurrencies, toYahooSymbol } from '@/lib/yahoo-ticker';

/** Holé krypto tickery → Yahoo páry (toYahooSymbol samo BTC nevrací). */
const CRYPTO_TO_YAHOO: Record<string, string> = {
  BTC: 'BTC-USD',
  BITCOIN: 'BTC-USD',
  ETH: 'ETH-USD',
  ETHEREUM: 'ETH-USD',
  SOL: 'SOL-USD',
  ADA: 'ADA-USD',
  XRP: 'XRP-USD',
  DOGE: 'DOGE-USD',
  DOT: 'DOT-USD',
  AVAX: 'AVAX-USD',
  LINK: 'LINK-USD',
  MATIC: 'MATIC-USD',
  LTC: 'LTC-USD',
  BCH: 'BCH-USD',
  UNI: 'UNI-USD',
  ATOM: 'ATOM-USD',
};

/** Kolik dní zpět hledat předchozí obchodní den (víkend / svátek). */
const LOOKBACK_CALENDAR_DAYS = 14;

export type HistoricalPriceResult = {
  /** Close v native měně (GBp už /100 → GBP). */
  price: number;
  currency: string;
  /** Pokud byl zadán targetCurrency a FX vyšel. */
  priceInTarget: number | null;
  targetCurrency: string | null;
  yahooSymbol: string;
  /** Skutečný obchodní den close (může být dřív než requestedDate). */
  asOfDate: string;
  requestedDate: string;
};

function resolveYahooSymbolForHistory(ticker: string, isin?: string | null): string {
  const raw = ticker.trim().toUpperCase();
  if (!raw) return raw;
  if (CRYPTO_TO_YAHOO[raw]) return CRYPTO_TO_YAHOO[raw]!;
  if (/^[A-Z0-9]+-USD$/i.test(raw)) return raw;
  return toYahooSymbol(ticker, isin);
}

function isoMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function unixSecUtcNoon(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00.000Z`).getTime() / 1000);
}

/**
 * V mapě YYYY-MM-DD → close najdi requestedDate, jinak nejbližší PŘEDCHOZÍ obchodní den.
 */
export function pickCloseOnOrBefore(
  byDate: Map<string, number>,
  requestedDate: string,
): { date: string; price: number } | null {
  const exact = byDate.get(requestedDate);
  if (exact != null && Number.isFinite(exact) && exact > 0) {
    return { date: requestedDate, price: exact };
  }
  let best: { date: string; price: number } | null = null;
  for (const [d, p] of byDate) {
    if (d > requestedDate) continue;
    if (!(p > 0) || !Number.isFinite(p)) continue;
    if (!best || d > best.date) best = { date: d, price: p };
  }
  return best;
}

/**
 * Close cena k danému dni (nebo předchozí obchodní den).
 * Nikdy nevrací 0 — při selhání `null`.
 */
export async function fetchHistoricalPrice(
  ticker: string,
  dateIso: string,
  options?: {
    isin?: string | null;
    /** Převod do této měny (formulář CZK/EUR/USD). */
    targetCurrency?: string | null;
  },
): Promise<HistoricalPriceResult | null> {
  const requestedDate = dateIso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return null;

  const yahooSymbol = resolveYahooSymbolForHistory(ticker, options?.isin);
  if (!yahooSymbol) return null;

  const fromIso = isoMinusDays(requestedDate, LOOKBACK_CALENDAR_DAYS);
  const toIso = isoPlusDays(requestedDate, 1);
  const period1 = unixSecUtcNoon(fromIso);
  const period2 = unixSecUtcNoon(toIso) + 86_400;

  const series = await fetchYahooDailySeries(yahooSymbol, period1, period2);
  if (!series || series.byDate.size === 0) {
    if (__DEV__) console.log('[hist-price]', ticker, requestedDate, '-> (no series)', yahooSymbol);
    return null;
  }

  const picked = pickCloseOnOrBefore(series.byDate, requestedDate);
  if (!picked) {
    if (__DEV__) console.log('[hist-price]', ticker, requestedDate, '-> (no prior close)', yahooSymbol);
    return null;
  }

  const target = options?.targetCurrency?.trim().toUpperCase() || null;
  let priceInTarget: number | null = null;
  if (target && target !== series.currency) {
    priceInTarget = await convertAmountBetweenCurrencies(picked.price, series.currency, target);
  } else if (target && target === series.currency) {
    priceInTarget = picked.price;
  }

  const displayPrice = priceInTarget != null && priceInTarget > 0 ? priceInTarget : picked.price;
  const displayCurrency =
    priceInTarget != null && priceInTarget > 0 && target ? target : series.currency;

  if (__DEV__) {
    console.log(
      '[hist-price]',
      ticker,
      requestedDate,
      '->',
      displayPrice,
      displayCurrency,
      `(asOf ${picked.date}, yahoo ${yahooSymbol}, native ${picked.price} ${series.currency})`,
    );
  }

  return {
    price: picked.price,
    currency: series.currency,
    priceInTarget: priceInTarget != null && priceInTarget > 0 ? priceInTarget : null,
    targetCurrency: target,
    yahooSymbol,
    asOfDate: picked.date,
    requestedDate,
  };
}
