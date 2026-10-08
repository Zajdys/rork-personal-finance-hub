import { supabase as defaultSupabase, supabaseUrl } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createInvestmentPortfolioRemote,
  type InvestmentPortfolioVisibility,
} from '@/lib/investment-portfolios';
import {
  logEtoroTransactionParseSummary,
  parseEtoroTransactionsXlsx,
  parseEtoroTransactionsXlsxFiles,
  dedupeInvestmentTransactionsByExternalId,
  type EtoroTransactionParseResult,
  type ParsedEtoroTransaction,
} from '@/lib/etoro-transactions-parser';
import {
  logTrading212TransactionParseSummary,
  parseTrading212TransactionsCsvFiles,
  type Trading212TransactionParseResult,
} from '@/lib/trading212-parser';
import {
  logAnycoinParseSummary,
  parseAnycoinCsv,
  type AnycoinParseResult,
  type ParsedAnycoinTransaction,
} from '@/lib/anycoin-parser';
import { randomUUID } from '@/lib/random-uuid';
import type { InvestmentTransactionForCalc } from '@/lib/investment-portfolio-calc';
import type { InvestmentBroker } from '@/lib/investment-portfolios';
import {
  computeNativeCashBalances,
  roundCashMoney,
} from '@/lib/investment-cash-balances';
import { convertAmountBetweenCurrencies } from '@/lib/yahoo-ticker';
import {
  parseRevolutInvestCsv,
  revolutInvestHoldingsByTicker,
  type RevolutInvestParseResult,
} from '@/lib/revolut-invest-csv-parse';
import {
  assertXtbInterestTaxImportAllowed,
  logXtbTransactionParseSummary,
  parseXtbTransactionsXlsx,
  type XtbTransactionParseResult,
} from '@/lib/xtb-transactions-parser';
import {
  encodeBrokerPositionNote,
  parseBrokerPositionIdFromNote,
} from '@/lib/broker-position-id';

export type InvestmentTransactionRow = {
  id: string;
  portfolio_id: string;
  type:
    | 'buy'
    | 'sell'
    | 'dividend'
    | 'deposit'
    | 'withdrawal'
    | 'fee'
    | 'promo'
    | 'transfer_out'
    | 'gift'
    | 'interest'
    | 'tax';
  ticker: string | null;
  isin: string | null;
  units: number | null;
  /** Cena za kus z DB (ruční / import); UI může fallbacknout na amount/units. */
  price_per_unit: number | null;
  amount: number;
  fee: number;
  original_currency: string;
  date: string;
  external_id: string | null;
  source?: 'import' | 'manual';
  note?: string | null;
  /** Broker Position/Order ID — lot cost basis (XTB / eToro). */
  lot_id?: string | null;
};

export function mapTransactionRowToCalc(row: InvestmentTransactionRow): InvestmentTransactionForCalc {
  const lotId =
    (row.lot_id != null && String(row.lot_id).trim()) ||
    parseBrokerPositionIdFromNote(row.note) ||
    null;
  return {
    type: row.type,
    ticker: row.ticker,
    isin: row.isin,
    units: row.units,
    amount: row.amount,
    fee: row.fee,
    original_currency: row.original_currency,
    date: row.date,
    external_id: row.external_id ?? undefined,
    lot_id: lotId,
    position_id: lotId,
  };
}

