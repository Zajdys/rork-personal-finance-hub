import { Platform } from 'react-native';

export type LatestPrice = { price: number; time?: string | null; ccy?: string | null };

export async function fetchLatestPrices(tickers: string[]): Promise<Record<string, LatestPrice>> {
  const unique = Array.from(new Set((tickers || []).map((t) => (t || '').trim().toLowerCase()).filter(Boolean)));
  const out: Record<string, LatestPrice> = {};
  if (!unique.length) return out;

  try {
    const symbols = unique.map((t) => `${encodeURIComponent(t)}.us`).join(',');
    const url = `https://stooq.com/q/l/?s=${symbols}&f=sd2t2ohlcvn&h&e=csv`;
    console.log('[priceService] fetch', { url, count: unique.length, platform: Platform.OS });
    const res = await fetch(url);
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
  } catch (e) {
    console.error('[priceService] fetchLatestPrices error', e);
    return out;
  }
}
