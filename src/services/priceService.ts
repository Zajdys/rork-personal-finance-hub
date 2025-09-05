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

async function fetchFromYahoo(tickers: string[]): Promise<YahooQuote[]> {
  const unique = normalizeTickers(tickers);
  if (!unique.length) return [];
  const joined = encodeURIComponent(unique.join(','));
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}`;
  console.log('[priceService] yahoo fetch', { url, count: unique.length, platform: Platform.OS });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = (await res.json()) as { quoteResponse?: { result?: YahooQuote[] } };
  const list = json?.quoteResponse?.result ?? [];
  return list;
}

async function fetchFromStooq(tickers: string[]): Promise<Record<string, LatestPrice>> {
  const unique = normalizeTickers(tickers).map((t) => t.toLowerCase());
  const out: Record<string, LatestPrice> = {};
  if (!unique.length) return out;
  const symbols = unique.map((t) => `${encodeURIComponent(t)}.us`).join(',');
  const url = `https://stooq.com/q/l/?s=${symbols}&f=sd2t2ohlcvn&h&e=csv`;
  console.log('[priceService] stooq fetch', { url, count: unique.length, platform: Platform.OS });
  const res = await fetch(url);
  if (!res.ok) return out;
  const text = await res.text();
  const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rows.length <= 1) return out;
  const header = rows[0].split(',').map((h) => h.trim().toLowerCase());
  const symIdx = header.indexOf('symbol');
  const closeIdx = header.indexOf('close');
  const dateIdx = header.indexOf('date');
  const timeIdx = header.indexOf('time');
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(',');
    const symRaw = (cols[symIdx] ?? '').trim().toLowerCase();
    const sym = symRaw.replace(/\.us$/, '');
    const price = Number(cols[closeIdx]);
    const d = (cols[dateIdx] ?? '').trim();
    const t = (cols[timeIdx] ?? '').trim();
    if (Number.isFinite(price)) {
      out[sym] = { price, time: d && t ? `${d} ${t}` : d || t || null, ccy: null };
    }
  }
  return out;
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

export async function fetchCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  const unique = normalizeTickers(symbols);
  if (!unique.length) return {};
  try {
    const quotes = await fetchFromYahoo(unique);
    const results: Record<string, number> = {};
    for (const item of quotes) {
      const symbol = (item.symbol ?? '').trim();
      const price = item.regularMarketPrice;
      if (symbol && typeof price === 'number' && Number.isFinite(price)) {
        results[symbol] = price;
      }
    }
    if (Object.keys(results).length > 0) return results;
  } catch (e) {
    console.error('[priceService] fetchCurrentPrices yahoo error, falling back to stooq', e);
  }
  const stooq = await fetchFromStooq(unique);
  const mapped: Record<string, number> = {};
  for (const [k, v] of Object.entries(stooq)) {
    mapped[k.toUpperCase()] = v.price;
  }
  return mapped;
}
