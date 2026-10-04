/**
 * Mapování tickerů z broker exportů (XTB, Trading 212, …) na symboly Yahoo Finance
 * + načtení ceny (včetně GBp → GBP).
 *
 * XTB: VUAA.UK → Yahoo: VUAA.L (LSE)
 * XTB: VWCE.DE → Yahoo: VWCE.DE (XETRA)
 * XTB: AAPL.US → Yahoo: AAPL
 * T212: holý ticker + ISIN (DE… → .DE, FR… → .PA, …)
 */
import { YAHOO_EXCHANGE_SUFFIX_OVERRIDES, YAHOO_SYMBOL_OVERRIDES } from '@/lib/yahoo-symbol-overrides';
import { convertViaSessionCnb } from '@/lib/cnb-exchange-rates';

const YAHOO_FETCH_TIMEOUT_MS = 8000;
const YAHOO_RETRY_BACKOFF_MS = [500, 1000, 2000, 4000] as const;
const YAHOO_JITTER_MAX_MS = 200;
/** Paralelní requesty v jedné dávce (chart = 1 symbol / request). */
export const YAHOO_PRICE_BATCH_SIZE = 6;
export const YAHOO_BATCH_DELAY_MS = 100;
/** Paměťová cache živých cen — 5 minut. */
const YAHOO_PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
const YAHOO_ASYNC_STORAGE_KEY = 'yahoo_price_cache_v3';

/** Po HTTP 429 zpomal další dávky (session). */
let yahooBatchDelayMs = YAHOO_BATCH_DELAY_MS;
let yahooLast429At = 0;

type PriceCacheEntry = {
  /** Cena v targetCurrency (display). */
  price: number;
  targetCurrency: string;
  yahooSymbol: string;
  /** Yahoo meta před normalizací — pro re-validaci cache. */
  rawYahooPrice: number;
  rawYahooCurrency: string;
  fetchedAt: number;
};

type FxCacheEntry = {
  rate: number;
  fetchedAt: number;
};

const priceMemoryCache = new Map<string, PriceCacheEntry>();
const fxMemoryCache = new Map<string, FxCacheEntry>();
const inFlightPrices = new Map<string, Promise<number | null>>();
let storageHydrated = false;
let storagePriceCache: Record<string, PriceCacheEntry> = {};
let storagePersistPending = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(maxMs = YAHOO_JITTER_MAX_MS): number {
  return Math.floor(Math.random() * (maxMs + 1));
}

async function sleepWithJitter(baseMs = 0): Promise<void> {
  const delay = baseMs + jitterMs();
  if (delay > 0) await sleep(delay);
}

function priceCacheKey(ticker: string, isin: string | null | undefined, targetCurrency: string): string {
  return `${ticker.trim().toUpperCase()}|${(isin ?? '').trim().toUpperCase()}|${targetCurrency.trim().toUpperCase()}`;
}

function fxCacheKey(from: string, to: string): string {
  return `${from.toUpperCase()}|${to.toUpperCase()}`;
}

function isFresh(fetchedAt: number, ttlMs = YAHOO_PRICE_CACHE_TTL_MS): boolean {
  return Date.now() - fetchedAt <= ttlMs;
}

async function hydratePriceStorageCache(): Promise<void> {
  if (storageHydrated) return;
  storageHydrated = true;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(YAHOO_ASYNC_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, PriceCacheEntry>;
    storagePriceCache = parsed;
    for (const [key, entry] of Object.entries(parsed)) {
      if (!priceMemoryCache.has(key)) priceMemoryCache.set(key, entry);
    }
  } catch {
    // Bun self-test / web without AsyncStorage
  }
}

async function flushPriceStorageCache(): Promise<void> {
  if (storagePersistPending) return;
  storagePersistPending = true;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const merged: Record<string, PriceCacheEntry> = { ...storagePriceCache };
    for (const [key, entry] of priceMemoryCache) merged[key] = entry;
    storagePriceCache = merged;
    await AsyncStorage.setItem(YAHOO_ASYNC_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  } finally {
    storagePersistPending = false;
  }
}

function getFreshPriceCache(key: string): PriceCacheEntry | null {
  const entry = priceMemoryCache.get(key) ?? storagePriceCache[key];
  if (!entry || !isFresh(entry.fetchedAt)) return null;
  if (entry.rawYahooPrice == null || !entry.rawYahooCurrency) return null;
  return revalidatePriceCacheEntry(entry);
}

function getStalePriceCache(key: string): PriceCacheEntry | null {
  const entry = priceMemoryCache.get(key) ?? storagePriceCache[key];
  if (!entry) return null;
  if (entry.rawYahooPrice == null || !entry.rawYahooCurrency) return entry;
  return revalidatePriceCacheEntry(entry);
}

