import React, { useMemo, useState, useCallback, useEffect, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFinanceStore,
  MonthlyReport,
  Transaction,
  getMonthTransactions,
  isIncomeForReport,
  isExpenseForReport,
  isRefundTransaction,
  netExpenseAmount,
  excludeTransfersFromReports,
  computeMonthlyReportFromTransactions,
} from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { appLocale, formatMonthLong, formatMonthShort, formatYyyyMmTitle } from '@/lib/app-locale';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import type { ThemeColors } from '@/constants/theme-colors';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react-native';
import { SwipeableTransactionRow } from '@/components/SwipeableTransactionRow';
import { BackButton } from '@/components/BackButton';
import { OverviewFilterBadge } from '@/components/OverviewFilterBadge';
import { useFilteredTransactions } from '@/hooks/use-filtered-transactions';
import { useOverviewFiltersStore } from '@/store/overview-filters-store';
import {
  addMonthsToYyyyMm,
  transactionDateYmd,
  ymdToLocalDateNoon,
  yyyyMmLocalFromDate,
  yyyyMmLocalToday,
} from '@/lib/transaction-date';

type CategoryBarProps = { category: string; amount: number; percentage: number; color: string };

const CategoryBar = memo(function CategoryBar({ category, amount, percentage, color }: CategoryBarProps) {
  return (
    <View style={stylesRef.categoryBar} testID={`category-${category}`}>
      <View style={stylesRef.categoryInfo}>
        <Text style={stylesRef.categoryName}>{category}</Text>
        <Text style={stylesRef.categoryAmount}>{stylesRef._formatAmount(amount)}</Text>
      </View>
      <View style={stylesRef.progressBarContainer}>
        <View style={[stylesRef.progressBar, { width: `${Math.max(0, Math.min(100, percentage))}%`, backgroundColor: color }]} />
      </View>
      <Text style={stylesRef.categoryPercentage}>
        {percentage}% z celku
      </Text>
    </View>
  );
});