export async function fetchInvestmentTransactionsRemote(
  portfolioIds?: string[],
  client: SupabaseClient = defaultSupabase,
): Promise<{ transactions: InvestmentTransactionRow[]; error: Error | null }> {
  const PAGE_SIZE = 1000;
  const allRows: InvestmentTransactionRow[] = [];
  let offset = 0;

  try {
    while (true) {
      let query = client
        .from('investment_transactions')
        .select(
          'id, portfolio_id, type, ticker, isin, units, price_per_unit, amount, fee, original_currency, date, external_id, source, note, lot_id',
        )
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (portfolioIds?.length) {
        query = query.in('portfolio_id', portfolioIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[investment-transactions] fetch failed', error.message, {
          portfolioIds,
          offset,
        });
        return { transactions: [], error: new Error(error.message) };
      }

      const page = (data ?? []).map(
        (row): InvestmentTransactionRow => ({
          id: String(row.id),
          portfolio_id: String(row.portfolio_id),
          type: row.type as InvestmentTransactionRow['type'],
          ticker: row.ticker != null ? String(row.ticker) : null,
          isin: row.isin != null ? String(row.isin) : null,
          units: row.units == null ? null : Number(row.units),
          price_per_unit:
            row.price_per_unit == null || row.price_per_unit === ''
              ? null
              : Number(row.price_per_unit),
          amount: Number(row.amount) || 0,
          fee: Number(row.fee) || 0,
          original_currency: String(row.original_currency ?? 'USD'),
          date: String(row.date),
          external_id: row.external_id != null ? String(row.external_id) : null,
          source: row.source === 'manual' || row.source === 'import' ? row.source : undefined,
          note: row.note != null ? String(row.note) : null,
        }),
      );

      allRows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return { transactions: allRows, error: null };
  } catch (err) {
    console.error('[investment-transactions] fetch exception', err);
    return {
      transactions: [],
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export type InvestmentTransactionInsert = ParsedEtoroTransaction & {
  portfolio_id: string;
  import_batch_id?: string | null;
};

async function findOrCreateBrokerPortfolio(
  params: {
    ownerUserId: string;
    broker: InvestmentBroker;
    currency: string;
    visibility?: InvestmentPortfolioVisibility;
    householdId?: string | null;
    portfolioName?: string;
  },
  client: SupabaseClient = defaultSupabase,
): Promise<{ portfolioId: string | null; error: Error | null }> {
  const visibility = params.visibility ?? 'personal';
  const portfolioName = params.portfolioName ?? params.broker;

  let query = client
    .from('investment_portfolios')
    .select('id, created_at')
    .eq('broker', params.broker)
    .order('created_at', { ascending: true });

  if (visibility === 'personal') {
    query = query.eq('visibility', 'personal').eq('owner_user_id', params.ownerUserId).is('household_id', null);
  } else {
    if (!params.householdId) {
      return {
        portfolioId: null,
        error: new Error(`Společné ${params.broker} portfolio vyžaduje household_id`),
      };
    }
    query = query.eq('visibility', 'shared').eq('household_id', params.householdId);
  }

  const { data: existingList, error } = await query;

  if (error) {
    console.error(
      '[investment-transactions] fetch portfolio',
      params.broker,
      `${supabaseUrl}/rest/v1/investment_portfolios`,
      error.message,
    );
    return { portfolioId: null, error: new Error(error.message) };
  }

  if (existingList?.length) {
    let bestId = String(existingList[0]!.id);
    let bestCount = -1;
    let bestCreatedAt = String(existingList[0]!.created_at ?? '');

    for (const row of existingList) {
      const pid = String(row.id);
      const { count, error: countErr } = await client
        .from('investment_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('portfolio_id', pid);
      if (countErr) {
        console.warn('[investment-transactions] tx count failed for portfolio', pid, countErr.message);
      }
      const txCount = count ?? 0;
      const createdAt = String(row.created_at ?? '');
      if (
        txCount > bestCount ||
        (txCount === bestCount && createdAt.localeCompare(bestCreatedAt) < 0)
      ) {
        bestCount = txCount;
        bestId = pid;
        bestCreatedAt = createdAt;
      }
    }

    console.log(
      `[investment-transactions] Reusing ${params.broker} portfolio ${bestId} (${bestCount} existing txs, visibility=${visibility})`,
    );
    return { portfolioId: bestId, error: null };
  }

  const { portfolio, error: createErr } = await createInvestmentPortfolioRemote(
    {
      ownerUserId: params.ownerUserId,
      visibility,
      householdId: visibility === 'shared' ? (params.householdId ?? null) : null,
      name: portfolioName,
      broker: params.broker,
      currency: params.currency,
    },
    client,
  );
  if (createErr || !portfolio) {
    return {
      portfolioId: null,
      error: createErr ?? new Error(`Nepodařilo se vytvořit ${params.broker} portfolio`),
    };
  }
  return { portfolioId: portfolio.id, error: null };
}

export async function findOrCreateEtoroPortfolio(
  params: {
    ownerUserId: string;
    visibility?: InvestmentPortfolioVisibility;
    householdId?: string | null;
    portfolioName?: string;
  },
  client: SupabaseClient = defaultSupabase,
): Promise<{ portfolioId: string | null; error: Error | null }> {
  return findOrCreateBrokerPortfolio(
    {
      ownerUserId: params.ownerUserId,
      broker: 'etoro',
      currency: 'USD',
      visibility: params.visibility,
      householdId: params.householdId,
      portfolioName: params.portfolioName ?? 'eToro',
    },
    client,
  );
}

export async function findOrCreateTrading212Portfolio(
  params: {
    ownerUserId: string;
    visibility?: InvestmentPortfolioVisibility;
    householdId?: string | null;
    portfolioName?: string;
  },
  client: SupabaseClient = defaultSupabase,
): Promise<{ portfolioId: string | null; error: Error | null }> {
  return findOrCreateBrokerPortfolio(
    {
      ownerUserId: params.ownerUserId,
      broker: 'trading212',
      currency: 'EUR',
      visibility: params.visibility,
      householdId: params.householdId,
      portfolioName: params.portfolioName ?? 'Trading 212',
    },
    client,
  );
}

export async function findOrCreateXtbPortfolio(
  params: {
    ownerUserId: string;
    visibility?: InvestmentPortfolioVisibility;
    householdId?: string | null;
    portfolioName?: string;
    currency?: 'EUR' | 'USD' | 'CZK';
  },
  client: SupabaseClient = defaultSupabase,
): Promise<{ portfolioId: string | null; error: Error | null }> {
  return findOrCreateBrokerPortfolio(
    {
      ownerUserId: params.ownerUserId,
      broker: 'xtb',
      currency: params.currency ?? 'EUR',
      visibility: params.visibility,
      householdId: params.householdId,
      portfolioName: params.portfolioName ?? 'XTB',
    },
    client,
  );
}

export async function findOrCreateRevolutInvestPortfolio(
  params: {
    ownerUserId: string;
    visibility?: InvestmentPortfolioVisibility;
    householdId?: string | null;
    portfolioName?: string;
  },
  client: SupabaseClient = defaultSupabase,
): Promise<{ portfolioId: string | null; error: Error | null }> {
  return findOrCreateBrokerPortfolio(
    {
      ownerUserId: params.ownerUserId,
      broker: 'revolut',
      currency: 'EUR',
      visibility: params.visibility,
      householdId: params.householdId,
      portfolioName: params.portfolioName ?? 'Revolut Invest',
    },
    client,
  );
}

export async function importRevolutInvestTransactionsFromCsv(params: {
  ownerUserId: string;
  visibility?: InvestmentPortfolioVisibility;
  householdId?: string | null;
  csvText: string;
  portfolioName?: string;
  importBatchId?: string;
  client?: SupabaseClient;
}): Promise<{
  parseResult: RevolutInvestParseResult;
  portfolioId: string | null;
  upserted: number;
  summary: BrokerImportSummary;
  error: Error | null;
}> {
  const client = params.client ?? defaultSupabase;
  const parseResult = parseRevolutInvestCsv(params.csvText);

  const emptySummary = (): BrokerImportSummary => ({
    fileCount: 1,
    upserted: 0,
    newCount: 0,
    openPositions: 0,
    hasOrphanSells: false,
    hasCompleteData: false,
  });

  if (!parseResult.ok) {
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: new Error(parseResult.error),
    };
  }

  if (parseResult.transactions.length === 0) {
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: new Error('V CSV nebyly nalezeny žádné transakce.'),
    };
  }

  const { portfolioId, error: portfolioErr } = await findOrCreateRevolutInvestPortfolio(
    {
      ownerUserId: params.ownerUserId,
      visibility: params.visibility ?? 'personal',
      householdId: params.householdId ?? null,
      portfolioName: params.portfolioName ?? 'Revolut Invest',
    },
    client,
  );
  if (portfolioErr || !portfolioId) {
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: portfolioErr,
    };
  }

  const existingIds = await countExistingExternalIds(
    portfolioId,
    parseResult.transactions.map((t) => t.external_id),
    client,
  );

  const { upserted, error } = await upsertInvestmentTransactionsRemote(
    portfolioId,
    parseResult.transactions,
    params.importBatchId,
    client,
  );

  if (error) {
    return {
      parseResult,
      portfolioId,
      upserted: 0,
      summary: emptySummary(),
      error,
    };
  }

  const openPositions = await countOpenPositionsFromTxs(portfolioId, 'EUR', client);
  const holdings = revolutInvestHoldingsByTicker(parseResult.transactions);
  const openFromParse = Object.values(holdings).filter((u) => u > 1e-10).length;

  const summary: BrokerImportSummary = {
    fileCount: 1,
    upserted,
    newCount: Math.max(0, parseResult.transactions.length - existingIds),
    openPositions: openPositions || openFromParse,
    hasOrphanSells: false,
    hasCompleteData: parseResult.summary.buy.count > 0,
  };

  console.log(
    `[Revolut Invest] Upserted ${upserted} rows into portfolio ${portfolioId} (new=${summary.newCount}).`,
  );

  return { parseResult, portfolioId, upserted, summary, error: null };
}

export async function upsertInvestmentTransactionsRemote(
  portfolioId: string,
  transactions: ParsedEtoroTransaction[],
  importBatchId?: string | null,
  client: SupabaseClient = defaultSupabase,
): Promise<{ upserted: number; error: Error | null }> {
  if (!transactions.length) return { upserted: 0, error: null };

  const deduped = dedupeInvestmentTransactionsByExternalId(transactions);
  const batchId = importBatchId ?? randomUUID();
  const rows = deduped.map((tx) => {
    const rawPid = String(tx.position_id ?? '').trim();
    const lotId =
      (rawPid && rawPid !== '-' ? rawPid : null) ||
      parseBrokerPositionIdFromNote(tx.note) ||
      null;
    // Note tag zůstává jako fallback pro starší klienty.
    const tagged =
      (tx.note != null && String(tx.note).trim()) ||
      encodeBrokerPositionNote(null, lotId, 'xtb') ||
      null;
    return {
      portfolio_id: portfolioId,
      type: tx.type,
      ticker: tx.ticker,
      isin: tx.isin,
      units: tx.units,
      price_per_unit: tx.price_per_unit,
      amount: tx.amount,
      fee: tx.fee,
      original_currency: tx.original_currency,
      date: tx.date,
      external_id: tx.external_id,
      import_batch_id: batchId,
      source: tx.source ?? 'import',
      lot_id: lotId,
      ...(tagged ? { note: tagged } : {}),
    };
  });

  const { data, error } = await client
    .from('investment_transactions')
    .upsert(rows, { onConflict: 'portfolio_id,external_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    console.error('[investment-transactions] upsert failed', error.message);
    return { upserted: 0, error: new Error(error.message) };
  }

  return { upserted: data?.length ?? rows.length, error: null };
}

export function logEtoroTransactionImportSummary(
  parseResult: EtoroTransactionParseResult,
  savedByType?: EtoroTransactionParseResult['summary'],
): void {
  if (!__DEV__) return;
  logEtoroTransactionParseSummary(parseResult);
  if (savedByType) {
    console.log('[eToro tx import] Saved to investment_transactions:');
    for (const type of Object.keys(savedByType) as Array<keyof typeof savedByType>) {
      const row = savedByType[type];
      if (row.count === 0) continue;
      console.log(`  ${type}: ${row.count} rows`);
    }
  }
}

export type BrokerImportSummary = {
  fileCount: number;
  upserted: number;
  /** Nové external_id, které v DB před importem nebyly. */
  newCount: number;
  openPositions: number;
  hasOrphanSells: boolean;
  hasCompleteData: boolean;
};

async function syncPortfolioCashFromTransactions(
  portfolioId: string,
  accountCurrency: 'USD' | 'EUR' | 'CZK',
  client: SupabaseClient,
): Promise<{ openPositions: number; cashBalance: number; cashBalances: Record<string, number> }> {
  const { transactions } = await fetchInvestmentTransactionsRemote([portfolioId], client);
  if (!transactions.length) {
    await client
      .from('investment_portfolios')
      .update({ cash_balance: 0, cash_balances: {} })
      .eq('id', portfolioId);
    return { openPositions: 0, cashBalance: 0, cashBalances: {} };
  }

  const cashBalances = computeNativeCashBalances(
    transactions.map((tx) => ({
      type: tx.type,
      amount: tx.amount,
      original_currency: tx.original_currency,
    })),
  );

  // Scalar cash_balance v měně portfolia (native + přepočet ostatních měn).
  let cashBalance = cashBalances[accountCurrency] ?? 0;
  for (const [ccy, amt] of Object.entries(cashBalances)) {
    if (ccy === accountCurrency) continue;
    const converted = await convertAmountBetweenCurrencies(amt, ccy, accountCurrency);
    if (converted != null) cashBalance += converted;
  }
  cashBalance = roundCashMoney(cashBalance);

  const { calculatePortfolioFromTransactions } = await import('@/lib/investment-portfolio-calc');
  const result = await calculatePortfolioFromTransactions(
    transactions.map(mapTransactionRowToCalc),
    {
      displayCurrency: accountCurrency,
      accountCurrency,
      fetchLivePrices: false,
    },
  );

  const { error } = await client
    .from('investment_portfolios')
    .update({ cash_balance: cashBalance, cash_balances: cashBalances })
    .eq('id', portfolioId);
  if (error) {
    console.warn('[investment-transactions] cash_balance sync failed', error.message);
  } else {
    console.log(
      `[investment-transactions] cash synced → balance=${cashBalance} ${accountCurrency}`,
      cashBalances,
    );
  }
  return {
    openPositions: result.positions.filter((p) => p.held_units > 0).length,
    cashBalance,
    cashBalances,
  };
}

async function countOpenPositionsFromTxs(
  portfolioId: string,
  accountCurrency: 'USD' | 'EUR' | 'CZK',
  client: SupabaseClient,
): Promise<number> {
  const { openPositions } = await syncPortfolioCashFromTransactions(
    portfolioId,
    accountCurrency,
    client,
  );
  return openPositions;
}

async function countExistingExternalIds(
  portfolioId: string,
  externalIds: string[],
  client: SupabaseClient,
): Promise<number> {
  if (!externalIds.length) return 0;
  const unique = [...new Set(externalIds)];
  let existing = 0;
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await client
      .from('investment_transactions')
      .select('external_id')
      .eq('portfolio_id', portfolioId)
      .in('external_id', chunk);
    if (error) {
      console.warn('[investment-transactions] existing id count failed', error.message);
      continue;
    }
    existing += data?.length ?? 0;
  }
  return existing;
}

export async function importEtoroTransactionsFromXlsx(params: {
  ownerUserId: string;
  visibility?: InvestmentPortfolioVisibility;
  householdId?: string | null;
  /** Jeden nebo více XLSX (base64 / ArrayBuffer). */
  fileContents: Array<string | ArrayBuffer>;
  /** @deprecated použij fileContents */
  fileContent?: string | ArrayBuffer;
  portfolioName?: string;
  importBatchId?: string;
  client?: SupabaseClient;
}): Promise<{
  parseResult: EtoroTransactionParseResult;
  portfolioId: string | null;
  upserted: number;
  summary: BrokerImportSummary;
  error: Error | null;
}> {
  const client = params.client ?? defaultSupabase;
  const files =
    params.fileContents?.length > 0
      ? params.fileContents
      : params.fileContent != null
        ? [params.fileContent]
        : [];
  const parseResult =
    files.length <= 1
      ? parseEtoroTransactionsXlsx(files[0] ?? '')
      : parseEtoroTransactionsXlsxFiles(files);

  const emptySummary = (): BrokerImportSummary => ({
    fileCount: files.length,
    upserted: 0,
    newCount: 0,
    openPositions: 0,
    hasOrphanSells: false,
    hasCompleteData: parseResult.summary.buy.count > 0,
  });

  if (parseResult.transactions.length === 0) {
    logEtoroTransactionParseSummary(parseResult);
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: new Error('V XLSX nebyly nalezeny žádné transakce.'),
    };
  }

  const { portfolioId, error: portfolioErr } = await findOrCreateEtoroPortfolio(
    {
      ownerUserId: params.ownerUserId,
      visibility: params.visibility ?? 'personal',
      householdId: params.householdId ?? null,
      portfolioName: params.portfolioName ?? 'eToro',
    },
    client,
  );
  if (portfolioErr || !portfolioId) {
    logEtoroTransactionParseSummary(parseResult);
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: portfolioErr,
    };
  }

  const existingIds = await countExistingExternalIds(
    portfolioId,
    parseResult.transactions.map((t) => t.external_id),
    client,
  );

  const { upserted, error } = await upsertInvestmentTransactionsRemote(
    portfolioId,
    parseResult.transactions,
    params.importBatchId,
    client,
  );

  logEtoroTransactionImportSummary(parseResult, parseResult.summary);

  if (error) {
    return {
      parseResult,
      portfolioId,
      upserted: 0,
      summary: emptySummary(),
      error,
    };
  }

  const openPositions = await countOpenPositionsFromTxs(portfolioId, 'USD', client);
  const summary: BrokerImportSummary = {
    fileCount: files.length,
    upserted,
    newCount: Math.max(0, parseResult.transactions.length - existingIds),
    openPositions,
    hasOrphanSells: false,
    hasCompleteData: parseResult.summary.buy.count > 0,
  };

  if (__DEV__) {
    console.log(
      `[eToro tx import] Upserted ${upserted} rows into portfolio ${portfolioId} (broker=etoro, files=${files.length}, new=${summary.newCount}).`,
    );
  }

  return { parseResult, portfolioId, upserted, summary, error: null };
}

