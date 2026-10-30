import React, { useState, useMemo, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeOrderIds } from '@/lib/list-order';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Target,
  BarChart3,
  Plus,
} from 'lucide-react-native';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { useFinanceStore, EXPENSE_CATEGORIES, getMonthTransactions, isExpenseForReport, isRefundTransaction, isTransferLikeTransaction, netExpenseAmount, type Transaction } from '@/store/finance-store';
import { mainCategoryName } from '@/lib/category-normalize';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { appLocale } from '@/lib/app-locale';
import { formatMoney, formatMoneyWithSymbol } from '@/lib/format-money';
import { useAuth } from '@/store/auth-store';
import { useRouter, Stack } from 'expo-router';
import { filterTransactionsByPeriod, filterTransfersByPeriod } from '@/lib/period-transactions';
import { ScreenHeader } from '@/components/ScreenHeader';
import { OverviewFilterBadge } from '@/components/OverviewFilterBadge';
import { useFilteredTransactions } from '@/hooks/use-filtered-transactions';
import { useOverviewFiltersStore } from '@/store/overview-filters-store';
import { QuickAddTransactionSheet } from '@/components/QuickAddTransactionSheet';
import { usePlanStore } from '@/store/plan-store';

const EXPENSE_CATEGORY_ORDER_KEY = 'expense_category_order';
const EXCLUDED_FROM_TOTAL_COLOR = '#9CA3AF';
const EXCLUDED_EXPENSE_META: Record<string, { icon: string; color: string }> = {
  Převod: { icon: '🔄', color: EXCLUDED_FROM_TOTAL_COLOR },
  Investice: { icon: '📈', color: EXCLUDED_FROM_TOTAL_COLOR },
};

function excludedExpenseCategoryKey(t: Transaction): string {
  return t.category === 'Investice' ? 'Investice' : 'Převod';
}
function transactionsWord(count: number, t: ReturnType<typeof useLanguageStore.getState>['t']): string {
  const n100 = count % 100;
  if (count === 1) return t('transactionsWordOne');
  if (n100 >= 12 && n100 <= 14) return t('transactionsWordMany');
  const n10 = count % 10;
  if (n10 >= 2 && n10 <= 4) return t('transactionsWordFew');
  return t('transactionsWordMany');
}

