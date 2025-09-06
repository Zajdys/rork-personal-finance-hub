import { Platform } from 'react-native';

export type LatestPrice = { price: number; time?: string | null; ccy?: string | null };

type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  currency?: string;
};

function normalizeTickers(tickers: string[]): string[] {
  return Array.from(
    new Set(
      (tickers || [])
        .map((t) => (t ?? '').trim())
        .filter((t) => t.length > 0)
    )
  );
}

function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (!url) throw new Error('EXPO_PUBLIC_RORK_API_BASE_URL is not set');
  return url;
}

async function fetchFromYahoo(tickers: string[]): Promise<YahooQuote[]> {
  const unique = normalizeTickers(tickers);
  if (!unique.length) return [];
  const joined = encodeURIComponent(unique.join(','));
  const base = getApiBaseUrl();
  const url = `${base}/api/quotes?symbols=${joined}`;
  console.log('[priceService] yahoo proxy fetch', { url, count: unique.length, platform: Platform.OS });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  const json = (await res.json()) as { quotes?: YahooQuote[] };
  const list = json?.quotes ?? [];
  return list;
}

async function fetchFromStooq(_tickers: string[]): Promise<Record<string, LatestPrice>> {
  console.warn('[priceService] stooq fallback disabled to avoid wrong US mapping on EU tickers');
  return {};
}

export async function fetchLatestPrices(tickers: string[]): Promise<Record<string, LatestPrice>> {
  const out: Record<string, LatestPrice> = {};
  const unique = normalizeTickers(tickers);
  if (!unique.length) return out;

  try {
    const quotes = await fetchFromYahoo(unique);
    for (const q of quotes) {
      const sym = (q.symbol ?? '').trim();
      const price = q.regularMarketPrice;
      if (sym && typeof price === 'number' && Number.isFinite(price)) {
        const time = q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null;
        out[sym] = { price, time, ccy: q.currency ?? null };
      }
    }
    if (Object.keys(out).length > 0) return out;
  } catch (e) {
    console.error('[priceService] fetchLatestPrices yahoo error, falling back to stooq', e);
  }

  try {
    const fallback = await fetchFromStooq(unique);
    return fallback;
  } catch (e) {
    console.error('[priceService] fetchLatestPrices stooq error', e);
    return out;
  }
}

function candidateSymbols(ticker: string): string[] {
  const t = (ticker || '').trim();
  const suffixes = ['', '.DE', '.F', '.L', '.MI', '.PA', '.AS', '.SW'];
  const out: string[] = [];
  for (const s of suffixes) out.push(`${t}${s}`);
  return out;
}

export async function fetchCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  const unique = normalizeTickers(symbols);
  if (!unique.length) return {};
  try {
    const allCandidates = Array.from(new Set(unique.flatMap(candidateSymbols)));
    const quotes = await fetchFromYahoo(allCandidates);
    const bySymbol: Record<string, YahooQuote> = {};
    for (const q of quotes) {
      const sym = (q.symbol ?? '').trim();
      if (sym) bySymbol[sym] = q;
    }
    const preference = ['', '.DE', '.F', '.PA', '.MI', '.AS', '.SW', '.L'];
    const results: Record<string, number> = {};
    for (const base of unique) {
      let picked: YahooQuote | undefined;
      for (const suf of preference) {
        const key = `${base}${suf}`;
        const q = bySymbol[key];
        if (q && typeof q.regularMarketPrice === 'number' && Number.isFinite(q.regularMarketPrice)) {
          picked = q; break;
        }
      }
      if (picked && typeof picked.regularMarketPrice === 'number') {
        results[base.toUpperCase()] = picked.regularMarketPrice as number;
      }
    }
    return results;
  } catch (e) {
    console.error('[priceService] fetchCurrentPrices yahoo error', e);
    console.log('Hint: ensure EXPO_PUBLIC_RORK_API_BASE_URL points to your dev server and backend /api/quotes is reachable.');
    return {};
  }
}
