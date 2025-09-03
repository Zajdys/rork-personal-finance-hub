import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFinanceStore, MonthlyReport } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react-native';

export default function MonthlyReportScreen() {
  const { generateMonthlyReport, getCurrentMonthReport } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();
  
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<MonthlyReport>(getCurrentMonthReport());

  const styles = getStyles(isDarkMode);

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

  const formatAmount = (amount: number) => {
    return `${amount.toLocaleString('cs-CZ')} ${currency.symbol}`;
  };

  const CategoryBar = ({ category, amount, percentage, color }: any) => (
    <View style={styles.categoryBar}>
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryName}>{category}</Text>
        <Text style={styles.categoryAmount}>{formatAmount(amount)}</Text>
      </View>
      <View style={styles.progressBarContainer}>
        <View 
          style={[
            styles.progressBar, 
            { width: `${percentage}%`, backgroundColor: color }
          ]} 
        />
      </View>
      <Text style={styles.categoryPercentage}>{percentage}%</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Month Navigation */}
        <View style={styles.monthNavigation}>
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={() => navigateMonth('prev')}
          >
            <ChevronLeft size={24} color={isDarkMode ? '#FFFFFF' : '#000000'} />
          </TouchableOpacity>
          
          <Text style={styles.monthTitle}>{formatMonth(selectedMonth)}</Text>
          
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={() => navigateMonth('next')}
          >
            <ChevronRight size={24} color={isDarkMode ? '#FFFFFF' : '#000000'} />
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, styles.incomeCard]}>
            <TrendingUp size={24} color="#10B981" />
            <Text style={styles.summaryLabel}>Příjmy</Text>
            <Text style={[styles.summaryAmount, { color: '#10B981' }]}>
              {formatAmount(report.totalIncome)}
            </Text>
          </View>
          
          <View style={[styles.summaryCard, styles.expenseCard]}>
            <TrendingDown size={24} color="#EF4444" />
            <Text style={styles.summaryLabel}>Výdaje</Text>
            <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>
              {formatAmount(report.totalExpenses)}
            </Text>
          </View>
          
          <View style={[styles.summaryCard, styles.balanceCard]}>
            <PiggyBank size={24} color={report.balance >= 0 ? '#10B981' : '#EF4444'} />
            <Text style={styles.summaryLabel}>Bilance</Text>
            <Text style={[
              styles.summaryAmount, 
              { color: report.balance >= 0 ? '#10B981' : '#EF4444' }
            ]}>
              {formatAmount(report.balance)}
            </Text>
          </View>
        </View>

        {/* Savings Rate */}
        <View style={styles.savingsRateContainer}>
          <Text style={styles.sectionTitle}>Míra úspor</Text>
          <View style={styles.savingsRateCard}>
            <Text style={styles.savingsRatePercentage}>{report.savingsRate}%</Text>
            <Text style={styles.savingsRateLabel}>
              {report.savingsRate > 20 ? 'Výborně!' : 
               report.savingsRate > 10 ? 'Dobře' : 'Lze zlepšit'}
            </Text>
          </View>
        </View>

        {/* Category Breakdown */}
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

        {/* Insights */}
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

        {/* Statistics */}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDarkMode ? '#000000' : '#F8F9FA',
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: isDarkMode ? '#1A1A1A' : '#FFFFFF',
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
  statsSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
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