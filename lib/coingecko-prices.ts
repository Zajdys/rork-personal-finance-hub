/**
 * CoinGecko ceny pro krypto (BTC).
 * Free tier bez API klíče; retry + backoff na HTTP 429.
 * Historie pro snapshoty: vždy USD (total_value_usd), UI přepočte do CZK/EUR.
 *
 * Free/Demo CoinGecko omezuje historii na posledních ~365 dní.
 * Pro starší data (Anycoin od 4/2024) doplňujeme Yahoo BTC-USD / ETH-USD.
 */

import {
  getPriceForDate,
  PRICE_FORWARD_FILL_MAX_DAYS,
  type SparseCloseMap,
} from '@/lib/portfolio-price-lookup';
import { fetchYahooDailySeries } from '@/lib/yahoo-historical';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FETCH_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = [800, 2000, 5000, 10000] as const;
/** Free/Demo plán: historie max ~365 dní od dnes. */
const COINGECKO_FREE_HISTORY_DAYS = 365;

/** Mapování ticker → CoinGecko id. */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  BITCOIN: 'bitcoin',
  ETH: 'ethereum',
  ETHEREUM: 'ethereum',
};

/** Yahoo symboly pro doplnění historie starší než free CoinGecko. */
const YAHOO_CRYPTO_USD: Record<string, string> = {
  BTC: 'BTC-USD',
  BITCOIN: 'BTC-USD',
  ETH: 'ETH-USD',
  ETHEREUM: 'ETH-USD',
};

export type CoingeckoVsCurrency = 'czk' | 'usd' | 'eur';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoFromMs(ms: number): string {
  // CoinGecko market_chart timestamps jsou v milisekundách.
  return new Date(ms).toISOString().slice(0, 10);
}

