import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Switch,
  Platform,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  PiggyBank,
  Calendar,
  UsersRound,
  X,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Check,
} from 'lucide-react-native';
import { useDraggableList } from '@/lib/use-draggable-list';
import {
  useFinanceStore,
  CategoryExpense,
  SubscriptionItem,
  EXPENSE_CATEGORIES,
  computeMonthlyReportFromTransactions,
  computeCategoryExpensesForTransactionsMonth,
  getMonthTransactions,
  isTransferLikeTransaction,
  type Transaction,
} from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useTheme } from '@/hooks/use-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';
import { LifeEventModeIndicator } from '@/components/LifeEventModeIndicator';
import { SwipeableTransactionRow } from '@/components/SwipeableTransactionRow';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useAuth } from '@/store/auth-store';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { fetchHouseholdRecurringPaySummary, type HouseholdRecurringPaySummary } from '@/lib/household-recurring-dashboard';
import { fetchUserProfileFromSupabase } from '@/lib/user-profile-supabase';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { isSessionLostError } from '@/lib/supabase-session';
import { useBuddyStore } from '@/store/buddy-store';
import DailyTipArticleModal from '@/components/DailyTipArticleModal';
import { getDailyTipArticle } from '@/constants/daily-tip-articles';
import { BrandIcon } from '@/components/BrandIcon';

import {
  daysUntilNextPayment,
  getSubscriptionUiState,
  subscriptionCountsInTotal,
} from '@/lib/subscription-helpers';
import {
  detectRegularPayments,
  groupRegularPaymentsByCategory,
} from '@/lib/regular-payments';
import {
  addMonthsToYyyyMm,
  compareTxDateDesc,
  transactionDateYmd,
  yyyyMmLocalToday,
  toYyyyMmDd,
} from '@/lib/transaction-date';
import { fetchTransactionsRemote, fetchTransactionSourcesRemote } from '@/lib/supabase-transactions';
import { bankLabelForImportSource } from '@/lib/import-batches';
import type { ThemeColors } from '@/constants/theme-colors';
import { appLocale, formatYyyyMmTitle } from '@/lib/app-locale';

const { width } = Dimensions.get('window');
/** Šířka slajdu = obrazovka minus `warningsContainer` okraje 16+16. */
const ALERT_CAROUSEL_WIDTH = width - 32;
const SUBSCRIPTION_ORDER_KEY = 'subscription_order';
const SOURCE_FILTER_ACCENT = '#a855f7';
const OVERVIEW_SOURCE_ORDER = [
  'raiffeisenbank',
  'rb',
  'kb',
  'csob',
  'fio',
  'bank_import',
  'cs',
  'csas',
  'moneta',
  'mbank',
] as const;

