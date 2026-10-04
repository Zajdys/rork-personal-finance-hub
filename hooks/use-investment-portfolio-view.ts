import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InvestmentBroker, InvestmentPortfolio, InvestmentPosition } from '@/lib/investment-portfolios';
import {
  buildPortfolioResultForDisplay,
  loadMultiPortfolioDataLayer,
  recomputePortfolioCoreForDisplay,
  dividendsByTickerFromResult,
  resolvePortfolioAccountCurrency,
  type DisplayCurrency,
  type PortfolioCalcResult,
  type PortfolioDataLayer,
} from '@/lib/investment-portfolio-calc';
import {
  applyTaggedBrokerFilterToResults,
  type BrokerFilter,
} from '@/lib/investment-portfolio-display';
import {
  fetchInvestmentTransactionsRemote,
  mapTransactionRowToCalc,
  type InvestmentTransactionRow,
} from '@/lib/investment-transactions';
import { supabase } from '@/lib/supabase';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import {
  upsertTodayPortfolioSnapshots,
} from '@/lib/portfolio-snapshots';
import {
  backfillAllPortfolioSnapshots,
} from '@/lib/portfolio-snapshots-backfill';
import {
  getCachedFxRate,
  peekCachedNativeQuote,
  prefetchDisplayFxRates,
  prefetchFxRatesFromQuoteCurrencies,
} from '@/lib/yahoo-ticker';
import {
  investPerfEnd,
  investPerfMark,
  investPerfSpan,
  investPerfStart,
} from '@/lib/invest-perf';
import {
  buildPortfolioViewCacheKey,
  isPortfolioViewCacheFresh,
  useInvestmentPortfolioViewStore,
  type InvestmentPortfolioViewSource,
  type MultiPortfolioViewData,
  type PositionsDataLayer,
  type PortfolioViewCacheEntry,
  type PortfolioViewData,
} from '@/store/investment-portfolio-view-store';

const DEBUG_ETORO_PERSONAL_ID = '9cfcc7cb-82df-4050-b28b-691d10f2fe72';

export type InvestmentPortfolioView = {
  source: InvestmentPortfolioViewSource;
  result: PortfolioCalcResult | null;
  dividendsByTicker: { ticker: string; amount: number }[];
  calcLoading: boolean;
  quotesLoading: boolean;
  calcError: string | null;
  quotesError: string | null;
  hasTransactions: boolean;
  isEmpty: boolean;
  availableBrokers: InvestmentBroker[];
  /** Aktuální broker filtr má kompletní nákupy a kurzy (false = neúplná data). */
  hasCompleteData: boolean;
  /** Chybějící ČNB kurzy — součty jsou neúplné. */
  incompleteFx: { count: number; currencies: string[] } | null;
  /** Inkrementuje se po zápisu denních portfolio snapshotů. */
  snapshotTick: number;
  /** Probíhá backfill historie snapshotů. */
  historyLoading: boolean;
};

function convertAmount(amount: number, from: string, to: DisplayCurrency): number | null {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (f === t) return amount;
  const rate = getCachedFxRate(f, t);
  if (rate == null || !(rate > 0)) {
    if (__DEV__) console.warn(`[invest-view FX] missing rate ${f}→${t} for amount ${amount} — not treated as ${t}`);
    return null;
  }
  return Math.round(amount * rate * 100) / 100;
}

function positionInvestedBase(p: InvestmentPosition): { amount: number; currency: DisplayCurrency } {
  if (p.invested_usd != null) return { amount: p.invested_usd, currency: 'USD' };
  if (p.invested_eur != null) return { amount: p.invested_eur, currency: 'EUR' };
  const code = p.currency?.toUpperCase();
  if (code === 'CZK' || code === 'EUR' || code === 'USD') {
    return { amount: 0, currency: code };
  }
  return { amount: 0, currency: 'EUR' };
}