/** 6 měsíců, osa Y, zvýraznění aktuálního měsíce (selectedMonth === month) */
const SixMonthTrendChart = memo(function SixMonthTrendChart({
  data,
  selectedMonth,
  trendMetric,
  plotHeight,
  chartBg,
  axisColor,
  labelColor,
  numberLocale,
}: {
  data: { label: string; month: string; value: number }[];
  selectedMonth: string;
  trendMetric: 'balance' | 'income' | 'expenses';
  plotHeight: number;
  chartBg: string;
  axisColor: string;
  labelColor: string;
  numberLocale: string;
}) {
  const values = data.map((d) => d.value);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const range = maxV - minV || 1;
  const fmtY = (v: number) =>
    Math.round(v).toLocaleString(numberLocale, { maximumFractionDigits: 0 });
  const midV = (maxV + minV) / 2;
  const ticks = [maxV, midV, minV];
  const barPositive = trendMetric === 'income' ? '#10B981' : trendMetric === 'expenses' ? '#F97316' : '#6366F1';
  const barNegative = '#EF4444';

  return (
    <View style={{ backgroundColor: chartBg, borderRadius: 12, padding: 12 }} testID="mini-bar-chart">
      <View style={{ flexDirection: 'row', minHeight: plotHeight + 28 }}>
        <View style={{ width: 52, justifyContent: 'space-between', paddingRight: 6, paddingBottom: 22 }}>
          {ticks.map((t, i) => (
            <Text key={i} style={{ fontSize: 10, color: axisColor, textAlign: 'right' }} numberOfLines={1}>
              {fmtY(t)}
            </Text>
          ))}
        </View>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: plotHeight,
            borderLeftWidth: 1,
            borderBottomWidth: 1,
            borderColor: axisColor,
            paddingHorizontal: 4,
            paddingBottom: 0,
          }}
        >
          {data.map((d, idx) => {
            const rawH = ((d.value - minV) / range) * plotHeight;
            const h =
              d.value === 0 && minV === 0 && maxV > 0
                ? 4
                : Math.max(4, Math.min(plotHeight, rawH));
            const positive = trendMetric === 'balance' ? d.value >= 0 : true;
            const isCurrent = d.month === selectedMonth;
            return (
              <View
                key={`${d.month}-${idx}`}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 2 }}
              >
                <View
                  style={{
                    width: '100%',
                    maxWidth: 28,
                    height: h,
                    borderRadius: 6,
                    backgroundColor: positive ? barPositive : barNegative,
                    opacity: isCurrent ? 1 : 0.75,
                    borderWidth: isCurrent ? 2 : 0,
                    borderColor: isCurrent ? '#FBBF24' : 'transparent',
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8, paddingLeft: 52, justifyContent: 'space-between' }}>
        {data.map((d, idx) => (
          <Text
            key={`lbl-${d.month}-${idx}`}
            style={{ flex: 1, fontSize: 10, color: labelColor, textAlign: 'center' }}
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
});

const CategoryExpensePieStrip = memo(function CategoryExpensePieStrip({
  categories,
  totalExpenses,
  formatAmount,
  mutedColor,
  expensesTotalLabel,
}: {
  categories: { category: string; amount: number; color: string; percentage: number }[];
  totalExpenses: number;
  formatAmount: (n: number) => string;
  mutedColor: string;
  expensesTotalLabel: string;
}) {
  if (totalExpenses <= 0 || categories.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', height: 14, borderRadius: 8, overflow: 'hidden', width: '100%' }}>
        {categories.map((c) => (
          <View
            key={c.category}
            style={{
              width: `${(c.amount / totalExpenses) * 100}%`,
              minWidth: 2,
              backgroundColor: c.color,
            }}
          />
        ))}
      </View>
      <Text style={{ fontSize: 11, color: mutedColor, marginTop: 8 }}>
        {expensesTotalLabel}
      </Text>
    </View>
  );
});

let stylesRef: ReturnType<typeof getStyles> & { _formatAmount: (n: number) => string; _isDark: boolean };

/** Zkrácená částka pro karty Příjmy / Výdaje / Bilance (nad 9 999 → tis., nad 999 999 → mil.). */
function formatCompactSummaryAmount(
  amount: number,
  currencySymbol: string,
  locale: string,
  t: ReturnType<typeof useLanguageStore.getState>['t'],
): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  const fmt = (v: number, maxFrac: number) =>
    v.toLocaleString(locale, {
      maximumFractionDigits: maxFrac,
      minimumFractionDigits: v % 1 !== 0 ? 1 : 0,
    });
  if (abs >= 1_000_000) {
    return t('amountCompactMillion', { sign, value: fmt(abs / 1_000_000, 1), symbol: currencySymbol });
  }
  if (abs > 9999) {
    return t('amountCompactThousand', { sign, value: fmt(abs / 1000, 1), symbol: currencySymbol });
  }
  return `${sign}${abs.toLocaleString(locale)} ${currencySymbol}`;
}

/** Zkrácený MoM pod kartou (např. „-96k Kč vs březen“). */
function formatCompactMomDelta(
  delta: number,
  currencySymbol: string,
  prevMonthLabel: string,
  locale: string,
  t: ReturnType<typeof useLanguageStore.getState>['t'],
): string {
  const r = Math.round(delta);
  const sign = r >= 0 ? '+' : '−';
  const abs = Math.abs(r);
  let compact: string;
  if (abs >= 1_000_000) {
    compact = `${(abs / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`;
  } else if (abs >= 1000) {
    compact = `${Math.round(abs / 1000)}k`;
  } else {
    compact = String(abs);
  }
  return t('monthlyReportMomDelta', { sign, compact, symbol: currencySymbol, monthLabel: prevMonthLabel });
}

type ReportMainTab = 'month' | 'year';

export default function MonthlyReportScreen() {
  const {
    getAllCategories,
    deleteTransaction,
  } = useFinanceStore();
  const transactions = useFilteredTransactions();
  const selectedMonth = useOverviewFiltersStore((s) => s.selectedMonth);
  const setSelectedMonth = useOverviewFiltersStore((s) => s.setSelectedMonth);
  const { getCurrentCurrency } = useSettingsStore();
  const { t, language } = useLanguageStore();
  const { colors, isDark: isDarkMode } = useTheme();
  const numberLocale = appLocale(language);
  const currency = getCurrentCurrency();

  const generateMonthlyReport = useCallback(
    (month: string) =>
      computeMonthlyReportFromTransactions(transactions, month, getAllCategories('expense')),
    [transactions, getAllCategories],
  );
  
  const [report, setReport] = useState<MonthlyReport>(() =>
    computeMonthlyReportFromTransactions([], yyyyMmLocalToday(), {}),
  );
  const [trendMetric, setTrendMetric] = useState<'balance' | 'income' | 'expenses'>('balance');
  const [compareYearsOpen, setCompareYearsOpen] = useState(false);
  const [mainTab, setMainTab] = useState<ReportMainTab>('month');
  const [yearTableYear, setYearTableYear] = useState<number>(() => new Date().getFullYear());

  useEffect(() => {
    setReport(generateMonthlyReport(selectedMonth));
  }, [transactions, selectedMonth, generateMonthlyReport]);

  // DEBUG - smazat po opravě
  useEffect(() => {
    const allTx = transactions.filter((t) => new Date(t.date).getFullYear() === 2026);
    console.log('=== ROČNÍ REPORT DEBUG ===');
    console.log('Celkem transakcí 2026:', allTx.length);
    console.log('Příjmy (všechny):', allTx.filter((t) => t.type === 'income').length);
    console.log('Výdaje (všechny):', allTx.filter((t) => t.type === 'expense').length);
    console.log('Převody (type=transfer):', allTx.filter((t) => (t as { type?: string }).type === 'transfer').length);
    console.log('Kategorie Převod:', allTx.filter((t) => t.category === 'Převod').length);
    console.log('Unikátní kategorie:', [...new Set(allTx.map((t) => t.category))]);
    console.log(
      'Leden příjmy:',
      allTx
        .filter((t) => t.type === 'income' && new Date(t.date).getMonth() === 0)
        .reduce((s, t) => s + t.amount, 0),
    );
    console.log(
      'Sample income transactions:',
      allTx
        .filter((t) => t.type === 'income')
        .slice(0, 5)
        .map((t) => ({
          date: t.date,
          amount: t.amount,
          category: t.category,
          description: (t.description ?? t.title ?? '').substring(0, 30),
        })),
    );
  }, [transactions]);

  const prevMonth = useMemo(() => addMonthsToYyyyMm(selectedMonth, -1), [selectedMonth]);

  const prevReport = useMemo<MonthlyReport>(() => generateMonthlyReport(prevMonth), [generateMonthlyReport, prevMonth]);

  const prevMonthLabelVs = useMemo(() => {
    const m = parseInt(prevMonth.slice(5, 7), 10);
    if (!Number.isFinite(m) || m < 1 || m > 12) return t('monthlyReportLastMonth');
    const name = formatMonthLong(m, numberLocale);
    return name ? name.charAt(0).toLowerCase() + name.slice(1) : t('monthlyReportLastMonth');
  }, [prevMonth, numberLocale, t]);

  /** Absolutní rozdíl oproti předchozímu měsíci; null = předchozí měsíc bez smysluplné báze (0). */
  const mom = useMemo(() => {
    const diff = (curr: number, prev: number) => curr - prev;
    const prevIncomeOk = prevReport.totalIncome > 0;
    const prevExpensesOk = prevReport.totalExpenses > 0;
    const prevBalanceOk = Math.abs(prevReport.balance) > 1e-6;
    return {
      income: prevIncomeOk ? diff(report.totalIncome, prevReport.totalIncome) : null,
      expenses: prevExpensesOk ? diff(report.totalExpenses, prevReport.totalExpenses) : null,
      balance: prevBalanceOk ? diff(report.balance, prevReport.balance) : null,
    } as { income: number | null; expenses: number | null; balance: number | null };
  }, [report, prevReport]);

  const styles = useMemo(() => getStyles(colors), [colors]);
  stylesRef = Object.assign(styles, { _formatAmount: (n: number) => `${n.toLocaleString(numberLocale)} ${currency.symbol}`, _isDark: isDarkMode });

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth(addMonthsToYyyyMm(selectedMonth, direction === 'prev' ? -1 : 1));
  };

  const navigateYearTableYear = (direction: 'prev' | 'next') => {
    setYearTableYear((y) => y + (direction === 'prev' ? -1 : 1));
  };

  const yearTableRows = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    const rows: { month: number; income: number; expenses: number; balance: number; isCurrent: boolean }[] = [];
    for (let m = 1; m <= 12; m++) {
      const txs = excludeTransfersFromReports(getMonthTransactions(transactions, yearTableYear, m));
      const income = txs.filter(isIncomeForReport).reduce((s, t) => s + t.amount, 0);
      const expenses = netExpenseAmount(txs);
      rows.push({
        month: m,
        income,
        expenses,
        balance: income - expenses,
        isCurrent: yearTableYear === cy && m === cm,
      });
    }
    return rows;
  }, [transactions, yearTableYear]);

  const yearOverviewActiveMonths = useMemo(
    () => yearTableRows.filter((r) => r.income > 0 || r.expenses > 0),
    [yearTableRows],
  );

  const yearOverviewBarMax = useMemo(() => {
    let maxIncome = 1;
    let maxExpenses = 1;
    for (const r of yearOverviewActiveMonths) {
      maxIncome = Math.max(maxIncome, r.income);
      maxExpenses = Math.max(maxExpenses, r.expenses);
    }
    return { maxIncome, maxExpenses };
  }, [yearOverviewActiveMonths]);

  const onYearTableRowPress = useCallback((m: number) => {
    setSelectedMonth(`${yearTableYear}-${String(m).padStart(2, '0')}`);
    setMainTab('month');
  }, [yearTableYear]);

  const formatMonth = useCallback(
    (monthStr: string) => formatYyyyMmTitle(monthStr, numberLocale),
    [numberLocale],
  );

  const formatAmount = useCallback(
    (amount: number) => `${amount.toLocaleString(numberLocale)} ${currency.symbol}`,
    [currency.symbol, numberLocale],
  );

  const expensesTotalLabel = useCallback(
    (total: number) => t('monthlyReportTotalExpenses', { amount: formatAmount(total) }),
    [formatAmount, t],
  );

  const formatSummaryCardAmount = useCallback(
    (amount: number) => formatCompactSummaryAmount(amount, currency.symbol, numberLocale, t),
    [currency.symbol, numberLocale, t],
  );



  const series = useMemo(() => {
    try {
      const points: { month: string; label: string; income: number; expenses: number; balance: number }[] = [];
      const [by, bm] = selectedMonth.split('-').map((x) => parseInt(x, 10));
      const base = new Date(by, (bm || 1) - 1, 1);
      for (let i = 5; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        const ym = yyyyMmLocalFromDate(d);
        const r = generateMonthlyReport(ym);
        const label = d.toLocaleDateString(numberLocale, { month: 'short' }).replace('.', '');
        points.push({ month: ym, label, income: r.totalIncome, expenses: r.totalExpenses, balance: r.balance });
      }
      return points;
    } catch (e) {
      console.log('monthly-report: series error', e);
      return [] as { month: string; label: string; income: number; expenses: number; balance: number }[];
    }
  }, [generateMonthlyReport, selectedMonth, numberLocale]);

  const monthTransactions = useMemo<Transaction[]>(() => {
    try {
      return transactions.filter(t => {
        const txDate = transactionDateYmd(t.date);
        return txDate.startsWith(selectedMonth);
      });
    } catch (e) {
      console.log('monthly-report: month tx error', e);
      return [] as Transaction[];
    }
  }, [transactions, selectedMonth]);

  /** V sekci seznamu výdaje + vratky (bez převodů), od největší částky. */
  const monthExpenseTransactionsForList = useMemo(
    () =>
      monthTransactions
        .filter((t) => isExpenseForReport(t) || isRefundTransaction(t))
        .sort((a, b) => b.amount - a.amount),
    [monthTransactions],
  );

  const categoryBreakdownNoPrevod = useMemo(
    () => report.categoryBreakdown.filter((c) => c.category !== 'Převod'),
    [report.categoryBreakdown],
  );

  /** Max 5 kategorií: bez Převodu, Ostatní až na konci (ne jako první). */
  const categoryBreakdownTopFive = useMemo(() => {
    const sorted = [...categoryBreakdownNoPrevod].sort((a, b) => b.amount - a.amount);
    const ostatni = sorted.find((c) => c.category === 'Ostatní');
    const rest = sorted.filter((c) => c.category !== 'Ostatní');
    const ordered = ostatni ? [...rest, ostatni] : rest;
    return ordered.slice(0, 5);
  }, [categoryBreakdownNoPrevod]);

  const yearReport = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    for (let m = 1; m <= 12; m++) {
      const ym = `${yearTableYear}-${String(m).padStart(2, '0')}`;
      const r = generateMonthlyReport(ym);
      totalIncome += r.totalIncome;
      totalExpenses += r.totalExpenses;
    }
    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
    };
  }, [yearTableYear, generateMonthlyReport]);

  const yearSavingsRate = useMemo(
    () =>
      yearReport.totalIncome > 0 ? Math.round((yearReport.balance / yearReport.totalIncome) * 100) : 0,
    [yearReport.balance, yearReport.totalIncome],
  );

  const yearMonthBars = useMemo(() => {
    const bars: { month: number; label: string; expenses: number; income: number }[] = [];
    let maxExp = 1;
    for (let m = 1; m <= 12; m++) {
      const ym = `${yearTableYear}-${String(m).padStart(2, '0')}`;
      const r = generateMonthlyReport(ym);
      maxExp = Math.max(maxExp, r.totalExpenses, 1);
      bars.push({
        month: m,
        label: formatMonthShort(m, numberLocale) || String(m),
        expenses: r.totalExpenses,
        income: r.totalIncome,
      });
    }
    return { bars, maxExp };
  }, [yearTableYear, generateMonthlyReport, numberLocale]);

  const yearCategoryBreakdownNoPrevod = useMemo(() => {
    const totals: Record<string, { amount: number; color: string; icon: string }> = {};
    let totalExpenses = 0;
    for (let m = 1; m <= 12; m++) {
      const ym = `${yearTableYear}-${String(m).padStart(2, '0')}`;
      const r = generateMonthlyReport(ym);
      totalExpenses += r.totalExpenses;
      for (const c of r.categoryBreakdown) {
        if (c.category === 'Převod') continue;
        if (!totals[c.category]) {
          totals[c.category] = { amount: 0, color: c.color, icon: c.icon };
        }
        totals[c.category].amount += c.amount;
      }
    }
    return {
      totalExpenses,
      breakdown: Object.entries(totals)
        .map(([category, { amount, color, icon }]) => ({
          category,
          amount,
          percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
          color,
          icon,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [yearTableYear, generateMonthlyReport]);

  const yearCategoryBreakdownTopFive = useMemo(() => {
    const sorted = [...yearCategoryBreakdownNoPrevod.breakdown].sort((a, b) => b.amount - a.amount);
    const ostatni = sorted.find((c) => c.category === 'Ostatní');
    const rest = sorted.filter((c) => c.category !== 'Ostatní');
    const ordered = ostatni ? [...rest, ostatni] : rest;
    return ordered.slice(0, 5);
  }, [yearCategoryBreakdownNoPrevod.breakdown]);

  const compareThreeYears = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y];
  }, []);

  const compareYearStats = useMemo(() => {
    return compareThreeYears.map((yr) => {
      let totalIncome = 0;
      let totalExpenses = 0;
      for (let m = 1; m <= 12; m++) {
        const ym = `${yr}-${String(m).padStart(2, '0')}`;
        const r = generateMonthlyReport(ym);
        totalIncome += r.totalIncome;
        totalExpenses += r.totalExpenses;
      }
      return {
        year: yr,
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
      };
    });
  }, [compareThreeYears, generateMonthlyReport]);

  const metricSeries = useMemo(() => {
    return series.map((p) => ({
      label: p.label,
      month: p.month,
      value:
        trendMetric === 'balance'
          ? p.balance
          : trendMetric === 'income'
            ? p.income
            : p.expenses,
    }));
  }, [series, trendMetric]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [selectedMonth, fadeAnim]);

  const formatMomAbsLine = useCallback(
    (delta: number) => formatCompactMomDelta(delta, currency.symbol, prevMonthLabelVs, numberLocale, t),
    [currency.symbol, prevMonthLabelVs, numberLocale, t],
  );

  return (
    <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.header}>
            <BackButton color={colors.text} size={24} style={styles.backButton} testID="back-button" />
            <Text style={styles.headerTitle}>{t('monthlyReport')}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={[styles.reportMainTabs, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.reportMainTab,
                { backgroundColor: mainTab === 'month' ? colors.primary + '22' : colors.muted },
              ]}
              onPress={() => setMainTab('month')}
              activeOpacity={0.85}
            >
              <Text style={[styles.reportMainTabText, { color: mainTab === 'month' ? colors.primary : colors.text }]}>
                {t('month')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.reportMainTab,
                { backgroundColor: mainTab === 'year' ? colors.primary + '22' : colors.muted },
              ]}
              onPress={() => {
                const y = parseInt(selectedMonth.slice(0, 4), 10);
                if (Number.isFinite(y)) setYearTableYear(y);
                setMainTab('year');
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.reportMainTabText, { color: mainTab === 'year' ? colors.primary : colors.text }]}>
                {t('year')}
              </Text>
            </TouchableOpacity>
          </View>

          {mainTab === 'month' && (
          <>
          <View style={styles.monthNavigation}>
            <TouchableOpacity 
              testID="prev-month"
              style={styles.navButton} 
              onPress={() => navigateMonth('prev')}
            >
              <ChevronLeft size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.monthTitle} testID="month-title">{formatMonth(selectedMonth)}</Text>
            <TouchableOpacity 
              testID="next-month"
              style={styles.navButton} 
              onPress={() => navigateMonth('next')}
            >
              <ChevronRight size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <OverviewFilterBadge style={{ alignSelf: 'center', marginBottom: 12 }} />

          <View style={styles.summaryContainer}>
            <View style={[styles.summaryCard, styles.incomeCard]} testID="card-income">
              <TrendingUp size={18} color="#10B981" />
              <Text
                style={[styles.summaryAmount, { color: '#10B981' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {formatSummaryCardAmount(report.totalIncome)}
              </Text>
              <Text style={styles.summaryLabel}>{t('monthlyReportTrendIncome')}</Text>
              {mom.income != null ? (
                <Text style={[styles.momText, { color: mom.income >= 0 ? colors.success : colors.error }]}>
                  {formatMomAbsLine(mom.income)}
                </Text>
              ) : null}
            </View>

            <View style={[styles.summaryCard, styles.expenseCard]} testID="card-expenses">
              <TrendingDown size={18} color="#EF4444" />
              <Text
                style={[styles.summaryAmount, { color: '#EF4444' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {formatSummaryCardAmount(report.totalExpenses)}
              </Text>
              <Text style={styles.summaryLabel}>{t('monthlyReportTrendExpenses')}</Text>
              {mom.expenses != null ? (
                <Text style={[styles.momText, { color: mom.expenses <= 0 ? colors.success : colors.error }]}>
                  {formatMomAbsLine(mom.expenses)}
                </Text>
              ) : null}
            </View>

            <View style={[styles.summaryCard, styles.balanceCard]} testID="card-balance">
              <PiggyBank size={18} color={report.balance >= 0 ? '#10B981' : '#EF4444'} />
              <Text
                style={[
                  styles.summaryAmount,
                  { color: report.balance >= 0 ? '#10B981' : '#EF4444' },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {formatSummaryCardAmount(report.balance)}
              </Text>
              <Text style={styles.summaryLabel}>{t('monthlyReportTrendBalance')}</Text>
              {mom.balance != null ? (
                <Text style={[styles.momText, { color: mom.balance >= 0 ? colors.success : colors.error }]}>
                  {formatMomAbsLine(mom.balance)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.trendSection}>
            <View style={styles.trendHeader}>
              <Text style={styles.sectionTitle}>{t('monthlyReportTrend6Months')}</Text>
              <View style={styles.trendTabs}>
                {(['balance','income','expenses'] as const).map(m => (
                  <TouchableOpacity key={m} testID={`tab-${m}`} onPress={() => setTrendMetric(m)} style={[styles.trendTab, trendMetric===m && styles.trendTabActive]}>
                    <Text style={[styles.trendTabText, trendMetric===m && styles.trendTabTextActive]}>{m==='balance'?t('monthlyReportTrendBalance'):m==='income'?t('monthlyReportTrendIncome'):t('monthlyReportTrendExpenses')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.trendCard}>
              <SixMonthTrendChart
                data={metricSeries}
                selectedMonth={selectedMonth}
                trendMetric={trendMetric}
                plotHeight={120}
                chartBg={isDarkMode ? '#0f172a' : '#cbd5e1'}
                axisColor={isDarkMode ? '#64748b' : '#64748b'}
                labelColor={colors.textSecondary}
                numberLocale={numberLocale}
              />
            </View>
          </View>

          <View style={styles.categorySection}>
            <Text style={styles.sectionTitle}>{t('detailExpensesByCategory')}</Text>
            <View style={styles.categoryContainer}>
              {report.totalExpenses <= 0 || categoryBreakdownNoPrevod.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 8 }}>
                  {t('monthlyReportNoExpensesMonth')}
                </Text>
              ) : (
                <>
                  <CategoryExpensePieStrip
                    categories={categoryBreakdownNoPrevod}
                    totalExpenses={report.totalExpenses}
                    formatAmount={formatAmount}
                    mutedColor={colors.textSecondary}
                    expensesTotalLabel={expensesTotalLabel(report.totalExpenses)}
                  />
                  {categoryBreakdownTopFive.map((category, index) => (
                    <CategoryBar
                      key={`${category.category}-${index}`}
                      category={category.category}
                      amount={category.amount}
                      percentage={category.percentage}
                      color={category.color}
                    />
                  ))}
                </>
              )}
            </View>
          </View>

          {monthExpenseTransactionsForList.length > 0 && (
            <View style={styles.topExpensesSection}>
              <Text style={styles.sectionTitle}>{t('transactions')}</Text>
              <View style={styles.listCard}>
                {monthExpenseTransactionsForList.map((t) => (
                  <View key={t.id} style={styles.topExpenseSwipeWrap} testID={`expense-${t.id}`}>
                    <SwipeableTransactionRow
                      transaction={t}
                      onDelete={deleteTransaction}
                      currencySymbol={currency.symbol}
                      subtitle={ymdToLocalDateNoon(transactionDateYmd(t.date)).toLocaleDateString(numberLocale)}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
          </>
          )}

          {mainTab === 'year' && (
          <>
          <View style={[styles.reportYearNav, { backgroundColor: colors.background }]}>
            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: colors.muted }]}
              onPress={() => navigateYearTableYear('prev')}
            >
              <ChevronLeft size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.reportYearNavTitle, { color: colors.text }]}>{yearTableYear}</Text>
            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: colors.muted }]}
              onPress={() => navigateYearTableYear('next')}
            >
              <ChevronRight size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.yearSection}>
            <Text style={styles.sectionTitle}>{t('monthlyReportYearOverview')}</Text>
            <View style={[styles.yearOverviewSummaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.yearOverviewSummaryTitle, { color: colors.text }]}>
                Souhrn roku {yearTableYear}
              </Text>
              <View style={styles.yearOverviewSummaryRow}>
                <Text style={[styles.yearOverviewSummaryLabel, { color: colors.textSecondary }]}>{t('monthlyReportTrendIncome')}</Text>
                <Text style={[styles.yearOverviewSummaryValue, { color: '#10B981' }]}>
                  {formatAmount(yearReport.totalIncome)}
                </Text>
              </View>
              <View style={styles.yearOverviewSummaryRow}>
                <Text style={[styles.yearOverviewSummaryLabel, { color: colors.textSecondary }]}>{t('monthlyReportTrendExpenses')}</Text>
                <Text style={[styles.yearOverviewSummaryValue, { color: '#EF4444' }]}>
                  {formatAmount(yearReport.totalExpenses)}
                </Text>
              </View>
              <View style={styles.yearOverviewSummaryRow}>
                <Text style={[styles.yearOverviewSummaryLabel, { color: colors.textSecondary }]}>{t('monthlyReportTrendBalance')}</Text>
                <Text
                  style={[
                    styles.yearOverviewSummaryValue,
                    { color: yearReport.balance >= 0 ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {formatAmount(yearReport.balance)}
                </Text>
              </View>
              <View style={[styles.yearOverviewSavingsRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.yearOverviewSummaryLabel, { color: colors.textSecondary }]}>{t('monthlyReportSavingsRate')}</Text>
                <Text style={[styles.yearOverviewSavingsValue, { color: colors.primary }]}>
                  {yearSavingsRate}%
                </Text>
              </View>
            </View>
            {yearOverviewActiveMonths.length === 0 ? (
              <Text style={[styles.yearOverviewEmpty, { color: colors.textSecondary }]}>
                {t('monthlyReportNoTransactionsYear')}
              </Text>
            ) : (
              yearOverviewActiveMonths.map((row) => {
                const incomePct = Math.max(4, Math.round((row.income / yearOverviewBarMax.maxIncome) * 100));
                const expensePct = Math.max(4, Math.round((row.expenses / yearOverviewBarMax.maxExpenses) * 100));
                return (
                  <TouchableOpacity
                    key={row.month}
                    style={[
                      styles.yearOverviewMonthCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      row.isCurrent && styles.yearOverviewMonthCardCurrent,
                    ]}
                    onPress={() => onYearTableRowPress(row.month)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.yearOverviewMonthHeader}>
                      <Text style={[styles.yearOverviewMonthName, { color: colors.text }]}>
                        {formatMonthLong(row.month, numberLocale)}
                      </Text>
                      <Text
                        style={[
                          styles.yearOverviewMonthBalance,
                          { color: row.balance >= 0 ? '#10B981' : '#EF4444' },
                        ]}
                      >
                        {formatSummaryCardAmount(row.balance)}
                      </Text>
                    </View>
                    <View style={styles.yearOverviewBarsRow}>
                      <View style={[styles.yearOverviewBarTrack, { backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0' }]}>
                        <View
                          style={[
                            styles.yearOverviewBarFill,
                            { width: `${incomePct}%`, backgroundColor: '#10B981' },
                          ]}
                        />
                      </View>
                      <View style={[styles.yearOverviewBarTrack, { backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0' }]}>
                        <View
                          style={[
                            styles.yearOverviewBarFill,
                            { width: `${expensePct}%`, backgroundColor: '#EF4444' },
                          ]}
                        />
                      </View>
                    </View>
                    <Text style={[styles.yearOverviewMonthMeta, { color: colors.textSecondary }]}>
                      {t('monthlyReportRowIncomeExpenses', {
                        income: formatSummaryCardAmount(row.income),
                        expenses: formatSummaryCardAmount(row.expenses),
                      })}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
            {yearOverviewActiveMonths.length > 0 ? (
              <Text style={[styles.yearTableHint, { color: colors.textSecondary }]}>
                {t('monthlyReportYearTapHint')}
              </Text>
            ) : null}
            <Text style={[styles.yearChartHint, { color: colors.textSecondary }]}>{t('monthlyReportExpensesByMonth', { year: yearTableYear })}</Text>
            <View style={styles.yearBarsRow}>
              {yearMonthBars.bars.map((b) => {
                const trackH = 104;
                const fillH = Math.max(4, Math.round((b.expenses / yearMonthBars.maxExp) * trackH));
                return (
                  <View key={b.month} style={styles.yearBarCol}>
                    <View style={[styles.yearBarTrack, { height: trackH, backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0' }]}>
                      <View style={[styles.yearBarFill, { height: fillH, backgroundColor: '#EF4444' }]} />
                    </View>
                    <Text style={[styles.yearBarLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                      {b.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.compareYearsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setCompareYearsOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={[styles.compareYearsBtnText, { color: colors.text }]}>{t('monthlyReportCompareYears')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.compareSection}>
            <Text style={styles.sectionTitle}>{t('monthlyReportIncomeVsExpenses')}</Text>
            <View style={styles.compareCard}>
              <View style={styles.compareBarBg}>
                {(() => {
                  const total = Math.max(1, yearReport.totalIncome + yearReport.totalExpenses);
                  const incPct = (yearReport.totalIncome / total) * 100;
                  const expPct = (yearReport.totalExpenses / total) * 100;
                  return (
                    <View style={{ flexDirection: 'row', width: '100%' }}>
                      <View style={{ width: `${incPct}%`, backgroundColor: '#10B981', height: 10, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} />
                      <View style={{ width: `${expPct}%`, backgroundColor: '#EF4444', height: 10, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} />
                    </View>
                  );
                })()}
              </View>
              <View style={styles.compareLegend}>
                <Text style={styles.compareLegendText}>{t('monthlyReportIncomeWithAmount', { amount: formatAmount(yearReport.totalIncome) })}</Text>
                <Text style={styles.compareLegendText}>{t('monthlyReportExpensesWithAmount', { amount: formatAmount(yearReport.totalExpenses) })}</Text>
              </View>
            </View>
          </View>

          <View style={styles.categorySection}>
            <Text style={styles.sectionTitle}>{t('detailExpensesByCategory')}</Text>
            <View style={styles.categoryContainer}>
              {yearCategoryBreakdownNoPrevod.totalExpenses <= 0 ||
              yearCategoryBreakdownNoPrevod.breakdown.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 8 }}>
                  {t('monthlyReportNoExpensesYear')}
                </Text>
              ) : (
                <>
                  <CategoryExpensePieStrip
                    categories={yearCategoryBreakdownNoPrevod.breakdown}
                    totalExpenses={yearCategoryBreakdownNoPrevod.totalExpenses}
                    formatAmount={formatAmount}
                    mutedColor={colors.textSecondary}
                    expensesTotalLabel={expensesTotalLabel(yearCategoryBreakdownNoPrevod.totalExpenses)}
                  />
                  {yearCategoryBreakdownTopFive.map((category, index) => (
                    <CategoryBar
                      key={`${category.category}-${index}`}
                      category={category.category}
                      amount={category.amount}
                      percentage={category.percentage}
                      color={category.color}
                    />
                  ))}
                </>
              )}
            </View>
          </View>
          </>
          )}
          </Animated.View>
        </ScrollView>

        <Modal
          visible={compareYearsOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setCompareYearsOpen(false)}
        >
          <View style={[styles.compareModalOverlay, { backgroundColor: colors.overlay }]}>
            <View style={[styles.compareModalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.compareModalTitle, { color: colors.text }]}>{t('monthlyReportCompareYears')}</Text>
              <Text style={[styles.compareModalSub, { color: colors.textSecondary }]}>
                {t('monthlyReportYearTotalsNote')}
              </Text>
              <View style={styles.compareCols}>
                {compareYearStats.map((row) => (
                  <View key={row.year} style={[styles.compareCol, { borderColor: colors.border }]}>
                    <Text style={[styles.compareColYear, { color: colors.primary }]}>{row.year}</Text>
                    <Text style={[styles.compareColLine, { color: colors.textSecondary }]}>{t('monthlyReportTrendIncome')}</Text>
                    <Text style={[styles.compareColAmount, { color: '#10B981' }]}>{formatAmount(row.totalIncome)}</Text>
                    <Text style={[styles.compareColLine, { color: colors.textSecondary }]}>{t('monthlyReportTrendExpenses')}</Text>
                    <Text style={[styles.compareColAmount, { color: '#EF4444' }]}>{formatAmount(row.totalExpenses)}</Text>
                    <Text style={[styles.compareColLine, { color: colors.textSecondary }]}>{t('monthlyReportTrendBalance')}</Text>
                    <Text style={[styles.compareColAmount, { color: row.balance >= 0 ? '#10B981' : '#EF4444' }]}>
                      {formatAmount(row.balance)}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.compareModalClose, { backgroundColor: colors.muted }]}
                onPress={() => setCompareYearsOpen(false)}
              >
                <Text style={[styles.compareModalCloseText, { color: colors.text }]}>{t('close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
    </SafeAreaView>
  );
}

const getStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
  },
  headerSpacer: {
    width: 32,
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: c.background,
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: c.muted,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: c.text,
    textTransform: 'capitalize',
  },
  reportMainTabs: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: c.surface,
  },
  reportMainTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportMainTabText: {
    fontSize: 15,
    fontWeight: '700',
  },
  reportYearNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  reportYearNavTitle: {
    fontSize: 20,
    fontWeight: '700',
    minWidth: 64,
    textAlign: 'center',
  },
  yearOverviewSummaryCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  yearOverviewSummaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  yearOverviewSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yearOverviewSummaryLabel: {
    fontSize: 14,
  },
  yearOverviewSummaryValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  yearOverviewSavingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  yearOverviewSavingsValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  yearOverviewEmpty: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  yearOverviewMonthCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  yearOverviewMonthCardCurrent: {
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  yearOverviewMonthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  yearOverviewMonthName: {
    fontSize: 16,
    fontWeight: '700',
  },
  yearOverviewMonthBalance: {
    fontSize: 15,
    fontWeight: '700',
  },
  yearOverviewBarsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  yearOverviewBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  yearOverviewBarFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  yearOverviewMonthMeta: {
    fontSize: 11,
    lineHeight: 15,
  },
  yearTableHint: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  trendSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  trendTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  trendTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: c.muted,
  },
  trendTabActive: {
    backgroundColor: c.border,
  },
  trendTabText: {
    fontSize: 12,
    color: c.textSecondary,
    fontWeight: '600',
  },
  trendTabTextActive: {
    color: c.text,
  },
  trendCard: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 0,
    overflow: 'visible',
  },
  yearSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  yearRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  yearChipText: {
    fontSize: 15,
    fontWeight: '700',
  },
  yearTotalsCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
    marginBottom: 12,
  },
  yearTotalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yearTotalsLabel: {
    fontSize: 14,
  },
  yearTotalsValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  yearChartHint: {
    fontSize: 13,
    marginBottom: 8,
  },
  yearBarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    gap: 4,
  },
  yearBarCol: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  yearBarTrack: {
    width: '100%',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  yearBarFill: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  yearBarLabel: {
    fontSize: 9,
    marginTop: 4,
    textAlign: 'center',
  },
  compareYearsBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  compareYearsBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  compareModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  compareModalSheet: {
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },
  compareModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  compareModalSub: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  compareCols: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  compareCol: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
  },
  compareColYear: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  compareColLine: {
    fontSize: 11,
    marginTop: 6,
  },
  compareColAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  compareModalClose: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  compareModalCloseText: {
    fontSize: 16,
    fontWeight: '700',
  },
  shareSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  shareButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  incomeCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  expenseCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  balanceCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  summaryLabel: {
    fontSize: 10,
    color: c.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  summaryAmount: {
    width: '100%',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 2,
    textAlign: 'center',
  },
  momText: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
  },
  savingsRateContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
    marginBottom: 12,
  },
  savingsRateCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  savingsRatePercentage: {
    fontSize: 36,
    fontWeight: '700',
    color: c.text,
  },
  savingsRateLabel: {
    fontSize: 16,
    color: c.textSecondary,
    marginTop: 8,
  },
  categorySection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  categoryContainer: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryBar: {
    marginBottom: 16,
  },
  categoryInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    color: c.text,
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: c.muted,
    borderRadius: 4,
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  categoryPercentage: {
    fontSize: 12,
    color: c.textSecondary,
    textAlign: 'right',
  },
  insightsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  insightCard: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  insightText: {
    fontSize: 14,
    color: c.text,
    lineHeight: 20,
  },
  compareSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  compareCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compareBarBg: {
    width: '100%',
    height: 10,
    backgroundColor: c.muted,
    borderRadius: 6,
    overflow: 'hidden',
  },
  compareLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  compareLegendText: {
    fontSize: 12,
    color: c.textSecondary,
  },
  topExpensesSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  listCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topExpenseSwipeWrap: {
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  listSub: {
    fontSize: 12,
    color: c.textSecondary,
    marginTop: 2,
  },
  listAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  statsSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  exportSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  exportCard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  exportText: {
    fontSize: 13,
    lineHeight: 18,
    color: c.text,
  },
  exportHint: {
    marginTop: 8,
    fontSize: 12,
    color: c.textSecondary,
  },
  deleteMonthSection: {
    paddingHorizontal: 16,
    marginBottom: 40,
  },
  deleteMonthButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  deleteMonthButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: c.textSecondary,
    textAlign: 'center',
  },
});