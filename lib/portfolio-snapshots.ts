/**
 * Denní snapshoty net worth portfolia (USD) pro graf vývoje hodnoty.
 * Historie se zamyká (locked); dnešní/nekompletní body zůstávají přepisovatelné.
 */

import { supabase, supabaseUrl } from '@/lib/supabase';
import type { DisplayCurrency } from '@/lib/investment-portfolio-calc';
import { getCachedFxRate } from '@/lib/yahoo-ticker';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eachCalendarDate, calendarDaysBetween } from '@/lib/yahoo-historical';

export type PortfolioSnapshotRow = {
  portfolio_id: string;
  date: string;
  total_value_usd: number;
  locked?: boolean;
};

export type PortfolioValuePoint = {
  date: string;
  value: number;
};

export type SnapshotPeriod = '1W' | '1M' | '3M' | '6M' | '1Y' | 'MAX';

const PERIOD_DAYS: Record<Exclude<SnapshotPeriod, 'MAX'>, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

/** portfolioId → YYYY-MM-DD posledního úspěšného zápisu v této session. */
const writtenTodayByPortfolio = new Map<string, string>();

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function logSupabaseError(
  op: string,
  error: { message: string; code?: string; details?: string },
): void {
  console.error(
    `[Supabase ${op}] selhalo`,
    'portfolio_snapshots',
    `${supabaseUrl}/rest/v1/portfolio_snapshots`,
    error.message,
    error.code ?? '',
    error.details ?? '',
  );
}

export function convertUsdToDisplay(
  amountUsd: number,
  displayCurrency: DisplayCurrency,
): number {
  if (displayCurrency === 'USD') return Math.round(amountUsd * 100) / 100;
  const rate = getCachedFxRate('USD', displayCurrency);
  if (rate == null || !(rate > 0)) {
    console.warn(`[portfolio-snapshots] missing FX USD→${displayCurrency}`);
    return Math.round(amountUsd * 100) / 100;
  }
  return Math.round(amountUsd * rate * 100) / 100;
}

/**
 * Upsert dnešního snapshotu (vždy locked=false — může se ještě opravit).
 * Přeskočí, pokud už dnes v session zapsáno (pokud !force).
 */
export async function upsertTodayPortfolioSnapshot(
  portfolioId: string,
  totalValueUsd: number,
  options?: { force?: boolean; client?: SupabaseClient },
): Promise<{ error: Error | null }> {
  if (!Number.isFinite(totalValueUsd)) {
    return { error: new Error('Invalid total_value_usd') };
  }

  const date = todayUtcDate();
  if (!options?.force && writtenTodayByPortfolio.get(portfolioId) === date) {
    return { error: null };
  }

  const client = options?.client ?? supabase;

  // Nepřepisuj, pokud by náhodou byl den zamčený (nemělo nastat u „dnes“).
  const { data: existing } = await client
    .from('portfolio_snapshots')
    .select('locked')
    .eq('portfolio_id', portfolioId)
    .eq('date', date)
    .maybeSingle();
  if (existing?.locked === true) {
    writtenTodayByPortfolio.set(portfolioId, date);
    return { error: null };
  }

  const { error } = await client.from('portfolio_snapshots').upsert(
    {
      portfolio_id: portfolioId,
      date,
      total_value_usd: Math.round(totalValueUsd * 100) / 100,
      locked: false,
    },
    { onConflict: 'portfolio_id,date' },
  );

  if (error) {
    logSupabaseError('upsertTodayPortfolioSnapshot', error);
    return { error: new Error(error.message) };
  }

  writtenTodayByPortfolio.set(portfolioId, date);
  return { error: null };
}

export async function upsertTodayPortfolioSnapshots(
  rows: { portfolioId: string; totalValueUsd: number }[],
  options?: { force?: boolean; client?: SupabaseClient },
): Promise<void> {
  await Promise.all(
    rows.map((r) =>
      upsertTodayPortfolioSnapshot(r.portfolioId, r.totalValueUsd, options),
    ),
  );
}

export type SnapshotUpsertRow = {
  portfolioId: string;
  date: string;
  totalValueUsd: number;
  locked: boolean;
};

/**
 * Bulk upsert historických dnů.
 * Volající MUSÍ vyloučit locked dny — upsert by je jinak přepsal.
 */
export async function upsertPortfolioSnapshotsBulk(
  rows: SnapshotUpsertRow[],
  options?: { client?: SupabaseClient },
): Promise<{ upserted: number; error: Error | null }> {
  if (rows.length === 0) return { upserted: 0, error: null };
  const client = options?.client ?? supabase;
  const payload = rows.map((r) => ({
    portfolio_id: r.portfolioId,
    date: r.date,
    total_value_usd: Math.round(r.totalValueUsd * 100) / 100,
    locked: r.locked,
  }));

  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error } = await client
      .from('portfolio_snapshots')
      .upsert(chunk, { onConflict: 'portfolio_id,date' });
    if (error) {
      logSupabaseError('upsertPortfolioSnapshotsBulk', error);
      return { upserted, error: new Error(error.message) };
    }
    upserted += chunk.length;
  }
  return { upserted, error: null };
}

