import React, { useMemo, useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinanceStore, MonthlyReport, Transaction } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, PiggyBank, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';

type CategoryBarProps = { category: string; amount: number; percentage: number; color: string };

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text testID="error-title" style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
          Něco se pokazilo
        </Text>
        <Text testID="error-message" style={{ color: '#6B7280', textAlign: 'center' }}>
          Zkuste to prosím znovu otevřít. {Platform.OS === 'web' ? 'Obnovte stránku.' : ''}
        </Text>
      </View>
    );
  }
  return (
    <React.Suspense fallback={null}>
      <View
        onLayout={() => {
          try {
            // noop to keep boundary referenced
          } catch (e) {
            console.log('monthly-report: layout error', e);
            setError(e as Error);
          }
        }}
        style={{ flex: 1 }}
      >
        {children}
      </View>
    </React.Suspense>
  );
}

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
      <Text style={stylesRef.categoryPercentage}>{percentage}%</Text>
    </View>
  );
});

const MiniBarChart = memo(function MiniBarChart({ data, colorUp, colorDown, maxHeight = 64 }: { data: Array<{ label: string; value: number }>; colorUp: string; colorDown: string; maxHeight?: number; }) {
  const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: maxHeight }} testID="mini-bar-chart">
      {data.map((d, idx) => {
        const h = (Math.abs(d.value) / maxVal) * maxHeight;
        const positive = d.value >= 0;
        return (
          <View key={`${d.label}-${idx}`} style={{ alignItems: 'center' }}>
            <View style={{ width: 14, height: h, borderRadius: 6, backgroundColor: positive ? colorUp : colorDown }} />
            <Text style={{ fontSize: 10, color: stylesRef._isDark ? '#9CA3AF' : '#6B7280', marginTop: 4 }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
});

let stylesRef: ReturnType<typeof getStyles> & { _formatAmount: (n: number) => string; _isDark: boolean };

export default function MonthlyReportScreen() {
  const { generateMonthlyReport, getCurrentMonthReport, transactions } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();
  const router = useRouter();
  
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<MonthlyReport>(getCurrentMonthReport());
  const [trendMetric, setTrendMetric] = useState<'balance' | 'income' | 'expenses'>('balance');

  const prevMonth = useMemo(() => {
    const d = new Date(selectedMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [selectedMonth]);

  const prevReport = useMemo<MonthlyReport>(() => generateMonthlyReport(prevMonth), [generateMonthlyReport, prevMonth]);

  const mom = useMemo(() => {
    const pct = (curr: number, prev: number) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };
    return {
      income: pct(report.totalIncome, prevReport.totalIncome),
      expenses: pct(report.totalExpenses, prevReport.totalExpenses),
      balance: pct(report.balance, prevReport.balance),
    } as { income: number | null; expenses: number | null; balance: number | null };
  }, [report, prevReport]);

  const styles = getStyles(isDarkMode);
  stylesRef = Object.assign(styles, { _formatAmount: (n: number) => `${n.toLocaleString('cs-CZ')} ${currency.symbol}`, _isDark: isDarkMode });

  const navigateMonth = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedMonth + '-01');
    if (direction === 'prev') {
      currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    const newMonth = currentDate.toISOString().slice(0, 7);
    setSelectedMonth(newMonth);
    setReport(generateMonthlyReport(newMonth));
  };

  const formatMonth = (monthStr: string) => {
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString('cs-CZ', { 
      year: 'numeric', 
      month: 'long' 
    });
  };

  const formatAmount = useCallback((amount: number) => `${amount.toLocaleString('cs-CZ')} ${currency.symbol}`,[currency.symbol]);



  const series = useMemo(() => {
    try {
      const points: Array<{ month: string; label: string; income: number; expenses: number; balance: number }> = [];
      const base = new Date(selectedMonth + '-01');
      for (let i = 5; i >= 0; i--) {
        const d = new Date(base);
        d.setMonth(d.getMonth() - i);
        const ym = d.toISOString().slice(0, 7);
        const r = generateMonthlyReport(ym);
        const label = d.toLocaleDateString('cs-CZ', { month: 'short' }).replace('.', '');
        points.push({ month: ym, label, income: r.totalIncome, expenses: r.totalExpenses, balance: r.balance });
      }
      return points;
    } catch (e) {
      console.log('monthly-report: series error', e);
      return [] as Array<{ month: string; label: string; income: number; expenses: number; balance: number }>;
    }
  }, [generateMonthlyReport, selectedMonth]);

  const monthTransactions = useMemo<Transaction[]>(() => {
    try {
      return transactions.filter(t => new Date(t.date).toISOString().slice(0,7) === selectedMonth);
    } catch (e) {
      console.log('monthly-report: month tx error', e);
      return [] as Transaction[];
    }
  }, [transactions, selectedMonth]);

  const topExpenses = useMemo(() => monthTransactions.filter(t => t.type === 'expense').sort((a,b)=> b.amount - a.amount).slice(0,5), [monthTransactions]);

  const metricSeries = useMemo(() => {
    return series.map(p => ({ label: p.label, value: trendMetric === 'balance' ? p.balance : trendMetric === 'income' ? p.income : p.expenses * -1 }));
  }, [series, trendMetric]);

  return (
    <SafeAreaView style={styles.container}>
      <ErrorBoundary>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity
              testID="back-button"
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <ArrowLeft size={24} color={isDarkMode ? '#FFFFFF' : '#000000'} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Měsíční report</Text>
            <View style={styles.headerSpacer} />
          </View>
          
          <View style={styles.monthNavigation}>
            <TouchableOpacity 
              testID="prev-month"
              style={styles.navButton} 
              onPress={() => navigateMonth('prev')}
            >
              <ChevronLeft size={24} color={isDarkMode ? '#FFFFFF' : '#000000'} />
            </TouchableOpacity>
            <Text style={styles.monthTitle} testID="month-title">{formatMonth(selectedMonth)}</Text>
            <TouchableOpacity 
              testID="next-month"
              style={styles.navButton} 
              onPress={() => navigateMonth('next')}
            >
              <ChevronRight size={24} color={isDarkMode ? '#FFFFFF' : '#000000'} />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryContainer}>
            <View style={[styles.summaryCard, styles.incomeCard]} testID="card-income">
              <TrendingUp size={24} color="#10B981" />
              <Text style={styles.summaryLabel}>Příjmy</Text>
              <Text style={[styles.summaryAmount, { color: '#10B981' }]}>
                {formatAmount(report.totalIncome)}
              </Text>
              <Text style={[styles.momText, { color: mom.income != null ? (mom.income >= 0 ? '#10B981' : '#EF4444') : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>
                {mom.income == null ? '—' : `${mom.income >= 0 ? '+' : ''}${mom.income.toFixed(1)}% MoM`}
              </Text>
            </View>
            
            <View style={[styles.summaryCard, styles.expenseCard]} testID="card-expenses">
              <TrendingDown size={24} color="#EF4444" />
              <Text style={styles.summaryLabel}>Výdaje</Text>
              <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>
                {formatAmount(report.totalExpenses)}
              </Text>
              <Text style={[styles.momText, { color: mom.expenses != null ? (mom.expenses <= 0 ? '#10B981' : '#EF4444') : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>
                {mom.expenses == null ? '—' : `${mom.expenses >= 0 ? '+' : ''}${mom.expenses.toFixed(1)}% MoM`}
              </Text>
            </View>
            
            <View style={[styles.summaryCard, styles.balanceCard]} testID="card-balance">
              <PiggyBank size={24} color={report.balance >= 0 ? '#10B981' : '#EF4444'} />
              <Text style={styles.summaryLabel}>Bilance</Text>
              <Text style={[styles.summaryAmount, { color: report.balance >= 0 ? '#10B981' : '#EF4444' }]}>
                {formatAmount(report.balance)}
              </Text>
              <Text style={[styles.momText, { color: mom.balance != null ? (mom.balance >= 0 ? '#10B981' : '#EF4444') : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>
                {mom.balance == null ? '—' : `${mom.balance >= 0 ? '+' : ''}${mom.balance.toFixed(1)}% MoM`}
              </Text>
            </View>
          </View>

          <View style={styles.trendSection}>
            <View style={styles.trendHeader}>
              <Text style={styles.sectionTitle}>Trend za 6 měsíců</Text>
              <View style={styles.trendTabs}>
                {(['balance','income','expenses'] as const).map(m => (
                  <TouchableOpacity key={m} testID={`tab-${m}`} onPress={() => setTrendMetric(m)} style={[styles.trendTab, trendMetric===m && styles.trendTabActive]}>
                    <Text style={[styles.trendTabText, trendMetric===m && styles.trendTabTextActive]}>{m==='balance'?'Bilance':m==='income'?'Příjmy':'Výdaje'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.trendCard}>
              <MiniBarChart data={metricSeries} colorUp="#10B981" colorDown="#EF4444" />
            </View>
          </View>

          <View style={styles.compareSection}>
            <Text style={styles.sectionTitle}>Příjmy vs. Výdaje</Text>
            <View style={styles.compareCard}>
              <View style={styles.compareBarBg}>
                {(() => {
                  const total = Math.max(1, report.totalIncome + report.totalExpenses);
                  const incPct = (report.totalIncome / total) * 100;
                  const expPct = (report.totalExpenses / total) * 100;
                  return (
                    <View style={{ flexDirection: 'row', width: '100%' }}>
                      <View style={{ width: `${incPct}%`, backgroundColor: '#10B981', height: 10, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} />
                      <View style={{ width: `${expPct}%`, backgroundColor: '#EF4444', height: 10, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} />
                    </View>
                  );
                })()}
              </View>
              <View style={styles.compareLegend}>
                <Text style={styles.compareLegendText}>Příjmy: {formatAmount(report.totalIncome)}</Text>
                <Text style={styles.compareLegendText}>Výdaje: {formatAmount(report.totalExpenses)}</Text>
              </View>
            </View>
          </View>

          {report.categoryBreakdown.length > 0 && (
            <View style={styles.categorySection}>
              <Text style={styles.sectionTitle}>Výdaje podle kategorií</Text>
              <View style={styles.categoryContainer}>
                {report.categoryBreakdown.map((category, index) => (
                  <CategoryBar
                    key={index}
                    category={category.category}
                    amount={category.amount}
                    percentage={category.percentage}
                    color={category.color}
                  />
                ))}
              </View>
            </View>
          )}

          {topExpenses.length > 0 && (
            <View style={styles.topExpensesSection}>
              <Text style={styles.sectionTitle}>Top výdaje měsíce</Text>
              <View style={styles.listCard}>
                {topExpenses.map((t) => (
                  <View key={t.id} style={styles.listItem} testID={`expense-${t.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{t.title}</Text>
                      <Text style={styles.listSub}>{new Date(t.date).toLocaleDateString('cs-CZ')}</Text>
                    </View>
                    <Text style={[styles.listAmount, { color: '#EF4444' }]}>-{formatAmount(t.amount)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {report.insights.length > 0 && (
            <View style={styles.insightsSection}>
              <Text style={styles.sectionTitle}>Pozorování a tipy</Text>
              {report.insights.map((insight, index) => (
                <View key={index} style={styles.insightCard}>
                  <Text style={styles.insightText}>{insight}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Statistiky</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{report.transactionCount}</Text>
                <Text style={styles.statLabel}>Transakcí</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{report.topExpenseCategory}</Text>
                <Text style={styles.statLabel}>Nejvyšší výdaj</Text>
              </View>
            </View>
          </View>

          <View style={styles.exportSection}>
            <Text style={styles.sectionTitle}>Textový souhrn</Text>
            <View style={styles.exportCard}>
              <Text selectable testID="report-text" style={styles.exportText}>
                {`${formatMonth(selectedMonth)}\nPříjmy: ${formatAmount(report.totalIncome)}\nVýdaje: ${formatAmount(report.totalExpenses)}\nBilance: ${formatAmount(report.balance)}\nMíra úspor: ${report.savingsRate}%\nTop výdajová kategorie: ${report.topExpenseCategory}`}
              </Text>
              <Text style={styles.exportHint}>Text podržte pro kopírování</Text>
            </View>
          </View>
        </ScrollView>
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDarkMode ? '#000000' : '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? '#2A2A2A' : '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: isDarkMode ? '#FFFFFF' : '#1F2937',
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
    backgroundColor: isDarkMode ? '#000000' : '#F8F9FA',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: isDarkMode ? '#2A2A2A' : '#F1F5F9',
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: isDarkMode ? '#FFFFFF' : '#1F2937',
    textTransform: 'capitalize',
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
    backgroundColor: isDarkMode ? '#111827' : '#E5E7EB',
  },
  trendTabActive: {
    backgroundColor: isDarkMode ? '#374151' : '#D1D5DB',
  },
  trendTabText: {
    fontSize: 12,
    color: isDarkMode ? '#9CA3AF' : '#374151',
    fontWeight: '600',
  },
  trendTabTextActive: {
    color: isDarkMode ? '#FFFFFF' : '#111827',
  },
  trendCard: {
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 12,
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
    marginTop: 8,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  momText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  savingsRateContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: isDarkMode ? '#FFFFFF' : '#1F2937',
    marginBottom: 12,
  },
  savingsRateCard: {
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
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
    color: isDarkMode ? '#FFFFFF' : '#1F2937',
  },
  savingsRateLabel: {
    fontSize: 16,
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
    marginTop: 8,
  },
  categorySection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  categoryContainer: {
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
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
    color: isDarkMode ? '#FFFFFF' : '#1F2937',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: isDarkMode ? '#374151' : '#E5E7EB',
    borderRadius: 4,
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  categoryPercentage: {
    fontSize: 12,
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
    textAlign: 'right',
  },
  insightsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  insightCard: {
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
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
    color: isDarkMode ? '#FFFFFF' : '#1F2937',
    lineHeight: 20,
  },
  compareSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  compareCard: {
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
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
    backgroundColor: isDarkMode ? '#374151' : '#E5E7EB',
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
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
  },
  topExpensesSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  listCard: {
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? '#2A2A2A' : '#F3F4F6',
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: isDarkMode ? '#FFFFFF' : '#111827',
  },
  listSub: {
    fontSize: 12,
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
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
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
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
    color: isDarkMode ? '#E5E7EB' : '#111827',
  },
  exportHint: {
    marginTop: 8,
    fontSize: 12,
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
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
    color: isDarkMode ? '#FFFFFF' : '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
    textAlign: 'center',
  },
});