export async function importTrading212TransactionsFromCsv(params: {
  ownerUserId: string;
  visibility?: InvestmentPortfolioVisibility;
  householdId?: string | null;
  csvTexts: string[];
  portfolioName?: string;
  importBatchId?: string;
  client?: SupabaseClient;
}): Promise<{
  parseResult: Trading212TransactionParseResult;
  portfolioId: string | null;
  upserted: number;
  summary: BrokerImportSummary;
  error: Error | null;
}> {
  const client = params.client ?? defaultSupabase;
  const parseResult = parseTrading212TransactionsCsvFiles(params.csvTexts);

  const emptySummary = (): BrokerImportSummary => ({
    fileCount: params.csvTexts.length,
    upserted: 0,
    newCount: 0,
    openPositions: 0,
    hasOrphanSells: parseResult.hasOrphanSells,
    hasCompleteData: parseResult.summary.buy.count > 0,
  });

  if (parseResult.transactions.length === 0) {
    logTrading212TransactionParseSummary(parseResult);
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: new Error('V CSV nebyly nalezeny žádné transakce.'),
    };
  }

  const { portfolioId, error: portfolioErr } = await findOrCreateTrading212Portfolio(
    {
      ownerUserId: params.ownerUserId,
      visibility: params.visibility ?? 'personal',
      householdId: params.householdId ?? null,
      portfolioName: params.portfolioName ?? 'Trading 212',
    },
    client,
  );
  if (portfolioErr || !portfolioId) {
    logTrading212TransactionParseSummary(parseResult);
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: portfolioErr,
    };
  }

  const existingIds = await countExistingExternalIds(
    portfolioId,
    parseResult.transactions.map((t) => t.external_id),
    client,
  );

  const { upserted, error } = await upsertInvestmentTransactionsRemote(
    portfolioId,
    parseResult.transactions,
    params.importBatchId,
    client,
  );

  logTrading212TransactionParseSummary(parseResult);

  if (error) {
    return {
      parseResult,
      portfolioId,
      upserted: 0,
      summary: emptySummary(),
      error,
    };
  }

  const openPositions = await countOpenPositionsFromTxs(portfolioId, 'EUR', client);
  const summary: BrokerImportSummary = {
    fileCount: params.csvTexts.length,
    upserted,
    newCount: Math.max(0, parseResult.transactions.length - existingIds),
    openPositions,
    hasOrphanSells: parseResult.hasOrphanSells,
    hasCompleteData: parseResult.summary.buy.count > 0,
  };

  if (__DEV__) {
    console.log(
      `[T212 tx import] Upserted ${upserted} rows into portfolio ${portfolioId} (broker=trading212, files=${params.csvTexts.length}, new=${summary.newCount}).`,
    );
    const depTx = parseResult.transactions.filter((t) => t.type === 'deposit');
    console.log('[T212 deposits] saved to DB', {
      portfolioId,
      upsertedTotal: upserted,
      depositCount: depTx.length,
      depositSum: Math.round(depTx.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      byCurrency: depTx.reduce(
        (acc, t) => {
          const c = t.original_currency || '?';
          acc[c] = (acc[c] ?? 0) + t.amount;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });
  }

  return { parseResult, portfolioId, upserted, summary, error: null };
}

export async function importXtbTransactionsFromXlsx(params: {
  ownerUserId: string;
  visibility?: InvestmentPortfolioVisibility;
  householdId?: string | null;
  fileContent: string | ArrayBuffer;
  portfolioName?: string;
  importBatchId?: string;
  client?: SupabaseClient;
}): Promise<{
  parseResult: XtbTransactionParseResult;
  portfolioId: string | null;
  upserted: number;
  summary: BrokerImportSummary;
  error: Error | null;
}> {
  const client = params.client ?? defaultSupabase;
  const parseResult = parseXtbTransactionsXlsx(params.fileContent);
  logXtbTransactionParseSummary(parseResult);

  const emptySummary = (): BrokerImportSummary => ({
    fileCount: 1,
    upserted: 0,
    newCount: 0,
    openPositions: 0,
    hasOrphanSells: false,
    hasCompleteData: parseResult.summary.buy.count > 0,
  });

  try {
    assertXtbInterestTaxImportAllowed(parseResult.transactions);
  } catch (e) {
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }

  if (parseResult.transactions.length === 0) {
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: null,
    };
  }

  const currency =
    parseResult.accountCurrency === 'USD' || parseResult.accountCurrency === 'CZK'
      ? parseResult.accountCurrency
      : 'EUR';

  const { portfolioId, error: portfolioErr } = await findOrCreateXtbPortfolio(
    {
      ownerUserId: params.ownerUserId,
      visibility: params.visibility,
      householdId: params.householdId,
      portfolioName: params.portfolioName,
      currency,
    },
    client,
  );
  if (portfolioErr || !portfolioId) {
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: portfolioErr,
    };
  }

  const existingIds = await countExistingExternalIds(
    portfolioId,
    parseResult.transactions.map((t) => t.external_id),
    client,
  );

  const { upserted, error } = await upsertInvestmentTransactionsRemote(
    portfolioId,
    parseResult.transactions,
    params.importBatchId,
    client,
  );

  if (error) {
    return {
      parseResult,
      portfolioId,
      upserted: 0,
      summary: emptySummary(),
      error,
    };
  }

  const openPositions = await countOpenPositionsFromTxs(portfolioId, currency, client);
  await syncPortfolioCashFromTransactions(portfolioId, currency, client);

  return {
    parseResult,
    portfolioId,
    upserted,
    summary: {
      fileCount: 1,
      upserted,
      newCount: Math.max(0, parseResult.transactions.length - existingIds),
      openPositions,
      hasOrphanSells: false,
      hasCompleteData: parseResult.summary.buy.count > 0,
    },
    error: null,
  };
}