function buildPositionsResultForDisplay(
  layer: PositionsDataLayer,
  displayCurrency: DisplayCurrency,
): PortfolioCalcResult {
  const mapped = layer.positions.map((p) => {
    const { amount: investedRaw, currency: investedCurrency } = positionInvestedBase(p);
    const investedConv = convertAmount(investedRaw, investedCurrency, displayCurrency);
    const invested = investedConv ?? 0;
    const investedOk = investedConv != null || investedRaw === 0;
    const storedValueUsd = p.current_value_usd;
    const storedValueEur = p.current_value_eur;
    const nativeQuote = layer.nativePrices.get(p.ticker);
    const livePrice =
      nativeQuote != null
        ? convertAmount(nativeQuote.price, nativeQuote.currency, displayCurrency)
        : p.current_price != null
          ? convertAmount(p.current_price, investedCurrency, displayCurrency)
          : null;
    const currentValue =
      livePrice != null
        ? Math.round(p.units * livePrice * 100) / 100
        : storedValueUsd != null
          ? convertAmount(storedValueUsd, 'USD', displayCurrency)
          : storedValueEur != null
            ? convertAmount(storedValueEur, 'EUR', displayCurrency)
            : null;
    const unrealized =
      currentValue != null && investedOk
        ? Math.round((currentValue - invested) * 100) / 100
        : null;
    const unrealizedPct =
      invested > 0 && unrealized != null
        ? Math.round((unrealized / invested) * 10000) / 100
        : null;

    return {
      ticker: p.ticker,
      isin: null,
      held_units: p.units,
      invested: Math.round(invested * 100) / 100,
      realized_pnl: 0,
      dividends: 0,
      current_price: livePrice != null ? Math.round(livePrice * 100) / 100 : null,
      current_value: currentValue,
      unrealized_pnl: unrealized,
      unrealized_pnl_pct: unrealizedPct,
      display_currency: displayCurrency,
    };
  });

  mapped.sort((a, b) => (b.current_value ?? b.invested) - (a.current_value ?? a.invested));

  const totalInvested = mapped.reduce((s, p) => s + p.invested, 0);
  const marketValuePositions = mapped.reduce((s, p) => s + (p.current_value ?? 0), 0);
  const totalUnrealized = mapped.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);
  const cashBalance = 0;

  return {
    positions: mapped,
    summary: {
      total_deposits: Math.round(totalInvested * 100) / 100,
      total_deposits_gross: Math.round(totalInvested * 100) / 100,
      total_withdrawals: 0,
      net_contributed: Math.round(totalInvested * 100) / 100,
      cash_balance: cashBalance,
      market_value_positions: Math.round(marketValuePositions * 100) / 100,
      total_invested: Math.round(totalInvested * 100) / 100,
      total_current_value: Math.round((cashBalance + marketValuePositions) * 100) / 100,
      total_dividends: 0,
      total_realized_pnl: 0,
      total_unrealized_pnl: Math.round(totalUnrealized * 100) / 100,
      total_return: Math.round((cashBalance + marketValuePositions - totalInvested) * 100) / 100,
      total_return_pct:
        totalInvested > 0
          ? Math.round(((cashBalance + marketValuePositions - totalInvested) / totalInvested) * 10000) / 100
          : null,
      display_currency: displayCurrency,
    },
  };
}

function resultForPortfolioEntry(
  data: MultiPortfolioViewData,
  portfolioId: string,
  displayCurrency: DisplayCurrency,
): PortfolioCalcResult | null {
  const txLayer = data.transactionLayers[portfolioId];
  if (txLayer) return buildPortfolioResultForDisplay(txLayer, displayCurrency);
  const posLayer = data.positionLayers[portfolioId];
  if (posLayer) return buildPositionsResultForDisplay(posLayer, displayCurrency);
  return null;
}

/** Net worth v USD pro denní snapshot (jen portfolia s kompletními cenami / 7denní fill). */
function collectUsdNetWorthSnapshots(
  data: MultiPortfolioViewData,
): { portfolioId: string; totalValueUsd: number }[] {
  const out: { portfolioId: string; totalValueUsd: number }[] = [];
  for (const entry of data.entries) {
    const txLayer = data.transactionLayers[entry.portfolioId];
    const incomplete = txLayer?.incompleteSnapshotTickers ?? [];
    if (incomplete.length > 0) {
      const first = incomplete[0]!;
      const others = incomplete.length - 1;
      if (__DEV__) {
        console.log(
          `[snapshot] SKIP dnes portfolio=${entry.broker}: chybí cena pro ${first}` +
            (others > 0 ? ` (a ${others} dalších)` : '') +
            ' (soft fallback jen pro hlavičku)',
        );
      }
      continue;
    }

    const result = resultForPortfolioEntry(data, entry.portfolioId, 'USD');
    if (!result) continue;
    const missing = result.positions.filter(
      (p) => p.held_units > 1e-9 && (p.current_value == null || p.current_price == null),
    );
    if (missing.length > 0) {
      const first = missing[0]!.ticker;
      const others = missing.length - 1;
      if (__DEV__) {
        console.log(
          `[snapshot] SKIP dnes portfolio=${entry.broker}: chybí cena pro ${first}` +
            (others > 0 ? ` (a ${others} dalších)` : ''),
        );
      }
      continue;
    }
    out.push({
      portfolioId: entry.portfolioId,
      totalValueUsd: result.summary.total_current_value,
    });
  }
  return out;
}