function calendarDaysInclusive(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T12:00:00.000Z`);
  const b = Date.parse(`${toIso}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

async function fetchJson<T>(url: string, attempt = 0): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (MoneyBuddy)',
      },
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 220);
      } catch {
        /* ignore */
      }
      const planLimited =
        res.status === 401 ||
        /exceeds the allowed time range|subscribe|plan/i.test(detail);
      const rateLimited = res.status === 429;

      if (rateLimited && attempt < RETRY_BACKOFF_MS.length) {
        const wait = RETRY_BACKOFF_MS[attempt]!;
        console.warn(
          `[coingecko] HTTP ${res.status} — retry za ${wait}ms (attempt ${attempt + 1})`,
        );
        await sleep(wait);
        return fetchJson<T>(url, attempt + 1);
      }
      if (planLimited) {
        console.warn(`[coingecko] HTTP ${res.status} plan/range limit ${url.slice(0, 90)}`);
        return null;
      }
      console.warn(`[coingecko] HTTP ${res.status} ${url.slice(0, 100)} ${detail}`);
      if (attempt < RETRY_BACKOFF_MS.length && res.status >= 500) {
        await sleep(RETRY_BACKOFF_MS[attempt]!);
        return fetchJson<T>(url, attempt + 1);
      }
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    if (attempt < RETRY_BACKOFF_MS.length) {
      await sleep(RETRY_BACKOFF_MS[attempt]!);
      return fetchJson<T>(url, attempt + 1);
    }
    console.warn('[coingecko] fetch failed', e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveCoingeckoId(ticker: string): string | null {
  const t = ticker.trim().toUpperCase();
  return COINGECKO_IDS[t] ?? null;
}

export function isCryptoTicker(ticker: string | null | undefined): boolean {
  if (!ticker) return false;
  return resolveCoingeckoId(ticker) != null;
}

/**
 * Aktuální cena: /simple/price
 */
export async function fetchCoingeckoSimplePrice(
  ticker: string,
  vs: CoingeckoVsCurrency | CoingeckoVsCurrency[] = ['czk', 'usd', 'eur'],
): Promise<Partial<Record<CoingeckoVsCurrency, number>> | null> {
  const id = resolveCoingeckoId(ticker);
  if (!id) return null;
  const vsList = Array.isArray(vs) ? vs : [vs];
  const url =
    `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(id)}` +
    `&vs_currencies=${vsList.join(',')}`;
  const data = await fetchJson<Record<string, Record<string, number>>>(url);
  if (!data?.[id]) return null;
  const row = data[id]!;
  const out: Partial<Record<CoingeckoVsCurrency, number>> = {};
  for (const c of vsList) {
    const px = row[c];
    if (px != null && Number.isFinite(px) && px > 0) out[c] = px;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Parsuje market_chart odpověď: { prices: [[timestamp_ms, price], ...] }.
 */
function parseMarketChartPrices(
  data: { prices?: [number, number][] } | null,
): SparseCloseMap | null {
  if (!data?.prices?.length) return null;
  const sparse: SparseCloseMap = new Map();
  for (const point of data.prices) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const ts = point[0];
    const price = point[1];
    if (ts == null || price == null || !(price > 0)) continue;
    // ts je ms; kdyby omylem přišly sekundy (< 1e12), přeškáluj.
    const ms = ts < 1e12 ? ts * 1000 : ts;
    sparse.set(isoFromMs(ms), price);
  }
  return sparse.size > 0 ? sparse : null;
}

function logHistorySummary(
  ticker: string,
  vs: string,
  sparse: SparseCloseMap,
  source: string,
): void {
  const dates = [...sparse.keys()].sort((a, b) => a.localeCompare(b));
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  console.log(
    `[coingecko] historie: ${sparse.size} dní, první ${first}=${sparse.get(first)!.toFixed(2)} ${vs.toUpperCase()}, poslední ${last}=${sparse.get(last)!.toFixed(2)} ${vs.toUpperCase()} (${ticker}, ${source})`,
  );
}

/**
 * Historie denních cen přes /coins/{id}/market_chart?vs_currency=&days=
 * days>90 → denní granularity (auto). Free tier: max ~365 dní.
 */
export async function fetchCoingeckoDailySeries(
  ticker: string,
  vs: CoingeckoVsCurrency,
  days: number | 'max' = 365,
): Promise<{ sparse: SparseCloseMap; currency: string } | null> {
  const id = resolveCoingeckoId(ticker);
  if (!id) return null;
  const daysParam =
    days === 'max'
      ? String(COINGECKO_FREE_HISTORY_DAYS)
      : String(Math.max(1, Math.min(Math.floor(days), COINGECKO_FREE_HISTORY_DAYS)));
  const url =
    `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}/market_chart` +
    `?vs_currency=${vs}&days=${daysParam}`;
  const data = await fetchJson<{ prices?: [number, number][] }>(url);
  const sparse = parseMarketChartPrices(data);
  if (!sparse) {
    console.log(`[coingecko] ${ticker}/${vs} FAIL no market_chart data (days=${daysParam})`);
    return null;
  }
  logHistorySummary(ticker, vs, sparse, `market_chart days=${daysParam}`);
  return { sparse, currency: vs.toUpperCase() };
}

async function fetchYahooCryptoUsdSparse(
  ticker: string,
  fromIso: string,
  toIso: string,
): Promise<SparseCloseMap | null> {
  const key = ticker.trim().toUpperCase();
  const yahooSymbol = YAHOO_CRYPTO_USD[key];
  if (!yahooSymbol) return null;
  const period1 = Math.floor(Date.parse(`${fromIso}T00:00:00.000Z`) / 1000) - 14 * 86400;
  const period2 = Math.floor(Date.parse(`${toIso}T23:59:59.000Z`) / 1000) + 86400;
  const series = await fetchYahooDailySeries(yahooSymbol, period1, period2);
  if (!series || series.byDate.size === 0) {
    console.warn(`[coingecko] Yahoo fallback FAIL ${yahooSymbol}`);
    return null;
  }
  console.log(
    `[coingecko] Yahoo fallback ${yahooSymbol}: ${series.pointCount} dní (${fromIso}…${toIso})`,
  );
  return series.byDate;
}

/**
 * Historie za období [fromIso, toIso] v USD pro backfill snapshotů.
 *
 * 1) CoinGecko `/market_chart?days=` (free: posledních ≤365 dní)
 * 2) Yahoo BTC-USD/ETH-USD doplní starší dny (Anycoin od 4/2024)
 *
 * Výsledek: {YYYY-MM-DD → price_usd}, timestamps z CG jsou ms → UTC den.
 */
export async function fetchCoingeckoDailySeriesRange(
  ticker: string,
  vs: CoingeckoVsCurrency,
  fromIso: string,
  toIso: string,
): Promise<{ sparse: SparseCloseMap; currency: string } | null> {
  const id = resolveCoingeckoId(ticker);
  if (!id) return null;
  if (!fromIso || !toIso || toIso < fromIso) return null;

  // Snapshoty ukládáme v USD — historie vždy USD (i když volající pošle jiné vs).
  const historyVs: CoingeckoVsCurrency = 'usd';
  if (vs !== 'usd') {
    console.log(
      `[coingecko] range: požadováno ${vs}, používám usd pro total_value_usd (${ticker})`,
    );
  }

  const freeCutoffMs = Date.now() - COINGECKO_FREE_HISTORY_DAYS * 86_400_000;
  const freeCutoffIso = new Date(freeCutoffMs).toISOString().slice(0, 10);
  // Free CG má jen posledních ~365 dní — starší období bereme z Yahoo.
  const cgUseful = toIso >= freeCutoffIso;

  let cgSparse: SparseCloseMap | null = null;
  if (cgUseful) {
    const overlapFrom = fromIso > freeCutoffIso ? fromIso : freeCutoffIso;
    const neededDays = calendarDaysInclusive(overlapFrom, toIso);
    const cgDays = Math.min(Math.max(neededDays + 7, 91), COINGECKO_FREE_HISTORY_DAYS);
    const cg = await fetchCoingeckoDailySeries(ticker, historyVs, cgDays);
    cgSparse = cg?.sparse ?? null;
  } else {
    console.log(
      `[coingecko] skip market_chart (${fromIso}…${toIso} před free limitem ${freeCutoffIso}) — Yahoo`,
    );
  }

  const yahoo = await fetchYahooCryptoUsdSparse(ticker, fromIso, toIso);

  const sparse: SparseCloseMap = new Map();
  // Yahoo jako základ (plné období), CoinGecko přepíše překryv (preferuj CG kde je).
  if (yahoo) {
    for (const [d, px] of yahoo) {
      if (d >= fromIso && d <= toIso && px > 0) sparse.set(d, px);
    }
  }
  if (cgSparse) {
    for (const [d, px] of cgSparse) {
      if (d >= fromIso && d <= toIso && px > 0) sparse.set(d, px);
    }
  }

  if (sparse.size === 0) {
    console.warn(`[coingecko] range empty ${ticker} ${fromIso}…${toIso}`);
    return null;
  }

  const source =
    yahoo && cgSparse ? 'yahoo+coingecko' : yahoo ? 'yahoo' : 'coingecko';
  logHistorySummary(ticker, historyVs, sparse, source);
  return { sparse, currency: 'USD' };
}

/**
 * Cena k datu přes sdílený getPriceForDate (forward-fill max 7 dní).
 */
export function getCoingeckoPriceForDate(
  sparse: SparseCloseMap,
  date: string,
): ReturnType<typeof getPriceForDate> {
  return getPriceForDate(sparse, date, { maxStaleDays: PRICE_FORWARD_FILL_MAX_DAYS });
}

/** Cache live cen (session). */
const liveCache = new Map<
  string,
  { at: number; prices: Partial<Record<CoingeckoVsCurrency, number>> }
>();
const LIVE_TTL_MS = 5 * 60 * 1000;

export async function fetchCoingeckoLivePriceCached(
  ticker: string,
  vs: CoingeckoVsCurrency,
): Promise<number | null> {
  const key = ticker.trim().toUpperCase();
  const now = Date.now();
  const hit = liveCache.get(key);
  if (hit && now - hit.at < LIVE_TTL_MS && hit.prices[vs] != null) {
    return hit.prices[vs]!;
  }
  const prices = await fetchCoingeckoSimplePrice(ticker, ['czk', 'usd', 'eur']);
  if (!prices) return null;
  liveCache.set(key, { at: now, prices });
  return prices[vs] ?? null;
}
