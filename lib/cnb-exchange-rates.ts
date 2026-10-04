/**
 * Kurzy ČNB (devizový trh) — cache v `exchange_rates`, dotažení přes Edge `fetch-exchange-rates`.
 *
 * CZK = originalAmount * (rate / amount)  = originalAmount * perUnit
 * transaction.exchange_rate ukládá perUnit (CZK za 1 jednotku cizí měny).
 *
 * Lookback max 7 dní (víkendy/svátky). Starší mezera → vždy dotažení z ČNB.
 */
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { httpError, withNetworkRetry } from '@/lib/with-network-retry';

export type FxPair = { date: string; currency: string };

export type ResolvedFxRate = {
  /** Požadované datum transakce (YYYY-MM-DD) */
  requestedDate: string;
  /** Datum kurzu z ČNB (pracovní den) */
  date: string;
  currency: string;
  /** Raw ČNB kurz za `amount` jednotek */
  rate: number;
  amount: number;
  /** CZK za 1 jednotku měny */
  perUnit: number;
};

/** Max. stáří kurzu vůči požadovanému dni (víkendy + svátky). */
export const MAX_RATE_LOOKBACK_DAYS = 7;

const FETCH_URL = `${supabaseUrl}/functions/v1/fetch-exchange-rates`;

function normCurrency(c: string): string {
  return String(c ?? '')
    .trim()
    .toUpperCase();
}

