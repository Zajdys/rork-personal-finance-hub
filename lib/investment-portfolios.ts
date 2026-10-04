import { supabase, supabaseUrl } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EtoroPosition } from '@/lib/etoro-parser';

function logSupabaseError(op: string, table: string, error: { message: string; code?: string; details?: string }) {
  const url = `${supabaseUrl}/rest/v1/${table}`;
  console.error(`[Supabase ${op}] selhalo`, table, url, error.message, error.code ?? '', error.details ?? '');
}

export type InvestmentBroker = 'etoro' | 'trading212' | 'xtb' | 'anycoin' | 'revolut' | 'manual';

export type InvestmentPortfolioVisibility = 'personal' | 'shared';

export type InvestmentPortfolio = {
  id: string;
  household_id: string | null;
  owner_user_id: string;
  visibility: InvestmentPortfolioVisibility;
  name: string;
  broker: InvestmentBroker;
  currency: string;
  /** Volné prostředky na brokerském účtu (XTB Total / sync z txs); null u brokerů bez dat. */
  cash_balance: number | null;
  /** Hotovost po měnách, např. {"EUR":2.91,"USD":0}. */
  cash_balances: Record<string, number>;
  created_at: string;
};

export type InvestmentPosition = {
  id: string;
  portfolio_id: string;
  ticker: string;
  units: number;
  invested_usd: number | null;
  invested_eur: number | null;
  current_price: number | null;
  current_value_usd: number | null;
  current_value_eur: number | null;
  change_percent: number | null;
  first_buy_date: string | null;
  currency: string;
  updated_at: string;
  portfolio_name?: string;
  broker?: InvestmentBroker;
};

export type PositionInsert = {
  ticker: string;
  units: number;
  invested_usd?: number | null;
  invested_eur?: number | null;
  current_price?: number | null;
  current_value_usd?: number | null;
  current_value_eur?: number | null;
  change_percent?: number | null;
  first_buy_date?: string | null;
  currency: string;
};

function parseCashBalances(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ccy = String(k).trim().toUpperCase();
    const n = typeof v === 'number' ? v : Number(v);
    if (!ccy || !Number.isFinite(n)) continue;
    out[ccy] = n;
  }
  return out;
}

function mapPortfolio(row: Record<string, unknown>): InvestmentPortfolio {
  return {
    id: String(row.id),
    household_id: row.household_id ? String(row.household_id) : null,
    owner_user_id: String(row.owner_user_id ?? ''),
    visibility: (row.visibility === 'shared' ? 'shared' : 'personal') as InvestmentPortfolioVisibility,
    name: String(row.name ?? ''),
    broker: String(row.broker ?? 'manual') as InvestmentBroker,
    currency: String(row.currency ?? 'EUR'),
    cash_balance: row.cash_balance == null || row.cash_balance === '' ? null : Number(row.cash_balance),
    cash_balances: parseCashBalances(row.cash_balances),
    created_at: String(row.created_at ?? ''),
  };
}

function mapPosition(row: Record<string, unknown>): InvestmentPosition {
  return {
    id: String(row.id),
    portfolio_id: String(row.portfolio_id),
    ticker: String(row.ticker ?? ''),
    units: Number(row.units) || 0,
    invested_usd: row.invested_usd == null ? null : Number(row.invested_usd),
    invested_eur: row.invested_eur == null ? null : Number(row.invested_eur),
    current_price: row.current_price == null ? null : Number(row.current_price),
    current_value_usd: row.current_value_usd == null ? null : Number(row.current_value_usd),
    current_value_eur: row.current_value_eur == null ? null : Number(row.current_value_eur),
    change_percent: row.change_percent == null ? null : Number(row.change_percent),
    first_buy_date: row.first_buy_date ? String(row.first_buy_date) : null,
    currency: String(row.currency ?? 'USD'),
    updated_at: String(row.updated_at ?? ''),
  };
}

