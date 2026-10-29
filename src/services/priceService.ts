import { Platform } from 'react-native';
import {
  fetchYahooNativePrice,
  fetchYahooNativePricesInBatches,
  toYahooSymbol,
} from '@/lib/yahoo-ticker';

export type LatestPrice = { price: number; time?: string | null; ccy?: string | null };

function normalizeTickers(tickers: string[]): string[] {
  return Array.from(
    new Set(
      (tickers || [])
        .map((t) => (t ?? '').trim())
        .filter((t) => t.length > 0),
    ),
  );
}

/**
 * Ceny přímo z Yahoo Finance (stejný stack jako portfolio).
 * TODO(App Store): až půjde pryč @rork-ai/toolkit-sdk / Rork proxy, tento soubor už Rork nepoužívá.
 */
export async function fetchLatestPrices(tickers: string[]): Promise<Record<string, LatestPrice>> {
  const out: Record<string, LatestPrice> = {};
  const unique = normalizeTickers(tickers);
  if (!unique.length) return out;

  try {
    console.log('[priceService] Yahoo direct fetch', { count: unique.length, platform: Platform.OS });
    const { quotesByTicker } = await fetchYahooNativePricesInBatches(
      unique.map((ticker) => ({ ticker, isin: null })),
    );
    for (const ticker of unique) {
      const q = quotesByTicker.get(ticker) ?? quotesByTicker.get(ticker.toUpperCase());
      if (q && typeof q.price === 'number' && Number.isFinite(q.price)) {
        out[ticker] = { price: q.price, time: null, ccy: q.currency ?? null };
        out[ticker.toUpperCase()] = out[ticker]!;
      }
    }
  } catch (e) {
    console.error('[priceService] fetchLatestPrices Yahoo error', e);
  }
  return out;
}

export async function fetchCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  const unique = normalizeTickers(symbols);
  if (!unique.length) return {};
  const results: Record<string, number> = {};
  try {
    await Promise.all(
      unique.map(async (base) => {
        const quote = await fetchYahooNativePrice(base);
        if (quote && typeof quote.price === 'number' && Number.isFinite(quote.price)) {
          results[base.toUpperCase()] = quote.price;
          return;
        }
        // Zkus mapování broker → Yahoo symbol
        const mapped = toYahooSymbol(base);
        if (mapped !== base) {
          const q2 = await fetchYahooNativePrice(mapped);
          if (q2 && typeof q2.price === 'number' && Number.isFinite(q2.price)) {
            results[base.toUpperCase()] = q2.price;
          }
        }
      }),
    );
  } catch (e) {
    console.warn('[priceService] fetchCurrentPrices error', e);
  }
  return results;
}

export type StockSector = {
  symbol: string;
  sector: string;
  industry: string | null;
  country: string | null;
};

/** Yahoo chart API nevrací sektor spolehlivě — bez Rork proxy vracíme prázdno. */
export async function fetchStockSectors(_symbols: string[]): Promise<Record<string, StockSector>> {
  return {};
}
