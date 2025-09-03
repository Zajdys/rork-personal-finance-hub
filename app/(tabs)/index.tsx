import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Target,
  BookOpen,
  Award,
  DollarSign,
  CreditCard,
  PiggyBank,
  Lightbulb,
  MessageCircle,
  Calendar,
} from 'lucide-react-native';
import { useFinanceStore, CategoryExpense } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { totalIncome, totalExpenses, balance, recentTransactions, categoryExpenses } = useFinanceStore();
  const { level, points, dailyTip } = useBuddyStore();
  const { isDarkMode, getCurrentCurrency, notifications } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();
  const [showAllCategories, setShowAllCategories] = useState<boolean>(false);
  
  const currentCurrency = getCurrentCurrency();

  const QuickActionCard = ({ icon: Icon, title, color, onPress }: any) => (
    <TouchableOpacity style={styles.quickActionCard} onPress={onPress}>
      <LinearGradient
        colors={color}
        style={styles.quickActionGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Icon color="white" size={24} />
        <Text style={styles.quickActionText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  const FinanceCard = ({ title, amount, icon: Icon, trend, color }: any) => (
    <View style={[styles.financeCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <View style={styles.financeCardHeader}>
        <Icon color={color} size={20} />
        <Text style={[styles.financeCardTitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{title}</Text>
      </View>
      <Text style={[styles.financeCardAmount, { color }]}>
        {amount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
      </Text>
      {trend && (
        <View style={styles.trendContainer}>
          {trend > 0 ? (
            <TrendingUp color="#10B981" size={16} />
          ) : (
            <TrendingDown color="#EF4444" size={16} />
          )}
          <Text style={[styles.trendText, { color: trend > 0 ? '#10B981' : '#EF4444' }]}>
            {Math.abs(trend)}%
          </Text>
        </View>
      )}
    </View>
  );

  const CategoryExpenseCard = ({ category }: { category: CategoryExpense }) => (
    <View style={[styles.categoryCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <View style={styles.categoryHeader}>
        <View style={[styles.categoryIconContainer, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
          <Text style={styles.categoryIcon}>{category.icon}</Text>
        </View>
        <View style={styles.categoryInfo}>
          <Text style={[styles.categoryName, { color: isDarkMode ? 'white' : '#1F2937' }]}>{category.category}</Text>
          <Text style={styles.categoryAmount}>
            {category.amount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
          </Text>
        </View>
        <View style={styles.categoryPercentage}>
          <Text style={[styles.percentageText, { color: category.color }]}>
            {category.percentage}%
          </Text>
        </View>
      </View>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarBackground, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
          <View 
            style={[
              styles.progressBar, 
              { 
                width: `${category.percentage}%`, 
                backgroundColor: category.color 
              }
            ]} 
          />
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]} showsVerticalScrollIndicator={false}>
      {/* Header with MoneyBuddy */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>{t('hello')}! 👋</Text>
            <Text style={styles.headerTitle}>{t('moneyBuddy')}</Text>
          </View>
          <View style={styles.levelContainer}>
            <Award color="white" size={20} />
            <Text style={styles.levelText}>Level {level}</Text>
            <Text style={styles.pointsText}>{points} {t('points')}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Daily Tip - pouze když jsou povolené */}
      {notifications.dailyTips && (
        <View style={styles.tipContainer}>
          <LinearGradient
            colors={['#ffecd2', '#fcb69f']}
            style={styles.tipGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Lightbulb color="#F59E0B" size={24} />
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>{t('dailyTip')}</Text>
              <Text style={styles.tipText}>{dailyTip}</Text>
            </View>
            <TouchableOpacity 
              style={styles.chatButton}
              onPress={() => router.push('/chat')}
            >
              <MessageCircle color="#F59E0B" size={20} />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}

      {/* Balance Overview */}
      <View style={styles.balanceContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('financialOverview')}</Text>
        <View style={styles.balanceCard}>
          <LinearGradient
            colors={balance >= 0 ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
            style={styles.balanceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.balanceLabel}>{t('totalBalance')}</Text>
            <Text style={styles.balanceAmount}>
              {balance.toLocaleString('cs-CZ')} Kč
            </Text>
          </LinearGradient>
        </View>
      </View>

      {/* Finance Cards */}
      <View style={styles.financeGrid}>
        <TouchableOpacity onPress={() => router.push('/income-detail')}>
          <FinanceCard
            title={t('income')}
            amount={totalIncome}
            icon={TrendingUp}
            trend={12}
            color="#10B981"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/expense-detail')}>
          <FinanceCard
            title={t('expense')}
            amount={totalExpenses}
            icon={TrendingDown}
            trend={-8}
            color="#EF4444"
          />
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActionsContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('quickActions')}</Text>
        <View style={styles.quickActionsGrid}>
          <QuickActionCard
            icon={PlusCircle}
            title={t('addTransaction')}
            color={['#10B981', '#059669']}
            onPress={() => router.push('/add')}
          />
          <QuickActionCard
            icon={PiggyBank}
            title={t('investments')}
            color={['#8B5CF6', '#7C3AED']}
            onPress={() => router.push('/investments')}
          />
          <QuickActionCard
            icon={MessageCircle}
            title={t('moneyBuddy')}
            color={['#667eea', '#764ba2']}
            onPress={() => router.push('/chat')}
          />
          <QuickActionCard
            icon={Calendar}
            title={t('monthlyReport')}
            color={['#F59E0B', '#D97706']}
            onPress={() => router.push('/monthly-report')}
          />
        </View>
      </View>

      {/* Learning Section */}
      <View style={styles.learningContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('financialEducation')}</Text>
        <TouchableOpacity style={styles.learningCard}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.learningGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <BookOpen color="white" size={24} />
            <View style={styles.learningContent}>
              <Text style={styles.learningTitle}>{t('whatIsInflation')}</Text>
              <Text style={styles.learningSubtitle}>2 min • +10 {t('points')}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Expense Categories Overview */}
      {categoryExpenses.length > 0 && (
        <View style={styles.categoriesContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('expenseBreakdown')}</Text>
            {categoryExpenses.length > 3 && (
              <TouchableOpacity 
                onPress={() => setShowAllCategories(!showAllCategories)}
                style={styles.showMoreButton}
              >
                <Text style={styles.showMoreText}>
                  {showAllCategories ? t('less') : t('more')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {(showAllCategories ? categoryExpenses : categoryExpenses.slice(0, 3)).map((category, index) => (
            <CategoryExpenseCard key={index} category={category} />
          ))}
        </View>
      )}

      {/* Recent Transactions */}
      <View style={styles.transactionsContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('recentTransactions')}</Text>
        {recentTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <DollarSign color="#9CA3AF" size={48} />
            <Text style={styles.emptyStateText}>{t('noTransactionsYet')}</Text>
            <Text style={styles.emptyStateSubtext}>
              {t('startAddingTransactions')}
            </Text>
          </View>
        ) : (
          recentTransactions.map((transaction, index) => (
            <View key={index} style={[styles.transactionItem, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <View style={styles.transactionInfo}>
                <Text style={[styles.transactionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{transaction.title}</Text>
                <Text style={[styles.transactionCategory, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{transaction.category}</Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  { color: transaction.type === 'income' ? '#10B981' : '#EF4444' }
                ]}
              >
                {transaction.type === 'income' ? '+' : '-'}
                {transaction.amount.toLocaleString('cs-CZ')} Kč
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  greeting: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
  },
  headerTitle: {
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
    marginTop: -12,
    marginBottom: 24,
  },
  tipGradient: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipContent: {
    marginLeft: 12,
    flex: 1,
  },
  chatButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
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
  balanceContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
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
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  financeCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  financeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  financeCardTitle: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  financeCardAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendText: {
    fontSize: 12,
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
  quickActionCard: {
    width: (width - 56) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  quickActionGradient: {
    padding: 16,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginTop: 8,
    textAlign: 'center',
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
});