/** Přepočítá cenu z raw Yahoo meta — opraví starou cache s chybnou normalizací. */
function revalidatePriceCacheEntry(entry: PriceCacheEntry): PriceCacheEntry {
  if (
    entry.rawYahooPrice == null ||
    entry.rawYahooCurrency == null ||
    !Number.isFinite(entry.rawYahooPrice)
  ) {
    return entry;
  }
  const normalized = normalizeYahooPrice(entry.rawYahooPrice, entry.rawYahooCurrency);
  if (normalized.currency === entry.targetCurrency) {
    return { ...entry, price: normalized.price };
  }
  return entry;
}

function setPriceCache(key: string, entry: PriceCacheEntry): void {
  priceMemoryCache.set(key, entry);
  storagePriceCache[key] = entry;
}

function getFreshFxCache(from: string, to: string): number | null {
  const key = fxCacheKey(from, to);
  const entry = fxMemoryCache.get(key);
  if (!entry || !isFresh(entry.fetchedAt)) return null;
  return entry.rate;
}

function getStaleFxCache(from: string, to: string): number | null {
  const entry = fxMemoryCache.get(fxCacheKey(from, to));
  return entry?.rate ?? null;
}

function setFxCache(from: string, to: string, rate: number): void {
  fxMemoryCache.set(fxCacheKey(from, to), { rate, fetchedAt: Date.now() });
}

/**
 * Ruční eToro ticker → Yahoo symbol (výjimky, kde heuristika nestačí).
 * Klíč = broker ticker (uppercase), hodnota = Yahoo symbol.
 */
export const ETORO_YAHOO_MAP: Record<string, string> = {
  'AUS.DE': 'AUS.F', // AT&S Austria Technologie, ISIN AT0000969985
  LIN: 'LIN', // Linde plc (NYSE), eToro „LIN/USD“
  'LIN.L': '0M2B.L', // Linde ord LSE
  'ASML.NV': 'ASML.AS', // ASML holding, eToro bez .AS suffixu
  'BRK.B': 'BRK-B',
  'ADBE.RTH': 'ADBE',
  'NOVO-B': 'NOVO-B.CO',
  'NOVO.B': 'NOVO-B.CO',
  BLBD: 'BLBD',
  WIZZ: 'WIZZ.L', // Wizz Air, LSE (GBX/pence)
  'KAP.L': 'KAP.IL', // Kazatomprom GDR — London Intl listing
  'SMSN.L': 'SMSN.IL', // eToro „SMSN.L“ = Samsung IOB GDR (~4658 USD), ne LSE SMSN.L (~1179)
  DG: 'DG.PA', // Vinci (eToro EU; ne US Dollar General)
  SU: 'SU.PA', // TotalEnergies (eToro EU)
  '01211.HK': '1211.HK', // BYD — strip leading zero
  '8001.T': '8001.T', // Toyota Motor Corp, Tokyo
  'IDR.MC': 'IDR.MC',
  'MC.PA': 'MC.PA',
  'XFAB.PA': 'XFAB.PA',
  'EVO.ST': 'EVO.ST',
  'BNOR.OL': 'BNOR.OL',
  'RR.L': 'RR.L',
  'RHM.DE': 'RHM.DE',
  'ENR.DE': 'ENR.DE',
  '0700.HK': '0700.HK',
  '1810.HK': '1810.HK',
  '3750.HK': '3750.HK',
};

/** ISIN → Yahoo symbol (když ticker nebo ISIN země mate). */
export const ISIN_YAHOO_MAP: Record<string, string> = {
  DE000PAG9113: 'P911.DE', // Porsche AG Pref
  DE0007030009: 'RHM.DE', // Rheinmetall
  AT0000969985: 'AUS.F',
  IE000S9YS762: 'LIN',
  CNE100000296: '1211.HK', // BYD Co Ltd
  NL0010273215: 'ASML.AS',
  DK0062498333: 'NOVO-B.CO', // Novo Nordisk B
  GB00BD6FX767: 'WIZZ.L', // Wizz Air
  KYG5224Y1089: 'KAP.IL', // Kazatomprom GDR
  US7960508882: 'SMSN.IL', // Samsung Electronics GDR (eToro SMSN.L)
  FR0000125486: 'DG.PA', // Vinci
  FR0000121972: 'SU.PA', // TotalEnergies
  US2566771059: 'DG', // Dollar General (kdyby se objevil US ISIN)
  CA8672241079: 'SU', // Suncor Energy
};

/** eToro pseudo-suffixy (ne burza) — stripnout před mapováním. */
const ETORO_PSEUDO_SUFFIXES = new Set(['RTH', 'EXT', 'AH', 'PM', 'ETH']);

/** Právní formy mezi tickerem a burzovním suffixem (ASML.NV.AS → ASML.AS). */
const LEGAL_FORM_SEGMENTS = new Set(['NV', 'SA', 'AG', 'SE', 'PLC', 'LTD', 'LLC', 'INC']);

