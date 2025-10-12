import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useFinanceStore, CategoryExpense, SubscriptionItem, LoanItem, LoanType } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const finance = useFinanceStore();
  const { totalIncome, totalExpenses, balance, recentTransactions, categoryExpenses, getCurrentMonthReport, financialGoals, loans, getLoanProgress } = finance;
  const { level, points, dailyTip, refreshDailyTip } = useBuddyStore();
  const { isDarkMode, getCurrentCurrency, notifications } = useSettingsStore();
  const { t, language, updateCounter } = useLanguageStore();
  
  useEffect(() => {
    refreshDailyTip();
  }, [language, updateCounter, refreshDailyTip]);
  
  const currentMonthReport = getCurrentMonthReport();
  
  const getBudgetWarnings = () => {
    const warnings: Array<{ type: 'danger'|'warning'|'info'; title: string; message: string; icon: string }> = [];
    if (currentMonthReport.balance < 0) {
      warnings.push({
        type: 'danger',
        title: 'Záporný zůstatek',
        message: `Tento měsíc jste utratili ${Math.abs(currentMonthReport.balance).toLocaleString('cs-CZ')} Kč více než vydělali!`,
        icon: '🚨'
      });
    }
    if (currentMonthReport.savingsRate < 10 && currentMonthReport.totalIncome > 0) {
      warnings.push({
        type: 'warning',
        title: 'Nízká míra úspor',
        message: `Šetříte pouze ${currentMonthReport.savingsRate}% příjmů. Doporučujeme alespoň 20%.`,
        icon: '⚠️'
      });
    }
    const topCategory = currentMonthReport.categoryBreakdown[0];
    if (topCategory && topCategory.percentage > 40) {
      warnings.push({
        type: 'info',
        title: 'Vysoké výdaje v kategorii',
        message: `${topCategory.category} tvoří ${topCategory.percentage}% vašich výdajů.`,
        icon: '💡'
      });
    }
    const overspentGoals = financialGoals.filter(goal => 
      goal.type === 'spending_limit' && goal.currentAmount > goal.targetAmount
    );
    overspentGoals.forEach(goal => {
      warnings.push({
        type: 'danger',
        title: 'Překročen limit',
        message: `Překročili jste limit pro "${goal.title}" o ${(goal.currentAmount - goal.targetAmount).toLocaleString('cs-CZ')} Kč.`,
        icon: '🎯'
      });
    });
    return warnings;
  };
  
  const budgetWarnings = getBudgetWarnings();
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
        <View style={styles.financeCardIconContainer}>
          <Icon color={color} size={20} strokeWidth={2} />
        </View>
        <Text style={[styles.financeCardTitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{title}</Text>
      </View>
      <Text style={[styles.financeCardAmount, { color }]}>
        {amount.toLocaleString('cs-CZ')}{title === 'Závazky' ? '' : ` ${currentCurrency.symbol}`}
      </Text>
      {trend !== null && (
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

  const detectedSubscriptions = useMemo<SubscriptionItem[]>(() => finance.getDetectedSubscriptions(), [finance, recentTransactions]);
  const totalActiveSubs = useMemo<number>(() => finance.subscriptions.filter(s => s.active).reduce((s, n) => s + n.amount, 0), [finance.subscriptions]);

  const confirmDetected = useCallback((sub: SubscriptionItem) => {
    finance.addSubscription({ ...sub, id: `${sub.id}-${Date.now()}` });
  }, [finance]);

  const toggleActive = useCallback((id: string) => {
    const s = finance.subscriptions.find(x => x.id === id);
    if (!s) return;
    finance.updateSubscription(id, { active: !s.active });
  }, [finance]);

  const getLoanIcon = (type: LoanType): string => {
    switch (type) {
      case 'mortgage':
        return '🏠';
      case 'car':
        return '🚗';
      case 'personal':
        return '💰';
      case 'student':
        return '🎓';
      case 'other':
        return '💳';
      default:
        return '💳';
    }
  };

  const getLoanTypeLabel = (type: LoanType): string => {
    switch (type) {
      case 'mortgage':
        return 'Hypotéka';
      case 'car':
        return 'Úvěr na auto';
      case 'personal':
        return 'Osobní úvěr';
      case 'student':
        return 'Studentský úvěr';
      case 'other':
        return 'Jiný úvěr';
      default:
        return 'Úvěr';
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]} showsVerticalScrollIndicator={false}>
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
          <TouchableOpacity 
            style={styles.levelContainer}
            onPress={() => router.push('/leaderboard')}
          >
            <Award color="white" size={20} />
            <Text style={styles.levelText}>Level {level}</Text>
            <Text style={styles.pointsText}>{points} {t('points')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

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
      
      {notifications.budgetWarnings && budgetWarnings.length > 0 && (
        <View style={styles.warningsContainer}>
          {budgetWarnings.map((warning, index) => (
            <View key={index} style={styles.warningContainer}>
              <LinearGradient
                colors={
                  warning.type === 'danger' ? ['#FEE2E2', '#FECACA'] :
                  warning.type === 'warning' ? ['#FEF3C7', '#FDE68A'] :
                  ['#DBEAFE', '#BFDBFE']
                }
                style={styles.warningGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.warningIcon}>{warning.icon}</Text>
                <View style={styles.warningContent}>
                  <Text style={[
                    styles.warningTitle,
                    {
                      color: warning.type === 'danger' ? '#DC2626' :
                             warning.type === 'warning' ? '#D97706' : '#2563EB'
                    }
                  ]}>{warning.title}</Text>
                  <Text style={[
                    styles.warningText,
                    {
                      color: warning.type === 'danger' ? '#991B1B' :
                             warning.type === 'warning' ? '#92400E' : '#1E40AF'
                    }
                  ]}>{warning.message}</Text>
                </View>
              </LinearGradient>
            </View>
          ))}
        </View>
      )}

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

      <View style={styles.financeGrid}>
        <TouchableOpacity onPress={() => router.push('/income-detail')} style={styles.financeCardWrapper}>
          <FinanceCard
            title={t('income')}
            amount={totalIncome}
            icon={TrendingUp}
            trend={12}
            color="#10B981"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/expense-detail')} style={styles.financeCardWrapper}>
          <FinanceCard
            title={t('expense')}
            amount={totalExpenses}
            icon={TrendingDown}
            trend={-8}
            color="#EF4444"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/loans')} style={styles.financeCardWrapper}>
          <FinanceCard
            title="Závazky"
            amount={loans.length}
            icon={CreditCard}
            trend={null}
            color="#8B5CF6"
          />
        </TouchableOpacity>
      </View>





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

      {/* Subscriptions from bank statements */}
      <View style={styles.subsContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]} testID="subs-title">Měsíční předplatné</Text>
        <View style={[styles.subsCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
          <View style={styles.subsHeader}>
            <Text style={styles.subsHeaderText}>Aktivní: {totalActiveSubs.toLocaleString('cs-CZ')} {currentCurrency.symbol}/měs.</Text>
          </View>
          {finance.subscriptions.length === 0 && detectedSubscriptions.length === 0 ? (
            <Text style={styles.subsEmpty} testID="subs-empty">Zatím jsme nenašli žádná předplatné.</Text>
          ) : (
            <>
              {finance.subscriptions.map((s) => (
                <View key={s.id} style={styles.subRow} testID={`sub-${s.id}`}>
                  <View style={styles.subMain}>
                    <Text style={styles.subName}>{s.name}</Text>
                    <Text style={styles.subMeta}>{s.category} • den {s.dayOfMonth}</Text>
                  </View>
                  <View style={styles.subRight}>
                    <Text style={[styles.subAmount, { color: s.active ? '#10B981' : '#9CA3AF' }]}>{s.amount.toLocaleString('cs-CZ')} {currentCurrency.symbol}</Text>
                    <TouchableOpacity onPress={() => toggleActive(s.id)} testID={`toggle-sub-${s.id}`} style={styles.subToggle}>
                      <Text style={{ color: s.active ? '#10B981' : '#9CA3AF', fontWeight: '700' }}>{s.active ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {detectedSubscriptions.length > 0 && (
                <View style={styles.detectedWrap}>
                  <Text style={styles.detectedTitle}>Nalezeno z výpisů</Text>
                  {detectedSubscriptions.slice(0, 5).map((s) => (
                    <View key={s.id} style={styles.detectedRow} testID={`detected-${s.id}`}>
                      <View style={styles.subMain}>
                        <Text style={styles.subName}>{s.name}</Text>
                        <Text style={styles.subMeta}>{s.category} • den {s.dayOfMonth}</Text>
                      </View>
                      <View style={styles.subRight}>
                        <Text style={styles.subAmount}>{s.amount.toLocaleString('cs-CZ')} {currentCurrency.symbol}</Text>
                        <TouchableOpacity onPress={() => confirmDetected(s)} style={styles.addBtn} accessibilityLabel={`add-${s.id}`}>
                          <Text style={styles.addBtnText}>Přidat</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </View>

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
    gap: 8,
  },
  financeCardWrapper: {
    flex: 1,
  },
  financeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 100,
  },
  financeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  financeCardIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  financeCardTitle: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 6,
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
  subsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  subsCard: {
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  subsHeader: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginBottom: 8,
  },
  subsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  subsEmpty: {
    color: '#6B7280',
    padding: 12,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subMain: {
    flex: 1,
  },
  subName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  subMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  subRight: {
    alignItems: 'flex-end',
  },
  subAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  subToggle: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  detectedWrap: {
    marginTop: 8,
  },
  detectedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
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
  warningsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  warningContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  warningGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
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
});