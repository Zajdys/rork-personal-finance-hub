import * as XLSX from 'xlsx';
import { fetchFxRateBetween, fetchYahooPriceInCurrency } from '@/lib/yahoo-ticker';
import { readXlsxWorkbook } from '@/lib/xlsx-read';

export interface EtoroPosition {
  ticker: string;
  investedUsd: number | null;
  investedEur: number | null;
  units: number;
  currency: string;
  currentPrice: number | null;
  currentValueUsd: number | null;
  currentValueEur: number | null;
  changePercent: number | null;
  firstBuyDate: Date;
}


const YAHOO_PRICE_BATCH_SIZE = 3;

type ParsedTickerAgg = {
  ticker: string;
  units: number;
  currency: string;
  firstBuyDate: Date;
  investedUsd: number;
};

function normalizeTickerForYahoo(raw: string): string {
  // .US suffix necháváme — Yahoo Finance ho podporuje (např. ABT.US)
  return raw.trim().toUpperCase();
}

function parseDetails(details: string): { ticker: string; currency: string } {
  const parts = details.split('/');
  const ticker = normalizeTickerForYahoo(parts[0] ?? '');
  const currency = (parts[1] ?? 'USD').trim().toUpperCase() || 'USD';
  return { ticker, currency };
}

/** Parsuje sloupec Datum z eToro XLSX (Excel serial, Date objekt, nebo řetězec). */
function parseEtoroDatum(rawDate: unknown, ticker?: string): Date | null {
  if (rawDate == null || rawDate === '') return null;

  let parsedDate: Date | null = null;

  if (rawDate instanceof Date) {
    parsedDate = rawDate;
  } else if (typeof rawDate === 'string' && rawDate.trim()) {
    const str = rawDate.trim();
    const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddmmyyyy) {
      parsedDate = new Date(
        `${ddmmyyyy[3]}-${ddmmyyyy[2]!.padStart(2, '0')}-${ddmmyyyy[1]!.padStart(2, '0')}`,
      );
    } else {
      const d = new Date(str);
      if (!Number.isNaN(d.getTime())) parsedDate = d;
    }
  } else if (typeof rawDate === 'number') {
    parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
  }

  if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  if (ticker) {
    if (__DEV__) console.log('[eToro parser] Could not parse date:', rawDate, 'for ticker:', ticker);
  }
  return null;
}

function rowDatumValue(row: Record<string, unknown>): unknown {
  return row.Datum ?? row.Date ?? row.date ?? row['Datum '];
}

function applyFirstBuyDate(
  entry: { firstBuyDate: Date | null },
  rawDate: unknown,
  ticker: string,
): void {
  const parsedDate = parseEtoroDatum(rawDate, ticker);
  if (!parsedDate) return;
  if (!entry.firstBuyDate || parsedDate < entry.firstBuyDate) {
    entry.firstBuyDate = parsedDate;
  }
}

function rowCastkaValue(row: Record<string, unknown>): number {
  const raw = row.Částka ?? row.Castka ?? row.Amount ?? row.amount ?? '';
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function findActivitySheet(workbook: XLSX.WorkBook): { sheet: XLSX.WorkSheet; sheetName: string } | null {
  const sheetName =
    workbook.SheetNames.find(
      (name) =>
        name.includes('Aktivita') ||
        name.includes('aktivita') ||
        name.includes('Account') ||
        name.includes('account'),
    ) ??
    workbook.SheetNames[1] ??
    workbook.SheetNames[0];

  if (!sheetName) return null;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  return { sheet, sheetName };
}

function rowTypeValue(row: Record<string, unknown>): string {
  return String(row['Napište'] ?? row['Napište '] ?? row.Type ?? row.type ?? '').trim();
}

function isOpenPositionType(type: unknown): boolean {
  const s = String(type ?? '').trim();
  return (
    s.includes('Otevřená') ||
    s.includes('Otevrena') ||
    s.includes('Open') ||
    s === 'Otevřená pozice'
  );
}

function isClosePositionType(type: unknown): boolean {
  const s = String(type ?? '').trim();
  return (
    s.includes('Zisk/ztráta') ||
    s.includes('Zisk/ztrata') ||
    s.includes('Profit') ||
    s.includes('Loss') ||
    s.includes('obchodu')
  );
}

async function fetchEurUsdRate(): Promise<number> {
  try {
    const rate = await fetchFxRateBetween('EUR', 'USD');
    if (rate != null && rate > 0) {
      if (__DEV__) console.log('[eToro parser] EUR/USD rate:', rate);
      return rate;
    }
  } catch (err) {
    if (__DEV__) console.warn('[eToro parser] EUR/USD fetch failed, using fallback 1.08', err);
  }
  return 1.08;
}

async function fetchYahooPricesBatched(
  tickers: string[],
  currency = 'USD',
): Promise<Map<string, number | null>> {
  const priceByTicker = new Map<string, number | null>();
  for (let i = 0; i < tickers.length; i += YAHOO_PRICE_BATCH_SIZE) {
    const batch = tickers.slice(i, i + YAHOO_PRICE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (ticker) => {
        const price = await fetchYahooPriceInCurrency(ticker, currency);
        priceByTicker.set(ticker, price);
      }),
    );
  }
  return priceByTicker;
}

