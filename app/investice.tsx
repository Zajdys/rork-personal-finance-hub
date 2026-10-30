import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Upload,
  Plus,
  MoreVertical,
  TrendingUp,
  PieChart,
  Coins,
  X,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';
import { appLocale } from '@/lib/app-locale';
import { useAuth } from '@/store/auth-store';
import { useInvestmentStore } from '@/store/investment-store';
import { useHouseholdActiveStore } from '@/store/household-active-store';
import { hasSupabaseSession } from '@/lib/supabase-session';
import { CURRENCIES, useSettingsStore, type Currency } from '@/store/settings-store';
import type { InvestmentPortfolio, InvestmentBroker } from '@/lib/investment-portfolios';
import { fetchPortfolioDeleteStats } from '@/lib/investment-portfolios';
import {
  brokerTabLabel,
  INVEST_BROKER_TAB_ORDER,
  type BrokerFilter,
} from '@/lib/investment-portfolio-display';
import { type Portfolio } from '@/lib/trading212-parser';
import {
  InvestmentPortfolioImportSheet,
  type PendingPortfolioImport,
} from '@/components/InvestmentPortfolioImportSheet';
import { fetchYahooPriceInCurrency } from '@/lib/yahoo-ticker';
import { useInvestmentPortfolioView } from '@/hooks/use-investment-portfolio-view';
import {
  buildAllocationSlices,
  PortfolioAllocationPie,
} from '@/components/PortfolioAllocationPie';
import { PortfolioValueChart } from '@/components/PortfolioValueChart';
import { AddInvestmentTransactionSheet } from '@/components/AddInvestmentTransactionSheet';
import type { DisplayCurrency } from '@/lib/investment-portfolio-calc';
import {
  aggregateSnapshotsToSeries,
  fetchPortfolioSnapshots,
  filterSeriesByPeriod,
  type PortfolioValuePoint,
  type SnapshotPeriod,
} from '@/lib/portfolio-snapshots';
import {
  aggregateProfitSeries,
  type ChartSeriesMode,
} from '@/lib/portfolio-chart-series';
import { fetchInvestmentTransactionsRemote } from '@/lib/investment-transactions';
import { sumCashBalancesToCzk } from '@/lib/investment-cash-balances';
import { fetchHistoricalFxToUsd } from '@/lib/yahoo-historical';
import { normalizeTransactionMoney, prefetchDisplayFxRates } from '@/lib/yahoo-ticker';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import {
  formatInvestDeletePortfolioConfirm,
  formatInvestImportSummary,
} from '@/lib/plural-cs';
import { PremiumGateScreen } from '@/components/PremiumGate';
import { ScreenHeader } from '@/components/ScreenHeader';

const GREEN = '#10B981';
const RED = '#EF4444';
const DISPLAY_CURRENCIES: DisplayCurrency[] = ['CZK', 'EUR', 'USD'];

async function fetchPrice(
  ticker: string,
  accountCurrency = 'EUR',
  isin?: string | null,
): Promise<number | null> {
  try {
    return await fetchYahooPriceInCurrency(ticker, accountCurrency, isin);
  } catch (err) {
    console.warn('[Investice fetchPrice]', ticker, err);
    return null;
  }
}

function cardShadowStyle(isDark: boolean) {
  return {
    shadowColor: '#000' as const,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 8,
    elevation: 4,
  };
}

function formatMoney(
  value: number | null | undefined,
  currency: DisplayCurrency,
  locale: string,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const info = CURRENCIES[currency];
  return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} ${info.symbol}`;
}

function formatCashAmount(value: number, currency: string, locale: string): string {
  const ccy = currency.toUpperCase();
  if (ccy === 'CZK' || ccy === 'EUR' || ccy === 'USD') {
    return formatMoney(value, ccy, locale);
  }
  const info = CURRENCIES[ccy as Currency];
  const symbol = info?.symbol ?? ccy;
  return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} ${symbol}`;
}

function formatUnits(units: number, locale: string): string {
  if (!Number.isFinite(units)) return '—';
  if (Number.isInteger(units)) return String(units);
  // Až 8 dp, bez koncových nul (0,00195043).
  return units.toLocaleString(locale, {
    maximumFractionDigits: 8,
    minimumFractionDigits: 0,
  });
}


function canDeletePortfolio(portfolio: InvestmentPortfolio, userId: string | undefined): boolean {
  if (!userId) return false;
  if (portfolio.visibility === 'personal') {
    return portfolio.owner_user_id === userId;
  }
  return true;
}