export async function findOrCreateAnycoinPortfolio(
  params: {
    ownerUserId: string;
    visibility?: InvestmentPortfolioVisibility;
    householdId?: string | null;
    portfolioName?: string;
  },
  client: SupabaseClient = defaultSupabase,
): Promise<{ portfolioId: string | null; error: Error | null }> {
  return findOrCreateBrokerPortfolio(
    {
      ownerUserId: params.ownerUserId,
      broker: 'anycoin',
      currency: 'CZK',
      visibility: params.visibility,
      householdId: params.householdId,
      portfolioName: params.portfolioName ?? 'Anycoin',
    },
    client,
  );
}

function anycoinToParsedEtoro(tx: ParsedAnycoinTransaction): ParsedEtoroTransaction {
  return {
    type: tx.type,
    ticker: tx.ticker,
    isin: tx.isin,
    units: tx.units,
    price_per_unit: tx.price_per_unit,
    amount: tx.amount,
    fee: tx.fee,
    original_currency: tx.original_currency,
    date: tx.date,
    external_id: tx.external_id,
    source: tx.source,
    note: tx.note,
  };
}

export async function importAnycoinTransactionsFromCsv(params: {
  ownerUserId: string;
  visibility?: InvestmentPortfolioVisibility;
  householdId?: string | null;
  csvTexts: string[];
  portfolioName?: string;
  importBatchId?: string;
  client?: SupabaseClient;
}): Promise<{
  parseResult: AnycoinParseResult;
  portfolioId: string | null;
  upserted: number;
  summary: BrokerImportSummary;
  error: Error | null;
}> {
  const client = params.client ?? defaultSupabase;
  const merged: ParsedAnycoinTransaction[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const text of params.csvTexts) {
    const part = parseAnycoinCsv(text);
    merged.push(...part.transactions);
    warnings.push(...part.warnings);
    skipped += part.skipped;
  }
  const byId = new Map<string, ParsedAnycoinTransaction>();
  for (const tx of merged) byId.set(tx.external_id, tx);
  const transactions = [...byId.values()];

  const summaryMap: AnycoinParseResult['summary'] = {
    buy: { count: 0, amountSum: 0, unitsSum: 0 },
    sell: { count: 0, amountSum: 0, unitsSum: 0 },
    dividend: { count: 0, amountSum: 0, unitsSum: 0 },
    deposit: { count: 0, amountSum: 0, unitsSum: 0 },
    withdrawal: { count: 0, amountSum: 0, unitsSum: 0 },
    fee: { count: 0, amountSum: 0, unitsSum: 0 },
    promo: { count: 0, amountSum: 0, unitsSum: 0 },
    transfer_out: { count: 0, amountSum: 0, unitsSum: 0 },
    gift: { count: 0, amountSum: 0, unitsSum: 0 },
  };
  for (const tx of transactions) {
    summaryMap[tx.type].count += 1;
    summaryMap[tx.type].amountSum += tx.amount;
    summaryMap[tx.type].unitsSum += Math.abs(tx.units ?? 0);
  }

  const parseResult: AnycoinParseResult = {
    transactions,
    skipped,
    warnings,
    summary: summaryMap,
  };

  const emptySummary = (): BrokerImportSummary => ({
    fileCount: params.csvTexts.length,
    upserted: 0,
    newCount: 0,
    openPositions: 0,
    hasOrphanSells: false,
    hasCompleteData: parseResult.summary.buy.count > 0,
  });

  if (transactions.length === 0) {
    logAnycoinParseSummary(parseResult);
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: new Error('V CSV nebyly nalezeny žádné Anycoin transakce.'),
    };
  }

  const { portfolioId, error: portfolioErr } = await findOrCreateAnycoinPortfolio(
    {
      ownerUserId: params.ownerUserId,
      visibility: params.visibility ?? 'personal',
      householdId: params.householdId ?? null,
      portfolioName: params.portfolioName ?? 'Anycoin',
    },
    client,
  );
  if (portfolioErr || !portfolioId) {
    logAnycoinParseSummary(parseResult);
    return {
      parseResult,
      portfolioId: null,
      upserted: 0,
      summary: emptySummary(),
      error: portfolioErr,
    };
  }

  const existingIds = await countExistingExternalIds(
    portfolioId,
    transactions.map((t) => t.external_id),
    client,
  );

  const { upserted, error } = await upsertInvestmentTransactionsRemote(
    portfolioId,
    transactions.map(anycoinToParsedEtoro),
    params.importBatchId,
    client,
  );

  logAnycoinParseSummary(parseResult);

  if (error) {
    return {
      parseResult,
      portfolioId,
      upserted: 0,
      summary: emptySummary(),
      error,
    };
  }

  const openPositions = await countOpenPositionsFromTxs(portfolioId, 'CZK', client);
  const summary: BrokerImportSummary = {
    fileCount: params.csvTexts.length,
    upserted,
    newCount: Math.max(0, transactions.length - existingIds),
    openPositions,
    hasOrphanSells: false,
    hasCompleteData: parseResult.summary.buy.count > 0,
  };

  console.log(
    `[anycoin import] Upserted ${upserted} rows into portfolio ${portfolioId} (files=${params.csvTexts.length}, new=${summary.newCount}).`,
  );

  return { parseResult, portfolioId, upserted, summary, error: null };
}