function buildFilteredResult(
  viewData: PortfolioViewData | null,
  brokerFilter: BrokerFilter,
  displayCurrency: DisplayCurrency,
  portfolios: InvestmentPortfolio[],
): {
  result: PortfolioCalcResult | null;
  hasCompleteData: boolean;
  incompleteFx: { count: number; currencies: string[] } | null;
} {
  if (!viewData) return { result: null, hasCompleteData: true, incompleteFx: null };

  if (viewData.kind === 'multi') {
    const { data } = viewData;
    const relevantEntries =
      brokerFilter === 'all'
        ? data.entries
        : data.entries.filter((e) => e.broker === brokerFilter);

    const tagged = relevantEntries
      .map((e) => {
        const result = resultForPortfolioEntry(data, e.portfolioId, displayCurrency);
        if (!result) return null;
        return {
          result,
          hasCompleteData: e.hasCompleteData,
          entry: e,
        };
      })
      .filter(
        (
          t,
        ): t is {
          result: PortfolioCalcResult;
          hasCompleteData: boolean;
          entry: (typeof data.entries)[number];
        } => t != null,
      );

    if (brokerFilter === 'all' && tagged.length > 0) {
      if (__DEV__) {
        console.log('[invest-all aggregate]', {
          displayCurrency,
          brokers: tagged.map((t) => {
            const s = t.result.summary;
            const layer = data.transactionLayers[t.entry.portfolioId];
            return {
              broker: t.entry.broker,
              portfolioId: t.entry.portfolioId,
              hasCompleteData: t.hasCompleteData,
              accountCurrency: t.entry.accountCurrency,
              deposits_native: layer?.core.totalDeposits ?? null,
              withdrawals_native: layer?.core.totalWithdrawals ?? null,
              cash_native: layer?.core.cashBalance ?? null,
              deposits_display: s.total_deposits,
              withdrawals_display: s.total_withdrawals,
              cash_display: s.cash_balance,
              market_display: s.market_value_positions,
              net_worth_display: s.total_current_value,
              return_display: s.total_return,
              fx_usd_eur: getCachedFxRate('USD', 'EUR'),
              fx_eur_usd: getCachedFxRate('EUR', 'USD'),
            };
          }),
        });
      }
    }

    let fxCount = 0;
    const fxCurrencies = new Set<string>();
    for (const t of tagged) {
      const fromEntry = t.entry.incompleteFx;
      const layer = data.transactionLayers[t.entry.portfolioId];
      const fromCore = layer?.core;
      const count = Math.max(fromEntry?.count ?? 0, fromCore?.incompleteFxCount ?? 0);
      if (count <= 0) continue;
      fxCount += count;
      for (const c of fromEntry?.currencies ?? []) fxCurrencies.add(c);
      for (const c of fromCore?.incompleteFxCurrencies ?? []) fxCurrencies.add(c);
    }
    const incompleteFx =
      fxCount > 0 ? { count: fxCount, currencies: [...fxCurrencies].sort() } : null;

    // hasCompleteData false i při chybějícím display FX (nejen chybějící buy).
    const hasCompleteDataResolved =
      incompleteFx != null
        ? false
        : brokerFilter === 'all'
          ? tagged.some((t) => t.hasCompleteData)
          : tagged.length > 0 && tagged.every((t) => t.hasCompleteData);

    const result = applyTaggedBrokerFilterToResults(
      tagged.map(({ result, hasCompleteData }) => ({ result, hasCompleteData })),
      brokerFilter,
      displayCurrency,
    );

    if (brokerFilter === 'all' && result) {
      if (__DEV__) {
        console.log('[invest-all aggregate totals]', {
          displayCurrency,
          deposits: result.summary.total_deposits,
          withdrawals: result.summary.total_withdrawals,
          cash: result.summary.cash_balance,
          market: result.summary.market_value_positions,
          net_worth: result.summary.total_current_value,
          return: result.summary.total_return,
          pct: result.summary.total_return_pct,
          positions: result.positions.length,
        });
      }
    }

    return {
      result,
      hasCompleteData: hasCompleteDataResolved,
      incompleteFx,
    };
  }

  if (viewData.kind === 'transactions') {
    const result = buildPortfolioResultForDisplay(viewData.data, displayCurrency);
    const fxCount = viewData.data.core.incompleteFxCount;
    const incompleteFx =
      fxCount > 0
        ? { count: fxCount, currencies: viewData.data.core.incompleteFxCurrencies }
        : null;
    if (brokerFilter === 'all') {
      return { result, hasCompleteData: incompleteFx == null, incompleteFx };
    }
    const pf = portfolios.find((p) => p.broker === brokerFilter);
    if (!pf) return { result: null, hasCompleteData: true, incompleteFx: null };
    return { result, hasCompleteData: incompleteFx == null, incompleteFx };
  }

  return {
    result: buildPositionsResultForDisplay(viewData.data, displayCurrency),
    hasCompleteData: true,
    incompleteFx: null,
  };
}