/**
 * Fallback pro holé tickery bez ISIN (legacy / neúplný export).
 * Ruční úpravy: lib/yahoo-symbol-overrides.ts
 */
const EXPLICIT_YAHOO_MAP: Record<string, string> = {
  ...YAHOO_SYMBOL_OVERRIDES,
};

/** XTB / evropské přípony → Yahoo suffix ('' = odstranit). Zdroj: yahoo-symbol-overrides. */
const EXCHANGE_SUFFIX_TO_YAHOO: Record<string, string> = {
  ...YAHOO_EXCHANGE_SUFFIX_OVERRIDES,
};

/**
 * První 2 znaky ISIN = země emitenta → Yahoo exchange suffix.
 * '' = bez přípony (typicky US). undefined = neznámá země → nechat holý ticker.
 * Pozn.: u UCITS ETF (IE/LU) nemusí země ISIN = listovací burza; T212 často LSE (.L).
 */
const ISIN_COUNTRY_TO_YAHOO: Record<string, string> = {
  DE: 'DE',
  FR: 'PA',
  NL: 'AS',
  BE: 'BR',
  PT: 'LS',
  ES: 'MC',
  IT: 'MI',
  AT: 'VI',
  SE: 'ST',
  CH: 'SW',
  DK: 'CO',
  NO: 'OL',
  FI: 'HE',
  PL: 'WA',
  GB: 'L',
  GG: 'L',
  JE: 'L',
  IM: 'L',
  IE: 'L',
  LU: 'L',
  US: '',
};

/** T212 někdy dává AAPL_US / VUSA_EQ — odřízni známé přípony. */
function stripBrokerTickerNoise(ticker: string): string {
  return ticker.replace(/_(US|EQ|LSE|NYSE|NASDAQ|DE|PA|AS|EU)$/i, '');
}

function isKnownExchangeSuffix(segment: string): boolean {
  return segment in EXCHANGE_SUFFIX_TO_YAHOO;
}

/** eToro/ broker normalizace před burzovním suffixem. */
function normalizeEtoroTickerSegments(ticker: string): string[] {
  let parts = ticker.split('.').filter(Boolean);
  if (!parts.length) return [];

  while (parts.length > 1 && ETORO_PSEUDO_SUFFIXES.has(parts[parts.length - 1]!)) {
    parts.pop();
  }

  if (
    parts.length >= 3 &&
    isKnownExchangeSuffix(parts[parts.length - 1]!) &&
    LEGAL_FORM_SEGMENTS.has(parts[parts.length - 2]!)
  ) {
    parts.splice(parts.length - 2, 1);
  }

  if (
    parts.length === 2 &&
    LEGAL_FORM_SEGMENTS.has(parts[parts.length - 1]!) &&
    !isKnownExchangeSuffix(parts[parts.length - 1]!)
  ) {
    parts = [parts[0]!];
  }

  if (parts.length >= 2 && parts[parts.length - 1] === 'HK' && /^\d+$/.test(parts[0]!)) {
    parts[0] = String(parseInt(parts[0]!, 10)).padStart(4, '0');
  }

  if (
    parts.length === 2 &&
    parts[1]!.length === 1 &&
    !isKnownExchangeSuffix(parts[1]!)
  ) {
    // US třídy akcií (BRK.B → BRK-B), ne burzovní suffixy (.T, .L, …)
    return [`${parts[0]}-${parts[1]}`];
  }

  return parts;
}

function applyExchangeSuffix(parts: string[]): string {
  if (parts.length >= 2) {
    const suffix = parts[parts.length - 1]!;
    if (isKnownExchangeSuffix(suffix)) {
      const base = parts.slice(0, -1).join('.');
      const yahooSuffix = EXCHANGE_SUFFIX_TO_YAHOO[suffix]!;
      return yahooSuffix ? `${base}.${yahooSuffix}` : base;
    }
  }
  return parts.join('.');
}

/**
 * Převede broker ticker na Yahoo Finance symbol.
 * Pořadí: override mapy → eToro normalizace → burzovní suffix → ISIN země → explicitní mapa.
 */