function parseTickersFromWorkbook(workbook: XLSX.WorkBook): ParsedTickerAgg[] {
  if (__DEV__) console.log('[eToro parser] Sheet names:', workbook.SheetNames);

  const found = findActivitySheet(workbook);
  if (!found) {
    if (__DEV__) console.log('[eToro parser] Sheet found: false');
    return [];
  }

  const { sheet, sheetName } = found;
  if (__DEV__) console.log('[eToro parser] Using sheet:', sheetName);
  if (__DEV__) console.log('[eToro parser] Sheet found: true');

  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    cellDates: true,
    raw: false,
  });
  if (__DEV__) console.log('[eToro parser] Raw data rows:', rawData.length);
  if (__DEV__) console.log('[eToro parser] First row keys:', rawData[0] ? Object.keys(rawData[0]) : 'empty');
  if (__DEV__) {
    console.log(
      '[eToro parser] Sample Napište values:',
      rawData.slice(0, 5).map((r) => r['Napište'] ?? r.Type ?? r.type),
    );
  }
  if (__DEV__) {
    console.log(
      '[eToro parser] Sample Datum values:',
      rawData.slice(0, 5).map((r) => rowDatumValue(r)),
    );
  }

  if (__DEV__) {
    console.log(
      '[eToro parser] Sample Částka values:',
      rawData
        .filter((r) => isOpenPositionType(rowTypeValue(r)))
        .slice(0, 5)
        .map((r) => rowCastkaValue(r)),
    );
  }

  const objectOpenCount = rawData.filter((row) => {
    const type = rowTypeValue(row);
    return isOpenPositionType(type);
  }).length;
  if (__DEV__) console.log('[eToro parser] Object-mode open rows (sample filter):', objectOpenCount);

  const openPositions = new Map<
    string,
    {
      ticker: string;
      currency: string;
      units: number;
      openDate: Date | null;
      investedAmount: number;
    }
  >();

  for (const row of rawData) {
    const type = rowTypeValue(row);
    const details = String(row.Podrobnosti ?? row.Details ?? row.Instrument ?? '');
    const units =
      parseFloat(String(row.Jednotky ?? row.Units ?? row.Quantity ?? '0').replace(',', '.')) || 0;
    const positionId = String(row['ID pozice'] ?? row['Position ID'] ?? row.PositionId ?? '').trim();
    const investedAmount = rowCastkaValue(row);

    const { ticker, currency } = parseDetails(details);
    if (!ticker) continue;

    const openDate = parseEtoroDatum(rowDatumValue(row), ticker);

    if (isOpenPositionType(type) && positionId) {
      openPositions.set(positionId, {
        ticker,
        currency,
        units,
        openDate,
        investedAmount: Math.abs(investedAmount),
      });
    } else if (isClosePositionType(type) && positionId) {
      openPositions.delete(positionId);
    }
  }

  if (__DEV__) console.log('[eToro parser] Open positions found:', openPositions.size);

  const aggregated = new Map<
    string,
    { units: number; currency: string; firstBuyDate: Date | null; investedUsd: number }
  >();

  for (const pos of openPositions.values()) {
    const existing = aggregated.get(pos.ticker) || {
      units: 0,
      currency: pos.currency,
      firstBuyDate: null as Date | null,
      investedUsd: 0,
    };

    let firstBuyDate = existing.firstBuyDate;
    if (pos.openDate) {
      firstBuyDate =
        firstBuyDate == null || pos.openDate.getTime() < firstBuyDate.getTime()
          ? pos.openDate
          : firstBuyDate;
    }

    aggregated.set(pos.ticker, {
      units: existing.units + pos.units,
      currency: existing.currency || pos.currency,
      firstBuyDate,
      investedUsd: existing.investedUsd + pos.investedAmount,
    });
  }

  // Doplň firstBuyDate z řádků „Otevřená pozice“ přímo podle tickeru (nejstarší Datum)
  for (const row of rawData) {
    if (!isOpenPositionType(rowTypeValue(row))) continue;
    const details = String(row.Podrobnosti ?? row.Details ?? row.Instrument ?? '');
    const { ticker } = parseDetails(details);
    if (!ticker) continue;

    const entry = aggregated.get(ticker);
    if (!entry) continue;

    applyFirstBuyDate(entry, rowDatumValue(row), ticker);
  }

  const result: ParsedTickerAgg[] = [];
  for (const [ticker, data] of aggregated.entries()) {
    if (!ticker || data.units <= 0) continue;
    if (!data.firstBuyDate) {
      if (__DEV__) console.log('[eToro parser] Ticker without buy date (metadata only):', ticker);
    }
    if (data.investedUsd <= 0) {
      if (__DEV__) console.log('[eToro parser] Ticker without Částka sum:', ticker);
    }
    result.push({
      ticker,
      units: Math.round(data.units * 10000) / 10000,
      currency: data.currency,
      firstBuyDate: data.firstBuyDate ?? new Date(),
      investedUsd: Math.round(data.investedUsd * 100) / 100,
    });
  }

  if (__DEV__) console.log('[eToro parser] Aggregated tickers:', result.length);
  result.forEach((r) => {
    if (__DEV__) console.log(`[eToro parser] ${r.ticker}: units=${r.units}, investedUsd=${r.investedUsd}`);
  });
  return result;
}

