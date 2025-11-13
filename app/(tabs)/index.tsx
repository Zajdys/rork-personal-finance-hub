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
  DollarSign,
  PiggyBank,
  MessageCircle,
  Calendar,
  X,
  Lightbulb,
} from 'lucide-react-native';
import { useFinanceStore, CategoryExpense, SubscriptionItem } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';
import { useBankStore } from '@/store/bank-store';
import { LifeEventModeIndicator } from '@/components/LifeEventModeIndicator';
import { useHousehold } from '@/store/household-store';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const finance = useFinanceStore();
  const { totalIncome, totalExpenses, balance, recentTransactions, categoryExpenses, getCurrentMonthReport, financialGoals, loans } = finance;
  const { isDarkMode, getCurrentCurrency, notifications } = useSettingsStore();
  const { t, language, updateCounter } = useLanguageStore();
  const { loadData } = useBankStore();
  const { dashboard: householdDashboard, isInHousehold } = useHousehold();
  
  useEffect(() => {
    loadData();
  }, [language, updateCounter, loadData]);
  
  const currentMonthReport = getCurrentMonthReport();
  const router = useRouter();
  const [showAllCategories, setShowAllCategories] = useState<boolean>(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  
  const currentCurrency = getCurrentCurrency();
  
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
  
  const allBudgetWarnings = getBudgetWarnings();
  const budgetWarnings = allBudgetWarnings.filter((warning, index) => {
    const warningKey = `${warning.type}-${warning.title}-${index}`;
    return !dismissedWarnings.has(warningKey);
  });

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

  const FinanceCard = ({ title, amount, icon, trend, color, emoji }: any) => (
    <View style={[styles.financeCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <View style={styles.financeCardHeader}>
        <Text style={styles.financeCardEmoji}>{emoji}</Text>
        <Text style={[styles.financeCardTitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{title}</Text>
      </View>
      <Text style={[styles.financeCardAmount, { color }]}>
        {typeof amount === 'number' ? amount.toLocaleString('cs-CZ') : amount}{title === 'Závazky' ? '' : ` ${currentCurrency.symbol}`}
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

  const getHouseholdInfo = (householdDashboard: any, currentCurrency: any) => {
    const myBalance = householdDashboard.balances.find((b: any) => b.userName === 'Já');
    const balance = myBalance?.balance || 0;
    
    if (Math.abs(balance) <= 100) {
      return {
        statusText: 'Vyrovnáno',
        statusColor: '#10B981'
      };
    } else if (balance > 100) {
      return {
        statusText: `Přeplatek ${Math.abs(balance).toFixed(0)} ${currentCurrency.symbol}`,
        statusColor: '#F59E0B'
      };
    } else {
      return {
        statusText: `Dluh ${Math.abs(balance).toFixed(0)} ${currentCurrency.symbol}`,
        statusColor: '#EF4444'
      };
    }
  };

  const CategoryExpenseCard = ({ category }: { category: CategoryExpense }) => (
    <TouchableOpacity 
      style={[styles.categoryCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
      onPress={() => router.push({
        pathname: '/category-detail',
        params: { category: category.category, type: 'expense' }
      })}
    >
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
    </TouchableOpacity>
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
        </View>
      </LinearGradient>

      <LifeEventModeIndicator />

      <View style={styles.tipContainer}>
        <LinearGradient
          colors={['#FEEBC8', '#FED7AA']}
          style={styles.tipGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Lightbulb color="#92400E" size={24} fill="#F59E0B" />
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Tip dne</Text>
            <Text style={styles.tipText}>Životní pojištění s investicí? Raději odděl pojištění a investice 🛡️</Text>
          </View>
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => router.push('/chat')}
          >
            <MessageCircle color="#F59E0B" size={20} />
          </TouchableOpacity>
        </LinearGradient>
      </View>
      
      {notifications.budgetWarnings && budgetWarnings.length > 0 && (
        <View style={styles.warningsContainer}>
          {budgetWarnings.map((warning, index) => {
            const warningKey = `${warning.type}-${warning.title}-${allBudgetWarnings.indexOf(warning)}`;
            return (
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
                  <TouchableOpacity 
                    style={styles.dismissButton}
                    onPress={() => {
                      setDismissedWarnings(prev => new Set(prev).add(warningKey));
                    }}
                  >
                    <X 
                      size={20} 
                      color={
                        warning.type === 'danger' ? '#DC2626' :
                        warning.type === 'warning' ? '#D97706' : '#2563EB'
                      }
                    />
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.balanceContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('financialOverview')}</Text>
        <TouchableOpacity 
          style={styles.balanceCard}
          onPress={() => router.push('/bank-accounts')}
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
              {balance.toLocaleString('cs-CZ')} Kč
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={styles.financeGrid}>
        <TouchableOpacity onPress={() => router.push('/income-detail')} style={styles.financeCardWrapper}>
          <FinanceCard
            title={t('income')}
            amount={totalIncome}
            emoji="💰"
            trend={12}
            color="#10B981"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/expense-detail')} style={styles.financeCardWrapper}>
          <FinanceCard
            title={t('expense')}
            amount={totalExpenses}
            emoji="💸"
            trend={-8}
            color="#EF4444"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/loans')} style={styles.financeCardWrapper}>
          <FinanceCard
            title="Závazky"
            amount={loans.length}
            emoji="💳"
            trend={null}
            color="#8B5CF6"
          />
        </TouchableOpacity>
        {isInHousehold && householdDashboard && (
          <TouchableOpacity onPress={() => router.push('/household')} style={styles.financeCardWrapper}>
            <FinanceCard
              title="Domácnost"
              amount={getHouseholdInfo(householdDashboard, currentCurrency).statusText}
              emoji="🏠"
              trend={null}
              color={getHouseholdInfo(householdDashboard, currentCurrency).statusColor}
            />
          </TouchableOpacity>
        )}
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
                <TouchableOpacity 
                  key={s.id} 
                  style={styles.subRow} 
                  testID={`sub-${s.id}`}
                  onPress={() => router.push({
                    pathname: '/subscription',
                    params: { id: s.id }
                  })}
                  activeOpacity={0.7}
                >
                  <View style={styles.subMain}>
                    <Text style={styles.subName}>{s.name}</Text>
                    <Text style={styles.subMeta}>{s.category} • den {s.dayOfMonth}</Text>
                  </View>
                  <View style={styles.subRight}>
                    <Text style={[styles.subAmount, { color: s.active ? '#10B981' : '#9CA3AF' }]}>{s.amount.toLocaleString('cs-CZ')} {currentCurrency.symbol}</Text>
                    <TouchableOpacity 
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleActive(s.id);
                      }} 
                      testID={`toggle-sub-${s.id}`} 
                      style={styles.subToggle}
                    >
                      <Text style={{ color: s.active ? '#10B981' : '#9CA3AF', fontWeight: '700' }}>{s.active ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
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

      {/* Financial Goals Section */}
      {financialGoals.length > 0 && (
        <View style={styles.goalsOverviewContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>Finanční cíle</Text>
            <TouchableOpacity 
              onPress={() => router.push('/financial-goals')}
              style={styles.showMoreButton}
            >
              <Text style={styles.showMoreText}>
                Vše
              </Text>
            </TouchableOpacity>
          </View>
          
          {financialGoals.slice(0, 2).map((goal) => {
            const actualSpent = goal.type === 'spending_limit' 
              ? finance.getExpensesByCategory(goal.category || 'Ostatní').reduce((sum, t) => sum + t.amount, 0)
              : goal.currentAmount;
            
            const displayAmount = goal.type === 'spending_limit' ? actualSpent : goal.currentAmount;
            const progress = (displayAmount / goal.targetAmount) * 100;
            const isOverLimit = goal.type === 'spending_limit' && displayAmount > goal.targetAmount;
            const color = isOverLimit ? '#EF4444' : '#10B981';
            
            const categoryEmojis: { [key: string]: string } = {
              'Bydlení': '🏠',
              'Jídlo a nápoje': '🍽️',
              'Doprava': '🚗',
              'Benzín': '⛽',
              'Nákupy': '🛍️',
              'Spoření': '💰',
              'Investice': '📈',
              'Ostatní': '🎯',
            };
            const emoji = categoryEmojis[goal.category || 'Ostatní'] || '🎯';
            
            return (
              <TouchableOpacity 
                key={goal.id} 
                style={[styles.goalCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
                onPress={() => router.push('/financial-goals')}
              >
                <View style={styles.goalCardHeader}>
                  <View style={styles.goalCardInfo}>
                    <View style={styles.goalCardTitleRow}>
                      <Text style={styles.goalCardEmoji}>{emoji}</Text>
                      <Text style={[styles.goalCardTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{goal.title}</Text>
                    </View>
                    <Text style={[styles.goalCardCategory, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>{goal.category}</Text>
                  </View>
                  <View style={styles.goalCardAmounts}>
                    <Text style={[styles.goalCurrentAmount, { color }]}>
                      {displayAmount.toLocaleString('cs-CZ')} Kč
                    </Text>
                    <Text style={[styles.goalTargetAmount, { color: isDarkMode ? '#D1D5DB' : '#9CA3AF' }]}>
                      {goal.type === 'spending_limit' ? 'z' : 'z'} {goal.targetAmount.toLocaleString('cs-CZ')} Kč
                    </Text>
                  </View>
                </View>
                
                <View style={styles.goalProgressBarContainer}>
                  <View style={[styles.goalProgressBarBackground, { backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6' }]}>
                    <View 
                      style={[
                        styles.goalProgressBar, 
                        { 
                          width: `${Math.min(progress, 100)}%`, 
                          backgroundColor: color
                        }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.goalProgressText, { color }]}>  
                    {Math.round(progress)}%
                  </Text>
                </View>
                
                {isOverLimit && (
                  <Text style={styles.goalOverLimitText}>
                    ⚠️ Překročil jsi limit
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
          
          {financialGoals.length === 0 && (
            <TouchableOpacity 
              style={[styles.emptyGoalsCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
              onPress={() => router.push('/financial-goals')}
            >
              <Target color="#9CA3AF" size={32} />
              <Text style={[styles.emptyGoalsText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Nastav si finanční cíle
              </Text>
              <Text style={[styles.emptyGoalsSubtext, { color: isDarkMode ? '#9CA3AF' : '#9CA3AF' }]}>
                Sleduj pokrok a dosáhni svých cílů
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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
    flexWrap: 'wrap',
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 8,
  },
  financeCardWrapper: {
    width: (width - 56) / 2,
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
    marginRight: 8,
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
  dismissButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignSelf: 'flex-start',
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

});