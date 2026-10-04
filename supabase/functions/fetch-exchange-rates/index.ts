/**
 * Edge: fetch-exchange-rates
 *
 * Stáhne denní kurzy ČNB (devizový trh) a uloží do public.exchange_rates.
 *
 * URL (ověřeno 2026-09):
 *   https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date=DD.MM.RRRR
 *
 * Formát:
 *   1. řádek: "DD.MM.RRRR #seq"  (skutečný den kurzu — u víkendu/svátku předchozí pracovní den)
 *   2. řádek: "země|měna|množství|kód|kurz"
 *   další:    "EMU|euro|1|EUR|24,290"
 *
 * Oddělovač sloupců: | (pipe). Desetinná čárka.
 * Kurz platí pro `množství` jednotek měny → CZK = foreign * (kurz / množství).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CNB_URL =
  "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt";

type RateRow = {
  date: string;
  currency: string;
  rate: number;
  amount: number;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ymdToDmy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

function dmyToYmd(dmy: string): string | null {
  const m = dmy.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

function parseCnbRate(raw: string): number {
  const n = parseFloat(raw.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Parsuje tělo denni_kurz.txt → řádky + skutečné datum kurzu z 1. řádku. */
export function parseCnbDailyText(text: string): { rateDate: string; rows: Omit<RateRow, "date">[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("ČNB: prázdná odpověď");

  const headerDate = lines[0]!.match(/^(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (!headerDate) throw new Error(`ČNB: neočekávaná hlavička „${lines[0]}“`);
  const rateDate = dmyToYmd(headerDate[1]!);
  if (!rateDate) throw new Error(`ČNB: neplatné datum „${headerDate[1]}“`);

  // Hledej řádek s hlavičkou sloupců
  let dataStart = 1;
  for (let i = 1; i < Math.min(5, lines.length); i++) {
    if (/\|/.test(lines[i]!) && /kód|kod/i.test(lines[i]!)) {
      dataStart = i + 1;
      break;
    }
  }

  const rows: Omit<RateRow, "date">[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const parts = lines[i]!.split("|");
    if (parts.length < 5) continue;
    const amount = parseInt(parts[2]!.trim(), 10);
    const currency = parts[3]!.trim().toUpperCase();
    const rate = parseCnbRate(parts[4]!);
    if (!currency || currency.length !== 3) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!Number.isFinite(rate) || rate <= 0) continue;
    rows.push({ currency, rate, amount });
  }

  if (rows.length === 0) throw new Error(`ČNB: žádné kurzy pro ${rateDate}`);
  return { rateDate, rows };
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Max. stáří kurzu vůči požadovanému dni (víkendy + svátky). */
const MAX_RATE_LOOKBACK_DAYS = 7;

function daysBetweenYmd(later: string, earlier: string): number {
  const [y1, m1, d1] = later.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = earlier.slice(0, 10).split("-").map(Number);
  const t1 = Date.UTC(y1!, m1! - 1, d1!);
  const t2 = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((t1 - t2) / 86_400_000);
}

async function fetchCnbForDate(ymd: string): Promise<{ rateDate: string; rows: Omit<RateRow, "date">[] }> {
  const url = `${CNB_URL}?date=${ymdToDmy(ymd)}`;
  const res = await fetch(url, {
    headers: { Accept: "text/plain,*/*", "User-Agent": "MoneyBuddy/1.0 (exchange-rates)" },
  });
  if (!res.ok) {
    throw new Error(`ČNB HTTP ${res.status} pro ${ymd}`);
  }
  const text = await res.text();
  return parseCnbDailyText(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      /** YYYY-MM-DD — dny, pro které chceme kurzy */
      dates?: string[];
      /** Volitelný filtr ISO kódů; prázdné = všechny z ČNB */
      currencies?: string[];
    };

    const dates = Array.isArray(body.dates)
      ? [...new Set(body.dates.map((d) => String(d).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))]
      : [];
    if (dates.length === 0) {
      return jsonResponse({ error: "dates[] required (YYYY-MM-DD)" }, 400);
    }

    const currencyFilter = Array.isArray(body.currencies)
      ? new Set(
          body.currencies
            .map((c) => String(c).trim().toUpperCase())
            .filter((c) => /^[A-Z]{3}$/.test(c) && c !== "CZK"),
        )
      : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Missing Supabase env" }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Co už máme v cache pro požadované dny ± lookback (víkendy/svátky)
    const lookbackDatesForCheck = new Set<string>();
    for (const d of dates) {
      lookbackDatesForCheck.add(d);
      for (let i = 1; i <= MAX_RATE_LOOKBACK_DAYS; i++) {
        lookbackDatesForCheck.add(addDaysYmd(d, -i));
      }
    }

    let existingQ = supabase
      .from("exchange_rates")
      .select("date, currency, rate, amount")
      .in("date", [...lookbackDatesForCheck]);
    if (currencyFilter && currencyFilter.size > 0) {
      existingQ = existingQ.in("currency", [...currencyFilter]);
    }
    const { data: existing, error: selErr } = await existingQ;
    if (selErr) throw new Error(selErr.message);

    const byCcyExisting = new Map<string, RateRow[]>();
    for (const r of existing ?? []) {
      const c = String(r.currency).toUpperCase();
      const list = byCcyExisting.get(c) ?? [];
      list.push({
        date: String(r.date).slice(0, 10),
        currency: c,
        rate: Number(r.rate),
        amount: Number(r.amount) || 1,
      });
      byCcyExisting.set(c, list);
    }
    for (const list of byCcyExisting.values()) {
      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }

    const hasFreshRate = (d: string, c: string): boolean => {
      const list = byCcyExisting.get(c) ?? [];
      const hit = list.find((r) => r.date <= d);
      if (!hit) return false;
      const gap = daysBetweenYmd(d, hit.date);
      return gap >= 0 && gap <= MAX_RATE_LOOKBACK_DAYS;
    };

    const datesToFetch = new Set<string>();
    const currenciesNeededForFetch =
      currencyFilter && currencyFilter.size > 0
        ? [...currencyFilter]
        : ["EUR", "USD", "GBP"]; // typický marker „den je načtený“

    for (const d of dates) {
      if (!currencyFilter || currencyFilter.size === 0) {
        // Bez filtru: stačí mít aspoň jednu čerstvou měnu z markerů
        const anyFresh = currenciesNeededForFetch.some((c) => hasFreshRate(d, c)) ||
          [...byCcyExisting.keys()].some((c) => hasFreshRate(d, c));
        if (!anyFresh) datesToFetch.add(d);
      } else {
        for (const c of currencyFilter) {
          if (!hasFreshRate(d, c)) datesToFetch.add(d);
        }
      }
    }

    const upserted: RateRow[] = [];
    const fetchedDates: string[] = [];

    for (const d of datesToFetch) {
      const { rateDate, rows } = await fetchCnbForDate(d);
      fetchedDates.push(rateDate);
      // Vždy ulož VŠECHNY měny z denního kurzovního lístku ČNB (vč. amount —
      // JPY/HUF/… jsou za 100). Filtr currencies ovlivní jen resolve odpověď,
      // ne upsert — jinak v DB zůstane jen EUR/USD z dřívějších requestů.
      const toUpsert = rows.map((r) => ({
        date: rateDate,
        currency: r.currency,
        rate: r.rate,
        amount: r.amount,
      }));
      if (toUpsert.length === 0) continue;

      const { error: upErr } = await supabase.from("exchange_rates").upsert(toUpsert, {
        onConflict: "date,currency",
      });
      if (upErr) throw new Error(upErr.message);
      upserted.push(...toUpsert);

      // Aktualizuj in-memory cache pro následné resolve
      for (const row of toUpsert) {
        const list = byCcyExisting.get(row.currency) ?? [];
        list.push(row);
        list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        byCcyExisting.set(row.currency, list);
      }
    }

    // Resolve: jen kurzy ≤ MAX_RATE_LOOKBACK_DAYS staré
    const lookbackDates = lookbackDatesForCheck;

    let q = supabase
      .from("exchange_rates")
      .select("date, currency, rate, amount")
      .in("date", [...lookbackDates]);
    if (currencyFilter && currencyFilter.size > 0) {
      q = q.in("currency", [...currencyFilter]);
    }
    const { data: allRates, error: allErr } = await q;
    if (allErr) throw new Error(allErr.message);

    /** Pro každý požadovaný den + měnu najdi nejbližší <= date v rámci lookbacku */
    const byCcy = new Map<string, RateRow[]>();
    for (const r of allRates ?? []) {
      const c = String(r.currency).toUpperCase();
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

    const resolved: Array<RateRow & { requestedDate: string; perUnit: number }> = [];
    const missing: Array<{ date: string; currency: string }> = [];

    const currenciesNeeded =
      currencyFilter && currencyFilter.size > 0
        ? [...currencyFilter]
        : [...byCcy.keys()];

    for (const d of dates) {
      for (const c of currenciesNeeded) {
        const list = byCcy.get(c) ?? [];
        const hit = list.find((r) => r.date <= d);
        if (!hit) {
          missing.push({ date: d, currency: c });
          continue;
        }
        const gap = daysBetweenYmd(d, hit.date);
        if (gap < 0 || gap > MAX_RATE_LOOKBACK_DAYS) {
          missing.push({ date: d, currency: c });
          continue;
        }
        resolved.push({
          ...hit,
          requestedDate: d,
          perUnit: hit.rate / hit.amount,
        });
      }
    }

    return jsonResponse({
      ok: true,
      fetchedDates: [...new Set(fetchedDates)],
      upserted: upserted.length,
      rates: resolved,
      missing,
    });
  } catch (e) {
    console.error("[fetch-exchange-rates]", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