export function toYahooSymbol(ticker: string, isin?: string | null): string {
  const raw = ticker.trim().toUpperCase();
  if (!raw) return raw;

  const cleaned = stripBrokerTickerNoise(raw);

  const isinTrim = (isin ?? '').trim().toUpperCase();
  if (isinTrim && ISIN_YAHOO_MAP[isinTrim]) {
    return ISIN_YAHOO_MAP[isinTrim]!;
  }

  if (ETORO_YAHOO_MAP[cleaned]) {
    return ETORO_YAHOO_MAP[cleaned]!;
  }

  const normalizedParts = normalizeEtoroTickerSegments(cleaned);
  const normalizedTicker = normalizedParts.join('.');
  if (ETORO_YAHOO_MAP[normalizedTicker]) {
    return ETORO_YAHOO_MAP[normalizedTicker]!;
  }

  const withExchange = applyExchangeSuffix(normalizedParts);
  if (withExchange !== normalizedTicker || normalizedParts.length >= 2) {
    const last = normalizedParts[normalizedParts.length - 1];
    if (last && isKnownExchangeSuffix(last)) {
      return withExchange;
    }
  }

  if (isinTrim.length >= 2) {
    const country = isinTrim.slice(0, 2);
    if (country in ISIN_COUNTRY_TO_YAHOO) {
      const yahooSuffix = ISIN_COUNTRY_TO_YAHOO[country]!;
      const base = normalizedParts.length ? normalizedParts.join('.') : cleaned;
      return yahooSuffix ? `${base}.${yahooSuffix}` : base;
    }
  }

  const explicit = EXPLICIT_YAHOO_MAP[cleaned] ?? EXPLICIT_YAHOO_MAP[normalizedTicker];
  if (explicit) return explicit;

  return normalizedParts.length ? applyExchangeSuffix(normalizedParts) : cleaned;
}

/** Yahoo pence kódy — dělení /100 jen pro tyto (NIKDY podle .L suffixu tickeru). */
export function isYahooPenceCurrency(currencyRaw: string | null | undefined): boolean {
  const c = String(currencyRaw ?? '').trim();
  return c === 'GBp' || /^GBX$/i.test(c);
}

/**
 * Normalizuje Yahoo cenu podle meta.currency z API odpovědi.
 * GBp/GBX → /100 → GBP major. USD/EUR/GBP/… beze změny.
 * Pozor: toUpperCase('GBp') === 'GBP' — proto kontrola před uppercasing.
 */
export function normalizeYahooPrice(price: number, currencyRaw: string | null | undefined): {
  price: number;
  currency: string;
  rawCurrency: string;
  dividedBy100: boolean;
} {
  const rawCurrency = String(currencyRaw ?? 'USD').trim();
  if (isYahooPenceCurrency(rawCurrency)) {
    return {
      price: price / 100,
      currency: 'GBP',
      rawCurrency,
      dividedBy100: true,
    };
  }
  return {
    price,
    currency: rawCurrency.toUpperCase() || 'USD',
    rawCurrency,
    dividedBy100: false,
  };
}

export type YahooQuote = {
  /** Cena v major jednotkách (GBp už /100). */
  price: number;
  currency: string;
  yahooSymbol: string;
};