export type ExistingSnapshotMeta = {
  date: string;
  locked: boolean;
  totalValueUsd: number;
};

export async function fetchExistingSnapshotMeta(
  portfolioId: string,
  fromDate: string,
  toDate: string,
  options?: { client?: SupabaseClient },
): Promise<{ byDate: Map<string, ExistingSnapshotMeta>; error: Error | null }> {
  const client = options?.client ?? supabase;
  const { data, error } = await client
    .from('portfolio_snapshots')
    .select('date, locked, total_value_usd')
    .eq('portfolio_id', portfolioId)
    .gte('date', fromDate)
    .lte('date', toDate);

  if (error) {
    logSupabaseError('fetchExistingSnapshotMeta', error);
    return { byDate: new Map(), error: new Error(error.message) };
  }

  const byDate = new Map<string, ExistingSnapshotMeta>();
  for (const r of data ?? []) {
    const date = String(r.date).slice(0, 10);
    byDate.set(date, {
      date,
      locked: r.locked === true,
      totalValueUsd: Number(r.total_value_usd) || 0,
    });
  }
  return { byDate, error: null };
}

/** @deprecated prefer fetchExistingSnapshotMeta — locked-aware. */
export async function fetchExistingSnapshotDates(
  portfolioId: string,
  fromDate: string,
  toDate: string,
  options?: { client?: SupabaseClient },
): Promise<{ dates: Set<string>; error: Error | null }> {
  const { byDate, error } = await fetchExistingSnapshotMeta(portfolioId, fromDate, toDate, options);
  return { dates: new Set(byDate.keys()), error };
}

/**
 * Dny vhodné k (pře)počtu:
 * - chybí snapshot, nebo
 * - total_value_usd ≈ 0 (vadný backfill — např. chybějící historická cena), nebo
 * - unlocked a nedávné (≤14 dní / dnes) — retry po výpadku Yahoo
 * Locked dny s nenulovou hodnotou se nikdy nevrací.
 */
export function findWritableSnapshotDates(
  fromDate: string,
  toDate: string,
  existing: Map<string, ExistingSnapshotMeta>,
  options?: { recentRetryDays?: number },
): string[] {
  const recentDays = options?.recentRetryDays ?? 14;
  return eachCalendarDate(fromDate, toDate).filter((d) => {
    const row = existing.get(d);
    if (!row) return true;
    // Vadné nulové snapshoty (Anycoin BTC×0) — vždy přepočítat, i když locked.
    if (!(Math.abs(row.totalValueUsd) > 1e-9)) return true;
    if (row.locked) return false;
    // Unlocked existující: přepočítej jen nedávné (včetně dneška).
    return calendarDaysBetween(d, toDate) <= recentDays;
  });
}

export function findMissingSnapshotDates(
  fromDate: string,
  toDate: string,
  existing: Set<string>,
): string[] {
  return eachCalendarDate(fromDate, toDate).filter((d) => !existing.has(d));
}

export async function fetchPortfolioSnapshots(
  portfolioIds: string[],
  options?: {
    fromDate?: string | null;
    client?: SupabaseClient;
  },
): Promise<{ rows: PortfolioSnapshotRow[]; error: Error | null }> {
  if (portfolioIds.length === 0) return { rows: [], error: null };

  const client = options?.client ?? supabase;
  let query = client
    .from('portfolio_snapshots')
    .select('portfolio_id, date, total_value_usd, locked')
    .in('portfolio_id', portfolioIds)
    .order('date', { ascending: true });

  if (options?.fromDate) {
    query = query.gte('date', options.fromDate);
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError('fetchPortfolioSnapshots', error);
    return { rows: [], error: new Error(error.message) };
  }

  const rows: PortfolioSnapshotRow[] = (data ?? []).map((r) => ({
    portfolio_id: String(r.portfolio_id),
    date: String(r.date).slice(0, 10),
    total_value_usd: Number(r.total_value_usd) || 0,
    locked: r.locked === true,
  }));

  return { rows, error: null };
}

export function periodStartDate(period: SnapshotPeriod, today = todayUtcDate()): string | null {
  if (period === 'MAX') return null;
  const days = PERIOD_DAYS[period];
  const d = new Date(`${today}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

/** Součet USD hodnot všech portfolií k danému dni → body v display měně. */
export function aggregateSnapshotsToSeries(
  rows: PortfolioSnapshotRow[],
  displayCurrency: DisplayCurrency,
): PortfolioValuePoint[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.total_value_usd);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, usd]) => ({
      date,
      value: convertUsdToDisplay(usd, displayCurrency),
    }));
}

export function filterSeriesByPeriod(
  points: PortfolioValuePoint[],
  period: SnapshotPeriod,
): PortfolioValuePoint[] {
  if (period === 'MAX' || points.length === 0) return points;
  const from = periodStartDate(period);
  if (!from) return points;
  return points.filter((p) => p.date >= from);
}