function sortOverviewSources(sources: string[]): string[] {
  const rank = new Map(OVERVIEW_SOURCE_ORDER.map((s, i) => [s, i]));
  return [...sources].sort((a, b) => {
    const ra = rank.get(a as (typeof OVERVIEW_SOURCE_ORDER)[number]) ?? 999;
    const rb = rank.get(b as (typeof OVERVIEW_SOURCE_ORDER)[number]) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

function overviewSourceLabel(source: string, t: (key: string) => string): string {
  if (source === 'manual') return t('dashboardSourceManual');
  return bankLabelForImportSource(source);
}

function dashboardItemKey(n: number): 'dashboardItemOne' | 'dashboardItemFew' | 'dashboardItemMany' {
  if (n === 1) return 'dashboardItemOne';
  const n100 = n % 100;
  if (n100 >= 12 && n100 <= 14) return 'dashboardItemMany';
  const n10 = n % 10;
  if (n10 >= 2 && n10 <= 4) return 'dashboardItemFew';
  return 'dashboardItemMany';
}

function transactionsWordKey(n: number): 'transactionsWordOne' | 'transactionsWordFew' | 'transactionsWordMany' {
  if (n === 1) return 'transactionsWordOne';
  const n100 = n % 100;
  if (n100 >= 12 && n100 <= 14) return 'transactionsWordMany';
  const n10 = n % 10;
  if (n10 >= 2 && n10 <= 4) return 'transactionsWordFew';
  return 'transactionsWordMany';
}

function relativeDaysKey(n: number): 'relativeInDaysOne' | 'relativeInDaysFew' | 'relativeInDaysMany' {
  if (n === 1) return 'relativeInDaysOne';
  const n100 = n % 100;
  if (n100 >= 12 && n100 <= 14) return 'relativeInDaysMany';
  const n10 = n % 10;
  if (n10 >= 2 && n10 <= 4) return 'relativeInDaysFew';
  return 'relativeInDaysMany';
}

function bulkDeleteKey(n: number): 'bulkDeleteConfirmOne' | 'bulkDeleteConfirmFew' | 'bulkDeleteConfirmMany' {
  if (n === 1) return 'bulkDeleteConfirmOne';
  const n100 = n % 100;
  if (n100 >= 12 && n100 <= 14) return 'bulkDeleteConfirmMany';
  const n10 = n % 10;
  if (n10 >= 2 && n10 <= 4) return 'bulkDeleteConfirmFew';
  return 'bulkDeleteConfirmMany';
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(107,114,128,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

type DashboardAlertVariant = 'danger' | 'warning' | 'info' | 'tip';

function alertGradientForVariant(
  v: DashboardAlertVariant,
  c: ThemeColors,
): [string, string] {
  switch (v) {
    case 'danger':
      return [hexToRgba(c.error, 0.14), hexToRgba(c.error, 0.24)];
    case 'warning':
      return [hexToRgba(c.warning, 0.16), hexToRgba(c.warning, 0.26)];
    case 'info':
      return [hexToRgba(c.primary, 0.12), hexToRgba(c.primary, 0.22)];
    case 'tip':
    default:
      return [hexToRgba(c.warning, 0.1), hexToRgba(c.muted, 0.45)];
  }
}

function alertTextColors(v: DashboardAlertVariant, c: ThemeColors) {
  switch (v) {
    case 'danger':
      return { title: c.error, body: c.text, x: c.error };
    case 'warning':
      return { title: c.warning, body: c.text, x: c.warning };
    case 'info':
      return { title: c.primary, body: c.text, x: c.primary };
    case 'tip':
    default:
      return { title: c.text, body: c.textSecondary, x: c.textSecondary };
  }
}

/** Jemný pastelový pill pro předplatné (dashboard). */
function categoryPillPastel(category: string, isDark: boolean): { bg: string; fg: string } {
  const info = EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES];
  const accent = info?.color ?? '#6B7280';
  return {
    bg: hexToRgba(accent, isDark ? 0.2 : 0.11),
    fg: isDark ? '#94A3B8' : '#64748B',
  };
}

/**
 * Součet utracené částky pro limit výdajů v měsíci. Pouze transakce typu `expense` — příjmy se nepočítají.
 * Kategorie sjednocena s `|| 'Ostatní'` / trim.
 */
function sumSpentForSpendingLimitCategory(
  monthTx: Transaction[],
  goalCategory: string | undefined,
): number {
  const cat = (goalCategory ?? 'Ostatní').trim() || 'Ostatní';
  return monthTx
    .filter((t) => {
      if ((t as { type?: string }).type === 'transfer' || isTransferLikeTransaction(t)) return false;
      if (t.type !== 'expense') return false;
      const tCat = (t.category ?? '').trim() || 'Ostatní';
      return tCat === cat;
    })
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

/** Křestní jméno pro pozdrav — první slovo z profilu / auth metadata (ne e-mail). */
function greetingGivenName(
  profileFirstName: string,
  authName?: string | null,
  email?: string | null,
): string {
  const fromProfile = profileFirstName.trim();
  const fromAuth = (authName ?? '').trim();
  const raw = fromProfile || fromAuth;
  if (!raw) return '';

  const emailLocal = (email ?? '').split('@')[0]?.trim() ?? '';
  if (!fromProfile && emailLocal && raw.toLowerCase() === emailLocal.toLowerCase()) {
    return '';
  }
  if (!fromProfile && raw.toLowerCase() === 'user') {
    return '';
  }

  return raw.split(/\s+/)[0] ?? '';
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const finance = useFinanceStore();
  const getAllCategories = useFinanceStore((s) => s.getAllCategories);
  const {
    deleteTransaction,
    deleteTransactions,
    financialGoals = [],
    loans = [],
    subscriptions = [],
    customCategories = [],
  } = finance ?? {};
  const { getCurrentCurrency, notifications, userProfile, setUserProfile } = useSettingsStore();
  const { colors, isDark: isDarkMode } = useTheme();
  const { t, language, updateCounter } = useLanguageStore();
  const numberLocale = appLocale(language);
  const liabilitiesLabel = t('dashboardLiabilities');
  const householdLabel = t('household');

  const formatDaysLeft = useCallback(
    (daysLeft: number) => {
      if (daysLeft === 0) return t('relativeToday');
      if (daysLeft === 1) return t('relativeTomorrow');
      return t(relativeDaysKey(daysLeft), { count: daysLeft });
    },
    [t],
  );
  const dailyTip = useBuddyStore((s) => s.dailyTip);
  const dailyTipKey = useBuddyStore((s) => s.dailyTipKey);
  const refreshDailyTip = useBuddyStore((s) => s.refreshDailyTip);
  const dismissDetectedSuggestion = useFinanceStore((s) => s.dismissDetectedSubscriptionSuggestion);
  const dashboardTxRevision = useFinanceStore((s) => s.dashboardTxRevision);

  useEffect(() => {
    refreshDailyTip();
  }, [language, updateCounter, refreshDailyTip]);

  const [householdRecurringSummary, setHouseholdRecurringSummary] = useState<
    HouseholdRecurringPaySummary | null | false
  >(false);

  const loadHouseholdRecurringSummary = useCallback(async () => {
    if (!user?.id) {
      setHouseholdRecurringSummary(null);
      return;
    }
    try {
      const s = await fetchHouseholdRecurringPaySummary(user.id);
      setHouseholdRecurringSummary(s);
    } catch (e) {
      if (isSessionLostError(e)) {
        setHouseholdRecurringSummary(null);
        return;
      }
      setRemoteLoadError(logAndGetUserFacingError('dashboard-household-recurring', e));
      setHouseholdRecurringSummary(null);
    }
  }, [user?.id]);

  const [remoteDashboardTransactions, setRemoteDashboardTransactions] = useState<Transaction[]>([]);
  /** true dokud neproběhne první (nebo aktuální) remote fetch transakcí. */
  const [remoteTxLoading, setRemoteTxLoading] = useState(true);
  const [remoteLoadError, setRemoteLoadError] = useState<string | null>(null);
  const [availableTransactionSources, setAvailableTransactionSources] = useState<string[]>([]);
  const [selectedSourceFilters, setSelectedSourceFilters] = useState<Set<string>>(() => new Set());
  const [sourceFilterModalOpen, setSourceFilterModalOpen] = useState(false);
  const [draftSourceFilters, setDraftSourceFilters] = useState<Set<string>>(() => new Set());
  const isAllSourcesSelected = selectedSourceFilters.size === 0;
  const isDraftAllSourcesSelected = draftSourceFilters.size === 0;

  const bankSourceFilters = useMemo(
    () => sortOverviewSources(availableTransactionSources.filter((s) => s !== 'manual')),
    [availableTransactionSources],
  );
  const hasManualSource = availableTransactionSources.includes('manual');

  const loadAvailableSources = useCallback(async () => {
    if (!user?.id) {
      setAvailableTransactionSources([]);
      return;
    }
    const { sources, error } = await fetchTransactionSourcesRemote(user.id);
    if (error) {
      if (isSessionLostError(error)) {
        setAvailableTransactionSources([]);
        return;
      }
      setRemoteLoadError(logAndGetUserFacingError('dashboard-sources', error));
      setAvailableTransactionSources([]);
      return;
    }
    setAvailableTransactionSources(sources);
  }, [user?.id]);

  /** Generation token — starší in-flight fetch nesmí přepsat novější výsledek. */
  const dashboardFetchGenRef = useRef(0);

  const loadDashboardTransactions = useCallback(async () => {
    const uid = user?.id;
    if (!uid) {
      setRemoteDashboardTransactions([]);
      setRemoteLoadError(null);
      setRemoteTxLoading(false);
      return;
    }
    const gen = ++dashboardFetchGenRef.current;
    setRemoteTxLoading(true);
    try {
      const sourceFilter = isAllSourcesSelected ? undefined : [...selectedSourceFilters];
      const { transactions, error } = await fetchTransactionsRemote(uid, {
        sources: sourceFilter,
      });
      // Zastaralá odpověď (novější fetch už běží / doběhl) — zahodit
      if (gen !== dashboardFetchGenRef.current) {
        console.log('[dashboard] fetchTransactionsRemote stale gen', gen, 'current', dashboardFetchGenRef.current);
        return;
      }
      if (error) {
        setRemoteLoadError(logAndGetUserFacingError('dashboard-transactions', error));
      } else {
        setRemoteLoadError(null);
      }
      const list = transactions ?? [];
      console.log(
        '[dashboard] fetchTransactionsRemote hotovo, raw count:',
        list.length,
        sourceFilter?.length ? `| source filter: ${sourceFilter.join(',')}` : '| source filter: (vše)',
        error ? '(error — viz raw výše)' : '',
        `| gen ${gen}`,
      );
      setRemoteDashboardTransactions(list);
      // Detekce předplatného musí číst tentýž remote zdroj jako dashboard
      if (!error && isAllSourcesSelected) {
        useFinanceStore.getState().replaceTransactionsFromRemote(list);
      }
    } finally {
      if (gen === dashboardFetchGenRef.current) {
        setRemoteTxLoading(false);
      }
    }
  }, [user?.id, isAllSourcesSelected, selectedSourceFilters]);

  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);

  /** Stejný loader jako focus i pull-to-refresh (krok 2). */
  const refreshDashboardData = useCallback(async () => {
    console.log('[dashboard] refreshDashboardData');
    await loadHouseholdRecurringSummary();
    await loadAvailableSources();
    await loadDashboardTransactions();
  }, [loadHouseholdRecurringSummary, loadAvailableSources, loadDashboardTransactions]);

  const loadDashboardOnFocus = useCallback(async () => {
    console.log('[dashboard] focus/refresh — načítám data');
    await refreshDashboardData();
    if (!user?.id) return;
    const row = await fetchUserProfileFromSupabase(user.id);
    if (!row) return;
    setUserProfile({
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      avatarUrl: row.avatar_url ?? null,
    });
  }, [refreshDashboardData, user?.id, setUserProfile]);

  const { refresh: refreshDashboard } = useFocusRefresh(loadDashboardOnFocus);

  const onDashboardPullRefresh = useCallback(async () => {
    console.log('[pull] onRefresh triggered');
    setDashboardRefreshing(true);
    const startedAt = Date.now();
    try {
      await refreshDashboard({ force: true });
    } finally {
      // Ať je spinner vidět i při rychlém fetchi
      const MIN_SPINNER_MS = 450;
      const wait = MIN_SPINNER_MS - (Date.now() - startedAt);
      if (wait > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
      setDashboardRefreshing(false);
      console.log('[pull] onRefresh finished');
    }
  }, [refreshDashboard]);

  useEffect(() => {
    void loadDashboardTransactions();
  }, [loadDashboardTransactions]);

  // Krok 1 konzistence: po mutaci tx (až po mirror/.finally) bump → Přehled refetchne remote.
  // Závislost JEN na revision — ne na loadDashboardTransactions (jinak by filtr spustil dvojitý fetch).
  const loadDashboardTransactionsRef = useRef(loadDashboardTransactions);
  loadDashboardTransactionsRef.current = loadDashboardTransactions;
  useEffect(() => {
    if (dashboardTxRevision === 0) return;
    console.log('[dashboard] dashboardTxRevision', dashboardTxRevision, '→ refetch');
    void loadDashboardTransactionsRef.current();
  }, [dashboardTxRevision]);

  const openSourceFilterModal = useCallback(() => {
    setDraftSourceFilters(new Set(selectedSourceFilters));
    setSourceFilterModalOpen(true);
  }, [selectedSourceFilters]);

  const closeSourceFilterModal = useCallback(() => {
    setSourceFilterModalOpen(false);
  }, []);

  const applySourceFilterModal = useCallback(() => {
    setSelectedSourceFilters(new Set(draftSourceFilters));
    setSourceFilterModalOpen(false);
  }, [draftSourceFilters]);

  const selectAllDraftSourceFilters = useCallback(() => {
    setDraftSourceFilters(new Set());
  }, []);

  const toggleDraftSourceFilter = useCallback((source: string) => {
    setDraftSourceFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  const router = useRouter();
  const [showAllCategories, setShowAllCategories] = useState<boolean>(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(() => new Set());
  const [alertPageIndex, setAlertPageIndex] = useState(0);
  const alertScrollRef = useRef<ScrollView>(null);
  const [tipArticleOpen, setTipArticleOpen] = useState(false);
  const [txSelectionMode, setTxSelectionMode] = useState(false);
  const [txSelectedIds, setTxSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedMonth, setSelectedMonth] = useState(yyyyMmLocalToday());
  const insets = useSafeAreaInsets();
  const { isDesktop, contentMaxWidth } = useResponsiveLayout();

  const tipArticle = useMemo(
    () => getDailyTipArticle(dailyTipKey),
    [dailyTipKey]
  );
  const currentCurrency = getCurrentCurrency();

  const todayYm = yyyyMmLocalToday();
  const canGoNextMonth = selectedMonth < todayYm;

  const selectedMonthTransactions = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr ?? '', 10);
    const mo = parseInt(mStr ?? '', 10);
    if (!Number.isFinite(y) || !Number.isFinite(mo)) return [];
    return getMonthTransactions(remoteDashboardTransactions, y, mo);
  }, [remoteDashboardTransactions, selectedMonth]);

  const dashboardReport = useMemo(
    () =>
      computeMonthlyReportFromTransactions(
        remoteDashboardTransactions,
        selectedMonth,
        getAllCategories('expense'),
      ),
    [remoteDashboardTransactions, selectedMonth, getAllCategories],
  );

  const dashboardCategoryExpenses = useMemo(
    () =>
      computeCategoryExpensesForTransactionsMonth(
        remoteDashboardTransactions,
        selectedMonth,
        financialGoals,
        customCategories,
      ),
    [remoteDashboardTransactions, selectedMonth, financialGoals, customCategories],
  );

  const recentTransactions = useMemo(
    () => [...selectedMonthTransactions].sort(compareTxDateDesc).slice(0, 5),
    [selectedMonthTransactions],
  );

  const totalIncome = dashboardReport.totalIncome;
  const totalExpenses = dashboardReport.totalExpenses;
  const balance = dashboardReport.balance;

  useEffect(() => {
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr ?? '', 10);
    const m = parseInt(mStr ?? '', 10);
    const expectedPrefix =
      Number.isFinite(y) && Number.isFinite(m)
        ? `${y}-${String(m).padStart(2, '0')}`
        : selectedMonth;
    const sampleParsedDates = remoteDashboardTransactions.slice(0, 5).map((t) => transactionDateYmd(t.date));
    const countForSelectedPrefix = remoteDashboardTransactions.filter((t) =>
      transactionDateYmd(t.date).startsWith(expectedPrefix),
    ).length;
    console.log('Remote transactions count:', remoteDashboardTransactions.length);
    console.log('Total income:', totalIncome);
    console.log('Total expenses:', totalExpenses);
    console.log('[dashboard] měsíční filtr: selectedMonth =', selectedMonth, '| očekávaný prefix data =', expectedPrefix);
    console.log(
      '[dashboard] transakcí odpovídajících tomu měsíci (startsWith prefix):',
      countForSelectedPrefix,
      '| ukázka normalizovaných date (až 5):',
      sampleParsedDates,
    );
  }, [remoteDashboardTransactions, totalIncome, totalExpenses, selectedMonth]);
  const currentMonthReport = dashboardReport;
  const categoryExpenses = dashboardCategoryExpenses;

  const overspentSpendingLimits = useMemo(() => {
    return financialGoals
      .filter((goal) => {
        if (goal.type !== 'spending_limit') return false;
        const spent = sumSpentForSpendingLimitCategory(selectedMonthTransactions, goal.category);
        return spent > goal.targetAmount;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [financialGoals, selectedMonthTransactions]);

  const dashboardAlertSlides = useMemo(() => {
    const slides: {
      id: string;
      sortKey: number;
      variant: DashboardAlertVariant;
      title: string;
      message: string;
      icon: string;
    }[] = [];
    if (notifications.budgetWarnings !== false) {
      if (currentMonthReport.balance < 0) {
        slides.push({
          id: 'alert-balance',
          sortKey: 100,
          variant: 'danger',
          title: t('dashboardNegativeBalanceTitle'),
          message: t('dashboardNegativeBalanceMessage', {
            amount: Math.abs(currentMonthReport.balance).toLocaleString(numberLocale),
          }),
          icon: '🚨',
        });
      }
      overspentSpendingLimits.forEach((goal, idx) => {
        const spent = sumSpentForSpendingLimitCategory(selectedMonthTransactions, goal.category);
        slides.push({
          id: `alert-limit-${goal.id}`,
          sortKey: 200 + idx,
          variant: 'danger',
          title: t('dashboardLimitExceededTitle'),
          message: t('dashboardLimitExceededMessage', {
            title: goal.title,
            amount: (spent - goal.targetAmount).toLocaleString(numberLocale),
          }),
          icon: '🎯',
        });
      });
      if (currentMonthReport.savingsRate < 10 && currentMonthReport.totalIncome > 0) {
        slides.push({
          id: 'alert-savings',
          sortKey: 300,
          variant: 'warning',
          title: t('dashboardLowSavingsTitle'),
          message: t('dashboardLowSavingsMessage', { rate: currentMonthReport.savingsRate }),
          icon: '⚠️',
        });
      }
      const topCategory = currentMonthReport.categoryBreakdown[0];
      if (topCategory && topCategory.percentage > 40) {
        slides.push({
          id: 'alert-category',
          sortKey: 400,
          variant: 'info',
          title: t('dashboardHighCategoryTitle'),
          message: t('dashboardHighCategoryMessage', {
            category: topCategory.category,
            percentage: topCategory.percentage,
          }),
          icon: '💡',
        });
      }
    }
    slides.push({
      id: 'alert-tip-daily',
      sortKey: 500,
      variant: 'tip',
      title: t('dailyTip'),
      message: dailyTip,
      icon: '💡',
    });
    return slides;
  }, [
    notifications.budgetWarnings,
    currentMonthReport,
    overspentSpendingLimits,
    selectedMonthTransactions,
    numberLocale,
    t,
    dailyTip,
  ]);

  const activeAlertSlides = useMemo(() => {
    return dashboardAlertSlides
      .filter((s) => !dismissedAlertIds.has(s.id))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [dashboardAlertSlides, dismissedAlertIds]);

  const activeAlertKey = useMemo(
    () => activeAlertSlides.map((s) => s.id).join(','),
    [activeAlertSlides],
  );

  useLayoutEffect(() => {
    if (activeAlertSlides.length === 0) {
      setAlertPageIndex(0);
      return;
    }
    setAlertPageIndex((p) => {
      const next = Math.min(p, activeAlertSlides.length - 1);
      requestAnimationFrame(() => {
        alertScrollRef.current?.scrollTo({ x: next * ALERT_CAROUSEL_WIDTH, animated: true });
      });
      return next;
    });
  }, [activeAlertKey, activeAlertSlides.length]);

  const QuickActionCard = ({ icon: Icon, title, color, onPress, cardStyle }: any) => (
    <TouchableOpacity style={[styles.quickActionCard, cardStyle]} onPress={onPress}>
      <LinearGradient
        colors={color}
        style={[styles.quickActionGradient, isDesktop && styles.quickActionGradientDesktop]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Icon color="white" size={isDesktop ? 32 : 24} />
        <Text style={[styles.quickActionText, isDesktop && styles.quickActionTextDesktop]}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  const FinanceCard = ({ title, amount, trend, color, emoji }: any) => (
    <View style={[styles.financeCard, { backgroundColor: colors.card }, isDesktop && styles.financeCardDesktop]}>
      <View style={styles.financeCardHeader}>
        <Text style={styles.financeCardEmoji}>{emoji}</Text>
        <Text style={[styles.financeCardTitle, { color: colors.textSecondary }]}>{title}</Text>
      </View>
      <Text style={[styles.financeCardAmount, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {typeof amount === 'number' ? amount.toLocaleString(numberLocale) : amount}
        {title === liabilitiesLabel || title === householdLabel ? '' : ` ${currentCurrency.symbol}`}
      </Text>
      {trend !== null && (
        <View style={styles.trendContainer}>
          {trend > 0 ? (
            <TrendingUp color="#10B981" size={14} />
          ) : (
            <TrendingDown color="#EF4444" size={14} />
          )}
          <Text style={[styles.trendText, { color: trend > 0 ? '#10B981' : '#EF4444' }]}>
            {Math.abs(trend)}%
          </Text>
        </View>
      )}
    </View>
  );

  const domacnostDashboardCard = useMemo(() => {
    if (householdRecurringSummary === false) {
      return { amount: '…', color: '#9CA3AF' };
    }
    if (householdRecurringSummary === null) {
      return { amount: t('dashboardAllOk'), color: '#10B981' };
    }
    const { paidByMeCount, totalCount } = householdRecurringSummary;
    const allPaid = totalCount === 0 || paidByMeCount === totalCount;
    if (allPaid) {
      return { amount: t('dashboardAllOk'), color: '#10B981' };
    }
    const unpaidCount = totalCount - paidByMeCount;
    const label = t(dashboardItemKey(unpaidCount));
    return { amount: `${unpaidCount} ${label}`, color: '#F97316' };
  }, [householdRecurringSummary, t]);

  const CategoryExpenseCard = ({ category }: { category: CategoryExpense }) => (
    <TouchableOpacity 
      style={[styles.categoryCard, { backgroundColor: colors.card }]}
      onPress={() =>
        router.push({
          pathname: '/category-detail',
          params: { category: category.category, type: 'expense', month: selectedMonth },
        })
      }
    >
      <View style={styles.categoryHeader}>
        <View style={[styles.categoryIconContainer, { backgroundColor: colors.muted }]}>
          <Text style={styles.categoryIcon}>{category.icon}</Text>
        </View>
        <View style={styles.categoryInfo}>
          <Text style={[styles.categoryName, { color: colors.text }]}>{category.category}</Text>
          <Text style={styles.categoryAmount}>
            {category.amount.toLocaleString(numberLocale)} {currentCurrency.symbol}
          </Text>
        </View>
        <View style={styles.categoryPercentage}>
          <Text style={[styles.percentageText, { color: category.color }]}>
            {category.percentage}%
          </Text>
        </View>
      </View>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarBackground, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.min(100, Math.max(0, category.percentage))}%`,
                backgroundColor: category.color,
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );

  const detectedSubscriptions = finance?.getDetectedSubscriptions?.() ?? [];

  const regularPaymentsGrouped = useMemo(() => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const items = detectRegularPayments(remoteDashboardTransactions, {
      sinceYmd: toYyyyMmDd(sixMonthsAgo),
    });
    return groupRegularPaymentsByCategory(items);
  }, [remoteDashboardTransactions]);

  const handleDeleteDashboardTransaction = useCallback(
    (tid: string) => {
      deleteTransaction?.(tid);
      setRemoteDashboardTransactions((prev) => prev.filter((t) => t.id !== tid));
    },
    [deleteTransaction],
  );
  const totalActiveSubs = useMemo<number>(
    () => subscriptions.filter(subscriptionCountsInTotal).reduce((acc, n) => acc + n.amount, 0),
    [subscriptions],
  );
  const totalYearlySubs = useMemo(() => totalActiveSubs * 12, [totalActiveSubs]);

  const confirmDetected = useCallback((sub: SubscriptionItem) => {
    finance?.addSubscription?.({ ...sub, id: `${sub.id}-${Date.now()}`, paused: false });
  }, [finance]);

  const setSubSwitch = useCallback(
    (id: string, on: boolean) => {
      finance?.updateSubscription?.(
        id,
        on ? { active: true, paused: false } : { active: false, paused: false },
      );
    },
    [finance],
  );

  const {
    orderedItems: orderedSubscriptions,
    loadOrder: loadSubscriptionOrder,
    showReorderAlert: showSubscriptionReorderAlert,
  } = useDraggableList(subscriptions, SUBSCRIPTION_ORDER_KEY);

  useEffect(() => {
    void loadSubscriptionOrder();
  }, [loadSubscriptionOrder]);

  const toggleTxSelect = useCallback((id: string) => {
    setTxSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllRecentTx = useCallback(() => {
    setTxSelectedIds(new Set(recentTransactions.map((t) => t.id)));
  }, [recentTransactions]);

  const exitTxSelection = useCallback(() => {
    setTxSelectionMode(false);
    setTxSelectedIds(new Set());
  }, []);

  const confirmBulkDeleteTx = useCallback(() => {
    const ids = Array.from(txSelectedIds);
    if (ids.length === 0 || !deleteTransactions) return;
    Alert.alert(
      t('bulkDeleteTransactionsTitle'),
      t(bulkDeleteKey(ids.length), { count: ids.length }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteTransactions(ids);
            setRemoteDashboardTransactions((prev) => prev.filter((t) => !ids.includes(t.id)));
            exitTxSelection();
          },
        },
      ],
    );
  }, [txSelectedIds, deleteTransactions, exitTxSelection, t]);

  const goalsSection =
    financialGoals.length > 0 ? (
      <View style={styles.goalsOverviewContainer}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('financialGoals')}</Text>
          <TouchableOpacity
            onPress={() => router.push('/financial-goals')}
            style={styles.showMoreButton}
          >
            <Text style={styles.showMoreText}>{t('viewAll')}</Text>
          </TouchableOpacity>
        </View>

        {financialGoals.slice(0, 2).map((goal) => {
          const actualSpent =
            goal.type === 'spending_limit'
              ? sumSpentForSpendingLimitCategory(selectedMonthTransactions, goal.category)
              : goal.currentAmount;

          const displayAmount = goal.type === 'spending_limit' ? actualSpent : goal.currentAmount;
          const progress = (displayAmount / goal.targetAmount) * 100;
          const isOverLimit = goal.type === 'spending_limit' && displayAmount > goal.targetAmount;
          const color = isOverLimit ? '#EF4444' : '#10B981';

          const categoryEmojis: { [key: string]: string } = {
            Bydlení: '🏠',
            'Jídlo a nápoje': '🍽️',
            Doprava: '🚗',
            Benzín: '⛽',
            Nákupy: '🛍️',
            Spoření: '💰',
            Investice: '📈',
            Ostatní: '🎯',
          };
          const emoji = categoryEmojis[goal.category || 'Ostatní'] || '🎯';

          return (
            <TouchableOpacity
              key={goal.id}
              style={[styles.goalCard, { backgroundColor: colors.card }]}
              onPress={() => router.push('/financial-goals')}
            >
              <View style={styles.goalCardHeader}>
                <View style={styles.goalCardInfo}>
                  <View style={styles.goalCardTitleRow}>
                    <Text style={styles.goalCardEmoji}>{emoji}</Text>
                    <Text style={[styles.goalCardTitle, { color: colors.text }]}>{goal.title}</Text>
                  </View>
                  <Text style={[styles.goalCardCategory, { color: colors.textSecondary }]}>{goal.category}</Text>
                </View>
                <View style={styles.goalCardAmounts}>
                  <Text style={[styles.goalCurrentAmount, { color }]}>
                    {displayAmount.toLocaleString(numberLocale)} {currentCurrency.symbol}
                  </Text>
                  <Text style={[styles.goalTargetAmount, { color: colors.textSecondary }]}>
                    {t('dashboardGoalOf')} {goal.targetAmount.toLocaleString(numberLocale)} {currentCurrency.symbol}
                  </Text>
                </View>
              </View>

              <View style={styles.goalProgressBarContainer}>
                <View style={[styles.goalProgressBarBackground, { backgroundColor: colors.muted }]}>
                  <View
                    style={[
                      styles.goalProgressBar,
                      {
                        width: `${Math.min(progress, 100)}%`,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.goalProgressText, { color }]}>{Math.round(progress)}%</Text>
              </View>

              {isOverLimit && <Text style={styles.goalOverLimitText}>{t('dashboardGoalOverLimit')}</Text>}
            </TouchableOpacity>
          );
        })}

        {financialGoals.length === 0 && (
          <TouchableOpacity
            style={[styles.emptyGoalsCard, { backgroundColor: colors.card }]}
            onPress={() => router.push('/financial-goals')}
          >
            <Target color="#9CA3AF" size={32} />
            <Text style={[styles.emptyGoalsText, { color: colors.textSecondary }]}>
              {t('dashboardSetGoals')}
            </Text>
            <Text style={[styles.emptyGoalsSubtext, { color: colors.textSecondary }]}>
              {t('dashboardTrackGoals')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    ) : null;

  const categoriesSection =
    categoryExpenses.length > 0 ? (
      <View style={styles.categoriesContainer}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('expenseBreakdown')}</Text>
          {categoryExpenses.length > 3 && (
            <TouchableOpacity
              onPress={() => setShowAllCategories(!showAllCategories)}
              style={styles.showMoreButton}
            >
              <Text style={styles.showMoreText}>{showAllCategories ? t('less') : t('more')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {(showAllCategories ? categoryExpenses : categoryExpenses.slice(0, 3)).map((category, index) => (
          <CategoryExpenseCard key={index} category={category} />
        ))}

        <TouchableOpacity
          style={styles.addExpenseButtonContainer}
          onPress={() => router.push({ pathname: '/add', params: { type: 'expense' } })}
        >
          <LinearGradient
            colors={['#EF4444', '#DC2626']}
            style={styles.addExpenseButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <PlusCircle color="white" size={20} />
            <Text style={styles.addExpenseButtonText}>{t('addExpense')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    ) : null;

  const greetingName = greetingGivenName(userProfile.firstName, user?.name, user?.email);

  return (
    <View style={[styles.rootFill, { backgroundColor: colors.background }]}>
      {/* Header MIMO ScrollView — jinak UIRefreshControl spinner mizí za fialovým gradientem
          (Investice má stejný pattern a spinner tam funguje). */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTextCol}>
            {greetingName ? (
              <>
                <Text style={styles.greetingHello}>{t('hello')} 👋</Text>
                <Text style={styles.greetingName} numberOfLines={1} ellipsizeMode="tail">
                  {greetingName}
                </Text>
              </>
            ) : (
              <Text style={styles.greetingName} numberOfLines={1} ellipsizeMode="tail">
                {t('hello')}! 👋
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>

    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      bounces
      contentContainerStyle={{ paddingBottom: txSelectionMode ? 100 + insets.bottom : 0 }}
      refreshControl={
        <RefreshControl
          refreshing={dashboardRefreshing}
          onRefresh={onDashboardPullRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.card}
        />
      }
    >
      <View style={{ maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }}>
      <LifeEventModeIndicator />

      {remoteLoadError ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: colors.error + '18',
            borderWidth: 1,
            borderColor: colors.error + '55',
          }}
        >
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{remoteLoadError}</Text>
        </View>
      ) : null}

      <DailyTipArticleModal
        visible={tipArticleOpen}
        onClose={() => setTipArticleOpen(false)}
        article={tipArticle}
      />

      {activeAlertSlides.length > 0 && (
        <View style={styles.warningsContainer}>
          <ScrollView
            ref={alertScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
            style={[
              styles.alertScrollView,
              { width: ALERT_CAROUSEL_WIDTH, minHeight: 90, maxHeight: 90 },
            ]}
            onMomentumScrollEnd={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const idx = Math.round(
                x / (ALERT_CAROUSEL_WIDTH || 1),
              );
              setAlertPageIndex(
                Math.max(0, Math.min(idx, activeAlertSlides.length - 1)),
              );
            }}
            decelerationRate="fast"
          >
            {activeAlertSlides.map((slide) => {
              const grad = alertGradientForVariant(slide.variant, colors);
              const tc = alertTextColors(slide.variant, colors);
              return (
                <View
                  key={slide.id}
                  style={[
                    styles.warningContainer,
                    { width: ALERT_CAROUSEL_WIDTH },
                  ]}
                >
                  <LinearGradient
                    colors={grad}
                    style={styles.warningGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {slide.variant === 'tip' ? (
                      <View style={styles.warningIconWrap}>
                        <Lightbulb color={colors.warning} size={24} fill={colors.warning} />
                      </View>
                    ) : (
                      <View style={styles.warningIconWrap}>
                        <Text
                          style={[styles.warningIcon, { color: tc.title }]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.2}
                        >
                          {slide.icon}
                        </Text>
                      </View>
                    )}
                    <View style={styles.warningContent}>
                      <Text
                        style={[styles.warningTitle, { color: tc.title }]}
                        numberOfLines={1}
                      >
                        {slide.title}
                      </Text>
                      <Text
                        style={[styles.warningText, { color: tc.body }]}
                        numberOfLines={1}
                      >
                        {slide.message}
                      </Text>
                      {slide.id === 'alert-tip-daily' && (
                        <TouchableOpacity
                          style={[
                            styles.tipReadMoreInAlert,
                            { borderColor: colors.border, backgroundColor: colors.muted },
                          ]}
                          onPress={() => setTipArticleOpen(true)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={t('dashboardReadMoreTipA11y')}
                        >
                          <Text
                            style={[styles.tipReadMoreInAlertText, { color: tc.title }]}
                            numberOfLines={1}
                          >
                            {t('dashboardReadMore')}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.dismissButton,
                        { backgroundColor: colors.surface },
                      ]}
                      onPress={() => {
                        setDismissedAlertIds((prev) => new Set([...prev, slide.id]));
                      }}
                      hitSlop={8}
                      accessibilityLabel={t('dashboardDismissAlertA11y')}
                      accessibilityRole="button"
                    >
                      <X size={20} color={tc.x} />
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              );
            })}
          </ScrollView>
          {activeAlertSlides.length > 1 && (
            <View style={styles.alertDotsRow}>
              {activeAlertSlides.map((s, i) => (
                <View
                  key={s.id}
                  style={[
                    i === alertPageIndex ? styles.alertDotActive : styles.alertDot,
                    {
                      backgroundColor:
                        i === alertPageIndex ? colors.primary : colors.muted,
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.balanceContainer}>
        <View style={styles.overviewTitleRow}>
          <Text style={[styles.sectionTitle, styles.overviewTitleText, { color: colors.text }]}>
            {t('financialOverview')}
          </Text>
          {availableTransactionSources.length > 0 ? (
            <TouchableOpacity
              onPress={openSourceFilterModal}
              style={styles.sourceFilterIconBtn}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('dashboardFilterByBank')}
            >
              <SlidersHorizontal
                size={20}
                color={isDarkMode ? 'rgba(255,255,255,0.6)' : colors.textSecondary}
              />
              {!isAllSourcesSelected ? <View style={styles.sourceFilterIconBadge} /> : null}
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity 
          style={styles.balanceCard}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={balance >= 0 ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
            style={styles.balanceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.balanceLabel}>{t('totalBalance')}</Text>
            <Text style={styles.balanceAmount}>
              {balance.toLocaleString(numberLocale)} {currentCurrency.symbol}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.monthNavRow,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => setSelectedMonth((m) => addMonthsToYyyyMm(m, -1))}
          style={styles.monthNavHit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('dashboardPrevMonthA11y')}
        >
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.monthNavTitle, { color: colors.text }]} numberOfLines={1}>
          {formatYyyyMmTitle(selectedMonth, numberLocale)}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (canGoNextMonth) setSelectedMonth((m) => addMonthsToYyyyMm(m, 1));
          }}
          style={[styles.monthNavHit, !canGoNextMonth && styles.monthNavHitDisabled]}
          hitSlop={8}
          disabled={!canGoNextMonth}
          accessibilityRole="button"
          accessibilityLabel={t('dashboardNextMonthA11y')}
        >
          <ChevronRight color={colors.text} size={24} />
        </TouchableOpacity>
      </View>

      <View style={[styles.financeGrid, isDesktop && styles.financeGridDesktop]}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/income-detail', params: { month: selectedMonth } })}
          style={[styles.financeCardWrapper, isDesktop && styles.financeCardWrapperDesktop]}
        >
          <FinanceCard
            title={t('income')}
            amount={totalIncome}
            emoji="💰"
            trend={12}
            color="#10B981"
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/expense-detail', params: { month: selectedMonth } })}
          style={[styles.financeCardWrapper, isDesktop && styles.financeCardWrapperDesktop]}
        >
          <FinanceCard
            title={t('expense')}
            amount={totalExpenses}
            emoji="💸"
            trend={-8}
            color="#EF4444"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/loans')} style={[styles.financeCardWrapper, isDesktop && styles.financeCardWrapperDesktop]}>
          <FinanceCard
            title={liabilitiesLabel}
            amount={loans.length}
            emoji="💳"
            trend={null}
            color="#8B5CF6"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(tabs)/household')} style={[styles.financeCardWrapper, isDesktop && styles.financeCardWrapperDesktop]}>
          <FinanceCard
            title={householdLabel}
            amount={domacnostDashboardCard.amount}
            emoji="🏠"
            trend={null}
            color={domacnostDashboardCard.color}
          />
        </TouchableOpacity>
      </View>





      <View style={styles.quickActionsContainer}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('quickActions')}</Text>
        <View style={[styles.quickActionsGrid, isDesktop && styles.quickActionsGridDesktop]}>
          <QuickActionCard
            icon={PlusCircle}
            title={t('addTransaction')}
            color={['#10B981', '#059669']}
            onPress={() => router.push('/add')}
            cardStyle={isDesktop ? styles.quickActionCardDesktop : undefined}
          />
          <QuickActionCard
            icon={Calendar}
            title={t('monthlyReport')}
            color={['#F59E0B', '#D97706']}
            onPress={() => router.push('/monthly-report')}
            cardStyle={isDesktop ? styles.quickActionCardDesktop : undefined}
          />
          <QuickActionCard
            icon={UsersRound}
            title={t('splitGroups')}
            color={['#06B6D4', '#0891B2']}
            onPress={() => router.push('/split-groups')}
            cardStyle={isDesktop ? styles.quickActionCardDesktop : undefined}
          />
          <QuickActionCard
            icon={PiggyBank}
            title={t('piggyBankFeature')}
            color={['#EC4899', '#BE185D']}
            onPress={() => router.push('/save')}
            cardStyle={isDesktop ? styles.quickActionCardDesktop : undefined}
          />
        </View>
      </View>

      {isDesktop ? (
        <>
        <View style={styles.desktopTwoColumn}>
          <View style={styles.desktopColumn}>
      <View style={[styles.subsContainer, styles.subsContainerDesktop]}>
        <View style={styles.sectionHeader}>
          <Text
            style={[styles.sectionTitle, { color: colors.text }]}
            testID="subs-title"
          >
            {t('dashboardMonthlySubs')}
          </Text>
        </View>
        <View
          style={[
            styles.subsSummaryBox,
            { backgroundColor: colors.muted },
          ]}
        >
          <Text
            style={[
              styles.subsSummaryActive,
              { color: colors.text },
            ]}
          >
            {t('dashboardSubsActive', {
              amount: `${Math.round(totalActiveSubs).toLocaleString(numberLocale)} ${currentCurrency.symbol}`,
            })}
          </Text>
          <Text
            style={[
              styles.subsSummaryYearly,
              { color: colors.textSecondary },
            ]}
          >
            {t('dashboardSubsYearly', {
              amount: `${Math.round(totalYearlySubs).toLocaleString(numberLocale)} ${currentCurrency.symbol}`,
            })}
          </Text>
        </View>
        {subscriptions.length === 0 &&
        detectedSubscriptions.length === 0 &&
        regularPaymentsGrouped.groups.length === 0 ? (
          <Text
            style={[styles.subsEmpty, { color: colors.textSecondary }]}
            testID="subs-empty"
          >
            {t('dashboardNoSubsFound')}
          </Text>
        ) : (
          <>
            {orderedSubscriptions.map((s) => {
              const ui = getSubscriptionUiState(s);
              const dimmed = ui !== 'on';
              const pill = categoryPillPastel(s.category, isDarkMode);
              const daysLeft = daysUntilNextPayment(s.dayOfMonth);
              const daysLabel = formatDaysLeft(daysLeft);
              const amountColor = ui === 'on' ? colors.text : colors.textSecondary;
              return (
                <View
                  key={s.id}
                  style={[
                    styles.subItemCard,
                    {
                      backgroundColor: colors.surface,
                      shadowOpacity: isDarkMode ? 0.35 : 0.06,
                    },
                  ]}
                  testID={`sub-${s.id}`}
                  delayLongPress={500}
                  onLongPress={() => showSubscriptionReorderAlert(s.id)}
                >
                  <TouchableOpacity
                    style={styles.subItemMainTouch}
                    onPress={() =>
                      router.push({
                        pathname: '/subscription',
                        params: { id: s.id },
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <BrandIcon merchantKey={s.name} size={48} isDimmed={dimmed} />
                    <View style={styles.subMain}>
                      <Text
                        style={[
                          styles.subName,
                          { color: colors.text },
                          dimmed && styles.subTextMuted,
                        ]}
                      >
                        {s.name}
                      </Text>
                      {ui === 'paused' ? (
                        <Text
                          style={[
                            styles.subPausedLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {t('dashboardPaused')}
                        </Text>
                      ) : null}
                      <View style={styles.subMetaRow}>
                        <View style={[styles.categoryPillSoft, { backgroundColor: pill.bg }]}>
                          <Text
                            style={[styles.categoryPillSoftText, { color: pill.fg }]}
                            numberOfLines={1}
                          >
                            {s.category}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.subDaysSoft,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {daysLabel}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.subRightColumn}>
                    <Text style={[styles.subAmountLarge, { color: amountColor }]}>
                      {Math.round(s.amount).toLocaleString(numberLocale)} {currentCurrency.symbol}
                    </Text>
                    <Switch
                      value={ui === 'on'}
                      onValueChange={(v) => setSubSwitch(s.id, v)}
                      testID={`toggle-sub-${s.id}`}
                      trackColor={{
                        false: colors.muted,
                        true: colors.success,
                      }}
                      thumbColor={
                        Platform.OS === 'android'
                          ? ui === 'on'
                            ? colors.onPrimary
                            : colors.muted
                          : undefined
                      }
                      ios_backgroundColor={colors.muted}
                    />
                  </View>
                </View>
              );
            })}
            {regularPaymentsGrouped.groups.length > 0 && (
              <View
                style={[
                  styles.detectedSectionShell,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : colors.muted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.detectedSectionHeader}>
                  <Text style={[styles.detectedSectionTitle, { color: colors.text }]}>
                    {t('dashboardDetectedFromStatements')}
                  </Text>
                  <Text style={[styles.detectedSectionHint, { color: colors.textSecondary }]}>
                    {t('dashboardDetectedHint')}
                  </Text>
                  <Text style={[styles.subAmountLarge, { color: colors.text, marginTop: 8 }]}>
                    {Math.round(regularPaymentsGrouped.total).toLocaleString(numberLocale)}{' '}
                    {currentCurrency.symbol}
                  </Text>
                </View>
                <View style={[styles.detectedSectionDivider, { backgroundColor: colors.border }]} />
                {regularPaymentsGrouped.groups.map((g) => (
                  <View key={g.category} style={{ marginBottom: 12 }}>
                    <Text style={[styles.subName, { color: colors.text, marginBottom: 6 }]}>
                      {g.category} — {Math.round(g.total).toLocaleString(numberLocale)}{' '}
                      {currentCurrency.symbol}
                    </Text>
                    {g.items.map((it) => (
                      <View
                        key={it.id}
                        style={[
                          styles.subItemCard,
                          {
                            backgroundColor: colors.surface,
                            shadowOpacity: isDarkMode ? 0.35 : 0.06,
                            marginBottom: 6,
                          },
                        ]}
                      >
                        <View style={styles.subItemMainTouch}>
                          <BrandIcon merchantKey={it.name} size={40} />
                          <View style={styles.subMain}>
                            <Text style={[styles.subName, { color: colors.text }]} numberOfLines={2}>
                              {it.name}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.subAmountLarge, { color: colors.text }]}>
                          {Math.round(it.amount).toLocaleString(numberLocale)} {currentCurrency.symbol}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
            {detectedSubscriptions.length > 0 && regularPaymentsGrouped.groups.length === 0 && (
              <View
                style={[
                  styles.detectedSectionShell,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : colors.muted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.detectedSectionHeader}>
                  <Text style={[styles.detectedSectionTitle, { color: colors.text }]}>
                    {t('dashboardDetectedFromStatements')}
                  </Text>
                  <Text style={[styles.detectedSectionHint, { color: colors.textSecondary }]}>
                    {t('dashboardDetectedHint')}
                  </Text>
                </View>
                <View style={[styles.detectedSectionDivider, { backgroundColor: colors.border }]} />
                {detectedSubscriptions.slice(0, 5).map((s) => {
                  const pill = categoryPillPastel(s.category, isDarkMode);
                  const daysLeft = daysUntilNextPayment(s.dayOfMonth);
                  const daysLabel = formatDaysLeft(daysLeft);
                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.subItemCard,
                        {
                          backgroundColor: colors.surface,
                          shadowOpacity: isDarkMode ? 0.35 : 0.06,
                        },
                      ]}
                      testID={`detected-${s.id}`}
                    >
                      <View style={styles.subItemMainTouch}>
                        <BrandIcon merchantKey={s.name} size={48} />
                        <View style={styles.subMain}>
                          <Text style={[styles.subName, { color: colors.text }]} numberOfLines={2}>
                            {s.name}
                          </Text>
                          <View style={styles.subMetaRow}>
                            <View style={[styles.categoryPillSoft, { backgroundColor: pill.bg }]}>
                              <Text
                                style={[styles.categoryPillSoftText, { color: pill.fg }]}
                                numberOfLines={1}
                              >
                                {s.category}
                              </Text>
                            </View>
                            <Text style={[styles.subDaysSoft, { color: colors.textSecondary }]}>
                              {daysLabel}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.subRightColumn}>
                        <Text style={[styles.subAmountLarge, { color: colors.text }]}>
                          {Math.round(s.amount).toLocaleString(numberLocale)} {currentCurrency.symbol}
                        </Text>
                        <View style={styles.detectedActionsRow}>
                          <TouchableOpacity
                            style={[
                              styles.dismissSuggestionBtn,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.background,
                              },
                            ]}
                            onPress={() => dismissDetectedSuggestion(s.id)}
                            accessibilityLabel={t('dashboardIgnoreSuggestionA11y', { name: s.name })}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={[styles.dismissSuggestionBtnText, { color: colors.textSecondary }]}>
                              {t('dashboardIgnore')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => confirmDetected(s)}
                            style={styles.addBtn}
                            accessibilityLabel={`add-${s.id}`}
                          >
                            <Text style={styles.addBtnText}>{t('addAction')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
        <TouchableOpacity
          style={[
            styles.addSubscriptionFullButton,
            { backgroundColor: colors.muted },
          ]}
          onPress={() => router.push('/add-subscription')}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.addSubscriptionFullButtonText,
              { color: colors.text },
            ]}
          >
            {t('dashboardAddSub')}
          </Text>
        </TouchableOpacity>
      </View>
          </View>
          <View style={styles.desktopColumn}>
      <View style={[styles.transactionsContainer, styles.transactionsContainerDesktop]}>
        <View style={styles.transactionsSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>{t('recentTransactions')}</Text>
          {recentTransactions.length > 0 ? (
            <View style={styles.transactionsHeaderActions}>
              {txSelectionMode && (
                <TouchableOpacity onPress={selectAllRecentTx} hitSlop={8}>
                  <Text style={[styles.txSelectHeaderLink, { color: colors.primary }]}>{t('dashboardSelectAll')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (txSelectionMode) exitTxSelection();
                  else setTxSelectionMode(true);
                }}
                hitSlop={8}
              >
                <Text style={[styles.txSelectHeaderLink, { color: colors.primary }]}>
                  {txSelectionMode ? t('cancel') : t('dashboardSelect')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {remoteTxLoading && recentTransactions.length === 0 ? (
          <LoadingSkeleton loading variant="list" />
        ) : !remoteTxLoading && recentTransactions.length === 0 ? (
          <EmptyState
            title={t('noTransactionsYet')}
            description={t('startAddingTransactions')}
            icon={<DollarSign color={colors.textSecondary} size={48} />}
            actionLabel={t('addTransaction')}
            onAction={() => router.push('/add')}
          />
        ) : (
          recentTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionSwipeWrap}>
              <SwipeableTransactionRow
                transaction={transaction}
                onDelete={handleDeleteDashboardTransaction}
                currencySymbol={currentCurrency.symbol}
                selectionMode={txSelectionMode}
                selected={txSelectedIds.has(transaction.id)}
                onToggleSelection={() => toggleTxSelect(transaction.id)}
              />
            </View>
          ))
        )}
      </View>
          </View>
        </View>
      {goalsSection}
      {categoriesSection}
      </>
      ) : (
      <>
      <View style={styles.subsContainer}>
        <View style={styles.sectionHeader}>
          <Text
            style={[styles.sectionTitle, { color: colors.text }]}
            testID="subs-title"
          >
            {t('dashboardMonthlySubs')}
          </Text>
        </View>
        <View
          style={[
            styles.subsSummaryBox,
            { backgroundColor: colors.muted },
          ]}
        >
          <Text
            style={[
              styles.subsSummaryActive,
              { color: colors.text },
            ]}
          >
            {t('dashboardSubsActive', {
              amount: `${Math.round(totalActiveSubs).toLocaleString(numberLocale)} ${currentCurrency.symbol}`,
            })}
          </Text>
          <Text
            style={[
              styles.subsSummaryYearly,
              { color: colors.textSecondary },
            ]}
          >
            {t('dashboardSubsYearly', {
              amount: `${Math.round(totalYearlySubs).toLocaleString(numberLocale)} ${currentCurrency.symbol}`,
            })}
          </Text>
        </View>
        {subscriptions.length === 0 &&
        detectedSubscriptions.length === 0 &&
        regularPaymentsGrouped.groups.length === 0 ? (
          <Text
            style={[styles.subsEmpty, { color: colors.textSecondary }]}
            testID="subs-empty"
          >
            {t('dashboardNoSubsFound')}
          </Text>
        ) : (
          <>
            {orderedSubscriptions.map((s) => {
              const ui = getSubscriptionUiState(s);
              const dimmed = ui !== 'on';
              const pill = categoryPillPastel(s.category, isDarkMode);
              const daysLeft = daysUntilNextPayment(s.dayOfMonth);
              const daysLabel = formatDaysLeft(daysLeft);
              const amountColor = ui === 'on' ? colors.text : colors.textSecondary;
              return (
                <View
                  key={s.id}
                  style={[
                    styles.subItemCard,
                    {
                      backgroundColor: colors.surface,
                      shadowOpacity: isDarkMode ? 0.35 : 0.06,
                    },
                  ]}
                  testID={`sub-${s.id}`}
                  delayLongPress={500}
                  onLongPress={() => showSubscriptionReorderAlert(s.id)}
                >
                  <TouchableOpacity
                    style={styles.subItemMainTouch}
                    onPress={() =>
                      router.push({
                        pathname: '/subscription',
                        params: { id: s.id },
                      })
                    }
                    activeOpacity={0.7}
                  >
                    <BrandIcon merchantKey={s.name} size={48} isDimmed={dimmed} />
                    <View style={styles.subMain}>
                      <Text
                        style={[
                          styles.subName,
                          { color: colors.text },
                          dimmed && styles.subTextMuted,
                        ]}
                      >
                        {s.name}
                      </Text>
                      {ui === 'paused' ? (
                        <Text
                          style={[
                            styles.subPausedLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {t('dashboardPaused')}
                        </Text>
                      ) : null}
                      <View style={styles.subMetaRow}>
                        <View style={[styles.categoryPillSoft, { backgroundColor: pill.bg }]}>
                          <Text
                            style={[styles.categoryPillSoftText, { color: pill.fg }]}
                            numberOfLines={1}
                          >
                            {s.category}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.subDaysSoft,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {daysLabel}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.subRightColumn}>
                    <Text style={[styles.subAmountLarge, { color: amountColor }]}>
                      {Math.round(s.amount).toLocaleString(numberLocale)} {currentCurrency.symbol}
                    </Text>
                    <Switch
                      value={ui === 'on'}
                      onValueChange={(v) => setSubSwitch(s.id, v)}
                      testID={`toggle-sub-${s.id}`}
                      trackColor={{
                        false: colors.muted,
                        true: colors.success,
                      }}
                      thumbColor={
                        Platform.OS === 'android'
                          ? ui === 'on'
                            ? colors.onPrimary
                            : colors.muted
                          : undefined
                      }
                      ios_backgroundColor={colors.muted}
                    />
                  </View>
                </View>
              );
            })}
            {regularPaymentsGrouped.groups.length > 0 && (
              <View
                style={[
                  styles.detectedSectionShell,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : colors.muted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.detectedSectionHeader}>
                  <Text style={[styles.detectedSectionTitle, { color: colors.text }]}>
                    {t('dashboardDetectedFromStatements')}
                  </Text>
                  <Text style={[styles.detectedSectionHint, { color: colors.textSecondary }]}>
                    {t('dashboardDetectedHint')}
                  </Text>
                  <Text style={[styles.subAmountLarge, { color: colors.text, marginTop: 8 }]}>
                    {Math.round(regularPaymentsGrouped.total).toLocaleString(numberLocale)}{' '}
                    {currentCurrency.symbol}
                  </Text>
                </View>
                <View style={[styles.detectedSectionDivider, { backgroundColor: colors.border }]} />
                {regularPaymentsGrouped.groups.map((g) => (
                  <View key={g.category} style={{ marginBottom: 12 }}>
                    <Text style={[styles.subName, { color: colors.text, marginBottom: 6 }]}>
                      {g.category} — {Math.round(g.total).toLocaleString(numberLocale)}{' '}
                      {currentCurrency.symbol}
                    </Text>
                    {g.items.map((it) => (
                      <View
                        key={it.id}
                        style={[
                          styles.subItemCard,
                          {
                            backgroundColor: colors.surface,
                            shadowOpacity: isDarkMode ? 0.35 : 0.06,
                            marginBottom: 6,
                          },
                        ]}
                      >
                        <View style={styles.subItemMainTouch}>
                          <BrandIcon merchantKey={it.name} size={40} />
                          <View style={styles.subMain}>
                            <Text style={[styles.subName, { color: colors.text }]} numberOfLines={2}>
                              {it.name}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.subAmountLarge, { color: colors.text }]}>
                          {Math.round(it.amount).toLocaleString(numberLocale)} {currentCurrency.symbol}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
            {detectedSubscriptions.length > 0 && regularPaymentsGrouped.groups.length === 0 && (
              <View
                style={[
                  styles.detectedSectionShell,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : colors.muted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.detectedSectionHeader}>
                  <Text style={[styles.detectedSectionTitle, { color: colors.text }]}>
                    {t('dashboardDetectedFromStatements')}
                  </Text>
                  <Text style={[styles.detectedSectionHint, { color: colors.textSecondary }]}>
                    {t('dashboardDetectedHint')}
                  </Text>
                </View>
                <View style={[styles.detectedSectionDivider, { backgroundColor: colors.border }]} />
                {detectedSubscriptions.slice(0, 5).map((s) => {
                  const pill = categoryPillPastel(s.category, isDarkMode);
                  const daysLeft = daysUntilNextPayment(s.dayOfMonth);
                  const daysLabel = formatDaysLeft(daysLeft);
                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.subItemCard,
                        {
                          backgroundColor: colors.surface,
                          shadowOpacity: isDarkMode ? 0.35 : 0.06,
                        },
                      ]}
                      testID={`detected-${s.id}`}
                    >
                      <View style={styles.subItemMainTouch}>
                        <BrandIcon merchantKey={s.name} size={48} />
                        <View style={styles.subMain}>
                          <Text style={[styles.subName, { color: colors.text }]} numberOfLines={2}>
                            {s.name}
                          </Text>
                          <View style={styles.subMetaRow}>
                            <View style={[styles.categoryPillSoft, { backgroundColor: pill.bg }]}>
                              <Text
                                style={[styles.categoryPillSoftText, { color: pill.fg }]}
                                numberOfLines={1}
                              >
                                {s.category}
                              </Text>
                            </View>
                            <Text style={[styles.subDaysSoft, { color: colors.textSecondary }]}>
                              {daysLabel}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.subRightColumn}>
                        <Text style={[styles.subAmountLarge, { color: colors.text }]}>
                          {Math.round(s.amount).toLocaleString(numberLocale)} {currentCurrency.symbol}
                        </Text>
                        <View style={styles.detectedActionsRow}>
                          <TouchableOpacity
                            style={[
                              styles.dismissSuggestionBtn,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.background,
                              },
                            ]}
                            onPress={() => dismissDetectedSuggestion(s.id)}
                            accessibilityLabel={t('dashboardIgnoreSuggestionA11y', { name: s.name })}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={[styles.dismissSuggestionBtnText, { color: colors.textSecondary }]}>
                              {t('dashboardIgnore')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => confirmDetected(s)}
                            style={styles.addBtn}
                            accessibilityLabel={`add-${s.id}`}
                          >
                            <Text style={styles.addBtnText}>{t('addAction')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
        <TouchableOpacity
          style={[
            styles.addSubscriptionFullButton,
            { backgroundColor: colors.muted },
          ]}
          onPress={() => router.push('/add-subscription')}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.addSubscriptionFullButtonText,
              { color: colors.text },
            ]}
          >
            {t('dashboardAddSub')}
          </Text>
        </TouchableOpacity>
      </View>

      {goalsSection}
      {categoriesSection}

      <View style={styles.transactionsContainer}>
        <View style={styles.transactionsSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>{t('recentTransactions')}</Text>
          {recentTransactions.length > 0 ? (
            <View style={styles.transactionsHeaderActions}>
              {txSelectionMode && (
                <TouchableOpacity onPress={selectAllRecentTx} hitSlop={8}>
                  <Text style={[styles.txSelectHeaderLink, { color: colors.primary }]}>{t('dashboardSelectAll')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (txSelectionMode) exitTxSelection();
                  else setTxSelectionMode(true);
                }}
                hitSlop={8}
              >
                <Text style={[styles.txSelectHeaderLink, { color: colors.primary }]}>
                  {txSelectionMode ? t('cancel') : t('dashboardSelect')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {remoteTxLoading && recentTransactions.length === 0 ? (
          <LoadingSkeleton loading variant="list" />
        ) : !remoteTxLoading && recentTransactions.length === 0 ? (
          <EmptyState
            title={t('noTransactionsYet')}
            description={t('startAddingTransactions')}
            icon={<DollarSign color={colors.textSecondary} size={48} />}
            actionLabel={t('addTransaction')}
            onAction={() => router.push('/add')}
          />
        ) : (
          recentTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionSwipeWrap}>
              <SwipeableTransactionRow
                transaction={transaction}
                onDelete={handleDeleteDashboardTransaction}
                currencySymbol={currentCurrency.symbol}
                selectionMode={txSelectionMode}
                selected={txSelectedIds.has(transaction.id)}
                onToggleSelection={() => toggleTxSelect(transaction.id)}
              />
            </View>
          ))
        )}
      </View>
      </>
      )}

      </View>
    </ScrollView>
    {txSelectionMode && (
      <View
        style={[
          styles.bulkToolbar,
          {
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.bulkToolbarLabel, { color: colors.text }]}>
          {t('dashboardSelectedCount', {
            count: txSelectedIds.size,
            transactionsWord: t(transactionsWordKey(txSelectedIds.size)),
          })}
        </Text>
        <TouchableOpacity
          style={[styles.bulkDeleteBtn, txSelectedIds.size === 0 && { opacity: 0.45 }]}
          onPress={confirmBulkDeleteTx}
          disabled={txSelectedIds.size === 0}
          activeOpacity={0.85}
        >
          <Text style={styles.bulkDeleteBtnText}>{t('dashboardDeleteSelected')}</Text>
        </TouchableOpacity>
      </View>
    )}
    <Modal
      visible={sourceFilterModalOpen}
      transparent
      animationType="slide"
      onRequestClose={closeSourceFilterModal}
    >
      <Pressable style={styles.sourceFilterBackdrop} onPress={closeSourceFilterModal}>
        <Pressable
          style={[
            styles.sourceFilterSheet,
            { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.sourceFilterSheetTitle, { color: colors.text }]}>
            {t('dashboardFilterByBank')}
          </Text>
          <ScrollView style={styles.sourceFilterOptions} keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              style={[styles.sourceFilterOptionRow, { borderBottomColor: colors.border }]}
              onPress={selectAllDraftSourceFilters}
              activeOpacity={0.7}
            >
              <Text style={[styles.sourceFilterOptionLabel, { color: colors.text }]}>
                {t('dashboardAllBanks')}
              </Text>
              <View
                style={[
                  styles.sourceFilterCheckbox,
                  { borderColor: colors.border },
                  isDraftAllSourcesSelected && styles.sourceFilterCheckboxChecked,
                ]}
              >
                {isDraftAllSourcesSelected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
            </TouchableOpacity>
            {bankSourceFilters.map((source) => {
              const checked = !isDraftAllSourcesSelected && draftSourceFilters.has(source);
              return (
                <TouchableOpacity
                  key={source}
                  style={[styles.sourceFilterOptionRow, { borderBottomColor: colors.border }]}
                  onPress={() => toggleDraftSourceFilter(source)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sourceFilterOptionLabel, { color: colors.text }]}>
                    {overviewSourceLabel(source, t)}
                  </Text>
                  <View
                    style={[
                      styles.sourceFilterCheckbox,
                      { borderColor: colors.border },
                      checked && styles.sourceFilterCheckboxChecked,
                    ]}
                  >
                    {checked ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            {hasManualSource ? (
              <TouchableOpacity
                style={[styles.sourceFilterOptionRow, { borderBottomColor: colors.border }]}
                onPress={() => toggleDraftSourceFilter('manual')}
                activeOpacity={0.7}
              >
                <Text style={[styles.sourceFilterOptionLabel, { color: colors.text }]}>
                  {t('dashboardSourceManual')}
                </Text>
                <View
                  style={[
                    styles.sourceFilterCheckbox,
                    { borderColor: colors.border },
                    !isDraftAllSourcesSelected &&
                      draftSourceFilters.has('manual') &&
                      styles.sourceFilterCheckboxChecked,
                  ]}
                >
                  {!isDraftAllSourcesSelected && draftSourceFilters.has('manual') ? (
                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  ) : null}
                </View>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
          <View style={styles.sourceFilterSheetActions}>
            <TouchableOpacity
              onPress={closeSourceFilterModal}
              style={[styles.sourceFilterCancelBtn, { borderColor: colors.border }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.sourceFilterCancelText, { color: colors.textSecondary }]}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applySourceFilterModal}
              style={[styles.sourceFilterApplyBtn, { backgroundColor: SOURCE_FILTER_ACCENT }]}
              activeOpacity={0.85}
            >
              <Text style={styles.sourceFilterApplyText}>{t('fgApply')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootFill: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  transactionsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  transactionsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  txSelectHeaderLink: {
    fontSize: 15,
    fontWeight: '600',
  },
  bulkToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bulkToolbarLabel: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  bulkDeleteBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    opacity: 1,
  },
  bulkDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  greetingHello: {
    fontSize: 16,
    color: 'white',
    opacity: 0.75,
  },
  greetingName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 4,
  },
  levelContainer: {
    alignItems: 'center',
  },
  levelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginTop: 4,
  },
  pointsText: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
  },
  tipContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 24,
  },
  tipGradient: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipContent: {
    marginLeft: 12,
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 2,
  },
  tipText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  tipReadMore: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(146, 64, 14, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(146, 64, 14, 0.35)',
  },
  tipReadMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  balanceContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  overviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  overviewTitleText: {
    marginBottom: 0,
    flex: 1,
  },
  sourceFilterIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceFilterIconBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SOURCE_FILTER_ACCENT,
  },
  sourceFilterBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sourceFilterSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '70%',
  },
  sourceFilterSheetTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  sourceFilterOptions: {
    maxHeight: 360,
  },
  sourceFilterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceFilterOptionLabel: {
    fontSize: 16,
    flex: 1,
    paddingRight: 12,
  },
  sourceFilterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceFilterCheckboxChecked: {
    backgroundColor: SOURCE_FILTER_ACCENT,
    borderColor: SOURCE_FILTER_ACCENT,
  },
  sourceFilterSheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  sourceFilterCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sourceFilterCancelText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  sourceFilterApplyBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sourceFilterApplyText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  monthNavHit: {
    padding: 4,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavHitDisabled: {
    opacity: 0.35,
  },
  monthNavTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  balanceCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  balanceGradient: {
    padding: 24,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  financeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 8,
  },
  financeGridDesktop: {
    flexWrap: 'nowrap',
  },
  financeCardWrapper: {
    width: (width - 56) / 2,
  },
  financeCardWrapperDesktop: {
    flex: 1,
    width: undefined,
    minWidth: 220,
  },
  financeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 95,
  },
  financeCardDesktop: {
    padding: 24,
  },
  financeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  financeCardEmoji: {
    fontSize: 18,
  },
  financeCardTitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase' as 'uppercase',
    letterSpacing: 0.5,
  },
  financeCardAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  quickActionsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionsGridDesktop: {
    flexWrap: 'nowrap',
  },
  quickActionCard: {
    width: (width - 56) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  quickActionCardDesktop: {
    flex: 1,
    width: undefined,
    marginBottom: 0,
  },
  quickActionGradient: {
    padding: 16,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  quickActionGradientDesktop: {
    minHeight: 100,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginTop: 8,
    textAlign: 'center',
  },
  quickActionTextDesktop: {
    fontSize: 16,
  },
  desktopTwoColumn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  desktopColumn: {
    flex: 1,
    minWidth: 0,
  },
  subsContainerDesktop: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  transactionsContainerDesktop: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  subsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  subsSummaryBox: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  subsSummaryActive: {
    fontSize: 18,
    fontWeight: '800',
  },
  subsSummaryYearly: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  subsEmpty: {
    paddingHorizontal: 4,
    paddingBottom: 12,
    fontSize: 14,
  },
  subItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  subItemMainTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  subRightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
    gap: 6,
  },
  addSubscriptionFullButton: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addSubscriptionFullButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  subMain: {
    flex: 1,
    minWidth: 0,
  },
  subName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  subTextMuted: {
    opacity: 0.75,
  },
  subPausedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 2,
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  categoryPillSoft: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: '68%',
  },
  categoryPillSoftText: {
    fontSize: 10,
    fontWeight: '600',
  },
  subDaysSoft: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  subAmountLarge: {
    fontSize: 17,
    fontWeight: '800',
  },
  detectedSectionShell: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detectedSectionHeader: {
    marginBottom: 6,
  },
  detectedSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  detectedSectionHint: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  detectedSectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 12,
    opacity: 0.75,
  },
  detectedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  dismissSuggestionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dismissSuggestionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  addBtn: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#667eea',
  },
  addBtnText: {
    color: 'white',
    fontWeight: '700',
  },
  learningContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  learningCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  learningGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  learningContent: {
    marginLeft: 12,
    flex: 1,
  },
  learningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  learningSubtitle: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
  },
  transactionsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  transactionSwipeWrap: {
    marginBottom: 8,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  transactionItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  transactionCategory: {
    fontSize: 12,
    color: '#6B7280',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  categoriesContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  showMoreButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#667eea',
    borderRadius: 16,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  categoryCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryIcon: {
    fontSize: 20,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  categoryPercentage: {
    alignItems: 'flex-end',
  },
  percentageText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  /** Celá sekce: alert (max 80) + mezery a tečky, celkem max 110. */
  warningsContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 24,
    maxHeight: 130,
    overflow: 'hidden',
  },
  alertScrollView: {
    minHeight: 90,
    maxHeight: 90,
    alignSelf: 'center',
  },
  alertDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  alertDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  /** Aktivní indikátor místo kulaté tečky. */
  alertDotActive: {
    width: 14,
    height: 7,
    borderRadius: 3.5,
  },
  tipReadMoreInAlert: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tipReadMoreInAlertText: {
    fontSize: 10,
    fontWeight: '600',
  },
  warningIconWrap: {
    width: 24,
    height: 24,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  warningContainer: {
    minHeight: 90,
    height: 90,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  warningGradient: {
    position: 'relative',
    minHeight: 90,
    height: 90,
    paddingVertical: 12,
    paddingLeft: 16,
    /* místo pro zavírací X: odstup + 24 + mezera */
    paddingRight: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
  warningContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 16,
  },
  dismissButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyLoginContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  dailyLoginGradient: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  dailyLoginContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dailyLoginEmoji: {
    fontSize: 48,
    marginRight: 16,
  },
  dailyLoginText: {
    flex: 1,
  },
  dailyLoginTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  dailyLoginMessage: {
    fontSize: 16,
    color: 'white',
    opacity: 0.95,
    marginBottom: 4,
  },
  dailyLoginStreak: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    fontWeight: '600',
  },
  loansOverviewContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  loansOverviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addLoanButton: {
    backgroundColor: '#667eea',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  loansEmptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loansEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 16,
  },
  addFirstLoanButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addFirstLoanButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  loansContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  loansGrid: {
    gap: 12,
  },
  loanCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  loanIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  loanIcon: {
    fontSize: 24,
  },
  loanInfo: {
    flex: 1,
  },
  loanName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  loanType: {
    fontSize: 12,
  },
  loanDetails: {
    marginBottom: 16,
  },
  loanDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  loanDetailLabel: {
    fontSize: 12,
  },
  loanDetailValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  loanProgressContainer: {
    marginTop: 8,
  },
  loanProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  loanProgressLabel: {
    fontSize: 12,
  },
  loanProgressPercentage: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  loanProgressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  loanProgressBar: {
    height: '100%',
    borderRadius: 4,
  },
  goalsOverviewContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  goalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  goalCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  goalCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  goalCardEmoji: {
    fontSize: 16,
  },
  goalCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  goalCardCategory: {
    fontSize: 12,
    color: '#6B7280',
  },
  goalCardAmounts: {
    alignItems: 'flex-end',
  },
  goalCurrentAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  goalTargetAmount: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  goalProgressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalProgressBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  goalProgressBar: {
    height: '100%',
    borderRadius: 3,
  },
  goalProgressText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 35,
    textAlign: 'right',
  },
  goalOverLimitText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
    marginTop: 6,
  },
  emptyGoalsCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyGoalsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyGoalsSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  addExpenseButtonContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  addExpenseButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  addExpenseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
});