function groupTransactionsByPortfolio(
  rows: InvestmentTransactionRow[],
): Map<string, ReturnType<typeof mapTransactionRowToCalc>[]> {
  const map = new Map<string, ReturnType<typeof mapTransactionRowToCalc>[]>();
  for (const row of rows) {
    const list = map.get(row.portfolio_id) ?? [];
    list.push(mapTransactionRowToCalc(row));
    map.set(row.portfolio_id, list);
  }
  return map;
}

function groupPositionsByPortfolio(
  positions: InvestmentPosition[],
): Map<string, InvestmentPosition[]> {
  const map = new Map<string, InvestmentPosition[]>();
  for (const p of positions) {
    const list = map.get(p.portfolio_id) ?? [];
    list.push(p);
    map.set(p.portfolio_id, list);
  }
  return map;
}

function applyCacheEntry(entry: PortfolioViewCacheEntry): {
  source: InvestmentPortfolioViewSource;
  viewData: PortfolioViewData;
  hasTransactions: boolean;
  quotesError: string | null;
} {
  return {
    source: entry.source,
    viewData: entry.viewData,
    hasTransactions: entry.hasTransactions,
    quotesError: entry.quotesError,
  };
}

function resolveViewSource(data: MultiPortfolioViewData): InvestmentPortfolioViewSource {
  if (data.entries.some((e) => e.source === 'transactions')) return 'transactions';
  return 'positions';
}

/** Okamžitý paint z DB pozic + posledních známých cen (cache / current_price). */
function buildQuickViewFromStoredPositions(
  portfolios: InvestmentPortfolio[],
  positions: InvestmentPosition[],
): MultiPortfolioViewData | null {
  if (positions.length === 0 || portfolios.length === 0) return null;
  const byPf = groupPositionsByPortfolio(positions);
  const entries: MultiPortfolioViewData['entries'] = [];
  const positionLayers: MultiPortfolioViewData['positionLayers'] = {};

  for (const pf of portfolios) {
    const pfPos = byPf.get(pf.id) ?? [];
    if (pfPos.length === 0) continue;
    const accountCurrency = resolvePortfolioAccountCurrency(pf);
    const nativePrices = new Map<string, { price: number; currency: string } | null>();
    for (const p of pfPos) {
      if ((Number(p.units) || 0) <= 1e-9) continue;
      const cached = peekCachedNativeQuote(p.ticker, null);
      if (cached) {
        nativePrices.set(p.ticker, cached);
      } else if (p.current_price != null && p.current_price > 0) {
        const ccy = (p.currency || accountCurrency).toUpperCase();
        nativePrices.set(p.ticker, { price: p.current_price, currency: ccy });
      }
    }
    positionLayers[pf.id] = { accountCurrency, positions: pfPos, nativePrices };
    entries.push({
      portfolioId: pf.id,
      broker: pf.broker,
      name: pf.name,
      accountCurrency,
      source: 'positions',
      hasCompleteData: true,
    });
  }
  if (entries.length === 0) return null;
  return { entries, transactionLayers: {}, positionLayers };
}