/** Note marker for deposit auto-created with a manual buy (UX paired cash). */
export const AUTO_PAIRED_DEPOSIT_NOTE = '[auto-deposit] paired with buy';

export type ManualTransactionFormKind =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'deposit'
  | 'withdraw'
  | 'gift';

export type ManualTransactionInput = {
  portfolioId: string;
  broker: InvestmentBroker;
  kind: ManualTransactionFormKind;
  ticker?: string | null;
  isin?: string | null;
  units?: number | null;
  /** Cena za kus (nákup/prodej) — amount = units × pricePerUnit. */
  pricePerUnit?: number | null;
  /** Absolutní částka (vklad/dividenda/výběr peněz). */
  amount?: number | null;
  currency: string;
  date: string;
  note?: string | null;
  /**
   * Jen u kind=buy: spolu s nákupem uložit deposit (stejné datum + částka).
   * Default false na API; UI checkbox defaultně zapnutý.
   */
  pairedDepositWithBuy?: boolean;
};

function isCryptoBroker(broker: InvestmentBroker): boolean {
  return broker === 'anycoin';
}

function buildManualExternalId(parts: {
  portfolioId: string;
  type: string;
  ticker: string;
  date: string;
  units: number;
  amount: number;
  currency: string;
  seq: number;
}): string {
  const t = parts.ticker.trim().toUpperCase() || '-';
  const u = Number.isFinite(parts.units) ? parts.units : 0;
  const a = Number.isFinite(parts.amount) ? parts.amount : 0;
  return [
    'manual',
    parts.portfolioId.replace(/-/g, '').slice(0, 12),
    parts.type,
    parts.date,
    t,
    String(u),
    String(a),
    parts.currency.trim().toUpperCase() || 'USD',
    String(parts.seq),
  ].join(':');
}