export async function fetchInvestmentPortfoliosRemote(params: {
  userId: string;
  activeHouseholdId: string | null;
}): Promise<{ portfolios: InvestmentPortfolio[]; error: Error | null }> {
  const url = `${supabaseUrl}/rest/v1/investment_portfolios`;
  const { userId, activeHouseholdId } = params;
  try {
    const personalPromise = supabase
      .from('investment_portfolios')
      .select('*')
      .eq('visibility', 'personal')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true });

    const sharedPromise =
      activeHouseholdId != null
        ? supabase
            .from('investment_portfolios')
            .select('*')
            .eq('visibility', 'shared')
            .eq('household_id', activeHouseholdId)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null });

    const [personalRes, sharedRes] = await Promise.all([personalPromise, sharedPromise]);

    if (personalRes.error) {
      logSupabaseError('fetchPortfolios.personal', 'investment_portfolios', personalRes.error);
      return { portfolios: [], error: new Error(personalRes.error.message) };
    }
    if (sharedRes.error) {
      logSupabaseError('fetchPortfolios.shared', 'investment_portfolios', sharedRes.error);
      return { portfolios: [], error: new Error(sharedRes.error.message) };
    }

    const merged = [...(personalRes.data ?? []), ...(sharedRes.data ?? [])].map((r) =>
      mapPortfolio(r as Record<string, unknown>),
    );
    merged.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return { portfolios: merged, error: null };
  } catch (err) {
    console.error('[Supabase fetchPortfolios] network selhalo', 'investment_portfolios', url, err);
    return { portfolios: [], error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function fetchInvestmentPositionsRemote(
  portfolioIds?: string[],
): Promise<{ positions: InvestmentPosition[]; error: Error | null }> {
  const url = `${supabaseUrl}/rest/v1/investment_positions`;
  try {
    let query = supabase
      .from('investment_positions')
      .select('*, investment_portfolios(name, broker)')
      .order('ticker', { ascending: true });

    if (portfolioIds && portfolioIds.length > 0) {
      query = query.in('portfolio_id', portfolioIds);
    }

    const { data, error } = await query;
    if (error) {
      logSupabaseError('fetchPositions', 'investment_positions', error);
      return { positions: [], error: new Error(error.message) };
    }

    const positions = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const joined = r.investment_portfolios as { name?: string; broker?: string } | null;
      const pos = mapPosition(r);
      if (joined?.name) pos.portfolio_name = joined.name;
      if (joined?.broker) pos.broker = joined.broker as InvestmentBroker;
      return pos;
    });

    return { positions, error: null };
  } catch (err) {
    console.error('[Supabase fetchPositions] network selhalo', 'investment_positions', url, err);
    return { positions: [], error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function createInvestmentPortfolioRemote(
  params: {
    ownerUserId: string;
    visibility: InvestmentPortfolioVisibility;
    householdId?: string | null;
    name: string;
    broker: InvestmentBroker;
    currency: string;
    cashBalance?: number | null;
  },
  client: SupabaseClient = supabase,
): Promise<{ portfolio: InvestmentPortfolio | null; error: Error | null }> {
  if (!params.ownerUserId) {
    return { portfolio: null, error: new Error('Chybí owner_user_id') };
  }
  if (!params.name.trim()) {
    return { portfolio: null, error: new Error('Název portfolia je povinný') };
  }
  if (!params.broker) {
    return { portfolio: null, error: new Error('Broker je povinný') };
  }
  if (!params.currency.trim()) {
    return { portfolio: null, error: new Error('Měna portfolia je povinná') };
  }
  if (params.visibility === 'shared' && !params.householdId) {
    return { portfolio: null, error: new Error('Společné portfolio vyžaduje domácnost') };
  }
  if (params.visibility === 'personal' && params.householdId) {
    return { portfolio: null, error: new Error('Osobní portfolio nesmí mít household_id') };
  }

  const { data, error } = await client
    .from('investment_portfolios')
    .insert({
      owner_user_id: params.ownerUserId,
      visibility: params.visibility,
      household_id: params.visibility === 'shared' ? params.householdId : null,
      name: params.name.trim(),
      broker: params.broker,
      currency: params.currency.trim(),
      cash_balance: params.cashBalance ?? null,
    })
    .select('*')
    .single();

  if (error) {
    logSupabaseError('createPortfolio', 'investment_portfolios', error);
    return { portfolio: null, error: new Error(error.message) };
  }
  return { portfolio: mapPortfolio(data as Record<string, unknown>), error: null };
}

export async function insertInvestmentPositionsRemote(
  portfolioId: string,
  positions: PositionInsert[],
): Promise<{ error: Error | null }> {
  if (!positions.length) return { error: null };

  const rows = positions.map((p) => ({
    portfolio_id: portfolioId,
    ticker: p.ticker,
    units: p.units,
    invested_usd: p.invested_usd ?? null,
    invested_eur: p.invested_eur ?? null,
    current_price: p.current_price ?? null,
    current_value_usd: p.current_value_usd ?? null,
    current_value_eur: p.current_value_eur ?? null,
    change_percent: p.change_percent ?? null,
    first_buy_date: p.first_buy_date ?? null,
    currency: p.currency,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('investment_positions').insert(rows);
  if (error) {
    logSupabaseError('insertPositions', 'investment_positions', error);
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export async function updateInvestmentPortfolioRemote(
  portfolioId: string,
  patch: { name?: string; currency?: string },
): Promise<{ portfolio: InvestmentPortfolio | null; error: Error | null }> {
  const updates: Record<string, string> = {};
  if (patch.name != null) updates.name = patch.name.trim();
  if (patch.currency != null) updates.currency = patch.currency;
  if (!Object.keys(updates).length) {
    return { portfolio: null, error: new Error('Nic k aktualizaci') };
  }

  const { data, error } = await supabase
    .from('investment_portfolios')
    .update(updates)
    .eq('id', portfolioId)
    .select('*')
    .single();

  if (error) {
    logSupabaseError('updatePortfolio', 'investment_portfolios', error);
    return { portfolio: null, error: new Error(error.message) };
  }
  return { portfolio: mapPortfolio(data as Record<string, unknown>), error: null };
}

export async function deleteInvestmentPortfolioRemote(
  portfolioId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('investment_portfolios').delete().eq('id', portfolioId);
  if (error) {
    logSupabaseError('deletePortfolio', 'investment_portfolios', error);
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/** Počty pozic a transakcí před smazáním portfolia (potvrzovací dialog). */
export async function fetchPortfolioDeleteStats(
  portfolioId: string,
): Promise<{ positions: number; transactions: number; error: Error | null }> {
  const [posRes, txRes] = await Promise.all([
    supabase
      .from('investment_positions')
      .select('id', { count: 'exact', head: true })
      .eq('portfolio_id', portfolioId),
    supabase
      .from('investment_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('portfolio_id', portfolioId),
  ]);

  if (posRes.error) {
    logSupabaseError('fetchPortfolioDeleteStats', 'investment_positions', posRes.error);
    return { positions: 0, transactions: 0, error: new Error(posRes.error.message) };
  }
  if (txRes.error) {
    logSupabaseError('fetchPortfolioDeleteStats', 'investment_transactions', txRes.error);
    return { positions: 0, transactions: 0, error: new Error(txRes.error.message) };
  }

  return {
    positions: posRes.count ?? 0,
    transactions: txRes.count ?? 0,
    error: null,
  };
}

export function etoroPositionsToInserts(positions: EtoroPosition[]): PositionInsert[] {
  return positions.map((p) => ({
    ticker: p.ticker,
    units: p.units,
    invested_usd: p.investedUsd,
    invested_eur: p.investedEur,
    current_price: p.currentPrice,
    current_value_usd: p.currentValueUsd,
    current_value_eur: p.currentValueEur,
    change_percent: p.changePercent,
    first_buy_date: p.firstBuyDate.toISOString(),
    currency: 'EUR',
  }));
}