export function useInvestmentPortfolioView(params: {
  enabled: boolean;
  userId?: string | null;
  portfolios: InvestmentPortfolio[];
  storedPositions: InvestmentPosition[];
  displayCurrency: DisplayCurrency;
  brokerFilter: BrokerFilter;
}): InvestmentPortfolioView & { refresh: () => Promise<void>; ensureFresh: () => void } {
  const { enabled, userId, portfolios, storedPositions, displayCurrency, brokerFilter } = params;

  const portfoliosRef = useRef(portfolios);
  const storedPositionsRef = useRef(storedPositions);
  portfoliosRef.current = portfolios;
  storedPositionsRef.current = storedPositions;

  const portfolioIdsKey = useMemo(
    () => [...portfolios.map((p) => p.id)].sort().join(','),
    [portfolios],
  );

  const portfolioMetaKey = useMemo(
    () =>
      portfolios
        .map((p) => `${p.id}:${p.broker}:${p.currency}`)
        .sort()
        .join('|'),
    [portfolios],
  );

  const positionsKey = useMemo(
    () =>
      storedPositions
        .map((p) => `${p.id}:${p.updated_at}`)
        .sort()
        .join('|'),
    [storedPositions],
  );

  const cacheKey = useMemo(() => {
    if (!userId) return '';
    return buildPortfolioViewCacheKey({
      userId,
      portfolioIdsKey,
      portfolioMetaKey,
      positionsKey,
    });
  }, [userId, portfolioIdsKey, portfolioMetaKey, positionsKey]);

  const cachedEntry = useInvestmentPortfolioViewStore((s) =>
    s.entry?.cacheKey === cacheKey ? s.entry : null,
  );
  const refreshNonce = useInvestmentPortfolioViewStore((s) => s.refreshNonce);
  const setCacheEntry = useInvestmentPortfolioViewStore((s) => s.setEntry);

  const [source, setSource] = useState<InvestmentPortfolioViewSource>(
    cachedEntry?.source ?? 'transactions',
  );
  const [viewData, setViewData] = useState<PortfolioViewData | null>(
    cachedEntry?.viewData ?? null,
  );
  const [calcLoading, setCalcLoading] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [quotesError, setQuotesError] = useState<string | null>(cachedEntry?.quotesError ?? null);
  const [hasTransactions, setHasTransactions] = useState(cachedEntry?.hasTransactions ?? false);
  /** Bump after FX prefetch so display přepočet znovu doběhne s kurzy v cache. */
  const [fxRevision, setFxRevision] = useState(0);
  /** Bump po zápisu denních snapshotů — graf si znovu načte data. */
  const [snapshotTick, setSnapshotTick] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const backfillInFlightRef = useRef(false);
  const runIdRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const lastHandledRefreshNonceRef = useRef(refreshNonce);

  const runBackgroundBackfill = useCallback(
    async (portfoliosSnapshot: InvestmentPortfolio[], runId: number) => {
      if (backfillInFlightRef.current) return;
      if (portfoliosSnapshot.length === 0) return;

      backfillInFlightRef.current = true;
      setHistoryLoading(true);
      try {
        const ids = portfoliosSnapshot.map((p) => p.id);
        const { transactions: rows, error: txErr } = await fetchInvestmentTransactionsRemote(
          ids.length > 0 ? ids : undefined,
        );
        if (runId !== runIdRef.current) return;
        if (txErr) {
          if (__DEV__) console.warn('[backfill] txs fetch failed', txErr.message);
          return;
        }
        const byPf = groupTransactionsByPortfolio(rows);
        const inputs = portfoliosSnapshot
          .map((pf) => ({
            portfolioId: pf.id,
            broker: pf.broker,
            transactions: byPf.get(pf.id) ?? [],
          }))
          .filter((p) => p.transactions.length > 0);

        if (inputs.length === 0) return;

        const res = await backfillAllPortfolioSnapshots(inputs);
        if (runId !== runIdRef.current) return;
        if (res.totalWritten > 0) setSnapshotTick((n) => n + 1);
      } catch (e) {
        if (__DEV__) console.warn('[backfill] background failed', e);
      } finally {
        backfillInFlightRef.current = false;
        if (runId === runIdRef.current) setHistoryLoading(false);
      }
    },
    [],
  );

  const availableBrokers = useMemo((): InvestmentBroker[] => {
    const fromView =
      viewData?.kind === 'multi'
        ? viewData.data.entries.map((e) => e.broker)
        : portfolios.map((p) => p.broker);
    return [...new Set(fromView.length > 0 ? fromView : portfolios.map((p) => p.broker))];
  }, [viewData, portfolios]);

  const filtered = useMemo(
    () => buildFilteredResult(viewData, brokerFilter, displayCurrency, portfolios),
    // fxRevision: po prefetchDisplayFxRates musíme přepočítat USD→EUR
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fxRevision is intentional
    [viewData, brokerFilter, displayCurrency, portfolios, fxRevision],
  );
  const result = filtered.result;
  const hasCompleteData = filtered.hasCompleteData;
  const incompleteFx = filtered.incompleteFx;

  const persistEntry = useCallback(
    (partial: {
      source: InvestmentPortfolioViewSource;
      viewData: PortfolioViewData | null;
      hasTransactions: boolean;
      quotesError: string | null;
    }) => {
      if (!cacheKey || !partial.viewData) return;
      setCacheEntry({
        cacheKey,
        fetchedAt: Date.now(),
        source: partial.source,
        viewData: partial.viewData,
        hasTransactions: partial.hasTransactions,
        quotesError: partial.quotesError,
      });
    },
    [cacheKey, setCacheEntry],
  );

  const loadPortfolio = useCallback(
    async (options: { background: boolean; force: boolean }) => {
      if (!enabled || !userId || !cacheKey) return;
      if (loadInFlightRef.current && !options.force) return;

      const runId = ++runIdRef.current;
      loadInFlightRef.current = true;
      const perfId = investPerfStart(
        options.background ? 'invest-bg' : options.force ? 'invest-force' : 'invest-load',
      );

      const portfoliosSnapshot = portfoliosRef.current;
      const storedPositionsSnapshot = storedPositionsRef.current;
      const allPortfolioIds = portfoliosSnapshot.map((p) => p.id);

      if (!options.background) {
        setCalcLoading(true);
        setQuotesLoading(false);
        setCalcError(null);
        if (!options.force) {
          setQuotesError(null);
          setViewData(null);
        }
        // První paint hned z DB pozic + last-known ceny (nečekej na txs/Yahoo/ČNB edge).
        const quick = buildQuickViewFromStoredPositions(
          portfoliosSnapshot,
          storedPositionsSnapshot,
        );
        if (quick) {
          setViewData({ kind: 'multi', data: quick });
          setSource('positions');
          setCalcLoading(false);
          setQuotesLoading(true);
          investPerfMark('0_db_positions_first_paint', {
            entries: quick.entries.length,
            positions: storedPositionsSnapshot.length,
          });
        }
      } else {
        setQuotesLoading(true);
      }

      try {
        const { transactions: rows, error: txErr } = await investPerfSpan(
          '1_txs_supabase',
          () =>
            fetchInvestmentTransactionsRemote(
              allPortfolioIds.length > 0 ? allPortfolioIds : undefined,
            ),
          { portfolioCount: allPortfolioIds.length },
        );
        if (runId !== runIdRef.current) return;

        if (__DEV__) {
          console.log('[invest-portfolio-view] txs loaded', {
            total: rows.length,
            etoroPersonal: rows.filter((r) => r.portfolio_id === DEBUG_ETORO_PERSONAL_ID).length,
            portfolioIds: allPortfolioIds,
            txErr: txErr?.message ?? null,
            background: options.background,
          });
        }

        if (txErr) {
          if (!options.background) {
            setCalcError(logAndGetUserFacingError('invest-portfolio-txs', txErr));
            setCalcLoading(false);
          }
          return;
        }

        setHasTransactions(rows.length > 0);

        const txsByPortfolio = groupTransactionsByPortfolio(rows);
        const positionsByPortfolio = groupPositionsByPortfolio(storedPositionsSnapshot);

        const hasAnyData =
          rows.length > 0 ||
          storedPositionsSnapshot.length > 0 ||
          portfoliosSnapshot.length > 0;

        if (!hasAnyData) {
          setViewData(null);
          setCalcLoading(false);
          setQuotesLoading(false);
          useInvestmentPortfolioViewStore.getState().clearEntry();
          return;
        }

        // FX dřív než jakýkoli display přepočet (jinak USD částky = „EUR“ bez kurzu).
        await investPerfSpan('2_yahoo_display_fx_prefetch', () => prefetchDisplayFxRates());
        if (runId !== runIdRef.current) return;
        setFxRevision((n) => n + 1);

        if (!options.background) setQuotesLoading(true);

        // Fáze A: cores z DB kurzů + cached ceny → UI hned (bez Edge/Yahoo sítě).
        let quotesHadErrors = false;
        const multiDataFast = await investPerfSpan(
          '3_multi_layer_fast',
          () =>
            loadMultiPortfolioDataLayer(
              portfoliosSnapshot,
              txsByPortfolio,
              positionsByPortfolio,
              {
                displayCurrency,
                fetchLivePrices: true,
                pricesCacheOnly: true,
                cnbMode: 'db-only',
              },
            ),
          {
            portfolios: portfoliosSnapshot.length,
            txRows: rows.length,
            storedPositions: storedPositionsSnapshot.length,
          },
        );
        if (runId !== runIdRef.current) return;
        {
          const nextViewFast: PortfolioViewData = { kind: 'multi', data: multiDataFast };
          setViewData(nextViewFast);
          setSource(resolveViewSource(multiDataFast));
          setCalcLoading(false);
          investPerfMark('3a_fast_paint', { entries: multiDataFast.entries.length });
        }

        // Fáze B: ČNB Edge ensure + živé Yahoo (bez per-batch UI přepočtů).
        const multiData = await investPerfSpan(
          '3_multi_layer_live',
          () =>
            loadMultiPortfolioDataLayer(
              portfoliosSnapshot,
              txsByPortfolio,
              positionsByPortfolio,
              {
                displayCurrency,
                fetchLivePrices: true,
                pricesCacheOnly: false,
                cnbMode: 'ensure',
              },
            ),
          {
            portfolios: portfoliosSnapshot.length,
            txRows: rows.length,
          },
        );

        if (runId !== runIdRef.current) return;

        for (const entry of multiData.entries) {
          if (entry.source === 'transactions') {
            const layer = multiData.transactionLayers[entry.portfolioId];
            if (!layer) continue;
            const missing = layer.core.openStates.some(
              (s) => s.heldUnits > 0 && !layer.nativePrices.get(s.ticker),
            );
            if (missing) quotesHadErrors = true;

            // Doplň chybějící portfolios.cash_balance z vypočteného cash (T212/eToro import).
            // Jen když core je v měně účtu (ne v CZK zobrazení).
            const pf = portfoliosSnapshot.find((p) => p.id === entry.portfolioId);
            if (
              pf &&
              pf.cash_balance == null &&
              layer.core.baseCurrency === entry.accountCurrency
            ) {
              const cash = layer.core.cashBalance;
              void (async () => {
                const { error } = await supabase
                  .from('investment_portfolios')
                  .update({ cash_balance: cash })
                  .eq('id', entry.portfolioId);
                if (error) {
                  if (__DEV__) console.warn('[invest-portfolio-view] cash_balance backfill failed', error.message);
                } else {
                  if (__DEV__) {
                    console.log(
                      `[invest-portfolio-view] cash_balance backfill → ${cash} (${entry.broker})`,
                    );
                  }
                }
              })();
            }
          } else {
            const layer = multiData.positionLayers[entry.portfolioId];
            if (!layer) continue;
            const missing = layer.positions.some(
              (p) => p.units > 0 && !layer.nativePrices.get(p.ticker),
            );
            if (missing) quotesHadErrors = true;
          }
        }

        await investPerfSpan('4_quote_fx_prefetch', () =>
          prefetchFxRatesFromQuoteCurrencies(
            Object.values(multiData.transactionLayers).flatMap((layer) =>
              [...layer.nativePrices.values()]
                .map((q) => q?.currency)
                .filter((c): c is string => Boolean(c)),
            ),
          ),
        );
        if (runId !== runIdRef.current) return;
        setFxRevision((n) => n + 1);

        const nextSource = resolveViewSource(multiData);
        const nextView: PortfolioViewData = { kind: 'multi', data: multiData };
        const nextQuotesError = quotesHadErrors ? 'quotes_partial' : null;

        setSource(nextSource);
        setViewData(nextView);
        setQuotesError(nextQuotesError);
        setQuotesLoading(false);
        setCalcLoading(false);
        investPerfMark('5_ui_quotes_ready', {
          entries: multiData.entries.length,
          quotesHadErrors,
        });
        persistEntry({
          source: nextSource,
          viewData: nextView,
          hasTransactions: rows.length > 0,
          quotesError: nextQuotesError,
        });

        // Denní snapshot na pozadí — neblokuje UI; force při pull-to-refresh.
        const snapshotRows = collectUsdNetWorthSnapshots(multiData);
        if (snapshotRows.length > 0) {
          void upsertTodayPortfolioSnapshots(snapshotRows, { force: options.force }).then(() => {
            if (runId !== runIdRef.current) return;
            setSnapshotTick((n) => n + 1);
          });
        }

        // Backfill chybějících dnů (reuse už načtené txs).
        if (!backfillInFlightRef.current) {
          const backfillInputs = portfoliosSnapshot
            .map((pf) => ({
              portfolioId: pf.id,
              broker: pf.broker,
              transactions: txsByPortfolio.get(pf.id) ?? [],
            }))
            .filter((p) => p.transactions.length > 0);
          if (backfillInputs.length > 0) {
            backfillInFlightRef.current = true;
            setHistoryLoading(true);
            const bfT0 = globalThis.performance?.now?.() ?? Date.now();
            void backfillAllPortfolioSnapshots(backfillInputs)
              .then((res) => {
                if (runId !== runIdRef.current) return;
                const ms = Math.round(((globalThis.performance?.now?.() ?? Date.now()) - bfT0) * 10) / 10;
                if (__DEV__) {
                  console.log(`[invest-perf] bg_history_backfill ${ms}ms`, {
                    written: res.totalWritten,
                    portfolios: backfillInputs.length,
                  });
                }
                if (res.totalWritten > 0) setSnapshotTick((n) => n + 1);
              })
              .finally(() => {
                backfillInFlightRef.current = false;
                if (runId === runIdRef.current) setHistoryLoading(false);
              });
          }
        }
      } catch (e) {
        if (runId !== runIdRef.current) return;
        if (!options.background) {
          setCalcError(logAndGetUserFacingError('invest-portfolio-calc', e));
          setCalcLoading(false);
        }
        setQuotesLoading(false);
      } finally {
        if (runId === runIdRef.current) {
          loadInFlightRef.current = false;
          investPerfEnd(perfId);
        }
      }
    },
    [enabled, userId, cacheKey, persistEntry, displayCurrency],
  );

  /** Při změně měny zobrazení přepočti historický core (ČNB k datu), ceny nech. */
  useEffect(() => {
    if (!viewData || viewData.kind !== 'multi') return;
    const layers = viewData.data.transactionLayers;
    const needs = Object.values(layers).some(
      (l) => l.transactions?.length && l.core.baseCurrency !== displayCurrency,
    );
    if (!needs) return;

    let cancelled = false;
    void (async () => {
      const nextLayers: Record<string, PortfolioDataLayer> = { ...layers };
      for (const [id, layer] of Object.entries(layers)) {
        if (!layer.transactions?.length || layer.core.baseCurrency === displayCurrency) {
          continue;
        }
        nextLayers[id] = await recomputePortfolioCoreForDisplay(layer, displayCurrency);
      }
      if (cancelled) return;
      setViewData({
        kind: 'multi',
        data: { ...viewData.data, transactionLayers: nextLayers },
      });
    })();
    return () => {
      cancelled = true;
    };
    // viewData identity záměrně ne — jen když se mění display nebo baseCurrency nesedí
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayCurrency-driven recompute
  }, [displayCurrency, viewData]);

  useEffect(() => {
    if (!enabled || !userId || !cacheKey) return;

    const forceRefresh = refreshNonce !== lastHandledRefreshNonceRef.current;
    lastHandledRefreshNonceRef.current = refreshNonce;

    const cached = useInvestmentPortfolioViewStore.getState().getEntryForKey(cacheKey);

    if (cached && !forceRefresh) {
      if (__DEV__) {
        console.log('[invest-perf] CACHE_HIT', {
          ageMs: Date.now() - cached.fetchedAt,
          fresh: isPortfolioViewCacheFresh(cached),
        });
      }
      const applied = applyCacheEntry(cached);
      setSource(applied.source);
      setViewData(applied.viewData);
      setHasTransactions(applied.hasTransactions);
      setQuotesError(applied.quotesError);
      setCalcLoading(false);
      setCalcError(null);

      if (isPortfolioViewCacheFresh(cached)) {
        void prefetchDisplayFxRates().then(() => {
          setFxRevision((n) => n + 1);
          if (cached.viewData.kind === 'multi') {
            const rows = collectUsdNetWorthSnapshots(cached.viewData.data);
            if (rows.length > 0) {
              void upsertTodayPortfolioSnapshots(rows).then(() => {
                setSnapshotTick((n) => n + 1);
              });
            }
          }
        });
        void runBackgroundBackfill(portfoliosRef.current, ++runIdRef.current);
        return;
      }

      void loadPortfolio({ background: true, force: false });
      return;
    }

    void loadPortfolio({ background: false, force: forceRefresh });

    return () => {
      runIdRef.current++;
      loadInFlightRef.current = false;
    };
  }, [enabled, userId, cacheKey, refreshNonce, loadPortfolio]);

  /**
   * Force reload po mutaci (manual tx / import / delete portfolio).
   * clearEntry(cacheKey) + await load — NE jen bumpRefresh (ten nečekal na výpočet
   * a TTL cache mohla po focusu znovu nasadit stará data).
   * Snapshot/locked logiku nemění — jen invaliduje view cache a znovu načte txs.
   * Bez bumpRefresh tady: effect by spustil druhý load a runId by zrušil ten awaitěný.
   */
  const refresh = useCallback(async () => {
    if (!enabled || !userId || !cacheKey) return;
    const key = cacheKey;
    if (__DEV__) console.log('[invest-cache] clearEntry', key);
    useInvestmentPortfolioViewStore.getState().clearEntry(key);
    await loadPortfolio({ background: false, force: true });
    if (__DEV__) console.log('[invest-cache] force reload done', key);
  }, [enabled, userId, cacheKey, loadPortfolio]);

  const ensureFresh = useCallback(() => {
    if (!enabled || !userId || !cacheKey) return;
    const cached = useInvestmentPortfolioViewStore.getState().getEntryForKey(cacheKey);
    if (!cached) return;
    if (isPortfolioViewCacheFresh(cached)) return;
    if (loadInFlightRef.current) return;
    void loadPortfolio({ background: true, force: false });
  }, [enabled, userId, cacheKey, loadPortfolio]);

  const dividendsByTicker = result ? dividendsByTickerFromResult(result) : [];
  const isEmpty =
    !calcLoading && !result && !calcError && !hasTransactions && storedPositions.length === 0;

  return {
    source,
    result,
    dividendsByTicker,
    calcLoading,
    quotesLoading,
    calcError,
    quotesError,
    hasTransactions,
    isEmpty,
    availableBrokers,
    hasCompleteData,
    incompleteFx,
    snapshotTick,
    historyLoading,
    refresh,
    ensureFresh,
  };
}