/**
 * Ruční transakce (source=manual). Reimport CSV ji nepřepíše (unikátní external_id).
 * Výběr: krypto → transfer_out; peníze → withdrawal.
 */
export async function insertManualInvestmentTransaction(
  input: ManualTransactionInput,
  client: SupabaseClient = defaultSupabase,
): Promise<{ inserted: number; error: Error | null }> {
  const date = input.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { inserted: 0, error: new Error('Neplatné datum.') };
  }
  const currency = (input.currency || 'USD').trim().toUpperCase() || 'USD';
  const tickerRaw = (input.ticker ?? '').trim().toUpperCase() || null;
  const isin = (input.isin ?? '').trim().toUpperCase() || null;
  const note = (input.note ?? '').trim() || null;
  const units = input.units != null && Number.isFinite(input.units) ? Math.abs(input.units) : 0;
  const pricePerUnit =
    input.pricePerUnit != null && Number.isFinite(input.pricePerUnit)
      ? Math.abs(input.pricePerUnit)
      : 0;
  const amountRaw =
    input.amount != null && Number.isFinite(input.amount) ? Math.abs(input.amount) : 0;

  let type: InvestmentTransactionRow['type'];
  let amount = 0;
  let price_per_unit: number | null = null;
  let unitsOut: number | null = null;
  let ticker: string | null = tickerRaw;

  switch (input.kind) {
    case 'buy':
    case 'sell': {
      if (!(units > 0) || !(pricePerUnit > 0)) {
        return { inserted: 0, error: new Error('Nákup/prodej vyžaduje počet i cenu za kus.') };
      }
      if (!ticker) {
        return { inserted: 0, error: new Error('Zadej ticker / aktivum.') };
      }
      type = input.kind;
      amount = Math.round(units * pricePerUnit * 1e8) / 1e8;
      price_per_unit = pricePerUnit;
      unitsOut = units;
      break;
    }
    case 'gift': {
      if (!(units > 0)) {
        return { inserted: 0, error: new Error('Příjem/dar vyžaduje počet jednotek.') };
      }
      if (!ticker) {
        return { inserted: 0, error: new Error('Zadej ticker / aktivum.') };
      }
      type = 'gift';
      amount = 0;
      price_per_unit = 0;
      unitsOut = units;
      break;
    }
    case 'deposit':
    case 'dividend': {
      if (!(amountRaw > 0)) {
        return { inserted: 0, error: new Error('Zadej částku.') };
      }
      type = input.kind;
      amount = amountRaw;
      unitsOut = null;
      ticker = input.kind === 'dividend' ? ticker : null;
      break;
    }
    case 'withdraw': {
      if (isCryptoBroker(input.broker) && units > 0 && ticker) {
        type = 'transfer_out';
        amount = amountRaw > 0 ? amountRaw : 0;
        unitsOut = units;
        price_per_unit = null;
      } else if (amountRaw > 0) {
        type = 'withdrawal';
        amount = amountRaw;
        unitsOut = units > 0 ? units : null;
      } else if (units > 0 && ticker) {
        type = 'transfer_out';
        amount = 0;
        unitsOut = units;
      } else {
        return {
          inserted: 0,
          error: new Error('Výběr: zadej částku (peníze) nebo počet + aktivum (krypto).'),
        };
      }
      break;
    }
    default:
      return { inserted: 0, error: new Error('Neznámý typ transakce.') };
  }

  const seq = Date.now();
  const external_id = buildManualExternalId({
    portfolioId: input.portfolioId,
    type,
    ticker: ticker ?? '',
    date,
    units: unitsOut ?? 0,
    amount,
    currency,
    seq,
  });

  const fee = 0;
  const row = {
    portfolio_id: input.portfolioId,
    type,
    ticker,
    isin,
    units: unitsOut,
    price_per_unit,
    amount,
    fee,
    original_currency: currency,
    date,
    external_id,
    source: 'manual' as const,
    ...(note ? { note } : {}),
  };

  const rows: Record<string, unknown>[] = [row];

  // UX: nákup + „poslal jsem peníze zároveň“ → auto deposit (stejný den, částka + fee).
  // Nemění výpočty — jen doplní cashflow, ať cash_balance není záporná.
  if (input.kind === 'buy' && input.pairedDepositWithBuy === true && amount > 0) {
    const depositAmount = Math.round((amount + fee) * 1e8) / 1e8;
    const depositExternalId = buildManualExternalId({
      portfolioId: input.portfolioId,
      type: 'deposit',
      ticker: '',
      date,
      units: 0,
      amount: depositAmount,
      currency,
      seq: seq + 1,
    });
    rows.push({
      portfolio_id: input.portfolioId,
      type: 'deposit',
      ticker: null,
      isin: null,
      units: null,
      price_per_unit: null,
      amount: depositAmount,
      fee: 0,
      original_currency: currency,
      date,
      external_id: depositExternalId,
      source: 'manual',
      note: AUTO_PAIRED_DEPOSIT_NOTE,
    });
  }

  const { error } = await client.from('investment_transactions').insert(rows);
  if (error) {
    console.error('[manual] insert failed', error.message);
    return { inserted: 0, error: new Error(error.message) };
  }

  const accountCurrency =
    input.broker === 'etoro'
      ? 'USD'
      : input.broker === 'anycoin'
        ? 'CZK'
        : currency === 'CZK' || currency === 'EUR' || currency === 'USD'
          ? currency
          : 'EUR';
  await syncPortfolioCashFromTransactions(
    input.portfolioId,
    accountCurrency as 'USD' | 'EUR' | 'CZK',
    client,
  );

  console.log(
    `[manual] uloženo type=${type} ticker=${ticker ?? '-'} units=${unitsOut ?? 0} amount=${amount} ${currency} portfolio=${input.portfolioId}` +
      (rows.length > 1 ? ` +auto-deposit=${rows[1]!.amount}` : ''),
  );
  return { inserted: rows.length, error: null };
}