function InvesticeTabScreenContent() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const numberLocale = appLocale(language);
  const appLang = language === 'en' ? 'en' : 'cs';
  const formatImportSummary = useCallback(
    (summary: { fileCount: number; newCount: number; openPositions: number }) =>
      formatInvestImportSummary(
        {
          files: summary.fileCount,
          newTx: summary.newCount,
          positions: summary.openPositions,
        },
        appLang,
      ),
    [appLang],
  );
  const { investmentCurrency, setInvestmentCurrency } = useSettingsStore();
  const displayCurrency = (
    DISPLAY_CURRENCIES.includes(investmentCurrency as DisplayCurrency)
      ? investmentCurrency
      : 'EUR'
  ) as DisplayCurrency;

  const [importSheetVisible, setImportSheetVisible] = useState(false);
  const [exportGuideVisible, setExportGuideVisible] = useState(false);
  const [addTxSheetVisible, setAddTxSheetVisible] = useState(false);
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>('all');
  const [renameTarget, setRenameTarget] = useState<InvestmentPortfolio | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<SnapshotPeriod>('1M');
  const [chartSeriesMode, setChartSeriesMode] = useState<ChartSeriesMode>('value');
  const [chartPoints, setChartPoints] = useState<PortfolioValuePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const {
    portfolios,
    positions: storedPositions,
    isLoading: storeLoading,
    fetchPortfolios,
    fetchPositions,
    deletePortfolio,
    updatePortfolio,
    importPositions,
    importEtoroTransactions,
    importTrading212Transactions,
    importAnycoinTransactions,
    importRevolutInvestTransactions,
    importXtbTransactions,
  } = useInvestmentStore();
  const { hydrate: hydrateHouseholds, fetchHouseholds } = useHouseholdActiveStore();

  const hasPortfolios = portfolios.length > 0;

  const portfolioView = useInvestmentPortfolioView({
    enabled: Boolean(user?.id) && (hasPortfolios || storedPositions.length > 0),
    userId: user?.id ?? null,
    portfolios,
    storedPositions,
    displayCurrency,
    brokerFilter,
  });

  const brokerTabs = useMemo(() => {
    const available = new Set(portfolioView.availableBrokers);
    for (const p of portfolios) available.add(p.broker);
    return INVEST_BROKER_TAB_ORDER.filter((b) => available.has(b));
  }, [portfolioView.availableBrokers, portfolios]);

  useEffect(() => {
    if (brokerFilter !== 'all' && !brokerTabs.includes(brokerFilter)) {
      setBrokerFilter('all');
    }
  }, [brokerFilter, brokerTabs]);

  const portfoliosForBrokerFilter = useMemo(() => {
    if (brokerFilter === 'all') return portfolios;
    return portfolios.filter((p) => p.broker === brokerFilter);
  }, [portfolios, brokerFilter]);

  const cashBalancesAgg = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const p of portfoliosForBrokerFilter) {
      for (const [ccy, amt] of Object.entries(p.cash_balances ?? {})) {
        if (!Number.isFinite(amt)) continue;
        agg[ccy] = (agg[ccy] ?? 0) + amt;
      }
    }
    const out: Record<string, number> = {};
    for (const [ccy, amt] of Object.entries(agg)) {
      // Zachovej i nulové měny (portfolio v nich mělo pohyb).
      out[ccy] = Math.round(amt * 1e8) / 1e8;
    }
    return out;
  }, [portfoliosForBrokerFilter]);

  const cashBalanceEntries = useMemo(
    () =>
      Object.entries(cashBalancesAgg).sort(([a], [b]) => a.localeCompare(b)),
    [cashBalancesAgg],
  );

  const [cashCzkTotal, setCashCzkTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (cashBalanceEntries.length === 0) {
      setCashCzkTotal(null);
      return;
    }
    void (async () => {
      const sum = await sumCashBalancesToCzk(cashBalancesAgg);
      if (!cancelled) setCashCzkTotal(sum);
    })();
    return () => {
      cancelled = true;
    };
  }, [cashBalancesAgg, cashBalanceEntries.length]);

  /** Portfolio pro ruční tx: konkrétní broker se 1 portfoliem, jinak první match. */
  const manualTxPortfolio = useMemo(() => {
    if (brokerFilter === 'all') return null;
    const list = portfolios.filter((p) => p.broker === brokerFilter);
    return list[0] ?? null;
  }, [portfolios, brokerFilter]);

  const openAddTxSheet = useCallback(() => {
    if (!manualTxPortfolio) {
      Alert.alert(
        t('investAddTransaction'),
        t('investAddTransactionPickBroker'),
      );
      return;
    }
    setAddTxSheetVisible(true);
  }, [manualTxPortfolio, t]);

  const refreshPortfolioView = portfolioView.refresh;
  const ensurePortfolioFresh = portfolioView.ensureFresh;

  const syncInvestmentLists = useCallback(async () => {
    if (!user?.id) return;
    if (!(await hasSupabaseSession())) return;
    await hydrateHouseholds(user.id);
    await fetchHouseholds(user.id);
    await fetchPortfolios(user.id);
    await fetchPositions();
  }, [user?.id, hydrateHouseholds, fetchHouseholds, fetchPortfolios, fetchPositions]);

  const reloadInvestments = useCallback(
    async (options?: { forcePortfolioRefresh?: boolean }) => {
      await syncInvestmentLists();
      if (options?.forcePortfolioRefresh) {
        await refreshPortfolioView();
      } else {
        ensurePortfolioFresh();
      }
    },
    [syncInvestmentLists, refreshPortfolioView, ensurePortfolioFresh],
  );

  const { refresh: refreshInvestments } = useFocusRefresh(
    useCallback(async (opts) => {
      await reloadInvestments({ forcePortfolioRefresh: opts?.force === true });
    }, [reloadInvestments]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshInvestments({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [refreshInvestments]);

  const summary = portfolioView.result?.summary ?? null;
  const positions = portfolioView.result?.positions ?? [];
  const marketValueReady = !portfolioView.quotesLoading;
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (marketValueReady && summary) {
      setPricesUpdatedAt(new Date());
    }
  }, [marketValueReady, summary?.total_current_value, portfolioView.quotesLoading]);
  const pricesUpdatedLabel = useMemo(() => {
    if (!pricesUpdatedAt) return null;
    return pricesUpdatedAt.toLocaleTimeString(numberLocale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [pricesUpdatedAt, numberLocale]);
  const allocationSlices = useMemo(
    () => buildAllocationSlices(positions, t('investOther')),
    [positions, t],
  );

  const chartPortfolioIds = useMemo(() => {
    if (brokerFilter === 'all') return portfolios.map((p) => p.id);
    return portfolios.filter((p) => p.broker === brokerFilter).map((p) => p.id);
  }, [portfolios, brokerFilter]);

  useEffect(() => {
    let cancelled = false;
    if (chartPortfolioIds.length === 0) {
      setChartPoints([]);
      return;
    }

    setChartLoading(true);
    void (async () => {
      const chartT0 = globalThis.performance?.now?.() ?? Date.now();
      const mark = (name: string, detail?: Record<string, unknown>) => {
        if (!__DEV__) return;
        const ms = Math.round(((globalThis.performance?.now?.() ?? Date.now()) - chartT0) * 10) / 10;
        console.log(`[invest-perf] chart +${ms}ms ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
      };
      await prefetchDisplayFxRates();
      mark('chart_fx_prefetch');
      const { rows, error } = await fetchPortfolioSnapshots(chartPortfolioIds);
      if (cancelled) return;
      mark('chart_snapshots_fetch', { rows: rows.length, portfolioIds: chartPortfolioIds.length });
      if (error) {
        console.warn('[investice chart] fetch snapshots', error.message);
        setChartPoints([]);
        setChartLoading(false);
        return;
      }

      let fullSeries: PortfolioValuePoint[];
      if (chartSeriesMode === 'profit') {
        const { transactions: txs, error: txErr } = await fetchInvestmentTransactionsRemote(
          chartPortfolioIds,
        );
        if (cancelled) return;
        mark('chart_profit_txs', { txs: txs?.length ?? 0 });
        if (txErr) {
          console.warn('[investice chart] fetch txs', txErr.message);
        }
        const depositLike = (txs ?? []).filter(
          (tx) => tx.type === 'deposit' || tx.type === 'withdrawal',
        );
        let minDate = rows[0]?.date ?? new Date().toISOString().slice(0, 10);
        let maxDate = minDate;
        for (const r of rows) {
          if (r.date < minDate) minDate = r.date;
          if (r.date > maxDate) maxDate = r.date;
        }
        for (const tx of depositLike) {
          const d = tx.date.slice(0, 10);
          if (d < minDate) minDate = d;
          if (d > maxDate) maxDate = d;
        }
        const currencies = new Set<string>(['USD']);
        for (const tx of depositLike) {
          currencies.add(normalizeTransactionMoney(tx.amount, tx.original_currency).currency);
        }
        const fxByCcy = await fetchHistoricalFxToUsd([...currencies], minDate, maxDate);
        if (cancelled) return;
        mark('chart_profit_hist_fx', { currencies: currencies.size });
        fullSeries = aggregateProfitSeries(
          rows,
          depositLike,
          displayCurrency,
          fxByCcy,
          chartPortfolioIds,
        );
      } else {
        fullSeries = aggregateSnapshotsToSeries(rows, displayCurrency);
      }

      const series = filterSeriesByPeriod(fullSeries, chartPeriod);
      mark('chart_ready', { points: series.length, mode: chartSeriesMode });
      setChartPoints(series);
      setChartLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    chartPortfolioIds,
    displayCurrency,
    chartPeriod,
    chartSeriesMode,
    portfolioView.snapshotTick,
  ]);

  const fetchT212Quotes = useCallback(async (merged: Portfolio) => {
    const accountCurrency = merged.positions[0]?.currency || 'EUR';
    const prices = await Promise.all(
      merged.positions.map((p) =>
        fetchPrice(p.ticker, p.currency || accountCurrency, p.isin),
      ),
    );
    const map: Record<string, number | null> = {};
    merged.positions.forEach((p, i) => {
      map[p.ticker] = prices[i] ?? null;
    });
    return map;
  }, []);

  const handleImportReady = useCallback(
    async (data: PendingPortfolioImport) => {
      if (!user?.id) {
        Alert.alert(t('importPortfolio'), 'Pro uložení portfolia se přihlaste.');
        return;
      }

      if (data.kind === 'etoro-transactions') {
        const { error, summary } = await importEtoroTransactions(user.id, {
          fileContents: data.fileContents,
          portfolioName: data.portfolioName,
          visibility: data.visibility ?? 'personal',
          householdId: data.visibility === 'shared' ? data.householdId ?? null : null,
        });
        if (error) {
          Alert.alert(t('importPortfolio'), error);
          return;
        }
        await reloadInvestments({ forcePortfolioRefresh: true });
        if (summary) {
          Alert.alert(t('importPortfolio'), formatImportSummary(summary));
        }
        return;
      }

      if (data.kind === 'trading212-transactions') {
        const { error, hasOrphanSells, summary } = await importTrading212Transactions(user.id, {
          csvTexts: data.csvTexts,
          portfolioName: data.portfolioName,
          visibility: data.visibility ?? 'personal',
          householdId: data.visibility === 'shared' ? data.householdId ?? null : null,
        });
        if (error) {
          Alert.alert(t('importPortfolio'), error);
          return;
        }
        await reloadInvestments({ forcePortfolioRefresh: true });
        const lines: string[] = [];
        if (summary) {
          lines.push(formatImportSummary(summary));
        }
        if (hasOrphanSells || data.hasOrphanSells || (summary && !summary.hasCompleteData)) {
          lines.push(t('investT212OrphanSellsHint'));
        }
        if (lines.length) {
          Alert.alert(t('importPortfolio'), lines.join('\n\n'));
        }
        return;
      }

      if (data.kind === 'anycoin-transactions') {
        const { error, summary } = await importAnycoinTransactions(user.id, {
          csvTexts: data.csvTexts,
          portfolioName: data.portfolioName,
          visibility: data.visibility ?? 'personal',
          householdId: data.visibility === 'shared' ? data.householdId ?? null : null,
        });
        if (error) {
          Alert.alert(t('importPortfolio'), error);
          return;
        }
        await reloadInvestments({ forcePortfolioRefresh: true });
        if (summary) {
          Alert.alert(t('importPortfolio'), formatImportSummary(summary));
        }
        return;
      }

      if (data.kind === 'revolut-invest-transactions') {
        const { error, summary } = await importRevolutInvestTransactions(user.id, {
          csvText: data.csvText,
          portfolioName: data.portfolioName,
          visibility: data.visibility ?? 'personal',
          householdId: data.visibility === 'shared' ? data.householdId ?? null : null,
        });
        if (error) {
          Alert.alert(t('importPortfolio'), error);
          return;
        }
        await reloadInvestments({ forcePortfolioRefresh: true });
        if (summary) {
          Alert.alert(t('importPortfolio'), formatImportSummary(summary));
        }
        return;
      }

      if (data.kind === 'xtb-transactions') {
        const { error, summary } = await importXtbTransactions(user.id, {
          fileContent: data.fileContent,
          portfolioName: data.portfolioName,
          visibility: data.visibility ?? 'personal',
          householdId: data.visibility === 'shared' ? data.householdId ?? null : null,
        });
        if (error) {
          Alert.alert(t('importPortfolio'), error);
          return;
        }
        await reloadInvestments({ forcePortfolioRefresh: true });
        if (summary) {
          Alert.alert(t('importPortfolio'), formatImportSummary(summary));
        }
        return;
      }

      const { error } = await importPositions(user.id, {
        portfolioName: data.portfolioName,
        broker: data.broker,
        currency: data.currency,
        positions: data.positions,
        cashBalance: data.cashBalance ?? null,
        visibility: data.visibility,
        householdId: data.householdId ?? null,
      });
      if (error) {
        Alert.alert(t('importPortfolio'), error);
        return;
      }
      await reloadInvestments({ forcePortfolioRefresh: true });
    },
    [user?.id, importEtoroTransactions, importTrading212Transactions, importAnycoinTransactions, importRevolutInvestTransactions, importXtbTransactions, importPositions, reloadInvestments, t, formatImportSummary],
  );

  const openImportSheet = useCallback(() => {
    setImportSheetVisible(true);
  }, []);

  const confirmDeletePortfolio = useCallback(
    (portfolio: InvestmentPortfolio) => {
      if (!canDeletePortfolio(portfolio, user?.id)) return;

      void (async () => {
        const { positions, transactions, error: statsErr } = await fetchPortfolioDeleteStats(
          portfolio.id,
        );
        if (statsErr) {
          Alert.alert(t('error'), logAndGetUserFacingError('invest-stats', statsErr));
          return;
        }

        Alert.alert(
          t('investDeletePortfolioTitle'),
          formatInvestDeletePortfolioConfirm(
            {
              name: portfolio.name,
              positions,
              transactions,
            },
            appLang,
          ),
          [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('investDeletePortfolio'),
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  const { error } = await deletePortfolio(portfolio.id);
                  if (error) {
                    Alert.alert(t('error'), logAndGetUserFacingError('investice', error));
                    return;
                  }
                  if (brokerFilter !== 'all') {
                    const remaining = portfolios.filter(
                      (p) => p.id !== portfolio.id && p.broker === brokerFilter,
                    );
                    if (remaining.length === 0) setBrokerFilter('all');
                  }
                  await reloadInvestments({ forcePortfolioRefresh: true });
                })();
              },
            },
          ],
        );
      })();
    },
    [
      user?.id,
      brokerFilter,
      portfolios,
      deletePortfolio,
      reloadInvestments,
      t,
      appLang,
    ],
  );

  const openRenameModal = useCallback((portfolio: InvestmentPortfolio) => {
    setRenameTarget(portfolio);
    setRenameDraft(portfolio.name);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (!name) return;
    const { error } = await updatePortfolio(renameTarget.id, { name });
    setRenameTarget(null);
    setRenameDraft('');
    if (error) Alert.alert(t('error'), logAndGetUserFacingError('investice', error));
  }, [renameTarget, renameDraft, updatePortfolio, t]);

  const showCurrencyPicker = useCallback(
    (portfolio: InvestmentPortfolio) => {
      Alert.alert(
        t('portfolioChangeCurrencyTitle'),
        portfolio.name,
        [
          ...(['USD', 'EUR', 'CZK', 'GBP'] as const).map((code) => ({
            text: code,
            onPress: () => {
              void (async () => {
                const { error } = await updatePortfolio(portfolio.id, { currency: code });
                if (error) Alert.alert(t('error'), logAndGetUserFacingError('investice', error));
              })();
            },
          })),
          { text: t('cancel'), style: 'cancel' },
        ],
      );
    },
    [updatePortfolio, t],
  );

  const showPortfolioMenu = useCallback(
    (portfolio: InvestmentPortfolio) => {
      const buttons: {
        text: string;
        style?: 'cancel' | 'destructive' | 'default';
        onPress?: () => void;
      }[] = [
        { text: t('portfolioRename'), onPress: () => openRenameModal(portfolio) },
        { text: t('portfolioChangeCurrency'), onPress: () => showCurrencyPicker(portfolio) },
      ];
      if (canDeletePortfolio(portfolio, user?.id)) {
        buttons.push({
          text: t('investDeletePortfolio'),
          style: 'destructive',
          onPress: () => confirmDeletePortfolio(portfolio),
        });
      }
      buttons.push({ text: t('cancel'), style: 'cancel' });
      Alert.alert(portfolio.name, undefined, buttons);
    },
    [t, user?.id, openRenameModal, showCurrencyPicker, confirmDeletePortfolio],
  );

  const handleBrokerTabLongPress = useCallback(
    (broker: InvestmentBroker) => {
      const matches = portfolios.filter((p) => p.broker === broker);
      if (matches.length === 0) return;
      if (matches.length === 1) {
        showPortfolioMenu(matches[0]!);
        return;
      }
      Alert.alert(
        brokerTabLabel(broker),
        undefined,
        [
          ...matches.map((pf) => ({
            text: pf.name,
            onPress: () => showPortfolioMenu(pf),
          })),
          { text: t('cancel'), style: 'cancel' as const },
        ],
      );
    },
    [portfolios, showPortfolioMenu, t],
  );

  const cardBase = [
    styles.card,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      ...cardShadowStyle(isDark),
    },
  ];

  const showContent =
    hasPortfolios || storedPositions.length > 0 || portfolioView.hasTransactions;
  const showNoData =
    showContent &&
    !portfolioView.calcLoading &&
    !storeLoading &&
    !summary &&
    !portfolioView.calcError &&
    storedPositions.length === 0 &&
    !portfolioView.hasTransactions;
  /** Loading && prázdný obsah → skeleton (ne EmptyState). */
  const investListLoading =
    (storeLoading || portfolioView.calcLoading) && !summary && !showContent;
  const showEmpty = !showContent && !storeLoading && !portfolioView.calcLoading;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        variant="gradient"
        title={t('investments')}
        subtitle={!showEmpty ? t('investTrackPortfolio') : undefined}
        right={
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>BETA</Text>
          </View>
        }
      />

      {showContent && !showEmpty && brokerTabs.length > 0 ? (
        <BrokerSegmentedControl
          brokerTabs={brokerTabs}
          brokerFilter={brokerFilter}
          colors={colors}
          t={t}
          onSelect={setBrokerFilter}
          onLongPressBroker={handleBrokerTabLongPress}
        />
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        {/* Měna zobrazení */}
        {!showEmpty && (
          <View>
            <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>
              {t('investDisplayCurrency')}
            </Text>
            <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
              {DISPLAY_CURRENCIES.map((code) => {
                const active = displayCurrency === code;
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.segment, active && { backgroundColor: colors.primary }]}
                    onPress={() => setInvestmentCurrency(code as Currency)}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: colors.textSecondary },
                        active && { color: colors.onPrimary, fontWeight: '700' },
                      ]}
                    >
                      {code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {portfolioView.calcError ? (
          <View style={[cardBase, styles.banner, { borderColor: RED }]}>
            <Text style={[styles.bannerText, { color: colors.text }]}>
              {portfolioView.calcError}
            </Text>
          </View>
        ) : null}

        {portfolioView.quotesError && summary ? (
          <View style={[cardBase, styles.banner, { borderColor: colors.border }]}>
            <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
              {t('investQuotesPartial')}
            </Text>
          </View>
        ) : null}

        {portfolioView.source === 'positions' && summary && !portfolioView.calcLoading ? (
          <View style={[cardBase, styles.banner, { borderColor: colors.border }]}>
            <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
              {t('investNoTransactions')}
            </Text>
          </View>
        ) : null}

        {portfolioView.incompleteFx &&
        portfolioView.incompleteFx.count > 0 &&
        !portfolioView.calcLoading ? (
          <View style={[cardBase, styles.banner, { borderColor: '#F59E0B' }]}>
            <Text style={[styles.bannerText, { color: colors.text }]}>
              {t('investIncompleteFxBanner', {
                count: String(portfolioView.incompleteFx.count),
                currencies: portfolioView.incompleteFx.currencies.join(', '),
              })}
            </Text>
          </View>
        ) : null}

        {brokerFilter !== 'all' &&
        summary &&
        !portfolioView.hasCompleteData &&
        !portfolioView.incompleteFx &&
        !portfolioView.calcLoading ? (
          <View style={[cardBase, styles.banner, { borderColor: '#F59E0B' }]}>
            <Text style={[styles.bannerText, { color: colors.text }]}>
              {t('investIncompleteBrokerBanner')}
            </Text>
          </View>
        ) : null}

        {investListLoading || (portfolioView.calcLoading && !summary) ? (
          <LoadingSkeleton loading variant="invest" />
        ) : null}

        {showContent && !showEmpty ? (
          <ImportToolbar
            colors={colors}
            isDark={isDark}
            storeLoading={storeLoading}
            t={t}
            onImport={openImportSheet}
            onAddTransaction={openAddTxSheet}
            canAddTransaction={manualTxPortfolio != null}
            manageHint={
              brokerFilter !== 'all' && portfoliosForBrokerFilter.length === 1
                ? portfoliosForBrokerFilter[0]!.name
                : null
            }
            onManage={
              brokerFilter !== 'all' && portfoliosForBrokerFilter.length === 1
                ? () => showPortfolioMenu(portfoliosForBrokerFilter[0]!)
                : brokerFilter !== 'all'
                  ? () => handleBrokerTabLongPress(brokerFilter)
                  : undefined
            }
          />
        ) : null}

        {summary ? (
          <>
            {/* Souhrnná karta */}
            <View style={cardBase}>
              {brokerFilter !== 'all' && !portfolioView.hasCompleteData ? (
                <>
                  <Text style={[styles.incompleteTitle, { color: colors.text }]}>
                    {t('investIncompleteBrokerTitle')}
                  </Text>
                  <SummaryRow
                    label={t('investDividends')}
                    value={formatMoney(summary.total_dividends, displayCurrency, numberLocale)}
                    colors={colors}
                    large
                  />
                </>
              ) : (
                <>
                  {summary.total_deposits < 0 ? (
                    <>
                      <SummaryRow
                        label={t('investDepositedGross')}
                        value={formatMoney(
                          summary.total_deposits_gross,
                          displayCurrency,
                          numberLocale,
                        )}
                        colors={colors}
                      />
                      <SummaryRow
                        label={t('investWithdrawn')}
                        value={formatMoney(
                          summary.total_withdrawals,
                          displayCurrency,
                          numberLocale,
                        )}
                        colors={colors}
                      />
                    </>
                  ) : (
                    <SummaryRow
                      label={t('investDeposits')}
                      value={formatMoney(summary.total_deposits, displayCurrency, numberLocale)}
                      colors={colors}
                    />
                  )}
                  <SummaryRow
                    label={t('investCurrentValue')}
                    value={
                      marketValueReady
                        ? formatMoney(summary.total_current_value, displayCurrency, numberLocale)
                        : t('investLoadingPrices')
                    }
                    colors={colors}
                    large
                    muted={!marketValueReady}
                  />
                  <Text style={[styles.pricesDelayedHint, { color: colors.textSecondary }]}>
                    {t('investValuesDisclaimer')}
                  </Text>
                  {marketValueReady && pricesUpdatedLabel ? (
                    <Text style={[styles.pricesDelayedHint, { color: colors.textSecondary }]}>
                      {t('investPricesDelayedHint', { time: pricesUpdatedLabel })}
                    </Text>
                  ) : null}
                  {cashBalanceEntries.length > 0 ? (
                    <View style={styles.cashBalancesBlock}>
                      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                        {t('investCash')}
                      </Text>
                      {cashBalanceEntries.map(([ccy, amt]) => (
                        <View key={ccy} style={styles.cashBalanceRow}>
                          <Text style={[styles.cashBalanceCcy, { color: colors.textSecondary }]}>
                            {ccy}
                          </Text>
                          <Text style={[styles.cashBalanceAmt, { color: colors.text }]}>
                            {formatCashAmount(amt, ccy, numberLocale)}
                          </Text>
                        </View>
                      ))}
                      {cashCzkTotal != null ? (
                        <Text style={[styles.cashBalanceCzk, { color: colors.textSecondary }]}>
                          {t('investCashApproxCzk', {
                            amount: formatMoney(cashCzkTotal, 'CZK', numberLocale),
                          })}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {summary.cash_balance < -0.009 ? (
                    <Text style={[styles.negCashHint, { color: colors.textSecondary }]}>
                      {t('investNegativeCashHint', {
                        amount: formatMoney(summary.cash_balance, displayCurrency, numberLocale),
                      })}
                    </Text>
                  ) : null}
                  <View style={styles.returnRow}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                      {t('investTotalReturn')}
                    </Text>
                    {marketValueReady ? (
                      <Text
                        style={[
                          styles.returnValue,
                          { color: summary.total_return >= 0 ? GREEN : RED },
                        ]}
                      >
                        {summary.total_return >= 0 ? '+' : ''}
                        {formatMoney(summary.total_return, displayCurrency, numberLocale)}
                        {summary.total_return_pct != null
                          ? ` (${summary.total_return_pct >= 0 ? '+' : ''}${summary.total_return_pct.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}%)`
                          : ''}
                      </Text>
                    ) : (
                      <Text style={[styles.returnValue, { color: colors.textSecondary }]}>
                        {t('investLoadingPrices')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.subSummaryRow}>
                    <Text style={[styles.subSummaryText, { color: colors.textSecondary }]}>
                      {t('investRealizedPnl')}:{' '}
                      {formatMoney(summary.total_realized_pnl, displayCurrency, numberLocale)}
                    </Text>
                    <Text style={[styles.subSummaryText, { color: colors.textSecondary }]}>
                      {t('investDividends')}:{' '}
                      {formatMoney(summary.total_dividends, displayCurrency, numberLocale)}
                    </Text>
                  </View>
                </>
              )}
              {portfolioView.quotesLoading ? (
                <Text style={[styles.quotesHint, { color: colors.textSecondary }]}>
                  {t('investLoadingPrices')}
                </Text>
              ) : null}
            </View>

            {/* Vývoj hodnoty */}
            <View style={cardBase}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('investValueHistory')}
              </Text>
              {portfolioView.historyLoading ? (
                <Text style={{ color: colors.textSecondary }}>{t('investLoadingHistory')}</Text>
              ) : chartLoading && chartPoints.length === 0 ? (
                <Text style={{ color: colors.textSecondary }}>{t('investLoadingPrices')}</Text>
              ) : (
                <PortfolioValueChart
                  points={chartPoints}
                  period={chartPeriod}
                  onPeriodChange={setChartPeriod}
                  seriesMode={chartSeriesMode}
                  onSeriesModeChange={setChartSeriesMode}
                  modeValueLabel={t('investChartModeValue')}
                  modeProfitLabel={t('investChartModeProfit')}
                  colors={colors}
                  locale={numberLocale}
                  fillingHint={t('investChartFilling')}
                />
              )}
            </View>

            {/* Koláčový graf */}
            {positions.length > 0 && marketValueReady ? (
              <View style={cardBase}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('investAllocation')}
                </Text>
                <PortfolioAllocationPie
                  slices={allocationSlices}
                  colors={colors}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {summary ? (
          <>
            {/* Seznam pozic */}
            {brokerFilter !== 'all' && !portfolioView.hasCompleteData && positions.length === 0 ? null : (
            <View style={cardBase}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('investMyPositions')}
              </Text>
              {positions.length === 0 ? (
                <Text style={{ color: colors.textSecondary }}>—</Text>
              ) : (
                positions.map((p, idx) => {
                  const qtyLabel = formatUnits(p.held_units, numberLocale);
                  const hasPrice = p.current_price != null && p.current_value != null;
                  const openPositionDetail = () => {
                    const portfolioIdsParam =
                      brokerFilter === 'all'
                        ? undefined
                        : portfoliosForBrokerFilter.map((pf) => pf.id).join(',') || undefined;
                    router.push({
                      pathname: '/investment-position-detail',
                      params: {
                        ticker: p.ticker,
                        ...(portfolioIdsParam ? { portfolioId: portfolioIdsParam } : {}),
                        ...(p.isin ? { isin: p.isin } : {}),
                        heldUnits: String(p.held_units),
                        invested: String(p.invested),
                        ...(p.current_price != null ? { currentPrice: String(p.current_price) } : {}),
                        ...(p.current_value != null ? { currentValue: String(p.current_value) } : {}),
                        ...(p.unrealized_pnl != null
                          ? { unrealizedPnl: String(p.unrealized_pnl) }
                          : {}),
                        ...(p.unrealized_pnl_pct != null
                          ? { unrealizedPnlPct: String(p.unrealized_pnl_pct) }
                          : {}),
                        currency: displayCurrency,
                      },
                    });
                  };
                  return (
                    <TouchableOpacity
                      key={`${p.ticker}-${idx}`}
                      onPress={openPositionDetail}
                      activeOpacity={0.7}
                      style={[
                        styles.positionRow,
                        idx < positions.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.positionLeft}>
                        <Text style={[styles.positionTicker, { color: colors.text }]}>
                          {p.ticker}
                        </Text>
                        <Text style={[styles.positionQty, { color: colors.textSecondary }]}>
                          {qtyLabel} {t('pieces')}
                        </Text>
                        <Text style={[styles.positionMeta, { color: colors.textSecondary }]}>
                          {formatMoney(p.invested, displayCurrency, numberLocale)}
                          {' / '}
                          {hasPrice
                            ? formatMoney(p.current_value, displayCurrency, numberLocale)
                            : '—'}
                        </Text>
                        {p.dividends > 0 ? (
                          <Text style={[styles.positionDiv, { color: colors.textSecondary }]}>
                            {t('investDividends')}:{' '}
                            {formatMoney(p.dividends, displayCurrency, numberLocale)}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.positionRight}>
                        {hasPrice && p.unrealized_pnl != null && p.unrealized_pnl_pct != null ? (
                          <>
                            <Text
                              style={[
                                styles.positionValue,
                                { color: p.unrealized_pnl >= 0 ? GREEN : RED },
                              ]}
                            >
                              {p.unrealized_pnl >= 0 ? '+' : ''}
                              {formatMoney(p.unrealized_pnl, displayCurrency, numberLocale)}
                            </Text>
                            <Text
                              style={[
                                styles.positionPnl,
                                { color: p.unrealized_pnl >= 0 ? GREEN : RED },
                              ]}
                            >
                              {p.unrealized_pnl >= 0 ? '+' : ''}
                              {p.unrealized_pnl_pct.toLocaleString(numberLocale, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              %
                            </Text>
                          </>
                        ) : (
                          <Text style={[styles.positionPnl, { color: colors.textSecondary }]}>
                            {t('investPriceUnavailable')}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
            )}

            {/* Dividendy */}
            {summary.total_dividends > 0 ? (
              <View style={cardBase}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('investDividends')}
                </Text>
                <Text style={[styles.dividendsTotal, { color: colors.text }]}>
                  {formatMoney(summary.total_dividends, displayCurrency, numberLocale)}
                </Text>
                {portfolioView.dividendsByTicker.length > 0 ? (
                  <>
                    <Text style={[styles.dividendsSub, { color: colors.textSecondary }]}>
                      {t('investDividendsBreakdown')}
                    </Text>
                    {portfolioView.dividendsByTicker.map((d) => (
                      <View key={d.ticker} style={styles.dividendRow}>
                        <Text style={[styles.dividendTicker, { color: colors.text }]}>
                          {d.ticker}
                        </Text>
                        <Text style={[styles.dividendAmt, { color: colors.text }]}>
                          {formatMoney(d.amount, displayCurrency, numberLocale)}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {showNoData ? (
          <EmptyState
            title={t('investEmptyTitle')}
            description={t('investNoTransactions')}
            actionLabel={t('importPortfolio')}
            actionIcon={<Upload color={colors.onPrimary} size={20} strokeWidth={2.2} />}
            onAction={openImportSheet}
          />
        ) : null}

        {showEmpty ? (
          <View style={emptyStyles.wrap}>
            <View style={emptyStyles.hero}>
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                style={emptyStyles.heroIcon}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <TrendingUp color="#FFFFFF" size={32} />
              </LinearGradient>
              <Text style={[emptyStyles.heroTitle, { color: colors.text }]}>
                {t('investEmptyHeroTitle')}
              </Text>
              <Text style={[emptyStyles.heroSubtitle, { color: colors.textSecondary }]}>
                {t('investEmptyHeroSubtitle')}
              </Text>
            </View>

            <TouchableOpacity style={emptyStyles.primaryBtn} onPress={openImportSheet} activeOpacity={0.9}>
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                style={emptyStyles.primaryBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Upload color="#FFFFFF" size={18} strokeWidth={2.2} />
                <Text style={emptyStyles.primaryBtnText}>{t('importPortfolio')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={emptyStyles.guideLink}
              onPress={() => setExportGuideVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[emptyStyles.guideLinkText, { color: colors.primary }]}>
                {t('investEmptyHowExport')}
              </Text>
            </TouchableOpacity>

            <View style={[emptyStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[emptyStyles.cardTitle, { color: colors.text }]}>
                {t('investEmptyBrokersTitle')}
              </Text>
              {(
                [
                  { initial: 'e', name: 'eToro', file: t('investEmptyBrokerEtoroFile'), color: '#10B981' },
                  { initial: 'T', name: 'Trading 212', file: t('investEmptyBrokerT212File'), color: '#3B82F6' },
                  { initial: 'X', name: 'XTB', file: t('investEmptyBrokerXtbFile'), color: '#F59E0B' },
                ] as const
              ).map((b) => (
                <View key={b.name} style={emptyStyles.brokerRow}>
                  <View style={[emptyStyles.brokerInitial, { backgroundColor: b.color }]}>
                    <Text style={emptyStyles.brokerInitialText}>{b.initial}</Text>
                  </View>
                  <Text style={[emptyStyles.brokerName, { color: colors.text }]}>{b.name}</Text>
                  <Text style={[emptyStyles.brokerFile, { color: colors.textSecondary }]}>{b.file}</Text>
                </View>
              ))}
              <Text style={[emptyStyles.brokersSoon, { color: colors.textSecondary }]}>
                {t('investEmptyBrokersSoon')}
              </Text>
            </View>

            <View style={[emptyStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[emptyStyles.cardTitle, { color: colors.text }]}>
                {t('investEmptyWhatTitle')}
              </Text>
              <View style={emptyStyles.benefitsRow}>
                {(
                  [
                    { Icon: PieChart, label: t('investEmptyBenefitAllocation'), color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
                    { Icon: TrendingUp, label: t('investEmptyBenefitProfit'), color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
                    { Icon: Coins, label: t('investEmptyBenefitDividends'), color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
                  ] as const
                ).map(({ Icon, label, color, bg }) => (
                  <View key={label} style={emptyStyles.benefitInner}>
                    <View style={[emptyStyles.benefitIcon, { backgroundColor: bg }]}>
                      <Icon color={color} size={18} />
                    </View>
                    <Text style={[emptyStyles.benefitLabel, { color: colors.text }]} numberOfLines={2}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={[emptyStyles.footnote, { color: colors.textSecondary }]}>
              {t('investEmptyBetaNote')}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={exportGuideVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setExportGuideVisible(false)}
      >
        <Pressable style={emptyStyles.sheetOverlay} onPress={() => setExportGuideVisible(false)}>
          <Pressable
            style={[
              emptyStyles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={emptyStyles.sheetHandleRow}>
              <View style={[emptyStyles.sheetHandle, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={[emptyStyles.sheetClose, { backgroundColor: colors.muted }]}
                onPress={() => setExportGuideVisible(false)}
                hitSlop={8}
              >
                <X color={colors.text} size={18} />
              </TouchableOpacity>
            </View>
            <Text style={[emptyStyles.sheetTitle, { color: colors.text }]}>
              {t('investEmptyHowExport')}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={emptyStyles.sheetScroll}>
              {(
                [
                  {
                    title: 'eToro',
                    steps: [t('investEmptyGuideEtoro1'), t('investEmptyGuideEtoro2'), t('investEmptyGuideEtoro3')],
                  },
                  {
                    title: 'Trading 212',
                    steps: [t('investEmptyGuideT2121'), t('investEmptyGuideT2122'), t('investEmptyGuideT2123')],
                  },
                  {
                    title: 'XTB',
                    steps: [t('investEmptyGuideXtb1'), t('investEmptyGuideXtb2'), t('investEmptyGuideXtb3')],
                  },
                ] as const
              ).map((section) => (
                <View key={section.title} style={emptyStyles.guideSection}>
                  <Text style={[emptyStyles.guideBroker, { color: colors.text }]}>{section.title}</Text>
                  {section.steps.map((step, index) => (
                    <View key={index} style={emptyStyles.guideStepRow}>
                      <View style={[emptyStyles.guideStepNum, { backgroundColor: colors.muted }]}>
                        <Text style={[emptyStyles.guideStepNumText, { color: colors.primary }]}>
                          {index + 1}
                        </Text>
                      </View>
                      <Text style={[emptyStyles.guideStepText, { color: colors.textSecondary }]}>
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <InvestmentPortfolioImportSheet
        visible={importSheetVisible}
        onClose={() => setImportSheetVisible(false)}
        onImportReady={handleImportReady}
        fetchT212Quotes={fetchT212Quotes}
      />

      <AddInvestmentTransactionSheet
        visible={addTxSheetVisible}
        onClose={() => setAddTxSheetVisible(false)}
        portfolio={manualTxPortfolio}
        colors={colors}
        locale={numberLocale}
        labels={{
          title: t('investAddTransaction'),
          type: t('investTxType'),
          asset: t('investTxAsset'),
          ticker: t('investTxTicker'),
          isin: t('investTxIsin'),
          units: t('investTxUnits'),
          pricePerUnit: t('investTxPricePerUnit'),
          amount: t('amount'),
          currency: t('currency'),
          date: t('date'),
          note: t('note'),
          notePlaceholder: t('notePlaceholder'),
          save: t('save'),
          cancel: t('cancel'),
          pickPortfolio: t('investAddTransactionPickBroker'),
        }}
        onSaved={async () => {
          await reloadInvestments({ forcePortfolioRefresh: true });
        }}
      />

      <Modal
        visible={renameTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.renameOverlay}
        >
          <View style={[styles.renameCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.renameTitle, { color: colors.text }]}>{t('portfolioRenameTitle')}</Text>
            <Text style={[styles.renameHint, { color: colors.textSecondary }]}>{t('portfolioRenameHint')}</Text>
            <TextInput
              style={[
                styles.renameInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              placeholder={t('portfolioRenameTitle')}
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.renameActions}>
              <TouchableOpacity
                style={[styles.renameBtn, { borderColor: colors.border }]}
                onPress={() => setRenameTarget(null)}
              >
                <Text style={{ color: colors.text }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={() => void submitRename()}
              >
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function BrokerSegmentedControl({
  brokerTabs,
  brokerFilter,
  colors,
  t,
  onSelect,
  onLongPressBroker,
}: {
  brokerTabs: InvestmentBroker[];
  brokerFilter: BrokerFilter;
  colors: ThemeColors;
  t: (key: string, ...args: any[]) => string;
  onSelect: (filter: BrokerFilter) => void;
  onLongPressBroker: (broker: InvestmentBroker) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.brokerTabsBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
      contentContainerStyle={styles.brokerTabsContent}
    >
      <TouchableOpacity
        style={[
          styles.brokerTab,
          { backgroundColor: colors.muted },
          brokerFilter === 'all' && { backgroundColor: colors.primary },
        ]}
        onPress={() => onSelect('all')}
      >
        <Text
          style={[
            styles.brokerTabText,
            { color: colors.textSecondary },
            brokerFilter === 'all' && { color: colors.onPrimary, fontWeight: '700' },
          ]}
        >
          {t('all')}
        </Text>
      </TouchableOpacity>
      {brokerTabs.map((broker) => {
        const active = brokerFilter === broker;
        return (
          <TouchableOpacity
            key={broker}
            style={[
              styles.brokerTab,
              { backgroundColor: colors.muted },
              active && { backgroundColor: colors.primary },
            ]}
            onPress={() => onSelect(broker)}
            onLongPress={() => onLongPressBroker(broker)}
          >
            <Text
              style={[
                styles.brokerTabText,
                { color: colors.textSecondary },
                active && { color: colors.onPrimary, fontWeight: '700' },
              ]}
            >
              {brokerTabLabel(broker)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function ImportToolbar({
  colors,
  isDark,
  storeLoading,
  t,
  onImport,
  onAddTransaction,
  canAddTransaction,
  manageHint,
  onManage,
}: {
  colors: ThemeColors;
  isDark: boolean;
  storeLoading: boolean;
  t: (key: string, ...args: any[]) => string;
  onImport: () => void;
  onAddTransaction?: () => void;
  canAddTransaction?: boolean;
  manageHint?: string | null;
  onManage?: () => void;
}) {
  return (
    <View style={styles.portfolioToolbar}>
      <View
        style={[
          styles.importBtnTop,
          { backgroundColor: colors.primary, opacity: storeLoading ? 0.65 : 1 },
          cardShadowStyle(isDark),
        ]}
      >
        <TouchableOpacity
          style={styles.importBtnMain}
          onPress={onImport}
          disabled={storeLoading}
          activeOpacity={0.88}
        >
          <Upload color={colors.onPrimary} size={20} strokeWidth={2.2} />
          <Text style={[styles.importBtnTopText, { color: colors.onPrimary }]}>
            {t('importPortfolio')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.importAddChip, { backgroundColor: colors.onPrimary }]}
          onPress={onImport}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Plus size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
      {onAddTransaction ? (
        <TouchableOpacity
          style={[
            styles.addTxBtn,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              opacity: canAddTransaction === false ? 0.55 : 1,
            },
          ]}
          onPress={onAddTransaction}
          disabled={storeLoading}
          activeOpacity={0.88}
        >
          <Plus size={18} color={colors.primary} strokeWidth={2.2} />
          <Text style={[styles.addTxBtnText, { color: colors.text }]}>
            {t('investAddTransaction').replace(/^\+\s*/, '')}
          </Text>
        </TouchableOpacity>
      ) : null}
      {manageHint && onManage ? (
        <TouchableOpacity onPress={onManage} style={styles.managePortfolioRow}>
          <Text style={[styles.managePortfolioText, { color: colors.textSecondary }]}>
            {manageHint}
          </Text>
          <MoreVertical size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SummaryRow({
  label,
  value,
  colors,
  large,
  muted,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
  large?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          large ? styles.summaryValueLarge : styles.summaryValue,
          { color: muted ? colors.textSecondary : colors.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  betaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  betaBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.6,
  },
  headerSubtitle: {
    marginTop: 8,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  pricesDelayedHint: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 16,
  },
  currencyLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  banner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  summaryRow: {
    marginBottom: 12,
  },
  incompleteTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryValueLarge: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  returnRow: {
    marginTop: 4,
    marginBottom: 10,
  },
  returnValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  subSummaryRow: {
    gap: 6,
    marginTop: 4,
  },
  subSummaryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  negCashHint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 2,
  },
  cashBalancesBlock: {
    marginTop: 10,
    gap: 4,
  },
  cashBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashBalanceCcy: {
    fontSize: 13,
    fontWeight: '500',
  },
  cashBalanceAmt: {
    fontSize: 14,
    fontWeight: '600',
  },
  cashBalanceCzk: {
    fontSize: 12,
    marginTop: 2,
  },
  quotesHint: {
    marginTop: 10,
    fontSize: 12,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  portfolioChipsScroll: {
    marginHorizontal: -4,
  },
  portfolioSections: {
    gap: 8,
  },
  brokerTabsBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 52,
  },
  brokerTabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brokerTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  brokerTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  portfolioToolbar: {
    gap: 8,
  },
  addTxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addTxBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  importAddChip: {
    marginLeft: 'auto',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managePortfolioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingHorizontal: 4,
  },
  managePortfolioText: {
    fontSize: 12,
    fontWeight: '600',
  },
  portfolioLegend: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  portfolioSection: {
    gap: 8,
  },
  portfolioSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
  portfolioChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  portfolioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 180,
  },
  portfolioChipText: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  portfolioChipAdd: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  positionLeft: {
    flex: 1,
    paddingRight: 12,
  },
  positionRight: {
    alignItems: 'flex-end',
  },
  positionTicker: {
    fontSize: 16,
    fontWeight: '800',
  },
  positionQty: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
  },
  positionMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  positionDiv: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '500',
  },
  positionValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  positionPnl: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
  },
  dividendsTotal: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  dividendsSub: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  dividendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  dividendTicker: {
    fontSize: 14,
    fontWeight: '700',
  },
  dividendAmt: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 16,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyStateHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  emptyStateBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  importBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  importBtnMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  importBtnTopText: {
    fontSize: 15,
    fontWeight: '700',
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  renameCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  renameHint: {
    marginTop: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  renameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  renameBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  renameBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
});

export default function InvesticeTabScreen() {
  return (
    <PremiumGateScreen feature="investments">
      <InvesticeTabScreenContent />
    </PremiumGateScreen>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 22,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  brokerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brokerInitial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brokerInitialText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  brokerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  brokerFile: {
    fontSize: 12,
    fontWeight: '500',
  },
  brokersSoon: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  benefitsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  benefitInner: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  primaryBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  guideLink: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 10,
  },
  guideLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '80%',
  },
  sheetHandleRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  sheetClose: {
    position: 'absolute',
    right: 0,
    top: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
    marginTop: 4,
  },
  sheetScroll: {
    maxHeight: 420,
  },
  guideSection: {
    marginBottom: 18,
    gap: 10,
  },
  guideBroker: {
    fontSize: 16,
    fontWeight: '700',
  },
  guideStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideStepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideStepNumText: {
    fontSize: 12,
    fontWeight: '800',
  },
  guideStepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 2,
  },
});