async function fetchChartMeta(
  symbol: string,
  opLabel: string,
  attempt = 0,
): Promise<{
  price: number;
  currency: string;
  rawPrice: number;
  rawCurrency: string;
  dividedBy100: boolean;
} | null> {
  await sleepWithJitter();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_FETCH_TIMEOUT_MS);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      const canRetry =
        attempt < YAHOO_RETRY_BACKOFF_MS.length && (res.status === 400 || res.status === 429);
      if (res.status === 429) {
        yahooLast429At = Date.now();
        yahooBatchDelayMs = Math.min(yahooBatchDelayMs * 2, 5000);
        console.warn(`[${opLabel}] HTTP 429 — batch delay → ${yahooBatchDelayMs}ms`);
      }
      if (canRetry) {
        const backoff = YAHOO_RETRY_BACKOFF_MS[attempt]!;
        console.warn(
          `[${opLabel}] HTTP ${res.status} pro symbol ${symbol} — retry ${attempt + 1}/${YAHOO_RETRY_BACKOFF_MS.length} za ${backoff}ms`,
        );
        clearTimeout(timeout);
        await sleepWithJitter(backoff);
        return fetchChartMeta(symbol, opLabel, attempt + 1);
      }
      console.warn(`[${opLabel}] HTTP ${res.status} pro symbol ${symbol}`);
      return null;
    }
    // Úspěch po 429 — pomalu vrať delay k defaultu.
    if (yahooBatchDelayMs > YAHOO_BATCH_DELAY_MS && Date.now() - yahooLast429At > 30_000) {
      yahooBatchDelayMs = YAHOO_BATCH_DELAY_MS;
    }
    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; currency?: string };
        }[];
      };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    const rawPrice = meta?.regularMarketPrice;
    if (rawPrice == null || !Number.isFinite(rawPrice)) {
      console.warn(`[${opLabel}] prázdná cena pro symbol`, symbol);
      return null;
    }
    const normalized = normalizeYahooPrice(rawPrice, meta?.currency);
    return {
      price: normalized.price,
      currency: normalized.currency,
      rawPrice,
      rawCurrency: normalized.rawCurrency,
      dividedBy100: normalized.dividedBy100,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const canRetry = attempt < YAHOO_RETRY_BACKOFF_MS.length;
    if (canRetry) {
      const backoff = YAHOO_RETRY_BACKOFF_MS[attempt]!;
      console.warn(
        `[${opLabel}] ${isAbort ? 'timeout' : 'chyba'} pro symbol ${symbol} — retry ${attempt + 1}/${YAHOO_RETRY_BACKOFF_MS.length} za ${backoff}ms`,
      );
      clearTimeout(timeout);
      await sleepWithJitter(backoff);
      return fetchChartMeta(symbol, opLabel, attempt + 1);
    }
    if (isAbort) {
      console.warn(`[${opLabel}] timeout pro symbol`, symbol);
    } else {
      console.warn(`[${opLabel}] selhalo pro symbol`, symbol, err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Načte cenu z Yahoo po přemapování broker tickeru (+ volitelně ISIN pro T212). */
export async function fetchYahooQuote(
  ticker: string,
  isin?: string | null,
): Promise<YahooQuote | null> {
  const yahooSymbol = toYahooSymbol(ticker, isin);
  return fetchYahooQuoteLive(ticker, isin, yahooSymbol);
}

/** Kurz quoteCurrency → targetCurrency přes Yahoo FX (1 quote = ? target). */
export async function fetchFxRateBetween(from: string, to: string): Promise<number | null> {
  return fetchFxRate(from, to);
}

export const DISPLAY_FX_CURRENCIES = ['CZK', 'EUR', 'USD'] as const;

/** Synchronní kurz z cache (fresh, pak stale, pak session ČNB). Pro okamžitý přepočet UI bez fetch. */
export function getCachedFxRate(from: string, to: string): number | null {
  let a = from.trim().toUpperCase();
  let b = to.trim().toUpperCase();
  if (a === 'GBX' || isYahooPenceCurrency(from)) a = 'GBP';
  if (b === 'GBX' || isYahooPenceCurrency(to)) b = 'GBP';
  if (a === b) return 1;
  const yahoo = getFreshFxCache(a, b) ?? getStaleFxCache(a, b);
  if (yahoo != null && yahoo > 0) return yahoo;
  const viaCnb = convertViaSessionCnb(1, a, b);
  if (viaCnb != null && viaCnb > 0) {
    setFxCache(a, b, viaCnb);
    return viaCnb;
  }
  return null;
}

/** Přednačte kurzy mezi zobrazovacími měnami (TTL cache). */
export async function prefetchDisplayFxRates(
  currencies: readonly string[] = DISPLAY_FX_CURRENCIES,
): Promise<void> {
  const uniq = [...new Set(currencies.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  await Promise.all(
    uniq.flatMap((from) =>
      uniq.filter((to) => to !== from).map((to) => fetchFxRate(from, to)),
    ),
  );
}

/** Přednačte kurzy z měn kotací (GBP, …) do zobrazovacích měn. */
export async function prefetchFxRatesFromQuoteCurrencies(
  quoteCurrencies: Iterable<string>,
  displayCurrencies: readonly string[] = DISPLAY_FX_CURRENCIES,
): Promise<void> {
  const quotes = [...new Set([...quoteCurrencies].map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const displays = [...new Set(displayCurrencies.map((c) => c.trim().toUpperCase()))];
  await Promise.all(
    quotes.flatMap((from) =>
      displays.filter((to) => to !== from).map((to) => fetchFxRate(from, to)),
    ),
  );
}

export type YahooNativeQuote = {
  price: number;
  currency: string;
};

const NATIVE_PRICE_TARGET = '__NATIVE__';
const inFlightNativePrices = new Map<string, Promise<YahooNativeQuote | null>>();

function nativePriceCacheKey(ticker: string, isin: string | null | undefined): string {
  return priceCacheKey(ticker, isin, NATIVE_PRICE_TARGET);
}

function nativeQuoteFromCacheEntry(entry: PriceCacheEntry): YahooNativeQuote | null {
  if (entry.rawYahooPrice == null || !entry.rawYahooCurrency) return null;
  const normalized = normalizeYahooPrice(entry.rawYahooPrice, entry.rawYahooCurrency);
  return { price: normalized.price, currency: normalized.currency };
}

function findCachedNativeQuote(ticker: string, isin?: string | null): YahooNativeQuote | null {
  const prefix = `${ticker.trim().toUpperCase()}|${(isin ?? '').trim().toUpperCase()}|`;
  for (const [key, entry] of priceMemoryCache) {
    if (!key.startsWith(prefix)) continue;
    const quote = nativeQuoteFromCacheEntry(entry);
    if (quote) return quote;
  }
  for (const [key, entry] of Object.entries(storagePriceCache)) {
    if (!key.startsWith(prefix)) continue;
    const quote = nativeQuoteFromCacheEntry(entry);
    if (quote) return quote;
  }
  return null;
}

/** Cena v nativní měně kotace (bez přepočtu na display měnu). */
export async function fetchYahooNativePrice(
  ticker: string,
  isin?: string | null,
): Promise<YahooNativeQuote | null> {
  await hydratePriceStorageCache();
  const key = nativePriceCacheKey(ticker, isin);

  const fresh = getFreshPriceCache(key);
  if (fresh) {
    const quote = nativeQuoteFromCacheEntry(fresh);
    if (quote) return quote;
  }

  const fromAny = findCachedNativeQuote(ticker, isin);
  if (fromAny) return fromAny;

  const stale = getStalePriceCache(key);
  if (stale) {
    const quote = nativeQuoteFromCacheEntry(stale);
    if (quote) return quote;
  }

  const inFlight = inFlightNativePrices.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const yahooSymbol = toYahooSymbol(ticker, isin);
    const quote = await fetchYahooQuoteLive(ticker, isin, yahooSymbol);
    if (!quote) return null;
    setPriceCache(key, {
      price: quote.price,
      targetCurrency: quote.currency,
      yahooSymbol: quote.yahooSymbol,
      rawYahooPrice: quote.rawPrice,
      rawYahooCurrency: quote.rawCurrency,
      fetchedAt: Date.now(),
    });
    return { price: quote.price, currency: quote.currency };
  })();

  inFlightNativePrices.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightNativePrices.delete(key);
  }
}

/** Přepočet částky z měny transakce — jen podle original_currency, ne podle tickeru. */
export function normalizeTransactionMoney(
  amount: number,
  currencyRaw: string,
): { amount: number; currency: string } {
  const raw = currencyRaw.trim();
  if (isYahooPenceCurrency(raw)) {
    return { amount: amount / 100, currency: 'GBP' };
  }
  return { amount, currency: raw.toUpperCase() || 'USD' };
}

export async function convertAmountBetweenCurrencies(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  const { amount: majorAmount, currency: from } = normalizeTransactionMoney(amount, fromCurrency);
  const to = toCurrency.trim().toUpperCase() || 'USD';
  if (from === to) return majorAmount;
  const rate = await fetchFxRate(from, to);
  if (rate == null || !(rate > 0)) return null;
  return Math.round(majorAmount * rate * 1e6) / 1e6;
}

async function fetchFxRate(from: string, to: string): Promise<number | null> {
  let a = from.toUpperCase();
  let b = to.toUpperCase();
  if (a === 'GBX' || isYahooPenceCurrency(from)) a = 'GBP';
  if (b === 'GBX' || isYahooPenceCurrency(to)) b = 'GBP';
  if (a === b) return 1;

  await hydratePriceStorageCache();

  const fresh = getFreshFxCache(a, b);
  if (fresh != null) return fresh;

  // Yahoo FX páry (EURUSD=X, GBPEUR=X, …). HKD/DKK/SEK/NOK/JPY často 404 → ČNB.
  const directSym = `${a}${b}=X`;
  const direct = await fetchChartMeta(directSym, `Yahoo FX ${a}→${b}`);
  if (direct && direct.price > 0) {
    setFxCache(a, b, direct.price);
    return direct.price;
  }
  const inverseSym = `${b}${a}=X`;
  const inverse = await fetchChartMeta(inverseSym, `Yahoo FX ${b}→${a} (inverse)`);
  if (inverse && inverse.price > 0) {
    const rate = 1 / inverse.price;
    setFxCache(a, b, rate);
    return rate;
  }

  const viaCnb = await fetchFxRateViaCnb(a, b);
  if (viaCnb != null && viaCnb > 0) {
    setFxCache(a, b, viaCnb);
    return viaCnb;
  }

  const stale = getStaleFxCache(a, b);
  if (stale != null) {
    console.warn(`[Yahoo FX] stale cache ${a}→${b}`);
    return stale;
  }
  return null;
}

/** Live FX přes ČNB (dnes ± lookback) — HKD a další měny bez spolehlivého Yahoo páru. */
async function fetchFxRateViaCnb(from: string, to: string): Promise<number | null> {
  try {
    const { ensureExchangeRatesSoft, convertBetweenCurrenciesOnDate } = await import(
      '@/lib/cnb-exchange-rates'
    );
    const today = new Date().toISOString().slice(0, 10);
    const pairs = [];
    if (from !== 'CZK') pairs.push({ date: today, currency: from });
    if (to !== 'CZK') pairs.push({ date: today, currency: to });
    const rates = await ensureExchangeRatesSoft(pairs);
    return convertBetweenCurrenciesOnDate(1, from, to, today, rates);
  } catch (e) {
    console.warn(`[FX ČNB] ${from}→${to} selhalo`, e);
    return null;
  }
}

async function fetchYahooPriceInCurrencyLive(
  ticker: string,
  targetCurrency: string,
  isin?: string | null,
): Promise<{
  price: number | null;
  yahooSymbol: string;
  rawPrice: number;
  rawCurrency: string;
  dividedBy100: boolean;
}> {
  const yahooSymbol = toYahooSymbol(ticker, isin);
  try {
    const quote = await fetchYahooQuoteLive(ticker, isin, yahooSymbol);
    if (!quote) {
      return { price: null, yahooSymbol, rawPrice: 0, rawCurrency: 'USD', dividedBy100: false };
    }
    const target = targetCurrency.trim().toUpperCase() || 'EUR';
    if (quote.currency === target) {
      return {
        price: quote.price,
        yahooSymbol,
        rawPrice: quote.rawPrice,
        rawCurrency: quote.rawCurrency,
        dividedBy100: quote.dividedBy100,
      };
    }
    const rate = await fetchFxRate(quote.currency, target);
    if (rate == null || !(rate > 0)) {
      console.warn(
        '[Yahoo FX] chybí kurz',
        `${quote.currency}→${target}`,
        'ticker=',
        ticker,
        'yahooSymbol=',
        yahooSymbol,
      );
      return { price: null, yahooSymbol, rawPrice: quote.rawPrice, rawCurrency: quote.rawCurrency, dividedBy100: quote.dividedBy100 };
    }
    const finalPrice = Math.round(quote.price * rate * 1e6) / 1e6;
    if (target !== 'USD' || /\.L$/i.test(ticker)) {
      if (__DEV__) {
        console.log('[Yahoo price debug]', {
          ticker,
          yahooSymbol,
          metaCurrency: quote.rawCurrency,
          rawPrice: quote.rawPrice,
          dividedBy100: quote.dividedBy100,
          normalizedPrice: quote.price,
          normalizedCurrency: quote.currency,
          targetCurrency: target,
          finalPrice,
        });
      }
    }
    return {
      price: finalPrice,
      yahooSymbol,
      rawPrice: quote.rawPrice,
      rawCurrency: quote.rawCurrency,
      dividedBy100: quote.dividedBy100,
    };
  } catch (err) {
    console.warn(
      '[Yahoo cena+FX] selhalo pro ticker',
      ticker,
      'target=',
      targetCurrency,
      err,
    );
    return { price: null, yahooSymbol, rawPrice: 0, rawCurrency: 'USD', dividedBy100: false };
  }
}

async function fetchYahooQuoteLive(
  ticker: string,
  isin: string | null | undefined,
  yahooSymbol: string,
): Promise<(YahooQuote & { rawPrice: number; rawCurrency: string; dividedBy100: boolean }) | null> {
  const meta = await fetchChartMeta(yahooSymbol, 'Yahoo cena');
  if (!meta) return null;
  const upper = ticker.toUpperCase();
  if ((upper === 'WBD' || yahooSymbol === 'WBD') && meta.price > 50) return null;

  if (meta.rawCurrency !== 'USD' || /\.L$/i.test(ticker) || ticker.toUpperCase() === 'SMSN.L') {
    if (__DEV__) {
      console.log('[Yahoo price debug]', {
        ticker,
        yahooSymbol,
        metaCurrency: meta.rawCurrency,
        rawPrice: meta.rawPrice,
        dividedBy100: meta.dividedBy100,
        normalizedPrice: meta.price,
        normalizedCurrency: meta.currency,
      });
    }
  }

  return {
    price: meta.price,
    currency: meta.currency,
    yahooSymbol,
    rawPrice: meta.rawPrice,
    rawCurrency: meta.rawCurrency,
    dividedBy100: meta.dividedBy100,
  };
}

/**
 * Cena tickeru přepočtená do targetCurrency (měna brokerského účtu).
 * GBp → GBP automaticky; GBP/USD → EUR přes FX.
 * Cache v paměti + AsyncStorage (TTL 15 min), stale fallback po selhání fetch.
 */
export async function fetchYahooPriceInCurrency(
  ticker: string,
  targetCurrency: string,
  isin?: string | null,
): Promise<number | null> {
  const target = targetCurrency.trim().toUpperCase() || 'EUR';
  const key = priceCacheKey(ticker, isin, target);

  await hydratePriceStorageCache();

  const fresh = getFreshPriceCache(key);
  if (fresh) return fresh.price;

  const inFlight = inFlightPrices.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const live = await fetchYahooPriceInCurrencyLive(ticker, target, isin);
    if (live.price != null) {
      setPriceCache(key, {
        price: live.price,
        targetCurrency: target,
        yahooSymbol: live.yahooSymbol,
        rawYahooPrice: live.rawPrice,
        rawYahooCurrency: live.rawCurrency,
        fetchedAt: Date.now(),
      });
      return live.price;
    }

    const stale = getStalePriceCache(key);
    if (stale) {
      console.warn(
        '[Yahoo cena] stale cache pro',
        ticker,
        `(${Math.round((Date.now() - stale.fetchedAt) / 60000)} min)`,
      );
      return stale.price;
    }
    return null;
  })();

  inFlightPrices.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightPrices.delete(key);
  }
}

/** Dávkové načtení cen s nízkým paralelismem, prodlevou mezi dávkami a cache. */
export async function fetchYahooPricesInBatches(
  items: { ticker: string; isin: string | null }[],
  displayCurrency: string,
  options?: {
    batchSize?: number;
    batchDelayMs?: number;
    onBatch?: (priceByTicker: Map<string, number | null>) => void;
  },
): Promise<{ priceByTicker: Map<string, number | null>; hadErrors: boolean }> {
  await hydratePriceStorageCache();

  const batchSize = options?.batchSize ?? YAHOO_PRICE_BATCH_SIZE;
  const batchDelayMs = options?.batchDelayMs ?? YAHOO_BATCH_DELAY_MS;
  const priceByTicker = new Map<string, number | null>();
  let hadErrors = false;

  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0) {
      await sleepWithJitter(batchDelayMs);
    }

    const batch = items.slice(i, i + batchSize);
    const entries = await Promise.all(
      batch.map(async (item) => {
        try {
          const price = await fetchYahooPriceInCurrency(item.ticker, displayCurrency, item.isin);
          return { ticker: item.ticker, price };
        } catch {
          return { ticker: item.ticker, price: null as number | null };
        }
      }),
    );

    for (const entry of entries) {
      priceByTicker.set(entry.ticker, entry.price);
      if (entry.price == null) hadErrors = true;
    }
    options?.onBatch?.(new Map(priceByTicker));
  }

  await flushPriceStorageCache();
  return { priceByTicker, hadErrors };
}

