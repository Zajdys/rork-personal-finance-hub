type FxResponse = {
  base: string;
  date: string;
  rates: Record<string, number>;
};

const cache = new Map<string, { at: number; data: FxResponse }>();
const TTL_MS = 1000 * 60 * 60 * 12;

export async function getFxRates(baseCcy: string): Promise<FxResponse> {
  const base = (baseCcy || 'USD').toUpperCase();
  const now = Date.now();
  const cached = cache.get(base);
  if (cached && now - cached.at < TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}`;
    console.log('[FX] Fetching', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { base: string; date: string; rates: Record<string, number> };
    const data: FxResponse = {
      base: json.base?.toUpperCase?.() || base,
      date: json.date || new Date().toISOString().slice(0, 10),
      rates: Object.fromEntries(
        Object.entries(json.rates || {}).map(([k, v]) => [k.toUpperCase(), typeof v === 'number' ? v : Number(v)])
      ),
    };
    data.rates[data.base] = 1;
    cache.set(base, { at: now, data });
    return data;
  } catch (e) {
    console.error('[FX] Failed to fetch rates, falling back to identity', e);
    const fallback: FxResponse = { base, date: new Date().toISOString().slice(0, 10), rates: { [base]: 1 } };
    cache.set(base, { at: now, data: fallback });
    return fallback;
  }
}

export function convert(amount: number, fromCcy: string, toCcy: string, rates: FxResponse): number {
  const from = (fromCcy || rates.base).toUpperCase();
  const to = (toCcy || rates.base).toUpperCase();
  if (from === to) return amount;
  if (to === rates.base) {
    const r = rates.rates[from];
    return r && r > 0 ? amount / r : amount;
  }
  // convert via base
  const toBase = from === rates.base ? amount : (rates.rates[from] ? amount / rates.rates[from] : amount);
  const rTo = rates.rates[to];
  return rTo && rTo > 0 ? toBase * rTo : toBase;
}