export default function ExpenseDetailScreen() {
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t, language } = useLanguageStore();
  const numberLocale = appLocale(language);
  const currency = getCurrentCurrency();
  const { user } = useAuth();
  const pageBg = isDarkMode ? '#0f0f0f' : '#f5f5f5';
  const cardBg = isDarkMode ? '#1c1c1e' : '#ffffff';
  const textMain = isDarkMode ? '#ffffff' : '#1a1a1a';
  const textSec = isDarkMode ? '#ababab' : '#666666';
  const mutedBg = isDarkMode ? '#2c2c2e' : '#f3f4f6';

  const effectiveYm = useOverviewFiltersStore((s) => s.selectedMonth);

  const { y: yearNum, m: monthNum } = useMemo(() => {
    const [yStr, mStr] = effectiveYm.split('-');
    const y = parseInt(yStr ?? '', 10);
    const mo = parseInt(mStr ?? '', 10);
    return { y, m: mo };
  }, [effectiveYm]);

  const referenceInMonth = useMemo(() => new Date(yearNum, monthNum - 1, 15), [yearNum, monthNum]);

  const remoteTransactions = useFilteredTransactions();
  const financeIsLoaded = useFinanceStore((s) => s.isLoaded);
  const loadTransactionsFromSupabase = useFinanceStore((s) => s.loadTransactionsFromSupabase);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadPending, setLoadPending] = useState(!financeIsLoaded);

  useFocusRefresh(
    useCallback(async () => {
      if (!user?.id) {
        setLoadError(null);
        setLoadPending(false);
        return;
      }
      setLoadPending(true);
      setLoadError(null);
      const result = await loadTransactionsFromSupabase();
      if (!result.ok) {
        setLoadError(result.error ?? t('auth.genericError'));
      }
      setLoadPending(false);
    }, [user?.id, loadTransactionsFromSupabase, t]),
  );

  useEffect(() => {
    if (financeIsLoaded) setLoadPending(false);
  }, [financeIsLoaded]);

  const { getAllCategories } = useFinanceStore();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const periodExpenseTransactions = useMemo(() => {
    let list: Transaction[];
    if (selectedPeriod === 'month') {
      list = getMonthTransactions(remoteTransactions, yearNum, monthNum).filter(
        (t) => isExpenseForReport(t) || isRefundTransaction(t),
      );
    } else if (selectedPeriod === 'week') {
      list = filterTransactionsByPeriod(remoteTransactions, 'expense', 'week', referenceInMonth);
    } else {
      list = filterTransactionsByPeriod(remoteTransactions, 'expense', 'year', referenceInMonth);
    }
    return list;
  }, [remoteTransactions, selectedPeriod, yearNum, monthNum, referenceInMonth]);

  const periodTransferExpenses = useMemo(() => {
    if (selectedPeriod === 'month') {
      return getMonthTransactions(remoteTransactions, yearNum, monthNum).filter(
        (t) => isTransferLikeTransaction(t) && t.type === 'expense',
      );
    }
    return filterTransfersByPeriod(
      remoteTransactions,
      'expense',
      selectedPeriod,
      referenceInMonth,
    );
  }, [remoteTransactions, selectedPeriod, yearNum, monthNum, referenceInMonth]);

  const periodTotalExpenses = useMemo(
    () => netExpenseAmount(periodExpenseTransactions),
    [periodExpenseTransactions],
  );

  const displayTotalExpenses = periodTotalExpenses;

  const periodCategoryExpenses = useMemo(() => {
    const total = periodTotalExpenses;
    const totals: Record<string, number> = {};
    for (const t of periodExpenseTransactions) {
      const c = mainCategoryName(t.category, t.subcategory);
      if (isRefundTransaction(t)) {
        totals[c] = (totals[c] || 0) - t.amount;
      } else {
        totals[c] = (totals[c] || 0) + t.amount;
      }
    }
    const allCats = getAllCategories('expense');
    const rows = Object.entries(totals)
      .filter(([, amount]) => amount > 0.009)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
        icon: allCats[category]?.icon || '📦',
        color: allCats[category]?.color || '#6B7280',
        excludedFromTotal: false as boolean,
      }))
      .sort((a, b) => b.amount - a.amount);

    const transferAmountByCat: Record<string, number> = {};
    for (const t of periodTransferExpenses) {
      const key = excludedExpenseCategoryKey(t);
      transferAmountByCat[key] = (transferAmountByCat[key] || 0) + t.amount;
    }
    for (const [category, amount] of Object.entries(transferAmountByCat)) {
      if (amount <= 0.009) continue;
      const meta = EXCLUDED_EXPENSE_META[category] ?? EXCLUDED_EXPENSE_META.Převod!;
      rows.push({
        category,
        amount,
        percentage: 0,
        icon: meta.icon,
        color: meta.color,
        excludedFromTotal: true,
      });
    }
    return rows;
  }, [periodExpenseTransactions, periodTotalExpenses, periodTransferExpenses, getAllCategories]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);

  useEffect(() => {
    const ids = periodCategoryExpenses.filter((c) => !c.excludedFromTotal).map((c) => c.category);
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(EXPENSE_CATEGORY_ORDER_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as string[];
          if (Array.isArray(saved)) {
            setCategoryOrder(mergeOrderIds(saved, ids));
            return;
          }
        }
      } catch {
        // ignore invalid storage
      }
      setCategoryOrder(ids);
    })();
  }, [periodCategoryExpenses]);

  const orderedCategoryExpenses = useMemo(() => {
    const excluded = periodCategoryExpenses.filter((c) => c.excludedFromTotal);
    const regular = periodCategoryExpenses.filter((c) => !c.excludedFromTotal);
    const byCategory = new Map(regular.map((c) => [c.category, c]));
    const order =
      categoryOrder.length > 0 ? categoryOrder : regular.map((c) => c.category);
    const ordered = order
      .map((cat) => byCategory.get(cat))
      .filter((c): c is (typeof periodCategoryExpenses)[number] => c != null);
    // Převod, pak Investice (stabilní pořadí vyloučených)
    const excludedOrder = ['Převod', 'Investice'];
    for (const cat of excludedOrder) {
      const row = excluded.find((c) => c.category === cat);
      if (row) ordered.push(row);
    }
    for (const row of excluded) {
      if (!excludedOrder.includes(row.category)) ordered.push(row);
    }
    return ordered;
  }, [periodCategoryExpenses, categoryOrder]);

  const averageExpense =
    periodExpenseTransactions.length > 0 ? periodTotalExpenses / periodExpenseTransactions.length : 0;

  /** Průměr za den v období; u aktuálního měsíce i odhad do konce měsíce. */
  const dailyStats = useMemo(() => {
    const now = new Date();
    let days: number;
    let projection: number | null = null;
    if (selectedPeriod === 'week') {
      days = 7;
    } else if (selectedPeriod === 'year') {
      const isThisYear = yearNum === now.getFullYear();
      const start = new Date(yearNum, 0, 1);
      days = isThisYear
        ? Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000))
        : 365;
    } else {
      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      const isThisMonth = yearNum === now.getFullYear() && monthNum === now.getMonth() + 1;
      days = isThisMonth ? Math.max(1, now.getDate()) : daysInMonth;
      if (isThisMonth && now.getDate() < daysInMonth) {
        projection = (periodTotalExpenses / days) * daysInMonth;
      }
    }
    return { perDay: periodTotalExpenses / days, projection };
  }, [selectedPeriod, yearNum, monthNum, periodTotalExpenses]);

  // Postřehy — jen z reálných dat, žádné obecné rady při málo transakcích.
  const planBudgets = usePlanStore((st) => st.budgets);
  const prevMonthTotal = useMemo(() => {
    if (selectedPeriod !== 'month') return null;
    const py = monthNum === 1 ? yearNum - 1 : yearNum;
    const pm = monthNum === 1 ? 12 : monthNum - 1;
    const list = getMonthTransactions(remoteTransactions, py, pm).filter(
      (tx) => isExpenseForReport(tx) || isRefundTransaction(tx),
    );
    return list.length >= 5 ? netExpenseAmount(list) : null;
  }, [selectedPeriod, remoteTransactions, yearNum, monthNum]);

  type Insight = {
    kind: 'warning' | 'tip' | 'info';
    title: string;
    text: string;
    cta?: { label: string; onPress: () => void };
  };
  const MIN_TX_FOR_INSIGHTS = 5;
  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    if (periodExpenseTransactions.length < MIN_TX_FOR_INSIGHTS) return out;
    const fmt = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
    const ranked = periodCategoryExpenses.filter((c) => !c.excludedFromTotal);
    const top = ranked[0];

    // 1) Rozpočty v tomto měsíci (jen měsíční pohled)
    if (selectedPeriod === 'month') {
      for (const b of planBudgets) {
        const spent = periodExpenseTransactions
          .filter(
            (tx) =>
              mainCategoryName(tx.category, tx.subcategory) === b.category &&
              (!b.subcategory || tx.subcategory === b.subcategory),
          )
          .reduce((sum, tx) => sum + (isRefundTransaction(tx) ? -tx.amount : tx.amount), 0);
        const label = b.label?.trim() || (b.subcategory ? `${b.category} › ${b.subcategory}` : b.category);
        if (spent > b.amount) {
          out.push({
            kind: 'warning',
            title: `${label}: rozpočet přečerpán`,
            text: `Utraceno ${fmt(spent)} z ${fmt(b.amount)} – o ${fmt(spent - b.amount)} víc.`,
            cta: { label: 'Otevřít Plán', onPress: () => router.push('/(tabs)/plan') },
          });
        } else if (b.amount > 0 && spent / b.amount >= 0.8) {
          out.push({
            kind: 'warning',
            title: `${label}: blížíš se k limitu`,
            text: `Utraceno ${fmt(spent)} z ${fmt(b.amount)}, zbývá ${fmt(b.amount - spent)}.`,
          });
        }
      }
    }

    // 2) Srovnání s minulým měsícem
    if (prevMonthTotal != null && prevMonthTotal > 0) {
      const diff = periodTotalExpenses - prevMonthTotal;
      const pct = Math.round((diff / prevMonthTotal) * 100);
      if (Math.abs(pct) >= 10) {
        out.push({
          kind: pct > 0 ? 'warning' : 'tip',
          title: pct > 0 ? `O ${pct} % víc než minulý měsíc` : `O ${Math.abs(pct)} % méně než minulý měsíc`,
          text:
            pct > 0
              ? `Zatím ${fmt(periodTotalExpenses)} oproti ${fmt(prevMonthTotal)} za celý minulý měsíc.`
              : `Zatím ${fmt(periodTotalExpenses)} oproti ${fmt(prevMonthTotal)} minule. Dobrá práce.`,
        });
      }
    }

    // 3) Největší kategorie + nabídka rozpočtu, pokud žádný nemá
    if (top && top.percentage >= 25) {
      const hasBudget = planBudgets.some((b) => b.category === top.category);
      out.push({
        kind: 'info',
        title: `Nejvíc jde na ${top.category}`,
        text: `${fmt(top.amount)} – ${top.percentage} % všech výdajů v tomto období.`,
        cta: hasBudget
          ? undefined
          : { label: 'Nastavit rozpočet', onPress: () => router.push('/(tabs)/plan') },
      });
    }
    return out.slice(0, 3);
  }, [
    periodExpenseTransactions,
    periodCategoryExpenses,
    planBudgets,
    prevMonthTotal,
    periodTotalExpenses,
    selectedPeriod,
    router,
  ]);

  const PeriodButton = ({ period, label }: { period: 'week' | 'month' | 'year', label: string }) => (
    <TouchableOpacity
      style={[
        styles.periodButton,
        selectedPeriod === period && [styles.periodButtonActive, { backgroundColor: cardBg }],
      ]}
      onPress={() => setSelectedPeriod(period)}
    >
      <Text
        style={[
          styles.periodButtonText,
          { color: textSec },
          selectedPeriod === period && [styles.periodButtonTextActive, { color: textMain }],
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const StatCard = ({ title, value, icon: Icon, color, subtitle }: any) => (
    <View style={[styles.statCard, { backgroundColor: cardBg }]}>
      <View style={styles.statHeader}>
        <Icon color={color} size={20} />
        <Text style={[styles.statTitle, { color: textSec }]}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {subtitle && <Text style={[styles.statSubtitle, { color: textSec }]}>{subtitle}</Text>}
    </View>
  );

  const CategoryDetailCard = ({
    category,
  }: {
    category: (typeof periodCategoryExpenses)[number];
  }) => {
    const isExcluded = !!category.excludedFromTotal;
    const categoryData = EXPENSE_CATEGORIES[category.category as keyof typeof EXPENSE_CATEGORIES];
    const categoryTransactions = isExcluded
      ? periodTransferExpenses.filter(
          (t) => excludedExpenseCategoryKey(t) === category.category,
        )
      : periodExpenseTransactions.filter(
          (t) => (t.category || 'Ostatní') === category.category,
        );
    const excludedMeta = EXCLUDED_EXPENSE_META[category.category];
    const icon = isExcluded
      ? excludedMeta?.icon || category.icon || '📦'
      : categoryData?.icon || category.icon || '📦';
    const amountColor = isExcluded ? EXCLUDED_FROM_TOTAL_COLOR : category.color;

    return (
      <TouchableOpacity
        style={[
          styles.categoryDetailCard,
          { backgroundColor: cardBg },
          isExcluded && { opacity: 0.92, borderWidth: 1, borderColor: isDarkMode ? '#3a3a3c' : '#e5e7eb' },
        ]}
        onPress={() =>
            router.push({
              pathname: '/category-detail',
              params: {
                category: category.category,
                type: 'expense',
                ...(selectedPeriod === 'month' ? { month: effectiveYm } : { period: selectedPeriod }),
              },
            })
          }
        >
          <View style={styles.categoryDetailHeader}>
            <View style={[styles.categoryDetailIconContainer, { backgroundColor: mutedBg }]}>
              <Text style={styles.categoryDetailIcon}>{icon}</Text>
            </View>
            <View style={styles.categoryDetailInfo}>
              <Text style={[styles.categoryDetailName, { color: isExcluded ? EXCLUDED_FROM_TOTAL_COLOR : textMain }]}>
                {category.category}
              </Text>
              <Text style={[styles.categoryDetailCount, { color: textSec }]}>
                {isExcluded
                  ? t('detailExcludedFromTotal')
                  : `${categoryTransactions.length} ${transactionsWord(categoryTransactions.length, t)}`}
              </Text>
            </View>
            <View style={styles.categoryDetailAmount}>
              <Text style={[styles.categoryDetailAmountText, { color: amountColor }]}>
                {formatMoneyWithSymbol(category.amount, numberLocale, currency.symbol)}
              </Text>
              {!isExcluded ? (
                <Text style={[styles.categoryDetailPercentage, { color: textSec }]}>
                  {category.percentage}% z celku
                </Text>
              ) : null}
            </View>
          </View>
          {!isExcluded ? (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarBackground, { backgroundColor: mutedBg }]}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${category.percentage}%`,
                      backgroundColor: category.color,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}
      </TouchableOpacity>
    );
  };
  const RecommendationCard = ({ type, title, description, icon: Icon }: any) => (
    <View
      style={[
        styles.recommendationCard,
        type === 'warning'
          ? [
              styles.warningCard,
              {
                backgroundColor: isDarkMode ? 'rgba(245,158,11,0.22)' : '#FEF3C7',
                borderLeftColor: '#F59E0B',
              },
            ]
          : [
              styles.tipCard,
              {
                backgroundColor: isDarkMode ? 'rgba(16,185,129,0.22)' : '#D1FAE5',
                borderLeftColor: '#10B981',
              },
            ],
      ]}
    >
      <View style={styles.recommendationHeader}>
        <Icon 
          color={type === 'warning' ? '#F59E0B' : '#10B981'} 
          size={20} 
        />
        <Text style={[
          styles.recommendationTitle,
          { color: type === 'warning' ? '#F59E0B' : '#10B981' }
        ]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.recommendationDescription, { color: textMain }]}>{description}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={t('detailTotalExpenses')}
        variant="gradient"
        gradientColors={['#EF4444', '#DC2626']}
        right={
          <View style={styles.headerIcon}>
            <TrendingDown color="white" size={28} />
          </View>
        }
      >
        <Text style={styles.headerAmount}>
          {loadPending ? '…' : formatMoneyWithSymbol(displayTotalExpenses, numberLocale, currency.symbol)}
        </Text>
        <OverviewFilterBadge onAccent style={{ marginTop: 8 }} />
      </ScreenHeader>
      <ScrollView
        style={[styles.scrollView, { flex: 1, backgroundColor: pageBg }]}
        showsVerticalScrollIndicator={false}
      >
        {loadError ? (
          <View style={styles.loadBanner}>
            <Text style={[styles.loadBannerText, { color: textMain }]}>{loadError}</Text>
          </View>
        ) : null}
        {loadPending ? (
          <View style={styles.loadCenter}>
            <ActivityIndicator size="large" color="#EF4444" />
          </View>
        ) : null}

        {/* Period Selection — nad součty / seznamem */}
        <View style={styles.periodContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>{t('detailPeriod')}</Text>
          <View style={[styles.periodButtons, { backgroundColor: mutedBg }]}>
            <PeriodButton period="week" label={t('week')} />
            <PeriodButton period="month" label={t('month')} />
            <PeriodButton period="year" label={t('year')} />
          </View>
        </View>

        <View style={styles.addButtonContainer}>
          <TouchableOpacity
            style={styles.addExpenseButton}
            onPress={() => setQuickAddOpen(true)}
          >
            <Plus color="white" size={20} />
            <Text style={styles.addExpenseButtonText}>{t('addExpense')}</Text>
          </TouchableOpacity>
        </View>

        {/* Statistics */}
        <View style={styles.statsContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>{t('detailStatistics')}</Text>
          <View style={styles.statsGrid}>
            <StatCard
              title={t('detailTransactionCount')}
              value={periodExpenseTransactions.length}
              icon={BarChart3}
              color="#6366F1"
              subtitle={
                selectedPeriod === 'month'
                  ? t('detailPerMonth')
                  : selectedPeriod === 'week'
                    ? t('detailPerWeek')
                    : t('detailPerYear')
              }
            />
            <StatCard
              title="Průměrně za den"
              value={formatMoneyWithSymbol(dailyStats.perDay, numberLocale, currency.symbol)}
              icon={Target}
              color="#8B5CF6"
              subtitle={
                dailyStats.projection != null
                  ? `odhad za měsíc ${formatMoneyWithSymbol(dailyStats.projection, numberLocale, currency.symbol)}`
                  : undefined
              }
            />
          </View>
        </View>

        {/* Categories Breakdown */}
        <View style={styles.categoriesContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>{t('detailExpensesByCategory')}</Text>
          {orderedCategoryExpenses.map((category) => (
            <CategoryDetailCard key={category.category} category={category} />
          ))}
        </View>

        {/* Postřehy */}
        <View style={styles.analysisContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>Postřehy</Text>
          {insights.length === 0 ? (
            <View style={[styles.insightEmpty, { backgroundColor: mutedBg }]}>
              <Text style={{ color: textMain, fontSize: 15, fontWeight: '600', marginBottom: 4 }}>
                Zatím málo dat
              </Text>
              <Text style={{ color: textSec, fontSize: 14, lineHeight: 20 }}>
                {`Postřehy se ukážou od ${MIN_TX_FOR_INSIGHTS} výdajů v období. Nejrychleji je doplníš nahráním výpisu z banky.`}
              </Text>
              <TouchableOpacity
                style={[styles.insightCta, { borderColor: '#8B5CF6' }]}
                onPress={() => router.push('/bank-import')}
              >
                <Text style={{ color: '#8B5CF6', fontWeight: '700' }}>Nahrát výpis</Text>
              </TouchableOpacity>
            </View>
          ) : (
            insights.map((ins, index) => (
              <View key={`insight-${index}`}>
                <RecommendationCard
                  type={ins.kind === 'warning' ? 'warning' : 'tip'}
                  title={ins.title}
                  description={ins.text}
                  icon={ins.kind === 'warning' ? AlertTriangle : Lightbulb}
                />
                {ins.cta ? (
                  <TouchableOpacity
                    style={[styles.insightCta, { borderColor: '#8B5CF6', marginTop: -4, marginBottom: 12 }]}
                    onPress={ins.cta.onPress}
                  >
                    <Text style={{ color: '#8B5CF6', fontWeight: '700' }}>{ins.cta.label}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <QuickAddTransactionSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        type="expense"
        onSaved={() => {
          /* store už obsahuje tx; revision syncne Přehled po mirroru */
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  loadBannerText: {
    fontSize: 14,
  },
  loadCenter: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginBottom: 4,
  },
  headerAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodContainer: {
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  periodButtons: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  periodButtonTextActive: {},
  statsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statSubtitle: {
    fontSize: 11,
  },
  categoriesContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  categoryDetailCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryDetailIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryDetailIcon: {
    fontSize: 24,
  },
  categoryDetailInfo: {
    flex: 1,
  },
  categoryDetailName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryDetailCount: {
    fontSize: 12,
  },
  categoryDetailAmount: {
    alignItems: 'flex-end',
  },
  categoryDetailAmountText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  categoryDetailPercentage: {
    fontSize: 11,
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  analysisContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  recommendationCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  warningCard: {
    borderLeftWidth: 4,
  },
  tipCard: {
    borderLeftWidth: 4,
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  recommendationDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  insightEmpty: {
    borderRadius: 16,
    padding: 16,
  },
  insightCta: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  insightsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  insightsGradient: {
    padding: 20,
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  insightsText: {
    fontSize: 14,
    color: 'white',
    lineHeight: 20,
    marginBottom: 16,
    opacity: 0.9,
  },
  chatButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  addButtonContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  addExpenseButton: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  addExpenseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
});