/** Dávkové načtení nativních kotací (bez FX) — jednou pro všechny display měny. */
export async function fetchYahooNativePricesInBatches(
  items: { ticker: string; isin: string | null }[],
  options?: {
    batchSize?: number;
    batchDelayMs?: number;
    /** Jen paměť/storage cache — bez síťových requestů (první paint). */
    cacheOnly?: boolean;
    onBatch?: (quotes: Map<string, YahooNativeQuote | null>) => void;
  },
): Promise<{ quotesByTicker: Map<string, YahooNativeQuote | null>; hadErrors: boolean }> {
  await hydratePriceStorageCache();

  const batchSize = options?.batchSize ?? YAHOO_PRICE_BATCH_SIZE;
  const batchDelayMs = options?.batchDelayMs ?? yahooBatchDelayMs;
  const cacheOnly = options?.cacheOnly === true;
  const quotesByTicker = new Map<string, YahooNativeQuote | null>();
  let hadErrors = false;

  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0 && !cacheOnly) {
      await sleepWithJitter(options?.batchDelayMs ?? yahooBatchDelayMs);
    }

    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    const batchT0 = globalThis.performance?.now?.() ?? Date.now();
    const entries = await Promise.all(
      batch.map(async (item) => {
        try {
          if (cacheOnly) {
            const cached = peekCachedNativeQuote(item.ticker, item.isin);
            return { ticker: item.ticker, quote: cached };
          }
          const quote = await fetchYahooNativePrice(item.ticker, item.isin);
          return { ticker: item.ticker, quote };
        } catch {
          return { ticker: item.ticker, quote: null as YahooNativeQuote | null };
        }
      }),
    );
    const batchMs = Math.round(((globalThis.performance?.now?.() ?? Date.now()) - batchT0) * 10) / 10;
    if (__DEV__) {
      console.log(
        `[invest-perf] yahoo_batch[${batchIndex}] ${batchMs}ms size=${batch.length} parallel tickers=${batch.map((b) => b.ticker).join(',')}${cacheOnly ? ' cacheOnly' : ''} delayMs=${options?.batchDelayMs ?? yahooBatchDelayMs}`,
      );
    }

    for (const entry of entries) {
      quotesByTicker.set(entry.ticker, entry.quote);
      if (entry.quote == null) hadErrors = true;
    }
    options?.onBatch?.(new Map(quotesByTicker));
  }

  if (!cacheOnly) await flushPriceStorageCache();
  return { quotesByTicker, hadErrors };
}

/** Sync peek do paměťové / storage cache (bez sítě). */
export function peekCachedNativeQuote(
  ticker: string,
  isin?: string | null,
): YahooNativeQuote | null {
  const key = nativePriceCacheKey(ticker, isin);
  const fresh = getFreshPriceCache(key);
  if (fresh) {
    const quote = nativeQuoteFromCacheEntry(fresh);
    if (quote) return quote;
  }
  const fromAny = findCachedNativeQuote(ticker, isin);
  if (fromAny) return fromAny;
  const stale = getStalePriceCache(key);
  if (stale) return nativeQuoteFromCacheEntry(stale);
  return null;
}