function buildPosition(
  agg: ParsedTickerAgg,
  currentPrice: number | null,
  eurUsdRate: number,
): EtoroPosition {
  const usdToEur = (usd: number | null): number | null =>
    usd != null ? Math.round((usd / eurUsdRate) * 100) / 100 : null;

  const investedUsd = agg.investedUsd > 0 ? agg.investedUsd : null;

  const currentValueUsd =
    currentPrice != null ? Math.round(agg.units * currentPrice * 100) / 100 : null;

  const changePercent =
    investedUsd != null && investedUsd > 0 && currentValueUsd != null
      ? Math.round(((currentValueUsd - investedUsd) / investedUsd) * 10000) / 100
      : null;

  return {
    ticker: agg.ticker,
    investedUsd,
    investedEur: usdToEur(investedUsd),
    units: agg.units,
    currency: agg.currency,
    currentPrice,
    currentValueUsd,
    currentValueEur: usdToEur(currentValueUsd),
    changePercent,
    firstBuyDate: agg.firstBuyDate,
  };
}

export async function parseEtoroXlsx(fileContent: string | ArrayBuffer): Promise<EtoroPosition[]> {
  if (__DEV__) console.log('[eToro parser] Starting parse...');
  try {
    const eurUsdRate = await fetchEurUsdRate();
    const workbook = readXlsxWorkbook(fileContent);
    const parsed = parseTickersFromWorkbook(workbook);
    if (parsed.length === 0) {
      if (__DEV__) console.log('[eToro parser] No tickers parsed from workbook');
      return [];
    }

    const tickers = parsed.map((p) => p.ticker);
    const priceByTicker = await fetchYahooPricesBatched(tickers, 'USD');

    const withPrices = parsed.map((agg) => {
      const currentPrice = priceByTicker.get(agg.ticker) ?? null;
      return buildPosition(agg, currentPrice, eurUsdRate);
    });

    if (__DEV__) console.log('[eToro parser] Positions with prices:', withPrices.length);
    return withPrices.sort((a, b) => (b.investedEur ?? 0) - (a.investedEur ?? 0));
  } catch (err) {
    console.error('[eToro parser] Parse failed:', err);
    throw err;
  }
}

/** Součty portfolia z parsovaných eToro pozic (EUR). */
export function summarizeEtoroPortfolio(positions: EtoroPosition[]): {
  totalInvested: number;
  totalValue: number;
  totalChangePercent: number | null;
} {
  const totalInvested = positions.reduce((s, p) => (p.investedEur != null ? s + p.investedEur : s), 0);
  const totalValue = positions.reduce((s, p) => (p.currentValueEur != null ? s + p.currentValueEur : s), 0);
  const totalChangePercent =
    totalInvested > 0 ? Math.round(((totalValue - totalInvested) / totalInvested) * 10000) / 100 : null;
  return { totalInvested, totalValue, totalChangePercent };
}