function isCzk(c: string | null | undefined): boolean {
  const n = normCurrency(c ?? 'CZK');
  return !n || n === 'CZK';
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Celé dny mezi dvěma YYYY-MM-DD (a − b). */
export function daysBetweenYmd(later: string, earlier: string): number {
  const [y1, m1, d1] = later.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = earlier.slice(0, 10).split('-').map(Number);
  const t1 = Date.UTC(y1!, m1! - 1, d1!);
  const t2 = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((t1 - t2) / 86_400_000);
}

function cleanPairs(pairs: FxPair[]): FxPair[] {
  const seen = new Set<string>();
  const out: FxPair[] = [];
  for (const p of pairs) {
    const date = String(p.date).slice(0, 10);
    const currency = normCurrency(p.currency);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !currency || currency === 'CZK') continue;
    // Krypto není na ČNB lístku — nezatěžuj ensure / edge.
    if (currency === 'BTC' || currency === 'ETH' || currency === 'USDT' || currency === 'USDC') {
      continue;
    }
    const key = `${date}|${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, currency });
  }
  return out;
}

/** Session cache: po úspěšném ensure znovu nechodíme do DB/edge pro stejné páry. */
const sessionRates = new Map<string, ResolvedFxRate>();
const sessionEnsuredOk = new Set<string>();
/** Chybí i po Edge — jen pro informaci; NIKDY neblokuje další ensure (nová měna). */
const sessionKnownMissing = new Set<string>();

function sessionKey(p: FxPair): string {
  return `${p.date}|${p.currency}`;
}

function mergeSessionRates(
  cleaned: FxPair[],
  map: Map<string, ResolvedFxRate>,
): Map<string, ResolvedFxRate> {
  for (const p of cleaned) {
    const k = sessionKey(p);
    const hit = map.get(k) ?? sessionRates.get(k);
    if (hit) {
      map.set(k, hit);
      sessionRates.set(k, hit);
      sessionEnsuredOk.add(k);
    }
  }
  return map;
}

/** Sync lookup z session cache (po ensure) — pro live display FX bez Yahoo. */
export function getSessionCnbRate(
  date: string,
  currency: string,
): ResolvedFxRate | null {
  const ccy = normCurrency(currency);
  if (!ccy || ccy === 'CZK') return null;
  const ymd = date.slice(0, 10);
  const direct = sessionRates.get(`${ymd}|${ccy}`);
  if (direct) return direct;
  // Lookback v session (víkend)
  for (let i = 1; i <= MAX_RATE_LOOKBACK_DAYS; i++) {
    const d = addDaysYmd(ymd, -i);
    const hit = sessionRates.get(`${d}|${ccy}`);
    if (hit) {
      const resolved = toResolved(ymd, hit);
      if (resolved) return resolved;
    }
  }
  return null;
}

/** Sync přepočet přes session ČNB kurzy (dnes / lookback). */
export function convertViaSessionCnb(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date?: string,
): number | null {
  const ymd = (date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const from = normCurrency(fromCurrency);
  const to = normCurrency(toCurrency);
  if (!from || !to) return null;
  if (from === to) return amount;

  // Sestav mini-mapu z session pro convertBetweenCurrenciesOnDate
  const rates = new Map<string, ResolvedFxRate>();
  for (const ccy of [from, to]) {
    if (ccy === 'CZK') continue;
    const hit = getSessionCnbRate(ymd, ccy);
    if (hit) rates.set(`${ymd}|${ccy}`, hit);
  }
  return convertBetweenCurrenciesOnDate(amount, from, to, ymd, rates);
}

/** Zaokrouhlení na 2 desetinná místa (haléře). */
export function roundCzk(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Přepočet cizí částky → CZK (celočíselná aritmetika v haléřích, bez float driftu).
 * `perUnit` = CZK za 1 jednotku (už po dělení ČNB množstvím).
 */
export function convertToCzk(originalAmount: number, perUnit: number): number {
  const origCents = Math.round(Math.abs(originalAmount) * 100);
  // Kurz na 6 desetinných míst (JPY ~0.135830)
  const rateE6 = Math.round(perUnit * 1_000_000);
  const czkCents = Math.round((origCents * rateE6) / 1_000_000);
  return czkCents / 100;
}

function toResolved(
  requestedDate: string,
  row: { date: string; currency: string; rate: number; amount: number },
): ResolvedFxRate | null {
  const rateDate = String(row.date).slice(0, 10);
  const gap = daysBetweenYmd(requestedDate, rateDate);
  if (gap < 0 || gap > MAX_RATE_LOOKBACK_DAYS) return null;
  const rate = Number(row.rate);
  const amount = Number(row.amount) || 1;
  if (!(rate > 0) || !(amount > 0)) return null;
  return {
    requestedDate,
    date: rateDate,
    currency: normCurrency(row.currency),
    rate,
    amount,
    perUnit: rate / amount,
  };
}

/**
 * Pro každý pár najde v DB kurz k datu nebo max 7 dní zpět.
 * Páry bez platného kurzu → missing.
 */
export async function findMissingExchangeRatePairs(
  pairs: FxPair[],
): Promise<{ present: Map<string, ResolvedFxRate>; missing: FxPair[] }> {
  const cleaned = cleanPairs(pairs);
  const present = new Map<string, ResolvedFxRate>();
  const missing: FxPair[] = [];
  if (cleaned.length === 0) return { present, missing };

  const lookbackDates = new Set<string>();
  for (const p of cleaned) {
    lookbackDates.add(p.date);
    for (let i = 1; i <= MAX_RATE_LOOKBACK_DAYS; i++) {
      lookbackDates.add(addDaysYmd(p.date, -i));
    }
  }
  const currencies = [...new Set(cleaned.map((p) => p.currency))];

  const { data, error } = await supabase
    .from('exchange_rates')
    .select('date, currency, rate, amount')
    .in('date', [...lookbackDates])
    .in('currency', currencies);

  if (error) {
    console.warn('[cnb] findMissingExchangeRatePairs select failed', error.message);
    return { present, missing: cleaned };
  }

  const byCcy = new Map<string, { date: string; currency: string; rate: number; amount: number }[]>();
  for (const r of data ?? []) {
    const c = normCurrency(String(r.currency));
    const list = byCcy.get(c) ?? [];
    list.push({
      date: String(r.date).slice(0, 10),
      currency: c,
      rate: Number(r.rate),
      amount: Number(r.amount) || 1,
    });
    byCcy.set(c, list);
  }
  for (const list of byCcy.values()) {
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  for (const p of cleaned) {
    const key = `${p.date}|${p.currency}`;
    const list = byCcy.get(p.currency) ?? [];
    const hit = list.find((r) => r.date <= p.date);
    const resolved = hit ? toResolved(p.date, hit) : null;
    if (resolved) present.set(key, resolved);
    else missing.push(p);
  }

  return { present, missing };
}

async function callFetchExchangeRates(
  dates: string[],
  currencies: string[],
): Promise<{ rates: ResolvedFxRate[]; missing: FxPair[] }> {
  if (dates.length === 0) return { rates: [], missing: [] };

  const data = await withNetworkRetry(async () => {
    const res = await fetch(FETCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ dates, currencies }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      rates?: Array<ResolvedFxRate & { requestedDate?: string }>;
      missing?: FxPair[];
    };
    if (!res.ok) {
      throw httpError(json.error || `HTTP ${res.status}`, res.status);
    }
    return json;
  });

  const rates: ResolvedFxRate[] = [];
  for (const r of data.rates ?? []) {
    const requestedDate = String(r.requestedDate ?? r.date).slice(0, 10);
    const resolved = toResolved(requestedDate, {
      date: String(r.date).slice(0, 10),
      currency: normCurrency(r.currency),
      rate: Number(r.rate),
      amount: Number(r.amount) || 1,
    });
    if (resolved) {
      rates.push(resolved);
    } else {
      console.warn(
        `[cnb] edge vrátil kurz mimo ${MAX_RATE_LOOKBACK_DAYS} dní: ` +
          `${r.currency} requested=${requestedDate} rateDate=${r.date}`,
      );
    }
  }

  return {
    rates,
    missing: (data.missing ?? []).map((m) => ({
      date: String(m.date).slice(0, 10),
      currency: normCurrency(m.currency),
    })),
  };
}

/**
 * Interní: doplní chybějící kurzy hromadně. Vrátí mapu + stále chybějící páry.
 * `dbOnly` = jen jeden SELECT, bez Edge (první paint).
 */
async function fillExchangeRates(
  pairs: FxPair[],
  options?: { dbOnly?: boolean },
): Promise<{ rates: Map<string, ResolvedFxRate>; missing: FxPair[] }> {
  const cleaned = cleanPairs(pairs);
  const map = new Map<string, ResolvedFxRate>();
  if (cleaned.length === 0) return { rates: map, missing: [] };

  const needDb: FxPair[] = [];
  for (const p of cleaned) {
    const k = sessionKey(p);
    const cached = sessionRates.get(k);
    if (cached) {
      map.set(k, cached);
      continue;
    }
    // sessionKnownMissing NIKDY neblokuje — nová měna / po redeploy musí jít znovu do DB/Edge.
    needDb.push(p);
  }

  if (needDb.length === 0) {
    if (__DEV__) console.log(`[invest-perf] cnb_session_hit pairs=${cleaned.length} (0 DB)`);
    return { rates: map, missing: cleaned.filter((p) => !map.has(sessionKey(p))) };
  }

  const { present, missing: initiallyMissing } = await findMissingExchangeRatePairs(needDb);
  for (const [k, v] of present) {
    map.set(k, v);
    sessionRates.set(k, v);
    sessionEnsuredOk.add(k);
    sessionKnownMissing.delete(k);
  }

  if (initiallyMissing.length === 0 || options?.dbOnly) {
    // dbOnly: neukládej do knownMissing — jinak by ensure fáze mohla vypadat „hotovo“.
    if (!options?.dbOnly) {
      for (const p of initiallyMissing) sessionKnownMissing.add(sessionKey(p));
    }
    mergeSessionRates(cleaned, map);
    return {
      rates: map,
      missing: cleaned.filter((p) => !map.has(sessionKey(p))),
    };
  }

  const dates = [...new Set(initiallyMissing.map((p) => p.date))];
  const currencies = [...new Set(initiallyMissing.map((p) => p.currency))];
  if (__DEV__) {
    console.log(
      `[cnb] doplňuji ${initiallyMissing.length} chybějících kurzů ` +
        `(${dates.length} dní, ${currencies.join(',')}) přes fetch-exchange-rates`,
    );
    console.log(
      `[invest-perf] cnb_fetch_needed pairs=${initiallyMissing.length} dates=${dates.length} currencies=${currencies.join(',')}`,
    );
  }

  try {
    const { rates } = await callFetchExchangeRates(dates, currencies);
    for (const r of rates) {
      const k = `${r.requestedDate}|${r.currency}`;
      map.set(k, r);
      sessionRates.set(k, r);
      sessionEnsuredOk.add(k);
      sessionKnownMissing.delete(k);
    }
  } catch (err) {
    console.warn('[cnb] fetch-exchange-rates selhalo', err);
  }

  const stillNeeded = cleaned.filter((p) => !map.has(`${p.date}|${p.currency}`));
  if (stillNeeded.length > 0) {
    const again = await findMissingExchangeRatePairs(stillNeeded);
    for (const [k, v] of again.present) {
      map.set(k, v);
      sessionRates.set(k, v);
      sessionEnsuredOk.add(k);
      sessionKnownMissing.delete(k);
    }
    for (const p of again.missing) sessionKnownMissing.add(sessionKey(p));
    return { rates: map, missing: again.missing };
  }

  return { rates: map, missing: [] };
}

/**
 * Dotáhne chybějící kurzy hromadně přes Edge a vrátí mapu `date|CURRENCY` → ResolvedFxRate.
 * Lookback max 7 dní. Při stále chybějících kurzech vyhodí (import).
 */
export async function ensureExchangeRates(
  pairs: FxPair[],
): Promise<Map<string, ResolvedFxRate>> {
  const cleaned = cleanPairs(pairs);
  if (cleaned.length === 0) return new Map();

  const { rates, missing } = await fillExchangeRates(cleaned);
  if (missing.length > 0) {
    const sample = missing
      .slice(0, 3)
      .map((m) => `${m.currency} @ ${m.date}`)
      .join(', ');
    throw new Error(
      `Nepodařilo se získat kurz ČNB (${sample}${missing.length > 3 ? '…' : ''}). ` +
        `Import přerušen — cizí částka se do CZK neuloží.`,
    );
  }
  return rates;
}

/**
 * Soft varianta pro portfolio calc — nevyhodí.
 * `dbOnly: true` — jen DB (bez Edge), pro první paint; Edge nech na pozadí.
 */
export async function ensureExchangeRatesSoft(
  pairs: FxPair[],
  options?: { dbOnly?: boolean },
): Promise<Map<string, ResolvedFxRate>> {
  const cleaned = cleanPairs(pairs);
  if (cleaned.length === 0) return new Map();

  const { rates, missing } = await fillExchangeRates(cleaned, options);
  for (const p of missing) {
    console.warn(
      `[cnb] chybí kurz ${p.currency} @ ${p.date} ` +
        `(lookback ≤${MAX_RATE_LOOKBACK_DAYS} dní) — nelze doplnit z ČNB`,
    );
  }
  return rates;
}

/**
 * Lokální lookup z tabulky (bez Edge) — fallback / offline test.
 * Jen do MAX_RATE_LOOKBACK_DAYS zpět (víkendy/svátky).
 */
export async function lookupCachedRate(
  date: string,
  currency: string,
): Promise<ResolvedFxRate | null> {
  const ccy = normCurrency(currency);
  if (isCzk(ccy)) return null;
  const ymd = date.slice(0, 10);

  const dates: string[] = [ymd];
  for (let i = 1; i <= MAX_RATE_LOOKBACK_DAYS; i++) {
    dates.push(addDaysYmd(ymd, -i));
  }

  const { data, error } = await supabase
    .from('exchange_rates')
    .select('date, currency, rate, amount')
    .eq('currency', ccy)
    .in('date', dates)
    .order('date', { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  return toResolved(ymd, {
    date: String(data[0]!.date).slice(0, 10),
    currency: ccy,
    rate: Number(data[0]!.rate),
    amount: Number(data[0]!.amount) || 1,
  });
}

export type ForeignAmountInput = {
  /** Absolutní částka v cizí měně */
  originalAmount: number;
  originalCurrency: string;
  /** YYYY-MM-DD — den kurzu (typicky datum transakce) */
  date: string;
};

export type ConvertedForeignAmount = {
  /** CZK (absolutní) */
  amountCzk: number;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number;
  rateDate: string;
};

/** Jedna transakce → CZK; při chybě kurzu vyhodí. */
export async function convertForeignAmount(
  input: ForeignAmountInput,
): Promise<ConvertedForeignAmount> {
  const ccy = normCurrency(input.originalCurrency);
  if (isCzk(ccy)) {
    return {
      amountCzk: roundCzk(Math.abs(input.originalAmount)),
      originalAmount: Math.abs(input.originalAmount),
      originalCurrency: 'CZK',
      exchangeRate: 1,
      rateDate: input.date.slice(0, 10),
    };
  }

  const rates = await ensureExchangeRates([
    { date: input.date.slice(0, 10), currency: ccy },
  ]);
  const hit = rates.get(`${input.date.slice(0, 10)}|${ccy}`);
  if (!hit) {
    throw new Error(
      `Chybí kurz ČNB pro ${ccy} ke dni ${input.date}. Transakci nelze uložit.`,
    );
  }

  return {
    amountCzk: convertToCzk(input.originalAmount, hit.perUnit),
    originalAmount: roundCzk(Math.abs(input.originalAmount)),
    originalCurrency: ccy,
    exchangeRate: hit.perUnit,
    rateDate: hit.date,
  };
}

/**
 * Hromadný přepočet importních řádků s `originalCurrency`.
 * Doplní chybějící kurzy hromadně přes Edge (ne po jednom dni).
 * Při chybě kurzu vyhodí (import se neuloží).
 */
export async function applyFxToImportRows<
  T extends {
    date: string;
    amount: number;
    rawAmount?: number;
    originalAmount?: number | null;
    originalCurrency?: string | null;
    exchangeRate?: number | null;
  },
>(rows: T[]): Promise<T[]> {
  const pairs: FxPair[] = [];
  for (const r of rows) {
    const ccy = normCurrency(r.originalCurrency ?? '');
    if (!ccy || ccy === 'CZK') continue;
    const orig =
      r.originalAmount != null && Number.isFinite(r.originalAmount)
        ? Math.abs(Number(r.originalAmount))
        : Math.abs(r.rawAmount ?? r.amount);
    if (orig < 0.0001) continue;
    pairs.push({ date: r.date.slice(0, 10), currency: ccy });
  }

  if (pairs.length === 0) return rows;

  const rates = await ensureExchangeRates(pairs);

  return rows.map((r) => {
    const ccy = normCurrency(r.originalCurrency ?? '');
    if (!ccy || ccy === 'CZK') {
      return { ...r, originalAmount: null, originalCurrency: null, exchangeRate: null };
    }
    const orig =
      r.originalAmount != null && Number.isFinite(r.originalAmount)
        ? Math.abs(Number(r.originalAmount))
        : Math.abs(r.rawAmount ?? r.amount);
    const hit = rates.get(`${r.date.slice(0, 10)}|${ccy}`);
    if (!hit) {
      throw new Error(
        `Chybí kurz ČNB pro ${ccy} ke dni ${r.date}. Import přerušen.`,
      );
    }
    const amountCzk = convertToCzk(orig, hit.perUnit);
    const signed = (r.rawAmount ?? r.amount) < 0 || r.amount < 0 ? -amountCzk : amountCzk;
    return {
      ...r,
      amount: amountCzk,
      rawAmount: signed,
      originalAmount: roundCzk(orig),
      originalCurrency: ccy,
      exchangeRate: hit.perUnit,
    };
  });
}

/**
 * Přepočet mezi měnami přes CZK kurzem ČNB k danému datu.
 * `rates` = výstup `ensureExchangeRates` (klíč `YYYY-MM-DD|CCY`).
 * Při chybějícím kurzu vrátí null (nevyhodí).
 */
export function convertBetweenCurrenciesOnDate(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string,
  rates: Map<string, ResolvedFxRate>,
): number | null {
  if (!Number.isFinite(amount)) return null;
  const from = normCurrency(fromCurrency);
  const to = normCurrency(toCurrency);
  const dateKey = date.slice(0, 10);
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  if (from === to) return amount;

  const toCzk = (amt: number, ccy: string): number | null => {
    if (ccy === 'CZK') return amt;
    const hit = rates.get(`${dateKey}|${ccy}`);
    if (!hit || !(hit.perUnit > 0)) return null;
    const abs = convertToCzk(amt, hit.perUnit);
    return amt < 0 ? -abs : abs;
  };

  const fromCzk = (czkAmt: number, ccy: string): number | null => {
    if (ccy === 'CZK') return czkAmt;
    const hit = rates.get(`${dateKey}|${ccy}`);
    if (!hit || !(hit.perUnit > 0)) return null;
    const foreign = czkAmt / hit.perUnit;
    return Math.round(foreign * 1e6) / 1e6;
  };

  const czk = toCzk(amount, from);
  if (czk == null) return null;
  return fromCzk(czk, to);
}

export { isCzk as isCzkCurrency, normCurrency as normalizeFxCurrency };
