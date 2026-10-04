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
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { appLocale } from '@/lib/app-locale';
import { formatMoney, formatMoneyWithSymbol } from '@/lib/format-money';
import { useAuth } from '@/store/auth-store';
import { useRouter, Stack } from 'expo-router';
import { filterTransactionsByPeriod, filterTransfersByPeriod } from '@/lib/period-transactions';
import { BackButton } from '@/components/BackButton';
import { OverviewFilterBadge } from '@/components/OverviewFilterBadge';
import { useFilteredTransactions } from '@/hooks/use-filtered-transactions';
import { useOverviewFiltersStore } from '@/store/overview-filters-store';

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
      const c = t.category || 'Ostatní';
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

  // Analýza výdajů
  const getExpenseAnalysis = () => {
    const ranked = periodCategoryExpenses.filter((c) => !c.excludedFromTotal);
    const analysis = {
      highestCategory: ranked[0] || null,
      totalTransactions: periodExpenseTransactions.length,
      averagePerTransaction: averageExpense,
      recommendations: [] as string[],
      warnings: [] as string[],
    };

    // Doporučení na základě kategorií
    ranked.forEach((category) => {
      if (category.category === 'Jídlo a nápoje' && category.percentage > 30) {
        analysis.warnings.push(t('expenseWarnFood'));
        analysis.recommendations.push(t('expenseRecCookHome'));
      }
      if (category.category === 'Zábava' && category.percentage > 20) {
        analysis.warnings.push(t('expenseWarnEntertainment'));
        analysis.recommendations.push(t('expenseRecCheaperFun'));
      }
      if (category.category === 'Oblečení' && category.percentage > 15) {
        analysis.warnings.push(t('expenseWarnClothing'));
        analysis.recommendations.push(t('expenseRecClothingNeed'));
      }
    });

    // Obecná doporučení
    if (analysis.recommendations.length === 0) {
      analysis.recommendations.push(t('expenseRecBalanced'));
      analysis.recommendations.push(t('expenseRecSetBudget'));
    }

    return analysis;
  };

  const analysis = getExpenseAnalysis();

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
      <LinearGradient
        colors={['#EF4444', '#DC2626']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <BackButton color="white" size={24} style={styles.backButton} />
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('detailTotalExpenses')}</Text>
            <Text style={styles.headerAmount}>
              {loadPending ? '…' : formatMoneyWithSymbol(displayTotalExpenses, numberLocale, currency.symbol)}
            </Text>
            <OverviewFilterBadge onAccent style={{ marginTop: 8 }} />
          </View>
          <View style={styles.headerIcon}>
            <TrendingDown color="white" size={28} />
          </View>
        </View>
      </LinearGradient>
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

        {/* Add Expense Button */}
        <View style={styles.addButtonContainer}>
          <TouchableOpacity
            style={styles.addExpenseButton}
            onPress={() => router.push('/(tabs)/add')}
          >
            <Plus color="white" size={20} />
            <Text style={styles.addExpenseButtonText}>{t('addExpense')}</Text>
          </TouchableOpacity>
        </View>

        {/* Period Selection */}
        <View style={styles.periodContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>{t('detailPeriod')}</Text>
          <View style={[styles.periodButtons, { backgroundColor: mutedBg }]}>
            <PeriodButton period="week" label={t('week')} />
            <PeriodButton period="month" label={t('month')} />
            <PeriodButton period="year" label={t('year')} />
          </View>
        </View>

        {/* Statistics */}
        <View style={styles.statsContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>{t('detailStatistics')}</Text>
          <View style={styles.statsGrid}>
            <StatCard
              title={t('detailTransactionCount')}
              value={analysis.totalTransactions}
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
              title={t('detailAvgPerTransaction')}
              value={formatMoneyWithSymbol(analysis.averagePerTransaction, numberLocale, currency.symbol)}
              icon={Target}
              color="#8B5CF6"
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

        {/* Analysis & Recommendations */}
        <View style={styles.analysisContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>{t('detailAnalysisRecommendations')}</Text>
          
          {/* Warnings */}
          {analysis.warnings.map((warning, index) => (
            <RecommendationCard
              key={`warning-${index}`}
              type="warning"
              title={t('detailWarning')}
              description={warning}
              icon={AlertTriangle}
            />
          ))}

          {/* Recommendations */}
          {analysis.recommendations.map((recommendation, index) => (
            <RecommendationCard
              key={`tip-${index}`}
              type="tip"
              title={t('detailSavingTip')}
              description={recommendation}
              icon={Lightbulb}
            />
          ))}
        </View>

        {/* Tip */}
        <View style={styles.insightsContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.insightsGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.insightsTitle}>{t('detailTipLabel')}</Text>
            <Text style={styles.insightsText}>
              {analysis.highestCategory 
                ? t('detailExpenseTipWithCategory', {
                    category: analysis.highestCategory.category.toLowerCase(),
                    percentage: analysis.highestCategory.percentage,
                  })
                : t('detailExpenseTipEmpty')}
            </Text>
            <TouchableOpacity 
              style={styles.chatButton}
              onPress={() => router.push('/bank-import')}
            >
              <Text style={styles.chatButtonText}>{t('detailImportBankStatement')}</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
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